// F3: post-it About — click to unfold/fold
(function () {
  const postit = document.getElementById('aboutPostit');
  if (!postit) return;
  function togglePostit() {
    if (postit.classList.contains('open')) {
      postit.classList.remove('open');
      postit.classList.add('closing');
      postit.setAttribute('aria-expanded', 'false');
      postit.addEventListener('animationend', function onEnd(e) {
        if (e.animationName !== 'postit-fold') return;
        postit.classList.remove('closing');
        postit.removeEventListener('animationend', onEnd);
      });
    } else {
      postit.classList.remove('closing');
      postit.classList.add('open');
      postit.setAttribute('aria-expanded', 'true');
    }
  }
  postit.addEventListener('click', togglePostit);
  postit.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePostit(); }
  });
})();
