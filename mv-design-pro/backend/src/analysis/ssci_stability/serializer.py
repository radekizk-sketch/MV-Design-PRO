"""Serializacja widoku stabilności SSCI (ocena niewykonana + metryki audytowe) do dict/JSON."""

from __future__ import annotations

from typing import Any

from analysis.ssci_stability.models import (
    SEKCJA_AUDYTOWA_SSCI_PL,
    CrossoverPoint,
    NyquistPoint,
    SsciStabilityContext,
    SsciStabilityVerdict,
    SsciStabilityView,
    WhiteBoxStep,
)


def context_to_dict(context: SsciStabilityContext | None) -> dict[str, Any] | None:
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


def crossover_to_dict(point: CrossoverPoint | None) -> dict[str, Any] | None:
    if point is None:
        return None
    return {
        "f_hz": float(point.f_hz),
        "phase_l_deg": float(point.phase_l_deg),
        "phase_margin_deg": float(point.phase_margin_deg),
    }


def nyquist_to_dict(point: NyquistPoint | None) -> dict[str, Any] | None:
    if point is None:
        return None
    return {
        "f_hz": float(point.f_hz),
        "mag": float(point.mag),
        "phase_deg": float(point.phase_deg),
        "distance_to_minus_one": float(point.distance_to_minus_one),
    }


def verdict_to_dict(verdict: SsciStabilityVerdict) -> dict[str, Any]:
    return {
        "converter_ref": verdict.converter_ref,
        "bus_ref": verdict.bus_ref,
        "verdict": verdict.verdict,
        "is_risk": verdict.is_risk,
        "why_pl": verdict.why_pl,
        "ocena": dict(verdict.ocena),
        "max_minor_loop_gain": (
            float(verdict.max_minor_loop_gain) if verdict.max_minor_loop_gain is not None else None
        ),
        "has_magnitude_crossover": bool(verdict.has_magnitude_crossover),
        "gain_crossover": crossover_to_dict(verdict.gain_crossover),
        "worst_phase_margin_deg": (
            float(verdict.worst_phase_margin_deg)
            if verdict.worst_phase_margin_deg is not None
            else None
        ),
        "worst_phase_margin_f_hz": (
            float(verdict.worst_phase_margin_f_hz)
            if verdict.worst_phase_margin_f_hz is not None
            else None
        ),
        "offending_frequency_hz": (
            float(verdict.offending_frequency_hz)
            if verdict.offending_frequency_hz is not None
            else None
        ),
        "nearest_to_minus_one": nyquist_to_dict(verdict.nearest_to_minus_one),
        "encirclement_count": int(verdict.encirclement_count),
        "negative_resistance_present": bool(verdict.negative_resistance_present),
        "negative_resistance_f_hz": (
            float(verdict.negative_resistance_f_hz)
            if verdict.negative_resistance_f_hz is not None
            else None
        ),
        "negative_resistance_re_min_ohm": (
            float(verdict.negative_resistance_re_min_ohm)
            if verdict.negative_resistance_re_min_ohm is not None
            else None
        ),
        "provenance": verdict.provenance.to_dict() if verdict.provenance else None,
        "missing_data": list(verdict.missing_data),
        "white_box": [white_box_to_dict(step) for step in verdict.white_box],
    }


def view_to_dict(view: SsciStabilityView) -> dict[str, Any]:
    return {
        "analysis_id": view.analysis_id,
        "context": context_to_dict(view.context),
        "gain_crossover_mag": float(view.gain_crossover_mag),
        "verdict": verdict_to_dict(view.verdict),
        # Ocena na poziomie widoku (ten sam rekord co w `verdict.ocena`) — wspólny kształt
        # powierzchni uczciwości natychmiastowej: `ocena` obok danych.
        "ocena": dict(view.verdict.ocena),
        # Nagłówek sekcji audytowej metryk L(f) — materiał audytowy, nie wynik inżynierski.
        "sekcja_audytowa_pl": SEKCJA_AUDYTOWA_SSCI_PL,
    }
