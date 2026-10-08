/* Media: built-in files, uploaded files (stored in IndexedDB), video links.
   Nothing loads until it is shown or played. Only one thing plays at a time. */
(function (H) {
  'use strict';
  const urlCache = new Map();
  const M = H.media = {};

  M.isUpload = ref => typeof ref === 'string' && ref.startsWith('idb:');
  M.url = async ref => {
    if (!ref) return null;
    if (!M.isUpload(ref)) return ref; // bundled file path
    if (urlCache.has(ref)) return urlCache.get(ref);
    const a = await H.store.get('assets', ref.slice(4));
    if (!a || !a.blob) return null;
    const u = URL.createObjectURL(a.blob); urlCache.set(ref, u); return u;
  };
  M.releaseAll = () => { urlCache.forEach(u => URL.revokeObjectURL(u)); urlCache.clear(); };
  M.assetInfo = async ref => M.isUpload(ref) ? H.store.get('assets', ref.slice(4)) : null;

  /* Fill every <img data-ref> / <audio|video data-ref> inside root. Missing media shows a message, never blocks. */
  M.hydrate = async root => {
    const els = H.$$('[data-ref]', root);
    for (const el of els) {
      const ref = el.dataset.ref; el.removeAttribute('data-ref');
      let u = null; try { u = await M.url(ref); } catch (e) { u = null; }
      if (!u) { M.missing(el, ref); continue; }
      el.onerror = () => M.missing(el, ref);
      el.src = u;
    }
  };
  M.missing = (el, ref) => {
    const box = document.createElement('div'); box.className = 'media-missing';
    box.textContent = (el.tagName === 'IMG' ? 'Picture' : 'Media') + ' not available' + (M.isUpload(ref) ? ' (the uploaded file was removed).' : ' (' + String(ref).split('/').pop() + ' was not found).') + ' The lesson still works without it.';
    if (el.parentNode) el.replaceWith(box);
  };

  /* ---------- one-at-a-time playback ---------- */
  document.addEventListener('play', e => {
    const t = e.target;
    H.$$('audio,video').forEach(m => { if (m !== t && !m.paused) m.pause(); });
    if (!t.classList.contains('voice-el')) H.voice && H.voice.stop();
  }, true);
  M.stopAll = () => {
    H.$$('audio,video').forEach(m => { try { m.pause(); } catch (e) { } });
    H.$$('iframe[data-embed]').forEach(f => { const ph = document.createElement('div'); ph.className = 'embed-stopped'; ph.textContent = 'Video stopped.'; f.replaceWith(ph); });
    H.voice && H.voice.stop();
  };

  /* ---------- video links ---------- */
  M.ytId = u => { const m = String(u || '').match(/(?:youtu\.be\/|[?&]v=|embed\/|shorts\/)([\w-]{11})/); return m ? m[1] : null; };
  M.vimeoId = u => { const m = String(u || '').match(/vimeo\.com\/(?:video\/)?(\d+)/); return m ? m[1] : null; };
  M.embedUrl = u => { const y = M.ytId(u); if (y) return `https://www.youtube-nocookie.com/embed/${y}?rel=0`; const v = M.vimeoId(u); if (v) return `https://player.vimeo.com/video/${v}`; return null; };
  M.safeUrl = u => /^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : null;

  /* A media item: {id, kind:'image'|'audio'|'video'|'link', title, description, pause, ref?, url?} */
  M.itemHTML = (it, opts = {}) => {
    const t = H.esc(it.title || ({ image: 'Picture', audio: 'Audio', video: 'Video', link: 'Video link' }[it.kind]));
    const slp = it.pause ? `<div class="slp-note"><b>SLP pause points:</b> ${H.esc(it.pause)}</div>` : '';
    const desc = it.description ? `<div class="media-desc">${H.esc(it.description)}</div>` : '';
    const url = M.safeUrl(it.url);
    let ctl = '';
    if (it.kind === 'image') ctl = `<button class="btn" data-mshow="${H.esc(it.id)}">${H.icon('image')} Show picture</button>`;
    if (it.kind === 'audio') ctl = `<button class="btn" data-mplay="${H.esc(it.id)}">${H.icon('play')} Play audio</button>`;
    if (it.kind === 'video' && it.ref) ctl = `<button class="btn" data-mplay="${H.esc(it.id)}">${H.icon('play')} Play video</button>`;
    if ((it.kind === 'link' || it.kind === 'video') && url) {
      ctl += (M.embedUrl(url) ? `<button class="btn" data-membed="${H.esc(it.id)}">${H.icon('play')} Play here</button>` : '') +
        `<a class="btn" href="${H.esc(url)}" target="_blank" rel="noopener noreferrer">${H.icon('link')} Open video link</a>`;
    }
    if (!ctl) ctl = '<span class="muted small">No file or link added.</span>';
    return `<div class="media-item" data-mid="${H.esc(it.id)}"><div class="media-head">${H.icon(it.kind === 'link' ? 'video' : it.kind)} <b>${t}</b></div>${desc}${opts.slp !== false ? slp : ''}<div class="row media-ctl">${ctl}</div><div class="media-out"></div></div>`;
  };
  /* Wire buttons created by itemHTML. items: array of media items. */
  M.wire = (root, items) => {
    const find = id => items.find(x => x.id === id);
    H.$$('[data-mshow]', root).forEach(b => b.onclick = async () => {
      const it = find(b.dataset.mshow), out = b.closest('.media-item').querySelector('.media-out');
      out.innerHTML = `<img class="media-img" alt="${H.esc(it.description || it.title || 'Lesson picture')}" data-ref="${H.esc(it.ref)}">`; await M.hydrate(out);
    });
    H.$$('[data-mplay]', root).forEach(b => b.onclick = async () => {
      const it = find(b.dataset.mplay), out = b.closest('.media-item').querySelector('.media-out');
      const tag = it.kind === 'video' ? 'video' : 'audio';
      out.innerHTML = `<${tag} controls preload="none" data-ref="${H.esc(it.ref)}"></${tag}>`;
      await M.hydrate(out);
      const el = out.querySelector(tag);
      if (el) { el.play().catch(() => { }); }
    });
    H.$$('[data-membed]', root).forEach(b => b.onclick = () => {
      const it = find(b.dataset.membed), out = b.closest('.media-item').querySelector('.media-out');
      M.stopAll();
      if (!navigator.onLine) { out.innerHTML = '<div class="media-missing">No internet right now. Use “Open video link” later, or teach without the video.</div>'; return; }
      out.innerHTML = `<div class="embed"><iframe data-embed src="${H.esc(M.embedUrl(it.url))}" title="${H.esc(it.title || 'Video')}" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div><p class="small muted">If the video does not load, use “Open video link”.</p>`;
    });
  };

  /* ---------- uploads ---------- */
  const LIMIT = { image: 15e6, audio: 40e6, video: 250e6 };
  M.kindOf = file => (file.type || '').split('/')[0];
  M.upload = async (file, want) => {
    const kind = M.kindOf(file);
    if (want && kind !== want) throw new Error(`That file is not ${want === 'image' ? 'a picture' : want === 'audio' ? 'an audio file' : 'a video'}.`);
    if (!['image', 'audio', 'video'].includes(kind)) throw new Error('Choose a picture, audio, or video file.');
    if (file.size > LIMIT[kind]) throw new Error(`That file is ${H.bytes(file.size)}. The limit for ${kind} is ${H.bytes(LIMIT[kind])}. Use a video link for long videos.`);
    let blob = file, type = file.type;
    if (kind === 'image' && !/gif|svg/.test(type)) { try { blob = await shrink(file, 1600); type = blob.type; } catch (e) { blob = file; } }
    const id = H.uid('a_');
    try { await H.store.put('assets', { id, name: file.name, type, size: blob.size, blob, createdAt: Date.now() }); }
    catch (e) { throw new Error(H.storageError(e)); }
    return 'idb:' + id;
  };
  function shrink(file, max) {
    return new Promise((res, rej) => {
      const img = new Image(), u = URL.createObjectURL(file);
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
        c.toBlob(b => b ? res(b) : rej(new Error('shrink failed')), 'image/jpeg', 0.86);
      };
      img.onerror = () => { URL.revokeObjectURL(u); rej(new Error('Could not read that picture.')); };
      img.src = u;
    });
  }
  /* Opens a file chooser and resolves with a File (or null). */
  M.pickFile = accept => new Promise(res => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.style.display = 'none';
    i.onchange = () => { res(i.files[0] || null); i.remove(); }; document.body.appendChild(i); i.click();
  });

  /* Built-in pictures (for the editor's picture chooser). */
  M.builtInImages = () => {
    const set = new Set();
    (window.HUB_CONTENT.lessons || []).forEach(l => l.sets.forEach(s => s.cards.forEach(c => { if (c.image) set.add(c.image); })));
    return Array.from(set).sort();
  };
})(window.H);
