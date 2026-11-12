# Feladatnapló

*A single-file personal task log (Hungarian UI) that runs in the browser and keeps its data in local CSV files. No server, no dependencies.*

Személyes feladatnapló egyetlen HTML fájlban. Edge-ben vagy Chrome-ban fut, telepítés és szerver nélkül, az adatok a saját gépeden, CSV fájlokban vannak. Semmi nem hagyja el a gépet, nincs külső betűtípus, szkript vagy hálózati hívás.

## Kipróbálás

Élő változat (GitHub Pages): <https://budacsika.github.io/feladatnaplo/>

- Mappa kiválasztása nélkül is kipróbálható: ilyenkor az adatok csak ebben a böngészőben maradnak (helyi tár), és nem mennek sehova.
- Ha fájlokba szeretnéd menteni, Edge-ben vagy Chrome-ban válassz egy mappát a jobb felső állapotjelzőn. Az oldal ekkor sem tölt fel semmit: az adatok a saját gépeden lévő CSV-be kerülnek.
- A feladatok pár másodperc alatt felvihetők: írd be a szöveget (a `#címke` a szövegben címkévé válik), állíts határidőt, és nyomj Entert.

## Gyors kezdés

1. Másold a `feladatnaplo.html` fájlt abba a mappába, ahol az adatokat tárolni szeretnéd (pl. `00_MUNKA\mytask`).
2. Nyisd meg Edge-ben vagy Chrome-ban, és az első indításkor a jobb felső állapotjelzőre kattintva válaszd ki ugyanazt a mappát. A böngésző megjegyzi, később egy kattintás elég az újracsatlakozáshoz.
3. A program ebbe a mappába írja a `feladatnaplo.csv`, a `megbizok.csv` és a `tortenet.csv` fájlt. A napi biztonsági másolatok a `mentesek` almappába kerülnek (az utolsó 60-at tartja meg).

Frissítéskor elég a `feladatnaplo.html` fájlt lecserélni, az adatok a CSV-kben maradnak.

> A mappa-hozzáférés a File System Access API-n alapul, ezért Chromium-alapú böngésző kell (Edge, Chrome). Mappa nélkül is működik, ilyenkor az adatok a böngésző helyi tárában vannak, és a mappa kiválasztásakor összefésülődnek a fájlokkal.

## Funkciók

**Felvitel és szerkesztés**
- Gyors felvitel az oldal tetején: szöveg, megbízó, határidő (gyorsgombok: +2 ó, Ma 16:30 – a munkaidő vége, Holnap 9:00), dátum (alapból a mai nap, a rögzítés időpontja a háttérben mentődik)
- `#címke` a szövegben; a leggyakoribb címkék gombként is beszúrhatók
- Szerkesztés, törlés, visszavonás; kész jelölés (a lezárás ideje is mentődik)
- A kész feladatok a nap aljára kerülnek, a nyitottak a rögzítés ideje szerint rendezettek

**Megbízók**
- Külön lista (`megbizok.csv`), elgépelés-védő automatikus kiegészítéssel: ismeretlen név nem rögzíthető véletlenül, a hasonló nevet felajánlja
- Megbízói panel: kitől hány feladat jött, átnevezés (a feladatok követik), inaktiválás

**Határidők**
- Kiemelés: lejárt (piros), ≤1 óra (narancs), ≤2 óra (arany); csak dátum esetén a nap végéig érvényes
- A napi sávban és a böngésző címében is látszik a sürgős feladatok száma

**Napi nézet és statisztika**
- Felül a napi státusz: gyűrű, számok (kész, nyitott, lejárt, régebbi nyitott, ma lezárva) és a közelgő határidők
- Alul a heti és havi áttekintés (mutatók, oszlopdiagram, naptár-hőtérkép, megbízói és címke-toplisták, lapozás), valamint a megbízói statisztika
- A napi szekciók összecsukhatók: alapból a mai nap és minden olyan nap nyitva van, amelyikben van még megoldatlan feladat; a csupa kész napok zártak, fejlécükön látszik a kész/összes arány. Az „alapnézet” gomb visszaállítja ezt, a „mind kinyit” mindent kinyit. Keresés, szűrés és nyomtatás közben minden nap látszik

**Tároló**
- Nem ütemezett feladatoknak (az űrlapon a „tárolóba" jelölővel). Nincs dátumuk és határidejük, nem számítanak bele a statisztikákba
- Egy kattintással (Ma / Holnap / választott nap) átkerülnek a rendes feladatok közé; a szerkesztő nézetből vissza is tehetők
- Keresés a Tárolóban is szűr

**Előzmények és napi napló**
- Minden változás naplózódik: létrehozás, lezárás / újranyitás, határidő-, megbízó-, nap- és szövegmódosítás, tárolóba tétel és kivétel, törlés és visszavonás. A napló a `tortenet.csv`-be kerül, és csak bővül: a sorok sosem módosulnak.
- Feladatonkénti idővonal: a sor végén az óra ikonra kattintva a feladat alatt kinyílik a története (pl. `11.09. 09:12 Létrehozva`, `11.09. 10:35 Határidő: … → …`, `11.09. 14:20 Lezárva`). A Tárolóban lévő tételeknél is működik.
- Napi napló: a „Napló" gombbal megnyíló panel egy nap összes eseményét mutatja időrendben (a törölt feladatokét is), ‹ › gombokkal és dátumválasztóval lapozható.
- A naplózás előtt felvett feladatoknál a létrehozás és a lezárás ideje a feladat saját időbélyegeiből látszik (halványabban). A külső módosítások (pl. Excelből szerkesztett CSV) nem számítanak a program saját változtatásának, ezért nem kerülnek a naplóba.
- Több gép / fájl között azonosító szerinti unióval egyesül, így nem vész el esemény.
- A napló nem kerül a nyomtatásba.

**Live Desk: munkaidő-mérés**
- Egy feladaton egyszerre egy munka futhat. A ▶ gombbal indítod a listában vagy a „Következő feladatok" között; a Mai sáv alatt az aktív feladat, az aktuális munkamenet ideje és a feladatra összesen fordított idő látszik.
- **Szünet** lezárja a munkamenetet, a feladat nyitott marad (a „Folytatás" új munkamenetet indít). **Kész** lezárja a munkamenetet és késszé teszi a feladatot. A lista pipája az aktív feladaton ugyanígy leállítja az időmérést. Újranyitáskor a korábban mért idő megmarad.
- **Váltás**: másik feladat indítása megerősítés nélkül lezárja a futót; a határidők és napok nem változnak. A visszajelzésben (toast) a váltás visszavonható.
- Az idő mindig a kezdő időpontból számolódik, nem számlálóból, ezért háttérfül, oldalfrissítés és újraindítás után is helyes.
- **Alvás és óraváltozás**: ha a program 5 percnél hosszabb ideig nem „élt" (alvó gép, zárolás, bezárt fül), vagy az óra elugrott, a mért idő megáll, és a sáv alatt kérdés jelenik meg: *Végig dolgoztam* / *Szünet volt – folytatom most* / *Leállítás itt: …* (időpont megadható). Amíg a kérdés függőben van, csak az ismert idő számít. Rövid kihagyás (pl. oldalfrissítés) nem kérdez.
- Több fül: ha az egyik fül munkamenetet ír, a többi egyesít; két nyitott munkamenet közül a később indult marad aktív.
- **Statisztika**: a heti és havi panelen mért idő (összes, napi a heti diagramon), feladatonkénti és megbízónkénti toplista, és a kész feladatok átlagos tényleges ráfordítása. Az **átfutási idő** (létrehozástól lezárásig) külön fogalom, nem keveredik a mért munkaidővel. A Tárolóban lévő feladat ideje beleszámít az időösszegekbe, de a feladat-statisztikába nem.
- Nem kötelező: időmérés nélkül a program a korábbiak szerint működik; régi CSV-k változtatás nélkül használhatók.

**Keresés és szűrés**
- Élő, ékezet- és kisbetű-független keresés; `#címke` és `@megbízó` is használható
- Állapot- és időszakszűrő; nyomtatás / PDF az aktuális szűrés szerint

**Biztonságos mentés**
- Atomi írás, minden változtatás után; napi biztonsági másolat
- Külső módosítás (pl. Excelből) felismerése és összefésülése; zárolt fájl esetén 15 másodperces újrapróbálkozás
- Ismeretlen formátumú fájlt a program nem ír felül

## Billentyűk

| Billentyű | Hatás |
|---|---|
| `n` | ugrás az új feladat mezőre |
| `/` | ugrás a keresőre |
| `Esc` a keresőben | szűrők törlése |
| `Esc` szerkesztés közben | szerkesztés megszakítása |
| `Enter` a szerkesztő szövegmezőjében | mentés (`Shift+Enter`: új sor) |

## CSV formátum

- `feladatnaplo.csv`: `id;datum;feladat;megbizo;hatarido;statusz;letrehozva;modositva;lezarva;tarolo`
  - `statusz`: `nyitott` vagy `kesz`; `tarolo`: `igen`, ha a feladat a Tárolóban van (üres egyébként)
  - a `hatarido` dátum vagy dátum+idő (`2026-11-12T16:00`)
- `megbizok.csv`: `nev;megjegyzes;aktiv` (`igen` / `nem`)
- `tortenet.csv`: `id;feladat;idopont;mezo;regi;uj`, egy sor egy esemény (`feladat` = a feladat azonosítója). `mezo`: `letrehozva`, `torolve`, `visszaallitva`, vagy a változott oszlop neve (`statusz`, `hatarido`, `megbizo`, `datum`, `feladat`, `tarolo`); `regi` / `uj` a régi és az új érték. Ne szerkeszd kézzel: a sorok azonosító szerint egyesülnek, az érvénytelen sorokat a program eldobja.
- `munkamenetek.csv`: `id;feladat_id;kezdet;veg;idotartam_mp;ok`, egy sor egy munkamenet. A futó munkamenet sorában a `veg`, az `idotartam_mp` és az `ok` üres. `ok`: `szunet`, `valtas`, `kesz`, `tarolo` (a feladat Tárolóba tétele zárta le), `torles` (a feladat törlése zárta le). Az időtartam a valós eltelt időből készül lezáráskor.
  - A `kezdet` és a `veg` helyi, időzóna nélküli időbélyeg (mint a többi fájlban), ezért az óraállítás (nyári/téli idő) a rögzített időtartamot nem torzítja; éjfélen átnyúló munkamenet a statisztikában kettéosztódik a napok között.
  - Hibás vagy hiányzó sor beolvasáskor javítódik / eldobódik (előtte `…_javitas-elott.csv` másolat készül); ismeretlen fejlécű fájlt a program nem ír felül. Ne szerkeszd kézzel futó munka közben.
- UTF-8 BOM, `;` elválasztó, CRLF sorvég. Excelben szerkeszthető; a beolvasás oszlopsorrend-független, felismeri a `,`/tabulátor elválasztót és az Excel-es dátumformátumokat (`2026.11.09`).
- Régebbi formátumok (fejléc nélküli `datum;feladat`, `cimke` oszlopos) betöltéskor automatikusan átalakulnak, előtte külön `…_atalakitas-elott.csv` másolat készül a `mentesek` mappában.

## Fejlesztés és tesztek

A forrás moduláris (`src/`), a kiadás viszont továbbra is **egyetlen, önállóan megnyitható fájl**: a `feladatnaplo.html` a `src/` tartalmából épül (esbuild), és a repóban is benne van, így használathoz semmit nem kell építeni, elég letölteni. (Böngészőben `file://`-ról a külön modulfájlok nem töltődnek be, ezért kell az egyfájlos build.)

```
src/
  index.template.html   oldalváz (a stílus és a script ide kerül be)
  style.css             a teljes stílus
  app.js                belépési pont (indítás, óra)
  events.js             eseménykötések
  state.js              közös állapot: st (adatok), ui (szűrők), ov (nézetek)
  util.js tasks.js csv.js people-model.js stats.js history.js worktime.js     DOM-mentes logika (ezt tesztelik a Node-tesztek)
  filter.js list.js park.js dash.js journal.js render.js status.js people.js autocomplete.js livedesk.js     megjelenítés
  storage.js            mentés/betöltés: mappa, IndexedDB, mentések, külső változás
  audit.js              változás-észlelés: a mentés előtt az eltérésekből előzmény-események lesznek
  actions.js clock.js   feladatműveletek, óra
  work.js               munkamenet-műveletek (indítás, szünet, kész, alvás/óraugrás feloldása)
```

A DOM-mentes modulok (`util`, `tasks`, `csv`, `people-model`, `stats`, `history`, `worktime`) nem importálnak a `state.js`-ből, ezért Node-ban közvetlenül tesztelhetők. A verziószámot a `package.json` adja, a build beleteszi a felületbe.

```
npm install
npm run build     # src/ → feladatnaplo.html
npm run dev       # build + újraépítés mentéskor
npm test          # build + mindkét teszt
npm run test:pure # csak a logika
npm run test:ui   # csak a böngészős teszt
```

- `tests/pure.test.js`: CSV beolvasás/kiírás és migráció, dátum- és időellenőrzés, határidő-állapotok, heti/havi statisztika, rendezés, megbízók (egyezés, javaslat, összefésülés), Tároló, előzmények (változás-észlelés, CSV, egyesítés, leírások, idővonal, napi napló).
- `tests/worktime.test.js`: a munkamenet-modell (indítás, szünet, váltás, kész, újranyitás, több munkamenet összege, éjfél, nyári/téli időszámítás-váltás, alvás- és óraugrás-észlelés, CSV, hibás/hiányzó/két aktív sor, egyesítés) és a mért idő statisztika, rögzített időzónában és vezérelt órával.
- `tests/ui.test.js`: headless Chrome memóriabeli mappa-szimulációval. Lefedi a csatlakozást és migrációt, felvitelt, szűrést, szerkesztést, autocomplete-et, megbízói panelt, dashboardot, Tárolót, összecsukható napokat, előzményeket és a napi naplót, a Live Desket (indítás, váltás, szünet, kész, frissítés utáni helyreállás, alvás és óraugrás vezérelt órával, statisztika), nyomtatást, telefonos nézetet, külső módosítást, billentyűket. A „ma" fix (2026-11-09), így a teszt bármikor ugyanúgy fut. A képernyőképek a `tests/out` mappába kerülnek.
- A UI-teszt Chrome-ot keres a szokásos helyeken; ha máshol van, add meg a `CHROME_PATH` környezeti változóval.

Az adatfájlok (`*.csv`, `mentesek/`) a `.gitignore` miatt nem kerülnek verziókezelésbe.

## Verziók

| Verzió | Újdonság |
|---|---|
| 2.9.2 | Alapból nyitva marad minden nap, amelyben van megoldatlan feladat; „Ma 16:30” gyorsgomb; kompakt heti/havi áttekintő (egysoros mutatósáv, 2×2 toplista) |
| 2.9.1 | Következő feladatok sáv: a határidő-címke a szöveg fölött, hosszú szöveg két sorra vágva (teljes szöveg a súgóban) |
| 2.9.0 | Live Desk: munkaidő-mérés (`munkamenetek.csv`), élő sáv, alvás/óraugrás-ellenőrzés, mért idő a statisztikában |
| 2.8.0 | Előzmények: `tortenet.csv`, feladatonkénti idővonal és napi napló |
| 2.7.0 | Moduláris forrás (`src/`), egyfájlos build (esbuild); a működés változatlan |
| 2.6.1 | Szigorúbb dátum- és időellenőrzés (feb. 31., szökőév, óra/perc tartomány) |
| 2.6 | Összecsukható napok (akkor alapból csak a mai nyitott; 2.9.2 óta a megoldatlan feladatos napok is) |
| 2.5 | Tároló: nem ütemezett feladatok, `tarolo` oszlop |
| 2.4 | Heti és havi áttekintés újratervezve, többsoros határidő-lista |
| 2.3 | Napi státusz lapos sávban felül, heti/havi/megbízói blokk alul, kiemelt felviteli űrlap |
| 2.2 | Megbízók külön listával és elgépelés-védelemmel, megbízói statisztika |
| 2.1 és korábbi | Alapok: CSV-tárolás mappába, biztonsági mentések, szerkesztés, keresés, megbízó mező, `#címke`, határidő, dashboard, HUD-stílus, nyomtatás |
