// Munkamenetek (Live Desk) modellje: indítás/szünet/váltás/befejezés, CSV, javítás, egyesítés, napokra bontás, alvás-ellenőrzés (DOM-mentes)
//
// Időkezelés: a kezdet/veg helyi, zóna nélküli ISO-bélyeg (mint a többi fájlban). Az idotartam_mp lezáráskor a valós
// időpontok (ms) különbségéből készül, ezért a nyári/téli időszámítás-váltás nem torzítja; a futó munkamenet idejét mindig
// `most − kezdet` adja (nincs növelt számláló), így háttérfül, alvás, frissítés és újraindítás után is helyes.
import { csvf, detectDelimiter, parseCSV } from './csv.js';
import { newId, normStamp, stampAt, toMs } from './util.js';

export const SESS_HEADER = ['id', 'feladat_id', 'kezdet', 'veg', 'idotartam_mp', 'ok'];
// szunet/valtas/kesz: a felhasználó műveletei; tarolo/torles: a feladat sorsa miatti kényszerített lezárás
export const SESS_OK = ['szunet', 'valtas', 'kesz', 'tarolo', 'torles'];
export const SLEEP_MS = 5 * 60e3;          // ennyi szívverés-kimaradás után kérdezzük meg, hogy tényleg dolgoztál-e
const DST_SLACK_S = 3700;                  // az idotartam_mp és a veg−kezdet legfeljebb ennyit térhet el (időszámítás-váltás)

const str = v => String(v ?? '');
export const isActive = s => !s.veg;
export const activeOf = list => list.find(isActive) || null;
const startMs = s => toMs(s.kezdet);
const byStart = (a, b) => (a.kezdet < b.kezdet ? -1 : a.kezdet > b.kezdet ? 1 : 0);

/* ---------- időtartamok ---------- */
// [kezdet, vég] ms-ban; a futó munkamenet vége: most (capMs-ig, ha egy ellenőrzés még nem dőlt el)
export function spanOf(s, nowMs, capMs = Infinity){
  const a = startMs(s); if (isNaN(a)) return null;
  let b;
  if (isActive(s)) b = Math.min(nowMs, capMs);
  else { const d = s.idotartam_mp === '' ? NaN : Number(s.idotartam_mp); b = Number.isFinite(d) && d >= 0 ? a + d * 1000 : toMs(s.veg); }
  if (isNaN(b)) return null;
  return [a, Math.max(a, b)];
}
export const durMs = (s, nowMs, capMs) => { const x = spanOf(s, nowMs, capMs); return x ? x[1] - x[0] : 0; };
export const workMsOfTask = (list, taskId, nowMs, capMs) => list.reduce((n, s) => n + (s.feladat_id === taskId ? durMs(s, nowMs, capMs) : 0), 0);
export const dayBounds = day => { const [y, m, d] = day.split('-').map(Number); return [new Date(y, m - 1, d).getTime(), new Date(y, m - 1, d + 1).getTime()]; };
// egy naptári napra eső munkaidő (az éjfélen átnyúló munkamenetet megosztja a napok között)
export function workMsOn(list, day, nowMs, capMs){
  const [a, b] = dayBounds(day); let sum = 0;
  for (const s of list) { const x = spanOf(s, nowMs, capMs); if (!x) continue; const lo = Math.max(a, x[0]), hi = Math.min(b, x[1]); if (hi > lo) sum += hi - lo; }
  return sum;
}

/* ---------- műveletek (a listát helyben módosítják) ---------- */
export function closeSession(s, endMs, ok){
  const a = startMs(s), end = isNaN(a) ? endMs : Math.max(endMs, a);
  s.veg = stampAt(end); s.idotartam_mp = String(isNaN(a) ? 0 : Math.round((end - a) / 1000)); s.ok = ok;
  return s;
}
// Munka indítása. Ha már van aktív munkamenet egy másik feladaton, azt „valtas" okkal lezárja (ugyanabban a pillanatban indul az új).
export function startWork(list, taskId, nowMs){
  const cur = activeOf(list);
  if (cur && cur.feladat_id === taskId) return { started: null, closed: null, same: cur };
  const closed = cur ? closeSession(cur, nowMs, 'valtas') : null;
  const started = { id: newId(), feladat_id: taskId, kezdet: stampAt(nowMs), veg: '', idotartam_mp: '', ok: '' };
  list.push(started);
  return { started, closed, same: null };
}
export const pauseWork = (list, nowMs) => { const cur = activeOf(list); return cur ? closeSession(cur, nowMs, 'szunet') : null; };
// a feladat lezárása / Tárolóba tétele / törlése: ha éppen ő az aktív, a munkamenet szabályosan lezárul
export const stopForTask = (list, taskId, nowMs, ok) => { const cur = activeOf(list); return cur && cur.feladat_id === taskId ? closeSession(cur, nowMs, ok) : null; };

// több nyitott munkamenet (két fül, kézi szerkesztés): a legkésőbb kezdődő marad aktív, a korábbiakat a következő kezdetével zárjuk
export function normalizeActive(list){
  const act = list.filter(isActive).sort(byStart);
  for (let i = 0; i < act.length - 1; i++) closeSession(act[i], startMs(act[i + 1]), 'valtas');
  return Math.max(0, act.length - 1);
}

/* ---------- alvás és óraváltozás ---------- */
// hbMs: az utolsó szívverés (a program élt-e). Visszaad: null | { kind: 'sleep' | 'clock', fromMs, toMs }
export function gapCheck(active, hbMs, nowMs, thr = SLEEP_MS){
  if (!active) return null;
  const a = startMs(active); if (isNaN(a)) return null;
  if (nowMs < a - 60e3) return { kind: 'clock', fromMs: a, toMs: nowMs };                         // a kezdet a jövőben van
  const hb = Math.max(a, Number.isFinite(hbMs) && hbMs > 0 ? hbMs : a);
  if (nowMs < hb - 60e3) return { kind: 'clock', fromMs: hb, toMs: nowMs };                       // az óra visszaugrott
  if (nowMs - hb > thr) return { kind: 'sleep', fromMs: hb, toMs: nowMs };
  return null;
}
// amíg az ellenőrzés nem dőlt el, csak a megbízhatóan ismert időt számoljuk
export const capOf = gap => (gap ? Math.min(gap.fromMs, gap.toMs) : Infinity);

/* ---------- CSV ---------- */
export function sessionsToCSV(list){
  const lines = [SESS_HEADER.join(';')];
  for (const s of [...list].sort(byStart)) lines.push(SESS_HEADER.map(k => csvf(s[k])).join(';'));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/**
 * Beolvasás fejléc alapján. Az érvénytelen sorokat nem viszi tovább (bad), a javítható hibákat helyrehozza (fixed).
 * blocked: a nemüres fájl fejléce ismeretlen → nem szabad felülírni.
 */
export function parseSessions(raw){
  const res = { sessions: [], bad: 0, fixed: 0, blocked: false };
  const text = str(raw).replace(/^﻿/, '');
  if (!text.trim()) return res;
  const rows = parseCSV(text, detectDelimiter(text));
  const head = (rows[0] || []).map(c => c.trim().toLowerCase()), col = k => head.indexOf(k);
  if (col('id') < 0 || col('feladat_id') < 0 || col('kezdet') < 0) { res.blocked = true; res.bad = Math.max(0, rows.length - 1); return res; }
  const g = (r, k) => (col(k) >= 0 && r[col(k)] !== undefined ? str(r[col(k)]) : '');
  const byId = new Map();
  for (const r of rows.slice(1)) {
    if (r.every(c => !str(c).trim())) continue;
    const id = g(r, 'id').trim(), fid = g(r, 'feladat_id').trim(), k = normStamp(g(r, 'kezdet'));
    if (!id || !fid || k.length < 16) { res.bad++; continue; }
    const vraw = g(r, 'veg').trim(), v = vraw ? normStamp(vraw) : '';
    if (vraw && v.length < 16) { res.bad++; continue; }
    const s = { id, feladat_id: fid, kezdet: k, veg: v, idotartam_mp: '', ok: '' };
    if (v) {
      const a = toMs(k), b = toMs(v);
      if (b < a) { res.bad++; continue; }
      const dRaw = g(r, 'idotartam_mp').trim(), derived = Math.round((b - a) / 1000);
      if (/^\d+$/.test(dRaw) && Math.abs(+dRaw - derived) <= DST_SLACK_S) s.idotartam_mp = String(+dRaw);
      else { s.idotartam_mp = String(derived); if (dRaw !== '') res.fixed++; }
      const ok = g(r, 'ok').trim();
      if (SESS_OK.includes(ok)) s.ok = ok; else { s.ok = 'szunet'; res.fixed++; }
    } else if (g(r, 'ok').trim() || g(r, 'idotartam_mp').trim()) res.fixed++;
    const dup = byId.get(id);
    if (dup) { res.bad++; if (isActive(dup) && !isActive(s)) Object.assign(dup, s); continue; }   // azonos azonosító: a lezárt sor erősebb
    byId.set(id, s); res.sessions.push(s);
  }
  res.fixed += normalizeActive(res.sessions);
  res.sessions.sort(byStart);
  return res;
}

// azonosító szerinti egyesítés (a target helyben bővül): a lezárt sor erősebb a nyitottnál, két lezárt közül a későbbi veg nyer.
// Visszaadja a változtatások számát.
export function mergeSessions(target, incoming){
  const map = new Map(target.map(s => [s.id, s])); let n = 0;
  for (const s of incoming) {
    const m = map.get(s.id);
    if (!m) { const c = { ...s }; target.push(c); map.set(c.id, c); n++; }
    else if ((isActive(m) && !isActive(s)) || (!isActive(m) && !isActive(s) && s.veg > m.veg)) { Object.assign(m, s); n++; }
  }
  n += normalizeActive(target);
  if (n) target.sort(byStart);
  return n;
}

/* ---------- formázás ---------- */
const p2 = n => String(n).padStart(2, '0');
export const fmtHMS = ms => { const t = Math.max(0, Math.floor(ms / 1000)); return `${p2(Math.floor(t / 3600))}:${p2(Math.floor(t / 60) % 60)}:${p2(t % 60)}`; };
export const fmtWork = ms => { const m = Math.round(Math.max(0, ms) / 60000); return m < 60 ? `${m} p` : `${Math.floor(m / 60)} ó ${p2(m % 60)} p`; };
