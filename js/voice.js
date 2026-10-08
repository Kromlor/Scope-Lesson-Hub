/* Read-aloud: SLP recording → warm-voice recording → clearly labeled computer voice. Loads audio only when asked. */
(function (H) {
  'use strict';
  const V = H.voice = {};
  let el = null, epoch = 0;
  const probe = document.createElement('audio');
  const useOgg = !!probe.canPlayType && probe.canPlayType('audio/ogg; codecs="opus"') !== '';
  const norm = s => String(s || '').trim();

  V.hasRecording = text => !!(window.HUB_VOICE && window.HUB_VOICE[norm(text)]);
  V.btn = (text, rec, label) => text ? `<button type="button" class="spk" data-say="${H.esc(text)}"${rec ? ` data-rec="${H.esc(rec)}"` : ''} aria-label="${H.esc(label || 'Read aloud')}" title="${H.esc(label || 'Read aloud')}">${H.icon('speaker')}</button>` : '';

  function bar(kind, text) {
    let b = H.$('#voicebar');
    if (!b) { b = document.createElement('div'); b.id = 'voicebar'; b.setAttribute('role', 'status'); document.body.appendChild(b); }
    if (!kind) { b.hidden = true; return; }
    const label = { rec: 'Warm-voice recording', slp: 'SLP recording', computer: 'Computer voice' + (V.pickVoice() ? ' (' + V.pickVoice().name.replace(/^Microsoft |^Google /, '').replace(/ - English.*| Online.*/, '') + ')' : '') }[kind];
    b.hidden = false;
    b.innerHTML = `<span class="vb-dot ${kind}"></span><span><b>Reading aloud</b> · ${H.esc(label)}</span><button class="btn small" id="vb_stop">${H.icon('stop')} Stop</button>`;
    H.$('#vb_stop', b).onclick = () => V.stop();
  }

  /* Best available voice: the SLP's choice, else a natural/neural voice (Edge "Natural", Google), else a female US voice. */
  V.pickVoice = (localOnly) => {
    if (!window.speechSynthesis) return null;
    const vs = window.speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang) && (!localOnly || v.localService));
    const want = H.prefs && H.prefs.voiceName;
    if (want) { const v = vs.find(x => x.name === want); if (v) return v; }
    const score = v => {
      const n = v.name; let s = 0;
      if (/natural/i.test(n)) s += 100;
      if (/online/i.test(n)) s += 20;
      if (/^Google US English/i.test(n)) s += 80;
      if (/Google UK English Female/i.test(n)) s += 60;
      if (/\b(Ava|Jenny|Aria|Emma|Michelle|Ana|Samantha|Allison|Zira)\b/i.test(n)) s += 15;
      if (/en-US/i.test(v.lang)) s += 10;
      if (/\b(David|Mark|Fred|Albert)\b/i.test(n)) s -= 10;
      return s;
    };
    return vs.slice().sort((a, b) => score(b) - score(a))[0] || null;
  };
  if (window.speechSynthesis) { window.speechSynthesis.getVoices(); window.speechSynthesis.addEventListener && window.speechSynthesis.addEventListener('voiceschanged', () => { }); }

  V.stop = () => {
    epoch++;
    if (el) { try { el.pause(); } catch (e) { } el.removeAttribute('src'); try { el.load(); } catch (e) { } el = null; }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    bar(null);
  };

  function computer(text, rate, my, localOnly) {
    if (my !== epoch) return;
    if (!window.speechSynthesis) { bar(null); H.toast('This computer has no read-aloud voice. The SLP can read this one.', 'error'); return; }
    const u = new SpeechSynthesisUtterance(norm(text).replace(/[“”]/g, '').replace(/…/g, '...'));
    u.rate = rate;
    const v = V.pickVoice(localOnly || !navigator.onLine); if (v) { u.voice = v; u.lang = v.lang; }
    u.onend = () => { if (my === epoch) bar(null); };
    u.onerror = e => { if (my !== epoch) return; if (v && !v.localService && !localOnly && e.error !== 'interrupted' && e.error !== 'canceled') computer(text, rate, my, true); else bar(null); };
    bar('computer'); window.speechSynthesis.speak(u);
  }

  V.speak = async (text, opts = {}) => {
    if (!norm(text)) return;
    V.stop();
    H.$$('audio,video').forEach(m => { if (!m.paused && !m.classList.contains('voice-el')) m.pause(); });
    const my = epoch, p = H.prefs || {}, rate = Math.max(0.5, Math.min(1.5, +p.rate || 1));
    let src = null, kind = null;
    if (opts.rec) { try { src = await H.media.url(opts.rec); kind = 'slp'; } catch (e) { src = null; } }
    if (!src && p.voiceMode !== 'computer') {
      const f = window.HUB_VOICE && window.HUB_VOICE[norm(text)];
      if (f) { src = 'assets/voice/' + f + (useOgg ? '.ogg' : '.mp3'); kind = 'rec'; }
    }
    if (my !== epoch) return;
    if (!src) return computer(text, rate, my);
    const a = new Audio(); a.className = 'voice-el'; a.preload = 'auto'; el = a;
    a.playbackRate = rate; a.preservesPitch = true;
    let fell = false;
    const fallback = () => { if (fell || my !== epoch) return; fell = true; el = null; computer(text, rate, my); };
    a.onerror = fallback; a.onended = () => { if (my === epoch) bar(null); };
    a.src = src; bar(kind);
    try { const pr = a.play(); if (pr && pr.catch) pr.catch(fallback); } catch (e) { fallback(); }
  };

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-say]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    V.speak(b.dataset.say, { rec: b.dataset.rec });
  });
})(window.H);
