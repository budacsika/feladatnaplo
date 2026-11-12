// Eseménykötések (importáláskor lefut; az app.js tölti be utolsóként)
import { deleteTask, dtValue, resetFilters, setSearch, startEdit, syncSeg, updateTask } from './actions.js';
import { markUnknown, resolveWho } from './autocomplete.js';
import { tick } from './clock.js';
import { toCSV } from './csv.js';
import { renderDash } from './dash.js';
import { matches, matchesText, queryTerms } from './filter.js';
import { renderList } from './list.js';
import { moveFromPark, sendToPark, setPark, setParkOpen } from './park.js';
import { addPerson, removePerson, renamePerson, renderPeople } from './people.js';
import { exactPerson, normName, pkey, reconcilePeople, suggestPeople } from './people-model.js';
import { setJournal, setJournalDay, shiftJournal } from './journal.js';
import { flash, render } from './render.js';
import { $, LS_DASH, LS_PARK, LS_PPL, isDone, ov, st, ui } from './state.js';
import { toast } from './status.js';
import { checkExternal, decodeFile, flush, parseText, pickFolder, queueSave, reconnect } from './storage.js';
import { isParked } from './tasks.js';
import { dstr, newId, normDate, normDeadline, pad, stamp, todayStr } from './util.js';

/* ---------- események ---------- */
$('#addForm').addEventListener('submit', e => {
  e.preventDefault();
  const text = $('#fText').value.trim(); if (!text) return;
  const who = resolveWho($('#fWho')); if (who === null) return;
  const now = stamp();
  const park = $('#fPark').checked;
  const t = { id:newId(), datum: park ? todayStr() : (normDate($('#fDate').value) || todayStr()), feladat:text, megbizo: who,
              hatarido: park ? '' : normDeadline($('#fDue').value), statusz:'nyitott', letrehozva:now, modositva:now, lezarva:'', tarolo: park ? 'igen' : '' };
  st.tasks.push(t);
  if (park) { if (queryTerms().length && !matchesText(t, queryTerms())) { ui.search = ''; $('#q').value = ''; } ov.park = true; try { localStorage.setItem(LS_PARK, '1'); } catch {} }
  else if (!matches(t, queryTerms())) resetFilters();
  $('#fText').value = ''; if (!park) $('#fDue').value = ''; if (!$('#fKeep').checked) { $('#fWho').value = ''; markUnknown($('#fWho')); }
  if (park) { setPark(false); toast('A Tárolóba került: nem számít a statisztikába.'); }
  queueSave(); render(); flash(t.id, park); $('#fText').focus();
});
$('#fPark').addEventListener('change', e => setPark(e.target.checked));
$('#fDate').addEventListener('change', () => { st.dateTouched = $('#fDate').value !== todayStr(); });
$('#addForm').addEventListener('click', e => {
  const q = e.target.closest('[data-qtag]');
  if (q) { const el = $('#fText'); el.value = el.value + (el.value && !/\s$/.test(el.value) ? ' ' : '') + '#' + q.dataset.qtag.toLowerCase() + ' '; el.focus(); return; }
  const b = e.target.closest('[data-due]'); if (!b) return;
  const n = new Date(), k = b.dataset.due;
  if (k === '+2h') n.setTime(Date.now() + 2*3600e3);
  else if (k === 'today17') n.setHours(17, 0, 0, 0);
  else if (k === 'tom9') { n.setDate(n.getDate() + 1); n.setHours(9, 0, 0, 0); }
  $('#fDue').value = k === 'clear' ? '' : dtValue(n);
});

$('#q').addEventListener('input', e => { ui.search = e.target.value; renderList(); });
$('#period').addEventListener('change', e => { ui.period = e.target.value; renderList(); });
$('#segStatus').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; ui.status = b.dataset.s; syncSeg(); renderList(); });
$('#btnPrint').addEventListener('click', () => window.print());
$('#dashToggle').addEventListener('click', () => { ov.hidden = !ov.hidden; try { localStorage.setItem(LS_DASH, ov.hidden ? '0' : '1'); } catch {} renderDash(); });

$('#today').addEventListener('click', e => {
  const j = e.target.closest('[data-jump]');
  if (j) { if (j.dataset.jump === 'park' && !ov.park) setParkOpen(true); const el = document.getElementById(j.dataset.jump); if (el) el.scrollIntoView({ behavior:'smooth', block:'start' }); return; }
  const g = e.target.closest('[data-goto]');
  if (g) { resetFilters(); st.editing = null; renderList(); flash(g.dataset.goto); }
});
$('#dash').addEventListener('click', e => {
  const nav = e.target.closest('[data-nav]');
  if (nav) { const k = nav.dataset.nav, d = +nav.dataset.d; ov[k] = d === 0 ? 0 : ov[k] + d; renderDash(); return; }
  const g = e.target.closest('[data-goto]');
  if (g) { resetFilters(); st.editing = null; renderList(); flash(g.dataset.goto); return; }
  const s = e.target.closest('[data-search]'); if (s) setSearch(s.dataset.search);
});

$('#pplToggle').addEventListener('click', () => { ov.people = !ov.people; try { localStorage.setItem(LS_PPL, ov.people ? '1' : '0'); } catch {} renderPeople(); });
$('#pplPeriod').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; ov.pPeriod = b.dataset.p; renderPeople(); });
$('#pplAdd').addEventListener('submit', e => {
  e.preventDefault();
  const inp = $('#pplNew'), n = normName(inp.value); if (!n) return;
  const sim = exactPerson(n, st.people) ? [] : suggestPeople(n, st.people, null).filter(x => x.tier === 5);
  if (sim.length && !confirm(`Hasonló név már szerepel: ${sim.map(x => x.p.nev).join(', ')}.\nBiztosan új megbízót veszel fel: „${n}”?`)) return;
  addPerson(n, true); inp.value = '';
});
$('#pplBody').addEventListener('click', e => {
  const s = e.target.closest('[data-search]'); if (s) { setSearch(s.dataset.search); return; }
  const b = e.target.closest('[data-pact]'); if (!b) return;
  const key = b.closest('[data-key]').dataset.key;
  switch (b.dataset.pact) {
    case 'edit': ov.pEdit = key; renderPeople(); { const i = $('#pplBody input[name=nev]'); if (i) { i.focus(); i.select(); } } break;
    case 'cancel': ov.pEdit = null; renderPeople(); break;
    case 'toggle': { const p = st.people.find(x => pkey(x.nev) === key); if (p) { p.aktiv = p.aktiv === 'nem' ? 'igen' : 'nem'; queueSave('p'); renderPeople(); } break; }
    case 'del': removePerson(key); break;
  }
});
$('#pplBody').addEventListener('submit', e => { e.preventDefault(); const f = e.target, fd = new FormData(f); renamePerson(f.dataset.key, fd.get('nev'), fd.get('note')); });
$('#pplBody').addEventListener('keydown', e => { if (e.key === 'Escape' && ov.pEdit != null) { ov.pEdit = null; renderPeople(); } });

for (const list of [$('#list'), $('#parkBody')]) {
list.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const li = b.closest('[data-id]'), id = li && li.dataset.id;
  switch (b.dataset.act) {
    case 'edit': startEdit(id); break;
    case 'hist': ui.histOpen.has(id) ? ui.histOpen.delete(id) : ui.histOpen.add(id); renderList(); break;
    case 'cancel': st.editing = null; renderList(); break;
    case 'day': { const ds = b.dataset.day; ui.dayState.set(ds, b.getAttribute('aria-expanded') !== 'true'); renderList(); break; }
    case 'del': deleteTask(id); break;
    case 'topark': sendToPark(id); break;
    case 'pkmove': { const d = new Date(); if (b.dataset.to === 'tom') d.setDate(d.getDate() + 1); moveFromPark(id, dstr(d)); break; }
    case 'pkgo': moveFromPark(id, (li.querySelector('.pk-date') || {}).value); break;
    case 'tag': setSearch(b.dataset.tag); break;
    case 'who': setSearch('@' + b.dataset.who.replace(/\s+/g,'')); break;
  }
});
list.addEventListener('change', e => {
  if (e.target.dataset.act !== 'toggle') return;
  updateTask(e.target.closest('[data-id]').dataset.id, { statusz: e.target.checked ? 'kesz' : 'nyitott' });
});
list.addEventListener('dblclick', e => { const s = e.target.closest('.txt'); if (s) startEdit(s.closest('[data-id]').dataset.id); });
list.addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target, id = f.dataset.id, t = st.tasks.find(x => x.id === id); if (!t) return;
  const fd = new FormData(f), text = String(fd.get('feladat') || '').trim();
  if (!text) { toast('A feladat szövege nem lehet üres.'); return; }
  const who = resolveWho(f.querySelector('[name=megbizo]')); if (who === null) return;
  st.editing = null;
  updateTask(id, { feladat:text, megbizo: who, hatarido: normDeadline(fd.get('hatarido')),
                   datum: normDate(fd.get('datum')) || t.datum });
});
list.addEventListener('keydown', e => {
  if (!(e.target.closest && e.target.closest('.edit'))) return;
  if (e.key === 'Escape') { st.editing = null; renderList(); }
  else if (e.key === 'Enter' && !e.shiftKey && e.target.tagName === 'TEXTAREA') { e.preventDefault(); e.target.form.requestSubmit(); }
});
}
$('#daysAll').addEventListener('click', () => { st.tasks.forEach(t => { if (!isParked(t)) ui.dayState.set(t.datum, true); }); renderList(); });
$('#daysToday').addEventListener('click', () => { ui.dayState.clear(); renderList(); });
$('#parkToggle').addEventListener('click', () => setParkOpen(!ov.park));
$('#btnJournal').addEventListener('click', () => setJournal(!ov.journal));
$('#journalClose').addEventListener('click', () => setJournal(false));
$('#jPrev').addEventListener('click', () => shiftJournal(-1));
$('#jNext').addEventListener('click', () => shiftJournal(1));
$('#jToday').addEventListener('click', () => setJournalDay(todayStr()));
$('#jDay').addEventListener('change', e => setJournalDay(e.target.value));
$('#btnPark').addEventListener('click', () => { if (!ov.park) setParkOpen(true); $('#park').scrollIntoView({ behavior:'smooth', block:'start' }); });

document.addEventListener('keydown', e => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
  if (e.key === '/' && !typing) { e.preventDefault(); $('#q').focus(); }
  else if (e.key === 'n' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); window.scrollTo({ top:0, behavior:'smooth' }); $('#fText').focus(); }
  else if (e.key === 'Escape' && document.activeElement === $('#q')) { resetFilters(); renderList(); }
});

$('#pill').addEventListener('click', () => {
  if (st.mode === 'none' || st.mode === 'blocked') pickFolder();
  else if (st.mode === 'needperm') reconnect();
  else if (st.err) { st.dirty = true; flush(); }
});
$('#btnFolder').addEventListener('click', pickFolder);
$('#btnExport').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([toCSV(st.tasks)], { type:'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = `feladatnaplo_${todayStr()}.csv`;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('#btnImport').addEventListener('click', () => $('#importFile').click());
$('#importFile').addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  try {
    const inc = parseText(await decodeFile(file)).tasks;
    if (!inc.length) { toast('Nem találtam importálható sort.'); return; }
    const ids = new Set(st.tasks.map(t => t.id)), keys = new Set(st.tasks.map(t => t.datum + '|' + t.feladat));
    let n = 0;
    for (const t of inc) {
      const k = t.datum + '|' + t.feladat;
      if (ids.has(t.id) || keys.has(k)) continue;
      st.tasks.push(t); ids.add(t.id); keys.add(k); st.deleted.delete(t.id); n++;
    }
    if (n) { const rec = reconcilePeople(st.tasks, st.people); if (rec.added.length) queueSave('p'); queueSave(); render(); }
    toast(`${n} új tétel importálva (${inc.length - n} már megvolt).`);
  } catch (err) { toast('Importálási hiba: ' + (err.message || err)); }
});

/* nyomtatás: fejléc az aktuális szűrés leírásával */
window.addEventListener('beforeprint', () => {
  const vis = st.tasks.filter(t => !isParked(t) && matches(t, queryTerms())), done = vis.filter(isDone).length, n = new Date();
  const per = { all:'minden időszak', today:'ma', '7':'utolsó 7 nap', '30':'utolsó 30 nap' }[ui.period];
  const stl = { all:'minden állapot', nyitott:'csak nyitott', kesz:'csak kész' }[ui.status];
  $('#printMeta').textContent = `Készült: ${dstr(n)} ${pad(n.getHours())}:${pad(n.getMinutes())} · ${per} · ${stl}${ui.search ? ' · keresés: ' + ui.search : ''} · ${vis.length} tétel (${done} kész, ${vis.length - done} nyitott)`;
});

const onFocus = () => {
  if (!st.dateTouched) $('#fDate').value = todayStr();
  checkExternal();
};
window.addEventListener('focus', onFocus);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); else { onFocus(); tick(); } });
window.addEventListener('beforeunload', e => { if (st.dirty || st.saving) { e.preventDefault(); e.returnValue = ''; } });
