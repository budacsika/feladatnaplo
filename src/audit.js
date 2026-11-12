// Előzmények naplózása: a feladatlista változásait eseményekké alakítja (a mentési műveletek hívják)
import { diffTasks, makeSnap } from './history.js';
import { st } from './state.js';
import { stamp } from './util.js';

let snap = null;   // a feladatok legutóbb naplózott állapota

// Új alapállapot esemény nélkül: betöltés, külső változás, összefésülés után – ezek nem a felhasználó módosításai
export function resetSnap(){ snap = makeSnap(st.tasks); }

// Minden módosítás után hívjuk (queueSave): az eltérésekből események lesznek. Igaz, ha került új esemény a naplóba.
export function logChanges(){
  if (!snap) { resetSnap(); return false; }
  const known = new Set(); for (const e of st.hist) known.add(e.feladat);
  const r = diffTasks(snap, st.tasks, known, stamp());
  snap = r.snap;
  if (!r.events.length) return false;
  for (const e of r.events) st.hist.push(e);
  st.dirtyH = true;
  return true;
}
