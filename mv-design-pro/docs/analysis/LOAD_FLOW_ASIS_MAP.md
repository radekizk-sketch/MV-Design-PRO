# LOAD FLOW AS-IS INTEGRATION MAP

> **Status**: PHASE A — Full Repository Scan
> **Date**: 2026-02-13
> **Scope**: Current state of Load Flow integration across all layers — before RUN #2A closure
> **Rule**: This document describes AS-IS state only. No proposals, no new entities.
>
> **KOREKTA 2026-09-30 (karty TORY-TYLKO-W-TESTACH i TORY-POPRAWKI):** dokument opisuje
> stan z 2026-02-13. `analysis/power_flow/solver.py` (`PowerFlowSolver`,
> `solve_power_flow`), `analysis/power_flow/analysis.py` (`assemble_power_flow_result`),
> `analysis/power_flow/_internal.py`, `violations.py`, `violations_report.py` oraz
> `AnalysisRunService` (§3.2) nie istnieją. Rozpływ liczy bieg kanoniczny
> `enm/canonical_analysis.py::_execute_power_flow`; pakiet `analysis/power_flow/` to dziś
> `result.py` i `types.py` (typy wyniku i reeksport kontraktu wejścia).

---

## Table of Contents

1. [Backend — Execution Domain](#1-backend--execution-domain)
2. [Backend — Load Flow Solver (AS-IS)](#2-backend--load-flow-solver-as-is)
3. [Backend — Load Flow Analysis Layer](#3-backend--load-flow-analysis-layer)
4. [Backend — Load Flow API](#4-backend--load-flow-api)
5. [Backend — FixActions / Error Coding](#5-backend--fixactions--error-coding)
6. [Backend — Network Model (Snapshot Data)](#6-backend--network-model-snapshot-data)
7. [Frontend — Workspace](#7-frontend--workspace)
8. [Frontend — Results Browser](#8-frontend--results-browser)
9. [Frontend — SLD Overlay Runtime](#9-frontend--sld-overlay-runtime)
10. [Frontend — Power Flow Results Module](#10-frontend--power-flow-results-module)
11. [Tests and CI](#11-tests-and-ci)
12. [Gap Analysis (AS-IS vs RUN #2A Target)](#12-gap-analysis-as-is-vs-run-2a-target)
13. [Integration Points Summary](#13-integration-points-summary)

---

## 1. Backend — Execution Domain

### 1.1 Analysis Type Registry

**File**: `backend/src/domain/execution.py` (lines 50–57)

```python
class ExecutionAnalysisType(str, Enum):
    SC_3F = "SC_3F"
    SC_1F = "SC_1F"
    SC_2F = "SC_2F"
    LOAD_FLOW = "LOAD_FLOW"
    PROTECTION = "PROTECTION"
```

`LOAD_FLOW` is already registered in the enum. No enum modification needed.

### 1.2 Run Pipeline (StudyCase → Run → ResultSet)

**File**: `backend/src/application/execution_engine/service.py`

| Step | Method | Lines | Description |
|------|--------|-------|-------------|
| 1. Create | `create_run()` | 111–201 | Create Run in PENDING status |
| 1a. Gate | — | 144–154 | Verify study case exists |
| 1b. Gate | — | 147–155 | Check `readiness.ready == True` |
| 1c. Gate | — | 158–174 | Check `eligibility.eligible == True` |
| 1d. Freeze | — | 177 | Deep copy solver_input |
| 1e. Hash | — | 178 | `compute_solver_input_hash(frozen_input)` |
| 1f. Create | — | 181–185 | `new_run()` → Run(PENDING) |
| 1g. Store | — | 188–191 | Store in `_runs` dict |
| 2. Start | `start_run()` | 207–214 | PENDING → RUNNING |
| 3a. Execute SC | `execute_run_sc()` | 282–375 | SC analysis end-to-end |
| 3b. Execute Protection | `execute_run_protection()` | 428–531 | Protection analysis end-to-end |
| 4. Complete | `complete_run()` | 216–260 | Build ResultSet, mark DONE |
| 5. Fail | `fail_run()` | 262–270 | Mark FAILED with error |

**CRITICAL**: There is NO `execute_run_load_flow()` method in ExecutionEngine. Load Flow execution goes through a different path — `AnalysisRunService` (see §3).

### 1.3 Run Domain Model

**File**: `backend/src/domain/execution.py` (lines 41–161)

```
RunStatus: PENDING → RUNNING → DONE | FAILED
```

Run is frozen dataclass with fields:
- `id: UUID`, `study_case_id: UUID`, `analysis_type: ExecutionAnalysisType`
- `solver_input_hash: str` (SHA-256), `status: RunStatus`
- `started_at`, `finished_at`, `error_message`

Immutable transitions via `with_status()` / `mark_running()` / `mark_done()` / `mark_failed()`.

### 1.4 Hash Computation (ExecutionEngine path)

**File**: `backend/src/domain/execution.py` (lines 290–401)

| Function | Lines | Purpose |
|----------|-------|---------|
| `compute_solver_input_hash()` | 290–304 | SHA-256 of canonical solver input JSON |
| `compute_result_signature()` | 307–315 | SHA-256 of canonical result data |
| `_canonicalize()` | 380–392 | Recursive JSON canonicalization |
| `_stable_sort_key()` | 395–401 | Stable key for deterministic list ordering |

**Deterministic list keys** (lines 367–377):
```python
_DETERMINISTIC_LIST_KEYS = {
    "buses", "branches", "transformers", "inverter_sources",
    "switches", "element_results", "nodes", "relay_results", "test_points",
}
```

### 1.5 Hash Computation (AnalysisRunService path — Load Flow)

**File**: `backend/src/application/analysis_run/service.py` (lines 42–67)

```python
DETERMINISTIC_LIST_KEYS = {"nodes", "branches", "sources", "loads"}

def canonicalize(value, *, current_key=None):
    # Recursive sorting of dicts and lists
    ...

def compute_input_hash(snapshot: dict) -> str:
    canonical = canonicalize(snapshot)
    payload = json.dumps(canonical, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()
```

**NOTE**: This is a SEPARATE hash computation from ExecutionEngine. Two paths exist.

### 1.6 Eligibility Service — LOAD_FLOW Gate

**File**: `backend/src/application/eligibility_service.py` (lines 223–290)

```python
def _compute_load_flow(self, enm, readiness):
```

Eligibility checks for LOAD_FLOW:
- E1: Source required
- E2: Buses required
- E3: catalog_ref present
- E4: Branch impedance required
- E5: Transformer uk_percent
- E6: At least one load or generator (code: `ELIG_LF_NO_LOADS_OR_GENERATORS`)
- E7: Bus voltage > 0 for all buses (code: `ELIG_LF_BUS_NO_VOLTAGE`)

Each blocker has a `FixAction` with `action_type`, `modal_type`, `payload_hint`.

### 1.7 ResultSet Domain Model

**File**: `backend/src/domain/execution.py` (lines 203–268)

Frozen dataclass with fields:
- `run_id: UUID` — binding reference to Run
- `analysis_type: ExecutionAnalysisType`
- `validation_snapshot: dict[str, Any]`
- `readiness_snapshot: dict[str, Any]`
- `element_results: tuple[ElementResult, ...]` — sorted by `element_ref`
- `global_results: dict[str, Any]`
- `deterministic_signature: str` — SHA-256

### 1.8 AnalysisRun Domain Model (Load Flow path)

**File**: `backend/src/domain/analysis_run.py`

```python
class AnalysisRun:
    # Load Flow uses its own AnalysisRun instead of ExecutionEngine Run
```

This is a separate domain model from `execution.Run`. Load Flow runs are managed through `AnalysisRunService`, not `ExecutionEngineService`.

### 1.9 Result Persistence

**File**: `backend/src/infrastructure/persistence/models.py`

`StudyResultORM` table `study_results`:
- `id: UUID`, `run_id: UUID`, `project_id: UUID`
- `result_type: str(100)`, `result_jsonb: JSONB`, `created_at: datetime`

Repository: `backend/src/infrastructure/persistence/repositories/result_repository.py`
- `add_result()` (lines 16–39)
- `list_results()` (lines 41–58)

---

## 2. Backend — Load Flow Solver (AS-IS)

### 2.1 Solver Files

**Path**: `backend/src/network_model/solvers/`

| File | Size | Purpose |
|------|------|---------|
| `power_flow_newton.py` | 10031 | PowerFlowNewtonSolver (main NR solver) |
| `power_flow_newton_internal.py` | 34817 | NR internal: Y-bus, Jacobian, iterations |
| `power_flow_gauss_seidel.py` | 27659 | Gauss-Seidel solver |
| `power_flow_fast_decoupled.py` | 31753 | Fast-decoupled solver |
| `power_flow_types.py` | 1863 | Input types (PowerFlowInput, SlackSpec, PQSpec, PVSpec) |
| `power_flow_result.py` | 7992 | PowerFlowResultV1 (FROZEN) |
| `power_flow_trace.py` | 7567 | PowerFlowTrace (WHITE BOX) |

### 2.2 PowerFlowInput Contract (AS-IS)

**File**: `backend/src/network_model/solvers/power_flow_types.py`

```python
@dataclass
class PowerFlowOptions:
    tolerance: float = 1e-8          # DEFAULT — RUN #2A requires explicit
    max_iter: int = 30               # DEFAULT — RUN #2A requires explicit
    damping: float = 1.0
    flat_start: bool = True          # DEFAULT — RUN #2A requires explicit
    validate: bool = True
    trace_level: str = "summary"     # "summary" | "full"

@dataclass
class SlackSpec:
    node_id: str
    u_pu: float = 1.0
    angle_rad: float = 0.0

@dataclass
class PQSpec:
    node_id: str
    p_mw: float          # Explicit P
    q_mvar: float        # Explicit Q — GOOD: no auto-cosφ

@dataclass
class PVSpec:
    node_id: str
    p_mw: float
    u_pu: float
    q_min_mvar: float
    q_max_mvar: float

@dataclass
class PowerFlowInput:
    graph: Any
    base_mva: float
    slack: SlackSpec                                    # SINGLE slack only
    pq: list[PQSpec]
    pv: list[PVSpec] = field(default_factory=list)
    shunts: list[ShuntSpec] = field(default_factory=list)
    taps: list[TransformerTapSpec] = field(default_factory=list)
    bus_limits: list[BusVoltageLimitSpec] = field(default_factory=list)
    branch_limits: list[BranchLimitSpec] = field(default_factory=list)
    options: PowerFlowOptions = field(default_factory=PowerFlowOptions)
```

**Key observations**:
- `PQSpec` has both `p_mw` and `q_mvar` explicitly — NO auto-cosφ. This is correct.
- `SlackSpec` supports SINGLE slack only. No distributed slack.
- `PowerFlowOptions` has DEFAULT values for tolerance, max_iter, flat_start — violates "zero defaults" policy.
- `base_mva` is explicit — GOOD.

### 2.3 PowerFlowNewtonSolver

**File**: `backend/src/network_model/solvers/power_flow_newton.py`

```python
class PowerFlowNewtonSolver:
    def solve(self, pf_input: PowerFlowInput) -> PowerFlowNewtonSolution:
```

PowerFlowNewtonSolution (frozen dataclass):
- `converged: bool`, `iterations: int`, `max_mismatch: float`
- `node_voltage: dict[str, complex]`, `node_u_mag: dict[str, float]`, `node_angle: dict[str, float]`
- `node_voltage_kv: dict[str, float]`
- `branch_current: dict[str, complex]`, `branch_s_from: dict[str, complex]`, `branch_s_to: dict[str, complex]`
- `branch_current_ka: dict[str, float]`, `branch_s_from_mva: dict[str, complex]`, `branch_s_to_mva: dict[str, complex]`
- `losses_total: complex`, `slack_power: complex`, `sum_pq_spec: complex`
- `branch_flow_note: str`
- `missing_voltage_base_nodes: list[str]`
- `validation_warnings: list[str]`, `validation_errors: list[str]`
- `slack_island_nodes: list[str]`, `not_solved_nodes: list[str]`
- `ybus_trace: dict`, `nr_trace: list[dict]`
- `applied_taps: list[dict]`, `applied_shunts: list[dict]`, `pv_to_pq_switches: list[dict]`
- `init_state: dict | None`
- `solver_method: Literal["newton-raphson", "gauss-seidel", "fast-decoupled"]`
- `fallback_info: dict | None`

### 2.4 PowerFlowResultV1 (FROZEN)

**File**: `backend/src/network_model/solvers/power_flow_result.py`

```python
POWER_FLOW_RESULT_VERSION = "1.0.0"

@dataclass(frozen=True)
class PowerFlowResultV1:
    result_version: str
    converged: bool
    iterations_count: int
    tolerance_used: float
    base_mva: float
    slack_bus_id: str
    bus_results: tuple[PowerFlowBusResult, ...]      # sorted by bus_id
    branch_results: tuple[PowerFlowBranchResult, ...]  # sorted by branch_id
    summary: PowerFlowSummary
```

**PowerFlowBusResult**: bus_id, v_pu, angle_deg, p_injected_mw, q_injected_mvar
**PowerFlowBranchResult**: branch_id, p_from_mw, q_from_mvar, p_to_mw, q_to_mvar, losses_p_mw, losses_q_mvar
**PowerFlowSummary**: total_losses_p_mw, total_losses_q_mvar, min_v_pu, max_v_pu, slack_p_mw, slack_q_mvar

Factory: `build_power_flow_result_v1()` — deterministic sorting by bus_id/branch_id.

### 2.5 PowerFlowTrace (WHITE BOX)

**File**: `backend/src/network_model/solvers/power_flow_trace.py`

```python
POWER_FLOW_SOLVER_VERSION = "1.0.0"

@dataclass(frozen=True)
class PowerFlowTrace:
    solver_version: str
    input_hash: str
    snapshot_id: str | None
    case_id: str | None
    run_id: str | None
    init_state: dict[str, dict[str, float]]   # {bus_id: {v_pu, theta_rad}}
    init_method: str                           # "flat" or "last_solution"
    tolerance: float
    max_iterations: int
    base_mva: float
    slack_bus_id: str
    pq_bus_ids: list[str]                      # sorted
    pv_bus_ids: list[str]                      # sorted
    ybus_trace: dict
    iterations: list[PowerFlowIterationTrace]
    converged: bool
    final_iterations_count: int
```

Each iteration trace includes: mismatch_per_bus, norm_mismatch, max_mismatch_pu, jacobian (optional), delta_state, state_next, damping_used, step_norm.

---

## 3. Backend — Load Flow Analysis Layer

### 3.1 Analysis Layer Adapter

**Path**: `backend/src/analysis/power_flow/`

| File | Purpose |
|------|---------|
| ~~`solver.py`~~ | (skasowany 2026-09-30) Deprecated adapter → delegates to `PowerFlowNewtonSolver` |
| `types.py` | Re-exports from `network_model.solvers.power_flow_types` |
| `result.py` | PowerFlowResult (legacy wrapper) |
| ~~`analysis.py`~~ | (skasowany 2026-09-30) `assemble_power_flow_result()` — assembles result from solver output |
| ~~`violations.py`~~ | (nie istnieje) Voltage/loading violation detection |
| ~~`violations_report.py`~~ | (nie istnieje) Report formatting for violations |
| ~~`_internal.py`~~ | (skasowany 2026-09-30) Internal helpers (build_slack_island, validate_input) |

### 3.2 AnalysisRunService (Load Flow Execution Path)

**File**: `backend/src/application/analysis_run/service.py`

```python
class AnalysisRunService:
    def create_power_flow_run(self, project_id, operating_case_id, options):
        # Creates AnalysisRun in CREATED status
        ...

    def execute_power_flow_run(self, run_id):
        # 1. Load project + snapshot
        # 2. Build PowerFlowInput from snapshot + options
        # 3. Call solver
        # 4. Store result
        # 5. Mark FINISHED/FAILED
        ...
```

**CRITICAL**: Load Flow goes through `AnalysisRunService`, NOT through `ExecutionEngineService.execute_run_load_flow()`. This is a SEPARATE path from SC and Protection.

### 3.3 Analysis Run Module Structure

**Path**: `backend/src/application/analysis_run/`

| File | Purpose |
|------|---------|
| `service.py` | AnalysisRunService (create, execute, get PF runs) |
| `orchestrator.py` | Run orchestration |
| `results_inspector.py` | Results inspection |
| `export_service.py` | Export (JSON, DOCX, PDF) |
| `read_model.py` | Read model projections |
| `result_invalidator.py` | Result invalidation on model change |
| `dtos.py` | Data transfer objects |

---

## 4. Backend — Load Flow API

### 4.1 Power Flow Endpoints

**File**: `backend/src/api/power_flow_runs.py`

| Endpoint | Method | Lines | Purpose |
|----------|--------|-------|---------|
| `/projects/{id}/power-flow-runs` | GET | 94–129 | List power flow runs |
| `/projects/{id}/power-flow-runs` | POST | 133–170 | Create power flow run |
| `/power-flow-runs/{run_id}/execute` | POST | 175–200 | Execute power flow run |
| `/power-flow-runs/{run_id}` | GET | 204–245 | Get run metadata |
| `/power-flow-runs/{run_id}/results` | GET | 248–360 | Get PowerFlowResultV1 |
| `/power-flow-runs/{run_id}/trace` | GET | 365–430 | Get PowerFlowTrace |
| `/power-flow-runs/{run_id}/export/json` | GET | 577–615 | Export JSON |
| `/power-flow-runs/{run_id}/export/docx` | GET | 618–740 | Export DOCX |
| `/power-flow-runs/{run_id}/export/pdf` | GET | 742–835 | Export PDF |
| `/power-flow-runs/{run_id}/proof` | GET | 1003–1055 | Export proof (PF) |

Request model:
```python
class PowerFlowRunCreateRequest(BaseModel):
    operating_case_id: UUID | None = None     # If None, uses Active Case
    options: dict[str, Any] | None = None     # Solver options (tolerance, max_iter, etc.)
```

Response model:
```python
class PowerFlowRunResponse(BaseModel):
    id: str
    deterministic_id: str
    project_id: str
    operating_case_id: str
    analysis_type: str
    status: str
    result_status: str
    created_at: str
    started_at: str | None
    finished_at: str | None
    input_hash: str
    converged: bool | None
    iterations: int | None
```

### 4.2 Analysis Runs (Generic)

**File**: `backend/src/api/analysis_runs.py`

| Endpoint | Method | Lines | Purpose |
|----------|--------|-------|---------|
| `/projects/{id}/analysis-runs` | GET | 70–108 | List analysis runs |
| `/analysis-runs/{run_id}` | GET | 111–153 | Get run details |
| `/analysis-runs/{run_id}/results` | GET | 161–181 | Get results |
| `/analysis-runs/{run_id}/results/buses` | GET | 342–360 | Get bus results |
| `/analysis-runs/{run_id}/results/branches` | GET | 363–381 | Get branch results |
| `/analysis-runs/{run_id}/export/docx` | GET | 253–281 | Export DOCX |
| `/analysis-runs/{run_id}/export/pdf` | GET | 284–306 | Export PDF |

### 4.3 Power Flow Comparison

**File**: `backend/src/domain/power_flow_comparison.py`

```python
class PowerFlowComparisonResult:
    # Comparison between two PF runs
    ...
```

---

## 5. Backend — FixActions / Error Coding

### 5.1 Validation Error Model

**File**: `backend/src/network_model/validation/` (validation module)

Validation errors are structured with:
- Error code (string, e.g., `"MISSING_IMPEDANCE"`, `"DANGLING_BUS"`)
- Severity level
- Element reference
- Human-readable message (Polish)
- Optional `FixAction` payload

### 5.2 FixAction Pattern

```python
fix_action = {
    "action_type": str,       # "OPEN_MODAL" | "NAVIGATE_TO_ELEMENT" | "SELECT_CATALOG" | "ADD_MISSING_DEVICE"
    "element_ref": str | None,
    "modal_type": str | None,
    "payload_hint": dict | None,
}
```

FixActions are attached to eligibility issues and rendered by the frontend as clickable suggestions. They are **never auto-executed**.

### 5.3 Load Flow Eligibility FixActions

| Error Code | FixAction |
|------------|-----------|
| `ELIG_LF_NO_LOADS_OR_GENERATORS` | `ADD_MISSING_DEVICE` → `LoadModal` |
| `ELIG_LF_BUS_NO_VOLTAGE` | `OPEN_MODAL` → `NodeModal` (payload: voltage_kv) |

---

## 6. Backend — Network Model (Snapshot Data)

### 6.1 Core Elements

**Path**: `backend/src/network_model/core/`

| Element | Key Fields for LF |
|---------|-------------------|
| **Bus** | `id`, `ref_id`, `voltage_kv` (base voltage), `in_service` |
| **Branch (LineBranch)** | `id`, `from_node_id`, `to_node_id`, `r_ohm_per_km`, `x_ohm_per_km`, `b_us_per_km`, `length_km`, `s_max_mva` |
| **Branch (TransformerBranch)** | `id`, `from_node_id`, `to_node_id`, `sn_mva`, `uk_percent`, `ur_percent`, `tap_ratio` |
| **Source** | `id`, `node_id`, `sk_mva` or impedance equivalent — for slack identification |
| **Load** | `id`, `node_id`, `p_mw`, `q_mvar` (if available) |
| **InverterSource** | `id`, `node_id`, `in_rated_a`, `k_sc`, `in_service` — SC-focused, limited LF data |
| **Switch** | `id`, `from_node_id`, `to_node_id`, `is_closed` — topology switching |

### 6.2 Snapshot Mechanism

**File**: `backend/src/network_model/core/` — `create_network_snapshot()`

The snapshot captures the full network state for deterministic analysis. Contains buses, branches, switches, sources, loads, inverter sources.

### 6.3 NetworkValidator

**File**: `backend/src/network_model/validation/`

Pre-solver validation includes:
- Connectivity checks
- Missing impedance detection
- Dangling bus detection
- Transformer parameter validation

---

## 7. Frontend — Workspace

### 7.1 Unified Results Workspace

**Path**: `frontend/src/ui/results-workspace/`

Three modes:

| Mode | Component | Purpose |
|------|-----------|---------|
| `RUN` | `RunViewPanel.tsx` | Single analysis result |
| `BATCH` | `BatchViewPanel.tsx` | Multiple scenario results |
| `COMPARE` | `CompareViewPanel.tsx` | Two-run comparison |

### 7.2 State Management

**File**: `frontend/src/ui/results-workspace/store.ts`

State interface:
- `mode: WorkspaceMode` (`'RUN' | 'BATCH' | 'COMPARE'`)
- `overlayMode: 'result' | 'delta' | 'none'`
- `selectedRunId: string | null`

Filter functions support analysis_type filtering (SC_3F, LOAD_FLOW, etc.).

### 7.3 Workspace Types

**File**: `frontend/src/ui/results-workspace/types.ts`

```typescript
// Analysis type labels (already include LOAD_FLOW)
function getAnalysisTypeLabel(type: string): string
```

### 7.4 Workspace API

**File**: `frontend/src/ui/results-workspace/api.ts`

```typescript
async function fetchWorkspaceProjection(studyCaseId: string): Promise<WorkspaceProjection>
```

### 7.5 Workspace Tests

- `__tests__/store.test.ts` — store operations
- `__tests__/determinism-lock.test.ts` — determinism (references LOAD_FLOW in test data)

---

## 8. Frontend — Results Browser

### 8.1 Results Browser Module

**Path**: `frontend/src/ui/results-browser/`

| File | Purpose |
|------|---------|
| `ResultsBrowser.tsx` | Main results browser component |
| `ResultsComparison.tsx` | Comparison view |
| `ResultsExport.tsx` | Export controls |
| `ResultsFilters.tsx` | Filters panel |
| `ResultsTable.tsx` | Data table component |
| `api.ts` | API client for PF results |
| `store.ts` | Zustand store |
| `types.ts` | TypeScript types |

### 8.2 Results API Client

**File**: `frontend/src/ui/results-browser/api.ts`

| Function | Endpoint | Returns |
|----------|----------|---------|
| `fetchBusVoltages(runId)` | `/power-flow-runs/{runId}/results` | `BusVoltageRow[]` |
| `fetchBranchFlows(runId)` | `/power-flow-runs/{runId}/results` | `BranchFlowRow[]` |
| `fetchLosses(runId)` | `/power-flow-runs/{runId}/results` | `LossesRow[]` |
| `fetchViolations(runId)` | `/power-flow-runs/{runId}/violations` | `ViolationRow[]` |
| `fetchConvergence(runId)` | `/power-flow-runs/{runId}/trace` | `ConvergenceRow[]` |
| `fetchRunsForComparison(projectId)` | `/projects/{projectId}/power-flow-runs` | `RunHeaderCompare[]` |
| `exportToCSV()` | client-side | void |
| `exportToPDF(runId)` | `/power-flow-runs/{runId}/export/pdf` | void |
| `exportToExcel(runId)` | `/power-flow-runs/{runId}/export/xlsx` | void |

**NOTE**: API client has placeholder functions (`getBaseVoltage`, `determineBusType`, `calculateCurrent`, `calculateLoading`) with hardcoded defaults (e.g., `getBaseVoltage` returns 20.0 kV). These need proper data sources.

### 8.3 Results Types

**File**: `frontend/src/ui/results-browser/types.ts`

Types: `BusVoltageRow`, `BranchFlowRow`, `LossesRow`, `ViolationRow`, `ConvergenceRow`, `RunHeaderCompare`, `ResultsViewMode`.

### 8.4 Violations Logic

**File**: `frontend/src/ui/results-browser/api.ts` (lines 127–173)

Voltage violations computed client-side with HARDCODED thresholds:
- Undervoltage: `< 0.95 p.u.` (WARN), `< 0.90 p.u.` (HIGH)
- Overvoltage: `> 1.05 p.u.` (WARN), `> 1.10 p.u.` (HIGH)

**WARNING**: These thresholds are implicit, not from contract input. RUN #2A requires them as explicit parameters or removal.

---

## 9. Frontend — SLD Overlay Runtime

### 9.1 Architecture Overview

**Path**: `frontend/src/ui/sld-overlay/`

Pure projection layer:
1. Receives `OverlayPayloadV1` from backend
2. Matches overlay elements to SLD symbols via `element_ref ↔ elementId` bijection
3. Resolves semantic tokens → CSS classes
4. Renders as separate overlay layer (never modifies symbol geometry)

### 9.2 Type Definitions

**File**: `frontend/src/ui/sld-overlay/overlayTypes.ts`

**OverlayPayloadV1** (lines 76–78):
- `run_id: string`
- `analysis_type: string`
- `elements: OverlayElement[]`
- `legend: OverlayLegendEntry[]`

**OverlayElement** (lines 30–51):
```typescript
interface OverlayElement {
    element_ref: string;
    element_type: string;
    visual_state: 'OK' | 'WARNING' | 'CRITICAL' | 'INACTIVE';
    numeric_badges: Record<string, number | null>;
    color_token: string;          // Semantic token (NOT hex)
    stroke_token: string;
    animation_token: string | null;
}
```

### 9.3 Overlay Engine (Deterministic)

**File**: `frontend/src/ui/sld-overlay/OverlayEngine.ts`

Functions: `resolveElementStyle()`, `applyOverlayToSymbols()`, `formatBadgeValue()`.
Matching: `symbolElementIds.has(element.element_ref)`.
Invariant: Same input → identical output, every time. No physics.

### 9.4 SLD View — Mode Selector

**File**: `frontend/src/ui/sld/SLDView.tsx` (lines 107–116)

```typescript
const sldMode = useSldModeStore(state => state.mode);
// 'EDYCJA' | 'WYNIKI' | 'ZABEZPIECZENIA'
```

Overlay layers in SLD:
- `ResultsOverlay` — WYNIKI mode
- `ProtectionOverlayLayer` — ZABEZPIECZENIA mode
- `DiagnosticsOverlay` — dynamic

### 9.5 ID Scheme (Element Binding)

| Symbol Type | elementId Format | Example |
|------------|-----------------|---------|
| Bus | `bus-NNN` | `bus-001` |
| LineBranch | `line-NNN` | `line-015` |
| TransformerBranch | `trafo-NNN` | `trafo-005` |
| Switch | `switch-NNN` | `switch-009` |
| Source | `source-NNN` | `source-007` |
| Load | `load-NNN` | `load-003` |

---

## 10. Frontend — Power Flow Results Module

### 10.1 Module Structure

**Path**: `frontend/src/ui/power-flow-results/`

| File | Purpose |
|------|---------|
| `store.ts` | Zustand store for PF results |
| `api.ts` | API client |
| `types.ts` | TypeScript types |
| `PowerFlowResultsInspectorPage.tsx` | Results inspector page |
| `PowerFlowSldOverlay.tsx` | PF-specific SLD overlay |
| `index.ts` | Public exports |

### 10.2 PowerFlowSldOverlay

**File**: `frontend/src/ui/power-flow-results/PowerFlowSldOverlay.tsx`

Existing PF SLD overlay component. Token-based rendering for voltage/flow results.

### 10.3 Comparisons Module

**Path**: `frontend/src/ui/comparisons/`

| File | Purpose |
|------|---------|
| `store.ts` | Zustand store for comparisons |
| `ComparisonPanel.tsx` | Comparison panel component |

---

## 11. Tests and CI

### 11.1 Determinism Test Suites

| File | What it Tests |
|------|---------------|
| `tests/test_solver_input_determinism.py` | Hash equality, permutation invariance, version lock |
| `tests/test_topology_ops_determinism.py` | Topology ops determinism |
| `tests/test_results_workspace_hash.py` | Results workspace read model determinism |
| `tests/test_fault_scenario_v2_determinism.py` | Fault scenario v2 determinism |
| `tests/e2e/test_pf_determinism_workflow.py` | Power flow determinism (NR, GS, FDLF) |

### 11.2 Power Flow Tests

| File | What it Tests |
|------|---------------|
| `tests/e2e/test_pf_determinism_workflow.py` | NR/GS/FDLF determinism |
| `tests/test_power_flow_v2.py` | Power flow solver |
| `frontend/src/ui/power-flow-results/__tests__/power-flow-results.test.ts` | Frontend PF results |
| `frontend/src/ui/results-browser/__tests__/` | Results browser |
| `frontend/src/ui/results-workspace/__tests__/determinism-lock.test.ts` | Workspace determinism |
| `frontend/src/ui/results-workspace/__tests__/store.test.ts` | Workspace store |

### 11.3 Golden Network Fixtures

| File | Description |
|------|-------------|
| `tests/golden/golden_network_sn.py` | 20-station MV network (41 nodes, 31+ branches, OZE) |
| `tests/enm/golden_network_fixture.py` | ENM model (20 stations, 31+ cables) |

### 11.4 Result Contract Tests

**File**: `tests/test_result_api_contract.py`

Tests SC ResultSet v1 contract (20 attributes, serialization, fault types). No equivalent frozen contract test for PF ResultV1 yet.

### 11.5 CI Pipeline

**File**: `.github/workflows/python-tests.yml`

- Triggers: push, pull_request
- Environment: ubuntu-latest, Python 3.11, Poetry
- Main step: `poetry run pytest -q`

### 11.6 CI Guard Scripts

**Path**: `mv-design-pro/scripts/`

| Script | Enforces |
|--------|----------|
| `no_codenames_guard.py` | No Pxx codenames in UI |
| `arch_guard.py` | Layer boundaries |
| `overlay_no_physics_guard.py` | No physics in SLD overlay |
| `results_workspace_determinism_guard.py` | No non-deterministic functions in workspace |
| `fault_scenarios_determinism_guard.py` | Determinism + no PCC in fault scenarios |
| `no_direct_fault_params_guard.py` | fault_node_id only in whitelist |
| `physics_label_guard.py` | No editable physics fields in topology modals |
| `docs_guard.py` | No PCC in docs, no broken links |

**Missing guards (for RUN #2A)**:
- No `solver_diff_guard.py` yet (needed by Protection PR-32, reusable for LF)
- No `resultset_v1_schema_guard.py` yet
- No `load_flow_no_heuristics_guard.py`
- No Load Flow determinism guard (separate from existing PF determinism test)

---

## 12. Gap Analysis (AS-IS vs RUN #2A Target)

### 12.1 Input Contract Gaps

| Requirement | AS-IS | RUN #2A Target | Gap |
|-------------|-------|----------------|-----|
| Explicit slack definition | `SlackSpec(node_id)` — single only | SINGLE + DISTRIBUTED with weights | No distributed slack support |
| Start mode | `flat_start: bool = True` (default) | Explicit FLAT_START / CUSTOM_INITIAL (mandatory) | Default value violates zero-heuristics |
| Convergence tolerance | `tolerance: float = 1e-8` (default) | Explicit (mandatory, no default) | Default value violates zero-heuristics |
| Iteration limit | `max_iter: int = 30` (default) | Explicit (mandatory, no default) | Default value violates zero-heuristics |
| Modeling mode | Implicit AC_POWER_FLOW | Explicit enum (mandatory) | Not present |
| Load modeling P+Q | `PQSpec(p_mw, q_mvar)` — both explicit | P+Q explicit (mandatory) | **GOOD** — already compliant |

### 12.2 Execution Path Gaps

| Requirement | AS-IS | RUN #2A Target | Gap |
|-------------|-------|----------------|-----|
| Unified execution lifecycle | `AnalysisRunService` (separate path) | `execute_run_load_flow()` in ExecutionEngine (like SC/Protection) | Two separate execution paths exist |
| Run hash determinism | `compute_input_hash()` in AnalysisRunService | Unified `compute_solver_input_hash()` | Separate hash functions |
| LoadFlowRunInput contract | PowerFlowInput (solver-level) | LoadFlowRunInput (application-level, no defaults) | Missing high-level contract |
| FixActions for missing input | Eligibility FixActions only | Validation FixActions for slack, Q, start_mode, etc. | Missing LF-specific FixActions |

### 12.3 ResultSet Gaps

| Requirement | AS-IS | RUN #2A Target | Gap |
|-------------|-------|----------------|-----|
| PowerFlowResultV1 | EXISTS (frozen) | Preserved (do not modify) | **GOOD** |
| LoadFlowResultSetV1 | NOT EXISTS | New canonical ResultSet mapping (like Protection) | Missing: LF → ResultSet mapper |
| ResultSet in ExecutionEngine | Not wired | Stored via `_result_sets[run_id]` | Not integrated with ExecutionEngine |
| Deterministic signature | Via build_power_flow_result_v1 | Canonical SHA-256 signature | Needs verification |

### 12.4 Frontend Gaps

| Requirement | AS-IS | RUN #2A Target | Gap |
|-------------|-------|----------------|-----|
| PF Results panel | EXISTS (results-browser + power-flow-results) | Integrated with Workspace RUN/BATCH/COMPARE | Needs workspace integration audit |
| PF SLD Overlay | EXISTS (PowerFlowSldOverlay.tsx) | Token-only, deterministic | Needs determinism audit |
| Polish labels | Mostly PL | 100% PL required | Needs audit |
| No alert() | Unknown | Zero alert() | Needs audit |
| Hardcoded thresholds | `0.95/1.05/0.90/1.10` in violations | Explicit from input contract | Thresholds are implicit |

### 12.5 CI/Guards Gaps

| Requirement | AS-IS | RUN #2A Target | Gap |
|-------------|-------|----------------|-----|
| SolverBoundaryGuard | NOT EXISTS | Blocks changes in SC/Protection solver dirs | New guard needed |
| ResultSetContractGuard | NOT EXISTS | Snapshot SC/Protection ResultSet v1 | New guard needed |
| NoHeuristicsGuard (LF) | NOT EXISTS | Blocks default slack, implicit tolerance, etc. | New guard needed |
| DeterminismSuite (LF) | `test_pf_determinism_workflow.py` exists | Enhanced: hash equality + permutation + LF-specific | Extend existing |
| UILeakGuard | NOT EXISTS | LF types only in allowed modules | New guard needed |

---

## 13. Integration Points Summary

### 13.1 LoadFlowRunInput → Execution Wiring

| Integration Point | File | What |
|-------------------|------|------|
| **New domain type** | `backend/src/domain/` | `LoadFlowRunInput` (high-level, zero defaults) |
| **Execution method** | `backend/src/application/execution_engine/service.py` | New `execute_run_load_flow()` method |
| **Hash integration** | `backend/src/domain/execution.py` | Include LF-specific keys in deterministic list |
| **Validation + FixActions** | New or extended file | LF-specific validation (missing slack, missing Q, etc.) |

### 13.2 LoadFlowResultSetV1 → ResultSet Mapping

| Integration Point | File | What |
|-------------------|------|------|
| **New mapper** | `backend/src/application/result_mapping/` | `load_flow_to_resultset_v1.py` |
| **ResultSet persistence** | `backend/src/infrastructure/persistence/` | Store LF ResultSet like SC/Protection |

### 13.3 Workspace UI Integration

| Integration Point | File | What |
|-------------------|------|------|
| **Results panel** | `frontend/src/ui/results-workspace/RunViewPanel.tsx` | LF results display in RUN mode |
| **Comparison** | `frontend/src/ui/comparisons/` | LF comparison support |
| **Overlay** | `frontend/src/ui/power-flow-results/PowerFlowSldOverlay.tsx` | Audit token-only compliance |

### 13.4 SLD Overlay Integration

| Integration Point | File | What |
|-------------------|------|------|
| **LF overlay tokens** | `frontend/src/ui/sld-overlay/overlayTypes.ts` | Voltage/flow/loading tokens |
| **SLD mode** | `frontend/src/ui/sld/SLDView.tsx` | WYNIKI mode shows LF overlay |
| **Overlay builder** | `backend/src/application/sld/overlay.py` | `ResultSldOverlayBuilder` for LF |

### 13.5 Governance & Guards

| Integration Point | File | What |
|-------------------|------|------|
| **solver_diff_guard.py** | `scripts/` | NEW — blocks solver changes |
| **resultset_v1_schema_guard.py** | `scripts/` | NEW — protects SC/Protection ResultSet |
| **load_flow_no_heuristics_guard.py** | `scripts/` | NEW — forbids default fallbacks in LF |
| **CI workflow** | `.github/workflows/python-tests.yml` | Add new guards |

---

*End of LOAD FLOW AS-IS Integration Map.*
