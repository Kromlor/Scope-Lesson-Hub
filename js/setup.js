/* Session setup: students, lesson part, length, order, turn-taking. */
(function (H) {
  'use strict';
  H.MARKS = [{ shape: 'circle', label: '1', cls: 'm1' }, { shape: 'square', label: '2', cls: 'm2' }];
  H.markHTML = (i, big) => `<span class="mark ${H.MARKS[i].cls} ${big ? 'big' : ''}" aria-hidden="true">${H.MARKS[i].label}</span>`;

  /* Build turns. Every turn names exactly one student (or none for a shared talk card / preview). */
  H.buildTurns = (cards, mode, order) => {
    const turns = []; let k = 0;
    const T = (cardIdx, studentId, variant, extra) => turns.push(Object.assign({ id: 't' + turns.length, cardIdx, studentId, variant }, extra || {}));
    cards.forEach((c, i) => {
      if (mode === 'preview' || mode === 'single') return T(i, order[0] || null, 'main');
      if (mode === 'alternate') {
        if (c.role === 'discussion') return T(i, null, 'main', { shared: true });
        T(i, order[k % 2], 'main'); k++; return;
      }
      // both: each student gets a turn on this card
      const alt = c.alt && c.alt.on, g = 'g' + i;
      T(i, order[0], 'main', { group: g, hideUntilBoth: !alt });
      T(i, order[1], alt ? 'alt' : 'main', { group: g, hideUntilBoth: !alt });
    });
    return turns;
  };

  H.setup = {
    async open(lessonId) {
      const lessons = (await H.store.all('lessons')).filter(H.L.canStart).sort((a, b) => (a.number || 999) - (b.number || 999) || a.title.localeCompare(b.title));
      let L = lessons.find(l => l.id === lessonId) || null;
      const students = (await H.store.all('students')).filter(s => !s.archived).sort((a, b) => a.name.localeCompare(b.name));
      const v = H.shell('lessons', `<h1>Start a session</h1>
        ${!L && lessonId ? `<div class="panel warn">That lesson is a draft or has card problems, so it can’t start yet. Open it in the editor to finish it, or pick another lesson.</div>` : ''}
        <form id="setup" class="setup" novalidate>
          <section class="panel"><h2>1. Students</h2>
            <p class="small muted">Use nicknames or initials if you prefer. Records stay on this laptop.</p>
            <div class="two">
              <div><label for="s1">${H.markHTML(0)} First student</label><select id="s1"><option value="">Choose…</option>${students.map(s => `<option value="${H.esc(s.id)}">${H.esc(s.name)}</option>`).join('')}</select></div>
              <div><label for="s2">${H.markHTML(1)} Second student (optional)</label><select id="s2"><option value="">No second student</option>${students.map(s => `<option value="${H.esc(s.id)}">${H.esc(s.name)}</option>`).join('')}</select></div>
            </div>
            <div class="row addst"><label class="sr" for="newname">New student nickname</label><input id="newname" placeholder="Add a student: nickname or initials" maxlength="40"><button type="button" class="btn" id="addst">Add student</button></div>
          </section>
          <section class="panel"><h2>2. Lesson</h2>
            <label for="les">Lesson</label>
            <select id="les">${lessons.length ? '' : '<option value="">No lessons are ready</option>'}${lessons.map(l => `<option value="${H.esc(l.id)}" ${L && l.id === L.id ? 'selected' : ''}>${l.number ? l.number + '. ' : ''}${H.esc(l.title)}</option>`).join('')}</select>
            <div id="partbox"></div>
          </section>
          <section class="panel" id="pairbox"><h2>3. Taking turns</h2><div id="pairinner"></div></section>
          <p id="err" class="err" role="alert"></p>
          <div class="row"><a class="btn" href="#/lessons">Cancel</a><span class="spacer"></span><button class="btn go big" id="go" type="submit">Start session →</button></div>
        </form>`);
      if (!L && lessons.length) L = lessons[0];
      const s1 = H.$('#s1'), s2 = H.$('#s2');
      const syncStudents = () => {
        H.$$('option', s2).forEach(o => { o.disabled = o.value && o.value === s1.value; });
        H.$$('option', s1).forEach(o => { o.disabled = o.value && o.value === s2.value; });
        if (s2.value && s2.value === s1.value) s2.value = '';
        drawPair();
      };
      const drawParts = () => {
        const box = H.$('#partbox'); if (!L) { box.innerHTML = ''; return; }
        const sets = H.L.usableSets(L);
        box.innerHTML = `<fieldset><legend>Part</legend>${sets.map((s, i) => `<label class="opt"><input type="radio" name="part" value="${H.esc(s.id)}" ${i === 0 ? 'checked' : ''}> ${H.esc(s.name)} <span class="muted small">(${s.cards.length} cards)</span></label>`).join('')}</fieldset>
          <fieldset><legend>Length</legend><label class="opt"><input type="radio" name="len" value="full" checked> Full session <span class="muted small" id="n_full"></span></label><label class="opt"><input type="radio" name="len" value="short"> Short session <span class="muted small" id="n_short"></span></label></fieldset>
          ${L.goal ? `<p class="small"><b>Goal:</b> ${H.esc(L.goal)}</p>` : ''}`;
        const counts = () => { const sid = (H.$('input[name=part]:checked') || {}).value; H.$('#n_full').textContent = `(${H.L.cardsFor(L, sid, 'full').length} cards)`; H.$('#n_short').textContent = `(${H.L.cardsFor(L, sid, 'short').length} cards: skips warm-up and extras)`; };
        H.$$('input[name=part]').forEach(r => r.onchange = counts); counts();
      };
      const drawPair = () => {
        const a = students.find(s => s.id === s1.value), b = students.find(s => s.id === s2.value);
        const box = H.$('#pairinner');
        if (!b) { box.innerHTML = `<p class="muted">One student: every card is that student’s turn.</p>`; return; }
        box.innerHTML = `<fieldset><legend>Who goes first?</legend>
          <label class="opt"><input type="radio" name="first" value="0" checked> ${H.markHTML(0)} ${H.esc(a ? a.name : 'First student')}</label>
          <label class="opt"><input type="radio" name="first" value="1"> ${H.markHTML(1)} ${H.esc(b.name)}</label></fieldset>
          <fieldset><legend>Turn-taking method</legend>
          <label class="opt"><input type="radio" name="mode" value="alternate" checked> <b>Alternate questions</b>: students answer different cards, taking turns. Talk-it-through cards are shared.</label>
          <label class="opt"><input type="radio" name="mode" value="both"> <b>Both practice each skill</b>: each student gets a turn on every card. If a card has a second-student question, the second student gets it. If not, both answer the same question and the answer stays hidden until both have answered.</label></fieldset>`;
      };
      s1.onchange = syncStudents; s2.onchange = syncStudents;
      H.$('#les').onchange = e => { L = lessons.find(l => l.id === e.target.value); drawParts(); };
      H.$('#addst').onclick = async () => {
        const n = H.$('#newname').value.trim(); if (!n) { H.$('#newname').focus(); return; }
        if (students.some(s => s.name.toLowerCase() === n.toLowerCase())) { H.$('#err').textContent = `There is already a student named “${n}”. Add a last initial to tell them apart.`; return; }
        const s = { id: H.uid('st_'), name: n, notes: '', archived: false, createdAt: Date.now() };
        if (!await H.store.save('students', s, 'Student')) return;
        students.push(s); students.sort((a, b) => a.name.localeCompare(b.name));
        const keep1 = s1.value || s.id, keep2 = s1.value ? (s2.value || s.id) : s2.value;
        [s1, s2].forEach((sel, i) => { sel.innerHTML = `<option value="">${i ? 'No second student' : 'Choose…'}</option>` + students.map(x => `<option value="${H.esc(x.id)}">${H.esc(x.name)}</option>`).join(''); });
        s1.value = keep1; s2.value = keep2 === keep1 ? '' : keep2; H.$('#newname').value = ''; H.$('#err').textContent = ''; syncStudents(); H.toast('Added ' + n + '.');
      };
      H.$('#newname').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); H.$('#addst').click(); } };
      H.$('#setup').onsubmit = async e => {
        e.preventDefault(); const err = H.$('#err'); err.textContent = '';
        if (!L) { err.textContent = 'Choose a lesson.'; return; }
        const a = students.find(s => s.id === s1.value), b = students.find(s => s.id === s2.value);
        if (!a) { err.textContent = 'Choose the first student (or add one).'; s1.focus(); return; }
        if (b && b.id === a.id) { err.textContent = 'Choose two different students.'; return; }
        const setId = H.$('input[name=part]:checked').value, length = H.$('input[name=len]:checked').value;
        const set = L.sets.find(s => s.id === setId); const problems = H.L.validateSet(set);
        if (problems.length) { err.innerHTML = 'This part has problems to fix first:<br>' + problems.map(H.esc).join('<br>'); return; }
        const cards = H.L.cardsFor(L, setId, length);
        if (!cards.length) { err.textContent = 'This part has no cards for a short session. Choose Full.'; return; }
        let order = [a], mode = 'single';
        if (b) { order = H.$('input[name=first]:checked').value === '1' ? [b, a] : [a, b]; mode = H.$('input[name=mode]:checked').value; }
        const existing = await H.store.get('active', 'current');
        if (existing && !await H.confirm('Replace the unfinished session?', `<p>There is an unfinished session (${H.esc(existing.lessonTitle)} with ${H.esc(existing.studentNames.join(' and '))}). Starting a new one deletes its unsaved answers.</p>`, 'Delete it and start')) return;
        const state = H.session.newState(L, set, length, mode, order, cards, b ? [a, b] : [a]);
        if (!await H.store.save('active', state, 'Session')) return;
        H.go('#/session');
      };
      drawParts(); syncStudents();
    }
  };
})(window.H);
