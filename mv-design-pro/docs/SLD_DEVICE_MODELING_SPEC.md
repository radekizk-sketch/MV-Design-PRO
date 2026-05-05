# SLD Device Modeling Specification (RUN #3D + RUN #3D-FIX)

> CANONICAL DOCUMENT. All device/field/station modeling follows this spec.

## Overview

RUN #3D introduces benchmark-grade device and field modeling into the SLD pipeline.
RUN #3D-FIX (FAZA 1-4) eliminates all string heuristics, voltage fabrication,
and formalizes port semantics + station typology validation.

This extends the VisualGraphV1 + LayoutResultV1 contracts without breaking
the frozen VisualGraphV1 contract.

## Architecture (M2: Internal Subgraph with Anchor Mapping)

```
TopologyInputV1
       |
       v
TopologyAdapterV2
  buildVisualGraphFromTopology()
       |
       +---> VisualGraphV1 (FROZEN, station = 1 node)
       |     - Port semantics: IN/OUT/BRANCH (resolvePortId)
       |     - Validator: nodeType-only (zero string heuristics)
       |     - voltageKv: number | null (zero fabrication)
       |
       +---> StationBlockBuildResult (fields, devices, anchors per station)
                    |
                    v
             LayoutPipeline
               computeLayout(graph, config, stationBlockDetails?)
                    |
                    v
             LayoutResultV1
               SwitchgearBlockV1.detail: StationBlockDetailV1 | null
```

**Key principle**: VisualGraphV1 stays frozen (stations are single nodes).
Field/device details go into `LayoutResultV1.SwitchgearBlockV1.detail` with
`DeviceAnchorV1` for renderer/overlay/inspector.

## Domain Types

### FieldRoleV1

Each field (bay) in a station has a canonical role:

| Role | Description |
|------|-------------|
| `LINE_IN` | Pole liniowe wejsciowe (od magistrali) |
| `LINE_OUT` | Pole liniowe wyjsciowe (do nastepnej stacji) |
| `LINE_BRANCH` | Pole odgalezieniowe |
| `TRANSFORMER_SN_NN` | Pole transformatorowe SN/nN |
| `PV_SN` | Pole przylaczeniowe PV na SN |
| `BESS_SN` | Pole przylaczeniowe BESS na SN |
| `COUPLER_SN` | Pole sprzeglowe (lacznik sekcyjny) |
| `BUS_TIE` | Pole lacznika szyn |

### DeviceTypeV1

Equipment in a field:

| Type | Electrical Role | Power Path Position |
|------|----------------|---------------------|
| `CB` | POWER_PATH | MIDSTREAM |
| `DS` | POWER_PATH | UPSTREAM |
| `ES` | POWER_PATH | UPSTREAM |
| `CT` | POWER_PATH | MIDSTREAM |
| `VT` | MEASUREMENT | OFF_PATH |
| `RELAY` | PROTECTION | OFF_PATH |
| `CABLE_HEAD` | TERMINATION | DOWNSTREAM |
| `TRANSFORMER_DEVICE` | POWER_PATH | MIDSTREAM |
| `GENERATOR_PV` | POWER_PATH | DOWNSTREAM |
| `GENERATOR_BESS` | POWER_PATH | DOWNSTREAM |
| `GENERATOR_WIND` | POWER_PATH | DOWNSTREAM |
| `ACB` | POWER_PATH | DOWNSTREAM |
| `PCS` | POWER_PATH | DOWNSTREAM |
| `BATTERY` | POWER_PATH | DOWNSTREAM |

### EmbeddingRoleV1

Station's role relative to trunk segmentation:

| Role | Condition | Description |
|------|-----------|-------------|
| `TRUNK_LEAF` | trunkCount == 1, branchCount == 0 | Stacja koncowa (typ A) |
| `TRUNK_INLINE` | trunkCount == 2, branchCount == 0 | Stacja przelotowa (typ B) |
| `TRUNK_BRANCH` | trunkCount >= 1, branchCount >= 1 | Stacja odgalezieniowa (typ C) |
| `LOCAL_SECTIONAL` | busSections >= 2 | Stacja sekcyjna (typ D) |

**Embedding role derivation**: Based on incident trunk/branch edges (excluding
TR_LINK and BUS_LINK which are internal to the station) and bus section count.

**Station typology validation (RUN #3D-FIX)**: After deriving the embedding role
from topology, `validateEmbeddingVsDomain()` cross-checks against `station.stationType`
from the domain model. Mismatches produce FixAction `station.typology_conflict`:
- SWITCHING + non-LOCAL_SECTIONAL = conflict
- DISTRIBUTION + LOCAL_SECTIONAL = conflict

The topology-derived role is ground truth; conflicts are informational diagnostics.

### Port Semantics (RUN #3D-FIX)

Bus ports use semantic roles instead of generic BUS:

| NodeType | PortRoleV1 | Port ID |
|----------|-----------|---------|
| `BUS_SN` / `BUS_NN` | `IN` | `left` |
| `BUS_SN` / `BUS_NN` | `OUT` | `right` |
| `GRID_SOURCE` | `OUT` | `bottom` |
| `GENERATOR_*` | `OUT` | `bottom` |
| `LOAD` | `IN` | `top` |
| `STATION_SN_NN_*` | `IN` / `OUT` / `BRANCH` | `in` / `out` / `branch` |
| `FEEDER_JUNCTION` | `IN` / `OUT` / `BRANCH` | `top` / `bottom` / `left` |

Port resolution is handled by `resolvePortId(nodeType, role)` in topologyAdapterV2.ts.
Edge creation uses `selectSourcePort(branch, edgeType, fromNodeType)` and
`selectTargetPort(branch, edgeType, toNodeType)` with full nodeType awareness.

### Voltage Contract (RUN #3D-FIX)

`ConnectionNodeV1.voltageKv` is `number | null` (NOT `number`).
Missing voltage is never fabricated — it produces FixAction `bus.voltage_missing`.

| Field | Type | Zero-fabrication |
|-------|------|------------------|
| `ConnectionNodeV1.voltageKv` | `number \| null` | `bus.voltage_missing` |
| `TopologyStationV1.voltageKv` | `number \| null` | inherited from bus |
| `TopologyBranchV1.voltageHvKv` | `number \| null` | propagated from bus |
| `TopologyBranchV1.voltageLvKv` | `number \| null` | propagated from bus |

## Device Requirements

Each `FieldRole` has canonical device requirements defined in `DEVICE_REQUIREMENT_SETS`:

- `REQUIRED`: Device MUST be present (fixAction if missing)
- `REQUIRED_IF`: Device required under specific conditions
- `OPTIONAL`: Device may be present

## Validation & Fix Actions

28 stable fix codes in `FieldDeviceFixCodes` (all PL messages):

### Field-level
- `field.device_missing.cb` - CB wymagany ale nieobecny
- `field.device_missing.ct` - CT wymagany ale nieobecny
- `field.device_missing.relay` - Relay wymagany ale nieobecny
- `field.device_missing.cable_head` - Glowica kablowa wymagana
- `field.device_missing.transformer` - Transformator wymagany
- `field.device_missing.acb` - ACB wymagany
- `field.device_missing.generator` - Generator wymagany

### Station-level
- `station.embedding_role_undetermined` - Nie mozna wyznaczyc roli embedding
- `station.typology_conflict` - Konflikt stationType vs topologia **(NEW in RUN #3D-FIX)**
- `station.coupler_missing` - Stacja sekcyjna bez sprzegla
- `station.transformer_missing_for_sn_nn` - Stacja SN/nN bez transformatora
- `station.multiple_branches_requires_explicit_ports` - Wiele branchow wymaga jawnych portow

### Catalog
- `catalog.ref_missing` - Brak referencji katalogowej
- `catalog.ref_incomplete` - Niekompletna referencja katalogowa

### Parameter validation **(NEW in RUN #3D-FIX)**
- `device.cb.breaking_capacity_missing` - CB bez zdolnosci wylaczania
- `device.ct.ratio_missing` - CT bez przekladni
- `device.relay.settings_missing` - Relay bez nastaw zabezpieczen
- `device.transformer.rated_power_missing` - Transformator bez mocy znamionowej

### Protection
- `protection.relay_binding_missing` - Relay bez powiazania z CB
- `protection.relay_cb_binding_missing` - Relay wskazuje CB ktory nie istnieje

### Branch / Generator / Model
- `branch.nop_state_missing` - Brak stanu NOP
- `generator.block_transformer_missing` - OZE bez transformatora blokowego
- `model.nn_scope_missing` - Brak zakresu nN

**Zero fabrication**: Missing data generates FixAction, never fallback/default.

## Protection Binding (RUN #3D-FIX)

Relay-to-CB binding uses single criterion: `breakerId === domainDevice.nodeId`
(relay is on the same node as its CB). Iteration over `protectionByBreaker` map
entries is sorted by key for determinism.

`protectionByBreaker` is available at `buildStationBlocks` scope (not per-field),
enabling per-field validation: `fieldCbs.some(cb => protectionByBreaker.has(cb.id))`.

## Coupler Field (RUN #3D-FIX)

Coupler `busSectionId` is bound to the lower-index bus:
`sortedBusIds[Math.min(fromIdx, toIdx)]` (not always `busIds[0]`).

Coupler devices (CB, DS) are collected from branch nodes between bus sections,
and their `deviceIds` are populated in the coupler field.

## Station Type Classification (RUN #3D-FIX)

`classifyStationType()` in topologyAdapterV2.ts:
- DISTRIBUTION + hasTransformer → `TYPE_B` (before busCount check)
- This ensures stations with transformers but single bus get TYPE_B, not TYPE_A

## Determinism Guarantees

- Same TopologyInputV1 + SegmentationEdgeSets --> identical StationBlockBuildResult
- All arrays sorted by id (stationBlocks, fields, devices, anchors)
- 100x hash stability tested (all 154 tests)
- 50x permutation invariance tested (shuffled input arrays)
- 500+ node stress test verified
- No niedeterministyczne API (random, zegar, iteracja Set/Map)

## CI Guards (Guards 2-15)

| Guard | Description | Status |
|-------|-------------|--------|
| 2-8 | Core VisualGraphV1 contract guards | PASS |
| 9 | Zero string heuristics in visualGraph.ts **(fixed RUN #3D-FIX)** | PASS |
| 10 | ENM alignment | PASS |
| 11 | Station has members/fields | PASS |
| 12 | Field device requirements enforced (DEVICE_REQUIREMENT_SETS + validateFieldDevices) | PASS |
| 13 | Device catalog ref validation (CATALOG_REF_MISSING, no fabrication) | PASS |
| 14 | Relay binding fix actions (PROTECTION_RELAY_BINDING_MISSING) | PASS |
| 15 | Zero fabrication in builder (no auto-defaults, no fallbackDevice) | PASS |

Guard 1 (dual layout engine) is a pre-existing failure unrelated to RUN #3D.

## Files

| File | Purpose |
|------|---------|
| `fieldDeviceContracts.ts` | Domain contracts: FieldV1, DeviceV1, BusSectionV1, StationBlockDetailV1, validators, 28 FixCodes |
| `stationBlockBuilder.ts` | Builder: deriveEmbeddingRole, validateEmbeddingVsDomain, buildStationBlocks, buildFieldsForStation |
| `topologyAdapterV2.ts` | V2 pipeline: buildVisualGraphFromTopology, resolvePortId, classifyStationType |
| `topologyAdapterV1.ts` | Public API: convertToVisualGraph (delegates to V2 pipeline) |
| `topologyInputReader.ts` | Symbol bridge: readTopologyFromSymbols (voltageKv: null, bus.voltage_missing) |
| `visualGraph.ts` | VisualGraphV1 contract + validateVisualGraph (nodeType-only, zero string heuristics) |
| `layoutResult.ts` | Extended: SwitchgearBlockV1.detail |
| `layoutPipeline.ts` | Extended: computeLayout accepts StationBlockBuildResult |
| `index.ts` | Barrel exports for all RUN #3D types |

## Test Coverage

154 tests across 5 test files (all PASS):

### stationBlockBuilder.test.ts (33 tests)
- 6 EmbeddingRole derivation tests (incl. validateEmbeddingVsDomain)
- 7 Field/device building tests (relay binding, coupler, parameter validation)
- 3 Station block validation tests
- 5 Adapter integration tests
- 3 Layout pipeline integration tests
- 5 Determinism tests (100x hash, 50x permutation)
- 4 Golden network statistics tests

### visualGraph.test.ts (32 tests)
- PV/BESS classification via metadata (GeneratorKind), not string heuristics
- nodeType contract validation (not string-based)
- BUS_NN via voltageOverrides (not hardcoded 0.4kV)
- Switch as edge with isNormallyOpen (V2 pipeline)

### determinism.test.ts (22 tests)
- 100x hash stability
- 50x permutation invariance
- Metadata builders for OZE golden networks

### topologyAdapterV2.test.ts
- classifyStationType: DISTRIBUTION + transformer → TYPE_B

### layoutPipeline.test.ts
- V2 pipeline assertions (switches = edges, not nodes)

## Changelog (RUN #3D-FIX)

| FAZA | Scope | Key Changes |
|------|-------|-------------|
| 1 | Guard #9 + voltage | Eliminated string heuristics from validateVisualGraph; voltageKv: number\|null; bus.voltage_missing FixAction |
| 2 | Port semantics + typology | Bus ports IN/OUT (not BUS); resolvePortId; station.typology_conflict FixAction |
| 3 | Builder completion | Relay→CB binding (nodeId-only); coupler busSectionId (lower-index bus); parameter validation FixCodes |
| 4 | Verification | 154/154 tests pass; Guards 2-15 pass; determinism verified bit-for-bit |

