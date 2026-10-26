// Verification rig: click-outside minimizes the frontmost detail window.
// Pattern follows tools/verify_astro_pilot.mjs (playwright-core + cached
// chromium + recordVideo), local static server, six pass/fail checks.
// Run: node tools/verify_click_outside_minimize.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/Users/wesleymatos/.hermes/hermes-agent/node_modules/playwright-core/index.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WWW = process.argv[2] ? process.argv[2] : join(ROOT, 'www');
const OUT = process.env.VERIFY_OUT || '/tmp/click-outside-verify';
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json' };

const server = createServer(async (req, res) => {
  try {
    const path = req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0];
    const data = await readFile(join(WWW, decodeURIComponent(path)));
    res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('nope'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
console.log(`serving ${WWW} at ${BASE}`);

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

// Playwright 1.62.1 demands chromium build 1234, which isn't cached; pin to a
// build that IS on disk (see browser-behavior-verification skill pitfalls).
const EXE = process.env.CHROMIUM_EXE
  || `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const browser = await chromium.launch({ executablePath: EXE });
const errors = [];
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: OUT, size: { width: 1440, height: 900 } },
});
const page = await ctx.newPage();
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

const outsidePoint = async () => page.evaluate(() => {
  // a point guaranteed to be page background: center-left, verified empty
  for (const [x, y] of [[30, 450], [60, 480], [1400, 200], [30, 600]]) {
    const el = document.elementFromPoint(x, y);
    if (el && (el === document.body || el === document.documentElement || el.classList.contains('doodle-field'))) return { x, y };
  }
  return null;
});

const clickOutside = async () => {
  const p = await outsidePoint();
  if (!p) throw new Error('no safe outside point found');
  await page.mouse.click(p.x, p.y);
};

const state = () => page.evaluate(() => ({
  windows: [...document.querySelectorAll('.detail-window')].map(w => ({
    title: w.querySelector('.detail-title').textContent,
    z: parseInt(w.style.zIndex || 0, 10),
    minimized: w.classList.contains('minimized'),
    visible: getComputedStyle(w).opacity === '1' && getComputedStyle(w).pointerEvents !== 'none',
  })),
  icons: [...document.querySelectorAll('.detail-genie-icon')].map(i => i.dataset.projectId),
}));

// ---- setup: open window A (LUSH) ----
await page.goto(BASE + '/', { waitUntil: 'load' });
await page.waitForSelector('.scatter-card');
const cards = page.locator('.scatter-card');
await cards.nth(0).click();
await page.waitForSelector('.detail-window');
await page.waitForTimeout(600); // entrance animation settles

// ---- check 1: outside click runs the genie, dock icon appears, window hides ----
{
  await page.screenshot({ path: `${OUT}/after-1-open.png` });
  await clickOutside();
  // catch the genie mid-flight (400ms WAAPI)
  const mid = await page.evaluate(() => {
    const w = document.querySelector('.detail-window');
    const anims = w.getAnimations().filter(a => a.playState === 'running');
    return { anims: anims.length, transform: getComputedStyle(w).transform };
  });
  await page.waitForTimeout(700);
  const s = await state();
  const wA = s.windows.find(w => w.title.includes('LUSH'));
  const ok = mid.anims >= 1 && wA.minimized && !wA.visible && s.icons.length === 1;
  await page.screenshot({ path: `${OUT}/after-1-minimized.png` });
  check('1. outside click → genie animation + dock icon + window hidden', ok,
    `running anims mid-click: ${mid.anims}, minimized: ${wA.minimized}, icons: ${s.icons.length}`);
}

// ---- check 2: dock icon click restores ----
{
  await page.evaluate(() => document.querySelector('.detail-genie-icon').click());
  await page.waitForTimeout(700);
  const s = await state();
  const wA = s.windows.find(w => w.title.includes('LUSH'));
  const ok = !wA.minimized && wA.visible && s.icons.length === 0;
  await page.screenshot({ path: `${OUT}/after-2-restored.png` });
  check('2. dock icon click → window restores', ok, `minimized: ${wA.minimized}, icons: ${s.icons.length}`);
}

// ---- check 3: scatter card click opens B, A untouched (no genie) ----
{
  await cards.nth(1).click(); // Birds Spa
  await page.waitForTimeout(600);
  let s = await state();
  const birds = s.windows.find(w => w.title.includes('Birds'));
  const lushBefore = s.windows.find(w => w.title.includes('LUSH'));
  const okOpen = !!birds && !birds.minimized && !lushBefore.minimized && s.icons.length === 0;
  await page.screenshot({ path: `${OUT}/after-3-two-open.png` });
  check('3. card click while window open → new window, old one untouched', okOpen,
    `windows: ${s.windows.length}, icons: ${s.icons.length}`);
}

// ---- check 4: two windows open → outside click minimizes frontmost only ----
{
  await clickOutside();
  await page.waitForTimeout(700);
  let s = await state();
  const front = s.windows.reduce((a, b) => (b.z > a.z ? b : a));
  const back = s.windows.reduce((a, b) => (b.z < a.z ? b : a));
  const okFirst = front.minimized && !back.minimized && s.icons.length === 1;
  check('4a. first outside click minimizes frontmost only', okFirst,
    `front(${front.title}) minimized=${front.minimized}, back(${back.title}) minimized=${back.minimized}, icons=${s.icons.length}`);
  await clickOutside();
  await page.waitForTimeout(700);
  s = await state();
  const okSecond = s.windows.every(w => w.minimized) && s.icons.length === 2;
  await page.screenshot({ path: `${OUT}/after-4-both-minimized.png` });
  check('4b. second outside click minimizes the next frontmost', okSecond,
    `all minimized: ${s.windows.every(w => w.minimized)}, icons: ${s.icons.length}`);
  // clean up: restore both for check 5
  for (const id of (await state()).icons) {
    await page.evaluate(id => document.querySelector(`.detail-genie-icon[data-project-id="${CSS.escape(id)}"]`).click(), id);
    await page.waitForTimeout(650);
  }
}

// ---- check 5: excluded clicks never trigger genie ----
{
  const before = await state();
  // filter tab (button, inline onclick) — a REAL click
  await page.locator('.filter-tab').nth(1).click();
  // keycap, postit, social sticker, contact sticker — synthetic bubbling
  // pointerdowns (real clicks would navigate away on the anchor stickers)
  await page.evaluate(() => {
    const fire = (sel) => document.querySelector(sel).dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    fire('.keycap');
    fire('.postit');
    fire('.social-sticker');
    fire('.contact-sticker');
    fire('.name-wordmark');
  });
  await page.waitForTimeout(500);
  const after = await state();
  const ok = after.icons.length === before.icons.length
    && after.windows.every(w => !w.minimized)
    && after.windows.length === before.windows.length;
  check('5. dock icon / card / sticker / tab / keycap / postit / wordmark clicks do not genie', ok,
    `windows: ${after.windows.length}, icons: ${after.icons.length} (before: ${before.windows.length}/${before.icons.length})`);
}

// ---- check 7: re-clicking a card whose window is minimized restores it ----
{
  // two windows are open from check 5; put LUSH on top, then minimize it
  // via outside click, then click its card again. In-page clicks: an open
  // window can physically cover the cards, which would intercept real
  // coordinate clicks (the card listener is what matters here).
  const clickCard0 = () => page.evaluate(() => document.querySelectorAll('.scatter-card')[0].click());
  await clickCard0();
  await page.waitForTimeout(300);
  await clickOutside();
  await page.waitForTimeout(700);
  let s = await state();
  const lush = s.windows.find(w => w.title.includes('LUSH'));
  const birds = s.windows.find(w => w.title.includes('Birds'));
  const okMin = lush && lush.minimized && birds && !birds.minimized && s.icons.length === 1;
  await clickCard0();
  await page.waitForTimeout(700);
  s = await state();
  const lush2 = s.windows.find(w => w.title.includes('LUSH'));
  const topZ = Math.max(...s.windows.map(w => w.z));
  const ok = okMin && !!lush2 && !lush2.minimized && lush2.visible
    && lush2.z === topZ && s.icons.length === 0 && s.windows.length === 2;
  await page.screenshot({ path: `${OUT}/after-7-card-reclick-restore.png` });
  check('7. card re-click on a minimized project restores its window (frontmost, icon gone)', ok,
    `minimized before: ${okMin}, restored: ${lush2 && !lush2.minimized}, frontmost: ${lush2 && lush2.z === topZ}, icons: ${s.icons.length}, windows: ${s.windows.length}`);
}

// ---- check 8: the minimized dock icon shows a miniature of the image ----
{
  // LUSH is open + frontmost after check 7; minimize it via outside click
  await clickOutside();
  await page.waitForTimeout(700);
  const s = await state();
  const lush = s.windows.find(w => w.title.includes('LUSH'));
  const mini = await page.evaluate(() => {
    const icon = document.querySelector('.detail-genie-icon');
    const img = icon && icon.querySelector('.detail-genie-img');
    const cardImg = document.querySelectorAll('.scatter-card')[0].querySelector('.scatter-thumb-img');
    if (!img) return { there: false };
    return {
      there: true,
      srcMatchesCard: cardImg && img.getAttribute('src') === cardImg.getAttribute('src'),
      loaded: img.complete && img.naturalWidth > 0,
      cover: getComputedStyle(img).objectFit === 'cover',
      tileThere: !!icon.querySelector('.detail-genie-tile'),
    };
  });
  const ok = lush && lush.minimized && s.icons.length === 1
    && mini.there && mini.srcMatchesCard && mini.loaded && mini.cover && mini.tileThere;
  await page.screenshot({ path: `${OUT}/after-8-icon-miniature.png` });
  check('8. minimized dock icon shows a miniature of the project image', ok, JSON.stringify(mini));
  // leave the desktop clean: restore LUSH
  await page.evaluate(() => document.querySelector('.detail-genie-icon').click());
  await page.waitForTimeout(650);
}

// ---- check 6: reduced-motion → instant minimize to icon state ----
{
  const rctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const rpage = await rctx.newPage();
  rpage.on('pageerror', e => errors.push('rm pageerror: ' + e.message));
  await rpage.goto(BASE + '/', { waitUntil: 'load' });
  await rpage.waitForSelector('.scatter-card');
  await rpage.locator('.scatter-card').nth(0).click();
  await rpage.waitForSelector('.detail-window');
  await rpage.waitForTimeout(300);
  await rpage.mouse.click(30, 450);
  // INSTANT: assert synchronously, before any timer could have run
  const now = await rpage.evaluate(() => {
    const w = document.querySelector('.detail-window');
    const icon = document.querySelector('.detail-genie-icon');
    return {
      minimized: w.classList.contains('minimized'),
      anims: w.getAnimations().length,
      opacity: getComputedStyle(w).opacity,
      iconThere: !!icon,
      // Chromium serializes style.animation='none' as the expanded shorthand
      // ("auto ease 0s 1 normal none running none") — check the longhand
      iconInstant: icon ? (icon.style.animationName === 'none' && icon.getAnimations().length === 0) : false,
    };
  });
  await rpage.screenshot({ path: `${OUT}/after-6-reduced-motion.png` });
  const ok = now.minimized && now.anims === 0 && now.iconThere && now.iconInstant && now.opacity === '0';
  check('6. reduced-motion: outside click minimizes instantly to icon state', ok, JSON.stringify(now));
  await rctx.close();
}

await ctx.close(); // flush video
await browser.close();
server.close();

console.log('\nconsole/page errors:', errors.length ? errors : 'none');
const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
console.log('video + screenshots in', OUT);
process.exit(failed || errors.length ? 1 : 0);
