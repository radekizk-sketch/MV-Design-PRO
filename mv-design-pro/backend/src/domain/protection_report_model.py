"""
Protection Report Model — PR-31: Report Data Model + Export Hook

Data model for protection analysis report generation.
Contains all data needed to produce PDF/DOCX/JSON export.

INVARIANTS:
- current_source is MANDATORY (never omitted)
- Relay summaries sorted by relay_id
- Coordination summaries sorted by pair_id (if present)
- Float format: fixed precision, no locale-dependent separators
- Deterministic signature excludes transient metadata
- Frozen dataclasses (immutable)
- No physics calculations — pure data assembly
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any
from uuid import uuid4

# =============================================================================
# REPORT SUMMARY TYPES
# =============================================================================


@dataclass(frozen=True)
class RelayReportSummary:
    """Per-relay summary for report.

    Attributes:
        relay_id: Relay identifier
        attached_cb_id: Circuit breaker ID
        ct_ratio_label: Human-readable CT ratio (e.g., "400/5 A")
        f50_summary: F50 summary (e.g., "I>> = 25.0 A sec, t = 0.05 s")
        f51_summary: F51 summary (e.g., "SI, TMS=0.3, I> = 1.0 A sec")
        test_point_results: Per-point trip results
    """

    relay_id: str
    attached_cb_id: str
    ct_ratio_label: str
    f50_summary: str | None = None
    f51_summary: str | None = None
    test_point_results: tuple[dict[str, Any], ...] = field(default_factory=tuple)

    def to_dict(self) -> dict[str, Any]:
        return {
            "relay_id": self.relay_id,
            "attached_cb_id": self.attached_cb_id,
            "ct_ratio_label": self.ct_ratio_label,
            "f50_summary": self.f50_summary,
            "f51_summary": self.f51_summary,
            "test_point_results": list(self.test_point_results),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> RelayReportSummary:
        return cls(
            relay_id=str(data["relay_id"]),
            attached_cb_id=str(data["attached_cb_id"]),
            ct_ratio_label=str(data["ct_ratio_label"]),
            f50_summary=data.get("f50_summary"),
            f51_summary=data.get("f51_summary"),
            test_point_results=tuple(data.get("test_point_results", [])),
        )


@dataclass(frozen=True)
class CoordinationReportSummary:
    """Per-pair coordination summary for report.

    Attributes:
        pair_id: Pair identifier
        upstream_label: Human-readable upstream relay label
        downstream_label: Human-readable downstream relay label
        min_margin_s: Minimum margin [s]
        max_margin_s: Maximum margin [s]
        margin_points_count: Number of margin evaluation points
    """

    pair_id: str
    upstream_label: str
    downstream_label: str
    min_margin_s: float | None = None
    max_margin_s: float | None = None
    margin_points_count: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "pair_id": self.pair_id,
            "upstream_label": self.upstream_label,
            "downstream_label": self.downstream_label,
            "min_margin_s": self.min_margin_s,
            "max_margin_s": self.max_margin_s,
            "margin_points_count": self.margin_points_count,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> CoordinationReportSummary:
        return cls(
            pair_id=str(data["pair_id"]),
            upstream_label=str(data["upstream_label"]),
            downstream_label=str(data["downstream_label"]),
            min_margin_s=(
                float(data["min_margin_s"]) if data.get("min_margin_s") is not None else None
            ),
            max_margin_s=(
                float(data["max_margin_s"]) if data.get("max_margin_s") is not None else None
            ),
            margin_points_count=int(data.get("margin_points_count", 0)),
        )


# =============================================================================
# PROTECTION REPORT MODEL (MAIN)
# =============================================================================


@dataclass(frozen=True)
class ProtectionReportModel:
    """Data model for protection analysis report.

    INVARIANTS:
    - current_source_summary is MANDATORY
    - relay_summaries sorted by relay_id
    - coordination_summaries sorted by pair_id (if present)
    - deterministic_signature = SHA-256 of canonical report JSON
    """

    report_id: str
    run_id: str
    analysis_type: str = "PROTECTION"
    current_source_summary: dict[str, Any] = field(default_factory=dict)
    relay_summaries: tuple[RelayReportSummary, ...] = field(default_factory=tuple)
    coordination_summaries: tuple[CoordinationReportSummary, ...] | None = None
    trace_summary: dict[str, Any] = field(default_factory=dict)
    deterministic_signature: str = ""

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "report_id": self.report_id,
            "run_id": self.run_id,
            "analysis_type": self.analysis_type,
            "current_source_summary": self.current_source_summary,
            "relay_summaries": [rs.to_dict() for rs in self.relay_summaries],
            "trace_summary": self.trace_summary,
            "deterministic_signature": self.deterministic_signature,
        }
        if self.coordination_summaries is not None:
            result["coordination_summaries"] = [cs.to_dict() for cs in self.coordination_summaries]
        return result

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ProtectionReportModel:
        coord = None
        if "coordination_summaries" in data:
            coord = tuple(
                CoordinationReportSummary.from_dict(cs) for cs in data["coordination_summaries"]
            )
        return cls(
            report_id=str(data["report_id"]),
            run_id=str(data["run_id"]),
            analysis_type=str(data.get("analysis_type", "PROTECTION")),
            current_source_summary=data.get("current_source_summary", {}),
            relay_summaries=tuple(
                RelayReportSummary.from_dict(rs) for rs in data.get("relay_summaries", [])
            ),
            coordination_summaries=coord,
            trace_summary=data.get("trace_summary", {}),
            deterministic_signature=str(data.get("deterministic_signature", "")),
        )


# =============================================================================
# REPORT BUILDER — PURE FUNCTION
# =============================================================================


def build_protection_report(
    *,
    run_id: str,
    protection_result: Any,
    current_source: Any,
    coordination_result: Any | None = None,
) -> ProtectionReportModel:
    """Build a ProtectionReportModel from protection + coordination results.

    Pure function — no side effects, deterministic output.

    Args:
        run_id: Run UUID (as string).
        protection_result: ProtectionResultSetV1 from engine.
        current_source: ProtectionCurrentSource specification.
        coordination_result: Optional CoordinationResultV1.

    Returns:
        ProtectionReportModel with deterministic signature.
    """
    report_id = str(uuid4())

    # Build current source summary (MANDATORY)
    current_source_summary = current_source.to_dict()

    # Build relay summaries (sorted by relay_id)
    relay_summaries = _build_relay_summaries(protection_result)

    # Build coordination summaries (sorted by pair_id)
    coord_summaries = None
    if coordination_result is not None:
        coord_summaries = _build_coordination_summaries(coordination_result)

    # Build trace summary
    trace_summary = _build_trace_summary(
        protection_result=protection_result,
        coordination_result=coordination_result,
    )

    # Compute deterministic signature (exclude report_id — transient)
    sig_data = {
        "run_id": run_id,
        "analysis_type": "PROTECTION",
        "current_source_summary": current_source_summary,
        "relay_summaries": [rs.to_dict() for rs in relay_summaries],
    }
    if coord_summaries is not None:
        sig_data["coordination_summaries"] = [cs.to_dict() for cs in coord_summaries]
    sig_json = json.dumps(sig_data, sort_keys=True, separators=(",", ":"))
    signature = hashlib.sha256(sig_json.encode("utf-8")).hexdigest()

    return ProtectionReportModel(
        report_id=report_id,
        run_id=run_id,
        analysis_type="PROTECTION",
        current_source_summary=current_source_summary,
        relay_summaries=relay_summaries,
        coordination_summaries=coord_summaries,
        trace_summary=trace_summary,
        deterministic_signature=signature,
    )


# =============================================================================
# INTERNAL HELPERS
# =============================================================================


def _build_relay_summaries(
    protection_result: Any,
) -> tuple[RelayReportSummary, ...]:
    """Build sorted relay summaries from protection result."""
    summaries: list[RelayReportSummary] = []

    for rr in protection_result.relay_results:
        # Build test point results
        tp_results: list[dict[str, Any]] = []
        f50_summary: str | None = None
        f51_summary: str | None = None

        for tp in rr.per_test_point:
            tp_data: dict[str, Any] = {
                "point_id": tp.point_id,
                "i_a_secondary": tp.i_a_secondary,
            }
            fr = tp.function_results

            if fr.f51 is not None:
                tp_data["f51_t_trip_s"] = fr.f51.t_trip_s
                tp_data["f51_curve_type"] = fr.f51.curve_type
                if f51_summary is None:
                    f51_summary = (
                        f"{fr.f51.curve_type}, TMS={fr.f51.tms}, "
                        f"I> = {fr.f51.pickup_a_secondary} A sec"
                    )

            if fr.f50 is not None:
                tp_data["f50_picked_up"] = fr.f50.picked_up
                tp_data["f50_t_trip_s"] = fr.f50.t_trip_s
                if f50_summary is None and fr.f50.picked_up:
                    t_str = (
                        f"t = {fr.f50.t_trip_s} s"
                        if fr.f50.t_trip_s is not None
                        else "natychmiastowe"
                    )
                    f50_summary = f"I>> zadziałanie, {t_str}"

            tp_results.append(tp_data)

        # Extract CT ratio label from trace (if available)
        ct_label = "—"
        if rr.per_test_point:
            trace = rr.per_test_point[0].trace
            ct = trace.get("ct_ratio", {})
            if ct:
                ct_label = f"{ct.get('primary_a', '?')}/{ct.get('secondary_a', '?')} A"

        summaries.append(
            RelayReportSummary(
                relay_id=rr.relay_id,
                attached_cb_id=rr.attached_cb_id,
                ct_ratio_label=ct_label,
                f50_summary=f50_summary,
                f51_summary=f51_summary,
                test_point_results=tuple(tp_results),
            )
        )

    return tuple(sorted(summaries, key=lambda s: s.relay_id))


def _build_coordination_summaries(
    coordination_result: Any,
) -> tuple[CoordinationReportSummary, ...]:
    """Build sorted coordination summaries."""
    summaries: list[CoordinationReportSummary] = []

    for pair in coordination_result.pairs:
        margins_with_value = [mp.margin_s for mp in pair.margin_points if mp.margin_s is not None]

        min_margin = min(margins_with_value) if margins_with_value else None
        max_margin = max(margins_with_value) if margins_with_value else None

        summaries.append(
            CoordinationReportSummary(
                pair_id=pair.pair_id,
                upstream_label=pair.upstream_relay_id,
                downstream_label=pair.downstream_relay_id,
                min_margin_s=round(min_margin, 3) if min_margin is not None else None,
                max_margin_s=round(max_margin, 3) if max_margin is not None else None,
                margin_points_count=len(pair.margin_points),
            )
        )

    return tuple(sorted(summaries, key=lambda s: s.pair_id))


def _build_trace_summary(
    *,
    protection_result: Any,
    coordination_result: Any | None,
) -> dict[str, Any]:
    """Build trace summary for report."""
    total_relays = len(protection_result.relay_results)
    total_test_points = sum(len(rr.per_test_point) for rr in protection_result.relay_results)

    summary: dict[str, Any] = {
        "total_relays": total_relays,
        "total_test_points": total_test_points,
        "protection_signature": protection_result.deterministic_signature,
    }

    if coordination_result is not None:
        summary["total_pairs"] = len(coordination_result.pairs)
        summary["coordination_signature"] = coordination_result.deterministic_signature

    return summary
