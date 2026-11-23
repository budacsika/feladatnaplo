// A napok szerinti feladatlista kirajzolása és a szerkesztősor
import { dayLabel, fmtText, hl, matches, queryTerms } from './filter.js';
import { clip, commentMap, fmtWhen, timelineFor } from './history.js';
import { renderPark } from './park.js';
import { $, ICON_CLOCK, ICON_PAUSE, ICON_PLAY, ICON_USER, esc, isDone, live, st, ui } from './state.js';
import { cmpTasks, dueInfo, isParked } from './tasks.js';
import { groupKeys, monthLabel, todayStr, weekKeyOf, weekLabel } from './util.js';
import { activeOf, capOf, durMs, fmtHMS, fmtWork, workTotals } from './worktime.js';

/* ---------- lista ---------- */
export function viewRow(t, terms, now, wm, cm){
  const done = isDone(t), di = dueInfo(t, now);
  const tip = [t.letrehozva && 'Rögzítve: ' + t.letrehozva.replace('T',' '),
               t.modositva && t.modositva !== t.letrehozva && 'Módosítva: ' + t.modositva.replace('T',' '),
               t.lezarva && 'Lezárva: ' + t.lezarva.replace('T',' ')].filter(Boolean).join('\n');
  const act = activeOf(st.sessions), working = !!act && act.feladat_id === t.id && !done;
  const cmt = done ? null : (cm || commentMap(st.hist)).get(t.id);
  const cls = 'task' + (done ? ' done' : '') + (di && !done ? ' st-' + di.state : '') + (working ? ' working' : '');
  return `<li class="${cls}" data-id="${esc(t.id)}">
    <input type="checkbox" class="chk" data-act="toggle" ${done?'checked':''} aria-label="Kész">
    <div class="body" title="${esc(tip)}"><span class="txt">${fmtText(t.feladat, terms)}</span>${done ? spentChip(t, now, wm) : ''}${working ? `<span class="chip wk" data-lt title="Folyamatban lévő munkamenet">${fmtHMS(durMs(act, now, capOf(live.gap)))}</span>` : ''}${t.megbizo ? `<button type="button" class="chip who" data-act="who" data-who="${esc(t.megbizo)}" title="Megbízó – kattintásra szűrés">${ICON_USER}${hl(t.megbizo, terms.filter(x => x[0] !== '@' && x[0] !== '#'))}</button>` : ''}${cmt ? `<span class="cmt" title="${esc(fmtWhen(cmt.idopont))}${cmt.regi === 'szunet' ? ' · szünetnél' : ''}">💬 ${esc(clip(cmt.uj, 160))}</span>` : ''}</div>
    ${di ? `<span class="chip dl ${di.state}" title="Határidő: ${esc(t.hatarido.replace('T',' '))}">${ICON_CLOCK}${esc(di.label)}</span>` : ''}
    <span class="acts">${done ? '' : working
      ? `<button type="button" class="icon go-b on" data-act="pause" title="Szüneteltetés" aria-label="Szüneteltetés">${ICON_PAUSE}</button>`
      : `<button type="button" class="icon go-b" data-act="start" title="Munka indítása" aria-label="Munka indítása">${ICON_PLAY}</button>`}${noteBtn(t)}${histBtn(t.id)}<button type="button" class="icon" data-act="edit" title="Szerkesztés" aria-label="Szerkesztés">✎</button></span></li>`;
}

// kész feladaton: a ráfordított (mért) idő, ha már van adat (fél percnél több)
function spentChip(t, now, wm){
  const e = (wm || workTotals(st.sessions, now, capOf(live.gap))).get(t.id);
  return e && e.ms >= 30e3 ? `<span class="chip tm" title="Ráfordított idő: ${fmtWork(e.ms)} (${e.n} munkamenet)">${fmtWork(e.ms)}</span>` : '';
}

/* ---------- előzmények ---------- */
export const noteBtn = t => `<button type="button" class="icon note-b${ui.noteOpen === t.id ? ' on' : ''}" data-act="note" title="Megjegyzés hozzáadása" aria-label="Megjegyzés hozzáadása" aria-expanded="${ui.noteOpen === t.id}">💬</button>`;

// megjegyzés írása a sor alatt (a piszkozat a ui-ban él, így az újrarajzolás nem viszi el)
export const noteRow = t => `<li class="hist notef" data-for="${esc(t.id)}"><form class="note-add" data-id="${esc(t.id)}"><input type="text" name="megjegyzes" maxlength="300" autocomplete="off" value="${esc(ui.noteDraft)}" placeholder="Megjegyzés (pl. mire vársz)" aria-label="Megjegyzés"><button type="submit" class="mini ok">Mentés</button><button type="button" class="mini" data-act="notex">Mégse</button></form></li>`;

export const histBtn = id => `<button type="button" class="icon hist-b${ui.histOpen.has(id) ? ' on' : ''}" data-act="hist" title="Előzmények" aria-label="Előzmények" aria-expanded="${ui.histOpen.has(id)}">${ICON_CLOCK}</button>`;

// egy feladat időrendi története (a sor alatt nyílik ki)
export function histRow(t){
  const tl = timelineFor(t, st.hist.filter(e => e.feladat === t.id));
  return `<li class="hist" data-for="${esc(t.id)}"><ol>${tl.map(x => `<li${x.old ? ' class="old" title="A naplózás előtti időbélyegből"' : ''}><time>${esc(fmtWhen(x.at))}</time><span>${esc(x.text)}</span></li>`).join('')}</ol></li>`;
}

// a sor + (ha nyitva van) az előzményei
export const taskRows = (t, terms, now, wm, cm) => st.editing === t.id ? editRow(t) : viewRow(t, terms, now, wm, cm) + (ui.noteOpen === t.id ? noteRow(t) : '') + (ui.histOpen.has(t.id) ? histRow(t) : '');

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
  const today = todayStr(), curW = weekKeyOf(today), curM = curW.slice(0, 7);
  const forced = terms.length > 0 || ui.status !== 'all' || ui.period !== 'all';          // keresés/szűrés közben minden találat látszik
  const editDay = st.editing ? (st.tasks.find(x => x.id === st.editing) || {}).datum : null;
  const isOpen = ds => forced || ds === editDay || (ui.dayState.has(ds) ? ui.dayState.get(ds) : ds === today || cnt[ds] > (dn[ds] || 0));   // alapból nyitva: a mai nap és minden nap, amelyikben van megoldatlan feladat
  const wm = workTotals(st.sessions, now, capOf(live.gap)), cm = commentMap(st.hist);
  const dayHTML = (cur, ts) => {
    const op = isOpen(cur), nOpen = cnt[cur] - (dn[cur]||0);
    return `<section class="day${cur === today ? ' is-today' : ''}${op ? '' : ' collapsed'}"><h2><button type="button" class="dtoggle" data-act="day" data-day="${esc(cur)}" aria-expanded="${op}" title="${op ? 'Összecsukás' : 'Kinyitás'}"><span class="chev">▾</span>${esc(dayLabel(cur))}</button><small>${dn[cur]||0}/${cnt[cur]} kész${!op && nOpen ? ` · <b>${nOpen} nyitott</b>` : ''}</small></h2><ul>${ts.map(t => taskRows(t, terms, now, wm, cm)).join('')}</ul></section>`;
  };
  // napok → hetek → hónapok (egymást követő, azonos hetű / hónapú napok)
  const days = []; for (const t of vis) { const l = days[days.length - 1]; if (l && l.ds === t.datum) l.ts.push(t); else days.push({ ds: t.datum, ts: [t] }); }
  const weeks = []; for (const d of days) { const k = weekKeyOf(d.ds), l = weeks[weeks.length - 1]; if (l && l.k === k) l.days.push(d); else weeks.push({ k, days: [d] }); }
  const sum = ds => ds.reduce((a, d) => (a.n += cnt[d.ds], a.done += dn[d.ds] || 0, a.d++, a), { n: 0, done: 0, d: 0 });
  const grp = (cls, key, label, tag, g, open, body) => `<section class="grp ${cls}${open ? '' : ' collapsed'}"><h3><button type="button" class="dtoggle gtoggle" data-act="grp" data-g="${esc(key)}" aria-expanded="${open}" title="${open ? 'Összecsukás' : 'Kinyitás'}"><span class="chev">▾</span>${esc(label)}${tag}</button><small>${g.d} nap · ${g.done}/${g.n} kész${!open && g.n > g.done ? ` · <b>${g.n - g.done} nyitott</b>` : ''}</small></h3><div class="grp-b">${body}</div></section>`;
  const wkHTML = w => {
    const g = sum(w.days), key = 'w:' + w.k, hasEdit = w.days.some(d => d.ds === editDay);
    const open = forced || hasEdit || (ui.groupState.has(key) ? ui.groupState.get(key) : w.k === curW || g.n > g.done);   // alapból nyitva: a jelenlegi hét és minden hét, amelyikben van megoldatlan feladat
    return grp('wk', key, weekLabel(w.k), w.k === curW ? ' · e hét' : '', g, open, w.days.map(d => dayHTML(d.ds, d.ts)).join(''));
  };
  let html = '';
  for (let i = 0; i < weeks.length;) {
    const mk = weeks[i].k.slice(0, 7); let j = i; while (j < weeks.length && weeks[j].k.slice(0, 7) === mk) j++;
    const ws = weeks.slice(i, j);
    if (mk === curM) html += ws.map(wkHTML).join('');                   // a jelenlegi hónapnak nincs külön fejléce
    else {
      const g = sum(ws.flatMap(w => w.days)), key = 'm:' + mk, hasEdit = ws.some(w => w.days.some(d => d.ds === editDay));
      html += grp('mo', key, monthLabel(mk), '', g, forced || hasEdit || (ui.groupState.has(key) ? ui.groupState.get(key) : g.n > g.done), ws.map(wkHTML).join(''));
    }
    i = j;
  }
  list.innerHTML = html;
}

// egy nap megnyitása: a napot és a hetét / hónapját is (ugrás, villantás, kipipálás után)
export function revealDay(ds){ ui.dayState.set(ds, true); for (const k of groupKeys(ds)) ui.groupState.set(k, true); }
