# KONCEPCJA — Import danych od OSD (XLS + podkład mapowy PDF)

**Status:** KONCEPCJA (burza mózgów, do decyzji właściciela — patrz §12)
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

## 4. Źródło danych po stronie operatora — Digpro dpPower (rozpoznanie 2026-07)

Rozpoznanie systemu, z którego pochodzą pliki, przestawia priorytety całej koncepcji. Jeżeli
operator pracuje na **Digpro dpPower** (system informacji o sieci, NIS), to otrzymywane XLS i PDF
są *najsłabszym* z dostępnych wyjść tego systemu — zwykłym wydrukiem tabeli i mapy.

### 4.1 Formaty eksportu dpPower / dpSpatial

| Format | Kierunek | Znaczenie dla nas |
|---|---|---|
| **Shape** | import **i eksport** | **Geometria + atrybuty w jednym pliku maszynowym.** To jest właściwy przedmiot prośby do operatora — zastępuje jednocześnie XLS i PDF. |
| **DXF / DWG** | eksport | Geometria CAD z warstwami, wybór układu współrzędnych, 2D/3D. Symbole zamieniane na linie. |
| **Plik zmian (changeset)** | eksport | Eksport przyrostowy — podstawa **utrzymania modelu w czasie**, a nie tylko jednorazowego wczytania. |
| **PNG / JPEG + plik świata** (`.pgw`, `.jgw`) | eksport | Raster **z georeferencją**, z jawnym „metr na piksel" i skalą 1:x. |
| PDF, SVG | eksport | To, co dostajesz dziś. |
| KML 2.1, GPX | eksport | Lekka geometria punktowo-liniowa. |
| XLS | eksport | „Tabele i wyniki wyszukiwania" — to najpewniej źródło Twojego arkusza. |
| DPS | import i eksport | Własny format wektorowy Digpro z atrybutami. |

**Wniosek praktyczny nr 1:** eksport rastrowy z plikiem świata oznacza, że podkład mapowy da się
georeferencować **dokładnie**. Kalibracja dwupunktowa z §5 spada do roli rozwiązania awaryjnego
dla skanów, zamiast być mechanizmem podstawowym.

**Wniosek praktyczny nr 2 — najważniejszy w całym dokumencie:** skoro istnieje eksport Shape
i eksport przyrostowy, to najlepszą wersją tej funkcjonalności może być **jednostronicowa
specyfikacja danych wejściowych dla operatora** — mówiąca wprost, który eksport uruchomić —
a nie coraz sprytniejszy parser wydruków.

### 4.2 dpPower liczy to samo, co my

Moduł **Analyzer** to pakiet obliczeń sieciowych dla zakresu 230 V – 400 kV: zwarcia trójfazowe,
dwufazowe, jednofazowe prądy zwarciowe, napięcie na uziemionych częściach, zwarcia dwufazowe
doziemne, a także napięcia zespolone, prądy, rozpływy mocy czynnej i biernej, spadki napięcia
i straty. Parametry obliczeń obejmują m.in. udary, straty obciążeniowe i jałowe, regulację
transformatorów, poziom obciążenia i czasy wykorzystania.

To ustalenie działa w dwie strony:

- **Szansa:** możemy zestawiać własne wyniki z liczbami operatora, a rozbieżność jest sama w sobie
  informacją inżynierską — i mocnym argumentem w rozmowie o warunkach przyłączenia.
- **Ryzyko pozycjonowania:** przewagą nie jest „liczymy zwarcia", bo operator też je liczy.
  Przewagą jest **biała skrzynka z dowodem** — jawny ślad IEC 60909, ProofPack i audytowalność
  wejścia (§8). Wyniki Analyzera nie trafiają do wnioskodawcy; nasz dowód trafia.

### 4.3 Model danych liniowych dpPower kontra nasz katalog

Zestaw pól danych liniowych w dpPower pokrywa się z naszym modelem niemal jeden do jednego:

| dpPower (dane liniowe) | MV-DESIGN-PRO |
|---|---|
| rezystancja fazowa [Ω/km] | `r_ohm_per_km` |
| rezystancja zerowa [Ω/km] | `r0_ohm_per_km` |
| indukcyjność fazowa [mH/km] | `x_ohm_per_km` (przez `X = 2πfL`) |
| indukcyjność zerowa [mH/km] | `x0_ohm_per_km` |
| pojemność robocza [µF/km] | `b_siemens_per_km` (przez `B = 2πfC`) |
| pojemność doziemna [µF/km] | `b0_siemens_per_km` |
| prąd znamionowy [A] | `rated_current_a` |
| prąd krótkotrwały fazy, 1 s [A] | `ith_1s_a` (= `jth × przekrój`) |
| prąd krótkotrwały żyły powrotnej [A] | `return_conductor_ith_1s_a` |
| typ ułożenia, współczynnik korekcyjny | typ ułożenia, współczynnik korekcyjny |
| temperatura maksymalna i początkowa fazy | podstawa cieplna (θmax / θkz) |

**To jest najważniejsza pojedyncza obserwacja tego rozdziału.** Parametry `R`/`X`, których żąda
obecny importer (`importer.py:81-89`), oraz obciążalność, którą zaślepia wartością `1.0`
(`importer.py:436`), **istnieją po stronie operatora w postaci strukturalnej** — po prostu nie ma
ich w arkuszu, który dostajesz. Właściwą reakcją nie jest budowa estymatora, tylko poproszenie
o właściwy eksport. Estymator zostaje wyłącznie jako ścieżka awaryjna, z jawnym oznaczeniem
`MIGRACJA` i blokadą w bramce gotowości (§6).

### 4.4 Czego nie udało się potwierdzić

- **Brak dowodu na eksport CIM/CGMES z dpPower.** To istotne, bo repo ma już gotowy importer
  CGMES (`backend/src/infrastructure/cgmes/cgmes_importer.py`) — gdyby taki eksport istniał,
  byłby ścieżką najkrótszą i niemal darmową. Do zweryfikowania u operatora, **nie do założenia**.
- Publiczna dokumentacja menu eksportu jest niekompletna (część stron zwraca 404), więc powyższa
  lista jest dolnym oszacowaniem możliwości, nie listą zamkniętą.
- Kontekst polski: Digpro prowadzi spółkę w Polsce, a materiały rejestrowe wskazują na prace
  rozwojowe nad dpPower z Enea Operator. W naszym katalogu istnieje już rodzina „standard ENEA
  Operator" (`mv_cable_line_catalog.py:174-213`), co dobrze się składa — ale przynależność
  konkretnego operatora do dpPower należy potwierdzić, a nie zakładać.

---

## 4A. Audyt rzeczywistego eksportu Shape — Tarnowo Podgórne (2026-07-27)

Analiza wykonana bezpośrednio na plikach `.shp` / `.dbf` / `.prj` / `.cpg` z paczki dostarczonej
przez właściciela. Pełny odczyt 1432 rekordów, bez próbkowania.

### 4A.1 Co paczka zawiera

| Cecha | Wartość |
|---|---|
| Obszar | Tarnowo Podgórne, pow. poznański; 8,89 × 4,64 km |
| Zasięg | 52,4447–52,4911 N · 16,5773–16,7037 E (odwrotna transformacja z parametrów `.prj`) |
| Układ | ETRS89 / PL-2000 strefa 7 (południk osiowy 21°, wschodnie 7 500 000) |
| Kodowanie | UTF-8 (jawny `.cpg`) |
| Warstwy | 20 plików Shape, w tym 17 elektrycznych |
| Obiekty | 1377 elektrycznych + 55 informacyjnych |
| Geometria | 180,4 km łącznie (SN kabel 89,5; SN napowietrzna 51,7; kabel wlz 17,0; 110 kV 19,6) |

Warstwy odwzorowują dokładnie te pojęcia, którymi operuje nasz model: stacja słupowa
i wnętrzowa (własna oraz obca), GPZ, punkt dystrybucyjny, **złącze rozgałęźne**, odłącznik
i rozłącznik sieciowy, kabel, kabel wlz, odcinek linii napowietrznej, generator.

Rozszyfrowana taksonomia `dp_otype` (podstawa profilu operatora z §6):

| Kod | Obiekt | Kod | Obiekt |
|---|---|---|---|
| 700101 | Kabel | 702004 | Stacja słupowa |
| 700102 | Odcinek linii napowietrznej | 702005 | Stacja wnętrzowa |
| 700111 | Kabel wlz | 703000 | Punkt dystrybucyjny |
| 702001 | Stacja GPZ | 704075 / 704077 / 704085 | Odłącznik / rozłącznik / inne urządzenie rozłączające |
| 702002 / 702003 | Stacja słupowa / wnętrzowa obca | 709070 | Złącze rozgałęźne |
| 710000 | Generator | 730000 | Obiekt informacyjny |

`dp_subtype` koduje poziom napięcia: `6` = 15 kV, `9` = 110 kV, `13` = 220 kV, `16` = 400 kV.

### 4A.2 Czego paczka nie zawiera — i to jest sedno

**Wszystkie warstwy mają identyczny zestaw 11 kolumn systemowych Digpro. Ani jednego atrybutu
inżynierskiego.** Brakuje: przekroju, materiału żyły, typu katalogowego, długości trasowej,
nazwy i numeru obiektu, numeru obwodu, węzłów końcowych, stanu łączeniowego, danych
transformatorów, impedancji i obciążalności.

To jest eksport **warstwy rysunkowej**, nie modelu sieci — potwierdza to sama treść pola
`sub_c_type`: „Kabel, 15 kV — Linia 1, **mapa**".

Istotny trop: dołączone pliki `_info.csv` to słownik danych z kolumnami `Tabela` i `Pole`,
które są **puste dla wszystkich pozycji**. Szablon eksportu ma więc gotowe miejsce na atrybuty
z bazy — po prostu nie podpięto do niego ani jednego. To zmienia charakter prośby do operatora
z „przygotujcie nam dane" na „uruchomcie ten sam eksport z podpiętymi kolumnami".

### 4A.3 Dane odzyskane z pól symbolicznych — sprostowanie do §4A.2

Weryfikacja „czy przekroje nie są gdzieś zaszyte" dała odpowiedź jednoznacznie negatywną
co do przekrojów, ale ujawniła dane merytoryczne w polach, które w pierwszym podejściu odpisałem
jako czysto graficzne. **§4A.2 pozostaje w mocy co do parametrów elektrycznych; poniższe je uzupełnia.**

**Dowód wyczerpania poszukiwań przekroju:**

1. Archiwum: 120 plików, wyłącznie 6 rozszerzeń (`.shp`, `.shx`, `.dbf`, `.prj`, `.cpg`,
   `_info.csv`). Brak metadanych (`.xml`, `.qmd`, `.lyr`, `.sld`) i brak plików memo
   (`.dbt`, `.fpt`), w których DBF mógłby trzymać treść poza rekordem.
2. Nagłówki DBF: `reclen == suma szerokości pól + 1` we **wszystkich 20 warstwach**,
   ogon pliku = 1 bajt (znacznik `0x1A`). **Zero nieodczytanych bajtów, zero ukrytych pól.**
3. Warstwy przewodowe mają dokładnie 11 pól. Wyliczyłem **pełny zbiór wartości każdego pola
   we wszystkich 1432 rekordach** — żadne nie jest przekrojem ani oznaczeniem katalogowym.
4. Wszystkie 20 plików `_info.csv`: tylko dwa zestawy pól (11 i 16), kolumny `Tabela` i `Pole`
   **puste w 20 z 20**.

**Znalezisko 1 — punkty normalnie otwarte SĄ w danych.** Osiem aparatów (5 odłączników,
3 rozłączniki) niesie drugi komponent mapowy: `dp_ctype=4041`, `sub_c_type="Symbol rozłączenia"`,
`font_id=DEC79PP`, współdzielący `dp_oid` z komponentem podstawowym. Potwierdzenie krzyżowe:
niezależne pole `dp_dsp_flg=3` wskazuje 7 z tych samych 8 aparatów. Wszystkie są w stanie
„Funkcjonujący", wszystkie leżą na przewodzie (0,38–2,84 m od końca przęsła) i są rozproszone
po obszarze (mediana wzajemnej odległości 1,32 km) — rozkład spójny z punktami podziału ciągów,
a nie z artefaktem rysunkowym.

To odwzorowuje się wprost na `LineRun.nop_station_ref` i operację `set_normal_open_point`.

**Znalezisko 2 — `font_id` koduje typ konstrukcyjny stacji i podtyp aparatu.** Odczyt
potwierdzony niezależnie: dla stacji odwzorowanie `font_id` ↔ `dp_dsp_flg` jest **1:1 we
wszystkich warstwach stacyjnych**, więc nie jest to interpretacja, tylko dwa kodowania tej samej
cechy.

| `font_id` | `dp_dsp_flg` | Liczba | Odpowiednik w `Substation.construction_type` |
|---|---|---|---|
| `M_SLUP` | 1005 | 49 | `slupowa` |
| `M_KONT` | 1007 | 42 | `kontenerowa` |
| `M_MIEJ` | 1001 | 41 | `wnetrzowa` (miejska) |
| `M_WNETRZ` | 0 | 10 | `wnetrzowa` |
| `M_WBUD` | 1015 | 7 | `wnetrzowa` (wbudowana) |
| `M_WIEZ` | 1002 | 2 | `wnetrzowa` (wieżowa) |
| `M_GPZ`, `M_GPZ1156` | 1041, 1042 | 2 | GPZ |

Dla aparatów `font_id` niesie podtyp, a `dp_dsp_flg` stan — stąd brak zgodności 1:1:
`ODL` 102, `ROZL` 43, **`ROZL_RADIO` 6 (rozłączniki sterowane radiowo)**, `INNE` 10.

**Znalezisko 3 — sześć „generatorów" to mikroinstalacje fotowoltaiczne** (`font_id=MIKRO_SOL`,
`font=FPPSYM`). Istotne dla oceny przyłączenia: w obszarze jest już czynne wytwarzanie rozproszone.

**Ograniczenie `dp_dsp_flg` dla przewodów.** Wartości 111 (kabel) i 113 (kabel wlz) korelują
ze stanem planowanym, ale **nie pokrywają się z nim dokładnie** (10 kabli „Projektowany" ma
flagę 0). To flaga stylu rysunkowego, nie niezależne źródło informacji — a rozbieżność sama
w sobie jest obserwacją o jakości danych. Jedynym wiarygodnym kryterium istnienia pozostaje
`state_name`.

### 4A.4 Trzy ustalenia, które zmieniają projekt

**(1) `dp_oid` jest stabilnym kluczem złączenia.** 1369 unikalnych identyfikatorów na 1377
rekordów elektrycznych. Drugi eksport, ten z atrybutami, da się zestawić z geometrią jeden
do jednego. **Nie trzeba prosić o wszystko od nowa.**

> **Sprostowanie (2026-07-27).** Wcześniejsza wersja tego akapitu przypisywała 8 duplikatów
> `dp_oid` obiektom informacyjnym. To było błędne: w warstwach elektrycznych duplikaty to
> dokładnie te aparaty, które mają drugi komponent „Symbol rozłączenia" (§4A.3, znalezisko 1).
> Duplikaty w obiektach informacyjnych (24 sztuki) to osobne zjawisko i dotyczą warstw
> nieelektrycznych. Klucz pozostaje użyteczny — złączenie należy wykonywać po parze
> (`dp_oid`, `dp_ctype`), a nie po samym `dp_oid`.

**(2) Topologii nie da się odtworzyć bezpiecznie.** Eksport nie zawiera relacji „od węzła —
do węzła". Jedyną drogą jest sklejanie końców odcinków po współrzędnych; wynik przemiatania
tolerancji dla 949 odcinków SN i WN:

| Tolerancja [m] | Końce wiszące | Komponenty spójne | Największy komponent [odc.] | Urządzeń trafionych w węzeł (z 428) |
|---|---|---|---|---|
| 0,01 | 882 | 431 | 35 | 124 |
| 1 | 631 | 294 | 62 | 264 |
| 2 | 477 | 202 | 152 | 307 |
| 10 | 208 | 63 | 610 | 388 |

Nie istnieje bezpieczny próg: przy 1 cm sieć rozpada się na 431 fragmentów, a przy 10 m skleja
się kosztem łączenia obiektów niezwiązanych (sąsiednie kable w stacji, aparat z mufą, dwa
niezależne ciągi wzdłuż tej samej drogi). Zysk i błąd rosną razem i nie są rozróżnialne.
**To empiryczne potwierdzenie zasady zero z §2** — topologia z takiego pliku może być wyłącznie
propozycją do zatwierdzenia przez człowieka.

**(3) 7,8 % obiektów nie istnieje.** Pole `state_name` — jedyny atrybut merytoryczny w paczce —
rozróżnia sieć istniejącą od planowanej, projektowanej i koncepcyjnej. Nieistniejących obiektów
jest 108, a w kilometrach: **34,2 km kabla SN z 106,6 km**. Naiwny import zamodelowałby sieć
docelową zamiast istniejącej. Szczególnie jaskrawe jest to dla kabla wlz: z 17,0 km istnieje
1,25 km.

Naturalne odwzorowanie: sieć istniejąca jako model bazowy, warianty rozwojowe jako osobne
przypadki obliczeniowe — czyli dokładnie to, co architektura już wymusza (§7 pkt 6).

### 4A.5 Uwaga o układzie współrzędnych

Plik `.prj` deklaruje strefę 7 PL-2000, podczas gdy obszar (16,6° E) leży w nominalnym zakresie
strefy 6. Parametry są wewnętrznie spójne z danymi — odwrotna transformacja daje prawidłową
lokalizację — ale oznacza to pracę ~300 km od południka osiowego, co dokłada ok. 0,1 % skali
odwzorowawczej. Praktyczne skutki: (a) narzędzia egzekwujące zasięg strefy mogą odrzucić plik,
(b) długości liczone z geometrii są zawyżone o ok. 0,1 %, co dla 89,5 km kabla daje ~90 m.

To dodatkowy argument za regułą z §3: **długość musi przyjść jako atrybut, nie z geometrii.**
Geometria mapy to w dodatku trasa, a nie długość przewodu — bez zapasów i bez profilu pionowego.

### 4A.6 Czy da się przypiąć długość do odcinka — analiza rozstrzygająca

Pytanie rozpada się na dwa niezależne: **ile mierzy narysowany obiekt** (rozstrzygalne)
i **czym jest „odcinek"** (rozstrzygalne tylko częściowo).

**Łańcuch wyprowadzenia długości.** Długość płaska z polilinii → poprawka odwzorowawcza
liczona punktowo dla każdego obiektu (`k = k₀(1 + x²/2R² + x⁴/24R⁴)`, `x` = odległość od
południka osiowego) → długość terenowa. W zbiorze `k ∈ [1,0009679; 1,0010319]`; sumarycznie
133,713 km z mapy odpowiada **133,580 km w terenie (−132,9 m)**. To poprawka **ścisła**,
nie szacunek — wynika z parametrów w `.prj`.

**Klasa wiarygodności podstawy geometrycznej** (tylko obiekty istniejące):

| Klasa | Podstawa | Odcinków | Długość | Dowód z danych |
|---|---|---|---|---|
| **A** | trasa rzeczywista | 195 | 65,355 km | 18,6 wierzch./odcinek, odstęp 12,1 m, **krętość mediana 1,2186**, 90 % > 1,02 |
| **B** | rozpiętość przęsła | 584 | 61,281 km | 100 % dwuwierzchołkowe, krętość dokładnie 1,0000, mediana przęsła 97,5 m |
| **C** | linia prosta / uproszczona | 106 | 6,945 km | kable rysowane schematycznie (80 % kabla wlz) — wyłącznie wartość dolna |

**Korekta obrazu z §4A.4.** Rozspójnienie na 431 komponentów było w znacznej mierze artefaktem
mieszania warstw. W obrębie jednej warstwy dopasowanie końców jest **ścisłe do 1 mm**:

- napowietrzna 15 kV: 554 przęsła → 117 ciągów, w tym **99 bez rozgałęzień**; najdłuższy
  4,232 km / 35 przęseł,
- 110 kV: jeden ciąg 13,419 km / 26 przęseł,
- kabel: 242 komponenty z 275 obiektów (484 z 517 końców ma stopień 1) — **każdy kabel jest już
  kompletnym przebiegiem, nie fragmentem**.

Wniosek: dla sieci napowietrznej długość odcinka między rozgałęzieniami **jest wyprowadzalna**
przez sumowanie przęseł. Realną granicą jest styk kabel↔linia: 69 % końców kabli leży dalej
niż 50 m od jakiegokolwiek przęsła — to w dużej mierze dwie rozdzielne sieci.

**Dowiązanie urządzeń do przewodu** (pomiar odległości do najbliższego końca):

| Obiekt | Rozkład | Wniosek |
|---|---|---|
| Odłącznik sieciowy | 92 % ≤ 0,5 m (78 % w paśmie 0,1–0,5 m) | dowiązanie bezpieczne |
| Stacja wnętrzowa / słupowa | ~70 % w paśmie 1–2 m, ogon do 5 m | stały offset symbolu; próg 2–3 m z weryfikacją |
| Złącze rozgałęźne, punkt dystrybucyjny | rozrzut 0,1–50 m | wyłącznie ręcznie |

**Czego z mapy wyprowadzić się nie da:**

- **Trasa ≠ długość przewodu.** Dla kabla brakuje zapasu przy głowicach i muftach, wejść
  i wyjść na głębokość układania oraz falowania w rowie — rzędu +1…3 %, nieobliczalne z danych.
- **Szum digitalizacji zawyża długość.** Przy odstępie wierzchołków 12,1 m i błędzie położenia
  σ = 0,5…1 m oczekiwane zawyżenie wynosi `σ²/s`, czyli +0,2…0,7 %. Działa przeciwnie do
  brakującego zapasu, ale ich wzajemne zniesienie jest zbiegiem okoliczności, nie metodą —
  nie wolno go traktować jako korekty.
- **Przypisanie do nazwanej stacji** — w paczce nie ma ani jednej nazwy.

**Bilans.** Ze 133,6 km sieci istniejącej długość da się odpowiedzialnie przypiąć do 126,6 km
(95 %): **61,3 km klasy B nadaje się do obliczeń wprost** (błąd < 0,2 %), **65,4 km klasy A
wymaga jawnego narzutu zapasu** do uzgodnienia z operatorem, a 6,9 km klasy C należy odrzucić.
Każda wartość zapisywana z `parameter_source` i śladem pochodzenia wg §8.

### 4A.7 Dlaczego atrybutów nie ma — mechanizm ustalony (2026-07-28)

Rozpoznanie formatów wymiany dpPower dało dowód, a nie hipotezę.

**Okno eksportu Shape w dpPower zawiera przycisk „Välj objekttyper och attribut"**
(wybierz typy obiektów i atrybuty). Dla każdego zaznaczonego typu przycisk „Välj" otwiera
konfigurację *„vilka attribut som ska exporteras"* — które atrybuty mają zostać wyeksportowane.
Konfigurację można **zapisać jako szablon i udostępnić** do powtarzalnych eksportów.

Dokumentacja opisuje też strukturę manifestu atrybutów towarzyszącego eksportowi — siedem
kolumn: pole DBF, tabela, nazwa pola, opis, typ obiektu, typ komponentu, komponent powtarzalny.
**To jest dokładnie nagłówek naszych plików `_info.csv`** (§4A.2):

```
Pole DBF;Tabela;Pole;Opis;Typ obiektu;Typ komponentu;Komponent powtarzalny;Pochodzenie;
```

Wniosek jest jednoznaczny: **puste kolumny `Tabela` i `Pole` w 20 z 20 plików oznaczają, że
w oknie eksportu nie zaznaczono żadnego atrybutu.** Jedenaście pól `dp_*` to systemowy zestaw
domyślny, który wychodzi zawsze. Brak przekrojów nie jest ograniczeniem formatu ani systemu —
to niezaznaczone pola w oknie dialogowym. Poprawka leży po stronie konfiguracji eksportu
i jest zapisywalna jako szablon.

**Ocena pozostałych formatów wymiany:**

| Format | Kierunek | Ocena dla naszego celu |
|---|---|---|
| **Shape z zaznaczonymi atrybutami** | imp./eksp. | **Właściwy.** Zachowuje zweryfikowaną geometrię, stany, punkty podziału i typy stacji; złączenie po `(dp_oid, dp_ctype)`. |
| CIM/CGMES | niepotwierdzony | Gdyby istniał — najkrótsza droga (gotowy importer w repo). |
| `Geo data (.dpt)` | imp./eksp. | Unosi `attr1…attr10` oraz `linjenr` (przynależność wierzchołków). Wymaga legendy pól. |
| **DPS** | imp./eksp. | **Niewłaściwy instrument.** Patrz niżej. |
| Geodos, Trimble, GSI, Marit, PXY, TXY, HP-17, STP | imp./eksp. | Formaty geodezyjne: numer punktu, kod obiektu, X, Y, Z. **Bez atrybutów pozageometrycznych.** |

**DPS — dlaczego odpada.** Tabela formatów opisuje DPS jako „dane geo z atrybutami", a jego
przeznaczeniem jest wymiana z klientem terenowym `dpFieldmap` w trybie offline, gdzie technik
ogląda **i edytuje** obiekty bez połączenia — co funkcjonalnie wymaga, by atrybuty z nim
podróżowały. Problem leży gdzie indziej: **eksport DPS działa na zbiorze zmian, nie na sieci.**
Dokumentacja funkcji mówi wprost o zapisie „części lub całości bieżącego zbioru zmian"
(*förändringsset*), a jedyne dwie opcje to grafika swobodna albo cały zbiór zmian.

Praktyczny skutek jest poważny: plik DPS od operatora zawierałby to, co akurat jest w edycji —
a zbiór zmian to typowo **nowe prace projektowe**, czyli dokładnie te obiekty planowane
i koncepcyjne, przed którymi ostrzega §4A.4 (34,2 km nieistniejącego kabla). Ryzyko otrzymania
pliku, który wygląda bogato, a opisuje sieć nieistniejącą, jest realne.

Dodatkowo struktura rekordu DPS **nie jest publikowana** w dokumentacji Digpro — parsowanie
wymagałoby inżynierii wstecznej. Wykonalne (tak powstał czytnik SHP/DBF użyty w tym audycie),
ale niepotrzebne, skoro właściwa droga to jedno okno dialogowe.

### 4A.8 Wniosek operacyjny — treść prośby do operatora

1. Ten sam eksport Shape, ale z zaznaczonymi atrybutami w oknie „wybierz typy obiektów
   i atrybuty" (§4A.7) — przekrój, materiał, typ katalogowy, długość trasowa, nazwa obiektu,
   numer obwodu. Prosić o **zapisanie konfiguracji jako szablonu**, żeby kolejne eksporty
   nie wymagały powtarzania ustawień.
2. Relacje topologiczne: węzeł początkowy i końcowy odcinka. Jeśli Shape ich nie unosi —
   tabela powiązań po `dp_oid`.
3. Potwierdzenie 8 punktów podziału zidentyfikowanych z komponentu „Symbol rozłączenia"
   (§4A.3) oraz odpowiedź, czy lista jest kompletna — czy każdy aparat otwarty jest tak
   oznaczany, czy tylko część.
4. Dane transformatorów w stacjach: moc, przekładnia, napięcie zwarcia.
5. Pytanie kontrolne o eksport CIM/CGMES (§4.4) — czyni punkty 1–4 bezprzedmiotowymi.

---

## 5. PDF — co realnie da się z niego wyciągnąć (uczciwie)

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

## 6. Przekrój → typ katalogowy — sedno wartości i sedno ryzyka

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

## 7. Gdzie z tego bierze się realna wartość (maksymalne wykorzystanie)

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

## 8. Ślad pochodzenia — dlaczego to jest teza, a nie dodatek

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

## 9. Ryzyka i świadome „nie"

| Ryzyko | Decyzja |
|---|---|
| Geometria z mapy wpełza do fizyki | Długość **wyłącznie** z XLS lub jawnego pomiaru. Mapa nie mierzy. |
| Automatyczne przyjmowanie dopasowań rozmytych | Zakazane poniżej progu. Zawsze propozycja + decyzja człowieka. |
| Zgadywanie R/X z przekroju | Zakazane. Brak trafienia = element niekompletny + blokada w bramce gotowości. |
| Utrata determinizmu | Wszystkie decyzje uzgodnienia zapisywane jako dane; identyfikatory z hasza treści; brak znaczników czasu w kluczach. Te same pliki → ten sam hash ENM. |
| OCR jako źródło prawdy | Zakazane. Wyłącznie podpowiedź do potwierdzenia. |
| Rozrost formatu „uniwersalnego" | Nie budujemy jednego formatu na wszystkich operatorów. Budujemy **profile operatora** — to jawna, wersjonowana dana, nie gałąź w kodzie. |

---

## 10. Etapowanie — każdy etap oddaje wartość samodzielnie

| Etap | Zakres | Wartość po zakończeniu |
|---|---|---|
| **E-1 — specyfikacja danych wejściowych** (bez kodu) | Jednostronicowy dokument dla operatora: który eksport uruchomić (Shape zamiast XLS + PDF), jakie atrybuty załączyć, plik świata do rastra, pytanie o CIM/CGMES. | **Najwyższy stosunek wartości do kosztu w całym planie.** Może zredukować zakres E1/E4 o rząd wielkości. |
| **E0 — naprawa fundamentu** | Rozstrzygnąć los `/api/import/xlsx`: albo `openpyxl` do `pyproject.toml` i ścieżka do ENM, albo jawne wycofanie endpointu. Skorygować §16.1.1 spec i ADR-009. | Znika martwy kod udający działający. |
| **E1 — dokument źródłowy + XLS** | Niezmienny dokument źródłowy z hashem, parser XLS z profilem operatora, słownik oznaczeń, raport dopasowań. **Bez tworzenia modelu.** | Już tutaj powstaje raport jakości danych OSD. |
| **E2 — emisja operacji** | Szkic → kanoniczne operacje domenowe → ENM z `LineRun`, ślad pochodzenia, wpięcie w bramkę gotowości. | Pełny model sieci z danych operatora. |
| **E3 — mapa jako podkład** | Obraz podkładu; georeferencja z pliku świata, gdy operator go dostarczy (§4.1), kalibracja dwupunktowa jako ścieżka awaryjna dla skanów. | Weryfikacja wzrokowa importu; schemat przypomina rzeczywistość. |
| **E4 — ekstrakcja z PDF** | Odczyt tekstu i wektorów, automatyczna weryfikacja krzyżowa topologii (§3 poziom 2). | Cztery klasy ustaleń zgodności z §3 — automatycznie. |
| **E5 — obieg zwrotny** | Raport rozbieżności + eksport do formatu operatora. | Formalne domknięcie odpowiedzialności za dane. |

Test poprawności etapowania: **każdy wiersz da się zatrzymać i nadal zostawia coś użytecznego.**

---

## 11. Umiejscowienie w architekturze (kontrola granic warstw)

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

## 12. Pytania otwarte (blokujące projekt szczegółowy)

1. **Który operator lub operatorzy?** Formaty różnią się istotnie — profil to pierwsza decyzja
   projektowa, nie szczegół implementacyjny.
2. **Jaki jest kształt arkusza?** Czy wiersz to odcinek „od stacji A do stacji B", czy płaska
   lista odcinków w obrębie obwodu bez jawnych końców? To rozstrzyga, czy topologia jest
   w XLS, czy trzeba ją odtworzyć z mapy.
3. **Jakiej klasy są pliki PDF** (§5) — eksport wektorowy z GIS czy skan? To rozstrzyga
   kolejność etapów E3/E4.
4. **Cel docelowy:** pojedyncze przyłączenie czy analiza całego ciągu? Wpływa na to, ile
   modelu trzeba odtworzyć, żeby wynik był wiarygodny.
5. **Czy dysponujesz plikami przykładowymi?** Bez nich profil operatora i słownik oznaczeń
   pozostają hipotezą.
6. **Czy operator pracuje na dpPower** (§4)? Jeśli tak, pierwszym krokiem nie jest kod, tylko
   prośba o eksport Shape zamiast XLS + PDF — oraz pytanie wprost o eksport CIM/CGMES (§4.4),
   który skróciłby całą drogę do gotowego już importera w repo.
