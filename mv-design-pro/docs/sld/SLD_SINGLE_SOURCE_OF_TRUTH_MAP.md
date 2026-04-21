# SLD Single Source of Truth Map

**Status:** KANONICZNY | **Wersja:** 1.1 | **Data:** 2026-02-13
**Kontekst:** RUN #3A PR-3A-01 + RUN #3C (topology hardening) â€” Mapa pojedynczych zrodel prawdy dla kazdego podsystemu SLD

---

## 1. Cel dokumentu

Wskazanie jednego entrypointa (single source of truth) dla kazdego podsystemu SLD.
Jezeli istnieja duplikaty â€” wskazanie ktore sa legacy i plan usuniecia.

---

## 2. Mapa zrodel prawdy

### 2.1 Layout Engine

| Aspekt | Single Source of Truth | Sciezka |
|--------|------------------------|---------|
| **Topologiczny layout (pozycjonowanie symboli)** | `computeTopologicalLayout()` | `frontend/src/ui/sld-editor/utils/topological-layout/topologicalLayoutEngine.ts` |
| **Busbar feeder routing (sciezki feederow)** | `computeBusbarAutoLayout()` | `frontend/src/ui/sld/layout/orthogonalPath.ts` |
| **Role assignment (topologia â†’ role)** | `assignTopologicalRoles()` | `frontend/src/ui/sld-editor/utils/topological-layout/roleAssigner.ts` |
| **Geometric skeleton (tiers, busbars, slots)** | `buildGeometricSkeleton()` | `frontend/src/ui/sld-editor/utils/topological-layout/geometricSkeleton.ts` |
| **Collision detection** | `detectSymbolCollisions()` | `frontend/src/ui/sld-editor/utils/topological-layout/collisionGuard.ts` |
| **Backend layout (BFS)** | `build_auto_layout_diagram()` | `backend/src/application/sld/layout.py` |
| **Geometry config (benchmark tokens)** | `DEFAULT_GEOMETRY_CONFIG` | `frontend/src/ui/sld-editor/utils/topological-layout/types.ts` |

**Uwaga â€” dwa pipeline'y layoutu:**

```
Pipeline A: Topological Layout Engine (frontend)
  computeTopologicalLayout() â†’ TopologicalLayoutResult
  Odpowiada za: pozycjonowanie symboli w layerach (L0â€“L12)

Pipeline B: Busbar Feeder Auto-Layout (frontend)
  computeBusbarAutoLayout() â†’ AutoLayoutResult
  Odpowiada za: routing sciezek feederow wzdluz szyny

Pipeline C: Backend Layout (backend)
  build_auto_layout_diagram() â†’ SldDiagram
  Odpowiada za: inicjalny layout BFS przy tworzeniu diagramu
```

**Status duplikacji:**
- Pipeline A i B sa **komplementarne** (nie konkurencyjne): A pozycjonuje, B routuje.
- Pipeline C (backend) jest niezalezny â€” generuje pozycje dla nowych diagramow.
- **Brak jednego orkiestratora** laczacego A+B. Potrzebny w 3B.
- `SLD_AUTO_LAYOUT_V1` feature flag w Pipeline B â€” rozwazyc deprecation w 3B.

### 2.2 Topology Adapter â€” DOMAIN-DRIVEN (RUN #3C)

| Aspekt | Single Source of Truth | Sciezka |
|--------|------------------------|---------|
| **Kontrakt wejsciowy adaptera** | `TopologyInputV1` (typ) | `frontend/src/ui/sld/core/topologyInputReader.ts` |
| **Czytnik domeny: ENM â†’ TopologyInput** | `readTopologyFromENM()` | `frontend/src/ui/sld/core/topologyInputReader.ts` |
| **Bridge migracyjny: symbole â†’ TopologyInput** | `readTopologyFromSymbols()` | `frontend/src/ui/sld/core/topologyInputReader.ts` |
| **Adapter V2: TopologyInput â†’ VisualGraphV1** | `buildVisualGraphFromTopology()` | `frontend/src/ui/sld/core/topologyAdapterV2.ts` |
| **Adapter V1 (deleguje do V2)** | `convertToVisualGraph()` | `frontend/src/ui/sld/core/topologyAdapterV1.ts` |
| **Backend: graph â†’ SLD payload** | `convert_graph_to_sld_payload()` | `backend/src/application/sld/network_graph_to_sld.py` |
| **Backend: snapshot â†’ SLD elements** | `project_snapshot_to_sld()` | `backend/src/network_model/sld_projection.py` |

**Zmiana RUN #3C:** Frontend adapter jest teraz **domain-driven** (NetworkGraph/ENM), nie symbol-driven.
- Sciezka glowna: `readTopologyFromENM()` â†’ `buildVisualGraphFromTopology()`
- Sciezka bridge: `readTopologyFromSymbols()` â†’ `buildVisualGraphFromTopology()`
- Legacy `assignTopologicalRoles()` jest nadal uzywane w topologicalLayoutEngine, ale topologia pochodzi z adaptera V2.
- AdapterV1 deleguje w calosci do V2 pipeline â€” zero legacy kodu.

### 2.3 Symbol Registry

| Aspekt | Single Source of Truth | Sciezka |
|--------|------------------------|---------|
| **Mapowanie ElementType â†’ benchmarkSymbolId** | `SymbolResolver.ts` | `frontend/src/ui/sld/SymbolResolver.ts` |
| **Symbole SVG** | `canonical_symbols/*.svg` | `frontend/src/ui/sld/canonical_symbols/` |
| **Definicje portow** | `ports.json` | `frontend/src/ui/sld/canonical_symbols/ports.json` |
| **Rendering unifikowany** | `UnifiedSymbolRenderer.tsx` | `frontend/src/ui/sld/symbols/UnifiedSymbolRenderer.tsx` |
| **Style benchmark** | `sldCanonicalStyle.ts` | `frontend/src/ui/sld/sldCanonicalStyle.ts` |

**Status:** Brak duplikatow. Jedno zrodlo prawdy per aspekt.

### 2.4 Camera

| Aspekt | Single Source of Truth | Sciezka |
|--------|------------------------|---------|
| **ViewportState (typ)** | `types.ts` | `frontend/src/ui/sld/types.ts` |
| **fitToContent()** | `types.ts` | `frontend/src/ui/sld/types.ts` |
| **Obsluga zoom/pan** | `SLDView.tsx` | `frontend/src/ui/sld/SLDView.tsx` |

**Status:** Jedno zrodlo. Camera jest transformacja afiniczna â€” brak reflow.

### 2.5 Overlay

| Aspekt | Single Source of Truth | Sciezka |
|--------|------------------------|---------|
| **Overlay engine (pure mapping)** | `OverlayEngine.ts` | `frontend/src/ui/sld-overlay/OverlayEngine.ts` |
| **Overlay payload (Zustand)** | `overlayStore.ts` | `frontend/src/ui/sld-overlay/overlayStore.ts` |
| **LoadFlow adapter** | `LoadFlowOverlayAdapter.ts` | `frontend/src/ui/sld-overlay/LoadFlowOverlayAdapter.ts` |
| **Backend overlay builder** | `build_sld_overlay()` | `backend/src/application/sld/overlay_builder.py` |

**Status:** Frontend i backend overlay sa oddzielne warstwy (backend buduje dane, frontend renderuje). Brak duplikacji.

### 2.6 Export

| Aspekt | Single Source of Truth | Sciezka |
|--------|------------------------|---------|
| **Orkiestracja** | `SldSnapshotExport.ts` | `frontend/src/ui/sld/export/SldSnapshotExport.ts` |
| **PNG** | `exportPng.ts` | `frontend/src/ui/sld/export/exportPng.ts` |
| **PDF** | `exportPdf.ts` | `frontend/src/ui/sld/export/exportPdf.ts` |
| **Presety** | `presets.ts` | `frontend/src/ui/sld/export/presets.ts` |

**Status:** Jedno zrodlo per format.

### 2.7 Editor Store

| Aspekt | Single Source of Truth | Sciezka |
|--------|------------------------|---------|
| **Stan edytora (Zustand)** | `SldEditorStore.ts` | `frontend/src/ui/sld-editor/SldEditorStore.ts` |
| **Tryby SLD** | `sldModeStore.ts` | `frontend/src/ui/sld/sldModeStore.ts` |
| **CAD geometry overrides** | `geometryContract.ts` | `frontend/src/ui/sld-editor/cad/geometryContract.ts` |

**Status:** Jedno zrodlo per aspekt. Dwa store'y (editor + mode) sa komplementarne.

### 2.8 Guard Scripts

| Aspekt | Single Source of Truth | Sciezka |
|--------|------------------------|---------|
| **No codenames** | `no_codenames_guard.py` | `scripts/no_codenames_guard.py` |
| **PCC prohibition** | `docs_guard.py` | `scripts/docs_guard.py` |
| **Layer boundaries** | `arch_guard.py` | `scripts/arch_guard.py` |
| **Overlay no physics** | `overlay_no_physics_guard.py` | `scripts/overlay_no_physics_guard.py` |
| **Solver boundary** | `solver_boundary_guard.py` | `scripts/solver_boundary_guard.py` |
| **SLD determinism (Guards 1-7)** | `sld_determinism_guards.py` | `scripts/sld_determinism_guards.py` |
| **No self-edges (Guard 8)** | `sld_determinism_guards.py` | `scripts/sld_determinism_guards.py` (RUN #3C) |
| **No string typology (Guard 9)** | `sld_determinism_guards.py` | `scripts/sld_determinism_guards.py` (RUN #3C) |
| **No legacy adapter (Guard 10)** | `sld_determinism_guards.py` | `scripts/sld_determinism_guards.py` (RUN #3C) |

**Status:** Jedno zrodlo per regula. Guards 8-10 dodane w RUN #3C.

### 2.9 Golden Networks

| Aspekt | Single Source of Truth | Sciezka |
|--------|------------------------|---------|
| **Backend golden SN** | `golden_network_sn.py` | `backend/tests/golden/golden_network_sn.py` |
| **Frontend golden: VisualGraph** | `visualGraph.test.ts` + `determinism.test.ts` | `frontend/src/ui/sld/core/__tests__/` |
| **Frontend golden: TopologyAdapter V2 (domain)** | `topologyAdapterV2.test.ts` | `frontend/src/ui/sld/core/__tests__/topologyAdapterV2.test.ts` |

**Status (RUN #3C):** Frontend ma 2 zestawy golden fixtures:
- VisualGraph: GN-SLD-01..02, GN-OZE-01..03, GN-STRESS-500 (RUN #3A)
- TopologyAdapterV2: GN-DOM-01..07 (RUN #3C) â€” 7 golden domain networks

### 2.10 Dokumentacja kanoniczna

| Dokument | Single Source of Truth | Sciezka |
|----------|------------------------|---------|
| **System SLD** | `KANON_SLD_SYSTEM.md` | `docs/KANON_SLD_SYSTEM.md` |
| **Auto-layout spec** | `SLD_AUTO_LAYOUT.md` | `docs/SLD_AUTO_LAYOUT.md` |
| **Reguly SLD** | `sld_rules.md` | `docs/ui/sld_rules.md` |
| **Render layers** | `SLD_RENDER_LAYERS_CONTRACT.md` | `docs/ui/SLD_RENDER_LAYERS_CONTRACT.md` |
| **Layout rules** | `LAYOUT_RULES.md` | `frontend/src/ui/sld-editor/utils/topological-layout/LAYOUT_RULES.md` |
| **E2E pipeline** | `SLD_E2E_PIPELINE_MAP.md` | `docs/sld/SLD_E2E_PIPELINE_MAP.md` (nowy) |
| **Gap audit** | `SLD_REPO_GAP_AUDIT.md` | `docs/sld/SLD_REPO_GAP_AUDIT.md` (nowy) |

---

## 3. Identyfikacja duplikatow i plan

### 3.1 Duplikaty wymagajace interwencji

| Problem | Pliki | Plan |
|---------|-------|------|
| Dwa pipeline'y layoutu bez orkiestratora | topologicalLayoutEngine.ts + orthogonalPath.ts | 3B: Unified layout orchestrator |
| Backend layout niezalezny od frontend | backend/layout.py vs frontend/topologicalLayoutEngine.ts | Akceptowalne â€” rozne etapy pipeline. Backend: initial, Frontend: interactive. |
| `SLD_AUTO_LAYOUT_V1` feature flag | sld/layout/index.ts | PR-3A-03: Guard, 3B: Deprecation/rename |

### 3.2 Brak duplikatow (potwierdzone)

- Symbol Registry: SymbolResolver.ts jest jedynym mapowaniem
- Camera: ViewportState jest jedynym typem
- Overlay Engine: OverlayEngine.ts jest jedynym silnikiem
- Editor Store: SldEditorStore.ts jest jedynym store'em edytora
- Style benchmark: sldCanonicalStyle.ts jest jedynym zrodlem (voltageColors.ts oznaczony jako legacy â€” prefer sldbenchmarkStyle)

### 3.3 Legacy do monitorowania

| Element | Status | Uwagi |
|---------|--------|-------|
| `voltageColors.ts` | Legacy (prefer sldCanonicalStyle.ts) | Nie usuwac jeszcze â€” moze byc w uzyciu |
| `SLD_AUTO_LAYOUT_V1` flag | Active (default OFF) | Rozwazyc deprecation w 3B |

---

## 4. Docelowa architektura (po RUN #3A + 3C)

```
NetworkModel (backend)
       â”‚
       â–Ľ
   Snapshot (frozen, fingerprint SHA-256)
       â”‚
       â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
       â–Ľ                                              â–Ľ
   EnergyNetworkModel (API)                 AnySldSymbol[] (editor)
       â”‚                                              â”‚
       â–Ľ                                              â–Ľ
   readTopologyFromENM()              readTopologyFromSymbols()
   (sciezka glowna)                   (bridge migracyjny)
       â”‚                                              â”‚
       â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                      â–Ľ
              TopologyInputV1 (kanoniczny kontrakt)
                      â”‚
                      â–Ľ
          buildVisualGraphFromTopology()  â† TopologyAdapterV2
          - ZERO self-edges (throw Error)
          - ZERO string heuristics
          - BFS spanning tree segmentacja
          - Stacje A/B/C/D z domeny
          - PV/BESS z GeneratorKind
                      â”‚
                      â–Ľ
              VisualGraphV1 (zamrozony kontrakt)
                      â”‚
                      â–Ľ
   Layout Engine (single orchestrator)
   VisualGraphV1 â†’ LayoutResult (positions, paths)
       â”‚
       â”śâ”€ Phase 1: Role Assignment
       â”śâ”€ Phase 2-4: Geometric Skeleton
       â”śâ”€ Phase 5: Busbar Feeder Routing
       â””â”€ Phase 6: Collision Guard
       â”‚
       â–Ľ
   Camera (affine transform, no-reflow)
       â”‚
       â–Ľ
   Renderer (thin, topology-unaware)
       â”‚
       â–Ľ
   Overlay (token-only, geometry-preserving)
       â”‚
       â–Ľ
   Export (SVG/PDF/PNG, world coords)
```

