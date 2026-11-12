// Feladat-modell: oszlopfejléc, címkék, rendezés, összefésülés, határidő-állapot (DOM-mentes)

import { dstr, fmtAgo, fmtLeft, toMs } from './util.js';

export const HEADER = ['id','datum','feladat','megbizo','hatarido','statusz','letrehozva','modositva','lezarva','tarolo'];

// Tároló: nem ütemezett feladat – nincs határideje, nem számít bele a statisztikába, nem szerepel a napi listában
export const isParked = t => t.tarolo === 'igen';

// #címke a szövegben (szóköz vagy ( után)
export const TAG_RE = /(?<![^\s(])#([\p{L}\p{N}_]+)/gu;

export const extractTags = text => Array.from(String(text).matchAll(TAG_RE), m => m[1]);

// régi "cimke" oszlop → #címkék (szóköz → _, több címke , vagy ; mentén)
export const cimkeToTags = c => String(c||'').split(/[,;]+/).map(x => x.trim().replace(/^#+/,'').replace(/[^\p{L}\p{N}_]+/gu,'_').replace(/^_+|_+$/g,'')).filter(Boolean);

export function mergeInto(target, incoming, deleted){
  const map = new Map(target.map(t => [t.id, t]));
  for (const d of incoming) {
    if (deleted && deleted.has(d.id)) continue;
    const m = map.get(d.id);
    if (!m) { target.push(d); map.set(d.id, d); }
    else if ((d.modositva || '') >= (m.modositva || '')) Object.assign(m, d);   // lemezen lévő friss/azonos időbélyegű sor nyer (külső szerkesztés); a mi mentetlen módosításunk újabb
  }
}

// state: over (lejárt) | h1 (≤1 óra) | h2 (≤2 óra) | today | soon (holnap) | later | done
export function dueInfo(t, now = Date.now()){
  if (!t.hatarido) return null;
  const hasTime = t.hatarido.length > 10;
  let due = toMs(t.hatarido); if (isNaN(due)) return null;
  if (!hasTime) due += 86399999;                                         // csak dátum: a nap végéig érvényes
  const dday = t.hatarido.slice(0,10), hm = t.hatarido.slice(11,16), md = dday.slice(5).replace('-','.') + '.';
  const today = dstr(new Date(now)); const tm = new Date(now); tm.setDate(tm.getDate()+1);
  const diff = due - now; let state, label;
  if (t.statusz === 'kesz') { state = 'done'; label = hasTime ? `${md} ${hm}` : md; }
  else if (diff < 0) { state = 'over'; label = 'lejárt · ' + fmtAgo(-diff); }
  else if (hasTime && diff <= 3600e3) { state = 'h1'; label = fmtLeft(diff) + ' múlva'; }
  else if (hasTime && diff <= 7200e3) { state = 'h2'; label = fmtLeft(diff) + ' múlva'; }
  else if (dday === today) { state = 'today'; label = hasTime ? 'ma ' + hm : 'ma'; }
  else if (dday === dstr(tm)) { state = 'soon'; label = hasTime ? 'holnap ' + hm : 'holnap'; }
  else { state = 'later'; label = hasTime ? `${md} ${hm}` : md; }
  return { state, label, due, diff, hasTime };
}

// lista-sorrend: nap szerint csökkenő; napon belül a nyitottak elöl, a kész feladatok alul; ezen belül a rögzítés ideje szerint (a régebbi elöl)
export const cmpTasks = (a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : 0)
  || ((a.statusz === 'kesz') - (b.statusz === 'kesz'))
  || (a.letrehozva || '').localeCompare(b.letrehozva || '');

// tároló-sorrend: rögzítés ideje szerint (a régebbi elöl)
export const cmpParked = (a, b) => (a.letrehozva || '').localeCompare(b.letrehozva || '');
