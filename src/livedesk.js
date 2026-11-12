// Live Desk: aktív munka sáv, mért idő, következő feladatok (a napi státuszsávban)
import { $, ICON_CLOCK, ICON_PAUSE, ICON_PLAY, ICON_USER, esc, isDone, live, st } from './state.js';
import { TAG_RE, dueInfo, isParked } from './tasks.js';
import { stampAt, toMs, todayStr } from './util.js';
import { activeOf, capOf, durMs, fmtHMS, fmtWork, workMsOfTask, workMsOn } from './worktime.js';

const shortText = t => t.feladat.replace(TAG_RE, '').trim() || t.feladat;
const mdShort = ds => (ds === todayStr() ? 'ma' : ds.slice(5).replace('-', '.') + '.');

// mai mért idő (ms) – a futó munkamenettel együtt
export const todayWorkMs = (now = Date.now()) => workMsOn(st.sessions, todayStr(), now, capOf(live.gap));

// az utoljára dolgozott, még nyitott feladat (a „Folytatás" gombhoz)
export function lastWorked(){
  const done = st.sessions.filter(s => s.veg).sort((a, b) => (a.veg < b.veg ? 1 : a.veg > b.veg ? -1 : a.kezdet < b.kezdet ? 1 : a.kezdet > b.kezdet ? -1 : 0));   // azonos másodperces vég: a később indult az újabb
  for (const s of done) { const t = st.tasks.find(x => x.id === s.feladat_id); if (t && !isDone(t) && !isParked(t)) return t; }
  return null;
}

/**
 * „Következő feladatok": a nyitott, ütemezett feladatok – előbb a határidősek határidő szerint, utánuk a többi (régebbi nap előbb).
 * Az aktív feladat kimarad (az a sávban van).
 */
export function nextTasks(now = Date.now(), activeId = null){
  const rows = [];
  for (const t of st.tasks) {
    if (isDone(t) || isParked(t) || t.id === activeId) continue;
    const di = dueInfo(t, now);
    rows.push({ t, di, rank: di ? 0 : 1, key: di ? di.due : 0 });
  }
  return rows.sort((a, b) => a.rank - b.rank || a.key - b.key || (a.t.datum < b.t.datum ? -1 : a.t.datum > b.t.datum ? 1 : 0) || (a.t.letrehozva || '').localeCompare(b.t.letrehozva || ''));
}

export function nextRow({ t, di }){
  const chip = di ? `<span class="chip dl ${di.state}" style="grid-area:auto">${ICON_CLOCK}${esc(di.label)}</span>` : `<span class="chip dl none" style="grid-area:auto">${esc(mdShort(t.datum))}</span>`;
  return `<div class="alr"><button type="button" class="go" data-live="start" data-id="${esc(t.id)}" title="Munka indítása" aria-label="Munka indítása">${ICON_PLAY}</button>`
    + `<button type="button" class="al ${di ? di.state : 'none'}" data-goto="${esc(t.id)}" title="${esc(t.feladat)}">${chip}<span class="at">${esc(shortText(t))}</span></button></div>`;
}

// a napi sáv alatti sor: aktív feladat vagy „nincs aktív feladat"
export function liveBar(now = Date.now()){
  const a = activeOf(st.sessions), cap = capOf(live.gap);
  if (!a) {
    const last = lastWorked();
    return `<div class="ld off"><i class="ld-dot"></i><span class="ld-tag">Nincs aktív feladat</span><span class="ld-hint">Indíts munkát a ▶ gombbal a listában vagy a következő feladatok között.</span>`
      + (last ? `<button type="button" class="mini ld-go" data-live="start" data-id="${esc(last.id)}" title="Munka folytatása ezen a feladaton">${ICON_PLAY} Folytatás: ${esc(shortText(last).slice(0, 40))}</button>` : '') + `</div>`;
  }
  const t = st.tasks.find(x => x.id === a.feladat_id), di = t ? dueInfo(t, now) : null;
  const sess = fmtHMS(durMs(a, now, cap)), tot = fmtWork(workMsOfTask(st.sessions, a.feladat_id, now, cap));
  return `<div class="ld on${live.gap ? ' hold' : ''}"><i class="ld-dot"></i><span class="ld-tag">Aktív</span>`
    + `<b class="ld-t mono" id="ldSess" title="Az aktuális munkamenet ideje">${sess}</b>`
    + `<span class="ld-name" title="${esc(t ? t.feladat : '')}">${esc(t ? shortText(t) : '(törölt feladat)')}</span>`
    + (t && t.megbizo ? `<span class="chip who" style="grid-area:auto">${ICON_USER}${esc(t.megbizo)}</span>` : '')
    + (di ? `<span class="chip dl ${di.state}" style="grid-area:auto" title="Határidő: ${esc(t.hatarido.replace('T', ' '))}">${ICON_CLOCK}${esc(di.label)}</span>` : '')
    + `<span class="ld-sum" title="A feladatra összesen fordított idő (az összes munkamenet)">Σ <b class="mono" id="ldTotal">${tot}</b></span>`
    + `<span class="ld-act"><button type="button" class="mini" data-live="pause" title="Szüneteltetés: a munkamenet lezárul, a feladat nyitott marad">${ICON_PAUSE} Szünet</button>`
    + `<button type="button" class="mini ok" data-live="finish" title="Befejezés: a feladat kész lesz, a mért idő megmarad">✓ Kész</button></span></div>`
    + (live.gap ? gapPanel(a, now) : '');
}

const hm = ms => stampAt(ms).slice(11, 16);
// alvás / óraváltozás után: a mért idő addig csak az ismert pillanatig számít, a felhasználó dönti el, mi történt
function gapPanel(a, now){
  const g = live.gap, clock = g.kind === 'clock', cap = capOf(g);
  const msg = clock
    ? `Az óra megváltozott (${hm(g.fromMs)} → ${hm(g.toMs)}), ezért a mért idő nem megbízható. Eddig ${fmtWork(durMs(a, now, cap))} számít.`
    : `Nem érkezett jel ${fmtWork(g.toMs - g.fromMs)} ideje (${hm(g.fromMs)} óta – alvás, zárolás vagy bezárt fül). Dolgoztál közben? Egyelőre ${fmtWork(durMs(a, now, cap))} számít.`;
  const lo = toMs(a.kezdet), hi = Math.max(now, lo), val = stampAt(Math.min(Math.max(g.fromMs, lo), hi)).slice(0, 16), min = a.kezdet.slice(0, 16), max = stampAt(hi).slice(0, 16);
  return `<div class="ld-gap" role="alert"><span class="ld-gap-t">${esc(msg)}</span><div class="ld-gap-act">`
    + (clock ? '' : `<button type="button" class="mini ok" data-live="gap-keep">Végig dolgoztam</button>`)
    + `<button type="button" class="mini" data-live="gap-resume" title="A kihagyott időt nem számoljuk; új munkamenet indul most">Szünet volt – folytatom most</button>`
    + `<label class="ld-gap-at">Leállítás itt: <input type="datetime-local" id="ldGapAt" value="${val}" min="${min}" max="${max}"></label>`
    + `<button type="button" class="mini" data-live="gap-stop">Leállítás</button></div></div>`;
}

// másodpercenként: csak a számlálók szövege frissül (a teljes újrarajzolás percenként van)
export function updateLive(now = Date.now()){
  const a = activeOf(st.sessions), cap = capOf(live.gap);
  const s = $('#ldSess'); if (s && a) s.textContent = fmtHMS(durMs(a, now, cap));
  const t = $('#ldTotal'); if (t && a) t.textContent = fmtWork(workMsOfTask(st.sessions, a.feladat_id, now, cap));
  const d = $('#ldToday'); if (d) d.textContent = fmtWork(todayWorkMs(now));
  if (a) document.querySelectorAll('[data-lt]').forEach(el => { el.textContent = fmtHMS(durMs(a, now, cap)); });
}
