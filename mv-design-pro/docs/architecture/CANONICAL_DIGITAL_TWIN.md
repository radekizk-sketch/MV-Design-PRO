# MV-DESIGN-PRO — CANONICAL DIGITAL TWIN (Canonical Project Twin = rozwinięty ENM)

**Status:** KANONICZNY (kontrakt właściciela MAX PLATFORM, 2026-09-04, §4–§7, §19–§20, §27–§29, §39–§40).
**Rozstrzyga nad:** `docs/twin/MV_DESIGN_PRO_TARGET_DIGITAL_TWIN_ARCHITECTURE.md` (FAZA B) i `docs/adr/ADR-012` w zakresie sformułowania „nowy model": **nie powstaje nowa trwała klasa `TwinModel`**. Canonical Project Twin = `EnergyNetworkModel` (ENM) rozwinięty addytywnie o rewizje, warianty, scenariusze, proweniencję i stan inżynierski. Reszta FAZY B (terminale, stan efektywny, projekcje, kontrakt współbieżności, macierze zdolności) pozostaje w mocy jako materiał wejściowy i jest tu przywołana, nie powielona.
**Powiązane kanony:** `PRODUCT_CAPABILITY_MODEL.md` (co twin musi nieść), `REVISION_SCENARIO_EXECUTION_MODEL.md` (rewizja/wariant/scenariusz/przypadek), `COMPUTATIONAL_BOUNDARY.md` (topologia wyprowadzana, IR, solvery), `FUTURE_CAPABILITY_REVIEW.md` (test każdej decyzji), `../reference-networks/REFERENCE_NETWORK_REGISTRY.md`, `../evidence/CONVERGENCE_EVIDENCE.md`.

---

## 1. Werdykt: ENM jest kandydatem, który PRZECHODZI ocenę na rdzeń Digital Twin (§4)

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

### 1.1 Zakaz równoległych prawd (§4, §28) — los każdego kandydata

| Kandydat | Los | Gdzie |
|---|---|---|
| `TwinModel` (nowa klasa) | **nie powstaje** | ten dokument |
| `EnergyNetworkModel` | **Canonical Project Twin** — jedyny trwały model sieci | ENM |
| `network_model/core` (`NetworkGraph`, `Node`, `Branch`, `NetworkSnapshot`) | **Derived Immutable Computational IR** — nie trwały, nie edytowalny, budowany wyłącznie z `EffectiveNetworkSnapshot` | `COMPUTATIONAL_BOUNDARY.md` |
| legacy ORM `network_nodes/branches/sources/loads`, `network_snapshots`, `sld_*` + tor `analysis_runs`/wizard/`xlsx_import` | **DELETE procedurą kasacji** (inventory → consumer search → data export → parity → cutover → observation → removal); `xlsx_import` przepięty na komendy domenowe (D-45) | `REVISION_SCENARIO_EXECUTION_MODEL.md` §7, `COMPUTATIONAL_BOUNDARY.md` §3 |
| model SLD (`sldNetwork53` ręczny w kliencie; `enmToSldAdapter` 6585 LOC z własną topologią) | **projekcja** twin — scena semantyczna z backendu; ręczne modele sieci w kliencie kasowane | `docs/twin/MV_DESIGN_PRO_SLD_PRESENTATION_ARCHITECTURE.md` |
| „model solvera" (10 builderów PF, 7 ścieżek SC, własny NR w `reference_networks/computation.py`) | **jeden assembler** ES → IR → kontrakt wejścia solvera | `COMPUTATIONAL_BOUNDARY.md` §3 |
| `meta.field_specs` / `nn_field_specs` | **strangle → delete** po migracji do typowanego `Bay` | §6 |

---

## 2. Własność modelu (§5): PROJECT owns the canonical network model

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

## 3. Model rzeczywistości fizycznej (§6): łączność terminalowa na ENM — addytywnie

**Decyzja T-1 — `Bus` ≡ `ConnectivityNode`.** W ENM `Bus` jest już trwałym punktem elektrycznym, a `SwitchBranch` jawnym urządzeniem między dwoma punktami; scalanie punktów przez zamknięte łączniki (union-find w `AdmittanceMatrixBuilder`, `ybus.py:71-86`) jest wyprowadzeniem węzła topologicznego. To model node-breaker w sensie CIM, w którym `Bus` pełni rolę `ConnectivityNode`, a sekcja szyn/rozdzielnia jest `Bus` o rodzaju `BUSBAR_SECTION`; `Junction` (istnieje) = punkt łączeniowy bez szyny. Nazwa klasy `Bus` pozostaje (bez przemianowania kodu); semantyka jest zdefiniowana tutaj i w docstringu klasy. Węzeł topologiczny (`TopologicalNode`) **nigdy nie jest trwały** — `COMPUTATIONAL_BOUNDARY.md` §2.

**Decyzja T-2 — terminal jako kontrakt łączności, wyprowadzany deterministycznie z trwałych referencji.** `Terminal = (equipment_ref, sequence, cn_ref, phases)`; tożsamość `"{equipment_ref}:t{sequence}"`. Postać trwała: dla urządzeń dwuterminalowych istniejące `from_bus_ref`/`to_bus_ref` (= `cn_ref` terminali 1 i 2) + addytywne `terminal_phases: list[PhaseSet] | None`; dla urządzeń jedno- lub wieloterminalowych (`Source`, `Load`, `Generator`, `ShuntCapacitor`, TR trójuzwojeniowy w przyszłości) — `bus_ref` (istniejące) lub addytywna lista `terminals`. Jedyny akcesor: `enm/topology.terminals(enm)`; walidator egzekwuje: każdy terminal wskazuje istniejący `Bus`, zgodność pasm napięć, zgodność zbiorów faz na wspólnym CN. Dzięki temu hashe istniejących modeli **nie zmieniają się** (brak big-bang migracji fixtur), a łączność staje się egzekwowana. `Port`/`PortRef`/`ConnectionNode` (metadane, A1-03) oraz niewpięte `enm/migrations/v_ports_001.py`, `endpoint_ports.py` → konsolidacja w semantykę terminala; kasacja procedurą po inwentarzu konsumentów (`enmToSldAdapter.ts` czyta `Port*`).

**Decyzja T-3 — stan łącznika i `in_service` są stanem, nie łącznością (I-03 z FAZY B).** `SwitchBranch.status` OPEN/CLOSED nie zmienia łączności; `in_service=False` wyłącza urządzenie z IR bez zmiany łączności; nowy stan `EARTHED` (uziemnik) jako wartość stanu łącznika uziemiającego (encja `SwitchBranch.kind = EARTHING_SWITCH`). Osiem reprezentacji stanu (A1-07) → jedna, rozwiązywana przez `EffectiveState` (`REVISION_SCENARIO_EXECUTION_MODEL.md` §3).

**Decyzja T-4 — tożsamość.** `ref_id` jest jedyną tożsamością assetu w twin, IR, wynikach, projekcjach i dokumentach; `ENMElement.id: uuid4` do usunięcia (A1-14); tłumaczenie na uuid5 wewnątrz IR jest dopuszczalne wyłącznie jako deterministyczna funkcja `ref_id` z mapą zwrotną niesioną w biegu (dziś `enm_ref_id_map`) — `COMPUTATIONAL_BOUNDARY.md` §2.4.

---

## 4. Model fazowy i uziemienie (§7, §13 EARTH FAULTS, §6 grounding)

**Decyzja F-1 — `PhaseSet` na terminalu**, wartości: `ABC`, `ABCN`, `A`, `B`, `C`, `AN`, `BN`, `CN`, `AB`, `BC`, `CA`, `N`, `PEN`, `PE` (+ kombinacje z `PE` dla przewodów ochronnych tam, gdzie analiza tego wymaga). Dla urządzeń SN bez jawnej deklaracji zbiór faz jest **definicją klasy urządzenia** (trójfazowe = `ABC`), zapisywaną jawnie przez walidator jako pochodna, nie jako cichy default; urządzenia nN deklarują fazy jawnie (kreatory nN i import wymuszają). Żadna granica architektoniczna nie zakłada „phase = 3ph": IR może być zgodny (składowe) lub fazowy (ABCN) z tego samego ENM.

**Decyzja F-2 — `EarthingSystem` (nN) jako encja**: `{ref_id, kind: TN_C|TN_S|TN_C_S|TT|IT, pen_split_point_ref, pe_bus_refs}`, przypięta do sekcji nN / rozdzielnicy; zastępuje string w `meta` z cichym domyślnym TN-C-S (A11-03); żyła powrotna kabla rozdzielona na `N` i `PE`/`PEN` w katalogu i modelu (A11-04).

**Decyzja F-3 — `NeutralGrounding` jako encja pierwszej klasy** (główny test jakości twin — §13): `{ref_id, kind: ISOLATED|COMPENSATED|RESISTOR|REACTOR|SOLID|RESISTOR_PLUS_COIL, attached_to: transformer_ref+winding | source_ref | grounding_transformer_ref, coil_inductance_h | coil_current_a, tuning_degree, resistor_ohm, reactor_ohm, max_earth_fault_current_a, catalog_ref, provenance}`; pojemność doziemna `c0_nf_per_km` jako pole katalogowe kabla/linii (proweniencja). Fizyka (sieć składowej zerowej: `build_zero_sequence_zbus`, analiza doziemna kompensowana/izolowana, 67N/Y0>) czyta **wyłącznie** tę encję. Konsolidacja 6 reprezentacji (A11-02): `Bus.grounding`, `Transformer.hv/lv_neutral: GroundingConfig`, `meta.grounding`, `BayEarthFaultPath`, `earthing_role` w `BayPrimaryDevice`, `v126` — przez procedurę: inwentarz konsumentów → migracja do `NeutralGrounding` → parity (Z0 identyczne dla modeli, które dziś liczą Z0) → kasacja pozostałych → guard.

**Decyzja F-4 — grupa połączeń i dostępność punktu neutralnego**: `Transformer.vector_group` walidowany (słownik IEC 60076: Dyn11, Yzn5, YNd1, Dyn5…); `neutral_accessible` wyprowadzane z grupy i obecności `NeutralGrounding`; Z0 transformatora z grupy + uziemienia, nie z osobnego parametru.

---

## 5. Assety, katalog, proweniencja, założenia (§20, §6)

- **Catalog item ≠ installed asset**: parametry zmaterializowane z katalogu w rewizji katalogu przypiętej do projektu (`catalog_revision_set` w `RevisionEnvelope`); zmiana katalogu = nowa rewizja katalogu + unieważnienie przez graf zależności; `ParameterOverride` rozszerzony o `old_value`, `author`, `at`, `reason` (istnieje `key/value/reason`).
- **Proweniencja wartości**: klasy `STANDARD | OSD_POLICY | MANUFACTURER | CATALOG | USER_ASSUMPTION | MEASUREMENT | PROJECT_SPECIFICATION | DERIVED` — reużycie istniejącego mechanizmu proweniencji katalogów (K-E/K-O/K-Q); `MANUFACTURER` bez wskazania dokumentu = fabrykacja (karta FAB-A usuwa fikcyjne nazwy producentów — D-33). Rejestr źródeł: `docs/twin/MV_DESIGN_PRO_TARGET_DIGITAL_TWIN_ARCHITECTURE.md` §15.5.
- **Założenia**: `AssumptionsRegister` rewizjonowany; parametr `USER_ASSUMPTION` wskazuje `assumption_id`; `ENMDefaults` i `ConnectionConditions` (istnieją) wchodzą do rejestru założeń jako pozycje z proweniencją, nie jako ciche wartości.
- **Metadane inżynierskie** (`meta`) dozwolone wyłącznie dla danych, które NIE są pierwotnymi danymi domenowymi (etykiety prezentacji, notatki); każda wartość fizyczna w `meta` = dług do migracji (inwentarz: A1-02, A11-03, A11-07, A5-04).

---

## 6. Stacja / pole / aparat (§19)

`Bay` typowany istnieje i jest bogaty (`BayPrimaryDevice`, `BayMeasurementChain`, `BayProtectionControlUnit`, `BayInterlockSet`, `BayEnergizationSafetyState`, `BayEarthFaultPath`, `BayCanonicalModel`), ale prawda o polach żyje w `meta.field_specs`/`nn_field_specs` (A1-02; zapis typowanych kolekcji wyłączony przez `LEGACY_FIELD_COLLECTIONS`). Migracja docelowa: `legacy metadata → typed Bay → typed apparatus (BayPrimaryDevice → SwitchBranch/FuseBranch/Measurement jako urządzenia z terminalami) → terminale → łączność`. Kolejność obowiązkowa: inwentarz konsumentów (`enmToSldAdapter.ts` 15 odczytów, `domain_operations.py:1087,5050`, projekcja nN, readiness, raporty) → migracja (rewizja „migracja" w projekcie) → parity (scena SLD, projekcja nN, readiness identyczne) → kasacja starego kanału → guard `meta_field_specs_resurrection_guard`. **Zakaz permanentnego fallbacku**: po cutover odczyt `meta.field_specs` = naruszenie guardu, nie „kompatybilność".

---

## 7. Wycinki konwergencji (kolejność wiążąca; każdy = vertical strangler wg §29)

| Wycinek | Zakres | Parity evidence | Guard przeciw wskrzeszeniu | DoD §40 |
|---|---|---|---|---|
| **CV-0 Trust foundation** | CI 8/9 → 9/9 zielone na gałęzi; polityka determinizmu (`COMPUTATIONAL_BOUNDARY.md` §5); ochrona `main` lub owner action; fabrykacje (FAB-A/B); rejestr sieci wzorcowych; inwarianty | wyniki CI, guardy, testy | `verification_phantom_paths_guard` (istnieje), `guardy_z_ci` | 18, 19, 20 |
| **CV-1 Project owns ENM** | magazyn per projekt, fasada case→project, migracja per-case ENM → rewizja/warianty | hash ENM projektu = hash ENM aktywnego przypadku; wszystkie e2e na fasadzie zielone | guard: zapis magazynu kluczem `case_id` = czerwony | 1, 2 |
| **CV-2 Rewizje i envelope** | `ModelRevision` z dziennika (bez limitu 500, checkpointy), `checkout(rev)`; `RevisionEnvelope` na `CanonicalRun`; świeżość z envelope; `catalog_revision_set`, `assumptions_revision` | `checkout(rev_n)` odtwarza `hash_sha256` rewizji n dla wszystkich sieci rejestru | guard: bieg bez envelope = czerwony | 12, 13 |
| **CV-3 Scenariusze** | jeden `OperatingScenario`, jedna funkcja `apply_scenario` → `EffectiveNetworkSnapshot`; migracja N-1/hosting/pq_area/odpowiedz_osd/FaultScenario; kasacja C2/C3/C4/C5 | wyniki N-1 i hosting bit-identyczne przed/po | guard: `copy.deepcopy(snapshot)` poza `apply_scenario` = czerwony | 7, 8 |
| **CV-4 Granica obliczeniowa** | jeden assembler ES → TV → IR → kontrakt; kasacja P2–P12/S2–S7 i własnego NR; `TopologyService` jedna implementacja; legacy ORM procedurą | 12 benchmarków IEEE/CIGRE + rejestr sieci: wyniki identyczne (tolerancja zadeklarowana) | guard: konstrukcja `PowerFlowInput(`/`ShortCircuitInput(` poza assemblerem = czerwony; `backend_no_physics_guard` | 9, 10, 11, 12 |
| **CV-5 Terminale, fazy, uziemienie** | T-2, F-1…F-4; walidator; migracja `meta.field_specs` → `Bay` | scena SLD i projekcja nN identyczne; Z0 identyczne | `meta_field_specs_resurrection_guard`; walidator terminali | 3, 4, 5, 6 |
| **CV-6 G01 vertical slice** | sieć G01 (§31) zbudowana komendami domenowymi; pełny łańcuch EDIT → … → REPORT; analiza doziemna kompensowana; PV; nN ABCN/SWZ w zakresie gotowym | wyrocznie z rejestru (analityczne + benchmark) | test e2e G01 jako bramka CI | 21 |
| dalej | ownership zabezpieczeń (14), SLD jako projekcja (15), SN/nN bez równoległych modeli (16), White Box (17), kasacje legacy (23, 24) | | | |

Każdy wycinek kończy się raportem w formacie §42 kontraktu i wpisem w `../evidence/CONVERGENCE_EVIDENCE.md`; granica przechodzi w **FROZEN** dopiero po: dowodzie implementacji, wyroczni inżynierskiej, `FUTURE_CAPABILITY_REVIEW`, przeglądzie adwersaryjnym i bramce CI (§39). Ponowne otwarcie wymaga dowodu defektu (inżynierskiego, numerycznego, spójności danych, niezdolności do zdolności z `PRODUCT_CAPABILITY_MODEL.md`, bezpieczeństwa, wydajności) albo nowego jawnego wymagania właściciela — preferencja architektoniczna nie jest dowodem.

## 8. Rejestr zamrożeń
| Granica | Status | Dowód |
|---|---|---|
| rdzenie solverów IEC 60909 / NR | FROZEN (od V12) — zmiany tylko przez B-01 | `solver_boundary_guard`, `solver_diff_guard` |
| `ResultSetV1`, `result_contract_v1` | FROZEN — envelope niesiony na biegu, nie w ładunku v1 | `resultset_v1_schema_guard` |
| kontrakt projekcji nN 3.0.0 z kanonizacją liczb | FROZEN (addytywnie) | 18 fixtur, testy parytetu |
| T-1…T-4, F-1…F-4, własność projektu | PROPOSED → FROZEN po CV-1/CV-5 z przeglądem adwersaryjnym | `../evidence/CONVERGENCE_EVIDENCE.md` |
