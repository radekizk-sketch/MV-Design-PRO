# MV-DESIGN-PRO — CANONICAL TWIN ARCHITECTURE (własność, ENM, terminale/łączność/fazy, rewizje, warianty, scenariusze, StudyCase, EffectiveSnapshot, topologia, Computational IR, ResultSet/provenance)

**Status:** KANONICZNY (konstytucja §5–§9, §11, §16, §21, §36). Konsoliduje trzy dokumenty z 2026-09-04: `CANONICAL_DIGITAL_TWIN.md` (część A), `REVISION_SCENARIO_EXECUTION_MODEL.md` (część B), `COMPUTATIONAL_BOUNDARY.md` (część C) — te pliki przestają istnieć; odwołania „§A.n / §B.n / §C.n" wskazują części tego dokumentu. Kolejność wdrożenia: `CONVERGENCE_ROADMAP.md`; decyzje i zamrożenia: `DECISION_FREEZE_REGISTER.md`; macierz zdolności: `CAPABILITY_ARCHITECTURE_MATRIX.md`; dowody: `../evidence/CONVERGENCE_EVIDENCE.md`.
**Zasada nadrzędna (konstytucja §5):** Digital Twin nie jest nowym trwałym modelem obok ENM. Project Digital Twin = Canonical ENM Core (trwała prawda inżynierska) + lifecycle (rewizje, warianty, scenariusze, rewizje nastaw, wiązania katalogowe, założenia, proweniencja, historia). Zakaz łańcucha ENM → TwinModel → NetworkModel → SolverModel.

---

# CZĘŚĆ A — Canonical Project Twin = rozwinięty ENM

## A.1. Werdykt: ENM jest kandydatem, który PRZECHODZI ocenę na rdzeń Digital Twin (§4)

Ocena wg realnego runtime i konsumentów (pomiar: audyty A1, A2, A9 w `docs/twin/MV_DESIGN_PRO_DIGITAL_TWIN_AUDIT.md`):

| Kryterium rdzenia twin | ENM dziś (dowód) | Ocena |
|---|---|---|
| jeden model, jedna ścieżka zapisu | `POST /api/cases/{case}/enm/domain-ops` → `enm/store.set_enm` — jedyny tor zapisu; wszystkie analizy kanoniczne czytają `get_enm` (A9 §3.3 poz. 1) | SPEŁNIA |
| stabilna tożsamość | `ENMElement.ref_id` stabilne, `_strip_uuids` przy zapisie — `ref_id` jest tożsamością (A1 §2) | SPEŁNIA (uuid4 `id` do usunięcia — A1-14) |
| typowany model domeny | Pydantic: `Bus`, `Cable`, `OverheadLine`, `SwitchBranch`, `FuseBranch`, `Transformer` (z `TapChanger`, `vector_group`, `hv/lv_neutral: GroundingConfig`), `Source`, `Load`, `ShuntCapacitor`, `Generator`, `Measurement`, `ProtectionAssignment`, `Substation`/`GPZSection`/`NnSection`, `Bay` z pełnym modelem (`BayPrimaryDevice`, `BayMeasurementChain`, `BayProtectionControlUnit`, `BayInterlockSet`, `BayEarthFaultPath`, `BayCanonicalModel`), `Junction`, `Corridor`, `BranchPointSN`, `LineRun`, `CableJoint`, `ConnectionConditions`, `ParameterOverride` (`enm/models.py`) | SPEŁNIA w szerokości; luki w egzekwowaniu (niżej) |
| migawka biegu zamrożona z hashem | `CanonicalRun.snapshot` + `snapshot_hash` + `input_hash` (`enm/canonical_analysis.py:88-98, 252`) | SPEŁNIA — wzorzec do promocji na `EffectiveNetworkSnapshot` |
| dziennik zmian | `enm/dziennik_zmian.py` per case, zapis 2-fazowy, limit 500 | SPEŁNIA częściowo — zalążek magazynu rewizji |
| walidacja, gotowość, akcje naprawcze | `ENMValidator`, readiness, fix-actions w odpowiedzi domain-ops | SPEŁNIA |
| projekcje z backendu | projekcja nN 3.0.0 (BFS po ENM, energizacja, SWZ) — wzorzec dla SN | SPEŁNIA (nN), brak (SN) |
| własność projektu | plik per `sha256(case_id)` (`enm/store.py:82`); „ENM istnieje niezależnie od DB" (`api/enm.py:151-156`) | **NIE SPEŁNIA — P0 (§5)** |
| terminale i łączność jako kontrakt | `Port`/`PortRef`/`ConnectionNode` = metadane bez egzekwowania (A1-03); łączność przez `from_bus_ref/to_bus_ref` | NIE SPEŁNIA — addytywnie naprawialne (§3) |
| model fazowy, N/PEN/PE | brak (A1-04, A11-03/04) | NIE SPEŁNIA — addytywnie naprawialne (§4) |
| uziemienie jako encja z fizyką | `GroundingConfig` istnieje, ale fizyka jej nie czyta; 6 reprezentacji (A11-02) | NIE SPEŁNIA — konsolidacja (§4) |
| typowane pola stacji jako prawda | `Bay` typowany istnieje, ale zapis typowanych kolekcji wyłączony (`LEGACY_FIELD_COLLECTIONS`), prawda w `meta.field_specs` (A1-02) | NIE SPEŁNIA — migracja (§6) |
| operacje domenowe na typach | 133 sygnatury `enm: dict[str, Any]`, god-files 16,5k LOC (A1-10, A1-19) | dług strukturalny, nie blokujący fundamentu |
| hashe nagłówka | `semantic/input/case/variant_hash` zadeklarowane, nigdy nie wypełniane (A2 §1.5) | **USUNIĘTE (CV-2, H1)** — tożsamość biegu niesie `RevisionEnvelope` (`enm/envelope.py`); guard wskrzeszenia: `tests/enm/test_hash_chain_split.py` |

**Wniosek:** każda luka jest domykalna addytywnie (nowe typowane kolekcje/pola z `exclude_none`, konsolidacja istniejących encji, zmiana klucza magazynu). Nie istnieje jednoznaczny dowód, że ENM nie da się rozwinąć — więc zgodnie z §4 **nie tworzy się drugiego trwałego modelu sieci**. Wszystkie dokumenty i ADR, które mówią o „TwinModel" jako nowej klasie, czyta się jako „ENM rozwinięty".

### A.1.1 Zakaz równoległych prawd (§4, §28) — los każdego kandydata

| Kandydat | Los | Gdzie |
|---|---|---|
| `TwinModel` (nowa klasa) | **nie powstaje** | ten dokument |
| `EnergyNetworkModel` | **Canonical Project Twin** — jedyny trwały model sieci | ENM |
| `network_model/core` (`NetworkGraph`, `Node`, `Branch`, `NetworkSnapshot`) | **Derived Immutable Computational IR** — nie trwały, nie edytowalny, budowany wyłącznie z `EffectiveNetworkSnapshot` | część C |
| legacy ORM `network_nodes/branches/sources/loads`, `network_snapshots`, `sld_*` + tor `analysis_runs`/wizard/`xlsx_import` | **DELETE procedurą kasacji** (inventory → consumer search → data export → parity → cutover → observation → removal); `xlsx_import` przepięty na komendy domenowe (D-45) | `CONVERGENCE_ROADMAP.md`, część C §C.3 |
| model SLD (`sldNetwork53` ręczny w kliencie; `enmToSldAdapter` 6585 LOC z własną topologią) | **projekcja** twin — scena semantyczna z backendu; ręczne modele sieci w kliencie kasowane | `docs/twin/MV_DESIGN_PRO_SLD_PRESENTATION_ARCHITECTURE.md` |
| „model solvera" (10 builderów PF, 7 ścieżek SC, własny NR w `reference_networks/computation.py`) | **jeden assembler** ES → IR → kontrakt wejścia solvera | część C §C.3 |
| `meta.field_specs` / `nn_field_specs` | **strangle → delete** po migracji do typowanego `Bay` | §6 |

---

## A.2. Własność modelu (§5): PROJECT owns the canonical network model

**Stan dziś (P0 architectural defect):** ENM jest przechowywany per `case_id` (`enm/store.py:82` — `sha256(case_id)`), `StudyCase` (SQL `study_cases`) + `project_settings.active_case_id`; każdy przypadek ma własną kopię sieci; magazyn tworzy domyślny model dla dowolnego `case_id`. To dokładnie zakazana konstrukcja „StudyCase owns ENM".

**Stan docelowy:**
```
Project
 └─ Canonical ENM (jedna instancja logiczna)
     ├─ ModelRevision[]            (append-only; checkout(rev) odtwarza hash)
     ├─ NetworkVariation[]         (typowana delta strukturalna na rewizji bazowej)
     ├─ OperatingScenario[]        (typowane nadpisania stanu pracy)
     └─ StudyCase[]                (rewizja + wariant + scenariusz + konfiguracja analizy/solvera/profilu — BEZ kopii sieci)
```
Inwarianty (przypinane testami w `tests/invariants/`): (I-1) dla projektu istnieje dokładnie jeden magazyn ENM; (I-2) `StudyCase` nie posiada pola z modelem sieci ani klucza magazynu ENM; (I-3) dwa przypadki tego samego projektu na tej samej rewizji/wariancie/scenariuszu dają ten sam `EffectiveNetworkSnapshot.hash`; (I-4) zmiana ENM przez komendę domenową unieważnia wyniki wszystkich przypadków projektu zgodnie z grafem zależności (dziś: all-or-nothing, docelowo selektywnie — ADR-026).

**Migracja (wycinek CV-1, procedura kasacji z `docs/twin/MV_DESIGN_PRO_MIGRATION_PLAN.md` §0 pkt 8):** (1) inventory: pliki `.enm_store/<sha256(case)>.json` per projekt, przypadki per projekt, `active_case_id`; (2) consumer search: wszyscy czytelnicy `get_enm(case_id)`/`set_enm(case_id, …)` (API `enm.py`, `execution_runs`, projekcje, archiwum ZIP, szablony, generatory); (3) data export: ENM każdego przypadku eksportowany do archiwum projektu; (4) parity: ENM przypadku aktywnego = rewizja bazowa projektu; ENM innych przypadków o innym hashu = **`NetworkVariation` wyprowadzony jako diff komend** (jeśli diff nie jest wyrażalny komendami — jawny raport migracji, nie cicha utrata); (5) cutover: `get_enm(project_id)` + fasada `case_id → project_id` na czas przełączenia (`api/enm.py` ścieżki `/cases/{case}/enm/…` pozostają jako alias do wygaszenia); (6) observation: guard wykrywający zapis do magazynu kluczem przypadku; (7) removal: kasacja fasady i klucza per case. Dowód: `../evidence/CONVERGENCE_EVIDENCE.md` DoD 1–2.

---

## A.3. Model rzeczywistości fizycznej (§6): łączność terminalowa na ENM — addytywnie

**Decyzja T-1 — `Bus` ≡ `ConnectivityNode`.** W ENM `Bus` jest już trwałym punktem elektrycznym, a `SwitchBranch` jawnym urządzeniem między dwoma punktami; scalanie punktów przez zamknięte łączniki (union-find w `AdmittanceMatrixBuilder`, `ybus.py:71-86`) jest wyprowadzeniem węzła topologicznego. To model node-breaker w sensie CIM, w którym `Bus` pełni rolę `ConnectivityNode`, a sekcja szyn/rozdzielnia jest `Bus` o rodzaju `BUSBAR_SECTION`; `Junction` (istnieje) = punkt łączeniowy bez szyny. Nazwa klasy `Bus` pozostaje (bez przemianowania kodu); semantyka jest zdefiniowana tutaj i w docstringu klasy. Węzeł topologiczny (`TopologicalNode`) **nigdy nie jest trwały** — część C §C.2.

**Decyzja T-2 — terminal jako kontrakt łączności, wyprowadzany deterministycznie z trwałych referencji.** `Terminal = (equipment_ref, sequence, cn_ref, phases)`; tożsamość `"{equipment_ref}:t{sequence}"`. Postać trwała: dla urządzeń dwuterminalowych istniejące `from_bus_ref`/`to_bus_ref` (= `cn_ref` terminali 1 i 2) + addytywne `terminal_phases: list[PhaseSet] | None`; dla urządzeń jedno- lub wieloterminalowych (`Source`, `Load`, `Generator`, `ShuntCapacitor`, TR trójuzwojeniowy w przyszłości) — `bus_ref` (istniejące) lub addytywna lista `terminals`. Jedyny akcesor: `enm/topology.terminals(enm)`; walidator egzekwuje: każdy terminal wskazuje istniejący `Bus`, zgodność pasm napięć, zgodność zbiorów faz na wspólnym CN. Dzięki temu hashe istniejących modeli **nie zmieniają się** (brak big-bang migracji fixtur), a łączność staje się egzekwowana. `Port`/`PortRef`/`ConnectionNode` (metadane, A1-03) oraz niewpięte `enm/migrations/v_ports_001.py`, `endpoint_ports.py` → konsolidacja w semantykę terminala; kasacja procedurą po inwentarzu konsumentów (`enmToSldAdapter.ts` czyta `Port*`).

**Decyzja T-3 — stan łącznika i `in_service` są stanem, nie łącznością (I-03 z FAZY B).** `SwitchBranch.status` OPEN/CLOSED nie zmienia łączności; `in_service=False` wyłącza urządzenie z IR bez zmiany łączności; nowy stan `EARTHED` (uziemnik) jako wartość stanu łącznika uziemiającego (encja `SwitchBranch.kind = EARTHING_SWITCH`). Osiem reprezentacji stanu (A1-07) → jedna, rozwiązywana przez `EffectiveState` (część B §B.3).

**Decyzja T-4 — tożsamość.** `ref_id` jest jedyną tożsamością assetu w twin, IR, wynikach, projekcjach i dokumentach; `ENMElement.id: uuid4` do usunięcia (A1-14); tłumaczenie na uuid5 wewnątrz IR jest dopuszczalne wyłącznie jako deterministyczna funkcja `ref_id` z mapą zwrotną niesioną w biegu (dziś `enm_ref_id_map`) — część C §C.2.4.

---

## A.4. Model fazowy i uziemienie (§7, §13 EARTH FAULTS, §6 grounding)

**Decyzja F-1 — `PhaseSet` na terminalu**, wartości: `ABC`, `ABCN`, `A`, `B`, `C`, `AN`, `BN`, `CN`, `AB`, `BC`, `CA`, `N`, `PEN`, `PE` (+ kombinacje z `PE` dla przewodów ochronnych tam, gdzie analiza tego wymaga). Dla urządzeń SN bez jawnej deklaracji zbiór faz jest **definicją klasy urządzenia** (trójfazowe = `ABC`), zapisywaną jawnie przez walidator jako pochodna, nie jako cichy default; urządzenia nN deklarują fazy jawnie (kreatory nN i import wymuszają). Żadna granica architektoniczna nie zakłada „phase = 3ph": IR może być zgodny (składowe) lub fazowy (ABCN) z tego samego ENM.

**Decyzja F-2 — `EarthingSystem` (nN) jako encja**: `{ref_id, kind: TN_C|TN_S|TN_C_S|TT|IT, pen_split_point_ref, pe_bus_refs}`, przypięta do sekcji nN / rozdzielnicy; zastępuje string w `meta` z cichym domyślnym TN-C-S (A11-03); żyła powrotna kabla rozdzielona na `N` i `PE`/`PEN` w katalogu i modelu (A11-04).

**Decyzja F-3 — `NeutralGrounding` jako encja pierwszej klasy** (główny test jakości twin — §13): `{ref_id, kind: ISOLATED|COMPENSATED|RESISTOR|REACTOR|SOLID|RESISTOR_PLUS_COIL, attached_to: transformer_ref+winding | source_ref | grounding_transformer_ref, coil_inductance_h | coil_current_a, tuning_degree, resistor_ohm, reactor_ohm, max_earth_fault_current_a, catalog_ref, provenance}`; pojemność doziemna `c0_nf_per_km` jako pole katalogowe kabla/linii (proweniencja). Fizyka (sieć składowej zerowej: `build_zero_sequence_zbus`, analiza doziemna kompensowana/izolowana, 67N/Y0>) czyta **wyłącznie** tę encję. Konsolidacja 6 reprezentacji (A11-02): `Bus.grounding`, `Transformer.hv/lv_neutral: GroundingConfig`, `meta.grounding`, `BayEarthFaultPath`, `earthing_role` w `BayPrimaryDevice`, `v126` — przez procedurę: inwentarz konsumentów → migracja do `NeutralGrounding` → parity (Z0 identyczne dla modeli, które dziś liczą Z0) → kasacja pozostałych → guard.

**Decyzja F-4 — grupa połączeń i dostępność punktu neutralnego**: `Transformer.vector_group` walidowany (słownik IEC 60076: Dyn11, Yzn5, YNd1, Dyn5…); `neutral_accessible` wyprowadzane z grupy i obecności `NeutralGrounding`; Z0 transformatora z grupy + uziemienia, nie z osobnego parametru.

---

## A.5. Assety, katalog, proweniencja, założenia (§20, §6)

- **Catalog item ≠ installed asset**: parametry zmaterializowane z katalogu w rewizji katalogu przypiętej do projektu (`catalog_revision_set` w `RevisionEnvelope`); zmiana katalogu = nowa rewizja katalogu + unieważnienie przez graf zależności; `ParameterOverride` rozszerzony o `old_value`, `author`, `at`, `reason` (istnieje `key/value/reason`).
- **Proweniencja wartości**: klasy `STANDARD | OSD_POLICY | MANUFACTURER | CATALOG | USER_ASSUMPTION | MEASUREMENT | PROJECT_SPECIFICATION | DERIVED` — reużycie istniejącego mechanizmu proweniencji katalogów (K-E/K-O/K-Q); `MANUFACTURER` bez wskazania dokumentu = fabrykacja (karta FAB-A usuwa fikcyjne nazwy producentów — D-33). Rejestr źródeł: `docs/twin/MV_DESIGN_PRO_TARGET_DIGITAL_TWIN_ARCHITECTURE.md` §15.5.
- **Założenia**: `AssumptionsRegister` rewizjonowany; parametr `USER_ASSUMPTION` wskazuje `assumption_id`; `ENMDefaults` i `ConnectionConditions` (istnieją) wchodzą do rejestru założeń jako pozycje z proweniencją, nie jako ciche wartości.
- **Metadane inżynierskie** (`meta`) dozwolone wyłącznie dla danych, które NIE są pierwotnymi danymi domenowymi (etykiety prezentacji, notatki); każda wartość fizyczna w `meta` = dług do migracji (inwentarz: A1-02, A11-03, A11-07, A5-04).

---

## A.6. Stacja / pole / aparat (§19)

`Bay` typowany istnieje i jest bogaty (`BayPrimaryDevice`, `BayMeasurementChain`, `BayProtectionControlUnit`, `BayInterlockSet`, `BayEnergizationSafetyState`, `BayEarthFaultPath`, `BayCanonicalModel`), ale prawda o polach żyje w `meta.field_specs`/`nn_field_specs` (A1-02; zapis typowanych kolekcji wyłączony przez `LEGACY_FIELD_COLLECTIONS`). Migracja docelowa: `legacy metadata → typed Bay → typed apparatus (BayPrimaryDevice → SwitchBranch/FuseBranch/Measurement jako urządzenia z terminalami) → terminale → łączność`. Kolejność obowiązkowa: inwentarz konsumentów (`enmToSldAdapter.ts` 15 odczytów, `domain_operations.py:1087,5050`, projekcja nN, readiness, raporty) → migracja (rewizja „migracja" w projekcie) → parity (scena SLD, projekcja nN, readiness identyczne) → kasacja starego kanału → guard `meta_field_specs_resurrection_guard`. **Zakaz permanentnego fallbacku**: po cutover odczyt `meta.field_specs` = naruszenie guardu, nie „kompatybilność".

---


---

# CZĘŚĆ B — Rewizja / wariant / scenariusz / StudyCase / envelope / EffectiveNetworkSnapshot / wykonanie / współbieżność

## B.1. Cztery pojęcia — definicje rozłączne (§8)

| Pojęcie | Co to jest | Co WOLNO mu zmienić | Czego NIE WOLNO | Tożsamość |
|---|---|---|---|---|
| **ModelRevision** | wersja trwałego stanu Canonical ENM projektu; wynik zastosowania komend domenowych | wszystko w ENM (przez komendy) | nic poza ENM | `(project_id, revision: int)`, `hash_sha256` (istniejący `compute_enm_hash`) |
| **NetworkVariation** | zmiana STRUKTURALNA wyrażona jako uporządkowana lista komend domenowych na rewizji bazowej: nowa stacja, kabel, wymiana TR, nowe pole, przebudowa szyny, BESS, modernizacja | topologia, assety, wiązania katalogowe | stanów pracy (to scenariusz), konfiguracji analizy (to przypadek) | `(project_id, variation_id, revision)`, `base_revision`, `hash` = sha(base_hash, komendy) |
| **OperatingScenario** | stan PRACY tej samej konfiguracji fizycznej: MAX/MIN LOAD, MAX PV, N-1, łącznik OPEN/EARTHED, TR niedostępny, BESS charge/discharge, wyspa, profil czasowy, specyfikacja zwarcia | stany łączników, `in_service`, skalowanie/profile P/Q, tryby DER, zaczepy, tryb BESS, zbiór wyłączeń (generator N-1), parametry zwarcia | struktury (żadnej komendy domenowej) | `(project_id, scenario_id, revision)`, `hash` |
| **StudyCase** | reprodukowalna konfiguracja ANALIZY: `model_revision` + `variation_ref?` + `scenario_ref` + konfiguracja analizy/solvera (`StudyCaseConfig`) + profil norm/OSD | parametry solvera i analizy | modelu sieci (zakaz kopii ENM per case — §5) | `case_id`; `RevisionEnvelope` |

Reguła rozdziału: jeśli zmiana wymaga komendy domenowej → wariant; jeśli jest nadpisaniem stanu istniejącego assetu → scenariusz; jeśli dotyczy tego, JAK liczymy → przypadek.

---

## B.2. Inwentarz istniejących bytów i ich los (§8, §28 — bez czwartej implementacji)

| # | Byt | Miejsce (pomiar A2 §1.4, A9 §1.6/§3.3) | Stan | Los |
|---|---|---|---|---|
| C1 | `StudyCase` + `StudyCaseConfig` (SQL `study_cases`) | `domain/study_case.py:41-116, 203-494`; `ProtectionConfig :153-200` | PRODUKCJA; trzyma wyłącznie parametry solvera i zabezpieczeń | **KEEP + PROMOTE** — rdzeń `StudyCase` (konfiguracja); dostaje `model_revision`, `variation_ref`, `scenario_ref`, `standards_profile_ref`; traci wszelki związek z magazynem ENM |
| C2 | `study_case_engine.py` (`OperatingMode.N_1/MAINTENANCE`, `catalog_version_lock`, `snapshot_ref`) | ~~`domain/study_case_engine.py`~~ | **DONE (CV-3.2, 58e520ce)** — usunięty procedurą 7 kroków (0 importów w `src` potwierdzone ponownie przed kasacją); test przepisany: intencja „determinizm/porównywalność biegów scenariusza" przeniesiona na `tests/invariants/test_scenariusz_i_bieg.py::test_is6_*` (rdzeń CV-3.1); `OperatingMode.N_1/MAINTENANCE` = `RodzajScenariusza.N_1/MAINTENANCE` (CV-3.1) | — |
| C3 | ENM-dict `study_cases[]` (`switch_states/normal_states/source_modes/time_profile_ref/analysis_settings`) | ~~`enm/domain_operations_v2.py:1172-1300`~~ | **DONE (CV-3.2, 58e520ce)** — 9 operacji (`create_study_case`, `set_case_*` ×4, `run_short_circuit`, `run_power_flow`, `run_time_series_power_flow`, `compare_study_cases`) usunięte z `domain_operations_v2.py`, `V2_CANONICAL_OPS`, `ALL_V2_HANDLERS`, rejestru `domain/canonical_operations.py`, osieroconego duplikatu `enm/domain_ops_models.py::CANONICAL_OPS` (0 importerów, usunięty w całości), `dialog_completeness_guard.py::NO_MODAL_NEEDED`, `frontend/operationSuccessMessages.ts`; `scripts/legacy_public_path_guard.py` rozszerzony o bramkę wskrzeszenia rejestru | — |
| C4 | P23 `Study/Scenario/Run/Snapshot` (`switches_state_ref: Any`…) | ~~`application/study_scenario/models.py`, `orchestration.py`~~ | **DONE (CV-3.2, ec0c20dc)** — pierwszy commit (`58e520ce`/`41a00e01`) zatrzymał się (STOP wg §0.3 karty) na żywym konsumencie POZA `builder.py`: `analysis/reporting/pdf/p24_plus_report.py:45` importował i realnie konsumował `ScenarioComparisonEntry`/`ScenarioComparisonView` (sekcja P27 raportu P24+). Decyzja architektoniczna właściciela (2026-09-05, wariant c): P24+ jest tym samym bytem co C4 („raport bez trasy") — `export_p24_plus_report_pdf` miał ZERO wołających w `backend/src` poza re-eksportem własnego `__init__.py`, ZERO tras HTTP (żaden router w `api/` go nie importował), ZERO wzmianek w `INWENTARZ_FUNKCJI_2026-07.md`/`KANON_V12_XX.md` — zmierzone przed kasacją. Usunięte razem, drugim commitem: `application/study_scenario/**` (611 linii), `analysis/scenario_comparison/**` (345 linii), `analysis/reporting/pdf/**` (830 linii, P24+ w całości) | — |
| C5 | ADR-008 `OperatingCaseORM` + `SwitchingStateORM` (`in_service` per case/element) | `persistence/models.py:377-394`; `network_wizard`, `analysis_run/service.py:1023-1039` | legacy tor (wizard deprecated; `apply-step` wyłączony) | **DELETE** wraz z torem legacy ORM (procedura kasacji; semantyka `in_service` per scenariusz przechodzi do `OperatingScenario`) |
| C6 | `FaultScenario` (typ, lokalizacja, Zf, `ShortCircuitConfig`) | `domain/fault_scenario.py:183-221`, `fault_scenario_service.py` (BEZSTANOWY — magazyn scenariuszy per projekt, `klucz` argumentem każdej metody; C6-PERSIST `f53b780a`) | PRODUKCJA, trwały (restart procesu nie gubi scenariuszy; rewizje append-only) | **ZREALIZOWANE (2026-09-05)**: specyfikacja zwarcia = `OperatingScenario.fault_spec` (`kind=FAULT_STUDY`) w magazynie scenariuszy; API `fault_scenarios` zachowuje kontrakt jako fasada (+ addytywne `revision`); „ma biegi" z koperty biegu (`scenario_ref`), lokalizacja BUS/NODE honorowana w solverze, BRANCH/BRANCH_POINT = kod gotowości `fault.location_on_branch_requires_assembler` do czasu assemblera CV-4 |
| D1–D4 | delty in-memory: N-1 (`kontyngencje_n1.py:232-275`), hosting (`hosting_capacity.py:88 deepcopy`), `pq_area.py:102`, `odpowiedz_osd.py:173` | `application/analyses/**` | 4 niezależne implementacje „delty migawki" | **CONSOLIDATE** na `apply_scenario(enm, scenario) -> EffectiveNetworkSnapshot`; guard: `copy.deepcopy(snapshot)` poza jedną funkcją = czerwony |
| R1 | `CanonicalRun` (`canonical_runs` SQL; pełna migawka + `snapshot_hash` + `input_hash`) | `enm/canonical_analysis.py:88-98, 252`; `canonical_run_repository.py` | PRODUKCJA — jedyny tor z zamrożoną migawką | **KEEP + PROMOTE** — jedyny rejestr biegów; dostaje `RevisionEnvelope` |
| R2 | legacy `analysis_runs` (+`analysis_runs_index`) | `AnalysisRunService`, porównania PF/zabezpieczeń | druga prawda biegów | **ZREALIZOWANE dla orkiestratora (CV-3.3-B, 2026-09-05)** — `AnalysisRunService` (odczyt/zapis `analysis_runs`) **SKASOWANY**: `power_flow_comparison`/`protection_comparison`/`comparison` przepięte na R1 (B1), zero pozostałych konsumentów produkcyjnych (zweryfikowane grepem po kasacji). `analysis_run/__init__.py` eksportuje odtąd WYŁĄCZNIE `read_model.py` (czyste funkcje formatujące ślad, zero zależności od usuniętego serwisu). **SPRZECZNOŚĆ Z PIERWOTNYM OPISEM WIERSZA, WYKRYTA I ROZSTRZYGNIĘTA (CV-3.3-B):** ten wiersz traktował `analysis_runs`+`analysis_runs_index` jako JEDEN byt „druga prawda biegów" — w rzeczywistości to DWA niezależne, różnie ufundowane byty, oba świadomie POZOSTAWIONE żywe (nie dług tej karty): (a) tabela `analysis_runs` + `AnalysisRunRepository`/`AnalysisRunORM` żyje dalej WYŁĄCZNIE jako zależność legacy toru kreatora (`network_wizard/service.py`, zero konsumentów produkcyjnych, migracja razem z tym torem — **CV-4**, nie CV-3.3-B), konsument: `application/analysis_run/result_invalidator.py::ResultInvalidator` (kaskada unieważnienia biegów LEGACY, jawnie NIE dotyka `study_cases`/R1 od CV-2-W); (b) tabela `analysis_runs_index` jest UŻYWANA PRODUKCYJNIE dziś przez CAŁKOWICIE INNY, niezależny mechanizm koordynacji nastaw zabezpieczeń (`application/analyses/protection/{catalog,overcurrent}/pipeline.py`, własna tożsamość `AnalysisRunEnvelope`, konsument frontendowy `ui2/wyniki/koordynacja/nastawyApi.ts`) — NIGDY nie była częścią `AnalysisRunORM`/`AnalysisRunService`, więc nie ma czego kasować ani przepinać na R1 w tej karcie; przetrwała kasację nietknięta. `AnalysisRunRepository` i tabela `analysis_runs_index` zostają w kodzie z tego samego powodu: żywe zależności poza mandatem tej karty, nie zapomniany dług |
| R3 | `study_runs`/`study_results` | `project_archive/service.py:1158` (zapis tylko przy imporcie ZIP), `protection_analysis/service.py:157-213`, `comparison/service.py:92-96` | zapisywane praktycznie tylko z archiwum | **ZREALIZOWANE (CV-3.3-B, 2026-09-05)** — kasacja procedurą 7 kroków. Wyniki zabezpieczeń → R1 jako `CanonicalRun.analysis_type="protection_sn"` (nie osobny `analysis_kind` — pole istniejące od R1, ta sama konwencja co `"PF"`/`"short_circuit_sn"`), orkiestracja `enm.canonical_analysis._execute_protection` (zastępuje `ProtectionAnalysisService`, skasowany). `project_archive/service.py` (import ZIP) buduje odtąd `CanonicalRun` zamiast `StudyRunORM`/`StudyResultORM` (dwuprzebiegowe remapowanie ID: protection→sc_run_id może wystąpić w archiwum przed swoim celem). `comparison/service.py` czyta R1 (B1). Tabele `study_runs`/`study_results` usunięte migracją (`infrastructure/migrations/010_remove_study_runs_results.sql`, bez migracji danych — zero konsumentów produkcyjnych, kanon „co przestarzałe, usuń"); `StudyRunORM`/`StudyResultORM`/`StudyRunRepository`/`ResultRepository` skasowane |
| R4 | in-memory `_runs` (V12.6), ~~`_batches`~~, `_coordination_results`, `_interpretation_cache`, `_overrides_store`, `_config_store` | A9 §3.3 poz. 10 | giną z procesem — nieodtwarzalne (CZĘŚCIOWO: `_batches` ZREALIZOWANE) | **CONSOLIDATE**: biegi → R1 (`_runs`/V12.6 — poza zakresem CV-3.3-B, nienazwany w jej §0); serie → **ZREALIZOWANE (CV-3.3-C, 2026-09-05)** — `_batches` (i pochodne `_case_batches`/`_pinned_hashes`) skasowane, tabela `run_batches` (szczegóły: wiersz E4 powyżej); nadpisania SLD/konfiguracje → magazyn projektu (poza zakresem CV-3.3-B/C) |
| E1 | `execution_runs.py` (`/api/execution/…`) → `canonical_analysis.create_run/execute_run` | produkcyjny, konsument FE | **KEEP** jako jedyne wejście biegów (pod orkiestratorem) |
| E2 | `enm.py POST /cases/{id}/runs/{pf,sc}`, `power_flow_runs/execute`, ~~`unified_runs`~~, `v126_academic` uruchomienia | 3 równoległe sposoby uruchomienia (policzone po kasacji CV-3.3-A) | **CZĘŚCIOWO ZREALIZOWANE**: `unified_runs` (`api/unified_runs.py` + jego wyłączny dyspozytor `application/analysis_dispatch/service.py` — zero konsumenta frontendu, zweryfikowane grepem) **DELETE** (karta CV-3.3-A, 2026-09-05; trasy `/api/runs/{power-flow,protection,short-circuit}` zdjęte z `api/main.py` i oznaczone `usunięty` w `docs/v12xx/MACIERZ_KOMPATYBILNOSCI_API.md`). Pozostałe 3 sieroty (`enm.py` PF/SC POST, `power_flow_runs/execute`, `v126_academic`) — **STRANGLE → DELETE** poza tą kartą |
| E3 | `ExecutionEngineService` (`execution_engine/service.py`) | tylko testy (pierwotny pomiar: 5 plików — **zaniżony**; grep importów po kasacji wykazał **15 plików** faktycznie związanych z E3/`get_engine()`, w tym 2 pliki z granicy C6 nienazwane w pierwotnym pomiarze) | **ZREALIZOWANE (CV-3.3-A, 2026-09-05)** — `application/execution_engine/**` (794+50+316+29 linii) skasowane; `api/execution_runs.py::get_engine()` (kompatybilność testowa) skasowany, wszystkie endpointy już szły przez `enm.canonical_analysis`; testy asertujące fizykę przepisane na tor kanoniczny na tej samej sieci, testy mechaniki silnika (statusy, bramkowanie readiness/eligibility, wyjątki `execution_engine/errors.py`) usunięte; guard `legacy_public_path_guard.py` rozszerzony. Pełny inwentarz konsumentów (klasa, nie instancja z audytu) → `CONVERGENCE_ROADMAP.md` CV-3.3-A. Osierocony klaster `result_mapping`/`AnalysisKind` zostawiony przez tę kartę domknięty osobno karta **CV-3.3-A2** (2026-09-05): `AnalysisKind` i `load_flow_to_resultset_v1.py`/`protection_to_overlay_v1.py` skasowane (zero konsumenta), `sc_binding_meta.py`/`short_circuit_to_resultset_v1.py`/`protection_to_resultset_v1.py` NIE skasowane — zamrożone przez `resultset_v1_schema_guard.py` (B-01, decyzja właściciela) |
| E4 | `BatchExecutionService` (`_batches` in-memory) | produkcja (`batchStore.ts`) | **ZREALIZOWANE (CV-3.3-C, 2026-09-05)** — trzy słowniki w pamięci (`_batches`/`_case_batches`/`_pinned_hashes`) skasowane; serie żyją odtąd w tabeli SQL `run_batches` (ORM `RunBatchORM`, migracja `infrastructure/migrations/011_run_batches.sql`, repozytorium `RunBatchRepository` obok `CanonicalRunRepository` — ten sam mechanizm sesji/silnika, `get_canonical_run_session_factory`). `BatchExecutionService` (`application/batch_execution_service.py`) jest odtąd BEZSTANOWY (wzorzec `FaultScenarioService`, karta C6-PERSIST) — singleton `_batch_service` pozostaje wyłącznie jako punkt wstrzyknięcia w testach. Domena przeszła z `domain/batch_job.py` na `domain/run_batch.py`: status serii ma pięć wartości (CREATED/RUNNING/FINISHED/FAILED/PARTIAL — słownik dzielony z `CanonicalRun.status`, PARTIAL = jedyny stan wyłącznie serii); wykonanie jest CIĄGŁE (awaria jednej pozycji nie zatrzymuje pozostałych — poprzednia wersja zatrzymywała się na pierwszej awarii, `stop_on_failure` nie istnieje w kontrakcie, więc nie dodano fantomu). Kontrakt HTTP (4 końcówki `api/batch_execution.py`) zachowany bit w bit + pola addytywne: `finished_at`, `name`, `envelope` (koperta rewizji modelu z chwili utworzenia serii — budowana TĄ SAMĄ funkcją `enm.envelope.zbuduj_koperte` co bieg pojedynczy, `scenario_ref=None`), `items[]` (position/scenario_id/analysis_type/options_hash/canonical_run_id/status/error_message + `result_freshness` liczona NA ŻYWO z koperty biegu pozycji — TA SAMA funkcja co nakładka pojedynczego biegu, `application/result_freshness.swiezosc_biegu_kanonicznego`, nigdy „zielona na zawsze"). Konsument FE (`frontend/src/ui/study-cases/batchStore.ts` + `ui2/spaces/obliczenia/serie/**`) zaktualizowany na nowy słownik statusów bez zmiany architektury store'u (już był cache'em odczytu z API, bez własnego stanu trwałego). Testy: `backend/tests/test_batch_execution.py` (685 linii) przepisane na repozytorium + nowe klasy (`TestTrwaloscPoRestarcie`, `TestKopertaWspolna`, `TestSwiezoscPerPozycja`, wariant „wszystkie pozycje FAILED"); e2e `frontend/e2e/critical-batch-flow.spec.ts` (nowy — brak wcześniejszego spec z „batch"). Dead code usunięty przy okazji (zero konsumentów produkcyjnych, zmierzone): `application/read_models/results_workspace_projection.py` (PR-22/PR-23, duckypował na `domain.batch_job.BatchJob`, zero wołających poza własnymi testami) + 2 pliki testów |
| H1 | `ENMHeader.semantic_hash/input_hash/case_hash/variant_hash/switching_snapshot_hash` | zadeklarowane, nigdy nie wypełniane (A2 §1.5) | **DONE (CV-2)** — pola usunięte z `ENMHeader` i lustra TS; hash modelu bez zmian (pola były wykluczone z odcisku) |
| H2 | `build_analysis_run_reproducibility` (stałe `"1.0.0"`, `"catalog_v1"`, `"solver_tolerance/default"`) | `domain/analysis_run.py:162-235` | **DONE (CV-2)** — `solver_version` wyłącznie ze śladu solvera (brak = `None`), `catalog_schema_version` = `None` (tor legacy nie zapisał tożsamości katalogu), w kontrakcie V12.5 biegu kanonicznego `catalog_fingerprint` + `model_revision` z koperty; etykiety wersji KONTRAKTÓW (nazywają kod, nie dane) zostają; guard `provenance_constant_guard` |
| H3 | `variant_ref`/`switching_state_ref` jako etykiety-stałe (`DEFAULT_OPERATING_VARIANT_REF`) | `analysis_case_context.py:92,140`, `analysis_run.py:15-16` | **DONE (CV-2)** — stałe usunięte; brak wyboru wariantu/migawki = `None`; realne referencje (`variation_ref`/`scenario_ref`) przychodzą w CV-3 razem z dostawcą |

---

## B.3. Model docelowy

```python
class ModelRevision:          # append-only, per projekt — ZREALIZOWANE w CV-2 jako:
    project_id: str; revision: int; parent: int | None      #   wpis dziennika (`enm/dziennik_zmian.WpisDziennika`: `rewizja`, `rodzic`, `hash_sha256`)
    command: DomainCommandEnvelope | None   #   `WpisDziennika.ladunek` = PEŁNY ładunek komendy domenowej (`ZrodloZmiany.ladunek`)
    snapshot: EnergyNetworkModel            #   migawka KAŻDEJ rewizji: `<digest>.rev/<n>.json.gz` (`enm/rewizje.py`; gzip mtime=0, kanoniczny JSON,
                                            #   adresowana hashem treści) — `enm.store.checkout(klucz, n)`; delty/replay nie są źródłem prawdy
    hash_sha256: str; actor: ActorRef; created_at: datetime  # `actor` — CV-3+ (brak dostawcy tożsamości użytkownika, ADR-028)
    # inwariant: checkout(project, n).hash_sha256 == ModelRevision[n].hash_sha256 — przypięty: `tests/enm/test_rewizje_modelu.py`
    # REGUŁA SPÓJNOŚCI (CV-2, uściślenie R2 karty): HEAD (`<digest>.json`) pozostaje AUTORYTATYWNY dla rewizji bieżącej; migawki są
    # indeksem historii. Kolejność zapisu: dziennik (roboczy) → migawka (robocza) → HEAD (podmiana) → migawka (podmiana) → dziennik (podmiana);
    # każdy krok po podmianie HEAD jest cofany przez `_wycofaj_nieudany_zapis`, a przy wczytaniu `uzgodnij_indeks` usuwa sieroty
    # (migawka > HEAD, nigdy promowana), odtwarza brakującą migawkę bieżącą z HEAD i dopisuje brakujący wpis dziennika z opisem
    # nazywającym brak przyczyny wprost (`OPIS_WPISU_ODTWORZONEGO`). Rewizje sprzed rejestru nie mają treści — `checkout` mówi to błędem.

class NetworkVariation:       # delta strukturalna
    variation_id: str; name: str; base_revision: int; revision: int
    commands: list[DomainCommandEnvelope]   # ten sam język co edycja bazowa — reużycie enm/domain_operations
    status: DRAFT | PROPOSED | ACCEPTED | MERGED | REJECTED   # agent tworzy tylko PROPOSED (§24, I-10)
    hash: str                               # sha(base_hash, commands)

class OperatingScenario:      # nadpisania stanu, typowane, bez komend — RDZEŃ ZREALIZOWANY w CV-3.1 (`enm/scenariusze.py`, 2026-09-05)
    scenario_id: str; name: str; revision: int; kind: ScenarioKind   # ZREALIZOWANE: NORMAL | MAX_LOAD | MIN_LOAD | MAX_GEN | N_1 | MAINTENANCE | FAULT_STUDY | SIZING | CUSTOM
                                                                     # (ISLAND / TIME_STEP — bez dostawcy, nie wchodzą do czasu konsumenta)
    out_of_service: tuple[ref_id, ...]                # ZREALIZOWANE (= dawne `in_service=False`): element NIEOBECNY w migawce efektywnej — semantyka N-1 (D1) i biegu nastaw (D6)
    setpoints: dict[ref_id, Nastawa(p_mw?, q_mvar?)]  # ZREALIZOWANE: nadpisanie nastawy generatora (D4 odpowiedź OSD)
    gen_scaling: dict[ref_id|"*", float]              # ZREALIZOWANE: mnożnik P generatorów (D5 „noc” = {"*": 0.0}); `load_scaling` — bez dostawcy, nie wchodzi
    injections: tuple[Wstrzyk, ...]                   # ZREALIZOWANE: generator-sonda z deterministycznym `id` (uuid5 z jawnego ziarna) — D2 hosting, D3 obszar P-Q
    probe_shunts: tuple[SondaKondensatora, ...]       # ZREALIZOWANE: bateria z katalogu (catalog-first) — D5 dobór kompensacji
    fault_spec: FaultScenario | None                  # ZREALIZOWANE: JEDEN scenariusz zwarciowy C6 (ten sam obiekt domenowy); projekcja na opcje biegu: `opcje_biegu_ze_scenariusza`
    switch_states / tap_positions / source_modes / profiles / time_index / der_modes / bess_modes / contingency_set   # BEZ DOSTAWCY — nie deklarowane (OW-9: pole bez konsumenta = fantom)
    hash: str                                         # ZREALIZOWANE: SHA-256 nad kanoniczną treścią nadpisań (bez nazwy/id/rewizji — tożsamość treści)
    # apply_scenario(enm, scenariusz) -> EffectiveNetworkSnapshot(snapshot, snapshot_hash, base_hash, base_revision, scenario_ref, scenario_hash, nadpisania)
    # kolejność nadpisań STAŁA: out_of_service → setpoints → gen_scaling → injections → probe_shunts; ref_id spoza modelu = `ScenariuszNieprzystajeError` (nigdy cichy skip)
    # tożsamość: scenariusz bez nadpisań → snapshot_hash == compute_enm_hash(enm) (pin: `tests/enm/test_scenariusze.py`, `tests/invariants/test_scenariusz_i_bieg.py`)
    # magazyn scenariuszy NAZWANYCH per projekt: `<digest>.scen/<scenario_id>.json`, rejestr rewizji append-only + nagrobek; przejściowe (`__…`) nigdy nie zapisywane;
    # migracja klucza CV-1 przenosi `.scen` za modelem (manifest `scenariusze`: ZA_MODELEM/ODLOZONE/BRAK)
    # bieg: `create_run(..., scenariusz=)` liczy migawkę efektywną i WALIDUJE ją; koperta v2 (`scenario_ref`, `scenario_hash`; `snapshot_hash` koperty = hash BAZY);
    # koperta v1 = stan normalny (bit w bit jak przed CV-3.1); świeżość: `SCENARIUSZ_ZMIENIONY` / `SCENARIUSZ_USUNIETY` z rewizji scenariusza w magazynie
    # wariant w pamięci: `enm.canonical_analysis.bieg_wariantu(bazowy, migawka_efektywna, analysis_type=, options=)` + `wykonaj_bieg_w_pamieci`
    # guard `scripts/scenario_copy_guard.py` (R1 import prywatnego wykonawcy, R2 `CanonicalRun(...)` poza fabryką, R3 deepcopy migawki, R4 dict(migawka) + zapis):
    # zapadka: 19 zastanych trafień w 6 rodzinach (D1–D6) → 0 po kartach CV-3-W (2026-09-05) z parytetem bit w bit (`tests/golden/parytet_scenariuszy/`, 28 złotych hashy)

class StudyCase:              # C1 rozszerzony
    case_id: str; project_id: str
    model_revision: int; variation_ref: (variation_id, revision) | None; scenario_ref: (scenario_id, revision)
    config: StudyCaseConfig                # istniejące: c_factor, base_mva, tolerancje, ProtectionConfig...
    standards_profile_ref: (profile_id, revision)   # rejestr źródeł normatywnych / profil OSD
    protection_settings_revision: int      # rewizja nastaw (ownership w modelu — ADR-022)

class RevisionEnvelope:        # niesiony przez KAŻDY artefakt inżynierski (§9) — CV-2: `enm/envelope.py`, kolumna `canonical_runs.envelope_json`
    project_id; model_revision; variation_ref; scenario_ref          # CV-2 niesie `project_id`, `model_revision`, `snapshot_hash` (= hash BAZY w rewizji); CV-3.1: `scenario_ref` + `scenario_hash` (koperta v2; v1 = stan normalny); `variation_ref` — bez dostawcy
    protection_settings_revision; catalog_revision_set: dict[catalog_id, revision]   # CV-2: `catalog_fingerprint` = odcisk biblioteki typów z kodu
                                                                                     # (`network_model/catalog/odcisk.py`); rewizje per katalog — po konwergencji katalogów (P1-5)
    assumptions_revision; standards_profile_ref                     # CV-2: `options_hash` (odcisk opcji biegu); reszta — CV-3/CV-5
    semantic_fingerprint: str   # sha256 nad kanonicznym JSON (klucze posortowane, liczby skwantyzowane — część C §C.5) — CV-2: nad polami koperty (`WERSJA_KOPERTY`)

EffectiveNetworkSnapshot = apply_scenario(materialize(checkout(project, model_revision), variation), scenario)
    # immutable (frozen Pydantic), reproducible, versioned (envelope), provenance-aware (każde nadpisanie ma źródło: scenariusz/wariant/rewizja), complete-enough (readiness per analiza)
```

**Skąd bierze się `EffectiveNetworkSnapshot` w kodzie dziś:** `CanonicalRun.snapshot` (pełny `model_dump` ENM w momencie biegu) — to JEST migawka efektywna bez scenariusza. Promocja: (1) migawka staje się wynikiem `apply_scenario`, (2) hash migawki = `snapshot_hash` (istnieje), (3) bieg przechowuje **envelope + hash**, a pełną migawkę tylko jako checkpoint (dziś 0,78 MB per bieg przy 54 stacjach — A9 §3.3 poz. 3), odtwarzalną z rewizji + wariantu + scenariusza (test tożsamości: odtworzona migawka ma ten sam hash).

---

## B.4. Gdzie envelope obowiązuje (§9) i reguła UI

| Artefakt | Dziś | Docelowo |
|---|---|---|
| wejście solvera (IR + kontrakt) | `input_hash = sha(case_id, analysis_type, enm_hash, options)` | `input_hash = sha(envelope.semantic_fingerprint, analysis_kind, solver_id, solver_version, settings_hash)` |
| bieg (`CanonicalRun`) | `snapshot_hash`, `input_hash` | + `RevisionEnvelope` jako kolumna/JSON; jeden rejestr |
| `ResultSetV1` (FROZEN) | bez rewizji | **ładunek v1 nietknięty**; envelope dostępny przez rekord biegu i API `GET /runs/{id}` — `ResultSetV2` z envelope w ładunku dopiero jako nowa wersja kontraktu (ADR-018) |
| ocena zabezpieczeń | nastawy per case (dwie prawdy) | envelope z `protection_settings_revision`; ocena czyta immutable projekcję biegu |
| projekcja SLD (scena) | `layout_hash`; projekcja nN 3.0.0 z `projection_hash` | scena niesie envelope biegu, z którego pochodzą nakładki; niezgodność envelope sceny i wyniku = brak nakładki + powód |
| White Box / dowody | `proof_id` z `run_id` | envelope w nagłówku dowodu |
| raport / dokument | `document_records.run_ref`, bez hasha modelu | envelope + hash dokumentu; dokument OUTDATED gdy envelope ≠ bieżący |

**Reguła UI (§9):** żaden ekran nie łączy wyników z różnych envelope jako jednego stanu inżynierskiego; przy różnicy pokazuje „wyniki z rewizji N, model na rewizji M" z akcją przeliczenia. **Od CV-2** świeżość jest WYPROWADZANA z koperty (`application/result_freshness.py::evaluate_envelope_freshness`): rewizja modelu inna → OUTDATED z listą zmian z dziennika (które operacje unieważniły wynik), odcisk katalogu inny → OUTDATED „katalog zmieniony" (A2-05: zmiana katalogu unieważnia), ten sam hash i katalog → FRESH; bieg bez koperty (sprzed CV-2) wraca na porównanie odcisków modelu; status przypadku (`StudyCase.result_status`) = funkcja biegów przypadku (`status_wynikow_przypadku`), bez pisarzy stanu. Wariant, scenariusz i nastawy dołączają do porównania w CV-3/CV-5.

---

## B.5. Wykonanie (execution)

- **Jedno wejście**: `POST /api/projects/{p}/runs {case_ids | scenario_ids, mode: RUN_REQUIRED|RECALCULATE_AFFECTED|RUN_SELECTED, analyses?}` → `ExecutionPlan` (DAG analiz, gotowość per analiza, cache po `input_hash`) → `ExecutionBackend` (`LocalProcessPoolExecutionBackend` teraz, `WorkerQueueExecutionBackend` później bez zmiany orkiestratora — D-07). Istniejące `execution_runs.py` (E1) staje się tym wejściem; `BatchExecutionService` (E4) — planem serii.
- **Jeden rejestr biegów**: `canonical_runs` (R1) z envelope; R2/R3/R4 kasowane procedurą po przepięciu konsumentów (porównania, zabezpieczenia, V12.6, serie).
- **Status biegu**: `QUEUED | RUNNING | PARTIAL | FINISHED | FAILED | NOT_COMPUTED` (bez cichego sukcesu; `NOT_COMPUTED` z P23 zachowane jako semantyka „nie liczono", nie „błąd").
- **Cache**: klucz `input_hash`; trafienie = ten sam `run_id` (semantyka „w pamięci" dla what-if zachowana: bieg na `VariantBranch` bez zapisu rewizji).
- **Provenance biegu**: `solver_id`, `solver_version` z rejestru zdolności solverów (nie stała), `settings_hash`, `catalog_revision_set`, `standards_profile_ref`, `actor`, `execution_backend`.

---

## B.6. Współbieżność (§21 kontraktu; szczegóły: `docs/twin/MV_DESIGN_PRO_TARGET_DIGITAL_TWIN_ARCHITECTURE.md` §21a)

Każda komenda domenowa niesie `command_id` (idempotencja), `actor`, `expected_revision`; niezgodność = `409 CONFLICT` z opisem rozbieżności; zakaz silent last-write-wins; zapis modelu i dziennika w jednej transakcji (dziś: trzy pliki bez WAL — dziennik, migawka rewizji, HEAD — z jawną kolejnością podmian, wycofaniem i uzgodnieniem przy wczytaniu (`enm/rewizje.py`, CV-2: atomowość przez niezmienność migawek i autorytatywny HEAD, nie przez WAL); magazyn rewizji w SQL (Postgres docelowo — D-37, ADR-028) pozostaje decyzją wdrożeniową właściciela, kontrakty `checkout`/koperty są od nośnika niezależne); dual-write w stranglerze tylko z guardem równoważności i terminem życia.

---


---

# CZĘŚĆ C — Granica obliczeniowa: topologia wyprowadzana, Computational IR, solvery, White Box, determinizm

## C.1. Werdykt: `network_model/core` = Derived Immutable Computational IR (§12)

`network_model/core` (`NetworkGraph`, `Node`, `Branch`, `Switch`, `Source`, `Load`, `NetworkSnapshot`) jest dziś budowany na torze kanonicznym z ENM przez `enm/mapping.map_enm_to_network_graph` (P1/S1 w A3 §2), a równolegle **persystowany** w legacy ORM `network_nodes/branches/sources/loads` + `network_snapshots` przez wizard/`xlsx_import` bez mostu do ENM (A1-01, A9 §3.3 poz. 6). Rozstrzygnięcie:

1. `network_model/core` **jest IR**: nie jest edytowalny przez UI, nie jest trwałym modelem projektu, jest deterministyczną funkcją `EffectiveNetworkSnapshot`, niesie provenance do migawki (`snapshot_hash`, `envelope`), jest odtwarzalny.
2. Legacy persystencja IR (`network_*`, `network_snapshots`, `sld_*`, `NetworkSnapshot.meta.parent_snapshot_id` + `ActionEnvelope` event-sourcing, `wizard_runtime`, `xlsx_import` piszący do ORM) → **procedura kasacji** (D-03 warunkowo): inventory → consumer search (`solver_input.py`, `diagnostics.py`, `analysis_run`, `lifecycle`, `xlsx_import`, `network_wizard`) → data export (projekty XLSX/wizard → ENM przez komendy domenowe, D-45) → parity → cutover → observation → removal.
3. Solvery (`network_model/solvers/**`, FROZEN) czytają wyłącznie IR i kontrakty `solver_input/**`; nigdy ENM bezpośrednio.

## C.2. Przepływ (§10–§12)

```
Canonical ENM (ModelRevision) ⊕ NetworkVariation ⊕ OperatingScenario
   → EffectiveNetworkSnapshot  (immutable; hash; envelope)                     [część B §B.3]
   → TopologyView              (TopologyService — jedna implementacja)         [§2.2]
   → Computational IR          (NetworkGraph z enm/mapping — jeden assembler)   [§2.3]
   → kontrakt wejścia solvera  (solver_input/** — FROZEN, addytywne)
   → solver (FROZEN core)      → surowy wynik → result_mapping → ResultSetV1 (FROZEN) + provenance na biegu
```

### C.2.1 Trwałe vs wyprowadzane (§11)
| Trwałe (ENM) | Wyprowadzane (nigdy zapisywane jako prawda) |
|---|---|
| assety, terminale (z `from/to_bus_ref` + fazy), łączność, stan łączników, `in_service`, uziemienia, katalog, nastawy | węzły topologiczne (CN scalone przez ZAMKNIĘTE łączniki), zasilenie (energized), wyspy, domeny napięciowe, ciągłość faz i N, osiągalne assety, partycje solvera (slack per wyspa), tory zasilania, feedery |

### C.2.2 `TopologyService` — konsolidacja, nie nowy byt (§11)
Dziś: 14 implementacji przeglądu grafu w backendzie + 6 w kliencie (5 z własną topologią), 4 definicje krawędzi (A2-01, A2 §1.1–§1.2); scalanie CN→TN w `AdmittanceMatrixBuilder` (`ybus.py:71-86`); energizacja/wyspy poprawnie w projekcji nN 3.0.0. Rozstrzygnięcie: **promocja** istniejącego union-find z `ybus.py` i silnika energizacji/wysp z projekcji nN do `enm/topology.py` jako jedynej implementacji (`derive(snapshot) -> TopologyView`), konsumowanej przez: assembler IR, walidator, projekcje SN/nN, readiness, N-1, eksploatację. `AdmittanceMatrixBuilder` staje się konsumentem `TopologyView`. Pozostałe 13+5 implementacji → strangle → delete z guardem (`topology_single_impl_guard`: BFS/DFS/union-find po elementach ENM poza `enm/topology.py` = czerwony). Frontend (`SupplyPathHighlighter`, `sld/v3/electrical`, `enmToSldAdapter` topologia) → konsumuje `TopologyView` z projekcji; klient nie posiada konkurencyjnej prawdy (§11, §18).

### C.2.3 Jeden assembler (§12) — inwentarz i los ścieżek (A3 §2.1–§2.2)
| Ścieżka | Miejsce | Los |
|---|---|---|
| P1 `canonical_analysis._execute_power_flow` + `map_enm_to_network_graph` | `enm/canonical_analysis.py:1642`, `enm/mapping.py` | **KANON** — jedyny assembler; prywatne `_execute_power_flow` importowane przez 8 modułów → publiczne `orchestrator.run(plan)`; `pv_bus_ids=[]` zawsze → PV z modelu (A3-04); wiele slacków → slack per wyspa z `TopologyView` (A3-05) **CV-4.1 (2026-09-05): złożenie wejścia WYCIĘTE 1:1 do `enm/assembler.py::zloz_wejscie_rozplywu(snapshot, options, graph=None) -> WejscieRozplywu` (wykonawca tylko rozwiązuje i montuje wynik; assembler nie importuje `CanonicalRun`); parytet 252 złotych hashy bit w bit; węzły nierozwiązane → `None` + `non_finite_fields` (§35). **A3-04 → ZREALIZOWANE kartą CV-4.1b (2026-09-05):** generator w trybie `meta.control_mode="REGULACJA_NAPIECIA"` (`meta.u_set_pu`, granice `q_min_mvar`/`q_max_mvar`) czyni swoją szynę węzłem `NodeType.PV` w `enm/mapping.py` (odmowa: dwa generatory regulujące na jednej szynie, szyna SLACK jako PV, węzeł PV z dodatkową regulacją falownika innego generatora na tej samej szynie); `enm/assembler.py::zloz_wejscie_rozplywu` buduje `PVSpec` z granic Q z migawki (PQSpec nie budowany dla węzłów PV); walidator ENM blokuje (`generators.voltage_control_incomplete`, BLOCKER, zmostkowany do kanonu jako `generator.voltage_setpoint_missing`) nastawę niekompletną/niefizyczną PRZED uruchomieniem rozpływu; `power_flow_trace.pv_bus_ids` przestał być zawsze pustą listą. Pomiar na rejestrze sieci referencyjnych (`tests/golden/registry.py`, 17 wpisów): PRZED 0/17 wpisów miało zmaterializowaną sieć z generatorem w regulacji napięcia (wpis G06 istniał, ale `budowniczowie=()`); PO 1/17 (G06, 2 warianty: nastawa osiągalna / nasycenie Q). Złote hashe parytetu assemblera (widok tolerancyjny `porownaj_wpis`, baza `40e49c22`): 252→264 wpisów (+12, wyłącznie G06 × {PF, SC_1F/2F/2FG/3F_max, SC_3F_min}), 0 rozbieżności ponad tolerancję w 252 wspólnych wpisach, 0 usuniętych — w tym sieci G00/G04/G05 z generatorem BESS (pole `q_min_mvar`/`q_max_mvar`/`u_set_pu` dodane w `meta` jako `None`, znalezisko KLASA NIE INSTANCJA przy okazji, szczegóły `CONVERGENCE_ROADMAP.md` CV-4.1b) bez rozbieżności — jedyny GENEROWANY artefakt wrażliwy na te pola (`sldNetwork53.ts`, hash migawki wprost, nie wynik solvera) zregenerowany sankcjonowanym generatorem. Dowód semantyczny niezależną wyrocznią: `tests/application/reference_networks/test_pandapower_cross_validation.py::TestPvNodeCrossValidatePandapower` (pandapower `create_gen(vm_pu=...)`, ten sam kontrakt matematyczny węzła PV; marker `pandapower`, nieuruchamialny w tym venv — zweryfikowany niezależnie stroną kanoniczną: moduł U węzła PV = 1,02 pu, brak nasycenia, Q≈5,7 Mvar).** |
| S1 `_execute_short_circuit` | `:1056` | **KANON** (c per pasmo, Z0, 4 typy) **CV-4.1 (2026-09-05): `enm/assembler.py::zloz_wejscie_zwarcia(snapshot, options) -> WejscieZwarcia` (graf, Z0, c per pasmo, korekta temperaturowa MIN, t_k, węzły raportowalne, lokalizacja scenariusza); wiersz niefizyczny (κ poza [1,02; 2,0] albo wartość niefinitowa) jest NIERAPORTOWALNY z `solver_result_non_physical` — solver nietknięty (B-01), propozycja odmowy rdzenia → OD-6.** **CI-PARYTET-5 (2026-09-05):** polityka §35 rozszerzona o kwalifikację TOPOLOGICZNĄ — węzeł zwarcia w wyspie bez impedancji do odniesienia (bez źródła sieciowego / maszyny) jest `not_reportable` z `non_physical_reason=fault_node_without_reference_impedance` i liczbami wyniku → `None` (IEC 60909-0 §4.2/§6.8: Z_kk nieokreślone, falownik bez impedancji); kwalifikacja po liczbach (NaN/inf, pasmo κ) to druga linia. |
| P2, S4 wizard `build_*_input` | `network_wizard/service.py` | **ZREALIZOWANE (CV-4.2, 2026-09-05)** — kasacja procedurą 7 kroków: `build_power_flow_input`/`build_short_circuit_input` + wyłączne pomocnicze (`_select_slack_node_id`, `_lookup_node_attrs`, `_normalize_inverter_setpoints`, `_resolve_inverter_q_mvar`, `_normalize_converter_setpoints`, `_resolve_converter_q_mvar`) + `ShortCircuitInput` DTO (`network_wizard/dtos.py`) skasowane. Pomiar PRZED (zgodnie z pierwotnym wpisem wiersza): 0 wywołań produkcyjnych, zweryfikowane grepem po kasacji — nic do przepięcia na assembler. `service.py`: 2481→2228 linii. Reszta kreatora (operacje edycji, DTO niezwiązane) POZA zakresem karty. |
| P3, S3 `analysis_run/service` (`c_factor` domyślne 1.0!) | `analysis_run/service.py:556, 858` | DELETE z torem legacy (fabrykowane domyślne — potwierdza D-03) |
| P4, S2, E3 `execution_engine` | `execution_engine/**` | DELETE (tylko testy) |
| P5 `power_flow_input_builder` | `application/power_flow_input_builder.py` | **ZREALIZOWANE (CV-4.2, 2026-09-05)** — moduł skasowany całkowicie (warunek „po P3/P4" spełniony — oba usunięte w CV-3.3-A/B). Zero konsumentów produkcyjnych (grep po kasacji). Usunięty razem z testem parity P2↔P5 (`tests/application/test_wezel_zlozony_wejscie_rozplywu.py`, 1032 linii) po potwierdzeniu, że właściwości fizyczne pozostają pokryte NIEZALEŻNIE na torze kanonicznym (`tests/enm/test_prosument_falownik_odbior.py`, `tests/enm/test_oze_pf_inverter_control.py::test_two_regulated_sources_on_one_bus_are_refused`, `tests/enm/test_zip_wiring.py::{test_zip_aggregation_is_power_weighted_across_loads, test_load_and_generation_on_one_bus_are_separated}`). |
| P6–P8, S5, S6, **P9 własny NR + własny Ybus**, P10 BFS | `application/reference_networks/**` | STRANGLE: sieci referencyjne budowane jako ENM i liczone przez P1/S1; P9 usunięty po parity (12 benchmarków IEEE/CIGRE identyczne w tolerancji zadeklarowanej); P10 zastąpiony solverem 4-przewodowym (ADR-021) **Pomiar 2026-09-04 (`tests/golden/test_registry.py`):** 12 benchmarków + `oze_pv_bess` NIE walidują się jako `EnergyNetworkModel` (`id` szyn jako napisy) — osobny dialekt słownikowy, czyli DRUGA PRAWDA O SIECI istniejąca wyłącznie dla P9; zapadka `BENCHMARK_DICT_ZASTANE = {G07: 1, B-BENCH: 12}` może tylko maleć |
| P11, S7 `solver_input/builder` (`LoadFlowPayload`, `ShortCircuitPayload`, JSON) | `solver_input/**` | **ZREALIZOWANE (CV-4.2, 2026-09-05)** — kontrakt LOCKED v1.1 ZOSTAJE bit w bit (zero zmian pliku `solver_input/builder.py`), ale przepięty: `api/solver_input.py::_graph_for_analysis` buduje graf PRZEZ `enm.assembler.zloz_wejscie_rozplywu`/`zloz_wejscie_zwarcia` (ten sam tor co bieg kanoniczny — jedyny wywołujący `get_solver_input`/`get_eligibility`), a `build_solver_input` WYPEŁNIA `LoadFlowPayload`/`ShortCircuitPayload` z tego JUŻ zmontowanego grafu zamiast składać własny slack/PQ/PV równolegle. **Odkrycie przy tej karcie (K5, poza enumeracją K1–K7, naprawione w tym samym mandacie):** stan SPRZED karty (`_get_graph_for_case`) ZAWSZE zwracał `NetworkGraph(network_model_id=case_id)` — graf PUSTY, zero szyn/gałęzi, niezależnie od treści przypadku — czyli P11 HTTP (oba endpointy) był fabrykacją KLASY P12 (empty/stub input), tyle że bez wiedzy dzwoniącego. Dosłowny „parytet BEFORE/AFTER" K5 jest więc niewykonalny (BEFORE = zawsze zdegenerowany) — udowodniony zamiast tego niezmiennik: (a) `build_solver_input`'s payload-assembly logic niezmieniona (zero-diff pliku); (b) payload dla sieci rejestru z realną treścią NIE jest zdegenerowany (`tests/golden/parytet_p11/test_parytet_p11.py::test_payload_nie_jest_zdegenerowany_pustym_grafem`, obala stan sprzed karty wprost); (c) payload P11 PO przepięciu jest stabilny/deterministyczny — pierwszy golden dla tego kontraktu, `tests/golden/parytet_p11/` (harness reużywa `widok_parytetu`/`porownaj_wpis` z `parytet_assemblera`, nie kopiuje), 126 wpisów (17 odmów fizycznych/topologicznych — TE SAME sieci i powody co w `parytet_assemblera`, krzyżowo zweryfikowane). `SimplifiedGridSource` „follow-up": POZA mandatem K1–K7 (nie dotyczy P11 rewiringu) — zastany dług nienazwany w karcie, do ujęcia osobno. |
| P12 `api/solver_input.run_audit2_power_flow` (`pq=[]`, slack-stub) | `api/solver_input.py:118-166` | **ZREALIZOWANE (CV-4.2, 2026-09-05)** — endpoint `POST /api/cases/audit2-power-flow` skasowany (`run_audit2_power_flow`, `Audit2PowerFlowRequest`/`Response`, `_get_graph_for_case`/`_get_graph_for_snapshot` — fabrykacja `pq=[]`/`slack_node_id or "slack-stub"`). Konsument FE (`ui/network-build/station-der`, jedyny — zweryfikowane grepem literału trasy) przepięty na bieg kanoniczny: `POST /api/execution/study-cases/{case_id}/runs` (`analysis_type=LOAD_FLOW`, `solver_input.audit2_project_id`/`audit2_station_id`) → `POST /api/execution/runs/{run_id}/execute` → `GET /api/execution/runs/{run_id}/results` (`global_results.audit2_applied`). `docs/v12xx/MACIERZ_KOMPATYBILNOSCI_API.md` wiersz → `usuniety`, OpenAPI snapshot przeliczony. |
| P13 `domain/load_flow_input` | tylko testy | **ZREALIZOWANE (CV-4.2, 2026-09-05)** — `domain/load_flow_input.py` (`LoadFlowRunInput`), `domain/load_flow_validation.py` (`validate_load_flow_input`) skasowane z testami istniejącymi WYŁĄCZNIE dla nich (`tests/test_load_flow_input.py`, `tests/test_load_flow_determinism.py`). Zero konsumentów produkcyjnych (pomiar potwierdzony). |

Guard po CV-4: konstrukcja `PowerFlowInput(`, `ShortCircuitInput(`/`ShortCircuitPayload(` poza `enm/mapping.py`/assemblerem = czerwony; `backend_no_physics_guard` (rodziny wielkości: √3, κ, exp(−3R/X), I²t, k/(M^a−1), R·(1+α(θ−20)), P/(√3·U·cosφ)) poza `network_model/solvers` = czerwony z pustą allowlistą. **Stan po CV-4.1 (2026-09-05):** guard konstrukcji ISTNIEJE — `scripts/solver_input_assembler_guard.py` (krok P0 w `p0-extended-guards.yml`): wywołanie `PowerFlowInput(`/`ShortCircuitPayload(`/`LoadFlowPayload(`/`PQSpec(`/`SlackSpec(`/`PVSpec(`/`ShuntSpec(` poza `enm/assembler.py` = czerwony, z zapadką ZASTANE w obie strony (7 plików / 31 konstrukcji: P2/S4, P5, P6–P8, P11, P12 — schodzi wyłącznie w dół, kasacje procedurą w CV-4.2/CV-4.3) i allowlistą `power_flow_gauss_seidel.py` (fallback GS→NR z pól istniejącego `pf_input`, rdzeń FROZEN); `ShortCircuitInput` z tej listy to DTO kreatora (`network_wizard/dtos.py`), nie kontrakt solvera — ginie z kreatorem (P2/S4), nie jest liczone; `backend_no_physics_guard` — jeszcze nie. **Stan po CV-4.2 (2026-09-05):** zapadka ZASTANE zeszła do 3 plików / 16 konstrukcji — WYŁĄCZNIE `application/reference_networks/**` (CV-4.3, benchmarki jako substraty ENM); P2/S4, P5, P11, P12 zniknęły z zapadki (kasacja/przepięcie, patrz wiersze wyżej). `solver_input/builder.py` przeszedł do ALLOWLIST (nie liczony) z uzasadnieniem: kontrakt LOCKED wypełniany z grafu PODANEGO przez wywołującego (`api/solver_input.py`), zbudowanego PRZEZ assembler — ten sam wzorzec co `power_flow_gauss_seidel.py` (konstrukcja z pól/grafu podanego przez assembler, nie z modelu równolegle). Osobny guard `scripts/solver_input_substitute_guard.py` (podstawianie liczby za nieobecne dane wejściowe): 575 plików przeskanowanych, zapadka fizyczna 63 pliki/290 konstrukcji (P5 zniknął z zapadki jako martwy wpis — plik skasowany).

### C.2.4 Tożsamość w IR (§6, T-4)
Dziś `Node.id = uuid5(NAMESPACE_DNS, ref_id)` w torze kanonicznym i `uuid4` w legacy (A1 §2). Docelowo identyfikator węzła IR = deterministyczna funkcja zbioru `ref_id` CN wchodzących w TN (posortowane, sha256 → stabilny id), mapa zwrotna TN → {CN ref_id} niesiona w `TopologyView`; wyniki mapowane na `ref_id` przez tę mapę (dziś `enm_ref_id_map`). Zakaz tłumaczeń tożsamości poza tą jedną funkcją (A1-06: 4 przestrzenie → 1).

## C.3. Granica solverów i rejestr zdolności (§13, §32)
- Rdzenie FROZEN: IEC 60909, NR/GS/FD, ZIP, phase_state, dynamic — zmiana tylko przez **B-01** (niezależna wyrocznia, jawne założenia, wartości pośrednie, deterministyczne wejście, uzasadniona tolerancja, obliczenie referencyjne, tożsamość starej fizyki, testy trybów awarii; test z tej samej implementacji nie jest wyrocznią).
- `solver_capability_registry.py` (25 wpisów, wszystkie `implemented` — do ponownego pomiaru): staje się **bramką wykonania** — orkiestrator wybiera solver po zdolności (typ sieci, model fazowy, zdolność topologiczna T1–T13, źródła, DER, uziemienie, typy zwarć, szeregi czasowe), a status `SUPPORTED|PARTIAL|PLANNED|NOT_IMPLEMENTED` jest widoczny przed uruchomieniem; brak zdolności = jawna odmowa (`docs/twin/MV_DESIGN_PRO_SIMULATION_ARCHITECTURE.md` §8; macierz topologiczna `docs/twin/MV_DESIGN_PRO_TARGET_DIGITAL_TWIN_ARCHITECTURE.md` §9a).
- Fizyka poza solverami (A3-08: proof engine 21 wyrażeń, `analysis/arc_flash`, flicker, krzywa IEC w `application/analyses/protection`, R_θ w `application/solvers`) → przeniesiona do `network_model/solvers` z golden dowodami bit-identycznymi.

## C.4. White Box (§23)
Lineage minimalny: dane źródłowe → proweniencja → założenia → envelope → migawka efektywna → `TopologyView` → wejście solvera (IR + kontrakt) → wartości pośrednie (Ybus, Zbus, Z1/Z2/Z0, jakobian, iteracje) → wynik → status walidacji → interpretacja. Jeden format śladu `TraceArtifact` (`trace_v2` istnieje 2 404 LOC bez konsumenta — wpiąć, nie pisać trzeciego); `run_hash` niezależny od formatowania; dowody (proof engine) wyłącznie formatują wartości ze śladu. Test snapshotowy nie jest wyrocznią fizyki (§23, §32) — wyrocznie w `../reference-networks/REFERENCE_NETWORK_REGISTRY.md`.

## C.5. Determinizm numeryczny — polityka odcisku (§35, przegląd kwantyzacji M0-2)

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


## C.6 Wydajność (odsyłacz)
Budżety B1–B10 i metoda pomiaru: `../twin/MV_DESIGN_PRO_PERFORMANCE_PLAN.md` §1a; baseline: `../evidence/PERFORMANCE_BASELINE.md` (gdy istnieje); algebra rzadka i wspólne jądro: `../twin/MV_DESIGN_PRO_SIMULATION_ARCHITECTURE.md` §4.
