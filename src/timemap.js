// Munkaidő-térkép (az Áttekintés alján): a mért munka hétre, hónapra vagy az összes időre; hónapnál és összesítésnél napi sávok és óránkénti eloszlás, hétnél napi idővonal; az átfutási idő és a ráfordítás egymás mellett
import { timeMapModel } from './stats.js';
import { $, LS_TM, live, ov, st } from './state.js';
import { dayLabel, dstr, monthDays, pad, toMs, weekDays } from './util.js';
import { capOf, fmtLead, fmtWork } from './worktime.js';

const NS = 'http://www.w3.org/2000/svg';
const AX0 = 8, AX1 = 17, WORK_END = 16.5, MAXLEAD = 8;   // időtengely 08:00–17:00, a munkaidő vége 16:30
const OKTXT = { szunet: 'szünet', kesz: 'kész', valtas: 'váltás', tarolo: 'Tárolóba téve', torles: 'törölve' };
const hm = t => { const d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const clip = (s, n) => s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s;
const md = ds => ds.slice(5).replace('-', '.') + '.';

let lastKey = '', tv = false, wired = false, rt = 0;

const svgEl = (n, a = {}, parent, text) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); if (text != null) e.textContent = text; if (parent) parent.appendChild(e); return e; };
const htmlEl = (n, cls, text, parent) => { const e = document.createElement(n); if (cls) e.className = cls; if (text != null) e.textContent = text; if (parent) parent.appendChild(e); return e; };

/* ---------- tooltip (textContent: a feladatnevek nem megbízható adatok) ---------- */
function showTip(lines, x, y){
  const tip = $('#tmTip'), box = $('#tmap'); tip.replaceChildren();
  [['tv', lines[0]], ['tl', lines[1]], ['tm', lines[2]]].forEach(([c, t]) => { if (t) htmlEl('div', c, t, tip); });
  tip.classList.add('on');
  const r = box.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
  let L = x - r.left + 14, T = y - r.top - h - 12; if (T < 4) T = y - r.top + 18; if (L + w > r.width - 4) L = x - r.left - w - 14; if (L < 4) L = 4;
  tip.style.left = L + 'px'; tip.style.top = T + 'px';
}
const hideTip = () => $('#tmTip').classList.remove('on');
function hookTip(g, lines){
  g.setAttribute('tabindex', '0'); g.classList.add('hit');
  g.addEventListener('pointermove', e => showTip(lines, e.clientX, e.clientY));
  g.addEventListener('pointerleave', hideTip);
  g.addEventListener('focus', () => { const b = g.getBoundingClientRect(); showTip(lines, b.left + b.width / 2, b.top); });
  g.addEventListener('blur', hideTip);
}

/* ---------- mutatók ---------- */
function drawTiles(host, m){
  const t = m.tiles, T = [
    ['Mért idő', fmtWork(t.totalMs), `${t.days} munkanap · ${t.n} munkamenet`],
    ['Átlagos munkamenet', fmtWork(t.avgMs), 'leghosszabb: ' + fmtWork(t.longestMs)],
    ['Feladat', String(t.tasks), `${t.done} kész · ${t.tasks - t.done} folyamatban`],
    ['Ráfordítás / kész feladat', t.avgTaskMs == null ? '–' : fmtWork(t.avgTaskMs), t.avgN ? `átlag ${t.avgN} kész feladatra` : 'még nincs kész, mért feladat']
  ];
  const box = htmlEl('div', 'tm-tiles', null, host);
  T.forEach(([l, v, s]) => { const d = htmlEl('div', 'tm-tile', null, box); htmlEl('div', 'l', l, d); htmlEl('div', 'v', v, d); htmlEl('div', 's', s, d); });
}

/* ---------- jelmagyarázat ---------- */
function legend(host, items){
  const box = htmlEl('div', 'tm-leg', null, host);
  items.forEach(([draw, label]) => { const s = htmlEl('span', '', null, box), sv = svgEl('svg', { width: 18, height: 14, viewBox: '0 0 18 14' }); sv.style.width = '18px'; draw(sv); s.appendChild(sv); s.appendChild(document.createTextNode(label)); });
}
function mark(g, cx, cy, kind){
  if (kind === 'create') svgEl('path', { d: `M${cx} ${cy - 5}L${cx + 5} ${cy}L${cx} ${cy + 5}L${cx - 5} ${cy}Z`, class: 'tm-mk-c' }, g);
  else if (kind === 'done') { svgEl('circle', { cx, cy, r: 6.5, class: 'tm-mk-d' }, g); svgEl('path', { d: `M${cx - 3} ${cy}L${cx - 0.8} ${cy + 2.4}L${cx + 3.2} ${cy - 2.6}`, class: 'tm-mk-t' }, g); }
  else if (kind === 'reopen') svgEl('circle', { cx, cy, r: 5.5, class: 'tm-mk-r' }, g);
}

/* ---------- 1) idővonal ---------- */
function drawTimeline(host, m, W, now){
  const narrow = W < 640, labW = narrow ? 0 : Math.min(220, Math.round(W * .26)), totW = narrow ? 0 : 66, x0 = labW + 8, x1 = W - totW - 6, pw = x1 - x0;
  const X = t => { const d = new Date(t); return x0 + ((d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600) - AX0) / (AX1 - AX0) * pw; };
  const pitch = narrow ? 50 : 34, bar = 16;
  m.days.forEach(day => {
    const isNowDay = new Date(day.a).toDateString() === new Date(now).toDateString(), running = day.rows.some(r => r.segs.some(g => g.run));
    const hd = htmlEl('div', 'tm-dayh', null, host);
    htmlEl('b', '', dayLabel(day.day) + ' · ' + fmtWork(day.w) + ' mérve', hd);
    htmlEl('span', '', hm(day.a) + '–' + (isNowDay && running ? 'most' : hm(day.b)) + ' között, ennek ' + Math.round(day.share * 100) + '%-a mérve', hd);
    const rows = day.rows, H = rows.length * pitch + 24 + 14;
    const root = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `${dayLabel(day.day)}: ${rows.length} feladat, ${fmtWork(day.w)} mért munka` });
    root.style.height = H + 'px'; host.appendChild(root);
    const svg = svgEl('g', { transform: 'translate(0,14)' }, root);
    for (let h = AX0; h <= AX1; h++) { const x = x0 + (h - AX0) / (AX1 - AX0) * pw; svgEl('line', { x1: x, x2: x, y1: 0, y2: rows.length * pitch, class: 'tm-grid' }, svg); if (!narrow || h % 2 === 0) svgEl('text', { x, y: rows.length * pitch + 15, 'text-anchor': 'middle' }, svg, pad(h) + ':00'); }
    const xe = x0 + (WORK_END - AX0) / (AX1 - AX0) * pw; svgEl('line', { x1: xe, x2: xe, y1: -2, y2: rows.length * pitch, class: 'tm-end' }, svg); svgEl('text', { x: xe + 4, y: -4 }, svg, '16:30');
    if (isNowDay) { const xn = X(now); svgEl('line', { x1: xn, x2: xn, y1: -2, y2: rows.length * pitch, class: 'tm-now' }, svg); svgEl('text', { x: xn - 4, y: -4, 'text-anchor': 'end', class: 'tm-nowt' }, svg, 'most ' + hm(now)); }
    rows.forEach((r, i) => {
      const y = i * pitch, by = y + (narrow ? 24 : (pitch - bar) / 2);
      svgEl('line', { x1: 0, x2: W, y1: y + pitch, y2: y + pitch, class: 'tm-grid' }, svg);
      if (narrow) svgEl('text', { x: 0, y: y + 16, class: 't1' }, svg, clip(r.name, 34) + ' · ' + fmtWork(r.ms));
      else { const lab = svgEl('text', { x: 0, y: y + pitch / 2 + 4, class: 't1' }, svg, clip(r.name, Math.floor(labW / 6.4))); svgEl('title', {}, lab, r.name); svgEl('text', { x: W, y: y + pitch / 2 + 4, 'text-anchor': 'end', class: 't0' }, svg, fmtWork(r.ms)); }
      r.segs.forEach(s => {
        const g = svgEl('g', {}, svg), xa = X(s.a), xb = Math.max(xa + 3, X(s.b));
        svgEl('rect', { x: xa, y: by, width: xb - xa, height: bar, rx: 4, class: 'm tm-bar' + (s.run ? ' run' : '') }, g);
        if (s.run) svgEl('circle', { cx: xb, cy: by + bar / 2, r: 4.5, class: 'tm-rd run-dot' }, g);
        svgEl('rect', { x: xa - 2, y: by - 6, width: xb - xa + 4, height: bar + 12, fill: 'transparent' }, g);
        hookTip(g, [fmtWork(s.b - s.a), hm(s.s0) + '–' + (s.run ? 'most (folyamatban)' : hm(s.s1)) + ' · ' + r.name, s.run ? 'a munkamenet még fut' : 'lezárás oka: ' + (OKTXT[s.ok] || s.ok || '–')]);
      });
      const cy = by + bar / 2;
      if (r.created != null) { const g = svgEl('g', {}, svg); mark(g, X(r.created), cy, 'create'); hookTip(g, ['Létrehozva', hm(r.created) + ' · ' + r.name]); }
      r.done.forEach(t => { const g = svgEl('g', {}, svg); mark(g, X(t), cy, 'done'); hookTip(g, ['Lezárva (kész)', hm(t) + ' · ' + r.name]); });
      r.reopen.forEach(t => { const g = svgEl('g', {}, svg); mark(g, X(t), cy, 'reopen'); hookTip(g, ['Újranyitva', hm(t) + ' · ' + r.name]); });
    });
  });
}

/* ---------- 2) átfutási idő és ráfordítás ---------- */
function drawLead(host, m, W){
  const rows = m.lead.slice(0, MAXLEAD), narrow = W < 640;
  if (!rows.length) { htmlEl('p', 'tm-empty', 'Egyik feladatnak sincs rögzített létrehozási ideje, ezért az átfutási idő nem számolható.', host); return; }
  const labW = narrow ? 0 : Math.min(220, Math.round(W * .26)), ratW = narrow ? 0 : 56, x0 = labW + 8, pw = W - x0 - ratW - 74, pitch = narrow ? 60 : 44, bh = 10;
  const max = Math.max(...rows.map(r => Math.max(r.lead, r.work))), H = rows.length * pitch + 4;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Átfutási idő és ráfordítás feladatonként' }); svg.style.height = H + 'px'; host.appendChild(svg);
  rows.forEach((r, i) => {
    const y = i * pitch, top = y + (narrow ? 22 : (pitch - 2 * bh - 2) / 2), xs = narrow ? 0 : x0, ps = narrow ? W - 110 : pw, Sx = v => Math.max(2, v / max * ps);
    svgEl('line', { x1: 0, x2: W, y1: y + pitch, y2: y + pitch, class: 'tm-grid' }, svg);
    if (narrow) svgEl('text', { x: 0, y: y + 14, class: 't1' }, svg, clip(r.name, 40));
    else { const l = svgEl('text', { x: 0, y: y + pitch / 2 + 4, class: 't1' }, svg, clip(r.name, Math.floor(labW / 6.4))); svgEl('title', {}, l, r.name); }
    const g1 = svgEl('g', {}, svg); svgEl('rect', { x: xs, y: top, width: Sx(r.lead), height: bh, rx: 3, class: 'm tm-ctx' }, g1); svgEl('text', { x: xs + Sx(r.lead) + 6, y: top + bh - 1, class: 't1' }, g1, fmtLead(r.lead));
    const d0 = new Date(r.created), d1 = new Date(r.end), dd = d => `${md(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)} ${hm(d)}`;
    hookTip(g1, [fmtLead(r.lead), 'átfutási idő · ' + r.name, dd(d0) + ' (létrehozva) → ' + (r.done ? dd(d1) + ' (utolsó lezárás)' : 'most')]);
    const g2 = svgEl('g', {}, svg); svgEl('rect', { x: xs, y: top + bh + 2, width: Sx(r.work), height: bh, rx: 3, class: 'm tm-bar' }, g2); svgEl('text', { x: xs + Sx(r.work) + 6, y: top + 2 * bh + 1, class: 't0' }, g2, fmtWork(r.work));
    const pr = r.work / r.lead * 100, pct = (pr > 0 && pr < 1 ? '<1' : Math.round(pr)) + '%';
    hookTip(g2, [fmtWork(r.work), 'ráfordítás (mért munka) · ' + r.name, pct + ' az átfutási időből']);
    if (narrow) svgEl('text', { x: W, y: y + 14, 'text-anchor': 'end', class: 't0' }, svg, pct + (r.reopened ? ' · újranyitva' : ''));
    else svgEl('text', { x: W, y: y + pitch / 2 + 4, 'text-anchor': 'end', class: 't0' }, svg, pct);
  });
  if (m.lead.length > MAXLEAD) htmlEl('p', 'tm-more', `+ ${m.lead.length - MAXLEAD} további feladat (a táblázat nézetben mind látszik)`, host);
}

/* ---------- megállapítások ---------- */
function drawFindings(host, m){
  const ul = htmlEl('ul', 'tm-find', null, host);
  m.findings.forEach(parts => { const li = htmlEl('li', '', null, ul); parts.forEach(p => { if (typeof p === 'string') li.appendChild(document.createTextNode(p)); else htmlEl('b', '', p.b, li); }); });
}

/* ---------- 3) napi mért idő (hónap, összes) ---------- */
const hourTxt = m => m % 60 === 0 ? (m / 60) + ' ó' : m + ' p';
function drawDaily(host, m, W){
  const bars = m.bars, n = bars.length, wk = bars.some(b => b.tasks === null), padL = 38, padR = 6, H = 150, top = 16, bot = 22, pw = W - padL - padR, ph = H - top - bot;
  const maxMs = Math.max(...bars.map(b => b.ms), 60e3), step = [15, 30, 60, 120, 240, 480, 960].find(v => maxMs / 60e3 / v <= 4) || 960, ymax = Math.ceil(maxMs / 60e3 / step) * step;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': wk ? 'Heti mért idő' : 'Napi mért idő' }); svg.style.height = H + 'px'; host.appendChild(svg);
  const g0 = svgEl('g', { transform: `translate(0,${top})` }, svg), Y = v => ph - v / (ymax * 60e3) * ph;
  for (let v = 0; v <= ymax; v += step) { svgEl('line', { x1: padL, x2: W - padR, y1: Y(v * 60e3), y2: Y(v * 60e3), class: 'tm-grid' }, g0); svgEl('text', { x: padL - 6, y: Y(v * 60e3) + 4, 'text-anchor': 'end' }, g0, v ? hourTxt(v) : '0'); }
  const slot = pw / n, bw = Math.min(26, Math.max(3, slot * .68)), maxLab = Math.max(1, Math.floor(pw / (wk ? 46 : 24))), k = Math.ceil(n / maxLab), top1 = bars.reduce((q, b, i) => b.ms > bars[q].ms ? i : q, 0);
  bars.forEach((b, i) => {
    const x = padL + i * slot + (slot - bw) / 2, h = Math.max(0, b.ms / (ymax * 60e3) * ph);
    if (i % k === 0) svgEl('text', { x: x + bw / 2, y: ph + 15, 'text-anchor': 'middle' }, g0, wk ? md(b.from) : String(+b.from.slice(8)));
    if (b.ms <= 0) return;
    const g = svgEl('g', {}, g0); svgEl('rect', { x, y: ph - h, width: bw, height: h, rx: Math.min(3, bw / 2), class: 'm tm-bar' }, g);
    if (i === top1) svgEl('text', { x: x + bw / 2, y: ph - h - 5, 'text-anchor': 'middle', class: 't0' }, g, fmtWork(b.ms));
    svgEl('rect', { x: padL + i * slot, y: -top, width: slot, height: ph + top, fill: 'transparent' }, g);
    hookTip(g, wk ? [fmtWork(b.ms), md(b.from) + ' – ' + md(b.to), b.mdays + ' mért nap'] : [fmtWork(b.ms), dayLabel(b.from), b.tasks + ' feladat']);
  });
}

/* ---------- 4) óránkénti eloszlás ---------- */
function drawHours(host, m, W){
  const hrs = m.hours, act = hrs.map((v, i) => v > 0 ? i : -1).filter(i => i >= 0), total = hrs.reduce((a, v) => a + v, 0);
  if (!act.length) return;
  const lo = Math.min(8, act[0]), hi = Math.max(17, act[act.length - 1] + 1), n = hi - lo, narrow = W < 640, padL = 8, H = 120, top = 16, bot = 22, pw = W - padL - 6, ph = H - top - bot, max = Math.max(...hrs);
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Mért idő a nap óráira elosztva' }); svg.style.height = H + 'px'; host.appendChild(svg);
  const g0 = svgEl('g', { transform: `translate(0,${top})` }, svg); svgEl('line', { x1: padL, x2: W - 6, y1: ph, y2: ph, class: 'tm-grid' }, g0);
  const slot = pw / n, bw = Math.min(34, slot * .68), top1 = hrs.indexOf(max);
  for (let h = lo; h < hi; h++) {
    const i = h - lo, x = padL + i * slot + (slot - bw) / 2, v = hrs[h], bh = v / max * ph, pc = Math.round(v / total * 100);
    if (!narrow || i % 2 === 0) svgEl('text', { x: x + bw / 2, y: ph + 15, 'text-anchor': 'middle' }, g0, pad(h));
    if (v <= 0) continue;
    const g = svgEl('g', {}, g0); svgEl('rect', { x, y: ph - bh, width: bw, height: bh, rx: Math.min(3, bw / 2), class: 'm tm-bar' }, g);
    if (h === top1) svgEl('text', { x: x + bw / 2, y: ph - bh - 5, 'text-anchor': 'middle', class: 't0' }, g, pc + '%');
    svgEl('rect', { x: padL + i * slot, y: -top, width: slot, height: ph + top, fill: 'transparent' }, g);
    hookTip(g, [fmtWork(v), `${pad(h)}:00–${pad((h + 1) % 24)}:00`, (pc < 1 ? '<1' : pc) + '% a mért időből']);
  }
}

/* ---------- táblázat nézet (a diagramok akadálymentes párja) ---------- */
function drawTables(host, m, detail){
  const mk = (title, head, rows) => {
    htmlEl('h3', '', title, host);
    const t = htmlEl('table', 'tm-table', null, host), tr = htmlEl('tr', '', null, t);
    head.forEach((x, i) => { const th = htmlEl('th', i > 1 ? 'n' : '', x, tr); th.scope = 'col'; });
    rows.forEach(r => { const tr2 = htmlEl('tr', '', null, t); r.forEach((x, i) => htmlEl('td', i > 1 ? 'n' : '', x, tr2)); });
  };
  if (detail) {
    const segs = []; m.days.forEach(d => d.rows.forEach(r => r.segs.forEach(s => segs.push([r.name, d.day, hm(s.s0), s.run ? 'folyamatban' : hm(s.s1), fmtWork(s.b - s.a), s.run ? '–' : (OKTXT[s.ok] || s.ok || '–')]))));
    mk('Munkamenetek', ['Feladat', 'Nap', 'Kezdet', 'Vég', 'Időtartam', 'Lezárás oka'], segs);
  }
  mk('Átfutási idő és ráfordítás', ['Feladat', 'Állapot', 'Átfutási idő', 'Ráfordítás', 'Arány'], m.lead.map(r => { const p = r.work / r.lead * 100; return [r.name, r.done ? 'kész' : 'nyitott', fmtLead(r.lead), fmtWork(r.work), (p > 0 && p < 1 ? '<1' : Math.round(p)) + '%']; }));
  mk('Napi összesítés', ['Nap', 'Feladat', 'Mért idő', 'Első indítás', 'Utolsó leállítás'], m.days.map(d => [d.day, d.nTasks + ' feladat', fmtWork(d.w), hm(d.a), d.rows.some(r => r.segs.some(g => g.run)) ? 'folyamatban' : hm(d.b)]));
  if (!detail) { const tot = m.hours.reduce((x, v) => x + v, 0); mk('Óránkénti eloszlás', ['Óra', 'Mért idő', 'Arány'], m.hours.map((v, h) => [`${pad(h)}:00–${pad((h + 1) % 24)}:00`, v, (tot ? Math.round(v / tot * 100) : 0) + '%']).filter(r => r[1] > 0).map(r => [r[0], fmtWork(r[1]), r[2]])); }
}

/* ---------- időszak ---------- */
function allDays(now){
  let lo = Infinity; for (const s of st.sessions) { const t = toMs(s.kezdet); if (t < lo) lo = t; }
  const end = new Date(now), out = []; if (!isFinite(lo)) return [dstr(end)];
  const f = new Date(lo);
  for (const d = new Date(f.getFullYear(), f.getMonth(), f.getDate()); d <= end; d.setDate(d.getDate() + 1)) out.push(dstr(d));
  return out;
}
function period(now){
  const nd = new Date(now);
  if (ov.tm === 'w') { const d = weekDays(ov.tmo, nd); return { days: d, label: md(d[0]) + ' – ' + md(d[6]), detail: true, none: 'Ebben a héten nincs mért munkamenet.' }; }
  if (ov.tm === 'all') { const d = allDays(now); return { days: d, label: d[0].replace(/-/g, '.') + '. – ' + d[d.length - 1].replace(/-/g, '.') + '.', detail: false, none: 'Még nincs mért munkamenet.' }; }
  const mm = monthDays(ov.tmo, nd); return { days: mm.days, label: mm.first.toLocaleDateString('hu-HU', { year: 'numeric', month: 'long' }), detail: false, none: 'Ebben a hónapban nincs mért munkamenet.' };
}

/* ---------- összeállítás ---------- */
export function renderTimemap(){
  const box = $('#tmap'); box.hidden = ov.hidden; if (ov.hidden) return;
  if (!wired) {
    wired = true;
    $('#tmTv').addEventListener('click', () => { tv = !tv; lastKey = ''; renderTimemap(); });
    $('#tmMode').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; ov.tm = b.dataset.m; ov.tmo = 0; try { localStorage.setItem(LS_TM, ov.tm); } catch {} renderTimemap(); });
    $('#tmNav').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const d = +b.dataset.d; ov.tmo = d === 0 ? 0 : ov.tmo + d; renderTimemap(); });
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(renderTimemap, 80); }).observe(box);
  }
  const host = $('#tmBody'), W = Math.max(280, Math.floor(host.clientWidth) || 900), now = Date.now(), pr = period(now);
  const m = timeMapModel(st.sessions, st.tasks, st.hist, pr.days, now, capOf(live.gap), pr.detail);
  $('#tmRange').textContent = pr.label; $('#tmNav').hidden = ov.tm === 'all';
  $('#tmMode').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === ov.tm)));
  $('#tmTv').textContent = tv ? 'diagram nézet' : 'táblázat nézet'; $('#tmTv').setAttribute('aria-pressed', String(tv));
  const key = JSON.stringify([m, tv, W, ov.tm, pr.label]);
  if (key === lastKey) return;                    // változatlan adat: a DOM-ot (és a nyitott tooltipet) békén hagyjuk
  lastKey = key; hideTip(); host.replaceChildren();
  host.classList.toggle('tv', tv);
  if (!m.days.length) { htmlEl('p', 'tm-empty', pr.none + ' Az időmérést a feladat ▶ gombjával indíthatod; a mért idők itt jelennek meg.', host); return; }
  drawTiles(host, m);
  if (tv) { drawTables(host, m, pr.detail); return; }
  const card = (title, cap) => { const c = htmlEl('section', 'tm-card', null, host); htmlEl('h3', '', title, c); htmlEl('p', 'cap', cap, c); return c; };
  if (pr.detail) {
    const c1 = card('Mikor és mire ment el a munkaidő?', 'Egy sáv = egy munkamenet. Egy sor = egy feladat. Az idő a nap órái szerint halad.');
    legend(c1, [
      [sv => svgEl('rect', { x: 1, y: 3, width: 16, height: 8, rx: 3, class: 'tm-bar' }, sv), 'munkamenet'],
      [sv => svgEl('rect', { x: 1, y: 3, width: 16, height: 8, rx: 3, class: 'tm-bar run' }, sv), 'folyamatban'],
      [sv => mark(sv, 9, 7, 'create'), 'létrehozva'], [sv => mark(sv, 9, 7, 'done'), 'lezárva (kész)'], [sv => mark(sv, 9, 7, 'reopen'), 'újranyitva'],
      [sv => svgEl('line', { x1: 9, x2: 9, y1: 1, y2: 13, class: 'tm-now' }, sv), 'most'], [sv => svgEl('line', { x1: 9, x2: 9, y1: 1, y2: 13, class: 'tm-end' }, sv), 'munkaidő vége (16:30)']
    ]);
    drawTimeline(c1, m, W, now);
  } else {
    drawDaily(card(m.bars.some(b => b.tasks === null) ? 'Mennyit dolgoztam hetente?' : 'Mennyit dolgoztam naponta?', m.bars.some(b => b.tasks === null) ? 'Egy oszlop = egy hét (hétfőtől) mért munkaideje.' : 'Egy oszlop = egy nap mért munkaideje.'), m, W);
    drawHours(card('Mikor dolgozom a nap folyamán?', 'A mért idő a nap óráira elosztva (helyi idő).'), m, W);
  }
  const c2 = card('Átfutási idő és tényleges ráfordítás', 'Az átfutási idő a létrehozástól az utolsó lezárásig (vagy a mostig) tart, a ráfordítás csak a mért munka.');
  legend(c2, [
    [sv => svgEl('rect', { x: 1, y: 3, width: 16, height: 8, rx: 3, class: 'tm-ctx' }, sv), 'átfutási idő'], [sv => svgEl('rect', { x: 1, y: 3, width: 16, height: 8, rx: 3, class: 'tm-bar' }, sv), 'ráfordítás (mért munka)']
  ]);
  drawLead(c2, m, W);
  if (m.findings.length) { const c3 = card('Mit látunk', ''); c3.querySelector('.cap').remove(); drawFindings(c3, m); }
}
