from __future__ import annotations

from collections.abc import Callable, Iterable

from analysis.normative.models import NormativeReport, NormativeStatus
from analysis.protection_curves_it.models import ProtectionCurvesITView
from analysis.protection_insight.models import ProtectionInsightItem, ProtectionInsightView
from analysis.sensitivity.models import (
    SensitivityContext,
    SensitivityDecision,
    SensitivityDriver,
    SensitivityEntry,
    SensitivityPerturbation,
    SensitivitySummary,
    SensitivityView,
    compute_sensitivity_id,
)
from analysis.voltage_profile.models import (
    VoltageProfileRow,
    VoltageProfileStatus,
    VoltageProfileView,
)
from application.proof_engine.types import ProofDocument

DEFAULT_DELTA_PCT = 5.0
DEFAULT_TOP_N = 5


class SensitivityBuilder:
    def __init__(self, delta_pct: float = DEFAULT_DELTA_PCT, top_n: int = DEFAULT_TOP_N) -> None:
        self._delta_pct = float(delta_pct)
        self._top_n = int(top_n)

    def build(
        self,
        proofs: Iterable[ProofDocument],
        normative_report: NormativeReport | None,
        voltage_profile: VoltageProfileView | None,
        protection_insight: ProtectionInsightView | None,
        protection_curves_it: ProtectionCurvesITView | None,
    ) -> SensitivityView:
        proofs_list = list(proofs)
        entries: list[SensitivityEntry] = []

        if normative_report is not None:
            entries.extend(_entries_from_normative(normative_report, self._delta_pct))
        if voltage_profile is not None:
            entries.extend(_entries_from_voltage(voltage_profile, self._delta_pct))
        if protection_insight is not None:
            entries.extend(_entries_from_protection_insight(protection_insight, self._delta_pct))
        if protection_curves_it is not None:
            entries.extend(_entries_from_protection_curves(protection_curves_it, self._delta_pct))

        entries_sorted = tuple(sorted(entries, key=_entry_sort_key))
        summary = _build_summary(entries_sorted)
        top_drivers = _rank_drivers(entries_sorted, self._top_n)
        context = _resolve_context(
            proofs_list,
            normative_report,
            voltage_profile,
            protection_insight,
            protection_curves_it,
        )
        analysis_id = compute_sensitivity_id(context, self._delta_pct, entries_sorted)

        return SensitivityView(
            analysis_id=analysis_id,
            context=context,
            delta_pct=self._delta_pct,
            entries=entries_sorted,
            summary=summary,
            top_drivers=top_drivers,
        )


def _resolve_context(
    proofs: list[ProofDocument],
    normative_report: NormativeReport | None,
    voltage_profile: VoltageProfileView | None,
    protection_insight: ProtectionInsightView | None,
    protection_curves_it: ProtectionCurvesITView | None,
) -> SensitivityContext | None:
    for ctx in (
        normative_report.context if normative_report else None,
        voltage_profile.context if voltage_profile else None,
        protection_insight.context if protection_insight else None,
        protection_curves_it.context if protection_curves_it else None,
    ):
        if ctx is not None:
            return SensitivityContext(
                project_name=getattr(ctx, "project_name", None),
                case_name=getattr(ctx, "case_name", None),
                run_timestamp=getattr(ctx, "run_timestamp", None),
                snapshot_id=getattr(ctx, "snapshot_id", None),
                trace_id=getattr(ctx, "trace_id", None),
            )
    if proofs:
        first = sorted(proofs, key=lambda doc: (doc.proof_type.value, doc.document_id.hex))[0]
        header = first.header
        return SensitivityContext(
            project_name=header.project_name,
            case_name=header.case_name,
            run_timestamp=header.run_timestamp,
            snapshot_id=None,
            trace_id=str(first.artifact_id),
        )
    return None


def _entries_from_normative(
    report: NormativeReport,
    delta_pct: float,
) -> list[SensitivityEntry]:
    entries: list[SensitivityEntry] = []
    mapping = {
        "NR_P15_001": ("load_q", "Load Q (k_I)", "P20"),
        "NR_P15_002": ("load_p", "Load P (k_S)", "P20"),
    }
    for item in report.items:
        mapped = mapping.get(item.rule_id)
        if mapped is None:
            continue
        parameter_id, parameter_label, source = mapped
        entries.append(
            _entry_from_observed_limit(
                parameter_id=parameter_id,
                parameter_label=parameter_label,
                target_id=item.target_id,
                source=source,
                observed=item.observed_value,
                limit=item.limit_value,
                unit=item.unit,
                status=item.status,
                delta_pct=delta_pct,
                safe_margin_fn=lambda limit, observed: limit - observed,
            )
        )
    return entries


def _entries_from_voltage(
    view: VoltageProfileView,
    delta_pct: float,
) -> list[SensitivityEntry]:
    entries: list[SensitivityEntry] = []
    thresholds = view.thresholds
    warn = float(thresholds.get("voltage_warn_pct", 0.0))
    fail = float(thresholds.get("voltage_fail_pct", 0.0))
    for row in view.rows:
        entries.append(
            _entry_from_voltage_row(
                row=row,
                warn=warn,
                fail=fail,
                delta_pct=delta_pct,
            )
        )
    return entries


def _entries_from_protection_insight(
    view: ProtectionInsightView,
    delta_pct: float,
) -> list[SensitivityEntry]:
    entries: list[SensitivityEntry] = []
    for item in view.items:
        entries.append(_entry_from_short_circuit(item, delta_pct))
        entries.append(_entry_from_protection_settings(item, delta_pct))
    return entries


def _entries_from_protection_curves(
    view: ProtectionCurvesITView,
    delta_pct: float,
) -> list[SensitivityEntry]:
    margins = [float(value) for value in view.margins_pct.values()]
    base_margin = min(margins) if margins else None
    base_decision = _decision_from_margin(base_margin)

    minus_margin = _apply_margin_delta(base_margin, -delta_pct)
    plus_margin = _apply_margin_delta(base_margin, delta_pct)

    return [
        _build_entry(
            parameter_id="protection_curve_margin",
            parameter_label="Protection curve margins",
            target_id=view.primary_device_id,
            source="C-P22",
            base_margin=base_margin,
            margin_unit="%",
            base_decision=base_decision,
            minus_margin=minus_margin,
            plus_margin=plus_margin,
            delta_pct=delta_pct,
        )
    ]


def _entry_from_observed_limit(
    *,
    parameter_id: str,
    parameter_label: str,
    target_id: str,
    source: str,
    observed: float | str | None,
    limit: float | None,
    unit: str | None,
    status: NormativeStatus,
    delta_pct: float,
    safe_margin_fn: Callable[[float, float], float],
) -> SensitivityEntry:
    if status in (NormativeStatus.NOT_COMPUTED, NormativeStatus.NOT_EVALUATED):
        return _build_entry(
            parameter_id=parameter_id,
            parameter_label=parameter_label,
            target_id=target_id,
            source=source,
            base_margin=None,
            margin_unit=unit,
            base_decision=SensitivityDecision.NOT_COMPUTED,
            minus_margin=None,
            plus_margin=None,
            delta_pct=delta_pct,
        )

    if not isinstance(observed, int | float) or limit is None:
        return _build_entry(
            parameter_id=parameter_id,
            parameter_label=parameter_label,
            target_id=target_id,
            source=source,
            base_margin=None,
            margin_unit=unit,
            base_decision=SensitivityDecision.NOT_COMPUTED,
            minus_margin=None,
            plus_margin=None,
            delta_pct=delta_pct,
        )

    observed_value = float(observed)
    limit_value = float(limit)
    base_margin = safe_margin_fn(limit_value, observed_value)

    observed_minus = _apply_delta(observed_value, -delta_pct)
    observed_plus = _apply_delta(observed_value, delta_pct)

    minus_margin = safe_margin_fn(limit_value, observed_minus)
    plus_margin = safe_margin_fn(limit_value, observed_plus)

    return _build_entry(
        parameter_id=parameter_id,
        parameter_label=parameter_label,
        target_id=target_id,
        source=source,
        base_margin=base_margin,
        margin_unit=unit,
        base_decision=_decision_from_margin(base_margin),
        minus_margin=minus_margin,
        plus_margin=plus_margin,
        delta_pct=delta_pct,
    )


def _entry_from_voltage_row(
    *,
    row: VoltageProfileRow,
    warn: float,
    fail: float,
    delta_pct: float,
) -> SensitivityEntry:
    if row.status == VoltageProfileStatus.NOT_COMPUTED or row.delta_pct is None:
        return _build_entry(
            parameter_id="voltage_limit",
            parameter_label="Voltage limits",
            target_id=row.bus_id,
            source="P21",
            base_margin=None,
            margin_unit="%",
            base_decision=SensitivityDecision.NOT_COMPUTED,
            minus_margin=None,
            plus_margin=None,
            delta_pct=delta_pct,
        )

    abs_delta = abs(float(row.delta_pct))
    base_margin = _voltage_margin(abs_delta, warn, fail)

    warn_minus = _apply_delta(warn, -delta_pct)
    fail_minus = _apply_delta(fail, -delta_pct)
    warn_plus = _apply_delta(warn, delta_pct)
    fail_plus = _apply_delta(fail, delta_pct)

    minus_margin = _voltage_margin(abs_delta, warn_minus, fail_minus)
    plus_margin = _voltage_margin(abs_delta, warn_plus, fail_plus)

    return _build_entry(
        parameter_id="voltage_limit",
        parameter_label="Voltage limits",
        target_id=row.bus_id,
        source="P21",
        base_margin=base_margin,
        margin_unit="%",
        base_decision=_decision_from_margin(base_margin),
        minus_margin=minus_margin,
        plus_margin=plus_margin,
        delta_pct=delta_pct,
    )


def _entry_from_short_circuit(
    item: ProtectionInsightItem,
    delta_pct: float,
) -> SensitivityEntry:
    base_margin = _protection_margin_from_measured(
        ikss_ka=item.ikss_ka,
        icu_ka=item.icu_ka,
        ip_ka=item.ip_ka,
        idyn_ka=item.idyn_ka,
        ith_ka2s=item.ith_ka2s,
        ith_limit_ka2s=item.ith_limit_ka2s,
    )

    minus_margin = _protection_margin_from_measured(
        ikss_ka=_apply_delta(item.ikss_ka, -delta_pct),
        icu_ka=item.icu_ka,
        ip_ka=_apply_delta(item.ip_ka, -delta_pct),
        idyn_ka=item.idyn_ka,
        ith_ka2s=_apply_delta(item.ith_ka2s, -delta_pct),
        ith_limit_ka2s=item.ith_limit_ka2s,
    )
    plus_margin = _protection_margin_from_measured(
        ikss_ka=_apply_delta(item.ikss_ka, delta_pct),
        icu_ka=item.icu_ka,
        ip_ka=_apply_delta(item.ip_ka, delta_pct),
        idyn_ka=item.idyn_ka,
        ith_ka2s=_apply_delta(item.ith_ka2s, delta_pct),
        ith_limit_ka2s=item.ith_limit_ka2s,
    )

    return _build_entry(
        parameter_id="short_circuit_level",
        parameter_label="Short-circuit level",
        target_id=item.primary_device_id,
        source="P22a",
        base_margin=base_margin,
        margin_unit="%",
        base_decision=_decision_from_margin(base_margin),
        minus_margin=minus_margin,
        plus_margin=plus_margin,
        delta_pct=delta_pct,
    )


def _entry_from_protection_settings(
    item: ProtectionInsightItem,
    delta_pct: float,
) -> SensitivityEntry:
    base_margin = _protection_margin_from_limits(
        ikss_ka=item.ikss_ka,
        icu_ka=item.icu_ka,
        ip_ka=item.ip_ka,
        idyn_ka=item.idyn_ka,
        ith_ka2s=item.ith_ka2s,
        ith_limit_ka2s=item.ith_limit_ka2s,
    )

    minus_margin = _protection_margin_from_limits(
        ikss_ka=item.ikss_ka,
        icu_ka=_apply_delta(item.icu_ka, -delta_pct),
        ip_ka=item.ip_ka,
        idyn_ka=_apply_delta(item.idyn_ka, -delta_pct),
        ith_ka2s=item.ith_ka2s,
        ith_limit_ka2s=_apply_delta(item.ith_limit_ka2s, -delta_pct),
    )
    plus_margin = _protection_margin_from_limits(
        ikss_ka=item.ikss_ka,
        icu_ka=_apply_delta(item.icu_ka, delta_pct),
        ip_ka=item.ip_ka,
        idyn_ka=_apply_delta(item.idyn_ka, delta_pct),
        ith_ka2s=item.ith_ka2s,
        ith_limit_ka2s=_apply_delta(item.ith_limit_ka2s, delta_pct),
    )

    return _build_entry(
        parameter_id="protection_margin",
        parameter_label="Protection settings margins",
        target_id=item.primary_device_id,
        source="P22a",
        base_margin=base_margin,
        margin_unit="%",
        base_decision=_decision_from_margin(base_margin),
        minus_margin=minus_margin,
        plus_margin=plus_margin,
        delta_pct=delta_pct,
    )


def _apply_delta(value: float | None, delta_pct: float) -> float | None:
    if value is None:
        return None
    return float(value) * (1.0 + delta_pct / 100.0)


def _apply_margin_delta(value: float | None, delta_pct: float) -> float | None:
    if value is None:
        return None
    return float(value) * (1.0 + delta_pct / 100.0)


def _decision_from_margin(margin: float | None) -> SensitivityDecision:
    if margin is None:
        return SensitivityDecision.NOT_COMPUTED
    return SensitivityDecision.PASS if margin >= 0 else SensitivityDecision.FAIL


def _build_entry(
    *,
    parameter_id: str,
    parameter_label: str,
    target_id: str,
    source: str,
    base_margin: float | None,
    margin_unit: str | None,
    base_decision: SensitivityDecision,
    minus_margin: float | None,
    plus_margin: float | None,
    delta_pct: float,
) -> SensitivityEntry:
    minus = _build_perturbation(-delta_pct, base_margin, minus_margin)
    plus = _build_perturbation(delta_pct, base_margin, plus_margin)

    return SensitivityEntry(
        parameter_id=parameter_id,
        parameter_label=parameter_label,
        target_id=target_id,
        source=source,
        base_margin=base_margin,
        margin_unit=margin_unit,
        base_decision=base_decision,
        minus=minus,
        plus=plus,
    )


def _build_perturbation(
    delta_pct: float,
    base_margin: float | None,
    margin: float | None,
) -> SensitivityPerturbation:
    delta_margin = None
    if base_margin is not None and margin is not None:
        delta_margin = margin - base_margin
    decision = _decision_from_margin(margin)
    return SensitivityPerturbation(
        delta_pct=delta_pct,
        margin=margin,
        delta_margin=delta_margin,
        decision=decision,
    )


def _voltage_margin(delta_pct_abs: float, warn: float, fail: float) -> float:
    if delta_pct_abs >= fail:
        return float(fail - delta_pct_abs)
    return float(warn - delta_pct_abs)


def _protection_margin_from_measured(
    *,
    ikss_ka: float | None,
    icu_ka: float | None,
    ip_ka: float | None,
    idyn_ka: float | None,
    ith_ka2s: float | None,
    ith_limit_ka2s: float | None,
) -> float | None:
    margins = _protection_margins(
        measured_ikss=ikss_ka,
        limit_icu=icu_ka,
        measured_ip=ip_ka,
        limit_idyn=idyn_ka,
        measured_ith=ith_ka2s,
        limit_ith=ith_limit_ka2s,
    )
    return min(margins) if margins else None


def _protection_margin_from_limits(
    *,
    ikss_ka: float | None,
    icu_ka: float | None,
    ip_ka: float | None,
    idyn_ka: float | None,
    ith_ka2s: float | None,
    ith_limit_ka2s: float | None,
) -> float | None:
    margins = _protection_margins(
        measured_ikss=ikss_ka,
        limit_icu=icu_ka,
        measured_ip=ip_ka,
        limit_idyn=idyn_ka,
        measured_ith=ith_ka2s,
        limit_ith=ith_limit_ka2s,
    )
    return min(margins) if margins else None


def _protection_margins(
    *,
    measured_ikss: float | None,
    limit_icu: float | None,
    measured_ip: float | None,
    limit_idyn: float | None,
    measured_ith: float | None,
    limit_ith: float | None,
) -> list[float]:
    margins: list[float] = []
    for measured, limit in (
        (measured_ikss, limit_icu),
        (measured_ip, limit_idyn),
        (measured_ith, limit_ith),
    ):
        if measured is None or limit is None or limit == 0:
            continue
        margins.append((limit - measured) / limit * 100.0)
    return margins


def _entry_sort_key(entry: SensitivityEntry) -> tuple[str, str, str]:
    return (entry.parameter_id, entry.target_id, entry.source)


def _build_summary(entries: Iterable[SensitivityEntry]) -> SensitivitySummary:
    entries_list = list(entries)
    not_computed = sum(
        1 for entry in entries_list if entry.base_decision == SensitivityDecision.NOT_COMPUTED
    )
    return SensitivitySummary(
        total_entries=len(entries_list),
        not_computed_count=not_computed,
    )


def _rank_drivers(
    entries: Iterable[SensitivityEntry],
    top_n: int,
) -> tuple[SensitivityDriver, ...]:
    if top_n <= 0:
        return ()

    drivers: list[SensitivityDriver] = []
    for entry in entries:
        score = _entry_score(entry)
        if score is None:
            continue
        direction, delta_margin = _dominant_delta(entry)
        drivers.append(
            SensitivityDriver(
                parameter_id=entry.parameter_id,
                parameter_label=entry.parameter_label,
                target_id=entry.target_id,
                source=entry.source,
                score=score,
                direction=direction,
                delta_margin=delta_margin,
            )
        )

    drivers_sorted = sorted(
        drivers,
        key=lambda driver: (
            -driver.score,
            driver.parameter_id,
            driver.target_id,
            driver.source,
        ),
    )
    return tuple(drivers_sorted[:top_n])


def _entry_score(entry: SensitivityEntry) -> float | None:
    if entry.minus.delta_margin is None or entry.plus.delta_margin is None:
        return None
    return max(abs(entry.minus.delta_margin), abs(entry.plus.delta_margin))


def _dominant_delta(entry: SensitivityEntry) -> tuple[str, float]:
    minus = entry.minus.delta_margin or 0.0
    plus = entry.plus.delta_margin or 0.0
    if abs(plus) >= abs(minus):
        return "PLUS", plus
    return "MINUS", minus
