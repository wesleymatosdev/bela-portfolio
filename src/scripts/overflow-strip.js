// Round 16: sticky OVERFLOW join. Scroll progress (0..1 over the first ~90vh)
// flies the OVER and FLOW keycap groups toward each other and up to a fixed
// top-centered target; at progress 1 they dock into .overflow-strip as one row
// reading "OVERFLOW", which then follows the viewport for the rest of the page.
// Scroll back up = undock + fly back to their hero corners.
// prefers-reduced-motion: groups stay in their base hero positions.
(function () {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const over = document.querySelector('.keycap-group.over');
  const flow = document.querySelector('.keycap-group.flow');
  const strip = document.getElementById('overflowStrip');
  if (!over || !flow || !strip || reduce) return;

  let docked = false;
  let baseO = null, baseF = null;   // untransformed hero rects (document coords)

  // remember where each group belongs in the hero so undock restores exactly
  const overNext = over.nextSibling;
  const flowParent = flow.parentNode;

  // the drop-in entrance animation has fill:both — its final transform would
  // override our inline flight transforms. Clear it once it has run (or on the
  // first scroll) and cache the natural positions from that clean state.
  let entranceCleared = false;
  function clearEntrance() {
    if (entranceCleared) return;
    entranceCleared = true;
    over.style.animation = 'none';
    flow.style.animation = 'none';
    const tO = over.style.transform, tF = flow.style.transform;
    over.style.transform = 'none'; flow.style.transform = 'none';
    baseO = over.getBoundingClientRect();
    baseF = flow.getBoundingClientRect();
    over.style.transform = tO; flow.style.transform = tF;
  }

  // viewport target: where the docked strip sits (top-centered)
  function targets() {
    const rowWidth = baseO.width + 5 + baseF.width;
    const left = Math.max(8, (window.innerWidth - rowWidth) / 2);
    return {
      o: { left, top: 12 },
      f: { left: left + baseO.width + 5, top: 12 }
    };
  }

  function dock() {
    if (docked) return;
    docked = true;
    over.style.transform = '';
    flow.style.transform = '';
    strip.appendChild(over);
    strip.appendChild(flow);
  }

  function undock() {
    if (!docked) return;
    docked = false;
    overNext.parentNode.insertBefore(over, overNext);
    flowParent.appendChild(flow);
    over.style.transform = '';
    flow.style.transform = '';
  }

  function apply() {
    const range = Math.max(1, window.innerHeight * 0.9);
    const p = Math.min(1, Math.max(0, window.scrollY / range));

    if (p >= 1) { dock(); return; }
    undock();
    if (p <= 0 || !baseO) { over.style.transform = ''; flow.style.transform = ''; return; }

    // Round 17 (feedback): NO diagonal flight. Two sequential phases driven by
    // scroll progress — phase A (0..0.5): each group moves VERTICALLY only,
    // sticking to the top edge (y target = strip top) while keeping its x.
    // phase B (0.5..1): both groups slide HORIZONTALLY (slowly — linear-ish
    // ease) to their joined center positions. Scroll up reverses the same path.
    const t = targets();
    // natural viewport position = document position - scrollY (x is scroll-invariant)
    const oNatTop = baseO.top - window.scrollY;
    const fNatTop = baseF.top - window.scrollY;
    // vertical targets: top strip; horizontal targets: joined center row
    const oTy = t.o.top, fTy = t.f.top;
    const oTx = t.o.left, fTx = t.f.left;

    let ox, oy, fx, fy, rotE;
    if (p <= 0.5) {
      // phase A: vertical only, x frozen at base; rotation settles
      const a = p / 0.5;                       // 0..1 within phase A
      const ae = 1 - Math.pow(1 - a, 3);       // easeOutCubic
      ox = 0; fx = 0;
      oy = (oTy - oNatTop) * ae;
      fy = (fTy - fNatTop) * ae;
      rotE = ae;
    } else {
      // phase B: y pinned at strip top; x slides to center slowly (linear-ish)
      const b = (p - 0.5) / 0.5;               // 0..1 within phase B
      const be = b * b * (3 - 2 * b);          // smoothstep — gentle, slow feel
      oy = oTy - oNatTop;                      // full vertical offset
      fy = fTy - fNatTop;
      ox = (oTx - baseO.left) * be;
      fx = (fTx - baseF.left) * be;
      rotE = 1;
    }
    over.style.transform =
      'translate(' + ox.toFixed(1) + 'px,' + oy.toFixed(1) + 'px)' +
      ' rotate(' + (-4 * (1 - rotE)).toFixed(2) + 'deg)';
    flow.style.transform =
      'translate(' + fx.toFixed(1) + 'px,' + fy.toFixed(1) + 'px)' +
      ' rotate(' + (3 * (1 - rotE)).toFixed(2) + 'deg)';
  }

  function onScroll() {
    clearEntrance();
    // scroll events are already coalesced to once per frame by the browser —
    // apply synchronously (identical behavior, no rAF dependency)
    apply();
  }

  setTimeout(clearEntrance, 1400); // entrance done by then; safe fallback
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => { if (entranceCleared) { const d = docked; undock(); clearEntrance(); baseO = baseF = null; clearEntrance(); docked = d; if (d) dock(); apply(); } });
  apply();
})();
