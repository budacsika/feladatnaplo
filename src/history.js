// Előzmények (munkanapló) modellje: események, CSV, változás-észlelés, szöveges leírás (DOM-mentes)
import { csvf, detectDelimiter, parseCSV } from './csv.js';
import { newId, normStamp } from './util.js';

// tortenet.csv: egy sor = egy esemény. Csak bővül, a sorok sosem módosulnak → több gép/fájl között azonosító szerint egyesíthető.
export const HIST_HEADER = ['id', 'feladat', 'idopont', 'mezo', 'regi', 'uj'];
// ezeknek a mezőknek a változását naplózzuk (a modositva/lezarva/letrehozva időbélyegek következmények, nem külön események)
export const TRACKED = ['datum', 'feladat', 'megbizo', 'hatarido', 'statusz', 'tarolo'];
const KINDS = new Set([...TRACKED, 'letrehozva', 'torolve', 'visszaallitva']);

const str = v => String(v ?? '');
const snapOf = t => ({ datum: str(t.datum), feladat: str(t.feladat), megbizo: str(t.megbizo), hatarido: str(t.hatarido), statusz: str(t.statusz), tarolo: str(t.tarolo) });
export const makeSnap = tasks => new Map(tasks.map(t => [t.id, snapOf(t)]));
const byTime = (a, b) => (a.idopont < b.idopont ? -1 : a.idopont > b.idopont ? 1 : 0);   // stabil: azonos időnél a fájlbeli sorrend marad

/**
 * Az előző állapothoz (snap) képest mi változott a feladatlistában.
 * known: azon feladat-azonosítók halmaza, amelyekhez már van esemény (a törölt és visszavont tétel így „visszaállítva", nem „létrehozva").
 * Visszaad: { events, snap } – az új események és az új alapállapot.
 */
export function diffTasks(snap, tasks, known, now){
  const next = makeSnap(tasks), events = [];
  const ev = (id, at, mezo, regi, uj) => events.push({ id: newId(), feladat: id, idopont: at, mezo, regi: str(regi), uj: str(uj) });
  for (const t of tasks) {
    const prev = snap.get(t.id), cur = next.get(t.id);
    if (!prev) {
      if (known.has(t.id)) ev(t.id, now, 'visszaallitva', '', t.feladat);
      else {
        ev(t.id, normStamp(t.letrehozva) || now, 'letrehozva', '', t.feladat);
        if (cur.tarolo === 'igen') ev(t.id, now, 'tarolo', '', 'igen');
      }
      continue;
    }
    for (const k of TRACKED) if (prev[k] !== cur[k]) ev(t.id, now, k, prev[k], cur[k]);
  }
  for (const [id, p] of snap) if (!next.has(id)) ev(id, now, 'torolve', p.feladat, '');
  return { events, snap: next };
}

// azonosító szerinti egyesítés (a target helyben bővül, idő szerint rendezve); visszaadja az újonnan felvett események számát
export function mergeHistory(target, incoming){
  const have = new Set(target.map(e => e.id)); let n = 0;
  for (const e of incoming) if (!have.has(e.id)) { target.push(e); have.add(e.id); n++; }
  if (n) target.sort(byTime);
  return n;
}

export function histToCSV(events){
  const lines = [HIST_HEADER.join(';')];
  for (const e of [...events].sort(byTime)) lines.push(HIST_HEADER.map(k => csvf(e[k])).join(';'));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

// fejléc alapján olvas (az oszlopsorrend mindegy); az érvénytelen sorokat eldobja
export function parseHistory(raw){
  const text = String(raw || '').replace(/^﻿/, '');
  if (!text.trim()) return [];
  const rows = parseCSV(text, detectDelimiter(text));
  if (!rows.length) return [];
  const head = rows[0].map(s => s.trim().toLowerCase()), col = k => head.indexOf(k);
  if (col('id') < 0 || col('feladat') < 0 || col('idopont') < 0 || col('mezo') < 0) return [];
  const g = (r, k) => (col(k) >= 0 && r[col(k)] !== undefined ? r[col(k)] : '');
  const out = [], seen = new Set();
  for (const r of rows.slice(1)) {
    const id = g(r, 'id').trim(), at = normStamp(g(r, 'idopont')), mezo = g(r, 'mezo').trim();
    if (!id || seen.has(id) || !g(r, 'feladat').trim() || !at || !KINDS.has(mezo)) continue;
    seen.add(id);
    out.push({ id, feladat: g(r, 'feladat').trim(), idopont: at, mezo, regi: g(r, 'regi'), uj: g(r, 'uj') });
  }
  return out.sort(byTime);
}

/* ---------- megjelenítés ---------- */
const dt = s => str(s).replace('T', ' ');
const dash = s => s || '–';
export const clip = (s, n = 60) => { s = str(s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

export function describeEvent(e){
  switch (e.mezo) {
    case 'letrehozva': return 'Létrehozva';
    case 'torolve': return 'Törölve';
    case 'visszaallitva': return 'Visszaállítva';
    case 'statusz': return e.uj === 'kesz' ? 'Lezárva' : 'Újranyitva';
    case 'hatarido': return !e.regi ? `Határidő megadva: ${dt(e.uj)}` : !e.uj ? `Határidő törölve (volt: ${dt(e.regi)})` : `Határidő: ${dt(e.regi)} → ${dt(e.uj)}`;
    case 'megbizo': return `Megbízó: ${dash(e.regi)} → ${dash(e.uj)}`;
    case 'datum': return `Nap: ${dash(e.regi)} → ${dash(e.uj)}`;
    case 'feladat': return `Szöveg módosítva: „${clip(e.regi, 40)}” → „${clip(e.uj, 40)}”`;
    case 'tarolo': return e.uj === 'igen' ? 'Tárolóba téve' : 'Tárolóból kivéve';
    default: return e.mezo;
  }
}

// "2026-11-09T16:20:05" → "11.09. 16:20"
export const fmtWhen = at => str(at).slice(5, 10).replace('-', '.') + '. ' + str(at).slice(11, 16);

/**
 * Egy feladat időrendi története. Ha a naplózás előtti feladatról van szó, a hiányzó „létrehozva" / „lezárva" pontot
 * a feladat saját időbélyegeiből pótoljuk (old: true).
 */
export function timelineFor(t, evs){
  const out = evs.map(e => ({ at: e.idopont, text: describeEvent(e), e }));
  if (t) {
    if (t.letrehozva && !evs.some(e => e.mezo === 'letrehozva')) out.push({ at: normStamp(t.letrehozva) || t.letrehozva, text: 'Létrehozva', old: true });
    if (t.statusz === 'kesz' && t.lezarva && !evs.some(e => e.mezo === 'statusz' && e.uj === 'kesz')) out.push({ at: normStamp(t.lezarva) || t.lezarva, text: 'Lezárva', old: true });
  }
  return out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

// a törölt feladat utolsó ismert szövege (az eseményekből)
function lastText(evs){
  for (let i = evs.length - 1; i >= 0; i--) {
    const e = evs[i];
    if (e.mezo === 'torolve') return e.regi;
    if (e.mezo === 'feladat' || e.mezo === 'letrehozva' || e.mezo === 'visszaallitva') return e.uj;
  }
  return '';
}

// egy nap összes eseménye (a hiányzó előzményeket a feladatok időbélyegeiből pótolva), idő szerint
export function journalDay(tasks, hist, day){
  const by = new Map();
  for (const e of hist) { let a = by.get(e.feladat); if (!a) by.set(e.feladat, a = []); a.push(e); }
  const byId = new Map(tasks.map(t => [t.id, t])), out = [];
  for (const id of new Set([...by.keys(), ...byId.keys()])) {
    const t = byId.get(id), evs = by.get(id) || [], label = t ? t.feladat : lastText(evs);
    for (const x of timelineFor(t, evs)) if (str(x.at).slice(0, 10) === day) out.push({ at: x.at, id, text: x.text, task: label, old: !!x.old, gone: !t });
  }
  return out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}
