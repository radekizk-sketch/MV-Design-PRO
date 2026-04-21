> **Historical note (V12.5)**
> This file is preserved as historical reference only.
> docs/spec/ is not an active source of truth.
> Any binding, canonical, AS-IS, TO-BE, or roadmap language below reflects the original document state and is kept for audit context.
> Use ../INDEX_KANONICZNY.md to locate current canonical documentation.

# SOLVER_INPUT_CONTRACT � v1.0

**Status: BINDING**
**Contract version: 1.0**
**Package: `backend/src/solver_input/`**

---

## 1. Purpose

This document defines the canonical contract for transforming ENM (Electrical Network Model)
topology + catalog data into solver-ready input. It covers:

- The versioned envelope schema (v1.0)
- Parameter provenance rules (CATALOG-FIRST)
- Eligibility gating (NO-DEFAULT policy)
- Determinism guarantees
- API endpoints

This contract closes the interpretive gap between ENM/topology and solvers. Solvers receive
"clean" input � no heuristics, no defaults, no UI references.

---

## 2. Determinism Guarantees

**Invariant:** Identical ENM + identical catalog + identical config � identical solver-input JSON.

Rules:
1. All lists in payload are sorted deterministically:
   - Primary: element type bucket (buses, branches, transformers, inverter_sources, switches)
   - Secondary: `ref_id` (lexicographic ascending)
2. All trace entries are sorted by `(element_ref, field_path)` ascending.
3. `provenance_summary.catalog_refs_used` is sorted lexicographically.
4. Value hashes use SHA-256 of JSON-encoded value with `sort_keys=True`.
5. No random values, no timestamps, no non-deterministic state in output.

---

## 3. Envelope Schema

```
SolverInputEnvelope:
  solver_input_version: "1.0"          # Contract version (locked)
  case_id: str                          # Study case identifier
  enm_revision: str                     # ENM snapshot/revision ID
  analysis_type: SolverAnalysisType     # Target analysis type
  eligibility: EligibilityResult        # Gating result
  provenance_summary: ProvenanceSummarySchema
  payload: dict                         # Analysis-specific payload (strict schema)
  trace: list[ProvenanceEntrySchema]    # Per-field provenance entries
```

### 3.1 Analysis Types

| Value | Description |
|-------|-------------|
| `short_circuit_3f` | Three-phase symmetrical short circuit (IEC 60909) |
| `short_circuit_1f` | Single-phase short circuit |
| `load_flow` | Newton-Raphson power flow |
| `protection` | Protection coordination (stub in v1.0) |

### 3.2 Eligibility

```
EligibilityResult:
  eligible: bool                # true if no BLOCKERs
  blockers: list[SolverInputIssue]
  warnings: list[SolverInputIssue]
  infos: list[SolverInputIssue]
```

If `eligible=false`, the solver MUST NOT be invoked. The payload may be partial or empty.

---

## 4. Provenance Rules

### 4.1 Source Kinds

| Kind | Meaning |
|------|---------|
| `CATALOG` | Value from catalog type library (via `type_ref`) |
| `OVERRIDE` | Explicit impedance override on instance |
| `DERIVED` | Computed from instance parameters or topology |
| `DEFAULT_FORBIDDEN` | Required field with no source � generates BLOCKER |

### 4.2 Trace Entry

Every technical/numerical field in the payload has a corresponding trace entry:

```
ProvenanceEntry:
  element_ref: str              # Element reference ID
  field_path: str               # Dotted path in payload
  source_kind: SourceKind       # CATALOG / OVERRIDE / DERIVED / DEFAULT_FORBIDDEN
  source_ref:
    catalog_ref: str?           # Catalog type ID (for CATALOG)
    catalog_path: str?          # Path in catalog
    override_reason: str?       # Reason for override (for OVERRIDE)
    derivation_rule: str?       # Rule name (for DERIVED)
  value_hash: str               # SHA-256 hash of value (first 16 chars)
  unit: str?                    # Physical unit
  note: str?                    # Technical note
```

### 4.3 CATALOG-FIRST Policy

Physical parameter precedence (canonical, from resolver):
1. `impedance_override` � source_kind=OVERRIDE
2. `type_ref` (catalog) � source_kind=CATALOG
3. Instance parameters � source_kind=DERIVED

If a field has no source and is required, the generator:
- Does NOT fill a default value (no zeros, no guesses)
- Adds a BLOCKER to eligibility
- Solver is NOT invoked

### 4.4 Provenance Summary

```
ProvenanceSummary:
  catalog_refs_used: sorted list of catalog type IDs
  overrides_used_count: int
  overrides_used_refs: sorted list of element ref_ids with overrides
  derived_fields_count: int
```

---

## 5. Payload Schemas

### 5.1 Short-Circuit Payload

```
ShortCircuitPayload:
  buses: list[BusPayload]
  branches: list[BranchPayload]
  transformers: list[TransformerPayload]
  inverter_sources: list[InverterSourcePayload]
  switches: list[SwitchPayload]
  c_factor: float               # Default: 1.10 (IEC 60909 MV max)
  thermal_time_seconds: float   # Default: 1.0
  include_inverter_contribution: bool  # Default: true
```

### 5.2 Load-Flow Payload

```
LoadFlowPayload:
  buses: list[BusPayload]
  branches: list[BranchPayload]
  transformers: list[TransformerPayload]
  inverter_sources: list[InverterSourcePayload]
  switches: list[SwitchPayload]
  base_mva: float               # Default: 100.0
  max_iterations: int           # Default: 50
  tolerance: float              # Default: 1e-6
```

### 5.3 Protection Payload (stub)

Empty in v1.0. Analysis type returns `eligible=false` with code `SI-100`.

---

## 6. Eligibility Issue Codes

| Code | Severity | Description |
|------|----------|-------------|
| E-D01 | BLOCKER | No SLACK (grid supply) node |
| SI-001 | BLOCKER | Branch has no catalog_ref, no override, and zero impedance |
| SI-002 | WARNING | Branch uses instance params without catalog_ref |
| SI-003 | BLOCKER | Branch catalog_ref not found in catalog |
| SI-004 | BLOCKER | Transformer has no catalog_ref and invalid nameplate |
| SI-005 | WARNING | Transformer uses instance params without catalog_ref |
| SI-006 | BLOCKER | Transformer catalog_ref not found in catalog |
| SI-007 | WARNING | Network graph not fully connected (islands) |
| SI-100 | BLOCKER | Protection analysis not implemented (stub) |

---

## 7. API Endpoints

### 7.1 Get Solver Input

```
GET /api/cases/{case_id}/analysis/solver-input/{analysis_type}
```

Returns `SolverInputEnvelope` with payload, eligibility, and trace.
Read-only, no side-effects.

### 7.2 Get Eligibility Map

```
GET /api/cases/{case_id}/analysis/eligibility
```

Returns eligibility status for all analysis types.
Read-only, no side-effects.

---

## 8. Heuristics Prohibition

Solvers and the solver-input builder MUST NOT:
- Guess missing parameter values
- Fill default physical constants
- Apply corrections not documented in trace
- Reference UI state or session data

Every value in the payload has a documented origin in the trace.

---

## 9. Multiplier / Quantity Policy

If an element has `quantity` or `n_parallel`:
- The payload includes one entry per element with a `multiplier` field
  (not duplicated entries)
- Provenance trace for the multiplier field uses `source_kind=DERIVED`
  with `derivation_rule="instance_quantity"` pointing to the source field

(Note: quantity/n_parallel support is reserved for future versions if
the ENM supports it. In v1.0, each element is a single entry.)

---

## 10. Versioning

- Contract version is `SOLVER_INPUT_CONTRACT_VERSION = "1.0"`
- Schema changes require an explicit version bump
- Schema lock tests (`test_solver_input_schema_lock.py`) enforce stability
- Breaking changes create a new major version (2.0)
- Additive-only changes increment minor version (1.1)
