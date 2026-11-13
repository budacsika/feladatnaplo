// Időszaki és megbízónkénti statisztikák (DOM-mentes)
import { normName, pkey } from './people-model.js';
import { dueInfo, extractTags, isParked } from './tasks.js';
import { WDN, fold, toMs } from './util.js';
import { dayBounds, fmtLead, fmtWork, isActive, spanOf, workMsOfTask } from './worktime.js';

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

/**
 * Munkaidő-térkép modellje (DOM-mentes): egy időszak (days) munkamenetei napokra és feladatokra bontva.
 *   days[{day,a,b,w,share,rows[{id,name,ms,segs[{id,a,b,s0,s1,run,ok}],created,done[],reopen[]}]}] – csak a mért napok
 *   tiles: összes mért idő, munkamenetek száma, átlagos és leghosszabb munkamenet, feladatok / kész, átlagos ráfordítás
 *   lead[{id,name,lead,work,done,reopened,created,end}]: átfutási idő (létrehozás → utolsó lezárás vagy most) és a teljes mért
 *     ráfordítás egymás mellett – két külön mennyiség, a diagramon sem keverjük
 *   findings: mondatok részekre bontva (szöveg vagy { b } félkövér)
 * A mért idő ugyanaz, mint a workStats-ban (napokra vágva); a futó munkamenet a `now`-ig (cap-ig) tart.
 */
export function timeMapModel(sessions, tasks, hist, days, now = Date.now(), cap = Infinity){
  const byId = new Map(tasks.map(t => [t.id, t])), ww = workStats(sessions, tasks, days, now, cap);
  const nameOf = id => { const t = byId.get(id); return t ? t.feladat : '(törölt feladat)'; };
  const doneEv = new Map(), reopenEv = new Map(), push = (m, k, v) => { const a = m.get(k) || []; a.push(v); m.set(k, a); };
  for (const e of hist || []) {
    if (e.mezo !== 'statusz') continue;
    const t = toMs(e.idopont); if (isNaN(t)) continue;
    if (e.uj === 'kesz') push(doneEv, e.feladat, t); else if (e.regi === 'kesz') push(reopenEv, e.feladat, t);
  }
  const inDay = (t, lo, hi) => t >= lo && t < hi, per = new Map(), dayList = [];   // per: munkamenet-azonosító → az időszakra eső ms (az éjfélen átnyúló egy munkamenet marad)
  for (const d of days) {
    const [lo, hi] = dayBounds(d), rows = new Map(); let w = 0, a = Infinity, b = -Infinity;
    for (const s of sessions) {
      const x = spanOf(s, now, cap); if (!x) continue;
      const sa = Math.max(lo, x[0]), sb = Math.min(hi, x[1]); if (sb <= sa) continue;
      const seg = { id: s.id, a: sa, b: sb, s0: x[0], s1: x[1], run: isActive(s), ok: s.ok || '' };
      const r = rows.get(s.feladat_id) || { id: s.feladat_id, name: nameOf(s.feladat_id), ms: 0, segs: [], first: sa }; r.segs.push(seg); r.ms += sb - sa; rows.set(s.feladat_id, r);
      w += sb - sa; a = Math.min(a, sa); b = Math.max(b, sb); per.set(s.id, (per.get(s.id) || 0) + sb - sa);
    }
    if (!rows.size) continue;
    const list = [...rows.values()].sort((p, q) => p.first - q.first);
    for (const r of list) {
      const t = byId.get(r.id), c = t ? toMs(t.letrehozva) : NaN, dn = (doneEv.get(r.id) || []).filter(v => inDay(v, lo, hi)), ro = (reopenEv.get(r.id) || []).filter(v => inDay(v, lo, hi));
      r.created = !isNaN(c) && inDay(c, lo, hi) ? c : null;
      if (!dn.length && t && t.statusz === 'kesz' && !(doneEv.get(r.id) || []).length) { const z = toMs(t.lezarva); if (!isNaN(z) && inDay(z, lo, hi)) dn.push(z); }   // a naplózás előtt lezárt feladat: a lezarva mezőből
      r.done = dn; r.reopen = ro;
    }
    dayList.push({ day: d, a, b, w, share: b > a ? w / (b - a) : 1, rows: list });
  }
  const lead = [];
  for (const wt of ww.tasks) {
    const t = byId.get(wt.id); if (!t) continue;
    const c = toMs(t.letrehozva), done = t.statusz === 'kesz', end = done ? toMs(t.lezarva) : now;
    if (isNaN(c) || isNaN(end) || end <= c) continue;
    lead.push({ id: t.id, name: t.feladat, lead: end - c, work: workMsOfTask(sessions, t.id, now, cap), done, reopened: reopenEv.has(t.id), created: c, end });
  }
  lead.sort((p, q) => q.lead - p.lead);
  const doneN = ww.tasks.filter(x => { const t = byId.get(x.id); return t && t.statusz === 'kesz'; }).length;
  const lens = [...per.values()], tiles = { totalMs: ww.totalMs, n: lens.length, avgMs: lens.length ? ww.totalMs / lens.length : 0, longestMs: lens.reduce((m, v) => Math.max(m, v), 0),
    days: dayList.length, tasks: ww.tasks.length, done: doneN, avgTaskMs: ww.avgTaskMs, avgN: ww.avgN };

  const findings = [];
  if (lens.length) {
    const big = lens.filter(v => v >= 45 * 60e3), bigMs = big.reduce((x, v) => x + v, 0), short = lens.filter(v => v < 10 * 60e3).length;
    findings.push(big.length
      ? ['A mért idő ', { b: Math.round(bigMs / ww.totalMs * 100) + '%-a' }, ` ${big.length} darab, legalább 45 perces blokkból áll; a ${lens.length} munkamenetből ${short} rövidebb 10 percnél.`]
      : [`Egyik munkamenet sem érte el a 45 percet; a ${lens.length} munkamenetből `, { b: String(short) }, ' rövidebb 10 percnél.']);
  }
  if (lead.length) {
    const w = lead[0], pct = w.work / w.lead * 100;
    findings.push(['A leghosszabb átfutású feladat (' + w.name + ') ', { b: fmtLead(w.lead) }, ' alatt ' + (w.done ? 'zárult le' : 'telt el eddig') + ', ebből ', { b: `${fmtWork(w.work)} (${pct < 1 ? '<1' : Math.round(pct)}%)` }, ' volt mért munka' + (w.reopened ? ' – közben lezárták, majd újranyitották.' : '.')]);
  }
  if (dayList.length) {
    const dn = d => WDN[new Date(d.day + 'T12:00:00').getDay()];
    findings.push(['Az első indítás és az utolsó leállítás közötti idő ', { b: dayList.map(d => `${dn(d)} ${Math.round(d.share * 100)}%`).join(', ') }, ' volt mérve' + (dayList.some(d => d.rows.some(r => r.segs.some(g => g.run))) ? ' (a mai nap még fut)' : '') + '. A különbség részben mérés nélküli munka (megbeszélés, szünet), mert az időmérés nem kötelező.']);
  }
  return { days: dayList, tiles, lead, findings };
}
