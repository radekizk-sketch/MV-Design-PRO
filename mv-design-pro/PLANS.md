# MV-DESIGN-PRO Operational Plan

**Version:** 5.0
**Status:** LIVING DOCUMENT
**Reference:** [`SYSTEM_SPEC.md`](SYSTEM_SPEC.md) (executive overview), [`docs/spec/`](docs/spec/) (detailed spec — source of truth)

---

## 1. Project Status Summary

MV-DESIGN-PRO is a functional Medium Voltage network design and analysis system with:
- 4 solvers (IEC 60909 SC, NR/GS/FD Power Flow)
- 8+ proof packs (SC3F, VDROP, Equipment, PF, Losses, Protection, Earthing, LF Voltage)
- 12+ analysis modules (Protection, Voltage, Normative, Coverage, Sensitivity, Comparison, Recommendations)
- Full frontend: SLD editor, Results Browser, Case Manager, Proof Inspector, Protection Diagnostics
- 1600+ backend tests
- Project import/export (ZIP, deterministic, versioned)
- CAD geometry editing in SLD
- PDF/DOCX report generation

---

## 2. Phase Status

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1: Documentation | Canonical docs (SYSTEM_SPEC, ARCHITECTURE, AGENTS, PLANS) | DONE |
| Phase 1.x: UI/UX Parity | canonical alignment docs | DONE |
| Phase 1.y: UI Contracts | SLD, Results, Inspector contracts | DONE |
| Phase 1.z: UI Exploration | Results/Inspector exploration docs | DONE |
| Phase 2: NetworkModel Core | Core elements, graph, snapshot | DONE (code) |
| Phase 2.x: UI PF++ Contracts | Advanced UI contracts (topology tree, switching, SC node) | DONE (docs) |
| Phase 3: Catalog Layer | Immutable types, resolver, governance | DONE |
| Phase 4: Case Layer | Case lifecycle, invalidation, clone | DONE |
| Phase 5: Interpretation Layer | BoundaryIdentifier, BoundaryNode moved to analysis | DONE |
| Phase 6: Wizard/SLD Unity | Verify single model access | DONE (27 backend + 23 frontend tests) |
| P10a: State/Lifecycle | Case result status machine | DONE |
| P10b: Result State + Comparison | A/B comparison | DONE |
| P11: Proof Engine | SC3F, VDROP proofs | DONE |
| P11a: Results Inspector | Read-only + trace + SLD overlay | DONE |
| P11b: Frontend Results Inspector | Result view | DONE |
| P11c: Results Browser + A/B Compare | UI-only | DONE |
| P12: Equipment Proof Pack | Thermal/dynamic withstand | DONE |
| P12a: Data Manager Parity | Case manager + active case + mode blocks | DONE |
| P14: Proof Audit & Coverage | Audit coverage | DONE |
| P14a: Protection Library (foundation) | Vendor curves, IDMT | DONE |
| P14b: Protection Library Governance | Manifest, fingerprint, export/import | DONE |
| P14c: Protection Case Config | Protection config | DONE |
| P15a: Protection Analysis Foundation | Backend overcurrent analysis | DONE |
| P23: Study/Scenario Orchestration | Scenario workflow | DONE (docs) |
| P30a: Undo/Redo Infrastructure | Command history | DONE |
| P30c: Property Grid Multi-Edit | Multi-selection editing | DONE |
| P30d: Issue Panel / Validation Browser | Validation display | DONE |
| P30e: Context Property Grid | Context-sensitive grid | DONE |
| P30f: SLD Layout Determinism Tests | Auto-layout tests | DONE |
| P31: Project Import/Export | ZIP archive (deterministic) | DONE |
| SLD CAD Geometry | CadOverridesDocument contract | DONE |
| SLD CAD Tools | Drag, bends, reset, status | DONE |
| SLD Fit-to-Content | Viewport fit action | DONE |
| SLD Routing Corridors | Connection routing obstacles | DONE |
| Infra: /api/health | Health endpoint + API URL separation | DONE |
| Memory Canonization V3.0 | This canonization pass | DONE |
| EP-1: Application API | Projects + Cases + Network persistence | DONE |
| EP-4: Case-Bound Runs | POST /cases/{cid}/runs/short-circuit, loadflow, protection | DONE |
| EP-5: SC Asymmetrical | Solver supports 1F, 2F, 2F+G (already existed) | DONE |
| EP-6: Protection Settings | I>/I>> dobor nastaw (Hoppel method) | DONE |
| EP-7: Q(U) Regulation | Proof pack NC RfG compliance | DONE |
| EP-9: PostgreSQL | Full SQLAlchemy ORM (was already migrated) | DONE |
| EP-10: XLSX Importer | Import sieci z Excel | DONE |
| EP-11: Docker + Health | Rozszerzony health: db_ok, engine_ok, solvers, uptime | DONE |
| EP-3: Wizard K1-K10 | Frontend kreator budowy sieci | DONE |
| ENM v1.0 | EnergyNetworkModel contract + mapping + validator + API + Wizard | DONE |

---

## 3. Active Work

### 3.0 Execution after 10/10 Audit (current)

Objective: Realize remediation plan from `docs/plan/PLAN_10_10_GLOBAL_SN.md` in strict sequence.

Progress:
- [x] Step I (Topology blockers) — backend CI guardians added for: radial 10, ring 8 + NOP, 2 rings + 2 sources, split+insert determinism (`backend/tests/test_topology_guardians_step1.py`).
- [x] Step II (Load Flow NR parity) — backend guardian tests added (`backend/tests/test_load_flow_step2_guardians.py`).
- [x] Step III (IEC 60909 closure) — backend guardian tests added (`backend/tests/test_short_circuit_step3_guardians.py`).
- [x] Step IV (Catalog materialization gates) — backend guardian tests added (`backend/tests/test_catalog_materialization_step4_guardians.py`).
- [x] Step V (Global white-box + export) — deterministic trace_id implemented in SC/LF/Protection emitters + regression tests; canonical step-order hardening added (permutation-invariant equation_steps hashing).
- [x] Step VI (UI↔Solver↔SLD integration) — fixed backend→frontend modal bridge for protection `relay_settings` + tests.
- [x] Step VII (SLD industrial aesthetics + golden render) — canonical render manifest + 3 golden SLD fixtures (radial, ring+NOP, PV/BESS) + CI guardian snapshots.
- [x] Step VII.b (SLD click-by-click write-flow) — modal submit wired to `executeDomainOperation` with snapshot update + selection hint sync + regression tests.
- [x] Step II.a (ExecutionEngine Load Flow unification) — added canonical `execute_run_load_flow()` pipeline with deterministic `LoadFlowRunInput`, ResultSet mapping and radial/ring integration tests.
- [x] Step VII.c (SLD adapter hardening) — removed legacy `topologyAdapterV1` module, promoted canonical `topologyAdapter.ts`, and rewired SLD core tests/imports to the canonical adapter entrypoint.

- [x] Step VII.d (SLD geometry closure) — SLD viewer fallback `useAutoLayout` removed, canonical final-geometry tests added (GPZ/trunk/branch/station/ring+NOP + label-collision invariants), and pipeline module status documented in `docs/sld/SLD_PIPELINE_CANONICAL_STATUS.md`.
- [x] Step VII.f (SLD readability declutter) — reduced default label density in trunk/branch/station renderers; technical parameters visible at higher zoom threshold.
- [x] Step VII.g (ABB-inspired visual patterning) — added compartment envelopes, bay framing and ANSI 52/50-51 visual tokens in canonical trunk/branch/station renderers.
- [x] Step VII.h (Główna ścieżka referencyjna SLD) — dodano przełącznik 4 sieci referencyjnych w `#sld-view` z polskimi etykietami i bezpośrednim renderem przez kanoniczny pipeline.
- [x] Step VII.i (Hierarchia informacji i kompozycja przemysłowa) — wdrożono 3 poziomy informacji, sekcje funkcjonalne stacji SN/nN oraz testy jakości hierarchii wizualnej.
- [x] Step VII.j (Skala i kompozycja 7/10) — podniesiono skale dopasowania `#sld-view`, powiększono moduły GPZ/stacji/odejść i zaostrzono testy jakości skali oraz hierarchii.
- [x] Step VII.e (Final SLD visible reference output) — added in-app `#sld-final` reference gallery with 4 rendered canonical geometries (leaf, passthrough, branch, ring+NOP) and UI test coverage.


### 3.0.1 Step VII Completion Criteria (SLD industrial aesthetics + golden render)

Done criteria (implemented):
- Canonical SLD fixture set covers min. 3 scenarios: radial, ring+NOP, PV/BESS.
- Deterministic render manifest contract includes ordered node/edge geometry and industrial style tokens.
- Golden snapshot artifacts for render manifest are CI-guarded (determinism + permutation invariance).
- Regression tests fail on geometry/style drift unless baseline update is explicit.

### 3.0.2 CI Guard Hardening — identyfikatory connection node (current)

Objective: Ujednolicenie detekcji identyfikatorów `connection node` w URL nawigacji i resolverze inspektora bez duplikowania logiki.

Progress:
- [x] Wydzielenie wspólnej funkcji `isConnectionNodeLikeId` (`frontend/src/ui/common/connectionNode.ts`).
- [x] Podpięcie funkcji w `urlState.ts` i `selectionResolver.ts` (jeden kontrakt filtrowania selekcji).
- [x] Testy regresyjne i jednostkowe frontend przechodzą (`connectionNode.test.ts` + istniejące testy unity/resolver).


### 3.0.3 Ścieżka krytyczna E2E — skan i domknięcie bramek (current)

Zakres skanu: `operacja domenowa -> Snapshot -> SLD -> gotowość -> fix actions -> bramka analiz -> wyniki`.

Status ogniw:
- **Kompletne**
  - Operacja domenowa -> odpowiedź `DomainOpResponseV1` z `snapshot/logical_views/readiness/fix_actions` (`frontend/src/ui/topology/snapshotStore.ts`, `frontend/src/ui/topology/domainApi.ts`).
  - Snapshot -> render SLD (SLD odświeżane po update store; brak lokalnego grafu topologii jako źródła prawdy).
  - Gotowość z backendu materializowana w store i panelach (`snapshotStore`, `ReadinessPanel`).
- **Częściowe**
  - Bramka uruchamiania analiz była oparta tylko o aktywny case/mode/status i pomijała `readiness`.
  - Globalny przycisk obliczeń w `App.tsx` był atrapą (TODO, brak realnego uruchomienia run).
- **Rozłączone**
  - UI miało poprawny store wykonania run (`ui/study-cases/runStore.ts`), ale root callback `onCalculate` nie korzystał z niego.
- **Dublowane lokalnym stanem**
  - Historyczne wrappery `useCanCalculate` w `study-cases/store.ts` i `study-cases/modeGating.ts` zostały usunięte; pozostała jedna kanoniczna ścieżka `ui/app-state/store.ts` oparta o `snapshotStore.readiness`.

Wdrożone domknięcia:
- [x] `useCanCalculate()` (app-state) blokuje obliczenia przy `readiness.ready=false` z komunikatem backendowym.
- [x] `App.tsx` uruchamia realny flow `createAndExecuteRun(...)` zamiast TODO/no-op.
- [x] ENM `delete_element` domknięto o kasowanie osieroconych `branch_points` oraz kaskadę `substations/bays` dla skasowanego `bus/transformer` (spójność z kontraktami modeli Pydantic i deterministyczny `deleted_element_ids`).
- [x] Po uruchomieniu run ustawiany jest `activeRunId` i nawigacja do widoku wyników.
- [x] Dokumentacja uruchomienia backendu rozszerzona o powtarzalny bootstrap środowiska (poetry + test importów).
- [x] Usunięcie duplikatów bramki `useCanCalculate` (study-cases/* nie eksportuje już historycznych wrapperów).
- [x] Dodany skrypt `npm run test:e2e:setup` + CI smoke rozszerzone o `critical-run-flow.spec.ts` (detekcja lokalnej przeglądarki + fallback APT + wsparcie `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`).
- [x] Browser E2E krytycznej ścieżki przepięte na realny backend (`e2e/critical-run-flow.spec.ts`) — bez `page.route` i bez atrap API.
- [x] Dodano twardy scenariusz E2E real-backend dla elastycznej kolejności (`e2e/sld-editor-real-backend-flex.spec.ts`) oraz domknięto inspektor segmentu (readiness, fix_actions, katalog, write-path ENM_OP).
- [x] Ujednolicono real-backend E2E z kanonicznym katalogiem (`cable-tfk-yakxs-3x120`, `tr-sn-nn-15-04-630kva-dyn11`) oraz usunięto `Date.now()` z kluczy idempotencji w `e2e/critical-run-flow.spec.ts`.

### 3.0.4 SLD industrial readability tuning (completed)

Zakres zakończony:
- [x] Wzmocnienie czytelności toru głównego: większa koperta GPZ, dedykowany lewy gutter informacyjny, szersze moduły pól SN, korekta pozycjonowania etykiet segmentów i węzłów (`TrunkSpineRenderer.tsx`).
- [x] Powiększenie i rebalans odgałęzień: większa ramka pola odgałęźnego, dłuższy przebieg linii odgałęźnej, korekta pozycji etykiet i bąbla zabezpieczeniowego (`BranchRenderer.tsx`).
- [x] Aktualizacja testu deterministycznego `fitToContent` do aktualnego kontraktu geometrii viewportu (`fitToContent.test.ts`).



### 3.0.6a SLD: logical_views jako kanoniczna segmentacja trunk/branch/ring (completed)

Zakres zakończony:
- [x] Rozszerzono `TopologyInputV1` o strukturę `logicalViews` (trunks/branches/rings) oraz mapowanie z `snapshot.logical_views` w `readTopologyFromENM`.
- [x] `TopologyAdapterV2.segmentTopology()` używa jawnych segmentów z `logicalViews` jako pierwszego źródła klasyfikacji (`TRUNK`/`BRANCH`/`SECONDARY_CONNECTOR`) i dopiero przy braku danych wraca do deterministycznego BFS fallback.
- [x] Dodano test regresyjny wymuszający priorytet `logicalViews` nad heurystyką segmentacji w `topologyAdapterV2.test.ts`.
- [x] Zaktualizowano dokument kanoniczny SLD o regułę „logical_views first”.

### 3.0.6b SLD: model właściwy kontraktu topologii wizualnej (completed)

Zakres zakończony:
- [x] Dodano `VisualTopologyContractV1` jako jawny kontrakt wyjściowy adaptera z klasami: GPZ, szyna SN, pole SN, trunk, branch, punkt rozgałęzienia, stacja, ring, NOP.
- [x] `buildVisualGraphFromTopology()` zwraca `visualTopology` obok `graph` i `stationBlockDetails`, więc aktywny pipeline ma formalny model semantyczny (nie tylko klasyfikację krawędzi).
- [x] Rola stacji (`koncowa`/`przelotowa`/`odgalezna`/`sekcyjna`) jest wyprowadzana z embeddingu stacji i materializowana do kontraktu wizualnego.
- [x] Ring/NOP są modelowane jawnie (`RingConnectorVisual`, `NopVisual`) i utrzymują powiązanie z `domainElementId` dla selekcji/inspektora.
- [x] Dodano testy regresyjne kontraktu semantycznego i deterministycznego 100x.


### 3.0.6c SLD: domknięcie kontraktu semantycznego w artefaktach renderu (completed)

Zakres zakończony:
- [x] Wzmocniono `VisualTopologyContractV1`: segmenty trunk/branch/ring/NOP obejmują wyłącznie klasy liniowe SN (bez TR_LINK/BUS_LINK).
- [x] Scenariusze referencyjne (`leaf/pass/branch/ring`) materializują jawne `logicalViews`, aby aktywna ścieżka testowa nie opierała się na fallbacku BFS.
- [x] `SldRenderManifest` otrzymał opcjonalne `visualTopologySummary` zliczające klasy bytów (GPZ/szyny/pola/trunk/branch/stacje/ringi/NOP) dla audytu semantyka↔render.
- [x] Zaktualizowano golden snapshoty manifestu i testy regresyjne.


### 3.0.6d SLD: twarda reguła geometrii GPZ (completed)

Zakres zakończony:
- [x] Wymuszono globalnie kanon orientacji SN/GPZ w silniku topologicznym: szyna GPZ pozioma, odejścia pionowo w dół (także przy żądaniu `left-right`).
- [x] Dodano regresyjny test w `layoutPipeline.test.ts` potwierdzający poziomą szynę GPZ i pionowy start odejść trunk.
- [x] Zaktualizowano test orientacji `topologicalLayout.test.ts` do kanonicznego mapowania `left-right -> top-down` dla SN.

### 3.0.7 SLD: wydzielenie LayoutEngine V2 + routing A* (completed)

Zakres zakończony:
- [x] Dodano nowy moduł `frontend/src/ui/sld/core/layoutEngine.ts` (strategie `legacy/greedy/force-directed`, routing `orthogonal/diagonal`, A* obstacle routing, auto-reflow kolizji, plan warstw i etykiet).
- [x] `layoutPipeline.ts` refactor: poprzedni pipeline dostępny jako `computeLegacyLayout()`, a publiczny `computeLayout()` deleguje do `LayoutEngine` z domyślną strategią `legacy` (kompatybilność wsteczna).
- [x] Rozszerzono API eksportów core (`index.ts`) o `LayoutEngine`, typy opcji i helper `createLayoutEngine`.
- [x] Dodano testy jednostkowe `layoutEngine.test.ts` (delegacja legacy, greedy spacing, deterministyczny force-directed, orthogonal/diagonal routing).
- [x] Dodano dokumentację modułu: `docs/sld/SLD_LAYOUT_ENGINE_REFACTOR_V2.md`.

### 3.0.8 SLD: domknięcie kontraktów semantyka→layout (completed)

Zakres zakończony:
- [x] Dodano kanoniczny kontrakt semantyczny `SldSemanticGraphV1` (normalizacja stationKind/generatorKind, jawne kontenery, brak geometrii portów).
- [x] Dodano kanoniczny kontrakt wejścia layoutu `LayoutInputGraphV1` (symbolProfile/portGeometry i constraints tylko w warstwie layoutu).
- [x] `computeLayout()` przepięto na pipeline: `VisualGraph(legacy) -> SldSemanticGraphV1 -> LayoutInputGraphV1 -> LayoutEngine`.
- [x] `LayoutEngine` konsumuje `LayoutInputGraphV1`; `computeLegacyLayout()` utrzymane jako cienka warstwa zgodności przez bridge `LayoutInputGraphV1 -> VisualGraphV1`.
- [x] `VisualGraphV1` zdegradowano do statusu legacy (usunięto fałszywy komentarz o jedynym źródle prawdy).
- [x] Dodano testy kontraktu semantycznego i transformacji semantyka→layout (deterministyczność 100x).
- [x] Uzupełniono dokumentację: `SLD_SEMANTIC_MODEL_CANONICAL_V1.md` + `SLD_CONTRACT_FLOW_V1.md`.

### 3.0.9 Symphony orchestration baseline (completed)

Zakres zakończony:
- [x] Dodano nowy moduł `application/symphony` z kanonicznymi komponentami: loader `WORKFLOW.md`, typed config, modele domenowe, manager workspace, renderer promptu i orchestrator poll/retry/reconcile.
- [x] Dodano kontrakty integracyjne (`IssueTrackerClient`, `AgentRunner`) dla adaptera tracker/runner zgodnie z granicami specyfikacji Symphony.
- [x] Dodano testy jednostkowe pokrywające parse workflow/config, bezpieczeństwo workspace i logikę dispatch/retry/blockers/concurrency.


### 3.0.5 Hotfix CI TypeScript — referenceTopologies (completed)

Zakres zakończony:
- [x] Usunięto mutacje `push(...)` na kolekcjach `readonly` w `referenceTopologies.ts` (budowa scenariuszy `branch` i `ring` przez niemutowalne złożenie tablic).
- [x] Usunięto odwołanie do legacy pola `stationBlockBuildResult`; scenariusze referencyjne korzystają z kanonicznego pola `stationBlockDetails` z `AdapterResultV1`.
- [x] Potwierdzono zielone: `npm run type-check`, zestaw testów SLD kontrakt/determinizm oraz real-backend E2E krytycznej ścieżki.

### 3.1 Docs Sync to Spec Canon (current)

Objective: Synchronize all repo documentation entrypoints with `docs/spec/` (18 chapters) as the source of truth.

Tasks:
- [x] Full repo scan (RECON)
- [x] Document chaos detection (20 inconsistencies identified)
- [x] Rewrite AGENTS.md (clean governance)
- [x] Rewrite SYSTEM_SPEC.md (executive overview + navigation to 18 spec chapters)
- [x] Rewrite ARCHITECTURE.md (spec chapter references in every section)
- [x] Rewrite PLANS.md (this file)
- [x] Sync README.md (root + mv-design-pro) — removed prohibited terms, fixed paths, added spec links
- [x] Sync docs/INDEX.md — added spec chapter table, fixed broken links
- [x] Add docs_guard.py CI guard (PCC + broken link check)
- [x] Clean remaining duplicate docs in docs/ outside docs/spec/
- [x] Mark/move deprecated notes and operational files
- [x] Add reusable Polish master prompt for full-repo architecture audit (`docs/prompts/FULL_REPO_AUDIT_PROMPT_PL.md`)

### 3.2 SLD/CAD Canonical Rebuild — Recon + Docs Cleanup + Deterministic ENM_OP keys (current)

Objective: Domknięcie fazy RECON/AUDYT dokumentacji oraz usunięcie niedeterministycznych fallbacków `Date.now()` z kluczy idempotencji ENM_OP w ścieżce SLD.

Progress:
- [x] Full RECON obszaru SLD/CAD/UI/domena/layout/routing/inspector + klasyfikacja dokumentów.
- [x] Dodane dokumenty kanoniczne etapu:
  - `docs/AUDYT_DOKUMENTACJI_I_PLANOW_REPO.md`
  - `docs/MAPA_MIGRACJI_DOKUMENTOW_I_PLANOW.md`
  - `docs/INDEX_KANONICZNY.md`
- [x] Usunięte równoległe roadmapy (`docs/ROADMAP.md`, `docs/audit/ROADMAP.md`) na rzecz jednego planu `PLANS.md`.
- [x] Wzmocniono deterministyczność ENM_OP:
  - `frontend/src/ui/sld/domainOpsClient.ts` używa deterministycznego `buildDeterministicIdempotencyKey(...)`.
  - `frontend/src/ui/sld/useEnmStore.ts` korzysta z tego samego generatora.
- [x] Dodane testy regresyjne klucza idempotencji (`frontend/src/ui/sld/__tests__/domainOpsClient.test.ts`).
- [x] Korekta mapowania narzędzia `delete_element` w palecie SLD: `canonicalOp` ustawione na `delete_element` + test regresyjny kontrolera interakcji.

---

### 3.3 SLD CAD/SCADA Rebuild — PR-0..PR-7 dostarczone, PR-8..PR-16 w toku

**Branch:** `claude/sld-architecture-redesign-ufa8Q`
**Plan main:** `/root/.claude/plans/jeste-uruchomionym-jednocze-nie-zespo-em-peaceful-snowglobe.md` (17 PR-ów)

**Dostarczone w bieżącej sesji (9 commitów):**

| PR | Commit | Zakres |
|---|---|---|
| **PR-0** | `ec395ae` | audit + 8 docs kanon + formatPolishValue + zakaz 0.00 + no-zero-spam guard |
| **PR-1** | `25ef103` | migracja `(value ?? 0).toFixed` antypatternu (12 violations w `WizardPage.tsx`); audit doc Stacja+DER; rozszerzony no-zero-spam guard (4 → 17 katalogów UI) |
| **PR-2** | `165d577` | UI terminology guard rebrief: 132 migracje stringów UI + 12 zakazanych tokenów (migawka/uruchomienie/przypadek/proof/run/snapshot/feeder/branch/case/wizard/fallback/legacy) z polskimi zamiennikami |
| **PR-3** | `5e6b880` | ENM Port + ConnectionNode + LineRun + CableJoint + 10 BayTemplate + 9 StationTemplate + multi-voltage nN + automigracja v_ports_001 (idempotentna, deterministyczna) |
| **PR-4** | `fc37351` | SLD v2 PortResolver: 15 PortKind contract z parity test ENM ↔ frontend, classifyStationTopology, validatePortVoltages, canConnectPorts (14 reguł), isPortKindCompatibleWithBayRole |
| **PR-5 (cz. I)** | `60fe605` | v2 fundamenty: theme tokens (22 kolory dark SCADA), geometry/slot.ts (slot allocator hierarchiczny), geometry/routing.ts (ortogonalne L-shape, brak A*), domain/HierarchyTree.ts (adapter ENM), builder/BuildSequence.ts (8 kanonicznych komend), builder/HierarchicalLayout.ts (deterministic + przyrostowy, FNV-1a hash), viewport/ViewportController.ts (kursor-anchored zoom), lod/LodPolicy.ts (5 LOD + 13 warstw) — 81 testów green |
| **PR-5 (cz. II)** | `4f1a8a0` | v2 renderery: 7 dedykowanych rendererów per typ (Gpz, Section, Bay, Device, CableRun, StationOnRun, Der + Connection), SldCanvasV2 composition root z pan/zoom/auto-fit/LOD inference/layer toggle — 24 testy renderers, 105 testów total v2 |
| **PR-6** | `d8614db` | Wewnętrzny SLD stacji: backend topology_classifier + internal_layout (InternalSldDTO, multi-voltage nN, 4 typy topologiczne wnioskowane z portów), frontend StationInternalView z szyną SN + polami + transformatorami + rozdzielnicami nN — 19 testów (14 backend + 5 frontend) |
| **PR-7** | `a769f4d` | InspectorTabs v2 (11 zakładek: Podstawowe/SLD/Topologia/Aparatura/Dane elektryczne/Zabezpieczenia/Pomiary/Obliczenia/Braki danych/Raport/Techniczne) + StickyHeader (status kompletności/zasilania/obliczeń + quick actions) + Breadcrumb dwukierunkowy — 23 testy |

**Pozostałe PR-y (PR-8..PR-16, ~110 osobodni):**

Plan obejmuje 12 kolejnych PR-ów z explicit scope-em w pliku planu:

- **PR-5** (~30 osobodni × 2 osoby = ~60 OD): Konstruktywny hierarchiczny builder, wygaszenie ~12 996 linii (engine/sld-layout phase 1-5 + Sugiyama + A* + ELK + 7 starych rendererów + sldCanonicalStyle + IndustrialAesthetics), 7 nowych dedykowanych rendererów, Scenariusze D/E/F.
- **PR-6** (~16 OD): Wewnętrzny SLD stacji + 4 typy topologiczne + tryb mieszany inline expansion.
- **PR-7** (~8 OD): InspectorTabs (11 zakładek) + sticky header + breadcrumb dwukierunkowy + sync paneli + command feedback toasty.
- **PR-8a/8b** (~15 OD): Konfigurator stacji 10 kart + Konfigurator pola SN 8 sekcji.
- **PR-9/10/11** (~20 OD): Konfiguratory PV / BESS / FW (po 7 / 7 / 6 kart) + 5 profili NC RfG + 12 turbin wiatrowych w katalogu.
- **PR-12** (~12 OD): CalculationReadinessService (9 typów obliczeń) + ValidationProblemService + ReportReadinessAdapter.
- **PR-13** (~7 OD): BuildSidebar (4 sekcje) + SldCommandService + 8 brakujących symboli SVG.
- **PR-14** (~8 OD): LOD policy v2 + 13 warstw + 15 visual fixtures × 4 LOD = 60 snapshotów + wygaszenie starego SLD.
- **PR-15** (~42 OD): Solver stabilności dynamicznej RMS — Newton-Raphson dynamic + modele synchronous/induction/inverter/AVR/governor/PSS/wind/PV/BESS.
- **PR-16** (~18 OD): Solver FRT/HVRT RMS time-domain + NC RfG compliance testbench (18 testów).

**Status egzekucji:**

PR-0..PR-4 stanowią **fundament merge-ready** rebuild-u: wszystkie inwarianty kanoniczne (zakaz 0.00, polish UI, 12 zakazanych tokenów wyeliminowanych), domena ENM rozszerzona o porty/connection nodes/line runs/cable joints + automigracja, frontend port contract + walidatory. Pozostałe PR-y to rdzeń rebuild-u i wymagają znacznego nakładu pracy (~170 osobodni / ~3-4 miesiące zespołu 2-3 osób). Plan dokumentuje pełne scope każdego z PR-ów (`/root/.claude/plans/...md`) i jest przygotowany do kontynuacji w kolejnych sesjach.

**Walidacja kumulatywna PR-0..PR-7:**

- Backend: 4421+ testów green (zero regresji), ENM 458 + 46 PR-3 + 14 PR-6 = 518 PR-relevant testów green.
- Frontend: 491+ testów green (zero regresji), nowe 30 PR-0 + 29 PR-4 + 81 PR-5 (cz.I) + 24 PR-5 (cz.II) + 5 PR-6 + 23 PR-7 = 192 PR-relevant testów green.
- Guards: pcc_zero / no_codenames / ui_terminology (132 violations zlikwidowane) / docs / sld_determinism — wszystkie zielone.
- Type-check + lint: green.

Następne PR-y (PR-5..PR-16) — patrz pełen plan `/root/.claude/plans/jeste-uruchomionym-jednocze-nie-zespo-em-peaceful-snowglobe.md`.

---

## 4. Next Priorities

### 4.1 HIGH Priority

| Item | Description | Status |
|------|-------------|--------|
| Phase 6: Wizard/SLD Unity | Formal verification that Wizard and SLD operate on same model | DONE |
| NetworkValidator Extension | Full industrial-grade validation rules (13 rules, 29 tests) | DONE |
| Bus Terminology Completion | Finish Node -> Bus rename in all code paths | DONE |
| SC Asymmetrical Proofs | 1F, 2F, 2F-Z fault proof packs (IEC 60909) | DONE |
| Normative Completion Pack (IEC 60909 §4.1) | Domknięcie mapowania norma→dowód + golden proofs + CI gates | DONE |

### 4.2 MEDIUM Priority

| Item | Description | Status |
|------|-------------|--------|
| Regulation Q(U) Proofs | Reactive power regulation proof pack | DONE |
| PR-27: SC ↔ Protection Bridge | Current source resolution (TEST_POINTS / SC_RESULT), FixActions | DONE |
| PR-28: Coordination v1 | Selectivity margins (explicit pairs, numbers only) | DONE |
| PR-29: Topology Links | Unified relay↔CB↔target_ref IDs (optional) | DONE |
| PR-30: Protection SLD Overlay Pro | Token-only overlay (t51, margins) | DONE |
| PR-31: Protection Report Model | Export-ready data model (PDF/DOCX) | DONE |
| PR-32: Governance & Determinism Guards | Solver diff-guard, schema guard, no-heuristics guard | DONE |
| Frontend Test Coverage | Increase Vitest + Playwright coverage | DONE |
| CI Pipeline Enhancement | Add frontend type-check and lint to CI | DONE |

### 4.3 LOW Priority

| Item | Description | Status |
|------|-------------|--------|
| XLSX Network Importer | Import from spreadsheet (ADR-009) | DONE |
| Cloud Backup Integration | S3/GCS integration | DONE |
| Incremental Archive Export | Delta export | DONE |
| Archive Diff | Compare two project archives | DONE |

---

## 5. Technical Debt

| Issue | Severity | Description |
|-------|----------|-------------|
| Node/Bus terminology | RESOLVED | DTOs, API, frontend types renamed with backward-compat aliases |
| Stale root-level docs | RESOLVED | AUDIT.md, P13B_SUMMARY.md, AUDIT_PCC_REMOVAL.md marked DEPRECATED |
| Duplicate DOCS_INDEX.md | RESOLVED | Deleted (superseded by docs/INDEX.md) |
| Duplicate UI contract docs | LOW | Some contracts exist in both `docs/ui/` and root `docs/ui/` |
| Large test fixtures | LOW | Some test files contain large inline fixtures |
| ADR numbering conflicts | LOW | ADR-002, ADR-003, ADR-006, ADR-007, ADR-008 have duplicate numbers |
| Historical ExecPlans | LOW | 16 old ExecPlans in `docs/audit/historical_execplans/` should be archived |

---

## 6. Architecture Risks

| Risk | Mitigation |
|------|------------|
| Shadow data stores | Enforced by Single Model Rule + code review |
| Physics leaking into non-solver layers | NOT-A-SOLVER rule + test guards + arch_guard.py |
| Protection heuristics/auto-selection | protection_no_heuristics_guard.py (PR-32, DONE) |
| SC solver modification by Protection PRs | solver_diff_guard.py (PR-32, DONE) |
| SC ResultSet v1 drift | resultset_v1_schema_guard.py (PR-32, DONE) |
| Result API drift | Frozen API rule + version bump requirement |
| Proof determinism regression | SHA-256 fingerprint tests |
| UI codename leaks | `no_codenames_guard.py` script |
| Documentation drift | `docs_guard.py` — PCC prohibition + broken link check in entrypoints |

---

## 7. Canonical Documentation

| Document | Location | Status |
|----------|----------|--------|
| Detailed Specification (18 chapters) | [`docs/spec/SPEC_CHAPTER_*.md`](docs/spec/) | SOURCE OF TRUTH |
| Spec-vs-Code Audit | [`docs/spec/AUDIT_SPEC_VS_CODE.md`](docs/spec/AUDIT_SPEC_VS_CODE.md) | BINDING |
| Spec Expansion Plan | [`docs/spec/SPEC_EXPANSION_PLAN.md`](docs/spec/SPEC_EXPANSION_PLAN.md) | REFERENCE |
| System Spec (overview) | [`SYSTEM_SPEC.md`](SYSTEM_SPEC.md) | BINDING |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) | BINDING |
| Agent Governance | [`AGENTS.md`](AGENTS.md) | BINDING |
| Documentation Index | [`docs/INDEX.md`](docs/INDEX.md) | REFERENCE |

## 8. Historical ExecPlans

All historical ExecPlans (01-16) are archived in `docs/audit/historical_execplans/`.
They document the evolution of the project but are NOT part of the canonical plan.
Current truth: this PLANS.md document.

---

**END OF OPERATIONAL PLAN**


### 3.0.4 SLD Reset — canonical cutover

- [x] Wyłączono dane demo w głównym widoku SLD (`App.tsx` -> `SldEditorPage useDemo={false}`).
- [x] Spis inwentaryzacyjny starego/nowego pipeline i kanonicznego cutover: `docs/SLD_RESET_CANONICAL.md`.
- [x] Krytyczny browser E2E działa na realnym backendzie i potwierdza brak mutacji snapshot hash po run/results.

### 3.0.5 SLD proof package — 4 referencyjne sieci w głównej ścieżce

- [x] `#sld-view` obsługuje query `ref=leaf|pass|branch|ring` i ładuje kanoniczne dane topologiczne bez osobnego ekranu pomocniczego.
- [x] Dodano `referenceTopologies.ts`: jawne dane wejściowe 4 sieci + przejście przez `buildVisualGraphFromTopology` i `computeLayout` (GPZ/trunk/branch/stacja/ring/NOP).
- [x] `SLDView` przekazuje `canonicalAnnotations` do `SLDViewCanvas`, więc warstwa GPZ/trunk/branch/station renderuje się w głównym widoku.
- [x] Dodano test `referenceTopologies.test.ts` (non-empty symbols, annotations, NOP w scenariuszu ring).

### 3.0.6 SLD odbiorowy — skala, czytelność i język polski

- [x] Podniesiono minimalny zoom dopasowania dla scenariuszy referencyjnych (`#sld-view?ref=*`), aby wyeliminować miniaturyzację schematu.
- [x] Wzmocniono wizualnie GPZ/magistralę/odgałęzienia/stację (większy blok GPZ, mocniejsza oś pionowa, większa ramka stacji, czytelniejsze etykiety).
- [x] Ujednolicono etykiety scenariuszy referencyjnych do języka polskiego (bez anglicyzmów użytkowych).
- [x] Dodano testy jakości widoku: minimalna skala, wykorzystanie obszaru, brak mikrotekstu, brak anglicyzmów.
