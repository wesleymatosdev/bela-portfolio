// F6 → round 15 [I1]: mouse-reactive floating doodles across the WHOLE page —
// gentle magnetic repel via individual translate/rotate props (composes with
// the float keyframe transform). Document-level mousemove (the field layer is
// pointer-events:none, so reactivity must come from the document), rAF + lerp,
// transform-only, no layout reads in the loop.
// Round 15 [I2]: scroll parallax — each doodle carries a --doodle-depth factor
// (0..1); it translates at that rate of scrollY so doodles drift behind the
// scrolling content. Same rAF loop, same translate property (mouse offset +
// parallax offset are summed), passive scroll listener, no layout thrash.
// prefers-reduced-motion: no listeners at all, doodles stay at static placement.
(function () {
  const ReducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const items = [...document.querySelectorAll('.doodle-field .doodle, .doodle-field .sparkle')];
  if (!items.length || ReducedMotionQuery.matches) return;
  // Base transforms must survive our individual-property writes: rotate() in
  // the transform of .doodle-pencil would be overwritten by nothing, but
  // translate/rotate props ADD to transform, so base transforms are safe.
  const state = items.map(el => ({ el, tx: 0, ty: 0, r: 0, gx: 0, gy: 0, gr: 0, rect: null, depth: 0 }));
  let rafId = null, mouseX = -1e4, mouseY = -1e4, pointerInside = false;
  let scrollY = window.scrollY, scrollDirty = true, maxScroll = 1;
  // rects are viewport coords — any scroll/resize invalidates them. Re-measure
  // in the next rAF tick (not in the event) so cached positions always match
  // where doodles actually are; before this fix the cache was taken once and
  // hovering icons after scrolling silently targeted stale positions.
  let rectsDirty = true;
  const INFLUENCE = 150;   // px radius where repel kicks in
  const STRENGTH = 34;     // max repel distance in px
  const TILT = 10;         // max extra rotation in deg
  const PARALLAX_RANGE = 160; // max px a doodle can lag behind content
  function measure() {
    // cache each doodle's parallax depth once per measurement pass (style read,
    // not layout) — cheap and only on demand
    state.forEach(s => {
      s.rect = s.el.getBoundingClientRect();
      if (!s.depth) {
        const d = parseFloat(getComputedStyle(s.el).getPropertyValue('--doodle-depth'));
        s.depth = Number.isFinite(d) ? d : 0.75;
      }
    });
  }
  function onScroll() {
    // transform-only handling: stash the value, apply it in the rAF tick;
    // scrollHeight read happens at most once per scroll event, in the handler
    scrollY = window.scrollY;
    maxScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
    scrollDirty = true;
    rectsDirty = true;
    if (rafId === null) { rafId = requestAnimationFrame(tick); }
  }
  function onMove(e) {
    mouseX = e.clientX; mouseY = e.clientY;
    pointerInside = true;
    if (rafId === null) { measure(); rafId = requestAnimationFrame(tick); }
  }
  function onLeave() {
    pointerInside = false;
    // targets fall back to 0 -> spring back handled by lerp in tick
  }
  function tick() {
    if (rectsDirty) { measure(); rectsDirty = false; }
    for (const s of state) {
      if (pointerInside && s.rect) {
        const cx = s.rect.left + s.rect.width / 2;
        const cy = s.rect.top + s.rect.height / 2;
        const dx = cx - mouseX, dy = cy - mouseY;
        const dist = Math.hypot(dx, dy);
        if (dist < INFLUENCE && dist > 0.001) {
          const push = (1 - dist / INFLUENCE);
          s.gx = (dx / dist) * push * STRENGTH;
          s.gy = (dy / dist) * push * STRENGTH;
          s.gr = (dx / dist) * push * TILT;
        } else { s.gx = 0; s.gy = 0; s.gr = 0; }
      } else { s.gx = 0; s.gy = 0; s.gr = 0; }
      // lerp toward goal for smooth spring-back
      s.tx += (s.gx - s.tx) * 0.12;
      s.ty += (s.gy - s.ty) * 0.12;
      s.r  += (s.gr - s.r) * 0.12;
      // [I2] parallax offset: negative = doodle moves UP slower than the page
      // scrolls, so it lags behind (appears deeper). Direct assignment, no
      // lerp — scroll should track the scrollbar 1:1 in rate.
      const py = -scrollY * s.depth * (PARALLAX_RANGE / maxScroll);
      const px = 0;
      // flicker fix (round 17): the old clear-branch wiped translate when the
      // repel spring decayed — erasing the standing parallax offset, so doodles
      // snapped back and jumped on the next scroll tick. Keep writing whenever
      // the parallax offset itself is non-zero; only clear when truly at rest.
      const active = Math.abs(s.tx) > 0.05 || Math.abs(s.ty) > 0.05 || Math.abs(s.r) > 0.05;
      if (active || scrollDirty || Math.abs(py) > 0.1) {
        s.el.style.translate = (s.tx + px).toFixed(2) + 'px ' + (s.ty + py).toFixed(2) + 'px';
        s.el.style.rotate = s.r.toFixed(2) + 'deg';
      } else if (s.el.style.translate) {
        s.el.style.translate = ''; s.el.style.rotate = '';
      }
    }
    scrollDirty = false;
    if (pointerInside || state.some(s => Math.abs(s.tx) > 0.05 || Math.abs(s.ty) > 0.05 || Math.abs(s.r) > 0.05)) {
      rafId = requestAnimationFrame(tick);
    } else { rafId = null; }
  }
  document.addEventListener('mousemove', onMove, { passive: true });
  document.addEventListener('mouseleave', onLeave, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => {
    if (rafId === null) { measure(); rectsDirty = false; } else { rectsDirty = true; }
  }, { passive: true });
  ReducedMotionQuery.addEventListener('change', (e) => {
    if (e.matches) {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('scroll', onScroll);
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      state.forEach(s => { s.el.style.translate = ''; s.el.style.rotate = ''; });
    }
  });
})();
