# MV-DESIGN-PRO — SIMULATION ARCHITECTURE: SOLVERY, MIGAWKA KANONICZNA, ORKIESTRATOR (FAZA D, część 1; pakiet §179 poz. 11)

**Status:** PROPOZYCJA DO PRZEGLĄDU WŁAŚCICIELA (mandat §20–§24, §27–§31, §63, §113–§118, §143). Nie jest kanonem do czasu decyzji.
**Data:** 2026-09-02 · **Autor:** Fable · **Nadrzędny:** `MV_DESIGN_PRO_TARGET_DIGITAL_TWIN_ARCHITECTURE.md` (§9–§14, §22)
**Dowody stanu obecnego:** audyt A3 (solvery), A2 (topologia/scenariusze), A5 (DER), A11 (nN/uziemienia) — w `MV_DESIGN_PRO_DIGITAL_TWIN_AUDIT.md`.
**Zasada nadrzędna:** zamrożone rdzenie solverów (IEC 60909, NR/GS/FD) pozostają nietknięte (B-01); cała przebudowa dotyczy WEJŚCIA (migawka, adaptery), OTOCZENIA (orkiestrator, cache, provenance) i NOWYCH solverów addytywnych.

---

## 0. Diagnoza w jednym zdaniu

Fizyka w repo jest dobra i zweryfikowana (NR vs pandapower ~5e-8 %, SC IEC 60909 z 549 testami), ale **droga do niej nie jest jedna**: 10 builderów wejścia rozpływu, 7 ścieżek zwarć, 4 macierze admitancji, 14 analiz „akademickich" z własnym DTO i zaszytymi domyślnymi, 20 miejsc liczących topologię, brak orkiestratora, brak modelu pomiaru, algebra gęsta z inwersją per węzeł zwarcia — i rozjazdy interpretacji tego samego modelu udowodnione w kodzie (c = 1,0 zamiast 1,10 na jednej ze ścieżek, brak R_θ w scenariuszu MIN, szyny PV nigdy nie budowane z ENM, drugi węzeł SLACK bez równania).

| Klasa defektu (audyt) | Odpowiedź (sekcja) |
|---|---|
| 10 builderów PF (P1–P13) + 7 ścieżek SC (S1–S7) z rozbieżną interpretacją (A3-01) | jedna `CanonicalNetworkSnapshot` + jeden `SolverInputAssembler` (§2–§3) |
| brak orkiestratora, Celery 0 tasków, 8 modułów importuje prywatne `_execute_power_flow` (A3-02) | `SolverOrchestrator` z DAG, cache, readiness, provenance (§7) |
| FDLF nie zbiega na kablach nN; BFS 3-fazowy wyspa bez faz w ENM (A3-03) | rejestr zdolności z bramką stosowalności + solver nN ABCN (§5.1, §5.3) |
| szyny PV nigdy z ENM; wiele źródeł = wiele SLACK bez równania (A3-04/05) | `Source.role`, `Generator.control_mode` w migawce; dokładnie jeden slack per wyspa lub slack rozproszony (§3.2) |
| `v126_academic.py`: 14 analiz-wysp z phantom data (widmo, MTTR, droop, silniki wpisywane drugi raz) (A3-06) | każda analiza = ogniwo na migawce; encje `Motor`, `HarmonicSource`, `EarthElectrode` w twin; zakaz stałych fizycznych w mostach (§6) |
| 4 implementacje Ybus, drugi NR w `application/reference_networks` (A3-07) | jeden `admittance.py` (sekwencje 1/2/0, h, zaczepy, łączniki z `TopologyView`) (§4) |
| fizyka w proof engine, arc flash w `analysis/`, krzywa IEC w `application/`, R_θ w `application/solvers` (A3-08) | guard „no physics outside solvers" dla backendu; proof engine tylko formatuje (§9) |
| WLS bez modelu pomiaru (A3-09) | `MeasurementSet` z twin (§5.9) |
| gęsta algebra, SC O(N·n³), N-1 2,64 s/kontyngencję (A3-10) | rdzeń rzadki + kolumny Zbus przez `splu.solve`, bramka wydajności (§4.2, §10) |
| stałe magiczne w mostach i UI (A3-11), FROZEN porowaty (A3-20), trace_v2 martwe (A3-12) | rejestr stałych normatywnych, guardy, jeden format śladu (§9) |
| DER: `k_sc·In` jedyny model zwarciowy, GFM jako string, BESS bez SOC/sprawności, tryby katalogu nieme w PF (A5-03/04/14) | typowane sterowanie w migawce; PVSpec/GFM; pola karty SC konsumowane przez adapter (§5.2, §5.4) |

---

## 1. Inwarianty symulacji

| # | Inwariant | Egzekwowanie |
|---|---|---|
| S-01 | Solver dostaje wyłącznie `CanonicalNetworkSnapshot` (ani ENM/twin, ani dict, ani wizard DB). | guard AST: konstruktory `PowerFlowInput(`/`ShortCircuit*Input(`/`UnbalancedNetworkInput(` dozwolone tylko w `simulation/assembler/**` |
| S-02 | Interpretacja twin → wejście solvera istnieje w jednym miejscu (`SolverInputAssembler`); różne solvery = różne widoki tej samej migawki, nie różne interpretacje. | test parytetu: ten sam twin przez każdą końcówkę API → identyczny `input_hash` |
| S-03 | Jedna macierz admitancji dla wszystkich solverów (PF, SC, harmoniczne, WLS) parametryzowana sekwencją i częstotliwością. | test parytetu Ybus SC vs PF vs h=1 na 4 sieciach referencyjnych |
| S-04 | Fizyka wyłącznie w `network_model/solvers` (docelowo `simulation/solvers`); warstwy application/analysis/domain/proof/UI formatują i interpretują. | guard AST rodzin wielkości (√3, κ, exp(−3R/X), I²t, 0,14/0,02, R_θ) poza solverami = czerwony |
| S-05 | Stosowalność metody jest egzekwowana kodem (FD odmawia przy R/X ≥ 1; GS bez cichego fallbacku; solver deklaruje `phase_domain`). | rejestr zdolności + bramka w orkiestratorze; iniekcja: kabel nN + FD → `NOT_APPLICABLE`, nigdy wynik |
| S-06 | Brak danych → `NOT_READY(missing)`; żadna liczba fizyczna nie jest wartością domyślną w moście/adapterze. | guard AST na literały w `assembler/**` (dozwolone tylko stałe z rejestru normatywnego z odniesieniem) |
| S-07 | Każdy bieg niesie `Provenance` i `TraceArtifact`; wynik kluczowany tożsamościami twin. | schema guard ResultSetV2; test „brak provenance → odrzucony przez ResultStore" |
| S-08 | Determinizm: ten sam `snapshot_hash` + `settings_hash` + wersja solvera → bit-identyczny wynik; równoległe = szeregowe. | istniejące testy determinizmu + guard na realnych biegach (nie na sztucznym kroku) |
| S-09 | Wydajność ma budżet w CI (tabela §10); regresja czasu > 20 % = czerwony. | bramka benchmarkowa |
| S-10 | Zamrożone rdzenie zmieniane tylko przez ADR + B-01; rozszerzenia jako nowe solvery/adaptery. | `solver_diff_guard` + rejestr sankcji |

---

## 2. Pipeline

```
TwinRevision + Scenario + OperationalState + TimeContext
        │  EffectiveStateResolver (architektura §10)
        ▼
CanonicalNetworkSnapshot  ── immutable, snapshot_hash, provenance per atrybut, TopologyView (wyspy, TN, energizacja)
        │  SolverInputAssembler.view(kind)          ← JEDYNE miejsce interpretacji (c per pasmo, R_θ, n_parallel, ZIP, sterowanie DER, PV/slack, Z0, fazy, katalog@rev)
        ▼
SolverView  (PositiveSequenceView | SequenceView | PhaseView | ProtectionView | ThermalView | DynamicView | TimeSeriesView)
        │  SolverAdapter[kind]                       ← tłumaczy widok na frozen DTO solvera (PowerFlowInput, NetworkGraph…) + solver_mapping (id ↔ indeks)
        ▼
Solver (frozen / stable / new)  →  raw result + TraceArtifact
        │  ResultMapper[kind]                        ← indeksy → tożsamości twin; freeze
        ▼
ResultSetV2 + Provenance + Freshness  →  ResultStore  →  analizy interpretacyjne, projekcje, dokumenty
```

`SolverOrchestrator` (§7) steruje całością: wybiera analizy, sprawdza gotowość, buduje migawkę raz na scenariusz, uruchamia adaptery w DAG, cache'uje po kluczu, stempluje provenance.

### 2.1 `CanonicalNetworkSnapshot` — zawartość

```python
class CanonicalNetworkSnapshot(BaseModel):          # frozen, deterministyczny
    snapshot_hash: str; twin_revision_id: RevisionId; scenario_revision_id: str; operational_state_id: str; time_context: TimeContext | None
    catalog_revision_set: dict[str, int]
    assets: dict[AssetId, ResolvedAsset]               # parametry EFEKTYWNE (po katalogu@rev, override, deltach) + provenance per parametr
    terminals: dict[TerminalId, ResolvedTerminal]      # cn_id, phases, connected, in_service efektywne
    connectivity_nodes: dict[CnId, ResolvedCn]
    topology: TopologyView                             # TN (CN scalone przez zamknięte łączniki), wyspy, energizacja, tory zasilania, feedery
    earthing: dict[VoltageLevelId, EarthingSystem]     # układ TN/TT/IT, punkt neutralny SN, urządzenia uziemiające
    controls: dict[AssetId, ControlSpec]               # typowane sterowanie DER/OLTC/BESS (żadnych stringów `meta`)
    time_series: dict[str, TimeSeriesRef] | None
    missing: list[MissingDatum]                        # jawne braki (asset, parametr, wymagany przez które analizy)
```

Reguła: migawka NIE zna solvera. Widoki (§2.2) są czystymi funkcjami migawki i są cache'owane per `(snapshot_hash, kind)`.

### 2.2 Widoki solverowe (`SolverInputAssembler`)

| Widok | Dla solverów | Co robi (JEDNA implementacja) | Dziś rozproszone w |
|---|---|---|---|
| `PositiveSequenceView` | NR, GS, FD, OLTC, QSTS, N-1, hosting, WLS | TN z `TopologyView`; impedancje z katalogu@rev × długość × `n_parallel`; zaczepy/przesunięcia; ZIP z katalogu; sterowanie DER typowane → `InverterControl`/`PVSpec`; **dokładnie jeden slack per wyspa** (`Source.role`) lub slack rozproszony; shunty; odbiory silnikowe; wyspy bez źródła → pominięte z komunikatem | P1–P13 (10 builderów), `mapping.py`, `power_flow_input_builder.py`, `canonical_analysis._execute_power_flow` |
| `SequenceView` (1/2/0) | IEC 60909 3F/2F/2F-E/1F, pętla zwarcia nN L-PE/L-PEN, ziemnozwarciowe SN | c per pasmo (Tab. 1) z JEDNEGO rejestru; scenariusz MIN z R_θ(θ_k) dla przewodów; Z0 z grup połączeń TR i punktów neutralnych (`zero_sequence_transformer.py` — ZACHOWAĆ) **oraz C0 linii/kabli dla sieci kompensowanych** (dziś niezweryfikowane — pytanie A3 Q3); Z2 ≠ Z1 dla maszyn wirujących; wkład DER wg `sc_model` karty (k·In / P+Q / transient) | S1–S7, `short_circuit_binding.py`, `fault_loop_builder.py`, `fault_loop/service.py`, `upstream_equivalent.py` |
| `PhaseView` (ABC/ABCN) | rozpływ niesymetryczny nN (BFS/CI 4-przewodowy), stan fazowy SN, asymetria EN 50160 | żyły L1/L2/L3/N/PEN z `ConductorSet` (Carson/Kron), odbiory 1-/2-/3-fazowe z `phase_connection`, DER 1-fazowe, transformator Dyn fazowo, uziemienia N/PE | `computation.py:339-404` (dzieli /3 i uśrednia), `phase_state_sn.py` (własny DTO) |
| `ProtectionView` | IEC 60255 (krzywe, selektywność), krzywe nN (MCB/MCCB/gG), SWZ, TCC | urządzenia zabezpieczające z katalogu@rev, nastawy z rewizji/scenariusza, CT/VT z rdzeniami, prądy z `ResultSetV2` (SC min/max) — bez fizyki krzywych w aplikacji | `protection/overcurrent/calculator.py:121` (druga krzywa IEC), `domain_operations_v2.py:97-136` (TCC w domain ops), `protection_engine_v1.py` |
| `ThermalView` | Iz′ (PN-HD 60364-5-52, IEC 60287), I²t/k²S² (IEC 60949), starzenie | warunki ułożenia z assetu (metoda, temperatura, rezystywność gruntu, grupowanie, głębokość), dane cieplne żył z katalogu | `cable_ampacity_derating.py` (ZACHOWAĆ), `conductor_thermal_withstand.py` (ZACHOWAĆ), `lv_temperature_correction.py` (przenieść do solverów) |
| `DynamicView` | RMS (DAE), FRT/HVRT, rozruch silników dynamiczny | profile dynamiczne DER z `der_dynamic` (dziś osierocone), Thevenin w punkcie przyłączenia, zdarzenia ze scenariusza (`FaultDelta`, `der_trip`) | `frt_hvrt/engine.py` (stałe `tp/tiq/K`, `enm_ref="ncrfg_test"`), `stability_rms` (bez mostu) |
| `TimeSeriesView` | QSTS (PF w pętli), bilans BESS, hosting w czasie | binding serii → atrybuty per krok; SOC jako stan między krokami | `run_annual_oltc_profile` (1 skalar), fantom `run_time_series_power_flow` |
| `HarmonicView` | harmonic load flow, skan Z(f), rezonanse, SSCI | Ybus(h) z tego samego `admittance.py`; widma źródeł z karty (`harmonic_spectrum_pct` — nowe pole katalogu), filtry/kondensatory | `v126_academic._power_quality` (własny Ybus, widmo zaszyte) |

### 2.3 Los dzisiejszych ścieżek (inwentarz klasy A3 §2)

| Ścieżka dziś | Los | Uzasadnienie |
|---|---|---|
| P1 `canonical_analysis._execute_power_flow` | staje się `PositiveSequenceView` + adapter NR/GS/FD (przeniesienie kodu, nie przepisanie) | to najpełniejsza implementacja (c per pasmo, R_θ, ZIP, DER, OLTC) — brakuje PV/slack |
| P2 `network_wizard.build_power_flow_input`, P4 `execution_engine.load_flow_run_input`, P5 `power_flow_input_builder`, P12 `api/solver_input.run_audit2_power_flow`, P13 `domain/load_flow_input` | DELETE (P5: algorytm foldu szyny złożonej przenieść do assemblera) | 0 wywołań produkcyjnych lub `pq=[]`/`slack-stub` |
| P3 `analysis_run/service._build_power_flow_input` (+ `/api/runs/*`) | DELETE po potwierdzeniu braku klienta (frontend nie zawiera literału `/api/runs/`) | c=1,0, brak R_θ, brak n_parallel — zła fizyka |
| P6 `frozen_solver_input`, P7 `sld_substrate_power_flow`, P8 `station_archetype_substrate` | przepiąć na assembler (budują ENM/twin → `view`) | harness referencyjny zostaje, interpretacja nie |
| P9 `computation._power_flow_newton_raphson` + własny Ybus | przenieść do `tests/` jako niezależny wzorzec (oracle) | „nie-tautologiczny dowód K-04" — wartościowy jako test, szkodliwy jako kod produkcyjny |
| P10 `computation._power_flow_unbalanced_bfs` (dzieli /3, uśrednia fazy) | DELETE; zastąpić `PhaseView` + solver nN ABCN | gubi sens analizy niesymetrycznej |
| P11 `solver_input/builder.build_solver_input` (payload JSON „single entry point" bez konsumenta-solvera) | DELETE; provenance z tego pakietu (`provenance.py`) ZACHOWAĆ i przenieść do migawki | payload nie zasila żadnego solvera |
| S1 `canonical_analysis._execute_short_circuit` | staje się `SequenceView` + adapter SC | jw. jak P1 |
| S2 `short_circuit_binding` (1 węzeł, tb_s=0,1 zaszyte, brak 2F-E) | scalić z S1 (jedna pętla po węzłach, jeden `tb_s` ze ustawień) | duplikat z gorszym zakresem |
| S3 `analysis_run._solve_short_circuit` (c=1,0, k_sc=1,1) | DELETE | zła fizyka |
| S4 `network_wizard.build_short_circuit_input` | DELETE | 0 wywołań |
| S5/S6 referencyjne | przepiąć na assembler | jw. P6–P8 |
| S7 `ShortCircuitPayload` JSON | DELETE | jw. P11 |
| `api/fault_loop.py` (ręczne R/X) | DELETE ręczne wejście; pętla wyłącznie z migawki (`fault_loop/service.py` → `SequenceView`) | „druga ręka użytkownika" wbrew §172 |

---

## 3. `SolverInputAssembler` — reguły interpretacji (jedno źródło prawdy)

### 3.1 Rejestr stałych normatywnych
`simulation/normative_constants.py`: każda stała ma `value`, `unit`, `source` (norma + tabela/punkt), `scope`. Zawiera dzisiejsze rozproszone: c per pasmo (IEC 60909-0 Tab. 1: SN 1,10/1,00; nN 1,05/0,95), R/X zasilania systemowego 0,1 (IEC 60909-0 §6.2.1 — dziś w `mapping.py` bez cytatu), κ (`1,02+0,98e^(−3R/X)`), m/n cieplne, β/ρ20 przewodów, współczynnik temperaturowy 0,004 przy 20 °C, Tab. 41.1 czasów wyłączenia (IEC 60364-4-41), pasma MCB (IEC 60898-1), progi sanity Ik″ per pasmo. Duplikaty (`C_MIN/C_MAX` płaskie w `short_circuit_iec60909.py`, `C_MIN_LV/C_MAX_LV` w `fault_loop_iec60364.py`, `StudyCaseConfig.c_factor_*`) → referencje do rejestru. Wartości „v0" bez źródła (`k_load 1,20`, `k_sc 0,80`, `TMS 0,30` w `protection/overcurrent/calculator.py`, `0,95·P` w FRT, `0,45²` w `_opf_loss_lcc`, sigmy `_uncertainty`) → USUNIĘTE lub przeniesione do `DesignPolicySet` projektu z jawnym statusem POLICY (architektura §18).

### 3.2 Reguły węzła bilansującego i regulacji
- `ExternalGrid.role ∈ {SLACK, PV_EQUIVALENT, PQ_EQUIVALENT}`; assembler wymaga **dokładnie jednego** SLACK per wyspa z siecią; wiele zasilań systemowych (2 GPZ, sieć dwustronnie zasilana) → `DistributedSlack{participation}` (kontrakt istnieje martwy w `domain/load_flow_input.py` — ożywić w rdzeniu NR jako rozszerzenie wejścia, ADR-021) albo jawna odmowa `NOT_READY(multiple_slack)` do czasu wdrożenia.
- `SynchronousMachine.control ∈ {PV(U_set, Q_min/max), PQ}` → `PVSpec`; PEC (falownik) → `InverterControl` z typowanych osi (`ReactiveControlMode`, `ActivePowerFrequencyMode`, `VoltageSourceCapability`) — koniec 12 wariantów stringa (A5-03); GFM w wyspie bez sieci = węzeł referencyjny wyspy (`PVSpec` z U_set i statyzmem — rozszerzenie wejścia, nie rdzenia).
- Wyspa bez źródła tworzącego napięcie → nie jest rozwiązywana; wynik `DEENERGIZED` z `TopologyView`, nie NaN.

### 3.3 Reguły zwarciowe
- c per pasmo z rejestru; override tylko jawny w ustawieniach biegu (`c_override` z provenance OVERRIDE).
- MIN: R_θ(θ_k) dla przewodów (θ_k z klasy izolacji katalogu), DER wg `sc_model`, maszyny z Z″/Z′ (istnieje), wyłączone źródła wg scenariusza.
- Z0: grupa połączeń TR (ZACHOWAĆ `zero_sequence_transformer.py`), uziemienie punktu neutralnego (cewka/rezystor/izolowany) jako impedancja, **C0 linii i kabli** (obowiązkowe dla sieci izolowanych/kompensowanych — zweryfikować obecny `_assemble_zero_sequence_y0`, pytanie A3 Q3), ekrany kabli.
- Z2 ≠ Z1 dla maszyn wirujących (adapter przekazuje `z2_bus`; rdzeń już przyjmuje parametr).
- Zwarcie w punkcie wzdłuż gałęzi (`FaultDelta.position_km`) = adapter wstawia tymczasowy węzeł w `SequenceView` (bez zmiany rdzenia).
- Ith z n ≠ 1 blisko generatorów: rozszerzenie rdzenia (B-01, ADR-021) — do decyzji; do czasu decyzji wynik oznaczony założeniem `n = 1 (daleko od generatora)` w provenance.
- Pętla zwarcia nN L-PE/L-PEN: ta sama `SequenceView` (Z1+Z2+Z0 z żył `ConductorSet`) — koniec dwóch fizyk Ik1 (audyt A11: ratio 0,86 między pętlą a IEC 60909 wynika z brakującego K_T i modelu Z0 kabla; w jednym widoku różnica staje się jawnym wyborem metody: IEC 60909 1F vs IEC 60364-4-41 loop, obie z tych samych impedancji).

### 3.4 Reguły cieplne i katalogowe
- `n_parallel` (kable, TR) tylko w assemblerze; `Iz′` z warunków ułożenia assetu; brak warunków = `MISSING` (nie „Iz katalogowe").
- Katalog materializowany w rewizji bindingu; `catalog_revision_set` w provenance.

---

## 4. Wspólny rdzeń numeryczny

### 4.1 `simulation/kernel/admittance.py`
Jedna funkcja `build_admittance(view, sequence: 1|2|0, h: int = 1, taps=True) -> SparseAdmittance` używana przez PF (NR/GS/FD), SC (Zbus), harmoniczne, WLS (dziś `state_estimation_wls.ybus_from_network_graph` reużywa PF — dobrze). Łączniki NIE są w macierzy — TN z `TopologyView` scalają je wcześniej (koniec union-find w `ybus.py` i osobnego stemplowania w `newton_internal._build_ybus_ohm`). Zaczepy i przesunięcia fazowe jak dziś w NR. White Box: ślad budowy (istniejący `WhiteBoxTracer` dla Y0 — zachować).

### 4.2 Algebra rzadka
- CSR + `scipy.sparse.linalg.splu` w NR/FD (rdzeń NR jest FROZEN — zmiana faktoryzacji to B-01/ADR-021; alternatywa bez B-01: adapter buduje macierz rzadką, a rdzeń dostaje gęstą tylko dla n < 500).
- SC: kolumna `Z[:, k] = splu.solve(e_k)` per węzeł zwarcia (O(n·nnz)) zamiast `inv(Y)` per węzeł (O(N·n³), `short_circuit_core.py:51`); pełna inwersja tylko na żądanie (White Box pełnej Zbus dla małych sieci).
- N-1: ciepły start i faktoryzacja bazowa z aktualizacją rzędu 1 (Sherman–Morrison) — **zmienia ostatnie cyfry** względem dzisiejszego biegu; dziś zakazane (`kontyngencje_n1.py:99-105`) → decyzja właściciela (§11 Q4): dopuszczalna tolerancja determinizmu per solver (np. 1e-9 pu) czy bit-identyczność.

---

## 5. Rodziny solverów — stan i cel

### 5.1 Rozpływ mocy (składowa zgodna)
| Element | Stan (A3) | Cel |
|---|---|---|
| NR (`power_flow_newton*`) | FROZEN, zweryfikowany | KEEP; wejście przez `PositiveSequenceView`; slack rozproszony (rozszerzenie wejścia) |
| GS | FROZEN, „diagnostyczny", ma `allow_fallback` (cicha heurystyka) | KEEP jako diagnostyka; `allow_fallback` usunięty (S-05) |
| FD | FROZEN; **nie zbiega na kablach nN** (test `test_power_flow_lv.py:427`) | KEEP z bramką stosowalności `max(R/X) ≤ 0,5` (albo inny próg zmierzony) — odmowa `NOT_APPLICABLE`, nigdy dywergencja jako wynik |
| OLTC (`power_flow_oltc*`) | STABLE | KEEP; `sweep/annual/optimize` → scenariusze (`TapDelta`, `TimeSeriesBindingDelta`) |
| ZIP, falowniki (`power_flow_zip/inverter`) | STABLE, parytet NR/GS/FD | KEEP; tryby z typowanych osi |
| szyny PV | nigdy z ENM | `SynchronousMachine.control=PV` → `PVSpec` |
| straty/loading/violations | straty w wyniku; loading/violations w analysis | KEEP podział: solver = U/θ/I/P/Q/straty/zaczepy; analysis = loading vs rating, violations vs pasmo, reverse power flag (nowe: kierunek P na TR/PCC) |

### 5.2 Zwarcia
| Element | Stan | Cel |
|---|---|---|
| IEC 60909 rdzeń (3F/2F/2F-E/1F, Ik″/ip/Ib/Ith, wkłady) | FROZEN, 549 testów | KEEP; `SequenceView`; wszystkie typy w jednej pętli po węzłach (S2 znika) |
| maszyny (`machine_sc_iec60909`) | STABLE | KEEP |
| DER wkład | `k_sc·In` jedyny; pola karty `sc_model/sc_pq_split/sc_transient_k/sc_sustained_k` bez konsumenta | adapter konsumuje kartę: k·In (prosty), P+Q (kąt), transient/sustained (Ik″ vs Ib/Ith); sekwencje ujemna/zerowa z karty i z układu (4-przewodowy nN) |
| Z2 ≠ Z1, punkt wzdłuż gałęzi, n ≠ 1 | brak | §3.3 |
| sanity Ik″ per pasmo | ISTNIEJE (`short_circuit_bounds`) | KEEP; rozszerzyć sanity na PF (napięcia poza 0,5–1,5 pu, straty > 100 %) i SWZ |
| pętla zwarcia nN (`fault_loop_iec60364`, `route.py`, `swz/`) | MVP (TT/IT „deferred", 2 fizyki Ik1) | jedna `SequenceView`; TT (R_A, R_B, Ia·R_A ≤ 50 V) i IT (pierwsze/drugie zwarcie) w pełni; werdykt SWZ w `ConstraintEngine` |

### 5.3 Rozpływ niesymetryczny nN (NOWY solver — decyzja właściciela, A3 Q4)
Rekomendacja: **solver 3-fazowy 4-przewodowy metodą current-injection/BFS** (Carson–Kron dla żył L1L2L3N(PE), transformator Dyn z modelem fazowym, ZIP per faza, DER 1-fazowe i 3-fazowe, prąd N/PEN, VUF wg EN 50160, straty per faza) jako solver addytywny w `simulation/solvers/power_flow_phase_lv.py`; NR pozostaje dla sieci symetrycznych i SN; FD tylko przy X ≫ R. Istniejący `power_flow_unbalanced.py` (BFS 3-fazowy bez N, własny DTO) = punkt wyjścia; most `/3 + średnia` usunięty. Walidacja: IEEE 13/34 pełne (per faza), CIGRE LV, parytet z NR na sieci symetrycznej.

### 5.4 DER i wyspy w rozpływie
- `VoltageSourceCapability=GRID_FORMING` w wyspie bez sieci → węzeł referencyjny wyspy (`PVSpec` z U_set i statyzmem; f z `ActivePowerFrequencyMode`); bilans wyspy z PF, nie ze znamionowych (A5-05).
- BESS: `P<0` (ładowanie) jako zwykły wstrzyk; SOC jako stan `TimeSeriesView` (QSTS); sprawność z karty; zdolność P/Q czterokwadrantowa z `pq_curve`.

### 5.5 Rozruch silników (§29)
`AsynchronousMachine` w twin (Istart/In, cosφ_start, metoda rozruchu, moment) → (a) statyczny (istnieje w v126 — przenieść na migawkę, koniec `parameters["motors"]`), (b) dynamiczny: rozruch w pętli QSTS krótkookresowej (t < 10 s) z momentem obciążenia — nowy solver-adjacent; wynik: ΔU w całej sieci (z PF), czas rozruchu, obciążenie TR, wpływ na flicker.

### 5.6 Harmoniczne i jakość energii (§30–§31)
- `HarmonicView` na wspólnym `admittance(h)`; widma z karty (`harmonic_spectrum_pct` per rząd; brak = `MISSING`, nie stała `{5:3%…}`); kondensatory/dławiki/filtry z twin; rezonanse (istnieje `z_scan`).
- Analiza PQ (warstwa interpretacji) składa: odchylenie U (PF), VUF (solver ABCN), THD (harmoniczny), Pst/Plt (istniejący `migotanie.py` — przenieść fizykę Pst do solverów, interpretację zostawić), RVC, alokacja emisji wg IEC 61000-3-6/3-7 per punkt przyłączenia; limity EN 50160 w `normative_constants`.

### 5.7 Dynamika (FRT/HVRT, RMS)
`DynamicView` z Theveninem w punkcie przyłączenia (istnieje `upstream_equivalent.py`), profile z `der_dynamic` (osierocone — wpiąć), zdarzenia ze scenariusza (`FaultDelta`, `der_trip`). `frt_hvrt/engine.py` (stałe `tp/tiq/K`, `enm_ref="ncrfg_test"`) → parametry z karty; `stability_rms` (DAE) zastępuje syntetyczną trajektorię `application/stability/voltage_trajectory.py`. Test T14/T15 (LVRT) przestaje być tautologią (A5-07): werdykt z trajektorii U(t) vs profil.

### 5.8 Studia i analizy na scenariuszach (nie osobne solvery)
N-1 (istnieje — staje się generatorem scenariuszy + PF/SC per scenariusz), hosting capacity (jedna implementacja: skan progowy na PF z Q(U) wg profilu operatora; MC jako opcja), obszar P-Q, odpowiedź na polecenie OSD, kompensacja, wrażliwość (dU/dP, dU/dQ z jakobianu — eksponować `build_jacobian_v2` przez adapter, bez zmiany rdzenia; wrażliwość na Sk/uk/długość/zaczep przez re-solve scenariuszy), QSTS, tap/switching/reactive optimization (→ `MV_DESIGN_PRO_DESIGN_OPTIMIZATION_ARCHITECTURE.md`).

### 5.9 Estymacja stanu (§117–§118)
WLS (KEEP) na `PositiveSequenceView` + `MeasurementSet` z twin (`Measurement{id, target, quantity, value, unit, sigma, timestamp, quality, source}`); pseudo-pomiary tylko jawnie `ASSUMED`; wynik `ESTIMATED` w osobnym magazynie; residua per pomiar w śladzie.

### 5.10 Pakiet akademicki V12.6 — los per analiza (A3-06)
| Analiza | Los |
|---|---|
| `_power_quality` | → `HarmonicView` + PQ analysis (§5.6); własny Ybus usunięty |
| `_ssci_impedance` | KEEP fizykę (Z_conv z pasm regulatora) na `admittance(h)`; droop GFM z karty, nie 4/3 % |
| `_voltage_stability` | wycofana — usunąć (albo wdrożyć CPF jako scenariusz LoadScaleDelta) |
| `_reliability` (N-1/N-2 bez PF, MTTR zaszyte) | tylko wskaźniki SAIDI/SAIFI/EENS z modelu niezawodnościowego (§ reliability-ready: `failure_rate`, `mttr` jako atrybuty katalogu/assetu, nie stałe) — N-1 z ScenarioEngine |
| `_earthing` (IEEE 80, uziom z `parameters`) | `EarthElectrode` w twin + PN-EN 50522/IEEE 80 jako solver z migawki |
| `_neutral_earthing_design` (Petersen/NER) | KEEP (z ENM) → dobór w Design Engineering |
| `_insulation` | KEEP |
| `_earth_fault_detection` | wejście z `EarthingSystem` twin |
| `_transient` (TRV/inrush) | KEEP fizykę; parametry z karty TR/wyłącznika |
| `_motor_starting` | → §5.5 |
| `_hosting_capacity` MC | opcja stochastyczna jednego silnika hosting |
| `_opf_loss_lcc` (nie jest OPF; 0,45² zaszyte) | przemianować na ocenę strat/LCC z obciążenia z PF/QSTS; OPF właściwy w Design Optimization |
| `_benchmark_validation` | do `tests/` (oracle) |
| `_uncertainty` (sigmy zaszyte) | model niepewności z `DataQuality`/`ParameterProvenance` (KNOWN/ASSUMED/ESTIMATED) — sigma z jakości danych, nie stała |

---

## 6. Encje twin wymagane przez solvery (delta do architektury §4)
`AsynchronousMachine` (silnik z rozruchem), `HarmonicSource`/`harmonic_spectrum_pct` na karcie PEC, `EarthElectrode`, `Measurement` (pomiar), `Source.role`, `SynchronousMachine.control`, typowane `ControlSpec` DER, `EnergyConsumer.phase_connection`, `ConductorSet` żył, `failure_rate/mttr` w katalogu (reliability-ready), `TimeSeries`. Każda z provenance; brak = `MISSING`.

---

## 7. `SolverOrchestrator`

```python
class SolverOrchestrator:
    def plan(self, project, scenario_ids, requested: set[AnalysisKind] | Literal["REQUIRED","AFFECTED"]) -> ExecutionPlan   # DAG + readiness + cache
    def run(self, plan) -> list[RunHandle]        # równolegle per scenariusz (process pool); szeregowo wewnątrz DAG zależności
```
- **DAG analiz** (deklaratywny rejestr): `TOPOLOGY → {LF, SC, FAULT_LOOP, PHASE_LF, HARMONIC, RMS}`; `LF → {LOADING/VIOLATIONS, LOSSES, HOSTING, N-1(scenariusze), SENSITIVITY, PQ_DEVIATION, WLS}`; `SC → {THERMAL_WITHSTAND, EQUIPMENT_DUTY, PROTECTION/TCC, SWZ(SC_MIN), ARC_FLASH, EARTHING_TOUCH}`; `PHASE_LF → {VUF, N_CURRENT}`; `HARMONIC → {THD, RESONANCE, SSCI}`; `RMS → {FRT, STABILITY}`; `DOCUMENT(X) → *`.
- **Gotowość**: `ReadinessService` per (analiza, scenariusz) — brak wejść = `NOT_READY(missing)` z fix-action; analiza niestosowalna = `NOT_APPLICABLE(reason)`.
- **Tryby**: `RUN_REQUIRED` (wszystko, co dojrzałość projektu wymaga i jest STALE), `RECALCULATE_AFFECTED` (zbiór STALE z grafu zależności), `RUN_SELECTED`.
- **Cache**: klucz `(snapshot_hash, solver_id, solver_version, settings_hash, catalog_revision_set)`; trafienie = ten sam `run_id` (istniejący wzorzec `wykonaj_bieg_w_pamieci` — zachować semantykę „w pamięci" dla what-if).
- **Równoległość — abstrakcja `ExecutionBackend` (korekta właściciela D-07)**: `SolverOrchestrator` nie zna sposobu wykonania. Interfejs `ExecutionBackend.submit(job) -> JobHandle` / `gather(handles) -> results`, dwie implementacje: `LocalProcessPoolExecutionBackend` (TERAZ — pula procesów w API; numpy/scipy nie zawsze zwalniają GIL, procesy bezpieczniejsze) oraz `WorkerQueueExecutionBackend` (PÓŹNIEJ — kolejka workerów), wpinana BEZ zmiany `SolverOrchestrator` ani żadnego solvera. Wybór backendu = konfiguracja wdrożeniowa, nie decyzja architektoniczna kodu. Celery/Redis: dziś 0 tasków — wygaszane jako martwa infrastruktura, ale scenariusz kolejki pozostaje otwarty przez `WorkerQueueExecutionBackend` (ADR-020).
- **Awarie**: bieg częściowy = `PARTIAL` z listą analiz FAILED i przyczyną; nigdy cichy sukces.
- **Provenance**: stemplowana przez orkiestrator; `solver_version` z rejestru zdolności (nie `or "1.0.0"`).
- **API**: `POST /projects/{p}/runs {scenario_ids, mode, analyses?}` → `plan_id`; `GET /runs/{id}`; `GET /projects/{p}/results?scenario=&analysis=`.

Wygaszenie: `analysis_run/orchestrator.py` (2 analizy), `batch_execution_service.py` (pętla sekwencyjna), `unified_run_dispatch.py` („compatibility facade"), `execution_engine` (test-only), 8 importów prywatnego `_execute_power_flow` → publiczne `orchestrator.run_variant(view_delta)`.

---

## 8. Rejestr zdolności solverów

**WYMÓG WŁAŚCICIELA (§C.1 — SOLVER CAPABILITY REGISTRY).** Rejestr jest bramką wykonania, nie dokumentacją: każda analiza uruchamiana jest WYŁĄCZNIE przez wpis rejestru, a wpis deklaruje jawnie `SUPPORTED` / `PARTIAL` / `PLANNED` / `NOT_IMPLEMENTED` wraz z zakresem stosowalności. Zabroniony jest solver dostępny w UI bez wpisu, wpis bez testu stosowalności oraz status `implemented` nadany hurtem. Użytkownik widzi status zdolności przed uruchomieniem; brak zdolności = jawna odmowa z powodem, nigdy cichy wynik przybliżony.
`solver_capability_registry.py` (istnieje, 25 wpisów, wszystkie `implemented`) rozszerzony o: `phase_domain`, `applicability` (predykaty na migawce: R/X, wyspy, obecność żył N), `inputs_required` (listy atrybutów → readiness), `outputs`, `trace_format`, `determinism_tolerance`, `performance_budget`. Guard: każdy solver w `simulation/solvers` ma wpis; każdy wpis ma test stosowalności (iniekcja niestosowalnej sieci → odmowa).

---

## 9. White Box, ślad, dowody, guardy
- Jeden format śladu: `TraceArtifact` (v2 istnieje jako 2 404 LOC bez konsumenta — decyzja: **wpiąć**, bo mandat §113–§114 wymaga forensic; alternatywa: usunąć i zostawić ślady inline — §11 Q5). Każdy solver emituje; `run_hash` niezależny od formatowania; guard determinizmu na realnych biegach 4 sieci referencyjnych (nie na sztucznym kroku).
- Proof engine WYŁĄCZNIE formatuje wartości z wyniku/śladu (dziś 21 wyrażeń fizycznych w `proof_generator.py` — κ, ip, √(m+n), ΔU, i_b): golden dowody bit-identyczne przed/po przeniesieniu.
- Arc flash (IEEE 1584 w `analysis/`), flicker Pst (w `application/analyses`), krzywa IEC (w `application/analyses/protection`), R_θ (w `application/solvers`) → `simulation/solvers`.
- Nowy guard `backend_no_physics_guard.py`: rodziny wielkości (√3, κ, exp(−3R/X), I²t, k/(M^a−1), R·(1+α(θ−20)), P/(√3·U·cosφ)) poza `simulation/solvers` = czerwony; allowlista pusta na starcie po migracji.
- `solver_boundary_guard` + `solver_diff_guard`: KEEP; rejestr sankcji tylko przez ADR.

---

## 10. Wydajność — budżety (do `MV_DESIGN_PRO_PERFORMANCE_PLAN.md`)

| Operacja | Sieć S (≈50 szyn) | M (≈315 szyn, substrat 53 stacji) | L (≈2 000 szyn SN+nN) | Dziś |
|---|---|---|---|---|
| PF NR | < 50 ms | < 200 ms | < 2 s | M: ok. 0,4 s (76 % jakobian — N1-WYDAJNOSC) |
| SC wszystkie węzły 4 typy | < 100 ms | < 1 s | < 10 s | O(N·n³) inwersja per węzeł |
| N-1 pełne (wszystkie gałęzie) | < 1 s | < 10 s | < 120 s (równolegle) | 374,7 s / 142 kontyngencje |
| projekcja SLD (scena semantyczna) | < 20 ms | < 100 ms | < 500 ms | — (SN w kliencie) |
| QSTS 24 pkt | < 1 s | < 5 s | < 60 s | brak |

Bramka CI: benchmark na 3 sieciach (S/M/L generowane deterministycznie), próg regresji 20 %.

---

## 11. Decyzje właściciela
1. Solver nN ABCN: nowy solver current-injection/BFS 4-przewodowy (rekomendacja) czy rozszerzenie NR o model fazowy?
2. B-01: rozszerzenia rdzenia SC (Ith z n ≠ 1; Z2 jako wejście — już przyjmowane) i NR (slack rozproszony, algebra rzadka) — zgoda na ADR-021?
3. Kasacja ścieżek legacy z §2.3 (w tym `/api/runs/*` po potwierdzeniu braku klienta).
4. Determinizm N-1 z ciepłym startem: bit-identyczność czy tolerancja per solver?
5. `trace_v2` wpiąć czy usunąć?
6. Celery/Redis: usunąć na rzecz puli procesów (0 tasków dziś)?
7. Tautologia T14/T15 LVRT (A5-07) — adnotacja w dotychczas wystawionych certyfikatach?
