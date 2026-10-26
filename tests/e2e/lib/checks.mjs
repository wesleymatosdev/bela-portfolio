// The check catalog. Every check is a named function:
//   async (page, ctx) => { pass, detail, evidence }
// ctx = { gt (ground truth), state (per-stack scratch: open window etc.), reportDir, stack }
// Ground truth is derived from projects.json at runtime — never hardcoded counts.
import { VIEWPORT } from './browser.mjs';

const settle = (page, ms) => page.waitForTimeout(ms);

// ---------- content ----------

// 1. content-parity: rendered cards match projects.json 1:1 (count, order by
// array sort, title, year, category label, image refs).
export async function contentParity(page, ctx) {
  const cards = await page.evaluate(() =>
    [...document.querySelectorAll('#workGrid .scatter-card')].map((c) => ({
      title: c.querySelector('h3')?.textContent?.trim() ?? null,
      year: c.querySelector('.scatter-year')?.textContent?.trim() ?? null,
      cat: c.querySelector('.scatter-cat')?.textContent?.trim() ?? null,
      images: JSON.parse(c.getAttribute('data-images') || '[]'),
    }))
  );
  const gt = ctx.gt;
  const problems = [];
  if (cards.length !== gt.length) {
    problems.push(`card count ${cards.length} != projects.json count ${gt.length}`);
  }
  gt.forEach((g, i) => {
    const c = cards[i];
    if (!c) return;
    if (c.title !== g.title) problems.push(`card #${i} title ${JSON.stringify(c.title)} != ${JSON.stringify(g.title)}`);
    if (c.year !== g.year) problems.push(`card #${i} year ${JSON.stringify(c.year)} != ${JSON.stringify(g.year)}`);
    if (c.cat !== g.catLabel) problems.push(`card #${i} category ${JSON.stringify(c.cat)} != ${JSON.stringify(g.catLabel)}`);
    if (JSON.stringify(c.images) !== JSON.stringify(g.images)) {
      problems.push(`card #${i} data-images mismatch (${c.images.length} vs ${g.images.length} refs)`);
    }
  });
  return {
    pass: problems.length === 0,
    detail: problems.length ? problems.slice(0, 4).join('; ') : `${cards.length}/${gt.length} cards match projects.json (count, sort order, title, year, category, image refs)`,
    evidence: { renderedCount: cards.length, expectedCount: gt.length, problems },
  };
}

// 2. assets-resolve: EVERY image referenced by any card (thumb src + every
// data-images entry) returns HTTP 200 and decodes (bitmap > 0px).
export async function assetsResolve(page, ctx) {
  const refs = await page.evaluate(() => {
    const out = new Set();
    for (const card of document.querySelectorAll('#workGrid .scatter-card')) {
      const thumb = card.querySelector('.scatter-thumb-img');
      if (thumb?.getAttribute('src')) out.add(thumb.getAttribute('src'));
      for (const name of JSON.parse(card.getAttribute('data-images') || '[]')) {
        out.add('assets/media/' + name);
      }
    }
    return [...out];
  });
  const base = page.url();
  const urls = refs.map((rel) => new URL(rel, base).href);
  const failures = await page.evaluate(async (urls) => {
    const bad = [];
    for (const u of urls) {
      try {
        const res = await fetch(u);
        if (!res.ok) { bad.push(`${u} -> HTTP ${res.status}`); continue; }
        const bmp = await createImageBitmap(await res.blob());
        const w = bmp.width, h = bmp.height;
        bmp.close();
        if (w <= 0 || h <= 0) bad.push(`${u} decoded to ${w}x${h}`);
      } catch (e) {
        bad.push(`${u} -> ${String(e && e.message || e)}`);
      }
    }
    return bad;
  }, urls);
  return {
    pass: failures.length === 0,
    detail: failures.length
      ? `${urls.length - failures.length}/${urls.length} images OK; failures: ${failures.slice(0, 3).join(' | ')}`
      : `${urls.length}/${urls.length} referenced images return 200 and decode`,
    evidence: { total: urls.length, failures },
  };
}

// 3. card-thumbs: each card thumb has its palette color applied inline
// (--thumb-color) and it matches the CMS color token resolved from projects.json.
export async function cardThumbs(page, ctx) {
  const got = await page.evaluate(() =>
    [...document.querySelectorAll('#workGrid .scatter-card')].map((card) => {
      const thumb = card.querySelector('.scatter-thumb');
      return {
        inline: thumb ? thumb.style.getPropertyValue('--thumb-color').trim() : null,
        computed: thumb ? getComputedStyle(thumb).getPropertyValue('--thumb-color').trim() : null,
        hasThumb: !!thumb,
      };
    })
  );
  const problems = [];
  ctx.gt.forEach((g, i) => {
    const t = got[i];
    if (!t?.hasThumb) { problems.push(`card #${i} has no .scatter-thumb`); return; }
    if (!t.inline) problems.push(`card #${i} missing inline --thumb-color`);
    else if (t.inline.toLowerCase() !== g.thumbColor) {
      problems.push(`card #${i} --thumb-color ${t.inline} != expected ${g.thumbColor} (token from projects.json)`);
    }
  });
  return {
    pass: problems.length === 0,
    detail: problems.length ? problems.slice(0, 4).join('; ') : `${got.length}/${ctx.gt.length} thumbs carry their palette --thumb-color`,
    evidence: { problems, sample: got.slice(0, 3) },
  };
}

// ---------- modal / detail windows ----------

// The cover is the img that actually carries a src inside .detail-cover —
// pinned structurally (and diagnostics recorded) so a stray injected
// placeholder img can never trip Playwright's strict mode in CI.
async function openDetailWindow(page, cardIndex = 0) {
  await page.locator('#workGrid .scatter-card').nth(cardIndex).click();
  const win = page.locator('.detail-window').first();
  await win.waitFor({ state: 'visible', timeout: 5000 });
  ctx_coverDiagnostics(win);
  await coverLocator(win).evaluate((img) => img.decode().catch(() => {}));
  await settle(page, 900); // entrance animation settles
  return win;
}

export function coverLocator(win) {
  return win.locator('.detail-cover img[src]').first();
}

// Best-effort: record every .detail-cover img (incl. stray ones) for evidence.
function ctx_coverDiagnostics(win) {
  win.evaluate((el) => [...el.querySelectorAll('.detail-cover img')].map((i) => ({
    src: i.getAttribute('src'), ariaHidden: i.getAttribute('aria-hidden'), outer: i.outerHTML.slice(0, 160),
  }))).then((imgs) => { globalThis.__coverDiag = imgs; }).catch(() => {});
}

// 4. modal-image-led: cover is the lead (loads, visible height >= 200px at
// 1440x900) and the initials tile is display:none (regression-guard for 1dfba69).
export async function modalImageLed(page, ctx) {
  const win = await openDetailWindow(page);
  ctx.state.win = win;
  const g = ctx.gt[0];
  const hasGallery = await win.evaluate((el) => el.classList.contains('has-gallery'));
  const initials = await win.evaluate((el) => {
    const tile = el.querySelector('.detail-thumb');
    if (!tile) return null;
    return { hidden: tile.hidden, display: getComputedStyle(tile).display };
  });
  const cover = await coverLocator(win).evaluate((img) => ({
    src: img.getAttribute('src'),
    naturalWidth: img.naturalWidth,
  }));
  const box = await coverLocator(win).boundingBox();
  const heightOk = !!box && box.height >= 200;
  const problems = [];
  if (!hasGallery) problems.push('window missing has-gallery class');
  if (!initials) problems.push('.detail-thumb initials tile not found');
  else {
    if (!initials.hidden) problems.push('initials tile hidden attr not set');
    if (initials.display !== 'none') problems.push(`initials tile computed display=${initials.display}, not display:none`);
  }
  if (!(cover.naturalWidth > 0)) problems.push(`cover did not decode (naturalWidth=${cover.naturalWidth})`);
  if (!heightOk) problems.push(`cover visible height ${(box?.height ?? 0).toFixed(0)}px < 200px`);
  return {
    pass: problems.length === 0,
    detail: problems.length ? problems.join('; ') : `cover ${cover.src} leads at ${box.height.toFixed(0)}px, initials tile display:none`,
    evidence: { src: cover.src, naturalWidth: cover.naturalWidth, height: box?.height ?? null, expectedFirstImage: g.images[0], initials, hasGallery, coverImgsSeen: globalThis.__coverDiag ?? null, problems },
  };
}

// 5. modal-thumb-switch: clicking gallery thumbnails swaps the cover src.
export async function modalThumbSwitch(page, ctx) {
  const win = ctx.state.win;
  if (!win) return { pass: false, detail: 'no open window from modal-image-led' };
  const g = ctx.gt[0];
  const thumbs = win.locator('.detail-thumbs button');
  const count = await thumbs.count();
  const before = await win.locator('.detail-cover img').getAttribute('src');
  await thumbs.nth(1).click();
  await settle(page, 600);
  await win.locator('.detail-cover img').evaluate((img) => img.decode().catch(() => {}));
  const after = await win.locator('.detail-cover img').getAttribute('src');
  const selMoved = await thumbs.nth(1).evaluate((b) => b.classList.contains('sel'));
  const problems = [];
  if (count !== g.images.length) problems.push(`thumb count ${count} != ${g.images.length} images in projects.json`);
  if (before === after) problems.push('cover src did not change after thumbnail click');
  else if (!after.includes(g.images[1])) problems.push(`cover src ${after} does not reference image #2 (${g.images[1]})`);
  if (!selMoved) problems.push('selection class did not move to clicked thumb');
  return {
    pass: problems.length === 0,
    detail: problems.length ? problems.join('; ') : `cover ${before} -> ${after} (thumb 2 of ${count})`,
    evidence: { before, after, thumbCount: count, selMoved, problems },
  };
}

// 6. window-drag: dragging the titlebar moves the window.
export async function windowDrag(page, ctx) {
  const win = ctx.state.win;
  if (!win) return { pass: false, detail: 'no open window from modal-image-led' };
  const before = await win.boundingBox();
  const tb = await win.locator('.detail-titlebar').boundingBox();
  await page.mouse.move(tb.x + tb.width / 2, tb.y + 20);
  await page.mouse.down();
  await page.mouse.move(tb.x + tb.width / 2 + 140, tb.y + 20 + 70, { steps: 8 });
  await page.mouse.up();
  await settle(page, 150);
  const after = await win.boundingBox();
  const dx = after.x - before.x, dy = after.y - before.y;
  return {
    pass: Math.abs(dx) > 100 && Math.abs(dy) > 40,
    pass_note: 'requires >100px x and >40px y displacement',
    detail: `dx=${dx.toFixed(0)} dy=${dy.toFixed(0)}`,
    evidence: { before, after },
  };
}

// 7. window-genie: minimize hides the window + shows the per-project dock icon;
// clicking the icon restores the window.
export async function windowGenie(page, ctx) {
  const win = ctx.state.win;
  if (!win) return { pass: false, detail: 'no open window from modal-image-led' };
  await win.locator('.detail-dot.dot-min').click();
  await settle(page, 900);
  const minimized = await win.evaluate((el) => el.classList.contains('minimized'));
  const icon = page.locator('.detail-genie-icon').first();
  const iconCount = await icon.count();
  const iconVisible = iconCount > 0 && (await icon.isVisible());
  const shot = { minimized, iconCount, iconVisible };
  await icon.click();
  await settle(page, 900);
  const restored = await win.evaluate((el) =>
    !el.classList.contains('minimized') && el.getBoundingClientRect().width > 200
  );
  return {
    pass: minimized && iconVisible && restored,
    detail: `minimized=${minimized} dockIcon=${iconVisible} restored=${restored}`,
    evidence: shot,
  };
}

// 8a. window-maximize: size change to fill the viewport and back.
export async function windowMaximize(page, ctx) {
  const win = ctx.state.win;
  if (!win) return { pass: false, detail: 'no open window from modal-image-led' };
  const before = await win.boundingBox();
  await win.locator('.detail-dot.dot-max').click();
  await settle(page, 400);
  const maxed = await win.evaluate((el) => el.classList.contains('maximized'));
  const maxBox = await win.boundingBox();
  await win.locator('.detail-dot.dot-max').click();
  await settle(page, 300);
  const unmaxed = await win.evaluate((el) => !el.classList.contains('maximized'));
  // Maximized means "fills the viewport": >= 90% of the 1440x900 viewport on
  // both axes (the window may already be nearly full-height before maximizing).
  const fillsViewport = !!maxBox && maxBox.width >= VIEWPORT.width * 0.9 && maxBox.height >= VIEWPORT.height * 0.9;
  const problems = [];
  if (!maxed) problems.push('maximized class not applied');
  if (!fillsViewport) problems.push(`maximized window does not fill >=90% of the viewport (${maxBox?.width.toFixed(0)}x${maxBox?.height.toFixed(0)} at ${VIEWPORT.width}x${VIEWPORT.height})`);
  if (!unmaxed) problems.push('maximized class not removed on second click');
  return {
    pass: problems.length === 0,
    detail: problems.length ? problems.join('; ') : `fills viewport on toggle (${maxBox.width.toFixed(0)}x${maxBox.height.toFixed(0)}) and restores`,
    evidence: { before, maxBox, viewport: VIEWPORT, problems },
  };
}

// 8b. window-close: close dot removes the window.
export async function windowClose(page, ctx) {
  const win = ctx.state.win;
  if (!win) return { pass: false, detail: 'no open window from modal-image-led' };
  await win.locator('.detail-dot.dot-close').click();
  await settle(page, 400);
  const remaining = await page.locator('.detail-window').count();
  return {
    pass: remaining === 0,
    detail: remaining === 0 ? 'window removed from DOM on close' : `${remaining} detail window(s) still in DOM`,
    evidence: { remaining },
  };
}

// ---------- scroll / motion ----------

// 9. scroll-reveal-visible: after scrolling through the page, every
// scroll-driven .reveal element has computed opacity > 0. Regression-guard for
// the Astro CSS-minifier bug class (minified shorthand Chromium rejects ->
// elements stuck at opacity 0).
export async function scrollRevealVisible(page, ctx) {
  await page.evaluate(async () => {
    const h = document.documentElement.scrollHeight;
    for (let y = 0; y <= h; y += 500) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 80));
    }
  });
  await settle(page, 800);
  const samples = await page.evaluate(async () => {
    const out = [];
    for (const el of document.querySelectorAll('.reveal')) {
      el.scrollIntoView({ block: 'center' });
      await new Promise((r) => setTimeout(r, 150));
      out.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className || '').toString().slice(0, 60),
        opacity: getComputedStyle(el).opacity,
      });
    }
    return out;
  });
  const stuck = samples.filter((s) => !(parseFloat(s.opacity) > 0));
  return {
    pass: samples.length > 0 && stuck.length === 0,
    detail: stuck.length
      ? `${stuck.length}/${samples.length} .reveal elements stuck at opacity 0 (scroll-driven animation not applying)`
      : `${samples.length}/${samples.length} .reveal elements reach opacity > 0 after scroll`,
    evidence: { total: samples.length, stuck: stuck.slice(0, 6), samples: samples.slice(0, 12) },
  };
}

// 11. wordmark-easter-egg: clicking a hero wordmark letter triggers its
// animation (a running Web Animation appears on the letter).
export async function wordmarkEasterEgg(page, ctx) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await settle(page, 300);
  const res = await page.evaluate(() => {
    const svg = document.querySelector('h1.name svg.name-wordmark');
    if (!svg) return { error: 'hero wordmark svg not found' };
    const paths = [...svg.querySelectorAll('path[class^="wm-"]')];
    if (!paths.length) return { error: 'no wordmark letter paths found' };
    // Letters whose move animates the path itself (wm-B bounces); the zigzag
    // letters (wm-I*) animate a clone wrapper instead.
    const target =
      paths.find((p) => [...p.classList].includes('wm-B')) ||
      paths.find((p) => { const c = [...p.classList].find((x) => x.startsWith('wm-')); return c && !c.startsWith('wm-I'); });
    if (!target) return { error: 'no directly-animated letter found' };
    const cls = [...target.classList].find((c) => c.startsWith('wm-'));
    const r = target.getBoundingClientRect();
    target.dispatchEvent(new MouseEvent('click', {
      bubbles: true, cancelable: true, view: window,
      clientX: r.x + r.width / 2, clientY: r.y + r.height / 2,
    }));
    const anims = target.getAnimations();
    return {
      cls,
      running: anims.filter((a) => a.playState === 'running').length,
      playState: anims[0]?.playState ?? null,
      keyframeTransform: anims[0]?.effect?.getKeyframes?.().map((k) => k.transform).find((t) => t && t !== 'none') ?? null,
    };
  });
  if (res.error) return { pass: false, detail: res.error, evidence: res };
  const pass = res.running > 0 && res.playState === 'running' && !!res.keyframeTransform;
  return {
    pass,
    detail: pass
      ? `clicking letter ${res.cls} starts a running animation (keyframe transform: ${res.keyframeTransform})`
      : `clicking letter ${res.cls} produced no running animation (playState=${res.playState}, running=${res.running})`,
    evidence: res,
  };
}

// 10. reduced-motion: with prefers-reduced-motion: reduce, all primary content
// is still visible and the modal still works. Runs in its OWN browser context.
export async function reducedMotion(browser, ctx) {
  const context = await browser.newContext({ viewport: VIEWPORT, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const problems = [];
  try {
    await page.goto(ctx.url, { waitUntil: 'networkidle' });
    await settle(page, 800);
    const vis = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('#workGrid .scatter-card')];
      const visible = cards.filter((c) => {
        const cs = getComputedStyle(c);
        const r = c.getBoundingClientRect();
        return cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0 && r.width > 0 && r.height > 0;
      }).length;
      const hero = document.querySelector('h1.name');
      const heroVisible = hero && getComputedStyle(hero).display !== 'none' && hero.getBoundingClientRect().height > 0;
      return { cards: cards.length, visible, heroVisible: !!heroVisible };
    });
    if (vis.visible !== ctx.gt.length) problems.push(`${vis.visible}/${vis.cards} cards visible under reduced motion (expected all ${ctx.gt.length})`);
    if (!vis.heroVisible) problems.push('hero wordmark not visible under reduced motion');
    // modal still works
    await page.locator('#workGrid .scatter-card').first().click();
    const win = page.locator('.detail-window').first();
    await win.waitFor({ state: 'visible', timeout: 5000 });
      await win.locator('.detail-cover img[src]').first().evaluate((img) => img.decode().catch(() => {}));
    const cover = await win.locator('.detail-cover img[src]').first().evaluate((img) => ({ nw: img.naturalWidth, src: img.getAttribute('src') }));
    if (!(cover.nw > 0)) problems.push(`modal cover did not load under reduced motion (${cover.src})`);
    await page.screenshot({ path: `${ctx.reportDir}/${ctx.stack}-reduced-motion-modal.png` });
    return {
      pass: problems.length === 0,
      detail: problems.length ? problems.join('; ') : `all ${vis.visible} cards + hero visible, modal opens with cover loaded, under prefers-reduced-motion: reduce`,
      evidence: { visibility: vis, cover, problems },
    };
  } finally {
    await context.close();
  }
}
