/* Device-local storage (IndexedDB). Nothing here talks to the network. */
(function (H) {
  'use strict';
  const DB_NAME = 'scope-lesson-hub';
  const DB_VERSION = 1;
  const STORES = {
    meta: 'key',        // prefs, seed version
    lessons: 'id',
    students: 'id',
    sessions: 'id',     // saved sessions (one record per session, keyed by session id → no duplicates)
    active: 'key',      // the in-progress session ('current')
    drafts: 'id',       // unsaved lesson-editor work, keyed by lesson id
    assets: 'id'        // uploaded media blobs
  };
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      if (!window.indexedDB) { rej(new Error('This browser does not allow saving (IndexedDB is off). Try Chrome or Edge, and not a private window.')); return; }
      const rq = indexedDB.open(DB_NAME, DB_VERSION);
      rq.onupgradeneeded = () => {
        const db = rq.result;
        Object.entries(STORES).forEach(([name, key]) => { if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: key }); });
      };
      rq.onsuccess = () => {
        const db = rq.result;
        db.onversionchange = () => { db.close(); H.toast('The app was opened in another tab. Close one tab.', 'error'); };
        res(db);
      };
      rq.onerror = () => rej(rq.error || new Error('Could not open storage.'));
      rq.onblocked = () => rej(new Error('Storage is blocked. Close other tabs of this app and reload.'));
    });
    return dbp;
  }

  function reqP(rq) { return new Promise((res, rej) => { rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); }); }
  function txDone(tx) { return new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error || new Error('Save was cancelled.')); }); }

  function friendly(err) {
    const n = err && (err.name || '');
    if (n === 'QuotaExceededError') return 'This laptop is out of space for the app. Remove large uploaded videos or make a backup and clear old data.';
    return (err && err.message) || 'Unknown storage error.';
  }
  H.storageError = friendly;

  const S = H.store = {
    async get(store, key) { const db = await open(); return reqP(db.transaction(store).objectStore(store).get(key)); },
    async all(store) { const db = await open(); return reqP(db.transaction(store).objectStore(store).getAll()); },
    async put(store, val) {
      const db = await open(); const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(val); return txDone(tx);
    },
    async del(store, key) { const db = await open(); const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).delete(key); return txDone(tx); },
    /* Write many records across stores in ONE transaction (all or nothing). ops: [{store, put|del|clear}] */
    async batch(ops) {
      const db = await open(); const names = Array.from(new Set(ops.map(o => o.store)));
      const tx = db.transaction(names, 'readwrite');
      ops.forEach(o => { const st = tx.objectStore(o.store); if (o.clear) st.clear(); else if (o.del !== undefined) st.delete(o.del); else st.put(o.put); });
      return txDone(tx);
    },
    /* Save with visible status. Returns true/false; never throws. */
    async save(store, val, label) {
      H.saveStatus('saving');
      try { await S.put(store, val); H.saveStatus('saved'); return true; }
      catch (e) { H.saveStatus('error'); H.toast((label ? label + ' was not saved. ' : 'Not saved. ') + friendly(e), 'error'); return false; }
    },
    async prefs() { const p = await S.get('meta', 'prefs'); return Object.assign({ key: 'prefs', voiceMode: 'warm', rate: 1, textSize: 'normal', voiceName: '' }, p || {}); },
    async setPrefs(p) { H.prefs = p; return S.save('meta', p, 'Settings'); },
    open
  };

  /* First run (or new bundled lessons): copy bundled content into storage without overwriting edits. */
  H.seed = async function () {
    const C = window.HUB_CONTENT; if (!C) throw new Error('Lesson content file is missing (content/scope-lessons.js).');
    const seed = await S.get('meta', 'seed');
    const stored = new Map((await S.all('lessons')).map(l => [l.id, l]));
    const ops = []; let upgraded = 0;
    C.lessons.forEach(l => {
      const old = stored.get(l.id);
      if (!old) {
        if (!(seed && (seed.ids || []).includes(l.id))) ops.push({ store: 'lessons', put: Object.assign(H.clone(l), { builtIn: true, archived: false, updatedAt: Date.now() }) });
        return;
      }
      // A newer bundled version of a built-in lesson replaces the stored one, unless the SLP edited it.
      const untouchedDraft = !(old.sets || []).some(s => (s.cards || []).length);
      if (old.builtIn && (l.contentRev || 1) > (old.contentRev || 1) && (!old.userEdited || untouchedDraft)) {
        ops.push({ store: 'lessons', put: Object.assign(H.clone(l), { builtIn: true, archived: !!old.archived, updatedAt: Date.now() }) });
        upgraded++;
      }
    });
    const ids = Array.from(new Set([...(seed ? seed.ids || [] : []), ...C.lessons.map(l => l.id)]));
    ops.push({ store: 'meta', put: { key: 'seed', contentVersion: C.contentVersion, ids, at: Date.now() } });
    await S.batch(ops);
    H.seedUpgraded = upgraded;
    return ops.length - 1;
  };
  H.originalLesson = id => { const l = (window.HUB_CONTENT.lessons || []).find(x => x.id === id); return l ? H.clone(l) : null; };

  /* Ask the browser not to clear this data when space is low (best effort). */
  H.persistStorage = async () => { try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (e) { } return false; };
})(window.H);
