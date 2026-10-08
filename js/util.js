/* Shared helpers. Everything lives on window.H so plain <script> files work from a local folder. */
window.H = window.H || {};
(function (H) {
  'use strict';
  H.$ = (s, r = document) => r.querySelector(s);
  H.$$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  H.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  H.uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  H.clone = o => JSON.parse(JSON.stringify(o));
  H.todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  H.fmtDate = iso => { if (!iso) return ''; const [y, m, d] = iso.slice(0, 10).split('-'); return `${+m}/${+d}/${y}`; };
  H.fmtTime = ts => ts ? new Date(ts).toLocaleString([], { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  H.pct = (a, b) => b ? Math.round(a * 1000 / b) / 10 : null;
  H.fmtPct = v => v == null ? '—' : (Math.round(v) === v ? v : v.toFixed(1)) + '%';
  H.debounce = (fn, ms) => { let t; const f = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; f.flush = (...a) => { clearTimeout(t); return fn(...a); }; f.cancel = () => clearTimeout(t); return f; };
  H.lines = s => String(s || '').split('\n').map(x => x.trim()).filter(Boolean);
  H.bytes = n => n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB';

  H.toast = (msg, kind = '') => {
    let box = H.$('#toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg; box.appendChild(t);
    setTimeout(() => t.remove(), kind === 'error' ? 8000 : 3500);
  };

  /* Modal dialog. Returns the dialog element. */
  H.modal = (html, opts = {}) => {
    H.closeModal();
    const bg = document.createElement('div'); bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal ${opts.wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title">${html}</div>`;
    document.body.appendChild(bg);
    const m = bg.firstChild;
    H.$$('[data-close]', m).forEach(b => b.onclick = () => { H.closeModal(); opts.onClose && opts.onClose(); });
    bg.addEventListener('keydown', e => { if (e.key === 'Escape' && !opts.noEscape) { H.closeModal(); opts.onClose && opts.onClose(); } });
    const f = m.querySelector('[autofocus]') || m.querySelector('input,select,textarea,button:not([data-close])') || m.querySelector('button');
    f && f.focus();
    return m;
  };
  H.closeModal = () => H.$$('.modal-bg').forEach(m => m.remove());

  /* Confirm box for destructive actions. */
  H.confirm = (title, body, okText, opts = {}) => new Promise(res => {
    const m = H.modal(`<h2 id="modal-title">${H.esc(title)}</h2><div class="modal-body">${body}</div>
      <div class="actions"><button class="btn" id="cf_no">${H.esc(opts.cancelText || 'Cancel')}</button><button class="btn ${opts.danger === false ? 'primary' : 'danger'}" id="cf_ok">${H.esc(okText)}</button></div>`, { onClose: () => res(false) });
    H.$('#cf_no', m).onclick = () => { H.closeModal(); res(false); };
    H.$('#cf_ok', m).onclick = () => { H.closeModal(); res(true); };
    H.$('#cf_no', m).focus();
  });

  H.alert = (title, body) => new Promise(res => {
    const m = H.modal(`<h2 id="modal-title">${H.esc(title)}</h2><div class="modal-body">${body}</div><div class="actions"><button class="btn primary" id="al_ok">OK</button></div>`, { onClose: () => res() });
    H.$('#al_ok', m).onclick = () => { H.closeModal(); res(); };
  });

  H.download = (name, data, type) => {
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  };

  /* Save-status pill shown in the top bar. */
  H.saveStatus = (state, msg) => {
    const el = H.$('#savestate'); if (!el) return;
    el.className = 'savestate ' + state;
    el.textContent = msg || ({ saving: 'Saving…', saved: 'Saved on this laptop', error: 'Not saved — see message', idle: '' }[state]);
  };

  H.icon = name => {
    const p = {
      speaker: '<path d="M11 5 6 9H3v6h3l5 4V5Z" fill="currentColor"/><path d="M15.5 8.5c2 2 2 5 0 7M18.5 5.5c4 4 4 9 0 13" stroke-linecap="round"/>',
      stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>',
      play: '<path d="M8 5v14l11-7z" fill="currentColor"/>',
      pause: '<rect x="6" y="5" width="4" height="14" fill="currentColor"/><rect x="14" y="5" width="4" height="14" fill="currentColor"/>',
      video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',
      image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-6-6-9 9"/>',
      audio: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
      link: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
      voice: '<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'
    }[name] || '';
    return `<svg aria-hidden="true" viewBox="0 0 24 24" width="1.2em" height="1.2em" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">${p}</svg>`;
  };
})(window.H);
