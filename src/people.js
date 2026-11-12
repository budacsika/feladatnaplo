// Megbízók listájának műveletei és panelje
import { countsByKey } from './actions.js';
import { md2 } from './dash.js';
import { exactPerson, normName, pkey } from './people-model.js';
import { render } from './render.js';
import { $, esc, ov, st } from './state.js';
import { peopleStats } from './stats.js';
import { toast } from './status.js';
import { queueSave } from './storage.js';
import { monthDays, stamp, weekDays } from './util.js';

export function addPerson(name, announce){
  name = normName(name);
  const ex = exactPerson(name, st.people);
  if (ex) { if (ex.aktiv === 'nem') { ex.aktiv = 'igen'; queueSave('p'); renderPeople(); } return ex.nev; }
  st.people.push({ nev: name, megjegyzes: '', aktiv: 'igen' }); st.deletedP.delete(pkey(name));
  queueSave('p'); renderPeople();
  if (announce) toast('Új megbízó felvéve: ' + name);
  return name;
}

export function renamePerson(key, nev, note){
  const p = st.people.find(x => pkey(x.nev) === key); if (!p) return;
  nev = normName(nev); const nk = pkey(nev); if (!nk) return;
  note = normName(note);
  const other = nk !== key ? st.people.find(x => pkey(x.nev) === nk) : null;
  const mine = st.tasks.filter(t => pkey(t.megbizo) === key);
  if (other && !confirm(`„${other.nev}” már szerepel a listában. Összevonjam a kettőt?\nA(z) ${mine.length} feladat a(z) „${other.nev}” alá kerül.`)) return;
  const finalName = other ? other.nev : nev;
  for (const t of mine) { t.megbizo = finalName; t.modositva = stamp(); }
  if (other) { st.people = st.people.filter(x => x !== p); st.deletedP.add(key); if (!other.megjegyzes) other.megjegyzes = note; }
  else { p.nev = nev; p.megjegyzes = note; if (nk !== key) st.deletedP.add(key); st.deletedP.delete(nk); }
  ov.pEdit = null;
  if (mine.length) queueSave();
  queueSave('p'); render();
}

export function removePerson(key){
  if ((countsByKey().get(key) || 0) > 0) { toast('Van hozzá feladat – inkább tedd inaktívvá (⏸).'); return; }
  st.people = st.people.filter(x => pkey(x.nev) !== key); st.deletedP.add(key);
  queueSave('p'); renderPeople();
}

export function renderPeople(){
  const box = $('#people'); $('#pplToggle').textContent = `megbízók (${st.people.length})`;
  box.hidden = !ov.people; if (!ov.people) return;
  document.querySelectorAll('#pplPeriod button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.p === ov.pPeriod)));
  let days = null, rng = 'összes feladat';
  if (ov.pPeriod === 'w') { days = weekDays(ov.w); rng = `${md2(days[0])} – ${md2(days[6])}`; }
  else if (ov.pPeriod === 'm') { const m = monthDays(ov.m); days = m.days; rng = m.first.toLocaleDateString('hu-HU', { year:'numeric', month:'long' }); }
  $('#pplRange').textContent = rng;
  const s = peopleStats(st.tasks, st.people, days), all = countsByKey();
  const max = Math.max(1, s.none.total, ...s.rows.map(r => r.total));
  const bar = r => `<span class="sbar" title="${r.done} kész, ${r.open} nyitott"><i class="d" style="width:${(100*r.done/max).toFixed(1)}%"></i><i class="o" style="width:${(100*r.open/max).toFixed(1)}%"></i></span>`;
  const nums = r => `<b class="mono">${r.total}</b><span class="mono c-gold">${r.open || '·'}</span><span class="mono ${r.over ? 'c-red' : 'dim'}">${r.over || '·'}</span>`;
  const row = r => {
    const k = pkey(r.nev);
    if (ov.pEdit === k) return `<form class="prow edit" data-key="${esc(k)}"><input type="text" name="nev" value="${esc(r.nev)}" aria-label="Név" autocomplete="off"><input type="text" name="note" value="${esc(r.megjegyzes)}" placeholder="megjegyzés (pl. terület, e-mail)" aria-label="Megjegyzés" autocomplete="off"><button type="submit" class="mini">Mentés</button><button type="button" class="mini" data-pact="cancel">Mégse</button></form>`;
    const used = all.get(k) || 0;
    return `<div class="prow${r.aktiv ? '' : ' off'}" data-key="${esc(k)}">
      <button type="button" class="pname" data-search="@${esc(r.nev.replace(/\s+/g, ''))}" title="Szűrés erre a megbízóra${r.megjegyzes ? ' · ' + esc(r.megjegyzes) : ''}">${esc(r.nev)}${r.aktiv ? '' : '<small>inaktív</small>'}${r.megjegyzes ? `<small>${esc(r.megjegyzes)}</small>` : ''}</button>
      ${bar(r)}${nums(r)}<span class="mono dim">${r.last ? md2(r.last) : '—'}</span>
      <span class="pact"><button type="button" class="mini" data-pact="edit" title="Átnevezés, megjegyzés">✎</button><button type="button" class="mini" data-pact="toggle" title="${r.aktiv ? 'Inaktívvá tétel (nem ajánlja fel)' : 'Újra aktív'}">${r.aktiv ? '⏸' : '▶'}</button><button type="button" class="mini" data-pact="del" ${used ? 'disabled title="Van hozzá feladat – inkább tedd inaktívvá"' : 'title="Törlés"'}>×</button></span></div>`;
  };
  const withWho = s.rows.reduce((a, r) => a + r.total, 0), total = withWho + s.none.total;
  box.querySelector('#pplBody').innerHTML = `<div class="prow head cap"><span>Megbízó</span><span>kész / nyitott</span><span>össz.</span><span>nyit.</span><span>lej.</span><span>utolsó</span><span></span></div>`
    + s.rows.map(row).join('')
    + (s.none.total ? `<div class="prow none"><span class="dim">— nincs megbízó megadva</span>${bar(s.none)}${nums(s.none)}<span></span><span></span></div>` : '')
    + `<div class="prow sum"><span>Összesen${total ? ` · ${Math.round(100 * withWho / total)}% megbízóval` : ''}</span><span></span><b class="mono">${total}</b><span></span><span></span><span></span><span></span></div>`;
}
