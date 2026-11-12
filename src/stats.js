// Időszaki és megbízónkénti statisztikák (DOM-mentes)
import { normName, pkey } from './people-model.js';
import { dueInfo, extractTags, isParked } from './tasks.js';
import { fold, toMs } from './util.js';

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
