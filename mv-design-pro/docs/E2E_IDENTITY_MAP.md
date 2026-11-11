# E2E Identity Map — ElementRefV1 System-Wide Contract

> CANONICAL DOCUMENT. Describes how element identity flows through the entire system.

## Overview

ElementRefV1 is the unified identity contract ensuring the SAME `elementId` is used
from wizard input through domain, snapshot, solver, results, SLD, and export.

```
KREATOR ──→ DOMENA ──→ SNAPSHOT ──→ SOLVER INPUT ──→ WYNIKI ──→ SLD ──→ EKSPORT
   |            |           |            |              |          |         |
   └── elementId ── ref_id ── element_id ── ref_id ── element_ref ── elementId ──┘
              ↑                                                            ↑
              └──────── ElementRefV1.elementId (JEDNO ZRODLO PRAWDY) ──────┘
```

## Identity Flow

### 1. Kreator → Domena

| Kreator (DTO) | Domena (ENM) | ElementRefV1 |
|----------------|-------------|--------------|
| `NodePayload.id` | `Bus.ref_id` | `elementId` |
| `BranchPayload.id` | `Branch.ref_id` | `elementId` |
| `SourcePayload.id` | `Source.ref_id` | `elementId` |
| `LoadPayload.id` | `Load.ref_id` | `elementId` |

Kreator tworzy element z UUID → ENM przechowuje jako `ref_id` → ElementRefV1 mapuje do `elementId`.

### 2. Domena → Snapshot

| ENM (models.py) | Snapshot (snapshot.py) | ElementRefV1 |
|------------------|----------------------|--------------|
| `Bus.ref_id` | `NetworkGraph.nodes[id]` | `elementId` |
| `Branch.ref_id` | `NetworkGraph.branches[id]` | `elementId` |
| `Station.id` | `NetworkGraph.stations[id]` | `elementId` |

Snapshot jest immutable, fingerprint = SHA-256 kanonicznego JSON.

### 3. Snapshot → Solver Input

| Snapshot | Solver Input (contracts.py) | ElementRefV1 |
|----------|---------------------------|--------------|
| `node.id` | `BusPayload.ref_id` | `elementId` |
| `branch.id` | `BranchPayload.ref_id` | `elementId` |
| `transformer.id` | `TransformerPayload.ref_id` | `elementId` |

`SolverInputIssue.element_ref` = `ElementRefV1.elementId`.

### 4. Solver → Wyniki (ResultSet)

| Solver Output | ResultSetV1 | ElementRefV1 |
|--------------|-------------|--------------|
| `bus_result.bus_id` | `ElementResultV1.element_ref` | `elementId` |
| `branch_result.branch_id` | `ElementResultV1.element_ref` | `elementId` |

`ResultSetV1.deterministic_signature` = SHA-256 kanonicznego JSON.

### 5. Wyniki → SLD (Overlay)

| ResultSetV1 | OverlayPayloadV1 | SLD |
|-------------|-----------------|-----|
| `ElementResultV1.element_ref` | `OverlayElementV1.ref_id` | `SldOverlayTokenV1.elementId` |

ResultJoinV1 laczy po `elementId` — brak zgadywania.

### 6. Wyniki → Inspektor

| ResultSetV1 | ResultJoinV1 | Inspektor |
|-------------|-------------|-----------|
| `ElementResultV1.element_ref` | `InspectorFactV1.elementId` | `InspectorPropertyField.key` |

### 7. SLD → Eksport

| SLD | ExportManifestV1 |
|-----|-----------------|
| `VisualNodeV1.attributes.elementId` | `manifest.elementIds[]` |

## ElementTypeV1 Mapping

| ElementTypeV1 | ENM (Python) | SLD (TypeScript) | ResultSet |
|--------------|-------------|-------------------|-----------|
| `NODE` | `Bus` | `BUS_SN` / `BUS_NN` | `element_type: "Bus"` |
| `BRANCH` | `Branch` (Line/Cable) | Edge (TRUNK/BRANCH) | `element_type: "Branch"` |
| `TRANSFORMER` | `Transformer` | `TRANSFORMER_WN_SN` / `TRANSFORMER_SN_NN` | `element_type: "Transformer"` |
| `STATION` | `Station` | `STATION_SN_NN_*` | - |
| `BUS_SECTION` | - | `BusSectionV1` | - |
| `FIELD` | - | `FieldV1` | - |
| `DEVICE` | - | `DeviceV1` | - |
| `GENERATOR` | `InverterSource` | `GENERATOR_PV/BESS/WIND` | `element_type: "Generator"` |
| `SOURCE` | `Source` | `GRID_SOURCE` | `element_type: "Source"` |
| `LOAD` | `Load` | `LOAD` | `element_type: "Load"` |
| `SWITCH` | `Switch` | Edge (isNormallyOpen) | - |
| `PROTECTION_ASSIGNMENT` | `ProtectionAssignment` | `DeviceV1 (RELAY)` | - |

## Gotowość do obliczeń (jeden walidator)

Gotowość modelu do SLD, zwarć, rozpływu i zabezpieczeń ocenia wyłącznie walidator ENM
(`enm/validator.py`) z `CalculationReadiness` (ADR-025, O-65). Dawny profil
`ReadinessProfileV1` z bramkami `require_*` (`sld_ready`, `short_circuit_ready`,
`load_flow_ready`, `protection_ready`) i wyjątkiem `ReadinessGateError` był drugą, równoległą
bramką bez konsumenta w produkcie — skasowany 2026-10-30 (commit 4 karty komunikatów; zapadka
`tests/enm/test_klucze_pol_w_komunikatach_src.py::test_druga_bramka_gotowosci_skasowana`).
W `domain/readiness.py` zostały typy rekordu braku `ReadinessIssueV1` / `ReadinessAreaV1` /
`ReadinessPriority`, używane przez mosty analiz zwracające braki obok wyniku.

## ResultJoinV1

Formal bridge: Snapshot + ResultSet → SLD tokens + Inspector facts.

```
Snapshot (ElementRefV1 index)
         +
ResultSet (element_results[])
         ↓
    joinResults()
         ↓
ResultJoinV1:
  - sldTokens[]       → tokeny na SLD (NIE wplywaja na geometrie)
  - inspectorFacts[]   → wiersz inspektora
  - orphanElementIds[] → wyniki bez elementu w Snapshot
  - unmatchedSnapshotIds[] → elementy bez wynikow
```

## ExportManifestV1 (IMPLEMENTED — KROK 5)

```
ExportManifestV1:
  snapshotHash: string         # Snapshot fingerprint
  layoutHash: string           # LayoutResult hash
  runHash: string | null       # ResultSet deterministic_signature
  elementIds: string[]         # All ElementRefV1.elementId used (sorted, deduplicated)
  analysisTypes: string[]      # SC_3F, LOAD_FLOW, etc. (sorted)
  createdAt: string            # ISO-8601 timestamp
  contentHash: string          # SHA-256 determinism seal

Files:
  backend:  src/domain/export_manifest.py
  frontend: src/ui/sld/core/exportManifest.ts
Tests:
  backend:  tests/test_e2e_determinism.py (TestExportManifestDeterminism + TestFullChainDeterminism)
  frontend: src/ui/sld/core/__tests__/exportManifest.test.ts
```

## Zero Fabrication Rule

At EVERY layer transition, missing data → FixAction (never default/fallback):

| Layer | Missing Data | FixAction Code |
|-------|-------------|----------------|
| Kreator → Domena | Brak voltageKv | `bus.voltage_missing` |
| Kreator → Domena | Brak catalogRef | `catalog.ref_missing` |
| Kreator → Domena | PV/BESS bez wariantu | `generator.connection_variant_missing` |
| Domena → Snapshot | Brak transformatora blokowego | `generator.block_transformer_missing` |
| Snapshot → Solver | Brak zrodla | `ELIG_NO_SOURCE` |
| Wyniki → SLD | Element bez laczenia | `ORPHAN_RESULT` |

## Files

### Backend
| File | Purpose |
|------|---------|
| `domain/element_ref.py` | ElementRefV1, ElementTypeV1, ElementScopeV1, CatalogRefV1 |
| `domain/readiness.py` | ReadinessIssueV1, ReadinessAreaV1, ReadinessPriority (rekord braku) |
| `domain/result_join.py` | ResultJoinV1, SldOverlayTokenV1, InspectorFactV1, join_results |
| `domain/result_contract_v1.py` | ResultSetV1, OverlayPayloadV1 (FROZEN v1.0) |
| `domain/eligibility_models.py` | AnalysisEligibilityMatrix (per-analysis eligibility) |
| `enm/fix_actions.py` | FixAction (UI suggestion) |

### Frontend
| File | Purpose |
|------|---------|
| `sld/core/topologyInputReader.ts` | TopologyFixAction (komunikaty z nazwą elementu, identyfikator w `elementRef`; `FieldDeviceFixCodes` skasowane w partii integracji 10) |
| `sld-overlay/overlayTypes.ts` | OverlayPayloadV1 (frontend mirror) |

## Invariants (BINDING)

1. **Jedno elementId**: identyczne we wszystkich warstwach (Kreator→Eksport)
2. **Brak zgadywania**: laczenie WYLACZNIE po elementId — brak string heurystyk
3. **Zero fabrication**: brak danych → FixAction, nigdy domyslna wartosc
4. **Determinism**: sorted by elementId na kazdej granicy warstw
5. **Immutable**: wszystkie kontrakty sa frozen/readonly
6. **PL labels**: komunikaty FixActions wylacznie po polsku
7. **Tokeny nie geometria**: SldOverlayTokenV1 NIE wpływa na pozycje/rozmiar/routing SLD
