// Headless Chrome + memóriabeli File System Access mock (v2)
import puppeteer from 'puppeteer-core';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = 'file://' + path.resolve(__dirname, '../feladatnaplo.html');
const OUT = path.resolve(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MOCK = () => {
  const enc = new TextEncoder();
  class FileNode { constructor(){ this.bytes = new Uint8Array(); this.mtime = Date.now(); } }
  class Dir {
    constructor(name){ this.name = name; this.kind = 'directory'; this.children = new Map(); }
    async queryPermission(){ return 'granted'; } async requestPermission(){ return 'granted'; }
    async getFileHandle(n, o = {}) { let c = this.children.get(n);
      if (!c) { if (!o.create) { const e = new Error('nf'); e.name = 'NotFoundError'; throw e; } c = new FileNode(); this.children.set(n, c); } return new FH(n, c); }
    async getDirectoryHandle(n, o = {}) { let c = this.children.get(n);
      if (!c) { if (!o.create) { const e = new Error('nf'); e.name = 'NotFoundError'; throw e; } c = new Dir(n); this.children.set(n, c); } return c; }
    async removeEntry(n){ this.children.delete(n); }
    async *entries(){ for (const [n, c] of this.children) yield [n, c instanceof Dir ? c : new FH(n, c)]; }
  }
  class FH {
    constructor(n, node){ this.name = n; this.kind = 'file'; this.node = node; }
    async getFile(){ const node = this.node, bytes = node.bytes;
      return { lastModified: node.mtime, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }; }
    async createWritable(){ const node = this.node; let buf = [];
      return { write: async s => { buf.push(typeof s === 'string' ? enc.encode(s) : s); },
               close: async () => { const n = buf.reduce((a, b) => a + b.length, 0); const out = new Uint8Array(n); let o = 0; for (const b of buf) { out.set(b, o); o += b.length; } node.bytes = out; node.mtime = Date.now() + 1; } }; }
  }
  const root = new Dir('mytask');
  window.__root = root;
  window.__text = name => { const c = root.children.get(name); return c ? new TextDecoder('utf-8', { ignoreBOM: true }).decode(c.bytes) : null; };
  window.__put = (name, text) => { const c = root.children.get(name) || new FileNode(); c.bytes = enc.encode(text); c.mtime = Date.now(); root.children.set(name, c); };
  window.__list = d => [...(d || root).children.keys()];
  window.showDirectoryPicker = async () => root;
};

const PASTED = `id;datum;feladat;statusz;cimke;letrehozva;modositva
tmw95rxd30coo;2026.11.09;Belépés tesztelése;nyitott;felület;2026-11-09T12:09:01;2026-11-09T12:09:01
tmw95sh5a1x9i;2026.11.09;Teszt felhasználók felvitele (3 db);kesz;felület;2026-11-09T12:09:27;2026-11-09T12:11:58
tmw95t1gn2zxa;2026.11.09;Tömeges import utánanézése - kézikönyv, 11-es pont.;nyitott;import;2026-11-09T12:09:53;2026-11-09T12:09:53
tmw95tky03tge;2026.11.09;Évzáró levél kiküldése, a leírás dokumentálása;nyitott;evzaro_level;2026-11-09T12:10:18;2026-11-09T12:10:18
tmw95uf9l46mr;2026.11.09;Havi ütemterv átnézése, Larával egyeztetés;kesz;zárás;2026-11-09T12:10:57;2026-11-09T12:31:53
tmw95uoua5yta;2026.11.09;Havi ütemterv és kapcsolódó dokumentumok átnézése;nyitott;zárás;2026-11-09T12:11:10;2026-11-09T12:11:10
tmw95vg6q6y5g;2026.11.09;Riportgenerátor tesztelése - szerdán: előkészület, naptárfoglalás, Ádámmal egyeztetés.;nyitott;riport;2026-11-09T12:11:45;2026-11-09T12:11:45
tmw95vmnn709k;2026.11.09;Admin felhasználót létre kell hozni magamnak.;nyitott;felület;2026-11-09T12:11:54;2026-11-09T12:11:54
`;

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || ['/usr/bin/google-chrome','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => fs.existsSync(p)), args: ['--no-sandbox'], headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1000 });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('dialog', d => d.accept());
  await page.evaluateOnNewDocument(MOCK);
  // rögzített "ma": a tesztadatok 2026-11-09-re szólnak, az óra innen halad tovább
  const OFFSET = new Date('2026-11-09T13:44:00').getTime() - Date.now();
  await page.evaluateOnNewDocument(off => { const R = Date; class D extends R { constructor(...a){ if (a.length) super(...a); else super(R.now() + off + (window.__skew || 0)); } static now(){ return R.now() + off + (window.__skew || 0); } } window.Date = D; }, OFFSET);
  await page.goto(HTML);
  await page.evaluate(l => window.__put('feladatnaplo.csv', l), PASTED);

  // 1) csatlakozás + átalakítás
  await page.click('#pill');
  await page.waitForFunction(() => document.querySelector('#pill').className.includes('ok'), { timeout: 4000 });
  let csv = await page.evaluate(() => window.__text('feladatnaplo.csv'));
  assert(csv.startsWith('\uFEFFid;datum;feladat;megbizo;hatarido;statusz;letrehozva;modositva;lezarva;tarolo'), 'új fejléc');
  assert(csv.includes('"Belépés tesztelése #felület";;;nyitott;'), 'cimke → #címke, üres megbízó/határidő');
  assert(csv.includes('tmw95sh5a1x9i;2026-11-09;'), 'dátum ISO-ra, id megmaradt');
  const backups = await page.evaluate(() => window.__list(window.__root.children.get('mentesek')));
  assert(backups.some(n => /_atalakitas-elott\.csv$/.test(n)), 'átalakítás előtti külön mentés: ' + backups);
  const orig = await page.evaluate(n => new TextDecoder().decode(window.__root.children.get('mentesek').children.get(n).bytes), backups.find(n => /atalakitas/.test(n)));
  assert(orig.includes('tmw95rxd30coo;2026.11.09;Belépés tesztelése;nyitott;felület'), 'az eredeti változatlanul megvan');
  assert.strictEqual(await page.$$eval('#list .task', e => e.length), 8);
  assert.strictEqual(await page.$$eval('#list .tag', e => e.length) >= 8, true, '#címkék gombként');
  assert.strictEqual(await page.evaluate(() => window.__text('megbizok.csv')), '\uFEFFnev;megjegyzes;aktiv\r\n', 'üres megbízó-lista fejléccel létrejött');

  // 2) rögzítés megbízóval, határidővel (+2 ó preset), #címkével
  await page.type('#fText', 'Határidős teszt #riport');
  await page.type('#fWho', 'Lara');
  await page.waitForSelector('#ac .ac-i.new');
  assert((await page.$eval('#ac', e => e.textContent)).includes('Új megbízó: „Lara”'), 'ismeretlen név → + Új megbízó');
  await page.keyboard.press('Enter');
  assert.strictEqual(await page.$eval('#fWho', e => e.value), 'Lara');
  await page.click('[data-due="+2h"]');
  await page.click('#addForm .primary');
  await page.waitForFunction(() => document.querySelectorAll('#list .task').length === 9);
  await sleep(600);
  csv = await page.evaluate(() => window.__text('feladatnaplo.csv'));
  assert(/"Határidős teszt #riport";Lara;\d{4}-\d\d-\d\dT\d\d:\d\d;nyitott;\d{4}/.test(csv), 'új sor megbízóval és határidővel');
  assert.strictEqual(await page.$eval('#fWho', e => e.value), '', 'megbízó törlődik, ha nincs "megtart"');
  assert.strictEqual(await page.$$eval('#list .task.st-h2, #list .task.st-h1', e => e.length), 1, '+2 ó határidő kiemelve');

  // 3) megtart pipa + sürgős és lejárt határidők
  const iso = ms => page.evaluate(m => { const d = new Date(Date.now() + m); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }, ms);
  await page.click('#fKeep');
  for (const [txt, ms] of [['Lejárt valami #zárás', -35*60e3], ['Fél óra múlva #felület', 30*60e3], ['Másfél óra múlva', 90*60e3]]) {
    await page.type('#fText', txt);
    await page.$eval('#fDue', (e, v) => { e.value = v; }, await iso(ms));
    await page.type('#fWho', ''); // megtartott megbízó
    await page.click('#addForm .primary');
    await sleep(80);
  }
  assert.strictEqual(await page.$eval('#fWho', e => e.value), '', 'a megtartott érték üres maradt (nem írtunk újat)');
  assert.strictEqual(await page.$$eval('#list .task.st-over', e => e.length), 1);
  assert.strictEqual(await page.$$eval('#list .task.st-h1', e => e.length), 1);
  assert(await page.$$eval('#list .task.st-h2', e => e.length) >= 1);
  const badges = await page.$eval('#alertBadge', e => e.textContent);
  assert(/LEJÁRT 1/.test(badges) && /≤1 Ó/.test(badges) && /≤2 Ó/.test(badges), 'fejléc-jelzők: ' + badges);
  assert(/^\(\d+\)/.test(await page.title()), 'cím mutatja a sürgősek számát');
  assert((await page.$eval('#today .tf-r', e => e.textContent)).includes('lejárt'));

  // 4) szűrés @megbízó és #címke szerint
  await page.$eval('#q', e => { e.value = '@lara'; e.dispatchEvent(new Event('input')); });
  assert.strictEqual(await page.$$eval('#list .task', e => e.length), 1);
  await page.$eval('#q', e => { e.value = '#felulet'; e.dispatchEvent(new Event('input')); });
  assert.strictEqual(await page.$$eval('#list .task', e => e.length), 4, '#felulet ékezet nélkül is: 3 régi + 1 új');
  await page.$eval('#q', e => { e.value = ''; e.dispatchEvent(new Event('input')); });

  // 5) szerkesztés: megbízó + határidő törlése
  await page.click('#pplToggle');
  await page.type('#pplNew', 'Ádám'); await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#pplBody').textContent.includes('Ádám'));
  await page.evaluate(() => [...document.querySelectorAll('#list .task')].find(li => li.textContent.includes('Admin felhasználót')).querySelector('[data-act=edit]').click());   // megbízó nélküli, régi sor
  await page.waitForSelector('#list textarea');
  await page.click('#list [name=megbizo]');
  await page.keyboard.type('ad');
  await page.waitForSelector('#ac .ac-i');
  await page.keyboard.press('Enter');
  assert.strictEqual(await page.$eval('#list [name=megbizo]', e => e.value), 'Ádám', 'gépelt "ad" → Ádám');
  await page.$eval('#list textarea', e => e.focus());
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.querySelector('#list textarea'));
  await sleep(600);
  csv = await page.evaluate(() => window.__text('feladatnaplo.csv'));
  assert(csv.includes(';Ádám;'), 'szerkesztett megbízó mentve');

  // 5b) elgépelés ellen: ismeretlen név blokkolja a rögzítést, a "Lary" a Lara-t ajánlja, Tab elfogadja
  const nBefore = await page.$$eval('#list .task', e => e.length);
  await page.type('#fText', 'Blokkolt teszt'); await page.type('#fWho', 'Zsolt');
  await page.click('#addForm .primary');
  await sleep(200);
  assert((await page.$eval('#toast', e => e.textContent)).includes('nincs a listában'), 'figyelmeztetés ismeretlen megbízóra');
  assert.strictEqual(await page.$$eval('#list .task', e => e.length), nBefore, 'a feladat nem került rögzítésre');
  await page.$eval('#fWho', e => { e.value = ''; }); await page.focus('#fWho'); await page.keyboard.type('Lary');
  await page.waitForSelector('#ac .ac-h');
  assert.strictEqual(await page.$eval('#ac .ac-h', e => e.textContent), 'Erre gondoltál?');
  assert((await page.$eval('#ac .ac-i', e => e.textContent)).startsWith('Lara'), 'első javaslat: Lara');
  await page.screenshot({ path: path.resolve(OUT, 'shot-autocomplete.png') });
  await page.keyboard.press('Tab');
  assert.strictEqual(await page.$eval('#fWho', e => e.value), 'Lara', 'Tab elfogadja a javaslatot');
  await page.click('#addForm .primary');
  await page.waitForFunction(n => document.querySelectorAll('#list .task').length === n + 1, {}, nBefore);
  await page.$eval('#fText', e => e.focus());
  // új név explicit felvétele, majd rögzítés
  assert.strictEqual(await page.$eval('#fWho', e => e.value), 'Lara', '"megtart": a megbízó a rögzítés után is megmaradt');
  await page.click('#fKeep'); await page.$eval('#fWho', e => { e.value = ''; });
  await page.type('#fText', 'Zsolt kérése'); await page.type('#fWho', 'Zsolt');
  await page.keyboard.press('ArrowDown'); // már a "+ Új" az egyetlen elem → marad
  await page.keyboard.press('Enter');
  assert.strictEqual(await page.$eval('#fWho', e => e.value), 'Zsolt');
  await page.click('#addForm .primary');
  await page.waitForFunction(n => document.querySelectorAll('#list .task').length === n + 2, {}, nBefore);
  await sleep(600);
  const ppl = await page.evaluate(() => window.__text('megbizok.csv'));
  assert(/Lara;;igen/.test(ppl) && /Ádám;;igen/.test(ppl) && /Zsolt;;igen/.test(ppl), 'megbizok.csv: ' + ppl);

  // 5c) megbízók panel: statisztika, átnevezés (a feladatok követik), törlés tiltása, inaktiválás
  const rowTxt = key => page.$eval(`#pplBody [data-key="${key}"]`, e => e.textContent.replace(/\s+/g, ' '));
  assert(/Lara/.test(await rowTxt('lara')));
  const laraTotal = await page.$eval('#pplBody [data-key="lara"] b', e => +e.textContent);
  assert(laraTotal >= 2, 'Lara feladatszáma: ' + laraTotal);
  assert.strictEqual(await page.$eval('#pplBody [data-key="lara"] [data-pact="del"]', e => e.disabled), true, 'feladattal rendelkező nem törölhető');
  await page.screenshot({ path: path.resolve(OUT, 'shot-people.png') });
  await page.click('#pplBody [data-key="zsolt"] [data-pact="edit"]');
  await page.$eval('#pplBody input[name=nev]', e => { e.value = 'Csaba'; });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#pplBody').textContent.includes('Csaba'));
  await sleep(600);
  const csvR = await page.evaluate(() => window.__text('feladatnaplo.csv')), pplR = await page.evaluate(() => window.__text('megbizok.csv'));
  assert(csvR.includes(';Csaba;') && !csvR.includes(';Zsolt;'), 'átnevezés a feladatokban is');
  assert(pplR.includes('Csaba;;igen') && !/Zsolt;;/.test(pplR), 'átnevezés a listában');
  await page.click('#pplBody [data-key="adam"] [data-pact="toggle"]');
  await page.focus('#fWho'); await page.keyboard.type('ad');
  await sleep(100);
  assert.strictEqual(await page.$$eval('#ac .ac-i', e => e.length), 0 + 1, 'inaktív már nem kerül javaslatba (csak a "+ Új" marad)');
  await page.$eval('#fWho', e => { e.value = ''; e.blur(); });
  await page.click('#pplBody [data-key="adam"] [data-pact="toggle"]');       // vissza aktívra
  await page.click('#pplPeriod [data-p="w"]');
  assert((await page.$eval('#pplRange', e => e.textContent)).includes('–'), 'heti nézet');
  await page.click('#pplPeriod [data-p="all"]');

  // 6) kész jelölés: lezarva kitöltődik
  await page.click('#list .task:not(.done) .chk');
  await sleep(600);
  csv = await page.evaluate(() => window.__text('feladatnaplo.csv'));
  assert(/kesz;[^;\n]*;[^;\n]*;\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d;\r?\n/.test(csv), 'lezarva időbélyeg (utána üres tarolo)');

  // 6b) rendezés: a kész feladatok a napjukon belül alul, a nyitottak rögzítési idő szerint
  const dayRows = await page.$$eval('#list .day:first-child .task', els => els.map(e => ({ done: e.classList.contains('done'), txt: e.querySelector('.txt').textContent })));
  const firstDone = dayRows.findIndex(r => r.done);
  assert(firstDone > 0 && dayRows.slice(firstDone).every(r => r.done), 'kész sorok a nap alján: ' + JSON.stringify(dayRows.map(r => r.done)));
  const openTxt = dayRows.filter(r => !r.done).map(r => r.txt);
  assert(openTxt.indexOf('Tömeges import utánanézése - kézikönyv, 11-es pont. #import') < openTxt.indexOf('Évzáró levél kiküldése, a leírás dokumentálása #evzaro_level'), 'nyitottak rögzítési idő szerint');

  // 6c) előzmények: tortenet.csv, feladatonkénti idővonal, napi napló
  let hist = await page.evaluate(() => window.__text('tortenet.csv'));
  assert(hist && hist.startsWith('\uFEFFid;feladat;idopont;mezo;regi;uj'), 'tortenet.csv létrejött fejléccel: ' + String(hist).slice(0, 60));
  assert(/;letrehozva;;/.test(hist), 'létrehozás naplózva');
  assert(/;statusz;nyitott;kesz\r?\n/.test(hist), 'lezárás naplózva');
  assert(/;megbizo;Zsolt;Csaba\r?\n/.test(hist), 'megbízó-átnevezés feladatonként naplózva');
  await page.click('#list .task.done [data-act=hist]');
  await page.waitForSelector('#list .hist');
  const tl = await page.$eval('#list .hist', e => e.textContent);
  assert(tl.includes('Lezárva'), 'idővonal: ' + tl);
  assert(await page.$eval('#list .task.done [data-act=hist]', e => e.getAttribute('aria-expanded') === 'true'), 'gomb nyitott állapotú');
  await (await page.$('#list .hist')).screenshot({ path: path.resolve(OUT, 'shot-history.png') });
  await page.click('#list .task.done [data-act=hist]');
  assert.strictEqual(await page.$$eval('#list .hist', e => e.length), 0, 'idővonal bezárva');
  await page.click('#btnJournal');
  await page.waitForSelector('#journal:not([hidden])');
  assert.strictEqual(await page.$eval('#jDay', e => e.value), '2026-11-09', 'napló: a mai nap');
  const jl = await page.$eval('#journalBody', e => e.textContent);
  assert(jl.includes('Lezárva') && jl.includes('Létrehozva'), 'napló tartalma: ' + jl.slice(0, 200));
  await (await page.$('#journal')).screenshot({ path: path.resolve(OUT, 'shot-journal.png') });
  await page.click('#jPrev');
  assert.strictEqual(await page.$eval('#jDay', e => e.value), '2026-11-08', 'előző nap');
  await page.click('#jNext'); await page.click('#jNext');
  assert.strictEqual(await page.$eval('#jDay', e => e.value), '2026-11-10', 'következő nap');
  assert((await page.$eval('#journalBody', e => e.textContent)).includes('nincs rögzített esemény'), 'üres nap');
  await page.click('#jToday');
  assert.strictEqual(await page.$eval('#jDay', e => e.value), '2026-11-09');
  // kívülről érkező előzmény-esemény egyesül (nem írja felül a helyieket)
  await page.evaluate(() => { const t = window.__text('tortenet.csv'); window.__put('tortenet.csv', t + 'ext1;gone1;2026-11-09T07:30:00;torolve;Kívül törölt feladat;\r\n'); window.__root.children.get('tortenet.csv').mtime = Date.now() + 5000; window.dispatchEvent(new Event('focus')); });
  await page.waitForFunction(() => document.querySelector('#journalBody').textContent.includes('Kívül törölt feladat'), { timeout: 3000 });
  assert(await page.$eval('#journalBody li.gone', e => e.textContent.includes('Törölve')), 'törölt feladat jelölve');

  // 7) dashboard: panelek, lapozás, elrejtés
  assert.strictEqual(await page.$$eval('#dash .panel', e => e.length), 2);
  assert((await page.$eval('#today .ring-svg', e => e.textContent)).includes('/'));
  assert.strictEqual(await page.$$eval('#today .num', e => e.length), 6, 'hat napi szám (az utolsó a mért idő)');
  assert(await page.evaluate(() => document.querySelector('#overview').compareDocumentPosition(document.querySelector('#list')) & Node.DOCUMENT_POSITION_PRECEDING), 'áttekintés a lista alatt');
  assert(await page.evaluate(() => document.querySelector('#today').compareDocumentPosition(document.querySelector('#list')) & Node.DOCUMENT_POSITION_FOLLOWING), 'napi sáv a lista felett');
  const wk = await page.$eval('#dash .panel:nth-child(1) .rng', e => e.textContent);
  await page.click('[data-nav="w"][data-d="-1"]');
  assert.notStrictEqual(await page.$eval('#dash .panel:nth-child(1) .rng', e => e.textContent), wk, 'előző hét');
  await page.click('[data-nav="w"][data-d="0"]');
  assert.strictEqual(await page.$eval('#dash .panel:nth-child(1) .rng', e => e.textContent), wk);
  assert((await page.$eval('#dash .panel:nth-child(2)', e => e.innerHTML)).includes('<svg'), 'havi hőtérkép');
  await page.click('#dash [data-search]');
  assert((await page.$eval('#q', e => e.value)).length > 1, 'top-lista kattintásra szűr');
  await page.$eval('#q', e => { e.value = ''; e.dispatchEvent(new Event('input')); });

  // 7b) Tároló: nem ütemezett feladatok
  const numsBefore = await page.$$eval('#today .num b', e => e.map(x => x.textContent));
  const wkTotal = await page.$eval('#dash .panel:nth-child(1) .kv', e => e.textContent);
  const nList = await page.$$eval('#list .task', e => e.length);
  assert.strictEqual(await page.$$eval('#parkBody .pkrow', e => e.length), 0, 'a tároló üres');
  assert((await page.$eval('#parkBody', e => e.textContent)).includes('A Tároló üres'));
  await page.click('#fPark');
  assert(await page.$eval('#fDue', e => e.disabled) && await page.$eval('#fDate', e => e.disabled), 'tárolónál dátum/határidő letiltva');
  assert.strictEqual(await page.$eval('#addForm .primary', e => e.textContent), 'Tárolóba');
  assert(await page.$eval('#addForm', e => e.classList.contains('parking')));
  await page.type('#fText', 'Táblakapcsolatok felderítése #db');
  await page.$eval('#fWho', e => { e.value = ''; }); await page.type('#fWho', 'Ádám'); await page.keyboard.press('Escape');
  await page.click('#addForm .primary');
  await page.waitForFunction(() => document.querySelectorAll('#parkBody .pkrow').length === 1);
  assert.strictEqual(await page.$$eval('#list .task', e => e.length), nList, 'a tárolt nincs a napi listában');
  assert.deepStrictEqual(await page.$$eval('#today .num b', e => e.map(x => x.textContent)), numsBefore, 'napi számok változatlanok');
  assert.strictEqual(await page.$eval('#dash .panel:nth-child(1) .kv', e => e.textContent), wkTotal, 'heti statisztika változatlan');
  assert.strictEqual(await page.$eval('#fPark', e => e.checked), false, 'jelölő visszaáll');
  assert(await page.$eval('#fDue', e => !e.disabled) && await page.$eval('#addForm .primary', e => e.textContent === 'Rögzít'));
  assert.strictEqual(await page.$eval('#btnPark', e => e.textContent), 'Tároló (1)');
  assert((await page.$eval('#today .tf-rh', e => e.textContent)).includes('Tároló (1)'), 'napi sávban is látszik');
  await sleep(600);
  csv = await page.evaluate(() => window.__text('feladatnaplo.csv'));
  assert(/"Táblakapcsolatok felderítése #db";Ádám;;nyitott;[^;]*;[^;]*;;igen\r\n/.test(csv), 'tarolo=igen, nincs határidő: ' + csv.split('\r\n').find(l => l.includes('Táblakapcsolatok')));
  // keresés a tárolóban is szűr
  await page.type('#q', 'zzzz'); assert((await page.$eval('#parkBody', e => e.textContent)).includes('Nincs találat'));
  await page.$eval('#q', e => { e.value = ''; e.dispatchEvent(new Event('input')); });
  await page.type('#q', '#db'); assert.strictEqual(await page.$$eval('#parkBody .pkrow', e => e.length), 1);
  await page.$eval('#q', e => { e.value = ''; e.dispatchEvent(new Event('input')); });
  // szerkesztés: nincs dátum/határidő mező
  await page.click('#parkBody [data-act="edit"]');
  assert.strictEqual(await page.$('#parkBody form.edit [name=datum]'), null); assert.strictEqual(await page.$('#parkBody form.edit [name=hatarido]'), null);
  assert((await page.$eval('#parkBody form.edit', e => e.textContent)).includes('Törlés'));
  await page.click('#parkBody [data-act="cancel"]');
  // összecsukás
  await page.click('#parkToggle'); assert.strictEqual(await page.$eval('#parkBody', e => e.hidden), true);
  await page.click('#parkToggle'); assert.strictEqual(await page.$eval('#parkBody', e => e.hidden), false);
  // áthelyezés mára → rendes feladat lesz, statisztikába kerül
  await page.click('#parkBody [data-act="pkmove"][data-to="today"]');
  await page.waitForFunction(() => document.querySelectorAll('#parkBody .pkrow').length === 0);
  assert.strictEqual(await page.$$eval('#list .task', e => e.length), nList + 1, 'a napi listában van');
  const numsAfter = await page.$$eval('#today .num b', e => e.map(x => x.textContent));
  assert.strictEqual(+numsAfter[1], +numsBefore[1] + 1, 'nyitott ma +1');
  await sleep(600);
  csv = await page.evaluate(() => window.__text('feladatnaplo.csv'));
  assert(/"Táblakapcsolatok felderítése #db";Ádám;;nyitott;[^;]*;[^;]*;;\r\n/.test(csv), 'tarolo üres lett');
  // visszavonás
  await page.click('#toast button'); await page.waitForFunction(() => document.querySelectorAll('#parkBody .pkrow').length === 1);
  assert.strictEqual(await page.$$eval('#list .task', e => e.length), nList);
  // áthelyezés kiválasztott napra (érvénytelen dátum nem megy át)
  await page.click('#parkBody [data-act="pkgo"]'); assert.strictEqual(await page.$$eval('#parkBody .pkrow', e => e.length), 1, 'üres dátum: marad');
  await page.$eval('#parkBody .pk-date', e => { e.value = '2026-11-15'; });
  await page.click('#parkBody [data-act="pkgo"]');
  await page.waitForFunction(() => document.querySelectorAll('#parkBody .pkrow').length === 0);
  assert((await page.$$eval('#list .day h2', e => e.map(x => x.textContent))).some(t => /november 15/.test(t)), 'a kiválasztott nap alatt');
  // vissza a tárolóba a szerkesztőből
  const myId = await page.evaluate(() => [...document.querySelectorAll('#list .task')].find(li => li.textContent.includes('Táblakapcsolatok')).dataset.id);
  await page.evaluate(id => document.querySelector(`#list [data-id="${id}"] [data-act="edit"]`).click(), myId);
  await page.click('#list .task.editing [data-act="topark"]');
  await page.waitForFunction(() => document.querySelectorAll('#parkBody .pkrow').length === 1);
  assert.strictEqual(await page.$$eval('#list .task', e => e.length), nList);
  assert.deepStrictEqual(await page.$$eval('#today .num b', e => e.map(x => x.textContent)), numsBefore, 'visszatárolás után a számok az eredetiek');
  await sleep(600);
  const h2 = await page.evaluate(() => window.__text('tortenet.csv'));
  assert(/;tarolo;;igen\r?\n/.test(h2) && /;tarolo;igen;\r?\n/.test(h2), 'tárolóba tétel / kivétel naplózva');
  assert(/;datum;[\d-]+;[\d-]+\r?\n/.test(h2), 'Tárolóból áthelyezéskor a nap is naplózva');

  await page.screenshot({ path: path.resolve(OUT, 'shot-desktop.png') });
  await page.screenshot({ path: path.resolve(OUT, 'shot-desktop-full.png'), fullPage: true });

  // 8) nyomtatás
  await page.emulateMediaType('print');
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  assert((await page.$eval('#printMeta', e => e.textContent)).includes('tétel'));
  assert.strictEqual(await page.$eval('.cmd', e => getComputedStyle(e).display), 'none', 'nyomtatásban nincs űrlap');
  assert.strictEqual(await page.$eval('#dash', e => getComputedStyle(e).display), 'none');
  assert.strictEqual(await page.$eval('#today', e => getComputedStyle(e).display), 'none', 'nyomtatásban nincs napi sáv');
  assert.strictEqual(await page.$eval('#park', e => getComputedStyle(e).display), 'none', 'nyomtatásban nincs tároló');
  assert.strictEqual(await page.$eval('#overview', e => getComputedStyle(e).display), 'none');
  await page.screenshot({ path: path.resolve(OUT, 'shot-print.png'), fullPage: true });
  await page.pdf({ path: path.resolve(OUT, 'print.pdf'), format: 'A4' });
  await page.emulateMediaType('screen');

  // 9) telefonos nézet
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await sleep(200);
  await page.screenshot({ path: path.resolve(OUT, 'shot-mobile.png'), fullPage: false });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'telefonon nincs vízszintes görgetés: ' + await page.evaluate(() => document.documentElement.scrollWidth));
  assert(await page.$eval('#addForm', e => e.scrollWidth <= e.clientWidth + 1), 'az űrlap telefonon nem lóg ki');
  assert(await page.$eval('#today', e => e.scrollWidth <= e.clientWidth + 1), 'a napi sáv telefonon nem lóg ki');

  // 10) külső (v1) módosítás futás közben → átalakítja, mentést készít
  await page.setViewport({ width: 1280, height: 1000 });
  await sleep(400);
  const nBackupsBefore = (await page.evaluate(() => window.__list(window.__root.children.get('mentesek')))).length;
  await page.evaluate(() => { window.__put('feladatnaplo.csv', 'id;datum;feladat;statusz;cimke\nz1;2026.11.09;Kívülről érkezett;nyitott;excel\n'); window.__root.children.get('feladatnaplo.csv').mtime = Date.now() + 9000; window.dispatchEvent(new Event('focus')); });
  await page.waitForFunction(() => document.body.innerText.includes('Kívülről érkezett'), { timeout: 3000 });
  await sleep(700);
  csv = await page.evaluate(() => window.__text('feladatnaplo.csv'));
  assert(csv.includes('Kívülről érkezett #excel'), 'külső v1 sor átalakítva és kiírva');
  assert((await page.evaluate(() => window.__list(window.__root.children.get('mentesek')))).length > nBackupsBefore, 'külső v1 módosítás előtt is készült mentés');
  hist = await page.evaluate(() => window.__text('tortenet.csv'));
  assert(!/;torolve;[^;]*Admin/.test(hist) && (hist.match(/;torolve;/g) || []).length === 1, 'a külső csere nem naplózódik törlésként (csak a kívülről jött 1 esemény van)');
  assert(hist.includes('ext1;gone1;'), 'a külső esemény megmaradt a fájlban');

  // 11) napok összecsukása: alapból a mai nap és a megoldatlan feladatot tartalmazó napok nyitottak
  await page.$eval('#fDate', e => { e.value = '2026-11-06'; e.dispatchEvent(new Event('change')); });
  await page.type('#fText', 'Múltbeli feladat'); await page.click('#addForm .primary');
  await page.waitForFunction(() => document.body.innerText.includes('Múltbeli feladat'));
  const dayCls = d => page.$eval(`.day:has(.dtoggle[data-day="${d}"])`, e => e.className);
  assert(!/collapsed/.test(await dayCls('2026-11-06')), 'a megoldatlan feladatot tartalmazó nap alapból nyitva van');
  await page.click('.dtoggle[data-day="2026-11-06"]');
  assert(/collapsed/.test(await dayCls('2026-11-06')), 'fejlécre kattintva összecsukódik');
  assert.strictEqual(await page.$eval('.day.collapsed ul', e => getComputedStyle(e).display), 'none');
  assert((await page.$eval('.day.collapsed h2 small', e => e.textContent)).includes('1 nyitott'), 'összecsukva is látszik a nyitottak száma');
  assert(!/collapsed/.test(await dayCls('2026-11-09')), 'a mai nap nyitva marad');
  await page.type('#q', 'Múltbeli'); assert(!/collapsed/.test(await dayCls('2026-11-06')), 'keresés kinyitja a találatot');
  await page.$eval('#q', e => { e.value = ''; e.dispatchEvent(new Event('input')); });
  assert(/collapsed/.test(await dayCls('2026-11-06')), 'keresés törlése után a kézzel zárt nap újra zárt');
  await page.click('#daysAll'); assert.strictEqual(await page.$$eval('.day.collapsed', e => e.length), 0, 'mind kinyit');
  await page.click('#daysToday'); assert(!/collapsed/.test(await dayCls('2026-11-06')) && !/collapsed/.test(await dayCls('2026-11-09')), 'alapnézet: a nyitott feladatos nap nyitva marad');
  // az utolsó megoldatlan feladat kipipálásakor a nap nem csukódik be a kéz alatt; alapnézetben viszont a csupa kész nap zárt
  const tickOld = () => page.evaluate(() => [...document.querySelectorAll('#list .task')].find(li => li.textContent.includes('Múltbeli feladat')).querySelector('.chk').click());
  await tickOld(); await sleep(300);
  assert(!/collapsed/.test(await dayCls('2026-11-06')), 'kipipáláskor a nap nyitva marad');
  await page.click('#daysToday');
  assert(/collapsed/.test(await dayCls('2026-11-06')) && !/collapsed/.test(await dayCls('2026-11-09')), 'alapnézet: a csupa kész nap zárt, a mai nyitott');
  await page.click('#daysAll'); await tickOld(); await sleep(300);                         // újra megoldatlan (a későbbi lépések az eredeti állapotot várják)
  await page.click('#daysToday');
  assert(!/collapsed/.test(await dayCls('2026-11-06')), 'újranyitás után a nap megint nyitva');
  await page.click('.dtoggle[data-day="2026-11-06"]');                                       // a nyomtatási próba zárt napot kíván
  await page.emulateMediaType('print');
  assert.strictEqual(await page.$eval('.day.collapsed ul', e => getComputedStyle(e).display), 'block', 'nyomtatásban minden nap látszik');
  await page.emulateMediaType('screen');
  await sleep(700);
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('#list .day').length > 1, { timeout: 4000 });
  assert(!/collapsed/.test(await dayCls('2026-11-06')) && !/collapsed/.test(await dayCls('2026-11-09')), 'újratöltés után is nyitva: a megoldatlan feladatos nap és a mai');

  // 12) hosszú határidős szöveg sortörése, visszavonás, billentyűk (újratöltés után, a böngésző helyi tárából)
  await page.setViewport({ width: 1280, height: 1000 });
  await page.type('#fText', 'Extra DB jogok igénylése minden sémához, amelyet a havi folyamat és a riportok futtatásához használunk, egyeztetés a DBA-val és a pénzügyi csapattal');
  await page.$eval('#fDue', (e, v) => { e.value = v; }, await iso(45*60e3));
  await page.click('#addForm .primary');
  await page.waitForFunction(() => document.querySelectorAll('#today .al').length >= 1);
  assert(await page.$eval('#today .tf-r', e => e.scrollWidth <= e.clientWidth + 1), 'hosszú határidős szöveg nem lóg ki a napi sávból');
  assert.strictEqual(await page.$eval('#today .al .at', e => getComputedStyle(e).whiteSpace), 'normal', 'a határidő-sor többsoros');
  // törlés + visszavonás
  const nTasks = await page.$$eval('#list .task', e => e.length);
  const delId = await page.evaluate(() => [...document.querySelectorAll('#list .task')].find(li => li.textContent.includes('Extra DB jogok')).dataset.id);
  await page.evaluate(id => document.querySelector(`#list [data-id="${id}"] [data-act="edit"]`).click(), delId);
  await page.click('#list .task.editing [data-act="del"]');
  await page.waitForFunction(n => document.querySelectorAll('#list .task').length === n - 1, {}, nTasks);
  await page.click('#toast button');
  await page.waitForFunction(n => document.querySelectorAll('#list .task').length === n, {}, nTasks);
  // billentyűk: n = új feladat, / = keresés, Esc = szűrők törlése
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('n'); assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'fText', 'n → új feladat mező');
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('/'); assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'q', '/ → kereső');
  await page.keyboard.type('Extra'); assert.strictEqual(await page.$$eval('#list .task', e => e.length), 1);
  await page.keyboard.press('Escape'); assert.strictEqual(await page.$eval('#q', e => e.value), '', 'Esc törli a keresést');
  assert.strictEqual(await page.$$eval('#list .task', e => e.length), nTasks);

  // 13) Live Desk: munka indítása, váltás, szünet, folytatás, befejezés (a végén, hogy a korábbi lépések számait ne érintse)
  // az újratöltés óta a mappa nincs csatlakoztatva: a helyi adatokat megőrizve (offline jelző) csatlakozunk újra
  await page.evaluate(() => localStorage.setItem('feladatnaplo.v1.offline', '1'));
  await page.click('#btnFolder');
  await page.waitForFunction(() => document.querySelector('#pill').className.includes('ok'), { timeout: 4000 });
  await sleep(500);
  assert((await page.evaluate(() => window.__text('munkamenetek.csv'))).startsWith('\uFEFFid;feladat_id;kezdet;veg;idotartam_mp;ok'), 'a munkamenetek.csv létrejött fejléccel');
  const sessCsv = () => page.evaluate(() => window.__text('munkamenetek.csv'));
  for (const [txt, due] of [['LD teszt A', 3*3600e3], ['LD teszt B', 0]]) {
    await page.type('#fText', txt);
    if (due) await page.$eval('#fDue', (e, v) => { e.value = v; }, await iso(due));
    await page.click('#addForm .primary'); await sleep(150);
  }
  assert.strictEqual(await page.$eval('#today .ld', e => e.classList.contains('off')), true, 'nincs aktív feladat: egyértelmű jelzés');
  assert((await page.$eval('#today .ld', e => e.textContent)).includes('Nincs aktív feladat'));
  const idOf = txt => page.evaluate(t => [...document.querySelectorAll('#list .task')].find(li => li.textContent.includes(t)).dataset.id, txt);
  const idA = await idOf('LD teszt A'), idB = await idOf('LD teszt B');
  await page.evaluate(id => document.querySelector(`#list [data-id="${id}"] [data-act="start"]`).click(), idA);
  await page.waitForSelector('#today .ld.on');
  assert((await page.$eval('#today .ld', e => e.textContent)).includes('LD teszt A'), 'az aktív feladat a Live Desken');
  assert.strictEqual(await page.$$eval('#list .task.working', e => e.length), 1, 'az aktív sor kiemelve');
  assert.strictEqual(await page.$eval(`#list [data-id="${idA}"] .go-b`, e => e.dataset.act), 'pause', 'az aktív soron szünet gomb');
  assert.strictEqual(await page.$eval(`#list [data-id="${idA}"] .dl, #list [data-id="${idA}"] .chip.dl`, e => !!e), true, 'a határidő a helyén marad');
  await page.waitForFunction(() => document.querySelector('#ldSess').textContent !== '00:00:00', { timeout: 4000 });   // a számláló halad (a kezdetből számolva)
  await sleep(500);
  let sc = await sessCsv();
  assert(new RegExp(idA + ';\\d{4}-\\d\\d-\\d\\dT[\\d:]+;;;\\r?\\n').test(sc), 'a futó munkamenet tartósan mentve (üres veg): ' + sc);
  const ctr = sel => page.$eval(sel, e => { const r = e.getBoundingClientRect(); return r.top + r.height / 2; });
  const cs = [await ctr('#today .ld .chip.dl'), await ctr('#today .ld-sum'), await ctr('#ldSess'), await ctr('#today .ld-name')];
  assert(Math.max(...cs) - Math.min(...cs) < 3, 'az élő sáv elemei függőlegesen egy vonalban vannak: ' + cs.map(x => x.toFixed(1)));
  await (await page.$('#today')).screenshot({ path: path.resolve(OUT, 'shot-livedesk.png') });
  // váltás: megerősítés nélkül, a régi lezárul (valtas), az új indul
  await page.evaluate(id => document.querySelector(`#list [data-id="${id}"] [data-act="start"]`).click(), idB);
  await page.waitForFunction(id => document.querySelector(`#list [data-id="${id}"]`).classList.contains('working'), {}, idB);
  assert.strictEqual(await page.$$eval('#list .task.working', e => e.length), 1, 'egyszerre egy aktív');
  assert((await page.$eval('#toast', e => e.textContent)).includes('Váltás'), 'váltás visszajelzése');
  await sleep(600);
  sc = await sessCsv();
  assert(new RegExp(idA + ';[^;]+;[^;]+;\\d+;valtas').test(sc), 'a régi munkamenet valtas okkal lezárva: ' + sc);
  assert.strictEqual((sc.match(/;;;\r?\n/g) || []).length, 1, 'pontosan egy nyitott sor');
  // szünet a Live Deskről: a feladat nyitott marad
  await page.click('#today [data-live="pause"]');
  await page.waitForSelector('#today .ld.off');
  assert.strictEqual(await page.$eval(`#list [data-id="${idB}"]`, e => e.classList.contains('done')), false, 'szünet után a feladat nyitott');
  assert((await page.$eval('#toast', e => e.textContent)).includes('Szüneteltetve'));
  await sleep(600);
  assert(new RegExp(idB + ';[^;]+;[^;]+;\\d+;szunet').test(await sessCsv()), 'szunet ok');
  // folytatás: ugyanazon a feladaton új munkamenet
  await page.click('#today .ld-go');
  await page.waitForSelector('#today .ld.on');
  assert.strictEqual(await page.$eval(`#list [data-id="${idB}"]`, e => e.classList.contains('working')), true);
  // befejezés a Live Deskről: kész, lezarva, a munkamenet ok=kesz, a korábbiak megmaradnak
  await page.click('#today [data-live="finish"]');
  await page.waitForSelector('#today .ld.off');
  assert.strictEqual(await page.$eval(`#list [data-id="${idB}"]`, e => e.classList.contains('done')), true, 'a feladat kész');
  await sleep(700);
  sc = await sessCsv();
  assert(new RegExp(idB + ';[^;]+;[^;]+;\\d+;kesz').test(sc) && (sc.match(new RegExp(idB + ';', 'g')) || []).length === 2, 'két munkamenet ugyanahhoz a feladathoz, az utolsó kesz: ' + sc);
  assert(new RegExp(idB + ';[^\\n]*?;\\d{4}-\\d\\d-\\d\\dT[\\d:]+;\\d{4}-\\d\\d-\\d\\dT[\\d:]+;[^\\n]*;nyitott').test(await page.evaluate(() => window.__text('feladatnaplo.csv'))) === false, 'a feladat már nem nyitott a CSV-ben');
  // a hagyományos listában kész-re jelölt aktív feladat: az időmérés szabályosan leáll
  await page.evaluate(id => document.querySelector(`#list [data-id="${id}"] [data-act="start"]`).click(), idA);
  await page.waitForSelector('#today .ld.on');
  await page.evaluate(id => document.querySelector(`#list [data-id="${id}"] .chk`).click(), idA);
  await page.waitForSelector('#today .ld.off');
  await sleep(700);
  sc = await sessCsv();
  assert((sc.match(new RegExp(idA + ';[^;]+;[^;]+;\\d+;kesz', 'g')) || []).length === 1, 'listabeli pipa lezárta az aktív munkamenetet: ' + sc);
  assert.strictEqual((sc.match(/;;;\r?\n/g) || []).length, 0, 'nincs nyitva maradt munkamenet');
  // újranyitás: a korábbi munkamenetek megmaradnak
  const before = (await sessCsv()).split('\n').length;
  await page.evaluate(id => document.querySelector(`#list [data-id="${id}"] .chk`).click(), idA);
  await sleep(500);
  assert.strictEqual((await sessCsv()).split('\n').length, before, 'újranyitás nem töröl munkamenetet');
  // oldalfrissítés: a futó munkamenet helyreáll (helyi tükörből)
  await page.evaluate(id => document.querySelector(`#list [data-id="${id}"] [data-act="start"]`).click(), idA);
  await page.waitForSelector('#today .ld.on');
  await sleep(300);
  await page.reload();
  await page.waitForSelector('#today .ld.on', { timeout: 4000 });
  assert((await page.$eval('#today .ld', e => e.textContent)).includes('LD teszt A'), 'frissítés után is az aktív feladat látszik');
  assert.strictEqual(await page.$$eval('#list .task.working', e => e.length), 1);

  // 14) Alvás és óraváltozás: a mért idő nem nő hamisan, a felhasználó dönt (a vezérelt órával: window.__skew)
  const lsSess = () => page.evaluate(() => localStorage.getItem('feladatnaplo.v1.sessions') || '');
  const jump = ms => page.evaluate(d => { window.__skew = (window.__skew || 0) + d; }, ms);
  await jump(40 * 60e3);                                                         // 40 perc „alvás"
  await page.waitForSelector('#today .ld-gap', { timeout: 4000 });
  assert((await page.$eval('#today .ld-gap', e => e.textContent)).includes('Nem érkezett jel'), 'alvás után ellenőrző kérdés');
  assert(/^00:0\d:/.test(await page.$eval('#ldSess', e => e.textContent)), 'a kihagyott 40 perc nem számít bele: ' + await page.$eval('#ldSess', e => e.textContent));
  await sleep(1300);
  assert(/^00:0\d:/.test(await page.$eval('#ldSess', e => e.textContent)), 'a kérdés alatt a számláló áll (nem szalad tovább)');
  assert.strictEqual(await page.$$eval('#today .ld-gap', e => e.length), 1, 'egyetlen ellenőrző panel');
  await (await page.$('#today')).screenshot({ path: path.resolve(OUT, 'shot-livedesk-gap.png') });
  await page.click('#today [data-live="gap-resume"]');                           // „Szünet volt – folytatom most"
  await page.waitForFunction(() => !document.querySelector('#today .ld-gap'));
  let ls = await lsSess();
  assert(/;szunet/.test(ls), 'a kihagyás előtti rész szunet okkal lezárva: ' + ls);
  assert.strictEqual((ls.match(/;;;\r?\n/g) || []).length, 1, 'a folytatás új nyitott munkamenet');
  assert(/^00:00:/.test(await page.$eval('#ldSess', e => e.textContent)), 'az új munkamenet nulláról indul');
  await sleep(1200);
  await jump(30 * 60e3);                                                         // újabb 30 perc: ezúttal végig dolgozott
  await page.waitForSelector('#today .ld-gap', { timeout: 4000 });
  await page.click('#today [data-live="gap-keep"]');
  await page.waitForFunction(() => !document.querySelector('#today .ld-gap'));
  await sleep(1200);
  assert(/^00:(29|3\d):/.test(await page.$eval('#ldSess', e => e.textContent)), '„Végig dolgoztam": az idő megmarad: ' + await page.$eval('#ldSess', e => e.textContent));
  await jump(90 * 60e3);                                                         // 90 perc: leállítás a kihagyás elején
  await page.waitForSelector('#today .ld-gap', { timeout: 4000 });
  await page.click('#today [data-live="gap-stop"]');                             // az alapérték az utolsó ismert pillanat
  await page.waitForSelector('#today .ld.off');
  ls = await lsSess();
  const rows = ls.trim().split(/\r?\n/).slice(1).map(r => r.split(';')), last = rows.filter(r => r[1] === idA && r[3]).pop();
  assert(last && last[5] === 'szunet' && Number(last[4]) > 29 * 60 && Number(last[4]) < 32 * 60, 'leállítás az ismert pillanatnál (~30 perc, nem 2 óra): ' + JSON.stringify(last));
  assert.strictEqual((ls.match(/;;;\r?\n/g) || []).length, 0, 'nincs nyitott munkamenet');
  // az óra visszaugrik: „clock" kérdés, nincs „Végig dolgoztam"
  await page.evaluate(id => document.querySelector(`#list [data-id="${id}"] [data-act="start"]`).click(), idA);
  await page.waitForSelector('#today .ld.on');
  await sleep(1200);
  await jump(-3 * 3600e3);
  await page.waitForSelector('#today .ld-gap', { timeout: 4000 });
  assert((await page.$eval('#today .ld-gap', e => e.textContent)).includes('Az óra megváltozott'), 'óraváltozás kérdés');
  assert.strictEqual(await page.$('#today [data-live="gap-keep"]'), null, 'óraugrásnál nincs „Végig dolgoztam"');
  await page.click('#today [data-live="gap-resume"]');
  await page.waitForFunction(() => !document.querySelector('#today .ld-gap'));
  assert.strictEqual(await page.$$eval('#today .ld.on', e => e.length), 1, 'a munka az óraugrás után is egy aktív munkamenet');
  assert((await lsSess()).split(/\r?\n/).every(r => !/;-\d/.test(r)), 'nincs negatív időtartam');
  // az újratöltés a vezérelt óra eltolását is nullázza: előbb rendezzük (ez maga is egy óraugrás)
  await page.evaluate(() => { window.__skew = 0; });
  await page.waitForSelector('#today .ld-gap', { timeout: 4000 });
  await page.click('#today [data-live="gap-resume"]');
  await page.waitForFunction(() => !document.querySelector('#today .ld-gap'));
  // frissítés: rövid kihagyás nem kérdez, a hosszú igen
  await sleep(1200);
  await page.reload();
  await page.waitForSelector('#today .ld.on', { timeout: 4000 });
  assert.strictEqual(await page.$('#today .ld-gap'), null, 'rövid kihagyás (frissítés) nem kérdez');
  await jump(60 * 60e3);
  await page.waitForSelector('#today .ld-gap', { timeout: 4000 });
  await page.click('#today [data-live="finish"]');                               // a kérdés mellett is lehet befejezni: csak az ismert idő számít
  await page.waitForSelector('#today .ld.off');
  assert.strictEqual(await page.$('#today .ld-gap'), null, 'befejezés után nincs ellenőrző panel');
  ls = await lsSess();
  const k = ls.trim().split(/\r?\n/).slice(1).map(r => r.split(';')).filter(r => r[5] === 'kesz').pop();
  assert(k && Number(k[4]) < 60, 'befejezés a kérdés mellett: a kihagyott óra nem számít: ' + JSON.stringify(k));

  // 15) Statisztika: mért idő a heti/havi panelen, az „átfutási idő" külön megnevezve
  const dash = await page.evaluate(() => ({ cap: [...document.querySelectorAll('#dash .kpi .cap')].map(e => e.textContent), val: [...document.querySelectorAll('#dash .kpi')].map(e => e.querySelector('.kv').textContent),
                                            wt: document.querySelectorAll('#dash .chart text.wt').length, lists: [...document.querySelectorAll('#dash .tops .cap')].map(e => e.textContent) }));
  assert(dash.cap.includes('átfutási idő') && !dash.cap.includes('átfutás'), 'az átfutási idő pontosan van elnevezve: ' + dash.cap);
  assert(dash.cap.filter(c => c === 'mért idő').length === 2 && dash.cap.filter(c => c === 'átl. ráfordítás').length === 2, 'hét és hónap: mért idő és ráfordítás');
  assert(dash.val[dash.cap.indexOf('mért idő')] !== '0 p', 'a mért idő megjelenik a héten: ' + dash.val);
  assert(dash.wt >= 1, 'a heti diagram a napi mért időt mutatja');
  assert(dash.lists.includes('Mért idő · feladatok') && dash.lists.includes('Mért idő · megbízók'), 'feladatonkénti és megbízónkénti mért idő');
  await (await page.$('#dash')).screenshot({ path: path.resolve(OUT, 'shot-stats.png') });

  // 15b) kész feladaton a ráfordított idő (ha van adat)
  const tm = id => page.evaluate(i => { const e = document.querySelector(`#list [data-id="${i}"] .chip.tm`); return e ? e.textContent : null; }, id);
  assert(/^\d+( ó \d\d)? p$|^\d+ p$|^\d+ ó \d\d p$/.test(await tm(idA) || ''), 'a kész, mért feladaton látszik a ráfordított idő: ' + await tm(idA));
  assert.strictEqual(await tm(idB), null, 'fél percnél rövidebb mért idő nem jelenik meg');
  assert.strictEqual(await page.evaluate(() => document.querySelectorAll('#list .task:not(.done) .chip.tm').length), 0, 'nyitott feladaton nincs ilyen jelzés');
  await (await page.$(`#list [data-id="${idA}"]`)).screenshot({ path: path.resolve(OUT, 'shot-spent.png') });
  for (const [w, name] of [[900, 'shot-stats-900.png'], [390, 'shot-stats-390.png']]) {          // közepes és telefonos szélesség: nincs vízszintes görgetés, a KPI-értékek nem törnek
    await page.setViewport({ width: w, height: 1000 }); await sleep(250);
    assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, `${w}px: nincs vízszintes görgetés`);
    assert.strictEqual(await page.$$eval('#dash .kv', els => els.every(e => e.getBoundingClientRect().height < 30)), true, `${w}px: a mutatók értéke egy sorban marad`);
    await (await page.$('#dash')).screenshot({ path: path.resolve(OUT, name) });
    assert.strictEqual(await page.evaluate(() => { const r = document.querySelector('#tmap').getBoundingClientRect(); return [...document.querySelectorAll('#tmBody svg')].every(s => s.getBoundingClientRect().right <= r.right + 1); }), true, `${w}px: a térkép diagramjai nem lógnak ki`);
    await (await page.$('#tmap')).screenshot({ path: path.resolve(OUT, 'shot-tmap-' + w + '.png') });
  }
  await page.setViewport({ width: 1280, height: 1000 }); await sleep(250);

  // 15c) munkaidő-térkép az Áttekintés alján (a Hét panel hetére, a mért munkamenetekből)
  assert.strictEqual(await page.$eval('#tmap', e => !e.hidden), true, 'a térkép látszik');
  assert.strictEqual(await page.$eval('#tmRange', e => e.textContent), '11.09. – 11.15.', 'a Hét panel hetét mutatja');
  assert.strictEqual(await page.$$eval('#tmBody .tm-tile', e => e.length), 4, 'négy mutató');
  assert(await page.$$eval('#tmBody rect.tm-bar.m', e => e.length) >= 2, 'a munkamenetek sávként látszanak');
  assert.strictEqual(await page.$$eval('#tmBody .tm-card h3', e => e.map(x => x.textContent)).then(a => a.slice(0, 2).join('|')), 'Mikor és mire ment el a munkaidő?|Átfutási idő és tényleges ráfordítás');
  const tmTotal = await page.$eval('#tmBody .tm-tile .v', e => e.textContent), kpiTotal = await page.$$eval('#dash .kpi', ks => { const k = ks.find(x => /mért idő/i.test(x.querySelector('.cap').textContent)); return k ? k.querySelector('.kv').textContent.trim() : null; });
  assert.strictEqual(tmTotal, kpiTotal, `a térkép és a Hét panel ugyanazt a mért időt mutatja: ${tmTotal} / ${kpiTotal}`);
  await page.hover('#tmBody rect.tm-bar.m'); await sleep(150);
  assert.strictEqual(await page.$eval('#tmTip', e => e.classList.contains('on') && /lezárás oka|folyamatban/.test(e.textContent)), true, 'a sáv fölött tooltip jelenik meg');
  await page.mouse.move(2, 2); await sleep(100);
  await page.click('#tmTv'); await sleep(100);
  assert.strictEqual(await page.evaluate(() => [document.querySelectorAll('#tmBody table').length, document.querySelectorAll('#tmBody svg').length]).then(a => a.join()), '3,0', 'táblázat nézet: három táblázat, diagram nélkül');
  await page.click('#tmTv'); await sleep(100);
  assert(await page.$$eval('#tmBody svg', e => e.length) >= 2, 'visszaváltás a diagramra');
  await page.click('#dash [data-nav="w"][data-d="1"]'); await sleep(100);
  assert.strictEqual(await page.$eval('#tmRange', e => e.textContent), '11.16. – 11.22.', 'a hétváltás a térképet is követi');
  assert(/nincs mért munkamenet/.test(await page.$eval('#tmBody', e => e.textContent)), 'üres hét: magyarázó szöveg');
  await page.click('#dash [data-nav="w"][data-d="0"]'); await sleep(100);
  await page.click('#dashToggle'); assert.strictEqual(await page.$eval('#tmap', e => e.hidden), true, 'az áttekintés elrejtésével a térkép is eltűnik');
  await page.click('#dashToggle'); assert.strictEqual(await page.$eval('#tmap', e => !e.hidden), true); assert(await page.$$eval('#tmBody svg', e => e.length) >= 2, 'újra látszik, diagrammal');
  await (await page.$('#tmap')).screenshot({ path: path.resolve(OUT, 'shot-tmap.png') });

  // 16) Sérült munkamenet-fájl és külső írás: a program javít, másolatot készít, és egyesít
  await page.click('#today [data-live="pause"]').catch(() => {});
  await page.reload();
  await page.waitForSelector('#today');
  await page.evaluate(id => window.__put('munkamenetek.csv', ['id;feladat_id;kezdet;veg;idotartam_mp;ok', `ext1;${id};2026-11-09T07:00:00;2026-11-09T07:20:00;1200;szunet`, 'bad1;;;;;', `ext2;${id};2026-11-09T08:00:00;2026-11-09T07:00:00;60;szunet`, 'csak egy oszlop'].join('\r\n') + '\r\n'), idB);
  await page.evaluate(() => localStorage.setItem('feladatnaplo.v1.offline', '1'));
  await page.click('#btnFolder');
  await page.waitForFunction(() => document.querySelector('#pill').className.includes('ok'), { timeout: 4000 });
  await sleep(800);
  const fixedCopy = await page.evaluate(() => window.__list(window.__root.children.get('mentesek')));
  assert(fixedCopy.some(n => /munkamenetek.*javitas-elott/.test(n)), 'a sérült munkamenet-fájlról másolat készült: ' + fixedCopy);
  const fixedTxt = await page.evaluate(() => window.__text('munkamenetek.csv'));
  assert(fixedTxt.includes('ext1') && !fixedTxt.includes('bad1') && !fixedTxt.includes('csak egy oszlop'), 'a javított fájl érvényes sorokat tartalmaz: ' + fixedTxt);
  // külső írás (másik gép / fül): új lezárt munkamenet a fájlban → fókuszkor egyesül
  await page.evaluate(id => { const t = window.__text('munkamenetek.csv'); window.__put('munkamenetek.csv', t.replace(/\r?\n$/, '') + `\r\next3;${id};2026-11-09T06:00:00;2026-11-09T06:30:00;1800;szunet\r\n`); window.__root.children.get('munkamenetek.csv').mtime = Date.now() + 20000; window.dispatchEvent(new Event('focus')); }, idB);
  await sleep(1200);
  assert((await page.evaluate(() => localStorage.getItem('feladatnaplo.v1.sessions'))).includes('ext3'), 'a külső munkamenet átvéve');
  assert((await page.evaluate(() => window.__text('munkamenetek.csv'))).includes('ext3'), 'és megmarad a fájlban');

  const todayStr0 = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; });
  // 17) gyorsgomb: „Ma 16:30" (a munkaidő vége)
  await page.click('#addForm [data-due="today1630"]');
  assert.strictEqual(await page.$eval('#fDue', e => e.value), todayStr0 + 'T16:30', 'a gyorsgomb ma 16:30-ra állítja a határidőt');
  assert.strictEqual(await page.$eval('#addForm [data-due="today1630"]', e => e.textContent.trim()), 'Ma 16:30');

  assert.deepStrictEqual(errors, [], 'nincs JS hiba: ' + errors.join(' | '));
  console.log('UI teszt rendben ✔');
  await browser.close();
})().catch(e => { console.error('HIBA:', e); process.exit(1); });
