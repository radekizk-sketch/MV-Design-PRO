# Symbole QElectroTech pola liniowego SN (EN 60617)

Katalog zawiera **niezmienione** pliki elementów `.elmt` z kolekcji
[qelectrotech-elements](https://github.com/qelectrotech/qelectrotech-elements), zatwierdzenie
`14a4727f70856d8e79de59a353fa3c52d3e90e21`, pod ich ścieżkami źródłowymi. Wciągnięto
WYŁĄCZNIE elementy użyte przez pole liniowe SN schematu SLD v3 (karta
UX-04/POLE-LINIOWE-WZORZEC, `docs/uiux/UX04_POLE_LINIOWE_WZORZEC.md`).

## Atrybucja i licencja

Elementy: **The QElectroTech team**, licencja **CC BY 3.0**
(<https://creativecommons.org/licenses/by/3.0/>). Pełny tekst warunków kolekcji:
[`ELEMENTS.LICENSE`](ELEMENTS.LICENSE). Warunki kolekcji obejmują zakaz używania elementów
jako danych przykładowych do budowy modeli uczenia maszynowego — pliki nie są do tego
celu udostępniane ani używane.

Geometria w schemacie SLD powstaje z tych plików mechanicznie (bez przerysowania); zmiany
względem źródła — skala, złożenie, obrót noża dla położeń łącznika — są opisane w manifeście
i w nagłówku pliku generowanego, zgodnie z wymogiem CC BY 3.0 wskazania zmian.

## Pliki

| Plik | Opis |
|------|------|
| `10_electric/**.elmt` | elementy źródłowe, bajtowo równe blobom w zatwierdzeniu źródła |
| `ELEMENTS.LICENSE` | warunki licencji kolekcji elementów QElectroTech |
| `import_manifest.json` | dla każdego elementu `sourcePath` i `upstreamBlobSha` (SHA bloba git), decyzje o tekstach źródła; dla każdego symbolu złożenie, nóż, przegub, styki stałe i porty |

## Import

Importer `scripts/import_qet_pole_sn.py` generuje
`frontend/src/ui/sld/v3/cad/qet/qetPoleSn.ts`. Źródło jest daną niezaufaną:
importer czyta wyłącznie XML z dopuszczonym podzbiorem prymitywów, odrzuca DTD, encje,
skrypty i bitmapy, sprawdza SHA bloba każdego pliku względem manifestu i przerywa import
przy każdym odstępstwie (fail-closed). Uruchamiaj z izolowanym interpreterem, z katalogu
`mv-design-pro`:

```bash
python -I scripts/import_qet_pole_sn.py            # zapis pliku TS
python -I scripts/import_qet_pole_sn.py --sprawdz  # kontrola świeżości (rc=1 przy rozjeździe)
```

Świeżość, determinizm i iniekcje fail-closed przypina
`backend/tests/ci/test_qet_pole_sn_import.py`.

## Reguły geometrii

* Skala 0,4: raster zacisków QET (20 jednostek) przechodzi na siatkę schematu `GRID = 8`.
* Każdy prymityw źródła ma w pliku generowanym jedną ROLĘ (`ROLE` importera): **przewód**
  (linia stała z końcem w zacisku portu toru albo w punkcie źródła portu wtórnego, równoległa
  do kierunku portu — tolerancja `TOLERANCJA_PRZEWODU`), **glif** (znak rodzaju aparatu: styki,
  nóż, rdzeń, okręgi) albo **osprzęt** (składnik jawnie wskazany w manifeście polem `osprzet`
  z powodem — napęd silnikowy „M”, cewka wyłączająca). Przewody rysuje się kreską przewodu
  schematu (`V3_STROKE_APPARATUS`), glif i osprzęt kreską glifu `QET_KRESKA_GLIFU`
  (`kafelStanu.kreskaGlifuQet` × 0,4 = 2 jednostki świata = bok kafla / 24) — grubość
  proporcjonalna do kafla, nie do przewodu.
* `skalaLokalna` (lista {`skladnik`, `prymitywy`, `skala` ∈ [0,25; 4], `skala` ≠ 1, `srodek`,
  `powod`}) to jednokładność wybranych prymitywów źródła wokół podanego punktu, stosowana PRZED
  jednokładnością rysunku: wyraźny znak rodzaju (krzyżyk wyłącznika, poprzeczka odłącznika,
  kreski uziemienia) albo pomniejszenie drobnego szczegółu (doprowadzenie rdzenia przekładnika).
  Wpis bez powodu, ze skalą 1 albo poza zakresem przerywa import.
* `skalaRysunku` symbolu ({`k` ∈ (1; 4], `srodek`, opcjonalnie `skladniki`, `powod`) to
  jednokładność rysunku wskazanych składników (domyślnie wszystkich) wokół punktu `srodek`
  układu złożenia, po obrocie i przesunięciu składnika — przenosi kształt źródła bez zmian
  (wszystkie odległości × k) i powiększa aparat do stopnia symboli LOD2. Składnik spoza listy
  stoi w układzie po jednokładności. Porty zostają na rastrze zacisków: zacisk toru, który po
  jednokładności wypada poza gabaryt, przechodzi na krawędź gabarytu z przycięciem przewodu.
* Stopień symboli (`stopienSymboli` w manifeście): wysokość glifu wzdłuż osi toru (bez przewodów
  i osprzętu) jako ułamek boku kafla stanu — łącznik w KAŻDYM położeniu noża w [0,55; 0,70],
  symbol toru (przekładniki, głowica kablowa, wskaźnik napięcia) w [0,33; 0,70]. Symbol poza
  przedziałem przerywa import z komunikatem „stopień glifu … poza [lo; hi]” (uwaga właściciela
  2026-10-29: glif ma zajmować ok. 55–70 % boku kafla; symbole toru nie mogą być drobne wobec
  kafli).
* Gabaryt symbolu = treść (glif we wszystkich położeniach noża ∪ osprzęt) ∪ porty wtórne,
  symetryczny względem osi toru, domknięty do rastru zacisków od punktu odniesienia. Zacisk
  portu toru poza gabarytem przechodzi na krawędź gabarytu z przycięciem przewodu; zacisk
  wewnątrz gabarytu jest przedłużony jawnym odcinkiem przewodu do krawędzi (`doprowadzenia`
  w pliku generowanym) — wymaga deklaracji `portyWewnatrzGabarytu` z powodem (przy kaflu stanu
  importer uzupełnia powód kafla); zbiór zacisków wewnętrznych i zbiór deklarowany muszą być
  równe (predykat parami).
* Port wtórny między rastrami (rdzeń przekładnika prądowego, uzwojenie przekładnika
  napięciowego) ma `przedluzenie` {`kierunek`, `powod`}: przewód obwodu wtórnego jest
  przedłużony w podanym kierunku do najbliższego rastru schematu, skąd biegnie linia pomiarowa.
  Przedłużenie punktu leżącego już na rastrze przerywa import („zbędne”).
* Rysunek źródła = położenie OTWARTE. Położenia ZAMKNIĘTE i UZIEMIONE (łącznik
  trójpołożeniowy) to obrót prymitywów noża wokół przegubu na kierunek styku stałego;
  położenie NIEZNANE = połowa kąta zamknięcia (łącznik dwupołożeniowy) albo położenie źródła
  (łącznik trójpołożeniowy), w obu przypadkach z kreską przerywaną noża. Wzór kreski
  przerywanej sceny to `w 2w` (`wzorKreskiPrzerywanejSceny`), czyli przerwa dwa razy szersza
  od kreski — przy okrągłych zakończeniach linii przerwa pozostaje widoczna.
* Teksty QET są zapisane jako punkt bazowy; środek znaku i jego obwiednia wynikają z szerokości
  posuwu kroju źródła (Liberation Sans, metrycznie zgodny z Arial: `SZEROKOSC_ZNAKU_EM`,
  „M” 1706/2048 em, „3” 1139/2048 em) i wysokości 0,7 em (`EM_WYSOKOSC`). Znak spoza tabeli
  przerywa import.
* Łącznik trójpołożeniowy nie ma elementu w kolekcji — jest złożeniem elementów QET
  `en_60617_07_13_07` (odłącznik dwukierunkowy) i `en_60617_02_15_01` (uziemienie obrócone
  o 180° nad zestykiem prawym), oznaczonym w pliku generowanym polem `zlozenie`. Uziemienie leży
  u GÓRY pola, przy torze między szyną a stykiem odłączającym, jak na rysunku ENEA Zeszyt 1 Z.10
  (s.89). Jego zacisk szynowy leży wewnątrz gabarytu (symbol uziemienia sięga wyżej) i jest
  przedłużony przewodem do krawędzi.
* Głowica kablowa i złącze odgałęzienia przekładnika napięciowego to element
  `en_60617_03_03_05` (złącze wtykowe: wtyk zaczerniony + gniazdo) — znak rysunków ENEA Zeszyt 1
  Z.10/Z.11.1 (zaczerniony prostokąt nad czaszą), obrócony o −90°: wtyk (strona rozdzielnicy)
  u góry, gniazdo (strona kabla) u dołu toru. Dawny element `en_60617_03_04_01` (zakończenie
  kabla) usunięty z katalogu — nie odpowiadał rysunkowi standardu (karta
  UX-04/POLE-LINIOWE-WZORZEC, wymaganie właściciela 2026-10-29 pkt 3).
* Koniec toru pola wolnego (kabel odpływowy nieobecny w modelu) to element `en_60617_03_01_14`
  (koniec przewodu lub kabla, niepodłączony), nie znak uziemienia — uziemienie występuje
  wyłącznie przy uziemniku. Rysunek końca toru jest w całości glifem (`przewodyJakoRysunek`
  z powodem).
* Wyłącznik jest złożeniem elementów `en_60617_07_13_05` (wyłącznik) i `en_60617_07_15_01`
  (napęd elektromechaniczny — cewka wyłączająca, obrócona o 90° po prawej stronie toru, jako
  osprzęt). Zacisk cewki od strony toru jest w `zaciskiPozaTorem`, zacisk zewnętrzny jest portem
  wtórnym `wylacz` na krawędzi kafla — w nim kończy się linia wyłączania od przekaźnika
  zabezpieczeniowego (uwaga właściciela 2026-10-29 pkt 5: linia wyłączania prowadzi do cewki Q0,
  nie do środka kafla).
* Wyłącznik z napędem silnikowym (`BayPrimaryDevice.naped` = `SILNIKOWY`) dokłada element
  `en_60617_02_13_26` (napęd silnikowy „M” z kreskowaną linią sprzężenia mechanicznego
  zaczepioną w przegubie noża) jako osprzęt po lewej stronie toru. Kreska przerywana jest
  dopuszczona w imporcie wyłącznie dla linii (`STYLE_KRESKI`).
* Kafel stanu łącznika (`kafelStanu` w manifeście): jeden kwadrat 120 × 120 jednostek QET
  (48 × 48 jednostek świata przy skali 0,4, poziom szczegółu bazowy) dla KAŻDEGO łącznika pola
  (wyłącznik, wyłącznik z napędem, odłącznik, rozłącznik, rozłącznik z bezpiecznikami, uziemnik,
  łącznik trójpołożeniowy) i każdego położenia — wymaganie właściciela 2026-10-29 pkt 1. Kafel
  jest wyśrodkowany na treści symbolu; treść z marginesem `marginesQet` musi się w nim mieścić
  („rysunek łącznika nie mieści się w kaflu stanu”), a kreska glifu musi leżeć w (0; bok/12].
* Przekładnik napięciowy o kilku uzwojeniach wtórnych jest złożeniem kopii elementu
  `en_60617_06_13_01A`; liczba okręgów = 1 + liczba uzwojeń wtórnych przekładnika w modelu
  (pole ENM `uzwojenia`), zaciski kopii dodatkowych są w `zaciskiPozaTorem`.
* Przekładnik napięciowy (`en_60617_06_13_01A`, transformator dwuuzwojeniowy) ma w źródle dwa
  zaciski: pierwotny (port toru odgałęzienia, `top`) i wtórny. Zacisk wtórny nie jest portem
  toru pola — obwód wtórny przekładnika nie należy do sieci SN — więc manifest deklaruje go
  jawnie w `zaciskiPozaTorem` z powodem. Importer odrzuca zacisk źródła bez przypisania do portu
  ani do `zaciskiPozaTorem`, wpis bez powodu i wpis wskazujący zacisk, którego w źródle nie ma
  (fail-closed; iniekcje w `test_qet_pole_sn_import.py`).
