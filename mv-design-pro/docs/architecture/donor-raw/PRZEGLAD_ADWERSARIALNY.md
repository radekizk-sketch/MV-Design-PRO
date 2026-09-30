> **MATERIAŁ SUROWY — PRZEGLĄD ADWERSARIALNY (bramka §17 mandatu), NIE JEST DECYZJĄ.**
> Niezależna próba obalenia rekomendacji audytu, 2026-09-07. **Znalazła realne błędy** —
> wszystkie zweryfikowałem osobiście i naniosłem korekty w dokumentach wiążących
> (`OPEN_SOURCE_DONOR_AUDIT.md`, `DONOR_DECISION_MATRIX.md`, `DONOR_ADOPTION_ARCHITECTURE.md`,
> `DONOR_IMPLEMENTATION_BACKLOG.md`) oraz w kodzie. Rejestr korekt: `DONOR_AUDIT_CHECKPOINT.md`
> F-19…F-22 i sekcja M macierzy decyzji.
> Gdzie ten plik jest sprzeczny z dokumentami wiążącymi — **tamte wygrywają**.

# PRZEGLĄD ADWERSARYJNY — audyt donorów MV-DESIGN-PRO

**Rola:** próba OBALENIA rekomendacji, nie ich poparcia. **Data:** 2026-09-07.
**Baza sprawdzana:** working tree na `claude/mv-design-pro-donor-audit-vnuqd1`
(HEAD `67fe9b381` + niescalone zmiany zamiatania osieroconych biegów).
**Metoda:** każde twierdzenie odtworzone z kodu albo z pomiaru w działającym
`poetry` env backendu. Klony donorów: `scratchpad/donor/src/` (wszystkie 12 obecne).

---

## 0. Werdykt w jednym zdaniu

**Trzy karty adopcyjne (D-1, D-2, D-3) przeżywają co do KIERUNKU.**
**Trzy pomiary nośne NIE przeżywają:** F-18/F-10 (0,4 s z 170,9 s), F-3 (konsumenci
`cadRoutingContract`), F-16 (haszowanie jako „wniosek nieunikniony").
**Dwie luki (L2, L3) są zdublowane z istniejącym kodem MV**, którego audyt nie
otworzył, a jedna (L6) jest przeszacowana. **L1, L4, L5, L7 trzymają.**
Licencje: **11/11 potwierdzonych osobiście, zero pomyłek.**
W naprawie defektu sesji znalazłem **pięć wad**, z czego jedną krytyczną dla
przyszłego DT-12 i jedną fałszywą deklarację w treści commita.

---

## 1. POMIAR NOŚNY OBALONY — „cała algebra to 0,4 s ze 170,9 s (0,2 %)"

To jest twierdzenie, na którym stoi **REJECT power-grid-model** (macierz D3,
architektura §3, backlog TOP-3-odrzucamy #1) i zdanie „żaden donor solverowy
tego nie naprawia".

### 1.1 Co potwierdziłem
Odtworzyłem substrat `sld_substrate_52s` i zmierzyłem sam:

| Wielkość | Audyt (F-18) | Mój pomiar | Zgoda |
|---|---|---|---|
| stacje / szyny ENM / gałęzie ENM | 53 / 315 / 261 | 53 / 315 / 261 | ✔ |
| węzły grafu / gałęzie / łączniki | 315 / 143 / 172 | 315 / 143 / 172 (171 zamkniętych) | ✔ |
| **wymiar Y-bus** | **144 × 144** | **144 × 144** | ✔ |
| `build_zbus` (build+inv) | 2,5 ms | 1,67 ms (ta maszyna) | ✔ co do rzędu |

**Wymiar 144×144 jest prawdziwy. Obalenie oszacowania agenta SOLVERS (n≈1200,
197 s) jest słuszne.** To zostaje.

### 1.2 Co OBALIŁEM — profil rzeczywistego biegu
`cProfile` na `enm.canonical_analysis._execute_short_circuit` (3F, ta sama sieć,
ten sam kod, co mierzy `scripts/benchmark_baseline.py::mierz_b4`):

```
_execute_short_circuit                                   15,0 s   (107 wyników)
  canonical_analysis.py:127  _niefinitowe_na_none   tot 4,725 s / cum 6,018 s  ← 41 %
                                       2 975 194 wywołań, 11 760 827 × isinstance
  short_circuit_iec60909.py:764 _build_branch_contributions_for_inverters
                                                    tot 1,739 s / cum 5,271 s
  short_circuit_core.py:46   build_zbus       535 wywołań, cum 1,755 s  ← 12 %
     w tym numpy.linalg.inv  535 wywołań, 0,712 s                      ←  5 %
```

Trzy błędy w pomiarze audytu:

1. **Licznik.** `build_zbus` biegnie **535 razy, nie 144** — to **5 wywołań na
   węzeł zwarciowy** × 107 węzłów raportowalnych (`short_circuit_core.py:78`,
   `short_circuit_iec60909.py:644`, `:785`, `:909`, `machine_sc_iec60909.py:184`).
   F-9 mówi „N pełnych budów i N inwersji" — jest 5N. F-18 mnoży przez 144 węzły,
   a solver skanuje 107.
2. **Mianownik.** 0,4 s odniesiono do **170,9 ms×10³ zmierzonych na pełnej trasie
   HTTP** `POST /api/execution/runs/{id}/execute`. To iloraz dwóch różnych
   wielkości: wyizolowany prymityw / cała końcówka. Wewnątrz jednego biegu
   solvera algebra to **12 %, nie 0,2 %**.
3. **„Przyczyna niezdiagnozowana".** F-10 tłumaczy się „brak zainstalowanego
   środowiska backendu w tej sesji". Środowisko **działa**
   (`poetry run python`, Python 3.11.15, numpy 1.26.4, scipy 1.17.0). Jeden
   przebieg `cProfile` nazywa gorące miejsce:
   **`enm/canonical_analysis.py:127 _niefinitowe_na_none` — 41 % czasu biegu SC.**
   Funkcja rekurencyjnie **kopiuje cały payload każdego wiersza wyniku** (razem z
   `white_box_trace` i `branch_contributions`) i buduje f-stringową ścieżkę dla
   KAŻDEGO liścia, żeby zamienić NaN/inf na `None`. Wołana z linii 2028 przez
   `_oznacz_wiersz_zwarcia_niefizyczny` **dla każdego ze 107 wierszy**.
   To nie jest solver, nie jest algebra i **nie dotyka jej żaden donor** —
   to warstwa aplikacyjna MV.

### 1.3 Skutek dla rekomendacji
**Decyzja REJECT/DEFER power-grid-model PRZEŻYWA — i jest teraz LEPIEJ
uzasadniona** (wąskie gardło to sanityzacja payloadu w warstwie aplikacyjnej,
której wymiana solvera nie ruszy). **Liczba użyta w uzasadnieniu upada.**

**Do poprawienia w dokumentach (3 miejsca):** macierz D3, architektura §3,
backlog TOP-3-odrzucamy #1 — zamienić „cała algebra to 0,4 s z 170,9 s (0,2 %)"
na zmierzone: *„algebra to 1,76 s z 15,0 s biegu solvera (12 %); dominującym
kosztem biegu jest `_niefinitowe_na_none` (41 %), a ~90 % zmierzonych 170,9 s
leży POZA `_execute_short_circuit`"*. Zdanie „przyczyna niezdiagnozowana"
przestaje być prawdziwe — jest wskazany podejrzany z profilem.

---

## 2. POMIAR OBALONY — F-3 / L7 / D-6 („7 z 8 eksportów bez konsumentów")

### 2.1 Co jest naprawdę
`frontend/src/ui/sld/v2/geometry/cadRoutingContract.ts` (270 linii) ma
**19 eksportów, nie 8 ani 9**. I:

```
grep -rn "cadRoutingContract" src/ --include=*.ts --include=*.tsx
  (poza samym plikiem)
→ src/ui/sld/v2/__tests__/scadaComplianceContract.test.ts:154   (asercja ISTNIENIA pliku)
→ src/ui/sld/v2/geometry/__tests__/cadRoutingContract.test.ts:20 (test jednostkowy)
```

**ŻADEN plik produkcyjny nie importuje tego modułu.** Zero, nie „jeden żywy".

### 2.2 Skąd wzięło się „snapToGrid = 12"
Zliczono **wystąpienia nazwy**, nie rozwiązanie importu. `snapToGrid` istnieje w
**trzech** miejscach:

| Plik | Status |
|---|---|
| `v2/theme/tokens.ts:342` | **ŻYWY** — importują `ViewportController.ts`, `v2/geometry/routing.ts` |
| `v3/core/grid.ts:11` | **ŻYWY** — importuje `buildScene`, `compose/station`, `compose/gpz`, `layout/segments`, `layout/measure`, `layout/labels` |
| `v2/geometry/cadRoutingContract.ts:82` | **MARTWY** |

To samo dotyczy `SymbolPort` (`cadRoutingContract.ts:28` martwy vs
`v3/core/grid.ts:46` żywy).

### 2.3 Skutki dla karty D-6
1. Karta jest **mocniejsza** niż napisano — plik jest martwy w 100 %.
2. **Instrukcja „`snapToGrid` przenieść tam, gdzie jest używany" jest błędna** —
   opiera się na fałszywym pomiarze; wykonana dosłownie byłaby albo pusta, albo
   utworzyłaby **czwartą** kopię tego samego jednolinijkowca. Właściwa akcja to
   zwykła kasacja pliku.
3. **Karta nie wymienia `scadaComplianceContract.test.ts:154`**, który
   `expect(fileExists('ui/sld/v2/geometry/cadRoutingContract.ts')).toBe(true)` —
   kasacja go wywali. To DOKŁADNIE ta sama pułapka, którą audyt poprawnie
   zauważył dla `test_wymagane.py` w karcie D-7. Procedura siedmiu kroków musi
   zdjąć również tę asercję.
4. **Duplikacja, której audyt szukał i nie znalazł:** dwie ŻYWE, identyczne
   implementacje `snapToGrid` (`v2/theme/tokens.ts` i `v3/core/grid.ts`) —
   „dwie ścieżki tego samego" w rozumieniu ZASADY NR 3. Audyt zatrzymał się na
   martwej trzeciej.

### 2.4 Ta sama metoda zliczania psuje F-2
Konsumenci produkcyjni `v3/layout/route.ts` — 3 z 5 liczb są błędne:
`buildRoute` = **1** (nie 2), `routeOrthogonal` = **0** (nie 1),
`classifyRouteNodes` = **5** (nie 2); `endsAtPorts` = 2 ✔, `routeAvoidsObstacles` = 1 ✔.
**Wniosek F-2 (router jest żywy) trzyma** — `buildScene.ts:124`, `compose/station.ts:66`,
`compose/gpz.ts:51`, `canvas/SldCanvasV3.tsx:67`, `scene/crossings.ts:28`,
`canvas/hitAreas.ts:54` importują go wprost. Ale liczby w checkpoincie są
niewiarygodne i nie należy ich cytować.

---

## 3. F-16 — mechanizm PRAWDZIWY, wyprowadzenie PRZESZACOWANE

F-16 jest nazwane „rozstrzygnięciem nośnym" architektury i „wnioskiem
nieuniknionym, wyprowadzonym z kodu haszowania, nie z preferencji".

### 3.1 Co potwierdziłem (empirycznie, na sieci 52 stacji)
`_kopia_pod_hash` (`enm/hash.py:301`) rzeczywiście przepisuje **wszystkie**
klucze najwyższego poziomu gałęzią `else: data[klucz] = wartosc`.
`model_dump(mode="json")` **nie** używa `exclude_none`/`exclude_defaults`, więc
pole opcjonalne pojawia się w zrzucie nawet nieustawione. Mierzone:

| Test | Wynik |
|---|---|
| A. `+ placements = []` (kolekcja PUSTA) | `hash_migawki_enm` **zmieniony** |
| B. `+ placements = [1 wpis]` | **zmieniony** |
| C. `+ Substation.order_hint` (pole na elemencie) | **zmieniony** |
| `_semantic_payload` (biała lista) | **odporny** ✔ |

**Mechanizm opisany w F-16 jest prawdziwy.**

### 3.2 Co OBALIŁEM
Zdanie „wariant «dodajmy addytywnie, pola opcjonalne nie zaszkodzą» jest
**technicznie błędny**" i „wniosek **nieunikniony**" — **nieprawda**.

| Test | Wynik |
|---|---|
| D. po dodaniu `placements` do wykluczenia w `_kopia_pod_hash` (1 linia) | **hash IDENTYCZNY z bazowym** |

I nie jest to hipotetyczne. **Repo już to zrobiło**: `_POLA_NAGLOWKA_POZA_HASHEM`
= `("updated_at", "created_at", "hash_sha256", "connection_conditions")`, a
komentarz przy `connection_conditions` mówi wprost: *„deklaracja pola w ENMHeader
(naprawa defektu utrwalania, karta POMIAR-RODZAJ) nie może przestawić odcisków
istniejących modeli"*. **Dodanie pola hasz-neutralnie to rozwiązany, precedensowy
jednolinijkowiec.**

### 3.3 Skutek
**Decyzja (Presentation Store POZA ENM) PRZEŻYWA** — ale na innych przesłankach,
które dokument i tak już podaje i które są mocne:
DT-1 (brak drugiej klasy modelu), prawo 3.4 (kasowalność całego magazynu bez
dotknięcia modelu), brak jakiejkolwiek informacji elektrycznej w agregacie,
jednostronny kierunek zależności Store→ENM.

**Do poprawienia:** wykreślić z `DONOR_ADOPTION_ARCHITECTURE.md` §1 i z F-16
zdania „wyprowadzone z reguł haszowania, nie z preferencji stylistycznych",
„technicznie błędny" i „wniosek nieunikniony". Hasz jest **argumentem za kosztem**
(inaczej trzeba pamiętać o wykluczeniu), nie **dowodem niemożliwości**.

**Knock-on na kartę D-8:** jej bramka („jeśli pole wchodzi do `hash_migawki_enm`
— karta UPADA i wraca jako pole Presentation Store") jest źle postawiona.
Wejście do hasza nie jest werdyktem, tylko jednolinijkową decyzją. Właściwe
kryterium: *czy pole niesie znaczenie elektryczne / wejściowe dla solvera*.

### 3.4 Znalezisko uboczne w `enm/hash.py`
`line_runs` i `connection_nodes` są kolekcjami najwyższego poziomu
`EnergyNetworkModel`, ale **nie ma ich w `_ELEMENT_KEYS`**, więc `_strip_uuids`
nigdy nie zdejmuje ich pola `id`. Na obecnej fiksturze jest deterministycznie
(sprawdziłem: dwie budowy substratu → identyczny `hash_migawki_enm`,
13 `line_runs`), ale **nic tego nie pilnuje**. Producent, który przypisze tam
`uuid4()`, cicho złamie prawo 7 dla WSZYSTKICH odcisków ENM. Jednolinijkowa
karta porządkowa: dopisać obie kolekcje do `_ELEMENT_KEYS` + test.

---

## 4. DUPLIKACJA, KTÓREJ AUDYT NIE ZŁAPAŁ (klasa „DXF")

Audyt sam złapał się na proponowaniu eksportu DXF, który MV już ma. Poniżej trzy
przypadki tej samej klasy, których nie złapał. **Sprawdzenie kontrolne:** żaden z
plików `czas_wylaczenia_galezi`, `znajdz_aparat_chroniacy`, `podgraf`,
`graph_view`, `lv_domain`, `przeglad_wszerz`, `bay_number` **nie występuje w
żadnym z pięciu dokumentów audytu** (`grep -rl` po `docs/architecture/*.md`).

### 4.1 L3 / D-9 „lokalny wycinek sieci" — **LUKA NIEISTNIEJĄCA**

L3 mówi: *„Jest `compute_topology_summary` (globalny), brak ekstrakcji sąsiedztwa."*
D-9 chce wziąć od PowSyBl `VoltageLevelFilter.traverseVoltageLevels`:
*„predykat W TRAKCIE rozwijania, reguły skoku per klasa aparatu, pierścień
`visible=false` bez wiszących krawędzi"*, z twardym warunkiem *„zwraca zbiór
referencji, NIGDY przyciętego ENM"*.

MV ma to wszystko **dzisiaj, w produkcji**:

| Zdolność żądana przez D-9 | Gdzie już jest |
|---|---|
| ekstrakcja podgrafu | `network_model/core/graph.py:638 NetworkGraph.podgraf(wezly)` — podgraf indukowany, kolejność deterministyczna, **2 konsumentów produkcyjnych**: `enm/assembler.py:783` i `:897` |
| głębokość / N skoków | `application/analyses/lv_domain/graph_view.py` — pole `hops_from_root` per szyna |
| **predykat W TRAKCIE rozwijania** | `graph_view.py:309 _sasiedzi_domeny` — decyzja zapada wewnątrz funkcji sąsiadów, nie po przejściu |
| **reguła skoku per klasa** | tamże: stacja **z własnym transformatorem** = granica (własne źródło SN); podrozdzielnica **bez** transformatora = wchłonięta |
| **brak wiszących krawędzi** | tamże: `BoundaryLink{branch_ref, from_bus_ref, to_bus_ref, target_station_ref}` — granica emitowana jawnie |
| **zbiór referencji, nie przycięty model** | `_bus_dict` zwraca `ref_id`/`name`/`voltage_kv`/`hops_from_root` — same referencje |
| jądro przejścia | `network_model/core/topologia.przeglad_wszerz_od` + `poziomy` — w kodzie opisane jako **„jedyne jądro przeglądu (CV-4.3)"** |

**Wniosek:** D-9 nie jest transplantacją, tylko **uogólnieniem
`lv_domain/graph_view.py` na dowolne pasmo napięciowe**. Wdrożona „z donora"
utworzyłaby **drugie przejście grafu obok zadeklarowanego jedynego jądra** —
naruszenie żywego niezmiennika CV-4.3 i dyrektywy właściciela nr 7
(„reużycie zamiast duplikacji"). To jest dokładnie ten sam błąd co DXF.

**Do poprawienia:** przepisać L3 na *„brak UOGÓLNIONEGO wycinka; istnieje
wyspecjalizowany (`lv_domain/graph_view.py`) + `NetworkGraph.podgraf`"*, a D-9 na
*„wynieść regułę z `graph_view.py` na poziom ogólny, reużywając
`przeglad_wszerz_od`"*. Wzorzec PowSyBl schodzi do roli potwierdzenia kierunku.

### 4.2 L5 / D-3 „pary zabezpieczeń z topologii" — **luka REALNA, ramka BŁĘDNA**

**Luka jest prawdziwa** — potwierdziłem cytat co do linii:
`src/application/analyses/protection/coordination/analyzer.py:545`
`# Compare adjacent devices (assuming ordered downstream to upstream)`
`for i in range(len(devices) - 1): downstream = devices[i]; upstream = devices[i+1]`.
Parowanie po indeksie listy. **To zostaje jako defekt.**

**Ale wyprowadzenie z topologii NIE jest zdolnością, której MV nie ma.**
`src/application/analyses/protection/czas_wylaczenia_galezi.py::znajdz_aparat_chroniacy`:

- przegląd wszerz od **węzłów źródłowych** (`_wezly_zrodlowe`: sieć SC,
  maszyny synchroniczne/asynchroniczne, falowniki),
- stan przeglądu = **`(węzeł, ostatni napotkany aparat wyłączający)`** — czyli
  dokładnie łańcuch „kto jest wyżej od kogo",
- `_sasiedztwo()` bierze **wyłącznie elementy przewodzące**: gałęzie w służbie i
  łączniki **ZAMKNIĘTE** („otwarty łącznik nie przewodzi, więc droga przez niego
  byłaby fikcyjna"),
- sortowanie sąsiadów → **determinizm** (prawo 7),
- używa **`przeglad_wszerz_od`** — tego samego jedynego jądra,
- i, co najważniejsze dla karty: **nie zakłada sieci promieniowej**, bo idzie po
  stanach, a nie `nx.shortest_path`.

To jest wprost prymityw, którego D-3 potrzebuje: „aparat chroniący gałąź" jest
zabezpieczeniem głównym, a **poprzedni aparat w tym samym łańcuchu stanów** jest
rezerwowym. Twarde kryterium odbioru D-3 („poprawne dla **pierścienia SN** —
`nx.shortest_path` donora zakłada promieniową; nasze wyprowadzenie NIE MOŻE")
jest **już spełnione przez ten kod**, a przez donora Sandia — nie.

Surowy raport agenta PROTECTION **wymienia ten plik** („`czas_wylaczenia_galezi.py`
(545)") w inwentarzu linii. Audyt policzył jego linie i go nie otworzył — §4
mierzy „~23 800 linii w 85 plikach" jako ROZMIAR, nigdy jako ZDOLNOŚCI. Stąd luka.

**Do poprawienia:** D-3 przeformułować na *„rozszerzyć `znajdz_aparat_chroniacy` o
parę główna/rezerwowa i wpiąć w `coordination/analyzer.py`, kasując parowanie po
indeksie"*. Sandia zostaje jako **zestaw przypadków testowych**, nie jako wzorzec
architektoniczny — jej `nx.shortest_path` jest gorszy od tego, co MV ma.

### 4.3 L2 / D-8 „brak podpowiedzi kolejności/strony pola w domenie" — **połowicznie duplikuje**

`Bay.bay_number: str | None` **istnieje w ENM** (`enm/models.py:969`),
jest czytane przez `application/analyses/wytrzymalosc_aparatury_pol.py:80` i
renderowane przez SLD: `GpzSwitchgearRenderer.tsx:1578,1889`,
`GpzCanonicalRenderer.tsx:123` („Numer dyspozytorski («10», «23/1») z ENM
`Bay.bay_number`"), `detailDrawerData.ts:237,1031`,
`StationConfiguratorSurface.tsx:360`.

Zdanie L2 *„brak pola domenowego"* jest więc **nieprawdziwe**. Prawdziwe jest
węższe: `bay_number` to **łańcuch** („23/1"), więc nie sortuje się liczbowo, i nie
ma odpowiednika `TOP/BOTTOM`. **Kryterium wejścia D-8 musi najpierw wykazać, że
`bay_number` nie może unieść kolejności** — inaczej karta dokłada drugie pole
porządkowe obok istniejącego oznacznika. (Połowa „strona pola" pozostaje luką.)

### 4.4 L6 „adapter nie publikuje proweniencji" — **przeszacowane**

`solver_version` **istnieje i jest przenoszone**:
`api/v125_contracts.py:321-322` (`power_flow_trace.solver_version` → `options`),
`network_model/reporting/power_flow_export.py:87`, `api/analysis_run_exports.py:471`,
`api/proof_pack.py:33,122`, `api/nn_proof.py:58`, `api/reference_networks.py:285`;
`mapping_version` ma odpowiednik `snapshot_mapping_version` w
`network_model/catalog/types.py:463`.

Realny brak jest **węższy**: wyrocznia `tests/golden/wyrocznie/pandapower.py` nie
stempluje `pandapower.__version__`. Kryterium D-2 o rozjeździe wersji
**POTWIERDZAM jako prawdziwe**: `expected/ieee_9bus.json` niesie
`"reference_tool": "pandapower 3.4.0"`, a `.github/workflows/python-tests.yml:238`
instaluje `pandapower==3.5.4`, i `test_ieee_cases_cross_validation.py` **nie ma
żadnej asercji wersji** (grep po `version` → tylko słowo w docstringu).
**Do poprawienia:** przeformułować L6 na *„wyrocznia pandapower nie stempluje
wersji"*, zamiast *„adapter nie publikuje proweniencji"*.

*(Uwaga na marginesie: `scripts/regenerate_expected_values.py` — punkt, który
chciałem zaatakować jako niesprawdzone przejęcie twierdzenia subagenta — został
w międzyczasie skasowany w tym mandacie, a karta D-2 poprawnie to odnotowuje.
Zarzut wycofuję. Potwierdzam za to, że następca `scripts/generate_ieee_references.py`
jest uczciwy: naprawdę uruchamia pandapower i zapisuje blok `provenance`.)*

---

## 5. LUKI, KTÓRE PRZEŻYWAJĄ ATAK

| Luka | Weryfikacja | Werdykt |
|---|---|---|
| **L1** trwały magazyn placement/route | `enm/models.py` nie ma ŻADNEJ geometrii (`placement` w linii 1051 to rola topologiczna `UPSTREAM/DOWNSTREAM`, nie xy; `position_km` to odległość elektryczna wzdłuż linii). `Substation`/`Bay`/`Corridor` bez współrzędnych. `application/sld/` = `layout.py`, `internal_layout.py`, `station_geometry.py` — WYLICZANIE. Front: brak `localStorage`/persystencji układu w `ui/sld/**`. | **TRZYMA** |
| **L4** `ExecutionBackend` niewdrożony | `grep -rn "ExecutionBackend\|ProcessPool\|concurrent.futures\|multiprocessing" src/ --include=*.py` → **zero trafień** (potwierdzone). `src/api/celery_app.py` = 26 linii, jedyne wystąpienie „celery" w `src/` to jego własny `from celery import Celery`. | **TRZYMA** |
| **L5** parowanie po indeksie | `coordination/analyzer.py:545` — cytat dosłowny. | **TRZYMA jako defekt** (ramka błędna, §4.2) |
| **L7** martwy drugi router | Mocniejsze niż napisano: 0 konsumentów produkcyjnych, nie 1. | **TRZYMA** |
| **Z4** `ui/sld-editor` = 56 linii | `find src/ui/sld-editor -type f` → jeden plik `types.ts`, 56 linii. CLAUDE.md opisuje „Edycja SLD (geometria CAD, przeciąganie, trasowanie)". | **TRZYMA** |

---

## 6. LICENCJE — 11/11 POTWIERDZONYCH, ZERO POMYŁEK

Sprawdziłem osobiście w klonach, przy SHA z §3 (wszystkie 12 klonów obecne;
`git rev-parse --short HEAD` zgodne z tabelą audytu):

| Donor | SHA (zweryfikowany) | Plik | Treść | Audyt |
|---|---|---|---|---|
| VoltWeave | `0384b23` | LICENSE | „MIT License / Copyright (c) 2026 VoltWeave contributors" | MIT ✔ |
| sldeditor | `9e1bba0` | LICENSE | „MIT License / Copyright (c) 2026 NovaShang" | MIT ✔ |
| xyflow | `0a1f957` | LICENSE | „MIT License / webkid GmbH" | MIT ✔ |
| pandapower | `fd7346f` | LICENSE | „BSD 3-Clause License" | BSD-3 ✔ |
| oxigrid | `1f46bc6` | LICENSE + `Cargo.toml: license = "Apache-2.0"` | Apache 2.0 | Apache-2.0 ✔ |
| power-grid-model | `e50f161` | LICENSE + `LICENSES/MPL-2.0.txt` | MPL 2.0 | MPL-2.0 ✔ |
| powsybl-diagram | `952186b` | LICENSE | MPL 2.0 | MPL-2.0 ✔ |
| elkjs | `cc80083` | LICENSE.md + `package.json:25` | `"license": "EPL-2.0 OR GPL-3.0-or-later"` | „EPL-2.0 (lub GPL-3.0+)" ✔ |
| TENSA | `caca7d5` | LICENSE | GNU GPL v3 | GPL-3.0 ✔ |
| GElectrical | `47082c7` | LICENSE + nagłówki „either version 3 … or (at your option) any later version" | GPL-3.0-or-later | GPL-3.0-or-later ✔ |
| Sandia PSO | `44fe954` | LICENSE | nagłówek NTESS/DE-NA0003525 + **pełny tekst GNU GPL v3** | GPL-3.0 ✔ |

**B6 (QElectroTech) potwierdzone co do joty:** `sldeditor/third_party/qelectrotech/`
zawiera **952 plików `.elmt`**, a `ELEMENTS.LICENSE` mówi wprost: *„Permission is
not granted to use this software or any of the associated files as sample data
for the purposes of building machine learning models"* + CC-BY 3.0 przy
redystrybucji poza schematem. Odrzucenie słuszne.

**F-14 potwierdzone:** brak `LICENSE` w `/home/user/MV-Design-PRO` i w
`mv-design-pro/`; brak pola `license` w `backend/pyproject.toml` i
`frontend/package.json`.

**Jedyne zastrzeżenie terminologiczne (nie licencyjne):** karta D-1 opisuje
PowSyBl jako „MPL-2.0, **clean-room z opisu**", podczas gdy audyt cytuje jego
konkretne klasy i metody (`FixedLayoutFactory`, `getFixedPositions`,
`CustomPathRouting`, `getEquipmentId()` vs `getSvgId()`) — to reimplementacja **po
przeczytaniu źródła**, a nie clean room w ścisłym sensie. Pod MPL-2.0 nic to nie
psuje (copyleft plikowy nie sięga wiedzy), ale to samo słowo pada przy donorach
**GPL** (Sandia, TENSA), gdzie precyzja ma znaczenie. Zalecenie: używać
„REIMPLEMENTACJA Z OPISU" dla MPL i rezerwować „clean room" dla ścieżki GPL.

---

## 7. ATAKI, KTÓRE NIE WYSZŁY (mówię wprost)

- **„Donor wybrany, bo ładny."** Nie znalazłem takiego. VoltWeave — donor
  faworyzowany przez właściciela — został odrzucony co do kodu na podstawie
  pomiaru (1152 linie JS potwierdzone `wc -l`; MV SLD: 191 164 linii TS z testami,
  117 826 bez). sldeditor (26 332 linie TS — potwierdzone) awansowany wbrew
  hipotezie wejściowej. To jest zachowanie odwrotne do „ładny wygrywa".
- **Vendor lock-in.** Brak. Wszystkie trzy karty TOP to `REWRITE_CLEAN_ROOM` albo
  `HARDEN` istniejącej zależności testowej (BSD-3). **Żadna nie dokłada zależności
  runtime.** Atak nieudany.
- **Migracja droższa niż napisanie samemu.** Nie dotyczy — nic się nie migruje;
  wszystkie trzy karty to własny kod.
- **Naruszenie prymatu ENM / drugie źródło prawdy topologicznej.** Nie znalazłem.
  Presentation Store nie przechowuje żadnej informacji elektrycznej, kierunek
  zależności jest jednostronny (Store→ENM), a zerwana referencja jest odrzucana
  przy odczycie. Rozróżnienie trasa/połączenie jest w kartach poprawne
  (`WireEnd` = referencje symboliczne, `Wire.path?` = nakładka). Odrzucenia
  E1 (GElectrical `port_mapping[(page,x,y)]`), B5 (`drop-on-bus.ts PROXIMITY_PX`),
  F2 (CGMES: współrzędne na modelu), G6 (`clone-on-write`), J2 (węzeł=model) są
  spójne i trafne.
- **Ciche domyślne w adapterze.** Kontrakt §2.2 (dwie asercje: mapowania +
  numeryczna) jest **mocniejszy**, nie słabszy, niż deklaruje — lekcja K6 jest
  poprawnie uogólniona. Z5 (`pandapower_bridge.py`, 0 konsumentów, ciche
  `vkr_percent=0.5` itd.) potwierdzam jako realny dług. Uwaga eksploatacyjna:
  **pandapower NIE JEST zainstalowany w lokalnym venv backendu**
  (`ModuleNotFoundError`), biegnie wyłącznie w izolowanym jobie CI ze
  `scipy<1.17` — „wyrocznia" jest mniej dostępna, niż sugerują dokumenty.
- **oxigrid / elkjs / xyflow / power-grid-model REJECT.** Wszystkie przeżywają.
  (Błędu √3 w oxigrid nie przeliczałem — kierunek decyzji jest REJECT, więc
  ewentualna pomyłka i tak nie tworzy ryzyka.)

---

## 8. AUDYT NAPRAWY DEFEKTU SESJI (`2086af2ba` + niescalone zamiatanie)

### 8.0 Defekt i naprawa są PRAWDZIWE
Odtworzyłem logikę **sprzed** commita na żywym repozytorium i prawdziwej bazie
(8 wątków, `threading.Barrier`), **na rzeczywistym statusie `CREATED`**:

```
PRZED naprawa: analiza policzona 8 razy zamiast 1
```

Wzorzec naprawy (`UPDATE … WHERE status NOT IN (…)` + decyzja po `rowcount`) jest
**poprawny na obu silnikach**: SQLite ma WAL + `busy_timeout=30 s`
(`infrastructure/persistence/db.py:18,33,41`) i szereguje pisarzy; PostgreSQL w
READ COMMITTED przewartościowuje `WHERE` na zaktualizowanym wierszu, więc drugi
`UPDATE` daje `rowcount=0`. `session_scope` commituje. Test przechodzi 8/8.

### 8.1 WADA 1 — fałszywa deklaracja „predykaty parami" (commit + docstring)
Commit: *„Zbior stanow blokujacych wyniesiony do `_STANY_NIEPRZEJMOWALNE` i
**wspoldzielony przez predykat wejscia i wyjscia** — jedno zrodlo prawdy (regula
KLASA NIE INSTANCJA pkt 3: predykaty parami)"*. Docstring `claim_for_execution`
powtarza: *„Zbior stanow blokujacych jest ten sam co zbior stanow, ktore konczy
`execute_run`"*.

Pomiar:
```
grep -rn "_STANY_NIEPRZEJMOWALNE" src/
→ canonical_run_repository.py:200  (definicja)
→ canonical_run_repository.py:321  (JEDYNE użycie)
```
`execute_run` **nie odwołuje się do tej stałej w ogóle** — stary
`if run.status in {"FINISHED","FAILED"}` został skasowany, nie przepięty.
Co więcej zbiory są **różne**: `execute_run` kończy w {FINISHED, FAILED},
a stała to {RUNNING, FINISHED, FAILED}. **Nie ma drugiego predykatu, więc nie ma
pary.** To jest dokładnie „Deklaracja bez testu = fałszywa pewność"
(KLASA NIE INSTANCJA pkt 4) — w commicie, który powołuje się na tę regułę.
Naprawa: albo usunąć zdanie, albo faktycznie wyprowadzić stan końcowy
`execute_run` z jednego źródła (np. `_STANY_TERMINALNE ⊂ _STANY_NIEPRZEJMOWALNE`)
i przypiąć testem.

### 8.2 WADA 2 — bieg zakleszczony w RUNNING (ZNALEZIONE, już naprawiane)
Po naprawie `RUNNING` blokuje przejęcie, a przed nią **nie blokowało** — czyli
proces ubity w połowie zostawiał bieg nie do uruchomienia NA ZAWSZE
(`except Exception` nie łapie `KeyboardInterrupt`/`SystemExit`, więc wystarczał
reload uvicorna; `docker-compose` montuje `./backend:/app` i CMD ma `--reload`).
Nic w `src/` nie resetowało `RUNNING`, a `werdykt_projektowy.py:706` pokazywałby
taki bieg jako „w toku" bez końca.

**Zostało to naprawione w niescalonym drzewie** (`fail_orphaned_running` +
zamiatanie w `lifespan` + 2 testy). Potwierdzam, że działa: 8/8 zielonych.
Uczciwie: test `test_bieg_odzyskany_po_zamiataniu_da_sie_uruchomic_ponownie`
**jawnie pinuje**, że zamieciony bieg jest FAILED i się NIE wznawia — dobrze.

**Ale zamiatanie ma własną wadę, która zostaje:**

### 8.3 WADA 3 (KRYTYCZNA na przyszłość) — zamiatanie globalne bez przypięcia założenia
`fail_orphaned_running` robi `UPDATE canonical_runs SET status='FAILED'
WHERE status='RUNNING'` — **bez filtra po procesie, hoście, PID czy dzierżawie**.
Poprawność stoi WYŁĄCZNIE na założeniu „wykonanie żyje w TYM procesie API".

Dziś założenie jest prawdziwe (`backend/Dockerfile:41`:
`uvicorn src.api.main:app --host 0.0.0.0 --port 8000 --reload`, **bez `--workers`**;
`docker-compose.yml` = jeden kontener `backend`). Docstring uczciwie nazywa
ryzyko („CZEGO NIE WOLNO ZAPOMNIEC PRZY DT-12"). **Ale nic tego nie pilnuje.**
Skutek złamania jest natychmiastowy i cichy: drugi proces API na tej samej bazie
(`--workers 2`, replika, albo `npm run test:e2e:real` startujący backend obok
działającego dev-backendu — oba domyślnie na `sqlite+pysqlite:///./mv_design_pro.db`,
`canonical_run_repository.py:134`) **oznaczy jako FAILED każdy trwający bieg
sąsiada**, z oknem 171 s. `conftest.py:85` dokumentuje ZMIERZONY incydent
(2026-08-13) współdzielenia plików przez żywy backend obok pytest — czyli to nie
jest scenariusz hipotetyczny w tym repo.

**Zalecenie (tanie, dane już zmierzone):** test/guard przypinający założenie —
`ExecutionBackend|ProcessPool|concurrent.futures` nieobecne w `src/` (to jest
dokładnie pomiar F-11) **oraz** brak `--workers` w `Dockerfile`/compose. Bez tego
karta G1/„pula procesów" (P2) z backlogu jest jednocześnie planem zamiany
zamiatania w niszczyciel danych.

### 8.4 WADA 4 — zmiana zachowania HTTP mimo deklaracji „kontrakt bez zmian"
Commit: *„sygnatura `execute_run` i kontrakt HTTP bez zmian (snapshot OpenAPI
nietkniety)"*. Schemat OpenAPI faktycznie nietknięty — **zachowanie nie**.
`POST /api/execution/runs/{id}/execute` może teraz zwrócić **200 + `status:
"RUNNING"` bez wyników**, co wcześniej było niemożliwe (obaj wołający blokowali
się i obaj dostawali stan terminalny). Odbiorcy:

- `ui2/wyniki/oltc/oltcBadaniaModel.ts:188-192` — rzuca **tylko** na `'FAILED'`,
  po czym woła `getRunResults`, które dla stanu innego niż FINISHED zwraca
  **HTTP 409** (`api/execution_runs.py:258-262`) → mylący błąd u użytkownika;
- `ui/network-build/station-der/audit2-hooks.ts:211` — degraduje się poprawnie
  (`status !== 'DONE'`);
- `ui2/spaces/obliczenia/uruchomObliczenie.ts` — odpytuje do stanu terminalnego,
  odporne.

**Żaden test nie sprawdza, co widzi PRZEGRANY.** Test współbieżny asercjonuje
jedynie `all(w is not None)`. Brakuje asercji: przegrany dostaje `RUNNING`,
przegrany nie dostaje wyników, przegrany nie zmienia wiersza.

### 8.5 WADA 5 — test buduje biegi w statusie, którego produkt nie zna
`tests/enm/test_przejecie_biegu_atomowe.py::_bieg` domyślnie tworzy
`status="PENDING"`. Ale:

```
domain/analysis_run.py:11  AnalysisRunStatus = Literal["CREATED","VALIDATED","RUNNING","FINISHED","FAILED"]
canonical_analysis.py:943  create_run(... status="CREATED" ...)
canonical_analysis.py:537  to_execution_dict: {"CREATED":"PENDING", ...}
```

„PENDING" to nazwa **API-owa**, nie wewnętrzna. Zweryfikowałem uruchomieniem:
`CanonicalRun(status="PENDING").to_execution_dict()` → **`KeyError: 'PENDING'`**.
Test buduje więc wiersze w stanie niemożliwym, a docstring twierdzi „iloczyn cech
× {PENDING, RUNNING, FINISHED, FAILED}" — **żaden z DWÓCH realnych stanów
przejmowalnych (`CREATED`, `VALIDATED`) nie jest ćwiczony**. Test przechodzi,
bo `NOT IN` spełnia dowolny łańcuch — czyli **przechodzi z częściowo złego
powodu**. (Mój własny reprodukt użył `CREATED` i defekt też się reprodukuje, więc
sama naprawa jest słuszna — słabszy jest tylko dowód.)
Naprawa: `_bieg(status="CREATED")` + parametryzacja o `"VALIDATED"`.

### 8.6 WADA 6 (uboczna, pre-existing, teraz osiągalna)
`to_execution_dict` nie ma wpisu dla `"VALIDATED"` — zadeklarowanego statusu
domenowego. `claim_for_execution` traktuje `VALIDATED` jako **przejmowalny**
(nie ma go w zbiorze blokującym). Gdyby cokolwiek utrwaliło ten stan,
`POST /execute` i `GET /runs/{id}` zwrócą **HTTP 500** (`KeyError`,
zweryfikowane uruchomieniem). Albo domknąć mapowanie, albo skasować `VALIDATED`
z `AnalysisRunStatus` — dziś to obietnica bez dostawcy.

### 8.7 Czego fikstura plikowej bazy NIE ukrywa
Uzasadnienie fikstury jest **poprawne**: SQLite z `cache=shared` zgłasza
`SQLITE_LOCKED` przy równoczesnym dostępie do tej samej tabeli, a `busy_timeout`
pokrywa `SQLITE_BUSY`, nie `SQLITE_LOCKED`. To właściwość współdzielonego cache,
nie defekt produktu. **Nie ukrywa niczego realnego.** Jedyne zastrzeżenie:
dowód współbieżności biegnie WYŁĄCZNIE na SQLite, a `docker-compose.yml` kieruje
produkcję na `postgresql+psycopg`. Wzorzec jest poprawny także na Postgresie, ale
to rozumowanie, nie test.

---

## 9. LISTA ZMIAN DO DOKUMENTÓW (konkretnie, nie „przemyśleć")

1. `OPEN_SOURCE_DONOR_AUDIT.md` §7 pkt 1, `DONOR_DECISION_MATRIX.md` D3,
   `DONOR_ADOPTION_ARCHITECTURE.md` §3, `DONOR_IMPLEMENTATION_BACKLOG.md`
   TOP-3-odrzucamy #1, `CHECKPOINT` F-10/F-18 — zastąpić „0,4 s z 170,9 s (0,2 %)"
   pomiarem z §1.2 i wskazać `_niefinitowe_na_none` jako podejrzanego.
2. `CHECKPOINT` F-3 + karta D-6 — poprawić na „0 konsumentów produkcyjnych,
   19 eksportów"; usunąć instrukcję przenoszenia `snapToGrid`; dopisać
   `scadaComplianceContract.test.ts:154` do procedury kasacji; dołożyć kartę na
   dwie żywe kopie `snapToGrid`/`SymbolPort`.
3. `CHECKPOINT` F-2 — poprawić liczby konsumentów (`buildRoute` 1,
   `routeOrthogonal` 0, `classifyRouteNodes` 5) albo je usunąć.
4. `ADOPTION_ARCHITECTURE` §1 + `CHECKPOINT` F-16 — usunąć „wyprowadzone z reguł
   haszowania", „technicznie błędny", „wniosek nieunikniony"; przenieść ciężar na
   DT-1 / prawo 3.4. Przeformułować bramkę D-8.
5. L3 i karta D-9 — przepisać jako uogólnienie `lv_domain/graph_view.py` +
   `NetworkGraph.podgraf` + `przeglad_wszerz_od`.
6. L5 i karta D-3 — przepisać jako rozszerzenie `znajdz_aparat_chroniacy`;
   Sandia degradowana do zestawu przypadków testowych.
7. L2 i karta D-8 — dopisać istniejące `Bay.bay_number` i warunek wstępny.
8. L6 — zawęzić do „wyrocznia pandapower nie stempluje wersji".
9. D-1 — „clean-room z opisu" → „reimplementacja z opisu" dla MPL.
10. Naprawa: 6 wad z §8 + karta na `line_runs`/`connection_nodes` poza
    `_ELEMENT_KEYS` (§3.4).
