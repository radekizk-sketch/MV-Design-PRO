# LOAD FLOW DEPENDENCY GRAPH — RUN #2A

> **Status**: BINDING
> **Date**: 2026-02-13
> **Scope**: PR-LF-01 through PR-LF-05 dependency order, gating rules, merge blockers
> **Phase**: Load Flow closure (RUN #2A)
> **Prerequisite**: LOAD_FLOW_ASIS_MAP.md (Phase A scan completed)

---

## 1. Dependency Graph (ASCII)

```
PR-LF-05 (Governance & CI Guards) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ GATES ALL MERGES
    â”‚                                                    â”‚
    â”‚ (can start in parallel with PR-LF-01)              â”‚
    â”‚                                                    â”‚
PR-LF-01 (Domain + Validation + Execution Wiring) â”€â”€â”€â”€â”€â”€â”¤
    â”‚                                                    â”‚
    â”śâ”€â”€â–¸ PR-LF-02 (ResultSet Mapping v1 + Persistence)   â”‚
    â”‚        â”‚                                           â”‚
    â”‚        â”śâ”€â”€â–¸ PR-LF-03 (Workspace UI + Results PL)   â”‚
    â”‚        â”‚                                           â”‚
    â”‚        â””â”€â”€â–¸ PR-LF-04 (SLD Overlay token-only)      â”‚
    â”‚                                                    â”‚
    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

Simplified flow:

```
PR-LF-01 â”€â”€â”¬â”€â”€â–¸ PR-LF-02 â”€â”€â”¬â”€â”€â–¸ PR-LF-03
            â”‚                â”‚
            â”‚                â””â”€â”€â–¸ PR-LF-04
            â”‚
            â””â”€â”€â–¸ PR-LF-05 (can start early, gates ALL)
```

---

## 2. Merge Order (Sequential)

| Order | PR | Name | Depends On | Can Start After | Gates |
|-------|-----|------|------------|-----------------|-------|
| 1 | PR-LF-05 | Governance & CI Guards | None (independent) | Immediately | ALL other PRs blocked from merge until PR-LF-05 is merged |
| 2 | PR-LF-01 | Domain + Validation + Execution Wiring | PR-LF-05 (for merge only) | PR-LF-05 merge; development starts immediately |
| 3 | PR-LF-02 | ResultSet Mapping v1 + Persistence | PR-LF-01 | PR-LF-01 merge |
| 4a | PR-LF-03 | Workspace UI + Results Panel (PL) | PR-LF-02 | PR-LF-02 merge |
| 4b | PR-LF-04 | SLD Overlay (token-only) | PR-LF-02 | PR-LF-02 merge |

PR-LF-03 and PR-LF-04 have no dependency on each other and can be developed and merged in parallel after PR-LF-02.

---

## 3. PR-LF-01: Domain + Validation + Execution Wiring

### 3.1 Scope

**NEW files**:

| File | Purpose |
|------|---------|
| `backend/src/domain/load_flow_run_input.py` | `LoadFlowRunInput` frozen dataclass (zero defaults) |
| `backend/src/application/load_flow_validation.py` | `validate_load_flow_input()` with FixAction payloads |
| `backend/src/application/load_flow_hash.py` | `canonical_hash_load_flow()` deterministic hash |
| `backend/tests/test_load_flow_run_input.py` | Input hash stability, validation error codes, FixAction payloads |
| `backend/tests/test_load_flow_execution_lifecycle.py` | Execution lifecycle (PENDING -> RUNNING -> DONE/FAILED) |

**MODIFIED files**:

| File | Change |
|------|--------|
| `backend/src/application/execution_engine/service.py` | Add `execute_run_load_flow()` method following SC/Protection pattern |
| `backend/src/domain/execution.py` | Add LF-specific keys to `_DETERMINISTIC_LIST_KEYS` if needed (e.g., `"loads"`, `"sources"`, `"shunts"`, `"taps"`) |
| `backend/src/application/eligibility_service.py` | Verify existing LF eligibility checks align with `LoadFlowRunInput` contract |

**UNTOUCHED (invariant)**:
- `backend/src/network_model/solvers/power_flow_newton.py` -- solver code is READ-ONLY
- `backend/src/network_model/solvers/power_flow_newton_internal.py` -- solver internals READ-ONLY
- `backend/src/network_model/solvers/power_flow_gauss_seidel.py` -- solver code READ-ONLY
- `backend/src/network_model/solvers/power_flow_fast_decoupled.py` -- solver code READ-ONLY
- `backend/src/network_model/solvers/power_flow_types.py` -- solver input types READ-ONLY
- `backend/src/network_model/solvers/power_flow_result.py` -- `PowerFlowResultV1` FROZEN
- `backend/src/network_model/solvers/power_flow_trace.py` -- `PowerFlowTrace` READ-ONLY
- ALL SC and Protection domain/solver files

### 3.2 LoadFlowRunInput Contract

```python
@dataclass(frozen=True)
class LoadFlowRunInput:
    """
    Application-level Load Flow run input.
    ZERO defaults — every field is mandatory and explicit.
    """
    study_case_id: UUID
    snapshot_id: str
    solver_method: Literal["newton-raphson", "gauss-seidel", "fast-decoupled"]
    modeling_mode: Literal["AC_POWER_FLOW"]
    start_mode: Literal["FLAT_START", "CUSTOM_INITIAL"]
    tolerance: float          # NO default — caller must specify
    max_iterations: int       # NO default — caller must specify
    base_mva: float           # Explicit system base
    slack: SlackSpec          # Single slack (explicit node + voltage)
    pq_specs: tuple[PQSpec, ...]
    pv_specs: tuple[PVSpec, ...]
    shunt_specs: tuple[ShuntSpec, ...]
    tap_specs: tuple[TransformerTapSpec, ...]
    bus_limit_specs: tuple[BusVoltageLimitSpec, ...]
    branch_limit_specs: tuple[BranchLimitSpec, ...]
    trace_level: Literal["summary", "full"]
```

Key properties:
- Frozen dataclass (immutable after creation)
- Zero defaults -- every field must be explicitly provided
- No auto-cosine-phi -- `PQSpec` requires both `p_mw` and `q_mvar`
- No distributed slack in v1 -- single `SlackSpec` only
- Tuple fields for immutability and deterministic hashing

### 3.3 Validation + FixActions

`validate_load_flow_input()` returns a list of validation issues, each with a FixAction:

| Error Code | Condition | FixAction |
|------------|-----------|-----------|
| `LF_VAL_NO_SLACK` | No slack bus specified | `OPEN_MODAL` -> `SlackBusModal` |
| `LF_VAL_MISSING_Q` | PQSpec with None q_mvar | `OPEN_MODAL` -> `LoadModal` (element_ref) |
| `LF_VAL_ZERO_BASE_MVA` | base_mva <= 0 | `NAVIGATE_TO_ELEMENT` -> project settings |
| `LF_VAL_TOLERANCE_RANGE` | tolerance <= 0 or > 1.0 | `OPEN_MODAL` -> `SolverOptionsModal` |
| `LF_VAL_MAX_ITER_RANGE` | max_iterations < 1 or > 1000 | `OPEN_MODAL` -> `SolverOptionsModal` |
| `LF_VAL_NO_BUSES` | Empty network (no buses) | `ADD_MISSING_DEVICE` -> `BusModal` |
| `LF_VAL_MISSING_IMPEDANCE` | Branch with zero impedance | `OPEN_MODAL` -> `BranchModal` (element_ref) |
| `LF_VAL_DANGLING_BUS` | Bus with no connections | `NAVIGATE_TO_ELEMENT` -> bus_ref |

FixActions are NEVER auto-executed. They are suggestions for the UI.

### 3.4 Execution Wiring

New method `execute_run_load_flow()` in `ExecutionEngineService` follows the established pattern:

```
1. Validate LoadFlowRunInput (FixActions on failure)
2. Freeze solver_input (deep copy)
3. compute_solver_input_hash(frozen_input)
4. new_run(study_case_id, LOAD_FLOW, hash)
5. mark_running()
6. Build PowerFlowInput from LoadFlowRunInput
7. Call solver (PowerFlowNewtonSolver / GaussSeidel / FastDecoupled)
8. Build PowerFlowResultV1 from solver output
9. Map to ResultSet via load_flow_to_resultset_v1 mapper (PR-LF-02)
10. mark_done() or mark_failed()
```

Note: Step 9 is a stub in PR-LF-01 (mapper delivered in PR-LF-02). PR-LF-01 delivers the execution lifecycle up to step 8 and stores the raw `PowerFlowResultV1`.

### 3.5 Canonical Hash

`canonical_hash_load_flow(input: LoadFlowRunInput) -> str`:
- Serializes all fields to a canonical JSON representation
- Uses `_canonicalize()` from `domain/execution.py` with LF-specific deterministic list keys
- SHA-256 of the canonical JSON bytes
- Invariant: identical `LoadFlowRunInput` -> identical hash, always

LF-specific keys to add to `_DETERMINISTIC_LIST_KEYS`:
- `"loads"` -- sorted by `node_id`
- `"sources"` -- sorted by `node_id`
- `"shunts"` -- sorted by `node_id`
- `"taps"` -- sorted by `transformer_id`
- `"bus_limits"` -- sorted by `bus_id`
- `"branch_limits"` -- sorted by `branch_id`

### 3.6 Dependencies

- **Depends on**: Nothing (foundation PR)
- **Merge blocked until**: PR-LF-05 merged (guards must be in place)

### 3.7 Deliverables

- `LoadFlowRunInput` frozen dataclass with zero defaults
- `validate_load_flow_input()` with full FixAction coverage
- `execute_run_load_flow()` in ExecutionEngineService
- `canonical_hash_load_flow()` deterministic hash function
- Updated `_DETERMINISTIC_LIST_KEYS` in `domain/execution.py`

### 3.8 Tests

| Test File | What it Tests |
|-----------|---------------|
| `tests/test_load_flow_run_input.py` | Input hash stability (same input -> same hash), field immutability, serialization round-trip |
| `tests/test_load_flow_run_input.py` | Validation error codes (each code fires on correct condition) |
| `tests/test_load_flow_run_input.py` | FixAction payloads (correct action_type, modal_type, element_ref) |
| `tests/test_load_flow_execution_lifecycle.py` | PENDING -> RUNNING -> DONE lifecycle |
| `tests/test_load_flow_execution_lifecycle.py` | PENDING -> RUNNING -> FAILED lifecycle (solver divergence) |
| `tests/test_load_flow_execution_lifecycle.py` | Hash equality: identical LoadFlowRunInput -> identical solver_input_hash |
| `tests/test_load_flow_execution_lifecycle.py` | Permutation invariance: reordered PQ specs -> same hash |

### 3.9 Gating Rules

**BLOCKED if any of**:
- [ ] Any field in `LoadFlowRunInput` has a default value (zero-defaults policy)
- [ ] `validate_load_flow_input()` returns FixAction without `action_type`
- [ ] `execute_run_load_flow()` directly instantiates solver (must go through input builder)
- [ ] Any solver file (`power_flow_newton.py`, `power_flow_gauss_seidel.py`, etc.) is modified
- [ ] Any SC or Protection file is modified
- [ ] `PowerFlowResultV1` frozen contract is modified
- [ ] Hash function produces different output for identical input across runs
- [ ] Existing tests (`test_power_flow_v2.py`, `test_p20a_power_flow_determinism.py`, etc.) fail

---

## 4. PR-LF-02: ResultSet Mapping v1 + Persistence

### 4.1 Scope

**NEW files**:

| File | Purpose |
|------|---------|
| `backend/src/application/result_mapping/load_flow_to_resultset_v1.py` | Maps `PowerFlowResultV1` -> `ResultSet` (canonical format) |
| `backend/tests/test_load_flow_resultset_v1.py` | Stable ordering, golden minimal network, deterministic signature |

**MODIFIED files**:

| File | Change |
|------|--------|
| `backend/src/application/execution_engine/service.py` | Wire `load_flow_to_resultset_v1` mapper into `execute_run_load_flow()` step 9 |
| `backend/src/infrastructure/persistence/repositories/result_repository.py` | Verify LF ResultSet can be stored via existing `add_result()` (likely no change needed) |
| `backend/src/application/result_mapping/__init__.py` | Export new mapper |

**UNTOUCHED (invariant)**:
- `backend/src/network_model/solvers/power_flow_result.py` -- `PowerFlowResultV1` FROZEN
- `backend/src/application/result_mapping/short_circuit_to_resultset_v1.py` -- SC mapper READ-ONLY
- `backend/src/application/result_mapping/protection_to_resultset_v1.py` -- Protection mapper READ-ONLY
- ALL solver files
- `domain/execution.py` -- `ResultSet` and `ElementResult` contracts FROZEN

### 4.2 Mapper Contract

`map_load_flow_to_resultset_v1(result: PowerFlowResultV1, run_id: UUID) -> ResultSet`:

**Element mapping**:

| PowerFlowResultV1 Field | ElementResult.element_type | ElementResult.values Keys |
|--------------------------|---------------------------|--------------------------|
| `bus_results` (per bus) | `"bus"` | `v_pu`, `angle_deg`, `p_injected_mw`, `q_injected_mvar` |
| `branch_results` (per branch) | `"branch"` | `p_from_mw`, `q_from_mvar`, `p_to_mw`, `q_to_mvar`, `losses_p_mw`, `losses_q_mvar` |

**Global results mapping**:

| PowerFlowResultV1 Field | global_results Key |
|--------------------------|-------------------|
| `summary.total_losses_p_mw` | `"total_losses_p_mw"` |
| `summary.total_losses_q_mvar` | `"total_losses_q_mvar"` |
| `summary.min_v_pu` | `"min_v_pu"` |
| `summary.max_v_pu` | `"max_v_pu"` |
| `summary.slack_p_mw` | `"slack_p_mw"` |
| `summary.slack_q_mvar` | `"slack_q_mvar"` |
| `converged` | `"converged"` |
| `iterations_count` | `"iterations_count"` |
| `tolerance_used` | `"tolerance_used"` |
| `base_mva` | `"base_mva"` |
| `slack_bus_id` | `"slack_bus_id"` |

**Ordering invariants**:
- `element_results` sorted by `element_ref` (inherited from `build_result_set()`)
- `bus_results` sorted by `bus_id` (already sorted in `PowerFlowResultV1`)
- `branch_results` sorted by `branch_id` (already sorted in `PowerFlowResultV1`)

**Deterministic signature**: Computed by `build_result_set()` via `compute_result_signature()`.

### 4.3 Persistence

LF ResultSet uses the same persistence path as SC/Protection:
- `StudyResultORM` table with `result_type = "LOAD_FLOW"`
- `result_jsonb` stores serialized `ResultSet.to_dict()`
- `result_repository.add_result()` -- no modification expected (generic by design)

If any schema change is needed in `models.py` or `result_repository.py`, it must be additive only (no breaking changes to existing SC/Protection storage).

### 4.4 Dependencies

- **Depends on**: PR-LF-01 (needs `execute_run_load_flow()` to wire into)
- **Merge blocked until**: PR-LF-05 merged, PR-LF-01 merged

### 4.5 Deliverables

- `load_flow_to_resultset_v1.py` mapper (pure function, no side effects)
- Full `execute_run_load_flow()` pipeline including ResultSet persistence
- Verified persistence round-trip for LF ResultSet

### 4.6 Tests

| Test File | What it Tests |
|-----------|---------------|
| `tests/test_load_flow_resultset_v1.py` | Mapper produces correct `element_results` from golden `PowerFlowResultV1` |
| `tests/test_load_flow_resultset_v1.py` | Stable ordering: sorted by `element_ref` |
| `tests/test_load_flow_resultset_v1.py` | Golden minimal network: 3-bus network produces expected ResultSet JSON |
| `tests/test_load_flow_resultset_v1.py` | Deterministic signature: same `PowerFlowResultV1` -> same `deterministic_signature` |
| `tests/test_load_flow_resultset_v1.py` | Serialization round-trip: `ResultSet.to_dict()` -> `ResultSet.from_dict()` preserves all fields |
| `tests/test_load_flow_resultset_v1.py` | Persistence round-trip: store -> retrieve -> compare |

### 4.7 Gating Rules

**BLOCKED if any of**:
- [ ] PR-LF-01 not merged
- [ ] Mapper modifies `PowerFlowResultV1` (it is read-only input)
- [ ] Mapper adds fields not present in `PowerFlowResultV1`
- [ ] `ResultSet` or `ElementResult` frozen contracts are modified
- [ ] SC or Protection ResultSet mappers are modified
- [ ] Deterministic signature differs across identical inputs
- [ ] Golden network test produces different JSON than reference
- [ ] Existing tests fail

---

## 5. PR-LF-03: Workspace UI + Results Panel (PL)

### 5.1 Scope

**MODIFIED files**:

| File | Change |
|------|--------|
| `frontend/src/ui/results-workspace/RunViewPanel.tsx` | Add LF result display in RUN mode (bus voltages, branch flows, losses) |
| `frontend/src/ui/results-workspace/store.ts` | Verify LOAD_FLOW filter works in workspace state |
| `frontend/src/ui/results-workspace/types.ts` | Add LF-specific type labels if missing |
| `frontend/src/ui/results-workspace/api.ts` | Wire LF result fetching via workspace projection |
| `frontend/src/ui/results-browser/ResultsBrowser.tsx` | Verify LF data renders correctly |
| `frontend/src/ui/results-browser/ResultsTable.tsx` | Verify LF columns (bus voltage, branch flow) |
| `frontend/src/ui/results-browser/api.ts` | Remove hardcoded fallbacks (e.g., `getBaseVoltage` returning 20.0) -- use actual data |
| `frontend/src/ui/results-browser/types.ts` | Verify types align with backend LF ResultSet |
| `frontend/src/ui/power-flow-results/store.ts` | Verify integration with workspace store |
| `frontend/src/ui/power-flow-results/api.ts` | Verify API calls use correct endpoints |
| `frontend/src/ui/power-flow-results/types.ts` | Verify alignment with `PowerFlowResultV1` contract |
| `frontend/src/ui/power-flow-results/PowerFlowResultsInspectorPage.tsx` | Verify integration with workspace |

**NEW files** (if needed):

| File | Purpose |
|------|---------|
| `frontend/src/ui/results-workspace/__tests__/load-flow-integration.test.ts` | Smoke tests for LF in workspace |
| `frontend/src/ui/results-browser/__tests__/load-flow-results.test.ts` | LF results rendering tests |

**UNTOUCHED (invariant)**:
- No backend files modified in this PR
- No solver files
- No SC/Protection frontend components

### 5.2 Polish Labels

All UI-visible strings must be in Polish. English strings are FORBIDDEN.

| Concept | Polish Label | Forbidden (EN) |
|---------|-------------|----------------|
| Load Flow | Rozpyw mocy | Load Flow, Power Flow |
| Bus Voltage | Napiecie wezla | Bus Voltage |
| Branch Flow | Przeplyw w galezi | Branch Flow |
| Losses | Straty | Losses |
| Converged | Zbiezny | Converged |
| Not Converged | Brak zbieznosci | Not Converged |
| Iterations | Iteracje | Iterations |
| Violations | Naruszenia | Violations |
| Undervoltage | Podnapiecie | Undervoltage |
| Overvoltage | Przepiecie | Overvoltage |
| Loading | Obciazenie | Loading |

### 5.3 Hardcoded Threshold Removal

Current `results-browser/api.ts` contains hardcoded voltage violation thresholds:
- `< 0.95 p.u.` (WARN), `< 0.90 p.u.` (HIGH)
- `> 1.05 p.u.` (WARN), `> 1.10 p.u.` (HIGH)

These must be replaced with explicit thresholds from the `LoadFlowRunInput.bus_limit_specs` passed through the ResultSet or API response. No implicit thresholds.

### 5.4 Dependencies

- **Depends on**: PR-LF-02 (needs backend LF ResultSet data)
- **Merge blocked until**: PR-LF-05 merged, PR-LF-02 merged

### 5.5 Deliverables

- LF results integrated into Workspace RUN mode
- LF results rendering in Results Browser (bus voltages, branch flows, losses)
- Hardcoded thresholds replaced with explicit data
- 100% Polish labels in LF UI
- Smoke tests passing

### 5.6 Tests

| Test File | What it Tests |
|-----------|---------------|
| `frontend/src/ui/results-workspace/__tests__/load-flow-integration.test.ts` | Smoke: LF result renders in RUN mode |
| `frontend/src/ui/results-workspace/__tests__/load-flow-integration.test.ts` | No EN strings in rendered output |
| `frontend/src/ui/results-browser/__tests__/load-flow-results.test.ts` | Bus voltage table renders correctly |
| `frontend/src/ui/results-browser/__tests__/load-flow-results.test.ts` | Branch flow table renders correctly |
| `frontend/src/ui/results-browser/__tests__/load-flow-results.test.ts` | Losses summary renders correctly |
| Existing `frontend/src/ui/results-workspace/__tests__/store.test.ts` | No regressions in workspace store |
| Existing `frontend/src/ui/results-workspace/__tests__/determinism-lock.test.ts` | No regressions in determinism |

### 5.7 Gating Rules

**BLOCKED if any of**:
- [ ] PR-LF-02 not merged
- [ ] Any EN string in UI-visible output (Polish only)
- [ ] Any project codename (P7, P11, P14, P17, P20, etc.) in UI strings
- [ ] Any `alert()` call in LF components
- [ ] Hardcoded voltage thresholds remain
- [ ] Any physics calculation in UI code
- [ ] Backend files modified
- [ ] SC/Protection frontend components modified
- [ ] Existing frontend tests fail

---

## 6. PR-LF-04: SLD Overlay (token-only)

### 6.1 Scope

**MODIFIED or VERIFIED files**:

| File | Change |
|------|--------|
| `frontend/src/ui/power-flow-results/PowerFlowSldOverlay.tsx` | Verify token-only rendering, no geometry mutation, deterministic |
| `frontend/src/ui/sld-overlay/overlayTypes.ts` | Verify LF overlay tokens defined (voltage, flow, loading) |
| `frontend/src/ui/sld-overlay/OverlayEngine.ts` | Verify LF overlay element matching and token resolution |
| `frontend/src/ui/sld/SLDView.tsx` | Verify WYNIKI mode shows LF overlay correctly |

**NEW files** (if needed):

| File | Purpose |
|------|---------|
| `frontend/src/ui/power-flow-results/__tests__/overlay-token-snapshot.test.ts` | Token snapshot stability test |
| `frontend/src/ui/power-flow-results/__tests__/overlay-determinism.test.ts` | Deterministic render order test |

**UNTOUCHED (invariant)**:
- SLD symbol geometry (overlay NEVER modifies symbols)
- SC/Protection overlay components
- Backend files
- Solver files

### 6.2 Token-Only Invariants

The SLD overlay for Load Flow must satisfy:

1. **Token-only**: Overlay uses semantic tokens (`color_token`, `stroke_token`, `animation_token`), NEVER hex colors or pixel values
2. **No geometry**: Overlay does NOT modify SLD symbol position, size, or shape
3. **Deterministic**: Same `OverlayPayloadV1` -> identical rendered overlay, every time
4. **No physics**: Overlay code contains ZERO physics calculations
5. **Stable ordering**: Overlay element list sorted by `element_ref` (deterministic)

### 6.3 Overlay Token Definitions

| Token | When Applied | Visual State |
|-------|-------------|--------------|
| `voltage-ok` | 0.95 <= V <= 1.05 p.u. | `OK` |
| `voltage-warn-low` | 0.90 <= V < 0.95 p.u. | `WARNING` |
| `voltage-warn-high` | 1.05 < V <= 1.10 p.u. | `WARNING` |
| `voltage-critical-low` | V < 0.90 p.u. | `CRITICAL` |
| `voltage-critical-high` | V > 1.10 p.u. | `CRITICAL` |
| `flow-ok` | loading < 80% | `OK` |
| `flow-warn` | 80% <= loading < 100% | `WARNING` |
| `flow-critical` | loading >= 100% | `CRITICAL` |
| `inactive` | element out of service | `INACTIVE` |

Note: Threshold values shown above are illustrative. Actual thresholds come from `bus_limit_specs` / `branch_limit_specs` in the ResultSet -- NOT hardcoded in overlay code.

### 6.4 Dependencies

- **Depends on**: PR-LF-02 (needs ResultSet data to build overlay payload)
- **Merge blocked until**: PR-LF-05 merged, PR-LF-02 merged

### 6.5 Deliverables

- Verified `PowerFlowSldOverlay.tsx` compliance with token-only rules
- Overlay token snapshot test
- Deterministic render order test
- No physics in overlay code (verified by guard)

### 6.6 Tests

| Test File | What it Tests |
|-----------|---------------|
| `frontend/src/ui/power-flow-results/__tests__/overlay-token-snapshot.test.ts` | Token list snapshot: reference LF result -> expected tokens |
| `frontend/src/ui/power-flow-results/__tests__/overlay-determinism.test.ts` | Deterministic: same OverlayPayloadV1 -> identical overlay output |
| `frontend/src/ui/power-flow-results/__tests__/overlay-determinism.test.ts` | Permutation invariance: reordered elements -> same sorted output |
| Existing `frontend/src/ui/power-flow-results/__tests__/power-flow-results.test.ts` | No regressions |

### 6.7 Gating Rules

**BLOCKED if any of**:
- [ ] PR-LF-02 not merged
- [ ] Overlay modifies SLD symbol geometry (position, size, shape)
- [ ] Overlay uses hardcoded hex colors instead of semantic tokens
- [ ] Overlay contains physics calculations
- [ ] Overlay element order is non-deterministic (unstable sort)
- [ ] Layout depends on zoom level or viewport size
- [ ] SC/Protection overlay components modified
- [ ] Backend files modified
- [ ] `overlay_no_physics_guard.py` fails on overlay code
- [ ] Existing tests fail

---

## 7. PR-LF-05: Governance & CI Guards

### 7.1 Scope

**NEW files**:

| File | Purpose |
|------|---------|
| `scripts/load_flow_no_heuristics_guard.py` | Blocks LF code containing forbidden heuristic patterns |
| `backend/tests/test_load_flow_determinism.py` | Full LF determinism suite: hash equality + permutation invariance |

**MODIFIED files**:

| File | Change |
|------|--------|
| `scripts/solver_diff_guard.py` | Verify LF solver files are in protected paths (already present per AS-IS scan) |
| `scripts/resultset_v1_schema_guard.py` | Verify it covers LF ResultSet mapping contract (additive only) |
| `.github/workflows/python-tests.yml` | Add `load_flow_no_heuristics_guard.py` to CI pipeline |

**EXISTING guards (verify, do not break)**:
- `scripts/solver_diff_guard.py` -- already protects PF solver files (confirmed in AS-IS scan)
- `scripts/resultset_v1_schema_guard.py` -- already protects `ResultSet` / `ElementResult` contracts
- `scripts/overlay_no_physics_guard.py` -- already protects SLD overlay
- `scripts/no_codenames_guard.py` -- already blocks codenames in UI
- `scripts/arch_guard.py` -- already enforces layer boundaries

### 7.2 load_flow_no_heuristics_guard.py

**SCAN FILES** (to be scanned when they exist):
- `backend/src/domain/load_flow_run_input.py`
- `backend/src/application/load_flow_validation.py`
- `backend/src/application/load_flow_hash.py`
- `backend/src/application/result_mapping/load_flow_to_resultset_v1.py`
- `backend/src/application/execution_engine/service.py` (LF-related methods only)

**FORBIDDEN PATTERNS**:
```
auto_select, auto_map, fallback, default_target, default_slack,
default_tolerance, default_max_iter, infer_slack, guess_,
heuristic, best_match, implicit_start, auto_cosfi, auto_cos_phi
```

**EXIT CODES**:
- 0 = clean (no heuristics found)
- 1 = forbidden pattern detected (blocks merge)
- 2 = scan file missing (warning, non-blocking)

### 7.3 test_load_flow_determinism.py

| Test | What it Verifies |
|------|-----------------|
| `test_lf_hash_equality` | Identical `LoadFlowRunInput` -> identical `solver_input_hash` (100 iterations) |
| `test_lf_permutation_invariance` | Reordered PQ specs, PV specs, shunts -> same hash |
| `test_lf_result_signature_stability` | Identical `PowerFlowResultV1` -> identical `deterministic_signature` |
| `test_lf_resultset_permutation` | Reordered `element_results` -> same signature (sorted internally) |
| `test_lf_golden_network_hash` | Golden 3-bus network -> known reference hash (hardcoded) |
| `test_lf_golden_network_signature` | Golden 3-bus network result -> known reference signature (hardcoded) |

### 7.4 CI Pipeline Changes

Addition to `.github/workflows/python-tests.yml`:

```yaml
      - name: Run Load Flow no-heuristics guard
        working-directory: mv-design-pro
        run: poetry run python scripts/load_flow_no_heuristics_guard.py
```

This step runs after `poetry run pytest -q` and blocks the pipeline on failure.

### 7.5 Dependencies

- **Depends on**: Nothing (independent, can start immediately)
- **GATES**: ALL other PRs (PR-LF-01 through PR-LF-04) are blocked from merge until PR-LF-05 is merged

### 7.6 Deliverables

- `load_flow_no_heuristics_guard.py` CI guard script
- `test_load_flow_determinism.py` determinism test suite
- CI pipeline updated with new guard
- Verification that existing guards cover LF paths

### 7.7 Tests

| Test File | What it Tests |
|-----------|---------------|
| `backend/tests/test_load_flow_determinism.py` | All determinism tests listed in section 7.3 |
| Guard self-test | `load_flow_no_heuristics_guard.py` exits 0 on current codebase |
| Guard self-test | `solver_diff_guard.py` exits 0 on current codebase |
| Guard self-test | `resultset_v1_schema_guard.py` exits 0 on current codebase |

### 7.8 Gating Rules

**BLOCKED if any of**:
- [ ] `load_flow_no_heuristics_guard.py` does not scan all required files
- [ ] Guard does not catch known forbidden patterns (test with injected pattern)
- [ ] `test_load_flow_determinism.py` does not include hash equality test
- [ ] `test_load_flow_determinism.py` does not include permutation invariance test
- [ ] CI pipeline does not execute the new guard
- [ ] Any existing guard is broken by changes in this PR
- [ ] Any existing test fails

---

## 8. Commit Order Within Each PR

Each PR follows this internal commit sequence (aligned with Protection precedent):

1. **Contracts + types** -- frozen dataclasses, enums, type definitions
2. **Engine / resolver** -- core logic (pure functions)
3. **Execution wiring** -- integration with ExecutionEngine pipeline
4. **ResultSet mapping** -- mapper to canonical ResultSet
5. **UI components** -- frontend types, components, store (if applicable)
6. **SLD overlay** -- overlay tokens, legend (if applicable)
7. **Tests + guards** -- unit, integration, determinism, golden
8. **Docs update** -- update canonical docs if needed

Commits are small, logical, and self-contained. No aesthetic refactors.

---

## 9. Risk Matrix

### PR-LF-01: Domain + Validation + Execution Wiring

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `LoadFlowRunInput` contract incomplete (missing field discovered later) | MEDIUM | HIGH -- requires re-review of PR-LF-01 and downstream PRs | Derive all fields from AS-IS `PowerFlowInput` + gap analysis in LOAD_FLOW_ASIS_MAP.md; review against benchmark reference |
| Dual execution path conflict (AnalysisRunService vs ExecutionEngine) | HIGH | MEDIUM -- confused callers, duplicate runs | PR-LF-01 establishes `execute_run_load_flow()` as THE canonical path; mark `AnalysisRunService.execute_power_flow_run()` as deprecated with runtime warning |
| Hash collision between old AnalysisRunService hash and new ExecutionEngine hash | LOW | HIGH -- cache invalidation failures | New `canonical_hash_load_flow()` uses `_canonicalize()` from `execution.py` (different algorithm than AnalysisRunService); document migration path |
| `_DETERMINISTIC_LIST_KEYS` addition breaks existing SC/Protection hashes | LOW | CRITICAL -- all stored results become invalid | LF keys are additive; existing key set untouched; verify with regression test that SC/Protection hashes remain stable |
| Solver modification temptation (e.g., fixing default values in `PowerFlowOptions`) | MEDIUM | CRITICAL -- violates NOT-A-SOLVER rule | `solver_diff_guard.py` blocks any change; code review enforces; PR-LF-05 merged first |

### PR-LF-02: ResultSet Mapping v1 + Persistence

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `PowerFlowResultV1` missing fields needed by mapper | LOW | MEDIUM -- mapper returns incomplete ResultSet | Map only fields present in `PowerFlowResultV1`; do not invent new fields |
| ResultSet schema drift (additive fields break downstream) | LOW | HIGH -- frontend/overlay break | `resultset_v1_schema_guard.py` protects `ResultSet` contract; mapper tests verify exact JSON structure |
| Persistence schema conflict with SC/Protection results | LOW | MEDIUM -- storage errors | LF uses same `StudyResultORM` with `result_type = "LOAD_FLOW"`; integration test verifies |
| Golden network reference values wrong | MEDIUM | MEDIUM -- false confidence in tests | Cross-verify golden values against manual calculation and existing `test_power_flow_v2.py` results |

### PR-LF-03: Workspace UI + Results Panel (PL)

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| English strings leak into UI | MEDIUM | LOW -- cosmetic but violates policy | `no_codenames_guard.py` + manual review; test scans for EN strings |
| Hardcoded threshold removal breaks existing violation display | MEDIUM | MEDIUM -- violations not shown | Replace with explicit thresholds from ResultSet; if thresholds not in ResultSet, display raw values without color coding until PR-LF-04 provides tokens |
| Results Browser hardcoded helpers (`getBaseVoltage` = 20.0) | HIGH | MEDIUM -- wrong values displayed | Replace all hardcoded helpers with actual data from API response; add test that no hardcoded voltage value exists |
| Workspace store regression (SC/Protection views break) | LOW | HIGH -- critical user-facing breakage | Run full workspace test suite; do not modify SC/Protection-specific store logic |

### PR-LF-04: SLD Overlay (token-only)

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Existing `PowerFlowSldOverlay.tsx` contains non-token patterns | MEDIUM | MEDIUM -- requires refactoring | Audit in PR-LF-04; `overlay_no_physics_guard.py` catches physics; manual review catches hardcoded colors |
| Overlay rendering order non-deterministic | LOW | MEDIUM -- snapshot tests flake | Sort overlay elements by `element_ref` before rendering; test with permuted input |
| Geometry mutation in overlay | LOW | CRITICAL -- violates SLD invariant | `overlay_no_physics_guard.py` + code review; snapshot test catches visual changes |

### PR-LF-05: Governance & CI Guards

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Guard too strict -- blocks legitimate code | MEDIUM | MEDIUM -- development slows down | Whitelist pattern: allow forbidden words in comments/docstrings only; test guard against known-good code |
| Guard too lenient -- misses heuristic patterns | MEDIUM | HIGH -- heuristics leak in | Test guard against known-bad code samples (injected patterns); code review as second layer |
| CI pipeline timing -- guard runs too late | LOW | MEDIUM -- bad code merges before guard runs | Guard runs in same job as pytest, before merge is allowed; branch protection rule requires CI pass |
| Existing guard breakage | LOW | HIGH -- protection regression | Run ALL existing guards as part of PR-LF-05 CI; verify exit codes |

---

## 10. Cross-PR Invariants

These invariants hold across ALL PRs in the Load Flow closure:

| Invariant | Enforced By | Verification |
|-----------|------------|--------------|
| Solver files NEVER modified | `solver_diff_guard.py` | CI pipeline + code review |
| `PowerFlowResultV1` FROZEN | `resultset_v1_schema_guard.py` | CI pipeline + code review |
| `ResultSet` / `ElementResult` contracts FROZEN | `resultset_v1_schema_guard.py` | CI pipeline |
| SC/Protection code UNTOUCHED | Code review + regression tests | Full test suite passes |
| Zero heuristics in LF code | `load_flow_no_heuristics_guard.py` | CI pipeline |
| No physics in non-solver code | `arch_guard.py` + `overlay_no_physics_guard.py` | CI pipeline |
| No project codenames in UI | `no_codenames_guard.py` | CI pipeline |
| Deterministic: same input -> same output | `test_load_flow_determinism.py` | Test suite |
| WHITE BOX: all intermediate values exposed | `PowerFlowTrace` preserved | Code review |
| One model rule: no duplicate data stores | Architecture review | Code review |

---

## 11. Definition of Done

Load Flow closure (RUN #2A) is complete when ALL of:

- [ ] PR-LF-05 merged (Governance & CI Guards)
- [ ] PR-LF-01 merged (Domain + Validation + Execution Wiring)
- [ ] PR-LF-02 merged (ResultSet Mapping v1 + Persistence)
- [ ] PR-LF-03 merged (Workspace UI + Results Panel PL)
- [ ] PR-LF-04 merged (SLD Overlay token-only)
- [ ] CI green on all PRs
- [ ] All existing tests pass (SC, Protection, PF, determinism)
- [ ] Determinism proven: hash equality + permutation invariance for LF
- [ ] Zero heuristics in all LF code (guard verified)
- [ ] Zero hardcoded defaults in `LoadFlowRunInput`
- [ ] Solver code untouched (guard verified)
- [ ] `PowerFlowResultV1` untouched (guard verified)
- [ ] SC/Protection ResultSet mappers untouched
- [ ] Polish labels in all LF UI (no EN strings)
- [ ] No project codenames in UI (guard verified)
- [ ] Canonical documentation consistent with implementation

---

*End of Load Flow Dependency Graph (RUN #2A).*

