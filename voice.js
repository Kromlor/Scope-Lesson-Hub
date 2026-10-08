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
    const label = { rec: 'Warm-voice recording', slp: 'SLP recording', computer: 'Computer voice (sounds different on each computer)' }[kind];
    b.hidden = false;
    b.innerHTML = `<span class="vb-dot ${kind}"></span><span><b>Reading aloud</b> · ${H.esc(label)}</span><button class="btn small" id="vb_stop">${H.icon('stop')} Stop</button>`;
    H.$('#vb_stop', b).onclick = () => V.stop();
  }

  V.stop = () => {
    epoch++;
    if (el) { try { el.pause(); } catch (e) { } el.removeAttribute('src'); try { el.load(); } catch (e) { } el = null; }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    bar(null);
  };

  function computer(text, rate, my) {
    if (my !== epoch) return;
    if (!window.speechSynthesis) { bar(null); H.toast('This computer has no read-aloud voice. The SLP can read this one.', 'error'); return; }
    const u = new SpeechSynthesisUtterance(norm(text).replace(/[“”]/g, '').replace(/…/g, '...'));
    u.rate = rate;
    const want = H.prefs && H.prefs.voiceName;
    if (want) { const v = window.speechSynthesis.getVoices().find(x => x.name === want); if (v) u.voice = v; }
    u.onend = () => { if (my === epoch) bar(null); };
    u.onerror = () => { if (my === epoch) bar(null); };
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
