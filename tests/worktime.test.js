// A munkamenet-modell (src/worktime.js) tesztje Node-ban, rögzített időzónában és vezérelt órával
process.env.TZ = 'Europe/Budapest';
import assert from 'node:assert';
import { startWork, pauseWork, stopForTask, closeSession, activeOf, isActive, durMs, workMsOfTask, workMsOn, spanOf, normalizeActive,
         gapCheck, capOf, sessionsToCSV, parseSessions, mergeSessions, fmtHMS, fmtWork, SESS_HEADER, SLEEP_MS } from '../src/worktime.js';

assert.strictEqual(new Date(2026, 9, 25, 3, 30).getTimezoneOffset(), -60, 'a teszt Europe/Budapest zónában fut');
const T = s => new Date(s).getTime();                    // helyi idő, zóna nélküli bélyegből
const MIN = 60e3;

// 1) indítás: a munkamenet aktív, a kezdet rögzül, a futó idő a `now`-ból számolódik
let L = [];
let r = startWork(L, 't1', T('2026-11-09T09:00:00'));
assert(r.started && !r.closed && !r.same);
assert.deepStrictEqual({ ...r.started, id: '' }, { id: '', feladat_id: 't1', kezdet: '2026-11-09T09:00:00', veg: '', idotartam_mp: '', ok: '' });
assert.strictEqual(activeOf(L), r.started);
assert.strictEqual(durMs(r.started, T('2026-11-09T09:23:41')), (23 * 60 + 41) * 1000, 'futó idő = most − kezdet');
assert.strictEqual(startWork(L, 't1', T('2026-11-09T09:05:00')).same, r.started, 'ugyanarra a feladatra nem indul új munkamenet');
assert.strictEqual(L.length, 1);

// 2) szüneteltetés: lezárul, az idő megőrződik, az időmérés megáll
const p = pauseWork(L, T('2026-11-09T09:35:00'));
assert.strictEqual(p.ok, 'szunet'); assert.strictEqual(p.idotartam_mp, '2100'); assert.strictEqual(p.veg, '2026-11-09T09:35:00');
assert.strictEqual(activeOf(L), null);
assert.strictEqual(durMs(p, T('2026-11-09T18:00:00')), 35 * MIN, 'lezárt munkamenet ideje nem nő tovább');
assert.strictEqual(pauseWork(L, T('2026-11-09T09:40:00')), null, 'nincs mit szüneteltetni');

// 3) folytatás + 7) több munkamenet összege (a specifikáció példája: 35 + 30 + 20 = 85 perc)
startWork(L, 't1', T('2026-11-09T10:10:00')); pauseWork(L, T('2026-11-09T10:40:00'));
startWork(L, 't1', T('2026-11-09T13:00:00')); pauseWork(L, T('2026-11-09T13:20:00'));
assert.strictEqual(L.length, 3);
assert.strictEqual(workMsOfTask(L, 't1', T('2026-11-09T18:00:00')), 85 * MIN);
assert.strictEqual(fmtWork(85 * MIN), '1 ó 25 p');
assert.strictEqual(workMsOn(L, '2026-11-09', T('2026-11-09T18:00:00')), 85 * MIN);
assert.strictEqual(workMsOn(L, '2026-11-10', T('2026-11-10T18:00:00')), 0);
assert.strictEqual(workMsOfTask(L, 'másik', T('2026-11-09T18:00:00')), 0);

// 4) feladatváltás: a régi lezárul (valtas), nyitva marad, az új ugyanabban a pillanatban indul; egyszerre egy aktív
L = []; startWork(L, 'a', T('2026-11-09T09:00:00'));
r = startWork(L, 'b', T('2026-11-09T09:20:00'));
assert.strictEqual(r.closed.feladat_id, 'a'); assert.strictEqual(r.closed.ok, 'valtas'); assert.strictEqual(r.closed.veg, r.started.kezdet);
assert.strictEqual(L.filter(isActive).length, 1); assert.strictEqual(activeOf(L).feladat_id, 'b');
assert.strictEqual(workMsOfTask(L, 'a', T('2026-11-09T12:00:00')), 20 * MIN);

// 5) az aktív feladat lezárása (kész / tárolóba / törlés): csak ha éppen ő az aktív
assert.strictEqual(stopForTask(L, 'a', T('2026-11-09T09:30:00'), 'kesz'), null, 'nem aktív feladat lezárása nem érinti a mérést');
assert(activeOf(L));
const fin = stopForTask(L, 'b', T('2026-11-09T09:50:00'), 'kesz');
assert.strictEqual(fin.ok, 'kesz'); assert.strictEqual(fin.idotartam_mp, String(30 * 60)); assert.strictEqual(activeOf(L), null);
for (const ok of ['tarolo', 'torles']) { const q = []; startWork(q, 'x', T('2026-11-09T09:00:00')); assert.strictEqual(stopForTask(q, 'x', T('2026-11-09T09:01:00'), ok).ok, ok); }

// 6) újranyitás: a korábban mért idő megmarad, az új munka hozzáadódik
startWork(L, 'b', T('2026-11-09T11:00:00')); pauseWork(L, T('2026-11-09T11:10:00'));
assert.strictEqual(workMsOfTask(L, 'b', T('2026-11-09T12:00:00')), 40 * MIN);

// éjfélen átnyúló munkamenet: napokra bontva
L = []; startWork(L, 'n', T('2026-11-09T23:30:00')); pauseWork(L, T('2026-11-10T00:45:00'));
assert.strictEqual(workMsOn(L, '2026-11-09', T('2026-11-10T12:00:00')), 30 * MIN);
assert.strictEqual(workMsOn(L, '2026-11-10', T('2026-11-10T12:00:00')), 45 * MIN);
// a futó munkamenet a mai napra számít (most-ig)
L = []; startWork(L, 'n', T('2026-11-09T13:00:00'));
assert.strictEqual(workMsOn(L, '2026-11-09', T('2026-11-09T13:44:00')), 44 * MIN);

// időzóna: az idotartam_mp a valós időből készül → nyári/téli időszámítás-váltás nem torzít
let s = { id: 'd1', feladat_id: 'x', kezdet: '2026-10-25T01:30:00', veg: '', idotartam_mp: '', ok: '' };
closeSession(s, Date.UTC(2026, 9, 25, 2, 30), 'szunet');       // 01:30 CEST → 03:30 CET (a 2 és 3 óra közötti óra kétszer van)
assert.strictEqual(s.veg, '2026-10-25T03:30:00'); assert.strictEqual(s.idotartam_mp, '10800', '3 valós óra, nem 2');
let parsed = parseSessions(sessionsToCSV([s])).sessions;
assert.strictEqual(parsed[0].idotartam_mp, '10800', 'betöltéskor az idotartam_mp a mérvadó');
assert.strictEqual(durMs(parsed[0], 0), 3 * 3600e3);
s = { id: 'd2', feladat_id: 'x', kezdet: '2026-03-29T01:30:00', veg: '', idotartam_mp: '', ok: '' };
closeSession(s, Date.UTC(2026, 2, 29, 2, 30), 'szunet');       // 01:30 CET → 04:30 CEST
assert.strictEqual(s.veg, '2026-03-29T04:30:00'); assert.strictEqual(s.idotartam_mp, '7200', '2 valós óra, nem 3');

// 13) alvás és óraváltozás
const act = { id: 'a', feladat_id: 'x', kezdet: '2026-11-09T09:00:00', veg: '', idotartam_mp: '', ok: '' };
assert.strictEqual(gapCheck(null, T('2026-11-09T10:00:00'), T('2026-11-09T12:00:00')), null, 'nincs aktív → nincs mit ellenőrizni');
assert.strictEqual(gapCheck(act, T('2026-11-09T09:59:30'), T('2026-11-09T10:00:00')), null, 'normál működés');
assert.strictEqual(gapCheck(act, T('2026-11-09T10:00:00'), T('2026-11-09T10:00:00') + SLEEP_MS), null, 'a küszöbön még rendben');
let gap = gapCheck(act, T('2026-11-09T10:00:00'), T('2026-11-09T12:30:00'));
assert.deepStrictEqual(gap, { kind: 'sleep', fromMs: T('2026-11-09T10:00:00'), toMs: T('2026-11-09T12:30:00') });
assert.strictEqual(capOf(gap), T('2026-11-09T10:00:00'), 'ellenőrzésig csak a biztosan ismert időt számoljuk');
assert.strictEqual(durMs(act, T('2026-11-09T12:30:00'), capOf(gap)), 60 * MIN);
assert.strictEqual(durMs(act, T('2026-11-09T12:30:00'), capOf(null)), 210 * MIN);
assert.strictEqual(gapCheck(act, undefined, T('2026-11-09T09:03:00')), null, 'nincs szívverés: a kezdet az alap');
assert.strictEqual(gapCheck(act, 0, T('2026-11-09T12:00:00')).kind, 'sleep', 'böngészőújraindítás szívverés nélkül, hosszú idő után: ellenőrzés');
gap = gapCheck(act, T('2026-11-09T11:00:00'), T('2026-11-09T10:00:00'));
assert.strictEqual(gap.kind, 'clock', 'az óra visszaugrott'); assert.strictEqual(capOf(gap), T('2026-11-09T10:00:00'));
assert.strictEqual(durMs(act, T('2026-11-09T08:00:00')), 0, 'az idő sosem negatív');
assert.strictEqual(gapCheck(act, T('2026-11-09T09:00:00'), T('2026-11-09T08:00:00')).kind, 'clock', 'a kezdet a jövőben');
// a szívverés korábbi napról → nem a kezdet előtti időt számoljuk
assert.strictEqual(gapCheck(act, T('2026-11-08T17:00:00'), T('2026-11-09T09:02:00')), null);

// CSV: körút, fejléc, BOM, CRLF, aktív sor üres mezőkkel
L = []; startWork(L, 't1', T('2026-11-09T09:00:00')); pauseWork(L, T('2026-11-09T09:35:00')); startWork(L, 't"2;x', T('2026-11-09T10:00:00'));
const csv = sessionsToCSV(L);
assert(csv.startsWith('﻿' + SESS_HEADER.join(';') + '\r\n') && csv.endsWith('\r\n'));
assert(/;2026-11-09T10:00:00;;;\r\n/.test(csv), 'az aktív sor végén üres veg, idotartam_mp, ok');
let q = parseSessions(csv);
assert.deepStrictEqual(q.sessions, [...L].sort((a, b) => (a.kezdet < b.kezdet ? -1 : 1)));
assert.deepStrictEqual([q.bad, q.fixed, q.blocked], [0, 0, false]);
assert.strictEqual(sessionsToCSV(q.sessions), csv, 'stabil körút');
assert.strictEqual(activeOf(q.sessions).feladat_id, 't"2;x', 'idézőjeles / pontosvesszős azonosító épségben');

// 9) hiányzó / üres fájl
assert.deepStrictEqual(parseSessions(''), { sessions: [], bad: 0, fixed: 0, blocked: false });
assert.deepStrictEqual(parseSessions('﻿id;feladat_id;kezdet;veg;idotartam_mp;ok\r\n').sessions, []);

// 10) hibás / sérült adat: az érvénytelen sor kimarad (bad), a javíthatót helyrehozzuk (fixed), semmi sem omlik össze
q = parseSessions([
  'id;feladat_id;kezdet;veg;idotartam_mp;ok',
  'ok1;t1;2026-11-09T09:00:00;2026-11-09T09:30:00;1800;szunet',
  ';t1;2026-11-09T09:00:00;2026-11-09T09:30:00;1800;szunet',          // nincs azonosító
  'b2;t1;nem idő;;;',                                                  // hibás kezdet
  'b3;t1;2026-11-09T10:00:00;2026-11-09T09:00:00;;szunet',             // a vég a kezdet előtt
  'b4;t1;2026-02-31T10:00:00;;;',                                      // lehetetlen dátum
  'b5;;2026-11-09T10:00:00;;;',                                        // nincs feladat
  'f1;t2;2026-11-09T11:00:00;2026-11-09T11:10:00;99999;szunet',        // hamis időtartam → a bélyegekből
  'f2;t2;2026-11-09T12:00:00;2026-11-09T12:10:00;600;furcsa',          // ismeretlen ok
  'f3;t2;2026-11-09T13:00:00;2026-11-09T13:10:00;;kesz',               // hiányzó időtartam → származtatott (nem hiba)
  'ok1;t9;2026-11-09T14:00:00;2026-11-09T14:10:00;600;szunet',         // ismétlődő azonosító
  '',
].join('\n'));
assert.deepStrictEqual(q.sessions.map(x => x.id), ['ok1', 'f1', 'f2', 'f3']);
assert.deepStrictEqual(q.sessions.map(x => x.idotartam_mp), ['1800', '600', '600', '600']);
assert.deepStrictEqual(q.sessions.map(x => x.ok), ['szunet', 'szunet', 'szunet', 'kesz']);
assert.deepStrictEqual([q.bad, q.fixed], [6, 2]);
// két nyitott munkamenet → a későbbi marad aktív, a korábbi „valtas" a másik kezdetével
q = parseSessions('id;feladat_id;kezdet;veg;idotartam_mp;ok\nx1;a;2026-11-09T09:00:00;;;\nx2;b;2026-11-09T09:40:00;;;\n');
assert.deepStrictEqual(q.sessions.map(x => [x.id, x.veg, x.ok]), [['x1', '2026-11-09T09:40:00', 'valtas'], ['x2', '', '']]); assert.strictEqual(q.fixed, 1);
// ismeretlen fejléc (pl. a feladatok CSV-je) → blocked, nem értelmezzük és nem írjuk felül
q = parseSessions('id;datum;feladat;megbizo\nx;2026-11-09;valami;\n');
assert.deepStrictEqual([q.blocked, q.sessions.length], [true, 0]);
// oszlopsorrend és Excel-dátumformátum
q = parseSessions('ok;veg;kezdet;feladat_id;idotartam_mp;id\nszunet;2026.11.09 09:35;2026.11.09 09:00;t1;2100;z1\n');
assert.deepStrictEqual(q.sessions, [{ id: 'z1', feladat_id: 't1', kezdet: '2026-11-09T09:00', veg: '2026-11-09T09:35', idotartam_mp: '2100', ok: 'szunet' }]);

// 12) párhuzamos fülek: egyesítés
const A = [{ id: 'm1', feladat_id: 'x', kezdet: '2026-11-09T09:00:00', veg: '', idotartam_mp: '', ok: '' }];
const closed = { id: 'm1', feladat_id: 'x', kezdet: '2026-11-09T09:00:00', veg: '2026-11-09T09:30:00', idotartam_mp: '1800', ok: 'szunet' };
assert.strictEqual(mergeSessions(A, [closed]), 1); assert.strictEqual(A[0].veg, '2026-11-09T09:30:00', 'a lezárt sor erősebb a nyitottnál');
assert.strictEqual(mergeSessions(A, [closed]), 0, 'idempotens');
// régi (nyitott) állapot nem írja felül a lezártat
assert.strictEqual(mergeSessions(A, [{ ...closed, veg: '', idotartam_mp: '', ok: '' }]), 0); assert.strictEqual(A[0].ok, 'szunet');
// két különböző nyitott: determinisztikus feloldás, mindkét irányban ugyanaz
const mk = (id, f, k) => ({ id, feladat_id: f, kezdet: k, veg: '', idotartam_mp: '', ok: '' });
const left = [mk('p', 'a', '2026-11-09T09:00:00')], right = [mk('q', 'b', '2026-11-09T09:10:00')];
const l2 = left.map(x => ({ ...x })), r2 = right.map(x => ({ ...x }));
mergeSessions(left, right); mergeSessions(r2, l2);
assert.deepStrictEqual(left, r2);
assert.deepStrictEqual(left.map(x => [x.id, x.ok, x.veg]), [['p', 'valtas', '2026-11-09T09:10:00'], ['q', '', '']]);
// két lezárt eltérő véggel: a későbbi nyer (szimmetrikus)
const c1 = [{ ...closed, id: 'k', veg: '2026-11-09T09:30:00', idotartam_mp: '1800' }], c2 = [{ ...closed, id: 'k', veg: '2026-11-09T09:31:00', idotartam_mp: '1860' }];
const c1b = c1.map(x => ({ ...x })), c2b = c2.map(x => ({ ...x }));
mergeSessions(c1, c2); mergeSessions(c2b, c1b);
assert.deepStrictEqual(c1, c2b); assert.strictEqual(c1[0].idotartam_mp, '1860');
// a bemenetet nem módosítja (másolat kerül be)
const inc = [mk('z', 'a', '2026-11-09T08:00:00')], dst = []; mergeSessions(dst, inc); dst[0].ok = 'szunet'; assert.strictEqual(inc[0].ok, '');

// formázás
assert.strictEqual(fmtHMS(23 * 60e3 + 41e3), '00:23:41'); assert.strictEqual(fmtHMS(-5), '00:00:00'); assert.strictEqual(fmtHMS(3661e3), '01:01:01');
assert.strictEqual(fmtWork(35 * MIN), '35 p'); assert.strictEqual(fmtWork(125 * MIN), '2 ó 05 p'); assert.strictEqual(fmtWork(0), '0 p');
assert.strictEqual(spanOf({ kezdet: 'rossz', veg: '' }, 1), null);
assert.strictEqual(normalizeActive([mk('1', 'a', '2026-11-09T09:00:00')]), 0);
console.log('Munkamenet pure tesztek ✔');
