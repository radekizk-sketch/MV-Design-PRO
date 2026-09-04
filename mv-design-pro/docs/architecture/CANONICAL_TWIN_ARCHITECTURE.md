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
| hashe nagłówka | `semantic/input/case/variant_hash` zadeklarowane, nigdy nie wypełniane (A2 §1.5) | do usunięcia na rzecz `RevisionEnvelope` |

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
| C2 | `study_case_engine.py` (`OperatingMode.N_1/MAINTENANCE`, `catalog_version_lock`, `snapshot_ref`) | `domain/study_case_engine.py` | TEST-ONLY (0 importów w `src`) | **DELETE** procedurą (konsument: 1 plik testu → przepisany na C1+scenariusz); `catalog_version_lock` → `RevisionEnvelope.catalog_revision_set` |
| C3 | ENM-dict `study_cases[]` (`switch_states/normal_states/source_modes/time_profile_ref/analysis_settings`) | `enm/domain_operations_v2.py:1172-1300` | FANTOM (ginie przy `model_validate`, 0 konsumentów) | **CONSOLIDATE semantykę do `OperatingScenario`, DELETE kod** (5 operacji `create_study_case`, `set_case_*` → operacje scenariusza poza ENM) |
| C4 | P23 `Study/Scenario/Run/Snapshot` (`switches_state_ref: Any`…) | `application/study_scenario/models.py`, `orchestration.py` | brak API; 2 konsumenci (`scenario_comparison/builder.py`, `lv_domain/upstream_equivalent.py` import) | **STRANGLE → DELETE**: konsumenci przepięci na `OperatingScenario`/`EffectiveNetworkSnapshot`; dokument P23 zastąpiony |
| C5 | ADR-008 `OperatingCaseORM` + `SwitchingStateORM` (`in_service` per case/element) | `persistence/models.py:377-394`; `network_wizard`, `analysis_run/service.py:1023-1039` | legacy tor (wizard deprecated; `apply-step` wyłączony) | **DELETE** wraz z torem legacy ORM (procedura kasacji; semantyka `in_service` per scenariusz przechodzi do `OperatingScenario`) |
| C6 | `FaultScenario` (typ, lokalizacja, Zf, `ShortCircuitConfig`) | `domain/fault_scenario.py:183-221`, `fault_scenario_service.py` (in-memory `_service`!) | PRODUKCJA, ale magazyn in-memory ginie z procesem | **PROMOTE**: specyfikacja zwarcia = część `OperatingScenario.fault_spec` (lub lista) trwała w magazynie scenariuszy; API `fault_scenarios` zachowuje kontrakt jako fasada |
| D1–D4 | delty in-memory: N-1 (`kontyngencje_n1.py:232-275`), hosting (`hosting_capacity.py:88 deepcopy`), `pq_area.py:102`, `odpowiedz_osd.py:173` | `application/analyses/**` | 4 niezależne implementacje „delty migawki" | **CONSOLIDATE** na `apply_scenario(enm, scenario) -> EffectiveNetworkSnapshot`; guard: `copy.deepcopy(snapshot)` poza jedną funkcją = czerwony |
| R1 | `CanonicalRun` (`canonical_runs` SQL; pełna migawka + `snapshot_hash` + `input_hash`) | `enm/canonical_analysis.py:88-98, 252`; `canonical_run_repository.py` | PRODUKCJA — jedyny tor z zamrożoną migawką | **KEEP + PROMOTE** — jedyny rejestr biegów; dostaje `RevisionEnvelope` |
| R2 | legacy `analysis_runs` (+`analysis_runs_index`) | `AnalysisRunService`, `unified_runs`, porównania PF/zabezpieczeń | druga prawda biegów | **DELETE** procedurą (konsumenci: `power_flow_comparison`, `protection_comparison`, `protection_analysis/service.py:344,357` → przepięci na R1) |
| R3 | `study_runs`/`study_results` | `project_archive/service.py:1158` (zapis tylko przy imporcie ZIP), `protection_analysis/service.py:157-213`, `comparison/service.py:92-96` | zapisywane praktycznie tylko z archiwum | **DELETE** procedurą (wyniki zabezpieczeń → R1 jako `analysis_kind=PROTECTION`) |
| R4 | in-memory `_runs` (V12.6), `_batches`, `_coordination_results`, `_interpretation_cache`, `_overrides_store`, `_config_store` | A9 §3.3 poz. 10 | giną z procesem — nieodtwarzalne | **CONSOLIDATE**: biegi → R1; serie → tabela `run_batches`; nadpisania SLD/konfiguracje → magazyn projektu |
| E1 | `execution_runs.py` (`/api/execution/…`) → `canonical_analysis.create_run/execute_run` | produkcyjny, konsument FE | **KEEP** jako jedyne wejście biegów (pod orkiestratorem) |
| E2 | `enm.py POST /cases/{id}/runs/{pf,sc}`, `power_flow_runs/execute`, `unified_runs`, `v126_academic` uruchomienia | 4 równoległe sposoby uruchomienia | **STRANGLE → DELETE** (sieroty bez konsumenta FE kasowane po inwentarzu; V12.6 przepięte na E1 z `analysis_kind`) |
| E3 | `ExecutionEngineService` (`execution_engine/service.py`) | tylko testy (5 plików) | **DELETE** procedurą |
| E4 | `BatchExecutionService` (`_batches` in-memory) | produkcja (`batchStore.ts`) | **PROMOTE** do orkiestratora (`ExecutionPlan` + `ExecutionBackend`), trwały rejestr serii |
| H1 | `ENMHeader.semantic_hash/input_hash/case_hash/variant_hash/switching_snapshot_hash` | zadeklarowane, nigdy nie wypełniane (A2 §1.5) | **DELETE** — zastąpione `RevisionEnvelope` (jedno źródło odcisków) |
| H2 | `build_analysis_run_reproducibility` (stałe `"1.0.0"`, `"catalog_v1"`, `"solver_tolerance/default"`) | `domain/analysis_run.py:162-235` | **REPLACE** — pola z envelope i rejestru zdolności solverów; stała bez źródła = fabrykacja |
| H3 | `variant_ref`/`switching_state_ref` jako etykiety-stałe (`DEFAULT_OPERATING_VARIANT_REF`) | `analysis_case_context.py:92,140`, `analysis_run.py:15-16` | **DELETE** — zastąpione realnymi referencjami envelope |

---

## B.3. Model docelowy

```python
class ModelRevision:          # append-only, per projekt
    project_id: str; revision: int; parent: int | None
    command: DomainCommandEnvelope | None   # PEŁNY ładunek komendy (dziś dziennik enm/dziennik_zmian.py niesie TYLKO nazwę operacji
                                            # i listy ref_id utworzone/zmienione/usunięte — replay z dziennika jest NIEMOŻLIWY; CV-2 zapisuje ładunek)
    snapshot: EnergyNetworkModel            # pełna migawka KAŻDEJ rewizji (pomiar: 0,78 MB/rewizję przy 54 stacjach; gzip ≈ 10×) —
                                            # checkout(rev) = odczyt migawki; delty/odtwarzanie z replay dopiero, gdy ładunki komend są kompletne
    hash_sha256: str; actor: ActorRef; created_at: datetime
    # inwariant: checkout(project, n).hash_sha256 == ModelRevision[n].hash_sha256 (test na całym rejestrze sieci)

class NetworkVariation:       # delta strukturalna
    variation_id: str; name: str; base_revision: int; revision: int
    commands: list[DomainCommandEnvelope]   # ten sam język co edycja bazowa — reużycie enm/domain_operations
    status: DRAFT | PROPOSED | ACCEPTED | MERGED | REJECTED   # agent tworzy tylko PROPOSED (§24, I-10)
    hash: str                               # sha(base_hash, commands)

class OperatingScenario:      # nadpisania stanu, typowane, bez komend
    scenario_id: str; name: str; revision: int; kind: ScenarioKind   # NORMAL | MAX_LOAD | MIN_LOAD | MAX_GEN | N_1 | MAINTENANCE | ISLAND | TIME_STEP | FAULT_STUDY | CUSTOM
    switch_states: dict[ref_id, OPEN|CLOSED|EARTHED]
    in_service: dict[ref_id, bool]                    # wyłączenie elementu (kontyngencja)
    load_scaling: dict[ref_id|"*", float]; gen_scaling: dict[ref_id|"*", float]
    profiles: dict[ref_id, ProfileRef]; time_index: TimeIndex | None   # QSTS/horyzont
    der_modes: dict[ref_id, DerControlMode]; bess_modes: dict[ref_id, BessMode]
    tap_positions: dict[ref_id, int]; source_modes: dict[ref_id, SourceMode]
    fault_spec: list[FaultSpec]                       # z C6: typ, lokalizacja, Z_f, konfiguracja SC
    contingency_set: list[list[ref_id]] | None       # generator scenariuszy N-1 / N-2
    hash: str

class StudyCase:              # C1 rozszerzony
    case_id: str; project_id: str
    model_revision: int; variation_ref: (variation_id, revision) | None; scenario_ref: (scenario_id, revision)
    config: StudyCaseConfig                # istniejące: c_factor, base_mva, tolerancje, ProtectionConfig...
    standards_profile_ref: (profile_id, revision)   # rejestr źródeł normatywnych / profil OSD
    protection_settings_revision: int      # rewizja nastaw (ownership w modelu — ADR-022)

class RevisionEnvelope:        # niesiony przez KAŻDY artefakt inżynierski (§9)
    project_id; model_revision; variation_ref; scenario_ref
    protection_settings_revision; catalog_revision_set: dict[catalog_id, revision]
    assumptions_revision; standards_profile_ref
    semantic_fingerprint: str   # sha256 nad kanonicznym JSON (klucze posortowane, liczby skwantyzowane — część C §C.5)

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

**Reguła UI (§9):** żaden ekran nie łączy wyników z różnych envelope jako jednego stanu inżynierskiego; przy różnicy pokazuje „wyniki z rewizji N, model na rewizji M" z akcją przeliczenia. Dziś świeżość = `compute_enm_hash(bieżący) == run.snapshot_hash` (`result_freshness.py`) — po CV-2 świeżość porównuje envelope (rewizja + wariant + scenariusz + nastawy + katalog), co domyka A2-05 (zmiana etykiety nie unieważnia, zmiana katalogu unieważnia).

---

## B.5. Wykonanie (execution)

- **Jedno wejście**: `POST /api/projects/{p}/runs {case_ids | scenario_ids, mode: RUN_REQUIRED|RECALCULATE_AFFECTED|RUN_SELECTED, analyses?}` → `ExecutionPlan` (DAG analiz, gotowość per analiza, cache po `input_hash`) → `ExecutionBackend` (`LocalProcessPoolExecutionBackend` teraz, `WorkerQueueExecutionBackend` później bez zmiany orkiestratora — D-07). Istniejące `execution_runs.py` (E1) staje się tym wejściem; `BatchExecutionService` (E4) — planem serii.
- **Jeden rejestr biegów**: `canonical_runs` (R1) z envelope; R2/R3/R4 kasowane procedurą po przepięciu konsumentów (porównania, zabezpieczenia, V12.6, serie).
- **Status biegu**: `QUEUED | RUNNING | PARTIAL | FINISHED | FAILED | NOT_COMPUTED` (bez cichego sukcesu; `NOT_COMPUTED` z P23 zachowane jako semantyka „nie liczono", nie „błąd").
- **Cache**: klucz `input_hash`; trafienie = ten sam `run_id` (semantyka „w pamięci" dla what-if zachowana: bieg na `VariantBranch` bez zapisu rewizji).
- **Provenance biegu**: `solver_id`, `solver_version` z rejestru zdolności solverów (nie stała), `settings_hash`, `catalog_revision_set`, `standards_profile_ref`, `actor`, `execution_backend`.

---

## B.6. Współbieżność (§21 kontraktu; szczegóły: `docs/twin/MV_DESIGN_PRO_TARGET_DIGITAL_TWIN_ARCHITECTURE.md` §21a)

Każda komenda domenowa niesie `command_id` (idempotencja), `actor`, `expected_revision`; niezgodność = `409 CONFLICT` z opisem rozbieżności; zakaz silent last-write-wins; zapis modelu i dziennika w jednej transakcji (dziś: dwa pliki bez WAL — dług nazwany w `enm/store.py`, domykany w CV-2 przez magazyn rewizji w SQL (Postgres docelowo, SQLite w dev/test przy identycznych kontraktach — D-37)); dual-write w stranglerze tylko z guardem równoważności i terminem życia.

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
| P1 `canonical_analysis._execute_power_flow` + `map_enm_to_network_graph` | `enm/canonical_analysis.py:1642`, `enm/mapping.py` | **KANON** — jedyny assembler; prywatne `_execute_power_flow` importowane przez 8 modułów → publiczne `orchestrator.run(plan)`; `pv_bus_ids=[]` zawsze → PV z modelu (A3-04); wiele slacków → slack per wyspa z `TopologyView` (A3-05) |
| S1 `_execute_short_circuit` | `:1056` | **KANON** (c per pasmo, Z0, 4 typy) |
| P2, S4 wizard `build_*_input` | `network_wizard/service.py` | DELETE (0 wywołań) |
| P3, S3 `analysis_run/service` (`c_factor` domyślne 1.0!) | `analysis_run/service.py:556, 858` | DELETE z torem legacy (fabrykowane domyślne — potwierdza D-03) |
| P4, S2, E3 `execution_engine` | `execution_engine/**` | DELETE (tylko testy) |
| P5 `power_flow_input_builder` | `application/power_flow_input_builder.py` | DELETE po P3/P4 |
| P6–P8, S5, S6, **P9 własny NR + własny Ybus**, P10 BFS | `application/reference_networks/**` | STRANGLE: sieci referencyjne budowane jako ENM i liczone przez P1/S1; P9 usunięty po parity (12 benchmarków IEEE/CIGRE identyczne w tolerancji zadeklarowanej); P10 zastąpiony solverem 4-przewodowym (ADR-021) **Pomiar 2026-09-04 (`tests/golden/test_registry.py`):** 12 benchmarków + `oze_pv_bess` NIE walidują się jako `EnergyNetworkModel` (`id` szyn jako napisy) — osobny dialekt słownikowy, czyli DRUGA PRAWDA O SIECI istniejąca wyłącznie dla P9; zapadka `BENCHMARK_DICT_ZASTANE = {G07: 1, B-BENCH: 12}` może tylko maleć |
| P11, S7 `solver_input/builder` (`LoadFlowPayload`, `ShortCircuitPayload`, JSON) | `solver_input/**` | KEEP jako **kontrakt** wejścia (FROZEN, addytywny) — ale wypełniany przez assembler, nie równolegle; `SimplifiedGridSource` „follow-up" → domknąć albo usunąć pole |
| P12 `api/solver_input.run_audit2_power_flow` (`pq=[]`, slack-stub) | `api/solver_input.py:118-166` | DELETE (fabrykacja wejścia) |
| P13 `domain/load_flow_input` | tylko testy | DELETE |

Guard po CV-4: konstrukcja `PowerFlowInput(`, `ShortCircuitInput(`/`ShortCircuitPayload(` poza `enm/mapping.py`/assemblerem = czerwony; `backend_no_physics_guard` (rodziny wielkości: √3, κ, exp(−3R/X), I²t, k/(M^a−1), R·(1+α(θ−20)), P/(√3·U·cosφ)) poza `network_model/solvers` = czerwony z pustą allowlistą.

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
