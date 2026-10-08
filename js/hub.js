/* Lesson library (home screen). */
(function (H) {
  'use strict';
  const st = { q: '', unit: '', view: 'ready' };
  try { Object.assign(st, JSON.parse(sessionStorage.getItem('hubFilter') || '{}')); } catch (e) { }

  H.hub = {
    async render() {
      const lessons = (await H.store.all('lessons')).sort((a, b) => (a.number || 999) - (b.number || 999) || a.title.localeCompare(b.title));
      const active = await H.store.get('active', 'current');
      const units = Array.from(new Set(lessons.filter(l => !l.archived).map(l => l.unit || 'No unit'))).sort();
      const v = H.shell('lessons', `
        ${active ? `<div class="resume panel" role="region" aria-label="Unfinished session"><div><b>Unfinished session:</b> ${H.esc(active.lessonTitle)} · ${H.esc(active.studentNames.join(' and ') || 'Preview')} · card ${Math.min(active.pos + 1, active.turns.length)} of ${active.turns.length}</div><div class="row"><button class="btn go" id="res_go">Resume</button><button class="btn danger" id="res_x">Discard</button></div></div>` : ''}
        <div class="hub-head"><h1>Lesson library</h1><button class="btn primary" id="add">+ Add lesson</button></div>
        <div class="filters">
          <label class="sr" for="q">Search lessons</label>
          <input id="q" type="search" placeholder="Search by title or skill" value="${H.esc(st.q)}">
          <label class="sr" for="unit">Unit</label>
          <select id="unit"><option value="">All units</option>${units.map(u => `<option ${u === st.unit ? 'selected' : ''}>${H.esc(u)}</option>`).join('')}</select>
          <div class="seg" role="tablist" aria-label="Show">${[['ready', 'Ready to use'], ['draft', 'Drafts'], ['all', 'All'], ['archived', 'Archived']].map(([k, t]) => `<button role="tab" aria-selected="${st.view === k}" class="${st.view === k ? 'on' : ''}" data-view="${k}">${t} <span class="count" id="cnt_${k}"></span></button>`).join('')}</div>
        </div>
        <div id="grid" class="grid"></div>`);
      const draw = () => {
        sessionStorage.setItem('hubFilter', JSON.stringify(st));
        const q = st.q.trim().toLowerCase();
        const match = l => (!st.unit || (l.unit || 'No unit') === st.unit) && (!q || [l.title, l.skill, l.unit, l.goal].join(' ').toLowerCase().includes(q));
        const inView = (l, view) => view === 'archived' ? l.archived : !l.archived && (view === 'all' || (view === 'ready' ? H.L.canStart(l) : !H.L.canStart(l)));
        ['ready', 'draft', 'all', 'archived'].forEach(k => { H.$('#cnt_' + k).textContent = '(' + lessons.filter(l => match(l) && inView(l, k)).length + ')'; });
        const list = lessons.filter(l => match(l) && inView(l, st.view));
        const g = H.$('#grid');
        if (!list.length) { g.innerHTML = `<p class="muted empty">No lessons here.${st.q || st.unit ? ' Try clearing the search or unit filter.' : ''}</p>`; return; }
        g.innerHTML = list.map(cardHTML).join('');
        H.media.hydrate(g);
        H.$$('[data-act]', g).forEach(b => b.onclick = () => act(b.dataset.act, b.dataset.id, lessons));
      };
      H.$('#q').oninput = e => { st.q = e.target.value; draw(); };
      H.$('#unit').onchange = e => { st.unit = e.target.value; draw(); };
      H.$$('[data-view]').forEach(b => b.onclick = () => { st.view = b.dataset.view; H.$$('[data-view]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); }); draw(); });
      H.$('#add').onclick = async () => { const l = H.L.newLesson(); if (await H.store.save('lessons', l, 'New lesson')) H.go('#/edit/' + encodeURIComponent(l.id)); };
      if (active) {
        H.$('#res_go').onclick = () => H.go('#/session');
        H.$('#res_x').onclick = async () => { if (await H.confirm('Discard the unfinished session?', `<p>The answers and ratings from this session will be deleted. Saved sessions are not affected.</p>`, 'Discard session')) { await H.store.del('active', 'current'); H.toast('Unfinished session discarded.'); H.hub.render(); } };
      }
      draw();
    }
  };

  function cardHTML(l) {
    const f = H.L.mediaFlags(l), ok = H.L.canStart(l), th = H.L.thumb(l), n = H.L.cardCount(l);
    const reason = l.archived ? 'Archived' : !n ? 'No cards yet' : l.status !== 'ready' ? 'Draft: not marked ready' : 'Has card problems: open Edit';
    const chips = [f.video && 'Video link', f.pictures && 'Pictures', f.audio && 'Audio', f.warmVoice && 'Warm voice', f.modeling && 'SLP models tone'].filter(Boolean);
    const canPrev = H.L.usableSets(l).length > 0;
    return `<article class="lcard ${ok ? '' : 'is-draft'}" aria-label="${H.esc(l.title)}">
      <div class="thumb">${th ? `<img alt="" data-ref="${H.esc(th)}" loading="lazy">` : `<div class="thumb-empty" aria-hidden="true">${H.esc((l.title || '?').slice(0, 1))}</div>`}
        <span class="badge ${ok ? 'ready' : 'draft'}">${ok ? 'Ready' : l.archived ? 'Archived' : 'Draft'}</span></div>
      <div class="lbody">
        <div class="unit">${H.esc(l.unit || 'No unit')}${l.number ? ' · Lesson ' + l.number : ''}</div>
        <h2 class="ltitle">${H.esc(l.title)}</h2>
        ${l.skill ? `<div class="skill"><b>Skill:</b> ${H.esc(l.skill)}</div>` : ''}
        ${l.goal ? `<div class="goal">${H.esc(l.goal)}</div>` : ''}
        ${chips.length ? `<ul class="chips" aria-label="Media">${chips.map(c => `<li>${H.esc(c)}</li>`).join('')}</ul>` : ''}
        ${ok ? '' : `<div class="why-draft">${H.esc(reason)}</div>`}
      </div>
      <div class="lact">
        ${l.archived ? `<button class="btn" data-act="restore" data-id="${H.esc(l.id)}">Restore</button>` : `
        <button class="btn go" data-act="start" data-id="${H.esc(l.id)}" ${ok ? '' : 'disabled'}>Start</button>
        <button class="btn" data-act="preview" data-id="${H.esc(l.id)}" ${canPrev ? '' : 'disabled'}>Preview</button>
        <button class="btn" data-act="edit" data-id="${H.esc(l.id)}">Edit</button>
        <button class="btn ghost" data-act="dup" data-id="${H.esc(l.id)}">Duplicate</button>
        <button class="btn ghost" data-act="archive" data-id="${H.esc(l.id)}">Archive</button>`}
      </div></article>`;
  }

  async function act(a, id, lessons) {
    const l = lessons.find(x => x.id === id); if (!l) return;
    if (a === 'start') H.go('#/setup/' + encodeURIComponent(id));
    if (a === 'preview') H.go('#/preview/' + encodeURIComponent(id));
    if (a === 'edit') H.go('#/edit/' + encodeURIComponent(id));
    if (a === 'dup') { const c = H.L.copyLesson(l); if (await H.store.save('lessons', c, 'Copy')) { H.toast('Copied: ' + c.title); st.view = 'all'; H.hub.render(); } }
    if (a === 'archive') {
      if (!await H.confirm('Archive this lesson?', `<p><b>${H.esc(l.title)}</b> will move to the Archived list. Session records are kept. You can restore it any time.</p>`, 'Archive', { danger: false })) return;
      l.archived = true; l.updatedAt = Date.now(); if (await H.store.save('lessons', l, 'Lesson')) { H.toast('Archived. Find it under “Archived”.'); H.hub.render(); }
    }
    if (a === 'restore') { l.archived = false; l.updatedAt = Date.now(); if (await H.store.save('lessons', l, 'Lesson')) { H.toast('Restored.'); H.hub.render(); } }
  }
})(window.H);
