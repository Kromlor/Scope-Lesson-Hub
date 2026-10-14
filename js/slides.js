/* Slide presenter for the intro slides (window.HUB_SLIDES). Route: #/slides/<deckId>[/<n>] */
(function (H) {
  'use strict';
  const W = 1920, HT = 1080;
  let onKey = null, onResize = null;

  function cleanup() {
    if (onKey) document.removeEventListener('keydown', onKey);
    if (onResize) window.removeEventListener('resize', onResize);
    onKey = onResize = null;
    document.body.classList.remove('presenting');
  }

  H.slides = {
    decks() { return window.HUB_SLIDES || {}; },
    has(id) { return !!(id && H.slides.decks()[id]); },
    leave: cleanup,

    open(deckId, startAt) {
      cleanup();
      const deck = H.slides.decks()[deckId];
      if (!deck) {
        H.shell('lessons', `<div class="panel error-panel"><h2>Slides not found</h2><p>These slides are not in this copy of the hub. <a href="#/lessons">Back to lessons</a>.</p></div>`);
        return;
      }
      const S = deck.slides, n = S.length;
      let i = Math.min(Math.max((parseInt(startAt, 10) || 1) - 1, 0), n - 1), shown = 0;
      let notesOn = false;
      try { notesOn = localStorage.getItem('slidesNotes') === '1'; } catch (e) { }

      document.body.classList.add('presenting');
      H.$('#app').innerHTML = `<div class="present" id="present">
        <div class="pr-stage" id="pr_stage" aria-live="polite"><div class="pr-canvas" id="pr_canvas"></div></div>
        <aside class="pr-notes ${notesOn ? '' : 'hidden'}" id="pr_notes" aria-label="Teacher notes"><h2>Teacher notes</h2><div id="pr_ntext"></div></aside>
        <div class="pr-bar" role="toolbar" aria-label="Slide controls">
          <button class="btn" id="pr_exit" title="Back to lessons (Esc)">✕ Exit</button>
          <span class="pr-title">${H.esc(deck.title)}</span>
          <button class="btn" id="pr_prev" title="Back (Left arrow)" aria-label="Previous">◀</button>
          <span class="pr-count" id="pr_count"></span>
          <button class="btn go" id="pr_next" title="Next (Right arrow or Space)" aria-label="Next">▶</button>
          <button class="btn" id="pr_notesbtn" aria-pressed="${notesOn}" title="Show or hide teacher notes (N)">Notes</button>
          <button class="btn" id="pr_full" title="Full screen (F)">Full screen</button>
          ${deck.pptx ? `<a class="btn ghost pr-dl" href="${H.esc(deck.pptx)}" download title="PowerPoint copy of these slides, with teacher notes">PowerPoint</a>` : ''}
        </div>
        <p class="pr-hint" id="pr_hint">Click the slide or press → to go on. Some slides show answers on the next click.</p>
      </div>`;
      const canvas = H.$('#pr_canvas'), stage = H.$('#pr_stage');
      const builds = () => H.$$('[data-build-in]', canvas);

      const fit = () => {
        const r = stage.getBoundingClientRect();
        const s = Math.min(r.width / W, r.height / HT);
        canvas.style.transform = `translate(${(r.width - W * s) / 2}px, ${(r.height - HT * s) / 2}px) scale(${s})`;
      };
      const draw = (showAll) => {
        const sl = S[i];
        canvas.innerHTML = sl.html;
        const b = builds();
        shown = showAll ? b.length : 0;
        b.forEach((el, k) => el.classList.toggle('pr-hidden', k >= shown));
        H.$('#pr_count').textContent = `${i + 1} / ${n}`;
        H.$('#pr_ntext').innerHTML = sl.notes ? `<p>${H.esc(sl.notes)}</p>` : '<p class="muted">No notes for this slide.</p>';
        H.$('#pr_prev').disabled = i === 0;
        H.$('#pr_next').textContent = (shown < b.length) ? 'Show answer' : (i === n - 1 ? 'Done' : '▶');
        H.$('#pr_next').setAttribute('aria-label', shown < b.length ? 'Show answer' : i === n - 1 ? 'Done' : 'Next');
        history.replaceState(null, '', `#/slides/${encodeURIComponent(deckId)}/${i + 1}`);
        fit();
      };
      const next = () => {
        const b = builds();
        if (shown < b.length) { b[shown].classList.remove('pr-hidden'); shown++; H.$('#pr_next').textContent = shown < b.length ? 'Show answer' : (i === n - 1 ? 'Done' : '▶'); return; }
        if (i < n - 1) { i++; draw(false); H.$('#pr_hint').classList.add('hidden'); }
        else exit();
      };
      const prev = () => { if (i > 0) { i--; draw(true); } };
      const exit = () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => { }); cleanup(); H.go('#/lessons'); };
      const toggleNotes = () => {
        notesOn = !notesOn;
        H.$('#pr_notes').classList.toggle('hidden', !notesOn);
        H.$('#pr_notesbtn').setAttribute('aria-pressed', notesOn);
        try { localStorage.setItem('slidesNotes', notesOn ? '1' : '0'); } catch (e) { }
        fit();
      };
      const full = () => {
        const el = H.$('#present');
        if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
        else if (el.requestFullscreen) el.requestFullscreen().catch(() => H.toast('Full screen is not available here. Try F11.'));
      };

      H.$('#pr_next').onclick = next; H.$('#pr_prev').onclick = prev; H.$('#pr_exit').onclick = exit;
      H.$('#pr_notesbtn').onclick = toggleNotes; H.$('#pr_full').onclick = full;
      stage.onclick = next;
      onKey = e => {
        if (!H.$('#present')) return cleanup();
        if (e.target.closest && e.target.closest('input,textarea,select')) return;
        const k = e.key;
        if (k === 'ArrowRight' || k === 'PageDown' || k === ' ' || k === 'Enter') { if (k === 'Enter' && e.target.tagName === 'BUTTON') return; e.preventDefault(); next(); }
        else if (k === 'ArrowLeft' || k === 'PageUp' || k === 'Backspace') { e.preventDefault(); prev(); }
        else if (k === 'Home') { i = 0; draw(false); }
        else if (k === 'End') { i = n - 1; draw(true); }
        else if (k === 'n' || k === 'N') toggleNotes();
        else if (k === 'f' || k === 'F') full();
        else if (k === 'Escape' && !document.fullscreenElement) exit();
      };
      onResize = () => { if (H.$('#present')) fit(); };
      document.addEventListener('keydown', onKey);
      window.addEventListener('resize', onResize);
      document.addEventListener('fullscreenchange', () => setTimeout(onResize || (() => { }), 50));
      draw(false);
      H.$('#pr_next').focus();
    }
  };
})(window.H);
