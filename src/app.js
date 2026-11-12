// Indítás
import { syncSeg } from './actions.js';
import { tick } from './clock.js';
import { render } from './render.js';
import { $, VERSION, st } from './state.js';
import { renderStatus } from './status.js';
import { idbGet, loadMirror, openFolder } from './storage.js';
import { todayStr } from './util.js';
import './events.js';

setInterval(tick, 1000);

/* ---------- indulás ---------- */
(async function init(){
  $('#ver').textContent = VERSION;
  $('#fDate').value = todayStr();
  loadMirror(); render(); syncSeg(); tick();
  $('#fText').focus();
  if (!window.showDirectoryPicker) { st.mode = 'unsupported'; renderStatus(); return; }
  try { st.dir = (await idbGet('dir')) || null; } catch { st.dir = null; }
  if (!st.dir) { st.mode = 'none'; renderStatus(); return; }
  let perm = 'prompt';
  try { perm = await st.dir.queryPermission({ mode:'readwrite' }); } catch {}
  if (perm === 'granted') await openFolder(); else { st.mode = 'needperm'; renderStatus(); }
})();
