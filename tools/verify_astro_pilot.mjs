#!/usr/bin/env node
// Astro pilot proof: drives CURRENT (www/ via :8009) and ASTRO (:4321/bela-portfolio/)
// side by side in headless Chromium at 1440x900 — screenshots for the PR pairs and a
// scripted interaction checklist with pass/fail per item.
// Usage: node tools/verify_astro_pilot.mjs <evidence-dir>
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const OUT = process.argv[2] || path.join(os.tmpdir(), 'astro-pilot-evidence');
fs.mkdirSync(OUT, { recursive: true });

const CHROME = process.env.CHROME_BIN ||
  `${os.homedir()}/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;

const TARGETS = [
  { key: 'old', name: 'current', url: 'http://localhost:8009/' },
  { key: 'new', name: 'astro', url: 'http://localhost:4321/bela-portfolio/' },
];

const results = {};
for (const t of TARGETS) {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    recordVideo: { dir: path.join(OUT, 'video-' + t.key), size: { width: 1440, height: 900 } },
  });
  const page = await ctx.newPage();
  const check = {};
  const R = (name, ok, detail = '') => {
    check[name] = { pass: !!ok, detail: String(detail).slice(0, 200) };
    console.log(`[${t.key}] ${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`);
  };

  await page.goto(t.url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800); // entrance animations settle

  // page weight (transferred bytes incl. document)
  const weight = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const res = performance.getEntriesByType('resource');
    return {
      document: nav ? nav.transferSize : 0,
      resources: res.reduce((s, r) => s + (r.transferSize || 0), 0),
      requests: 1 + res.length,
    };
  });

  // full-page shot. captureBeyondViewport keeps scrollY where it is, and the
  // scroll-driven `view()` reveal is position-honest: cards above the current
  // viewport are past their animation range (opacity 1), cards below it are
  // not yet entered (opacity 0). Capture from the BOTTOM so every section is
  // revealed in the stitched image — identical treatment on both sites.
  await page.evaluate(async () => {
    const h = document.documentElement.scrollHeight;
    for (let y = 0; y <= h; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); }
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, `${t.key}-1-fullpage.png`), fullPage: true });

  // open first card's detail window
  const card = page.locator('.scatter-card').first();
  await card.click();
  const win = page.locator('.detail-window').first();
  await win.waitFor({ state: 'visible', timeout: 3000 });
  await win.locator('.detail-cover img').evaluate(img => img.decode().catch(() => {}));
  await page.waitForTimeout(900); // entrance animation settles
  await page.screenshot({ path: path.join(OUT, `${t.key}-2-modal-open.png`) });

  // image-led modal checks
  const hasGallery = await win.evaluate(el => el.classList.contains('has-gallery'));
  const thumbHidden = await win.locator('.detail-thumb').evaluate(el => el.hidden);
  const galleryShown = await win.locator('.detail-gallery').evaluate(el => !el.hidden);
  const coverVisible = await win.locator('.detail-cover img').evaluate(img => img.complete && img.naturalWidth > 0);
  R('modal opens image-led (has-gallery, no initials tile, cover is lead)',
    hasGallery && thumbHidden && galleryShown && coverVisible,
    `has-gallery=${hasGallery} thumbHidden=${thumbHidden} galleryShown=${galleryShown} coverLoaded=${coverVisible}`);

  // thumbnail switch to image 2
  const coverBefore = await win.locator('.detail-cover img').getAttribute('src');
  await win.locator('.detail-thumbs button').nth(1).click();
  await page.waitForTimeout(600);
  await win.locator('.detail-cover img').evaluate(img => img.decode().catch(() => {}));
  const coverAfter = await win.locator('.detail-cover img').getAttribute('src');
  const selMoved = await win.locator('.detail-thumbs button').nth(1).evaluate(b => b.classList.contains('sel'));
  await page.screenshot({ path: path.join(OUT, `${t.key}-3-gallery-image2.png`) });
  R('thumbnail switch works (cover swaps to image 2, selection moves)',
    coverBefore !== coverAfter && /-2\.webp$/.test(coverAfter) && selMoved,
    `${coverBefore} -> ${coverAfter} sel=${selMoved}`);

  // drag by titlebar
  const before = await win.boundingBox();
  const tb = await win.locator('.detail-titlebar').boundingBox();
  await page.mouse.move(tb.x + tb.width / 2, tb.y + 20);
  await page.mouse.down();
  await page.mouse.move(tb.x + tb.width / 2 + 140, tb.y + 20 + 70, { steps: 8 });
  await page.mouse.up();
  const afterDrag = await win.boundingBox();
  R('window drags by titlebar',
    Math.abs(afterDrag.x - before.x) > 100 && Math.abs(afterDrag.y - before.y) > 40,
    `dx=${(afterDrag.x - before.x).toFixed(0)} dy=${(afterDrag.y - before.y).toFixed(0)}`);

  // genie-minimize + dock icon + restore
  await win.locator('.detail-dot.dot-min').click();
  await page.waitForTimeout(800);
  const minimized = await win.evaluate(el => el.classList.contains('minimized'));
  const icon = page.locator('.detail-genie-icon').first();
  const iconThere = await icon.count() === 1 && await icon.isVisible();
  await page.screenshot({ path: path.join(OUT, `${t.key}-4-minimized.png`) });
  R('genie-minimize plays, window hides, per-project dock icon appears',
    minimized && iconThere, `minimized=${minimized} dockIcon=${iconThere}`);

  await icon.click();
  await page.waitForTimeout(800);
  const restored = await win.evaluate(el => !el.classList.contains('minimized') && el.getBoundingClientRect().width > 200);
  R('dock icon click restores the window', restored);

  // maximize + unmaximize
  await win.locator('.detail-dot.dot-max').click();
  await page.waitForTimeout(300);
  const maxed = await win.evaluate(el => el.classList.contains('maximized'));
  await page.screenshot({ path: path.join(OUT, `${t.key}-5-maximized.png`) });
  await win.locator('.detail-dot.dot-max').click();
  await page.waitForTimeout(200);
  const unmaxed = await win.evaluate(el => !el.classList.contains('maximized'));
  R('maximize fills viewport and restores size', maxed && unmaxed, `max=${maxed} unmax=${unmaxed}`);

  // close
  await win.locator('.detail-dot.dot-close').click();
  await page.waitForTimeout(300);
  R('close removes the window', await page.locator('.detail-window').count() === 0);

  // scroll reveal runs (cards end fully visible after entering the viewport)
  await page.evaluate(async () => {
    const grid = document.getElementById('workGrid');
    grid.scrollIntoView({ block: 'center' });
    for (let y = window.scrollY; y < document.documentElement.scrollHeight; y += 500) {
      window.scrollTo(0, y); await new Promise(r => setTimeout(r, 80));
    }
  });
  await page.waitForTimeout(1500);
  const revealed = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.scatter-card')];
    return cards.filter(c => getComputedStyle(c).opacity === '1').length + '/' + cards.length;
  });
  R('scroll reveal runs (cards reach opacity 1)', revealed.startsWith('9/9'), revealed);

  results[t.key] = { url: t.url, weight, checks: check };
  await ctx.close();
  await browser.close();
}

fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
const allPass = Object.values(results).every(r => Object.values(r.checks).every(c => c.pass));
console.log(allPass ? 'ALL CHECKS PASS' : 'SOME CHECKS FAILED');
process.exit(allPass ? 0 : 1);
