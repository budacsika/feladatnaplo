// A napok szerinti feladatlista kirajzolása és a szerkesztősor
import { dayLabel, fmtText, hl, matches, queryTerms } from './filter.js';
import { renderPark } from './park.js';
import { $, ICON_CLOCK, ICON_USER, esc, isDone, st, ui } from './state.js';
import { cmpTasks, dueInfo, isParked } from './tasks.js';
import { todayStr } from './util.js';

/* ---------- lista ---------- */
export function viewRow(t, terms, now){
  const done = isDone(t), di = dueInfo(t, now);
  const tip = [t.letrehozva && 'Rögzítve: ' + t.letrehozva.replace('T',' '),
               t.modositva && t.modositva !== t.letrehozva && 'Módosítva: ' + t.modositva.replace('T',' '),
               t.lezarva && 'Lezárva: ' + t.lezarva.replace('T',' ')].filter(Boolean).join('\n');
  const cls = 'task' + (done ? ' done' : '') + (di && !done ? ' st-' + di.state : '');
  return `<li class="${cls}" data-id="${esc(t.id)}">
    <input type="checkbox" class="chk" data-act="toggle" ${done?'checked':''} aria-label="Kész">
    <div class="body" title="${esc(tip)}"><span class="txt">${fmtText(t.feladat, terms)}</span>${t.megbizo ? `<button type="button" class="chip who" data-act="who" data-who="${esc(t.megbizo)}" title="Megbízó – kattintásra szűrés">${ICON_USER}${hl(t.megbizo, terms.filter(x => x[0] !== '@' && x[0] !== '#'))}</button>` : ''}</div>
    ${di ? `<span class="chip dl ${di.state}" title="Határidő: ${esc(t.hatarido.replace('T',' '))}">${ICON_CLOCK}${esc(di.label)}</span>` : ''}
    <button type="button" class="icon" data-act="edit" title="Szerkesztés" aria-label="Szerkesztés">✎</button></li>`;
}

export function editRow(t){
  return `<li class="task editing" data-id="${esc(t.id)}"><form class="edit" data-id="${esc(t.id)}">
    <textarea name="feladat" rows="2" aria-label="Feladat">${esc(t.feladat)}</textarea>
    ${isParked(t) ? `<div class="edit-grid pk">
      <input type="text" name="megbizo" class="who-input" autocomplete="off" value="${esc(t.megbizo)}" placeholder="Megbízó" aria-label="Megbízó">
    </div>` : `<div class="edit-grid">
      <input type="text" name="megbizo" class="who-input" autocomplete="off" value="${esc(t.megbizo)}" placeholder="Megbízó" aria-label="Megbízó">
      <input type="datetime-local" name="hatarido" value="${esc(t.hatarido.length > 10 ? t.hatarido : '')}" aria-label="Határidő">
      <input type="date" name="datum" value="${esc(t.datum)}" aria-label="Dátum" required>
    </div>`}
    <div class="edit-row">
      <button type="button" class="danger" data-act="del">Törlés</button><span class="spacer"></span>
      ${!isParked(t) && !isDone(t) ? '<button type="button" class="ghost" data-act="topark" title="Nem ütemezett feladat: kikerül a napi listából és a statisztikából">Tárolóba</button>' : ''}
      <button type="button" class="ghost" data-act="cancel">Mégse</button>
      <button type="submit" class="primary">Mentés</button>
    </div></form></li>`;
}

export function renderList(){
  const terms = queryTerms(), list = $('#list'), now = Date.now();
  const act = st.tasks.filter(t => !isParked(t));
  const vis = act.filter(t => matches(t, terms));
  const open = act.filter(t => !isDone(t)).length;
  $('#meta').textContent = `${vis.length} / ${act.length} tétel · ${open} nyitott`;
  renderPark();
  if (!vis.length) {
    list.innerHTML = `<div class="empty">${act.length ? 'Nincs találat.' : 'Még nincs bejegyzés – rögzítsd az elsőt fent.'}</div>`;
    return;
  }
  vis.sort(cmpTasks);                                                    // stabil rendezés: egyenlő esetben a fájlbeli sorrend marad
  const cnt = {}, dn = {}; vis.forEach(t => { cnt[t.datum] = (cnt[t.datum]||0) + 1; if (isDone(t)) dn[t.datum] = (dn[t.datum]||0) + 1; });
  const today = todayStr();
  const forced = terms.length > 0 || ui.status !== 'all' || ui.period !== 'all';          // keresés/szűrés közben minden találat látszik
  const editDay = st.editing ? (st.tasks.find(x => x.id === st.editing) || {}).datum : null;
  const isOpen = ds => forced || ds === editDay || (ui.dayState.has(ds) ? ui.dayState.get(ds) : ds === today);
  let html = '', cur = null;
  for (const t of vis) {
    if (t.datum !== cur) {
      if (cur !== null) html += '</ul></section>';
      cur = t.datum;
      const op = isOpen(cur), nOpen = cnt[cur] - (dn[cur]||0);
      html += `<section class="day${cur === today ? ' is-today' : ''}${op ? '' : ' collapsed'}"><h2><button type="button" class="dtoggle" data-act="day" data-day="${esc(cur)}" aria-expanded="${op}" title="${op ? 'Összecsukás' : 'Kinyitás'}"><span class="chev">▾</span>${esc(dayLabel(cur))}</button><small>${dn[cur]||0}/${cnt[cur]} kész${!op && nOpen ? ` · <b>${nOpen} nyitott</b>` : ''}</small></h2><ul>`;
    }
    html += st.editing === t.id ? editRow(t) : viewRow(t, terms, now);
  }
  list.innerHTML = html + '</ul></section>';
}
