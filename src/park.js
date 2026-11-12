// A Tároló (nem ütemezett feladatok) panel
import { resetFilters, updateTask } from './actions.js';
import { fmtText, hl, matches, matchesText, queryTerms } from './filter.js';
import { editRow, histBtn, histRow, renderList } from './list.js';
import { flash } from './render.js';
import { $, ICON_USER, LS_PARK, esc, isDone, ov, st, ui } from './state.js';
import { toast } from './status.js';
import { cmpParked, isParked } from './tasks.js';
import { stamp, todayStr } from './util.js';

/* ---------- tároló ---------- */
export const mdShort = ds => ds.slice(5).replace('-', '.') + '.';

export function parkRow(t, terms){
  const ht = terms.filter(x => x[0] !== '@' && x[0] !== '#');
  const tip = t.letrehozva ? 'Felvéve: ' + t.letrehozva.replace('T', ' ') : '';
  return `<li class="pkrow" data-id="${esc(t.id)}">
    <div class="body" title="${esc(tip)}"><span class="txt">${fmtText(t.feladat, terms)}</span>${t.megbizo ? `<button type="button" class="chip who" data-act="who" data-who="${esc(t.megbizo)}" title="Megbízó – kattintásra szűrés">${ICON_USER}${hl(t.megbizo, ht)}</button>` : ''}<span class="chip pkd">felvéve ${mdShort(t.letrehozva ? t.letrehozva.slice(0, 10) : t.datum)}</span></div>
    <div class="pk-act">
      <button type="button" class="mini" data-act="pkmove" data-to="today" title="Áthelyezés a mai napra">Ma</button>
      <button type="button" class="mini" data-act="pkmove" data-to="tom" title="Áthelyezés holnapra">Holnap</button>
      <input type="date" class="pk-date" aria-label="Áthelyezés erre a napra" title="Válassz napot, majd nyomd meg a nyilat">
      <button type="button" class="mini" data-act="pkgo" title="Áthelyezés a kiválasztott napra">→</button>
      ${histBtn(t.id)}<button type="button" class="icon" data-act="edit" title="Szerkesztés" aria-label="Szerkesztés">✎</button>
    </div></li>`;
}

export function renderPark(){
  const box = $('#parkBody'), terms = queryTerms();
  const all = st.tasks.filter(isParked).sort(cmpParked), vis = all.filter(t => matchesText(t, terms));
  $('#parkCount').textContent = all.length ? (vis.length === all.length ? `${all.length} tétel` : `${vis.length} / ${all.length} tétel`) : 'üres';
  $('#btnPark').textContent = `Tároló (${all.length})`;
  $('#parkToggle').textContent = ov.park ? 'összecsukás' : 'kinyitás';
  box.hidden = !ov.park;
  if (!ov.park) return;
  if (box.contains(document.activeElement) && document.activeElement.classList.contains('pk-date')) return;   // ne vesszen el a gépelt dátum
  if (!vis.length) {
    box.innerHTML = `<div class="empty sm">${all.length ? 'Nincs találat a Tárolóban.' : 'A Tároló üres. Az űrlapon a „tárolóba” jelölővel veheted fel azt, aminek még nem tudod a dátumát.'}</div>`;
    return;
  }
  box.innerHTML = `<ul class="pk-list">${vis.map(t => st.editing === t.id ? editRow(t) : parkRow(t, terms) + (ui.histOpen.has(t.id) ? histRow(t) : '')).join('')}</ul>`;
}

export function setParkOpen(on){ ov.park = on; try { localStorage.setItem(LS_PARK, on ? '1' : '0'); } catch {} renderPark(); }

export function moveFromPark(id, ds){
  const t = st.tasks.find(x => x.id === id); if (!t || !isParked(t)) return;
  if (!ds || ds < '2000-01-01') { toast('Válassz érvényes napot.'); return; }
  const prev = { datum: t.datum, letrehozva: t.letrehozva };
  st.editing = null;
  updateTask(id, { tarolo:'', datum: ds, letrehozva: stamp() });          // aktív feladat lesz: a rögzítés ideje most van (az átfutási idő nem számolja a tárolásban töltött időt)
  if (!matches(t, queryTerms())) resetFilters();
  renderList(); flash(id);
  toast(`Áthelyezve a rendes feladatok közé: ${ds === todayStr() ? 'ma' : mdShort(ds)}`, 'Visszavonás', () => updateTask(id, { tarolo:'igen', datum: prev.datum, letrehozva: prev.letrehozva, hatarido:'' }));
}

export function sendToPark(id){
  const t = st.tasks.find(x => x.id === id); if (!t || isDone(t) || isParked(t)) return;
  const prev = { datum: t.datum, hatarido: t.hatarido };
  st.editing = null; ov.park = true; try { localStorage.setItem(LS_PARK, '1'); } catch {}
  updateTask(id, { tarolo:'igen', hatarido:'' });
  flash(id);
  toast('A Tárolóba került.', 'Visszavonás', () => updateTask(id, { tarolo:'', datum: prev.datum, hatarido: prev.hatarido }));
}

export function setPark(on){
  const f = $('#addForm'); f.classList.toggle('parking', on); $('#fPark').checked = on;
  f.querySelectorAll('#fDue,#fDate,[data-due]').forEach(el => { el.disabled = on; });
  $('#cmdTabTxt').textContent = on ? 'Új · tárolóba' : 'Új feladat';
  f.querySelector('.primary').textContent = on ? 'Tárolóba' : 'Rögzít';
}
