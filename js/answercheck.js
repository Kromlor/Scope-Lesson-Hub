/* Typed-answer checker for open questions ("Check my answer").
   A card's answer key:  check: { groups: [["library","school"], ["stop talk","quiet"]], need: 2 }
     - each group is a list of words/phrases that mean the same thing; a group counts if ANY of them is in the answer
     - the answer is right when at least `need` groups are found (default: all groups)
     - words match as word starts, so "talk" also matches "talking"/"talked"; "=no" matches only the word "no"
     - small spelling slips are allowed on longer words (one letter off for 5+ letters, two for 9+)
   check: { open: true } means there is no single right answer (personal or opinion questions).
   No key: a key is made from the sample answer's main words, so SLP-made cards still work.
   Works in the browser (H.answerCheck) and in Node (require) for testing. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.H) root.H.answerCheck = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const STOP = new Set('a an the and or but so to of in on at for with is are was were be been am i you he she it we they me him her us them my your his its our their this that these those there here what who when where why how do does did not no yes can could would should will just very really maybe some any one two'.split(' '));

  function norm(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[‘’ʼ']/g, '')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }
  const words = s => { const n = norm(s); return n ? n.split(' ') : []; };

  // edit distance with swapped letters counted as one slip ("freind" = "friend")
  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let pp = null, prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i]; let best = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (pp && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], pp[j - 2] + 1);
        best = Math.min(best, cur[j]);
      }
      if (best > max) return max + 1;
      pp = prev; prev = cur;
    }
    return prev[b.length];
  }

  // does answer word w match key token k?
  function tokMatch(w, k, exact) {
    if (w === k) return true;
    if (exact || k.length < 3) return false;
    if (w.startsWith(k)) return true;
    // dropped e and y→i endings: joke → joking, smile → smiling, happy → happier, try → tried
    if (k.length >= 3 && w.length > k.length && /[ey]$/.test(k) && w.startsWith(k.slice(0, -1)) && /^i/.test(w.slice(k.length - 1))) return true;
    const max = k.length >= 9 ? 2 : k.length >= 5 ? 1 : 0;
    if (!max) return false;
    if (lev(w, k, max) <= max) return true;
    // word may be k plus an ending ("runing" for "run"+"ing"): compare the start of the word
    for (let n = k.length - 1; n <= k.length + 1; n++) if (n > 0 && n < w.length && lev(w.slice(0, n), k, max) <= max) return true;
    return false;
  }

  function phraseFound(ans, alt) {
    let exact = false; alt = String(alt);
    if (alt.startsWith('=')) { exact = true; alt = alt.slice(1); }
    const ks = words(alt); if (!ks.length) return false;
    for (let i = 0; i + ks.length <= ans.length; i++) {
      let ok = true;
      for (let j = 0; j < ks.length; j++) if (!tokMatch(ans[i + j], ks[j], exact)) { ok = false; break; }
      if (ok) return true;
    }
    return false;
  }

  // key made from a sample answer (for cards without a written key)
  function autoKey(card) {
    const txt = [card.sampleAnswer].concat(card.sampleIdeas || []).filter(Boolean).join(' ');
    const ws = Array.from(new Set(words(txt).filter(w => w.length >= 4 && !STOP.has(w))));
    if (!ws.length) return null;
    return { groups: ws.map(w => [w.length > 5 ? w.slice(0, w.length - 2) : w]), need: Math.min(2, ws.length), auto: true };
  }

  function keyFor(card) {
    const k = card && card.check;
    if (k && k.open) return { open: true };
    if (k && Array.isArray(k.groups) && k.groups.some(g => (g || []).some(x => String(x).trim()))) return k;
    return autoKey(card || {});
  }

  /* -> { result: 'right' | 'wrong' | 'open' | 'empty' | 'nokey', found, need } */
  function check(card, text) {
    const ans = words(text);
    if (!ans.length) return { result: 'empty' };
    const key = keyFor(card);
    if (!key) return { result: 'nokey' };
    if (key.open) return { result: 'open' };
    const groups = key.groups.filter(g => (g || []).some(x => String(x).trim()));
    const found = groups.filter(g => g.some(alt => phraseFound(ans, alt))).length;
    const need = Math.max(1, Math.min(groups.length, key.need || groups.length));
    return { result: found >= need ? 'right' : 'wrong', found, need };
  }

  return { check, keyFor, norm, words, phraseFound };
});
