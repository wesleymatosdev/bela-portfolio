// Port of the inline filterWork() + keycap handlers from www/index.html.
// Deviation (documented in the PR): the current page calls filterWork() from
// inline onclick="" attributes; Astro bundles scripts as ES modules, whose
// scope inline attributes cannot see. Same behavior via data-filter +
// addEventListener.

function filterWork(cat, btn) {
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.querySelectorAll('.scatter-card').forEach(card => {
    card.style.display = (cat === 'all' || card.dataset.cat === cat) ? '' : 'none';
  });
}

document.querySelectorAll('.filter-tab').forEach(btn => {
  btn.addEventListener('click', () => filterWork(btn.dataset.filter, btn));
});

document.querySelectorAll('.keycap').forEach(k => {
  k.addEventListener('click', () => {
    k.style.transform = 'translateY(2px) scale(0.95)';
    setTimeout(() => { k.style.transform = ''; }, 150);
  });
});
