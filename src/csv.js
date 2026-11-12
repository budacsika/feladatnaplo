// CSV beolvasás/írás és a feladatok sémaváltozatainak (v0/v1/v2) kezelése (DOM-mentes)
import { HEADER, cimkeToTags, extractTags } from './tasks.js';
import { fold, newId, normDate, normDeadline, normStamp, todayStr } from './util.js';

export function detectDelimiter(text){
  let inQ = false, sc = 0, cc = 0, tc = 0;
  for (const ch of text) {
    if (ch === '"') inQ = !inQ;
    else if (!inQ) { if (ch === '\n') break; if (ch === ';') sc++; else if (ch === ',') cc++; else if (ch === '\t') tc++; }
  }
  if (tc > sc && tc > cc) return '\t';
  return (sc > 0 && sc >= cc) ? ';' : (cc > 0 ? ',' : ';');
}

export function parseCSV(text, d){
  text = String(text).replace(/^﻿/, '');
  const rows = []; let row = [], f = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i+1] === '"') { f += '"'; i++; } else inQ = false; }
      else f += c;
    } else if (c === '"' && f === '') inQ = true;
    else if (c === d) { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i+1] === '\n') i++;
      row.push(f); f = ''; rows.push(row); row = [];
    } else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => !r.every(x => x.trim() === ''));
}

// → { tasks, kind }  kind: 'v2' (jelenlegi), 'v1' (régi, cimke oszlopos), 'v0' (fejléc nélküli dátum;szöveg), 'empty'
export function rowsToTasks(rows, d = ';'){
  if (!rows.length) return { tasks:[], kind:'empty' };
  const first = rows[0].map(s => s.trim().toLowerCase());
  const out = [];
  if (first.includes('id') && first.includes('feladat')) {
    const idx = {}; first.forEach((h,i) => { if (!(h in idx)) idx[h] = i; });
    const g = (r,k) => idx[k] !== undefined ? (r[idx[k]] || '').trim() : '';
    const hasCimke = 'cimke' in idx, hasNew = ['megbizo','hatarido','lezarva'].every(k => k in idx);
    for (const r of rows.slice(1)) {
      const letrehozva = normStamp(g(r,'letrehozva')), modositva = normStamp(g(r,'modositva'));
      let feladat = g(r,'feladat');
      if (hasCimke) {                                                    // régi címke → #címke a szöveg végén
        const have = new Set(extractTags(feladat).map(fold));
        for (const tg of cimkeToTags(g(r,'cimke'))) if (!have.has(fold(tg))) { feladat += (feladat ? ' ' : '') + '#' + tg; have.add(fold(tg)); }
      }
      const statusz = fold(g(r,'statusz')) === 'kesz' ? 'kesz' : 'nyitott';
      let lezarva = normStamp(g(r,'lezarva'));
      if (statusz === 'kesz' && !lezarva) lezarva = modositva || letrehozva;
      if (statusz !== 'kesz') lezarva = '';
      const tarolo = (fold(g(r,'tarolo')) === 'igen' && statusz !== 'kesz') ? 'igen' : '';
      const t = { id: g(r,'id') || newId(), datum: normDate(g(r,'datum')) || letrehozva.slice(0,10) || todayStr(), feladat,
                  megbizo: g(r,'megbizo'), hatarido: tarolo ? '' : normDeadline(g(r,'hatarido')), statusz, letrehozva, modositva, lezarva, tarolo };
      if (t.feladat) out.push(t);
    }
    return { tasks: out, kind: (hasNew && !hasCimke) ? 'v2' : 'v1' };
  }
  const today = todayStr();                                              // régi: datum;"feladat"
  for (const r of rows) {
    if (r.length < 2) continue;
    const datum = normDate(r[0]), feladat = r.slice(1).join(d).trim();
    if (!datum || !feladat) continue;
    out.push({ id:newId(), datum, feladat, megbizo:'', hatarido:'', statusz: datum < today ? 'kesz' : 'nyitott', letrehozva:'', modositva:'', lezarva:'', tarolo:'' });
  }
  return { tasks: out, kind: 'v0' };
}

export const csvq = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';

export const csvf = v => { v = String(v ?? ''); return /[;"\r\n]|^\s|\s$/.test(v) ? csvq(v) : v; };

export function toCSV(list){
  const lines = [HEADER.join(';')];
  for (const t of list) lines.push(HEADER.map(k => k === 'feladat' ? csvq(t[k]) : csvf(t[k])).join(';'));
  return '﻿' + lines.join('\r\n') + '\r\n';
}
