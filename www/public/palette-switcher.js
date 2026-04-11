/**
 * palette-switcher.js
 *
 * Self-contained palette switcher. Owns all palette definitions and applies
 * them by setting CSS custom properties on :root.
 *
 * To remove: delete this file and the <script> tag in index.html.
 * No other files need to change — styles.css keeps Variant A as the default.
 *
 * stars.js picks up color changes via the 'palettechange' custom event.
 */
(function () {
  // ---------------------------------------------------------------------------
  // Palette definitions — single source of truth
  // ---------------------------------------------------------------------------
  const PALETTES = [
    {
      name: 'Pastel Rainbow',
      swatch: '#C3B1E1',
      vars: {
        '--bg-from':     '#1a1030',
        '--bg-to':       '#0d1a2e',
        '--text':        'rgb(255, 240, 250)',
        '--text-dim':    'rgba(255, 220, 240, 0.65)',
        '--text-shadow': 'rgb(210, 140, 210)',
        '--glow-1':      '#ffb3c6',
        '--glow-2':      '#c3b1e1',
        '--icon-glow':   'rgba(195, 177, 225, 0.8)',
        '--star-colors': '#FFB3C6, #C3B1E1, #B5EAD7, #FFDAC1, #C7CEEA',
      },
    },
    {
      name: 'Warm & Rosy',
      swatch: '#FF9EBC',
      vars: {
        '--bg-from':     '#2e1020',
        '--bg-to':       '#1a0a14',
        '--text':        'rgb(255, 235, 235)',
        '--text-dim':    'rgba(255, 210, 210, 0.65)',
        '--text-shadow': 'rgb(200, 100, 120)',
        '--glow-1':      '#FF9EBC',
        '--glow-2':      '#FFD700',
        '--icon-glow':   'rgba(255, 158, 188, 0.8)',
        '--star-colors': '#FF9EBC, #FFD700, #FFC0CB, #FFE4E1, #FFAAC5',
      },
    },
    {
      name: 'Vibrant Pop',
      swatch: '#00F5D4',
      vars: {
        '--bg-from':     '#050a1e',
        '--bg-to':       '#0d0520',
        '--text':        '#ffffff',
        '--text-dim':    'rgba(255, 255, 255, 0.65)',
        '--text-shadow': 'rgb(130, 60, 200)',
        '--glow-1':      '#FF6B9D',
        '--glow-2':      '#00F5D4',
        '--icon-glow':   'rgba(0, 245, 212, 0.8)',
        '--star-colors': '#FF6B9D, #00F5D4, #FFE66D, #845EC2, #FF9671',
      },
    },
  ];

  let current = 0;

  // ---------------------------------------------------------------------------
  // Apply palette
  // ---------------------------------------------------------------------------
  function apply(index) {
    current = index;
    const root = document.documentElement;
    for (const [prop, value] of Object.entries(PALETTES[index].vars)) {
      root.style.setProperty(prop, value);
    }
    document.dispatchEvent(new CustomEvent('palettechange'));
    updateUI();
  }

  // ---------------------------------------------------------------------------
  // Build UI
  // ---------------------------------------------------------------------------
  const panel = document.createElement('div');
  panel.setAttribute('aria-label', 'Palette switcher');
  panel.style.cssText = [
    'position:fixed',
    'bottom:18px',
    'right:18px',
    'z-index:100',
    'display:flex',
    'align-items:center',
    'gap:8px',
    'background:rgba(0,0,0,0.35)',
    'backdrop-filter:blur(8px)',
    '-webkit-backdrop-filter:blur(8px)',
    'border:1px solid rgba(255,255,255,0.12)',
    'border-radius:999px',
    'padding:7px 12px',
    'cursor:default',
    'user-select:none',
  ].join(';');

  const swatches = PALETTES.map((palette, i) => {
    const btn = document.createElement('button');
    btn.setAttribute('aria-label', palette.name);
    btn.title = palette.name;
    btn.style.cssText = [
      'width:14px',
      'height:14px',
      'border-radius:50%',
      `background:${palette.swatch}`,
      'border:2px solid transparent',
      'cursor:pointer',
      'padding:0',
      'transition:transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',
    ].join(';');
    btn.addEventListener('click', () => apply(i));
    btn.addEventListener('mouseenter', () => {
      if (i !== current) btn.style.transform = 'scale(1.2)';
    });
    btn.addEventListener('mouseleave', () => {
      if (i !== current) btn.style.transform = 'scale(1)';
    });
    panel.appendChild(btn);
    return btn;
  });

  function updateUI() {
    swatches.forEach((btn, i) => {
      if (i === current) {
        btn.style.borderColor = 'rgba(255,255,255,0.85)';
        btn.style.transform   = 'scale(1.25)';
        btn.style.boxShadow   = `0 0 6px ${PALETTES[i].swatch}`;
      } else {
        btn.style.borderColor = 'transparent';
        btn.style.transform   = 'scale(1)';
        btn.style.boxShadow   = 'none';
      }
    });
  }

  updateUI();
  document.body.appendChild(panel);
})();
