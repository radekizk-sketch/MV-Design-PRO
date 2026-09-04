# MV-DESIGN-PRO — COMPUTATIONAL BOUNDARY (topologia wyprowadzana, Computational IR, granica solverów, determinizm)

**Status:** KANONICZNY (kontrakt MAX PLATFORM 2026-09-04, §10–§13, §23, §32, §35). Materiał wejściowy: `docs/twin/MV_DESIGN_PRO_SIMULATION_ARCHITECTURE.md` (FAZA D cz. 1), audyty A2 i A3.

---

## 1. Werdykt: `network_model/core` = Derived Immutable Computational IR (§12)

`network_model/core` (`NetworkGraph`, `Node`, `Branch`, `Switch`, `Source`, `Load`, `NetworkSnapshot`) jest dziś budowany na torze kanonicznym z ENM przez `enm/mapping.map_enm_to_network_graph` (P1/S1 w A3 §2), a równolegle **persystowany** w legacy ORM `network_nodes/branches/sources/loads` + `network_snapshots` przez wizard/`xlsx_import` bez mostu do ENM (A1-01, A9 §3.3 poz. 6). Rozstrzygnięcie:

1. `network_model/core` **jest IR**: nie jest edytowalny przez UI, nie jest trwałym modelem projektu, jest deterministyczną funkcją `EffectiveNetworkSnapshot`, niesie provenance do migawki (`snapshot_hash`, `envelope`), jest odtwarzalny.
2. Legacy persystencja IR (`network_*`, `network_snapshots`, `sld_*`, `NetworkSnapshot.meta.parent_snapshot_id` + `ActionEnvelope` event-sourcing, `wizard_runtime`, `xlsx_import` piszący do ORM) → **procedura kasacji** (D-03 warunkowo): inventory → consumer search (`solver_input.py`, `diagnostics.py`, `analysis_run`, `lifecycle`, `xlsx_import`, `network_wizard`) → data export (projekty XLSX/wizard → ENM przez komendy domenowe, D-45) → parity → cutover → observation → removal.
3. Solvery (`network_model/solvers/**`, FROZEN) czytają wyłącznie IR i kontrakty `solver_input/**`; nigdy ENM bezpośrednio.

## 2. Przepływ (§10–§12)

```
Canonical ENM (ModelRevision) ⊕ NetworkVariation ⊕ OperatingScenario
   → EffectiveNetworkSnapshot  (immutable; hash; envelope)                     [REVISION_SCENARIO_EXECUTION_MODEL.md §3]
   → TopologyView              (TopologyService — jedna implementacja)         [§2.2]
   → Computational IR          (NetworkGraph z enm/mapping — jeden assembler)   [§2.3]
   → kontrakt wejścia solvera  (solver_input/** — FROZEN, addytywne)
   → solver (FROZEN core)      → surowy wynik → result_mapping → ResultSetV1 (FROZEN) + provenance na biegu
```

### 2.1 Trwałe vs wyprowadzane (§11)
| Trwałe (ENM) | Wyprowadzane (nigdy zapisywane jako prawda) |
|---|---|
| assety, terminale (z `from/to_bus_ref` + fazy), łączność, stan łączników, `in_service`, uziemienia, katalog, nastawy | węzły topologiczne (CN scalone przez ZAMKNIĘTE łączniki), zasilenie (energized), wyspy, domeny napięciowe, ciągłość faz i N, osiągalne assety, partycje solvera (slack per wyspa), tory zasilania, feedery |

### 2.2 `TopologyService` — konsolidacja, nie nowy byt (§11)
Dziś: 14 implementacji przeglądu grafu w backendzie + 6 w kliencie (5 z własną topologią), 4 definicje krawędzi (A2-01, A2 §1.1–§1.2); scalanie CN→TN w `AdmittanceMatrixBuilder` (`ybus.py:71-86`); energizacja/wyspy poprawnie w projekcji nN 3.0.0. Rozstrzygnięcie: **promocja** istniejącego union-find z `ybus.py` i silnika energizacji/wysp z projekcji nN do `enm/topology.py` jako jedynej implementacji (`derive(snapshot) -> TopologyView`), konsumowanej przez: assembler IR, walidator, projekcje SN/nN, readiness, N-1, eksploatację. `AdmittanceMatrixBuilder` staje się konsumentem `TopologyView`. Pozostałe 13+5 implementacji → strangle → delete z guardem (`topology_single_impl_guard`: BFS/DFS/union-find po elementach ENM poza `enm/topology.py` = czerwony). Frontend (`SupplyPathHighlighter`, `sld/v3/electrical`, `enmToSldAdapter` topologia) → konsumuje `TopologyView` z projekcji; klient nie posiada konkurencyjnej prawdy (§11, §18).

### 2.3 Jeden assembler (§12) — inwentarz i los ścieżek (A3 §2.1–§2.2)
| Ścieżka | Miejsce | Los |
|---|---|---|
| P1 `canonical_analysis._execute_power_flow` + `map_enm_to_network_graph` | `enm/canonical_analysis.py:1642`, `enm/mapping.py` | **KANON** — jedyny assembler; prywatne `_execute_power_flow` importowane przez 8 modułów → publiczne `orchestrator.run(plan)`; `pv_bus_ids=[]` zawsze → PV z modelu (A3-04); wiele slacków → slack per wyspa z `TopologyView` (A3-05) |
| S1 `_execute_short_circuit` | `:1056` | **KANON** (c per pasmo, Z0, 4 typy) |
| P2, S4 wizard `build_*_input` | `network_wizard/service.py` | DELETE (0 wywołań) |
| P3, S3 `analysis_run/service` (`c_factor` domyślne 1.0!) | `analysis_run/service.py:556, 858` | DELETE z torem legacy (fabrykowane domyślne — potwierdza D-03) |
| P4, S2, E3 `execution_engine` | `execution_engine/**` | DELETE (tylko testy) |
| P5 `power_flow_input_builder` | `application/power_flow_input_builder.py` | DELETE po P3/P4 |
| P6–P8, S5, S6, **P9 własny NR + własny Ybus**, P10 BFS | `application/reference_networks/**` | STRANGLE: sieci referencyjne budowane jako ENM i liczone przez P1/S1; P9 usunięty po parity (12 benchmarków IEEE/CIGRE identyczne w tolerancji zadeklarowanej); P10 zastąpiony solverem 4-przewodowym (ADR-021) |
| P11, S7 `solver_input/builder` (`LoadFlowPayload`, `ShortCircuitPayload`, JSON) | `solver_input/**` | KEEP jako **kontrakt** wejścia (FROZEN, addytywny) — ale wypełniany przez assembler, nie równolegle; `SimplifiedGridSource` „follow-up" → domknąć albo usunąć pole |
| P12 `api/solver_input.run_audit2_power_flow` (`pq=[]`, slack-stub) | `api/solver_input.py:118-166` | DELETE (fabrykacja wejścia) |
| P13 `domain/load_flow_input` | tylko testy | DELETE |

Guard po CV-4: konstrukcja `PowerFlowInput(`, `ShortCircuitInput(`/`ShortCircuitPayload(` poza `enm/mapping.py`/assemblerem = czerwony; `backend_no_physics_guard` (rodziny wielkości: √3, κ, exp(−3R/X), I²t, k/(M^a−1), R·(1+α(θ−20)), P/(√3·U·cosφ)) poza `network_model/solvers` = czerwony z pustą allowlistą.

### 2.4 Tożsamość w IR (§6, T-4)
Dziś `Node.id = uuid5(NAMESPACE_DNS, ref_id)` w torze kanonicznym i `uuid4` w legacy (A1 §2). Docelowo identyfikator węzła IR = deterministyczna funkcja zbioru `ref_id` CN wchodzących w TN (posortowane, sha256 → stabilny id), mapa zwrotna TN → {CN ref_id} niesiona w `TopologyView`; wyniki mapowane na `ref_id` przez tę mapę (dziś `enm_ref_id_map`). Zakaz tłumaczeń tożsamości poza tą jedną funkcją (A1-06: 4 przestrzenie → 1).

## 3. Granica solverów i rejestr zdolności (§13, §32)
- Rdzenie FROZEN: IEC 60909, NR/GS/FD, ZIP, phase_state, dynamic — zmiana tylko przez **B-01** (niezależna wyrocznia, jawne założenia, wartości pośrednie, deterministyczne wejście, uzasadniona tolerancja, obliczenie referencyjne, tożsamość starej fizyki, testy trybów awarii; test z tej samej implementacji nie jest wyrocznią).
- `solver_capability_registry.py` (25 wpisów, wszystkie `implemented` — do ponownego pomiaru): staje się **bramką wykonania** — orkiestrator wybiera solver po zdolności (typ sieci, model fazowy, zdolność topologiczna T1–T13, źródła, DER, uziemienie, typy zwarć, szeregi czasowe), a status `SUPPORTED|PARTIAL|PLANNED|NOT_IMPLEMENTED` jest widoczny przed uruchomieniem; brak zdolności = jawna odmowa (`docs/twin/MV_DESIGN_PRO_SIMULATION_ARCHITECTURE.md` §8; macierz topologiczna `docs/twin/MV_DESIGN_PRO_TARGET_DIGITAL_TWIN_ARCHITECTURE.md` §9a).
- Fizyka poza solverami (A3-08: proof engine 21 wyrażeń, `analysis/arc_flash`, flicker, krzywa IEC w `application/analyses/protection`, R_θ w `application/solvers`) → przeniesiona do `network_model/solvers` z golden dowodami bit-identycznymi.

## 4. White Box (§23)
Lineage minimalny: dane źródłowe → proweniencja → założenia → envelope → migawka efektywna → `TopologyView` → wejście solvera (IR + kontrakt) → wartości pośrednie (Ybus, Zbus, Z1/Z2/Z0, jakobian, iteracje) → wynik → status walidacji → interpretacja. Jeden format śladu `TraceArtifact` (`trace_v2` istnieje 2 404 LOC bez konsumenta — wpiąć, nie pisać trzeciego); `run_hash` niezależny od formatowania; dowody (proof engine) wyłącznie formatują wartości ze śladu. Test snapshotowy nie jest wyrocznią fizyki (§23, §32) — wyrocznie w `../reference-networks/REFERENCE_NETWORK_REGISTRY.md`.

## 5. Determinizm numeryczny — polityka odcisku (§35, przegląd kwantyzacji M0-2)

Zmiana M0-2 (`application/analyses/kontrakt_liczb.py`: kwantyzacja `float` do 9 cyfr znaczących na granicy kontraktu wyjściowego przed serializacją i odciskiem) została poddana przeglądowi wg §35. Ustalenia i polityka (każdy wybór z uzasadnieniem):

| Pytanie §35 | Ustalenie | Polityka |
|---|---|---|
| Czy zmienia fizykę? | NIE — działa wyłącznie na ładunku kontraktu WYJŚCIOWEGO (projekcja nN 3.0.0, `upstream_equivalent`), po solverze; solvery i ich ślady nietknięte (`solver_diff_guard` zielony) | kwantyzacja dozwolona TYLKO w warstwie kontraktu; zakaz w `network_model/solvers`, `solver_input`, IR |
| Czy ukrywa istotne różnice? | NIE — 1e-9 względnie jest 4–6 rzędów poniżej dokładności danych (katalog 3–4 cyfry, IEC 60909 2–5 %, pomiar ≥ 0,2 %) | klasa równoważności odcisku = wartości równe do 9 cyfr znaczących; różnica fizyczna < 1e-9 względnie jest z definicji nieistotna inżyniersko |
| Kolizje odcisku? | zamierzone dla szumu ULP (prawdopodobieństwo fałszywej czerwieni ≈ 4e-4/przebieg vs ≈ 0,4 przy 12 cyfrach — docstring modułu); dwa STANY różniące się ≥ 1e-8 względnie NIE kolidują | test klasy: para wartości 1e-12 → ten sam odcisk; para 1e-8 → różny odcisk |
| `-0.0` | normalizowane do `0.0` (kierunek prądu/mocy niesiony osobnym polem znaku, nie znakiem zera) | test istnieje |
| `NaN`, `Inf` | dziś: przechodzą bez zmian → `json.dumps` emituje `NaN`/`Infinity` (niepoprawny JSON, klient nie sparsuje) — defekt maskowany | **kontrakt wyjściowy odrzuca wartości niefinitowe jawnym błędem z ścieżką pola** (`kwantyzuj_kontrakt` w trybie ścisłym = domyślnym); wartość „nieskończona" w sensie inżynierskim (np. sieć sztywna) jest reprezentowana jawnym polem (`is_infinite_bus: true`) albo `None` z powodem, nigdy `inf`; 18 fixtur nN: 0 wystąpień niefinitowych (pomiar) |
| jednostki | kwantyzacja względna — niezależna od skali jednostki (`_ohm`, `_kv`, `_mva`); jednostka jest w nazwie pola kontraktu | bez zmian; jednostka nigdy nie jest tracona |
| porządek | `sort_keys=True` w `_canonical_hash` → kolejność kluczy nieistotna; listy są semantyczne (posortowane po `ref_id` w projekcji) | test: permutacja kluczy słownika → ten sam odcisk; permutacja listy → inny odcisk (lista niesie kolejność) |
| liczby zespolone | `complex` nie występuje w kontraktach (re/im jako osobne pola); obiekt `complex` przechodzi bez kwantyzacji i wywraca `json.dumps` | tryb ścisły odrzuca `complex` jawnym błędem (defekt producenta ładunku, nie cicha akceptacja) |
| dane sekwencyjne (szeregi) | listy `float` kwantyzowane elementowo; `int` bez zmian | bez zmian |
| `int` vs `float` | `1` i `1.0` to różne typy JSON → różne odciski; producent kontraktu deklaruje typ pola | bez zmian (typ jest częścią kontraktu) |

Konsekwencja: polityka jest przypięta testami w `backend/tests/application/analyses/lv_domain/test_kwantyzacja_kontraktu.py` (klasa: fixtury × ±1 ULP; własności; tryb ścisły). Rozszerzenie kwantyzacji na kolejne kontrakty (scena SLD SN, `ResultSetV2`) — tylko z tą samą polityką i tym samym modułem.

## 6. Wydajność (odsyłacz)
Budżety B1–B10 i metoda pomiaru: `docs/twin/MV_DESIGN_PRO_PERFORMANCE_PLAN.md` §1a; algebra rzadka i wspólne jądro: `docs/twin/MV_DESIGN_PRO_SIMULATION_ARCHITECTURE.md` §4.
