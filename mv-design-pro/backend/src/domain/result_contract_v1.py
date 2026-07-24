"""
Result Contract v1 — Canonical ResultSet for SLD Overlay (PR-15)

CANONICAL ALIGNMENT:
- FROZEN contract: any change requires version bump to v2
- contract_version = "1.0"
- Deterministic: identical ENM + StudyCase → identical JSON
- overlay_payload is the SOLE source for SLD overlay (PR-16)
- UI interprets overlay_payload only — never raw solver output

MODELS:
- OverlayMetricV1: typed metric (code, value, unit, format_hint, source)
- OverlayBadgeV1: badge label with severity
- OverlayWarningV1: UI warning (not solver)
- OverlayLegendV1: legend for overlay rendering
- OverlayElementV1: per-element overlay data (badges + metrics + severity)
- OverlayPayloadV1: complete overlay payload (elements + legend + warnings)
- ElementResultV1: per-element typed result
- ResultSetV1: top-level frozen result set

INVARIANTS:
- ZERO changes to solvers or catalogs
- overlay_payload works even with sparse solver data (badges only)
- All labels in Polish (no project codenames)
- Deterministic sorting everywhere
- SHA-256 deterministic_signature excludes transient fields (created_at)
"""

from __future__ import annotations

import hashlib
import json
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Contract version (FROZEN — bump = new file)
# ---------------------------------------------------------------------------

RESULT_CONTRACT_VERSION = "1.0"


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class OverlaySeverity(str, Enum):
    """Severity levels for overlay elements and badges."""

    INFO = "INFO"
    WARNING = "WARNING"
    IMPORTANT = "IMPORTANT"
    BLOCKER = "BLOCKER"


class OverlayMetricSource(str, Enum):
    """Source of an overlay metric value."""

    SOLVER = "solver"
    VALIDATION = "validation"
    READINESS = "readiness"


class OverlayElementKind(str, Enum):
    """Kind of element in overlay."""

    BUS = "bus"
    BRANCH = "branch"
    DEVICE = "device"
    SUBSTATION = "substation"
    BAY = "bay"
    JUNCTION = "junction"
    CORRIDOR = "corridor"
    TRANSFORMER = "transformer"
    LOAD = "load"
    GENERATOR = "generator"
    MEASUREMENT = "measurement"
    PROTECTION_ASSIGNMENT = "protection_assignment"


# ---------------------------------------------------------------------------
# Overlay Metric
# ---------------------------------------------------------------------------


class OverlayMetricV1(BaseModel):
    """
    Typed metric for overlay display.

    Examples:
        code="U_kV", value=20.5, unit="kV", format_hint="fixed2", source="solver"
        code="IK_3F_A", value=12500.0, unit="A", format_hint="fixed0", source="solver"
    """

    code: str = Field(
        ...,
        description=(
            "Metric code: U_kV, I_A, S_MVA, IK_3F_A, IK_1F_A, "
            "P_MW, Q_Mvar, LOADING_PCT, V_PU, ANGLE_DEG"
        ),
    )
    value: float | int | str = Field(..., description="Metric value")
    unit: str = Field(..., description="Physical unit string (kV, A, MVA, MW, Mvar, %, p.u.)")
    format_hint: str = Field(
        default="fixed2",
        description="UI format hint: fixed0, fixed2, fixed4, kilo, percent",
    )
    source: OverlayMetricSource = Field(
        default=OverlayMetricSource.SOLVER,
        description="Data source: solver, validation, readiness",
    )

    model_config = {"frozen": True}


# ---------------------------------------------------------------------------
# Overlay Badge
# ---------------------------------------------------------------------------


class OverlayBadgeV1(BaseModel):
    """
    Badge for overlay element (e.g. readiness issues, validation errors).

    Labels MUST be in Polish, no project codenames.
    """

    label: str = Field(
        ...,
        description="Badge label (Polish, e.g. 'NIEGOTOWE', 'BRAK KATALOGU')",
    )
    severity: OverlaySeverity = Field(
        default=OverlaySeverity.WARNING,
        description="Badge severity for UI rendering",
    )
    code: str = Field(
        default="",
        description="Machine-stable badge code (e.g. 'NOT_READY', 'MISSING_CATALOG')",
    )

    model_config = {"frozen": True}


# ---------------------------------------------------------------------------
# Overlay Warning (UI-level, NOT solver)
# ---------------------------------------------------------------------------


class OverlayWarningV1(BaseModel):
    """
    UI-level warning in overlay payload.

    NOT from solver — from validation/readiness/builder logic.
    """

    code: str = Field(..., description="Warning code (e.g. 'W-OVL-001')")
    message: str = Field(
        ...,
        description="Warning message (Polish)",
    )
    severity: OverlaySeverity = Field(default=OverlaySeverity.WARNING)
    element_ref: str | None = Field(default=None, description="Affected element ref_id (optional)")

    model_config = {"frozen": True}


# ---------------------------------------------------------------------------
# Overlay Legend
# ---------------------------------------------------------------------------


class OverlayLegendEntryV1(BaseModel):
    """Single entry in the overlay legend."""

    severity: OverlaySeverity
    label: str = Field(..., description="Legend label (Polish)")
    description: str = Field(default="", description="Legend description (Polish)")

    model_config = {"frozen": True}


class OverlayLegendV1(BaseModel):
    """Legend for overlay rendering."""

    title: str = Field(
        default="Legenda wyników",
        description="Legend title (Polish)",
    )
    entries: list[OverlayLegendEntryV1] = Field(default_factory=list)

    model_config = {"frozen": True}


# ---------------------------------------------------------------------------
# Overlay Element
# ---------------------------------------------------------------------------


class OverlayElementV1(BaseModel):
    """
    Per-element overlay data.

    Contains badges (readiness/validation), typed metrics (solver),
    and overall severity for UI coloring.
    """

    ref_id: str = Field(..., description="Element ref_id (matches ENM)")
    kind: OverlayElementKind = Field(..., description="Element kind for rendering")
    badges: list[OverlayBadgeV1] = Field(
        default_factory=list,
        description="Badges from readiness/validation",
    )
    metrics: dict[str, OverlayMetricV1] = Field(
        default_factory=dict,
        description="Typed metrics keyed by metric code",
    )
    severity: OverlaySeverity = Field(
        default=OverlaySeverity.INFO,
        description="Aggregate severity for UI rendering",
    )

    model_config = {"frozen": True}


# ---------------------------------------------------------------------------
# Overlay Payload (bridge to SLD — PR-16)
# ---------------------------------------------------------------------------


class OverlayPayloadV1(BaseModel):
    """
    Complete overlay payload — the SOLE source for SLD overlay in PR-16.

    INVARIANT: Must work even with sparse solver data.
    Minimum viable: badges + legend (no metrics).
    """

    elements: dict[str, OverlayElementV1] = Field(
        default_factory=dict,
        description="Element overlays keyed by element ref_id",
    )
    legend: OverlayLegendV1 = Field(
        default_factory=OverlayLegendV1,
        description="Overlay legend",
    )
    warnings: list[OverlayWarningV1] = Field(
        default_factory=list,
        description="UI-level warnings (not solver)",
    )

    model_config = {"frozen": True}


# ---------------------------------------------------------------------------
# Element Result (per-element typed result)
# ---------------------------------------------------------------------------


class ElementResultV1(BaseModel):
    """
    Per-element typed result in ResultSetV1.

    Maps element_ref → analysis-specific result values.
    """

    element_ref: str = Field(..., description="Element ref_id")
    element_type: str = Field(..., description="Element type (Bus, Branch, Transformer, etc.)")
    values: dict[str, Any] = Field(
        default_factory=dict,
        description="Analysis-specific result values",
    )
    # V12S-011: stable ENM ref_id, populated by result_mapping layer; None for legacy rows
    element_ref_id: str | None = Field(
        default=None,
        description="Stable ENM ref_id (V12S-011). Populated by result_mapping layer; None for legacy rows.",
    )

    model_config = {"frozen": True}


# ---------------------------------------------------------------------------
# ResultSetV1 (top-level canonical result set)
# ---------------------------------------------------------------------------


class ResultSetV1(BaseModel):
    """
    Canonical Result Set v1 — FROZEN contract.

    This is the single stable format consumed by:
    - SLD overlay (PR-16) via overlay_payload
    - Results inspector UI
    - Proof Engine (future)
    - Export/reporting (future)

    INVARIANTS:
    - contract_version = "1.0" (bump = new model)
    - deterministic_signature = SHA-256 of canonical JSON (excludes created_at, run_finished_at)
    - overlay_payload is ALWAYS present (may be sparse)
    - element_results sorted by element_ref
    - global_results sorted by key
    """

    contract_version: str = Field(
        default=RESULT_CONTRACT_VERSION,
        description="Contract version (frozen: 1.0)",
    )
    run_id: str = Field(..., description="Run UUID")
    analysis_type: str = Field(
        ...,
        description="Analysis type: SC_3F, SC_1F, LOAD_FLOW",
    )
    solver_input_hash: str = Field(
        ...,
        description="SHA-256 of canonical solver input",
    )
    created_at: str = Field(
        default="",
        description="UTC ISO timestamp (NOT in deterministic signature)",
    )
    run_finished_at: str | None = Field(
        default=None,
        description=(
            "UTC ISO timestamp of run completion (CanonicalRun.finished_at). "
            "Presentation-only provenance metadata; NOT in deterministic signature."
        ),
    )
    deterministic_signature: str = Field(
        default="",
        description="SHA-256 of canonical JSON (excludes transient fields)",
    )
    global_results: dict[str, Any] = Field(
        default_factory=dict,
        description="Analysis-wide summary values",
    )
    element_results: list[ElementResultV1] = Field(
        default_factory=list,
        description="Per-element results (sorted by element_ref)",
    )
    overlay_payload: OverlayPayloadV1 = Field(
        default_factory=OverlayPayloadV1,
        description="Overlay payload for SLD (bridge to PR-16)",
    )

    model_config = {"frozen": True}


# ---------------------------------------------------------------------------
# Canonical JSON + Deterministic Signature
# ---------------------------------------------------------------------------

_DETERMINISTIC_LIST_KEYS = frozenset(
    {
        "buses",
        "branches",
        "transformers",
        "inverter_sources",
        "switches",
        "element_results",
        "entries",
        "badges",
        "warnings",
        "evaluations",
    }
)


def _canonicalize(value: Any, *, current_key: str | None = None) -> Any:
    """Recursively canonicalize a JSON-like structure for deterministic hashing."""
    if isinstance(value, dict):
        return {key: _canonicalize(value[key], current_key=key) for key in sorted(value.keys())}
    if isinstance(value, list):
        items = [_canonicalize(item, current_key=current_key) for item in value]
        if current_key in _DETERMINISTIC_LIST_KEYS:
            return sorted(items, key=_stable_sort_key)
        return items
    return value


def _stable_sort_key(item: Any) -> str:
    """Stable sort key for deterministic list ordering."""
    if isinstance(item, dict):
        for key in ("ref_id", "id", "element_ref", "code", "label"):
            if key in item and item[key] is not None:
                return str(item[key])
    return json.dumps(item, sort_keys=True, default=str)


def compute_deterministic_signature(result_set_dict: dict[str, Any]) -> str:
    """
    Compute SHA-256 of canonical result set JSON.

    Excludes transient fields: created_at, run_finished_at, deterministic_signature.
    Sort keys + deterministic list ordering.
    """
    sig_data = {
        k: v
        for k, v in result_set_dict.items()
        if k not in ("created_at", "run_finished_at", "deterministic_signature")
    }
    canonical = _canonicalize(sig_data)
    payload = json.dumps(canonical, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def to_canonical_json(result_set: ResultSetV1) -> str:
    """
    Serialize ResultSetV1 to canonical JSON string.

    sort_keys=True, deterministic list ordering, compact separators.
    """
    raw = json.loads(result_set.model_dump_json())
    canonical = _canonicalize(raw)
    return json.dumps(canonical, sort_keys=True, separators=(",", ":"), default=str)
