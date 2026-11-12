// Megbízók modellje: lista, CSV, egyeztetés, javaslatok (DOM-mentes)
import { csvf, detectDelimiter, parseCSV } from './csv.js';
import { fold } from './util.js';

/* --- megbízók --- */
export const normName = s => String(s || '').replace(/\s+/g, ' ').trim();

export const pkey = s => fold(normName(s));

export const PEOPLE_HEADER = ['nev', 'megjegyzes', 'aktiv'];

// megbizok.csv: fejléces (nev;megjegyzes;aktiv), de a fejléc nélküli, csak neveket tartalmazó lista is jó
export function parsePeople(raw){
  const d = detectDelimiter(raw), rows = parseCSV(raw, d); if (!rows.length) return [];
  const first = rows[0].map(s => fold(s.trim())), idx = {}; let body = rows;
  if (first.includes('nev')) { first.forEach((h, i) => { if (!(h in idx)) idx[h] = i; }); body = rows.slice(1); } else idx.nev = 0;
  const out = [], seen = new Set();
  for (const r of body) {
    const nev = normName(r[idx.nev]), k = pkey(nev); if (!k || seen.has(k)) continue; seen.add(k);
    const a = fold((idx.aktiv !== undefined ? r[idx.aktiv] : '') || '').trim();
    out.push({ nev, megjegyzes: normName(idx.megjegyzes !== undefined ? r[idx.megjegyzes] : ''), aktiv: ['nem','0','false','no','n'].includes(a) ? 'nem' : 'igen' });
  }
  return out;
}

export const peopleToCSV = list => '﻿' + [PEOPLE_HEADER.join(';'), ...list.map(p => [csvf(p.nev), csvf(p.megjegyzes), p.aktiv === 'nem' ? 'nem' : 'igen'].join(';'))].join('\r\n') + '\r\n';

// a feladatokban már szereplő nevekből induló lista (egy név több írásmódja → a leggyakoribb marad)
export function seedPeople(tasks){
  const g = new Map();
  for (const t of tasks) {
    const n = normName(t.megbizo), k = pkey(n); if (!k) continue;
    const e = g.get(k) || { total: 0, sp: new Map() }; e.total++; e.sp.set(n, (e.sp.get(n) || 0) + 1); g.set(k, e);
  }
  return [...g.values()].sort((a, b) => b.total - a.total).map(e => ({ nev: [...e.sp.entries()].sort((a, b) => b[1] - a[1])[0][0], megjegyzes: '', aktiv: 'igen' }));
}

// a feladatok megbízó-mezője a lista írásmódjára igazodik; a listából hiányzó nevek felkerülnek rá
export function reconcilePeople(tasks, people){
  const map = new Map(people.map(p => [pkey(p.nev), p])); let renamed = 0; const added = [];
  for (const t of tasks) {
    const n = normName(t.megbizo);
    if (!n) { if (t.megbizo) t.megbizo = ''; continue; }
    const k = pkey(n); let p = map.get(k);
    if (!p) { p = { nev: n, megjegyzes: '', aktiv: 'igen' }; people.push(p); map.set(k, p); added.push(n); }
    if (t.megbizo !== p.nev) { t.megbizo = p.nev; renamed++; }
  }
  return { renamed, added };
}

export function mergePeopleInto(target, incoming, deleted){
  const have = new Set(target.map(p => pkey(p.nev)));
  for (const d of incoming) { const k = pkey(d.nev); if (k && !have.has(k) && !(deleted && deleted.has(k))) { target.push(d); have.add(k); } }
}

export function lev(a, b){
  if (a === b) return 0; if (!a.length) return b.length; if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) { const cur = [i]; for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j-1] + 1, prev[j-1] + (a[i-1] === b[j-1] ? 0 : 1)); prev = cur; }
  return prev[b.length];
}

// tier: 0 pontos · 1 név eleje · 2 szó eleje · 3 részlet · 4 megjegyzésben · 5 elgépelésre hasonlít ("Erre gondoltál?")
export function suggestPeople(q, people, counts, limit = 12){
  const nq = pkey(q), n = p => (counts && counts.get(pkey(p.nev))) || 0;
  const out = [];
  for (const p of people) {
    if (p.aktiv === 'nem') continue;
    const nn = pkey(p.nev), words = nn.split(' '), note = pkey(p.megjegyzes); let tier = -1;
    if (!nq) tier = 3;
    else if (nn === nq) tier = 0;
    else if (nn.startsWith(nq)) tier = 1;
    else if (words.some(w => w.startsWith(nq))) tier = 2;
    else if (nn.includes(nq)) tier = 3;
    else if (note && note.includes(nq)) tier = 4;
    else if (nq.length >= 3) {
      const th = nq.length <= 4 ? 1 : 2;
      if ([nn, ...words].some(w => lev(nq, w) <= th) || lev(nq, nn.slice(0, nq.length)) <= th || words.some(w => lev(nq, w.slice(0, nq.length)) <= th)) tier = 5;
    }
    if (tier >= 0) out.push({ p, tier });
  }
  return out.sort((a, b) => a.tier - b.tier || n(b.p) - n(a.p) || a.p.nev.localeCompare(b.p.nev, 'hu')).slice(0, limit);
}

export const exactPerson = (q, people) => { const k = pkey(q); return k ? (people.find(p => pkey(p.nev) === k) || null) : null; };
