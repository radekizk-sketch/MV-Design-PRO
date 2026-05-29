"""Serializacja widoku analizy adekwatnosci mocy biernej (D-06d) do dict/JSON."""

from __future__ import annotations

from typing import Any

from analysis.reactive_adequacy.models import (
    ReactiveAdequacyContext,
    ReactiveAdequacySummary,
    ReactiveAdequacyView,
    ReactiveBalance,
    SourceReactiveEntry,
    VoltageViolationEntry,
    WhiteBoxStep,
)


def _opt_float(value: float | None) -> float | None:
    return float(value) if value is not None else None


def context_to_dict(context: ReactiveAdequacyContext | None) -> dict[str, Any] | None:
    if context is None:
        return None
    return context.to_dict()


def white_box_to_dict(step: WhiteBoxStep) -> dict[str, Any]:
    return {
        "symbol": step.symbol,
        "formula_latex": step.formula_latex,
        "substitution_pl": step.substitution_pl,
        "result_pl": step.result_pl,
        "unit_check_pl": step.unit_check_pl,
    }


def source_to_dict(entry: SourceReactiveEntry) -> dict[str, Any]:
    return {
        "ref": entry.ref,
        "bus_ref": entry.bus_ref,
        "q_actual_mvar": _opt_float(entry.q_actual_mvar),
        "q_min_mvar": _opt_float(entry.q_min_mvar),
        "q_max_mvar": _opt_float(entry.q_max_mvar),
        "headroom_up_mvar": _opt_float(entry.headroom_up_mvar),
        "headroom_down_mvar": _opt_float(entry.headroom_down_mvar),
        "is_saturated": bool(entry.is_saturated),
        "at_limit_pl": entry.at_limit_pl,
        "why_pl": entry.why_pl,
        "missing_data": list(entry.missing_data),
        "white_box": [white_box_to_dict(step) for step in entry.white_box],
    }


def violation_to_dict(entry: VoltageViolationEntry) -> dict[str, Any]:
    return {
        "bus_ref": entry.bus_ref,
        "v_pu": float(entry.v_pu),
        "u_min_pu": float(entry.u_min_pu),
        "u_max_pu": float(entry.u_max_pu),
        "deviation_pu": float(entry.deviation_pu),
        "kind_pl": entry.kind_pl,
        "why_pl": entry.why_pl,
        "white_box": [white_box_to_dict(step) for step in entry.white_box],
    }


def balance_to_dict(balance: ReactiveBalance) -> dict[str, Any]:
    return {
        "q_generated_mvar": _opt_float(balance.q_generated_mvar),
        "q_absorbed_by_sources_mvar": _opt_float(balance.q_absorbed_by_sources_mvar),
        "q_load_mvar": _opt_float(balance.q_load_mvar),
        "net_source_q_mvar": _opt_float(balance.net_source_q_mvar),
        "white_box": [white_box_to_dict(step) for step in balance.white_box],
    }


def summary_to_dict(summary: ReactiveAdequacySummary) -> dict[str, Any]:
    return {
        "total_sources": int(summary.total_sources),
        "saturated_source_count": int(summary.saturated_source_count),
        "not_computed_source_count": int(summary.not_computed_source_count),
        "voltage_violation_count": int(summary.voltage_violation_count),
        "network_headroom_up_mvar": _opt_float(summary.network_headroom_up_mvar),
        "network_headroom_down_mvar": _opt_float(summary.network_headroom_down_mvar),
        "saturated_source_refs": list(summary.saturated_source_refs),
        "violated_bus_refs": list(summary.violated_bus_refs),
    }


def view_to_dict(view: ReactiveAdequacyView) -> dict[str, Any]:
    return {
        "analysis_id": view.analysis_id,
        "context": context_to_dict(view.context),
        "saturation_tol_mvar": float(view.saturation_tol_mvar),
        "default_u_min_pu": float(view.default_u_min_pu),
        "default_u_max_pu": float(view.default_u_max_pu),
        "verdict": view.verdict,
        "is_adequate": bool(view.is_adequate),
        "why_pl": view.why_pl,
        "sources": [source_to_dict(s) for s in view.sources],
        "voltage_violations": [violation_to_dict(v) for v in view.voltage_violations],
        "balance": balance_to_dict(view.balance),
        "summary": summary_to_dict(view.summary),
        "provenance": view.provenance.to_dict() if view.provenance else None,
        "missing_data": list(view.missing_data),
    }
