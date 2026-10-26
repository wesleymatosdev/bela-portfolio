// F9: draggable unstacked detail windows over the live page.
// One window per project; multiple opens genuinely stack; drag by title bar;
// page behind stays scrollable (no overlay, no body overflow lock).
(function () {
  const template = document.getElementById('detailTemplate');
  if (!template) return;
  const CAT_LABEL = { brand: 'Branding', social: 'Social', print: 'Print', ui: 'UI/UX' };
  const openWindows = new Map(); // projectTitle -> window element
  // R16.1: per-project minimized state, keyed by project id. Every minimize
  // APPENDS an entry (and a new dock icon); restore/close/maximize deletes
  // exactly its own entry. Nothing here is a singleton — three minimized
  // projects are three independent entries that coexist.
  const minimizedState = new Map(); // projectId -> { win, icon }
  const GENIE_SLOT_W = 62; // ~60px horizontal offset between icons
  let topZ = 60;
  let shiftCount = 0;

  function bringToFront(win) {
    topZ += 1;
    win.style.zIndex = topZ;
  }

  function openWindow(card) {
    const thumb = card.querySelector('.scatter-thumb');
    const title = card.querySelector('.scatter-body h3');
    const year = card.querySelector('.scatter-year');
    const cat = card.querySelector('.scatter-cat');
    const projectTitle = title ? title.textContent : 'Project';

    // one window per project: re-open focuses the existing one
    if (openWindows.has(projectTitle)) {
      const existing = openWindows.get(projectTitle);
      bringToFront(existing);
      return;
    }

    const win = template.content.firstElementChild.cloneNode(true);
    win.querySelector('.detail-title').textContent = projectTitle;
    win.querySelector('.detail-thumb').textContent = thumb ? thumb.textContent.trim() : '';
    // project gallery: cover = first image, order = CMS order
    const gallery = win.querySelector('.detail-gallery');
    const MEDIA_URL = 'assets/media/';
    try {
      const imgs = JSON.parse(card.dataset.images || '[]');
      if (imgs.length) {
        gallery.hidden = false;
        win.querySelector('.detail-thumb').hidden = true;
        win.classList.add('has-gallery');
        const coverImg = gallery.querySelector('.detail-cover img');
        const strip = gallery.querySelector('.detail-thumbs');
        const show = (src) => { coverImg.src = MEDIA_URL + src; coverImg.alt = projectTitle; };
        show(imgs[0]);
        imgs.forEach((src, idx) => {
          const b = document.createElement('button');
          b.type = 'button';
          if (idx === 0) b.classList.add('sel');
          b.setAttribute('aria-label', 'Show image ' + (idx + 1));
          const im = document.createElement('img');
          im.src = MEDIA_URL + src; im.alt = '';
          b.appendChild(im);
          b.addEventListener('click', () => {
            show(src);
            strip.querySelectorAll('button').forEach(x => x.classList.remove('sel'));
            b.classList.add('sel');
          });
          strip.appendChild(b);
        });
      }
    } catch (e) { /* malformed data-images: keep the initials thumb */ }
    // G1: keep the window body white for ALL cards — never copy the card's
    // thumb color here (getComputedStyle bleed); theme color lives only in
    // the category chip accent.
    win.querySelector('.detail-thumb').style.background = '#fff';
    win.querySelector('.detail-year').textContent = year ? year.textContent.trim() : '—';
    win.querySelector('.detail-chip.cat').textContent = cat ? cat.textContent.trim() : (card.dataset.cat && CAT_LABEL[card.dataset.cat]) || '—';
    // G2: detail content is title + year + category only — no description paragraph.

    // second/third window opens slightly offset so the stack reads
    if (shiftCount > 0) win.classList.add('shift-' + Math.min(shiftCount, 2));
    shiftCount++;
    document.body.appendChild(win);
    openWindows.set(projectTitle, win);
    bringToFront(win);

    const close = () => {
      win.remove();
      openWindows.delete(projectTitle);
      shiftCount = Math.max(0, shiftCount - 1);
      removeGenieIcon(); // H2: no orphaned genie icon when a minimized window closes
    };
    win.querySelector('.detail-pill').addEventListener('click', close);
    // bring to front on any interaction with a background window
    win.addEventListener('pointerdown', () => bringToFront(win));

    // R11: functional window dots — minimize / maximize / close (left to right).
    const dotMin = win.querySelector('.detail-dot.dot-min');
    const dotMax = win.querySelector('.detail-dot.dot-max');
    const dotClose = win.querySelector('.detail-dot.dot-close');

    // H2: mac-style genie minimize. The window scales+skews+translates toward
    // the bottom-right screen corner over ~400ms (WAAPI), ends as a small
    // square icon; clicking the icon runs the reverse animation and pops the
    // window back exactly where it was. Close/maximize behavior unchanged.
    const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');
    let genieRect = null;   // window's rect before minimizing — restore target
    let genieAnimating = false;

    const genieTo = (restore) => {
      const reduce = REDUCED.matches;
      const r = win.getBoundingClientRect();
      if (!restore) {
        // register FIRST: slot = position in this map, assigned at click time
        minimizedState.set(projectTitle, { win });
        genieRect = { left: r.left + 'px', top: r.top + 'px' };
      }
      // freeze the visual position so the animation starts from where it is
      win.style.left = genieRect.left;
      win.style.top = genieRect.top;
      win.style.transform = 'none';
      win.classList.add('positioned');
      win.classList.remove('maximized'); // genie always comes back to its own size

      if (reduce) {
        // prefers-reduced-motion: instant snap, no animation at all
        win.classList.toggle('minimized', !restore);
        if (!restore) spawnGenieIcon(true);
        else removeGenieIcon();
        return;
      }
      if (genieAnimating) return;
      genieAnimating = true;

      // window center -> bottom-right screen corner target
      const startX = r.left, startY = r.top;
      const w = r.width, h = r.height;
      const targetSize = 44;
      const targetX = window.innerWidth - targetSize - 22;
      const targetY = window.innerHeight - targetSize - 22;
      const tx = targetX - startX;
      const ty = targetY - startY;
      const sx = targetSize / w, sy = targetSize / h;
      // squash toward the direction of travel as it accelerates (genie feel)
      const skewMid = 14 * Math.sign(tx || 1);

      const anim = win.animate([
        { transform: 'translate(0px, 0px) scale(1, 1) skewX(0deg)', opacity: 1, offset: 0 },
        { transform: `translate(${tx * 0.45}px, ${ty * 0.35}px) scale(${1 - (1 - sx) * 0.45}, ${1 + (sy - 1) * 0.2}) skewX(${skewMid}deg)`, opacity: 0.9, offset: 0.55 },
        { transform: `translate(${tx}px, ${ty}px) scale(${sx}, ${sy}) skewX(0deg)`, opacity: 0.25, offset: 1 }
      ], {
        duration: 400,
        easing: 'cubic-bezier(0.4, 0, 0.6, 1)',
        fill: 'forwards',
        direction: restore ? 'reverse' : 'normal'
      });
      // idempotent end-state, reachable from onfinish OR the watchdog below —
      // finish events can be delayed/withheld on throttled or heavily
      // painted pages, and a wedged genieAnimating flag would strand the
      // window in mid-flight forever.
      let done = false;
      const completeGenie = () => {
        if (done) return;
        done = true;
        genieAnimating = false;
        if (!restore) {
          win.classList.add('minimized'); // pointer-events: none + opacity 0
          spawnGenieIcon(false);
        } else {
          // hand the size back to normal layout, position stays committed
          win.style.transform = '';
          win.style.maxHeight = '';
          dotMin.setAttribute('aria-label', 'Minimize window');
          dotMin.title = 'Minimize';
        }
        anim.cancel(); // drop the forwards fill; class/inline styles hold state
      };
      anim.onfinish = completeGenie;
      setTimeout(completeGenie, 500); // watchdog: 400ms anim + slack
    };

    let genieIcon = null;
    // R16.1: slot = this project's index inside minimizedState (Map keeps
    // insertion order), so two minimizes can never compute the same slot
    // even when the second animation finishes before the first window gets
    // its .minimized class.
    const slotIndex = () => [...minimizedState.keys()].indexOf(projectTitle);
    const spawnGenieIcon = (instant) => {
      // one icon per project, ever: keyed by data-project-id
      genieIcon = document.querySelector('.detail-genie-icon[data-project-id="' + CSS.escape(projectTitle) + '"]');
      if (genieIcon) return;
      genieIcon = document.createElement('button');
      genieIcon.type = 'button';
      genieIcon.className = 'detail-genie-icon';
      genieIcon.dataset.projectId = projectTitle;
      genieIcon.setAttribute('aria-label', 'Restore window: ' + projectTitle);
      genieIcon.title = 'Restore: ' + projectTitle;
      // desktop-shortcut look: thumb color + initials on the tile, title label under
      const initials = thumb ? thumb.textContent.trim() : '';
      genieIcon.innerHTML =
        '<span class="detail-genie-tile ' + (thumb ? [...thumb.classList].filter(c => /^c\d$/.test(c)).join(' ') : '') + '" aria-hidden="true">' + initials + '</span>' +
        '<span class="detail-genie-label" aria-hidden="true">' + projectTitle + '</span>';
      genieIcon.style.right = (22 + slotIndex() * GENIE_SLOT_W) + 'px';
      if (instant) genieIcon.style.animation = 'none';
      genieIcon.addEventListener('click', () => {
        if (genieAnimating) return;
        removeGenieIcon();
        minimizedState.delete(projectTitle);
        win.classList.remove('minimized');
        dotMin.setAttribute('aria-label', 'Minimize window');
        dotMin.title = 'Minimize';
        genieTo(true);
      });
      document.body.appendChild(genieIcon);
    };
    // when an icon leaves the row (restore/close/maximize), the icons to its
    // right would keep a gap — re-close the row by reassigning slots over
    // every icon still in the document, in DOM (creation) order.
    const reflowGenieSlots = () => {
      document.querySelectorAll('.detail-genie-icon').forEach((icon, i) => {
        icon.style.right = (22 + i * GENIE_SLOT_W) + 'px';
      });
    };
    // map + DOM icon + per-window closure flag must all leave together, or a
    // stale entry desyncs slot assignment from what's on screen
    const removeGenieIcon = () => {
      if (genieIcon) { genieIcon.remove(); genieIcon = null; }
      minimizedState.delete(projectTitle);
      reflowGenieSlots();
    };

    dotMin.addEventListener('click', () => {
      if (win.classList.contains('minimized')) {
        // icon click path handles restore; a direct dot click while minimized
        // (e.g. keyboard focus) restores too
        removeGenieIcon();
        win.classList.remove('minimized');
        dotMin.setAttribute('aria-label', 'Minimize window');
        dotMin.title = 'Minimize';
        genieTo(true);
      } else {
        dotMin.setAttribute('aria-label', 'Restore window');
        dotMin.title = 'Restore';
        genieTo(false);
      }
    });

    // Maximize freezes the current visual rect first (same trick the drag
    // handler uses), so restoring puts the window exactly back where it was.
    let savedRect = null; // {left, top} captured at maximize time
    dotMax.addEventListener('click', () => {
      if (win.classList.contains('maximized')) {
        win.classList.remove('maximized');
        if (savedRect) {
          win.style.left = savedRect.left;
          win.style.top = savedRect.top;
          savedRect = null;
        }
        dotMax.setAttribute('aria-label', 'Maximize window');
        dotMax.title = 'Maximize';
        return;
      }
      const r = win.getBoundingClientRect();
      savedRect = { left: r.left + 'px', top: r.top + 'px' };
      // commit the current visual position into inline styles so nothing is
      // lost by the class's !important overrides; restore puts it back below
      win.style.left = savedRect.left;
      win.style.top = savedRect.top;
      win.classList.add('positioned');
      win.classList.remove('minimized'); // maximize restores a minimized body
      removeGenieIcon(); // H2: maximize cancels the genie state entirely
      dotMin.setAttribute('aria-label', 'Minimize window');
      dotMin.title = 'Minimize';
      win.classList.add('maximized');
      dotMax.setAttribute('aria-label', 'Restore window size');
      dotMax.title = 'Restore size';
    });

    dotClose.addEventListener('click', close);
    // a dot click must never start a title-bar drag
    [dotMin, dotMax, dotClose].forEach(d => {
      d.addEventListener('pointerdown', (e) => e.stopPropagation());
    });

    // drag by title bar (pointer events; desktop only — mobile gets full-width sheets)
    const titlebar = win.querySelector('.detail-titlebar');
    let dragState = null;
    const onDragMove = (e) => {
      if (!dragState) return;
      const w = win.offsetWidth;
      // loose clamp: keep a graspable part of the window on screen
      const x = Math.min(Math.max(e.clientX - dragState.dx, -w + 90), window.innerWidth - 90);
      const y = Math.min(Math.max(e.clientY - dragState.dy, 6), window.innerHeight - 60);
      win.style.left = x + 'px';
      win.style.top = y + 'px';
      win.classList.add('positioned'); // stop the entrance animation from re-centering
    };
    const onDragEnd = (e) => {
      if (!dragState) return;
      dragState = null;
      win.classList.remove('dragging');
      window.removeEventListener('pointermove', onDragMove);
      window.removeEventListener('pointerup', onDragEnd);
      window.removeEventListener('pointercancel', onDragEnd);
    };
    titlebar.addEventListener('pointerdown', (e) => {
      if (window.matchMedia('(max-width: 600px)').matches) return;
      if (e.button !== undefined && e.button !== 0) return;
      // F1: the window is visually placed by the entrance animation's
      // translate(-50%, 0). Freeze that visual position into explicit
      // left/top BEFORE adding .dragging (which sets animation: none and
      // would drop the transform — the window used to jump half its width
      // to the right on grab). From here on the cursor offset recorded
      // below is held constant for the whole drag.
      const pre = win.getBoundingClientRect(); // includes the animated translate(-50%, 0)
      win.style.left = pre.left + 'px';
      win.style.top = pre.top + 'px';
      win.style.right = 'auto';
      win.style.transform = 'none';
      win.classList.add('positioned'); // stops the entrance animation for good
      win.classList.add('dragging');
      const rect = win.getBoundingClientRect();
      dragState = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
      // listeners on window: drag keeps working even if the cursor outruns the bar
      window.addEventListener('pointermove', onDragMove);
      window.addEventListener('pointerup', onDragEnd);
      window.addEventListener('pointercancel', onDragEnd);
      try { titlebar.setPointerCapture(e.pointerId); } catch (err) {}
    });

    // H1: resize by the bottom-right grip. Anchors top-left, scales width AND
    // height live (body reflows + scrolls), clamped to 320x220 … viewport.
    const grip = win.querySelector('.detail-grip');
    let resizeState = null;
    const onResizeMove = (e) => {
      if (!resizeState) return;
      const startRect = resizeState.rect;
      const maxW = window.innerWidth - 16;
      const maxH = window.innerHeight - 16;
      const w = Math.min(Math.max(e.clientX - startRect.left, 320), maxW);
      const h = Math.min(Math.max(e.clientY - startRect.top, 220), maxH);
      win.style.width = w + 'px';
      win.style.height = h + 'px';
    };
    const onResizeEnd = () => {
      if (!resizeState) return;
      resizeState = null;
      win.classList.remove('resizing');
      window.removeEventListener('pointermove', onResizeMove);
      window.removeEventListener('pointerup', onResizeEnd);
      window.removeEventListener('pointercancel', onResizeEnd);
    };
    grip.addEventListener('pointerdown', (e) => {
      // resize is a desktop affordance; mobile sheets stay fixed-width
      if (window.matchMedia('(max-width: 600px)').matches) return;
      if (e.button !== undefined && e.button !== 0) return;
      if (win.classList.contains('maximized')) return; // fullscreen size is the max already
      e.preventDefault();
      e.stopPropagation(); // never start a drag or a bring-to-front side effect
      // freeze the entrance animation's translate(-50%, 0) into explicit
      // left/top, same trick the title-bar drag uses, so the resize anchors
      // the top-left corner exactly where the window visually is.
      const pre = win.getBoundingClientRect();
      win.style.left = pre.left + 'px';
      win.style.top = pre.top + 'px';
      win.style.transform = 'none';
      win.classList.add('positioned');
      // drop a lingering minimized/max-height state: resizing restores the body
      win.classList.remove('minimized');
      win.style.maxHeight = 'none';
      win.classList.add('resizing');
      resizeState = { rect: pre, startW: pre.width, startH: pre.height };
      window.addEventListener('pointermove', onResizeMove);
      window.addEventListener('pointerup', onResizeEnd);
      window.addEventListener('pointercancel', onResizeEnd);
      try { grip.setPointerCapture(e.pointerId); } catch (err) {}
    });

    const pill = win.querySelector('.detail-pill');
    setTimeout(() => pill.focus(), 0);
  }

  document.querySelectorAll('.scatter-card').forEach(card => {
    card.addEventListener('click', () => openWindow(card));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !openWindows.size) return;
    // close the topmost window
    let topWin = null, topZi = -1;
    openWindows.forEach(w => {
      const zi = parseInt(w.style.zIndex || 0, 10);
      if (zi > topZi) { topZi = zi; topWin = w; }
    });
    if (topWin) topWin.querySelector('.detail-pill').click();
  });
})();
