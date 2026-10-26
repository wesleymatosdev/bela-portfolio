// Check catalog for the bela-portfolio E2E regression suite.
// Every check asserts DOM/computed-style facts (never pixels) against ground
// truth derived from content/projects.json AT RUNTIME — no counts or titles
// are hardcoded, so the suite keeps validating as the CMS content changes.
import { assert, sleep } from './helpers.mjs';

const CAT_LABEL = { brand: 'Branding', social: 'Social', print: 'Print', ui: 'UI/UX' };
const VIEWPORT = { width: 1440, height: 900 };

// Expected card facts, derived from projects.json (array order == render order).
function expectedCards(data) {
  return data.projects.map((p) => ({
    title: p.title,
    year: String(p.year),
    catLabel: CAT_LABEL[p.cat] || p.cat,
    images: p.images || [],
  }));
}

function hexToRgbStr(hex) {
  const m = hex.trim().match(/^#([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

// --------------------------------------------------------------------------
// 1. content-parity
// --------------------------------------------------------------------------
export async function checkContentParity(env) {
  const rendered = await env.page.evaluate(() =>
    [...document.querySelectorAll('#workGrid .scatter-card')].map((c) => ({
      title: c.querySelector('.scatter-body h3')?.textContent.trim() ?? null,
      year: c.querySelector('.scatter-year')?.textContent.trim() ?? null,
      catLabel: c.querySelector('.scatter-cat')?.textContent.trim() ?? null,
    }))
  );
  const expected = expectedCards(env.data);
  assert(
    rendered.length === expected.length,
    'rendered card count does not match projects.json',
    `rendered=${rendered.length} expected=${expected.length}`
  );
  const mismatches = [];
  expected.forEach((exp, i) => {
    const got = rendered[i];
    if (got.title !== exp.title || got.year !== exp.year || got.catLabel !== exp.catLabel) {
      mismatches.push({
        index: i,
        expected: exp,
        rendered: got,
      });
    }
  });
  assert(mismatches.length === 0, 'card title/year/category do not match projects.json order', JSON.stringify(mismatches));
  return {
    count: rendered.length,
    order: rendered.map((c) => c.title),
  };
}

// --------------------------------------------------------------------------
// 2. assets-resolve — every referenced card image: HTTP 200 + decodes
// --------------------------------------------------------------------------
export async function checkAssetsResolve(env) {
  const refs = await env.page.evaluate(() => {
    const urls = new Set();
    document.querySelectorAll('#workGrid .scatter-card').forEach((c) => {
      const thumb = c.querySelector('.scatter-thumb-img');
      if (thumb) urls.add(thumb.getAttribute('src'));
      try {
        JSON.parse(c.dataset.images || '[]').forEach((s) => urls.add('assets/media/' + s));
      } catch {
        /* malformed data-images: card-thumb URL still checked */
      }
    });
    return [...urls];
  });
  assert(refs.length > 0, 'no image references found on any card');
  const absolute = refs.map((u) => new URL(u, env.base).href);
  const results = await env.page.evaluate(async (urls) => {
    const out = [];
    for (const u of urls) {
      try {
        const r = await fetch(u);
        let natural = 0;
        if (r.ok) {
          natural = await new Promise((res) => {
            const im = new Image();
            im.onload = () => res(im.naturalWidth);
            im.onerror = () => res(0);
            im.src = u;
          });
        }
        out.push({ url: u, status: r.status, natural });
      } catch (e) {
        out.push({ url: u, status: 0, natural: 0, error: String(e) });
      }
    }
    return out;
  }, absolute);
  const broken = results.filter((r) => r.status !== 200 || r.natural <= 0);
  assert(broken.length === 0, 'broken card images (non-200 or non-decoding)', JSON.stringify(broken));
  return { imageCount: results.length, allOk: true };
}

// --------------------------------------------------------------------------
// 3. card-thumbs — palette color applied via inline --thumb-color
// --------------------------------------------------------------------------
export async function checkCardThumbs(env) {
  const thumbs = await env.page.evaluate(() =>
    [...document.querySelectorAll('#workGrid .scatter-card')].map((c) => {
      const t = c.querySelector('.scatter-thumb');
      return {
        title: c.querySelector('.scatter-body h3')?.textContent.trim(),
        cssVar: t ? t.style.getPropertyValue('--thumb-color').trim() : null,
        computed: t ? getComputedStyle(t).backgroundColor : null,
      };
    })
  );
  const bad = [];
  thumbs.forEach((t) => {
    const expectRgb = t.cssVar ? hexToRgbStr(t.cssVar) : null;
    if (!t.cssVar || !expectRgb || t.computed !== expectRgb) {
      bad.push(t);
    }
  });
  assert(bad.length === 0, 'cards missing inline --thumb-color or computed background does not match', JSON.stringify(bad));
  return { count: thumbs.length, sample: thumbs.slice(0, 3) };
}

// --------------------------------------------------------------------------
// 12. seo-head
// --------------------------------------------------------------------------
export async function checkSeoHead(env) {
  const head = await env.page.evaluate(() => ({
    title: document.title,
    description: document.querySelector('meta[name="description"]')?.getAttribute('content') ?? null,
    ogTitle: document.querySelector('meta[property="og:title"]')?.getAttribute('content') ?? null,
    ogImage: document.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? null,
  }));
  for (const key of ['title', 'description', 'ogTitle', 'ogImage']) {
    assert(head[key] && head[key].length > 0, `missing/empty head field: ${key}`, JSON.stringify(head));
  }
  return head;
}

// --------------------------------------------------------------------------
// 4. modal-image-led (opens the first card's window; leaves it open for 5-8)
// --------------------------------------------------------------------------
export async function checkModalImageLed(env) {
  const card = env.page.locator('#workGrid .scatter-card').first();
  await card.click();
  const win = env.page.locator('.detail-window').first();
  await win.waitFor({ state: 'visible', timeout: 5000 });
  await sleep(700); // entrance animation settles
  await win.locator('.detail-cover img').evaluate((img) => img.decode().catch(() => {}));
  env.state.win = win;
  env.state.project = env.data.projects[0];

  const facts = await win.evaluate((w) => {
    const cover = w.querySelector('.detail-cover img');
    const thumb = w.querySelector('.detail-thumb');
    const tr = thumb.getBoundingClientRect();
    return {
      hasGallery: w.classList.contains('has-gallery'),
      coverSrc: cover.getAttribute('src'),
      coverLoaded: cover.complete && cover.naturalWidth > 0,
      coverNatural: cover.naturalWidth,
      coverHeight: cover.getBoundingClientRect().height,
      thumbDisplay: getComputedStyle(thumb).display,
      thumbBoxHeight: tr.height,
    };
  });
  assert(facts.hasGallery, 'window is not image-led (no has-gallery class)', JSON.stringify(facts));
  assert(
    facts.coverSrc === 'assets/media/' + env.state.project.images[0],
    'cover is not the project\'s first image',
    `src=${facts.coverSrc} expected=assets/media/${env.state.project.images[0]}`
  );
  assert(facts.coverLoaded, 'cover image did not decode', `naturalWidth=${facts.coverNatural}`);
  assert(
    facts.coverHeight >= 200,
    'cover not visible as the lead (height < 200px at 1440x900)',
    `height=${facts.coverHeight}`
  );
  // Regression-guard for commit 1dfba69: the bug class is `display:flex`
  // beating the [hidden] attribute, so assert BOTH the computed display AND
  // the rendered box height of the initials tile.
  assert(facts.thumbDisplay === 'none', 'initials tile computed display is not none', `display=${facts.thumbDisplay}`);
  assert(facts.thumbBoxHeight === 0, 'initials tile still occupies box height', `height=${facts.thumbBoxHeight}`);
  return facts;
}

// --------------------------------------------------------------------------
// 5. modal-thumb-switch
// --------------------------------------------------------------------------
export async function checkModalThumbSwitch(env) {
  const win = env.state.win;
  assert(win, 'no open detail window (modal-image-led did not run/pass)');
  const project = env.state.project;
  assert(project.images.length >= 2, 'first project has < 2 images; nothing to switch');
  const srcBefore = await win.locator('.detail-cover img').getAttribute('src');
  await win.locator('.detail-thumbs button').nth(1).click();
  await sleep(300);
  await win.locator('.detail-cover img').evaluate((img) => img.decode().catch(() => {}));
  const srcAfter = await win.locator('.detail-cover img').getAttribute('src');
  const sel = await win.evaluate((w) => {
    const btns = [...w.querySelectorAll('.detail-thumbs button')];
    return btns.map((b) => b.classList.contains('sel'));
  });
  assert(srcBefore !== srcAfter, 'cover src did not change after thumbnail click', `${srcBefore} -> ${srcAfter}`);
  assert(
    srcAfter === 'assets/media/' + project.images[1],
    'cover did not switch to the 2nd project image',
    `src=${srcAfter} expected=assets/media/${project.images[1]}`
  );
  assert(sel[1] === true && sel[0] === false, 'selection marker did not move to the clicked thumbnail', JSON.stringify(sel));
  return { srcBefore, srcAfter, selection: sel };
}

// --------------------------------------------------------------------------
// 6. window-drag
// --------------------------------------------------------------------------
export async function checkWindowDrag(env) {
  const win = env.state.win;
  assert(win, 'no open detail window (modal-image-led did not run/pass)');
  const before = await win.boundingBox();
  const tb = await win.locator('.detail-titlebar').boundingBox();
  await env.page.mouse.move(tb.x + tb.width / 2, tb.y + 15);
  await env.page.mouse.down();
  await env.page.mouse.move(tb.x + tb.width / 2 + 160, tb.y + 15 + 90, { steps: 10 });
  await env.page.mouse.up();
  await sleep(200);
  const after = await win.boundingBox();
  const dx = after.x - before.x;
  const dy = after.y - before.y;
  assert(Math.abs(dx) > 100 && Math.abs(dy) > 40, 'titlebar drag did not move the window', `dx=${dx.toFixed(1)} dy=${dy.toFixed(1)}`);
  return { dx, dy };
}

// --------------------------------------------------------------------------
// 7. window-genie — minimize hides window, per-project dock icon, restore
// --------------------------------------------------------------------------
export async function checkWindowGenie(env) {
  const win = env.state.win;
  assert(win, 'no open detail window (modal-image-led did not run/pass)');
  const title = env.state.project.title;

  await win.locator('.detail-dot.dot-min').click();
  await sleep(800); // 400ms genie + watchdog slack
  const facts = await env.page.evaluate((t) => {
    const w = document.querySelector('.detail-window');
    const icons = [...document.querySelectorAll('.detail-genie-icon')];
    return {
      minimized: w ? w.classList.contains('minimized') : null,
      windowCount: document.querySelectorAll('.detail-window').length,
      icons: icons.map((i) => ({ projectId: i.dataset.projectId, visible: i.getBoundingClientRect().height > 0 })),
      expectedTitle: t,
    };
  }, title);
  assert(facts.minimized === true, 'window has no .minimized class after minimize click', JSON.stringify(facts));
  assert(
    facts.icons.length === 1 && facts.icons[0].projectId === title && facts.icons[0].visible,
    'per-project dock icon missing/visible mismatch',
    JSON.stringify(facts.icons)
  );
  await env.shot('window-genie-minimized');

  await env.page.locator('.detail-genie-icon').first().click();
  await sleep(800); // reverse genie + watchdog
  const restored = await env.page.evaluate(() => {
    const w = document.querySelector('.detail-window');
    return w
      ? { minimized: w.classList.contains('minimized'), width: w.getBoundingClientRect().width, iconCount: document.querySelectorAll('.detail-genie-icon').length }
      : null;
  });
  assert(restored, 'window removed from DOM');
  assert(!restored.minimized && restored.width > 200, 'window did not restore from dock icon', JSON.stringify(restored));
  assert(restored.iconCount === 0, 'dock icon not removed after restore', `icons=${restored.iconCount}`);
  return { minimizedClass: true, iconFor: title, restoredWidth: restored.width };
}

// --------------------------------------------------------------------------
// 8a. window-maximize
// --------------------------------------------------------------------------
export async function checkWindowMaximize(env) {
  const win = env.state.win;
  assert(win, 'no open detail window (modal-image-led did not run/pass)');
  await win.locator('.detail-dot.dot-max').click();
  await sleep(400);
  const maxed = await win.evaluate((w) => ({
    maximized: w.classList.contains('maximized'),
    width: w.getBoundingClientRect().width,
    height: w.getBoundingClientRect().height,
  }));
  assert(maxed.maximized, 'no .maximized class after maximize click', JSON.stringify(maxed));
  assert(
    maxed.width >= VIEWPORT.width * 0.9 && maxed.height >= VIEWPORT.height * 0.85,
    'maximized window does not fill the viewport',
    `w=${maxed.width} h=${maxed.height} viewport=${VIEWPORT.width}x${VIEWPORT.height}`
  );
  await env.shot('window-maximized');
  await win.locator('.detail-dot.dot-max').click();
  await sleep(200);
  const unmaxed = await win.evaluate((w) => !w.classList.contains('maximized'));
  assert(unmaxed, 'maximize dot click did not restore the window size');
  return { maximizedWidth: maxed.width, maximizedHeight: maxed.height, unmaximized: unmaxed };
}

// --------------------------------------------------------------------------
// 8b. window-close
// --------------------------------------------------------------------------
export async function checkWindowClose(env) {
  const win = env.state.win;
  assert(win, 'no open detail window (modal-image-led did not run/pass)');
  await win.locator('.detail-dot.dot-close').click();
  await sleep(300);
  const remaining = await env.page.evaluate(() => ({
    windows: document.querySelectorAll('.detail-window').length,
    icons: document.querySelectorAll('.detail-genie-icon').length,
  }));
  assert(remaining.windows === 0, 'window not removed after close click', JSON.stringify(remaining));
  assert(remaining.icons === 0, 'orphaned genie icon left behind after close', JSON.stringify(remaining));
  env.state.win = null;
  return remaining;
}

// --------------------------------------------------------------------------
// 9. scroll-reveal-visible
// --------------------------------------------------------------------------
export async function checkScrollReveal(env) {
  // Safety: if an earlier window check failed mid-flow, floating windows don't
  // affect the scroll-driven timeline — no cleanup needed.
  await env.page.evaluate(async () => {
    const step = 600;
    const h = document.documentElement.scrollHeight;
    for (let y = 0; y <= h; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 70));
    }
  });
  await sleep(600);
  const reveals = await env.page.evaluate(() =>
    [...document.querySelectorAll('.reveal')].map((el) => ({
      cls: el.className,
      opacity: parseFloat(getComputedStyle(el).opacity),
    }))
  );
  assert(reveals.length > 0, 'no .reveal elements found');
  const min = Math.min(...reveals.map((r) => r.opacity));
  const stuck = reveals.filter((r) => !(r.opacity > 0));
  assert(stuck.length === 0, 'scroll-driven reveal elements stuck at opacity 0', JSON.stringify(stuck));
  return { revealCount: reveals.length, minOpacity: min };
}

// --------------------------------------------------------------------------
// 11. wordmark-easter-egg
// --------------------------------------------------------------------------
export async function checkWordmarkEgg(env) {
  await env.page.evaluate(() => window.scrollTo(0, 0));
  await sleep(400);
  const probe = await env.page.evaluate(() => {
    const p = document.querySelector('h1.name svg.name-wordmark path.wm-B');
    if (!p) return { found: false };
    p.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return new Promise((res) => {
      setTimeout(() => {
        const anims = p.getAnimations().filter((a) => a.playState === 'running');
        let midTransform = null;
        let keyframes = [];
        if (anims.length) {
          const a = anims[anims.length - 1];
          a.pause();
          a.currentTime = a.effect.getTiming().duration * 0.5;
          midTransform = getComputedStyle(p).transform;
          keyframes = a.effect.getKeyframes().map((k) => k.transform);
          a.play();
        }
        res({ found: true, runningAnimations: anims.length, midTransform, keyframes });
      }, 120);
    });
  });
  assert(probe.found, 'hero wordmark letter path (.wm-B) not found');
  assert(
    probe.runningAnimations >= 1,
    'clicking a wordmark letter triggered no animation',
    `running=${probe.runningAnimations}`
  );
  assert(
    probe.midTransform && probe.midTransform !== 'none',
    'wordmark letter not mid-animation transform at 50% of its move',
    `mid=${probe.midTransform}`
  );
  return {
    runningAnimations: probe.runningAnimations,
    midTransform: probe.midTransform,
    keyframes: probe.keyframes,
  };
}

// --------------------------------------------------------------------------
// 10. reduced-motion — fresh context emulating prefers-reduced-motion: reduce
// --------------------------------------------------------------------------
export async function checkReducedMotion(env) {
  const mainPage = env.page;
  const ctx = await env.browser.newContext({
    viewport: VIEWPORT,
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  env.page = page; // failure screenshots must capture THIS page
  try {
    await page.goto(env.base, { waitUntil: 'networkidle' });
    await sleep(800);

    // primary content visible without any scroll-driven animation
    const visible = await page.evaluate((expectedCount) => {
      const wordmark = document.querySelector('h1.name svg.name-wordmark');
      const subtitle = document.querySelector('.subtitle');
      const cards = [...document.querySelectorAll('#workGrid .scatter-card')];
      const section = document.getElementById('work');
      return {
        wordmarkHeight: wordmark ? wordmark.getBoundingClientRect().height : 0,
        subtitleVisible: !!subtitle && subtitle.getBoundingClientRect().height > 0,
        workSectionOpacity: section ? parseFloat(getComputedStyle(section).opacity) : 0,
        cardCount: cards.length,
        firstCardOpacity: cards[0] ? parseFloat(getComputedStyle(cards[0]).opacity) : 0,
        firstCardHeight: cards[0] ? cards[0].getBoundingClientRect().height : 0,
        expectedCount,
      };
    }, env.data.projects.length);
    assert(visible.wordmarkHeight > 0, 'hero wordmark not visible under reduced motion', JSON.stringify(visible));
    assert(visible.subtitleVisible, 'hero subtitle not visible under reduced motion');
    const expectedCount = env.data.projects.length;
    assert(visible.cardCount === expectedCount, 'card count mismatch under reduced motion', `got=${visible.cardCount} expected=${expectedCount}`);
    assert(visible.firstCardOpacity === 1, 'card not fully visible under reduced motion (reveal not inert)', `opacity=${visible.firstCardOpacity}`);
    assert(visible.workSectionOpacity === 1, 'work section not fully visible under reduced motion');

    // modal still works end-to-end
    await page.locator('#workGrid .scatter-card').first().click();
    const win = page.locator('.detail-window').first();
    await win.waitFor({ state: 'visible', timeout: 5000 });
    await win.locator('.detail-cover img').evaluate((img) => img.decode().catch(() => {}));
    const modal = await win.evaluate((w) => {
      const cover = w.querySelector('.detail-cover img');
      const thumb = w.querySelector('.detail-thumb');
      return {
        width: w.getBoundingClientRect().width,
        coverLoaded: cover.complete && cover.naturalWidth > 0,
        thumbDisplay: getComputedStyle(thumb).display,
        thumbHeight: thumb.getBoundingClientRect().height,
      };
    });
    assert(modal.width > 200, 'detail window did not open under reduced motion', JSON.stringify(modal));
    assert(modal.coverLoaded, 'gallery cover did not decode under reduced motion');
    assert(modal.thumbDisplay === 'none' && modal.thumbHeight === 0, 'initials tile visible under reduced motion', JSON.stringify(modal));

    // FOUND BUG (regression-guard): under reduced motion the entrance
    // animation that visually centers the window (detail-window-in, ending in
    // translate(-50%, 0)) is disabled by `animation: none !important`, but
    // `.detail-window { left: 50% }` keeps no fallback transform — so a wide
    // image-led window opens with its right side (and the traffic-light dots)
    // off-screen and unreachable by mouse. Assert the window stays inside the
    // viewport; this check stays failing until the site bug is fixed.
    const rect = await win.evaluate((w) => {
      const r = w.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, width: r.width };
    });
    await env.shot('bug-reduced-motion-window-offscreen');
    assert(
      rect.left >= 0 && rect.right <= VIEWPORT.width,
      'FOUND BUG (prefers-reduced-motion): detail window opens partially outside the viewport — the centering translate exists only in the disabled entrance animation, .detail-window{left:50%} has no fallback, so the close/min/max dots are unreachable',
      `left=${rect.left.toFixed(0)} right=${rect.right.toFixed(0)} viewport=${VIEWPORT.width}`
    );

    // genie minimize/restore uses the instant snap path
    await win.locator('.detail-dot.dot-min').click();
    await sleep(300);
    const min1 = await page.evaluate(() => ({
      minimized: document.querySelector('.detail-window')?.classList.contains('minimized'),
      icons: document.querySelectorAll('.detail-genie-icon').length,
    }));
    assert(min1.minimized === true && min1.icons === 1, 'genie minimize broken under reduced motion', JSON.stringify(min1));
    await page.locator('.detail-genie-icon').first().click();
    await sleep(300);
    const min2 = await page.evaluate(() => {
      const w = document.querySelector('.detail-window');
      return { restored: w && !w.classList.contains('minimized') && w.getBoundingClientRect().width > 200, icons: document.querySelectorAll('.detail-genie-icon').length };
    });
    assert(min2.restored === true, 'genie restore broken under reduced motion', JSON.stringify(min2));
    await env.shot('reduced-motion-modal');
    await win.locator('.detail-dot.dot-close').click();
    await sleep(200);

    return {
      wordmarkHeight: visible.wordmarkHeight,
      cardCount: visible.cardCount,
      firstCardOpacity: visible.firstCardOpacity,
      modalOpened: true,
      coverLoaded: modal.coverLoaded,
      genieInstantPath: true,
    };
  } finally {
    env.page = mainPage;
    await ctx.close();
  }
}
