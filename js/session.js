/* Session runner: one question at a time, explicit turns, SLP-controlled advancing, autosave + resume. */
(function (H) {
  'use strict';
  let S = null, timer = null, saving = false;
  const Ses = H.session = {};

  /* ---------- state ---------- */
  Ses.newState = (L, set, length, mode, order, cards, marked) => {
    const students = (marked || order).map(s => ({ id: s.id, name: s.name }));
    return {
      key: 'current', id: H.uid('sess_'), preview: mode === 'preview',
      lessonId: L.id, lessonTitle: L.title, lessonNumber: L.number || null, unit: L.unit || '', goal: L.goal || '', slpNotes: L.slpNotes || '',
      video: H.clone(L.video || {}), media: H.clone(L.media || []),
      setId: set.id, setName: set.name, length, mode,
      students, studentNames: students.map(s => s.name), order: order.map(s => s.id),
      cards: H.clone(cards), turns: H.buildTurns(cards, mode, order.map(s => s.id)),
      pos: 0, responses: {}, revealed: {}, startedAt: Date.now(), pausedMs: 0, pausedAt: null,
      phase: 'cards', notes: {}, minutes: null, date: H.todayISO()
    };
  };
  const persist = H.debounce(async () => { if (S && !S.preview && !S.closing) return await H.store.save('active', S, 'Session progress'); return true; }, 250);
  const persistNow = async () => { if (!S || S.preview) return true; return persist.flush(); };

  const stu = id => S.students.find(s => s.id === id);
  const markIdx = id => S.students.findIndex(s => s.id === id);
  const turn = () => S.turns[S.pos];
  const cardOf = t => S.cards[t.cardIdx];
  const view = t => { const c = cardOf(t); return t.variant === 'alt' && c.alt && c.alt.on ? Object.assign({}, c, c.alt, { id: c.id, role: c.role, kind: c.kind, alt: c.alt }) : c; };
  const resp = t => S.responses[t.id];
  const ensureResp = t => {
    if (!S.responses[t.id]) { const c = cardOf(t); S.responses[t.id] = { turnId: t.id, cardId: c.id, cardIdx: t.cardIdx, studentId: t.studentId, variant: t.variant, role: c.role, kind: c.kind, question: view(t).question, attempts: [], round: 1, verbal: '', note: '', rating: null }; }
    return S.responses[t.id];
  };
  const partner = t => t.group ? S.turns.find(x => x.group === t.group && x.id !== t.id) : null;
  const elapsed = () => { if (!S) return 0; const p = S.pausedMs + (S.pausedAt ? Date.now() - S.pausedAt : 0); return Math.max(0, Date.now() - S.startedAt - p); };
  const mmss = ms => { const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

  /* ---------- entry points ---------- */
  Ses.resume = async () => {
    const a = await H.store.get('active', 'current');
    if (!a) { H.toast('There is no unfinished session.'); H.go('#/lessons'); return; }
    S = a; render();
  };
  Ses.preview = async id => {
    const L = await H.store.get('lessons', id);
    if (!L) { H.go('#/lessons'); return; }
    const sets = H.L.usableSets(L);
    if (!sets.length) { H.toast('This lesson has no complete cards to preview yet.', 'error'); H.go('#/edit/' + encodeURIComponent(id)); return; }
    S = Ses.newState(L, sets[0], 'full', 'preview', [], sets[0].cards, []);
    S.allSets = sets.map(s => ({ id: s.id, name: s.name, cards: s.cards }));
    render();
  };
  Ses.leaving = () => { clearInterval(timer); timer = null; if (S && !S.preview) persist.flush(); S = null; };

  /* ---------- layout ---------- */
  function render() {
    H.media.stopAll();
    clearInterval(timer);
    document.title = S.lessonTitle + ' · SCOPE Lesson Hub';
    if (S.phase === 'summary') return renderSummary();
    const t = turn();
    const app = H.$('#app');
    app.innerHTML = `<div class="sess">
      <div class="sbar">
        <button class="btn ghost" id="x_exit" aria-label="Leave session">✕ Leave</button>
        <div class="stitle"><div class="t1">${S.lessonNumber ? S.lessonNumber + '. ' : ''}${H.esc(S.lessonTitle)}</div><div class="t2">${S.preview ? '<b>Preview · nothing is saved</b>' : H.esc(S.studentNames.join(' + '))} · ${H.esc(S.setName)}${S.length === 'short' ? ' · short' : ''}${S.mode === 'alternate' ? ' · alternate questions' : S.mode === 'both' ? ' · both practice each skill' : ''}</div></div>
        ${S.preview && S.allSets && S.allSets.length > 1 ? `<label class="sr" for="pv_set">Part</label><select id="pv_set" class="pv-set">${S.allSets.map(s => `<option value="${H.esc(s.id)}" ${s.id === S.setId ? 'selected' : ''}>${H.esc(s.name)}</option>`).join('')}</select>` : ''}
        <div class="prog" aria-label="Card ${S.pos + 1} of ${S.turns.length}"><span>Turn ${S.pos + 1} of ${S.turns.length}</span><div class="bar"><i style="width:${Math.round(S.pos * 100 / S.turns.length)}%"></i></div></div>
        <span class="timer" id="tmr" aria-label="Time">${mmss(elapsed())}</span>
        <span id="savestate" class="savestate" role="status" aria-live="polite"></span>
        <button class="btn" id="x_pause">${H.icon('pause')} Pause</button>
      </div>
      ${bannerHTML(t)}
      <main class="stage" id="stage"></main>
      <section class="slp" id="slp" aria-label="SLP controls"></section>
      <div class="paused ${S.pausedAt ? '' : 'hidden'}" id="paused" role="dialog" aria-label="Paused"><div><div class="pz">Paused</div><p>The lesson is hidden. Nothing is lost.</p><button class="btn go big" id="x_resume">Resume</button></div></div>
    </div>`;
    drawStage(t); drawSlp(t);
    H.$('#x_exit').onclick = leaveDialog;
    H.$('#x_pause').onclick = pause;
    H.$('#x_resume').onclick = unpause;
    const pv = H.$('#pv_set'); if (pv) pv.onchange = () => { const s = S.allSets.find(x => x.id === pv.value); const all = S.allSets; S = Ses.newState({ id: S.lessonId, title: S.lessonTitle, number: S.lessonNumber, unit: S.unit, goal: S.goal, slpNotes: S.slpNotes, video: S.video, media: S.media }, s, 'full', 'preview', [], s.cards, []); S.allSets = all; render(); };
    timer = setInterval(() => { const el = H.$('#tmr'); if (el && S) el.textContent = mmss(elapsed()); }, 1000);
    const st = H.$('#stage'); st && st.focus && st.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  function bannerHTML(t) {
    if (S.preview) return `<div class="turnbar preview" role="status">Preview: try the cards as a student would. Ratings are off.</div>`;
    if (!t.studentId) return `<div class="turnbar shared" role="status"><span class="mark both" aria-hidden="true">✦</span><span class="who">Talk together: ${H.esc(S.studentNames.join(' and '))}</span><span class="sub">Shared card · no individual score</span></div>`;
    const s = stu(t.studentId), i = markIdx(t.studentId);
    const p = partner(t);
    const sub = t.variant === 'alt' ? 'Second-student question' : p && t.hideUntilBoth ? 'Same question for both · answer stays hidden until both answer' : S.students.length > 1 ? 'Only ' + s.name + '’s answer is recorded' : '';
    return `<div class="turnbar ${H.MARKS[i].cls}" role="status" aria-live="polite">${H.markHTML(i, true)}<span class="who">${H.esc(s.name)}, your turn.</span>${sub ? `<span class="sub">${H.esc(sub)}</span>` : ''}</div>`;
  }

  /* ---------- student stage ---------- */
  function drawStage(t) {
    const c = view(t), r = resp(t), stage = H.$('#stage');
    const steps = H.L.steps(), stp = c.step && steps[c.step];
    const roleLabel = (H.L.ROLES[c.role] || {}).short || (H.L.ROLES[c.role] || {}).label || '';
    const verb = k => ({ think: 'thinks', whisper: 'whispers', text: 'texts' }[k] || 'says');
    const saysHTML = (c.says || []).length ? `<div class="says">${c.says.map(s => `<div class="say-line ${s.kind === 'text' ? 'is-text' : ''}"><span class="spkr">${H.esc(s.who || 'Someone')} ${verb(s.kind)}:</span> <q>${H.esc(s.text)}</q> ${H.voice.btn(s.text)}</div>`).join('')}</div>` : '';
    const fig = c.image ? `<figure class="fig"><div class="figwrap"><img data-ref="${H.esc(c.image)}" alt="${H.esc(c.imageAlt || 'Lesson picture')}">${(c.clues || []).map((k, i) => `<button class="clue-dot" data-clue="${i}" style="left:${k.x}%;top:${k.y}%" aria-label="Clue ${i + 1}">${i + 1}</button>`).join('')}</div>
        ${(c.clues || []).length ? `<p class="small muted tapclues">Tap the numbered circles to find clues.</p><ol class="clue-list" id="cluelist"></ol>` : ''}
        ${saysHTML}
      </figure>` : '';
    const line = c.line ? `<div class="bigline"><q>${H.esc(c.line)}</q>${c.needsModeling ? '<span class="tag model">SLP models the tone</span>' : ''}</div>${c.needsModeling ? '<p class="small muted center">Listen to how your SLP says it.</p>' : ''}` : '';
    const tones = (c.tones || []).length ? `<div class="tones">${c.tones.map((w, i) => `<button class="tone" data-tone="${i}"><b>${H.esc(w.tone)}</b><span class="how">Say it: ${H.esc(w.how)}</span><span class="means hidden">${H.esc(w.means)}</span><span class="tapto small">Tap to see what it could mean</span></button>`).join('')}</div>` : '';
    stage.innerHTML = `<article class="qcard ${c.image ? 'has-fig' : ''}" aria-label="Card">
      <div class="qhead">${stp ? `<span class="stepbadge" style="--c:${stp.color}"><b>${c.step}</b> ${H.esc(stp.word)}</span>` : ''}<span class="rolechip r-${c.role}">${H.esc(c.heading && !(stp && c.heading.endsWith(stp.word)) ? c.heading : roleLabel)}</span>${c.role === 'check' && !S.preview ? '<span class="rolechip scored">Scored</span>' : ''}</div>
      ${fig}
      <div class="qmain">
        ${c.context ? `<p class="context">${H.esc(c.context)} ${H.voice.btn(c.context)}</p>` : ''}
        ${c.image ? '' : saysHTML}${line}${tones}
        <div class="qrow"><h2 class="question">${H.esc(c.question)}</h2>${H.voice.btn(c.question, t.variant === 'main' ? c.questionRec : (c.alt && c.alt.questionRec))}</div>
        <div id="answer"></div>
        ${c.hint ? `<div class="hintbox"><button class="btn small" id="hintbtn">Need a hint?</button><p class="hint hidden" id="hinttxt">${H.esc(c.hint)} ${H.voice.btn(c.hint)}</p></div>` : ''}
        ${(c.starters || []).length ? `<div class="starters" aria-label="Sentence starters"><span class="small muted">Sentence starters:</span>${c.starters.map(s => `<button class="starter" data-say="${H.esc(s)}">${H.esc(s)}</button>`).join('')}</div>` : ''}
        ${(c.prompts || []).length ? `<ul class="prompts">${c.prompts.map(p => `<li>${H.esc(p)} ${H.voice.btn(p)}</li>`).join('')}</ul>` : ''}
        <div id="feedback" aria-live="polite"></div>
        ${(c.media || []).length ? `<div class="card-media">${c.media.map(m => H.media.itemHTML(m, { slp: false })).join('')}</div>` : ''}
      </div></article>`;
    H.media.hydrate(stage);
    if ((c.media || []).length) H.media.wire(stage, c.media);
    H.$$('[data-clue]', stage).forEach(b => b.onclick = () => {
      const i = +b.dataset.clue, k = c.clues[i]; b.classList.add('found');
      const list = H.$('#cluelist'); if (!H.$(`[data-cl="${i}"]`, list)) { const li = document.createElement('li'); li.dataset.cl = i; li.value = i + 1; li.innerHTML = `${k.step && steps[k.step] ? `<span class="mini" style="--c:${steps[k.step].color}">${k.step}</span>` : ''}${H.esc(k.label)}`; list.appendChild(li); }
      H.voice.speak(k.label);
      r0().found = Array.from(new Set([...(r0().found || []), i])); persist();
      if (c.cluesFirst && (r0().found || []).length >= c.clues.length) drawAnswer(t);
    });
    // restore clues found earlier
    const prev = r && r.found || [];
    prev.forEach(i => { const b = H.$(`[data-clue="${i}"]`, stage); if (b) { b.classList.add('found'); const k = c.clues[i]; const li = document.createElement('li'); li.dataset.cl = i; li.value = i + 1; li.innerHTML = `${k.step && steps[k.step] ? `<span class="mini" style="--c:${steps[k.step].color}">${k.step}</span>` : ''}${H.esc(k.label)}`; H.$('#cluelist').appendChild(li); } });
    H.$$('[data-tone]', stage).forEach(b => b.onclick = () => { b.querySelector('.means').classList.remove('hidden'); const tt = b.querySelector('.tapto'); tt && tt.remove(); });
    const hb = H.$('#hintbtn'); if (hb) hb.onclick = () => { H.$('#hinttxt').classList.remove('hidden'); hb.remove(); const rr = r0(); rr.hintShown = true; persist(); };
    if (r && r.hintShown && hb) { H.$('#hinttxt').classList.remove('hidden'); hb.remove(); }
    drawAnswer(t);
  }
  const r0 = () => ensureResp(turn());

  /* hidden = this turn's feedback must wait for the partner */
  function hiddenState(t) {
    if (!t.hideUntilBoth) return { hidden: false };
    const p = partner(t), pr = p && resp(p), mine = resp(t);
    const revealed = !!S.revealed[t.group];
    const bothAnswered = !!(mine && mine.attempts.length && pr && pr.attempts.length);
    const openDone = !!(mine && mine.ready && pr && pr.ready);
    return { hidden: !revealed, revealed, bothAnswered: bothAnswered || openDone, partner: p };
  }

  function drawAnswer(t) {
    const c = view(t), box = H.$('#answer'), fb = H.$('#feedback'); if (!box) return;
    const r = resp(t), hs = hiddenState(t);
    const roundAttempts = r ? r.attempts.filter(a => a.round === r.round) : [];
    fb.innerHTML = '';
    if (c.kind === 'open') {
      box.innerHTML = `<p class="openq">${S.students.length > 1 && t.studentId ? H.esc(stu(t.studentId).name) + ', say' : 'Say'} your answer out loud.</p>`;
      if (hs.revealed || (!t.hideUntilBoth && r && r.showSample)) showSample(c, fb);
      if (t.hideUntilBoth && !hs.revealed) fb.innerHTML = hs.bothAnswered ? revealBtn() : '';
      wireReveal(t);
      return;
    }
    if (c.kind === 'sort') return drawSort(t, c, box, fb);
    // choice
    if (c.cluesFirst && (c.clues || []).length && !((r && r.found || []).length >= c.clues.length) && !(r && r.showChoices) && !roundAttempts.length) {
      box.innerHTML = `<p class="muted kid">Find all ${c.clues.length} clues in the picture first.</p><button class="btn small" id="showch">Show the answer choices now</button>`;
      H.$('#showch').onclick = () => { r0().showChoices = true; persist(); drawAnswer(t); }; return;
    }
    const corr = new Set(c.correct || []);
    const wrong = new Set(roundAttempts.filter(a => !a.correct).flatMap(a => a.choice));
    const gotRight = roundAttempts.some(a => a.correct);
    const finished = !t.hideUntilBoth && (gotRight || roundAttempts.filter(a => !a.correct).length >= 2);
    const last = roundAttempts[roundAttempts.length - 1];
    const selected = new Set(c.selectAll ? (r && r.pending || (last ? last.choice : [])) : (last ? last.choice : []));
    const showTruth = finished || hs.revealed;
    box.innerHTML = `${c.selectAll ? '<p class="small muted">Choose all that are right. Then press Check.</p>' : ''}<div class="choices ${c.choices.length > 3 ? 'many' : ''}" role="group" aria-label="Answer choices">${c.choices.map((ch, i) => {
      let cls = 'choice';
      if (showTruth) cls += corr.has(i) ? ' right' : selected.has(i) || wrong.has(i) ? ' wrong' : ' dim';
      else if (!t.hideUntilBoth && wrong.has(i)) cls += ' wrong';
      else if (selected.has(i)) cls += ' sel';
      const dis = showTruth || (!t.hideUntilBoth && wrong.has(i) && !c.selectAll);
      return `<button class="${cls}" data-c="${i}" ${dis ? 'disabled' : ''} aria-pressed="${selected.has(i)}"><span class="cl" aria-hidden="true">${String.fromCharCode(65 + i)}</span><span>${H.esc(ch)}</span>${showTruth && corr.has(i) ? '<span class="sr"> (correct)</span>' : ''}</button>`;
    }).join('')}</div>${c.selectAll && !showTruth ? '<div class="row center"><button class="btn go" id="chk">Check</button></div>' : ''}`;
    H.$$('[data-c]', box).forEach(b => b.onclick = () => choose(t, +b.dataset.c));
    const ck = H.$('#chk'); if (ck) ck.onclick = () => checkSelectAll(t);
    // feedback
    if (showTruth) {
      fb.innerHTML = `<div class="fb ${gotRight || (hs.revealed && last && last.correct) ? 'ok' : 'no'}">${c.explanation ? H.esc(c.explanation) + ' ' + H.voice.btn(c.explanation) : 'The highlighted answer is correct.'}</div>${hs.revealed ? bothAnswersHTML(t) : ''}`;
    } else if (t.hideUntilBoth) {
      fb.innerHTML = last ? (hs.bothAnswered ? revealBtn() : `<div class="fb wait">Answer saved. ${hs.partner && hs.partner.id === S.turns[S.pos + 1]?.id ? 'Next it’s ' + H.esc(stu(hs.partner.studentId).name) + '’s turn.' : 'The answer shows after both students answer.'}</div>`) : '';
    } else if (roundAttempts.length && !gotRight) {
      fb.innerHTML = `<div class="fb no">Look again. ${H.esc(c.hint || 'Check the clues.')}</div>`;
    }
    wireReveal(t);
    drawSlpEvidence(t);
  }
  const revealBtn = () => `<div class="fb wait">Both students answered. <button class="btn go" id="reveal">Show the answer</button></div>`;
  function wireReveal(t) { const b = H.$('#reveal'); if (b) b.onclick = () => { S.revealed[t.group] = true; persist(); drawAnswer(t); drawSlp(t); }; }
  function bothAnswersHTML(t) {
    const ts = S.turns.filter(x => x.group === t.group);
    return `<ul class="both-ans">${ts.map(x => { const rr = resp(x), c = view(x); const a = rr && rr.attempts[rr.attempts.length - 1]; const i = markIdx(x.studentId); return `<li>${H.markHTML(i)} <b>${H.esc(stu(x.studentId).name)}</b> chose: ${a ? H.esc(answerText(c, a)) + (a.correct === true ? ' ✓' : a.correct === false ? ' ✗' : '') : '<i>no answer</i>'}</li>`; }).join('')}</ul>`;
  }
  function showSample(c, fb) {
    const ideas = c.sampleIdeas || [];
    fb.innerHTML = `<div class="sample"><div class="sample-h">${ideas.length ? 'Some ideas' : 'Sample answer'}</div>${c.sampleAnswer ? `<p>${H.esc(c.sampleAnswer)} ${H.voice.btn(c.sampleAnswer)}</p>` : ''}${ideas.length ? `<ul>${ideas.map((a, i) => `<li class="${c.bestIdea === i ? 'best' : ''}">${H.esc(a)} ${H.voice.btn(a)}${c.bestIdea === i ? ' <span class="tag">best fit with the clues</span>' : ''}</li>`).join('')}</ul>` : ''}${c.explanation ? `<p>${H.esc(c.explanation)}</p>` : ''}${!c.sampleAnswer && !ideas.length && !c.explanation ? '<p class="muted">No sample answer was added for this card.</p>' : ''}</div>`;
  }

  function choose(t, i) {
    const c = view(t), r = ensureResp(t), hs = hiddenState(t);
    if (S.pausedAt || hs.revealed) return;
    if (c.selectAll) {
      const cur = new Set(r.pending || []); cur.has(i) ? cur.delete(i) : cur.add(i); r.pending = Array.from(cur).sort();
      persist(); drawAnswer(t); return;
    }
    const corr = (c.correct || []).includes(i);
    r.attempts.push({ choice: [i], text: c.choices[i], correct: corr, round: r.round, at: Date.now() });
    persist(); drawAnswer(t);
  }
  function checkSelectAll(t) {
    const c = view(t), r = ensureResp(t), sel = (r.pending || []).slice().sort();
    if (!sel.length) { H.toast('Choose at least one answer, then press Check.'); return; }
    const ok = (c.correct || []).slice().sort().join(',') === sel.join(',');
    r.attempts.push({ choice: sel, text: sel.map(i => c.choices[i]).join('; '), correct: ok, round: r.round, at: Date.now() });
    r.pending = ok ? sel : [];
    persist(); drawAnswer(t);
  }
  function answerText(c, a) {
    if (a.text != null) return a.text;
    return (a.choice || []).map(i => (c.choices || [])[i]).join('; ');
  }

  /* ---------- sort cards ---------- */
  function drawSort(t, c, box, fb) {
    const r = ensureResp(t), hs = hiddenState(t);
    const roundAttempts = r.attempts.filter(a => a.round === r.round);
    const place = r.place || (r.place = {});
    const done = roundAttempts.some(a => a.correct) || roundAttempts.length >= 2 || hs.revealed;
    const items = c.sort.items, bins = c.sort.bins;
    const unplaced = items.map((x, i) => i).filter(i => place[i] == null);
    const sel = r.sortSel;
    box.innerHTML = `${/tap a box/i.test(c.question) ? '' : '<p class="small muted">Tap a card, then tap a box.</p>'}<div class="sortcards">${unplaced.map(i => `<button class="scard ${sel === i ? 'sel' : ''}" data-si="${i}" aria-pressed="${sel === i}">${H.esc(items[i].text)}</button>`).join('') || '<span class="muted">All cards are in a box.</span>'}</div>
      <div class="bins">${bins.map((b, bi) => `<div class="bin" data-b="${bi}" role="button" tabindex="0" aria-label="Box: ${H.esc(b)}"><h3>${H.esc(b)}</h3>${items.map((x, i) => place[i] === bi ? `<button class="scard ${done && (!t.hideUntilBoth || hs.revealed) ? (x.bin === bi ? 'right' : 'wrong') : ''}" data-back="${i}" aria-label="${H.esc(x.text)}, in ${H.esc(b)}. Tap to take it out.">${H.esc(x.text)}</button>` : '').join('')}</div>`).join('')}</div>
      ${!unplaced.length && !done ? '<div class="row center"><button class="btn go" id="scheck">Check</button></div>' : ''}`;
    H.$$('[data-si]', box).forEach(b => b.onclick = () => { r.sortSel = +b.dataset.si; persist(); drawSort(t, c, box, fb); });
    H.$$('[data-b]', box).forEach(b => { const go = e => { if (e.target.closest('[data-back]') || r.sortSel == null || done) return; place[r.sortSel] = +b.dataset.b; r.sortSel = null; persist(); drawSort(t, c, box, fb); }; b.onclick = go; b.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(e); } }; });
    H.$$('[data-back]', box).forEach(b => b.onclick = () => { if (done) return; delete place[+b.dataset.back]; persist(); drawSort(t, c, box, fb); });
    const sc = H.$('#scheck'); if (sc) sc.onclick = () => {
      const wrongs = items.map((x, i) => i).filter(i => place[i] !== items[i].bin);
      r.attempts.push({ text: wrongs.length ? `${items.length - wrongs.length} of ${items.length} sorted correctly` : 'All sorted correctly', correct: !wrongs.length, round: r.round, at: Date.now(), place: Object.assign({}, place) });
      if (wrongs.length && r.attempts.filter(a => a.round === r.round).length < 2 && !t.hideUntilBoth) { wrongs.forEach(i => delete place[i]); }
      persist(); drawSort(t, c, box, fb);
    };
    fb.innerHTML = '';
    const last = roundAttempts[roundAttempts.length - 1];
    if (done && (!t.hideUntilBoth || hs.revealed)) fb.innerHTML = `<div class="fb ${last && last.correct ? 'ok' : 'no'}">${last && !last.correct ? 'The red cards belong in the other box. ' : ''}${H.esc(c.explanation || '')}</div>${hs.revealed ? bothAnswersHTML(t) : ''}`;
    else if (t.hideUntilBoth && last) fb.innerHTML = hs.bothAnswered ? revealBtn() : '<div class="fb wait">Answer saved. It shows after both students answer.</div>';
    else if (last && !last.correct) fb.innerHTML = `<div class="fb no">${items.length - (last.text.match(/^\d+/) || [items.length])[0]} card(s) came back. Try those again.</div>`;
    wireReveal(t); drawSlpEvidence(t);
  }

  /* ---------- SLP panel ---------- */
  function drawSlp(t) {
    const c = view(t), slp = H.$('#slp'), r = resp(t);
    const isLast = S.pos === S.turns.length - 1;
    const scored = c.role === 'check';
    const canRate = !S.preview && !!t.studentId;
    const hs = hiddenState(t);
    slp.innerHTML = `<div class="slp-l">
        ${canRate ? `<div class="rate" role="radiogroup" aria-label="Rating for ${H.esc(stu(t.studentId).name)}"><span class="lbl">${scored ? 'Rating (required)' : 'Rating (optional)'}:</span>${H.L.RATINGS.filter(x => x.k !== 'S' && (scored ? x.k !== 'N' : true)).map(x => `<button role="radio" aria-checked="${r && r.rating === x.k}" class="rbtn r${x.k} ${r && r.rating === x.k ? 'on' : ''}" data-rate="${x.k}">${x.label}</button>`).join('')}${r && r.rating === 'S' ? '<span class="tag">Skipped</span>' : ''}</div>
        ${(() => { const p = partner(t), pr = p && resp(p); if (!p || !t.hideUntilBoth || !S.revealed[t.group] || !pr || p.studentId === t.studentId) return ''; return `<div class="rate partner-rate" role="radiogroup" aria-label="Rating for ${H.esc(stu(p.studentId).name)}"><span class="lbl">${H.markHTML(markIdx(p.studentId))} ${H.esc(stu(p.studentId).name)}’s answer:</span>${H.L.RATINGS.filter(x => x.k !== 'S' && (scored ? x.k !== 'N' : true)).map(x => `<button role="radio" aria-checked="${pr.rating === x.k}" class="rbtn ${pr.rating === x.k ? 'on' : ''}" data-prate="${x.k}">${x.label}</button>`).join('')}</div>`; })()}
        <div class="evidence small" id="evidence"></div>
        <div class="slp-inputs ${r && (r.verbal || r.note) || S.showInputs ? '' : 'hidden'}" id="slpin"><label>Student said (optional)<input id="verbal" value="${H.esc(r ? r.verbal : '')}" placeholder="Type the student’s words"></label><label>Note<input id="note" value="${H.esc(r ? r.note : '')}" placeholder="Prompts used, ideas"></label></div>` : (S.preview ? '<p class="small">Preview: ratings are off and nothing is saved.</p>' : '<p class="small">Shared talk card. Nothing is scored. Use the session notes at the end for anything to remember.</p>')}
        <div class="row slp-tools">
          ${canRate ? `<button class="btn small" id="togin" aria-expanded="${!H.$('#slpin') || !H.$('#slpin').classList.contains('hidden')}">Student’s words / note</button>` : ''}
          ${c.kind === 'open' ? `<button class="btn small" id="sample" ${t.hideUntilBoth && !hs.revealed ? 'disabled title="Hidden until both students answer"' : ''}>${r && r.showSample ? 'Hide' : 'Show'} sample answer</button>${t.hideUntilBoth && !hs.revealed ? '<button class="btn small" id="ready">Mark answered</button>' : ''}` : ''}
          ${c.modeling ? `<button class="btn small" id="peek">Hold: how to say it</button><span class="peekout hidden" id="peekout">Say it: <b>${H.esc(c.modeling.say)}</b>. ${H.esc(c.modeling.how || '')}</span>` : ''}
          ${c.slpNote ? `<details class="slpnote"><summary>SLP directions</summary><p>${H.esc(c.slpNote)}</p></details>` : ''}
          <button class="btn small" id="lnotes">Lesson notes</button>
          ${(S.video && S.video.url) || (S.media || []).length ? `<button class="btn small" id="lmedia">${H.icon('video')} Lesson media</button>` : ''}
        </div>
      </div>
      <div class="slp-r">
        <button class="btn" id="n_back" ${S.pos === 0 ? 'disabled' : ''}>← Back</button>
        ${canRate ? `<button class="btn" id="n_repeat">Repeat this turn</button>` : ''}
        ${canRate && S.students.length > 1 ? `<button class="btn" id="n_switch">Switch answering student</button>` : ''}
        ${canRate ? `<button class="btn" id="n_skip">Skip</button>` : ''}
        <button class="btn go big" id="n_next">${S.preview ? (isLast ? 'Finish preview' : 'Next →') : isLast ? 'Save and finish' : 'Save and next turn →'}</button>
      </div>`;
    H.$$('[data-rate]', slp).forEach(b => b.onclick = () => { const rr = ensureResp(t); rr.rating = rr.rating === b.dataset.rate && !scored ? null : b.dataset.rate; persist(); drawSlp(t); });
    H.$$('[data-prate]', slp).forEach(b => b.onclick = () => { const p = partner(t), pr = ensureResp(p); pr.rating = b.dataset.prate; pr.studentId = p.studentId; pr.savedAt = pr.savedAt || Date.now(); persist(); drawSlp(t); });
    const ti = H.$('#togin'), si = H.$('#slpin'); if (ti && si) { ti.setAttribute('aria-expanded', !si.classList.contains('hidden')); ti.onclick = () => { S.showInputs = si.classList.toggle('hidden') ? false : true; ti.setAttribute('aria-expanded', S.showInputs); if (S.showInputs) H.$('#verbal').focus(); }; }
    const vb = H.$('#verbal'); if (vb) vb.oninput = () => { ensureResp(t).verbal = vb.value; persist(); };
    const nt = H.$('#note'); if (nt) nt.oninput = () => { ensureResp(t).note = nt.value; persist(); };
    const sm = H.$('#sample'); if (sm) sm.onclick = () => { const rr = ensureResp(t); rr.showSample = !rr.showSample; persist(); if (rr.showSample) showSample(c, H.$('#feedback')); else H.$('#feedback').innerHTML = ''; drawSlp(t); };
    const rd = H.$('#ready'); if (rd) rd.onclick = () => { const rr = ensureResp(t); rr.ready = true; persist(); drawAnswer(t); H.toast('Marked as answered.'); };
    const pk = H.$('#peek'); if (pk) { const o = H.$('#peekout'); const show = e => { e.preventDefault(); o.classList.remove('hidden'); }; const hide = () => o.classList.add('hidden'); pk.addEventListener('pointerdown', show); pk.addEventListener('pointerup', hide); pk.addEventListener('pointerleave', hide); pk.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') show(e); }); pk.addEventListener('keyup', hide); }
    H.$('#lnotes').onclick = () => H.modal(`<h2 id="modal-title">Lesson notes</h2>${S.goal ? `<p><b>Student goal:</b> ${H.esc(S.goal)}</p>` : ''}<div class="prose pre">${H.esc(S.slpNotes || 'No notes for this lesson.')}</div><div class="actions"><button class="btn primary" data-close>Close</button></div>`);
    const lm = H.$('#lmedia'); if (lm) lm.onclick = lessonMedia;
    H.$('#n_back').onclick = () => nav(-1);
    H.$('#n_next').onclick = () => next(t);
    const rp = H.$('#n_repeat'); if (rp) rp.onclick = () => repeat(t);
    const sw = H.$('#n_switch'); if (sw) sw.onclick = () => switchStudent(t);
    const sk = H.$('#n_skip'); if (sk) sk.onclick = () => skip(t);
    drawSlpEvidence(t);
  }
  function drawSlpEvidence(t) {
    const ev = H.$('#evidence'); if (!ev) return; const r = resp(t), c = view(t);
    if (!r || !r.attempts.length) { ev.textContent = c.kind === 'open' ? 'Open answer: rate what the student said.' : 'No answer yet.'; return; }
    const first = r.attempts[0];
    const hidden = t.hideUntilBoth && !S.revealed[t.group];
    ev.innerHTML = `First response: <b>${H.esc(answerText(c, first))}</b>${hidden ? '' : first.correct === true ? ' (correct)' : first.correct === false ? ' (not correct)' : ''} · ${r.attempts.length} attempt${r.attempts.length > 1 ? 's' : ''}${r.round > 1 ? ' · repeated' : ''}. <span class="muted">A correct tap is not the same as independent. Choose the rating.</span>`;
  }

  function lessonMedia() {
    const v = S.video || {}, items = (S.media || []).slice();
    if (v.url) items.unshift({ id: '_video', kind: 'link', title: v.title || 'Lesson video', description: v.description, pause: v.pauseNotes, url: v.url });
    const m = H.modal(`<h2 id="modal-title">Lesson media</h2>${items.map(x => H.media.itemHTML(x)).join('')}${v.prompts && v.prompts.length ? `<p class="small"><b>Video talk prompts:</b> ${v.prompts.map(H.esc).join(' · ')}</p>` : ''}<div class="actions"><button class="btn primary" data-close>Close</button></div>`, { wide: true, onClose: () => H.media.stopAll() });
    H.media.wire(m, items);
    H.$$('[data-close]', m).forEach(b => b.addEventListener('click', () => H.media.stopAll()));
  }

  /* ---------- navigation ---------- */
  async function nav(d) {
    const np = S.pos + d; if (np < 0 || np >= S.turns.length) return;
    S.pos = np; await persistNow(); render();
  }
  async function next(t) {
    if (S.preview) { if (S.pos === S.turns.length - 1) { Ses.leaving(); H.go('#/lessons'); return; } return nav(1); }
    const c = view(t);
    if (t.studentId) {
      const r = ensureResp(t);
      const firstOfGroup = t.group && S.turns.find(x => x.group === t.group).id === t.id;
      const waiting = t.hideUntilBoth && !S.revealed[t.group] && firstOfGroup;
      if (c.role === 'check' && !r.rating && !waiting) { H.toast('Quick check: choose Independent, With help, or Incorrect, or press Skip.', 'error'); H.$('.rate') && H.$('.rate').classList.add('need'); return; }
      if (!r.rating && c.role !== 'check') r.rating = 'N';
      r.studentId = t.studentId; r.question = c.question; r.savedAt = Date.now();
    }
    if (S.pos === S.turns.length - 1) { S.phase = 'summary'; }
    else S.pos++;
    const ok = await persistNow();
    if (ok === false) return;
    render();
  }
  async function repeat(t) {
    const r = ensureResp(t);
    if (!r.attempts.length && !r.rating) { H.toast('Nothing to repeat yet.'); return; }
    r.round++; r.rating = null; r.pending = []; r.place = {}; r.sortSel = null; r.showChoices = true; r.showSample = false;
    if (t.group) { S.revealed[t.group] = false; }
    await persistNow(); H.toast('Try again. The first response is kept.'); render();
  }
  async function skip(t) {
    const r = ensureResp(t); r.rating = 'S'; r.studentId = t.studentId; r.savedAt = Date.now();
    if (S.pos === S.turns.length - 1) S.phase = 'summary'; else S.pos++;
    await persistNow(); render();
  }
  async function switchStudent(t) {
    const other = S.students.find(s => s.id !== t.studentId); if (!other) return;
    const p = partner(t);
    const ok = await H.confirm('Switch the answering student?', `<p>This turn will belong to <b>${H.esc(other.name)}</b>${p ? ` and the matching turn will belong to <b>${H.esc(stu(t.studentId).name)}</b>` : ''}. Any answer and rating on ${p ? 'these turns move' : 'this turn moves'} with the turn.</p>`, 'Switch', { danger: false });
    if (!ok) return;
    const from = t.studentId;
    t.studentId = other.id; if (S.responses[t.id]) S.responses[t.id].studentId = other.id;
    if (p) { p.studentId = from; if (S.responses[p.id]) S.responses[p.id].studentId = from; }
    await persistNow(); H.toast('This turn now belongs to ' + other.name + '.'); render();
  }
  function pause() {
    S.pausedAt = Date.now(); H.media.stopAll(); persist();
    H.$('#paused').classList.remove('hidden'); H.$('#x_resume').focus();
  }
  function unpause() {
    if (S.pausedAt) { S.pausedMs += Date.now() - S.pausedAt; S.pausedAt = null; }
    persist(); H.$('#paused').classList.add('hidden');
  }
  async function leaveDialog() {
    if (S.preview) { Ses.leaving(); H.go('#/lessons'); return; }
    const m = H.modal(`<h2 id="modal-title">Leave this session?</h2><p>Answers so far are saved on this laptop as an unfinished session. You can resume it from the Lessons page.</p>
      <div class="actions col"><button class="btn primary" id="lv_keep">Keep it and leave</button><button class="btn" id="lv_fin">Finish now and review summary</button><button class="btn danger" id="lv_del">Discard this session</button><button class="btn" data-close>Stay</button></div>`);
    H.$('#lv_keep', m).onclick = async () => { H.closeModal(); await persistNow(); Ses.leaving(); H.go('#/lessons'); };
    H.$('#lv_fin', m).onclick = async () => { H.closeModal(); S.phase = 'summary'; await persistNow(); render(); };
    H.$('#lv_del', m).onclick = async () => {
      H.closeModal();
      if (!await H.confirm('Discard this session?', '<p>All answers and ratings from this session will be deleted.</p>', 'Discard')) return;
      try { await H.store.del('active', 'current'); } catch (e) { H.toast(H.storageError(e), 'error'); return; }
      S = null; clearInterval(timer); H.go('#/lessons');
    };
  }

  /* ---------- summary ---------- */
  H.summarize = rs => {
    const n = k => rs.filter(r => r.rating === k).length;
    const I = n('I'), Hh = n('H'), X = n('X'), Sk = n('S'), N = rs.filter(r => !r.rating || r.rating === 'N').length;
    const scored = I + Hh + X;
    const ch = rs.filter(r => r.role === 'check'); const cI = ch.filter(r => r.rating === 'I').length, cH = ch.filter(r => r.rating === 'H').length, cX = ch.filter(r => r.rating === 'X').length;
    return { I, H: Hh, X, S: Sk, N, scored, total: rs.length, pctInd: H.pct(I, scored), pctCorrect: H.pct(I + Hh, scored), check: { I: cI, H: cH, X: cX, S: ch.filter(r => r.rating === 'S').length, scored: cI + cH + cX, pctInd: H.pct(cI, cI + cH + cX), pctCorrect: H.pct(cI + cH, cI + cH + cX) } };
  };
  H.summaryStatsHTML = (sm) => `<div class="stats">
      <div class="stat"><b>${H.fmtPct(sm.pctInd)}</b><span>independent</span></div>
      <div class="stat"><b>${H.fmtPct(sm.pctCorrect)}</b><span>correct (independent + with help)</span></div>
      <div class="stat"><b>${sm.I} / ${sm.H} / ${sm.X}</b><span>independent / with help / incorrect</span></div>
      <div class="stat"><b>${sm.S} · ${sm.N}</b><span>skipped · not scored</span></div></div>
    <p class="small denom">Percentages use <b>${sm.scored}</b> scored item${sm.scored === 1 ? '' : 's'} (independent + with help + incorrect). ${sm.S} skipped and ${sm.N} not-scored item${sm.N === 1 ? ' is' : 's are'} left out.${sm.check.scored ? ` Quick check only: ${H.fmtPct(sm.check.pctInd)} independent, ${H.fmtPct(sm.check.pctCorrect)} correct, out of ${sm.check.scored}.` : ''}</p>`;

  H.responseRowHTML = (r, i, editable, cards) => {
    const c = cards ? cards[r.cardIdx] : null; const kind = r.kind || (c && c.kind);
    const first = r.attempts && r.attempts[0];
    const ans = (r.attempts || []).map((a, k) => `${k === 0 ? 'First: ' : 'Then: '}${H.esc(a.text != null ? a.text : '')}${a.correct === true ? ' ✓' : a.correct === false ? ' ✗' : ''}`).join('<br>');
    const need = r.role === 'check' && !r.rating;
    return `<tr class="${need ? 'need' : ''}"><td>${i + 1}</td><td><span class="small muted">${H.esc((H.L.ROLES[r.role] || {}).label || '')}${r.variant === 'alt' ? ' · second-student question' : ''}</span><br>${H.esc(r.question)}</td>
      <td>${ans || (kind === 'open' ? '<span class="muted">Spoken answer</span>' : '<span class="muted">No answer</span>')}${r.verbal ? `<br><i>Said: “${H.esc(r.verbal)}”</i>` : ''}${r.note ? `<br><span class="small">Note: ${H.esc(r.note)}</span>` : ''}</td>
      <td>${editable ? `<label class="sr" for="rt_${H.esc(r.turnId)}">Rating</label><select id="rt_${H.esc(r.turnId)}" data-rt="${H.esc(r.turnId)}">${need ? '<option value="">Needs a rating</option>' : ''}${H.L.RATINGS.filter(x => !(r.role === 'check' && x.k === 'N')).map(x => `<option value="${x.k}" ${(r.rating || 'N') === x.k ? 'selected' : ''}>${x.label}</option>`).join('')}</select>` : H.esc(H.L.ratingLabel(r.rating || 'N'))}</td></tr>`;
  };

  function studentResponses(sid) {
    return S.turns.filter(t => t.studentId === sid && S.responses[t.id] && (S.responses[t.id].savedAt || S.responses[t.id].rating)).map(t => S.responses[t.id]);
  }

  function renderSummary() {
    const app = H.$('#app');
    const mins = S.minutes || Math.max(1, Math.round(elapsed() / 60000));
    const per = S.students.map((s, i) => ({ s, i, rs: studentResponses(s.id) }));
    const missing = per.flatMap(p => p.rs.filter(r => r.role === 'check' && !r.rating));
    const unvisited = S.turns.filter(t => t.studentId && !(S.responses[t.id] && (S.responses[t.id].savedAt || S.responses[t.id].rating))).length;
    app.innerHTML = `<div class="sess summary">
      <div class="sbar"><div class="stitle"><div class="t1">Session summary</div><div class="t2">${H.esc(S.lessonTitle)} · ${H.esc(S.setName)} · ${H.fmtDate(S.date)}</div></div><span id="savestate" class="savestate" role="status" aria-live="polite"></span></div>
      <main class="sum-body">
        <div class="done-msg"><h1>Nice work, ${H.esc(S.studentNames.join(' and '))}!</h1>${S.goal ? `<p class="goal">${H.esc(S.goal)}</p>` : ''}</div>
        ${unvisited ? `<p class="panel warn">${unvisited} turn${unvisited > 1 ? 's were' : ' was'} not reached. ${unvisited > 1 ? 'They are' : 'It is'} not included in the results.</p>` : ''}
        ${per.map(p => { const sm = H.summarize(p.rs); return `<section class="panel stu-sum" aria-label="${H.esc(p.s.name)} summary"><h2>${H.markHTML(p.i)} ${H.esc(p.s.name)}</h2>
          ${H.summaryStatsHTML(sm)}
          <div class="tablewrap"><table class="rtable"><thead><tr><th>#</th><th>Card</th><th>Response</th><th>Rating</th></tr></thead><tbody>${p.rs.map((r, k) => H.responseRowHTML(r, k, true, S.cards)).join('') || '<tr><td colspan="4" class="muted">No turns for this student.</td></tr>'}</tbody></table></div>
          <label for="nt_${H.esc(p.s.id)}">Notes for ${H.esc(p.s.name)}</label><textarea id="nt_${H.esc(p.s.id)}" data-note="${H.esc(p.s.id)}" placeholder="What clicked, prompts used, what to try next">${H.esc(S.notes[p.s.id] || '')}</textarea></section>`; }).join('')}
        <div class="row"><label for="mins">Minutes</label><input id="mins" type="number" min="1" max="120" value="${mins}" style="width:6rem"></div>
        <p id="sumerr" class="err" role="alert">${missing.length ? `${missing.length} quick-check item${missing.length > 1 ? 's need' : ' needs'} a rating (or choose Skipped) before saving.` : ''}</p>
        <div class="row"><button class="btn" id="backcards">← Back to cards</button><span class="spacer"></span><button class="btn go big" id="savesess" ${missing.length ? 'disabled' : ''}>Save session</button></div>
      </main></div>`;
    H.$$('[data-rt]').forEach(s => s.onchange = () => { const r = S.responses[s.dataset.rt]; r.rating = s.value || null; persist(); renderSummary(); });
    H.$$('[data-note]').forEach(tx => tx.oninput = () => { S.notes[tx.dataset.note] = tx.value; persist(); });
    H.$('#mins').oninput = e => { S.minutes = Math.max(1, +e.target.value || 1); persist(); };
    H.$('#backcards').onclick = async () => { S.phase = 'cards'; S.pos = S.turns.length - 1; await persistNow(); render(); };
    H.$('#savesess').onclick = saveSession;
  }

  async function saveSession() {
    const btn = H.$('#savesess');
    if (saving) return; saving = true; btn.disabled = true; btn.textContent = 'Saving…';
    persist.cancel(); S.closing = true;
    try {
      const rec = {
        id: S.id, savedAt: Date.now(), date: S.date, startedAt: S.startedAt, minutes: S.minutes || Math.max(1, Math.round(elapsed() / 60000)),
        lessonId: S.lessonId, lessonTitle: S.lessonTitle, lessonNumber: S.lessonNumber, unit: S.unit, setId: S.setId, setName: S.setName,
        length: S.length, mode: S.mode, students: S.students.map(s => ({ id: s.id, name: s.name })), notes: Object.assign({}, S.notes),
        responses: S.students.flatMap(s => studentResponses(s.id)).map(r => ({
          turnId: r.turnId, studentId: r.studentId, cardId: r.cardId, cardIdx: r.cardIdx, cardNumber: r.cardIdx + 1, role: r.role, kind: r.kind, variant: r.variant, question: r.question,
          attempts: r.attempts.map(a => ({ text: a.text, correct: a.correct, round: a.round, at: a.at })), verbal: r.verbal || '', note: r.note || '', rating: r.rating || 'N'
        }))
      };
      if (rec.responses.some(r => r.role === 'check' && !['I', 'H', 'X', 'S'].includes(r.rating))) throw new Error('Every quick check needs a rating or Skipped.');
      // One transaction: write the session (keyed by its id, so saving twice replaces instead of duplicating) and clear the active session.
      await H.store.batch([{ store: 'sessions', put: rec }, { store: 'active', del: 'current' }]);
      H.saveStatus('saved', 'Session saved');
      clearInterval(timer); const id = S.id; S = null;
      H.toast('Session saved.');
      H.go('#/history/' + encodeURIComponent(id));
    } catch (e) {
      H.saveStatus('error'); H.toast('The session was not saved. ' + H.storageError(e), 'error');
      btn.disabled = false; btn.textContent = 'Save session'; if (S) S.closing = false;
    } finally { saving = false; }
  }
})(window.H);
