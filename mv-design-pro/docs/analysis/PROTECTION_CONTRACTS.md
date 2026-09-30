# PROTECTION CONTRACTS

> **STAN 2026-09-30:** opisywany kod (`domain/protection_engine_v1.py`, `application/result_mapping/protection_to_resultset_v1.py`,
> `application/result_mapping/short_circuit_to_resultset_v1.py`, `sc_binding_meta.py`, router `api/protection_engine_v1.py`)
> skasowany — ostatnie pliki w karcie RESULTSET-MARTWE-MAPPERY (zgoda B-01 w decyzji O-59); dokument archiwalny, nie opisuje
> stanu bieżącego. Żywa implementacja: model przekaźnika i nastaw w ENM (`enm/models.py::ProtectionAssignment`,
> `ProtectionSetting`, `Measurement`), ocena w `application/protection_analysis/engine.py::ProtectionEvaluationEngine`
> (tor `protection_sn`, trasy `api/protection_runs.py`), krzywe IDMT wyłącznie w
> `network_model/solvers/protection_iec60255.py::compute_idmt_generic`, jedyny producent ResultSetV1:
> `application/result_mapping/canonical_run_to_resultset_v1.py`.

> **Status**: ARCHIWALNY od 2026-09-30 (dawniej BINDING, Phase B)
> **Date**: 2026-02-12
> **Scope**: Type definitions and API contracts for Protection Block (PR-27→PR-32)
> **Base**: PR-26 contracts (ProtectionStudyInputV1, ProtectionResultSetV1)

---

## 1. Existing Contracts (PR-26, FROZEN)

### 1.1 ProtectionStudyInputV1

**File**: `backend/src/domain/protection_engine_v1.py` (lines 261–290)

```python
@dataclass(frozen=True)
class ProtectionStudyInputV1:
    relays: tuple[RelayV1, ...]
    test_points: tuple[TestPoint, ...]
```

### 1.2 RelayV1

**File**: `backend/src/domain/protection_engine_v1.py` (lines 187–223)

```python
@dataclass(frozen=True)
class RelayV1:
    relay_id: str
    attached_cb_id: str
    ct_ratio: CTRatio
    f51: Function51Settings | None
    f50: Function50Settings | None
```

### 1.3 TestPoint

**File**: `backend/src/domain/protection_engine_v1.py` (lines 231–253)

```python
@dataclass(frozen=True)
class TestPoint:
    point_id: str
    i_a_primary: float
```

### 1.4 ProtectionResultSetV1

**File**: `backend/src/domain/protection_engine_v1.py` (lines 432–462)

```python
@dataclass(frozen=True)
class ProtectionResultSetV1:
    analysis_type: str                       # "PROTECTION"
    relay_results: tuple[RelayResult, ...]   # sorted by relay_id
    deterministic_signature: str             # SHA-256
```

---

## 2. New Contracts (PR-27→PR-32)

### 2.1 CurrentSource (PR-27)

```python
class CurrentSourceType(str, Enum):
    TEST_POINTS = "TEST_POINTS"       # User-defined explicit test currents
    SC_RESULT = "SC_RESULT"           # Resolved from SC ResultSet

@dataclass(frozen=True)
class SCCurrentSelection:
    """Explicit user selection for SC-based current source."""
    run_id: str                        # SC Run UUID (binding)
    quantity: str                      # SC field: "ikss_a" | "ip_a" | "ith_a" | "ik_total_a"
    target_ref_mapping: tuple[TargetRefMapping, ...]  # relay_id → element_ref (explicit)

@dataclass(frozen=True)
class TargetRefMapping:
    """Explicit mapping: which SC element provides current for which relay."""
    relay_id: str                      # Protection relay ID
    element_ref: str                   # SC ResultSet element_ref (fault node or contribution)
    element_type: str                  # "bus" | "source_contribution" | "branch_contribution"

@dataclass(frozen=True)
class ProtectionCurrentSource:
    """Complete current source specification."""
    source_type: CurrentSourceType
    test_points: tuple[TestPoint, ...] | None           # When TEST_POINTS
    sc_selection: SCCurrentSelection | None              # When SC_RESULT
```

**Invariants**:
- If `source_type == TEST_POINTS`: `test_points` must be non-None, `sc_selection` must be None
- If `source_type == SC_RESULT`: `sc_selection` must be non-None, `test_points` must be None
- `target_ref_mapping` must cover every relay in the study input (no unmapped relays)
- Duplicate relay_id in mapping is a deterministic error

### 2.2 ProtectionSelectivityPair (PR-28)

```python
@dataclass(frozen=True)
class ProtectionSelectivityPair:
    """Explicit upstream/downstream relay pair for coordination analysis."""
    pair_id: str                        # Unique pair identifier
    upstream_relay_id: str              # Relay closer to source (should trip later)
    downstream_relay_id: str            # Relay closer to fault (should trip first)

@dataclass(frozen=True)
class SelectivityMarginPoint:
    """Margin at a specific current value."""
    i_a_primary: float                  # Test current [A]
    t_upstream_s: float | None          # Upstream trip time [s] (None if no trip)
    t_downstream_s: float | None        # Downstream trip time [s] (None if no trip)
    margin_s: float | None              # t_upstream - t_downstream [s] (None if either is None)

@dataclass(frozen=True)
class SelectivityPairResult:
    """Result for a single selectivity pair."""
    pair_id: str
    upstream_relay_id: str
    downstream_relay_id: str
    margin_points: tuple[SelectivityMarginPoint, ...]  # sorted by i_a_primary
    trace: dict[str, Any]               # WHITE BOX trace for audit
```

**Invariants**:
- `upstream_relay_id != downstream_relay_id`
- `margin_points` sorted ascending by `i_a_primary`
- `margin_s` = `t_upstream_s - t_downstream_s` (when both are not None)
- **No OK/FAIL verdict** — only numerical values
- Swapping upstream/downstream changes sign of all margins

### 2.3 CoordinationResult (PR-28)

```python
@dataclass(frozen=True)
class CoordinationResult:
    """Complete coordination analysis result."""
    pairs: tuple[SelectivityPairResult, ...]  # sorted by pair_id
    current_source: ProtectionCurrentSource   # Source of test currents
    deterministic_signature: str               # SHA-256
```

### 2.4 ProtectionOverlayPayload (PR-30)

Extends existing `OverlayPayloadV1` pattern:

```python
@dataclass(frozen=True)
class ProtectionOverlayElement:
    """Overlay element for protection visualization."""
    element_ref: str                    # CB element_ref in SLD
    element_type: str                   # "switch" (CB)
    visual_state: str                   # "OK" | "WARNING" | "CRITICAL" | "INACTIVE"
    numeric_badges: dict[str, float | None]  # {"t51_s": 1.302, "margin_s": 0.25, ...}
    color_token: str                    # Semantic token
    stroke_token: str                   # Semantic token
    animation_token: str | None

@dataclass(frozen=True)
class ProtectionOverlayPayloadV1:
    """Full overlay payload for protection results."""
    run_id: str
    analysis_type: str                  # "PROTECTION"
    elements: tuple[ProtectionOverlayElement, ...]  # sorted by element_ref
    legend: tuple[dict[str, str], ...]  # Legend entries (Polish)
    active_pair_id: str | None          # Active selectivity pair (if coordination)
```

**Invariants**:
- Elements sorted lexicographically by `element_ref`
- Tokens from predefined dictionary (no ad-hoc values)
- No geometry modification
- Run-bound (`run_id` is binding)

### 2.5 ProtectionReportModel (PR-31)

```python
@dataclass(frozen=True)
class ProtectionReportModel:
    """Data model for protection analysis report."""
    report_id: str
    run_id: str
    analysis_type: str                   # "PROTECTION"
    current_source: ProtectionCurrentSource  # MANDATORY
    relay_summaries: tuple[RelayReportSummary, ...]  # sorted by relay_id
    coordination_summaries: tuple[CoordinationReportSummary, ...] | None
    trace_summary: dict[str, Any]
    deterministic_signature: str          # SHA-256

@dataclass(frozen=True)
class RelayReportSummary:
    """Per-relay summary for report."""
    relay_id: str
    attached_cb_id: str
    ct_ratio_label: str                  # e.g., "400/5 A"
    f50_summary: str | None              # e.g., "I>> = 25.0 A sec, t = 0.05 s"
    f51_summary: str | None              # e.g., "SI, TMS=0.3, I> = 1.0 A sec"
    test_point_results: tuple[dict[str, Any], ...]  # Per-point trip results

@dataclass(frozen=True)
class CoordinationReportSummary:
    """Per-pair coordination summary for report."""
    pair_id: str
    upstream_label: str
    downstream_label: str
    min_margin_s: float | None
    max_margin_s: float | None
    margin_points_count: int
```

**Invariants**:
- `current_source` is mandatory (never omitted)
- Relay summaries sorted by `relay_id`
- Coordination summaries sorted by `pair_id`
- Float format: fixed precision, no locale-dependent separators
- Deterministic signature excludes transient metadata

---

## 3. ID Conventions

| Entity | ID Format | Example | Stable Sort |
|--------|-----------|---------|-------------|
| Relay | `relay-{NNN}` | `relay-001` | Lexicographic |
| Test Point | `tp-{NNN}` | `tp-01` | Lexicographic |
| CB (Switch) | `switch-{NNN}` | `switch-009` | Lexicographic |
| Selectivity Pair | `pair-{NNN}` | `pair-001` | Lexicographic |
| SC Run | UUID | `550e8400-...` | Lexicographic |

All collections sorted lexicographically by primary ID. No secondary sort keys. No implicit ordering.

---

## 4. Float Formatting

| Context | Format | Example |
|---------|--------|---------|
| Time [s] | 3 decimal places | `1.302` |
| Current [A] | 1 decimal place | `1509.3` |
| Margin [s] | 3 decimal places | `0.250` |
| Multiplier | 2 decimal places | `12.50` |
| SHA-256 | 64 hex chars | `a1b2c3...` |

No locale-dependent formatting. Decimal separator is always `.` (dot).

---

*End of Protection Contracts.*
