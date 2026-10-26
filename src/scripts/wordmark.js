/* ============================================================
   Wordmark easter egg — click any letter of the hero name and
   it performs its own little move. Footer copy stays static.
   ============================================================ */
(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const svg = document.querySelector('h1.name svg.name-wordmark');
  if (!svg) return;

  const ORIGIN = {"wm-I1":"50% 50%","wm-I2":"50% 50%","wm-S1":"50% 50%","wm-S2":"50% 50%","wm-S3":"50% 50%","wm-A1":"50% 4%","wm-A2":"50% 4%","wm-B":"50% 50%","wm-E":"50% 100%","wm-L":"0% 100%","wm-R":"50% 100%"};;
  const SPRING = 'cubic-bezier(.34,1.56,.64,1)';

  // helper: alternate frames from a list of transform states
  const alt = (states, first, last) => {
    const f = states.map(t => ({ transform: t }));
    if (first) f[0] = { transform: first, offset: 0 };
    if (last)  f.push({ transform: last, offset: 1 });
    return f;
  };

  const MOVES = {
    'wm-O': { frames: [
      { transform: 'translateY(0px) rotate(0deg) scale(1,1)' },
      { transform: 'translateY(-4.6px) rotate(360deg) scale(1,1)', offset: .45 },
      { transform: 'translateY(0.4px) rotate(720deg) scale(1.18,.78)', offset: .8 },
      { transform: 'translateY(0px) rotate(720deg) scale(1,1)' }], dur: 1200, easing: 'cubic-bezier(.3,.6,.4,1)' },
    'wm-I1': {frames: [{"transform":"none","offset":0},{"transform":"none","offset":1}], dur: 1100, easing: 'linear', type: 'zigzagScroll'},
    'wm-I2': {frames: [{"transform":"none","offset":0},{"transform":"none","offset":1}], dur: 1100, easing: 'linear', type: 'zigzagScroll'},
    'wm-S1': {frames: [{"transform":"translateY(0px) rotate(0deg) scale(1, 1)","offset":0.0},{"transform":"rotate(100deg) scale(0.82) translateY(-2.2px)","offset":0.22},{"transform":"rotate(210deg) scale(0.72) translateY(-3.2px)","offset":0.45},{"transform":"rotate(320deg) scale(0.82) translateY(-1.6px)","offset":0.68},{"transform":"rotate(360deg) scale(0.98) translateY(0px)","offset":0.88},{"transform":"translateY(0px) rotate(0deg) scale(1, 1)","offset":1.0}], dur: 900, easing: 'cubic-bezier(.34,1.56,.64,1)'},
    'wm-S2': {frames: [{"transform":"translateY(0px) rotate(0deg) scale(1, 1)","offset":0.0},{"transform":"rotate(100deg) scale(0.82) translateY(-2.2px)","offset":0.22},{"transform":"rotate(210deg) scale(0.72) translateY(-3.2px)","offset":0.45},{"transform":"rotate(320deg) scale(0.82) translateY(-1.6px)","offset":0.68},{"transform":"rotate(360deg) scale(0.98) translateY(0px)","offset":0.88},{"transform":"translateY(0px) rotate(0deg) scale(1, 1)","offset":1.0}], dur: 900, easing: 'cubic-bezier(.34,1.56,.64,1)'},
    'wm-S3': {frames: [{"transform":"translateY(0px) rotate(0deg) scale(1, 1)","offset":0.0},{"transform":"rotate(100deg) scale(0.82) translateY(-2.2px)","offset":0.22},{"transform":"rotate(210deg) scale(0.72) translateY(-3.2px)","offset":0.45},{"transform":"rotate(320deg) scale(0.82) translateY(-1.6px)","offset":0.68},{"transform":"rotate(360deg) scale(0.98) translateY(0px)","offset":0.88},{"transform":"translateY(0px) rotate(0deg) scale(1, 1)","offset":1.0}], dur: 900, easing: 'cubic-bezier(.34,1.56,.64,1)'},
    'wm-A1': {frames: [{"transform":"rotate(0deg)","offset":0},{"transform":"rotate(380deg)","offset":0.28},{"transform":"rotate(345deg)","offset":0.36},{"transform":"rotate(700deg)","offset":0.8},{"transform":"rotate(725deg)","offset":0.9},{"transform":"rotate(720deg)","offset":1}], dur: 1400, easing: 'ease-in-out'},
    'wm-A2': {frames: [{"transform":"rotate(0deg)","offset":0},{"transform":"rotate(380deg)","offset":0.28},{"transform":"rotate(345deg)","offset":0.36},{"transform":"rotate(700deg)","offset":0.8},{"transform":"rotate(725deg)","offset":0.9},{"transform":"rotate(720deg)","offset":1}], dur: 1400, easing: 'ease-in-out'},
    'wm-B': {frames: [{"transform":"scale(1, 1)","offset":0},{"transform":"scale(1.32, 0.70)","offset":0.1},{"transform":"scale(0.78, 1.30)","offset":0.24},{"transform":"scale(1.22, 0.80)","offset":0.38},{"transform":"scale(0.86, 1.16)","offset":0.52},{"transform":"scale(1.12, 0.90)","offset":0.66},{"transform":"scale(0.95, 1.06)","offset":0.8},{"transform":"scale(1.02, 0.98)","offset":0.9},{"transform":"scale(1, 1)","offset":1}], dur: 950, easing: 'ease-in-out'},
    'wm-E': {frames: [{"transform":"none","offset":0},{"transform":"translateY(-1px) rotate(4deg)","offset":0.12},{"transform":"translateY(-3px) rotate(8deg) skewX(-6deg)","filter":"drop-shadow(2px 3px 1px rgba(255,105,180,0.5))","offset":0.3},{"transform":"translateY(-4.2px) rotate(6deg)","filter":"drop-shadow(3px 4px 2px rgba(255,105,180,0.6))","offset":0.45},{"transform":"translateY(-2.6px) rotate(-3deg)","filter":"drop-shadow(1px 2px 1px rgba(255,105,180,0.4))","offset":0.6},{"transform":"translateY(-0.9px) rotate(-5deg) skewX(4deg)","filter":"drop-shadow(0px 1px 0px rgba(255,105,180,0.25))","offset":0.8},{"transform":"translateY(-0.2px) rotate(-1deg)","offset":0.92},{"transform":"none","offset":1}], dur: 1300, easing: 'ease-in-out'},
    'wm-L': {frames: [{"transform":"none","offset":0},{"transform":"rotate(5deg)","filter":"blur(0.3px) brightness(0.97)","offset":0.22},{"transform":"rotate(8deg) translateY(0.3px)","filter":"blur(0.6px) brightness(0.94)","offset":0.42},{"transform":"rotate(10deg) translateY(0.4px)","filter":"blur(0.9px) brightness(0.92)","offset":0.55},{"transform":"rotate(-3deg) translateY(0px)","filter":"blur(0px) brightness(1.15)","offset":0.62},{"transform":"rotate(4deg)","filter":"brightness(1.05)","offset":0.7},{"transform":"rotate(-2deg)","filter":"brightness(1)","offset":0.78},{"transform":"rotate(1deg)","offset":0.87},{"transform":"none","offset":1}], dur: 1400, easing: 'cubic-bezier(0.45, 0, 0.55, 1)'},
    'wm-R': {alt: [{frames: [{"transform":"translate(0px, 0px) scale(1, 1) rotate(0deg)","offset":0.0},{"transform":"translate(0px, 0.5px) scale(1.06, 0.9) rotate(0deg)","offset":0.18},{"transform":"translate(0px, -6px) scale(0.95, 1.08) rotate(-4deg)","offset":0.42},{"transform":"translate(0px, -7px) scale(1.02, 1.02) rotate(3deg)","offset":0.58},{"transform":"translate(0px, 0.5px) scale(1.1, 0.88) rotate(0deg)","offset":0.8},{"transform":"translate(0px, 0px) scale(1, 1) rotate(0deg)","offset":1.0}], dur: 950, easing: 'cubic-bezier(.3,1.4,.45,1)'}, {frames: [{"transform":"none","opacity":1,"offset":0},{"transform":"translateY(0.5px)","offset":0.04},{"transform":"translateY(6.5px)","filter":"blur(0.6px)","offset":0.13},{"transform":"translateY(6.9px) scale(1.34, 0.60)","filter":"blur(0.1px)","offset":0.19},{"transform":"translateY(6.9px) scale(1.34, 0.60)","offset":0.27},{"transform":"translateY(4.2px) scale(0.92, 1.14) rotate(6deg)","offset":0.4},{"transform":"translateY(6.3px) scale(1.20, 0.78) rotate(-5deg)","offset":0.52},{"transform":"translateY(5.2px) rotate(3deg)","offset":0.62},{"transform":"translateY(5.8px) rotate(-2deg)","offset":0.72},{"transform":"translateY(2.6px)","filter":"brightness(1.15)","offset":0.86},{"transform":"translateY(0.5px) scale(1.02)","filter":"brightness(1.08)","offset":0.94},{"transform":"none","opacity":1,"filter":"none","offset":1}], dur: 1400, easing: 'cubic-bezier(0.3, 0, 0.4, 1)'}]}
  };

  function zigzagScroll(p) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = p.ownerSVGElement;
    const H = 9.52;
    let defs = svg.querySelector('defs');
    if (!defs) { defs = document.createElementNS(NS, 'defs'); svg.insertBefore(defs, svg.firstChild); }
    const cp = document.createElementNS(NS, 'clipPath');
    cp.id = 'wm-zz-' + Math.random().toString(36).slice(2, 8);
    const cpp = document.createElementNS(NS, 'path');
    cpp.setAttribute('d', p.getAttribute('d'));
    const ptf = p.getAttribute('transform'); if (ptf) cpp.setAttribute('transform', ptf);
    cp.appendChild(cpp); defs.appendChild(cp);
    const outer = document.createElementNS(NS, 'g');
    const inner = document.createElementNS(NS, 'g');
    inner.setAttribute('clip-path', 'url(#' + cp.id + ')');
    for (let k = -3; k <= 3; k++) {
      const c = document.createElementNS(NS, 'path');
      c.setAttribute('d', p.getAttribute('d'));
      const f = p.getAttribute('fill'); if (f) c.setAttribute('fill', f);
      c.style.transform = 'translateY(' + (k * H).toFixed(2) + 'px)';
      inner.appendChild(c);
    }
    outer.appendChild(inner); svg.appendChild(outer);
    const orig = p.style.opacity;
    p.style.opacity = '0';
    outer.animate([
      {transform: 'translateY(0px)'},
      {transform: 'translateY(-' + H.toFixed(2) + 'px)'}
    ], {duration: 1400, easing: 'linear'})
    .finished.then(() => { p.style.opacity = orig; outer.remove(); cp.remove(); })
    .catch(() => { p.style.opacity = orig; outer.remove(); cp.remove(); });
  }
  let rToggle = false;
svg.addEventListener('click', e => {
    const p = e.target.closest && e.target.closest('path[class^="wm-"]');
    if (!p) return;
    const cls = [...p.classList].find(c => c.startsWith('wm-'));
    let move = MOVES[cls];
    if (!move) return;
    if (move.alt) { rToggle = !rToggle; move = move.alt[rToggle ? 0 : 1]; }
    if (move.type === 'zigzagScroll') { zigzagScroll(p); return; }
    p.style.transformBox = 'fill-box';
    p.style.transformOrigin = move.origin || ORIGIN[cls] || '50% 50%';
    p.animate(move.frames, { duration: move.dur, easing: move.easing || 'ease-in-out' })
      .finished.catch(() => {});
  });
})();
