// Szűrés, keresés-kiemelés, szövegformázás
import { esc, ui } from './state.js';
import { TAG_RE, extractTags } from './tasks.js';
import { dstr, fold, todayStr } from './util.js';

/* ---------- szűrés, kiemelés ---------- */
export const queryTerms = () => fold(ui.search).split(/\s+/).filter(Boolean);

export function matches(t, terms){
  if (ui.status !== 'all' && t.statusz !== ui.status) return false;
  if (ui.period !== 'all') {
    let from = todayStr();
    if (ui.period !== 'today') { const d = new Date(); d.setDate(d.getDate() - (+ui.period - 1)); from = dstr(d); }
    if (t.datum < from) return false;
  }
  return matchesText(t, terms);
}

export function matchesText(t, terms){
  if (!terms.length) return true;
  const tags = extractTags(t.feladat).map(fold), who = fold(t.megbizo || '').replace(/\s+/g,'');
  const hay = fold(`${t.feladat} ${t.megbizo || ''} ${t.datum} ${t.datum.replace(/-/g,'.')}`);
  return terms.every(x => x[0] === '@' ? who.includes(x.slice(1)) : x[0] === '#' ? tags.some(g => g.startsWith(x.slice(1))) : hay.includes(x));
}

export function hl(text, terms){
  if (!terms.length) return esc(text);
  const f = fold(text);
  if (f.length !== text.length) return esc(text);
  const ranges = [];
  for (const t of terms) { let i = 0; while ((i = f.indexOf(t, i)) !== -1) { ranges.push([i, i + t.length]); i += t.length; } }
  if (!ranges.length) return esc(text);
  ranges.sort((a,b) => a[0]-b[0]);
  const merged = [ranges[0].slice()];
  for (const r of ranges.slice(1)) { const l = merged[merged.length-1]; if (r[0] <= l[1]) l[1] = Math.max(l[1], r[1]); else merged.push(r.slice()); }
  let out = '', p = 0;
  for (const [a,b] of merged) { out += esc(text.slice(p,a)) + '<mark>' + esc(text.slice(a,b)) + '</mark>'; p = b; }
  return out + esc(text.slice(p));
}

export function fmtText(text, terms){                                           // szöveg + #címkék gombként
  const ht = terms.filter(x => x[0] !== '@' && x[0] !== '#');
  let out = '', last = 0;
  for (const m of text.matchAll(TAG_RE)) {
    out += hl(text.slice(last, m.index), ht) + `<button type="button" class="tag" data-act="tag" data-tag="#${esc(m[1])}">#${esc(m[1])}</button>`;
    last = m.index + m[0].length;
  }
  return out + hl(text.slice(last), ht);
}

export function dayLabel(ds){
  const [y,m,d] = ds.split('-').map(Number);
  let s = new Date(y, m-1, d).toLocaleDateString('hu-HU', { year:'numeric', month:'long', day:'numeric', weekday:'long' });
  const yd = new Date(); yd.setDate(yd.getDate() - 1);
  if (ds === todayStr()) s = 'Ma · ' + s; else if (ds === dstr(yd)) s = 'Tegnap · ' + s;
  return s;
}
