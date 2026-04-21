# SLD Auto-Layout Engine

## Overview

The SLD (Single Line Diagram) Auto-Layout Engine provides automatic positioning and routing for electrical network schematics. It generates professional-grade diagrams similar to benchmark and benchmark output.

## Key Features

- **Dynamic Voltage Bands**: Voltages are read from the model, never hardcoded
- **100% Determinism**: Same input always produces identical pixel output
- **Automatic Bay Detection**: Detects feeder bays from busbar connections
- **Crossing Minimization**: Uses barycenter heuristic from Sugiyama algorithm
- **Orthogonal Routing**: Professional-grade edge routing
- **Grid Alignment**: All positions snapped to configurable grid
- **Incremental Layout**: Small changes don't reset entire schema
- **Device & Field Modeling** (RUN #3D): benchmark-grade field/device details with
  embedding role derivation, device requirement validation, and anchor mapping.
  See [SLD_DEVICE_MODELING_SPEC.md](./SLD_DEVICE_MODELING_SPEC.md) for details.

## Installation

The engine is part of the frontend package:

```typescript
import { computeLayout } from '@/engine/sld-layout';
```

## Basic Usage

```typescript
import { computeLayout } from '@/engine/sld-layout';
import type { LayoutSymbol, LayoutResult } from '@/engine/sld-layout';

// Define network symbols
const symbols: LayoutSymbol[] = [
  {
    id: 'see1',
    elementId: 'elem_see1',
    elementType: 'Source',
    elementName: 'Zasilanie',
    voltageKV: 15,
    connectedToNodeId: 'elem_bus_sn',
    inService: true,
  },
  {
    id: 'bus_sn',
    elementId: 'elem_bus_sn',
    elementType: 'Bus',
    elementName: 'Szyna SN 15kV',
    voltageKV: 15,
    inService: true,
  },
  // ... more symbols
];

// Compute layout
const result: LayoutResult = computeLayout({ symbols });

// Use results
result.positions;      // Map<symbolId, ElementPosition>
result.voltageBands;   // VoltageBand[] (dynamic voltage bands)
result.bays;           // Bay[] (detected bays)
result.routedEdges;    // Map<edgeId, RoutedEdge>
result.labelPositions; // Map<symbolId, LabelPosition>
```

## Pipeline Architecture

The layout engine uses a 5-phase pipeline inspired by the Sugiyama framework:

### Phase 1: Voltage Band Assignment

Collects unique voltages from the model and creates voltage bands:

- Reads `voltageKV`, `voltageHV`, `voltageLV` from symbols
- Sorts voltages descending (highest = top of diagram)
- Assigns colors from configurable color map
- Categories: NN (>200kV), WN (60-200kV), SN (1-60kV), nN (0.1-1kV), DC (<0.1kV)

```typescript
import { collectUniqueVoltages, assignVoltageBands } from '@/engine/sld-layout';
```

### Phase 2: Bay Detection

Detects feeder bays from busbar connections using BFS:

- Identifies bay types: incomer, feeder, tie, generator, oze_pv, oze_wind, bess, etc.
- Creates hierarchy for nested busbars
- Groups elements belonging to each bay

```typescript
import { detectBays, findBayContainingSymbol } from '@/engine/sld-layout';
```

### Phase 3: Crossing Minimization

Optimizes bay order to minimize edge crossings:

- Uses barycenter heuristic
- Respects type constraints (incomer left, tie right)
- Max 20 iterations for convergence

```typescript
import { minimizeCrossings, sortBaysByType } from '@/engine/sld-layout';
```

### Phase 4: Coordinate Assignment

Assigns precise X,Y coordinates:

- Sources positioned above busbars
- Transformers between voltage bands
- Loads/Generators at bottom
- All positions snapped to grid

```typescript
import { assignCoordinates, calculateSchemaBounds } from '@/engine/sld-layout';
```

### Phase 5: Edge Routing + Label Placement

Creates orthogonal paths and places labels:

- L-shaped and Z-shaped routing
- Collision-aware label placement
- Port-to-port connections (top, bottom, left, right)

```typescript
import { routeEdgesAndPlaceLabels, validateOrthogonalPaths } from '@/engine/sld-layout';
```

## Configuration

```typescript
import { DEFAULT_LAYOUT_CONFIG } from '@/engine/sld-layout';

const customConfig = {
  ...DEFAULT_LAYOUT_CONFIG,
  gridSize: 20,           // Grid snap size
  busbarMinWidth: 400,    // Minimum busbar width
  bayGap: 160,            // Gap between bays
  elementGapY: 100,       // Vertical gap between elements
};

const result = computeLayout({
  symbols,
  config: customConfig,
});
```

## Voltage Color Customization

```typescript
import {
  DEFAULT_VOLTAGE_COLOR_MAP,
  benchmark_STYLE_COLORS,
  CANONICAL_STYLE_COLORS,
  getVoltageColor,
} from '@/engine/sld-layout';

// Use benchmark-style colors
const result = computeLayout({
  symbols,
  voltageColorMap: benchmark_STYLE_COLORS,
});

// Custom color map
const customColorMap = [
  { minKV: 60, maxKV: 200, color: '#CC3333', category: 'WN', description: 'High Voltage' },
  { minKV: 1, maxKV: 60, color: '#00AACC', category: 'SN', description: 'Medium Voltage' },
  { minKV: 0, maxKV: 1, color: '#FF8800', category: 'nN', description: 'Low Voltage' },
];
```

## Symbol Types

Supported element types:

| Type | Description | Connections |
|------|-------------|-------------|
| `Bus` | Busbar/electrical node | - |
| `Source` | External grid source | `connectedToNodeId` |
| `Load` | Load/consumer | `connectedToNodeId` |
| `Generator` | Power generator (PV, Wind, BESS) | `connectedToNodeId` |
| `TransformerBranch` | Transformer | `fromNodeId`, `toNodeId`, `voltageHV`, `voltageLV` |
| `LineBranch` | Line/cable | `fromNodeId`, `toNodeId` |
| `Switch` | Circuit breaker/switch | `fromNodeId`, `toNodeId` |

## Port Semantics (RUN #3D-FIX)

Edge creation uses semantic port roles resolved via `resolvePortId(nodeType, role)`:

| Node Type | IN port | OUT port | BRANCH port |
|-----------|---------|----------|-------------|
| BUS_SN / BUS_NN | `left` | `right` | - |
| GRID_SOURCE | - | `bottom` | - |
| GENERATOR_* | - | `bottom` | - |
| LOAD | `top` | - | - |
| STATION_SN_NN_* | `in` | `out` | `branch` |
| FEEDER_JUNCTION | `top` | `bottom` | `left` |

Port IDs are geometric (backward compatible) but resolved from semantic roles
(`PortRoleV1.IN`, `PortRoleV1.OUT`, `PortRoleV1.BRANCH`).

## Voltage Handling (RUN #3D-FIX)

Voltages are read from the model, never fabricated:
- `ConnectionNodeV1.voltageKv` is `number | null`
- Missing voltage â†’ FixAction `bus.voltage_missing` (not default 15kV)
- `classifyBusType(null)` â†’ `BUS_SN` (conservative fallback for rendering)

## Determinism Rules

The engine guarantees deterministic output:

1. **D1**: No niedeterministyczne API (random, zegar)
2. **D2**: No iteration order from Set/Map - always sorted by id
3. **D3**: No DOM layout dependencies
4. **D4**: Tiebreaker = `element.id` (string sort)
5. **D5**: Floating point: `Math.round(x * 100) / 100`
6. **D6**: Test: `computeLayout(model) === computeLayout(model)` BIT-FOR-BIT
7. **D7**: 100x hash stability + 50x permutation invariance verified (154 tests)

```typescript
import { verifyDeterminism } from '@/engine/sld-layout';

const isDeterministic = verifyDeterminism({ symbols });
// true if 5 consecutive runs produce identical output
```

## Supported Network Topologies

The engine supports these common topologies:

- **Pattern A**: Radial (SEE â†’ TR â†’ Loads)
- **Pattern B**: Multi-feeder (busbar with multiple feeders)
- **Pattern C**: PrzyĹ‚Ä…cze SN/nN (most common - substation connection)
- **Pattern D**: OZE/BESS (renewable energy integration)
- **Pattern E**: Ring network
- **Pattern F**: Dual-transformer SZR
- **Pattern G**: Magistrala (backbone)
- **Pattern H**: Composite networks

## API Reference

### Main Functions

```typescript
// Main layout function
function computeLayout(input: LayoutInput): LayoutResult;

// Verify determinism
function verifyDeterminism(input: LayoutInput, runs?: number): boolean;

// Incremental layout (for user overrides)
function computeIncrementalLayout(
  input: LayoutInput,
  previousResult: LayoutResult,
  changes: LayoutChange[]
): LayoutResult;
```

### Types

```typescript
interface LayoutInput {
  symbols: LayoutSymbol[];
  config?: Partial<LayoutConfig>;
  voltageColorMap?: VoltageColorRule[];
  userOverrides?: Map<string, UserPositionOverride>;
}

interface LayoutResult {
  positions: Map<string, ElementPosition>;
  voltageBands: VoltageBand[];
  bays: Bay[];
  routedEdges: Map<string, RoutedEdge>;
  labelPositions: Map<string, LabelPosition>;
  busbarGeometries: Map<string, BusbarGeometry>;
  schemaBounds: Rectangle;
  debug: LayoutDebugInfo;
}
```

## Testing

Run tests:

```bash
cd mv-design-pro/frontend
npm test -- src/engine/sld-layout
```

Test coverage includes:
- Voltage band assignment (dynamic voltages)
- Bay detection for all topology patterns
- Determinism verification
- Grid alignment
- Overlap detection
- Edge routing orthogonality

## Architecture Principles

1. **DYNAMIC VOLTAGES**: Read from model, never hardcode 15kV/0.4kV
2. **ZERO FABRICATION** (RUN #3D-FIX): Missing voltage â†’ `null` + FixAction, never default
3. **NO AUTO-LAYOUT BUTTON**: Layout runs automatically on model changes
4. **DETERMINISM**: Same model = identical pixel output (bit-for-bit, 154 tests)
5. **INCREMENTAL**: Small changes don't reset entire schema
6. **PROFESSIONAL OUTPUT**: benchmark/benchmark-grade diagrams
7. **SEMANTIC PORTS** (RUN #3D-FIX): Port roles IN/OUT/BRANCH resolved via `resolvePortId`
8. **ZERO STRING HEURISTICS** (RUN #3D-FIX): Typology from domain data, never from name parsing

