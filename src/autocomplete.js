// Megbízó-választó (javaslat írás közben)
import { countsByKey } from './actions.js';
import { hl } from './filter.js';
import { addPerson, renderPeople } from './people.js';
import { exactPerson, normName, pkey, suggestPeople } from './people-model.js';
import { $, esc, st } from './state.js';
import { toast } from './status.js';
import { queueSave } from './storage.js';

/* ---------- megbízó-választó (javaslat írás közben) ---------- */
export const ac = { input: null, items: [], on: 0, touched: false };

export function acItems(q){
  const counts = countsByKey(), nq = pkey(q);
  const items = suggestPeople(q, st.people, counts).map(s => ({ name: s.p.nev, tier: s.tier, n: counts.get(pkey(s.p.nev)) || 0, note: s.p.megjegyzes }));
  if (nq && !exactPerson(q, st.people)) items.push({ isNew: true, name: normName(q) });
  return items;
}

export function acRender(){
  const box = $('#ac'), nq = pkey(ac.input.value); let html = '', fz = false;
  ac.items.forEach((it, i) => {
    if (it.tier === 5 && !fz) { fz = true; html += '<div class="ac-h">Erre gondoltál?</div>'; }
    if (it.isNew) html += `<div class="ac-i new${i === ac.on ? ' on' : ''}" data-i="${i}"><span>+ Új megbízó: „${esc(it.name)}”</span></div>`;
    else html += `<div class="ac-i${i === ac.on ? ' on' : ''}" data-i="${i}"><span>${it.tier < 5 && nq ? hl(it.name, [nq]) : esc(it.name)}${it.note ? ` <small>${esc(it.note)}</small>` : ''}</span><small>${it.n} feladat</small></div>`;
  });
  box.innerHTML = html; box.hidden = !ac.items.length;
  acPlace();
  const on = box.querySelector('.on');                                       // az aktív elem látható marad a listán belül (az oldalt nem görgeti)
  if (on) { const t = on.offsetTop, b = t + on.offsetHeight; if (t < box.scrollTop) box.scrollTop = t; else if (b > box.scrollTop + box.clientHeight) box.scrollTop = b - box.clientHeight; }
}

export function acPlace(){
  if (!ac.input) return;
  const r = ac.input.getBoundingClientRect();
  Object.assign($('#ac').style, { left: r.left + 'px', top: (r.bottom + 2) + 'px', width: Math.max(r.width, 270) + 'px' });
}

export function acOpen(input){ ac.input = input; ac.items = acItems(input.value); ac.on = 0; ac.touched = false; acRender(); }

export function acClose(){ $('#ac').hidden = true; ac.items = []; ac.input = null; }

export function markUnknown(input){ const v = input.value.trim(); input.classList.toggle('unk', !!v && !exactPerson(v, st.people)); }

export function acPick(i){
  const it = ac.items[i], input = ac.input; if (!it || !input) return;
  input.value = it.isNew ? addPerson(it.name, true) : it.name;
  acClose(); markUnknown(input);
}

// rögzítéskor/mentéskor: csak a listában szereplő (vagy üres) megbízó fogadható el; '' = nincs, null = blokkolva
export function resolveWho(input){
  const v = normName(input.value); if (!v) return '';
  const p = exactPerson(v, st.people);
  if (p) { if (p.aktiv === 'nem') { p.aktiv = 'igen'; queueSave('p'); renderPeople(); } return p.nev; }
  toast('A megbízó nincs a listában – válassz a javaslatok közül, vagy add hozzá újként („+ Új megbízó”).');
  input.focus(); acOpen(input);
  return null;
}

export const isWho = el => !!(el && el.classList && el.classList.contains('who-input'));
document.addEventListener('focusin', e => { if (isWho(e.target)) acOpen(e.target); });
document.addEventListener('input', e => { if (isWho(e.target)) { acOpen(e.target); markUnknown(e.target); } });
document.addEventListener('focusout', e => { if (isWho(e.target)) { acClose(); markUnknown(e.target); } });
$('#ac').addEventListener('mousedown', e => { e.preventDefault(); const i = e.target.closest('[data-i]'); if (i) acPick(+i.dataset.i); });
window.addEventListener('scroll', e => { if (ac.input && e.target !== $('#ac')) acPlace(); }, true);   // görgetéskor a lista követi a mezőt
window.addEventListener('resize', acPlace);
document.addEventListener('keydown', e => {
  if (!ac.input || e.target !== ac.input) return;
  const k = e.key, n = ac.items.length, v = normName(ac.input.value), ex = exactPerson(v, st.people);
  if (k === 'ArrowDown' || k === 'ArrowUp') { e.preventDefault(); if (n) { ac.on = (ac.on + (k === 'ArrowDown' ? 1 : n - 1)) % n; ac.touched = true; acRender(); } }
  else if (k === 'Escape') { if (!$('#ac').hidden) { e.preventDefault(); e.stopPropagation(); acClose(); } }
  else if (k === 'Enter') {
    if (ex) { ac.input.value = ex.nev; acClose(); }                          // pontos egyezés: mehet tovább (rögzítés)
    else if (n && (v || ac.touched)) { e.preventDefault(); acPick(ac.on); }
  }
  else if (k === 'Tab' && v && !ex && n && !ac.items[ac.on].isNew) acPick(ac.on);   // Tab = javaslat elfogadása
}, true);
