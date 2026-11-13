// Napi sáv, heti/havi irányítópult és diagramok
import { $, esc, isDone, live, ov, st } from './state.js';
import { liveBar, nextRow, nextTasks, todayWorkMs } from './livedesk.js';
import { periodStats, workStats } from './stats.js';
import { dueInfo, isParked } from './tasks.js';
import { renderTimemap } from './timemap.js';
import { fmtDur, isoWeek, monthDays, todayStr, weekDays } from './util.js';
import { activeOf, capOf, fmtWork } from './worktime.js';

/* ---------- dashboard ---------- */
export function urgency(now = Date.now()){
  const list = []; let over = 0, h1 = 0, h2 = 0;
  for (const t of st.tasks) {
    if (isDone(t) || isParked(t)) continue;
    const di = dueInfo(t, now); if (!di) continue;
    if (di.state === 'over') over++; else if (di.state === 'h1') h1++; else if (di.state === 'h2') h2++;
    if (di.state === 'over' || di.state === 'h1' || di.state === 'h2' || di.state === 'today') list.push({ t, di });
  }
  list.sort((a,b) => a.di.due - b.di.due);
  return { over, h1, h2, list };
}

export function ringSVG(done, total){
  const R = 44, C = 2*Math.PI*R, pct = total ? done/total : 0;
  return `<svg viewBox="0 0 120 120" class="ring-svg" role="img" aria-label="Mai teljesítés">
    <circle class="spin" cx="60" cy="60" r="57" fill="none" stroke="rgba(53,224,255,.4)" stroke-width="1.5" stroke-dasharray="1.5 5"/>
    <circle cx="60" cy="60" r="${R}" fill="none" stroke="rgba(53,224,255,.12)" stroke-width="11"/>
    <circle cx="60" cy="60" r="${R}" fill="none" stroke="url(#gRing)" stroke-width="11" stroke-dasharray="${(C*pct).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 60 60)" filter="url(#fGlow)"/>
    <text x="60" y="58" text-anchor="middle" class="rt-big" style="font-size:27px">${total ? Math.round(pct*100) + '%' : '—'}</text>
    <text x="60" y="80" text-anchor="middle" class="rt-sm" style="font-size:17px">${done}/${total}</text></svg>`;
}

export function weekChart(stats, days, today){
  const W = 640, H = 182, x0 = 8, slot = (W - 2*x0) / 7, bw = 46, base = 124, hmax = 96, names = ['H','K','Sze','Cs','P','Szo','V'];
  const max = Math.max(3, ...days.map(d => stats.per[d].total));
  let s = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Heti feladatok napokra bontva">`;
  for (const l of [0, .5, 1]) {
    s += `<line x1="0" x2="${W}" y1="${base - hmax*l}" y2="${base - hmax*l}" stroke="rgba(53,224,255,${l ? .10 : .3})" stroke-dasharray="${l ? '2 4' : '0'}"/>`;
    if (l) s += `<text x="${W}" y="${base - hmax*l - 3}" text-anchor="end" style="font-size:9px;fill:rgba(127,155,174,.7)">${Math.round(max*l)}</text>`;
  }
  days.forEach((d,i) => {
    const p = stats.per[d], x = x0 + i*slot + (slot - bw)/2, hd = hmax*p.done/max, ho = hmax*p.open/max, isT = d === today;
    s += `<g><title>${d}: ${p.total} tétel (${p.done} kész, ${p.open} nyitott)${p.workMs ? ' · mért idő: ' + fmtWork(p.workMs) : ''}</title>`;
    if (isT) s += `<rect x="${x - 8}" y="2" width="${bw + 16}" height="${H - 4}" fill="rgba(255,194,51,.06)" stroke="rgba(255,194,51,.25)" stroke-dasharray="2 3"/>`;
    s += `<rect x="${x}" y="0" width="${bw}" height="${base}" fill="transparent"/>`;
    if (p.done) s += `<rect x="${x}" y="${(base-hd).toFixed(1)}" width="${bw}" height="${hd.toFixed(1)}" fill="url(#gBarDone)"/>`;
    if (p.open) s += `<rect x="${x}" y="${(base-hd-ho).toFixed(1)}" width="${bw}" height="${ho.toFixed(1)}" fill="url(#gBarOpen)"/>`;
    if (p.total) s += `<text class="val" x="${x + bw/2}" y="${(base-hd-ho-5).toFixed(1)}" text-anchor="middle" style="font-size:12px">${p.total}</text>`;
    s += `<text class="${isT ? 'today-l' : ''}" x="${x + bw/2}" y="143" text-anchor="middle" style="font-size:12px">${names[i]}</text>`;
    s += `<text class="${isT ? 'today-l' : ''}" x="${x + bw/2}" y="158" text-anchor="middle" style="font-size:10px;opacity:.75">${+d.slice(8)}.</text>`;
    if (p.workMs) s += `<text class="wt" x="${x + bw/2}" y="174" text-anchor="middle" style="font-size:10px;fill:var(--cyan)">${fmtWork(p.workMs).replace(' ó ', 'ó').replace(' p', 'p')}</text>`;
    s += '</g>';
  });
  return s + '</svg>';
}

export function monthChart(stats, md, today){
  const n = md.days.length, W = 640, H = 168, x0 = 6, slot = (W - 2*x0) / n, bw = Math.max(6, slot*.68), base = 134, hmax = 104;
  const max = Math.max(3, ...md.days.map(d => stats.per[d].total));
  let s = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Havi feladatok napokra bontva">`;
  for (const l of [0, .5, 1]) {
    s += `<line x1="0" x2="${W}" y1="${base - hmax*l}" y2="${base - hmax*l}" stroke="rgba(53,224,255,${l ? .10 : .3})" stroke-dasharray="${l ? '2 4' : '0'}"/>`;
    if (l) s += `<text x="${W}" y="${base - hmax*l - 3}" text-anchor="end" style="font-size:9px;fill:rgba(127,155,174,.7)">${Math.round(max*l)}</text>`;
  }
  md.days.forEach((d,i) => {
    const p = stats.per[d], x = x0 + i*slot + (slot - bw)/2, hd = hmax*p.done/max, ho = hmax*p.open/max, isT = d === today;
    const [yy, mm, dd] = d.split('-').map(Number), wdn = new Date(yy, mm-1, dd).getDay(), we = wdn === 0 || wdn === 6;
    s += `<g><title>${d}: ${p.total} tétel (${p.done} kész, ${p.open} nyitott)${p.workMs ? ' · mért idő: ' + fmtWork(p.workMs) : ''}</title>`;
    if (we) s += `<rect x="${x0 + i*slot}" y="0" width="${slot}" height="${base}" fill="rgba(127,155,174,.06)"/>`;
    if (isT) s += `<rect x="${x0 + i*slot}" y="2" width="${slot}" height="${H - 4}" fill="rgba(255,194,51,.08)" stroke="rgba(255,194,51,.3)" stroke-dasharray="2 3"/>`;
    s += `<rect x="${x}" y="0" width="${bw}" height="${base}" fill="transparent"/>`;
    if (p.done) s += `<rect x="${x}" y="${(base-hd).toFixed(1)}" width="${bw.toFixed(1)}" height="${hd.toFixed(1)}" fill="url(#gBarDone)"/>`;
    if (p.open) s += `<rect x="${x}" y="${(base-hd-ho).toFixed(1)}" width="${bw.toFixed(1)}" height="${ho.toFixed(1)}" fill="url(#gBarOpen)"/>`;
    if (p.total && slot >= 14) s += `<text class="val" x="${x + bw/2}" y="${(base-hd-ho-4).toFixed(1)}" text-anchor="middle" style="font-size:9.5px">${p.total}</text>`;
    s += `<text class="${isT ? 'today-l' : ''}" x="${x + bw/2}" y="150" text-anchor="middle" style="font-size:9.5px;${we && !isT ? 'opacity:.55' : ''}">${dd}</text></g>`;
  });
  return s + '</svg>';
}

export function heatCal(stats, md, today){
  const cell = 27, gap = 4, step = cell + gap, lead = (md.first.getDay() + 6) % 7, rows = Math.ceil((lead + md.days.length) / 7);
  const W = 7*step - gap, H = 14 + rows*step - gap, max = Math.max(1, ...md.days.map(d => stats.per[d].total));
  let s = `<svg viewBox="0 0 ${W} ${H}" class="chart" style="width:${W}px;max-width:100%" role="img" aria-label="Havi naptár-hőtérkép">`;
  ['H','K','Sz','Cs','P','Sz','V'].forEach((n,i) => s += `<text x="${i*step + cell/2}" y="9" text-anchor="middle">${n}</text>`);
  md.days.forEach((d,i) => {
    const k = lead + i, x = (k % 7)*step, y = 14 + Math.floor(k/7)*step, p = stats.per[d];
    s += `<g><title>${d}: ${p.total} tétel (${p.done} kész, ${p.open} nyitott)${p.workMs ? ' · mért idő: ' + fmtWork(p.workMs) : ''}</title>
      <rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2" fill="${p.total ? `rgba(53,224,255,${(.16 + .74*p.total/max).toFixed(2)})` : 'rgba(53,224,255,.05)'}" stroke="${d === today ? '#ffc233' : 'rgba(53,224,255,.12)'}" stroke-width="${d === today ? 1.6 : 1}"/>
      <text x="${x + 4}" y="${y + 12}" style="font-size:10px;fill:${p.total ? '#fff' : 'rgba(127,155,174,.7)'}">${+d.slice(8)}</text>
      ${p.open ? `<circle cx="${x + cell - 6}" cy="${y + cell - 6}" r="2.8" fill="#ffc233"/>` : ''}</g>`;
  });
  return s + '</svg>';
}

export function topList(title, arr, kind, n = 4){
  if (!arr.length) return `<div class="${kind}L"><span class="cap">${title}</span><div class="sm dim">—</div></div>`;
  const max = arr[0].n;
  return `<div class="${kind}L"><span class="cap">${title}</span>${arr.slice(0, n).map(e => {
    const q = kind === 'who' ? '@' + e.name.replace(/\s+/g,'') : '#' + e.name;
    return `<div class="tr" data-search="${esc(q)}" title="${esc(e.name)} – ${e.n} tétel"><span class="tn">${kind === 'tag' ? '#' : ''}${esc(e.name)}</span><span class="tb"><i style="width:${(100*e.n/max).toFixed(0)}%"></i></span><b>${e.n}</b></div>`;
  }).join('')}</div>`;
}

// mért idő szerinti lista (feladatok / megbízók); a megbízós sorra kattintva a keresés szűr
export function timeList(title, all, kind, n = 3){
  const arr = all.filter(e => e.ms >= 30e3);                                       // fél percnél rövidebb tételek nem érdemelnek sort
  if (!arr.length || !arr[0].ms) return `<div class="${kind}L"><span class="cap">${title}</span><div class="sm dim">—</div></div>`;
  const max = arr[0].ms;
  return `<div class="${kind}L"><span class="cap">${title}</span>${arr.slice(0, n).map(e => {
    const nm = e.name.replace(/\s+/g, ' ').trim(), q = kind === 'who' && e.name[0] !== '(' ? ` data-search="${esc('@' + e.name.replace(/\s+/g, ''))}"` : '';
    return `<div class="tr tmr${q ? '' : ' nl'}"${q} title="${esc(nm)} – ${fmtWork(e.ms)}"><span class="tn">${esc(nm.length > 34 ? nm.slice(0, 33) + '…' : nm)}</span><span class="tb"><i style="width:${(100*e.ms/max).toFixed(0)}%"></i></span><b class="tm">${fmtWork(e.ms)}</b></div>`;
  }).join('')}</div>`;
}

export const kpi = (label, val, cls, sub) => `<div class="kpi"><div class="kv mono ${cls||''}">${val}</div><div class="cap">${label}</div>${sub ? `<div class="ks">${sub}</div>` : ''}</div>`;

export const md2 = ds => ds.slice(5).replace('-','.') + '.';

// s: periodStats, w: workStats (mért munkaidő). Az „átfutási idő" (létrehozás → lezárás) és a „mért idő" (tényleges munka) külön fogalom.
export function kpiBlock(s, w){
  const pct = s.total ? Math.round(100*s.done/s.total) : 0;
  return `<div class="kpis">${kpi('tétel', s.total, 'c-cyan')}${kpi('kész', s.done, 'c-cyan', pct + '%')}
    ${kpi('nyitott', s.open, 'c-gold', s.over ? `<span class="c-red">${s.over} lejárt</span>` : '&nbsp;')}${kpi('átfutási idő', s.leadMs == null ? '—' : fmtDur(s.leadMs), '', 'átlag')}
    ${w ? kpi('mért idő', fmtWork(w.totalMs), 'c-cyan', 'összesen') + kpi('átl. ráfordítás', w.avgTaskMs == null ? '—' : fmtWork(w.avgTaskMs), '', w.avgN ? `${w.avgN} kész feladatra` : 'kész feladatonként') : ''}</div>
    <div class="pbar"><i style="width:${pct}%"></i></div>`;
}

export const navBtns = k => `<span class="nav"><button type="button" class="mini" data-nav="${k}" data-d="-1" title="Előző">‹</button><button type="button" class="mini" data-nav="${k}" data-d="0" title="Aktuális">●</button><button type="button" class="mini" data-nav="${k}" data-d="1" title="Következő">›</button></span>`;

export function renderToday(){
  const box = $('#today'), now = Date.now(), today = todayStr(), u = urgency(now);
  const tt = st.tasks.filter(t => t.datum === today && !isParked(t)), done = tt.filter(isDone).length;
  const older = st.tasks.filter(t => t.datum < today && !isDone(t) && !isParked(t)).length;
  const np = st.tasks.filter(isParked).length;
  const closedToday = st.tasks.filter(t => t.lezarva && t.lezarva.slice(0,10) === today).length;
  const MAXAL = 6;
  const act = activeOf(st.sessions), nxt = nextTasks(now, act && act.feladat_id), wk = todayWorkMs(now);
  const al = nxt.slice(0, MAXAL).map(nextRow).join('');
  box.innerHTML = `<div class="tf">
    <div class="tf-l">
      <div class="ring">${ringSVG(done, tt.length)}</div>
      <div>
        <span class="cap hd"><i class="live"></i>Ma · napi státusz<span class="rng mono">${today}</span></span>
        <div class="nums">
          <div class="num"><b class="c-cyan">${done}</b><span class="cap">kész ma</span></div>
          <div class="num"><b class="c-gold">${tt.length - done}</b><span class="cap">nyitott ma</span></div>
          <div class="num"><b class="${u.over ? 'c-red' : 'dim'}">${u.over}</b><span class="cap">lejárt</span></div>
          <div class="num"><b class="${older ? 'c-orange' : 'dim'}">${older}</b><span class="cap">régebbi nyitott</span></div>
          <div class="num"><b class="${closedToday ? 'c-cyan' : 'dim'}">${closedToday}</b><span class="cap">ma lezárva</span></div>
          <div class="num"><b class="${wk ? 'c-cyan' : 'dim'}" id="ldToday">${fmtWork(wk)}</b><span class="cap">mért idő ma</span></div>
        </div>
      </div>
    </div>
    <div class="tf-r">
      <div class="tf-rh"><span class="cap">Következő feladatok · határidő szerint</span><button type="button" class="mini park-j" data-jump="park" title="Nem ütemezett feladatok (nem számítanak a statisztikába)">Tároló (${np}) ↓</button><button type="button" class="mini" data-jump="overview" title="Heti, havi és megbízói statisztika az oldal alján">hét · hónap · megbízók ↓</button></div>
      ${al ? `<div class="tf-al">${al}</div>` : '<div class="sm dim">Nincs nyitott feladat.</div>'}${nxt.length > MAXAL ? `<div class="sm dim">+ ${nxt.length - MAXAL} további</div>` : ''}
    </div></div>${liveBar(now)}`;
}

export function renderDash(){
  renderToday();
  const box = $('#dash'); $('#dashToggle').textContent = ov.hidden ? 'megjelenítés' : 'elrejtés';
  box.hidden = ov.hidden; renderTimemap(); if (ov.hidden) return;
  const now = Date.now(), nd = new Date(now), today = todayStr();

  /* HÉT */
  const cap = capOf(live.gap), wd = weekDays(ov.w, nd), ws = periodStats(st.tasks, wd, now), ww = workStats(st.sessions, st.tasks, wd, now, cap), [wy, wm, wdd] = wd[0].split('-').map(Number);
  for (const d of wd) ws.per[d].workMs = ww.per[d];                                  // a diagramok a napi mért időt is ismerik
  const legend = '<div class="legend"><span><i class="d"></i>kész</span><span><i class="o"></i>nyitott</span></div>';
  const weekHTML = `<div class="panel"><div class="ph"><span class="cap">Hét · ${isoWeek(new Date(wy, wm-1, wdd))}.</span><span class="rng mono">${md2(wd[0])} – ${md2(wd[6])}</span>${navBtns('w')}</div>
    <div class="ovg ovg-w"><div class="ov-k">${kpiBlock(ws, ww)}</div>
    <div class="ov-c">${weekChart(ws, wd, today)}${legend}</div>
    <div class="ov-t"><div class="tops">${topList('Megbízók', ws.who, 'who', 5)}${topList('Címkék', ws.tags, 'tag', 5)}${timeList('Mért idő · feladatok', ww.tasks, 'wtask')}${timeList('Mért idő · megbízók', ww.who, 'who')}</div></div></div></div>`;

  /* HÓNAP */
  const mdd = monthDays(ov.m, nd), ms = periodStats(st.tasks, mdd.days, now), mw = workStats(st.sessions, st.tasks, mdd.days, now, cap);
  for (const d of mdd.days) ms.per[d].workMs = mw.per[d];
  const monthHTML = `<div class="panel"><div class="ph"><span class="cap">Hónap</span><span class="rng mono">${mdd.first.toLocaleDateString('hu-HU', { year:'numeric', month:'long' })}</span>${navBtns('m')}</div>
    <div class="ovg ovg-m"><div class="ov-k">${kpiBlock(ms, mw)}</div>
    <div class="ov-h">${heatCal(ms, mdd, today)}</div>
    <div class="ov-c">${monthChart(ms, mdd, today)}${legend}</div>
    <div class="ov-t"><div class="tops">${topList('Megbízók', ms.who, 'who', 5)}${topList('Címkék', ms.tags, 'tag', 5)}${timeList('Mért idő · feladatok', mw.tasks, 'wtask')}${timeList('Mért idő · megbízók', mw.who, 'who')}</div></div></div></div>`;

  box.innerHTML = weekHTML + monthHTML;
}
