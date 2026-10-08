/* Lesson model helpers: defaults, validation, summaries. */
(function (H) {
  'use strict';
  const L = H.L = {};
  L.ROLES = {
    warmup: { label: 'Warm-up', scored: false },
    explore: { label: 'Explore (SCOPE step)', short: 'Explore', scored: false },
    discussion: { label: 'Talk it through', scored: false },
    practice: { label: 'Practice', scored: false },
    check: { label: 'Quick check', scored: true }
  };
  L.KINDS = { choice: 'Answer choices', open: 'Open verbal response', sort: 'Sort into boxes' };
  L.RATINGS = [
    { k: 'I', label: 'Independent' },
    { k: 'H', label: 'With help' },
    { k: 'X', label: 'Incorrect' },
    { k: 'S', label: 'Skipped' },
    { k: 'N', label: 'Not scored' }
  ];
  L.ratingLabel = k => (L.RATINGS.find(r => r.k === k) || { label: '' }).label;
  L.steps = () => (window.HUB_CONTENT && window.HUB_CONTENT.scopeSteps) || {};

  L.newCard = (role = 'check', kind = 'choice') => ({
    id: H.uid('c_'), role, kind, question: '', inShort: true,
    ...(kind === 'choice' ? { choices: ['', ''], correct: [] } : {}),
    ...(kind === 'sort' ? { sort: { bins: ['', ''], items: [{ text: '', bin: 0 }, { text: '', bin: 1 }] } } : {})
  });
  L.newLesson = () => ({
    id: H.uid('l_'), title: 'New lesson', unit: '', program: '', skill: '', goal: '', slpNotes: '', standards: [],
    status: 'draft', archived: false, builtIn: false, media: [], video: { url: '', title: '', description: '', pauseNotes: '' },
    sets: [{ id: 'core', name: 'Core lesson', cards: [L.newCard('check', 'choice')] }], updatedAt: Date.now()
  });
  L.copyLesson = l => {
    const c = H.clone(l); c.id = H.uid('l_'); c.title = l.title + ' (copy)'; c.builtIn = false; c.archived = false; c.number = undefined;
    c.status = l.status; delete c.userEdited; delete c.contentRev; c.sets.forEach(s => s.cards.forEach(k => k.id = H.uid('c_'))); c.updatedAt = Date.now(); c.copiedFrom = l.id; return c;
  };

  function choiceIssues(q, prefix) {
    const out = [];
    const ch = (q.choices || []);
    if (ch.filter(x => String(x).trim()).length < 2) out.push(prefix + 'needs at least 2 answer choices');
    if (ch.some(x => !String(x).trim())) out.push(prefix + 'has an empty answer choice');
    const corr = (q.correct || []).filter(i => i >= 0 && i < ch.length);
    if (!corr.length) out.push(prefix + 'needs at least one answer marked correct');
    return out;
  }
  L.validateCard = c => {
    const out = [];
    if (!String(c.question || '').trim()) out.push('Question is empty');
    if (c.kind === 'choice') out.push(...choiceIssues(c, 'Card '));
    if (c.kind === 'sort') {
      const s = c.sort || {}; const bins = (s.bins || []).filter(b => String(b).trim());
      if (bins.length < 2) out.push('Sort card needs 2 box names');
      const items = (s.items || []).filter(i => String(i.text).trim());
      if (items.length < 2) out.push('Sort card needs at least 2 cards to sort');
      if ((s.items || []).some(i => String(i.text).trim() && !(i.bin >= 0 && i.bin < (s.bins || []).length))) out.push('A sort card has no box chosen');
    }
    if (c.alt && c.alt.on) {
      if (!String(c.alt.question || '').trim()) out.push('Second-student question is empty');
      if (c.kind === 'choice') out.push(...choiceIssues(c.alt, 'Second-student question '));
    }
    return out;
  };
  L.validateSet = set => {
    const out = [];
    if (!set || !set.cards || !set.cards.length) return ['This part has no cards yet'];
    set.cards.forEach((c, i) => L.validateCard(c).forEach(m => out.push(`Card ${i + 1}: ${m}`)));
    return out;
  };
  L.usableSets = l => (l.sets || []).filter(s => s.cards && s.cards.length && !L.validateSet(s).length);
  L.canStart = l => l.status === 'ready' && !l.archived && L.usableSets(l).length > 0;
  L.cardsFor = (l, setId, length) => {
    const s = (l.sets || []).find(x => x.id === setId) || l.sets[0];
    return s.cards.filter(c => length !== 'short' || c.inShort !== false);
  };
  L.allCards = l => (l.sets || []).flatMap(s => s.cards || []);
  L.thumb = l => l.cover || (L.allCards(l).find(c => c.image && c.role === 'explore') || L.allCards(l).find(c => c.image) || {}).image || null;
  L.mediaFlags = l => {
    const cards = L.allCards(l), m = l.media || [];
    return {
      video: !!(l.video && l.video.url) || m.some(x => x.kind === 'video' || x.kind === 'link') || cards.some(c => (c.media || []).some(x => x.kind === 'video' || x.kind === 'link')),
      pictures: !!l.cover || cards.some(c => c.image) || m.some(x => x.kind === 'image'),
      audio: m.some(x => x.kind === 'audio') || cards.some(c => c.questionRec || (c.media || []).some(x => x.kind === 'audio')),
      warmVoice: cards.length > 0 && cards.filter(c => H.voice.hasRecording(c.question)).length >= cards.length / 2,
      modeling: cards.some(c => c.needsModeling)
    };
  };
  L.cardCount = l => (l.sets || []).reduce((n, s) => n + s.cards.length, 0);
  /* Collect every uploaded-asset reference in a lesson (for backups). */
  L.refs = l => {
    const r = new Set(); const add = x => { if (H.media.isUpload(x)) r.add(x); };
    add(l.cover); (l.media || []).forEach(m => add(m.ref));
    L.allCards(l).forEach(c => { add(c.image); add(c.questionRec); (c.media || []).forEach(m => add(m.ref)); if (c.alt) add(c.alt.image); });
    return Array.from(r);
  };
})(window.H);
