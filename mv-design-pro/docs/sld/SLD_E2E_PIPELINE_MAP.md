# SLD E2E Pipeline Map

**Status:** KANONICZNY | **Wersja:** 1.1 | **Data:** 2026-02-13
**Kontekst:** RUN #3A PR-3A-01 + RUN #3C (topology hardening) — Mapa przeplywa danych E2E dla systemu SLD

---

## 1. Diagram przeplywa E2E

```
NetworkModel (backend)
      │
      ▼
┌─────────────────────────────────┐
│  SNAPSHOT                       │
│  NetworkSnapshot (frozen)       │
│  fingerprint: SHA-256           │
│  backend/src/network_model/     │
│    core/snapshot.py             │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│  PROJEKCJA SLD (backend)        │
│  project_snapshot_to_sld()      │
│  backend/src/network_model/     │
│    sld_projection.py            │
│  OUT: SldDiagram(elements)      │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│  ADAPTER NetworkGraph → SLD     │
│  convert_graph_to_sld_payload() │
│  build_sld_from_network_graph() │
│  backend/src/application/sld/   │
│    network_graph_to_sld.py      │
│  OUT: SldDiagram + id_map       │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│  LAYOUT (backend)               │
│  build_auto_layout_diagram()    │
│  backend/src/application/sld/   │
│    layout.py                    │
│  OUT: SldDiagram z pozycjami    │
└─────────────┬───────────────────┘
              │
              ▼ (API REST)
┌─────────────────────────────────┐
│  API ENDPOINT                   │
│  GET /projects/{id}/sld/...     │
│  backend/src/api/sld.py         │
│  OUT: SldDiagramDTO (JSON)      │
└─────────────┬───────────────────┘
              │
              ▼ (HTTP → frontend store)
┌══════════════════════════════════════════════════════════════════════════┐
║                         FRONTEND                                       ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                        ║
║  ┌──────────────────────────────────┐                                  ║
║  │  SLD EDITOR STORE (Zustand)      │                                  ║
║  │  useSldEditorStore               │                                  ║
║  │  frontend/src/ui/sld-editor/     │                                  ║
║  │    SldEditorStore.ts             │                                  ║
║  │  symbols[], selectedIds[]        │                                  ║
║  └──────────────┬───────────────────┘                                  ║
║                 │                                                      ║
║                 ▼                                                      ║
║  ┌────────────────────────────────────────────────────────────────┐    ║
║  │  TOPOLOGY ADAPTER (frontend, Phase 1)                          │    ║
║  │  assignTopologicalRoles(symbols)                               │    ║
║  │  frontend/src/ui/sld-editor/utils/topological-layout/          │    ║
║  │    roleAssigner.ts                                             │    ║
║  │  OUT: RoleAssignment map, feederChains, stationSymbolIds       │    ║
║  │  Buduje wewnetrzny TopologyGraph (nodes, edges, adjacency)     │    ║
║  └──────────────┬─────────────────────────────────────────────────┘    ║
║                 │                                                      ║
║                 ▼                                                      ║
║  ┌────────────────────────────────────────────────────────────────┐    ║
║  │  LAYOUT ENGINE (frontend, Phase 2-4)                           │    ║
║  │  buildGeometricSkeleton(symbols, assignments, chains, ...)     │    ║
║  │  frontend/src/ui/sld-editor/utils/topological-layout/          │    ║
║  │    geometricSkeleton.ts                                        │    ║
║  │  OUT: GeometricSkeleton (positions, busbars, tiers, slots)     │    ║
║  └──────────────┬─────────────────────────────────────────────────┘    ║
║                 │                                                      ║
║                 ├────────────────────────────────────────────┐         ║
║                 │                                            │         ║
║                 ▼                                            ▼         ║
║  ┌─────────────────────────────┐  ┌──────────────────────────────┐    ║
║  │  COLLISION GUARD (Phase 6)  │  │  BUSBAR FEEDER AUTO-LAYOUT   │    ║
║  │  detectSymbolCollisions()   │  │  generateBusbarFeederPaths() │    ║
║  │  resolveSymbolCollisions()  │  │  frontend/src/ui/sld-editor/ │    ║
║  │  frontend/src/ui/sld-editor/│  │    layout-integration/       │    ║
║  │    utils/topological-layout/│  │    busbarFeedersAdapter.ts   │    ║
║  │    collisionGuard.ts        │  │  + computeBusbarAutoLayout   │    ║
║  │  OUT: CollisionReport       │  │  frontend/src/ui/sld/layout/ │    ║
║  └──────────────┬──────────────┘  │    orthogonalPath.ts         │    ║
║                 │                 │  OUT: feeder paths (Position[])│   ║
║                 │                 └──────────────┬───────────────┘    ║
║                 │                                │                     ║
║                 └────────────┬───────────────────┘                     ║
║                              │                                         ║
║                              ▼                                         ║
║  ┌────────────────────────────────────────────────────────────────┐    ║
║  │  ORCHESTRATOR                                                  │    ║
║  │  computeTopologicalLayout(symbols, config, orientation)        │    ║
║  │  frontend/src/ui/sld-editor/utils/topological-layout/          │    ║
║  │    topologicalLayoutEngine.ts                                  │    ║
║  │  OUT: TopologicalLayoutResult (positions, roles, skeleton,     │    ║
║  │       collisionReport, diagnostics)                            │    ║
║  └──────────────┬─────────────────────────────────────────────────┘    ║
║                 │                                                      ║
║                 ▼                                                      ║
║  ┌────────────────────────────────────────────────────────────────┐    ║
║  │  SYMBOL REGISTRY                                               │    ║
║  │  SymbolResolver.ts — mapowanie ElementType → benchmarkSymbolId      │    ║
║  │  frontend/src/ui/sld/SymbolResolver.ts                         │    ║
║  │  + canonical_symbols/*.svg (16 symboli)                             │    ║
║  │  + canonical_symbols/ports.json (porty: x,y w viewBox 0-100)       │    ║
║  └──────────────┬─────────────────────────────────────────────────┘    ║
║                 │                                                      ║
║                 ▼                                                      ║
║  ┌────────────────────────────────────────────────────────────────┐    ║
║  │  CAMERA (ViewportState)                                        │    ║
║  │  { offsetX, offsetY, zoom }                                    │    ║
║  │  frontend/src/ui/sld/types.ts                                  │    ║
║  │  fitToContent() — auto-fit z paddingiem                        │    ║
║  │  ZOOM: 0.25–3.0, krok 0.1                                     │    ║
║  │  PAN: middle-click drag / Shift+drag                           │    ║
║  │  BRAK reflow geometrii przy zmianie zoom/pan                   │    ║
║  └──────────────┬─────────────────────────────────────────────────┘    ║
║                 │                                                      ║
║                 ▼                                                      ║
║  ┌────────────────────────────────────────────────────────────────┐    ║
║  │  RENDERER (thin)                                               │    ║
║  │  SLDViewCanvas.tsx — SVG canvas z energizacja                  │    ║
║  │  UnifiedSymbolRenderer.tsx — renderowanie symboli benchmark         │    ║
║  │  CanonicalSymbolRenderer.tsx — generowanie SVG                      │    ║
║  │  frontend/src/ui/sld/SLDViewCanvas.tsx                         │    ║
║  │  frontend/src/ui/sld/symbols/UnifiedSymbolRenderer.tsx         │    ║
║  │  Renderer NIE zna topologii — rysuje to co dostanie            │    ║
║  └──────────────┬─────────────────────────────────────────────────┘    ║
║                 │                                                      ║
║                 ▼                                                      ║
║  ┌────────────────────────────────────────────────────────────────┐    ║
║  │  OVERLAY (token-only)                                          │    ║
║  │  OverlayEngine.ts — PURE FUNCTION (element → style token)      │    ║
║  │  LoadFlowOverlayAdapter.ts — PowerFlow → overlay               │    ║
║  │  ResultsOverlay.tsx, DiagnosticsOverlay.tsx, Protection...     │    ║
║  │  frontend/src/ui/sld-overlay/                                  │    ║
║  │  frontend/src/ui/sld/ResultsOverlay.tsx                        │    ║
║  │  OVERLAY NIE modyfikuje geometrii — tylko tokeny wizualne      │    ║
║  └──────────────┬─────────────────────────────────────────────────┘    ║
║                 │                                                      ║
║                 ▼                                                      ║
║  ┌────────────────────────────────────────────────────────────────┐    ║
║  │  EXPORT                                                        │    ║
║  │  SldSnapshotExport.ts — orkiestracja                           │    ║
║  │  exportPng.ts — raster PNG (1x/1.5x/2x/4x)                   │    ║
║  │  exportPdf.ts — wektor PDF (A4/A3/A2)                         │    ║
║  │  frontend/src/ui/sld/export/                                   │    ║
║  │  Warstwy: diagram, results, diagnostics, protection           │    ║
║  │  Koordynaty: world coords (nie screen)                         │    ║
║  └────────────────────────────────────────────────────────────────┘    ║
║                                                                        ║
╚══════════════════════════════════════════════════════════════════════════╝
```

---

## 2. Szczegolowa mapa komponentow

### 2.1 Snapshot (backend)

| Plik | Funkcja | Wejscie | Wyjscie |
|------|---------|---------|---------|
| `backend/src/network_model/core/snapshot.py` | `create_network_snapshot(graph)` | NetworkGraph | NetworkSnapshot (frozen, SHA-256 fingerprint) |
| `backend/src/network_model/core/snapshot.py` | `compute_fingerprint(graph)` | NetworkGraph | str (SHA-256 z canonical JSON, sortowanie po ID) |
| `backend/src/application/snapshots/service.py` | `get_snapshot()`, `submit_action()` | snapshot_id / ActionEnvelope | NetworkSnapshot |

### 2.2 Projekcja SLD (backend)

| Plik | Funkcja | Wejscie | Wyjscie |
|------|---------|---------|---------|
| `backend/src/network_model/sld_projection.py` | `project_snapshot_to_sld(snapshot)` | NetworkSnapshot | SldDiagram(elements: Bus/Branch/Transformer/Source/Load/Switch) |
| `backend/src/application/sld/network_graph_to_sld.py` | `convert_graph_to_sld_payload(graph)` | NetworkGraph | SldPayload + id_map (UUID5 deterministic) |
| `backend/src/application/sld/layout.py` | `build_auto_layout_diagram(payload)` | SldPayload | SldDiagram z pozycjami (BFS od SLACK) |

### 2.3 Topology Adapter (frontend) — DOMAIN-DRIVEN (RUN #3C)

| Plik | Funkcja | Wejscie | Wyjscie |
|------|---------|---------|---------|
| `frontend/src/ui/sld/core/topologyInputReader.ts` | `readTopologyFromENM(enm)` | EnergyNetworkModel | TopologyInputV1 (kanoniczny, domain-driven) |
| `frontend/src/ui/sld/core/topologyInputReader.ts` | `readTopologyFromSymbols(symbols, metadata?)` | AnySldSymbol[] + SymbolBridgeMetadata? | TopologyInputV1 (bridge migracyjny) |
| `frontend/src/ui/sld/core/topologyAdapterV2.ts` | `buildVisualGraphFromTopology(input, options?)` | TopologyInputV1 | AdapterResultV1 { graph: VisualGraphV1, fixActions, stats } |
| `frontend/src/ui/sld/core/topologyAdapterV1.ts` | `convertToVisualGraph(symbols, options?)` | AnySldSymbol[] + TopologyAdapterOptions | VisualGraphV1 (deleguje do V2 pipeline) |

**Zmiana RUN #3C:** Adapter jest teraz **NetworkGraph-driven** (domain-driven), nie symbol-driven.
- Sciezka glowna: `readTopologyFromENM()` → `buildVisualGraphFromTopology()`
- Sciezka bridge: `readTopologyFromSymbols()` → `buildVisualGraphFromTopology()`
- **ZERO self-edges** — twardy invariant (throw Error)
- **ZERO string heuristics** — typy z pól strukturalnych (voltageKv, kind, stationType)
- **Deterministyczna segmentacja** — BFS spanning tree → trunk/branch/secondary
- **Stacje A/B/C/D** z analizy topologicznej domeny (busCount, branchCount, switchIds)
- **PV/BESS** z jawnego pola `kind` (GeneratorKind), nie z nazw

### 2.4 Layout Engine (frontend)

| Plik | Funkcja | Wejscie | Wyjscie |
|------|---------|---------|---------|
| `frontend/src/ui/sld-editor/utils/topological-layout/topologicalLayoutEngine.ts` | `computeTopologicalLayout(symbols, config, orientation)` | AnySldSymbol[], LayoutGeometryConfig | TopologicalLayoutResult |
| `frontend/src/ui/sld-editor/utils/topological-layout/geometricSkeleton.ts` | `buildGeometricSkeleton(symbols, assignments, chains, stations, config)` | AnySldSymbol[], RoleAssignment map | GeometricSkeleton (positions, busbars, tiers) |

### 2.5 Busbar Feeder Layout (frontend — oddzielny pipeline)

| Plik | Funkcja | Wejscie | Wyjscie |
|------|---------|---------|---------|
| `frontend/src/ui/sld-editor/layout-integration/busbarFeedersAdapter.ts` | `generateBusbarFeederPaths(bus, symbols)` | NodeSymbol + AnySldSymbol[] | Map<string, Position[]> (sciezki feederow) |
| `frontend/src/ui/sld/layout/orthogonalPath.ts` | `computeBusbarAutoLayout(input)` | AutoLayoutInput | AutoLayoutResult (anchor, stub, lane, segments) |
| `frontend/src/ui/sld/layout/anchorLayout.ts` | `assignAnchors()` | feederow, busbar | AnchorAssignment[] |
| `frontend/src/ui/sld/layout/laneRouter.ts` | `assignLanes()` | feeders, options | LaneAssignment[] |

### 2.6 Collision Guard (frontend)

| Plik | Funkcja | Wejscie | Wyjscie |
|------|---------|---------|---------|
| `frontend/src/ui/sld-editor/utils/topological-layout/collisionGuard.ts` | `detectSymbolCollisions(symbols, positions)` | AnySldSymbol[], Map<string, Position> | CollisionReport |
| j.w. | `resolveSymbolCollisions(symbols, positions)` | AnySldSymbol[], Map<string, Position> | resolved positions + count |
| j.w. | `validateExportMargins(positions, symbols, format)` | positions, symbols, format | { fitsInPage, requiredWidth, requiredHeight } |

### 2.7 Symbol Registry (frontend)

| Plik | Rola |
|------|------|
| `frontend/src/ui/sld/SymbolResolver.ts` | ElementType → benchmarkSymbolId + porty |
| `frontend/src/ui/sld/canonical_symbols/*.svg` | 16 symboli SVG (viewBox 0 0 100 100) |
| `frontend/src/ui/sld/canonical_symbols/ports.json` | Definicje portow (x, y) per symbol |

### 2.8 Camera (frontend)

| Plik | Mechanizm |
|------|-----------|
| `frontend/src/ui/sld/types.ts` | ViewportState { offsetX, offsetY, zoom } |
| `frontend/src/ui/sld/SLDView.tsx` | Obsluga wheel (zoom) + middle/shift-drag (pan) |
| Stale: `ZOOM_MIN=0.25`, `ZOOM_MAX=3.0`, `ZOOM_STEP=0.1` | |
| **Brak reflow geometrii** — camera to transformacja afiniczna na warstwie SVG | |

### 2.9 Renderer (frontend)

| Plik | Rola |
|------|------|
| `frontend/src/ui/sld/SLDViewCanvas.tsx` | SVG canvas, energizacja, renderowanie symboli |
| `frontend/src/ui/sld/symbols/UnifiedSymbolRenderer.tsx` | Unifikowany renderer symboli benchmark |
| `frontend/src/ui/sld/CanonicalSymbolRenderer.tsx` | Generowanie SVG per typ symbolu |
| `frontend/src/ui/sld/sldCanonicalStyle.ts` | SINGLE SOURCE OF TRUTH dla stylow benchmark |

### 2.10 Overlay (frontend)

| Plik | Rola |
|------|------|
| `frontend/src/ui/sld-overlay/OverlayEngine.ts` | PURE FUNCTION: element_ref → style token |
| `frontend/src/ui/sld-overlay/LoadFlowOverlayAdapter.ts` | PowerFlowResult → OverlayPayloadV1 |
| `frontend/src/ui/sld/ResultsOverlay.tsx` | Warstwa wynikow (napiecie, prad, moc) |
| `frontend/src/ui/sld/DiagnosticsOverlay.tsx` | Warstwa diagnostyczna (walidacja) |
| `frontend/src/ui/sld/ProtectionOverlayLayer.tsx` | Warstwa ochrony |
| `frontend/src/ui/sld-overlay/overlayStore.ts` | Zustand store dla payloadu overlay |

### 2.11 Export (frontend)

| Plik | Rola |
|------|------|
| `frontend/src/ui/sld/export/SldSnapshotExport.ts` | Orkiestracja eksportu |
| `frontend/src/ui/sld/export/exportPng.ts` | PNG raster (1x/1.5x/2x/4x) |
| `frontend/src/ui/sld/export/exportPdf.ts` | PDF wektor (A4/A3/A2) |
| `frontend/src/ui/sld/export/presets.ts` | Presety eksportu |
| `frontend/src/ui/sld/export/SldSnapshotExportDialog.tsx` | Dialog UI eksportu |

---

## 3. Testy i CI

### 3.1 Testy backend (pytest)

| Plik | Pokrycie |
|------|----------|
| `backend/tests/golden/golden_network_sn.py` | Fixture: GPZ + 20 stacji + OZE (PV/BESS) |
| `backend/tests/application/sld/test_golden_network_sld.py` | Bijekcja, determinizm, topologia, pozycje, skala, payload |
| `backend/tests/application/sld/test_layout.py` | Algorytm layoutu backend |
| `backend/tests/application/sld/test_overlay_builder.py` | Budowanie overlay wynikow |
| `backend/tests/application/sld/test_sld_parity.py` | Parytet z benchmark, brak PCC |
| `backend/tests/application/sld/test_sld_integration.py` | Integracja E2E backend |
| `backend/tests/test_sld_projection.py` | Projekcja snapshot → SLD |
| `backend/tests/test_wizard_sld_unity.py` | Jednosc Wizard-SLD, determinizm |

### 3.2 Testy frontend (Vitest)

| Plik | Pokrycie |
|------|----------|
| `sld-editor/__tests__/layoutDeterminism.test.ts` | Determinizm layoutu |
| `sld-editor/__tests__/routingObstacleDeterminism.test.ts` | Determinizm routingu |
| `sld-editor/__tests__/deterministicId.test.ts` | Generowanie ID |
| `sld-editor/__tests__/etapGeometry.test.ts` | Kontrakt geometrii benchmark |
| `sld-editor/__tests__/obstacleAwareRouter.test.ts` | Routing z unikaniem kolizji |
| `sld-editor/__tests__/connectionRouting.test.ts` | Generowanie tras |
| `sld-editor/__tests__/busbarFeederAutoLayoutDefault.test.ts` | Layout feederow szyny |
| `sld-editor/__tests__/portSnapping.test.ts` | Przyciaganie portow |
| `sld-editor/__tests__/SldEditorStore.test.ts` | Operacje store |
| `sld-editor/__tests__/copyPaste.test.ts` | Kopiuj/wklej + undo |
| `sld-editor/__tests__/geometry.test.ts` | Wyrownanie/rozlozenie |
| `sld/layout/__tests__/autoLayout.spec.ts` | Algorytm auto-layout |
| `sld/__tests__/sldbenchmarkStyle.test.ts` | Style wizualne |
| `sld/__tests__/sldModeStore.test.ts` | Tryby SLD |
| `sld/__tests__/fitToContent.test.ts` | Dopasowanie widoku |
| `sld/symbols/__tests__/UnifiedSymbolRenderer.test.tsx` | Renderowanie symboli |
| `sld/export/__tests__/sld-export.test.ts` | Pipeline eksportu |
| `sld-overlay/__tests__/overlayEngine.test.ts` | Silnik overlay |
| `sld-overlay/__tests__/LoadFlowOverlayAdapter.test.ts` | Adapter load flow |

### 3.3 CI

| Pipeline | Plik | Co robi |
|----------|------|---------|
| python-tests | `.github/workflows/python-tests.yml` | `poetry run pytest -q` (backend) |
| docs-guard | `.github/workflows/docs-guard.yml` | `python scripts/docs_guard.py` (PCC, linki) |

### 3.4 Guard scripts (20 sztuk)

| Guard | Plik | Sprawdza |
|-------|------|----------|
| no_codenames | `scripts/no_codenames_guard.py` | Brak Pxx w UI |
| docs_guard | `scripts/docs_guard.py` | PCC prohibition + broken links |
| arch_guard | `scripts/arch_guard.py` | Granice warstw |
| overlay_no_physics | `scripts/overlay_no_physics_guard.py` | Brak fizyki w overlay |
| solver_boundary | `scripts/solver_boundary_guard.py` | Izolacja solverow |
| trace_determinism | `scripts/trace_determinism_guard.py` | Determinizm trace |
| resultset_v1_schema | `scripts/resultset_v1_schema_guard.py` | Schema ResultSet |
| **no_self_edges** | `scripts/sld_determinism_guards.py` (Guard 8) | Brak self-edges w adapterze (RUN #3C) |
| **no_string_typology** | `scripts/sld_determinism_guards.py` (Guard 9) | Brak heurystyk stringowych (RUN #3C) |
| **no_legacy_adapter** | `scripts/sld_determinism_guards.py` (Guard 10) | Brak legacy kodu w adapterze (RUN #3C) |
| + 10 kolejnych | `scripts/*.py` | Rozne regualy architektoniczne |

---

## 4. Feature flags (stan aktualny)

| Flag | Wartosc domyslna | Plik | Wplyw na SLD |
|------|-------------------|------|--------------|
| `ENABLE_MATH_RENDERING` | TRUE | `frontend/src/ui/config/featureFlags.ts` | LaTeX w proof/trace (nie SLD layout) |
| `sldCadEditingEnabled` | FALSE | j.w. | Tryby CAD/AUTO/HYBRID (kontrakty, nie narzedzia) |
| `SLD_AUTO_LAYOUT_V1` | FALSE | `frontend/src/ui/sld/layout/index.ts` | Busbar feeder auto-layout (opt-in) |

**Uwaga:** Brak flag `layout_v2`, `experimental_layout`, `new_layout` — spelniony wymog single-engine.

