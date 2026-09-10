# LOAD FLOW CANONICAL ARCHITECTURE

> **KOREKTA 2026-09-05 (karta CV-3.3-A2):** dokument sprzed kanonu V12.xx, poza
> hierarchią `CLAUDE.md`. `application/result_mapping/load_flow_to_resultset_v1.py`
> (wzmiankowany niżej jako przyszły mapper `LoadFlowResultSetV1`) skasowany — zero
> konsumenta produkcyjnego, `ExecutionEngineService` (jedyny docelowy wołający) też
> skasowany. Żywy producent kontraktu `ResultSet v1` dla rozpływu:
> `application/result_mapping/canonical_run_to_resultset_v1.py`. Szczegóły →
> `docs/architecture/CONVERGENCE_ROADMAP.md` CV-3.3-A2.
>
> **Status (pierwotny)**: BINDING
> **Date**: 2026-02-13
> **Scope**: Load Flow (Power Flow) analysis — layer boundaries, contracts, determinism, prohibitions
> **Base**: Existing NR/GS/FD solvers, PowerFlowResultV1 (FROZEN v1.0.0), AnalysisRunService

---

## 1. Scope of Analysis

Load Flow (LF) computes the **steady-state AC power flow** for a balanced three-phase MV network.

### 1.1 Output Quantities

| Quantity | Symbol | Unit | Scope |
|----------|--------|------|-------|
| Bus voltage magnitude | U | p.u., kV | Per bus |
| Bus voltage angle | delta | rad, deg | Per bus |
| Active power injection | P_inj | MW | Per bus |
| Reactive power injection | Q_inj | Mvar | Per bus |
| Active power flow (from/to) | P_from, P_to | MW | Per branch |
| Reactive power flow (from/to) | Q_from, Q_to | Mvar | Per branch |
| Active power losses | P_loss | MW | Per branch, total |
| Reactive power losses | Q_loss | Mvar | Per branch, total |
| Branch current | I | p.u., kA | Per branch |
| Branch apparent power | S | MVA | Per branch |
| Slack bus active power | P_slack | MW | Single bus |
| Slack bus reactive power | Q_slack | Mvar | Single bus |

### 1.2 Supported Bus Types

| Type | Knowns | Unknowns | Solver Degrees of Freedom |
|------|--------|----------|---------------------------|
| Slack | U, delta | P, Q | Reference bus (one per island) |
| PQ | P, Q | U, delta | Load / constant-power injection |
| PV | P, U | Q, delta | Generator with Q limits |

### 1.3 Scope Boundaries

- **AC power flow only**. DC load flow, optimal power flow (OPF), and contingency analysis are out of scope for v1.
- **Balanced three-phase**. Unbalanced / single-phase load flow requires a future version.
- **Steady-state only**. No transient or dynamic simulation.

---

## 2. Architecture Layers

### 2.1 Layer Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                        PRESENTATION LAYER                            │
│  Frontend:                                                           │
│    ui/power-flow-results/     — results inspector page               │
│    ui/results-browser/        — cross-analysis results listing        │
│    ui/results-workspace/      — workspace with SLD overlay            │
│  Reports: PDF, DOCX, JSON export (api/power_flow_runs.py)            │
│  NO physics. NO model mutation. Polish labels only.                  │
└──────────────────────────────────────────────────────────────────────┘
                                │
┌──────────────────────────────────────────────────────────────────────┐
│                        API LAYER                                     │
│  api/power_flow_runs.py                                              │
│    POST /projects/{id}/power-flow-runs          (create)             │
│    POST /power-flow-runs/{id}/execute           (execute)            │
│    GET  /power-flow-runs/{id}                   (metadata)           │
│    GET  /power-flow-runs/{id}/results           (PowerFlowResultV1)  │
│    GET  /power-flow-runs/{id}/trace             (PowerFlowTrace)     │
│    GET  /power-flow-runs/{id}/export/{format}   (JSON/DOCX/PDF)      │
│    GET  /power-flow-runs/{id}/interpretation    (P22 analysis)       │
│  api/power_flow_comparisons.py                                       │
│    Comparison endpoints for multi-run delta analysis                  │
│  NO physics. DTO serialization. Deterministic JSON.                  │
└──────────────────────────────────────────────────────────────────────┘
                                │
┌──────────────────────────────────────────────────────────────────────┐
│                      APPLICATION LAYER                               │
│  application/analysis_run/service.py                                 │
│    AnalysisRunService.create_power_flow_run()                        │
│    AnalysisRunService.execute_run() → _execute_power_flow()          │
│    Snapshot construction, input hash, deduplication                   │
│  application/execution_engine/service.py                             │
│    ExecutionEngineService (target: unified execute_run_load_flow())   │
│    Run lifecycle: PENDING → RUNNING → DONE | FAILED                  │
│  application/result_mapping/                                         │
│    LF solver output → LoadFlowResultSetV1 (future)                   │
│  application/proof_engine/packs/p14_power_flow.py                    │
│    Proof generation from trace + result (NOT-A-SOLVER)               │
│  NO physics. Orchestration, validation, mapping only.                │
└──────────────────────────────────────────────────────────────────────┘
                                │
┌──────────────────────────────────────────────────────────────────────┐
│                       ANALYSIS LAYER                                 │
│  analysis/power_flow/                                                │
│    analysis.py      — result assembly, violations, balance check     │
│    violations.py    — VoltageViolationsDetector (Umin/Umax)          │
│    violations_report.py  — PDF section builder                       │
│    result.py        — PowerFlowResult (analysis-level composite)     │
│    solver.py        — deprecated adapter (delegates to solver layer) │
│    types.py         — re-exports from solver types                   │
│  analysis/power_flow_interpretation/                                 │
│    PowerFlowInterpretationBuilder (P22)                              │
│  INTERPRETATION ONLY. No physics. Uses solver results read-only.     │
└──────────────────────────────────────────────────────────────────────┘
                                │
┌──────────────────────────────────────────────────────────────────────┐
│                       SOLVER LAYER (PHYSICS)                         │
│  network_model/solvers/                                              │
│    power_flow_newton.py          — Newton-Raphson solver              │
│    power_flow_newton_internal.py — NR internals (Ybus, Jacobian)     │
│    power_flow_gauss_seidel.py    — Gauss-Seidel solver               │
│    power_flow_fast_decoupled.py  — Fast-Decoupled (XB/BX) solver     │
│    power_flow_types.py           — PowerFlowInput, specs             │
│    power_flow_result.py          — PowerFlowResultV1 (FROZEN)        │
│    power_flow_trace.py           — PowerFlowTrace (WHITE BOX)        │
│  PHYSICS HERE ONLY. WHITE BOX REQUIRED. DETERMINISTIC.               │
└──────────────────────────────────────────────────────────────────────┘
```

### 2.2 Exact File Paths (Backend)

| Layer | Path | Responsibility |
|-------|------|----------------|
| Solver | `backend/src/network_model/solvers/power_flow_newton.py` | NR solver, `PowerFlowNewtonSolver.solve()` |
| Solver | `backend/src/network_model/solvers/power_flow_newton_internal.py` | Ybus, Jacobian, NR iteration loop |
| Solver | `backend/src/network_model/solvers/power_flow_gauss_seidel.py` | GS solver, `PowerFlowGaussSeidelSolver.solve()` |
| Solver | `backend/src/network_model/solvers/power_flow_fast_decoupled.py` | FDLF solver (XB/BX), `PowerFlowFastDecoupledSolver.solve()` |
| Solver | `backend/src/network_model/solvers/power_flow_types.py` | `PowerFlowInput`, `SlackSpec`, `PQSpec`, `PVSpec`, `PowerFlowOptions` |
| Solver | `backend/src/network_model/solvers/power_flow_result.py` | `PowerFlowResultV1` (FROZEN v1.0.0), `build_power_flow_result_v1()` |
| Solver | `backend/src/network_model/solvers/power_flow_trace.py` | `PowerFlowTrace`, `PowerFlowIterationTrace` (WHITE BOX) |
| Analysis | `backend/src/analysis/power_flow/analysis.py` | `assemble_power_flow_result()`, violations, balance check |
| Analysis | `backend/src/analysis/power_flow/violations.py` | `VoltageViolationsDetector`, `VoltageViolationsResult` |
| Analysis | `backend/src/analysis/power_flow/result.py` | `PowerFlowResult` (analysis-level composite) |
| Analysis | `backend/src/analysis/power_flow/solver.py` | Deprecated adapter: delegates to `PowerFlowNewtonSolver` |
| Application | `backend/src/application/analysis_run/service.py` | `AnalysisRunService` — run lifecycle, snapshot, hash |
| Application | `backend/src/application/execution_engine/service.py` | `ExecutionEngineService` — canonical execution pipeline |
| API | `backend/src/api/power_flow_runs.py` | REST endpoints for LF runs |

### 2.3 Exact File Paths (Frontend)

| Module | Path | Responsibility |
|--------|------|----------------|
| Results Inspector | `frontend/src/ui/power-flow-results/` | Bus/Branch/Summary/Trace/Interpretation tabs |
| Results Browser | `frontend/src/ui/results-browser/` | Cross-analysis results listing, filtering |
| Results Workspace | `frontend/src/ui/results-workspace/` | Unified workspace with SLD overlay |
| SLD Overlay | `frontend/src/ui/power-flow-results/PowerFlowSldOverlay.tsx` | Voltage/loading overlay on SLD |

---

## 3. Zero Heuristics Policy

The Load Flow subsystem operates under a **strict zero-heuristics regime**. Every parameter consumed by any solver MUST be explicitly provided by the caller. Missing parameters are errors, not opportunities for defaults.

### 3.1 Banned Patterns

| ID | Banned Pattern | What MUST Happen Instead |
|----|---------------|--------------------------|
| ZH-01 | Auto-slack selection | Caller MUST provide `SlackSpec.node_id` explicitly. If missing: `ValidationIssue(code="pf.slack.missing")` + FixAction with candidate list. |
| ZH-02 | Auto-Q from P (implicit cos phi) | If inverter/converter setpoint specifies `p_mw` but neither `q_mvar` nor `cosphi`: raise `ValueError("requires exactly one of q_mvar or cosphi")`. Both present: also error. |
| ZH-03 | Implicit tolerance | `PowerFlowOptions.tolerance` MUST be provided in `LoadFlowRunInput`. Current default `1e-8` in dataclass is permitted ONLY for direct solver tests. Application layer MUST pass explicit value from Case config. |
| ZH-04 | Implicit iteration limit | `PowerFlowOptions.max_iter` MUST be provided. Same rule as ZH-03. |
| ZH-05 | Implicit start mode | `PowerFlowOptions.flat_start` MUST be explicit (`true` or `false`). No auto-detection from previous solution. |
| ZH-06 | Implicit distributed slack weights | Not supported. Single slack bus only. Any future distributed slack requires explicit per-bus participation factors. |
| ZH-07 | Threshold-based coloring without explicit parameters | Interpretation thresholds (voltage deviation %, branch loading %) MUST be passed from Case config or explicit constants. No hidden magic numbers in frontend. |
| ZH-08 | Auto-detection of bus type | Bus type (SLACK/PQ/PV) is determined exclusively from Wizard node_type + source type. No solver-side guessing. |
| ZH-09 | Implicit base MVA | `PowerFlowInput.base_mva` MUST be provided. No fallback to 100. Application layer reads from Case `case_payload.base_mva`. |
| ZH-10 | Fallback solver selection | When `solver_method` is specified (e.g., GS), the system does NOT silently fall back to NR. Fallback to NR requires `allow_fallback=True` to be explicitly set. If not set and GS does not converge: FAILED run. |

### 3.2 FixAction Pattern

When a required parameter is missing, the system MUST:

1. Refuse execution.
2. Return a `ValidationIssue` with:
   - `code`: unique error identifier (e.g., `"pf.slack.missing"`)
   - `message`: human-readable description (Polish in UI)
   - `field`: path to missing field
3. Where applicable, return deterministic `FixAction` candidates:
   - Sorted lexicographically by candidate ID.
   - No pre-selection. No "recommended" marker.
   - User must explicitly click to apply.

---

## 4. Determinism Requirements

### 4.1 Run Hash Invariant

```
Same Snapshot + Same LoadFlowRunInput → identical input_hash (SHA-256)
```

The `input_hash` is computed by `compute_input_hash()` in `application/analysis_run/service.py`:

```python
def compute_input_hash(snapshot: dict) -> str:
    canonical = canonicalize(snapshot)        # sort keys, sort lists by id fields
    payload = json.dumps(canonical, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()
```

### 4.2 Canonicalization Rules

| Rule | Implementation |
|------|----------------|
| Dict keys sorted | `sorted(value.keys())` at every level |
| Lists in `DETERMINISTIC_LIST_KEYS` sorted by id | `sorted(items, key=_stable_list_key)` for keys `{nodes, branches, sources, loads}` |
| Stable id key lookup | Priority: `id` > `node_id` > `branch_id` |
| Float format | `json.dumps` with `separators=(",", ":")` — no trailing zeros, no locale |
| Complex numbers | Stored as `{"re": float, "im": float}` — never Python repr |

### 4.3 Permutation Invariance

Element ordering in the input MUST NOT affect the result:

- Bus results sorted by `bus_id` (lexicographic).
- Branch results sorted by `branch_id` (lexicographic).
- PQ bus IDs sorted in trace (`pq_bus_ids: tuple[str, ...]`).
- PV bus IDs sorted in trace (`pv_bus_ids: tuple[str, ...]`).
- Iteration traces ordered by iteration number (`k`).
- Violation lists sorted by `(-severity, type, id)`.

### 4.4 Canonical Float Function

All float values exposed in `PowerFlowResultV1` and `PowerFlowTrace` use Python's native `float()` conversion (IEEE 754 double). No rounding or formatting at the solver/result level. Formatting is a presentation concern only.

### 4.5 Result Deduplication

If a FINISHED run with identical `input_hash` exists for the same `(project_id, operating_case_id, analysis_type)`:

- A new run UUID is ALWAYS created (Run = event).
- Results are copied from the existing run (Result = reusable).
- `_dedup` metadata is added to `trace_json`:

```json
{
  "_dedup": {
    "dedup_source_run_id": "<UUID>",
    "dedup_reason": "identical_input_hash"
  }
}
```

---

## 5. Solver Layer Contract

### 5.1 Solver Interface

All three solvers (NR, GS, FD) return the same type: `PowerFlowNewtonSolution`.

```python
@dataclass(frozen=True)
class PowerFlowNewtonSolution:
    converged: bool
    iterations: int
    max_mismatch: float
    node_voltage: dict[str, complex]
    node_u_mag: dict[str, float]
    node_angle: dict[str, float]
    node_voltage_kv: dict[str, float]
    branch_current: dict[str, complex]
    branch_s_from: dict[str, complex]
    branch_s_to: dict[str, complex]
    branch_current_ka: dict[str, float]
    branch_s_from_mva: dict[str, complex]
    branch_s_to_mva: dict[str, complex]
    losses_total: complex
    slack_power: complex
    sum_pq_spec: complex
    branch_flow_note: str
    missing_voltage_base_nodes: list[str]
    validation_warnings: list[str]
    validation_errors: list[str]
    slack_island_nodes: list[str]
    not_solved_nodes: list[str]
    ybus_trace: dict[str, object]
    nr_trace: list[dict[str, object]]
    applied_taps: list[dict[str, object]]
    applied_shunts: list[dict[str, object]]
    pv_to_pq_switches: list[dict[str, object]]
    init_state: dict[str, dict[str, float]] | None
    solver_method: Literal["newton-raphson", "gauss-seidel", "fast-decoupled"]
    fallback_info: dict[str, str] | None
```

### 5.2 Solver Selection

| Solver | Class | When to Use | Trace Format |
|--------|-------|-------------|--------------|
| Newton-Raphson | `PowerFlowNewtonSolver` | Default. Best for MV networks. | Full Jacobian (optional), per-bus mismatch, delta_state |
| Gauss-Seidel | `PowerFlowGaussSeidelSolver` | Educational, verification, or when NR struggles. | Per-bus mismatch, delta_state (no Jacobian) |
| Fast-Decoupled | `PowerFlowFastDecoupledSolver` | Large well-conditioned networks (X >> R). | B'/B" matrices, per-half-iteration trace |

### 5.3 WHITE BOX Requirements

Every solver MUST expose:

| Artifact | Location | Content |
|----------|----------|---------|
| Initial state | `init_state` | V0, theta0 per bus (when `trace_level="full"`) |
| Y-bus construction | `ybus_trace` | Branch admittances, shunt contributions, tap corrections |
| Per-iteration trace | `nr_trace[k]` | Mismatch per bus, norm, Jacobian (NR only), delta_state, state_next |
| PV-to-PQ switching | `pv_to_pq_switches` | Iteration, node_id, Q_calc vs limit, direction |
| Convergence info | `converged`, `iterations`, `max_mismatch` | Final state |
| Applied modifications | `applied_taps`, `applied_shunts` | What was actually applied |

**Trace level control**:
- `trace_level="summary"`: basic info (iter, max_mismatch, norms). Default.
- `trace_level="full"`: complete WHITE BOX (Jacobian, per-bus mismatch, delta_state, state_next).

---

## 6. Frozen Result APIs

### 6.1 PowerFlowResultV1 (FROZEN v1.0.0)

```python
POWER_FLOW_RESULT_VERSION = "1.0.0"

@dataclass(frozen=True)
class PowerFlowResultV1:
    result_version: str          # "1.0.0"
    converged: bool
    iterations_count: int
    tolerance_used: float
    base_mva: float
    slack_bus_id: str
    bus_results: tuple[PowerFlowBusResult, ...]     # sorted by bus_id
    branch_results: tuple[PowerFlowBranchResult, ...] # sorted by branch_id
    summary: PowerFlowSummary
```

**This API is FROZEN. Any change requires a new version (PowerFlowResultV2).**

### 6.2 PowerFlowBusResult (FROZEN)

```python
@dataclass(frozen=True)
class PowerFlowBusResult:
    bus_id: str
    v_pu: float
    angle_deg: float
    p_injected_mw: float
    q_injected_mvar: float
```

### 6.3 PowerFlowBranchResult (FROZEN)

```python
@dataclass(frozen=True)
class PowerFlowBranchResult:
    branch_id: str
    p_from_mw: float
    q_from_mvar: float
    p_to_mw: float
    q_to_mvar: float
    losses_p_mw: float
    losses_q_mvar: float
```

### 6.4 PowerFlowSummary (FROZEN)

```python
@dataclass(frozen=True)
class PowerFlowSummary:
    total_losses_p_mw: float
    total_losses_q_mvar: float
    min_v_pu: float
    max_v_pu: float
    slack_p_mw: float
    slack_q_mvar: float
```

### 6.5 Cross-Analysis Isolation

| ResultSet | Version | Status |
|-----------|---------|--------|
| SC ResultSet v1 (ShortCircuitResult) | v1 | FROZEN. NOT TOUCHED by LF. |
| Protection ResultSet v1 | v1 | FROZEN. NOT TOUCHED by LF. |
| PowerFlowResultV1 | v1.0.0 | FROZEN. Already exists. |

**LF has NO dependency on SC or Protection** (except shared Snapshot/Execution infrastructure).

---

## 7. Integration with Execution Domain

### 7.1 Current State

LF execution flows through `AnalysisRunService`:

```
AnalysisRunService.create_power_flow_run()
    → builds snapshot (network graph + slack + PQ/PV specs + options)
    → computes input_hash
    → checks deduplication
    → persists AnalysisRun (status=CREATED)

AnalysisRunService.execute_run(run_id)
    → validates ProjectDesignMode (for SC/NN only — LF bypasses this gate)
    → validates network graph
    → validates power flow input
    → _execute_power_flow():
        → PowerFlowSolver().solve(pf_input)
        → stores result payload
        → updates run status FINISHED/FAILED
```

### 7.2 Target State (Unified ExecutionEngine)

The target architecture unifies LF execution under `ExecutionEngineService`, alongside SC and Protection:

```
ExecutionEngineService.execute_run_load_flow(
    run_id,
    graph=...,
    config=...,               # StudyCaseConfig with LF-specific params
    readiness_snapshot=...,
    validation_snapshot=...,
)
```

Lifecycle states:

```
PENDING → RUNNING → DONE | FAILED
```

### 7.3 ResultSet Mapping (Target)

```
PowerFlowNewtonSolution (solver output)
    │
    ▼
build_power_flow_result_v1()     (network_model/solvers/power_flow_result.py)
    │
    ▼
PowerFlowResultV1 (FROZEN)
    │
    ▼
LoadFlowResultSetV1 (future: application/result_mapping/load_flow_to_resultset_v1.py)
    │
    ▼
ResultSet (domain/execution.py — canonical storage)
```

### 7.4 Run Event vs Result Caching

| Concept | Semantics | Implications |
|---------|-----------|--------------|
| Run | Event — always new UUID | Every trigger creates a Run record |
| Result | Reusable — keyed by input_hash | If hash matches a FINISHED run, results are copied |
| ResultSet | Immutable — tied to run_id | Once stored, never modified |

---

## 8. Input Specification

### 8.1 PowerFlowInput (Solver Level)

```python
@dataclass
class PowerFlowInput:
    graph: NetworkGraph                               # topology + impedances
    base_mva: float                                   # EXPLICIT, no default
    slack: SlackSpec                                   # EXPLICIT: node_id, u_pu, angle_rad
    pq: list[PQSpec]                                  # EXPLICIT: node_id, p_mw, q_mvar
    pv: list[PVSpec] = []                             # EXPLICIT: node_id, p_mw, u_pu, q_min, q_max
    shunts: list[ShuntSpec] = []                      # EXPLICIT: node_id, g_pu, b_pu
    taps: list[TransformerTapSpec] = []               # EXPLICIT: branch_id, tap_ratio
    bus_limits: list[BusVoltageLimitSpec] = []         # EXPLICIT: node_id, u_min_pu, u_max_pu
    branch_limits: list[BranchLimitSpec] = []          # EXPLICIT: branch_id, s_max_mva, i_max_ka
    options: PowerFlowOptions                          # EXPLICIT: tolerance, max_iter, etc.
```

### 8.2 Snapshot (Application Level)

The snapshot stored with each run is a JSON dict:

```json
{
  "snapshot_id": "<str>",
  "base_mva": 100.0,
  "slack": {
    "node_id": "<uuid>",
    "u_pu": 1.0,
    "angle_rad": 0.0
  },
  "pq": [
    {"node_id": "<uuid>", "p_mw": 2.5, "q_mvar": 1.2}
  ],
  "pv": [
    {"node_id": "<uuid>", "p_mw": 5.0, "u_pu": 1.02, "q_min_mvar": -3.0, "q_max_mvar": 3.0}
  ],
  "options": {
    "tolerance": 1e-8,
    "max_iter": 30,
    "flat_start": true,
    "trace_level": "summary"
  }
}
```

All fields are EXPLICIT. The snapshot is the single source of truth for reproducibility.

---

## 9. Violations and Interpretation

### 9.1 Violations (Analysis Layer)

Violations are detected AFTER solver execution, in `analysis/power_flow/analysis.py`:

| Violation Type | Condition | Source |
|----------------|-----------|--------|
| `bus_voltage` (under) | `v_pu < u_min_pu` | `BusVoltageLimitSpec` |
| `bus_voltage` (over) | `v_pu > u_max_pu` | `BusVoltageLimitSpec` |
| `branch_loading` (over) | `max(|S_from|, |S_to|) > s_max_mva` | `BranchLimitSpec` or `TransformerBranch.rated_power_mva` |
| `branch_current` (over) | `I_ka > i_max_ka` | `BranchLimitSpec` or `LineBranch.rated_current_a` |

Violations are sorted deterministically: `key=(-severity, type, id)`.

### 9.2 VoltageViolationsDetector (Standalone Analysis)

`VoltageViolationsDetector` in `analysis/power_flow/violations.py` provides Umin/Umax checking against `PowerFlowResultV1`:

- Limit priority: `custom_limits` > `BusInfo` > `default_umin/umax_pu`
- Produces `VoltageViolationsResult` with deterministic sorting by `bus_id`.
- Polish label convention: uses `bus_name` from `BusInfo` when available.

### 9.3 Interpretation (P22)

`PowerFlowInterpretationBuilder` generates findings from solver results:

| Finding Category | Severity Mapping |
|-----------------|-----------------|
| Voltage deviation < 2% | INFO |
| Voltage deviation 2-5% | WARN |
| Voltage deviation > 5% | HIGH |
| Branch loading (configurable thresholds) | INFO / WARN / HIGH |

**Rules**:
- Thresholds MUST be explicit (passed from config or constants) — ZH-07.
- Findings are deterministic: sorted by `(-severity_rank, element_id)`.
- Interpretation is IDEMPOTENT: same run_id produces identical interpretation.
- Interpretation is CACHED in-memory (1 run -> 1 interpretation).

---

## 10. FixActions

FixActions are the ONLY permitted form of guidance. They are declarative suggestions that MUST be explicitly accepted by the user.

### 10.1 FixAction Candidates

| Error Condition | FixAction Type | Candidates |
|----------------|----------------|------------|
| Slack bus not defined | `NAVIGATE_TO_ELEMENT` | List of SLACK-type nodes, sorted by id |
| Missing PQ/PV specs for node | `OPEN_MODAL` | Node inspector with empty fields |
| Missing voltage limits | `ADD_MISSING_DEVICE` | Default limit template |
| Non-convergence | `MODIFY_OPTIONS` | Suggest: increase `max_iter`, adjust `damping`, try different solver |
| Island without slack | `NAVIGATE_TO_ELEMENT` | Nodes in isolated island |

### 10.2 FixAction Rules

1. **NEVER auto-apply**. FixActions are presented to user. User must click.
2. **Deterministic ordering**. Candidates sorted lexicographically by id.
3. **No "recommended" marker**. All candidates are equal.
4. **No pre-selection**. UI presents list without checkmarks.
5. **Trace auditable**. Applied FixAction is recorded in run trace.

---

## 11. Prohibitions (BINDING)

| ID | Prohibition | Enforcement |
|----|-------------|-------------|
| LF-01 | No physics calculations outside `network_model/solvers/` | arch_guard.py, code review |
| LF-02 | No modification to `PowerFlowResultV1` schema | schema snapshot guard, frozen dataclass |
| LF-03 | No modification to SC ResultSet v1 | diff-guard on `network_model/solvers/short_circuit*` |
| LF-04 | No modification to Protection ResultSet v1 | diff-guard on Protection domain |
| LF-05 | No auto-slack selection in solver or application layer | Test: missing slack -> `ValueError` |
| LF-06 | No implicit Q derivation from P | Test: missing Q + missing cosphi -> error |
| LF-07 | No non-deterministic patterns (datetime.now in hash, random, set iteration) | determinism guard tests |
| LF-08 | No English in UI strings | `no_codenames_guard.py`, Polish labels only |
| LF-09 | No project codenames in UI | `scripts/no_codenames_guard.py` |
| LF-10 | No physics in presentation layer | arch_guard.py |
| LF-11 | No model mutation in analysis/interpretation layer | Code review, frozen dataclasses |
| LF-12 | No hidden solver corrections or undocumented simplifications | WHITE BOX audit, trace completeness tests |
| LF-13 | No auto-apply of FixActions | UI test: FixAction requires click |
| LF-14 | No threshold-based coloring without explicit parameters | Interpretation thresholds must come from config |

---

## 12. Data Flow

```
NetworkModel (ONE per project)
    │
    ▼
StudyCase (config only: base_mva, slack, PQ/PV specs, options)
    │
    ▼
AnalysisRunService.create_power_flow_run()
    │ (builds snapshot, computes input_hash)
    ▼
AnalysisRun (CREATED, snapshot frozen)
    │
    ▼
AnalysisRunService.execute_run()
    │
    ├── _validate_network_graph() → ValidationReport
    ├── _validate_power_flow_input() → ValidationReport
    │   (missing slack → error + FixAction, NaN/Inf → error)
    │
    ▼ (if valid)
PowerFlowSolver().solve(pf_input) → PowerFlowNewtonSolution
    │
    ├── Solver: NR / GS / FD (selected explicitly)
    ├── WHITE BOX trace: ybus_trace, nr_trace[], init_state
    ├── Result: node voltages, branch flows, losses
    │
    ▼
assemble_power_flow_result() → PowerFlowResult (analysis composite)
    │
    ├── Violations detection (Umin/Umax, branch loading)
    ├── Power balance check
    ├── White-box trace assembly
    │
    ▼
Result persisted → AnalysisRun status = FINISHED
    │
    ├──▶ API: GET /results → PowerFlowResultV1 (FROZEN)
    ├──▶ API: GET /trace → PowerFlowTrace (WHITE BOX)
    ├──▶ API: GET /interpretation → InterpretationResult (P22)
    ├──▶ API: GET /export/{format} → JSON / DOCX / PDF
    └──▶ Frontend: results inspector, SLD overlay, workspace
```

---

## 13. Testing Requirements

### 13.1 Solver Tests

| Test Category | Location | What it Verifies |
|---------------|----------|------------------|
| NR convergence | `tests/test_power_flow_v2.py` | Converges for standard MV networks |
| GS convergence | `tests/test_power_flow_gauss_seidel*.py` | Converges (or correctly fails with fallback info) |
| FD convergence | `tests/test_power_flow_fast_decoupled*.py` | Converges for well-conditioned networks |
| Determinism | `tests/test_power_flow_determinism*.py` | Same input → same output (byte-exact JSON) |
| WHITE BOX | `tests/test_power_flow_trace*.py` | Trace contains all required artifacts |
| Frozen result | `tests/test_result_api_contract.py` | `PowerFlowResultV1` schema unchanged |

### 13.2 Application Tests

| Test Category | What it Verifies |
|---------------|------------------|
| Input hash determinism | `compute_input_hash(A) == compute_input_hash(permute(A))` |
| Deduplication | Identical hash → results copied, not recomputed |
| Validation gate | Missing slack → FAILED run with `pf.slack.missing` |
| Run lifecycle | CREATED → VALIDATED → RUNNING → FINISHED/FAILED |

### 13.3 Frontend Tests

| Test Category | Location |
|---------------|----------|
| Results table rendering | `ui/power-flow-results/__tests__/` |
| Deterministic sorting | Verify bus/branch results arrive sorted |
| Polish labels | No English strings in rendered output |
| No physics | No calculations in component code |

---

## 14. Versioning

| Component | Current Version | Freeze Policy |
|-----------|----------------|---------------|
| `PowerFlowResultV1` | 1.0.0 | FROZEN. New fields require `PowerFlowResultV2`. |
| `PowerFlowTrace` | 1.0.0 | FROZEN for existing fields. Additive fields allowed (must not break existing consumers). |
| `POWER_FLOW_SOLVER_VERSION` | 1.0.0 | Tracks solver behavior version. Bump on algorithm change. |
| `POWER_FLOW_RESULT_VERSION` | 1.0.0 | Tracks result schema version. Bump on schema change. |

---

*End of Load Flow Canonical Architecture.*
