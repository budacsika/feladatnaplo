// A DOM-mentes modulok (src/util, tasks, csv, people-model, stats) tesztje Node-ban
import assert from 'node:assert';
import { normDate, normStamp, normDeadline, fold, weekDays, monthDays, isoWeek, fmtLeft, fmtAgo, fmtDur, toMs, dstr } from '../src/util.js';
import { mergeInto, extractTags, cimkeToTags, dueInfo, HEADER, cmpTasks, isParked, cmpParked } from '../src/tasks.js';
import { detectDelimiter, parseCSV, rowsToTasks, toCSV } from '../src/csv.js';
import { pkey, normName, parsePeople, peopleToCSV, seedPeople, reconcilePeople, mergePeopleInto, lev, suggestPeople, exactPerson } from '../src/people-model.js';
import { periodStats, peopleStats } from '../src/stats.js';

const parse = raw => { const d = detectDelimiter(raw); return rowsToTasks(parseCSV(raw, d), d); };

// 1) A felhasználó által beillesztett (Excelből másolt, TAB-os) régi v1 tábla → migráció
const pasted = `id	datum	feladat	statusz	cimke	letrehozva	modositva
tmw95rxd30coo	2026.11.09	Belépés tesztelése	nyitott	felület	2026-11-09T12:09:01	2026-11-09T12:09:01
tmw95sh5a1x9i	2026.11.09	Teszt felhasználók felvitele (3 db)	kesz	felület	2026-11-09T12:09:27	2026-11-09T12:11:58
tmw95t1gn2zxa	2026.11.09	Tömeges import utánanézése - kézikönyv, 11-es pont.	nyitott	import	2026-11-09T12:09:53	2026-11-09T12:09:53
tmw95tky03tge	2026.11.09	Évzáró levél kiküldése, a leírás dokumentálása	nyitott	evzaro_level	2026-11-09T12:10:18	2026-11-09T12:10:18
tmw95uf9l46mr	2026.11.09	Havi ütemterv átnézése, Larával egyeztetés	kesz	zárás	2026-11-09T12:10:57	2026-11-09T12:31:53
tmw95uoua5yta	2026.11.09	Havi ütemterv és kapcsolódó dokumentumok átnézése	nyitott	zárás	2026-11-09T12:11:10	2026-11-09T12:11:10
tmw95vg6q6y5g	2026.11.09	Riportgenerátor tesztelése - szerdán: előkészület, naptárfoglalás, Ádámmal egyeztetés.	nyitott	riport	2026-11-09T12:11:45	2026-11-09T12:11:45
tmw95vmnn709k	2026.11.09	Admin felhasználót létre kell hozni magamnak.	nyitott	felület	2026-11-09T12:11:54	2026-11-09T12:11:54
`;
assert.strictEqual(detectDelimiter(pasted), '\t');
let r = parse(pasted);
assert.strictEqual(r.kind, 'v1'); assert.strictEqual(r.tasks.length, 8);
assert.strictEqual(r.tasks[0].datum, '2026-11-09', 'Excel-es 2026.11.09 dátum');
assert.strictEqual(r.tasks[0].feladat, 'Belépés tesztelése #felület', 'cimke → #címke a szöveg végén');
assert.strictEqual(r.tasks[3].feladat, 'Évzáró levél kiküldése, a leírás dokumentálása #evzaro_level');
assert.strictEqual(r.tasks[1].statusz, 'kesz'); assert.strictEqual(r.tasks[1].lezarva, '2026-11-09T12:11:58', 'lezarva = modositva a kész soroknál');
assert.strictEqual(r.tasks[0].lezarva, ''); assert.strictEqual(r.tasks[0].megbizo, ''); assert.strictEqual(r.tasks[0].hatarido, '');
assert.strictEqual(r.tasks[0].id, 'tmw95rxd30coo', 'azonosító megmarad');

// 1b) ugyanez pontosvesszős CSV-ként, Excel-stílusú (idézőjel nélküli) mezőkkel, és a kimenet stabil v2
const semi = pasted.replace(/\t/g, ';');
r = parse(semi); assert.strictEqual(r.tasks.length, 8); assert.strictEqual(r.kind, 'v1');
const out = toCSV(r.tasks);
assert(out.startsWith('﻿id;datum;feladat;megbizo;hatarido;statusz;letrehozva;modositva;lezarva;tarolo\r\n'));
const r2 = parse(out.replace(/^﻿/, ''));
assert.strictEqual(r2.kind, 'v2'); assert.deepStrictEqual(r2.tasks, r.tasks, 'körbejárás azonos');
assert.strictEqual(toCSV(r2.tasks), out, 'stabil sorosítás → nincs felesleges újraírás');

// 1c) kézzel hozzáadott megbizo oszlop a régi cimke mellett (tetszőleges oszlopsorrend)
const manual = 'id;datum;feladat;statusz;cimke;megbizo;letrehozva;modositva\nx1;2026-11-09;Valami;nyitott;riport, teszt;Lara;2026-11-09T10:00:00;2026-11-09T10:00:00\n';
r = parse(manual); assert.strictEqual(r.kind, 'v1');
assert.strictEqual(r.tasks[0].megbizo, 'Lara'); assert.strictEqual(r.tasks[0].feladat, 'Valami #riport #teszt');

// 1d) ha a #címke már a szövegben van, nem duplázódik
r = parse('id;datum;feladat;statusz;cimke\nx;2026-11-09;Már #Felület benne;nyitott;felület\n');
assert.strictEqual(r.tasks[0].feladat, 'Már #Felület benne');
assert.deepStrictEqual(cimkeToTags('Év végi, zárás ügy;#x'), ['Év_végi', 'zárás_ügy', 'x']);

// 2) régi fejléc nélküli, 2 oszlopos CSV továbbra is működik
const legacy = `2026-09-09;"Belépés teszt"\n2026-09-09;"Havi ütemterv átnézése, Larával egyeztetés"\n`;
r = parse(legacy); assert.strictEqual(r.kind, 'v0'); assert.strictEqual(r.tasks.length, 2);
assert.strictEqual(r.tasks[1].feladat, 'Havi ütemterv átnézése, Larával egyeztetés');

// 3) körbejárás nehéz tartalommal
const src = [{ id:'a1', datum:'2026-11-09', feladat:'Idézet "benne"; pontosvessző\nés sortörés – őűáé #riport', statusz:'nyitott', megbizo:'Nagy "Peti" Á.', hatarido:'2026-11-10T16:00', letrehozva:'2026-11-09T11:55:12', modositva:'2026-11-09T11:55:12', lezarva:'', tarolo:'' },
             { id:'a2', datum:'2026-11-08', feladat:'Sima', statusz:'kesz', megbizo:'', hatarido:'2026-11-08', letrehozva:'', modositva:'', lezarva:'2026-11-08T09:00:00', tarolo:'' }];
const csv = toCSV(src);
assert.deepStrictEqual(parse(csv.replace(/^﻿/, '')).tasks, src);

// 4) dátum/idő normalizálás (Excel-es alakok)
assert.strictEqual(normDate('09.11.2026'), '2026-11-09');
assert.strictEqual(normStamp('2026.11.09 16:00'), '2026-11-09T16:00');
assert.strictEqual(normStamp('2026. 11. 09. 16:00:05'), '2026-11-09T16:00:05');
assert.strictEqual(normDeadline('2026-11-09T16:00:30'), '2026-11-09T16:00');
assert.strictEqual(normDeadline('2026.11.12'), '2026-11-12');
assert.strictEqual(normStamp('nem dátum'), '');
// naptári érvényesség
assert.strictEqual(normDate('2026-02-31'), '');
assert.strictEqual(normDate('31.02.2026'), '');
assert.strictEqual(normDate('2026-04-31'), '');
assert.strictEqual(normDate('2027-02-29'), '');
assert.strictEqual(normDate('2028-02-29'), '2028-02-29');
assert.strictEqual(normDate('2100-02-29'), '');
assert.strictEqual(normDate('2026-02-28'), '2026-02-28');
assert.strictEqual(normDate('2026-12-31'), '2026-12-31');
assert.strictEqual(normDate('2026-00-10'), '');
assert.strictEqual(normDate('2026-13-10'), '');
assert.strictEqual(normDate('0001-01-01'), '');
assert.strictEqual(normStamp('2026-02-30 10:00'), '');
// óra / perc / másodperc tartomány
assert.strictEqual(normStamp('2026-11-09 24:00'), '');
assert.strictEqual(normStamp('2026-11-09 23:60'), '');
assert.strictEqual(normStamp('2026-11-09 12:30:60'), '');
assert.strictEqual(normStamp('2026-11-09 23:59:59'), '2026-11-09T23:59:59');
assert.strictEqual(normStamp('2026-11-09 00:00'), '2026-11-09T00:00');
assert.strictEqual(normDeadline('2026-11-09T25:00'), '');
assert.strictEqual(normDeadline('2026-11-09T17:45'), '2026-11-09T17:45');
// lehetetlen dátumú sor: a létrehozás dátumára esik vissza
{
  const q = parse('id;datum;feladat;statusz;letrehozva\nx1;2026-02-31;Teszt;nyitott;2026-03-02T08:00\n');
  assert.strictEqual(q.tasks.length, 1);
  assert.strictEqual(q.tasks[0].datum, '2026-03-02');
}

// 5) #címke kinyerés
assert.deepStrictEqual(extractTags('Riport #felület és (#zárás) de nem a http://x/#abc vagy a#b #RIPORT_DOC'), ['felület', 'zárás', 'RIPORT_DOC']);

// 6) határidő-állapotok: lejárt / ≤1 óra / ≤2 óra / ma / holnap / később / kész
const now = new Date(2026, 10, 9, 12, 0, 0).getTime();
const mk = (h, st = 'nyitott') => ({ hatarido: h, statusz: st });
assert.strictEqual(dueInfo(mk('2026-11-09T11:25'), now).state, 'over');
assert.strictEqual(dueInfo(mk('2026-11-09T11:25'), now).label, 'lejárt · 35 perce');
assert.strictEqual(dueInfo(mk('2026-11-09T12:42'), now).state, 'h1');
assert.strictEqual(dueInfo(mk('2026-11-09T12:42'), now).label, '42 p múlva');
assert.strictEqual(dueInfo(mk('2026-11-09T13:00'), now).state, 'h1', 'pontosan 1 óra még h1');
assert.strictEqual(dueInfo(mk('2026-11-09T13:40'), now).state, 'h2');
assert.strictEqual(dueInfo(mk('2026-11-09T13:40'), now).label, '1 ó 40 p múlva');
assert.strictEqual(dueInfo(mk('2026-11-09T14:00'), now).state, 'h2', 'pontosan 2 óra még h2');
assert.strictEqual(dueInfo(mk('2026-11-09T14:01'), now).state, 'today');
assert.strictEqual(dueInfo(mk('2026-11-10T09:00'), now).state, 'soon');
assert.strictEqual(dueInfo(mk('2026-11-20T09:00'), now).state, 'later');
assert.strictEqual(dueInfo(mk('2026-11-09'), now).state, 'today', 'csak dátum: nap végéig él');
assert.strictEqual(dueInfo(mk('2026-11-08'), now).state, 'over');
assert.strictEqual(dueInfo(mk('2026-11-09T11:00', 'kesz'), now).state, 'done', 'kész feladat nem riaszt');
assert.strictEqual(dueInfo(mk(''), now), null);
assert.strictEqual(fmtLeft(120*60000), '2 ó'); assert.strictEqual(fmtAgo(3*86400e3), '3 napja'); assert.strictEqual(fmtDur(5.5*3600e3), '5,5 ó');

// 7) időszakok, statisztika
assert.deepStrictEqual(weekDays(0, new Date(2026, 10, 9)).slice(0, 2), ['2026-11-09', '2026-11-10'], 'hétfői kezdet');
assert.strictEqual(weekDays(0, new Date(2026, 10, 15))[0], '2026-11-09', 'vasárnap még ugyanabba a hétbe tartozik');
assert.strictEqual(weekDays(-1, new Date(2026, 10, 9))[0], '2026-11-02');
assert.strictEqual(monthDays(0, new Date(2026, 10, 9)).days.length, 30);
assert.strictEqual(monthDays(1, new Date(2026, 10, 9)).days[0], '2026-12-01');
assert.strictEqual(isoWeek(new Date(2026, 10, 9)), 46);
const tasks = parse(pasted).tasks;
tasks[0].megbizo = 'Lara'; tasks[4].megbizo = 'lara '; tasks[6].megbizo = 'Ádám'; tasks[0].hatarido = '2026-11-09T11:00';
const s = periodStats(tasks, weekDays(0, new Date(2026, 10, 9)), now);
assert.strictEqual(s.total, 8); assert.strictEqual(s.done, 2); assert.strictEqual(s.open, 6); assert.strictEqual(s.over, 1);
assert.strictEqual(s.per['2026-11-09'].total, 8);
assert.strictEqual(s.who[0].n, 2, 'Lara / lara egy megbízónak számít'); assert.strictEqual(s.who[0].name, 'Lara');
assert.deepStrictEqual(s.tags.slice(0, 2).map(x => [x.name, x.n]), [['felület', 3], ['zárás', 2]]);
assert(Math.abs(s.leadMs - ((151000 + 1256000) / 2)) < 1000, 'átlagos átfutás');

// 8) összefésülés, ismeretlen tartalom
const mine = [{ id:'x', feladat:'régi', modositva:'2026-01-01T10:00:00' }, { id:'gone', feladat:'g', modositva:'' }];
mergeInto(mine, [{ id:'x', feladat:'új', modositva:'2026-01-02T10:00:00' }, { id:'n', feladat:'n', modositva:'' }, { id:'gone2', feladat:'q', modositva:'' }], new Set(['gone2']));
assert.strictEqual(mine.find(q => q.id === 'x').feladat, 'új'); assert(mine.some(q => q.id === 'n')); assert(!mine.some(q => q.id === 'gone2'));
assert.strictEqual(parse('valami;egészen más\n1;2\n').tasks.length, 0);
assert(fold('Őszi ŰRLAP').length === 'Őszi ŰRLAP'.length);

// 9) rendezés: nap csökkenő, napon belül nyitott → kész, azon belül rögzítési idő növekvő
const o = [
  { id:'k1', datum:'2026-11-09', statusz:'kesz',    letrehozva:'2026-11-09T09:00:00' },
  { id:'n3', datum:'2026-11-09', statusz:'nyitott', letrehozva:'2026-11-09T11:00:00' },
  { id:'k2', datum:'2026-11-09', statusz:'kesz',    letrehozva:'2026-11-09T08:00:00' },
  { id:'n1', datum:'2026-11-09', statusz:'nyitott', letrehozva:'2026-11-09T07:00:00' },
  { id:'rg', datum:'2026-11-08', statusz:'nyitott', letrehozva:'2026-11-08T07:00:00' },
  { id:'n0', datum:'2026-11-09', statusz:'nyitott', letrehozva:'' },
];
assert.deepStrictEqual(o.slice().sort(cmpTasks).map(x => x.id), ['n0', 'n1', 'n3', 'k2', 'k1', 'rg']);

// 10) megbízók: beolvasás, sorosítás, kezdő lista a feladatokból, egységesítés
const tk = (megbizo, statusz = 'nyitott', datum = '2026-11-09', hatarido = '') => ({ id: Math.random().toString(36), datum, feladat: 'x', megbizo, hatarido, statusz, letrehozva: '', modositva: '', lezarva: '' });
const T = [tk('Lara'), tk('lara '), tk('Lara'), tk('Nagy  Péter'), tk('nagy péter', 'kesz'), tk('Ádám'), tk('')];
const seeded = seedPeople(T);
assert.deepStrictEqual(seeded.map(p => p.nev), ['Lara', 'Nagy Péter', 'Ádám'], 'leggyakoribb írásmód, gyakoriság szerint');
const rec = reconcilePeople(T, seeded);
assert.strictEqual(rec.added.length, 0); assert.strictEqual(T[1].megbizo, 'Lara', 'lara → Lara'); assert.strictEqual(T[4].megbizo, 'Nagy Péter');
const more = [tk('Zsolt'), tk('ZSOLT')]; const ppl = seeded.slice();
assert.deepStrictEqual(reconcilePeople(more, ppl).added, ['Zsolt'], 'hiányzó név felvétele egyszer'); assert.strictEqual(more[1].megbizo, 'Zsolt');
const pcsv = peopleToCSV([{ nev:'Lara', megjegyzes:'zárás; "ügyek"', aktiv:'igen' }, { nev:'Ádám', megjegyzes:'', aktiv:'nem' }]);
assert(pcsv.startsWith('﻿nev;megjegyzes;aktiv\r\n'));
assert.deepStrictEqual(parsePeople(pcsv.slice(1)), [{ nev:'Lara', megjegyzes:'zárás; "ügyek"', aktiv:'igen' }, { nev:'Ádám', megjegyzes:'', aktiv:'nem' }]);
assert.deepStrictEqual(parsePeople('Lara\nÁdám\nlara\n\nNagy Péter\n').map(p => p.nev), ['Lara', 'Ádám', 'Nagy Péter'], 'fejléc nélküli névlista + duplikátum kiszűrve');
assert.deepStrictEqual(parsePeople('Név\tMegjegyzés\tAktív\nLara\tx\tnem\n').map(p => [p.nev, p.megjegyzes, p.aktiv]), [['Lara', 'x', 'nem']], 'Excelből másolt, ékezetes fejléc');
assert.strictEqual(peopleToCSV(parsePeople(pcsv.slice(1))), pcsv, 'stabil sorosítás');

// 11) javaslatok: elgépelés ellen
const P = [{ nev:'Lara', megjegyzes:'', aktiv:'igen' }, { nev:'Nagy Péter', megjegyzes:'bevételi osztály', aktiv:'igen' }, { nev:'Ádám', megjegyzes:'', aktiv:'igen' },
           { nev:'Lajos', megjegyzes:'', aktiv:'igen' }, { nev:'Régi Rudi', megjegyzes:'', aktiv:'nem' }];
const cnt = new Map([['lara', 9], ['lajos', 2], ['nagy peter', 4], ['adam', 1]]);
const names = (q, lim) => suggestPeople(q, P, cnt, lim).map(s => s.p.nev);
assert.deepStrictEqual(names(''), ['Lara', 'Nagy Péter', 'Lajos', 'Ádám'], 'üres: gyakoriság szerint, az inaktív kimarad');
assert.deepStrictEqual(names('la'), ['Lara', 'Lajos'], 'előtag');
assert.deepStrictEqual(names('peter'), ['Nagy Péter'], 'ékezet nélkül, szó elejére is');
assert.deepStrictEqual(names('ADAM'), ['Ádám']);
assert.strictEqual(suggestPeople('lary', P, cnt)[0].p.nev, 'Lara'); assert.strictEqual(suggestPeople('lary', P, cnt)[0].tier, 5, 'elgépelés → "Erre gondoltál?"');
assert.strictEqual(suggestPeople('nagy peter', P, cnt)[0].p.nev, 'Nagy Péter');
assert.strictEqual(suggestPeople('osztaly', P, cnt)[0].p.nev, 'Nagy Péter', 'megjegyzésben is keres');
assert.deepStrictEqual(names('zsolt'), [], 'ismeretlen név: nincs javaslat');
assert.deepStrictEqual(names('rudi'), [], 'inaktívat nem ajánl fel');
assert.strictEqual(exactPerson(' nagy  PÉTER ', P).nev, 'Nagy Péter'); assert.strictEqual(exactPerson('Rudi', P), null); assert.strictEqual(exactPerson('régi rudi', P).aktiv, 'nem');
assert.strictEqual(lev('lara', 'lary'), 1); assert.strictEqual(lev('', 'ab'), 2);

// 12) statisztika: kitől hány feladat
const nowS = new Date(2026, 10, 9, 12, 0, 0).getTime();
const S = [tk('Lara', 'nyitott', '2026-11-09', '2026-11-09T11:00'), tk('Lara', 'kesz', '2026-11-05'), tk('Ádám', 'nyitott', '2026-11-09'), tk('', 'nyitott', '2026-11-09'), tk('Új Ember', 'nyitott', '2026-10-01')];
const ps = peopleStats(S, [{ nev:'Lara', megjegyzes:'', aktiv:'igen' }, { nev:'Ádám', megjegyzes:'', aktiv:'igen' }, { nev:'Senki', megjegyzes:'', aktiv:'igen' }], null, nowS);
assert.deepStrictEqual(ps.rows.map(r => [r.nev, r.total, r.done, r.open, r.over]), [['Lara', 2, 1, 1, 1], ['Ádám', 1, 0, 1, 0], ['Új Ember', 1, 0, 1, 0], ['Senki', 0, 0, 0, 0]]);
assert.strictEqual(ps.none.total, 1); assert.strictEqual(ps.rows[0].last, '2026-11-09');
const pw = peopleStats(S, [{ nev:'Lara', megjegyzes:'', aktiv:'igen' }], weekDays(0, new Date(2026, 10, 9)), nowS);
assert.strictEqual(pw.rows.find(r => r.nev === 'Lara').total, 1, 'időszak szerinti szűrés');
// 13) lista-összefésülés külső szerkesztésnél: törölt név nem éled újra
const tgt = [{ nev:'Lara' }]; mergePeopleInto(tgt, [{ nev:'lara' }, { nev:'Ádám' }, { nev:'Régi' }], new Set(['regi']));
assert.deepStrictEqual(tgt.map(x => x.nev), ['Lara', 'Ádám']);

console.log('Minden pure teszt rendben ✔');


// ---- Tároló (v2.5) ----
{
  const mk = (id, extra = {}) => ({ id, datum:'2026-11-09', feladat:'Feladat ' + id, megbizo:'Lara', hatarido:'', statusz:'nyitott', letrehozva:'2026-11-09T09:00:00', modositva:'2026-11-09T09:00:00', lezarva:'', tarolo:'', ...extra });
  assert(HEADER.includes('tarolo') && HEADER[HEADER.length - 1] === 'tarolo', 'új oszlop a fejléc végén');
  // CSV körút
  const list = [mk('a'), mk('b', { tarolo:'igen', feladat:'Táblakapcsolatok felderítése #db' })];
  const csv = toCSV(list);
  assert(/;igen\r\n/.test(csv), 'tarolo=igen a CSV-ben');
  const back = parse(csv);
  assert.strictEqual(back.kind, 'v2'); assert.strictEqual(back.tasks.length, 2);
  assert.strictEqual(back.tasks[1].tarolo, 'igen'); assert.strictEqual(back.tasks[0].tarolo, '');
  assert(isParked(back.tasks[1]) && !isParked(back.tasks[0]));
  // régi v2 fájl (tarolo oszlop nélkül): marad v2, semmi sincs a tárolóban
  const old = '\uFEFFid;datum;feladat;megbizo;hatarido;statusz;letrehozva;modositva;lezarva\r\nx1;2026-11-09;"Régi";Lara;;nyitott;2026-11-09T09:00:00;2026-11-09T09:00:00;\r\n';
  const po = parse(old); assert.strictEqual(po.kind, 'v2'); assert.strictEqual(po.tasks[0].tarolo, '');
  // kész feladat nem lehet tárolóban; tárolt feladatnak nincs határideje
  const odd = '\uFEFFid;datum;feladat;megbizo;hatarido;statusz;letrehozva;modositva;lezarva;tarolo\r\nk1;2026-11-09;"Kész";;;kesz;2026-11-09T09:00;2026-11-09T10:00;2026-11-09T10:00;igen\r\nk2;2026-11-09;"Tárolt";;2026-11-12T10:00;nyitott;2026-11-09T09:00;2026-11-09T09:00;;igen\r\n';
  const pd = parse(odd);
  assert.strictEqual(pd.tasks[0].tarolo, '', 'kész → nem tárolt'); assert.strictEqual(pd.tasks[1].tarolo, 'igen'); assert.strictEqual(pd.tasks[1].hatarido, '', 'tárolt: nincs határidő');
  // v0 és v1 átalakítás: nincs tárolt
  assert(parse('2026-09-09;"Valami"\r\n').tasks.every(t => t.tarolo === ''));
  // statisztika: a tárolt nem számít
  const days = weekDays(0, new Date(2026, 10, 9));
  const withP = [mk('a'), mk('b', { tarolo:'igen' }), mk('c', { statusz:'kesz', lezarva:'2026-11-09T11:00:00' })];
  const ps = periodStats(withP, days, Date.now());
  assert.strictEqual(ps.total, 2, 'tárolt nincs a heti összesenben'); assert.strictEqual(ps.who[0].n, 2, 'megbízói toplista sem számolja');
  const pp = peopleStats(withP, [{ nev:'Lara', megjegyzes:'', aktiv:'igen' }], null);
  assert.strictEqual(pp.rows[0].total, 2, 'megbízói statisztika sem számolja');
  // összefésülés: a tároló jelző átmegy
  const tgt = [mk('a', { modositva:'2026-11-09T09:00:00' })];
  mergeInto(tgt, [mk('a', { tarolo:'igen', modositva:'2026-11-09T10:00:00' })], new Set());
  assert.strictEqual(tgt[0].tarolo, 'igen');
  // sorrend: régebben rögzített elöl
  const sorted = [mk('n', { letrehozva:'2026-11-10T09:00:00' }), mk('o', { letrehozva:'2026-11-01T09:00:00' })].sort(cmpParked);
  assert.strictEqual(sorted[0].id, 'o');
  console.log('Tároló pure tesztek ✔');
}

// ---- Oszlopsorrend, ismeretlen oszlopok, Excel-es dátumok (v2.6) ----
{
  const shuffled = 'tarolo;statusz;feladat;id;datum;extra;megbizo\r\nigen;nyitott;"Ötlet";p1;2026.11.09;valami;Lara\r\n;kesz;"Kész";p2;2026. 11. 08.;;Ádám\r\n';
  const r = parse(shuffled);
  assert.strictEqual(r.kind, 'v1', 'hiányzó hatarido/lezarva/modositva oszlop → átalakítás');   // a fájl nem teljes v2 → a program átírja és mentést készít
  assert.strictEqual(r.tasks.length, 2);
  assert.strictEqual(r.tasks[0].tarolo, 'igen'); assert.strictEqual(r.tasks[0].datum, '2026-11-09'); assert.strictEqual(r.tasks[0].megbizo, 'Lara');
  assert.strictEqual(r.tasks[1].tarolo, ''); assert.strictEqual(r.tasks[1].datum, '2026-11-08'); assert.strictEqual(r.tasks[1].statusz, 'kesz');
  const full = 'extra;lezarva;modositva;letrehozva;statusz;hatarido;megbizo;feladat;datum;id;tarolo\r\nx;;;;nyitott;;;"Teljes";2026-11-09;q1;\r\n';
  assert.strictEqual(parse(full).kind, 'v2', 'teljes fejléc, tetszőleges sorrend és extra oszlop: v2');
  assert.strictEqual(parse(full).tasks[0].feladat, 'Teljes');
  console.log('Oszlopsorrend pure tesztek ✔');
}
