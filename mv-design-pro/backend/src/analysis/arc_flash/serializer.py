"""Serializacja widoku Arc Flash do dict/JSON.

KAŻDY zserializowany wynik niesie pola ``status`` i (gdy pusta tablica) marker
``BRAK — wymaga tablic IEEE 1584-2018 od właściciela`` oraz proweniencję tablicy
(``norma_IEEE_1584`` / ``norma_NFPA_70E``). Żaden konsument (UI/raport/OSD) nie
może pominąć faktu, że wynik jest "dane niekompletne — tablice współczynników
IEEE 1584" dopóki właściciel nie wypełni tablicy.
"""

from __future__ import annotations

from typing import Any

from analysis.arc_flash.models import (
    ArcFlashContext,
    ArcFlashResult,
    ArcFlashView,
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
        "table_ref": step.table_ref,
    }


def _f(value: float | None) -> float | None:
    return float(value) if value is not None else None


def result_to_dict(result: ArcFlashResult) -> dict[str, Any]:
    anchors = (
        {k: _f(v) for k, v in result.i_arc_at_anchors_ka.items()}
        if result.i_arc_at_anchors_ka is not None
        else None
    )
    return {
        "bus_ref": result.bus_ref,
        "status": result.status.value,
        "status_label_pl": result.status.label_pl,
        "method": result.method.value,
        "electrode_config": result.electrode_config,
        "i_bf_ka": _f(result.i_bf_ka),
        "voltage_kv": _f(result.voltage_kv),
        "arc_time_s": _f(result.arc_time_s),
        "conductor_gap_mm": _f(result.conductor_gap_mm),
        "working_distance_mm": _f(result.working_distance_mm),
        "coefficient_table_provenance": result.coefficient_table_provenance,
        "coefficient_table_marker": result.coefficient_table_marker,
        "i_arc_ka": _f(result.i_arc_ka),
        "i_arc_at_anchors_ka": anchors,
        "enclosure_correction_cf": _f(result.enclosure_correction_cf),
        "incident_energy_cal_cm2": _f(result.incident_energy_cal_cm2),
        "arc_flash_boundary_mm": _f(result.arc_flash_boundary_mm),
        "ppe_category": result.ppe_category,
        "ppe_table_provenance": result.ppe_table_provenance,
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
        "coefficient_table": view.coefficient_table.to_dict(),
        "ppe_table": view.ppe_table.to_dict(),
        "results": [result_to_dict(result) for result in view.results],
    }
