"""Serialization for energy validation result types."""

from __future__ import annotations

from typing import Any

from analysis.energy_validation.models import (
    EnergyValidationContext,
    EnergyValidationItem,
    EnergyValidationStatus,
    EnergyValidationSummary,
    EnergyValidationView,
)

STATUS_ORDER: dict[EnergyValidationStatus, int] = {
    EnergyValidationStatus.FAIL: 0,
    EnergyValidationStatus.WARNING: 1,
    EnergyValidationStatus.PASS: 2,
    EnergyValidationStatus.NOT_COMPUTED: 3,
}


def item_to_dict(item: EnergyValidationItem) -> dict[str, Any]:
    return {
        "check_type": item.check_type.value,
        "target_id": item.target_id,
        "target_name": item.target_name,
        "observed_value": (float(item.observed_value) if item.observed_value is not None else None),
        "unit": item.unit,
        "limit_warn": (float(item.limit_warn) if item.limit_warn is not None else None),
        "limit_fail": (float(item.limit_fail) if item.limit_fail is not None else None),
        "margin_pct": (float(item.margin_pct) if item.margin_pct is not None else None),
        "status": item.status.value,
        "why_pl": item.why_pl,
    }


def summary_to_dict(summary: EnergyValidationSummary) -> dict[str, Any]:
    return {
        "pass_count": summary.pass_count,
        "warning_count": summary.warning_count,
        "fail_count": summary.fail_count,
        "not_computed_count": summary.not_computed_count,
        "worst_item_target_id": summary.worst_item_target_id,
        "worst_item_margin_pct": (
            float(summary.worst_item_margin_pct)
            if summary.worst_item_margin_pct is not None
            else None
        ),
    }


def context_to_dict(
    context: EnergyValidationContext | None,
) -> dict[str, Any] | None:
    if context is None:
        return None
    return context.to_dict()


def view_to_dict(view: EnergyValidationView) -> dict[str, Any]:
    return {
        "context": context_to_dict(view.context),
        "config": view.config.to_dict(),
        "items": [item_to_dict(item) for item in view.items],
        "summary": summary_to_dict(view.summary),
    }
