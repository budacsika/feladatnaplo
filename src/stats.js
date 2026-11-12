// Időszaki és megbízónkénti statisztikák (DOM-mentes)
import { normName, pkey } from './people-model.js';
import { dueInfo, extractTags, isParked } from './tasks.js';
import { fold, toMs } from './util.js';
import { dayBounds, spanOf, workMsOfTask } from './worktime.js';

export function periodStats(tasks, days, now = Date.now()){
  const set = new Set(days), per = {}; days.forEach(d => per[d] = { total:0, done:0, open:0 });
  const who = new Map(), tags = new Map(); let total = 0, done = 0, over = 0, leadSum = 0, leadN = 0;
  const bump = (map, key, name) => { const e = map.get(key) || { name, n:0 }; e.n++; map.set(key, e); };
  for (const t of tasks) {
    if (isParked(t) || !set.has(t.datum)) continue;
    const p = per[t.datum]; p.total++; total++;
    if (t.statusz === 'kesz') { p.done++; done++; const a = toMs(t.letrehozva), b = toMs(t.lezarva); if (!isNaN(a) && !isNaN(b) && b >= a) { leadSum += b - a; leadN++; } }
    else { p.open++; const di = dueInfo(t, now); if (di && di.state === 'over') over++; }
    const w = (t.megbizo || '').trim(); if (w) bump(who, fold(w).replace(/\s+/g,' '), w);
    const seen = new Set(); for (const tg of extractTags(t.feladat)) { const k = fold(tg); if (!seen.has(k)) { seen.add(k); bump(tags, k, tg.toLowerCase()); } }
  }
  const sorted = m => [...m.values()].sort((a,b) => b.n - a.n || a.name.localeCompare(b.name, 'hu'));
  return { per, total, done, open: total - done, over, leadMs: leadN ? leadSum/leadN : null, who: sorted(who), tags: sorted(tags) };
}

// kitől hány feladat: days = null → összes
export function peopleStats(tasks, people, days, now = Date.now()){
  const set = days ? new Set(days) : null, rows = new Map();
  const mk = (nev, p) => ({ nev, megjegyzes: p ? p.megjegyzes : '', aktiv: p ? p.aktiv !== 'nem' : true, total: 0, done: 0, open: 0, over: 0, last: '' });
  for (const p of people) rows.set(pkey(p.nev), mk(p.nev, p));
  const none = { total: 0, done: 0, open: 0, over: 0 };
  for (const t of tasks) {
    if (isParked(t) || (set && !set.has(t.datum))) continue;
    const k = pkey(t.megbizo); let r = none;
    if (k) { r = rows.get(k); if (!r) { r = mk(normName(t.megbizo), null); rows.set(k, r); } }
    r.total++;
    if (t.statusz === 'kesz') r.done++; else { r.open++; const di = dueInfo(t, now); if (di && di.state === 'over') r.over++; }
    if (k && t.datum > r.last) r.last = t.datum;
  }
  return { rows: [...rows.values()].sort((a, b) => b.total - a.total || a.nev.localeCompare(b.nev, 'hu')), none };
}

/**
 * Mért munkaidő az időszakban (days: egymást követő napok). A munkamenetek napokra vágva számítanak (az éjfélen átnyúló is);
 * a Tárolóban lévő vagy törölt feladat munkamenete is számít az időösszegekbe (a ráfordítás megtörtént).
 *   totalMs, per[nap] = ms, tasks[{id,name,ms}], who[{name,ms}],
 *   avgTaskMs / avgN: a KÉSZ (ebben az időszakban lezárt), mért feladatok átlagos tényleges ráfordítása (az összes munkamenetük).
 * Nem keverendő az „átfutási idővel" (letrehozva → lezarva): az periodStats.leadMs, ez itt kizárólag mért munkaidő.
 */
export function workStats(sessions, tasks, days, now = Date.now(), cap = Infinity){
  const byId = new Map(tasks.map(t => [t.id, t])), per = {}, task = new Map(), who = new Map(); let totalMs = 0;
  for (const d of days) {
    const [a, b] = dayBounds(d); per[d] = 0;
    for (const s of sessions) {
      const x = spanOf(s, now, cap); if (!x) continue;
      const ms = Math.min(b, x[1]) - Math.max(a, x[0]); if (ms <= 0) continue;
      per[d] += ms; totalMs += ms;
      const t = byId.get(s.feladat_id), te = task.get(s.feladat_id) || { id: s.feladat_id, name: t ? t.feladat : '(törölt feladat)', ms: 0 }; te.ms += ms; task.set(s.feladat_id, te);
      const w = t && (t.megbizo || '').trim(), wk = w ? fold(w).replace(/\s+/g, ' ') : '', we = who.get(wk) || { name: w || '(nincs megbízó)', ms: 0 }; we.ms += ms; who.set(wk, we);
    }
  }
  const set = new Set(days); let sum = 0, n = 0;
  for (const t of tasks) {
    if (isParked(t) || t.statusz !== 'kesz' || !set.has(String(t.lezarva || '').slice(0, 10))) continue;
    const ms = workMsOfTask(sessions, t.id, now, cap); if (ms > 0) { sum += ms; n++; }
  }
  const sorted = m => [...m.values()].sort((a, b) => b.ms - a.ms || a.name.localeCompare(b.name, 'hu'));
  return { totalMs, per, tasks: sorted(task), who: sorted(who), avgTaskMs: n ? sum / n : null, avgN: n };
}
