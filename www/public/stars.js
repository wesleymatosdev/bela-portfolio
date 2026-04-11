(function () {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2';
  document.body.prepend(canvas);

  const ctx = canvas.getContext('2d');

  // Ambient: persistent, wrap at bottom — always covers the full screen.
  // Sparks:  cursor-spawned, fade and die.
  const AMBIENT_COUNT = 120;
  let ambient = [];
  let sparks  = [];
  let width, height;
  let animFrameId = null;
  let colors = [];
  let tick = 0;

  // ---------------------------------------------------------------------------
  // Colors
  // ---------------------------------------------------------------------------
  function loadColors() {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue('--star-colors');
    colors = raw.split(',').map(s => s.trim()).filter(Boolean);
    if (!colors.length) colors = ['#FFB3C6', '#C3B1E1', '#B5EAD7'];
    // Recolor existing ambient particles so palette swaps take effect instantly.
    ambient.forEach(p => { p.color = colors[Math.floor(Math.random() * colors.length)]; });
  }

  // ---------------------------------------------------------------------------
  // Shapes
  // ---------------------------------------------------------------------------
  function drawCircle(size) {
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // 4-pointed star (✦)
  function drawStar(size) {
    const outer = size, inner = size * 0.38;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4 - Math.PI / 2;
      const r = i % 2 === 0 ? outer : inner;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }

  const SHAPES = [drawCircle, drawStar];

  // ---------------------------------------------------------------------------
  // Ambient particle factory
  // ---------------------------------------------------------------------------
  function makeAmbient(startY) {
    return {
      x:            Math.random() * width,
      y:            startY ?? Math.random() * height,  // full-screen on init
      vx:           (Math.random() - 0.5) * 0.7,
      vy:           Math.random() * 0.5 + 0.3,         // 0.3–0.8 px/frame (slow)
      color:        colors[Math.floor(Math.random() * colors.length)],
      size:         Math.random() * 4 + 3,
      draw:         SHAPES[Math.floor(Math.random() * SHAPES.length)],
      rotation:     Math.random() * Math.PI * 2,
      rotSpeed:     (Math.random() - 0.5) * 0.07,
      twinkleSpeed: Math.random() * 0.018 + 0.004,
      twinklePhase: Math.random() * Math.PI * 2,
    };
  }

  // ---------------------------------------------------------------------------
  // Cursor spark factory
  // ---------------------------------------------------------------------------
  function spawnSpark(x, y) {
    sparks.push({
      x:        x + (Math.random() - 0.5) * 10,
      y:        y + (Math.random() - 0.5) * 10,
      vx:       (Math.random() - 0.5) * 2.5,
      vy:       Math.random() * 1.5 + 0.8,
      color:    colors[Math.floor(Math.random() * colors.length)],
      size:     Math.random() * 3 + 2,
      life:     0,
      maxLife:  Math.floor(Math.random() * 40 + 40),
      draw:     SHAPES[Math.floor(Math.random() * SHAPES.length)],
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.15,
    });
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------
  window.addEventListener('mousemove', (e) => {
    const count = Math.floor(Math.random() * 2) + 2;
    for (let i = 0; i < count; i++) spawnSpark(e.clientX, e.clientY);
  });

  window.addEventListener('touchmove', (e) => {
    spawnSpark(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });

  // ---------------------------------------------------------------------------
  // Resize / init
  // ---------------------------------------------------------------------------
  function resize() {
    width  = canvas.width  = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }

  function init() {
    // Distribute ambient particles across the full viewport on load.
    ambient = Array.from({ length: AMBIENT_COUNT }, () => makeAmbient());
  }

  window.addEventListener('resize', resize);

  // ---------------------------------------------------------------------------
  // Draw loop
  // ---------------------------------------------------------------------------
  function draw() {
    ctx.clearRect(0, 0, width, height);
    tick++;

    // Ambient — wrap at bottom, never removed from pool
    for (const p of ambient) {
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.rotSpeed;

      if (p.y > height + p.size + 5) {
        // Respawn at top with a fresh color
        p.y     = -p.size - 5;
        p.x     = Math.random() * width;
        p.color = colors[Math.floor(Math.random() * colors.length)];
      }
      // Soft side-wrap
      if      (p.x < -p.size)          p.x = width  + p.size;
      else if (p.x > width  + p.size)  p.x = -p.size;

      const twinkle = 0.6 + Math.sin(tick * p.twinkleSpeed + p.twinklePhase) * 0.4;

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, twinkle));
      ctx.fillStyle   = p.color;
      ctx.shadowBlur  = 10;
      ctx.shadowColor = p.color;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      p.draw(p.size);
      ctx.restore();
    }

    // Cursor sparks — fade and die
    if (sparks.length > 200) sparks.splice(0, sparks.length - 200);

    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life++;
      p.rotation += p.rotSpeed;

      if (p.life >= p.maxLife || p.y > height + 20) {
        sparks.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - p.life / p.maxLife);
      ctx.fillStyle   = p.color;
      ctx.shadowBlur  = 12;
      ctx.shadowColor = p.color;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      p.draw(p.size);
      ctx.restore();
    }

    animFrameId = requestAnimationFrame(draw);
  }

  function start() { if (!animFrameId) animFrameId = requestAnimationFrame(draw); }
  function stop()  { if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; } }

  document.addEventListener('visibilitychange', () => { document.hidden ? stop() : start(); });
  document.addEventListener('palettechange', loadColors);

  loadColors();
  resize();
  init();
  start();
})();
