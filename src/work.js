// Munkamenet-műveletek (Live Desk): indítás, szünet, befejezés, váltás – a modell, a mentés és a felület között
import { updateTask } from './actions.js';
import { render } from './render.js';
import { LS_HB, isDone, live, st } from './state.js';
import { toast } from './status.js';
import { queueSave, syncSessions } from './storage.js';
import { isParked } from './tasks.js';
import { activeOf, capOf, closeSession, durMs, fmtWork, gapCheck, isActive, pauseWork, startWork, stopForTask, workMsOfTask } from './worktime.js';
import { clip } from './history.js';
import { stampAt, toMs } from './util.js';

/* ---------- szívverés: az utolsó pillanat, amikor a program biztosan élt (alvás- és óraváltozás-észleléshez) ---------- */
export const getHb = () => { try { return Number(localStorage.getItem(LS_HB)) || 0; } catch { return 0; } };
export const setHb = ms => { try { localStorage.setItem(LS_HB, String(ms)); } catch {} };

const nameOf = id => { const t = st.tasks.find(x => x.id === id); return t ? clip(t.feladat.replace(/\s+/g, ' '), 50) : '(törölt feladat)'; };

/* ---------- indítás / váltás ---------- */
export async function startWorkOn(id){
  const t = st.tasks.find(x => x.id === id);
  if (!t || isDone(t) || isParked(t)) { toast('Csak nyitott, ütemezett feladaton indítható munka.'); return; }
  await syncSessions();
  const now = Date.now(), r = startWork(st.sessions, id, now);
  if (r.same) { toast('Már ezen a feladaton dolgozol.'); return; }
  live.gap = null; setHb(now);
  queueSave('s'); render();
  const msg = r.closed ? `Váltás: ${nameOf(r.closed.feladat_id)} → ${nameOf(id)}` : `Munka elindítva: ${nameOf(id)}`;
  toast(msg, 'Visszavonás', () => {                                   // csak amíg az új munkamenet még fut
    if (!r.started || !isActive(r.started) || !st.sessions.includes(r.started)) { toast('Már nem vonható vissza.'); return; }
    st.sessions.splice(st.sessions.indexOf(r.started), 1);
    if (r.closed && !activeOf(st.sessions)) Object.assign(r.closed, { veg: '', idotartam_mp: '', ok: '' });   // a korábbi folytatódik
    queueSave('s'); render();
  });
}

/* ---------- szünet ---------- */
export async function pauseActive(){
  await syncSessions();
  const a = activeOf(st.sessions); if (!a) return;
  const now = Date.now(), cap = capOf(live.gap), d = durMs(a, now, cap);
  const c = pauseWork(st.sessions, Math.min(now, cap));
  live.gap = null;
  queueSave('s'); render();
  toast(`Szüneteltetve · ${fmtWork(d)} · ${nameOf(c.feladat_id)}`, 'Folytatás', () => startWorkOn(c.feladat_id));
}

/* ---------- befejezés: ugyanaz az út, mint a listabeli pipa (updateTask zárja le a munkamenetet) ---------- */
export async function finishActive(){
  await syncSessions();
  const a = activeOf(st.sessions); if (!a) return;
  const id = a.feladat_id, t = st.tasks.find(x => x.id === id);
  if (!t) { pauseWork(st.sessions, Math.min(Date.now(), capOf(live.gap))); live.gap = null; queueSave('s'); render(); return; }   // törölt feladat munkamenete
  const cap = capOf(live.gap);
  if (cap !== Infinity) { stopForTask(st.sessions, id, cap, 'kesz'); queueSave('s'); }   // függő ellenőrzés: csak az ismert időt számoljuk (a lezárás a cap-nál)
  live.gap = null;
  updateTask(id, { statusz: 'kesz' });
  toast(`Kész · ${nameOf(id)} · ráfordítás: ${fmtWork(workMsOfTask(st.sessions, id, Date.now()))}`);
}

/* ---------- alvás / óraváltozás: figyelés és feloldás ---------- */
let hbAt = 0;
// másodpercenként (clock.js): előbb ellenőrzünk, csak utána frissítjük a szívverést – így a kimaradás nem íródik felül
export function liveWatch(now){
  const a = activeOf(st.sessions);
  if (!a) { if (live.gap) { live.gap = null; render(); } return; }
  if (live.gap) { if (live.gap.id !== a.id) { live.gap = null; render(); } return; }      // függő kérdés: a szívverés áll
  const g = gapCheck(a, getHb(), now);
  if (g) { live.gap = { ...g, id: a.id }; render(); return; }
  if (now - hbAt >= 5000 || now < hbAt) { setHb(now); hbAt = now; }
}

// how: 'keep' (végig dolgoztam), 'resume' (szünet volt, most folytatom), 'stop' (leállítás a megadott időpontban)
export function resolveGap(how, at){
  const g = live.gap, a = activeOf(st.sessions);
  if (!g || !a) { live.gap = null; render(); return; }
  const now = Date.now(), lo = toMs(a.kezdet), hi = Math.max(now, lo);
  const from = Math.min(Math.max(g.fromMs, lo), hi);                                  // az utolsó biztosan ismert pillanat, a munkamenet határai közé szorítva
  if (how === 'keep') {
    if (g.kind === 'clock') return;
    live.gap = null; setHb(now); hbAt = now; render(); return;
  }
  if (how === 'resume') {
    const id = a.feladat_id;
    closeSession(a, from, 'szunet'); startWork(st.sessions, id, now);                       // a régi nulla hosszú is lehet (ha az óra a kezdet elé ugrott): az újat mindig "most" indítja
    live.gap = null; setHb(now); hbAt = now;
    queueSave('s'); render(); toast('Szünet rögzítve, a munka most folytatódik.'); return;
  }
  if (how === 'stop') {
    let end = toMs(at);
    if (!isNaN(end) && end < lo && lo - end < 60e3) end = lo;                            // a percre kerekített mező a másodperces kezdet alá csúszhat
    if (isNaN(end)) { toast('Adj meg érvényes időpontot.'); return; }
    if (end < lo || end > hi + 60e3) { toast(`Az időpont a munkamenet kezdete (${a.kezdet.replace('T', ' ').slice(0, 16)}) és most között legyen.`); return; }
    closeSession(a, Math.min(end, hi), 'szunet');
    live.gap = null; queueSave('s'); render();
    toast(`Leállítva ${stampAt(Math.min(end, hi)).replace('T', ' ').slice(0, 16)}-kor · ${fmtWork(workMsOfTask(st.sessions, a.feladat_id, now))} összesen`);
  }
}
