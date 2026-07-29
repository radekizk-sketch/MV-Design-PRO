from __future__ import annotations

from collections.abc import Iterable

from analysis.normative.models import (
    NormativeItem,
    NormativeReport,
    NormativeSeverity,
    NormativeStatus,
)
from analysis.protection_insight.models import (
    ProtectionInsightContext,
    ProtectionInsightItem,
    ProtectionInsightSummary,
    ProtectionInsightView,
    ProtectionSelectivityStatus,
)
from application.proof_engine.types import ProofDocument, ProofValue


class ProtectionInsightBuilder:
    def build(
        self,
        proofs_p18: Iterable[ProofDocument],
        report_p20: NormativeReport,
    ) -> ProtectionInsightView:
        proofs_sorted = sorted(
            proofs_p18,
            key=lambda proof: (
                _target_id(proof),
                proof.document_id.hex,
            ),
        )

        selectivity_items = _selectivity_index(report_p20.items)
        items_with_bucket = [_build_item(proof, selectivity_items) for proof in proofs_sorted]

        items_sorted = sorted(
            items_with_bucket,
            key=lambda entry: (
                _SORT_ORDER[entry[1]],
                entry[0].primary_device_id,
            ),
        )

        items = tuple(entry[0] for entry in items_sorted)
        summary = _build_summary(entry[1] for entry in items_sorted)
        context = _build_context(report_p20)

        return ProtectionInsightView(
            context=context,
            items=items,
            summary=summary,
        )


def _build_context(report: NormativeReport) -> ProtectionInsightContext | None:
    ctx = report.context
    if ctx is None:
        return None
    return ProtectionInsightContext(
        project_name=ctx.project_name,
        case_name=ctx.case_name,
        run_timestamp=ctx.run_timestamp,
        snapshot_id=ctx.snapshot_id,
        trace_id=ctx.trace_id,
        # Dostęp bezpośredni (bez getattr z domyślną): brak pola w kontekście
        # źródłowym ma wybuchnąć tutaj, nie stać się cichym None (V12K-267).
        run_id=ctx.run_id,
    )


def _selectivity_index(items: Iterable[NormativeItem]) -> dict[str, NormativeItem]:
    return {item.target_id: item for item in items if item.rule_id == "NR_P18_004"}


def _build_item(
    proof: ProofDocument,
    selectivity_items: dict[str, NormativeItem],
) -> tuple[ProtectionInsightItem, str]:
    target_id = _target_id(proof)
    key_results = proof.summary.key_results

    ikss_ka = _numeric_value(key_results, "ikss_ka")
    ip_ka = _numeric_value(key_results, "ip_ka")
    ith_ka2s = _numeric_value(key_results, "i2t_ka2s")
    icu_ka = _numeric_value(key_results, "icu_ka")
    idyn_ka = _numeric_value(key_results, "idyn_ka")
    ith_limit_ka2s = _numeric_value(key_results, "ith_limit_ka2s")

    breaking_margin_pct = _percent_margin(ikss_ka, icu_ka)
    dynamic_margin_pct = _percent_margin(ip_ka, idyn_ka)
    thermal_margin_pct = _percent_margin(ith_ka2s, ith_limit_ka2s)

    selectivity_item = selectivity_items.get(target_id)
    selectivity_status = _selectivity_status(selectivity_item)
    bucket = _bucket_from_selectivity(selectivity_item, selectivity_status)
    why_pl = _build_why(selectivity_item, key_results)

    return (
        ProtectionInsightItem(
            rule_id=selectivity_item.rule_id if selectivity_item else "NR_P18_004",
            primary_device_id=target_id,
            backup_device_id=None,
            ikss_ka=ikss_ka,
            ip_ka=ip_ka,
            ith_ka2s=ith_ka2s,
            icu_ka=icu_ka,
            idyn_ka=idyn_ka,
            ith_limit_ka2s=ith_limit_ka2s,
            breaking_margin_pct=breaking_margin_pct,
            dynamic_margin_pct=dynamic_margin_pct,
            thermal_margin_pct=thermal_margin_pct,
            selectivity_status=selectivity_status,
            why_pl=why_pl,
        ),
        bucket,
    )


def _build_why(
    selectivity_item: NormativeItem | None,
    key_results: dict[str, ProofValue],
) -> str:
    if selectivity_item is None:
        return "Brak oceny selektywności w raporcie P20."

    selectivity_margin = _numeric_value(key_results, "selectivity_margin_s")
    if selectivity_margin is None:
        return selectivity_item.why_pl

    return f"{selectivity_item.why_pl} Margines czasowy Δt = {selectivity_margin:.2f} s."


def _build_summary(buckets: Iterable[str]) -> ProtectionInsightSummary:
    counts = {
        "OK": 0,
        "WARNING": 0,
        "FAIL": 0,
        "NOT_EVALUATED": 0,
    }
    for bucket in buckets:
        counts[bucket] += 1

    return ProtectionInsightSummary(
        count_ok=counts["OK"],
        count_warning=counts["WARNING"],
        count_fail=counts["FAIL"],
        count_not_evaluated=counts["NOT_EVALUATED"],
    )


def _target_id(proof: ProofDocument) -> str:
    header = proof.header
    if header.target_id:
        return header.target_id
    if header.fault_location:
        return header.fault_location
    return "—"


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


def _percent_margin(measured: float | None, limit: float | None) -> float | None:
    if measured is None or limit is None or limit == 0:
        return None
    return (limit - measured) / limit * 100.0


def _selectivity_status(
    selectivity_item: NormativeItem | None,
) -> ProtectionSelectivityStatus:
    if selectivity_item is None:
        return ProtectionSelectivityStatus.NOT_EVALUATED
    if selectivity_item.status == NormativeStatus.PASS:
        return ProtectionSelectivityStatus.OK
    if selectivity_item.status == NormativeStatus.FAIL:
        return ProtectionSelectivityStatus.NOT_SELECTIVE
    return ProtectionSelectivityStatus.NOT_EVALUATED


def _bucket_from_selectivity(
    selectivity_item: NormativeItem | None,
    selectivity_status: ProtectionSelectivityStatus,
) -> str:
    if selectivity_status == ProtectionSelectivityStatus.NOT_SELECTIVE:
        return "FAIL"
    if selectivity_status == ProtectionSelectivityStatus.OK:
        return "OK"
    if selectivity_item is None:
        return "NOT_EVALUATED"
    if selectivity_item.status in (NormativeStatus.NOT_EVALUATED, NormativeStatus.NOT_COMPUTED):
        if selectivity_item.severity == NormativeSeverity.WARNING:
            return "WARNING"
        return "NOT_EVALUATED"
    if selectivity_item.status == NormativeStatus.FAIL:
        return "FAIL"
    if selectivity_item.status == NormativeStatus.PASS:
        return "OK"
    return "NOT_EVALUATED"


_SORT_ORDER = {
    "FAIL": 0,
    "WARNING": 1,
    "NOT_EVALUATED": 2,
    "OK": 3,
}
