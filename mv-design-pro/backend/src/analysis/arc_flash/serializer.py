"""Serializacja widoku Arc Flash do dict/JSON.

KAŻDY zserializowany wynik niesie pola ``status``, ``unverified_tag`` i
``unverified_note_pl`` — żaden konsument (UI/raport/OSD) nie może pominąć
oznaczenia best-effort.
"""

from __future__ import annotations

from typing import Any

from analysis.arc_flash.models import (
    ArcFlashContext,
    ArcFlashResult,
    ArcFlashView,
    CoefficientProvenance,
    WhiteBoxStep,
)


def context_to_dict(context: ArcFlashContext | None) -> dict[str, Any] | None:
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


def coefficient_provenance_to_dict(prov: CoefficientProvenance) -> dict[str, Any]:
    return prov.to_dict()


def _f(value: float | None) -> float | None:
    return float(value) if value is not None else None


def result_to_dict(result: ArcFlashResult) -> dict[str, Any]:
    return {
        "bus_ref": result.bus_ref,
        "status": result.status.value,
        "status_label_pl": result.status.label_pl,
        "unverified_tag": result.unverified_tag,
        "unverified_note_pl": result.unverified_note_pl,
        "no_worked_example_note_pl": result.no_worked_example_note_pl,
        "electrode_config": result.electrode_config,
        "i_bf_ka": _f(result.i_bf_ka),
        "voltage_kv": _f(result.voltage_kv),
        "arc_time_s": _f(result.arc_time_s),
        "conductor_gap_mm": _f(result.conductor_gap_mm),
        "working_distance_mm": _f(result.working_distance_mm),
        "i_arc_ka": _f(result.i_arc_ka),
        "enclosure_correction_cf": _f(result.enclosure_correction_cf),
        "incident_energy_cal_cm2": _f(result.incident_energy_cal_cm2),
        "arc_flash_boundary_mm": _f(result.arc_flash_boundary_mm),
        "ppe_category": result.ppe_category,
        "coefficient_provenance": [
            coefficient_provenance_to_dict(p) for p in result.coefficient_provenance
        ],
        "why_pl": result.why_pl,
        "missing_data": list(result.missing_data),
        "white_box": [white_box_to_dict(step) for step in result.white_box],
    }


def view_to_dict(view: ArcFlashView) -> dict[str, Any]:
    return {
        "analysis_id": view.analysis_id,
        "context": context_to_dict(view.context),
        "status": view.status.value,
        "status_label_pl": view.status.label_pl,
        "unverified_tag": view.unverified_tag,
        "unverified_note_pl": view.unverified_note_pl,
        "results": [result_to_dict(result) for result in view.results],
    }
