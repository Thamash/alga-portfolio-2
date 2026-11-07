# Algoritmus-portfólió

Webes portfólió az SZTE *Algoritmizálás és problémamegoldás tanítása* kurzusához: három algoritmus lépésenként lejátszható,
animált bemutatása a 7. és a 10. évfolyam számára.

## Mit tartalmaz?

| Kód  | Feladat            | Évfolyam | Téma                                   |
|------|--------------------|----------|----------------------------------------|
| 7/A  | Collatz-sorozat    | 7.       | `while`-ciklus, elágazás               |
| 7/B  | Legmagasabb gyerek | 7.       | `for`-ciklus, maximumkiválasztás       |
| 10/A | Hanoi tornyai      | 10.      | rekurzió, függvény, hívási verem       |

Minden feladat oldalán:

- **Leírás** – a feladat és a mögötte álló ötlet röviden.
- **Kérdések a csoportnak** – kártyák, amelyek a „Válasz” gombra megfordulnak. A válaszok egy részénél
  a „Nézd meg a lejátszóban” gomb betölti a hozzá tartozó bemenetet, és elindítja vagy a megfelelő lépésre állítja a lejátszást.
- **Bemenet** – szabadon módosítható, előbeállításokkal és véletlen bemenettel. A link az aktuális bemenetet is tartalmazza,
  pl. `task.html?id=collatz&n=27`; a `&step=40` paraméterrel a lejátszó a 41. lépésnél nyílik.
- **Kód** – a Python-program, kiemelve az éppen végrehajtott sort. A 7. évfolyamos feladatoknál magyar pszeudokód nézet is van.
- **Változók** – a változók aktuális értéke (a változás felvillan), a ciklus állása és a hívási verem.
- **Output** – amit a program addig kiírt.
- **Rajz** – feladatonként saját animáció: a Collatz-sorozat értékei és grafikonja, a gyerekek sora a koronával,
  illetve a Hanoi-rudak a korongokkal és a hívási veremmel.
- **Vezérlés** – lépésenként előre-hátra, lejátszás állítható sebességgel. Billentyűk: <kbd>→</kbd> lépés,
  <kbd>←</kbd> vissza, <kbd>Szóköz</kbd> lejátszás/szünet, <kbd>Home</kbd>/<kbd>End</kbd> eleje/vége.

A `python/` mappában a feladatok Python-kódja külön is megtalálható és futtatható (a `collatz.be.txt` a Collatz-program bemenete).

## Futtatás helyben

Nincs szükség telepítésre, fordításra vagy internetkapcsolatra; elég egy modern böngésző (Chrome, Edge, Safari, Firefox).

**1. Közvetlenül a fájlból** – kattints duplán az `index.html`-re, vagy terminálból:

```sh
open index.html          # macOS
xdg-open index.html      # Linux
start index.html         # Windows
```

**2. Helyi webszerverrel** – ha `http://` címen szeretnéd megnyitni (Python 3 kell hozzá):

```sh
cd alga-portfolio-2
python3 -m http.server 8765
```

Majd a böngészőben: <http://localhost:8765>. Leállítás: <kbd>Ctrl</kbd>+<kbd>C</kbd>.
Ha a 8765-ös port foglalt, adj meg másikat (pl. `python3 -m http.server 8766`).

A Python-programok önállóan is futtathatók:

```sh
python3 python/collatz.py < python/collatz.be.txt
python3 python/max-search.py
python3 python/hanoi.py
```

## Felépítés

```
index.html         nyitóoldal: a feladatok évfolyamonként, lefedettségi táblázat
task.html          a feladatoldal; a ?id= alapján tölti be a js/tasks/<id>.js-t
css/style.css      sötét téma; minden szín a :root tokenjeiből jön
assets/fonts/      Inter betűtípus (helyben, SIL Open Font License)
js/registry.js     a feladatok listája (TASK_INDEX) és a registerTask()
js/ui.js           DOM/SVG-segédek, Python-szerű formázás, seedelt véletlen, szintaxiskiemelés
js/trace.js        a lépésgenerátorok segédjei (sorkeresés tartalom alapján, hívási verem)
js/engine.js       a lejátszó logikája (lépések gyűjtése, output) – böngésző nélkül, Node-ból is használható
js/fields.js       a bemeneti mezők (szám, számlista, szöveg)
js/player.js       a lejátszó felülete: panelek, vezérlés, kérdéskártyák
js/tasks/          collatz.js, max-search.js, hanoi.js – leírás, kérdések, Python-kód, lépésgenerátor, rajz
python/            a feladatok Python-kódja futtatható formában
tools/check.js     ellenőrzés: a Python-kódot ténylegesen lefuttatja, és összeveti a lejátszóval
tools/shot.sh      képernyőkép headless Chrome-mal
```

Minden szkript sima `<script>` (nem ES-modul), ezért az oldal `file://` alól is működik.

## Hogyan működik a lejátszás?

A lejátszó nem futtat Pythont a böngészőben. Minden feladathoz tartozik egy JavaScript-generátor (`function*`),
amely sorról sorra követi a Python-programot, és minden lépésnél megadja az aktív sort, a változókat, a kimenetet
és a rajz állapotát. Hogy ez valóban egyezik a Python viselkedésével, azt a `tools/check.js` ellenőrzi.

## Ellenőrzés (fejlesztőknek)

Node.js és Python 3 kell hozzá.

```sh
node tools/check.js                  # mindhárom feladat: előbeállítások, a kérdések bemenetei és 3 véletlen bemenet
node tools/check.js hanoi --random=10
node tools/check.js --export         # a python/ mappa újragenerálása
tools/shot.sh "task.html?id=hanoi&n=4&step=30" hanoi.png
```

A `check.js` feladatonként ellenőrzi, hogy minden lépés létező, végrehajtható Python-sorra mutat, a pszeudokód
soronként megfelel a Python-kódnak, és a Python valódi kimenete megegyezik az Output panellel.
