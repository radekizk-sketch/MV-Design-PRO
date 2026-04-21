> **Historical note (V12.5)**
> This file is preserved as historical reference only.
> docs/spec/ is not an active source of truth.
> Any binding, canonical, AS-IS, TO-BE, or roadmap language below reflects the original document state and is kept for audit context.
> Use ../INDEX_KANONICZNY.md to locate current canonical documentation.

# Result Contract v1 � Canonical ResultSet Specification

**Status**: FROZEN
**Version**: 1.0
**PR**: PR-15
**Effective from**: 2024-01

---

## 1. Purpose

ResultSetV1 defines the **single stable format** for all calculation results in MV-DESIGN-PRO. It serves as:

- The canonical output of the execution pipeline (StudyCase � Run � ResultSetV1)
- The **sole source** for SLD overlay data (PR-16)
- The input for Proof Engine, reporting, and export
- An auditable, deterministic result contract

## 2. Versioning

| Field | Value | Rule |
|-------|-------|------|
| `contract_version` | `"1.0"` | FROZEN � any structural change requires bump to `"2.0"` |
| Schema lock | `schemas/resultset_v1_schema.json` | Auto-generated from Pydantic model; test enforces match |

### Migration path

When v2 is needed:
1. Create `result_contract_v2.py` with new models
2. Keep v1 endpoints active for backward compatibility
3. Add `contract_version: "2.0"` to new model
4. Both versions served simultaneously until deprecation

## 3. Deterministic Signature

### Algorithm

```
1. Serialize ResultSetV1 to dict
2. Remove transient fields: created_at, deterministic_signature
3. Recursively sort all dict keys
4. Sort deterministic lists (element_results, badges, warnings, entries) by stable key
5. Serialize to canonical JSON: sort_keys=True, separators=(",",":")
6. SHA-256 the UTF-8 bytes
```

### Stable sort keys (priority order)

For list items: `ref_id` � `id` � `element_ref` � `code` � `label` � JSON dump fallback

### Guarantees

- **Identical ENM + StudyCase + SolverInput � identical signature**
- `created_at` does NOT affect the signature
- `deterministic_signature` does NOT affect itself (excluded from computation)
- Element ordering in input does NOT affect the signature (sorted before hashing)

## 4. ResultSetV1 Schema

```
ResultSetV1
+�� contract_version: "1.0"
+�� run_id: str (UUID)
+�� analysis_type: str (SC_3F | SC_1F | LOAD_FLOW)
+�� solver_input_hash: str (SHA-256)
+�� created_at: str (UTC ISO, NOT in signature)
+�� deterministic_signature: str (SHA-256)
+�� global_results: dict[str, Any]
+�� element_results: list[ElementResultV1]
-   L�� ElementResultV1
-       +�� element_ref: str
-       +�� element_type: str
-       L�� values: dict[str, Any]
L�� overlay_payload: OverlayPayloadV1
    +�� elements: dict[str, OverlayElementV1]
    -   L�� OverlayElementV1
    -       +�� ref_id: str
    -       +�� kind: OverlayElementKind
    -       +�� badges: list[OverlayBadgeV1]
    -       -   L�� OverlayBadgeV1
    -       -       +�� label: str (Polish)
    -       -       +�� severity: OverlaySeverity
    -       -       L�� code: str
    -       +�� metrics: dict[str, OverlayMetricV1]
    -       -   L�� OverlayMetricV1
    -       -       +�� code: str
    -       -       +�� value: float|int|str
    -       -       +�� unit: str
    -       -       +�� format_hint: str
    -       -       L�� source: "solver"|"validation"|"readiness"
    -       L�� severity: INFO|WARNING|IMPORTANT|BLOCKER
    +�� legend: OverlayLegendV1
    -   +�� title: str (Polish)
    -   L�� entries: list[OverlayLegendEntryV1]
    L�� warnings: list[OverlayWarningV1]
        +�� code: str
        +�� message: str (Polish)
        +�� severity: OverlaySeverity
        L�� element_ref: str|null
```

## 5. Overlay Payload as Sole SLD Source

### Rule

**SLD overlay (PR-16) reads ONLY `overlay_payload`** � never raw solver output.

### Rationale

- Decouples SLD rendering from solver internals
- Allows overlay to work with sparse data (badges only, no metrics)
- Enables centralized severity/badge logic in the builder
- Supports multiple overlay sources (solver, validation, readiness)

### Adapter

Frontend provides `toOverlayMap(resultset: ResultSetV1) => OverlayMap`:
- Converts `overlay_payload.elements` to a sorted `Map<ref_id, OverlayMapEntry>`
- Flattens metrics dict to sorted array
- Deterministic: same input � same output

## 6. Metric Codes

Standard metric codes used across all analysis types:

| Code | Description | Unit |
|------|-------------|------|
| `U_kV` | Voltage magnitude | kV |
| `V_PU` | Voltage per-unit | p.u. |
| `I_A` | Current | A |
| `IK_3F_A` | 3-phase short-circuit current | kA |
| `IK_1F_A` | 1-phase short-circuit current | kA |
| `IP_A` | Peak current | kA |
| `ITH_A` | Thermal equivalent current | kA |
| `SK_MVA` | Short-circuit power | MVA |
| `P_MW` | Active power | MW |
| `Q_Mvar` | Reactive power | Mvar |
| `S_MVA` | Apparent power | MVA |
| `LOADING_PCT` | Loading percentage | % |
| `ANGLE_DEG` | Voltage angle | deg |
| `LOSSES_P_MW` | Active power losses | MW |
| `LOSSES_Q_Mvar` | Reactive power losses | Mvar |

## 7. Badge Severity Levels

| Level | Use Case | UI Behavior |
|-------|----------|-------------|
| `INFO` | Element OK, results available | Blue indicator |
| `WARNING` | Validation warnings, non-blocking | Yellow indicator |
| `IMPORTANT` | Requires attention, may affect accuracy | Orange indicator |
| `BLOCKER` | Prevents correct calculations | Red indicator |

## 8. API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/execution/runs/{run_id}/results/v1` | Get ResultSetV1 for a completed run |
| GET | `/api/result-contract/schema` | Get locked JSON schema |

## 9. Files

### Backend
- `backend/src/domain/result_contract_v1.py` � Pydantic v2 models (FROZEN)
- `backend/src/domain/result_builder_v1.py` � Builder: solver+validation+readiness � ResultSetV1
- `backend/src/domain/result_contract_v1_schema.py` � Schema lock utilities
- `backend/src/api/result_contract_v1.py` � API endpoints
- `backend/schemas/resultset_v1_schema.json` � Locked JSON schema
- `backend/tests/test_result_contract_v1.py` � 34 tests

### Frontend
- `frontend/src/ui/contracts/results.ts` � TypeScript types + toOverlayMap adapter
- `frontend/src/ui/run-results-inspector/RunResultsInspector.tsx` � Minimal viewer
- `frontend/src/ui/contracts/__tests__/results.test.ts` � Adapter tests (5)
- `frontend/src/ui/run-results-inspector/__tests__/RunResultsInspector.test.tsx` � Component tests (7)

## 10. Invariants

1. **ZERO changes to solvers** � builder reads existing output only
2. **ZERO changes to catalogs** � no catalog mutations
3. **overlay_payload works with sparse data** � badges + legend minimum
4. **All UI labels in Polish** � no project codenames
5. **Deterministic sorting everywhere** � keys, lists, metrics
6. **Schema lock enforced by test** � changes require explicit decision
7. **contract_version = "1.0"** � bump = new model file
