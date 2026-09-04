# MV-DESIGN-PRO — REVISION / VARIATION / SCENARIO / STUDY CASE / EXECUTION MODEL

**Status:** KANONICZNY (kontrakt MAX PLATFORM 2026-09-04, §8–§10, §21 fragment, §28–§29). Konsoliduje — nie dodaje — istniejące byty: `StudyCase`/`StudyCaseConfig`, `study_case_engine`, ENM `study_cases[]`, P23 `Study/Scenario/Run/Snapshot` (`STUDY_SCENARIO_WORKFLOW_CANONICAL_PLUS.md` w tym katalogu — **ZASTĄPIONY** tym dokumentem), ADR-008 `OperatingCase/SwitchingState`, `FaultScenario`, `CanonicalRun`, `ExecutionEngineService`, `BatchExecutionService`, `unified_run_dispatch`. Dokument `docs/twin/MV_DESIGN_PRO_DATA_VERSIONING_PROVENANCE.md` (FAZA B) jest materiałem wejściowym.

---

## 1. Cztery pojęcia — definicje rozłączne (§8)

| Pojęcie | Co to jest | Co WOLNO mu zmienić | Czego NIE WOLNO | Tożsamość |
|---|---|---|---|---|
| **ModelRevision** | wersja trwałego stanu Canonical ENM projektu; wynik zastosowania komend domenowych | wszystko w ENM (przez komendy) | nic poza ENM | `(project_id, revision: int)`, `hash_sha256` (istniejący `compute_enm_hash`) |
| **NetworkVariation** | zmiana STRUKTURALNA wyrażona jako uporządkowana lista komend domenowych na rewizji bazowej: nowa stacja, kabel, wymiana TR, nowe pole, przebudowa szyny, BESS, modernizacja | topologia, assety, wiązania katalogowe | stanów pracy (to scenariusz), konfiguracji analizy (to przypadek) | `(project_id, variation_id, revision)`, `base_revision`, `hash` = sha(base_hash, komendy) |
| **OperatingScenario** | stan PRACY tej samej konfiguracji fizycznej: MAX/MIN LOAD, MAX PV, N-1, łącznik OPEN/EARTHED, TR niedostępny, BESS charge/discharge, wyspa, profil czasowy, specyfikacja zwarcia | stany łączników, `in_service`, skalowanie/profile P/Q, tryby DER, zaczepy, tryb BESS, zbiór wyłączeń (generator N-1), parametry zwarcia | struktury (żadnej komendy domenowej) | `(project_id, scenario_id, revision)`, `hash` |
| **StudyCase** | reprodukowalna konfiguracja ANALIZY: `model_revision` + `variation_ref?` + `scenario_ref` + konfiguracja analizy/solvera (`StudyCaseConfig`) + profil norm/OSD | parametry solvera i analizy | modelu sieci (zakaz kopii ENM per case — §5) | `case_id`; `RevisionEnvelope` |

Reguła rozdziału: jeśli zmiana wymaga komendy domenowej → wariant; jeśli jest nadpisaniem stanu istniejącego assetu → scenariusz; jeśli dotyczy tego, JAK liczymy → przypadek.

---

## 2. Inwentarz istniejących bytów i ich los (§8, §28 — bez czwartej implementacji)

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

## 3. Model docelowy

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
    semantic_fingerprint: str   # sha256 nad kanonicznym JSON (klucze posortowane, liczby skwantyzowane — COMPUTATIONAL_BOUNDARY.md §5)

EffectiveNetworkSnapshot = apply_scenario(materialize(checkout(project, model_revision), variation), scenario)
    # immutable (frozen Pydantic), reproducible, versioned (envelope), provenance-aware (każde nadpisanie ma źródło: scenariusz/wariant/rewizja), complete-enough (readiness per analiza)
```

**Skąd bierze się `EffectiveNetworkSnapshot` w kodzie dziś:** `CanonicalRun.snapshot` (pełny `model_dump` ENM w momencie biegu) — to JEST migawka efektywna bez scenariusza. Promocja: (1) migawka staje się wynikiem `apply_scenario`, (2) hash migawki = `snapshot_hash` (istnieje), (3) bieg przechowuje **envelope + hash**, a pełną migawkę tylko jako checkpoint (dziś 0,78 MB per bieg przy 54 stacjach — A9 §3.3 poz. 3), odtwarzalną z rewizji + wariantu + scenariusza (test tożsamości: odtworzona migawka ma ten sam hash).

---

## 4. Gdzie envelope obowiązuje (§9) i reguła UI

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

## 5. Wykonanie (execution)

- **Jedno wejście**: `POST /api/projects/{p}/runs {case_ids | scenario_ids, mode: RUN_REQUIRED|RECALCULATE_AFFECTED|RUN_SELECTED, analyses?}` → `ExecutionPlan` (DAG analiz, gotowość per analiza, cache po `input_hash`) → `ExecutionBackend` (`LocalProcessPoolExecutionBackend` teraz, `WorkerQueueExecutionBackend` później bez zmiany orkiestratora — D-07). Istniejące `execution_runs.py` (E1) staje się tym wejściem; `BatchExecutionService` (E4) — planem serii.
- **Jeden rejestr biegów**: `canonical_runs` (R1) z envelope; R2/R3/R4 kasowane procedurą po przepięciu konsumentów (porównania, zabezpieczenia, V12.6, serie).
- **Status biegu**: `QUEUED | RUNNING | PARTIAL | FINISHED | FAILED | NOT_COMPUTED` (bez cichego sukcesu; `NOT_COMPUTED` z P23 zachowane jako semantyka „nie liczono", nie „błąd").
- **Cache**: klucz `input_hash`; trafienie = ten sam `run_id` (semantyka „w pamięci" dla what-if zachowana: bieg na `VariantBranch` bez zapisu rewizji).
- **Provenance biegu**: `solver_id`, `solver_version` z rejestru zdolności solverów (nie stała), `settings_hash`, `catalog_revision_set`, `standards_profile_ref`, `actor`, `execution_backend`.

---

## 6. Współbieżność (§21 kontraktu; szczegóły: `docs/twin/MV_DESIGN_PRO_TARGET_DIGITAL_TWIN_ARCHITECTURE.md` §21a)

Każda komenda domenowa niesie `command_id` (idempotencja), `actor`, `expected_revision`; niezgodność = `409 CONFLICT` z opisem rozbieżności; zakaz silent last-write-wins; zapis modelu i dziennika w jednej transakcji (dziś: dwa pliki bez WAL — dług nazwany w `enm/store.py`, domykany w CV-2 przez magazyn rewizji w SQL (Postgres docelowo, SQLite w dev/test przy identycznych kontraktach — D-37)); dual-write w stranglerze tylko z guardem równoważności i terminem życia.

---

## 7. Migracja (CV-1 → CV-3) — kroki, parity, guardy

| Krok | Działanie | Parity evidence | Guard |
|---|---|---|---|
| CV-1.1 | magazyn ENM kluczem `project_id`; fasada `case_id → project_id` w `api/enm.py` | wszystkie e2e i testy API zielone przez fasadę; hash ENM projektu = hash aktywnego przypadku | zapis kluczem `case_id` = czerwony |
| CV-1.2 | migracja danych: ENM przypadków ≠ aktywnego → `NetworkVariation` (diff komend) albo raport migracji | liczba przypadków z własnym ENM BEFORE/AFTER; 0 utraconych modeli (eksport ZIP) | — |
| CV-2.1 | `ModelRevision` w SQL (`model_revisions`: project_id, revision, hash, actor, operacja, ładunek komendy, migawka gzip) zapisywany w tej samej transakcji co model; dziennik (limit 500, bez ładunków) staje się WIDOKIEM rejestru rewizji, nie osobnym zapisem; `checkout(rev)` | `checkout(n).hash == revision[n].hash` dla całego rejestru sieci wzorcowych; dziennik zmian = projekcja rewizji (parity z dzisiejszym API dziennika) | bieg bez envelope = czerwony |
| CV-2.2 | `RevisionEnvelope` na `CanonicalRun`; `input_hash` z envelope; świeżość z envelope; kasacja H1/H2/H3 | wyniki biegów bit-identyczne przed/po (envelope nie zmienia fizyki) | `provenance_constant_guard`: literał wersji/katalogu w polu proweniencji = czerwony |
| CV-3.1 | `OperatingScenario` + `apply_scenario`; migracja C6 (trwały magazyn), D1–D4 | N-1, hosting, pq_area, odpowiedz_osd: wyniki bit-identyczne | `deepcopy(snapshot)` poza `apply_scenario` = czerwony |
| CV-3.2 | kasacja C2, C3, C4, C5 procedurą (inventory → consumer search → export → parity → cutover → observation → removal) | 0 importów, 0 tras, 0 testów wskazujących skasowane byty | `legacy_public_path_guard` rozszerzony o skasowane nazwy |
| CV-3.3 | E2/E3 kasacja; E4 do orkiestratora; R2/R3/R4 kasacja | 1 rejestr biegów; porównania i zabezpieczenia czytają R1 | guard: `analysis_runs`/`study_runs` w kodzie = czerwony |
