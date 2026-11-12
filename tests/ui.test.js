// Headless Chrome + memóriabeli File System Access mock (v2)
const puppeteer = require('puppeteer-core');
const assert = require('assert');
const path = require('path');
const HTML = 'file://' + path.resolve(__dirname, '../feladatnaplo.html');
const OUT = path.resolve(__dirname, 'out'); require('fs').mkdirSync(OUT, { recursive: true });
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
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || ['/usr/bin/google-chrome','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => require('fs').existsSync(p)), args: ['--no-sandbox'], headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1000 });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('dialog', d => d.accept());
  await page.evaluateOnNewDocument(MOCK);
  // rögzített "ma": a tesztadatok 2026-11-09-re szólnak, az óra innen halad tovább
  const OFFSET = new Date('2026-11-09T13:44:00').getTime() - Date.now();
  await page.evaluateOnNewDocument(off => { const R = Date; class D extends R { constructor(...a){ if (a.length) super(...a); else super(R.now() + off); } static now(){ return R.now() + off; } } window.Date = D; }, OFFSET);
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
  await page.evaluate(() => [...document.querySelectorAll('#list .task')].find(li => li.textContent.includes('Admin felhasználót')).querySelector('.icon').click());   // megbízó nélküli, régi sor
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

  // 7) dashboard: panelek, lapozás, elrejtés
  assert.strictEqual(await page.$$eval('#dash .panel', e => e.length), 2);
  assert((await page.$eval('#today .ring-svg', e => e.textContent)).includes('/'));
  assert.strictEqual(await page.$$eval('#today .num', e => e.length), 5, 'öt napi szám');
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

  // 11) napok összecsukása: alapból csak a mai nyitott
  await page.$eval('#fDate', e => { e.value = '2026-11-06'; e.dispatchEvent(new Event('change')); });
  await page.type('#fText', 'Múltbeli feladat'); await page.click('#addForm .primary');
  await page.waitForFunction(() => document.body.innerText.includes('Múltbeli feladat'));
  const dayCls = d => page.$eval(`.day:has(.dtoggle[data-day="${d}"])`, e => e.className);
  assert(!/collapsed/.test(await dayCls('2026-11-06')), 'új sor napja kinyílik (flash)');
  await page.click('.dtoggle[data-day="2026-11-06"]');
  assert(/collapsed/.test(await dayCls('2026-11-06')), 'fejlécre kattintva összecsukódik');
  assert.strictEqual(await page.$eval('.day.collapsed ul', e => getComputedStyle(e).display), 'none');
  assert((await page.$eval('.day.collapsed h2 small', e => e.textContent)).includes('1 nyitott'), 'összecsukva is látszik a nyitottak száma');
  assert(!/collapsed/.test(await dayCls('2026-11-09')), 'a mai nap nyitva marad');
  await page.type('#q', 'Múltbeli'); assert(!/collapsed/.test(await dayCls('2026-11-06')), 'keresés kinyitja a találatot');
  await page.$eval('#q', e => { e.value = ''; e.dispatchEvent(new Event('input')); });
  assert(/collapsed/.test(await dayCls('2026-11-06')), 'keresés törlése után újra zárt');
  await page.click('#daysAll'); assert.strictEqual(await page.$$eval('.day.collapsed', e => e.length), 0, 'mind kinyit');
  await page.click('#daysToday'); assert(/collapsed/.test(await dayCls('2026-11-06')) && !/collapsed/.test(await dayCls('2026-11-09')), 'csak ma');
  await page.emulateMediaType('print');
  assert.strictEqual(await page.$eval('.day.collapsed ul', e => getComputedStyle(e).display), 'block', 'nyomtatásban minden nap látszik');
  await page.emulateMediaType('screen');
  await sleep(700);
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('#list .day').length > 1, { timeout: 4000 });
  assert(/collapsed/.test(await dayCls('2026-11-06')) && !/collapsed/.test(await dayCls('2026-11-09')), 'újratöltés után is: csak a mai nyitott');

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

  assert.deepStrictEqual(errors, [], 'nincs JS hiba: ' + errors.join(' | '));
  console.log('UI teszt rendben ✔');
  await browser.close();
})().catch(e => { console.error('HIBA:', e); process.exit(1); });
