# LOAD FLOW RESULTSET V1 CONTRACT

> **Status**: HISTORICZNY — nadpisany kanonem V12.xx (korekta 2026-09-05, karta CV-3.3-A2).
> Ten dokument nie jest w hierarchii dokumentów `CLAUDE.md` (spisany przed jej wprowadzeniem,
> 2026-02-13). Mapper opisany niżej jako kanoniczny (`load_flow_to_resultset_v1.py`, docelowo
> wpinany w krok 9 `execution_engine/service.py` — patrz `LOAD_FLOW_DEPENDENCY_GRAPH.md`) miał
> ZERO konsumenta produkcyjnego po kasacji E3 i został skasowany razem z dedykowanym testem
> (`CONVERGENCE_ROADMAP.md` CV-3.3-A2). Dzisiejszy jedyny, żywy, analiz-typ-agnostyczny
> producent kontraktu `ResultSet v1` to `domain/result_contract_v1.py::ResultSetV1` przez
> `application/result_mapping/canonical_run_to_resultset_v1.py::build_resultset_v1_from_canonical_run`
> — INNY typ niż `domain/execution.py::ResultSet`, do którego mapuje ten dokument. Treść
> poniżej zostaje jako zapis historyczny projektu z RUN #2A/2B (przed CV-0…CV-6), nie jako
> obowiązujący kontrakt.
>
> **Status (pierwotny)**: BINDING (CANONICAL)
> **Version**: 1.0.0
> **Date**: 2026-02-13
> **Scope**: Canonical ResultSet contract for Load Flow analysis — maps PowerFlowResultV1 (frozen solver output) to the unified ResultSet domain model
> **Alignment**: SYSTEM_SPEC.md, ARCHITECTURE.md, execution.py (ResultSet, ElementResult, build_result_set)

---

## Table of Contents

1. [Purpose and Scope](#1-purpose-and-scope)
2. [Metadata](#2-metadata)
3. [Nodes](#3-nodes)
4. [Branches](#4-branches)
5. [Totals](#5-totals)
6. [Warnings](#6-warnings)
7. [Errors](#7-errors)
8. [Float Policy](#8-float-policy)
9. [Deterministic Signature](#9-deterministic-signature)
10. [Mapping from PowerFlowResultV1](#10-mapping-from-powerflowresultv1)
11. [Relationship to SC/Protection ResultSets](#11-relationship-to-scprotection-resultsets)
12. [JSON Schema (Canonical)](#12-json-schema-canonical)
13. [Invariants Checklist](#13-invariants-checklist)

---

## 1. Purpose and Scope

LoadFlowResultSetV1 is the **canonical application-level result contract** for Load Flow analysis. It bridges the frozen solver-level `PowerFlowResultV1` (defined in `network_model/solvers/power_flow_result.py`, version 1.0.0) to the unified `ResultSet` domain model (defined in `domain/execution.py`).

### 1.1 Design Principles

- **Pure data mapping**: The mapper performs ZERO physics calculations. All values are taken directly from `PowerFlowResultV1` or derived via trivial arithmetic (voltage_kV = v_pu * base_voltage_kv).
- **Deterministic**: Identical `PowerFlowResultV1` input produces identical `LoadFlowResultSetV1` output, byte-for-byte.
- **WHITE BOX**: Every field has a documented origin. No hidden transformations, no undocumented rounding.
- **Solver-untouched**: `PowerFlowResultV1` is FROZEN. This contract does NOT modify or extend the solver result.
- **Separate from SC/Protection**: LoadFlowResultSetV1 has its own contract, its own mapper, its own deterministic signature. No shared mutable state with SC or Protection ResultSets.

### 1.2 Canonical Files

| Artifact | File Path |
|----------|-----------|
| Solver Result (FROZEN) | `backend/src/network_model/solvers/power_flow_result.py` |
| Domain ResultSet | `backend/src/domain/execution.py` (ResultSet, ElementResult, build_result_set) |
| Mapper (to be created) | `backend/src/application/result_mapping/load_flow_to_resultset_v1.py` |
| This Contract | `docs/analysis/LOAD_FLOW_RESULTSET_V1.md` |

---

## 2. Metadata

The metadata block identifies the LoadFlowResultSetV1 instance and ties it to a specific run, network snapshot, and solver execution.

### 2.1 Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `analysis_type` | `str` | YES | Fixed value: `"LOAD_FLOW"` |
| `result_version` | `str` | YES | Fixed value: `"1.0.0"` |
| `snapshot_hash` | `str` | YES | SHA-256 of the network snapshot used for this run. Computed from the canonical JSON representation of the NetworkModel state at solver invocation time. |
| `run_hash` | `str` | YES | SHA-256 of the `LoadFlowRunInput` canonical representation. Encodes all solver parameters (tolerance, max_iter, slack definition, PQ/PV specs, options). |
| `input_hash` | `str` | YES | SHA-256 of the canonical JSON of the complete solver input. This is the `solver_input_hash` from the Run domain model. Computed via `compute_solver_input_hash()` from `domain/execution.py`. |
| `status` | `StatusBlock` | YES | Convergence status block (see 2.2). |

### 2.2 Status Block

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `convergence_status` | `str` | YES | One of: `"CONVERGED"`, `"NOT_CONVERGED"`, `"FAILED_VALIDATION"`, `"FAILED_SOLVER"` |
| `iteration_count` | `int` | YES | Number of solver iterations performed. 0 if `FAILED_VALIDATION` or `FAILED_SOLVER`. |

**Convergence Status Semantics:**

| Status | Meaning | Source |
|--------|---------|--------|
| `CONVERGED` | Solver converged within tolerance and iteration limit | `PowerFlowResultV1.converged == True` |
| `NOT_CONVERGED` | Solver ran to iteration limit without convergence | `PowerFlowResultV1.converged == False` AND solver completed |
| `FAILED_VALIDATION` | Pre-solver validation failed (e.g., missing impedance, no slack) | Validation layer rejected input before solver invocation |
| `FAILED_SOLVER` | Solver raised an exception (numerical singularity, etc.) | Exception caught during solver execution |

**Invariants:**
- `convergence_status` is determined BEFORE result mapping. The mapper receives the status as input.
- When `convergence_status` is `FAILED_VALIDATION` or `FAILED_SOLVER`, the `nodes[]`, `branches[]`, and `totals` sections are EMPTY (zero-length arrays / null totals).
- `iteration_count` corresponds to `PowerFlowResultV1.iterations_count`.

### 2.3 Metadata JSON Example

```json
{
  "analysis_type": "LOAD_FLOW",
  "result_version": "1.0.0",
  "snapshot_hash": "a3f1c8e9...64 hex chars",
  "run_hash": "b7d2e4f1...64 hex chars",
  "input_hash": "c9a3b5d7...64 hex chars",
  "status": {
    "convergence_status": "CONVERGED",
    "iteration_count": 7
  }
}
```

---

## 3. Nodes

The `nodes` array contains per-bus results from the Load Flow solution. Sorted **lexicographically by `node_id`** (ascending, Unicode code-point order).

### 3.1 Fields

| Field | Type | Required | Description | Unit |
|-------|------|----------|-------------|------|
| `node_id` | `str` | YES | Bus identifier. Matches `PowerFlowBusResult.bus_id`. | -- |
| `voltage_pu` | `float` | YES | Voltage magnitude in per-unit. | p.u. |
| `voltage_kV` | `float` | YES | Voltage magnitude in kilovolts. Derived: `voltage_pu * base_voltage_kv` where `base_voltage_kv` is the rated voltage of the bus from the NetworkModel. | kV |
| `angle_deg` | `float` | YES | Voltage angle in degrees. | deg |
| `p_injected_mw` | `float` | YES | Net active power injected at this bus. Positive = generation into bus. Negative = load (withdrawal). | MW |
| `q_injected_mvar` | `float` | YES | Net reactive power injected at this bus. Positive = capacitive injection. Negative = inductive withdrawal. | Mvar |

### 3.2 Sort Guarantee

Nodes are sorted **lexicographically by `node_id`** (ascending). This is enforced by the mapper and verified by the deterministic signature. The sort order matches `PowerFlowResultV1.bus_results` which is already sorted by `bus_id` in `build_power_flow_result_v1()`.

### 3.3 Voltage kV Derivation

```
voltage_kV = voltage_pu * base_voltage_kv(node_id)
```

Where `base_voltage_kv(node_id)` is the rated voltage of the bus obtained from one of:
1. The `node_voltage_kv` dict in `PowerFlowNewtonSolution` (solver already computes `abs(V_pu) * voltage_level` per node).
2. The NetworkModel snapshot's bus `voltage_kv` field (the `voltage_level` property on the graph node).

**Precedence rule**: If `PowerFlowNewtonSolution.node_voltage_kv[node_id]` is available, use it directly. Otherwise, compute from `voltage_pu * bus.voltage_level` using the NetworkModel snapshot.

**Invariant**: `voltage_kV` MUST be present for every node. If `base_voltage_kv` is unknown (missing from snapshot), the mapper MUST emit a warning (see section 6) and set `voltage_kV` to `0.0`.

### 3.4 Node JSON Example

```json
{
  "node_id": "bus-001",
  "voltage_pu": 1.0142,
  "voltage_kV": 20.284,
  "angle_deg": -2.347,
  "p_injected_mw": -1.500,
  "q_injected_mvar": -0.450
}
```

---

## 4. Branches

The `branches` array contains per-branch results from the Load Flow solution. Sorted **lexicographically by `branch_id`** (ascending, Unicode code-point order).

### 4.1 Fields

| Field | Type | Required | Description | Unit |
|-------|------|----------|-------------|------|
| `branch_id` | `str` | YES | Branch identifier. Matches `PowerFlowBranchResult.branch_id`. | -- |
| `from_node_id` | `str` | YES | Bus ID of the "from" terminal. Obtained from NetworkModel snapshot (branch topology). | -- |
| `to_node_id` | `str` | YES | Bus ID of the "to" terminal. Obtained from NetworkModel snapshot (branch topology). | -- |
| `P_from_mw` | `float` | YES | Active power at the "from" terminal. Positive = power flowing into the branch from the "from" bus. | MW |
| `Q_from_mvar` | `float` | YES | Reactive power at the "from" terminal. | Mvar |
| `P_to_mw` | `float` | YES | Active power at the "to" terminal. Positive = power flowing into the branch from the "to" bus. | MW |
| `Q_to_mvar` | `float` | YES | Reactive power at the "to" terminal. | Mvar |
| `I_from_ka` | `float \| null` | YES | Current magnitude at the "from" terminal in kiloamperes. `null` if not computable (missing base voltage for from-bus). | kA |
| `I_to_ka` | `float \| null` | YES | Current magnitude at the "to" terminal in kiloamperes. `null` if not computable (missing base voltage for to-bus). | kA |
| `losses_p_mw` | `float` | YES | Active power losses in this branch: `P_from_mw + P_to_mw`. | MW |
| `losses_q_mvar` | `float` | YES | Reactive power losses in this branch: `Q_from_mvar + Q_to_mvar`. | Mvar |

### 4.2 Sort Guarantee

Branches are sorted **lexicographically by `branch_id`** (ascending). This is enforced by the mapper and verified by the deterministic signature. The sort order matches `PowerFlowResultV1.branch_results` which is already sorted by `branch_id` in `build_power_flow_result_v1()`.

### 4.3 Current Derivation

Branch currents (`I_from_ka`, `I_to_ka`) are derived from power flow and bus voltage:

```
S_from = P_from_mw + j * Q_from_mvar    [MVA]
V_from = voltage_kV(from_node_id)         [kV]

I_from_ka = |S_from| / (sqrt(3) * V_from)   [kA]
```

Similarly for `I_to_ka`:

```
S_to = P_to_mw + j * Q_to_mvar           [MVA]
V_to = voltage_kV(to_node_id)             [kV]

I_to_ka = |S_to| / (sqrt(3) * V_to)         [kA]
```

**Null conditions**:
- If `V_from == 0.0` or `V_from` is unknown: `I_from_ka = null`
- If `V_to == 0.0` or `V_to` is unknown: `I_to_ka = null`

**Alternative source**: If the solver provides `branch_current_ka` (available in `PowerFlowNewtonSolution`), use that directly instead of deriving. The derivation formula above is the fallback when direct solver data is unavailable.

**Invariant**: The current derivation is the ONLY calculation performed by the mapper. It is trivial S/V arithmetic, not physics. The mapper MUST NOT perform load flow iterations, impedance calculations, or any other solver-level computation.

### 4.4 Topology Enrichment

`from_node_id` and `to_node_id` are NOT present in `PowerFlowBranchResult` (which only has `branch_id`). They MUST be resolved from the NetworkModel snapshot:

```python
branch = network_snapshot.get_branch(branch_id)
from_node_id = branch.from_node_id
to_node_id = branch.to_node_id
```

If a `branch_id` from solver output cannot be resolved in the snapshot (orphaned branch), the mapper MUST emit an error (see section 7) and EXCLUDE that branch from the result.

### 4.5 Branch JSON Example

```json
{
  "branch_id": "line-015",
  "from_node_id": "bus-003",
  "to_node_id": "bus-007",
  "P_from_mw": 2.145,
  "Q_from_mvar": 0.672,
  "P_to_mw": -2.103,
  "Q_to_mvar": -0.651,
  "I_from_ka": 0.0621,
  "I_to_ka": 0.0609,
  "losses_p_mw": 0.042,
  "losses_q_mvar": 0.021
}
```

---

## 5. Totals

The `totals` object contains system-wide summary values for the Load Flow solution.

### 5.1 Fields

| Field | Type | Required | Description | Unit |
|-------|------|----------|-------------|------|
| `total_losses_p_mw` | `float` | YES | Total active power losses in the network. Sum of all branch `losses_p_mw`. | MW |
| `total_losses_q_mvar` | `float` | YES | Total reactive power losses in the network. Sum of all branch `losses_q_mvar`. | Mvar |
| `slack_p_mw` | `float` | YES | Active power supplied by the slack bus. | MW |
| `slack_q_mvar` | `float` | YES | Reactive power supplied by the slack bus. | Mvar |
| `min_v_pu` | `float` | YES | Minimum voltage magnitude across all buses. | p.u. |
| `max_v_pu` | `float` | YES | Maximum voltage magnitude across all buses. | p.u. |
| `power_balance_check` | `float` | YES | Power balance residual: sum of all `p_injected_mw` across all nodes. Should be approximately zero (generation = load + losses). A non-zero value beyond solver tolerance indicates a balance issue. | MW |

### 5.2 Power Balance Check Derivation

```
power_balance_check = sum(node.p_injected_mw for node in nodes)
```

This value represents the net active power injection across the entire network. In a converged power flow:
- All generation (including slack) injects positive power.
- All loads withdraw negative power.
- The sum should equal approximately zero, with the residual being within solver tolerance.

**Invariant**: `power_balance_check` is computed by the mapper from the `nodes[]` array. It is NOT taken from the solver. This provides an independent verification of the solver's power balance.

### 5.3 Totals JSON Example

```json
{
  "total_losses_p_mw": 0.347,
  "total_losses_q_mvar": 0.198,
  "slack_p_mw": 5.847,
  "slack_q_mvar": 2.148,
  "min_v_pu": 0.9721,
  "max_v_pu": 1.0142,
  "power_balance_check": 0.000012
}
```

---

## 6. Warnings

The `warnings` array contains deterministic diagnostic messages produced by the mapper. Sorted **lexicographically by `code`** (ascending).

### 6.1 Warning Structure

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | `str` | YES | Machine-stable warning code. Format: `W-LF-NNN`. |
| `message` | `str` | YES | Human-readable message (Polish). |
| `element_ref` | `str \| null` | NO | Affected element ID (if element-specific). |
| `severity` | `str` | YES | One of: `"INFO"`, `"WARNING"`. |

### 6.2 Warning Code Registry

| Code | Severity | Condition | Message (Polish) |
|------|----------|-----------|------------------|
| `W-LF-001` | `WARNING` | Bus base voltage unknown (voltage_kV set to 0.0) | `"Brak napięcia bazowego dla węzła {node_id} — voltage_kV ustawione na 0.0"` |
| `W-LF-002` | `WARNING` | Branch current not computable (I_from_ka or I_to_ka is null) | `"Prąd gałęzi {branch_id} nieobliczalny — brak napięcia bazowego węzła"` |
| `W-LF-003` | `INFO` | Solver did not converge but partial results are included | `"Solver nie osiągnął zbieżności — wyniki częściowe"` |
| `W-LF-004` | `WARNING` | Power balance residual exceeds 0.01 MW | `"Bilans mocy czynnej: residuum {value} MW przekracza 0.01 MW"` |
| `W-LF-005` | `INFO` | PV bus switched to PQ mode during iteration | `"Węzeł PV {node_id} przełączony na tryb PQ (przekroczenie limitu Q)"` |

### 6.3 Sort Guarantee

Warnings are sorted **lexicographically by `code`** (ascending). If multiple warnings share the same code, they are further sorted by `element_ref` (nulls first).

### 6.4 Determinism Rule

Warnings are fully deterministic: identical solver output + identical network snapshot produce identical warnings in identical order. No timestamp-dependent or random warnings.

### 6.5 Warning JSON Example

```json
[
  {
    "code": "W-LF-001",
    "message": "Brak napięcia bazowego dla węzła bus-042 — voltage_kV ustawione na 0.0",
    "element_ref": "bus-042",
    "severity": "WARNING"
  },
  {
    "code": "W-LF-004",
    "message": "Bilans mocy czynnej: residuum 0.0234 MW przekracza 0.01 MW",
    "element_ref": null,
    "severity": "WARNING"
  }
]
```

---

## 7. Errors

The `errors` array contains deterministic error messages that indicate structural problems in the result mapping. Sorted **lexicographically by `code`** (ascending).

### 7.1 Error Structure

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | `str` | YES | Machine-stable error code. Format: `E-LF-NNN`. |
| `message` | `str` | YES | Human-readable message (Polish). |
| `element_ref` | `str \| null` | NO | Affected element ID (if element-specific). |
| `severity` | `str` | YES | Always `"BLOCKER"`. |

### 7.2 Error Code Registry

| Code | Severity | Condition | Message (Polish) |
|------|----------|-----------|------------------|
| `E-LF-001` | `BLOCKER` | Branch ID from solver not found in network snapshot | `"Gałąź {branch_id} z wyników solvera nie istnieje w snapshocie sieci"` |
| `E-LF-002` | `BLOCKER` | Bus ID from solver not found in network snapshot | `"Węzeł {bus_id} z wyników solvera nie istnieje w snapshocie sieci"` |
| `E-LF-003` | `BLOCKER` | Solver returned FAILED_SOLVER status | `"Solver zakończył się błędem: {error_detail}"` |
| `E-LF-004` | `BLOCKER` | Validation failed pre-solver | `"Walidacja wejściowa zakończona niepowodzeniem: {validation_detail}"` |

### 7.3 Sort Guarantee

Errors are sorted **lexicographically by `code`** (ascending). If multiple errors share the same code, they are further sorted by `element_ref` (nulls first).

### 7.4 Determinism Rule

Errors are fully deterministic: identical conditions produce identical errors in identical order.

### 7.5 Error JSON Example

```json
[
  {
    "code": "E-LF-001",
    "message": "Gałąź line-099 z wyników solvera nie istnieje w snapshocie sieci",
    "element_ref": "line-099",
    "severity": "BLOCKER"
  }
]
```

---

## 8. Float Policy

All floating-point values in LoadFlowResultSetV1 are processed through a single canonical float function to ensure platform-independent determinism.

### 8.1 Canonical Float Function

```python
def canonical_float(value: float, precision: int = 10) -> float:
    """
    Round a float to a fixed number of significant decimal digits
    for deterministic cross-platform serialization.

    Args:
        value: The raw float value.
        precision: Number of decimal digits to retain (default: 10).

    Returns:
        Rounded float value.

    Invariants:
        - Same input always produces same output, regardless of platform.
        - No locale-dependent formatting.
        - IEEE 754 double-precision assumed.
        - NaN and Inf are forbidden (raise ValueError).
    """
    import math
    if math.isnan(value) or math.isinf(value):
        raise ValueError(f"canonical_float: NaN/Inf not allowed: {value}")
    return round(value, precision)
```

### 8.2 Application Rules

| Context | Precision | Example |
|---------|-----------|---------|
| `voltage_pu` | 10 digits | `1.0142356789` |
| `voltage_kV` | 6 digits | `20.284712` |
| `angle_deg` | 6 digits | `-2.347123` |
| `p_injected_mw`, `q_injected_mvar` | 6 digits | `-1.500123` |
| `P_from_mw`, `Q_from_mvar`, `P_to_mw`, `Q_to_mvar` | 6 digits | `2.145012` |
| `I_from_ka`, `I_to_ka` | 6 digits | `0.062134` |
| `losses_p_mw`, `losses_q_mvar` | 6 digits | `0.042001` |
| `total_losses_p_mw`, `total_losses_q_mvar` | 6 digits | `0.347001` |
| `slack_p_mw`, `slack_q_mvar` | 6 digits | `5.847012` |
| `min_v_pu`, `max_v_pu` | 10 digits | `0.9721034567` |
| `power_balance_check` | 10 digits | `0.0000120000` |

### 8.3 Platform Independence

- Decimal separator is always `.` (dot). No locale-dependent formatting.
- JSON serialization uses Python `json.dumps()` with `default=str` and `separators=(",", ":")` for canonical output.
- No trailing zeros are enforced in JSON serialization (Python `json.dumps` default float formatting). The `canonical_float` function ensures the numerical value is deterministic; JSON serialization handles the string representation.
- NaN and Inf are FORBIDDEN. If the solver produces NaN/Inf, the mapper MUST emit an error (E-LF-003) and set the status to FAILED_SOLVER.

---

## 9. Deterministic Signature

Every LoadFlowResultSetV1 carries a SHA-256 deterministic signature that uniquely identifies its content.

### 9.1 Signature Computation

```
deterministic_signature = SHA-256(canonical_json(signature_payload))
```

### 9.2 Signature Payload

The signature payload includes ALL non-transient fields:

```json
{
  "analysis_type": "LOAD_FLOW",
  "result_version": "1.0.0",
  "snapshot_hash": "...",
  "run_hash": "...",
  "input_hash": "...",
  "status": { "convergence_status": "...", "iteration_count": N },
  "nodes": [ ... sorted by node_id ... ],
  "branches": [ ... sorted by branch_id ... ],
  "totals": { ... },
  "warnings": [ ... sorted by code ... ],
  "errors": [ ... sorted by code ... ]
}
```

### 9.3 Excluded Fields

The following fields are EXCLUDED from the signature (transient metadata):

- `created_at` (timestamp of ResultSet creation)
- `deterministic_signature` itself (circular dependency)

### 9.4 Canonical JSON Algorithm

The canonical JSON representation uses the same algorithm as `domain/execution.py`:

```python
def canonical_json(payload: dict) -> str:
    """
    Produce a canonical JSON string for deterministic hashing.

    1. Recursively sort all dict keys alphabetically.
    2. Sort deterministic list keys (nodes, branches, warnings, errors)
       by their primary sort key (node_id, branch_id, code).
    3. Serialize with json.dumps(sort_keys=True, separators=(",", ":")).
    4. Encode as UTF-8.
    """
    canonical = _canonicalize(payload)
    return json.dumps(canonical, sort_keys=True, separators=(",", ":"), default=str)
```

**Deterministic list keys** for LoadFlowResultSetV1 (to be added to `_DETERMINISTIC_LIST_KEYS` in `execution.py`):

| Key | Sort Field |
|-----|-----------|
| `nodes` | `node_id` |
| `branches` | `branch_id` |
| `warnings` | `code`, then `element_ref` |
| `errors` | `code`, then `element_ref` |

Note: `nodes` is already in `_DETERMINISTIC_LIST_KEYS`. `branches` is also already present. `warnings` and `errors` are sorted explicitly by the mapper before inclusion.

### 9.5 Signature Verification

```python
def verify_signature(resultset: LoadFlowResultSetV1) -> bool:
    """Verify that the deterministic signature matches the content."""
    payload = build_signature_payload(resultset)
    expected = hashlib.sha256(canonical_json(payload).encode("utf-8")).hexdigest()
    return resultset.deterministic_signature == expected
```

### 9.6 Signature Invariant

**BINDING**: Identical `PowerFlowResultV1` + identical NetworkModel snapshot + identical run parameters produce an identical `deterministic_signature`. This is the foundational determinism guarantee.

---

## 10. Mapping from PowerFlowResultV1

This section defines the exact field-by-field mapping from the frozen `PowerFlowResultV1` (solver output) to `LoadFlowResultSetV1` (application-level result).

### 10.1 Field Mapping Table: Metadata

| LoadFlowResultSetV1 Field | Source | Derivation |
|---------------------------|--------|------------|
| `analysis_type` | Constant | `"LOAD_FLOW"` |
| `result_version` | Constant | `"1.0.0"` |
| `snapshot_hash` | Run context | SHA-256 of network snapshot JSON |
| `run_hash` | Run context | SHA-256 of LoadFlowRunInput canonical JSON |
| `input_hash` | Run domain model | `Run.solver_input_hash` |
| `status.convergence_status` | `PowerFlowResultV1.converged` | `True` -> `"CONVERGED"`, `False` -> `"NOT_CONVERGED"` (or `"FAILED_*"` from exception handling) |
| `status.iteration_count` | `PowerFlowResultV1.iterations_count` | Direct copy |

### 10.2 Field Mapping Table: Nodes

| LoadFlowResultSetV1 Field | PowerFlowResultV1 Source | Derivation |
|---------------------------|--------------------------|------------|
| `node_id` | `PowerFlowBusResult.bus_id` | Direct copy |
| `voltage_pu` | `PowerFlowBusResult.v_pu` | `canonical_float(v_pu, 10)` |
| `voltage_kV` | Derived | `canonical_float(v_pu * base_voltage_kv, 6)` where `base_voltage_kv` from NetworkModel snapshot or `PowerFlowNewtonSolution.node_voltage_kv` |
| `angle_deg` | `PowerFlowBusResult.angle_deg` | `canonical_float(angle_deg, 6)` |
| `p_injected_mw` | `PowerFlowBusResult.p_injected_mw` | `canonical_float(p_injected_mw, 6)` |
| `q_injected_mvar` | `PowerFlowBusResult.q_injected_mvar` | `canonical_float(q_injected_mvar, 6)` |

### 10.3 Field Mapping Table: Branches

| LoadFlowResultSetV1 Field | PowerFlowResultV1 Source | Derivation |
|---------------------------|--------------------------|------------|
| `branch_id` | `PowerFlowBranchResult.branch_id` | Direct copy |
| `from_node_id` | NetworkModel snapshot | `snapshot.get_branch(branch_id).from_node_id` |
| `to_node_id` | NetworkModel snapshot | `snapshot.get_branch(branch_id).to_node_id` |
| `P_from_mw` | `PowerFlowBranchResult.p_from_mw` | `canonical_float(p_from_mw, 6)` |
| `Q_from_mvar` | `PowerFlowBranchResult.q_from_mvar` | `canonical_float(q_from_mvar, 6)` |
| `P_to_mw` | `PowerFlowBranchResult.p_to_mw` | `canonical_float(p_to_mw, 6)` |
| `Q_to_mvar` | `PowerFlowBranchResult.q_to_mvar` | `canonical_float(q_to_mvar, 6)` |
| `I_from_ka` | Derived or solver | See section 4.3. `canonical_float(value, 6)` or `null`. |
| `I_to_ka` | Derived or solver | See section 4.3. `canonical_float(value, 6)` or `null`. |
| `losses_p_mw` | `PowerFlowBranchResult.losses_p_mw` | `canonical_float(losses_p_mw, 6)` |
| `losses_q_mvar` | `PowerFlowBranchResult.losses_q_mvar` | `canonical_float(losses_q_mvar, 6)` |

### 10.4 Field Mapping Table: Totals

| LoadFlowResultSetV1 Field | PowerFlowResultV1 Source | Derivation |
|---------------------------|--------------------------|------------|
| `total_losses_p_mw` | `PowerFlowSummary.total_losses_p_mw` | `canonical_float(value, 6)` |
| `total_losses_q_mvar` | `PowerFlowSummary.total_losses_q_mvar` | `canonical_float(value, 6)` |
| `slack_p_mw` | `PowerFlowSummary.slack_p_mw` | `canonical_float(value, 6)` |
| `slack_q_mvar` | `PowerFlowSummary.slack_q_mvar` | `canonical_float(value, 6)` |
| `min_v_pu` | `PowerFlowSummary.min_v_pu` | `canonical_float(value, 10)` |
| `max_v_pu` | `PowerFlowSummary.max_v_pu` | `canonical_float(value, 10)` |
| `power_balance_check` | Computed by mapper | `canonical_float(sum(node.p_injected_mw for node in nodes), 10)` |

### 10.5 Sort Guarantees

| Collection | Sort Key | Order | Already Sorted in PowerFlowResultV1? |
|------------|----------|-------|---------------------------------------|
| `nodes` | `node_id` | Lexicographic ascending | YES (`build_power_flow_result_v1` sorts by `bus_id`) |
| `branches` | `branch_id` | Lexicographic ascending | YES (`build_power_flow_result_v1` sorts by `branch_id`) |
| `warnings` | `code`, then `element_ref` | Lexicographic ascending | N/A (generated by mapper) |
| `errors` | `code`, then `element_ref` | Lexicographic ascending | N/A (generated by mapper) |

**Double-sort guarantee**: Even though `PowerFlowResultV1` pre-sorts its tuples, the mapper MUST re-sort after mapping to guarantee determinism regardless of future solver changes. This is a defense-in-depth measure.

### 10.6 Mapping to ResultSet Domain Model

LoadFlowResultSetV1 maps to the `ResultSet` domain model (from `domain/execution.py`) as follows:

| ResultSet Field | LoadFlowResultSetV1 Source |
|----------------|---------------------------|
| `run_id` | Run UUID (from execution context) |
| `analysis_type` | `ExecutionAnalysisType.LOAD_FLOW` |
| `validation_snapshot` | Validation state at run time |
| `readiness_snapshot` | Readiness state at run time |
| `element_results` | See 10.7 below |
| `global_results` | See 10.8 below |
| `deterministic_signature` | Computed by `build_result_set()` |

### 10.7 Element Results Mapping

Each node becomes an `ElementResult` with `element_type = "bus"`:

```python
ElementResult(
    element_ref=node.node_id,
    element_type="bus",
    values={
        "voltage_pu": node.voltage_pu,
        "voltage_kV": node.voltage_kV,
        "angle_deg": node.angle_deg,
        "p_injected_mw": node.p_injected_mw,
        "q_injected_mvar": node.q_injected_mvar,
    },
)
```

Each branch becomes an `ElementResult` with `element_type = "branch"`:

```python
ElementResult(
    element_ref=branch.branch_id,
    element_type="branch",
    values={
        "from_node_id": branch.from_node_id,
        "to_node_id": branch.to_node_id,
        "P_from_mw": branch.P_from_mw,
        "Q_from_mvar": branch.Q_from_mvar,
        "P_to_mw": branch.P_to_mw,
        "Q_to_mvar": branch.Q_to_mvar,
        "I_from_ka": branch.I_from_ka,
        "I_to_ka": branch.I_to_ka,
        "losses_p_mw": branch.losses_p_mw,
        "losses_q_mvar": branch.losses_q_mvar,
    },
)
```

All `ElementResult` entries are sorted by `element_ref` (enforced by `build_result_set()`).

### 10.8 Global Results Mapping

```python
global_results = {
    "analysis_type": "LOAD_FLOW",
    "result_version": "1.0.0",
    "convergence_status": status.convergence_status,
    "iteration_count": status.iteration_count,
    "total_losses_p_mw": totals.total_losses_p_mw,
    "total_losses_q_mvar": totals.total_losses_q_mvar,
    "slack_p_mw": totals.slack_p_mw,
    "slack_q_mvar": totals.slack_q_mvar,
    "min_v_pu": totals.min_v_pu,
    "max_v_pu": totals.max_v_pu,
    "power_balance_check": totals.power_balance_check,
    "node_count": len(nodes),
    "branch_count": len(branches),
    "warning_count": len(warnings),
    "error_count": len(errors),
}
```

---

## 11. Relationship to SC/Protection ResultSets

### 11.1 Separate Contracts

LoadFlowResultSetV1 is a **completely separate contract** from:

- **Short Circuit ResultSet** (mapped by `short_circuit_to_resultset_v1.py`)
- **Protection ResultSet** (mapped by `protection_to_resultset_v1.py`)

Each analysis type has:
- Its own mapper file in `application/result_mapping/`
- Its own field definitions
- Its own warning/error code registries
- Its own deterministic signature

### 11.2 No Shared Mutable State

| Concern | Shared? | Details |
|---------|---------|---------|
| Mapper code | NO | Each analysis type has a dedicated mapper. No shared mapping logic. |
| Warning/error codes | NO | SC uses `W-SC-*` / `E-SC-*`. Protection uses `W-PR-*` / `E-PR-*`. Load Flow uses `W-LF-*` / `E-LF-*`. |
| Result data | NO | A Load Flow ResultSet NEVER reads from or writes to an SC or Protection ResultSet. |
| Deterministic signature | NO | Each ResultSet has its own independent SHA-256 signature. |
| Solver output | NO | PowerFlowResultV1 is independent of ShortCircuitResult and ProtectionResultSetV1. |

### 11.3 Shared Infrastructure (Read-Only)

The following infrastructure components are shared across all analysis types but contain NO mutable shared state:

| Component | File | Shared Usage |
|-----------|------|-------------|
| `ResultSet` domain model | `domain/execution.py` | Structural container (same schema, different content) |
| `ElementResult` domain model | `domain/execution.py` | Per-element result container (same schema, different `values`) |
| `build_result_set()` factory | `domain/execution.py` | Constructs ResultSet with sorted element_results and deterministic signature |
| `compute_result_signature()` | `domain/execution.py` | SHA-256 computation (pure function, no state) |
| `_canonicalize()` | `domain/execution.py` | JSON canonicalization (pure function, no state) |
| `ResultSetV1` contract model | `domain/result_contract_v1.py` | Overlay-facing contract (same structure for all analysis types) |
| Result persistence | `infrastructure/persistence/repositories/result_repository.py` | Storage/retrieval (same table, different `result_type`) |
| Execution lifecycle | `domain/execution.py` (Run, RunStatus) | Run state machine (same lifecycle for all analysis types) |

### 11.4 Cross-Analysis Consumption

A Load Flow ResultSet MAY be consumed by other analysis types in a **read-only** manner:

- **Protection analysis** may reference Load Flow bus voltages to derive current magnitudes for relay testing (via `PowerFlowNewtonSolution.node_voltage_kv`, NOT via LoadFlowResultSetV1 directly).
- **Comparison service** (`domain/results.py` - `PowerFlowComparison`) compares two Load Flow ResultSets.

These are READ-ONLY consumers. They NEVER mutate the source ResultSet.

---

## 12. JSON Schema (Canonical)

### 12.1 Complete Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "LoadFlowResultSetV1",
  "type": "object",
  "required": [
    "analysis_type",
    "result_version",
    "snapshot_hash",
    "run_hash",
    "input_hash",
    "status",
    "nodes",
    "branches",
    "totals",
    "warnings",
    "errors",
    "deterministic_signature"
  ],
  "properties": {
    "analysis_type": {
      "type": "string",
      "const": "LOAD_FLOW"
    },
    "result_version": {
      "type": "string",
      "const": "1.0.0"
    },
    "snapshot_hash": {
      "type": "string",
      "pattern": "^[a-f0-9]{64}$"
    },
    "run_hash": {
      "type": "string",
      "pattern": "^[a-f0-9]{64}$"
    },
    "input_hash": {
      "type": "string",
      "pattern": "^[a-f0-9]{64}$"
    },
    "status": {
      "type": "object",
      "required": ["convergence_status", "iteration_count"],
      "properties": {
        "convergence_status": {
          "type": "string",
          "enum": ["CONVERGED", "NOT_CONVERGED", "FAILED_VALIDATION", "FAILED_SOLVER"]
        },
        "iteration_count": {
          "type": "integer",
          "minimum": 0
        }
      },
      "additionalProperties": false
    },
    "nodes": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "node_id",
          "voltage_pu",
          "voltage_kV",
          "angle_deg",
          "p_injected_mw",
          "q_injected_mvar"
        ],
        "properties": {
          "node_id": { "type": "string" },
          "voltage_pu": { "type": "number" },
          "voltage_kV": { "type": "number" },
          "angle_deg": { "type": "number" },
          "p_injected_mw": { "type": "number" },
          "q_injected_mvar": { "type": "number" }
        },
        "additionalProperties": false
      }
    },
    "branches": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "branch_id",
          "from_node_id",
          "to_node_id",
          "P_from_mw",
          "Q_from_mvar",
          "P_to_mw",
          "Q_to_mvar",
          "I_from_ka",
          "I_to_ka",
          "losses_p_mw",
          "losses_q_mvar"
        ],
        "properties": {
          "branch_id": { "type": "string" },
          "from_node_id": { "type": "string" },
          "to_node_id": { "type": "string" },
          "P_from_mw": { "type": "number" },
          "Q_from_mvar": { "type": "number" },
          "P_to_mw": { "type": "number" },
          "Q_to_mvar": { "type": "number" },
          "I_from_ka": { "type": ["number", "null"] },
          "I_to_ka": { "type": ["number", "null"] },
          "losses_p_mw": { "type": "number" },
          "losses_q_mvar": { "type": "number" }
        },
        "additionalProperties": false
      }
    },
    "totals": {
      "type": "object",
      "required": [
        "total_losses_p_mw",
        "total_losses_q_mvar",
        "slack_p_mw",
        "slack_q_mvar",
        "min_v_pu",
        "max_v_pu",
        "power_balance_check"
      ],
      "properties": {
        "total_losses_p_mw": { "type": "number" },
        "total_losses_q_mvar": { "type": "number" },
        "slack_p_mw": { "type": "number" },
        "slack_q_mvar": { "type": "number" },
        "min_v_pu": { "type": "number" },
        "max_v_pu": { "type": "number" },
        "power_balance_check": { "type": "number" }
      },
      "additionalProperties": false
    },
    "warnings": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["code", "message", "severity"],
        "properties": {
          "code": { "type": "string", "pattern": "^W-LF-\\d{3}$" },
          "message": { "type": "string" },
          "element_ref": { "type": ["string", "null"] },
          "severity": { "type": "string", "enum": ["INFO", "WARNING"] }
        },
        "additionalProperties": false
      }
    },
    "errors": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["code", "message", "severity"],
        "properties": {
          "code": { "type": "string", "pattern": "^E-LF-\\d{3}$" },
          "message": { "type": "string" },
          "element_ref": { "type": ["string", "null"] },
          "severity": { "type": "string", "const": "BLOCKER" }
        },
        "additionalProperties": false
      }
    },
    "deterministic_signature": {
      "type": "string",
      "pattern": "^[a-f0-9]{64}$"
    }
  },
  "additionalProperties": false
}
```

---

## 13. Invariants Checklist

This checklist MUST be satisfied by every LoadFlowResultSetV1 instance. Violation of any invariant is a contract breach.

### 13.1 Structural Invariants

| # | Invariant | Verification |
|---|-----------|--------------|
| S1 | `analysis_type == "LOAD_FLOW"` | Schema const |
| S2 | `result_version == "1.0.0"` | Schema const |
| S3 | `snapshot_hash` is 64 hex characters | Schema pattern |
| S4 | `run_hash` is 64 hex characters | Schema pattern |
| S5 | `input_hash` is 64 hex characters | Schema pattern |
| S6 | `deterministic_signature` is 64 hex characters | Schema pattern |
| S7 | `nodes` sorted lexicographically by `node_id` | Mapper + signature |
| S8 | `branches` sorted lexicographically by `branch_id` | Mapper + signature |
| S9 | `warnings` sorted lexicographically by `code` | Mapper |
| S10 | `errors` sorted lexicographically by `code` | Mapper |
| S11 | No duplicate `node_id` in `nodes` | Mapper validation |
| S12 | No duplicate `branch_id` in `branches` | Mapper validation |

### 13.2 Determinism Invariants

| # | Invariant | Verification |
|---|-----------|--------------|
| D1 | Identical `PowerFlowResultV1` + identical snapshot -> identical `LoadFlowResultSetV1` | Determinism test |
| D2 | `deterministic_signature` matches recomputed SHA-256 | `verify_signature()` |
| D3 | All floats processed through `canonical_float()` | Code review + test |
| D4 | No timestamp-dependent values in signature payload | Excluded fields list |
| D5 | No random values anywhere in the result | Code review |

### 13.3 Data Integrity Invariants

| # | Invariant | Verification |
|---|-----------|--------------|
| I1 | Every `node_id` exists in the NetworkModel snapshot | Mapper validation (E-LF-002 on violation) |
| I2 | Every `branch_id` exists in the NetworkModel snapshot | Mapper validation (E-LF-001 on violation) |
| I3 | `from_node_id` and `to_node_id` match the snapshot topology | Mapper resolution |
| I4 | `power_balance_check == sum(node.p_injected_mw)` | Mapper computation |
| I5 | `losses_p_mw == P_from_mw + P_to_mw` for each branch | From solver (PowerFlowBranchResult) |
| I6 | `losses_q_mvar == Q_from_mvar + Q_to_mvar` for each branch | From solver (PowerFlowBranchResult) |
| I7 | No NaN or Inf in any float field | `canonical_float()` enforcement |

### 13.4 Layer Boundary Invariants

| # | Invariant | Verification |
|---|-----------|--------------|
| L1 | Mapper performs ZERO physics calculations | Code review |
| L2 | Mapper does NOT call any solver | Import analysis |
| L3 | Mapper does NOT modify `PowerFlowResultV1` | Frozen dataclass enforcement |
| L4 | Mapper does NOT modify the NetworkModel snapshot | Read-only access pattern |
| L5 | Current derivation (I = S / (sqrt(3) * V)) is the ONLY arithmetic in mapper | Code review |
| L6 | No PCC, no boundary concepts in the result | Field list review |

---

*End of LOAD FLOW RESULTSET V1 CONTRACT.*
