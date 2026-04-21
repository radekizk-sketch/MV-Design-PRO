from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable

from analysis.normative.models import (
    NormativeConfig,
    NormativeContext,
    NormativeItem,
    NormativeReport,
    NormativeSeverity,
    NormativeStatus,
    compute_report_id,
)
from analysis.normative.rule_registry import RULES, NormativeRule
from analysis.normative.serializer import sort_items
from application.proof_engine.types import ProofDocument, ProofValue


class NormativeEvaluator:
    def evaluate(
        self,
        proofs: Iterable[ProofDocument],
        config: NormativeConfig,
    ) -> NormativeReport:
        proofs_by_type: dict[str, list[ProofDocument]] = defaultdict(list)
        proof_list = list(proofs)
        for proof in proof_list:
            proofs_by_type[proof.proof_type.value].append(proof)

        context = _build_context(proof_list)
        items: list[NormativeItem] = []

        for rule in RULES:
            matching = proofs_by_type.get(rule.proof_type.value, [])
            if not matching:
                items.append(_missing_proof_item(rule))
                continue
            for proof in _sorted_proofs(matching):
                items.append(_evaluate_rule(rule, proof, config))

        sorted_items = tuple(sort_items(items))
        report_id = compute_report_id(
            context,
            [str(proof.document_id) for proof in proof_list],
            config,
        )
        return NormativeReport(report_id=report_id, context=context, items=sorted_items)


def _sorted_proofs(proofs: list[ProofDocument]) -> list[ProofDocument]:
    return sorted(
        proofs,
        key=lambda proof: (
            _target_id(proof),
            proof.document_id.hex,
        ),
    )


def _build_context(proofs: list[ProofDocument]) -> NormativeContext:
    if not proofs:
        return NormativeContext(
            project_name=None,
            case_name=None,
            run_timestamp=None,
            snapshot_id=None,
            trace_id=None,
        )
    first = sorted(
        proofs,
        key=lambda proof: (proof.proof_type.value, proof.document_id.hex),
    )[0]
    header = first.header
    return NormativeContext(
        project_name=header.project_name,
        case_name=header.case_name,
        run_timestamp=header.run_timestamp,
        snapshot_id=None,
        trace_id=str(first.artifact_id),
    )


def _missing_proof_item(rule: NormativeRule) -> NormativeItem:
    requires = (rule.proof_type.value,)
    return NormativeItem(
        rule_id=rule.rule_id,
        title_pl=rule.title_pl,
        severity=NormativeSeverity.WARNING,
        status=NormativeStatus.NOT_COMPUTED,
        target_id="—",
        observed_value=None,
        unit=None,
        limit_value=None,
        limit_unit=None,
        margin=None,
        why_pl=("Brak dowodu (ProofDocument) dla pakietu " f"{rule.proof_type.value}."),
        requires=requires,
    )


def _evaluate_rule(
    rule: NormativeRule,
    proof: ProofDocument,
    config: NormativeConfig,
) -> NormativeItem:
    key_results = proof.summary.key_results
    target_id = _target_id(proof)

    if rule.rule_id == "NR_P15_001":
        return _evaluate_loading_rule(
            rule,
            key_results.get("k_i_percent"),
            config,
            target_id,
        )
    if rule.rule_id == "NR_P15_002":
        return _evaluate_loading_rule(
            rule,
            key_results.get("k_s_percent"),
            config,
            target_id,
        )
    if rule.rule_id == "NR_P18_001":
        return _evaluate_boolean_rule(
            rule,
            key_results.get("breaking_ok"),
            target_id,
        )
    if rule.rule_id == "NR_P18_002":
        return _evaluate_boolean_rule(
            rule,
            key_results.get("dynamic_ok"),
            target_id,
        )
    if rule.rule_id == "NR_P18_003":
        return _evaluate_boolean_rule(
            rule,
            key_results.get("thermal_ok"),
            target_id,
        )
    if rule.rule_id == "NR_P18_004":
        return _evaluate_selectivity_rule(
            rule,
            key_results.get("selectivity_ok"),
            target_id,
            config,
        )
    if rule.rule_id == "NR_P19_001":
        return _evaluate_touch_voltage_rule(
            rule,
            key_results.get("u_touch_v"),
            target_id,
            config,
        )
    if rule.rule_id == "NR_P19_002":
        return _evaluate_earth_current_rule(
            rule,
            key_results.get("i_earth_a"),
            target_id,
            config,
        )
    if rule.rule_id == "NR_P11_001":
        return _evaluate_availability_rule(
            rule,
            key_results,
            target_id,
        )
    if rule.rule_id == "NR_P17_001":
        return _evaluate_presence_rule(
            rule,
            key_results.get("e_loss_kwh"),
            target_id,
        )

    return NormativeItem(
        rule_id=rule.rule_id,
        title_pl=rule.title_pl,
        severity=NormativeSeverity.WARNING,
        status=NormativeStatus.NOT_COMPUTED,
        target_id=target_id,
        observed_value=None,
        unit=None,
        limit_value=None,
        limit_unit=None,
        margin=None,
        why_pl="Reguła nieobsługiwana.",
        requires=(rule.proof_type.value,),
    )


def _evaluate_loading_rule(
    rule: NormativeRule,
    value: ProofValue | None,
    config: NormativeConfig,
    target_id: str,
) -> NormativeItem:
    if value is None or not _is_numeric(value.value):
        return _missing_key_item(rule, target_id, _rule_key(rule))

    observed = float(value.value)
    unit = value.unit
    warn = config.loading_warn_pct
    fail = config.loading_fail_pct
    status, severity, limit = _threshold_status(observed, warn, fail)
    margin = observed - limit
    why_pl = _format_threshold_why(observed, limit, unit, status)

    return NormativeItem(
        rule_id=rule.rule_id,
        title_pl=rule.title_pl,
        severity=severity,
        status=status,
        target_id=target_id,
        observed_value=observed,
        unit=unit,
        limit_value=limit,
        limit_unit=unit,
        margin=margin,
        why_pl=why_pl,
        requires=(),
    )


def _evaluate_boolean_rule(
    rule: NormativeRule,
    value: ProofValue | None,
    target_id: str,
) -> NormativeItem:
    if value is None or not isinstance(value.value, str):
        return _missing_key_item(rule, target_id, _rule_key(rule))

    status = _status_from_ok(value.value)
    severity = _severity_from_status(status)
    why_pl = _format_ok_why(value.value)

    return NormativeItem(
        rule_id=rule.rule_id,
        title_pl=rule.title_pl,
        severity=severity,
        status=status,
        target_id=target_id,
        observed_value=value.value,
        unit=value.unit,
        limit_value=None,
        limit_unit=None,
        margin=None,
        why_pl=why_pl,
        requires=(),
    )


def _evaluate_selectivity_rule(
    rule: NormativeRule,
    value: ProofValue | None,
    target_id: str,
    config: NormativeConfig,
) -> NormativeItem:
    if value is None or not isinstance(value.value, str):
        return _missing_key_item(rule, target_id, _rule_key(rule))

    status = _status_from_ok(value.value)
    severity = _severity_from_status(status)
    if status == NormativeStatus.NOT_EVALUATED:
        if config.selectivity_required:
            severity = NormativeSeverity.WARNING
            why_pl = "Selektywność wymagana, brak oceny w dowodzie."
        else:
            severity = NormativeSeverity.INFO
            why_pl = "Selektywność niewymagana — brak oceny akceptowalny."
    else:
        why_pl = _format_ok_why(value.value)

    return NormativeItem(
        rule_id=rule.rule_id,
        title_pl=rule.title_pl,
        severity=severity,
        status=status,
        target_id=target_id,
        observed_value=value.value,
        unit=value.unit,
        limit_value=None,
        limit_unit=None,
        margin=None,
        why_pl=why_pl,
        requires=(),
    )


def _evaluate_touch_voltage_rule(
    rule: NormativeRule,
    value: ProofValue | None,
    target_id: str,
    config: NormativeConfig,
) -> NormativeItem:
    if value is None or not _is_numeric(value.value):
        return _missing_key_item(rule, target_id, _rule_key(rule))

    observed = float(value.value)
    unit = value.unit
    warn = config.touch_voltage_warn_v
    fail = config.touch_voltage_fail_v

    if warn is None and fail is None:
        return NormativeItem(
            rule_id=rule.rule_id,
            title_pl=rule.title_pl,
            severity=NormativeSeverity.INFO,
            status=NormativeStatus.NOT_EVALUATED,
            target_id=target_id,
            observed_value=observed,
            unit=unit,
            limit_value=None,
            limit_unit=unit,
            margin=None,
            why_pl="Brak limitów napięcia dotykowego w konfiguracji.",
            requires=("touch_voltage_warn_v", "touch_voltage_fail_v"),
        )

    warn_value = warn if warn is not None else fail
    fail_value = fail if fail is not None else warn
    status, severity, limit = _threshold_status(observed, warn_value, fail_value)
    margin = observed - limit
    why_pl = _format_threshold_why(observed, limit, unit, status)

    return NormativeItem(
        rule_id=rule.rule_id,
        title_pl=rule.title_pl,
        severity=severity,
        status=status,
        target_id=target_id,
        observed_value=observed,
        unit=unit,
        limit_value=limit,
        limit_unit=unit,
        margin=margin,
        why_pl=why_pl,
        requires=(),
    )


def _evaluate_earth_current_rule(
    rule: NormativeRule,
    value: ProofValue | None,
    target_id: str,
    config: NormativeConfig,
) -> NormativeItem:
    if value is None or not _is_numeric(value.value):
        return _missing_key_item(rule, target_id, _rule_key(rule))

    observed = float(value.value)
    unit = value.unit
    warn = config.earth_current_warn_a
    fail = config.earth_current_fail_a

    if warn is None and fail is None:
        return NormativeItem(
            rule_id=rule.rule_id,
            title_pl=rule.title_pl,
            severity=NormativeSeverity.INFO,
            status=NormativeStatus.PASS,
            target_id=target_id,
            observed_value=observed,
            unit=unit,
            limit_value=None,
            limit_unit=unit,
            margin=None,
            why_pl="Brak limitów prądu doziemnego — wynik informacyjny.",
            requires=(),
        )

    warn_value = warn if warn is not None else fail
    fail_value = fail if fail is not None else warn
    status, severity, limit = _threshold_status(observed, warn_value, fail_value)
    margin = observed - limit
    why_pl = _format_threshold_why(observed, limit, unit, status)

    return NormativeItem(
        rule_id=rule.rule_id,
        title_pl=rule.title_pl,
        severity=severity,
        status=status,
        target_id=target_id,
        observed_value=observed,
        unit=unit,
        limit_value=limit,
        limit_unit=unit,
        margin=margin,
        why_pl=why_pl,
        requires=(),
    )


def _evaluate_availability_rule(
    rule: NormativeRule,
    key_results: dict[str, ProofValue],
    target_id: str,
) -> NormativeItem:
    keys = ("ikss_ka", "ip_ka", "ith_ka")
    missing = [key for key in keys if key not in key_results]
    if missing:
        return NormativeItem(
            rule_id=rule.rule_id,
            title_pl=rule.title_pl,
            severity=NormativeSeverity.WARNING,
            status=NormativeStatus.NOT_COMPUTED,
            target_id=target_id,
            observed_value="BRAK",
            unit="—",
            limit_value=None,
            limit_unit=None,
            margin=None,
            why_pl="Brak pełnego zestawu wyników SC3F.",
            requires=tuple(missing),
        )

    return NormativeItem(
        rule_id=rule.rule_id,
        title_pl=rule.title_pl,
        severity=NormativeSeverity.INFO,
        status=NormativeStatus.PASS,
        target_id=target_id,
        observed_value="DOSTĘPNE",
        unit="—",
        limit_value=None,
        limit_unit=None,
        margin=None,
        why_pl="Wyniki SC3F dostępne (Ik″, ip, Ith).",
        requires=(),
    )


def _evaluate_presence_rule(
    rule: NormativeRule,
    value: ProofValue | None,
    target_id: str,
) -> NormativeItem:
    if value is None:
        return _missing_key_item(rule, target_id, _rule_key(rule))

    return NormativeItem(
        rule_id=rule.rule_id,
        title_pl=rule.title_pl,
        severity=NormativeSeverity.INFO,
        status=NormativeStatus.PASS,
        target_id=target_id,
        observed_value=value.value,
        unit=value.unit,
        limit_value=None,
        limit_unit=None,
        margin=None,
        why_pl="Profil energii strat został obliczony.",
        requires=(),
    )


def _missing_key_item(
    rule: NormativeRule,
    target_id: str,
    key: str,
) -> NormativeItem:
    return NormativeItem(
        rule_id=rule.rule_id,
        title_pl=rule.title_pl,
        severity=NormativeSeverity.WARNING,
        status=NormativeStatus.NOT_COMPUTED,
        target_id=target_id,
        observed_value=None,
        unit=None,
        limit_value=None,
        limit_unit=None,
        margin=None,
        why_pl="Brak wymaganych danych w ProofDocument.",
        requires=(key,),
    )


def _target_id(proof: ProofDocument) -> str:
    header = proof.header
    if header.target_id:
        return header.target_id
    if header.fault_location:
        return header.fault_location
    return "—"


def _is_numeric(value: object) -> bool:
    return isinstance(value, int | float)


def _status_from_ok(value: str) -> NormativeStatus:
    if value == "OK":
        return NormativeStatus.PASS
    if value == "NOT_OK":
        return NormativeStatus.FAIL
    if value == "NOT_EVALUATED":
        return NormativeStatus.NOT_EVALUATED
    return NormativeStatus.NOT_COMPUTED


def _severity_from_status(status: NormativeStatus) -> NormativeSeverity:
    if status == NormativeStatus.FAIL:
        return NormativeSeverity.FAIL
    if status == NormativeStatus.WARNING:
        return NormativeSeverity.WARNING
    if status == NormativeStatus.NOT_COMPUTED:
        return NormativeSeverity.WARNING
    if status == NormativeStatus.NOT_EVALUATED:
        return NormativeSeverity.INFO
    return NormativeSeverity.INFO


def _threshold_status(
    observed: float,
    warn: float | None,
    fail: float | None,
) -> tuple[NormativeStatus, NormativeSeverity, float]:
    fail_value = fail if fail is not None else warn
    warn_value = warn if warn is not None else fail_value
    if fail_value is None:
        return NormativeStatus.NOT_EVALUATED, NormativeSeverity.INFO, observed

    if observed >= fail_value:
        return NormativeStatus.FAIL, NormativeSeverity.FAIL, float(fail_value)
    if warn_value is not None and observed >= warn_value:
        return NormativeStatus.WARNING, NormativeSeverity.WARNING, float(warn_value)
    return NormativeStatus.PASS, NormativeSeverity.INFO, float(warn_value or fail_value)


def _format_threshold_why(
    observed: float,
    limit: float,
    unit: str,
    status: NormativeStatus,
) -> str:
    prefix = "Wartość"
    status_label = {
        NormativeStatus.FAIL: "przekracza",
        NormativeStatus.WARNING: "zbliża się do",
        NormativeStatus.PASS: "poniżej",
    }.get(status, "")
    return (
        f"{prefix} { _format_value(observed)} {unit} {status_label} "
        f"limitu { _format_value(limit)} {unit}."
    )


def _format_ok_why(value: str) -> str:
    if value == "OK":
        return "Warunek spełniony."
    if value == "NOT_OK":
        return "Warunek niespełniony."
    if value == "NOT_EVALUATED":
        return "Brak danych do oceny warunku."
    return "Brak danych do oceny warunku."


def _format_value(value: float) -> str:
    return f"{value:.2f}"


def _rule_key(rule: NormativeRule) -> str:
    if isinstance(rule.key, tuple):
        return ",".join(rule.key)
    return rule.key
