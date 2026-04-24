# M0: ENM → SLD Flow Map (Active Data Path)

**Date**: 2026-04-24  
**Status**: BASELINE AUDIT (no code changes)

## Active Rendering Path

### Frontend SLD Render Flow
```
ENM (EnergyNetworkModel)
  ↓
enmSnapshotToSldSymbols()
  (./mv-design-pro/frontend/src/ui/sld/enmSnapshotToSldSymbols.ts)
  ↓
projectEnmSnapshotToSld(snapshot)
  (same file)
  ↓
AnySldSymbol[]
  ↓
SLDView.tsx (68KB)
  (./mv-design-pro/frontend/src/ui/sld/SLDView.tsx)
  ↓
SLDViewCanvas.tsx
  (./mv-design-pro/frontend/src/ui/sld/SLDViewCanvas.tsx)
  ↓
SVG Rendering (SymbolResolver → ports.json)
```

### Root Component Hierarchy
```
SldEditorPage.tsx (main entry point)
  └─ <SLDView />
      ├─ <SLDViewCanvas />
      │   ├─ <SymbolRenderer /> (via SymbolResolver.ts)
      │   └─ Port-based layout (ports.json)
      ├─ <SldWorkDock />
      └─ <SldReadinessStack />
```

### Symbol Resolver Chain
- **File**: `./mv-design-pro/frontend/src/ui/sld/SymbolResolver.ts`
- **Responsibility**: Maps `DeviceTypeV1` → SVG symbol path
- **Input**: `DeviceTypeV1` enum value (e.g., 'CB', 'DS', 'FUSE')
- **Output**: SVG component or filename
- **Port lookup**: `canonical_symbols/ports.json`

### Layout Pipeline
- **Primary**: `./mv-design-pro/frontend/src/ui/sld/core/layoutPipeline.ts` (67KB)
- **Components**:
  - `layoutEngine.ts` — spatial arrangement
  - `bayRenderer.ts` — field rendering (28KB)
  - `busArrangements.ts` — busbar topology
  - `layoutResult.ts` — output contract

### Bay & Station Rendering
- **Bay rendering**: `bayRenderer.ts` (28KB)
  - Reads `fieldDeviceContracts.ts` (48KB)
  - Renders GPZ and station bays
- **Field detail**: `canonicalFieldDetail.ts` (6.2KB)
- **Reference topologies**: `referenceTopologies.ts` (40KB)
  - Contains golden network builders

### ENM Snapshot to SLD Conversion
- **Function**: `enmSnapshotToSldSymbols(snapshot)` 
  - Returns: `AnySldSymbol[]` (array of symbols with geometry)
- **Function**: `projectEnmSnapshotToSld(snapshot)`
  - Returns: `EnmProjectionResult` (includes topology and trace)
- **No hardcoded models**: Frontend **reads** ENM, does not build alternative representation

## Key Architectural Constraints

1. **ENM is Source of Truth**: Frontend renders projection, not duplicate model
2. **No Alternative Builders**: `SldDiagram` ≠ manual TS builder
3. **Active Tests**: 81 SLD test files confirming determinism
4. **Contract-First**: `fieldDeviceContracts.ts` (48KB) defines all device types and requirements

## Risks Identified

| Risk | Severity | Note |
|------|----------|------|
| `projectEnmSnapshotToSld` hidden from public API | MEDIUM | Function exists but not exported; may need to be exposed for M4 testing |
| Layout pipeline complexity (67KB layoutPipeline.ts) | LOW | Well-tested; no immediate action needed |
| No `canonical_gpz_sn_v2` fixture yet | MEDIUM | Will be created in M4; currently using referenceTopologies.ts builders |

## Next Steps (M1+)

- M1: Document canonical SN SLD blueprint (reference: `referenceTopologies.ts` and `bayRenderer.ts`)
- M2: Extract and formalize `BayTemplate` and `DeviceSlotPosition` (partly in contracts, needs extraction)
- M3: Audit symbol inventory against ports.json
- M4: Create backend `canonical_gpz_sn_v2_builder.py` and sync fixture with frontend
