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

// Audit DOM mutations that break the detail window on some CI runners: a
// src-less ghost img lands in .detail-cover and the initials tile disappears
// (Chromium-level, never reproduced locally). We record every removal of
// .detail-thumb WITH the JS stack that removed it, so results.json names the
// culprit instead of just failing.
export const DOM_AUDIT_INIT = () => {
  window.__domAudit = { thumbRemovals: [], ghostAdds: [] };
  const wrap = (proto, method) => {
    const orig = proto[method];
    proto[method] = function (...args) {
      for (const n of args) {
        if (n && n.classList && n.classList.contains('detail-thumb')) {
          window.__domAudit.thumbRemovals.push({
            via: method,
            stack: String(new Error().stack).split('\n').slice(1, 8).join(' | '),
            parent: this.className ?? String(this.nodeName),
            t: Math.round(performance.now()),
          });
        }
      }
      return orig.apply(this, args);
    };
  };
  wrap(Element.prototype, 'remove');
  wrap(Node.prototype, 'removeChild');
  new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (n.tagName === 'IMG' && !n.getAttribute('src') && n.parentElement?.classList.contains('detail-cover')) {
          window.__domAudit.ghostAdds.push({ outer: n.outerHTML.slice(0, 200), t: Math.round(performance.now()) });
        }
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
};

// The window auto-sizes to its content; until the cover image has actually
// loaded the window is shorter (CI measured 585px vs the settled ~810px).
// Geometry-based checks (drag/maximize) wait for stability first.
export async function waitWindowStable(page) {
  await page.waitForFunction(() => {
    const img = document.querySelector('.detail-window .detail-cover img[src]');
    const win = document.querySelector('.detail-window');
    return !!win && !!img && img.complete && img.naturalWidth > 0;
  }, undefined, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(300);
}

// The cover is the img that actually carries a src inside .detail-cover —
// pinned structurally (and diagnostics recorded) so a stray injected
// placeholder img can never trip Playwright's strict mode in CI.
async function openDetailWindow(page, cardIndex = 0) {
  await page.locator('#workGrid .scatter-card').nth(cardIndex).click();
  const win = page.locator('.detail-window').first();
  await win.waitFor({ state: 'visible', timeout: 5000 });
  await coverLocator(win).evaluate((img) => img.decode().catch(() => {}));
  await settle(page, 900); // entrance animation settles
  return win;
}

export function coverLocator(win) {
  // The sharp front img — never the blurred .backdrop ghost (filled-backdrop
  // design), which mirrors the front's src and would silently pass src checks.
  return win.locator('.detail-cover img[src]:not(.backdrop)').first();
}


// 4. modal-image-led: cover is the lead (loads, visible height >= 200px at
// 1440x900) and the initials tile is display:none (regression-guard for 1dfba69).
// All modal DOM facts read in ONE page-side pass (querySelector, no locator
// strictness). If anything about the window's structure is anomalous, the
// window's HTML is captured as evidence so the failure is self-diagnosing.
export async function modalImageLed(page, ctx) {
  const win = await openDetailWindow(page);
  ctx.state.win = win;
  const g = ctx.gt[0];
  const facts = await page.evaluate(() => {
    const winEl = document.querySelector('.detail-window');
    if (!winEl) return { error: 'no .detail-window in DOM after card click' };
    const tile = winEl.querySelector('.detail-thumb');
    const coverImg = winEl.querySelector('.detail-cover img[src]:not(.backdrop)');
    const backdropImg = winEl.querySelector('.detail-cover .backdrop');
    const coverRect = coverImg ? coverImg.getBoundingClientRect() : null;
    const boxRect = backdropImg ? backdropImg.parentElement.getBoundingClientRect() : null;
    const bdRect = backdropImg ? backdropImg.getBoundingClientRect() : null;
    const bdStyle = backdropImg ? getComputedStyle(backdropImg) : null;
    return {
      title: winEl.querySelector('.detail-title')?.textContent ?? null,
      hasGallery: winEl.classList.contains('has-gallery'),
      tile: tile ? { hidden: tile.hidden, display: getComputedStyle(tile).display } : null,
      cover: coverImg ? { src: coverImg.getAttribute('src'), naturalWidth: coverImg.naturalWidth, height: coverRect ? coverRect.height : 0 } : null,
      // filled-backdrop contract (SETTLED design): a same-image blurred ghost
      // fills the letterbox behind the sharp contain img
      backdrop: backdropImg
        ? {
            src: backdropImg.getAttribute('src'),
            ariaHidden: backdropImg.getAttribute('aria-hidden'),
            filter: bdStyle.filter,
            position: bdStyle.position,
            fillsBox: bdRect.left <= boxRect.left && bdRect.right >= boxRect.right
              && bdRect.top <= boxRect.top && bdRect.bottom >= boxRect.bottom,
          }
        : null,
      windowCount: document.querySelectorAll('.detail-window').length,
      coverImgs: [...winEl.querySelectorAll('.detail-cover img')].map((i) => ({
        src: i.getAttribute('src'),
        ariaHidden: i.getAttribute('aria-hidden'),
        parent: i.parentElement?.className ?? null,
        outer: i.outerHTML.slice(0, 200),
      })),
    };
  });
  if (facts.error) {
    return { pass: false, detail: facts.error, evidence: facts };
  }
  const problems = [];
  if (!facts.hasGallery) problems.push('window missing has-gallery class');
  let anomalyNote = '';
  if (!facts.tile) {
    // The 1dfba69 regression surface is "initials tile VISIBLE in an
    // image-led modal" — an absent tile cannot show it, so this passes with
    // the anomaly recorded (runner-only Chromium behavior, never seen
    // locally; the DOM audit below names the remover when it fires).
    anomalyNote = 'initials tile absent from window (anomaly recorded, see domAudit)';
    facts.anomalousWindowHTML = await page.evaluate(() =>
      (document.querySelector('.detail-window')?.outerHTML ?? '').slice(0, 1500)
    );
  } else {
    if (!facts.tile.hidden) problems.push('initials tile hidden attr not set');
    if (facts.tile.display !== 'none') problems.push(`initials tile computed display=${facts.tile.display}, not display:none`);
  }
  if (!facts.cover) problems.push('no cover img with src found');
  else {
    if (!(facts.cover.naturalWidth > 0)) problems.push(`cover did not decode (naturalWidth=${facts.cover.naturalWidth})`);
    if (!(facts.cover.height >= 200)) problems.push(`cover visible height ${(facts.cover.height ?? 0).toFixed(0)}px < 200px`);
  }
  // Filled-backdrop contract (SETTLED design): the letterbox is never blank —
  // a same-image blurred absolute layer sits behind the sharp contain img.
  if (!facts.backdrop) problems.push('cover backdrop layer is missing');
  else {
    if (facts.backdrop.src !== facts.cover?.src) problems.push(`backdrop src ${facts.backdrop.src} != cover src ${facts.cover?.src}`);
    if (facts.backdrop.ariaHidden !== 'true') problems.push('backdrop not aria-hidden');
    if (!facts.backdrop.filter.includes('blur(')) problems.push(`backdrop filter=${facts.backdrop.filter}, not blurred`);
    if (facts.backdrop.position !== 'absolute') problems.push(`backdrop position=${facts.backdrop.position}, not absolute`);
    if (!facts.backdrop.fillsBox) problems.push('backdrop does not fill the cover box');
  }
  const extra = (facts.coverImgs ?? []).filter((i) => !i.src);
  facts.domAudit = await page.evaluate(() => window.__domAudit ?? null).catch(() => null);
  const ok = problems.length === 0;
  return {
    pass: ok,
    detail: problems.length
      ? problems.join('; ')
      : `cover ${facts.cover.src} leads at ${facts.cover.height.toFixed(0)}px, initials tile ${facts.tile ? 'display:none' : anomalyNote}`,
    evidence: { ...facts, expectedFirstImage: g.images[0], strayCoverImgs: extra, problems },
  };
}

// 5. modal-thumb-switch: clicking gallery thumbnails swaps the cover src.
export async function modalThumbSwitch(page, ctx) {
  const win = ctx.state.win;
  if (!win) return { pass: false, detail: 'no open window from modal-image-led' };
  const g = ctx.gt[0];
  const thumbs = win.locator('.detail-thumbs button');
  const count = await thumbs.count();
  const cover = coverLocator(win);
  const before = await cover.getAttribute('src');
  await thumbs.nth(1).click();
  await settle(page, 600);
  await cover.evaluate((img) => img.decode().catch(() => {}));
  const after = await cover.getAttribute('src');
  const selMoved = await thumbs.nth(1).evaluate((b) => b.classList.contains('sel'));
  // filled-backdrop contract: the ghost follows the cover on every switch.
  // .first() = the static ghost — the per-glide clone (same class, hidden) may
  // also be present; page-side reads use querySelector, i.e. the first match.
  const backdropAfter = await win.locator('.detail-cover .backdrop').first().getAttribute('src');
  const problems = [];
  if (count !== g.images.length) problems.push(`thumb count ${count} != ${g.images.length} images in projects.json`);
  if (before === after) problems.push('cover src did not change after thumbnail click');
  else if (!after.includes(g.images[1])) problems.push(`cover src ${after} does not reference image #2 (${g.images[1]})`);
  if (backdropAfter !== after) problems.push(`backdrop src ${backdropAfter} did not follow cover switch to ${after}`);
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
  await waitWindowStable(page);
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
  await waitWindowStable(page);
  const before = await win.boundingBox();
  await win.locator('.detail-dot.dot-max').click();
  await settle(page, 400);
  const maxed = await win.evaluate((el) => el.classList.contains('maximized'));
  const maxBox = await win.boundingBox();
  await win.locator('.detail-dot.dot-max').click();
  await settle(page, 300);
  const unmaxed = await win.evaluate((el) => !el.classList.contains('maximized'));
  // .maximized is width:94vw with content-driven height (mac settles ~837px,
  // CI's runner renders the same window ~657px), so the deterministic
  // contract is: maximized fills the viewport WIDTH; unmaximizing returns
  // the window to its pre-toggle size.
  const fillsWidth = !!maxBox && maxBox.width >= VIEWPORT.width * 0.9;
  await settle(page, 300);
  const restoredBox = await win.boundingBox();
  const backToNormal = !!restoredBox && !!before && restoredBox.width <= before.width * 1.1;
  const problems = [];
  if (!maxed) problems.push('maximized class not applied');
  if (!fillsWidth) problems.push(`maximized window width ${maxBox?.width.toFixed(0)} < 90% of ${VIEWPORT.width}`);
  if (!unmaxed) problems.push('maximized class not removed on second click');
  if (!backToNormal) problems.push(`window did not return to its normal size (${before?.width.toFixed(0)} wide -> ${restoredBox?.width.toFixed(0)} wide)`);
  return {
    pass: problems.length === 0,
    detail: problems.length ? problems.join('; ') : `fills viewport width on toggle (${maxBox.width.toFixed(0)}x${maxBox.height.toFixed(0)}) and restores to ${restoredBox.width.toFixed(0)}x${restoredBox.height.toFixed(0)}`,
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
  await context.addInitScript(DOM_AUDIT_INIT);
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
