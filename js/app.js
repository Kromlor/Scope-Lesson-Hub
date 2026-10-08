/* App shell: boot, routing, top bar. */
(function (H) {
  'use strict';
  const NAV = [['lessons', 'Lessons'], ['students', 'Students'], ['history', 'Session history'], ['backup', 'Backup'], ['settings', 'Settings'], ['help', 'Help']];

  H.shell = (active, inner) => {
    const v = H.$('#app');
    v.innerHTML = `<header class="top">
      <a class="brand" href="#/lessons"><span class="brand-mark" aria-hidden="true">S</span><span>SCOPE Lesson Hub</span></a>
      <nav aria-label="Main">${NAV.map(([k, t]) => `<a href="#/${k}" class="${active === k ? 'on' : ''}" ${active === k ? 'aria-current="page"' : ''}>${t}</a>`).join('')}</nav>
      <span id="savestate" class="savestate" role="status" aria-live="polite"></span>
    </header><main id="view" tabindex="-1">${inner || ''}</main>
    <footer class="foot">Records are saved only in this browser on this laptop. They do not sync to other computers. Make a backup regularly.</footer>`;
    return H.$('#view');
  };

  H.go = hash => { if (location.hash === hash) route(); else location.hash = hash; };

  async function route() {
    H.media.stopAll(); H.media.releaseAll(); H.closeModal();
    H.$$('#toasts .toast:not(.error)').forEach(t => t.remove());
    const [, name, arg] = (location.hash || '#/lessons').split('/');
    try {
      if (name === 'session') return await H.session.resume();
      if (H.session && H.session.leaving) H.session.leaving();
      switch (name) {
        case 'edit': return await H.editor.open(decodeURIComponent(arg || ''));
        case 'setup': return await H.setup.open(decodeURIComponent(arg || ''));
        case 'preview': return await H.session.preview(decodeURIComponent(arg || ''));
        case 'students': return await H.records.students();
        case 'history': return arg ? await H.records.sessionDetail(decodeURIComponent(arg)) : await H.records.history();
        case 'backup': return await H.backup.page();
        case 'settings': return await H.settings();
        case 'help': return H.help();
        default: return await H.hub.render();
      }
    } catch (e) {
      console.error(e);
      H.shell('', `<div class="panel error-panel"><h2>Something went wrong</h2><p>${H.esc(e.message || e)}</p><p>Your saved data is not affected. <a href="#/lessons">Go back to lessons</a>.</p></div>`);
    }
  }
  H.route = route;

  H.applyTextSize = () => { document.documentElement.dataset.text = (H.prefs && H.prefs.textSize) || 'normal'; };

  /* ---------- Settings ---------- */
  H.settings = async () => {
    const p = H.prefs;
    const voices = window.speechSynthesis ? window.speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang)) : [];
    let est = '';
    try { if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); est = `Using about ${H.bytes(e.usage || 0)} of storage on this laptop.`; } } catch (e) { }
    const v = H.shell('settings', `<h1>Settings</h1>
      <section class="panel"><h2>Read-aloud</h2>
        <label for="s_mode">Voice</label>
        <select id="s_mode"><option value="warm" ${p.voiceMode !== 'computer' ? 'selected' : ''}>Warm-voice recordings when available, computer voice otherwise</option><option value="computer" ${p.voiceMode === 'computer' ? 'selected' : ''}>Computer voice only</option></select>
        <label for="s_rate">Speed: <span id="s_rate_v">${(+p.rate || 1).toFixed(2)}×</span></label>
        <input id="s_rate" type="range" min="0.6" max="1.4" step="0.05" value="${+p.rate || 1}">
        <label for="s_vname">Computer voice</label>
        <select id="s_vname"><option value="">Browser default</option>${voices.map(x => `<option ${x.name === p.voiceName ? 'selected' : ''}>${H.esc(x.name)}</option>`).join('')}</select>
        <p class="small muted">The 376 warm-voice recordings play only when the words match the original lesson text exactly. Edited or new text uses the computer voice, which sounds different on each computer. You can upload your own recording for any card in the editor. The computer voice reads tone-of-voice lines flat, so model those yourself.</p>
        <div class="row"><button class="btn" id="s_test">${H.icon('speaker')} Test the voice</button><button class="btn" id="s_stop">${H.icon('stop')} Stop</button></div>
      </section>
      <section class="panel"><h2>Student screen text size</h2>
        <div class="seg" role="radiogroup" aria-label="Text size">${[['normal', 'Normal'], ['large', 'Large'], ['xl', 'Extra large']].map(([k, t]) => `<label><input type="radio" name="ts" value="${k}" ${p.textSize === k ? 'checked' : ''}> ${t}</label>`).join('')}</div>
        <p class="small muted">Browser zoom (Ctrl and +) also works.</p>
      </section>
      <section class="panel"><h2>Storage</h2><p>${H.esc(est)} Records stay on this laptop in this browser. They are not sent anywhere and do not sync between computers. Clearing browser data for files removes them, so use <a href="#/backup">Backup</a> regularly.</p></section>`);
    const upd = async () => {
      p.voiceMode = H.$('#s_mode').value; p.rate = +H.$('#s_rate').value; p.voiceName = H.$('#s_vname').value;
      const ts = H.$('input[name=ts]:checked'); p.textSize = ts ? ts.value : 'normal';
      H.$('#s_rate_v').textContent = p.rate.toFixed(2) + '×'; H.applyTextSize(); await H.store.setPrefs(p);
    };
    H.$$('select,input', v).forEach(i => i.onchange = upd);
    H.$('#s_rate').oninput = () => { H.$('#s_rate_v').textContent = (+H.$('#s_rate').value).toFixed(2) + '×'; };
    H.$('#s_test').onclick = () => H.voice.speak('Look at his face. What clues do you see?');
    H.$('#s_stop').onclick = () => H.voice.stop();
  };

  H.help = () => {
    H.shell('help', `<h1>How to use the SCOPE Lesson Hub</h1><div class="panel prose">
    <h2>Open the app</h2><p>Double-click <b>index.html</b> in the SCOPE-Lesson-Hub folder. Use Chrome or Edge. Keep the whole folder together; the pictures and voice clips live in it. Always open it from the same folder on the same laptop, because records are saved in this browser.</p>
    <h2>Run a lesson</h2><ol><li>On <b>Lessons</b>, find a lesson (search or filter) and press <b>Start</b>.</li><li>Pick one or two students, the part (core lesson or additional practice), full or short, who goes first, and the turn-taking method.</li><li>The banner shows whose turn it is. Students tap answers; nothing moves on until you press <b>Save and next turn</b>.</li><li>Rate each Quick check: Independent, With help, or Incorrect (or press <b>Skip</b>). Other cards can stay unscored.</li><li>At the end, check each student’s summary, add notes, and press <b>Save session</b>.</li></ol>
    <h2>Two students</h2><p><b>Alternate questions</b>: students take turns on different cards. <b>Both practice each skill</b>: each student gets a turn on every card. When a card has a second-student question, the second student gets that one. Otherwise both answer the same question, and the answer stays hidden until both have answered.</p><p>Use <b>Switch answering student</b> if the wrong student answered. <b>Back</b> lets you fix an earlier answer without making a second record.</p>
    <h2>Make or change a lesson</h2><p>Press <b>Edit</b> on a lesson, or <b>Add lesson</b>. Fill in the lesson details, then add cards. Each card has one question. Mark one or more answers correct, and add hints, sentence starters, a sample answer, or a picture if you want. Your changes are kept as a draft while you work. Press <b>Save lesson</b> when done. Check <b>Ready to use</b> to let the lesson start.</p>
    <h2>Back up</h2><p>Go to <b>Backup</b> and press <b>Download backup</b>. The file has your lessons, students, sessions, and uploaded media. To move to a new laptop, copy the app folder, open it, and use <b>Restore</b>.</p>
    <h2>Read-aloud</h2><p>Speaker buttons read text aloud. Original SCOPE text plays the warm-voice recording. Other text uses the computer voice and is labeled. Cards marked <b>SLP models tone</b> need you to say the line yourself.</p></div>`);
  };

  /* ---------- boot ---------- */
  async function boot() {
    try {
      await H.store.open();
      H.prefs = await H.store.prefs();
      H.applyTextSize();
      await H.seed();
      if (H.seedUpgraded) setTimeout(() => H.toast(`${H.seedUpgraded} lesson${H.seedUpgraded > 1 ? 's were' : ' was'} updated with new content.`), 600);
      H.persistStorage();
    } catch (e) {
      document.getElementById('app').innerHTML = `<div class="panel error-panel" style="margin:40px auto;max-width:640px"><h1>The app cannot save on this browser</h1><p>${H.esc(H.storageError(e))}</p><p>Open <b>index.html</b> in Chrome or Edge (not a private window). Lessons and records are not affected.</p></div>`;
      return;
    }
    window.addEventListener('hashchange', route);
    if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = () => { };
    route();
  }
  document.addEventListener('DOMContentLoaded', boot);
})(window.H);
