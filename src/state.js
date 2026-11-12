// Közös állapot és konstansok (st, ui, ov), DOM-segédek

export const VERSION = typeof __VERSION__ === 'string' ? __VERSION__ : 'dev';   // a build a package.json verziójából tölti be

/* ---------- állapot ---------- */
export const FILE_NAME = 'feladatnaplo.csv', BACKUP_DIR = 'mentesek', BACKUP_KEEP = 60;

export const DB_NAME = 'feladatnaplo-mytask', STORE = 'kv', LS = 'feladatnaplo.v1', LS_OFF = 'feladatnaplo.v1.offline', LS_DASH = 'feladatnaplo.dash', LS_P = 'feladatnaplo.v1.people', LS_PPL = 'feladatnaplo.ppl', LS_PARK = 'feladatnaplo.park', PEOPLE_FILE = 'megbizok.csv';

export const st = { tasks:[], deleted:new Set(), mode:'none', dir:null, fh:null, lastMod:0,
  dirty:false, saving:false, err:null, savedAt:null, editing:null, dateTouched:false, saveTimer:0, retryTimer:0,
  people:[], deletedP:new Set(), fhP:null, lastModP:0, dirtyP:false };

export const ui = { search:'', status:'all', period:'all', dayState:new Map() };   // dayState: nap → kézzel nyitott/zárt; alapból csak a mai nap nyitott

export const ov = { w:0, m:0, park: (() => { try { return localStorage.getItem(LS_PARK) !== '0'; } catch { return true; } })(), people: (() => { try { return localStorage.getItem(LS_PPL) === '1'; } catch { return false; } })(), pPeriod:'all', pEdit:null, hidden: (() => { try { return localStorage.getItem(LS_DASH) === '0'; } catch { return false; } })() };

export const $ = s => document.querySelector(s);

export const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export const ICON_USER = '<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="4" r="2.2"/><path d="M1.8 11c.4-2.6 2.2-3.8 4.2-3.8s3.8 1.2 4.2 3.8"/></svg>';

export const ICON_CLOCK = '<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.6"/><path d="M6 3.2V6l2 1.2"/></svg>';

export const isDone = t => t.statusz === 'kesz';
