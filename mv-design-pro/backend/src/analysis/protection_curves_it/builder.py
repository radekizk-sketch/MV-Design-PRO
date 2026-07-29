from __future__ import annotations

from collections.abc import Iterable

from analysis.normative.models import NormativeReport, NormativeStatus
from analysis.protection_curves_it.models import (
    ITCurveSeries,
    ITMarker,
    ITMarkerKind,
    ProtectionCurvesITContext,
    ProtectionCurvesITView,
)
from analysis.protection_insight.models import ProtectionInsightItem, ProtectionInsightView
from application.proof_engine.types import ProofDocument, ProofValue

_P18_RULE_IDS = (
    "NR_P18_001",
    "NR_P18_002",
    "NR_P18_003",
    "NR_P18_004",
)

_MARKER_ORDER = {
    ITMarkerKind.IKSS: 0,
    ITMarkerKind.IP: 1,
    ITMarkerKind.ITH: 2,
}

_ROLE_ORDER = {
    "PRIMARY": 0,
    "BACKUP": 1,
}


class ProtectionCurvesITBuilder:
    def build(
        self,
        protection_insight: ProtectionInsightView,
        proofs_p18: Iterable[ProofDocument | ITCurveSeries],
        normative_report_p20: NormativeReport,
    ) -> ProtectionCurvesITView:
        series_sources, proofs = _partition_sources(proofs_p18)

        missing_data: list[str] = []
        context = _build_context(protection_insight, normative_report_p20)

        primary_item = _resolve_primary_item(protection_insight.items)
        primary_device_id = primary_item.primary_device_id if primary_item else "—"
        backup_device_id = primary_item.backup_device_id if primary_item else None

        if primary_item is None:
            missing_data.append("protection_insight_items")
        if len(protection_insight.items) > 1:
            missing_data.append("multiple_protection_pairs")

        bus_id = _resolve_bus_id(protection_insight.items)
        if bus_id == "—":
            missing_data.append("bus_id")

        margins_pct = _margins_from_insight(primary_item, missing_data)

        normative_status = _resolve_normative_status(
            normative_report_p20,
            primary_device_id,
            backup_device_id,
            missing_data,
        )

        why_pl = _build_why(primary_item, normative_status)

        series_sorted = _sort_series(series_sources)
        if not series_sorted:
            missing_data.append("it_curve_series")

        markers = _build_markers(proofs, primary_device_id, backup_device_id, missing_data)
        markers_sorted = tuple(
            sorted(markers, key=lambda marker: (_MARKER_ORDER[marker.kind], marker.i_a))
        )

        missing_data = sorted(set(missing_data))

        return ProtectionCurvesITView(
            context=context,
            bus_id=bus_id,
            primary_device_id=primary_device_id,
            backup_device_id=backup_device_id,
            series=series_sorted,
            markers=markers_sorted,
            normative_status=normative_status,
            margins_pct=margins_pct,
            why_pl=why_pl,
            missing_data=tuple(missing_data),
        )


def _partition_sources(
    sources: Iterable[ProofDocument | ITCurveSeries],
) -> tuple[list[ITCurveSeries], list[ProofDocument]]:
    series: list[ITCurveSeries] = []
    proofs: list[ProofDocument] = []
    for entry in sources:
        if isinstance(entry, ITCurveSeries):
            series.append(entry)
        else:
            proofs.append(entry)
    return series, proofs


def _build_context(
    protection_insight: ProtectionInsightView,
    normative_report: NormativeReport,
) -> ProtectionCurvesITContext | None:
    ctx = normative_report.context or protection_insight.context
    if ctx is None:
        return None
    return ProtectionCurvesITContext(
        project_name=ctx.project_name,
        case_name=ctx.case_name,
        run_timestamp=ctx.run_timestamp,
        snapshot_id=ctx.snapshot_id,
        trace_id=ctx.trace_id,
        # Dostęp bezpośredni (bez getattr z domyślną): brak pola w kontekście
        # źródłowym ma wybuchnąć tutaj, nie stać się cichym None (V12K-267).
        run_id=ctx.run_id,
    )


def _resolve_primary_item(
    items: Iterable[ProtectionInsightItem],
) -> ProtectionInsightItem | None:
    sorted_items = sorted(
        items,
        key=lambda item: (item.primary_device_id, item.backup_device_id or ""),
    )
    if not sorted_items:
        return None
    return sorted_items[0]


def _resolve_bus_id(items: Iterable[ProtectionInsightItem]) -> str:
    for item in items:
        if item.primary_device_id.startswith("BUS:"):
            return item.primary_device_id
    return "—"


def _margins_from_insight(
    item: ProtectionInsightItem | None,
    missing_data: list[str],
) -> dict[str, float]:
    if item is None:
        missing_data.extend(
            [
                "margin_NR_P18_001",
                "margin_NR_P18_002",
                "margin_NR_P18_003",
            ]
        )
        return {}

    margins = {}
    mapping = {
        "NR_P18_001": item.breaking_margin_pct,
        "NR_P18_002": item.dynamic_margin_pct,
        "NR_P18_003": item.thermal_margin_pct,
    }
    for rule_id, value in mapping.items():
        if value is None:
            missing_data.append(f"margin_{rule_id}")
        else:
            margins[rule_id] = float(value)
    return margins


def _resolve_normative_status(
    report: NormativeReport,
    primary_device_id: str,
    backup_device_id: str | None,
    missing_data: list[str],
) -> NormativeStatus:
    if report is None:
        missing_data.append("normative_report")
        return NormativeStatus.NOT_EVALUATED

    target_ids = {primary_device_id}
    if backup_device_id:
        target_ids.add(backup_device_id)

    relevant = [
        item
        for item in report.items
        if item.rule_id in _P18_RULE_IDS and item.target_id in target_ids
    ]
    if not relevant:
        missing_data.append("normative_rules")
        return NormativeStatus.NOT_EVALUATED

    statuses = [item.status for item in relevant]
    if any(status == NormativeStatus.FAIL for status in statuses):
        return NormativeStatus.FAIL
    if any(status == NormativeStatus.WARNING for status in statuses):
        return NormativeStatus.WARNING
    if any(
        status in (NormativeStatus.NOT_EVALUATED, NormativeStatus.NOT_COMPUTED)
        for status in statuses
    ):
        return NormativeStatus.NOT_EVALUATED
    return NormativeStatus.PASS


def _build_why(
    item: ProtectionInsightItem | None,
    normative_status: NormativeStatus,
) -> str:
    base = item.why_pl if item is not None else "Brak danych selektywności do oceny."
    rules = ", ".join(_P18_RULE_IDS)
    return f"Reguły: {rules}. Status: {normative_status.value}. " f"WHY: {base}"


def _sort_series(series_sources: list[ITCurveSeries]) -> tuple[ITCurveSeries, ...]:
    return tuple(
        sorted(
            series_sources,
            key=lambda series: (
                _ROLE_ORDER.get(series.role.value, 2),
                series.series_id,
            ),
        )
    )


def _build_markers(
    proofs: list[ProofDocument],
    primary_device_id: str,
    backup_device_id: str | None,
    missing_data: list[str],
) -> list[ITMarker]:
    markers: list[ITMarker] = []
    target_ids = {primary_device_id}
    if backup_device_id:
        target_ids.add(backup_device_id)

    found_ikss = False
    found_ip = False
    found_ith = False

    for proof in proofs:
        target_id = _target_id(proof)
        if primary_device_id != "—" and target_id not in target_ids:
            continue

        key_results = proof.summary.key_results
        ikss = _numeric_value(key_results, "ikss_ka")
        if ikss is not None:
            markers.append(
                ITMarker(
                    kind=ITMarkerKind.IKSS,
                    i_a=ikss * 1000.0,
                    t_s=None,
                    source_proof_id=str(proof.document_id),
                )
            )
            found_ikss = True

        ip = _numeric_value(key_results, "ip_ka")
        if ip is not None:
            markers.append(
                ITMarker(
                    kind=ITMarkerKind.IP,
                    i_a=ip * 1000.0,
                    t_s=None,
                    source_proof_id=str(proof.document_id),
                )
            )
            found_ip = True

        ith = _numeric_value(key_results, "ith_ka")
        if ith is not None:
            markers.append(
                ITMarker(
                    kind=ITMarkerKind.ITH,
                    i_a=ith * 1000.0,
                    t_s=None,
                    source_proof_id=str(proof.document_id),
                )
            )
            found_ith = True

    if not found_ikss:
        missing_data.append("marker_ikss")
    if not found_ip:
        missing_data.append("marker_ip")
    if not found_ith:
        missing_data.append("marker_ith")

    return markers


def _numeric_value(
    key_results: dict[str, ProofValue],
    key: str,
) -> float | None:
    value = key_results.get(key)
    if value is None:
        return None
    if isinstance(value.value, int | float):
        return float(value.value)
    return None


def _target_id(proof: ProofDocument) -> str:
    header = proof.header
    if header.target_id:
        return header.target_id
    if header.fault_location:
        return header.fault_location
    return "—"
