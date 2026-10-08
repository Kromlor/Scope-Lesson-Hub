/* Backup (.zip with lessons, students, sessions, uploaded media) and validated restore. */
(function (H) {
  'use strict';
  const FORMAT = 'scope-lesson-hub-backup';
  const B = H.backup = {};

  async function gather() {
    const [lessons, students, sessions, drafts, assets, prefs, seed] = await Promise.all([
      H.store.all('lessons'), H.store.all('students'), H.store.all('sessions'), H.store.all('drafts'), H.store.all('assets'), H.store.get('meta', 'prefs'), H.store.get('meta', 'seed')]);
    return { lessons, students, sessions, drafts, assets, prefs, seed };
  }

  B.make = async () => {
    if (!window.JSZip) throw new Error('The backup tool (vendor/jszip.min.js) is missing from the app folder.');
    const d = await gather(), zip = new JSZip();
    const index = d.assets.map(a => ({ id: a.id, name: a.name, type: a.type, size: a.size, createdAt: a.createdAt, file: 'media/' + a.id }));
    d.assets.forEach(a => zip.file('media/' + a.id, a.blob));
    const json = { format: FORMAT, version: 1, app: 'SCOPE Lesson Hub', exportedAt: new Date().toISOString(), counts: { lessons: d.lessons.length, students: d.students.length, sessions: d.sessions.length, media: d.assets.length },
      lessons: d.lessons, students: d.students, sessions: d.sessions, drafts: d.drafts, prefs: d.prefs || null, seed: d.seed || null, assets: index };
    zip.file('backup.json', JSON.stringify(json));
    zip.file('READ ME.txt', 'SCOPE Lesson Hub backup.\r\nTo restore: open the app, go to Backup, choose Restore, and pick this .zip file.\r\nIt contains student records. Store it somewhere private (for example your district OneDrive or SharePoint).\r\n');
    return { blob: await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }), counts: json.counts };
  };

  /* Reads and checks a backup without changing anything. Throws with a clear message if it is not usable. */
  B.read = async file => {
    if (!window.JSZip) throw new Error('The backup tool (vendor/jszip.min.js) is missing from the app folder.');
    let zip; try { zip = await JSZip.loadAsync(file); } catch (e) { throw new Error('This file is not a SCOPE Lesson Hub backup (it is not a readable .zip file).'); }
    const jf = zip.file('backup.json'); if (!jf) throw new Error('This .zip does not contain backup.json, so it is not a SCOPE Lesson Hub backup.');
    let j; try { j = JSON.parse(await jf.async('string')); } catch (e) { throw new Error('backup.json in this file is damaged and cannot be read.'); }
    if (j.format !== FORMAT) throw new Error('This file is not a SCOPE Lesson Hub backup.');
    if (!(j.version >= 1 && j.version <= 1)) throw new Error('This backup was made by a newer version of the app.');
    const problems = [], warnings = [];
    ['lessons', 'students', 'sessions'].forEach(k => { if (!Array.isArray(j[k])) problems.push(`The ${k} list is missing.`); });
    if (problems.length) throw new Error(problems.join(' '));
    j.lessons.forEach((l, i) => {
      if (!l || !l.id || typeof l.title !== 'string' || !Array.isArray(l.sets)) problems.push(`Lesson ${i + 1} is incomplete.`);
      else l.sets.forEach(s => { if (!Array.isArray(s.cards) || s.cards.some(c => !c || !c.id)) problems.push(`Lesson “${l.title}” has a damaged part.`); });
    });
    j.students.forEach((s, i) => { if (!s || !s.id || !s.name) problems.push(`Student ${i + 1} is incomplete.`); });
    j.sessions.forEach((s, i) => {
      if (!s || !s.id || !Array.isArray(s.students) || !Array.isArray(s.responses)) { problems.push(`Session ${i + 1} is incomplete.`); return; }
      const ids = new Set(s.students.map(x => x.id));
      if (s.responses.some(r => !ids.has(r.studentId))) problems.push(`Session ${i + 1} has an answer with no matching student.`);
    });
    const assets = [];
    for (const a of (j.assets || [])) {
      const f = zip.file(a.file); if (!a.id || !f) { problems.push(`Media file “${a.name || a.id}” is missing from the backup.`); continue; }
      assets.push({ meta: a, file: f });
    }
    if (problems.length) throw new Error('This backup has problems and was not used: ' + problems.slice(0, 6).join(' ') + (problems.length > 6 ? ` (and ${problems.length - 6} more)` : ''));
    const have = new Set(assets.map(a => 'idb:' + a.meta.id));
    const missingRefs = new Set(); j.lessons.forEach(l => H.L.refs(l).forEach(r => { if (!have.has(r)) missingRefs.add(r); }));
    if (missingRefs.size) warnings.push(`${missingRefs.size} uploaded picture/audio reference${missingRefs.size > 1 ? 's are' : ' is'} not in the backup. Those spots will show “not available”.`);
    return { j, assets, warnings };
  };

  B.apply = async ({ j, assets }) => {
    const blobs = [];
    for (const a of assets) { const raw = await a.file.async('blob'); blobs.push({ id: a.meta.id, name: a.meta.name, type: a.meta.type, size: raw.size, createdAt: a.meta.createdAt || Date.now(), blob: new Blob([raw], { type: a.meta.type || '' }) }); }
    const C = window.HUB_CONTENT;
    const seed = j.seed || { key: 'seed', contentVersion: C.contentVersion, ids: C.lessons.map(l => l.id), at: Date.now() };
    seed.ids = Array.from(new Set([...(seed.ids || []), ...j.lessons.map(l => l.id)]));
    const ops = [];
    ['lessons', 'students', 'sessions', 'drafts', 'assets', 'active'].forEach(s => ops.push({ store: s, clear: true }));
    j.lessons.forEach(x => ops.push({ store: 'lessons', put: x }));
    j.students.forEach(x => ops.push({ store: 'students', put: x }));
    j.sessions.forEach(x => ops.push({ store: 'sessions', put: x }));
    (j.drafts || []).forEach(x => ops.push({ store: 'drafts', put: x }));
    blobs.forEach(x => ops.push({ store: 'assets', put: x }));
    if (j.prefs) ops.push({ store: 'meta', put: Object.assign({}, j.prefs, { key: 'prefs' }) });
    ops.push({ store: 'meta', put: Object.assign({}, seed, { key: 'seed' }) });
    await H.store.batch(ops); // one transaction: all or nothing
    H.prefs = await H.store.prefs(); H.applyTextSize();
  };

  B.page = async () => {
    const d = await gather(); const last = await H.store.get('meta', 'lastBackup');
    const v = H.shell('backup', `<h1>Backup and restore</h1>
      <p class="notice">Everything is stored only in this browser on this laptop. A backup file is the only copy outside the laptop. It contains student records, so keep it somewhere private.</p>
      <section class="panel"><h2>Download a backup</h2>
        <p>This laptop has <b>${d.lessons.length}</b> lessons, <b>${d.students.length}</b> students, <b>${d.sessions.length}</b> saved sessions, and <b>${d.assets.length}</b> uploaded media files (${H.bytes(d.assets.reduce((n, a) => n + (a.size || 0), 0))}).</p>
        <p class="small muted">${last ? 'Last backup from this laptop: ' + H.fmtTime(last.at) : 'No backup has been made from this laptop yet.'}</p>
        <button class="btn go" id="mk">Download backup</button></section>
      <section class="panel"><h2>Restore from a backup</h2>
        <p>Restoring <b>replaces</b> all lessons, students, sessions, and uploaded media on this laptop with the backup. The file is checked first; nothing changes unless it is a complete backup and you confirm.</p>
        <button class="btn" id="rs">Choose a backup file…</button><div id="rsout"></div></section>`);
    H.$('#mk').onclick = async () => {
      const b = H.$('#mk'); b.disabled = true; b.textContent = 'Making backup…';
      try { const { blob, counts } = await B.make(); H.download(`SCOPE-Lesson-Hub-backup-${H.todayISO()}.zip`, blob); await H.store.put('meta', { key: 'lastBackup', at: Date.now(), counts }); H.toast('Backup downloaded. Check your Downloads folder.'); B.page(); }
      catch (e) { H.toast('Backup failed. ' + (e.message || e), 'error'); b.disabled = false; b.textContent = 'Download backup'; }
    };
    H.$('#rs').onclick = async () => {
      const f = await H.media.pickFile('.zip,application/zip'); if (!f) return;
      const out = H.$('#rsout'); out.innerHTML = '<p>Checking the backup…</p>';
      let res; try { res = await B.read(f); } catch (e) { out.innerHTML = `<div class="panel warn" role="alert"><b>Not restored.</b> ${H.esc(e.message)} Nothing on this laptop was changed.</div>`; return; }
      const c = { lessons: res.j.lessons.length, students: res.j.students.length, sessions: res.j.sessions.length, media: res.assets.length };
      out.innerHTML = `<div class="panel ok-panel"><p><b>${H.esc(f.name)}</b> is a complete backup from ${H.esc(H.fmtTime(Date.parse(res.j.exportedAt)))}.</p>
        <p>It has ${c.lessons} lessons, ${c.students} students, ${c.sessions} sessions, and ${c.media} media files.</p>${res.warnings.map(w => `<p class="small">⚠ ${H.esc(w)}</p>`).join('')}
        <div class="row"><button class="btn" id="rs_safe">First, download a backup of this laptop</button><button class="btn danger" id="rs_go">Replace this laptop’s data with this backup</button></div></div>`;
      H.$('#rs_safe').onclick = () => H.$('#mk').click();
      H.$('#rs_go').onclick = async () => {
        if (!await H.confirm('Replace all data on this laptop?', `<p>This deletes the ${d.lessons.length} lessons, ${d.students.length} students, ${d.sessions.length} sessions, and ${d.assets.length} media files on this laptop (and any unfinished session), and puts the backup’s data in their place. This cannot be undone.</p>`, 'Replace everything')) return;
        try { await B.apply(res); H.toast('Backup restored.'); H.go('#/lessons'); }
        catch (e) { out.innerHTML = `<div class="panel warn" role="alert"><b>Restore failed.</b> ${H.esc(H.storageError(e))} Because the restore runs as one step, the laptop’s data was left as it was.</div>`; }
      };
    };
  };
})(window.H);
