// Napló: egy nap eseményei időrendben (létrehozás, lezárás, határidő-módosítás, …)
import { clip, journalDay } from './history.js';
import { $, LS_JRN, esc, ov, st } from './state.js';
import { dstr, todayStr } from './util.js';

export function renderJournal(){
  $('#journal').hidden = !ov.journal;
  $('#btnJournal').setAttribute('aria-pressed', String(ov.journal));
  if (!ov.journal) return;
  const day = ov.jDay || todayStr(), inp = $('#jDay');
  if (document.activeElement !== inp) inp.value = day;
  const ev = journalDay(st.tasks, st.hist, day);
  $('#jCount').textContent = ev.length ? `${ev.length} esemény` : '';
  $('#journalBody').innerHTML = ev.length
    ? `<ol class="jl">${ev.map(x => `<li${x.old || x.gone ? ` class="${x.old ? 'old' : ''}${x.gone ? ' gone' : ''}"` : ''}><time>${esc(x.at.slice(11, 16))}</time><span class="jt">${esc(x.text)}</span><span class="jx">${esc(clip(x.task, 90))}</span></li>`).join('')}</ol>`
    : `<div class="empty sm">${day === todayStr() ? 'Ma még nincs rögzített esemény.' : 'Ezen a napon nincs rögzített esemény.'}</div>`;
}

export function setJournal(on){
  ov.journal = on; try { localStorage.setItem(LS_JRN, on ? '1' : '0'); } catch {}
  renderJournal();
  if (on) $('#journal').scrollIntoView({ behavior:'smooth', block:'nearest' });
}

export function setJournalDay(ds){ if (ds && ds >= '2000-01-01') { ov.jDay = ds; renderJournal(); } }

export function shiftJournal(n){
  const d = new Date((ov.jDay || todayStr()) + 'T12:00:00'); d.setDate(d.getDate() + n);
  setJournalDay(dstr(d));
}
