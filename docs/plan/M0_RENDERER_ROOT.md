# M0: SLD Renderer Root & Component Hierarchy

**Date**: 2026-04-24  
**Status**: BASELINE AUDIT (component discovery)

## Main SLD Renderer Root

### Entry Point Component
**File**: `./mv-design-pro/frontend/src/ui/sld/SldEditorPage.tsx` (68KB)

**Responsibility**:
- Main entry point for SLD editing UI
- Integrates with global app state (mode, case, model)
- Coordinates between toolbar, canvas, and sidebars
- Handles empty state and loading overlays

**Component Tree**:
```
<SldEditorPage>
  ├─ <OperationalModeToolbar />
  ├─ <LabelModeToolbar />
  ├─ <SldEmptyOverlay /> (conditional, for empty ENM)
  ├─ <SLDView> (main renderer)
  │  ├─ <SLDViewCanvas> (SVG canvas)
  │  │  ├─ <SymbolRenderer /> (via SymbolResolver.ts)
  │  │  └─ Port-based layout (ports.json)
  │  └─ Tool/Edit UI
  ├─ <SldWorkDock /> (right panel)
  ├─ <SldReadinessStack /> (readiness overlay)
  ├─ <SegmentInspectorPanel /> (detail view)
  └─ <TypePicker /> (catalog type selector)
```

### Renderer Component: SLDView
**File**: `./mv-design-pro/frontend/src/ui/sld/SLDView.tsx` (68KB)

**Responsibility**:
- Core SLD rendering engine
- Converts ENM/snapshot to visual topology
- Manages symbol placement and routing
- Handles user interaction (click, select, drag)

**Key Functions**:
1. Import snapshot from app state
2. Project snapshot to SLD symbols via `enmSnapshotToSldSymbols()`
3. Layout symbols using `layoutPipeline.ts` (7-phase algorithm)
4. Render SVG with ports from `ports.json`
5. Handle editing commands (add/remove/modify)

### Canvas Component: SLDViewCanvas
**File**: `./mv-design-pro/frontend/src/ui/sld/SLDViewCanvas.tsx` (21KB)

**Responsibility**:
- SVG <canvas> rendering
- Port-to-port connections
- Symbol rotation and alignment
- Geometry override application

## Symbol Resolution Pipeline

**Step 1**: DeviceTypeV1 → Symbol Lookup
```typescript
// File: SymbolResolver.ts
import { SymbolResolver } from './SymbolResolver';

const resolver = new SymbolResolver();
const svgComponent = resolver.resolve(deviceType); // e.g., 'CB' → CircuitBreakerSvg
```

**Step 2**: Symbol → Port Mapping
```json
// From: canonical_symbols/ports.json
{
  "circuit_breaker": {
    "viewBox": "0 0 100 100",
    "ports": {
      "top": { "x": 50, "y": 0 },
      "bottom": { "x": 50, "y": 100 }
    }
  }
}
```

**Step 3**: Port Connection
- Layout engine calculates positions
- Ports connected based on topology
- Lines routed around obstacles

## Layout Pipeline (7-Phase)

**File**: `./mv-design-pro/frontend/src/ui/sld/core/layoutPipeline.ts` (67KB)

**Phases** (inferred):
1. **Graph Construction** — Build semantic graph from symbols
2. **Arrangement** — Position symbols in columns/rows
3. **Port Calculation** — Determine port coordinates
4. **Routing** — Connect ports with paths (avoid crossing)
5. **Geometry Override** — Apply manual positioning tweaks
6. **Label Placement** — Position text labels
7. **Rendering Manifest** — Generate final SVG manifest

**Determinism Guarantee**: Phase output is reproducible (SHA-256 stable)

## Bay Rendering (per-field rendering)

**File**: `./mv-design-pro/frontend/src/ui/sld/core/bayRenderer.ts` (28KB)

**Purpose**:
- Renders individual GPZ/Station bays
- Applies field role and device requirements
- Validates electrical constraints
- Generates bay symbols array

**Input**: FieldRole + DeviceRequirementSetV1  
**Output**: AnySldSymbol[] (symbols with geometry for the bay)

## Reference & Golden Networks

**File**: `./mv-design-pro/frontend/src/ui/sld/core/referenceTopologies.ts` (40KB)

**Purpose**:
- Contains golden network builders (hardcoded)
- Example topologies for testing and demo
- Builders create EnergyNetworkModel programmatically

**Examples** (inferred):
- `GN_01_SN_PROSTA` — Simple SN network
- `GN_02_SN_ODGALEZIENIE` — Branching SN network
- Possibly: GPZ examples, station examples

**Risk**: Hardcoded builders are **not** authoritative source of truth. ENM is.

## Component Integration Points

| Component | Purpose | Input | Output |
|-----------|---------|-------|--------|
| SldEditorPage | Entry point | EnergyNetworkModel | UI with editing |
| SLDView | Render engine | Snapshot | SVG topology |
| SLDViewCanvas | SVG canvas | Symbols + ports | DOM <svg> |
| SymbolResolver | Symbol lookup | DeviceTypeV1 | SVG component |
| bayRenderer | Field rendering | FieldRole + requirements | Symbols array |
| layoutPipeline | Spatial layout | Symbols | Positioned symbols |
| referenceTopologies | Golden builders | (none) | EnergyNetworkModel |

## Currently Inactive Components (Legacy)

**File**: `./mv-design-pro/frontend/src/ui/sld/core/legacyVisualGraphBridge.ts` (2.4KB)

**Purpose**: Bridge for legacy VisualGraph API  
**Status**: **NOT ACTIVELY USED** (marked as legacy)  
**Risk**: Remove in M7a when ScadaShell replaces CanonicalLayout

## Data Flow Summary

```
EnergyNetworkModel (ENM)
  ↓ [snapshot taken]
Snapshot (immutable view of ENM)
  ↓ [enmSnapshotToSldSymbols()]
AnySldSymbol[] (with geometry)
  ↓ [layoutPipeline 7 phases]
Positioned symbols + port coordinates
  ↓ [SVG rendering]
HTML <svg> with circuit symbols
```

## Critical Files for M1+ Implementation

1. **bayRenderer.ts** — Define BayTemplate structure
2. **fieldDeviceContracts.ts** — DeviceSlotPosition enumeration
3. **layoutPipeline.ts** — Understand layout algorithm for determinism
4. **referenceTopologies.ts** — Golden network examples
5. **ports.json** — Symbol port definitions

## Next Steps

1. **M1**: Document canonical blueprint (reference: bayRenderer + referenceTopologies)
2. **M2**: Extract `BayTemplate` + `StationSwitchgearTemplate` from bayRenderer.ts
3. **M3**: Audit symbol inventory against SymbolResolver.ts
4. **M4**: Create canonical_gpz_sn_v2 fixture (not just hardcoded, backend-generated)
5. **M5**: Implement rendering components based on templates
