// A teljes felület újrarajzolása
import { renderDash, urgency } from './dash.js';
import { renderList } from './list.js';
import { renderPeople } from './people.js';
import { $, esc, st, ui } from './state.js';
import { extractTags, isParked } from './tasks.js';
import { fold } from './util.js';

export function renderHeader(){
  const u = urgency();
  $('#alertBadge').innerHTML = (u.over ? `<span class="badge over">LEJÁRT ${u.over}</span>` : '') + (u.h1 ? `<span class="badge h1">≤1 Ó · ${u.h1}</span>` : '') + (u.h2 ? `<span class="badge h2">≤2 Ó · ${u.h2}</span>` : '');
  const n = u.over + u.h1 + u.h2; document.title = (n ? `(${n}) ` : '') + 'Feladatnapló';
  const freq = (get) => { const f = new Map(); st.tasks.forEach(t => get(t).forEach(x => { const k = fold(x); const e = f.get(k) || { name:x, n:0 }; e.n++; f.set(k, e); })); return [...f.values()].sort((a,b) => b.n - a.n); };
  $('#quickTags').innerHTML = freq(t => extractTags(t.feladat)).slice(0, 10).map(e => `<button type="button" class="tag" data-qtag="${esc(e.name)}">#${esc(e.name.toLowerCase())}</button>`).join('');
}

export function render(){ renderHeader(); renderDash(); renderPeople(); renderList(); }

export function flash(id, noScroll){
  const tk = st.tasks.find(x => x.id === id);
  if (tk && !isParked(tk) && !document.querySelector(`#list [data-id="${CSS.escape(id)}"]`)?.offsetParent) { ui.dayState.set(tk.datum, true); renderList(); }   // összecsukott napon van: kinyitjuk
  const el = document.querySelector(`#list [data-id="${CSS.escape(id)}"], #parkBody [data-id="${CSS.escape(id)}"]`);
  if (el) { el.classList.add('flash'); if (!noScroll) el.scrollIntoView({ block:'nearest' }); }
}
