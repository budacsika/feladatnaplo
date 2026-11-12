// Óra és percenkénti frissítés
import { updateLive } from './livedesk.js';
import { render } from './render.js';
import { $, ov, st } from './state.js';
import { pad } from './util.js';

/* ---------- óra, percenkénti frissítés ---------- */
let lastMinute = 0;

export function tick(){
  const n = new Date();
  $('#clock').textContent = `${pad(n.getHours())}:${pad(n.getMinutes())}:${pad(n.getSeconds())}`;
  updateLive(n.getTime());                                                  // a mért idő számlálói (a kezdetből számolva, nem növelt számláló)
  const mk = Math.floor(n.getTime() / 60000);
  if (mk !== lastMinute) {
    lastMinute = mk;
    $('#dateLine').textContent = n.toLocaleDateString('hu-HU', { year:'numeric', month:'long', day:'numeric', weekday:'long' });
    if (!st.editing && ov.pEdit == null && document.visibilityState === 'visible') render();   // határidő-számlálók frissítése
  }
}
