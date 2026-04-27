"""
Result Builder v1 — Builds ResultSetV1 from solver output + validation + readiness (PR-15)

CANONICAL ALIGNMENT:
- Builder lives in DOMAIN layer (no physics, no solver calls)
- Constructs ResultSetV1 from existing data
- overlay_payload populated from readiness/validation badges + solver metrics
- Works with sparse data (no solver metrics → badges + legend only)

USAGE:
    result = build_resultset_v1(
        run=run,
        solver_output=solver_output_dict,
        validation=validation_snapshot,
        readiness=readiness_snapshot,
    )

INVARIANTS:
- ZERO changes to solvers
- Deterministic output (sorted keys, sorted lists)
- overlay_payload always present (even if empty)
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from domain.result_contract_v1 import (
    RESULT_CONTRACT_VERSION,
    ElementResultV1,
    OverlayBadgeV1,
    OverlayElementKind,
    OverlayElementV1,
    OverlayLegendEntryV1,
    OverlayLegendV1,
    OverlayMetricSource,
    OverlayMetricV1,
    OverlayPayloadV1,
    OverlaySeverity,
    OverlayWarningV1,
    ResultSetV1,
    compute_deterministic_signature,
)

# ---------------------------------------------------------------------------
# Default Legend
# ---------------------------------------------------------------------------

_DEFAULT_LEGEND = OverlayLegendV1(
    title="Legenda wyników",
    entries=[
        OverlayLegendEntryV1(
            severity=OverlaySeverity.INFO,
            label="Poprawne",
            description="Element poprawny, wyniki dostępne",
        ),
        OverlayLegendEntryV1(
            severity=OverlaySeverity.WARNING,
            label="Ostrzeżenie",
            description="Element z ostrzeżeniami walidacji",
        ),
        OverlayLegendEntryV1(
            severity=OverlaySeverity.IMPORTANT,
            label="Ważne",
            description="Element wymaga uwagi",
        ),
        OverlayLegendEntryV1(
            severity=OverlaySeverity.BLOCKER,
            label="Blokujące",
            description="Element uniemożliwia poprawne obliczenia",
        ),
    ],
)


# ---------------------------------------------------------------------------
# Element Kind Mapping
# ---------------------------------------------------------------------------

_ELEMENT_TYPE_TO_KIND: dict[str, OverlayElementKind] = {
    "bus": OverlayElementKind.BUS,
    "Bus": OverlayElementKind.BUS,
    "branch": OverlayElementKind.BRANCH,
    "Branch": OverlayElementKind.BRANCH,
    "line": OverlayElementKind.BRANCH,
    "Line": OverlayElementKind.BRANCH,
    "cable": OverlayElementKind.BRANCH,
    "Cable": OverlayElementKind.BRANCH,
    "transformer": OverlayElementKind.TRANSFORMER,
    "Transformer": OverlayElementKind.TRANSFORMER,
    "load": OverlayElementKind.LOAD,
    "Load": OverlayElementKind.LOAD,
    "generator": OverlayElementKind.GENERATOR,
    "Generator": OverlayElementKind.GENERATOR,
    "inverter": OverlayElementKind.GENERATOR,
    "Inverter": OverlayElementKind.GENERATOR,
    "switch": OverlayElementKind.DEVICE,
    "Switch": OverlayElementKind.DEVICE,
    "breaker": OverlayElementKind.DEVICE,
    "Breaker": OverlayElementKind.DEVICE,
    "measurement": OverlayElementKind.MEASUREMENT,
    "Measurement": OverlayElementKind.MEASUREMENT,
    "protection": OverlayElementKind.PROTECTION_ASSIGNMENT,
    "Protection": OverlayElementKind.PROTECTION_ASSIGNMENT,
    "substation": OverlayElementKind.SUBSTATION,
    "Substation": OverlayElementKind.SUBSTATION,
}


def _resolve_element_kind(element_type: str) -> OverlayElementKind:
    """Resolve element type string to OverlayElementKind."""
    return _ELEMENT_TYPE_TO_KIND.get(element_type, OverlayElementKind.DEVICE)


# ---------------------------------------------------------------------------
# Severity Mapping
# ---------------------------------------------------------------------------

_SEVERITY_MAP: dict[str, OverlaySeverity] = {
    "BLOCKER": OverlaySeverity.BLOCKER,
    "IMPORTANT": OverlaySeverity.IMPORTANT,
    "WARNING": OverlaySeverity.WARNING,
    "INFO": OverlaySeverity.INFO,
}


def _resolve_severity(severity_str: str) -> OverlaySeverity:
    """Resolve severity string to OverlaySeverity."""
    return _SEVERITY_MAP.get(severity_str.upper(), OverlaySeverity.INFO)


# ---------------------------------------------------------------------------
# Badge Extraction from Readiness/Validation
# ---------------------------------------------------------------------------


def _extract_badges_from_readiness(
    readiness: dict[str, Any],
) -> dict[str, list[OverlayBadgeV1]]:
    """
    Extract per-element badges from readiness snapshot.

    Returns: dict[element_ref, list[OverlayBadgeV1]]
    """
    badges: dict[str, list[OverlayBadgeV1]] = {}
    issues = readiness.get("issues", [])
    for issue in issues:
        element_ref = issue.get("element_ref")
        if not element_ref:
            continue
        severity_str = issue.get("severity", "WARNING")
        label = issue.get("message_pl", issue.get("message", "Problem"))
        code = issue.get("code", "")
        badge = OverlayBadgeV1(
            label=label,
            severity=_resolve_severity(severity_str),
            code=code,
        )
        badges.setdefault(element_ref, []).append(badge)
    return badges


def _extract_badges_from_validation(
    validation: dict[str, Any],
) -> dict[str, list[OverlayBadgeV1]]:
    """
    Extract per-element badges from validation snapshot.

    Returns: dict[element_ref, list[OverlayBadgeV1]]
    """
    badges: dict[str, list[OverlayBadgeV1]] = {}
    issues = validation.get("issues", [])
    for issue in issues:
        element_ref = issue.get("element_ref")
        if not element_ref:
            continue
        severity_str = issue.get("severity", "WARNING")
        label = issue.get("message_pl", issue.get("message", "Problem walidacji"))
        code = issue.get("code", "")
        badge = OverlayBadgeV1(
            label=label,
            severity=_resolve_severity(severity_str),
            code=code,
        )
        badges.setdefault(element_ref, []).append(badge)
    return badges


# ---------------------------------------------------------------------------
# Overlay Warnings Extraction
# ---------------------------------------------------------------------------


def _extract_overlay_warnings(
    readiness: dict[str, Any],
    validation: dict[str, Any],
) -> list[OverlayWarningV1]:
    """Extract global (non-element) warnings from readiness/validation."""
    warnings: list[OverlayWarningV1] = []

    # Readiness global warnings (no element_ref)
    for issue in readiness.get("issues", []):
        if issue.get("element_ref"):
            continue
        warnings.append(
            OverlayWarningV1(
                code=issue.get("code", "W-RDY-000"),
                message=issue.get("message_pl", issue.get("message", "")),
                severity=_resolve_severity(issue.get("severity", "WARNING")),
            )
        )

    # Validation global warnings (no element_ref)
    for issue in validation.get("issues", []):
        if issue.get("element_ref"):
            continue
        warnings.append(
            OverlayWarningV1(
                code=issue.get("code", "W-VAL-000"),
                message=issue.get("message_pl", issue.get("message", "")),
                severity=_resolve_severity(issue.get("severity", "WARNING")),
            )
        )

    return sorted(warnings, key=lambda w: (w.severity.value, w.code))


# ---------------------------------------------------------------------------
# Metrics Extraction from Solver Output
# ---------------------------------------------------------------------------


def _extract_element_metrics(
    element_ref: str,
    element_type: str,
    values: dict[str, Any],
) -> dict[str, OverlayMetricV1]:
    """
    Extract typed overlay metrics from solver element result values.

    Maps known value keys to OverlayMetricV1 instances.
    """
    metrics: dict[str, OverlayMetricV1] = {}

    _METRIC_MAP: dict[str, tuple[str, str, str]] = {
        # key → (code, unit, format_hint)
        "ikss_ka": ("IK_3F_A", "kA", "fixed2"),
        "ikss_a": ("IK_3F_A", "A", "fixed0"),
        "ip_ka": ("IP_A", "kA", "fixed2"),
        "ip_a": ("IP_A", "A", "fixed0"),
        "ith_ka": ("ITH_A", "kA", "fixed2"),
        "ith_a": ("ITH_A", "A", "fixed0"),
        "sk_mva": ("SK_MVA", "MVA", "fixed2"),
        "v_pu": ("V_PU", "p.u.", "fixed4"),
        "u_kv": ("U_kV", "kV", "fixed2"),
        "angle_deg": ("ANGLE_DEG", "\u00b0", "fixed2"),
        "p_injected_mw": ("P_MW", "MW", "fixed4"),
        "q_injected_mvar": ("Q_Mvar", "Mvar", "fixed4"),
        "p_from_mw": ("P_MW", "MW", "fixed4"),
        "q_from_mvar": ("Q_Mvar", "Mvar", "fixed4"),
        "losses_p_mw": ("LOSSES_P_MW", "MW", "fixed4"),
        "losses_q_mvar": ("LOSSES_Q_Mvar", "Mvar", "fixed4"),
        "loading_pct": ("LOADING_PCT", "%", "fixed1"),
        "i_a": ("I_A", "A", "fixed1"),
        "s_mva": ("S_MVA", "MVA", "fixed2"),
    }

    for key, val in values.items():
        if key in _METRIC_MAP and val is not None:
            code, unit, fmt = _METRIC_MAP[key]
            if code not in metrics:
                metrics[code] = OverlayMetricV1(
                    code=code,
                    value=val,
                    unit=unit,
                    format_hint=fmt,
                    source=OverlayMetricSource.SOLVER,
                )

    return metrics


# ---------------------------------------------------------------------------
# Aggregate Severity
# ---------------------------------------------------------------------------


def _compute_aggregate_severity(
    badges: list[OverlayBadgeV1],
) -> OverlaySeverity:
    """Compute aggregate severity from badges (highest wins)."""
    _ORDER = {
        OverlaySeverity.BLOCKER: 4,
        OverlaySeverity.IMPORTANT: 3,
        OverlaySeverity.WARNING: 2,
        OverlaySeverity.INFO: 1,
    }
    if not badges:
        return OverlaySeverity.INFO
    return max(badges, key=lambda b: _ORDER.get(b.severity, 0)).severity


# ---------------------------------------------------------------------------
# Main Builder
# ---------------------------------------------------------------------------


def build_resultset_v1(
    *,
    run_id: str,
    analysis_type: str,
    solver_input_hash: str,
    solver_output: dict[str, Any] | None = None,
    validation: dict[str, Any] | None = None,
    readiness: dict[str, Any] | None = None,
    element_results_raw: list[dict[str, Any]] | None = None,
    global_results: dict[str, Any] | None = None,
) -> ResultSetV1:
    """
    Build a ResultSetV1 from run data, solver output, validation, and readiness.

    Args:
        run_id: Run UUID string
        analysis_type: Analysis type (SC_3F, SC_1F, LOAD_FLOW)
        solver_input_hash: SHA-256 of canonical solver input
        solver_output: Raw solver output dict (optional)
        validation: Validation snapshot dict (optional)
        readiness: Readiness snapshot dict (optional)
        element_results_raw: Pre-built element results list (optional)
        global_results: Global results dict (optional)

    Returns:
        Frozen ResultSetV1 with deterministic signature and overlay payload.
    """
    validation = validation or {}
    readiness = readiness or {}
    solver_output = solver_output or {}
    global_results = global_results or {}

    # ---- Element Results ----
    element_results: list[ElementResultV1] = []
    if element_results_raw:
        for er in element_results_raw:
            element_results.append(
                ElementResultV1(
                    element_ref=er["element_ref"],
                    element_type=er.get("element_type", "unknown"),
                    values=er.get("values", {}),
                )
            )
    # Sort for determinism
    element_results.sort(key=lambda er: er.element_ref)

    # ---- Extract Global Results from Solver (merge) ----
    merged_global = dict(sorted(global_results.items()))
    solver_global = solver_output.get("global_results", {})
    for k, v in sorted(solver_global.items()):
        if k not in merged_global:
            merged_global[k] = v

    # ---- Overlay Payload ----
    readiness_badges = _extract_badges_from_readiness(readiness)
    validation_badges = _extract_badges_from_validation(validation)

    # Merge badge maps
    all_element_refs: set[str] = set()
    all_element_refs.update(readiness_badges.keys())
    all_element_refs.update(validation_badges.keys())
    all_element_refs.update(er.element_ref for er in element_results)

    overlay_elements: dict[str, OverlayElementV1] = {}
    for ref_id in sorted(all_element_refs):
        badges: list[OverlayBadgeV1] = []
        badges.extend(readiness_badges.get(ref_id, []))
        badges.extend(validation_badges.get(ref_id, []))

        # Find element type from results
        element_type = "unknown"
        element_values: dict[str, Any] = {}
        for er in element_results:
            if er.element_ref == ref_id:
                element_type = er.element_type
                element_values = er.values
                break

        metrics = _extract_element_metrics(ref_id, element_type, element_values)
        severity = _compute_aggregate_severity(badges)

        overlay_elements[ref_id] = OverlayElementV1(
            ref_id=ref_id,
            kind=_resolve_element_kind(element_type),
            badges=sorted(badges, key=lambda b: (b.severity.value, b.code)),
            metrics=dict(sorted(metrics.items())),
            severity=severity,
        )

    overlay_warnings = _extract_overlay_warnings(readiness, validation)

    overlay_payload = OverlayPayloadV1(
        elements=overlay_elements,
        legend=_DEFAULT_LEGEND,
        warnings=overlay_warnings,
    )

    # ---- Build ResultSetV1 (without signature) ----
    created_at = datetime.now(UTC).isoformat()

    partial = ResultSetV1(
        contract_version=RESULT_CONTRACT_VERSION,
        run_id=run_id,
        analysis_type=analysis_type,
        solver_input_hash=solver_input_hash,
        created_at=created_at,
        deterministic_signature="",  # populated after canonical payload hashing
        global_results=dict(sorted(merged_global.items())),
        element_results=element_results,
        overlay_payload=overlay_payload,
    )

    # ---- Compute Deterministic Signature ----
    import json

    raw_dict = json.loads(partial.model_dump_json())
    signature = compute_deterministic_signature(raw_dict)

    # ---- Rebuild with signature ----
    return ResultSetV1(
        contract_version=RESULT_CONTRACT_VERSION,
        run_id=run_id,
        analysis_type=analysis_type,
        solver_input_hash=solver_input_hash,
        created_at=created_at,
        deterministic_signature=signature,
        global_results=dict(sorted(merged_global.items())),
        element_results=element_results,
        overlay_payload=overlay_payload,
    )
