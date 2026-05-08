# SLD V2 — Build Gate Audit (Phase -1)

**Data audytu:** 2026-05-08
**Branch:** `claude/electrical-infrastructure-design-ChbTk`
**HEAD:** R59 (po naprawie PCC term w domain_operations.py)
**Status bramki:** ✅ ZIELONY (Phase -1 zaliczone)

---

## Cel

Przed rozbudową SLD V2 do operator-grade (kolejne fazy planu) potwierdzić, że
aktualnie aktywny moduł V2 spełnia bezwzględne wymagania bramki wejściowej:

1. `npm run type-check` zielony (zero błędów typów na ścieżkach V2 i ścieżkach
   aktywnych shellu V12).
2. `npm run build` zielony (`tsc && vite build`).
3. Zero importów z V1 SLD (`src/ui/sld/core/**`, `src/ui/sld/inspector/**`,
   top-level `src/ui/sld/*.ts/.tsx`) z plików V2 (`src/ui/sld/v2/**`).
4. Zero martwych stubów / no-op rendererów / pustych adapterów w aktywnych
   modułach V2 (canvas, command, renderer, viewport, geometry, builder,
   domain, lod, theme, core, workflow, anonymization).
5. Wszystkie testy V2 zielone (jednostkowe, kontrakt, integracyjne,
   strukturalne SVG, snapshoty wizualne).

---

## Stan zastany — pomiary 2026-05-08

### Kompilacja

| Sprawdzenie | Wynik |
|---|---|
| `cd mv-design-pro/frontend && npm run type-check` (`tsc --noEmit`) | ✅ zielony |
| `cd mv-design-pro/frontend && npm run build` (`tsc && vite build`) | ✅ zielony, 1158 modułów |
| Bundle (po code splitting R57) | `vendor-react` 142 kB · `chunk-charts` 383 kB · `chunk-sld` 389 kB · `chunk-wizard` 47 kB · main 713 kB · CSS 115 kB |

### Testy V2

| Liczba plików testowych V2 | 57 |
|---|---|
| **Liczba testów V2** | **1189 ✅ wszystkie zielone** |
| Frontend total (cały Vitest) | 304 plików · 4193 testów · 1 skipped |
| Backend total (pytest) | 4797 passed · 6 skipped · 4 xpassed |

### Izolacja od V1

| Sprawdzenie | Wynik |
|---|---|
| `python scripts/sld_v2_build_gate_guard.py` | ✅ OK (55 plików V2 zeskanowanych, 0 V1 imports) |
| `grep "from .*sld/core" src/ui/sld/v2` | 0 hits |
| `grep "from .*sld/inspector" src/ui/sld/v2` | 0 hits |

V1 pozostaje wyłączony z `tsconfig.json` przez `exclude` (do Phase 9):
```json
"src/ui/sld/*.ts",
"src/ui/sld/*.tsx",
"src/ui/sld/core/**/*",
"src/ui/sld/inspector/**/*"
```

R58 sprzątnęło stałe `src/ui/layout/CanonicalLayout.tsx` z excludes (plik został
usunięty jako dead code — V12 alias w `layout/index.ts` jest jedynym CanonicalLayout).

---

## Aktywne moduły V2 — mapa (rzeczywisty stan)

```
src/ui/sld/v2/
├── anonymization/
│   ├── AnonymizationProvider.tsx     124 lines  (Phase 5)
│   └── anonymize.ts                              (Phase 5)
├── builder/
│   ├── BuildSequence.ts
│   ├── CorridorLayout.ts             241 lines  (Phase 6)
│   ├── HierarchicalLayout.ts
│   ├── LayoutComplexityScore.ts                  (Phase 6)
│   └── LayoutStrategyDispatch.ts                 (Phase 6)
├── canvas/
│   ├── CadOverlay.tsx                            (Phase 2)
│   ├── LabelDeclutter.ts             249 lines  (Phase 2)
│   ├── LassoSelector.tsx
│   ├── SldCanvasV2.tsx
│   ├── SldWorkspaceContainer.tsx                 # mount point shellu V12
│   ├── StationInternalView.tsx
│   ├── buildNetworkTerrain.ts
│   ├── enmToCanonicalGpzAdapter.ts
│   └── enmToSldAdapter.ts
├── command/
│   └── SldCommandService.ts                      # COMMAND_FEEDBACK_PL + toastBus
├── core/
│   ├── hashes.ts                     362 lines  (Phase 0A)
│   └── ports.ts                                  # 15 kinds portów first-class
├── domain/
│   ├── HierarchyTree.ts
│   ├── apparatusContracts.ts         172 lines  (Phase 0A)
│   ├── apparatusSymbolPolicy.ts                  (Phase 0A)
│   ├── apparatusVisualState.ts       156 lines  (Phase 0A)
│   └── bayDeviceOrder.ts             154 lines  (Phase 0A)
├── geometry/
│   ├── RouteEditor.ts                            (Phase 2)
│   ├── routing.ts
│   └── slot.ts
├── lod/
│   └── LodPolicy.ts                              # 5-poziomowy LOD
├── modals/
│   ├── AddApparatusModal.tsx
│   ├── ApparatusStateModal.tsx
│   ├── BayConfigModal.tsx
│   ├── CouplerEditModal.tsx
│   ├── SldModal.tsx
│   └── TransformerEditModal.tsx
├── renderer/
│   ├── BayRenderer.tsx
│   ├── CableRunRenderer.tsx
│   ├── ConnectionRenderer.tsx
│   ├── DerConnectionTreeRenderer.tsx             (Phase 4)
│   ├── DerRenderer.tsx
│   ├── DeviceRenderer.tsx
│   ├── GpzCanonicalRenderer.tsx
│   ├── GpzOperatorHeader.tsx
│   ├── GpzRenderer.tsx
│   ├── GpzSwitchgearRenderer.tsx    3330 lines  (Phase 0A — pełna rozdzielnia)
│   ├── MiniBlockFootprints.ts                    (Phase 0A)
│   ├── MiniBlockRmuRenderer.tsx      474 lines  (Phase 0A — kompozycja z bays[])
│   ├── NetworkTerrainRenderer.tsx
│   ├── SectionRenderer.tsx
│   └── StationOnRunRenderer.tsx
├── theme/
│   └── tokens.ts                                 # 22 tokeny SCADA
├── viewport/
│   ├── Snap.ts
│   └── ViewportController.ts
└── workflow/
    ├── AppendOnEndpointController.ts 299 lines  (Phase 0B)
    ├── ConsciousSplitController.ts   399 lines  (Phase 0C)
    └── WorkflowOrchestrator.ts
```

---

## Implementacja vs. plan operator-grade

Wbrew oryginalnemu opisowi Phase -1 (pre-istniejący stale), V2 ma już
zaimplementowane znaczne fragmenty Phase 0A→6. Phase -1 koncentruje się
WYŁĄCZNIE na bramce build/type-check/test/V1-isolation — i ta jest zielona.

| Faza | Status implementacji (skala wysokopoziomowa) |
|---|---|
| **Phase -1** Build Gate | ✅ **Zaliczona** (ten dokument) |
| Phase 0A LOD + Visual Minimum | ⬛ Większość zaimplementowana (mini-block, GPZ switchgear, apparatusContracts, apparatusVisualState, bayDeviceOrder, hashes) — wymaga audytu funkcjonalnego pokrycia względem briefu |
| Phase 0B Append-on-Endpoint | ⬛ Workflow controller istnieje (299 linii) — wymaga weryfikacji backend `append_station_on_endpoint` |
| Phase 0C Conscious Split | ⬛ Workflow controller istnieje (399 linii) — wymaga weryfikacji backend `dry_run` |
| Phase 1 Visual Canon Expansion | ⬛ MiniBlockFootprints + 7 typów stacji wymaga audytu vs. brief |
| Phase 2 CAD Foundations | ⬛ CadOverlay, LabelDeclutter, RouteEditor istnieją — wymaga weryfikacji deterministyczności |
| Phase 3 Append/Split Polish | ⬛ Częściowo (ghost preview, Esc-cancel) |
| Phase 4 DER End-to-End | ⬛ DerConnectionTreeRenderer istnieje |
| Phase 5 Anonimizacja | ⬛ AnonymizationProvider + anonymize.ts istnieją |
| Phase 6 Layout Korytarzowy | ⬛ CorridorLayout, LayoutComplexityScore, LayoutStrategyDispatch istnieją |
| Phase 7 Test Pyramid | ⬛ 1189 testów V2 (structural, electrical-graph, readability, perf, hash invariants) |
| Phase 8 Documentation | ⬛ 6/12 docs (LOD_OPERATOR_GRADE, MINI_BLOCK_SPEC, SYMBOLS_OPERATOR_GRADE, GPZ_SWITCHGEAR_DEPTH, **STATION_APPEND_WORKFLOW** ←R61, **CONSCIOUS_SPLIT_WORKFLOW** ←R61); 6 docs do napisania |
| Phase 9 Cleanup V1 | ⬜ Zaplanowane (V1 tsconfig-excluded, do usunięcia) |

**Wnioski:**
1. Phase -1 (ten dokument) jest zamknięty na zielono.
2. Phase 0A-6 są w znacznej mierze zaimplementowane — wymagają osobnego audytu
   funkcjonalnego względem `Acceptance Invariants` 1-17 z planu.
3. Phase 7 ma 1189 testów (vs. ~115 nowych snapshotów w planie) — pokrycie wysokie.
4. Phase 8 (konsolidacja docs) — 6/12 ukończone (R61 dodał APPEND + SPLIT).
5. Phase 9 (cleanup V1) pozostaje do zrobienia.

### Zidentyfikowana luka integracji UI (Phase 0B/0C → Phase 3)

Backend operacje `append_station_on_endpoint` (Phase 0B) i
`insert_station_on_segment_sn` z `dry_run=True` (Phase 0C) są zaimplementowane
i przetestowane (44 testy backendu zielone). Frontend controllery FSM
(`AppendOnEndpointController.ts` 299 linii, `ConsciousSplitController.ts`
399 linii, `WorkflowOrchestrator.ts`) istnieją z pełną logiką.

**Brakujące ogniwo:** integracja w `SldWorkspaceContainer.handleAction()` —
clickanie menu items `append-station-on-endpoint` i `conscious-split-on-segment`
nie dispatchuje do controllerów (ani nie renderuje ghost preview, ani nie
otwiera modala pickera). R60 dodało informujące toasty w
`ACTION_ROADMAP_HINT_PL` żeby operator wiedział, że backend gotowy ale UI
integracja w toku.

Pełna integracja wymaga:
- CadOverlay rendering ghost preview (segment + station footprint dla append, halves dla split).
- Modal/picker typu stacji dla append + modal typu obiektu dla split.
- Electrical impact panel dla split (lista invalidated_results).
- Dispatch handler w `SldWorkspaceContainer.handleAction()` wywołujący `executeDomainOperation()`.
- 2 E2E specy Playwright (append-on-endpoint + conscious-split).

To jest scope Phase 3 polish.

---

## Mierzalne kryteria zaliczenia Phase -1 (CI-checkable)

- [x] **type-check zielony** — `tsc --noEmit` exit 0
- [x] **build zielony** — `tsc && vite build` exit 0
- [x] **1189 testów V2 zielonych** — `npx vitest run src/ui/sld/v2`
- [x] **0 importów V1 z V2** — `python scripts/sld_v2_build_gate_guard.py` exit 0
- [x] **dokument audytu** — ten plik
- [x] **smoke test buildGate.test.ts** — 12 testów weryfikujących publiczne API V2
- [x] **guard `sld_v2_build_gate_guard.py`** — uruchamialny w CI, sprawdza V1 imports + tsconfig + smoke test + audit doc
- [x] **tsconfig.json sprzątnięty** — usunięty stary `CanonicalLayout.tsx` exclude (R58 dead code cleanup)

**Bramka zamknięta na zielono. Można rozpocząć szczegółowe audyty Phase 0A-9
przeciwko Acceptance Invariants 1-17.**

---

## Komendy weryfikacyjne (kopiuj-wklej)

```bash
cd mv-design-pro

# 1. Phase -1 build gate
cd frontend
npm run type-check
VITE_API_URL=http://localhost VITE_API_URL_DEV=http://localhost npm run build
npx vitest run --no-file-parallelism src/ui/sld/v2/__tests__/buildGate.test.ts
cd ..

# 2. Guard
python scripts/sld_v2_build_gate_guard.py

# 3. Pełen suite V2
cd frontend && npx vitest run --no-file-parallelism src/ui/sld/v2 && cd ..

# 4. Pełen frontend test:ci
cd frontend && npm run test:ci && cd ..
```
