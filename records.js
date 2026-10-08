/* Students, session history, CSV export. */
(function (H) {
  'use strict';
  const R = H.records = {};
  const modeName = m => ({ single: 'One student', alternate: 'Alternate questions', both: 'Both practice each skill' }[m] || m);

  /* ---------- students ---------- */
  R.students = async () => {
    const [students, sessions] = await Promise.all([H.store.all('students'), H.store.all('sessions')]);
    students.sort((a, b) => (a.archived - b.archived) || a.name.localeCompare(b.name));
    const statsFor = id => { const ss = sessions.filter(s => s.students.some(x => x.id === id)).sort((a, b) => b.startedAt - a.startedAt); return { n: ss.length, last: ss[0] }; };
    const v = H.shell('students', `<div class="hub-head"><h1>Students</h1></div>
      <p class="notice">Use nicknames or initials if you prefer. Student records stay in this browser on this laptop and do not sync to other computers.</p>
      <div class="row addst panel"><label class="sr" for="nn">New student</label><input id="nn" placeholder="Nickname or initials" maxlength="40"><button class="btn primary" id="add">Add student</button></div>
      <div id="slist">${students.length ? students.map(s => { const st = statsFor(s.id); return `<section class="panel stu ${s.archived ? 'is-archived' : ''}">
        <div class="row"><h2>${H.esc(s.name)}</h2>${s.archived ? '<span class="badge draft">Archived</span>' : ''}<span class="spacer"></span>
        <span class="small muted">${st.n} session${st.n === 1 ? '' : 's'}${st.last ? ' · last ' + H.fmtDate(st.last.date) : ''}</span>
        <a class="btn small" href="#/history" data-hist="${H.esc(s.id)}">History</a>
        <button class="btn small" data-ren="${H.esc(s.id)}">Rename</button>
        <button class="btn small" data-arc="${H.esc(s.id)}">${s.archived ? 'Restore' : 'Archive'}</button></div>
        <label for="sn_${H.esc(s.id)}">Notes about ${H.esc(s.name)} (goals, supports, reminders)</label>
        <textarea id="sn_${H.esc(s.id)}" data-sn="${H.esc(s.id)}">${H.esc(s.notes || '')}</textarea></section>`; }).join('') : '<p class="muted empty">No students yet. Add one above.</p>'}</div>`);
    const find = id => students.find(s => s.id === id);
    H.$('#add').onclick = async () => {
      const n = H.$('#nn').value.trim(); if (!n) return;
      if (students.some(s => s.name.toLowerCase() === n.toLowerCase())) { H.toast('There is already a student with that name. Add an initial.', 'error'); return; }
      if (await H.store.save('students', { id: H.uid('st_'), name: n, notes: '', archived: false, createdAt: Date.now() }, 'Student')) { H.toast('Added ' + n + '.'); R.students(); }
    };
    H.$('#nn').onkeydown = e => { if (e.key === 'Enter') H.$('#add').click(); };
    const saveNote = H.debounce(async (s) => { await H.store.save('students', s, 'Student notes'); }, 500);
    H.$$('[data-sn]', v).forEach(t => t.oninput = () => { const s = find(t.dataset.sn); s.notes = t.value; saveNote(s); });
    H.$$('[data-ren]', v).forEach(b => b.onclick = async () => {
      const s = find(b.dataset.ren);
      const m = H.modal(`<h2 id="modal-title">Rename student</h2><label for="rn">Nickname or initials</label><input id="rn" value="${H.esc(s.name)}" maxlength="40"><p class="small muted">Saved sessions keep the name used at the time; history links by student, not by name.</p><div class="actions"><button class="btn" data-close>Cancel</button><button class="btn primary" id="rn_ok">Save</button></div>`);
      H.$('#rn_ok', m).onclick = async () => { const n = H.$('#rn', m).value.trim(); if (!n) return; s.name = n; H.closeModal(); if (await H.store.save('students', s, 'Student')) R.students(); };
    });
    H.$$('[data-arc]', v).forEach(b => b.onclick = async () => {
      const s = find(b.dataset.arc);
      if (!s.archived && !await H.confirm('Archive this student?', `<p>${H.esc(s.name)} will be hidden from session setup. Their records stay in history. You can restore them here.</p>`, 'Archive', { danger: false })) return;
      s.archived = !s.archived; if (await H.store.save('students', s, 'Student')) R.students();
    });
    H.$$('[data-hist]', v).forEach(a => a.onclick = e => { e.preventDefault(); sessionStorage.setItem('histStudent', a.dataset.hist); H.go('#/history'); });
  };

  /* ---------- history ---------- */
  R.history = async () => {
    const [sessions, students] = await Promise.all([H.store.all('sessions'), H.store.all('students')]);
    sessions.sort((a, b) => b.startedAt - a.startedAt);
    let filt = sessionStorage.getItem('histStudent') || '';
    const v = H.shell('history', `<div class="hub-head"><h1>Session history</h1></div>
      <p class="notice">Saved on this laptop only. CSV files open in Excel or Google Sheets.</p>
      <div class="filters"><label for="hs">Student</label><select id="hs"><option value="">All students</option>${students.sort((a, b) => a.name.localeCompare(b.name)).map(s => `<option value="${H.esc(s.id)}" ${filt === s.id ? 'selected' : ''}>${H.esc(s.name)}</option>`).join('')}</select>
      <span class="spacer"></span><button class="btn" id="csv1">Download results CSV (one row per answer)</button><button class="btn" id="csv2">Download summary CSV (one row per student per session)</button></div>
      <div id="hlist"></div>`);
    const list = () => sessions.filter(s => !filt || s.students.some(x => x.id === filt));
    const draw = () => {
      sessionStorage.setItem('histStudent', filt);
      const L = list();
      H.$('#hlist').innerHTML = L.length ? `<div class="tablewrap"><table class="htable"><thead><tr><th>Date</th><th>Lesson</th><th>Part</th><th>Students and results</th><th></th></tr></thead><tbody>${L.map(s => `<tr>
        <td>${H.fmtDate(s.date)}</td><td>${s.lessonNumber ? s.lessonNumber + '. ' : ''}${H.esc(s.lessonTitle)}</td><td>${H.esc(s.setName)}${s.length === 'short' ? ' (short)' : ''}<br><span class="small muted">${H.esc(modeName(s.mode))}</span></td>
        <td>${s.students.filter(st => !filt || st.id === filt).map(st => { const sm = H.summarize(s.responses.filter(r => r.studentId === st.id)); return `<div><b>${H.esc(st.name)}</b>: ${H.fmtPct(sm.pctInd)} independent (${sm.I} of ${sm.scored} scored)${sm.S ? `, ${sm.S} skipped` : ''}</div>`; }).join('')}</td>
        <td><a class="btn small" href="#/history/${encodeURIComponent(s.id)}">View</a></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted empty">No saved sessions yet.</p>';
    };
    H.$('#hs').onchange = e => { filt = e.target.value; draw(); };
    H.$('#csv1').onclick = () => { const L = list(); if (!L.length) return H.toast('No sessions to export.'); H.download(`scope-results-${H.todayISO()}.csv`, '﻿' + R.csvResponses(L, filt), 'text/csv'); };
    H.$('#csv2').onclick = () => { const L = list(); if (!L.length) return H.toast('No sessions to export.'); H.download(`scope-summary-${H.todayISO()}.csv`, '﻿' + R.csvSummary(L, filt), 'text/csv'); };
    draw();
  };

  R.sessionDetail = async id => {
    const s = await H.store.get('sessions', id);
    if (!s) { H.toast('That session was not found.'); H.go('#/history'); return; }
    const v = H.shell('history', `<p><a href="#/history">← Session history</a></p>
      <h1>${s.lessonNumber ? s.lessonNumber + '. ' : ''}${H.esc(s.lessonTitle)}</h1>
      <p class="muted">${H.fmtDate(s.date)} · ${H.esc(s.setName)}${s.length === 'short' ? ' (short)' : ''} · ${H.esc(modeName(s.mode))} · ${s.minutes} min · saved ${H.fmtTime(s.savedAt)}</p>
      ${s.students.map((st, i) => { const rs = s.responses.filter(r => r.studentId === st.id); const sm = H.summarize(rs); return `<section class="panel stu-sum"><h2>${H.markHTML(Math.min(i, 1))} ${H.esc(st.name)}</h2>${H.summaryStatsHTML(sm)}
        <div class="tablewrap"><table class="rtable"><thead><tr><th>#</th><th>Card</th><th>Response</th><th>Rating</th></tr></thead><tbody>${rs.map((r, k) => H.responseRowHTML(r, k, true)).join('') || '<tr><td colspan="4" class="muted">No turns.</td></tr>'}</tbody></table></div>
        <label for="hn_${H.esc(st.id)}">Notes for ${H.esc(st.name)}</label><textarea id="hn_${H.esc(st.id)}" data-hn="${H.esc(st.id)}">${H.esc((s.notes || {})[st.id] || '')}</textarea></section>`; }).join('')}
      <div class="row"><button class="btn danger" id="del">Delete this session</button><span class="spacer"></span><button class="btn go" id="savech" disabled>Save changes</button></div>`);
    const dirty = () => { H.$('#savech').disabled = false; };
    H.$$('[data-rt]', v).forEach(sel => sel.onchange = () => { const r = s.responses.find(x => x.turnId === sel.dataset.rt); r.rating = sel.value; dirty(); });
    H.$$('[data-hn]', v).forEach(t => t.oninput = () => { s.notes = s.notes || {}; s.notes[t.dataset.hn] = t.value; dirty(); });
    H.$('#savech').onclick = async () => {
      H.$('#savech').disabled = true; s.editedAt = Date.now();
      if (await H.store.save('sessions', s, 'Session changes')) { H.toast('Changes saved.'); R.sessionDetail(id); } else H.$('#savech').disabled = false;
    };
    H.$('#del').onclick = async () => {
      if (!await H.confirm('Delete this session?', `<p>This permanently removes the results for ${H.esc(s.students.map(x => x.name).join(' and '))} from ${H.fmtDate(s.date)}. Make a backup first if you might need them.</p>`, 'Delete session')) return;
      try { await H.store.del('sessions', id); H.toast('Session deleted.'); H.go('#/history'); } catch (e) { H.toast(H.storageError(e), 'error'); }
    };
  };

  /* ---------- CSV ---------- */
  const cell = v => { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const row = a => a.map(cell).join(',');
  const yn = b => b === true ? 'Yes' : b === false ? 'No' : '';
  R.csvResponses = (sessions, onlyStudent) => {
    const out = [row(['Session ID', 'Date', 'Student', 'Lesson #', 'Lesson', 'Unit', 'Part', 'Length', 'Turn mode', 'Card #', 'Card type', 'Question', 'Second-student question', 'First response', 'First response correct', 'Later attempts', 'Number of attempts', 'Student said (SLP entered)', 'Rating', 'Counts toward accuracy', 'Item note', 'Session minutes'])];
    sessions.forEach(s => s.students.filter(st => !onlyStudent || st.id === onlyStudent).forEach(st => s.responses.filter(r => r.studentId === st.id).forEach(r => {
      const a = r.attempts || [];
      out.push(row([s.id, s.date, st.name, s.lessonNumber || '', s.lessonTitle, s.unit, s.setName, s.length, modeName(s.mode), r.cardNumber, (H.L.ROLES[r.role] || {}).label || r.role, r.question, r.variant === 'alt' ? 'Yes' : 'No',
        a[0] ? a[0].text : '', a[0] ? yn(a[0].correct) : '', a.slice(1).map(x => x.text + (x.correct === true ? ' (correct)' : x.correct === false ? ' (not correct)' : '')).join(' | '), a.length, r.verbal, H.L.ratingLabel(r.rating), ['I', 'H', 'X'].includes(r.rating) ? 'Yes' : 'No', r.note, s.minutes]));
    })));
    return out.join('\r\n');
  };
  R.csvSummary = (sessions, onlyStudent) => {
    const out = [row(['Session ID', 'Date', 'Student', 'Lesson #', 'Lesson', 'Part', 'Length', 'Turn mode', 'Minutes', 'Independent', 'With help', 'Incorrect', 'Scored items (denominator)', '% independent', '% correct (independent + with help)', 'Skipped', 'Not scored', 'Quick check: scored', 'Quick check: % independent', 'Quick check: % correct', 'Notes'])];
    sessions.forEach(s => s.students.filter(st => !onlyStudent || st.id === onlyStudent).forEach(st => {
      const sm = H.summarize(s.responses.filter(r => r.studentId === st.id));
      const p = v => v == null ? '' : v;
      out.push(row([s.id, s.date, st.name, s.lessonNumber || '', s.lessonTitle, s.setName, s.length, modeName(s.mode), s.minutes, sm.I, sm.H, sm.X, sm.scored, p(sm.pctInd), p(sm.pctCorrect), sm.S, sm.N, sm.check.scored, p(sm.check.pctInd), p(sm.check.pctCorrect), (s.notes || {})[st.id] || '']));
    }));
    return out.join('\r\n');
  };
})(window.H);
