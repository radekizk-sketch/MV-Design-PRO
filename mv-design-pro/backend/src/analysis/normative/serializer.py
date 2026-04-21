from __future__ import annotations

from collections.abc import Iterable

from analysis.normative.models import NormativeItem, NormativeReport, NormativeStatus

STATUS_ORDER: dict[NormativeStatus, int] = {
    NormativeStatus.FAIL: 0,
    NormativeStatus.WARNING: 1,
    NormativeStatus.NOT_COMPUTED: 2,
    NormativeStatus.NOT_EVALUATED: 3,
    NormativeStatus.PASS: 4,
}


def sort_items(items: Iterable[NormativeItem]) -> list[NormativeItem]:
    return sorted(
        items,
        key=lambda item: (
            STATUS_ORDER[item.status],
            item.rule_id,
            item.target_id,
        ),
    )


def report_to_dict(report: NormativeReport) -> dict[str, object]:
    return {
        "report_id": report.report_id,
        "context": report.context.to_dict(),
        "items": [item_to_dict(item) for item in report.items],
    }


def item_to_dict(item: NormativeItem) -> dict[str, object]:
    return {
        "rule_id": item.rule_id,
        "title_pl": item.title_pl,
        "severity": item.severity.value,
        "status": item.status.value,
        "target_id": item.target_id,
        "observed_value": item.observed_value,
        "unit": item.unit,
        "limit_value": item.limit_value,
        "limit_unit": item.limit_unit,
        "margin": item.margin,
        "why_pl": item.why_pl,
        "requires": list(item.requires),
    }
