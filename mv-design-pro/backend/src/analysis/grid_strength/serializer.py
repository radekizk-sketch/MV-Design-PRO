"""Serializacja widoku analizy siły sieci (SCR/WSCR) do dict/JSON."""

from __future__ import annotations

from typing import Any

from analysis.grid_strength.models import (
    BusStrengthEntry,
    GridStrengthContext,
    GridStrengthSummary,
    GridStrengthView,
    WhiteBoxStep,
)


def context_to_dict(context: GridStrengthContext | None) -> dict[str, Any] | None:
    if context is None:
        return None
    return context.to_dict()


def white_box_to_dict(step: WhiteBoxStep) -> dict[str, Any]:
    return {
        "symbol": step.symbol,
        "formula_latex": step.formula_latex,
        "substitution_pl": step.substitution_pl,
        "result_pl": step.result_pl,
    }


def entry_to_dict(entry: BusStrengthEntry) -> dict[str, Any]:
    return {
        "bus_ref": entry.bus_ref,
        "nominal_kv": (float(entry.nominal_kv) if entry.nominal_kv is not None else None),
        "s_sc_mva": (float(entry.s_sc_mva) if entry.s_sc_mva is not None else None),
        "s_installed_mva": (
            float(entry.s_installed_mva) if entry.s_installed_mva is not None else None
        ),
        "scr": (float(entry.scr) if entry.scr is not None else None),
        "verdict": entry.verdict,
        "is_weak": bool(entry.is_weak),
        "why_pl": entry.why_pl,
        "missing_data": list(entry.missing_data),
        "white_box": [white_box_to_dict(step) for step in entry.white_box],
    }


def summary_to_dict(summary: GridStrengthSummary) -> dict[str, Any]:
    return {
        "total_buses": int(summary.total_buses),
        "weak_bus_count": int(summary.weak_bus_count),
        "not_computed_count": int(summary.not_computed_count),
        "wscr": (float(summary.wscr) if summary.wscr is not None else None),
        "wscr_verdict": summary.wscr_verdict,
        "wscr_why_pl": summary.wscr_why_pl,
        "wscr_white_box": [white_box_to_dict(step) for step in summary.wscr_white_box],
    }


def view_to_dict(view: GridStrengthView) -> dict[str, Any]:
    return {
        "analysis_id": view.analysis_id,
        "context": context_to_dict(view.context),
        "weak_threshold": float(view.weak_threshold),
        "very_weak_threshold": float(view.very_weak_threshold),
        "entries": [entry_to_dict(entry) for entry in view.entries],
        "summary": summary_to_dict(view.summary),
    }
