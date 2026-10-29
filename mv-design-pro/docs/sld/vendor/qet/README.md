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
* Gabaryt symbolu = obwiednia wszystkich położeń noża i portów, symetryczna względem osi toru,
  domknięta do rastru zacisków.
* Rysunek źródła = położenie OTWARTE. Położenia ZAMKNIĘTE i UZIEMIONE (łącznik
  trójpołożeniowy) to obrót prymitywów noża wokół przegubu na kierunek styku stałego;
  położenie NIEZNANE = połowa kąta zamknięcia (łącznik dwupołożeniowy) albo położenie źródła
  (łącznik trójpołożeniowy), w obu przypadkach z kreską przerywaną noża.
* Teksty QET są zapisane jako punkt bazowy; środek znaku i jego obwiednia są przybliżane
  metryką 0,6 em × 0,7 em (stałe `EM_SZEROKOSC`, `EM_WYSOKOSC` importera).
* Łącznik trójpołożeniowy nie ma elementu w kolekcji — jest złożeniem elementów QET
  `en_60617_07_13_07` (odłącznik dwukierunkowy) i `en_60617_02_15_01` (uziemienie), oznaczonym
  w pliku generowanym polem `zlozenie`. Jego zacisk szynowy leży wewnątrz gabarytu (symbol
  uziemienia sięga wyżej); importer przedłuża go jawnym odcinkiem przewodu do krawędzi
  gabarytu (`doprowadzenia` w pliku generowanym, z powodem z manifestu), więc port leży na
  krawędzi jak w całej bibliotece.
* Głowica kablowa (`en_60617_03_04_01`) nie ma w źródle elementów `terminal`; porty są końcami
  przewodów z uzasadnieniem w manifeście (`powod`).
* Przekładnik napięciowy (`en_60617_06_13_01A`, transformator dwuuzwojeniowy) ma w źródle dwa
  zaciski: pierwotny (port toru odgałęzienia, `top`) i wtórny. Zacisk wtórny nie jest portem
  toru pola — obwód wtórny przekładnika nie należy do sieci SN — więc manifest deklaruje go
  jawnie w `zaciskiPozaTorem` z powodem. Importer odrzuca zacisk źródła bez przypisania do portu
  ani do `zaciskiPozaTorem`, wpis bez powodu i wpis wskazujący zacisk, którego w źródle nie ma
  (fail-closed; iniekcje w `test_qet_pole_sn_import.py`).
