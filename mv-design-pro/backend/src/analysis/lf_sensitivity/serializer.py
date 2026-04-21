from __future__ import annotations

from typing import Any

from analysis.lf_sensitivity.models import (
    LFSensitivityContext,
    LFSensitivityDriver,
    LFSensitivityEntry,
    LFSensitivitySummary,
    LFSensitivityView,
)


def context_to_dict(context: LFSensitivityContext | None) -> dict[str, Any] | None:
    if context is None:
        return None
    return context.to_dict()


def driver_to_dict(driver: LFSensitivityDriver) -> dict[str, Any]:
    return {
        "bus_id": driver.bus_id,
        "parameter": driver.parameter,
        "perturbation": driver.perturbation,
        "delta_delta_pct": float(driver.delta_delta_pct),
        "delta_margin_pct": (
            float(driver.delta_margin_pct) if driver.delta_margin_pct is not None else None
        ),
        "why_pl": driver.why_pl,
    }


def entry_to_dict(entry: LFSensitivityEntry) -> dict[str, Any]:
    return {
        "bus_id": entry.bus_id,
        "base_delta_pct": (
            float(entry.base_delta_pct) if entry.base_delta_pct is not None else None
        ),
        "threshold_warn_pct": (
            float(entry.threshold_warn_pct) if entry.threshold_warn_pct is not None else None
        ),
        "threshold_fail_pct": (
            float(entry.threshold_fail_pct) if entry.threshold_fail_pct is not None else None
        ),
        "drivers": [driver_to_dict(driver) for driver in entry.drivers],
        "missing_data": list(entry.missing_data),
    }


def summary_to_dict(summary: LFSensitivitySummary) -> dict[str, Any]:
    return {
        "total_entries": int(summary.total_entries),
        "not_computed_count": int(summary.not_computed_count),
    }


def view_to_dict(view: LFSensitivityView) -> dict[str, Any]:
    return {
        "analysis_id": view.analysis_id,
        "context": context_to_dict(view.context),
        "delta_pct": float(view.delta_pct),
        "entries": [entry_to_dict(entry) for entry in view.entries],
        "summary": summary_to_dict(view.summary),
        "top_drivers": [driver_to_dict(driver) for driver in view.top_drivers],
    }
