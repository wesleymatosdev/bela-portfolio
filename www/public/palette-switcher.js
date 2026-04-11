(function () {
  const vars = {
    '--bg-from':     '#050a1e',
    '--bg-to':       '#0d0520',
    '--text':        '#ffffff',
    '--text-dim':    'rgba(255, 255, 255, 0.65)',
    '--text-shadow': 'rgb(130, 60, 200)',
    '--glow-1':      '#FF6B9D',
    '--glow-2':      '#00F5D4',
    '--icon-glow':   'rgba(0, 245, 212, 0.8)',
    '--star-colors': '#FF6B9D, #00F5D4, #FFE66D, #845EC2, #FF9671',
  };

  const root = document.documentElement;
  for (const [prop, value] of Object.entries(vars)) {
    root.style.setProperty(prop, value);
  }
  document.dispatchEvent(new CustomEvent('palettechange'));
})();
