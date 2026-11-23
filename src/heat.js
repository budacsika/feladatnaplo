// Adatgyűjtés hőtérkép-sáv a lista fölött: egy négyzet egy nap, oszlop egy hét; a négyzetre kattintva a lista az adott naphoz ugrik
import { $, esc, isDone, st } from './state.js';
import { isParked } from './tasks.js';
import { MON, WDN, dstr, todayStr, weekKeyOf } from './util.js';

const lvl = n => n <= 0 ? 0 : n <= 2 ? 1 : n <= 4 ? 2 : n <= 6 ? 3 : 4;
let last = '';

export function renderHeat(){
  const box = $('#heat'), act = st.tasks.filter(t => !isParked(t));
  box.hidden = !act.length; if (!act.length) return;
  const per = new Map(); let lo = '9999', hi = '0000';
  for (const t of act) { const e = per.get(t.datum) || { n: 0, open: 0 }; e.n++; if (!isDone(t)) e.open++; per.set(t.datum, e); if (t.datum < lo) lo = t.datum; if (t.datum > hi) hi = t.datum; }
  const today = todayStr(); if (today > hi) hi = today;
  const ymd = s => s.split('-').map(Number), at = s => { const [y, m, d] = ymd(s); return new Date(y, m - 1, d); };
  const nDays = Math.round((at(today) - at(lo)) / 864e5) + 1 > 0 ? Math.round((at(today) - at(lo)) / 864e5) + 1 : 1, worked = [...per.keys()].length;
  let cols = '', lastMonth = -1;
  for (const w = at(weekKeyOf(lo)); dstr(w) <= hi; w.setDate(w.getDate() + 7)) {
    let cells = ''; const label = w.getMonth() !== lastMonth ? MON[w.getMonth()] : ''; lastMonth = w.getMonth();     // a hónapcímke a hét hétfőjének hónapját mutatja (a listával egyező)
    for (let i = 0; i < 7; i++) {
      const d = new Date(w); d.setDate(d.getDate() + i); const ds = dstr(d);
      if (ds < lo || ds > hi) { cells += '<span class="hm-c none"></span>'; continue; }
      const e = per.get(ds), n = e ? e.n : 0, cls = `hm-c l${lvl(n)}${i >= 5 && !n ? ' we' : ''}${ds === today ? ' td' : ''}${e && e.open ? ' op' : ''}`;
      const tip = `${WDN[d.getDay()]} · ${MON[d.getMonth()]} ${d.getDate()}. – ${n ? `${n} feladat${e.open ? `, ebből ${e.open} nyitott` : ', mind kész'}` : 'nincs bejegyzés'}`;
      cells += n ? `<button type="button" tabindex="-1" class="${cls}" data-day="${esc(ds)}" title="${esc(tip)}" aria-label="${esc(tip)}"></button>` : `<span class="${cls}" title="${esc(tip)}"></span>`;
    }
    cols += `<div class="hm-col"><div class="hm-mo">${label}</div>${cells}</div>`;
  }
  const sum = `${lo.replace(/-/g, '.')}. óta · ${nDays} nap · ${worked} munkanap · ${act.length} feladat`;
  const html = `<div class="hm-grid"><div class="hm-lab"><span></span><span>H</span><span></span><span>Sze</span><span></span><span>P</span><span></span><span>V</span></div>${cols}</div>`
    + `<div class="hm-leg"><span>kevesebb</span>${[0, 1, 2, 3, 4].map(l => `<i class="hm-c l${l}"></i>`).join('')}<span>több</span><span><i class="hm-c l0 td"></i>ma</span><span><i class="hm-c l2 op"></i>nyitott feladat van</span></div>`;
  $('#heatSum').textContent = sum;
  if (html === last) return;                                  // változatlan: a görgetési helyzetet békén hagyjuk
  last = html;
  const sc = $('#heatBody'); sc.innerHTML = html; sc.scrollLeft = sc.scrollWidth;                  // a legfrissebb napok látszanak
}
