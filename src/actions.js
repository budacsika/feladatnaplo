// Feladatműveletek és szűrő-visszaállítás
import { renderList } from './list.js';
import { pkey } from './people-model.js';
import { render } from './render.js';
import { $, st, ui } from './state.js';
import { toast } from './status.js';
import { queueSave } from './storage.js';
import { dstr, pad, stamp } from './util.js';

/* ---------- műveletek ---------- */
export function updateTask(id, patch){
  const t = st.tasks.find(x => x.id === id); if (!t) return;
  Object.assign(t, patch, { modositva: stamp() });
  if (patch.statusz !== undefined) t.lezarva = patch.statusz === 'kesz' ? stamp() : '';
  queueSave(); render();
}

export function startEdit(id){
  st.editing = id; renderList();
  const ta = document.querySelector('.edit textarea'); if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
}

export function deleteTask(id){
  const t = st.tasks.find(x => x.id === id); if (!t) return;
  if (!confirm('Biztosan törlöd ezt a tételt?\n\n' + t.feladat.slice(0, 140))) return;
  st.tasks = st.tasks.filter(x => x !== t); st.deleted.add(id); st.editing = null;
  queueSave(); render();
  toast('Törölve.', 'Visszavonás', () => { st.tasks.push(t); st.deleted.delete(id); queueSave(); render(); });
}

export function resetFilters(){
  ui.search = ''; ui.status = 'all'; ui.period = 'all';
  $('#q').value = ''; $('#period').value = 'all'; syncSeg();
}

export const syncSeg = () => document.querySelectorAll('#segStatus button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.s === ui.status)));

export function setSearch(q){ ui.search = q; $('#q').value = q; renderList(); $('#list').scrollIntoView({ block:'start', behavior:'smooth' }); }

export const dtValue = d => `${dstr(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/* ---------- megbízók: lista-műveletek ---------- */
export const countsByKey = () => { const m = new Map(); for (const t of st.tasks) { const k = pkey(t.megbizo); if (k) m.set(k, (m.get(k) || 0) + 1); } return m; };
