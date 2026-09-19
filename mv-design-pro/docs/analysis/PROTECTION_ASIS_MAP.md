# PROTECTION AS-IS INTEGRATION MAP

> **Status**: PHASE A — Full Repository Scan
> **Date**: 2026-02-12
> **Scope**: Where and how to integrate Protection Block (PR-27→PR-32) without violating canon
> **Rule**: This document describes AS-IS state only. No proposals, no new entities.

---

## Table of Contents

1. [Backend — Execution Domain](#1-backend--execution-domain)
2. [Backend — SC Results (ResultSet v1)](#2-backend--sc-results-resultset-v1)
3. [Backend — FixActions / Error Coding](#3-backend--fixactions--error-coding)
4. [Backend — Protection Engine v1 (PR-26 Base)](#4-backend--protection-engine-v1-pr-26-base)
5. [Frontend — Workspace](#5-frontend--workspace)
6. [Frontend — SLD Overlay Runtime](#6-frontend--sld-overlay-runtime)
7. [Frontend — Inspector](#7-frontend--inspector)
8. [Tests and CI](#8-tests-and-ci)
9. [Integration Points Summary](#9-integration-points-summary)

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

`PROTECTION` is already registered in the enum. No enum modification needed.

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
| 3b. Execute Protection | `execute_run_protection()` | 428–501 | Protection analysis end-to-end |
| 4. Complete | `complete_run()` | 216–260 | Build ResultSet, mark DONE |
| 5. Fail | `fail_run()` | 262–270 | Mark FAILED with error |

**Analysis Type gate checks**:
- Lines 276–280: `_SC_ANALYSIS_TYPES = {SC_3F, SC_1F, SC_2F}` — used to gate SC execution
- Lines 329–332: `execute_run_sc()` — gate ensures `analysis_type in _SC_ANALYSIS_TYPES`
- Lines 468–470: `execute_run_protection()` — gate ensures `analysis_type == PROTECTION`

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

### 1.4 Hash Computation

**File**: `backend/src/domain/execution.py` (lines 290–401)

| Function | Lines | Purpose |
|----------|-------|---------|
| `compute_solver_input_hash()` | 290–304 | SHA-256 of canonical solver input JSON |
| `compute_result_signature()` | 307–315 | SHA-256 of canonical result data |
| `_canonicalize()` | 380–392 | Recursive JSON canonicalization |
| `_stable_sort_key()` | 395–401 | Stable key for deterministic list ordering |

**Algorithm**:
1. Recursively sort all dict keys
2. Sort lists in `_DETERMINISTIC_LIST_KEYS` by stable sort key
3. `json.dumps(canonical, sort_keys=True, separators=(",", ":"))`
4. `hashlib.sha256(payload.encode("utf-8")).hexdigest()`

**Deterministic list keys** (lines 367–377):
```python
_DETERMINISTIC_LIST_KEYS = {
    "buses", "branches", "transformers", "inverter_sources",
    "switches", "element_results", "nodes", "relay_results", "test_points",
}
```

Note: `relay_results` and `test_points` are already in the set — Protection hash inputs are supported.

### 1.5 Eligibility Service

**File**: `backend/src/application/eligibility_service.py`

Current eligibility checks:
- SC_3F (lines 102–136)
- SC_1F (lines 142–177)
- SC_2F (lines 183–217)
- LOAD_FLOW (lines 223–290)

**No PROTECTION eligibility check exists**. Protection analysis operates post-SC-results and has no eligibility gate in the current code.

### 1.6 Study Case — Protection Config

**File**: `backend/src/domain/study_case.py` (lines 124–170)

```python
@dataclass(frozen=True)
class ProtectionConfig:
    template_ref: Optional[str] = None
    template_fingerprint: Optional[str] = None
    library_manifest_ref: Optional[dict] = None
    overrides: dict[str, Any] = field(default_factory=dict)
    bound_at: Optional[datetime] = None
```

- Integrated into `StudyCase` at line 202: `protection_config: ProtectionConfig`
- `with_protection_config()` (lines 254–274): creates new StudyCase, marks results OUTDATED if changed
- Cloned with case (line 447)
- Serialized in `to_dict()` / `from_dict()` (lines 466, 480)

---

## 2. Backend — SC Results (ResultSet v1)

### 2.1 ResultSet Domain Model

**File**: `backend/src/domain/execution.py` (lines 203–268)

Frozen dataclass with fields:
- `run_id: UUID` — binding reference to Run
- `analysis_type: ExecutionAnalysisType`
- `validation_snapshot: dict[str, Any]`
- `readiness_snapshot: dict[str, Any]`
- `element_results: tuple[ElementResult, ...]` — sorted by `element_ref`
- `global_results: dict[str, Any]`
- `deterministic_signature: str` — SHA-256
- `fault_scenario_id: str | None` (PR-19)
- `fault_type: str | None` (PR-19)
- `fault_location: dict[str, Any] | None` (PR-19)

Factory: `build_result_set()` (lines 318–360) — computes deterministic signature, sorts element_results.

### 2.2 ElementResult

**File**: `backend/src/domain/execution.py` (lines 169–195)

```python
@dataclass(frozen=True)
class ElementResult:
    element_ref: str
    element_type: str     # "bus", "source_contribution", "branch_contribution"
    values: dict[str, Any]
```

### 2.3 SC Solver Output (IEC 60909)

**File**: `backend/src/network_model/solvers/short_circuit_iec60909.py` (lines 58–112)

ShortCircuitResult frozen dataclass — 20 frozen keys:

| Key | Type | Unit | Description |
|-----|------|------|-------------|
| `short_circuit_type` | enum | — | 3F/2F/1F/2F+G |
| `fault_node_id` | str | — | Fault location |
| `c_factor` | float | — | Voltage factor |
| `un_v` | float | V | Nominal voltage |
| `zkk_ohm` | complex | Ω | Thevenin impedance |
| `rx_ratio` | float | — | R/X ratio |
| `kappa` | float | — | Impulse coefficient κ |
| `tk_s` | float | s | Fault duration |
| `tb_s` | float | s | Time for Ib |
| `ikss_a` | float | A | I"k — initial symmetrical SC current |
| `ip_a` | float | A | ip — peak current |
| `ith_a` | float | A | Ith — thermal equivalent |
| `ib_a` | float | A | Ib |
| `sk_mva` | float | MVA | Short-circuit power |
| `ik_thevenin_a` | float | A | Thevenin contribution |
| `ik_inverters_a` | float | A | Inverter contribution |
| `ik_total_a` | float | A | Total SC current |
| `contributions` | list | — | Source contributions |
| `branch_contributions` | list\|None | — | Branch contributions |
| `white_box_trace` | list[dict] | — | WHITE BOX steps |

White-box trace steps: Zk, Ikss, kappa, Ip, Ib, Ith, Sk (7 steps total).

### 2.4 SC → ResultSet v1 Mapper

**File**: `backend/src/application/result_mapping/short_circuit_to_resultset_v1.py`

| Function | Lines | Purpose |
|----------|-------|---------|
| `map_short_circuit_to_resultset_v1()` | 29–65 | Main mapper |
| `_build_element_results()` | 68–129 | Fault node + contributions → ElementResult[] |
| `_build_global_results()` | 132–159 | Global summary (20 keys) |

Element types created:
- `"bus"` — fault node with all SC quantities
- `"source_contribution"` — per-source Ik share
- `"branch_contribution"` — per-branch Ik flow

### 2.5 Frozen Contract v1

**File**: `backend/src/domain/result_contract_v1.py` (lines 298–350)

Pydantic model `ResultSetV1` with `model_config = {"frozen": True}`:
- `contract_version: str` = `"1.0"` (FROZEN — bump = new file)
- `run_id`, `analysis_type`, `solver_input_hash`, `created_at`
- `deterministic_signature` (excludes `created_at`)
- `global_results`, `element_results`, `overlay_payload`

API endpoint: `GET /api/execution/runs/{run_id}/results/v1` (file: `backend/src/api/result_contract_v1.py`, lines 55–88)

### 2.6 Result Mapping Directory

**Path**: `backend/src/application/result_mapping/`

| File | Purpose |
|------|---------|
| `short_circuit_to_resultset_v1.py` | SC solver → ResultSet v1 |
| `protection_to_resultset_v1.py` | Protection engine → ResultSet |
| `sc_comparison_to_overlay_v1.py` | SC comparison → SLD delta overlay |

### 2.7 Result Persistence

**File**: `backend/src/infrastructure/persistence/models.py`

`StudyResultORM` table `study_results`:
- `id: UUID`, `run_id: UUID`, `project_id: UUID`
- `result_type: str(100)`, `result_jsonb: JSONB`, `created_at: datetime`

Repository: `backend/src/infrastructure/persistence/repositories/result_repository.py`
- `add_result()` (lines 16–39)
- `list_results()` (lines 41–58)

---

## 3. Backend — FixActions / Error Coding

### 3.1 Validation Error Model

**File**: `backend/src/network_model/validation/` (validation module)

Validation errors are structured with:
- Error code (string, e.g., `"MISSING_IMPEDANCE"`, `"DANGLING_BUS"`)
- Severity level
- Element reference
- Human-readable message (Polish)
- Optional `FixAction` payload

### 3.2 FixAction Pattern

FixActions are structured as suggestion payloads:

```python
# Pattern (across codebase):
fix_action = {
    "action_type": str,       # "OPEN_MODAL" | "NAVIGATE_TO_ELEMENT" | "SELECT_CATALOG" | "ADD_MISSING_DEVICE"
    "element_ref": str | None,
    "modal_type": str | None,
    "payload_hint": dict | None,
}
```

FixActions are attached to `ReadinessIssue` objects and rendered by the frontend as clickable suggestions. They are **never auto-executed** — the user must explicitly click.

### 3.3 Readiness Issue Structure

**Frontend type** (from `types.ts`, lines 473–482):

```typescript
interface ReadinessIssue {
    code: string;
    severity: 'ERROR' | 'WARNING';
    message: string;           // Polish
    element_ref: string | null;
    fix_action: FixAction | null;
}
```

### 3.4 FixAction Rendering

**File**: `frontend/src/ui/*/EngineeringReadinessPanel.tsx` (lines 64–144)

- `IssueItem` component renders fix button
- If `fix_action` is present: renders "Napraw" button (lines 126–141)
- If `fix_action` is null: renders "Wymaga interwencji projektanta"
- Button calls `onFix(issue.fix_action)` callback — caller handles execution
- Test ID: `fix-{issue.code}`

---

## 4. Backend — Protection Engine v1 (PR-26 Base)

### 4.1 Domain Models

**File**: `backend/src/domain/protection_engine_v1.py`

| Type | Lines | Description |
|------|-------|-------------|
| `IECCurveTypeV1` | 31–35 | STANDARD_INVERSE, VERY_INVERSE, EXTREMELY_INVERSE |
| `ProtectionFunctionType` | 38–41 | F50 (I>>), F51 (I>) |
| `CTRatio` | 69–107 | CT primary/secondary conversion |
| `Function50Settings` | 115–141 | ANSI 50 — instantaneous overcurrent |
| `Function51Settings` | 149–179 | ANSI 51 — time overcurrent with IEC IDMT curve |
| `RelayV1` | 187–223 | Relay attached to circuit breaker |
| `TestPoint` | 231–253 | Explicit current test point |
| `ProtectionStudyInputV1` | 261–290 | Complete input for engine execution |
| `ProtectionResultSetV1` | 432–462 | Final result set with deterministic signature |

All types are frozen dataclasses. WHITE BOX calculations with full trace exposure.

### 4.2 Pure Functions (Engine)

**File**: `backend/src/domain/protection_engine_v1.py`

| Function | Lines | Purpose |
|----------|-------|---------|
| `iec_curve_time_seconds()` | 470–546 | IEC IDMT trip time computation |
| `function_50_evaluate()` | 549–586 | ANSI 50 evaluation |
| `function_51_evaluate()` | 589–618 | ANSI 51 evaluation |
| `execute_protection_v1()` | 626–716 | Main orchestrator |

### 4.3 Protection Analysis Model

**File**: `backend/src/domain/protection_analysis.py`

| Type | Lines | Description |
|------|-------|-------------|
| `TripState` | 29–33 | TRIPS, NO_TRIP, INVALID |
| `ProtectionRunStatus` | 36–44 | CREATED, RUNNING, FINISHED, FAILED |
| `ProtectionEvaluation` | 52–120 | Single device evaluation result |
| `ProtectionResultSummary` | 123–158 | Summary statistics |
| `ProtectionResult` | 161–220 | Main output with evaluations + summary |
| `ProtectionTraceStep` | 228–257 | White-box audit trail step |
| `ProtectionTrace` | 260–311 | Complete audit trace |
| `ProtectionAnalysisRun` | 319–391 | Lifecycle tracking (input_hash, result, trace) |

Factory: `new_protection_analysis_run()` (lines 394–423)
Helper: `compute_result_summary()` (lines 431–456)

### 4.4 Protection → ResultSet Mapper

**File**: `backend/src/application/result_mapping/protection_to_resultset_v1.py`

| Function | Lines | Purpose |
|----------|-------|---------|
| `map_protection_to_resultset_v1()` | 28–57 | Maps ProtectionResultSetV1 → ResultSet |
| `_build_element_results()` | 60–97 | Per-relay results (relay_id, cb_id, test_points) |
| `_build_global_results()` | 100–123 | Global stats (relay_count, f51_trips, f50_pickups) |

### 4.5 Protection API Endpoints

**File**: `backend/src/api/protection_runs.py`

| Endpoint | Method | Lines | Purpose |
|----------|--------|-------|---------|
| `/projects/{id}/protection-runs` | POST | 92–133 | Create protection run |
| `/protection-runs/{run_id}/execute` | POST | 136–164 | Execute protection run |
| `/protection-runs/{run_id}` | GET | 167–189 | Get run metadata |
| `/protection-runs/{run_id}/results` | GET | 192–239 | Get protection results |
| `/protection-runs/{run_id}/trace` | GET | 242–288 | Get protection trace |
| `/projects/{id}/sld/{did}/protection-overlay` | GET | 296–381 | Get protection SLD overlay |

### 4.6 Protection Proof Pack

**File**: `backend/src/application/proof_engine/packs/protection_settings.py`

`ProtectionSettingsProofPack` — 5-step A-B-C-D mathematical proofs for protection settings. Pure interpretation of existing trace data.

---

## 5. Frontend — Workspace

### 5.1 Unified Results Workspace

**Path**: `frontend/src/ui/results-workspace/`

Three modes:

| Mode | Component | Purpose |
|------|-----------|---------|
| `RUN` | `RunViewPanel.tsx` | Single analysis result |
| `BATCH` | `BatchViewPanel.tsx` | Multiple scenario results |
| `COMPARE` | `CompareViewPanel.tsx` | Two-run comparison |

### 5.2 State Management

**File**: `frontend/src/ui/results-workspace/store.ts`

State interface:
- `mode: WorkspaceMode` (`'RUN' | 'BATCH' | 'COMPARE'`)
- `overlayMode: 'result' | 'delta' | 'none'`
- `selectedRunId: string | null`

Actions:
- `setMode(mode)` (lines 324–327) — updates mode, syncs to URL
- `syncFromUrl()` (lines 364–388) — restores state from URL hash params
- `buildUrlFromState()` (lines 189–209) — deterministic URL serialization

### 5.3 Conditional Panel Rendering

**File**: `frontend/src/ui/results-workspace/ResultsWorkspacePage.tsx` (lines 140–142)

```tsx
{mode === 'RUN' && <RunViewPanel />}
{mode === 'BATCH' && <BatchViewPanel />}
{mode === 'COMPARE' && <CompareViewPanel />}
```

Result panels load data per analysis type: `busResults`, `branchResults`, `shortCircuitResults` from the store.

### 5.4 Analysis Runs API

**File**: `backend/src/api/analysis_runs.py`

| Endpoint | Method | Lines | Purpose |
|----------|--------|-------|---------|
| `/projects/{id}/analysis-runs` | GET | 70–108 | List analysis runs |
| `/analysis-runs/{run_id}` | GET | 111–153 | Get analysis run details |
| `/analysis-runs/{run_id}/results` | GET | 161–181 | Get analysis results |
| `/analysis-runs/{run_id}/overlay` | GET | 184–203 | Get SLD overlay for run |
| `/analysis-runs/{run_id}/trace` | GET | 206–222 | Get calculation trace |
| `/analysis-runs/{run_id}/results/index` | GET | 321–339 | Get results index |
| `/analysis-runs/{run_id}/results/buses` | GET | 342–360 | Get bus results |
| `/analysis-runs/{run_id}/results/branches` | GET | 363–381 | Get branch results |
| `/analysis-runs/{run_id}/results/short-circuit` | GET | 384–403 | Get SC results |
| `/analysis-runs/{run_id}/export/docx` | GET | 253–281 | Export to DOCX |
| `/analysis-runs/{run_id}/export/pdf` | GET | 284–306 | Export to PDF |

---

## 6. Frontend — SLD Overlay Runtime

### 6.1 Architecture Overview

**Path**: `frontend/src/ui/sld-overlay/`

Pure projection layer:
1. Receives `OverlayPayloadV1` from backend (analysis layer output)
2. Matches overlay elements to SLD symbols via `element_ref ↔ elementId` bijection
3. Resolves semantic tokens → CSS classes via token dictionaries
4. Applies viewport transformation for screen positioning
5. Renders as separate overlay layer (never modifies symbol geometry)

### 6.2 Type Definitions

**File**: `frontend/src/ui/sld-overlay/overlayTypes.ts`

**OverlayPayloadV1** (lines 76–78):
- `run_id: string` — binding reference (BINDING)
- `analysis_type: string`
- `elements: OverlayElement[]`
- `legend: OverlayLegendEntry[]`

**OverlayElement** (lines 30–51):
```typescript
interface OverlayElement {
    element_ref: string;          // Bijection with SLD symbol elementId
    element_type: string;         // Bus, LineBranch, TransformerBranch, etc.
    visual_state: 'OK' | 'WARNING' | 'CRITICAL' | 'INACTIVE';
    numeric_badges: Record<string, number | null>;
    color_token: string;          // Semantic token (NOT hex)
    stroke_token: string;
    animation_token: string | null;
}
```

**ResolvedOverlayStyle** (lines 147–170):
```typescript
interface ResolvedOverlayStyle {
    elementRef: string;
    colorClass: string;           // From COLOR_TOKEN_MAP
    strokeClass: string;          // From STROKE_TOKEN_MAP
    animationClass: string;       // From ANIMATION_TOKEN_MAP
    stateBg, stateText, stateBorder: string;
    visualState: OverlayVisualState;
    numericBadges: Record<string, number | null>;
}
```

### 6.3 Token Mapping Dictionaries

**File**: `frontend/src/ui/sld-overlay/overlayTypes.ts`

**Color tokens** (lines 100–109):
```
ok → sld-overlay-ok
warning → sld-overlay-warning
critical → sld-overlay-critical
inactive → sld-overlay-inactive
delta_none → sld-overlay-ok
delta_change → sld-overlay-warning
delta_inactive → sld-overlay-inactive
```

**Stroke tokens** (lines 115–119): `normal`, `bold`, `dashed`

**Animation tokens** (lines 125–128): `pulse`, `blink`

**Visual state styles** (lines 134–141): OK=emerald, WARNING=amber, CRITICAL=rose, INACTIVE=slate

### 6.4 Overlay Engine (Deterministic)

**File**: `frontend/src/ui/sld-overlay/OverlayEngine.ts`

| Function | Lines | Purpose |
|----------|-------|---------|
| `resolveElementStyle()` | 45–61 | OverlayElement → ResolvedOverlayStyle |
| `applyOverlayToSymbols()` | 76–97 | Main entry: overlay + symbols → Map\<elementId, style\> |
| `getElementOverlayStyle()` | 106–111 | Lookup helper |
| `formatBadgeValue()` | 122–125 | Deterministic numeric formatting |

**Matching logic** (lines 82–94):
- Build `Set<string>` of symbol elementIds
- For each overlay element: if `symbolElementIds.has(element.element_ref)` → resolve
- Missing overlay element → silently ignored (no fallback)
- Missing symbol → overlay data discarded

**Invariant**: Same input → identical output, every time. No physics.

### 6.5 Overlay Store

**File**: `frontend/src/ui/sld-overlay/overlayStore.ts`

```typescript
interface OverlayStoreState {
    activeRunId: string | null;
    overlay: OverlayPayloadV1 | null;
    enabled: boolean;
    loadOverlay(payload): void;
    clearOverlay(): void;
    toggleOverlay(forced?): void;
}
```

### 6.6 Overlay Runtime Hook

**File**: `frontend/src/ui/sld-overlay/useOverlayRuntime.ts`

Returns memoized `styleMap: Map<string, ResolvedOverlayStyle>`. Recomputes only when `overlay`, `symbols`, or `enabled` changes.

### 6.7 ID Scheme (Element Binding)

Bijection: `symbol.elementId === overlayElement.element_ref`

| Symbol Type | elementId Format | Example |
|------------|-----------------|---------|
| Bus | `bus-NNN` | `bus-001` |
| LineBranch | `line-NNN` | `line-015` |
| TransformerBranch | `trafo-NNN` | `trafo-005` |
| Switch | `switch-NNN` | `switch-009` |
| Source | `source-NNN` | `source-007` |
| Load | `load-NNN` | `load-003` |

### 6.8 Position Mapping

**File**: `frontend/src/ui/sld/overlayUtils.ts` (lines 47–82)

`buildOverlayPositionMaps(symbols, viewport)` → `{nodePositions, branchPositions}` (Map\<string, Position\>). Viewport-aware, deterministic, read-only.

### 6.9 Overlay Constraints (Enforced)

| Constraint | Source |
|------------|--------|
| No geometry modification | `sld_rules.md` § B.1 |
| No zoom dependency | `overlayUtils.ts` § B.2 (viewport pre-computed) |
| Pure overlay layer | `sld_rules.md` § B.2 |
| No model mutation | `overlayTypes.ts` line 14 |
| Deterministic tokens | `OverlayEngine.ts` lines 40–61 |
| Run-bound payloads | `overlayTypes.ts` lines 76–78 |
| No physics | `OverlayEngine.ts` lines 12–22 |

### 6.10 Delta Overlay (PR-21)

**File**: `frontend/src/ui/sld-overlay/sldDeltaOverlayStore.ts`

State: `activeComparisonId`, `deltaPayload`, `contentHash`, `enabled`.

Converts `DeltaOverlayPayload` → `OverlayPayloadV1` and pushes to overlay store. Supports delta-specific tokens: `delta_none`, `delta_change`, `delta_inactive`.

---

## 7. Frontend — Inspector

### 7.1 Inspector Panel

**File**: `frontend/src/ui/inspector/InspectorPanel.tsx` (lines 494–707)

6-tab architecture:
1. Overview
2. Parameters
3. Results
4. Contributions
5. Limits
6. Proof

Accepts `type: 'bus' | 'branch' | 'short_circuit'`.

### 7.2 Property Grid

**File**: `frontend/src/ui/inspector/PropertyGrid.tsx` (lines 64–164)

`PropertyRow` renders label | value (blue if calculated) | unit.
Test ID format: `inspector-field-{sectionId}-{fieldKey}`.

### 7.3 Protection Section (Relay kanon)

**File**: `frontend/src/ui/inspector/ProtectionSection.tsx` (lines 1–288)

- Lines 69–70: `useProtectionAssignment(elementId)` hook loads assigned devices
- Lines 112–114: Maps `assignments` array → `ProtectionAssignmentCard` components
- Each card shows: device name, kind (relay type), status badge, settings summary
- Lines 186–217: `SettingsSummaryView` displays protection functions (e.g., "50 I>>: 3×In (≈ 1509 A), T=0,1 s")

### 7.4 SLD View — Overlay Layers

**File**: `frontend/src/ui/sld/SLDView.tsx`

**Mode state** (lines 107–116):
```typescript
const sldMode = useSldModeStore(state => state.mode);
// 'EDYCJA' | 'WYNIKI' | 'ZABEZPIECZENIA'
```

**Overlay layers** (lines 790–916):

| Layer | Lines | Visibility | Mode |
|-------|-------|-----------|------|
| ResultsOverlay | 792–797 | overlayVisible | WYNIKI |
| DiagnosticsOverlay | 863–875 | diagnosticsVisible | Dynamic |
| DiagnosticResultsLayer | 898–905 | diagnosticLayerVisible | WYNIKI |
| ProtectionOverlayLayer | 907–916 | protectionLayerVisible | ZABEZPIECZENIA |
| OverlayRuntime Legend | 855–861 | overlayRuntime.isActive | Dynamic |

**Mode selector** (lines 675–719): Three buttons — "Edycja" (slate), "Wyniki" (blue), "Zabezpieczenia" (emerald).

### 7.5 Protection Overlay Layer

**File**: `frontend/src/ui/sld/ProtectionOverlayLayer.tsx` (lines 1–391)

- Uses `useAllProtectionSummaries()` hook for data
- Builds label map: iterates summaries, matches to element positions
- Deterministic sort by `element_id` (line 312)
- `ProtectionLabel` component (lines 88–217): displays I>, I>>, CT, verification status
- Test ID: `sld-protection-label-{element_id}`
- No physics — purely displays pre-computed settings from backend

---

## 8. Tests and CI

### 8.1 Determinism Test Suites

| File | What it Tests |
|------|---------------|
| `tests/test_solver_input_determinism.py` | Hash equality (lines 110–137), permutation invariance (lines 206–240), version lock, protection stub |
| `tests/test_topology_ops_determinism.py` | Topology ops determinism (create/update/delete) |
| `tests/test_results_workspace_hash.py` | Results workspace read model determinism |
| `tests/test_fault_scenario_v2_determinism.py` | Fault scenario v2 execution determinism |
| `tests/e2e/test_pf_determinism_workflow.py` | Power flow determinism (NR, GS, FDLF) |

Key assertions in `test_solver_input_determinism.py`:
- Line 136: `assert json1 == json2` (two identical networks → same JSON)
- Line 137: `assert _compute_hash(json1) == _compute_hash(json2)`
- Line 240: `assert buses1 == ["a_bus", "m_bus", "z_bus"]` (permutation invariance)
- Lines 242–256: PROTECTION analysis type → stub with `eligible=False`

### 8.2 Protection Test Files

| File | Purpose |
|------|---------|
| `tests/test_protection_analysis.py` | IEC curves, determinism, margin computation |
| `tests/analysis/test_protection_curves_it_cp22.py` | I-t curves, PDF/SVG rendering |
| `tests/analysis/test_protection_insight_p22a.py` | Proof generation for protection |
| `tests/domain/test_protection_config.py` | Protection domain model config |
| `tests/e2e/test_protection_exports_deterministic.py` | Export determinism (reports, proofs) |
| `tests/test_proof_protection_settings.py` | Proof generation for settings |
| `tests/application/analyses/protection/catalog/` | Device mapping, vendor adapters (Elektrometal ETANGO) |
| `tests/application/analyses/protection/coordination/` | Overcurrent selectivity coordination |
| `tests/application/analyses/protection/test_base_values_resolver.py` | Base values resolver |
| `tests/application/analyses/protection/test_overcurrent_settings_v0.py` | Overcurrent settings API |
| `tests/application/analyses/protection/test_overcurrent_skeleton.py` | Overcurrent algorithm skeleton |
| `tests/application/analyses/protection/test_sanity_checks.py` | Pre-run validation |

### 8.3 Golden Network Fixtures

| File | Description |
|------|-------------|
| `tests/golden/golden_network_sn.py` | 20-station MV network (41 nodes, 31+ branches, 3 magistrales, OZE) |
| `tests/enm/golden_network_fixture.py` | ENM model (20 stations, 31+ cables, 2 magistrales) |
| `tests/application/sld/test_golden_network_sld.py` | SLD rendering against golden network |
| `tests/enm/test_golden_network_enm.py` | ENM ops against golden network |

### 8.4 Result Contract Test

**File**: `tests/test_result_api_contract.py`

| Test Class | Lines | What it Freezes |
|------------|-------|-----------------|
| `TestShortCircuitResultContract` | 190–290 | All 20 attributes + types + trace + contributions |
| `TestToDictContract` | 295–398 | JSON keys, serialization, complex→dict, enum→str |
| `TestSinglePhaseResultContract` | 403–457 | 1F attributes + Z0 in trace |
| `TestBranchContributionsContract` | 462–507 | Branch contribution structure |
| `TestAllFaultTypesContract` | 557–604 | 3F, 2F, 1F, 2F+G contracts |

### 8.5 CI Pipeline

**File**: `.github/workflows/python-tests.yml`

- Triggers: push, pull_request
- Environment: ubuntu-latest, Python 3.11, Poetry
- Main step: `poetry run pytest -q` (lines 34–36)

### 8.6 CI Guard Scripts

**Path**: `mv-design-pro/scripts/`

| Script | Enforces |
|--------|----------|
| `no_codenames_guard.py` | No Pxx codenames in UI (P7, P11, P14...) |
| `arch_guard.py` | Layer boundaries (solvers ↔ analysis ↔ protection) |
| `results_workspace_determinism_guard.py` | No non-deterministic functions in results workspace |
| `fault_scenarios_determinism_guard.py` | Determinism + no PCC in fault scenarios |
| `overlay_no_physics_guard.py` | No physics in SLD overlay code |
| `no_direct_fault_params_guard.py` | `fault_node_id` / `execute_short_circuit` only in whitelist |
| `physics_label_guard.py` | No editable physics fields in topology modals |
| `docs_guard.py` | No PCC in entrypoint docs, no broken links |

### 8.7 Frontend Protection Types

**Path**: `frontend/src/ui/protection/`

| File | Purpose |
|------|---------|
| `types.ts` | ProtectionDeviceType, ProtectionCurve, ProtectionSettingTemplate |
| `api.ts` | fetch/export/import functions, governance APIs |
| `settings-model.ts` | ProtectionSetpoint, ProtectionFunctionSummary, validation (548 lines) |
| `element-assignment.ts` | ElementProtectionAssignment, ProtectionAssignmentAdapter (CONTRACT, pending impl) |
| `index.ts` | Public exports |

Key type: **ProtectionSetpoint** — mandatory source of truth (basis + operator + multiplier/abs_value + unit + display_pl). Strict SETPOINT/COMPUTED separation.

---

## 9. Integration Points Summary

These are the exact code locations where Protection Block (PR-27→PR-32) will need hooks, extensions, or new code.

### 9.1 SC ↔ Protection Bridge (PR-27)

| Integration Point | File | Lines | What |
|-------------------|------|-------|------|
| **Current source resolution** | `backend/src/application/execution_engine/service.py` | 428–501 | `execute_run_protection()` — needs current source selector (TEST_POINTS \| SC_RESULT) |
| **SC ResultSet read** | `backend/src/domain/execution.py` | 203–268 | ResultSet.element_results — read-only access to SC quantities |
| **Hash input extension** | `backend/src/domain/execution.py` | 290–304 | `compute_solver_input_hash()` — current_source choice must be included |
| **ProtectionStudyInputV1 extension** | `backend/src/domain/protection_engine_v1.py` | 261–290 | Needs `current_source` field |
| **FixAction for ambiguous mapping** | Pattern from readiness module | — | New FixAction when SC result → relay mapping is ambiguous |
| **Eligibility check** | `backend/src/application/eligibility_service.py` | — | Currently absent for PROTECTION — may need gating |
| **Frontend current source selector** | New UI component | — | Explicit choice: Run/Scenario/Quantity/TargetRef |

### 9.2 Coordination v1 (PR-28)

| Integration Point | File | Lines | What |
|-------------------|------|-------|------|
| **New domain type** | — | — | `ProtectionSelectivityPair` (upstream + downstream relay IDs) |
| **Margin computation** | — | — | `Margin(I) = t_up(I) − t_down(I)` for each test current |
| **Result extension** | `backend/src/application/result_mapping/protection_to_resultset_v1.py` | 28–57 | Needs coordination data in element_results |
| **Frontend pair editor** | New UI component | — | Explicit upstream/downstream selection (no auto-detect) |

### 9.3 Protection SLD Overlay Pro (PR-30)

| Integration Point | File | Lines | What |
|-------------------|------|-------|------|
| **Token extension** | `frontend/src/ui/sld-overlay/overlayTypes.ts` | 100–128 | New tokens for t51 times and margins |
| **ProtectionOverlayLayer** | `frontend/src/ui/sld/ProtectionOverlayLayer.tsx` | 1–391 | Extend with t51 overlay + margin pair overlay |
| **Overlay endpoint** | `backend/src/api/protection_runs.py` | 296–381 | Protection overlay endpoint exists — extend payload |
| **Overlay legend** | `frontend/src/ui/sld-overlay/OverlayLegend.tsx` | — | New legend entries for protection tokens |

### 9.4 Report Model + Export (PR-31)

| Integration Point | File | Lines | What |
|-------------------|------|-------|------|
| **Report model** | — | — | New `ProtectionReportModel` — settings, current source, times, margins, trace |
| **Export hooks** | `backend/src/api/analysis_runs.py` | 253–306 | DOCX/PDF export endpoints — pattern to follow |
| **Proof integration** | `backend/src/application/proof_engine/packs/protection_settings.py` | — | Extend with coordination proofs |

### 9.5 Governance & Determinism Guards (PR-32)

| Integration Point | File | Lines | What |
|-------------------|------|-------|------|
| **Solver diff guard** | `mv-design-pro/scripts/` | — | New guard: no changes in `network_model/solvers/` |
| **SC ResultSet guard** | `mv-design-pro/scripts/` | — | New guard: contract snapshot for SC ResultSet v1 |
| **No-heuristics guard** | `mv-design-pro/scripts/` | — | New guard: forbidden fallback/auto-select patterns |
| **Determinism suite** | `tests/` | — | Hash equality + permutation tests for Protection |
| **CI workflow** | `.github/workflows/python-tests.yml` | 34–36 | Guards must run in CI |

### 9.6 Topology Links (PR-29, Optional)

| Integration Point | File | Lines | What |
|-------------------|------|-------|------|
| **Element ID unification** | ID scheme across overlay + inspector | — | Consistent relay↔CB↔target_ref IDs |
| **Inspector relay binding** | `frontend/src/ui/inspector/ProtectionSection.tsx` | 69–70 | `useProtectionAssignment(elementId)` — may need extension |

---

*End of AS-IS Protection Integration Map.*
