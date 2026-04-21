from __future__ import annotations

from typing import Any

from analysis.protection_insight.models import (
    ProtectionInsightContext,
    ProtectionInsightItem,
    ProtectionInsightSummary,
    ProtectionInsightView,
)


def context_to_dict(
    context: ProtectionInsightContext | None,
) -> dict[str, Any] | None:
    if context is None:
        return None
    return context.to_dict()


def item_to_dict(item: ProtectionInsightItem) -> dict[str, Any]:
    return {
        "rule_id": item.rule_id,
        "primary_device_id": item.primary_device_id,
        "backup_device_id": item.backup_device_id,
        "ikss_ka": float(item.ikss_ka) if item.ikss_ka is not None else None,
        "ip_ka": float(item.ip_ka) if item.ip_ka is not None else None,
        "ith_ka2s": float(item.ith_ka2s) if item.ith_ka2s is not None else None,
        "icu_ka": float(item.icu_ka) if item.icu_ka is not None else None,
        "idyn_ka": float(item.idyn_ka) if item.idyn_ka is not None else None,
        "ith_limit_ka2s": (float(item.ith_limit_ka2s) if item.ith_limit_ka2s is not None else None),
        "breaking_margin_pct": (
            float(item.breaking_margin_pct) if item.breaking_margin_pct is not None else None
        ),
        "dynamic_margin_pct": (
            float(item.dynamic_margin_pct) if item.dynamic_margin_pct is not None else None
        ),
        "thermal_margin_pct": (
            float(item.thermal_margin_pct) if item.thermal_margin_pct is not None else None
        ),
        "selectivity_status": item.selectivity_status.value,
        "why_pl": item.why_pl,
    }


def summary_to_dict(summary: ProtectionInsightSummary) -> dict[str, Any]:
    return {
        "count_ok": int(summary.count_ok),
        "count_warning": int(summary.count_warning),
        "count_fail": int(summary.count_fail),
        "count_not_evaluated": int(summary.count_not_evaluated),
    }


def view_to_dict(view: ProtectionInsightView) -> dict[str, Any]:
    return {
        "context": context_to_dict(view.context),
        "items": [item_to_dict(item) for item in view.items],
        "summary": summary_to_dict(view.summary),
    }
