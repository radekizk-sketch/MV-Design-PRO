# KONCEPCJA — Import danych od OSD (XLS + podkład mapowy PDF)

**Status:** KONCEPCJA (burza mózgów, do decyzji właściciela — patrz §11)
**Data:** 2026-07-26
**Warstwa:** Infrastructure (parsery) + Application (uzgodnienie i emisja operacji) — **ZERO fizyki**
**Powiązane:**
- `docs/spec/SPEC_CHAPTER_16_EXTERNAL_INTEGRATIONS.md` — §16.5 pipeline importu (ARCHIWALNE, ale kontrakt aktualny)
- `docs/adr/ADR-009-xlsx-importer-future.md` — odroczenie importera XLSX
- `docs/domain/OPERACJE_DOMENOWE_V1.md` — kanoniczne operacje domenowe
- `docs/system/SPEC_KATALOGI_I_MATERIALIZACJA_PARAMETROW.md` — katalog-first
- `docs/plan/PLAN_PRZEBUDOWY_10X_2026-07.md` — program przebudowy

---

## 0. Teza w jednym zdaniu

**XLS niesie liczby, PDF niesie topologię i tożsamość — a ich spoiwem są nazwy stacji i numery
ciągów; z połączenia obu powstaje nie tylko model sieci, lecz przede wszystkim *audytowalny ślad
pochodzenia danych wejściowych*, którego systemowi dziś brakuje.**

To jest najważniejsza obserwacja tej koncepcji. MV-DESIGN-PRO ma znakomicie rozwiniętą
audytowalność **wyników** (WHITE BOX, ProofPack, hashe determinizmu), ale jego audytowalność
**wejścia** zaczyna się dopiero w momencie, gdy inżynier ręcznie wklepie dane w kreatorze.
Import od OSD to naturalne miejsce, żeby domknąć drugą połowę tej historii: *skąd wzięła się
liczba 1,24 km i kto wziął za nią odpowiedzialność*.

---

## 1. Stan faktyczny — co repo już ma (zweryfikowane w kodzie)

### 1.1 Aktywa, na których budujemy

| Aktywo | Dowód | Znaczenie dla importu |
|---|---|---|
| `LineRun` — ciąg liniowy z jawną kolejnością segmentów i stacji | `backend/src/enm/models.py:620-637` | **Idealne odwzorowanie danych OSD.** Wiersze XLS wzdłuż obwodu mapują się 1:1 na `segments[] + stations[]`. Pole `nop_station_ref` przechowuje punkt normalnie otwarty. |
| `Substation.station_type` = `inline`/`branch`/`terminal`/`sectional`/`switching` | `backend/src/enm/models.py:639-663` | Typy stacji, których używa OSD, są już w modelu. |
| `Cable.cross_section_mm2`, `conductor_material`, `insulation` | `backend/src/enm/models.py:172-196` | Przekrój jest polem pierwszej klasy — jest gdzie wpiąć dane z XLS. |
| `parameter_source` = `CATALOG`/`OVERRIDE`/`MANUAL_EQUIVALENT` + `source_mode` = `KATALOG`/`MIGRACJA`/`EKSPERCKI_RECZNY` | `backend/src/enm/models.py:150-152` | **Gotowy mechanizm pochodzenia parametru.** Import nie wymaga nowego pojęcia. |
| Importer CGMES — tolerancyjny czytnik z jawnym statusem `CATALOG_MAPPING_REQUIRED` | `backend/src/infrastructure/cgmes/cgmes_importer.py:1-24, 285` | **Gotowy wzorzec architektoniczny do skopiowania.** Nie wymyślamy pipeline'u importu od zera. |
| Katalog kabli i linii z rodzinami AFL 6 / AFL 2 / AAL / YHAKXS / YHKXS / XRUHAKXS / NKT / TFK / standard ENEA Operator | `backend/src/network_model/catalog/mv_cable_line_catalog.py:174-213` | Cel dopasowania „przekrój → typ katalogowy" realnie istnieje, z podziałem na rodziny. |
| `CalculationReadinessService` z typem `report_osd` | `backend/src/application/calculation_readiness/service.py:26-59` | „Raport OSD" jest już obywatelem pierwszej kategorii w bramkach gotowości. |
| Nadpisania geometrii per przypadek obliczeniowy (`MOVE_DELTA`, `REORDER_FIELD`, `MOVE_LABEL`) | `backend/src/api/sld_overrides.py:1-13` | **Gotowy, izolowany kanał na geometrię** — miejsce dla podpowiedzi z mapy, poza fizyką. |
| Kanoniczne operacje domenowe (44 pozycje: 23 bazowe ∪ 26 rozszerzenia v2), m.in. `continue_trunk_segment_sn`, `insert_station_on_segment_sn`, `set_normal_open_point` | `backend/src/enm/domain_operations.py:36-64, 6905`; `domain_operations_v2.py:2753` | Import może budować model **tą samą drogą co kreator** — bez nowej ścieżki mutacji. |
| Determinizm ID: `sha256` z kanonicznego JSON | `backend/src/enm/domain_operations.py:78-88` | Powtarzalny import „za darmo", o ile decyzje zapiszemy jako dane. |

### 1.2 Długi — co trzeba naprawić, zanim cokolwiek dobudujemy

Istniejący `XlsxNetworkImporter` **wygląda na działający, a jest martwy**. To najważniejsze
ustalenie tego rozdziału:

| Problem | Dowód | Skutek |
|---|---|---|
| `openpyxl` **nie jest zadeklarowaną zależnością** — występuje wyłącznie jako opcjonalny extra `pandas` w `poetry.lock` | `backend/pyproject.toml:20-38` (brak), `poetry.lock:1690,1696` | Na produkcji `POST /api/import/xlsx` zwraca „Brak biblioteki openpyxl". **Endpoint jest martwy.** |
| Importer wymaga jawnych `R_ohm_km` i `X_ohm_km` w arkuszu | `backend/src/application/xlsx_import/importer.py:81-89` | **OSD nigdy nie podaje R/X.** OSD podaje długość i przekrój. Format arkusza jest oderwany od realnych danych wejściowych. |
| `rated_current_a=1.0  # placeholder — XLSX does not provide Irated` | `backend/src/application/xlsx_import/importer.py:436` | Jawne obejście reguły wiązania katalogowego. Element z obciążalnością 1 A przejdzie do solwera i da bezsensowne wyniki obciążalności. |
| Buduje `NetworkGraph` (struktura solwerowa), a nie ENM | `backend/src/application/xlsx_import/importer.py:374` | Ślepa uliczka — omija walidator ENM, operacje domenowe, snapshot i katalog. |
| Endpoint zwraca liczniki i **wyrzuca graf** | `backend/src/api/xlsx_import.py:56-59` | Nic nie jest utrwalane. Import niczego nie importuje. |
| `ADR-009` formalnie odracza importer XLSX | `docs/adr/ADR-009-xlsx-importer-future.md:10-12` | Dokumentacja i kod są w sprzeczności — kod istnieje, ADR mówi że go nie ma. |

**Wniosek:** nie rozbudowujemy tego importera. Zastępujemy go, a `/api/import/xlsx` oznaczamy
jako wycofany. Rozdział 16 spec (§16.1.1) wymienia `XlsxNetworkImporter` jako „AS-IS" — to zapis
nieprawdziwy i wymaga korekty.

### 1.3 Czego w repo nie ma w ogóle

- **Zero wsparcia dla współrzędnych geograficznych.** Przeszukanie całego repozytorium
  (`*.py`, `*.ts`, `*.tsx`) pod kątem `latitude|longitude|geo_|EPSG|PUWG` nie zwraca **żadnego**
  trafienia. Podkład mapowy to całkowicie nowa oś danych — i dlatego trzeba ją zaprojektować
  świadomie izolowaną, a nie doklejać do modelu sieci.
- **Zero bibliotek do PDF po stronie wejścia.** `reportlab` służy do generowania raportów;
  nie ma `pdfplumber`, `PyMuPDF` ani niczego do odczytu PDF (`backend/pyproject.toml`).
- **Brak biblioteki dopasowania rozmytego** (`rapidfuzz` itp.) — potrzebnej przy sklejaniu nazw stacji.

---

## 2. Zasada zero — import nie tworzy modelu

**Import nie ma prawa zapisywać bezpośrednio do ENM.** Wytwarza kolejno trzy artefakty,
z których dopiero ostatni dotyka modelu:

```
  Pliki od OSD                    Artefakt 1                Artefakt 2               Artefakt 3
┌───────────────┐        ┌─────────────────────┐   ┌────────────────────┐   ┌──────────────────┐
│ XLS: długości │───────►│  DOKUMENT ŹRÓDŁOWY  │──►│    SZKIC IMPORTU   │──►│ Kanoniczne       │
│     przekroje │        │  (niezmienny, hash) │   │ (kandydaci + kon-  │   │ operacje         │
├───────────────┤        │  • ślad per komórka │   │  flikty + pewność  │   │ domenowe         │
│ PDF: podkład  │───────►│  • ślad per strona  │   │  dopasowania)      │   │      ↓           │
│     mapowy    │        └─────────────────────┘   └────────────────────┘   │  ENM + snapshot  │
└───────────────┘                  │                          │             └──────────────────┘
                                   │                          │
                              nie do zmiany            uzgodnienie z człowiekiem
                              (dowód wejścia)          (3 panele: tabela|mapa|schemat)
```

**Dlaczego akurat tak — trzy twarde powody wynikające z kanonu:**

1. **Katalog-first.** Model wymaga wiązania katalogowego (`catalog_binding_guard.py`).
   Importer, który sam wymyśli R/X z przekroju, łamie tę regułę i regułę „domain no guessing".
   Szkic pozwala pokazać *propozycję* dopasowania bez zapisu do modelu.
2. **Jedna ścieżka mutacji.** Model zmieniają wyłącznie operacje kanoniczne
   (`canonical_ops_guard.py`). Import, który emituje te same operacje co kreator, dostaje
   za darmo: walidację, snapshot, unieważnianie wyników, cofanie i determinizm.
3. **Odpowiedzialność za dane.** W opinii formalnej musi być rozróżnialne, co przyszło od OSD,
   a co dopisał projektant. Rozdzielenie „dokument źródłowy" / „decyzja uzgodnienia" robi to
   strukturalnie, a nie komentarzem.

---

## 3. Jak pożenić XLS z PDF — trzy poziomy sklejenia

Kluczowe pytanie brzmi: *co jest kluczem złączenia?* Odpowiedź: **znormalizowana nazwa/numer
stacji oraz numer obwodu (ciągu)**. Reszta z tego wynika.

### Poziom 1 — sklejenie po tożsamości (działa zawsze, także dla skanu)

Normalizacja klucza (deterministyczna, wersjonowana, testowalna):
`wielkie litery` → `usuń spacje i myślniki` → `ujednolić prefiksy` (`ST`, `STN`, `Stacja`, `TS`)
→ `oddziel numer`. Przykład: `„Stacja ST-1234 Kowalewo 3"` → `ST1234|KOWALEWO3`.

Dopasowanie rozmyte tylko **z progiem i tylko jako propozycja**: każde trafienie niesie
`confidence` i trafia do panelu uzgodnienia. **Żadne dopasowanie poniżej progu nie jest
przyjmowane automatycznie.** To nie jest ostrożność dla ostrożności — błędnie sklejona stacja
przesuwa cały ciąg i psuje wyniki w sposób trudny do wykrycia wzrokowo.

### Poziom 2 — mapa jako świadek topologii (weryfikacja krzyżowa)

Tu leży realna wartość połączenia obu źródeł. XLS bywa listą odcinków z literówkami i lukami;
mapa pokazuje faktyczny łańcuch. Zestawienie obu daje cztery klasy ustaleń:

| Ustalenie | Interpretacja | Reakcja systemu |
|---|---|---|
| Odcinek w XLS **i** na mapie | Zgodność | Przyjęte, wysoka pewność |
| Odcinek w XLS, brak na mapie | Kabel w ziemi bywa nierysowany | OSTRZEŻENIE, przyjęte |
| Linia na mapie, brak w XLS | **Brak długości i przekroju** | BLOKADA na tym fragmencie — bramka gotowości nie przepuszcza obliczeń |
| Suma długości odcinków ≠ długość ciągu na mapie | Błąd danych albo skali | OSTRZEŻENIE z jawną różnicą procentową |

Ostatni wiersz to darmowa kontrola wiarygodności, której nie da się zrobić z jednego źródła.

### Poziom 3 — geometria jako dane pomocnicze (nigdy jako fizyka)

Współrzędne z mapy trafiają wyłącznie do kanału geometrii (`sld_overrides` albo nowy,
odseparowany aneks `GeoAnchor`) i służą do rozmieszczenia schematu tak, by przypominał
rzeczywisty przebieg ciągu. **Nigdy nie zasilają długości gałęzi.**

> **Granica nieprzekraczalna:** długość odcinka pochodzi z XLS albo z jawnego pomiaru.
> Mapa nie jest przyrządem pomiarowym. Rozbieżność wolno *pokazać*, nie wolno jej *podstawić*.

---

## 4. PDF — co realnie da się z niego wyciągnąć (uczciwie)

Trzy klasy plików, trzy różne poziomy zwrotu z inwestycji:

| Klasa PDF | Co da się odczytać | Wartość | Koszt |
|---|---|---|---|
| **Wektorowy z warstwą tekstową** (eksport z GIS — u OSD najczęstszy) | teksty z pozycjami (nazwy stacji, numery), polilinie jako wektory → **realny graf geometryczny** | bardzo wysoka | średni (nowa zależność do odczytu PDF) |
| **Wektorowy bez tekstu** | geometria bez tożsamości | średnia — kotwiczenie ręczne | niski |
| **Skan rastrowy** | tylko obraz | podkład do weryfikacji wzrokowej | bardzo niski |

**Rekomendacja etapowania jest tu kontrintuicyjna, ale twarda: zacząć od klasy najsłabszej.**
Podkład graficzny plus kalibracja ręczna działa dla **wszystkich trzech** klas i już samo w sobie
odblokowuje główną wartość — możliwość zobaczenia schematu na tle rzeczywistego przebiegu
i potwierdzenia wzrokiem, że import się zgadza. Automatyczna ekstrakcja wektorów jest
usprawnieniem, nie warunkiem koniecznym.

**Georeferencja:** kalibracja dwupunktowa (użytkownik wskazuje dwie znane stacje albo odczytuje
narożniki ramki mapy). Przechowywana jako jawne przekształcenie afiniczne
(`a, b, tx, ty` + informacja o układzie, np. EPSG:2180 / PUWG 1992). Deterministyczna
i audytowalna — bez ukrytego dopasowywania.

**OCR:** wyłącznie opcjonalny i wyłącznie jako podpowiedź do potwierdzenia. Nigdy jako źródło prawdy.

---

## 5. Przekrój → typ katalogowy — sedno wartości i sedno ryzyka

To jest miejsce, w którym import albo daje przewagę, albo cicho psuje wyniki.

Dane wejściowe od OSD wyglądają jak: `AFL-6 70`, `3x120`, `120 Al`, `XRUHAKXS 1x240/25`,
`AsXSn 70`. Katalog ma rodziny i przekroje (`cable-base-xlpe-al-1c-150`, `line-base-al-st-…`).

**Projekt rozwiązania — słownik, nie heurystyka:**

- **Słownik oznaczeń OSD**, wersjonowany, trzymany w repo, **z profilem per operator**
  (profile różnią się realnie — inne oznaczenia i inne standardy kablowe).
  Postać: jawne wyrażenie regularne → identyfikator typu katalogowego. Przeglądalny, testowalny,
  podlegający zatwierdzeniu — a nie „mądra" funkcja zgadująca.
- **Wynik rozstrzygnięcia to zawsze jedna z trzech etykiet:**

| Wynik | Warunek | Zapis w modelu |
|---|---|---|
| `DOPASOWANY` | oznaczenie w słowniku, przekrój zgodny | `catalog_ref` ustawione, `source_mode="KATALOG"` |
| `NIEJEDNOZNACZNY` | np. samo `120` — kabel czy linia? Al czy Cu? | lista kandydatów do wyboru; **decyzja zapisana jako dana** |
| `NIEZNANY` | brak trafienia | `catalog_ref=None`, `source_mode="MIGRACJA"`, `parameter_source="MANUAL_EQUIVALENT"`, pozycja blokująca w bramce gotowości |

Ostatni wiersz to **dokładnie to, co już robi importer CGMES**
(`infrastructure/cgmes/cgmes_importer.py:285`) — nie wymyślamy nowej semantyki, tylko stosujemy
istniejącą i sprawdzoną.

> **Zakaz:** nigdy nie wyliczamy R/X z samego przekroju „bo się da". Element bez trafienia
> katalogowego pozostaje niekompletny, a bramka gotowości blokuje obliczenia. To zachowanie
> uczciwe i zgodne z architekturą. `rated_current_a=1.0` z obecnego importera
> (`importer.py:436`) jest wzorcowym przykładem błędu, którego unikamy.

---

## 6. Gdzie z tego bierze się realna wartość (maksymalne wykorzystanie)

Osiem zastosowań, uporządkowanych od najbardziej oczywistego do najbardziej niedocenianego.

1. **Wejście do systemu w minuty zamiast dni.** Typowy przypadek przyłączeniowy: OSD przysyła
   warunki, XLS i mapę. Dziś to ręczne budowanie w kreatorze.
2. **Bilans mocy do wniosku przyłączeniowego.** Panel bilansu mocy już istnieje w SLD
   (prace K30) — import go zasila, zamiast kazać przepisywać dane.
3. **Bramka „Raport OSD".** Typ `report_osd` jest już w serwisie gotowości
   (`calculation_readiness/service.py:35`). Import może nią sterować: *czego brakuje, żeby
   wydać raport dla operatora* — z listą konkretnych obiektów blokujących.
4. **Ciąg liniowy jako jednostka pracy.** `LineRun` (`enm/models.py:620`) odwzorowuje dokładnie
   to, czym OSD operuje: obwód od pola w GPZ do punktu podziału. Wiersze XLS uporządkowane
   wzdłuż obwodu mapują się wprost na `segments[]` + `stations[]`, a punkt normalnie otwarty
   na `nop_station_ref`.
5. **Audyt jakości danych samego OSD** — funkcja, o której łatwo nie pomyśleć, a która bywa
   najcenniejsza handlowo. Import staje się kontrolą danych operatora: suma długości odcinków
   kontra długość ciągu, skoki przekroju (240 → 50 → 240 to wąskie gardło), odcinki bez danych,
   stacje na mapie nieobecne w arkuszu. Produkt: **„Raport rozbieżności danych OSD"** — PDF,
   który można odesłać operatorowi. W sporze przyłączeniowym to jest argument, nie ozdobnik.
6. **Wariantowanie bez powielania modelu.** Import raz, potem przypadki obliczeniowe: lato/zima,
   różne położenia punktu podziału, z OZE i bez. Model jest singletonem, przypadki są konfiguracją
   — architektura już to wymusza, import tylko dostarcza bazę.
7. **Analiza wąskich gardeł i modernizacji.** Skoro przekroje są w modelu, to obciążalność,
   spadki napięcia i zwarcia wzdłuż ciągu stają się jednym kliknięciem. Odpowiedź „który odcinek
   jest wąskim gardłem i co się stanie po wymianie na 240" to właściwy produkt handlowy.
8. **Obieg zwrotny do OSD.** Eksport uzgodnionego modelu z powrotem do XLS w formacie operatora
   plus PDF z dowodem: *„oto co przyjęliśmy jako dane wejściowe — prosimy o potwierdzenie"*.
   To formalne przeniesienie odpowiedzialności za dane, spójne z zakazem modyfikacji po eksporcie
   (spec §16.4.3, Z-INT-04).

---

## 7. Ślad pochodzenia — dlaczego to jest teza, a nie dodatek

Każda zaimportowana wartość powinna nieść: hash pliku źródłowego, arkusz, wiersz, kolumnę
(albo stronę PDF i obszar), identyfikator przebiegu importu oraz informację, kto zaakceptował
dopasowanie.

Wtedy ProofPack może napisać wprost:

> *długość odcinka 1,24 km — źródło: `dane_osd.xlsx`, arkusz „Odcinki", wiersz 47,
> plik sha256:`a3f2…`, uzgodnienie: automatyczne (pewność 1,00), przebieg importu `imp-…`*

System ma już kulturę takiego zapisu po stronie wyników. Import rozszerza ją **w górę strumienia**
— i to jest brakująca połowa historii WHITE BOX. Dziś białą skrzynką jest obliczenie;
po tej zmianie białą skrzynką staje się **także wejście**.

---

## 8. Ryzyka i świadome „nie"

| Ryzyko | Decyzja |
|---|---|
| Geometria z mapy wpełza do fizyki | Długość **wyłącznie** z XLS lub jawnego pomiaru. Mapa nie mierzy. |
| Automatyczne przyjmowanie dopasowań rozmytych | Zakazane poniżej progu. Zawsze propozycja + decyzja człowieka. |
| Zgadywanie R/X z przekroju | Zakazane. Brak trafienia = element niekompletny + blokada w bramce gotowości. |
| Utrata determinizmu | Wszystkie decyzje uzgodnienia zapisywane jako dane; identyfikatory z hasza treści; brak znaczników czasu w kluczach. Te same pliki → ten sam hash ENM. |
| OCR jako źródło prawdy | Zakazane. Wyłącznie podpowiedź do potwierdzenia. |
| Rozrost formatu „uniwersalnego" | Nie budujemy jednego formatu na wszystkich operatorów. Budujemy **profile operatora** — to jawna, wersjonowana dana, nie gałąź w kodzie. |

---

## 9. Etapowanie — każdy etap oddaje wartość samodzielnie

| Etap | Zakres | Wartość po zakończeniu |
|---|---|---|
| **E0 — naprawa fundamentu** | Rozstrzygnąć los `/api/import/xlsx`: albo `openpyxl` do `pyproject.toml` i ścieżka do ENM, albo jawne wycofanie endpointu. Skorygować §16.1.1 spec i ADR-009. | Znika martwy kod udający działający. |
| **E1 — dokument źródłowy + XLS** | Niezmienny dokument źródłowy z hashem, parser XLS z profilem operatora, słownik oznaczeń, raport dopasowań. **Bez tworzenia modelu.** | Już tutaj powstaje raport jakości danych OSD. |
| **E2 — emisja operacji** | Szkic → kanoniczne operacje domenowe → ENM z `LineRun`, ślad pochodzenia, wpięcie w bramkę gotowości. | Pełny model sieci z danych operatora. |
| **E3 — PDF jako podkład** | Obraz podkładu, kalibracja dwupunktowa, ręczne kotwiczenie stacji. Działa dla skanów. | Weryfikacja wzrokowa importu; schemat przypomina rzeczywistość. |
| **E4 — ekstrakcja z PDF** | Odczyt tekstu i wektorów, automatyczna weryfikacja krzyżowa topologii (§3 poziom 2). | Cztery klasy ustaleń zgodności z §3 — automatycznie. |
| **E5 — obieg zwrotny** | Raport rozbieżności + eksport do formatu operatora. | Formalne domknięcie odpowiedzialności za dane. |

Test poprawności etapowania: **każdy wiersz da się zatrzymać i nadal zostawia coś użytecznego.**

---

## 10. Umiejscowienie w architekturze (kontrola granic warstw)

```
Infrastructure   parsery XLS/PDF, kalibracja, słowniki operatorów        ← ZERO fizyki
Application      uzgodnienie, emisja operacji kanonicznych, gotowość     ← ZERO fizyki
Domain           ENM, LineRun, katalog                                   ← jedyne miejsce mutacji
Solver           bez zmian                                               ← nietknięty
Presentation     trzy panele: tabela | mapa | schemat                    ← ZERO fizyki
```

Import **nie dotyka warstwy solwerów w żadnym punkcie**. Zamrożone API wyników pozostaje
zamrożone. Żadna reguła kanonu nie wymaga zmiany — co jest samo w sobie dowodem, że koncepcja
jest zgodna z systemem, a nie doklejona z boku.

---

## 11. Pytania otwarte (blokujące projekt szczegółowy)

1. **Który operator lub operatorzy?** Formaty różnią się istotnie — profil to pierwsza decyzja
   projektowa, nie szczegół implementacyjny.
2. **Jaki jest kształt arkusza?** Czy wiersz to odcinek „od stacji A do stacji B", czy płaska
   lista odcinków w obrębie obwodu bez jawnych końców? To rozstrzyga, czy topologia jest
   w XLS, czy trzeba ją odtworzyć z mapy.
3. **Jakiej klasy są pliki PDF** (§4) — eksport wektorowy z GIS czy skan? To rozstrzyga
   kolejność etapów E3/E4.
4. **Cel docelowy:** pojedyncze przyłączenie czy analiza całego ciągu? Wpływa na to, ile
   modelu trzeba odtworzyć, żeby wynik był wiarygodny.
5. **Czy dysponujesz plikami przykładowymi?** Bez nich profil operatora i słownik oznaczeń
   pozostają hipotezą.
