/* Lesson editor: forms only, no code. Work-in-progress is kept as a draft on every change. */
(function (H) {
  'use strict';
  const E = H.editor = {};
  let W = null, base = null, setIdx = 0, openId = null, dirty = false;
  const draftSave = H.debounce(async () => {
    if (!W) return;
    try { await H.store.put('drafts', { id: W.id, lesson: W, savedAt: Date.now() }); status('draft'); }
    catch (e) { status('error', H.storageError(e)); }
  }, 400);
  function touch() { dirty = true; status('pending'); draftSave(); }
  function status(s, msg) {
    const el = H.$('#edstate'); if (!el) return;
    el.className = 'edstate ' + s;
    el.textContent = { pending: 'Changes not saved yet…', draft: 'Unsaved changes are kept as a draft on this laptop. Press Save lesson when done.', saved: 'All changes saved.', error: 'Draft could not be kept: ' + (msg || '') }[s];
  }
  const getPath = (o, p) => p.split('.').reduce((a, k) => a == null ? a : a[k], o);
  const setPath = (o, p, v) => { const ks = p.split('.'); const last = ks.pop(); const t = ks.reduce((a, k) => (a[k] = a[k] || {}), o); t[last] = v; };
  const set = () => W.sets[setIdx];
  const cardById = id => set().cards.find(c => c.id === id);

  E.open = async id => {
    base = await H.store.get('lessons', id);
    if (!base) { H.toast('Lesson not found.'); H.go('#/lessons'); return; }
    const d = await H.store.get('drafts', id);
    W = d ? d.lesson : H.clone(base); dirty = !!d; setIdx = 0; openId = null;
    W.media = W.media || []; W.video = W.video || {};
    render(d);
  };

  function render(restored) {
    const units = Array.from(new Set((window.HUB_CONTENT.lessons || []).map(l => l.unit).concat(W.unit || []))).filter(Boolean);
    const v = H.shell('lessons', `<div class="ed-head"><h1>Edit lesson</h1><span class="spacer"></span>
        <button class="btn" id="ed_close">Close</button><button class="btn" id="ed_prev">Save and preview</button><button class="btn go" id="ed_save">Save lesson</button></div>
      <p id="edstate" class="edstate" role="status" aria-live="polite"></p>
      ${restored ? `<div class="panel warn row" id="restored"><span>Your unsaved changes from ${H.esc(H.fmtTime(restored.savedAt))} were kept and are shown here.</span><span class="spacer"></span><button class="btn small" id="ed_discard">Discard those changes</button></div>` : ''}
      <div id="ed_errors"></div>
      <section class="panel"><h2>Lesson details</h2>
        <div class="two">
          <div><label for="f_title">Title</label><input id="f_title" data-l="title" value="${H.esc(W.title)}"></div>
          <div><label for="f_unit">Unit or category</label><input id="f_unit" data-l="unit" list="unitlist" value="${H.esc(W.unit)}"><datalist id="unitlist">${units.map(u => `<option value="${H.esc(u)}">`).join('')}</datalist></div>
          <div><label for="f_skill">Target skill</label><input id="f_skill" data-l="skill" value="${H.esc(W.skill)}"></div>
          <div><label for="f_std">Standards (codes, separated by commas)</label><input id="f_std" data-l="standards" value="${H.esc((W.standards || []).join(', '))}"></div>
        </div>
        <label for="f_goal">Student-friendly learning goal <span class="muted small">(students see this)</span></label><input id="f_goal" data-l="goal" value="${H.esc(W.goal)}" placeholder="I can…">
        <label for="f_notes">SLP directions and teaching notes <span class="muted small">(only you see this)</span></label><textarea id="f_notes" data-l="slpNotes" rows="5">${H.esc(W.slpNotes)}</textarea>
        <label>Cover picture <span class="muted small">(optional)</span></label><div class="row" id="coverbox"></div>
        <label class="opt ready-opt"><input type="checkbox" id="f_ready" ${W.status === 'ready' ? 'checked' : ''}> <b>Ready to use</b>: show this lesson as ready and allow it to start. Drafts can be previewed but not started.</label>
        ${W.builtIn ? `<p class="small muted">This lesson came with the app. <button class="btn small" id="ed_reset">Reset to the original version</button></p>` : ''}
      </section>
      <section class="panel"><h2>Video link and lesson media <span class="muted small">(optional; lessons work without them)</span></h2>
        <div class="two">
          <div><label for="v_url">Video link (https://…)</label><input id="v_url" data-l="video.url" value="${H.esc(W.video.url || '')}" placeholder="https://www.youtube.com/watch?v=…"></div>
          <div><label for="v_title">Video title</label><input id="v_title" data-l="video.title" value="${H.esc(W.video.title || '')}"></div>
          <div><label for="v_desc">Description</label><input id="v_desc" data-l="video.description" value="${H.esc(W.video.description || '')}"></div>
          <div><label for="v_pause">SLP pause-point notes</label><input id="v_pause" data-l="video.pauseNotes" value="${H.esc(W.video.pauseNotes || '')}" placeholder="Pause at 0:35. Ask: …"></div>
        </div>
        <div class="row"><span id="v_test"></span></div>
        <h3>Lesson media</h3><div id="lmedia"></div>
      </section>
      <section class="panel"><div class="row"><h2>Lesson parts and cards</h2><span class="spacer"></span><button class="btn small" id="addset">+ Add a part</button></div>
        <div class="settabs" role="tablist" id="settabs"></div>
        <div id="setbar" class="row"></div>
        <ol class="cardlist" id="cardlist"></ol>
        <div class="row"><button class="btn primary" id="addcard">+ Add card</button><span class="small muted">New cards start as a quick check with answer choices. Change the type in the card.</span></div>
      </section>`);
    status(dirty ? 'draft' : 'saved');
    // lesson fields
    H.$$('[data-l]', v).forEach(i => i.oninput = () => {
      let val = i.value; if (i.dataset.l === 'standards') val = val.split(',').map(x => x.trim()).filter(Boolean);
      setPath(W, i.dataset.l, val); touch(); if (i.dataset.l === 'video.url') videoTest();
    });
    H.$('#f_ready').onchange = e => { W.status = e.target.checked ? 'ready' : 'draft'; touch(); showErrors(); };
    H.$('#ed_save').onclick = save;
    H.$('#ed_prev').onclick = async () => { if (await save()) H.go('#/preview/' + encodeURIComponent(W.id)); };
    H.$('#ed_close').onclick = close;
    const dc = H.$('#ed_discard'); if (dc) dc.onclick = async () => { if (!await H.confirm('Discard unsaved changes?', '<p>The lesson goes back to its last saved version.</p>', 'Discard changes')) return; await H.store.del('drafts', W.id); E.open(W.id); };
    const rs = H.$('#ed_reset'); if (rs) rs.onclick = async () => {
      if (!await H.confirm('Reset to the original?', '<p>All your edits to this lesson are replaced by the version that came with the app. Saved session records are not affected. You can still Close without saving to cancel.</p>', 'Reset')) return;
      const o = H.originalLesson(W.id); if (!o) return; W = Object.assign(o, { id: W.id, builtIn: true, archived: W.archived }); setIdx = 0; openId = null; touch(); render();
    };
    H.$('#addset').onclick = () => { const n = W.sets.length; W.sets.push({ id: H.uid('set_'), name: n ? 'Additional practice ' + n : 'Core lesson', cards: [H.L.newCard()] }); setIdx = W.sets.length - 1; touch(); drawSets(); };
    H.$('#addcard').onclick = () => { const c = H.L.newCard(); set().cards.push(c); openId = c.id; touch(); drawCards(); setTimeout(() => { const q = H.$(`#cf_${c.id} [data-f="question"]`); q && q.focus(); }, 30); };
    drawCover(); videoTest(); mediaEditor(H.$('#lmedia'), () => W.media, ['image', 'audio', 'video', 'link']); drawSets(); showErrors();
  }

  function videoTest() {
    const u = H.media.safeUrl(W.video.url), el = H.$('#v_test');
    el.innerHTML = W.video.url ? (u ? `<a class="btn small" href="${H.esc(u)}" target="_blank" rel="noopener noreferrer">${H.icon('link')} Test the link</a>${H.media.embedUrl(u) ? ' <span class="small muted">Can also play inside the app when online.</span>' : ' <span class="small muted">Opens in a new tab.</span>'}` : '<span class="err">Links must start with https://</span>') : '';
  }

  function drawCover() {
    const box = H.$('#coverbox');
    box.innerHTML = W.cover ? `<img class="thumb-sm" alt="Cover" data-ref="${H.esc(W.cover)}"><button class="btn small" id="cv_pick">Replace</button><button class="btn small" id="cv_rm">Remove</button>` : `<button class="btn small" id="cv_pick">Choose a picture</button><span class="small muted">If empty, the first card picture is used.</span>`;
    H.media.hydrate(box);
    H.$('#cv_pick').onclick = async () => { const r = await pickPicture(); if (r) { W.cover = r; touch(); drawCover(); } };
    const rm = H.$('#cv_rm'); if (rm) rm.onclick = () => { delete W.cover; touch(); drawCover(); };
  }

  /* ---------- parts ---------- */
  function drawSets() {
    const tabs = H.$('#settabs');
    tabs.innerHTML = W.sets.map((s, i) => { const bad = H.L.validateSet(s).length; return `<button role="tab" aria-selected="${i === setIdx}" class="${i === setIdx ? 'on' : ''}" data-set="${i}">${H.esc(s.name)} <span class="muted small">(${s.cards.length})</span>${bad ? ' <span class="warnmark" title="Has problems">!</span>' : ''}</button>`; }).join('');
    H.$$('[data-set]', tabs).forEach(b => b.onclick = () => { setIdx = +b.dataset.set; openId = null; drawSets(); });
    const s = set();
    H.$('#setbar').innerHTML = `<label for="setname">Part name</label><input id="setname" value="${H.esc(s.name)}" style="max-width:22rem"><span class="spacer"></span>${W.sets.length > 1 ? `<button class="btn small" id="setup_l" ${setIdx === 0 ? 'disabled' : ''}>Move part left</button><button class="btn small danger" id="setdel">Delete this part</button>` : ''}`;
    H.$('#setname').oninput = e => { s.name = e.target.value; touch(); const t = H.$(`[data-set="${setIdx}"]`); if (t) t.firstChild.textContent = s.name + ' '; };
    const sl = H.$('#setup_l'); if (sl) sl.onclick = () => { const [x] = W.sets.splice(setIdx, 1); W.sets.splice(setIdx - 1, 0, x); setIdx--; touch(); drawSets(); };
    const sd = H.$('#setdel'); if (sd) sd.onclick = async () => { if (!await H.confirm('Delete this part?', `<p>“${H.esc(s.name)}” and its ${s.cards.length} cards will be removed when you save. Saved session records are not affected.</p>`, 'Delete part')) return; W.sets.splice(setIdx, 1); setIdx = 0; touch(); drawSets(); };
    drawCards();
  }

  function drawCards() {
    const list = H.$('#cardlist'), s = set();
    list.innerHTML = s.cards.map((c, i) => cardRowHTML(c, i, s.cards.length)).join('') || '<li class="muted">No cards yet.</li>';
    H.$$('[data-ca]', list).forEach(b => b.onclick = e => { e.stopPropagation(); cardAction(b.dataset.ca, b.dataset.id); });
    if (openId && cardById(openId)) drawCardForm(cardById(openId));
    showErrors();
  }
  function cardRowHTML(c, i, n) {
    const issues = H.L.validateCard(c), role = H.L.ROLES[c.role] || {};
    return `<li class="crow ${openId === c.id ? 'open' : ''} ${issues.length ? 'bad' : ''}" id="row_${c.id}">
      <div class="crow-h"><button class="crow-main" data-ca="toggle" data-id="${c.id}" aria-expanded="${openId === c.id}"><span class="num">${i + 1}</span><span class="rolechip r-${c.role}">${H.esc(role.short || role.label || c.role)}</span>${c.step ? `<span class="mini" style="--c:${(H.L.steps()[c.step] || {}).color}">${c.step}</span>` : ''}<span class="qtxt">${H.esc(c.question || '(no question yet)')}</span>${issues.length ? `<span class="warnmark" title="${H.esc(issues.join('; '))}">! ${issues.length}</span>` : ''}${c.inShort === false ? '<span class="small muted">full only</span>' : ''}</button>
      <span class="crow-tools"><button class="btn small" data-ca="up" data-id="${c.id}" ${i === 0 ? 'disabled' : ''} aria-label="Move card ${i + 1} up">↑</button><button class="btn small" data-ca="down" data-id="${c.id}" ${i === n - 1 ? 'disabled' : ''} aria-label="Move card ${i + 1} down">↓</button><button class="btn small" data-ca="dup" data-id="${c.id}">Duplicate</button><button class="btn small danger" data-ca="del" data-id="${c.id}">Remove</button></span></div>
      <div class="cform" id="cf_${c.id}"></div></li>`;
  }
  async function cardAction(a, id) {
    const cards = set().cards, i = cards.findIndex(c => c.id === id); if (i < 0) return;
    if (a === 'toggle') { openId = openId === id ? null : id; drawCards(); const r = H.$('#row_' + id); r && r.scrollIntoView({ block: 'nearest' }); return; }
    if (a === 'up' && i > 0) { [cards[i - 1], cards[i]] = [cards[i], cards[i - 1]]; }
    if (a === 'down' && i < cards.length - 1) { [cards[i + 1], cards[i]] = [cards[i], cards[i + 1]]; }
    if (a === 'dup') { const c = H.clone(cards[i]); c.id = H.uid('c_'); cards.splice(i + 1, 0, c); openId = c.id; }
    if (a === 'del') { if (!await H.confirm('Remove this card?', `<p>Card ${i + 1}: “${H.esc(cards[i].question || 'no question')}” will be removed when you save.</p>`, 'Remove card')) return; cards.splice(i, 1); if (openId === id) openId = null; }
    touch(); drawCards();
  }
  function refreshRow(c) {
    const s = set(), i = s.cards.indexOf(c), row = H.$('#row_' + c.id); if (!row) return;
    const tmp = document.createElement('ol'); tmp.innerHTML = cardRowHTML(c, i, s.cards.length);
    row.querySelector('.crow-h').replaceWith(tmp.querySelector('.crow-h'));
    row.className = tmp.firstChild.className;
    H.$$('[data-ca]', row.querySelector('.crow-h')).forEach(b => b.onclick = e => { e.stopPropagation(); cardAction(b.dataset.ca, b.dataset.id); });
    const iss = H.L.validateCard(c), box = H.$(`#cf_${c.id} .issues`); if (box) box.innerHTML = iss.length ? '⚠ ' + iss.map(H.esc).join(' · ') : '';
    debErrors();
  }
  const debErrors = H.debounce(() => showErrors(), 300);

  /* ---------- card form ---------- */
  function drawCardForm(c) {
    const f = H.$('#cf_' + c.id); if (!f) return;
    const steps = H.L.steps();
    const alt = c.alt || {};
    f.innerHTML = `<p class="issues err" role="status"></p>
      <div class="three">
        <div><label>Card type<select data-f="role">${Object.entries(H.L.ROLES).map(([k, r]) => `<option value="${k}" ${c.role === k ? 'selected' : ''}>${r.label}${r.scored ? ' (scored)' : ''}</option>`).join('')}</select></label></div>
        <div><label>Answer format<select data-f="kind">${Object.entries(H.L.KINDS).map(([k, t]) => `<option value="${k}" ${c.kind === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
        <div><label>SCOPE step <span class="muted small">(optional)</span><select data-f="step"><option value="">None</option>${Object.entries(steps).map(([k, s]) => `<option value="${k}" ${c.step === k ? 'selected' : ''}>${k} · ${H.esc(s.word)}</option>`).join('')}</select></label></div>
      </div>
      <div class="two"><div><label>Heading <span class="muted small">(optional, e.g. “Quick check”)</span><input data-f="heading" value="${H.esc(c.heading || '')}"></label></div>
      <div><label class="opt"><input type="checkbox" data-fb="inShort" ${c.inShort !== false ? 'checked' : ''}> Include in short sessions</label></div></div>
      <label>Short scenario or context <span class="muted small">(optional)</span><textarea data-f="context" rows="2">${H.esc(c.context || '')}</textarea></label>
      <label>Question <span class="muted small">(one clear question)</span><input data-f="question" value="${H.esc(c.question || '')}"></label>
      <div class="pic-ed"><label>Picture <span class="muted small">(optional)</span></label><div id="pic_${c.id}"></div></div>
      <details ${c.says && c.says.length ? 'open' : ''}><summary>What people say in the picture (${(c.says || []).length})</summary><div id="says_${c.id}"></div></details>
      <div class="two"><div><label>Quoted line <span class="muted small">(for tone items, e.g. “Fine.”)</span><input data-f="line" value="${H.esc(c.line || '')}"></label></div>
        <div><label class="opt"><input type="checkbox" data-fb="needsModeling" ${c.needsModeling ? 'checked' : ''}> SLP models the tone (label this card)</label></div></div>
      <div id="ans_${c.id}"></div>
      <div class="two">
        <div><label>Hint <span class="muted small">(optional)</span><input data-f="hint" value="${H.esc(c.hint || '')}"></label></div>
        <div><label>Answer explanation <span class="muted small">(shown after answering)</span><input data-f="explanation" value="${H.esc(c.explanation || '')}"></label></div>
      </div>
      <div class="two">
        <div><label>Sample response <span class="muted small">(open answers)</span><textarea data-f="sampleAnswer" rows="2">${H.esc(c.sampleAnswer || '')}</textarea></label></div>
        <div><label>Several possible ideas <span class="muted small">(one per line)</span><textarea data-fl="sampleIdeas" rows="3">${H.esc((c.sampleIdeas || []).join('\n'))}</textarea></label></div>
      </div>
      <div class="two">
        <div><label>Sentence starters <span class="muted small">(one per line)</span><textarea data-fl="starters" rows="3">${H.esc((c.starters || []).join('\n'))}</textarea></label></div>
        <div><label>More discussion prompts <span class="muted small">(one per line)</span><textarea data-fl="prompts" rows="3">${H.esc((c.prompts || []).join('\n'))}</textarea></label></div>
      </div>
      <details ${c.modeling || c.slpNote ? 'open' : ''}><summary>SLP-only directions</summary>
        <div class="two"><div><label>Model it: what to say (e.g. “Annoyed”)<input data-f="modeling.say" value="${H.esc((c.modeling || {}).say || '')}"></label></div><div><label>How to say it<input data-f="modeling.how" value="${H.esc((c.modeling || {}).how || '')}"></label></div></div>
        <label>Directions for this card<textarea data-f="slpNote" rows="2">${H.esc(c.slpNote || '')}</textarea></label></details>
      <details ${c.tones && c.tones.length ? 'open' : ''}><summary>Tone cards (${(c.tones || []).length})</summary><div id="tones_${c.id}"></div></details>
      <details ${alt.on ? 'open' : ''}><summary>Second-student question (optional)</summary><div id="alt_${c.id}"></div></details>
      <details ${(c.media || []).length || c.questionRec ? 'open' : ''}><summary>Card audio, video, and your recording</summary>
        <label>Your recording of the question <span class="muted small">(plays instead of the computer voice)</span></label><div id="qrec_${c.id}" class="row"></div>
        <label>Card media</label><div id="cmedia_${c.id}"></div></details>`;
    const iss = H.L.validateCard(c); H.$('.issues', f).innerHTML = iss.length ? '⚠ ' + iss.map(H.esc).join(' · ') : '';
    H.$$('[data-f]', f).forEach(i => { if (i.closest('[id^="alt_"]')) return; i[i.tagName === 'SELECT' ? 'onchange' : 'oninput'] = () => {
      const k = i.dataset.f; let val = i.value;
      if (k.startsWith('modeling.')) { c.modeling = c.modeling || {}; setPath(c, k, val); if (!c.modeling.say && !c.modeling.how) delete c.modeling; }
      else if (val === '' && k !== 'question') delete c[k]; else c[k] = val;
      if (k === 'kind') { convertKind(c); touch(); drawCardForm(c); refreshRow(c); return; }
      touch(); refreshRow(c);
    }; });
    H.$$('[data-fb]', f).forEach(i => i.onchange = () => { c[i.dataset.fb] = i.checked; touch(); refreshRow(c); });
    H.$$('[data-fl]', f).forEach(i => i.oninput = () => { const v = H.lines(i.value); if (v.length) c[i.dataset.fl] = v; else delete c[i.dataset.fl]; touch(); });
    drawPic(c, H.$('#pic_' + c.id), c, 'image');
    drawSays(c); drawAnswerEd(c, H.$('#ans_' + c.id), c); drawTones(c); drawAlt(c); drawQRec(c);
    mediaEditor(H.$('#cmedia_' + c.id), () => (c.media = c.media || []), ['audio', 'video', 'link']);
  }
  function convertKind(c) {
    if (c.kind === 'choice' && !c.choices) { c.choices = ['', '']; c.correct = []; }
    if (c.kind === 'sort' && !c.sort) c.sort = { bins: ['', ''], items: [{ text: '', bin: 0 }, { text: '', bin: 1 }] };
  }

  /* answer editor: choices or sort; target = card or card.alt */
  function drawAnswerEd(c, box, tgt) {
    if (c.kind === 'open') { box.innerHTML = '<p class="small muted">Open verbal response: the student answers out loud. You can type what they said during the session.</p>'; return; }
    if (c.kind === 'sort' && tgt === c) {
      const s = c.sort;
      box.innerHTML = `<fieldset><legend>Sort boxes and cards</legend><div class="two">${s.bins.map((b, i) => `<div><label>Box ${i + 1} name<input data-bin="${i}" value="${H.esc(b)}"></label></div>`).join('')}</div>
        <ol class="sortitems">${s.items.map((it, i) => `<li class="row"><label class="sr" for="si_${c.id}_${i}">Card ${i + 1}</label><input id="si_${c.id}_${i}" data-sit="${i}" value="${H.esc(it.text)}" placeholder="Card text"><label class="sr" for="sb_${c.id}_${i}">Goes in</label><select id="sb_${c.id}_${i}" data-sib="${i}">${s.bins.map((b, bi) => `<option value="${bi}" ${it.bin === bi ? 'selected' : ''}>Goes in: ${H.esc(b || 'Box ' + (bi + 1))}</option>`).join('')}</select><button class="btn small danger" data-sdel="${i}" aria-label="Remove card ${i + 1}">✕</button></li>`).join('')}</ol>
        <div class="row"><button class="btn small" id="sadd_${c.id}">+ Add sort card</button>${s.bins.length < 3 ? `<button class="btn small" id="sbin_${c.id}">+ Add a third box</button>` : ''}</div></fieldset>`;
      H.$$('[data-bin]', box).forEach(i => i.oninput = () => { s.bins[+i.dataset.bin] = i.value; touch(); refreshRow(c); });
      H.$$('[data-sit]', box).forEach(i => i.oninput = () => { s.items[+i.dataset.sit].text = i.value; touch(); refreshRow(c); });
      H.$$('[data-sib]', box).forEach(i => i.onchange = () => { s.items[+i.dataset.sib].bin = +i.value; touch(); refreshRow(c); });
      H.$$('[data-sdel]', box).forEach(b => b.onclick = () => { s.items.splice(+b.dataset.sdel, 1); touch(); drawAnswerEd(c, box, tgt); refreshRow(c); });
      H.$('#sadd_' + c.id).onclick = () => { s.items.push({ text: '', bin: 0 }); touch(); drawAnswerEd(c, box, tgt); refreshRow(c); };
      const ab = H.$('#sbin_' + c.id); if (ab) ab.onclick = () => { s.bins.push(''); touch(); drawAnswerEd(c, box, tgt); };
      return;
    }
    if (c.kind !== 'choice') { box.innerHTML = ''; return; }
    tgt.choices = tgt.choices || ['', '']; tgt.correct = tgt.correct || [];
    const p = tgt === c ? 'm' : 'a';
    box.innerHTML = `<fieldset><legend>Answer choices <span class="muted small">(2 or 3 is best; check every answer that is acceptable)</span></legend>
      ${tgt.choices.map((ch, i) => `<div class="row choice-ed"><span class="cl">${String.fromCharCode(65 + i)}</span><label class="sr" for="ch_${p}_${c.id}_${i}">Choice ${i + 1}</label><input id="ch_${p}_${c.id}_${i}" data-ch="${i}" value="${H.esc(ch)}"><label class="opt"><input type="checkbox" data-ok="${i}" ${tgt.correct.includes(i) ? 'checked' : ''}> Correct</label><button class="btn small" data-chup="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move choice up">↑</button><button class="btn small danger" data-chdel="${i}" ${tgt.choices.length <= 2 ? 'disabled' : ''} aria-label="Remove choice ${i + 1}">✕</button></div>`).join('')}
      <div class="row">${tgt.choices.length < 6 ? `<button class="btn small" data-chadd>+ Add choice</button>` : ''}${tgt === c ? `<label class="opt"><input type="checkbox" data-selall ${c.selectAll ? 'checked' : ''}> Student must choose <b>all</b> the correct answers</label>` : ''}</div></fieldset>`;
    H.$$('[data-ch]', box).forEach(i => i.oninput = () => { tgt.choices[+i.dataset.ch] = i.value; touch(); refreshRow(c); });
    H.$$('[data-ok]', box).forEach(i => i.onchange = () => { const k = +i.dataset.ok; tgt.correct = i.checked ? Array.from(new Set([...tgt.correct, k])).sort() : tgt.correct.filter(x => x !== k); touch(); refreshRow(c); });
    H.$$('[data-chdel]', box).forEach(b => b.onclick = () => { const k = +b.dataset.chdel; tgt.choices.splice(k, 1); tgt.correct = tgt.correct.filter(x => x !== k).map(x => x > k ? x - 1 : x); touch(); drawAnswerEd(c, box, tgt); refreshRow(c); });
    H.$$('[data-chup]', box).forEach(b => b.onclick = () => { const k = +b.dataset.chup; [tgt.choices[k - 1], tgt.choices[k]] = [tgt.choices[k], tgt.choices[k - 1]]; tgt.correct = tgt.correct.map(x => x === k ? k - 1 : x === k - 1 ? k : x).sort(); touch(); drawAnswerEd(c, box, tgt); });
    const ad = H.$('[data-chadd]', box); if (ad) ad.onclick = () => { tgt.choices.push(''); touch(); drawAnswerEd(c, box, tgt); refreshRow(c); setTimeout(() => { const ins = H.$$('[data-ch]', box); ins[ins.length - 1].focus(); }, 20); };
    const sa = H.$('[data-selall]', box); if (sa) sa.onchange = () => { c.selectAll = sa.checked; touch(); };
  }

  /* picture with clue dots; tgt[key] holds the ref */
  function drawPic(c, box, tgt, key) {
    const ref = tgt[key];
    const clues = tgt === c ? (c.clues || []) : [];
    box.innerHTML = ref ? `<div class="pic-wrap"><div class="figwrap ed" id="pw_${c.id}_${key}"><img alt="${H.esc(tgt.imageAlt || '')}" data-ref="${H.esc(ref)}">${clues.map((k, i) => `<span class="clue-dot" style="left:${k.x}%;top:${k.y}%">${i + 1}</span>`).join('')}</div>
        <div class="pic-side"><div class="row"><button class="btn small" data-pk>Replace</button><button class="btn small danger" data-prm>Remove</button></div>
        <label>Picture description <span class="muted small">(for screen readers)</span><input data-alt value="${H.esc(tgt.imageAlt || '')}"></label>
        ${tgt === c ? `<p class="small muted">Clue circles: click the picture to add one.</p><ol class="clue-ed">${clues.map((k, i) => `<li class="row"><input data-clab="${i}" value="${H.esc(k.label)}" aria-label="Clue ${i + 1} text" placeholder="What the clue shows"><select data-cstep="${i}" aria-label="Clue ${i + 1} SCOPE step"><option value="">—</option>${Object.keys(H.L.steps()).map(s => `<option ${k.step === s ? 'selected' : ''}>${s}</option>`).join('')}</select><button class="btn small danger" data-cdel="${i}" aria-label="Remove clue ${i + 1}">✕</button></li>`).join('')}</ol>` : ''}</div></div>`
      : `<div class="row"><button class="btn small" data-pk>Choose a picture</button><span class="small muted">From the SCOPE scenes or upload your own.</span></div>`;
    H.media.hydrate(box);
    H.$('[data-pk]', box).onclick = async () => { const r = await pickPicture(); if (r) { tgt[key] = r; if (!tgt.imageAlt) tgt.imageAlt = ''; touch(); drawPic(c, box, tgt, key); refreshRow(c); } };
    const rm = H.$('[data-prm]', box); if (rm) rm.onclick = () => { delete tgt[key]; if (tgt === c) delete c.clues; touch(); drawPic(c, box, tgt, key); };
    const al = H.$('[data-alt]', box); if (al) al.oninput = () => { tgt.imageAlt = al.value; touch(); };
    if (tgt === c && ref) {
      const pw = H.$(`#pw_${c.id}_${key}`);
      pw.onclick = e => { const r = pw.getBoundingClientRect(); const x = Math.round((e.clientX - r.left) / r.width * 1000) / 10, y = Math.round((e.clientY - r.top) / r.height * 1000) / 10; c.clues = c.clues || []; c.clues.push({ x, y, label: '', step: 'C' }); touch(); drawPic(c, box, tgt, key); setTimeout(() => { const ins = H.$$('[data-clab]', box); ins[ins.length - 1] && ins[ins.length - 1].focus(); }, 20); };
      H.$$('[data-clab]', box).forEach(i => i.oninput = () => { c.clues[+i.dataset.clab].label = i.value; touch(); });
      H.$$('[data-cstep]', box).forEach(i => i.onchange = () => { c.clues[+i.dataset.cstep].step = i.value; touch(); });
      H.$$('[data-cdel]', box).forEach(b => b.onclick = () => { c.clues.splice(+b.dataset.cdel, 1); if (!c.clues.length) delete c.clues; touch(); drawPic(c, box, tgt, key); });
    }
  }
  function drawSays(c) {
    const box = H.$('#says_' + c.id); const says = c.says || [];
    box.innerHTML = `${says.map((s, i) => `<div class="row"><input data-sw="${i}" value="${H.esc(s.who)}" placeholder="Who" aria-label="Who speaks" style="max-width:10rem"><select data-sk="${i}" aria-label="How"><option value="">says</option><option value="think" ${s.kind === 'think' ? 'selected' : ''}>thinks</option><option value="whisper" ${s.kind === 'whisper' ? 'selected' : ''}>whispers</option></select><input data-st="${i}" value="${H.esc(s.text)}" placeholder="What they say" aria-label="What they say"><button class="btn small danger" data-sd="${i}" aria-label="Remove line">✕</button></div>`).join('')}<button class="btn small" data-sa>+ Add a line</button>`;
    const up = () => { if (says.length) c.says = says; else delete c.says; touch(); };
    H.$$('[data-sw]', box).forEach(i => i.oninput = () => { says[+i.dataset.sw].who = i.value; up(); });
    H.$$('[data-st]', box).forEach(i => i.oninput = () => { says[+i.dataset.st].text = i.value; up(); });
    H.$$('[data-sk]', box).forEach(i => i.onchange = () => { const s = says[+i.dataset.sk]; if (i.value) s.kind = i.value; else delete s.kind; up(); });
    H.$$('[data-sd]', box).forEach(b => b.onclick = () => { says.splice(+b.dataset.sd, 1); up(); drawSays(c); });
    H.$('[data-sa]', box).onclick = () => { says.push({ who: '', text: '' }); c.says = says; touch(); drawSays(c); };
  }
  function drawTones(c) {
    const box = H.$('#tones_' + c.id); const t = c.tones || [];
    box.innerHTML = `<p class="small muted">Each tone card shows a way to say the quoted line. Students tap to see what it could mean.</p>${t.map((w, i) => `<div class="three"><input data-tt="${i}" value="${H.esc(w.tone)}" placeholder="Tone (e.g. Annoyed)" aria-label="Tone"><input data-th="${i}" value="${H.esc(w.how)}" placeholder="How to say it" aria-label="How to say it"><div class="row"><input data-tm="${i}" value="${H.esc(w.means)}" placeholder="What it could mean" aria-label="What it could mean"><button class="btn small danger" data-td="${i}" aria-label="Remove tone card">✕</button></div></div>`).join('')}<button class="btn small" data-ta>+ Add tone card</button>`;
    const up = () => { if (t.length) c.tones = t; else delete c.tones; touch(); };
    [['tt', 'tone'], ['th', 'how'], ['tm', 'means']].forEach(([a, k]) => H.$$(`[data-${a}]`, box).forEach(i => i.oninput = () => { t[+i.dataset[a]][k] = i.value; up(); }));
    H.$$('[data-td]', box).forEach(b => b.onclick = () => { t.splice(+b.dataset.td, 1); up(); drawTones(c); });
    H.$('[data-ta]', box).onclick = () => { t.push({ tone: '', how: '', means: '' }); c.tones = t; touch(); drawTones(c); };
  }
  function drawAlt(c) {
    const box = H.$('#alt_' + c.id); c.alt = c.alt || { on: false }; const a = c.alt;
    box.innerHTML = `<label class="opt"><input type="checkbox" data-aon ${a.on ? 'checked' : ''}> Give the second student a different, comparable question in “Both practice each skill” sessions</label>
      ${a.on ? `<label>Context <span class="muted small">(optional)</span><textarea data-af="context" rows="2">${H.esc(a.context || '')}</textarea></label>
        <label>Second-student question<input data-af="question" value="${H.esc(a.question || '')}"></label>
        <label>Picture <span class="muted small">(optional; uses the main picture if empty)</span></label><div id="apic_${c.id}"></div>
        <div id="aans_${c.id}"></div>
        <label>Answer explanation<input data-af="explanation" value="${H.esc(a.explanation || '')}"></label>` : ''}`;
    H.$('[data-aon]', box).onchange = e => { a.on = e.target.checked; if (a.on && c.kind === 'choice' && !a.choices) { a.choices = ['', '']; a.correct = []; } touch(); drawAlt(c); refreshRow(c); };
    H.$$('[data-af]', box).forEach(i => i.oninput = () => { a[i.dataset.af] = i.value; touch(); refreshRow(c); });
    if (a.on) { drawPic(c, H.$('#apic_' + c.id), a, 'image'); if (c.kind === 'choice') drawAnswerEd(c, H.$('#aans_' + c.id), a); else H.$('#aans_' + c.id).innerHTML = c.kind === 'sort' ? '<p class="small muted">Sort cards use the same boxes and cards for both students.</p>' : ''; }
  }
  function drawQRec(c) {
    const box = H.$('#qrec_' + c.id);
    box.innerHTML = c.questionRec ? `<button class="btn small" data-qplay>${H.icon('play')} Play</button><button class="btn small" data-qrep>Replace</button><button class="btn small danger" data-qrm>Remove</button>` : `<button class="btn small" data-qrep>Upload a recording</button>${H.voice.hasRecording(c.question) ? '<span class="small muted">This question already has a warm-voice recording.</span>' : '<span class="small muted">No recording: the computer voice reads it.</span>'}`;
    const pl = H.$('[data-qplay]', box); if (pl) pl.onclick = () => H.voice.speak(c.question || ' ', { rec: c.questionRec });
    H.$('[data-qrep]', box).onclick = async () => { const f = await H.media.pickFile('audio/*'); if (!f) return; try { c.questionRec = await H.media.upload(f, 'audio'); touch(); drawQRec(c); H.toast('Recording added.'); } catch (e) { H.toast(e.message, 'error'); } };
    const rm = H.$('[data-qrm]', box); if (rm) rm.onclick = async () => { if (!await H.confirm('Remove your recording?', '<p>The question will use the warm voice or computer voice instead.</p>', 'Remove')) return; delete c.questionRec; touch(); drawQRec(c); };
  }

  /* media list editor shared by lesson and card media */
  function mediaEditor(box, getArr, kinds) {
    const arr = getArr();
    box.innerHTML = `${arr.map((m, i) => `<div class="medit panel-sub">${H.media.itemHTML(m)}
      <div class="two"><div><label>Title<input data-mt="${i}" value="${H.esc(m.title || '')}"></label></div><div><label>Description<input data-md="${i}" value="${H.esc(m.description || '')}"></label></div></div>
      <div class="two">${m.kind === 'link' || m.kind === 'video' && !m.ref ? `<div><label>Link (https://…)<input data-mu="${i}" value="${H.esc(m.url || '')}"></label></div>` : ''}<div><label>SLP pause-point notes<input data-mp="${i}" value="${H.esc(m.pause || '')}" placeholder="Pause at 0:35"></label></div></div>
      <div class="row">${m.ref ? `<button class="btn small" data-mrep="${i}">Replace file</button>` : ''}<button class="btn small" data-mup="${i}" ${i === 0 ? 'disabled' : ''}>Move up</button><button class="btn small danger" data-mrm="${i}">Remove</button></div></div>`).join('') || '<p class="small muted">None added.</p>'}
      <div class="row">${kinds.includes('image') ? '<button class="btn small" data-madd="image">+ Picture</button>' : ''}${kinds.includes('audio') ? '<button class="btn small" data-madd="audio">+ Audio file</button>' : ''}${kinds.includes('video') ? '<button class="btn small" data-madd="video">+ Video file</button>' : ''}${kinds.includes('link') ? '<button class="btn small" data-madd="link">+ Video link</button>' : ''}</div>`;
    H.media.wire(box, arr);
    const redraw = () => mediaEditor(box, getArr, kinds);
    H.$$('[data-mt]', box).forEach(i => i.oninput = () => { arr[+i.dataset.mt].title = i.value; touch(); });
    H.$$('[data-md]', box).forEach(i => i.oninput = () => { arr[+i.dataset.md].description = i.value; touch(); });
    H.$$('[data-mp]', box).forEach(i => i.oninput = () => { arr[+i.dataset.mp].pause = i.value; touch(); });
    H.$$('[data-mu]', box).forEach(i => i.onchange = () => { arr[+i.dataset.mu].url = i.value.trim(); if (!H.media.safeUrl(i.value)) H.toast('Links must start with https://', 'error'); touch(); redraw(); });
    H.$$('[data-mup]', box).forEach(b => b.onclick = () => { const k = +b.dataset.mup; [arr[k - 1], arr[k]] = [arr[k], arr[k - 1]]; touch(); redraw(); });
    H.$$('[data-mrm]', box).forEach(b => b.onclick = async () => { const k = +b.dataset.mrm; if (!await H.confirm('Remove this media?', `<p>“${H.esc(arr[k].title || arr[k].kind)}” will be removed from this lesson when you save.</p>`, 'Remove')) return; H.media.stopAll(); arr.splice(k, 1); touch(); redraw(); });
    H.$$('[data-mrep]', box).forEach(b => b.onclick = async () => { const m = arr[+b.dataset.mrep]; const f = await H.media.pickFile(m.kind + '/*'); if (!f) return; try { H.media.stopAll(); m.ref = await H.media.upload(f, m.kind); touch(); redraw(); H.toast('Replaced.'); } catch (e) { H.toast(e.message, 'error'); } });
    H.$$('[data-madd]', box).forEach(b => b.onclick = async () => {
      const k = b.dataset.madd;
      if (k === 'link') { arr.push({ id: H.uid('m_'), kind: 'link', title: '', description: '', pause: '', url: '' }); touch(); redraw(); return; }
      const f = await H.media.pickFile(k + '/*'); if (!f) return;
      b.disabled = true; b.textContent = 'Adding…';
      try { const ref = await H.media.upload(f, k); arr.push({ id: H.uid('m_'), kind: k, title: f.name.replace(/\.[^.]+$/, ''), description: '', pause: '', ref }); touch(); H.toast('Added ' + f.name + '.'); }
      catch (e) { H.toast(e.message, 'error'); }
      redraw();
    });
  }

  /* picture chooser: built-in scenes or upload */
  function pickPicture() {
    return new Promise(res => {
      const imgs = H.media.builtInImages();
      const m = H.modal(`<h2 id="modal-title">Choose a picture</h2><div class="row"><button class="btn primary" id="pp_up">Upload a picture…</button><span class="small muted">PNG or JPG. Large photos are shrunk to save space.</span></div>
        <h3>SCOPE scenes</h3><div class="picgrid">${imgs.map(p => `<button class="picopt" data-p="${H.esc(p)}" aria-label="${H.esc(p.split('/').pop().replace('.webp', '').replace(/-/g, ' '))}"><img alt="" loading="lazy" src="${H.esc(p)}"></button>`).join('')}</div>
        <div class="actions"><button class="btn" data-close>Cancel</button></div>`, { wide: true, onClose: () => res(null) });
      H.$$('[data-p]', m).forEach(b => b.onclick = () => { H.closeModal(); res(b.dataset.p); });
      H.$('#pp_up', m).onclick = async () => { const f = await H.media.pickFile('image/*'); if (!f) return; try { const r = await H.media.upload(f, 'image'); H.closeModal(); res(r); } catch (e) { H.toast(e.message, 'error'); } };
    });
  }

  function showErrors() {
    const box = H.$('#ed_errors'); if (!box || !W) return;
    const per = W.sets.map(s => ({ s, iss: H.L.validateSet(s) })).filter(x => x.iss.length);
    box.innerHTML = per.length ? `<div class="panel warn"><b>${W.status === 'ready' ? 'Fix these before this lesson can start:' : 'Still to finish (the lesson stays a draft until these are fixed):'}</b><ul>${per.map(x => x.iss.slice(0, 8).map(i => `<li>${H.esc(x.s.name)} · ${H.esc(i)}</li>`).join('') + (x.iss.length > 8 ? `<li>…and ${x.iss.length - 8} more in ${H.esc(x.s.name)}</li>` : '')).join('')}</ul></div>` : '';
  }

  async function save() {
    draftSave.cancel();
    if (!String(W.title || '').trim()) { H.toast('Give the lesson a title first.', 'error'); H.$('#f_title').focus(); return false; }
    if (W.status === 'ready') {
      const bad = W.sets.flatMap(s => H.L.validateSet(s));
      if (bad.length || !W.sets.length) { showErrors(); H.toast('This lesson has problems, so it can’t be marked Ready. Fix them, or uncheck “Ready to use” to save it as a draft.', 'error'); return false; }
    }
    W.updatedAt = Date.now();
    const ok = await (async () => { try { H.saveStatus('saving'); await H.store.batch([{ store: 'lessons', put: W }, { store: 'drafts', del: W.id }]); H.saveStatus('saved'); return true; } catch (e) { H.saveStatus('error'); H.toast('The lesson was not saved. ' + H.storageError(e), 'error'); return false; } })();
    if (ok) { dirty = false; base = H.clone(W); status('saved'); const r = H.$('#restored'); r && r.remove(); H.toast('Lesson saved.'); drawSets(); }
    return ok;
  }
  async function close() {
    draftSave.flush();
    if (dirty) {
      const m = H.modal(`<h2 id="modal-title">You have unsaved changes</h2><p>They are kept as a draft on this laptop, so you can come back to them. The lesson itself still has its last saved version.</p><div class="actions col"><button class="btn go" id="cl_save">Save lesson and close</button><button class="btn" id="cl_keep">Close and keep the draft</button><button class="btn danger" id="cl_drop">Discard changes</button><button class="btn" data-close>Keep editing</button></div>`);
      H.$('#cl_save', m).onclick = async () => { H.closeModal(); if (await save()) H.go('#/lessons'); };
      H.$('#cl_keep', m).onclick = () => { H.closeModal(); H.go('#/lessons'); };
      H.$('#cl_drop', m).onclick = async () => { H.closeModal(); if (!await H.confirm('Discard changes?', '<p>Your unsaved edits to this lesson will be deleted.</p>', 'Discard')) return; await H.store.del('drafts', W.id); dirty = false; H.go('#/lessons'); };
      return;
    }
    H.go('#/lessons');
  }
})(window.H);
