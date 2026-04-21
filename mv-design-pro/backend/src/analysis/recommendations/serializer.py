from __future__ import annotations

from typing import Any

from analysis.recommendations.models import (
    RecommendationContext,
    RecommendationEntry,
    RecommendationSummary,
    RecommendationView,
)


def context_to_dict(context: RecommendationContext | None) -> dict[str, Any] | None:
    if context is None:
        return None
    return context.to_dict()


def entry_to_dict(entry: RecommendationEntry) -> dict[str, Any]:
    return {
        "parameter_id": entry.parameter_id,
        "parameter_label": entry.parameter_label,
        "target_id": entry.target_id,
        "source": entry.source,
        "current_value": (float(entry.current_value) if entry.current_value is not None else None),
        "current_unit": entry.current_unit,
        "required_delta": (
            float(entry.required_delta) if entry.required_delta is not None else None
        ),
        "delta_unit": entry.delta_unit,
        "expected_effect": entry.expected_effect.value,
        "confidence_note": entry.confidence_note,
    }


def summary_to_dict(summary: RecommendationSummary) -> dict[str, Any]:
    return {
        "total_entries": int(summary.total_entries),
        "not_computed_count": int(summary.not_computed_count),
    }


def view_to_dict(view: RecommendationView) -> dict[str, Any]:
    return {
        "analysis_id": view.analysis_id,
        "context": context_to_dict(view.context),
        "primary": entry_to_dict(view.primary) if view.primary else None,
        "alternatives": [entry_to_dict(entry) for entry in view.alternatives],
        "summary": summary_to_dict(view.summary),
    }
