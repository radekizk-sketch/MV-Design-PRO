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
from analysis.normative.oceny import ProjekcjaPozycji, ocena_pozycji, status_pozycji
from analysis.normative.rule_registry import RULES, NormativeRule
from analysis.normative.serializer import sort_items
from application.proof_engine.types import ProofDocument, ProofValue
from werdykt import OcenaKryterium


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
                items.append(_missing_proof_item(rule, config))
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


def _pozycja(
    rule: NormativeRule,
    *,
    target_id: str,
    ocena: OcenaKryterium,
    projekcja: ProjekcjaPozycji,
    observed_value: float | str | None = None,
    unit: str | None = None,
    limit_value: float | None = None,
    limit_unit: str | None = None,
    margin: float | None = None,
    requires: tuple[str, ...] = (),
) -> NormativeItem:
    """Pozycja raportu z rekordu: kod i waga są projekcją rekordu, zdanie jest zdaniem rekordu
    (jedno miejsce składania pozycji — żadna gałąź nie pisze własnego zdania rozstrzygnięcia)."""
    return NormativeItem(
        rule_id=rule.rule_id,
        title_pl=rule.title_pl,
        severity=projekcja[1],
        status=projekcja[0],
        target_id=target_id,
        observed_value=observed_value,
        unit=unit,
        limit_value=limit_value,
        limit_unit=limit_unit,
        margin=margin,
        why_pl=ocena.wyjasnienie.zdanie_pl,
        requires=requires,
        ocena=ocena,
        wyjasnienie=ocena.wyjasnienie,
    )


def _missing_proof_item(rule: NormativeRule, config: NormativeConfig) -> NormativeItem:
    proof_type = rule.proof_type.value
    ocena = ocena_pozycji(
        rule_id=rule.rule_id,
        title_pl=rule.title_pl,
        target_id="—",
        proof_type=proof_type,
        config=config,
        braki=(f"dowód pakietu {proof_type} nie został wygenerowany dla tego przebiegu",),
    )
    return _pozycja(
        rule,
        target_id="—",
        ocena=ocena,
        projekcja=status_pozycji(ocena),
        requires=(proof_type,),
    )


def _evaluate_rule(
    rule: NormativeRule,
    proof: ProofDocument,
    config: NormativeConfig,
) -> NormativeItem:
    key_results = proof.summary.key_results
    target_id = _target_id(proof)
    proof_type = proof.proof_type.value

    if rule.rule_id in ("NR_P15_001", "NR_P15_002"):
        return _evaluate_threshold_rule(
            rule,
            key_results.get(_rule_key(rule)),
            target_id,
            proof_type,
            config,
            warn=config.loading_warn_pct,
            fail=config.loading_fail_pct,
        )
    if rule.rule_id in ("NR_P18_001", "NR_P18_002", "NR_P18_003"):
        return _evaluate_boolean_rule(
            rule, key_results.get(_rule_key(rule)), target_id, proof_type, config
        )
    if rule.rule_id == "NR_P18_004":
        return _evaluate_selectivity_rule(
            rule, key_results.get(_rule_key(rule)), target_id, proof_type, config
        )
    if rule.rule_id == "NR_P19_001":
        return _evaluate_threshold_rule(
            rule,
            key_results.get(_rule_key(rule)),
            target_id,
            proof_type,
            config,
            warn=config.touch_voltage_warn_v,
            fail=config.touch_voltage_fail_v,
            requires_bez_limitu=("touch_voltage_warn_v", "touch_voltage_fail_v"),
        )
    if rule.rule_id == "NR_P19_002":
        return _evaluate_threshold_rule(
            rule,
            key_results.get(_rule_key(rule)),
            target_id,
            proof_type,
            config,
            warn=config.earth_current_warn_a,
            fail=config.earth_current_fail_a,
            requires_bez_limitu=("earth_current_warn_a", "earth_current_fail_a"),
        )
    if rule.rule_id == "NR_P11_001":
        return _evaluate_availability_rule(rule, key_results, target_id, proof_type, config)
    if rule.rule_id == "NR_P17_001":
        return _evaluate_presence_rule(
            rule, key_results.get(_rule_key(rule)), target_id, proof_type, config
        )
    # Rejestr reguł jest zamknięty (``rule_registry.RULES``) — reguła spoza tej listy to błąd
    # programu, nie pozycja raportu (zakaz cichego „nieobsługiwana").
    raise ValueError(f"Reguła oceny normatywnej bez ewaluatora: {rule.rule_id}")


def _evaluate_threshold_rule(
    rule: NormativeRule,
    value: ProofValue | None,
    target_id: str,
    proof_type: str,
    config: NormativeConfig,
    *,
    warn: float | None,
    fail: float | None,
    requires_bez_limitu: tuple[str, ...] = (),
) -> NormativeItem:
    """Reguła progowa: rekord ``wielkość ≤ próg przekroczenia``; próg ostrzeżenia nakłada sygnał
    bliskości limitu na rekord spełniony. Brak obu progów ⇒ podstawa nieustalona (rekord
    ``BRAK_PODSTAWY``, pozycja ``NOT_EVALUATED``) — nigdy spełnienie."""
    observed = _liczba(value)
    if value is None or observed is None:
        return _missing_key_item(rule, target_id, proof_type, config)

    unit = value.unit
    fail_value = fail if fail is not None else warn
    warn_value = warn if warn is not None else fail_value
    ocena = ocena_pozycji(
        rule_id=rule.rule_id,
        title_pl=rule.title_pl,
        target_id=target_id,
        proof_type=proof_type,
        config=config,
        wynik=observed,
        jednostka=unit,
        limit=fail_value,
    )
    projekcja = status_pozycji(
        ocena,
        wynik=observed,
        prog_ostrzezenia=warn_value,
        nierozstrzygniete=NormativeStatus.NOT_EVALUATED,
        waga_nierozstrzygnietych=NormativeSeverity.INFO,
    )
    if fail_value is None or warn_value is None:
        return _pozycja(
            rule,
            target_id=target_id,
            ocena=ocena,
            projekcja=projekcja,
            observed_value=observed,
            unit=unit,
            limit_unit=unit,
            requires=requires_bez_limitu,
        )
    limit = float(fail_value) if projekcja[0] == NormativeStatus.FAIL else float(warn_value)
    return _pozycja(
        rule,
        target_id=target_id,
        ocena=ocena,
        projekcja=projekcja,
        observed_value=observed,
        unit=unit,
        limit_value=limit,
        limit_unit=unit,
        margin=observed - limit,
    )


#: Wynik warunku zapisany w dowodzie → wartość logiczna rekordu (``None`` — nie oceniono).
_WYNIK_WARUNKU: dict[str, bool | None] = {"OK": True, "NOT_OK": False}


def _evaluate_boolean_rule(
    rule: NormativeRule,
    value: ProofValue | None,
    target_id: str,
    proof_type: str,
    config: NormativeConfig,
) -> NormativeItem:
    if value is None or not isinstance(value.value, str):
        return _missing_key_item(rule, target_id, proof_type, config)

    ocena = ocena_pozycji(
        rule_id=rule.rule_id,
        title_pl=rule.title_pl,
        target_id=target_id,
        proof_type=proof_type,
        config=config,
        spelniony=_WYNIK_WARUNKU.get(value.value),
        braki=_braki_warunku(value.value),
    )
    return _pozycja(
        rule,
        target_id=target_id,
        ocena=ocena,
        projekcja=status_pozycji(
            ocena,
            nierozstrzygniete=_nierozstrzygniety(value.value),
            waga_nierozstrzygnietych=(
                NormativeSeverity.INFO
                if value.value == "NOT_EVALUATED"
                else NormativeSeverity.WARNING
            ),
        ),
        observed_value=_wartosc_obserwowana(value.value),
        unit=value.unit,
    )


def _evaluate_selectivity_rule(
    rule: NormativeRule,
    value: ProofValue | None,
    target_id: str,
    proof_type: str,
    config: NormativeConfig,
) -> NormativeItem:
    """Selektywność: dowód bez oceny przy wymaganiu niewłączonym w konfiguracji ⇒ kryterium nie
    stosuje się (``NIE_DOTYCZY`` z powodem); przy wymaganiu włączonym ⇒ ``NIE_OCENIONO``."""
    if value is None or not isinstance(value.value, str):
        return _missing_key_item(rule, target_id, proof_type, config)

    spelniony = _WYNIK_WARUNKU.get(value.value)
    niewymagana = value.value == "NOT_EVALUATED" and not config.selectivity_required
    ocena = ocena_pozycji(
        rule_id=rule.rule_id,
        title_pl=rule.title_pl,
        target_id=target_id,
        proof_type=proof_type,
        config=config,
        spelniony=spelniony,
        braki=() if niewymagana else _braki_warunku(value.value),
        dotyczy=not niewymagana,
        powod_stosowalnosci_pl=(
            "selektywność zabezpieczeń nie jest wymagana w konfiguracji oceny normatywnej, "
            "a dowód jej nie ocenił"
            if niewymagana
            else None
        ),
    )
    return _pozycja(
        rule,
        target_id=target_id,
        ocena=ocena,
        projekcja=status_pozycji(
            ocena,
            nierozstrzygniete=_nierozstrzygniety(value.value),
            waga_nierozstrzygnietych=NormativeSeverity.WARNING,
        ),
        observed_value=_wartosc_obserwowana(value.value),
        unit=value.unit,
    )


def _evaluate_availability_rule(
    rule: NormativeRule,
    key_results: dict[str, ProofValue],
    target_id: str,
    proof_type: str,
    config: NormativeConfig,
) -> NormativeItem:
    keys = ("ikss_ka", "ip_ka", "ith_ka")
    missing = tuple(key for key in keys if key not in key_results)
    ocena = ocena_pozycji(
        rule_id=rule.rule_id,
        title_pl=rule.title_pl,
        target_id=target_id,
        proof_type=proof_type,
        config=config,
        spelniony=None if missing else True,
        braki=tuple(f"wielkość {key} w dowodzie zwarcia trójfazowego" for key in missing),
    )
    return _pozycja(
        rule,
        target_id=target_id,
        ocena=ocena,
        projekcja=status_pozycji(ocena),
        observed_value="BRAK" if missing else "DOSTĘPNE",
        unit="—",
        requires=missing,
    )


def _evaluate_presence_rule(
    rule: NormativeRule,
    value: ProofValue | None,
    target_id: str,
    proof_type: str,
    config: NormativeConfig,
) -> NormativeItem:
    if value is None:
        return _missing_key_item(rule, target_id, proof_type, config)

    ocena = ocena_pozycji(
        rule_id=rule.rule_id,
        title_pl=rule.title_pl,
        target_id=target_id,
        proof_type=proof_type,
        config=config,
        spelniony=True,
    )
    return _pozycja(
        rule,
        target_id=target_id,
        ocena=ocena,
        projekcja=status_pozycji(ocena),
        observed_value=_wartosc_obserwowana(value.value),
        unit=value.unit,
    )


def _missing_key_item(
    rule: NormativeRule,
    target_id: str,
    proof_type: str,
    config: NormativeConfig,
) -> NormativeItem:
    key = _rule_key(rule)
    ocena = ocena_pozycji(
        rule_id=rule.rule_id,
        title_pl=rule.title_pl,
        target_id=target_id,
        proof_type=proof_type,
        config=config,
        braki=(f"wielkość {key} w dowodzie pakietu {proof_type}",),
    )
    return _pozycja(
        rule,
        target_id=target_id,
        ocena=ocena,
        projekcja=status_pozycji(ocena),
        requires=(key,),
    )


def _braki_warunku(wynik_warunku: str) -> tuple[str, ...]:
    if wynik_warunku in _WYNIK_WARUNKU:
        return ()
    if wynik_warunku == "NOT_EVALUATED":
        return ("dowód nie ocenił warunku (brak danych aparatu albo zwarcia w dowodzie)",)
    return ("dowód nie zawiera rozpoznawalnego wyniku warunku",)


def _nierozstrzygniety(wynik_warunku: str) -> NormativeStatus:
    """Stan danych pozycji nierozstrzygniętej: dowód jawnie nie ocenił warunku
    (``NOT_EVALUATED``) albo wyniku warunku w dowodzie nie ma (``NOT_COMPUTED``)."""
    if wynik_warunku == "NOT_EVALUATED":
        return NormativeStatus.NOT_EVALUATED
    return NormativeStatus.NOT_COMPUTED


def _target_id(proof: ProofDocument) -> str:
    header = proof.header
    if header.target_id:
        return header.target_id
    if header.fault_location:
        return header.fault_location
    return "—"


def _liczba(value: ProofValue | None) -> float | None:
    """Wartość dowodu jako liczba rzeczywista; brak wartości, tekst albo liczba zespolona —
    ``None`` (reguła progowa porównuje wyłącznie wielkość rzeczywistą)."""
    if value is None or not isinstance(value.value, int | float):
        return None
    return float(value.value)


def _wartosc_obserwowana(value: float | complex | str) -> float | str:
    """Wartość obserwowana pozycji: liczba zespolona dowodu zapisana tekstem (pole pozycji
    i zapis JSON nie niosą liczb zespolonych)."""
    return str(value) if isinstance(value, complex) else value


def _rule_key(rule: NormativeRule) -> str:
    if isinstance(rule.key, tuple):
        return ",".join(rule.key)
    return rule.key
