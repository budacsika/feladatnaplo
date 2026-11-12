// Mentés/betöltés: mappa (File System Access), IndexedDB, böngészős másolat, mentések, külső változás
import { logChanges, resetSnap } from './audit.js';
import { detectDelimiter, parseCSV, rowsToTasks, toCSV } from './csv.js';
import { histToCSV, mergeHistory, parseHistory } from './history.js';
import { mergePeopleInto, parsePeople, peopleToCSV, reconcilePeople, seedPeople } from './people-model.js';
import { render } from './render.js';
import { BACKUP_DIR, BACKUP_KEEP, DB_NAME, FILE_NAME, HIST_FILE, LS, LS_H, LS_OFF, LS_P, PEOPLE_FILE, STORE, ov, st } from './state.js';
import { renderStatus, toast } from './status.js';
import { mergeInto } from './tasks.js';
import { pad, todayStr } from './util.js';

/* ---------- IndexedDB (mappa-hivatkozás megőrzése) ---------- */
export const idb = () => new Promise((res, rej) => { const r = indexedDB.open(DB_NAME, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export const idbGet = async k => { const db = await idb(); return new Promise((res, rej) => { const q = db.transaction(STORE).objectStore(STORE).get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); };

export const idbSet = async (k, v) => { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); };

/* ---------- helyi másolat (böngésző) ---------- */
export const persistLocal = () => {
  try { localStorage.setItem(LS, toCSV(st.tasks)); localStorage.setItem(LS_P, peopleToCSV(st.people)); } catch {}
  try { localStorage.setItem(LS_H, histToCSV(st.hist)); } catch {}   // külön: ha a napló miatt betelne a tár, a feladatok ettől még mentődnek
};

export const loadMirror = () => {
  try {
    const raw = localStorage.getItem(LS); if (raw) st.tasks = rowsToTasks(parseCSV(raw, ';')).tasks;
    const rp = localStorage.getItem(LS_P); st.people = rp ? parsePeople(rp) : seedPeople(st.tasks);
    reconcilePeople(st.tasks, st.people);
    const rh = localStorage.getItem(LS_H); st.hist = rh ? parseHistory(rh) : [];
  } catch {}
  resetSnap();
};

export const getOffline = () => { try { return localStorage.getItem(LS_OFF) === '1'; } catch { return false; } };

export const setOffline = b => { try { b ? localStorage.setItem(LS_OFF, '1') : localStorage.removeItem(LS_OFF); } catch {} };

/* ---------- fájlműveletek ---------- */
export async function decodeFile(file){
  const buf = await file.arrayBuffer();
  let t = new TextDecoder('utf-8').decode(buf);
  if (t.includes('�')) { try { t = new TextDecoder('windows-1250').decode(buf); } catch {} }  // régi, ANSI-ként mentett Excel CSV
  return t.replace(/^﻿/, '');
}

export const parseText = raw => { const d = detectDelimiter(raw); return rowsToTasks(parseCSV(raw, d), d); };

export async function writeTo(dir, name, text){
  const fh = await dir.getFileHandle(name, { create:true });
  const w = await fh.createWritable();           // csere-fájlba ír, bezáráskor cseréli le az eredetit → nem sérülhet félbe
  await w.write(text); await w.close();
}

export async function backupDir(){ return st.dir.getDirectoryHandle(BACKUP_DIR, { create:true }); }

export async function dailyBackup(raw, prefix = 'feladatnaplo'){
  try {
    const dir = await backupDir(), name = `${prefix}_${todayStr()}.csv`;
    try { await dir.getFileHandle(name); return; } catch (e) { if (e.name !== 'NotFoundError') throw e; }
    await writeTo(dir, name, '﻿' + raw);     // a nap első megnyitásakori állapot
    const re = new RegExp('^' + prefix + '_\\d{4}-\\d{2}-\\d{2}\\.csv$'), names = [];
    for await (const [n, h] of dir.entries()) if (h.kind === 'file' && re.test(n)) names.push(n);
    names.sort();
    for (let i = 0; i < names.length - BACKUP_KEEP; i++) await dir.removeEntry(names[i]);
  } catch (e) { console.warn('Napi mentés nem sikerült:', e); }
}

// szerkezet-átalakítás előtt külön másolat az éppen aktuális fájlról (a napi mentés lehet, hogy régebbi állapotot őriz)
export async function schemaBackup(raw){
  const n = new Date(), name = `feladatnaplo_${todayStr()}_${pad(n.getHours())}${pad(n.getMinutes())}${pad(n.getSeconds())}_atalakitas-elott.csv`;
  await writeTo(await backupDir(), name, '﻿' + raw);
}

export async function openFolder(){
  st.err = null;
  try {
    st.fh = await st.dir.getFileHandle(FILE_NAME, { create:true });
    st.fhP = await st.dir.getFileHandle(PEOPLE_FILE, { create:true });
    st.fhH = await st.dir.getFileHandle(HIST_FILE, { create:true });
    const file = await st.fh.getFile();
    st.lastMod = file.lastModified;
    const raw = await decodeFile(file);
    let disk = [], kind = 'empty';
    if (raw.trim()) {
      ({ tasks: disk, kind } = parseText(raw));
      if (!disk.length) { st.mode = 'blocked'; renderStatus(); return; }   // ismeretlen tartalom: nem nyúlunk hozzá
      await dailyBackup(raw);
      if (kind !== 'v2') await schemaBackup(raw);                          // átalakítás előtt: biztonsági másolat az eredetiről
    }
    const fileP = await st.fhP.getFile();
    st.lastModP = fileP.lastModified;
    const rawP = await decodeFile(fileP), diskP = rawP.trim() ? parsePeople(rawP) : null;
    if (rawP.trim()) await dailyBackup(rawP, 'megbizok');
    const fileH = await st.fhH.getFile();
    st.lastModH = fileH.lastModified;
    const rawH = await decodeFile(fileH);
    if (rawH.trim()) await dailyBackup(rawH, 'tortenet');
    mergeHistory(st.hist, parseHistory(rawH));                            // az előzmények sosem vesznek el: lemezen lévő + helyi események uniója
    const off = getOffline();
    if (off) { mergeInto(st.tasks, disk, st.deleted); mergePeopleInto(st.people, diskP || [], st.deletedP); }
    else { st.tasks = disk; st.people = diskP || seedPeople(disk); }
    const rec = reconcilePeople(st.tasks, st.people);                      // írásmód-egységesítés, hiányzó nevek felvétele
    st.mode = 'folder';
    resetSnap();                                                           // a betöltött állapot az új alapállapot (nem módosítás)
    render(); persistLocal();
    const needT = off || !raw.trim() || rec.renamed > 0 || raw !== toCSV(st.tasks).slice(1);
    const needP = off || !diskP || rec.added.length > 0 || rawP !== peopleToCSV(st.people).slice(1);
    if (needT) st.dirty = true;
    if (needP) st.dirtyP = true;
    if (rawH !== histToCSV(st.hist).slice(1)) st.dirtyH = true;
    if (needT || needP || st.dirtyH) await flush(); else st.savedAt = new Date();
    const msg = [];
    if (kind === 'v1' || kind === 'v0') msg.push('A CSV átalakítva az új szerkezetre. Az eredeti a „mentesek” mappában van.');
    if (!diskP && st.people.length) msg.push(`Megbízók lista létrehozva a feladatokból: ${st.people.length} név (megbizok.csv).`);
    else if (rec.added.length) msg.push(`${rec.added.length} új megbízó felkerült a listára.`);
    if (msg.length) toast(msg.join(' '));
  } catch (e) { st.mode = 'needperm'; st.err = e; }
  renderStatus();
}

export async function pickFolder(){
  if (!window.showDirectoryPicker) { st.mode = 'unsupported'; renderStatus(); return; }
  try {
    const h = await window.showDirectoryPicker({ id:'mytask', mode:'readwrite' });
    st.dir = h; try { await idbSet('dir', h); } catch {}
    await openFolder();
    if (st.mode === 'folder') toast('Csatlakoztatva: ' + h.name);
  } catch (e) { if (e.name !== 'AbortError') { st.err = e; renderStatus(); } }
}

export async function reconnect(){
  try {
    const p = await st.dir.requestPermission({ mode:'readwrite' });
    if (p === 'granted') await openFolder(); else toast('Az engedély nélkül nem tudok a mappába menteni.');
  } catch (e) { st.err = e; renderStatus(); }
}

export function queueSave(kind){                                              // kind: 'p' = csak a megbízók listája
  logChanges();                                                               // mi változott a feladatokban → előzmény-események
  if (kind === 'p') st.dirtyP = true; else st.dirty = true;
  persistLocal();
  if (st.mode !== 'folder') setOffline(true);
  renderStatus();
  clearTimeout(st.saveTimer); st.saveTimer = setTimeout(flush, 300);
}

// Segéd-fájlok (megbízók P, előzmények H) közös mentése: ha közben kívülről módosult, előbb egyesít, aztán ír (a fájl atomi cseréjével)
async function flushAux(k, mergeRaw, serialize){
  st['dirty' + k] = false;
  const fh = st['fh' + k], f = await fh.getFile();
  if (f.lastModified !== st['lastMod' + k]) { const raw = await decodeFile(f); if (raw.trim()) mergeRaw(raw); }
  const w = await fh.createWritable(); await w.write(serialize()); await w.close();
  st['lastMod' + k] = (await fh.getFile()).lastModified;
}

export async function flush(){
  clearTimeout(st.saveTimer); clearTimeout(st.retryTimer);
  if (st.mode !== 'folder' || st.saving) { renderStatus(); return; }
  st.saving = true; st.err = null; renderStatus();
  try {
    while (st.dirty || st.dirtyP || st.dirtyH) {
      if (st.dirtyP) await flushAux('P', raw => mergePeopleInto(st.people, parsePeople(raw), st.deletedP), () => peopleToCSV(st.people));   // előbb a megbízók,
      if (st.dirtyH) await flushAux('H', raw => mergeHistory(st.hist, parseHistory(raw)), () => histToCSV(st.hist));                         // az előzmények (csak bővülnek),
      if (st.dirty) {
        st.dirty = false;
        const f = await st.fh.getFile();
        if (f.lastModified !== st.lastMod) {                                // közben kívülről módosult → összefésülés, nem felülírás
          const raw = await decodeFile(f), p = raw.trim() ? parseText(raw) : { tasks:[] };
          if (raw.trim() && !p.tasks.length) { st.mode = 'blocked'; return; }
          mergeInto(st.tasks, p.tasks, st.deleted); resetSnap(); render();
        }
        const w = await st.fh.createWritable();
        await w.write(toCSV(st.tasks)); await w.close();
        st.lastMod = (await st.fh.getFile()).lastModified;
      }
    }
    st.savedAt = new Date(); setOffline(false);
  } catch (e) {
    st.dirty = true; st.dirtyP = true; st.dirtyH = true; st.err = e;
    if (e && e.name === 'NotAllowedError') st.mode = 'needperm';
    else st.retryTimer = setTimeout(flush, 15000);
  } finally { st.saving = false; renderStatus(); }
}

export async function checkExternal(){
  if (st.mode !== 'folder' || st.dirty || st.dirtyP || st.dirtyH || st.saving || st.editing || ov.pEdit != null || !st.fh) return;
  try {
    let changed = false;
    const f = await st.fh.getFile();
    if (f.lastModified !== st.lastMod) {
      const raw = await decodeFile(f), p = raw.trim() ? parseText(raw) : { tasks:[], kind:'empty' };
      st.lastMod = f.lastModified;
      if (!p.tasks.length) { if (raw.trim()) { st.mode = 'blocked'; renderStatus(); return; } queueSave(); }
      else { if (p.kind !== 'v2') { await schemaBackup(raw); st.dirty = true; } st.tasks = p.tasks; st.deleted.clear(); changed = true; }
    }
    const fp = await st.fhP.getFile();
    if (fp.lastModified !== st.lastModP) {
      const rawP = await decodeFile(fp); st.lastModP = fp.lastModified;
      if (rawP.trim()) { st.people = parsePeople(rawP); st.deletedP.clear(); changed = true; }
    }
    const fhh = await st.fhH.getFile();
    if (fhh.lastModified !== st.lastModH) {
      st.lastModH = fhh.lastModified;
      if (mergeHistory(st.hist, parseHistory(await decodeFile(fhh)))) changed = true;
    }
    if (!changed) return;
    const rec = reconcilePeople(st.tasks, st.people);
    resetSnap();
    if (rec.added.length) st.dirtyP = true;
    if (rec.renamed) st.dirty = true;
    render(); persistLocal();
    toast('A fájl időközben változott – frissítettem.');
    if (st.dirty || st.dirtyP) { renderStatus(); st.saveTimer = setTimeout(flush, 300); }
  } catch {}
}
