from __future__ import annotations

from datetime import datetime
from uuid import UUID

import pytest
from analysis.normative.evaluator import NormativeEvaluator
from analysis.normative.models import NormativeConfig, NormativeReport
from analysis.protection_insight.models import (
    ProtectionInsightContext,
    ProtectionInsightItem,
    ProtectionInsightSummary,
    ProtectionInsightView,
    ProtectionSelectivityStatus,
)
from analysis.sensitivity.builder import SensitivityBuilder
from analysis.sensitivity.models import SensitivityDecision
from analysis.voltage_profile.builder import wiersz_profilu
from analysis.voltage_profile.models import (
    VoltageProfileContext,
    VoltageProfileSummary,
    VoltageProfileView,
)
from application.proof_engine.types import (
    ProofDocument,
    ProofHeader,
    ProofSummary,
    ProofType,
    ProofValue,
)

RUN_TS = datetime(2024, 2, 1, 12, 0, 0)


def _proof(target_id: str, key_results: dict[str, ProofValue], n: int) -> ProofDocument:
    return ProofDocument(
        document_id=UUID(int=n),
        artifact_id=UUID(int=1000 + n),
        created_at=RUN_TS,
        proof_type=ProofType.LOAD_CURRENTS_OVERLOAD,
        title_pl="Obciążenia",
        header=ProofHeader(
            project_name="Proj",
            case_name="Case",
            run_timestamp=RUN_TS,
            solver_version="test",
            target_id=target_id,
        ),
        steps=(),
        summary=ProofSummary(
            key_results=key_results, unit_check_passed=True, total_steps=0, warnings=()
        ),
    )


def _normative_report() -> NormativeReport:
    # Raport z prawdziwego ewaluatora (pozycje niosą rekordy K, kody są ich projekcją).
    return NormativeEvaluator().evaluate(
        [
            _proof(
                "LINE-1", {"k_i_percent": ProofValue.create("k_I", 90.0, "%", "k_i_percent")}, 1
            ),
            _proof("TR-1", {"k_s_percent": ProofValue.create("k_S", 70.0, "%", "k_s_percent")}, 2),
        ],
        NormativeConfig(),
    )


def _voltage_profile() -> VoltageProfileView:
    context = VoltageProfileContext(
        project_name="Proj",
        case_name="Case",
        run_timestamp=RUN_TS,
        snapshot_id="snap-1",
        trace_id="trace-1",
    )
    rows = (
        wiersz_profilu(
            bus_id="B1",
            bus_name="Bus 1",
            u_nom_kv=20.0,
            u_kv=18.6,
            u_pu=0.93,
            config=NormativeConfig(),
            p_mw=None,
            q_mvar=None,
            case_name="Case",
            run_timestamp=RUN_TS,
        ),
    )
    summary = VoltageProfileSummary(
        worst_bus_id="B1",
        worst_delta_pct_abs=7.0,
        pass_count=0,
        warning_count=1,
        fail_count=0,
        not_computed_count=0,
    )
    return VoltageProfileView(
        context=context,
        thresholds={"voltage_warn_pct": 5.0, "voltage_fail_pct": 10.0},
        rows=rows,
        summary=summary,
    )


def _protection_insight() -> ProtectionInsightView:
    context = ProtectionInsightContext(
        project_name="Proj",
        case_name="Case",
        run_timestamp=RUN_TS,
        snapshot_id="snap-1",
        trace_id="trace-1",
    )
    items = (
        ProtectionInsightItem(
            rule_id="NR_P18_004",
            primary_device_id="CB-01",
            backup_device_id=None,
            ikss_ka=10.0,
            ip_ka=12.0,
            ith_ka2s=100.0,
            icu_ka=12.0,
            idyn_ka=15.0,
            ith_limit_ka2s=120.0,
            breaking_margin_pct=16.6667,
            dynamic_margin_pct=20.0,
            thermal_margin_pct=16.6667,
            selectivity_status=ProtectionSelectivityStatus.OK,
            why_pl="OK",
        ),
    )
    summary = ProtectionInsightSummary(
        count_ok=1,
        count_warning=0,
        count_fail=0,
        count_not_evaluated=0,
    )
    return ProtectionInsightView(context=context, items=items, summary=summary)


def test_sensitivity_ranking_stable() -> None:
    builder = SensitivityBuilder(delta_pct=10.0, top_n=2)
    view_a = builder.build(
        proofs=[],
        normative_report=_normative_report(),
        voltage_profile=_voltage_profile(),
        protection_insight=_protection_insight(),
        protection_curves_it=None,
    )
    view_b = builder.build(
        proofs=[],
        normative_report=_normative_report(),
        voltage_profile=_voltage_profile(),
        protection_insight=_protection_insight(),
        protection_curves_it=None,
    )

    assert view_a.to_dict() == view_b.to_dict()

    top_ids = [driver.target_id for driver in view_a.top_drivers]
    assert top_ids[0] == "CB-01"


def test_sensitivity_margin_math_short_circuit() -> None:
    builder = SensitivityBuilder(delta_pct=10.0, top_n=1)
    view = builder.build(
        proofs=[],
        normative_report=None,
        voltage_profile=None,
        protection_insight=_protection_insight(),
        protection_curves_it=None,
    )

    entry = next(e for e in view.entries if e.parameter_id == "short_circuit_level")

    assert round(entry.base_margin or 0.0, 4) == round(16.6667, 4)
    assert round(entry.plus.margin or 0.0, 4) == round(8.3333, 4)


def test_sensitivity_not_computed_propagation() -> None:
    report = NormativeEvaluator().evaluate([_proof("LINE-2", {}, 3)], NormativeConfig())

    view = SensitivityBuilder(delta_pct=5.0, top_n=1).build(
        proofs=[],
        normative_report=report,
        voltage_profile=None,
        protection_insight=None,
        protection_curves_it=None,
    )

    # Dowód bez wielkości kluczowych: obie reguły obciążenia nie wyznaczone — oba wpisy
    # nierozstrzygnięte (rekord NIE_OCENIONO), nigdy spełnione.
    assert len(view.entries) == 2
    for entry in view.entries:
        assert entry.base_decision == SensitivityDecision.NOT_COMPUTED
        assert entry.ocena.status_maszynowy == "NIE_OCENIONO"
    assert view.summary.not_computed_count == 2


@pytest.mark.parametrize("warn,fail", [(5.0, 10.0), (3.0, 6.0)])
def test_zapas_napieciowy_bez_skoku_na_progu_przekroczenia(warn: float, fail: float) -> None:
    """Iloczyn: progi × |ΔU| wokół progu ostrzeżenia i przekroczenia (w tym równość). Zapas
    nieujemny (spełnienie) wtedy i tylko wtedy, gdy |ΔU| nie przekracza progu ostrzeżenia; na
    samym progu przekroczenia zapas liczony jest do progu ostrzeżenia (równość progu nie jest
    przekroczeniem) — dawne ``>=`` dawało tam zapas zerowy, czyli spełnienie, choć tuż poniżej
    zapas był ujemny."""
    from analysis.sensitivity.builder import _voltage_margin

    siatka = [0.0, warn - 0.01, warn, warn + 0.01, fail - 0.01, fail, fail + 0.01, 2 * fail]
    for d in siatka:
        z = _voltage_margin(d, warn, fail)
        assert (z >= 0) == (d <= warn), (d, z)
    assert _voltage_margin(fail, warn, fail) == pytest.approx(warn - fail)
    assert _voltage_margin(fail + 0.5, warn, fail) == pytest.approx(-0.5)
