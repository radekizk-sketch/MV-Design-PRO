# DONOR DECISION MATRIX — MV-DESIGN-PRO

> **HIERARCHIA PRAWDY PAKIETU AUDYTU (obowiązuje przy każdym konflikcie):**
> **1. KANONICZNE** — `OPEN_SOURCE_DONOR_AUDIT.md` (ustalenia) · `DONOR_DECISION_MATRIX.md`
> (decyzje) · `DONOR_ADOPTION_ARCHITECTURE.md` (architektura) · `DONOR_IMPLEMENTATION_BACKLOG.md`
> (karty). **2. DOWODY/CHECKPOINT** — `DONOR_AUDIT_CHECKPOINT.md` (pomiary F-1…F-22; zawiera
> bloki jawnie oznaczone jako WYCOFANE — czytaj znaczniki). **3. NIEWIĄŻĄCE** — `donor-raw/**`
> (surowe raporty subagentów i przegląd adwersaryjny; **nie są decyzją**, zawierają twierdzenia
> obalone przy weryfikacji).
> Konflikt rozstrzyga poziom wyższy. Cały pakiet jest **podrzędny** wobec kanonu V12.xx,
> `DECISION_FREEZE_REGISTER.md` (DT-1…DT-16) i `CANONICAL_TWIN_ARCHITECTURE.md`.


**Data:** 2026-09-07 · **Baza:** `5adc958d` (CV-4.3 K6) · **Kontekst:** `OPEN_SOURCE_DONOR_AUDIT.md`
Decyzja dotyczy **PODSYSTEMU**, nigdy całego repozytorium. Klasy:
`COPY` · `PORT` · `INTEGRATE` · `REWRITE_CLEAN_ROOM` · `STUDY_ONLY` · `REJECT`.

Kolumna „Licencja" = zweryfikowana osobiście przy SHA z nagłówka sekcji (§3 audytu).
Kolumna „Wpływ ENM" — jeśli inny niż `ZERO`, decyzja wymaga osobnego uzasadnienia:
ENM pozostaje jedyną prawdą elektryczną.

---

## A. VoltWeave — `0384b23`, MIT

| # | Podsystem | Zdolność | Odpowiednik w MV | Luka | Decyzja | Cel w MV | ENM | Priorytet |
|---|---|---|---|---|---|---|---|---|
| A1 | Dekompozycja `device`/`function`/`pin`/`placement`/`connection`+`route` | Semantyka na pinach, trasa osobno | ENM ma `Port`/`PortRef`/`ConnectionNode`; placement/route **ISTNIEJĄ** w `sld_node_symbols`/`sld_branch_symbols` (korekta bramki końcowej) | L1 przeformułowana: fragmentacja, nie brak | **STUDY_ONLY** (kontrakt), wdrożenie = **konsolidacja** w D-1 | magazyn wybrany w D-1 | ZERO | **P0** |
| A2 | Materializacja mufy przy upuszczeniu przewodu | Gest → jawny węzeł + pin | `ConnectionNode.location="branch_point"` istnieje; **żaden gest go nie tworzy** | częściowa | **REWRITE_CLEAN_ROOM** | edytor SLD | ZERO (istniejące pole) | P1 |
| A3 | Walidator „trasa nie może wskazywać nieistniejącego placementu" | Spójność trasa↔placement | brak | L1 | **PORT (reguła, odwrócony kierunek)** | walidacja Store | ZERO | P0 |
| A4 | Testy niezmienników („rysunek nie rządzi modelem") | Prawo jako test wykonywalny | brak testu prawa 3.4 | tak | **REWRITE_CLEAN_ROOM** | testy kontraktu | ZERO | **P0** |
| A5 | Kanoniczny model elektryczny VoltWeave | własny model sieci | ENM | — | **REJECT** | — | konflikt z DT-1 | — |
| A6 | `connect()` + `deleteSelection()` (sprzężenie rysunku z topologią) | — | — | — | **REJECT** | — | łamie prawo 3.4 | — |
| A7 | Router / renderer / persystencja / raporty | Manhattan, SVG, zapis | `v3/layout/route.ts` (żywy), `v3/canvas`, `export/` | brak | **REJECT** (duplikat) | — | — | — |

## B. sldeditor — `9e1bba0`, MIT

| # | Podsystem | Zdolność | Odpowiednik w MV | Luka | Decyzja | Cel w MV | ENM | Priorytet |
|---|---|---|---|---|---|---|---|---|
| B1 | `WireEnd = TerminalRef \| BusId \| JunctionId` + `Wire.path?` | Wzorzec „trasa ręczna jako opcjonalna nakładka" | trasa trwała **JEST** (`points_jsonb`), ale magazyn trzyma też `from_node_id`/`to_node_id` = **topologia w prezentacji** | L1 przeformułowana | **STUDY_ONLY** — wzorzec jako kryterium naprawy istniejącego magazynu | D-1 | ZERO | **P0** |
| B2 | `compiler/union-find.ts` → klasy `ConnectivityNode` | Wyprowadzenie netów z jawnych relacji | `core/ybus.py` (union-find) + `enm/topology.py` | brak | **REJECT** (duplikat) | — | — | — |
| B3 | Interakcja operatora: multi-select, align/distribute, kopiuj/wklej, klawiatura | Ergonomia CAD | `ui/sld-editor` = 56 linii (sam `types.ts`) | tak | **REWRITE_CLEAN_ROOM** | edytor SLD | ZERO | P1 |
| B4 | Eksport DXF | Wymiana z CAD | **JEST**: `v3/export/exportDxfV3.ts` (oraz `v2/export/exportDxf.ts`) | brak | **REJECT** (duplikat) | — | — | — |
| B5 | `drop-on-bus.ts` — `PROXIMITY_PX = 30` tworzy `Wire` | Cichy domysł z geometrii | — | — | **REJECT** | — | **łamie prawo 3.3** | — |
| B6 | `third_party/qelectrotech/` (952 plików `.elmt`) | Biblioteka symboli | katalog symboli MV | — | **REJECT** | — | CC-BY + zakaz użycia jako danych treningowych | — |

## C. pandapower — `fd7346f`, BSD-3-Clause (JUŻ ZINTEGROWANY — K3b)

| # | Podsystem | Stan | Decyzja | Uzasadnienie | Priorytet |
|---|---|---|---|---|---|
| C1 | Wyrocznia `tests/golden/wyrocznie/pandapower.py` | żywa, reużywa reguł mapowania MV, odmawia po nazwie dla elementów niemodelowanych | **KEEP** | jedyny działający most; jakość potwierdzona | — |
| C2 | Proweniencja wyroczni | `pandapower.__version__` **nigdzie nie zapisywany**; brak `mapping_version` | **HARDEN** | L6; wynik bez proweniencji nie jest dowodem | **P0** |
| C3 | Asercja mapowania (lekcja K6) | istnieje **tylko** test z K6 | **HARDEN** | parytet nie dowodzi mapowania (§6 audytu) | **P0** |
| C4 | Pokrycie typów zwarć | brak 1F/2F/κ/I_th w wyroczni (pola w ENM są) | **EXTEND** | tanie poszerzenie dowodu | P1 |
| C5 | `application/reference_networks/pandapower_bridge.py` | **drugi** mapper, 0 konsumentów produkcyjnych, ciche domyślne | **REPLACE ADAPTER** (kasacja) | Z5; dwa mappery = dwie prawdy mapowania | P1 |
| C6 | 2F+G jako wyrocznia | pandapower: `NotImplementedError` | **REJECT** (niewykonalne) | MV nie ma i **nie będzie miał** wyroczni 2F+G z tego źródła — nazwać jawnie | — |

## D. power-grid-model — `e50f161`, MPL-2.0

| # | Podsystem | Decyzja | Uzasadnienie | Priorytet |
|---|---|---|---|---|
| D1 | Drugi niezależny adapter solvera | **REJECT / DEFER** | **Nie da się zainstalować:** wymaga Pythona ≥3.12 (MV: 3.11.15) i numpy ≥2.0 (MV zamyka 1.26.4, nośne dla haszy golden). Ponadto rdzeń C++ bez pośrednich (Ybus/Zth) — pod prawem 5 może być najwyżej wyrocznią, a jako wyrocznia różni się **z założenia**: `c_max` nN zaszyte 1,10 wobec 1,05 w MV, napięcie przedzwarciowe ze źródła (±3 %), zwarcia wymagają sieci uziemionej (wyklucza sieci kompensowane). | P2 |
| D2 | `two_phase_to_ground` jako wyrocznia | **DEFER** | Jedyna unikalna wartość (C6), ale przychodzi w pakiecie z trzema odchyleniami. Wznowić **tylko** przy nazwanym warunku: MV przechodzi na Python ≥3.12 **i** numpy ≥2.0. | P2 |
| D3 | „Szybszy solver naprawi regresję SC" | **REJECT (teza obalona)** | Profil realnego biegu (§7 pkt 1 audytu): dominują **`_niefinitowe_na_none` ~26–32 %** i **składanie wkładów falowników ~28 %** — obie to **własny kod MV**, którego zewnętrzny solver nie dotyka. Sama algebra (`np.linalg.inv`, 1530 wywołań) to **1,758 s ≈ 3 %**. Wymiana solvera zamaskowałaby przyczynę, zamiast ją usunąć. | — |

## E. GElectrical — `47082c7`, **GPL-3.0-or-later** → COPY ZABLOKOWANE

| # | Podsystem | Decyzja | Uzasadnienie | Priorytet |
|---|---|---|---|---|
| E1 | `NetworkModel.setup_global_nodes`: `port_mapping[(page, x, y)] → global_node` | **REJECT** | **Geometria TWORZY connectivity**, a tożsamość zależy od rozmieszczenia (numeracja od zera przy każdej przebudowie) — łamie prawa 3.3 i 3.4 jako założenie nośne. Wartość: **negatywny benchmark**. | — |
| E2 | Pasma krzywych zabezpieczeń z tolerancji producenta (`i_tol`/`t_tol`/`t_tol_f`) + jednolity predykat `contains()` | **STUDY_ONLY** | Wzorzec wart przemyślenia dla TCC; **kod nieprzenoszalny** (GPL + `eval()` na łańcuchach). | P2 |
| E3 | Potok schemat→model→wyniki→TCC→raport | **STUDY_ONLY** | Wymagania procesu, bez transplantacji źródła. | P2 |

## F. powsybl-diagram — `952186b`, MPL-2.0 (copyleft plikowy → tylko clean-room)

| # | Podsystem | Zdolność | Odpowiednik w MV | Decyzja | ENM | Priorytet |
|---|---|---|---|---|---|---|
| F1 | Trwałe rozmieszczenie/trasa jako **side-car** (`FixedLayoutFactory`, `getFixedPositions`, `CustomPathRouting`) | klucz = `getEquipmentId()` (**nigdy** `getSvgId()`), brak wpisu → cichy powrót do auto-układu, **zapisywane tylko wierzchołki wewnętrzne**, końce liczone od nowa | magazyn istnieje, ale **przechowuje końce** zamiast je liczyć — wzorzec PowSyBl jest tu **kryterium naprawy** | **STUDY_ONLY** (wzorzec) → wdrożenie w D-1 | ZERO (poza modelem) | **P0** |
| F2 | Wariant CGMES: współrzędne **na modelu** | — | — | **REJECT** | łamie F-16 (hasz migawki) | — |
| F3 | Podpowiedzi porządkowe `ConnectablePosition` (order, TOP/BOTTOM, **bez geometrii**) | **strona** pola i porządek rysowania (numer pola `Bay.bay_number` JUŻ JEST — korekta §17) | zawężona (L2) | **REWRITE_CLEAN_ROOM** (zakres mniejszy) | domyślnie **Presentation Store**; wariant w ENM wymaga jawnego wykluczenia w `hash.py` przypiętego testem | P2 |
| F4 | Sąsiedztwo o ograniczonej głębokości (`VoltageLevelFilter.traverseVoltageLevels`) | predykat w trakcie rozwijania, pierścień bez wiszących krawędzi | **JEST**: `lv_domain/graph_view.py` (`BoundaryLink`, `hops_from_root`) na jądrze `przeglad_wszerz_od` + `NetworkGraph.podgraf` | **REJECT** (duplikat — korekta §17) | drugi przegląd grafu łamałby DT-8 | — |
| F5 | Kontrakt nakładek: `StyleProvider` zwraca **wyłącznie nazwy klas CSS** | kompozycja + `reset()` | nakładka MV po `elementRef` | **STUDY_ONLY** | ZERO | P2 |
| F6 | `LimitHighlightStyleProvider` (`getV() > limit` w prezentacji) | — | — | **REJECT** | łamie `overlay_no_physics_guard` | — |
| F7 | Wzorce determinizmu: siatka całkowita `Position(h,v,hSpan,vSpan)`, `TreeSet` z porządkiem **totalnym**, sort na granicy, `Locale` wymuszony, jawna kolejność JSON | bajtowa powtarzalność | MV ma własne bramki determinizmu | **STUDY_ONLY** (potwierdzenie kierunku) | ZERO | P2 |
| F8 | Anty-wzorce: `HashMap` w serializacji, identyfikatory z licznika, `PriorityQueue` bez rozstrzygania remisów, `Random` w układzie | — | — | **REJECT** | — | — |
| F9 | Detekcja komórek/bloków (`ImplicitCellDetector`) | rekonstrukcja pola z płaskiego modelu | **ENM ma `Bay`** | **REJECT** | przyjęcie = regres | — |
| F10 | Biblioteka jako zależność | — | — | **REJECT** | wymaga zbudowania IIDM z ENM = **drugi model sieci**; JVM w stosie Python/TS | — |

## G. TENSA — `caca7d5`, **GPL-3.0** → COPY/PORT ZABLOKOWANE

| # | Podsystem | Decyzja | Uzasadnienie | Priorytet |
|---|---|---|---|---|
| G1 | Rejestr zadań / worker podprocesowy | **STUDY_ONLY** | Kierunek **już zamrożony** jako DT-12 („pula procesów teraz") i **niewdrożony** (L4) — to realizacja własnej decyzji, nie nowa architektura. Ale nie rozwiązuje odczuwanego problemu (171 s) i ma wysoki promień rażenia: ADR-028 zostawia Postgres jako PROPOSED, `enm/store.py` chroni zapis `threading.RLock`, który **między procesami nie działa**. | P2 |
| G2 | Kooperatywne anulowanie biegu | **REWRITE_CLEAN_ROOM** | Front woła `executeRun` gołym `fetch` **bez `AbortController` i bez limitu czasu**, przy biegu 171 s. Realna wartość dla użytkownika, mały promień. | P1 |
| G3 | Taksonomia awarii + podpowiedź naprawy | **REWRITE_CLEAN_ROOM** | uzupełnia `FAILED` o powód klasyfikowalny | P1 |
| G4 | `_run_as_job` (opakowanie wciąż blokującego wywołania) | **REJECT** | pozorny worker | — |
| G5 | Strumieniowanie Arrow/WebSocket, zdarzenia zadań | **REJECT** | brak odbiorcy; MV nie ma WS | — |
| G6 | `clone-on-write` modelu | **REJECT** | **drugie źródło prawdy** — łamie prawo 1 | — |
| G7 | Proweniencja / świeżość | **REJECT** | **MV jest dalej** (F-7): TENSA nie ma modelu świeżości, `run_id` to `uuid4` z trasy | — |

## H. oxigrid — `1f46bc6`, Apache-2.0 — **ŹRÓDŁO NIEWIARYGODNE INŻYNIERSKO**

Weryfikacja normatywna (nie README) wykazała **błędy fizyki**:

| # | Podsystem | Ustalenie | Decyzja |
|---|---|---|---|
| H1 | Zwarcie 1-fazowe (SLG) | Liczy `(√3·c·Un/√3)/|Z1+Z2+Z0|` — **√3 się skraca**, prąd zaniżony **dokładnie √3×**. Na własnej fiksturze donora: 6,2489 kA zamiast 10,8234 kA (stosunek 1,73205). Przy `Z0<Z1` poprawny SLG **przewyższa** 3F (10,82 > 9,62); oxigrid zwraca 6,25 — **fizycznie niemożliwe**. | **REJECT** |
| H2 | Współczynnik napięciowy `c` | `C_MAX_HV = 1,05`, `C_MIN = 0,95` — **odwrócone** wobec IEC (1,10 / 1,00); trzy niespójne konwencje w jednym crate; stałe i tak martwe | **REJECT** |
| H3 | Współczynniki korekcyjne `K_T`/`K_G`/`K_S` | **nie istnieją**; MV ma `K_T = 0,95·c_max/(1+0,6·x_T)` z krokiem White Box | **REJECT** |
| H4 | `I_th` | role `m`/`n` zamienione wobec IEC 60255-0 §4.8, obie wartości zmyślone → zawyżenie ~20 % | **REJECT** |
| H5 | Krzywe IDMT | stałe poprawne, ale MV ma je **lepiej**; formuła zduplikowana 4× w crate | **REJECT** (duplikat) |
| H6 | Walidacja donora | `test_slg_fault_formula` sprawdza tylko `i_k1_ka >= 0.0`; **żaden test nie porównuje prądu z odniesieniem** | — |
| H7 | Siatka przypadków testowych | **STUDY_ONLY** | wartość wyłącznie jako inwentarz scenariuszy |

**Wniosek:** README deklarujący „IEC 60909" nie jest dowodem. Gdyby przyjąć te wzory na słowo,
MV zaniżyłby prąd zwarcia 1-fazowego o 73 % — czyli w kierunku **niebezpiecznym** dla doboru
aparatury. To najmocniejsze uzasadnienie reguły „norma > implementacja zewnętrzna".

## I. Sandia Protection-settings-optimizer — `44fe954`, **GPL-3.0** → COPY ZABLOKOWANE

| # | Podsystem | Decyzja | Uzasadnienie | Priorytet |
|---|---|---|---|---|
| I1 | Wyprowadzenie par główna/rezerwowa z topologii | **REWRITE_CLEAN_ROOM** | **Realna luka L5** (`analyzer.py:545` paruje po indeksie listy). Idea słuszna, ale `nx.shortest_path` zakłada sieć **promieniową** — dla pierścieni SN MV trzeba własnego wyprowadzenia. | **P0** (w programie ZAB) |
| I2 | Zbiór przypadków zwarciowych per strefa | **REWRITE_CLEAN_ROOM** | L5 | P1 |
| I3 | Ograniczenie CTI jako minimum po stopniach | **REWRITE_CLEAN_ROOM** | L5 | P1 |
| I4 | Deterministyczna synteza nastaw | **REWRITE_CLEAN_ROOM** | MV weryfikuje, nie syntetyzuje | P1 |
| I5 | Ponowna weryfikacja po przekonfigurowaniu (pierścień/DER) | **REWRITE_CLEAN_ROOM** | luka | P1 |
| I6 | Silnik genetyczny (pygad) | **REJECT** | **niedeterministyczny** (brak ziarna, `initial_population` zakomentowana) — łamie prawo 7 | — |
| I7 | Model krzywych donora | **REJECT** | tylko krzywe US U1–U5; **krzywe IEC zakomentowane** | — |
| I8 | Jakość kodu donora | — | `del gac[pp-1:]` gubi ostatnie ograniczenie; `enableIT==1` zawsze wywala (`len()` na `float`); funkcja celu generowana jako plik `.py` i `exec_module` w locie; zero testów i CI | — |

## J. xyflow / React Flow — `0a1f957`, MIT

| # | Podsystem | Decyzja | Uzasadnienie |
|---|---|---|---|
| J1 | Infrastruktura interakcji (viewport, selekcja, uchwyty) | **REJECT** | MV ma własną kanwę CAD ~183k linii z kamerą, obszarami trafień, minimapą i warstwami. Węzeł = element DOM to **zły substrat** dla geometrii CAD i dla LOD. Popularność nie jest argumentem. |
| J2 | Węzły/krawędzie jako model sieci | **REJECT** | wprost zakazane (prawo 1) |

## K. elkjs — `cc80083`, EPL-2.0 (lub GPL-3.0+)

| # | Podsystem | Decyzja | Uzasadnienie |
|---|---|---|---|
| K1 | Układ warstwowy z ograniczeniami portów | **REJECT (nieweryfikowalny)** | **Algorytmów NIE MA w repozytorium przy tym SHA**: `src/` to 4 pliki Java + 3 opakowania JS, `lib/` nieobecny, `org.eclipse.elk.alg.layered` ciągnięty z zewnętrznego checkoutu przy budowie. Determinizm, ograniczenia portów, stabilność relayoutu — **nieocenione**. Dla potoku bramkowanego determinizmem sama nieweryfikowalność jest podstawą odrzucenia. |

## L. Donorzy wtórni

Nie tworzono katalogu dla samego katalogu. **QElectroTech** wchodzi wyłącznie pośrednio
(biblioteka `.elmt` w `sldeditor/third_party/`) i jest **odrzucony** (B6): CC-BY z jawnym zakazem
użycia jako danych treningowych. **LibrePCB / Horizon EDA** — domena PCB, nie schematy
jednokreskowe SN/nN; brak zdolności, której nie pokrywają donorzy A–K. Nie audytowane dalej.


---

## M. Korekty po bramce adwersaryjnej (§17) — rejestr zmian tej macierzy

| Wiersz | Było | Jest | Powód |
|---|---|---|---|
| B4 (DXF) | STUDY_ONLY | **REJECT** (duplikat) | MV ma `v3/export/exportDxfV3.ts` — wykryte przeze mnie w trakcie pisania |
| F4 (sąsiedztwo N skoków) | REWRITE_CLEAN_ROOM, P1 | **REJECT** (duplikat) | MV ma `lv_domain/graph_view.py` z `BoundaryLink`/`hops_from_root` |
| F3 (podpowiedzi porządkowe) | P1, „brak pola" | **P2, zakres zawężony** | `Bay.bay_number` już istnieje; brakuje tylko strony i porządku |
| C2/C3 (proweniencja) | „brak `solver_version`" | **zawężone do stempla pandapower** | `solver_version` istnieje w torze kanonicznym |
| A1/B1 (placement/route) | uzasadnienie: hasz **wyklucza** wariant w ENM | **uzasadnienie: DT-1 / prawo 3.4 / DT-14** | wykluczenie z hasza jest wykonalne (precedens `connection_conditions`) — argument haszowy był za mocny |
| D3 (wydajność) | „algebra 0,2 %, przyczyna nieznana" | **profil: `_niefinitowe_na_none` ~26–32 %, wkłady falowników ~28 %** | decyzja REJECT dla PGM **wzmocniona**, dowód wymieniony |

| A1/B1/F1 (magazyn prezentacji) | „brak trwałego magazynu placement/route" → REWRITE_CLEAN_ROOM | **STUDY_ONLY wzorca + KONSOLIDACJA istniejącego (D-1)** | MV ma trzy niedokończone magazyny; budowa czwartego byłaby trzecim duplikatem audytu |
| D-8 (porządek pól) | brakuje porządku i strony | **zostaje tylko strona** | `REORDER_FIELD` już istnieje w `geometry_overrides.py:188` |
