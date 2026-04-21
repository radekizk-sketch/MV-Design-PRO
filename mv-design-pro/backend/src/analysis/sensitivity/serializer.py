from __future__ import annotations

from typing import Any

from analysis.sensitivity.models import (
    SensitivityContext,
    SensitivityDriver,
    SensitivityEntry,
    SensitivityPerturbation,
    SensitivitySummary,
    SensitivityView,
)


def context_to_dict(context: SensitivityContext | None) -> dict[str, Any] | None:
    if context is None:
        return None
    return context.to_dict()


def perturbation_to_dict(perturbation: SensitivityPerturbation) -> dict[str, Any]:
    return {
        "delta_pct": float(perturbation.delta_pct),
        "margin": float(perturbation.margin) if perturbation.margin is not None else None,
        "delta_margin": (
            float(perturbation.delta_margin) if perturbation.delta_margin is not None else None
        ),
        "decision": perturbation.decision.value,
    }


def entry_to_dict(entry: SensitivityEntry) -> dict[str, Any]:
    return {
        "parameter_id": entry.parameter_id,
        "parameter_label": entry.parameter_label,
        "target_id": entry.target_id,
        "source": entry.source,
        "base_margin": float(entry.base_margin) if entry.base_margin is not None else None,
        "margin_unit": entry.margin_unit,
        "base_decision": entry.base_decision.value,
        "minus": perturbation_to_dict(entry.minus),
        "plus": perturbation_to_dict(entry.plus),
    }


def driver_to_dict(driver: SensitivityDriver) -> dict[str, Any]:
    return {
        "parameter_id": driver.parameter_id,
        "parameter_label": driver.parameter_label,
        "target_id": driver.target_id,
        "source": driver.source,
        "score": float(driver.score),
        "direction": driver.direction,
        "delta_margin": float(driver.delta_margin),
    }


def summary_to_dict(summary: SensitivitySummary) -> dict[str, Any]:
    return {
        "total_entries": int(summary.total_entries),
        "not_computed_count": int(summary.not_computed_count),
    }


def view_to_dict(view: SensitivityView) -> dict[str, Any]:
    return {
        "analysis_id": view.analysis_id,
        "context": context_to_dict(view.context),
        "delta_pct": float(view.delta_pct),
        "entries": [entry_to_dict(entry) for entry in view.entries],
        "summary": summary_to_dict(view.summary),
        "top_drivers": [driver_to_dict(driver) for driver in view.top_drivers],
    }
