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
3. A program ebbe a mappába írja a `feladatnaplo.csv` és a `megbizok.csv` fájlt. A napi biztonsági másolatok a `mentesek` almappába kerülnek (az utolsó 60-at tartja meg).

Frissítéskor elég a `feladatnaplo.html` fájlt lecserélni, az adatok a CSV-kben maradnak.

> A mappa-hozzáférés a File System Access API-n alapul, ezért Chromium-alapú böngésző kell (Edge, Chrome). Mappa nélkül is működik, ilyenkor az adatok a böngésző helyi tárában vannak, és a mappa kiválasztásakor összefésülődnek a fájlokkal.

## Funkciók

**Felvitel és szerkesztés**
- Gyors felvitel az oldal tetején: szöveg, megbízó, határidő, dátum (alapból a mai nap, a rögzítés időpontja a háttérben mentődik)
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
- A napi szekciók összecsukhatók: alapból csak a mai nap nyitott, a többi fejlécén látszik a nyitott feladatok száma. Keresés, szűrés és nyomtatás közben minden nap látszik

**Tároló**
- Nem ütemezett feladatoknak (az űrlapon a „tárolóba" jelölővel). Nincs dátumuk és határidejük, nem számítanak bele a statisztikákba
- Egy kattintással (Ma / Holnap / választott nap) átkerülnek a rendes feladatok közé; a szerkesztő nézetből vissza is tehetők
- Keresés a Tárolóban is szűr

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
- UTF-8 BOM, `;` elválasztó, CRLF sorvég. Excelben szerkeszthető; a beolvasás oszlopsorrend-független, felismeri a `,`/tabulátor elválasztót és az Excel-es dátumformátumokat (`2026.11.09`).
- Régebbi formátumok (fejléc nélküli `datum;feladat`, `cimke` oszlopos) betöltéskor automatikusan átalakulnak, előtte külön `…_atalakitas-elott.csv` másolat készül a `mentesek` mappában.

## Fejlesztés és tesztek

A program egyetlen fájl (`feladatnaplo.html`), build nélkül. A DOM-mentes logika (CSV, normalizálás, határidők, statisztika, megbízók) a `PURE:START … PURE:END` blokkban van, ezt a Node-tesztek közvetlenül kiolvassák.

```
npm install
npm test          # mindkét teszt
npm run test:pure # csak a logika
npm run test:ui   # csak a böngészős teszt
```

- `tests/pure.test.js`: CSV beolvasás/kiírás és migráció, határidő-állapotok, heti/havi statisztika, rendezés, megbízók (egyezés, javaslat, összefésülés), Tároló.
- `tests/ui.test.js`: headless Chrome memóriabeli mappa-szimulációval. Lefedi a csatlakozást és migrációt, felvitelt, szűrést, szerkesztést, autocomplete-et, megbízói panelt, dashboardot, Tárolót, összecsukható napokat, nyomtatást, telefonos nézetet, külső módosítást, billentyűket. A „ma" fix (2026-11-09), így a teszt bármikor ugyanúgy fut. A képernyőképek a `tests/out` mappába kerülnek.
- A UI-teszt Chrome-ot keres a szokásos helyeken; ha máshol van, add meg a `CHROME_PATH` környezeti változóval.

Az adatfájlok (`*.csv`, `mentesek/`) a `.gitignore` miatt nem kerülnek verziókezelésbe.

## Verziók

| Verzió | Újdonság |
|---|---|
| 2.6 | Összecsukható napok (alapból csak a mai nyitott) |
| 2.6.1 | Szigorúbb dátum- és időellenőrzés (feb. 31., szökőév, óra/perc tartomány) |
| 2.5 | Tároló: nem ütemezett feladatok, `tarolo` oszlop |
| 2.4 | Heti és havi áttekintés újratervezve, többsoros határidő-lista |
| 2.3 | Napi státusz lapos sávban felül, heti/havi/megbízói blokk alul, kiemelt felviteli űrlap |
| 2.2 | Megbízók külön listával és elgépelés-védelemmel, megbízói statisztika |
| 2.1 és korábbi | Alapok: CSV-tárolás mappába, biztonsági mentések, szerkesztés, keresés, megbízó mező, `#címke`, határidő, dashboard, HUD-stílus, nyomtatás |
