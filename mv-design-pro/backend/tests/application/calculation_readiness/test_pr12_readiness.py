"""Testy PR-12 — CalculationReadinessService + ValidationProblemService + ReportReadinessAdapter."""

from __future__ import annotations

from src.application.calculation_readiness.service import (
    CALCULATION_LABEL_PL,
    CalculationReadinessService,
)
from src.application.report_readiness.adapter import ReportReadinessAdapter
from src.application.validation_problem.service import ValidationProblemService
from src.enm.models import (
    Bay,
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMHeader,
    Generator,
    Load,
    Source,
    Substation,
    Transformer,
)


def _header() -> ENMHeader:
    return ENMHeader(name="test")


def _empty_enm() -> EnergyNetworkModel:
    return EnergyNetworkModel(header=_header())


def _minimal_enm_with_pf_data() -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=_header(),
        buses=[
            Bus(ref_id="bus_sn", name="Szyna SN", voltage_kv=15.0),
            Bus(ref_id="bus_lv", name="Szyna nN", voltage_kv=0.4),
        ],
        sources=[
            Source(
                ref_id="src_1",
                name="Źródło GPZ",
                bus_ref="bus_sn",
                model="external_grid",
                sk3_mva=500.0,
            ),
        ],
        loads=[
            Load(
                ref_id="load_1",
                name="Odbiór 1",
                bus_ref="bus_lv",
                p_mw=0.5,
                q_mvar=0.2,
            ),
        ],
        branches=[
            Cable(
                ref_id="cab_1",
                name="Kabel SN F-01",
                from_bus_ref="bus_sn",
                to_bus_ref="bus_lv",
                length_km=2.5,
                r_ohm_per_km=0.16,
                x_ohm_per_km=0.10,
            ),
        ],
        transformers=[
            Transformer(
                ref_id="tr_1",
                name="TR1",
                hv_bus_ref="bus_sn",
                lv_bus_ref="bus_lv",
                sn_mva=0.4,
                uhv_kv=15.0,
                ulv_kv=0.4,
                uk_percent=4.0,
                pk_kw=10.0,
                vector_group="Dyn5",
            ),
        ],
    )


# ---------------------------------------------------------------------------
# CalculationReadinessService
# ---------------------------------------------------------------------------


class TestCalculationReadinessService:
    def test_empty_enm_blocks_power_flow(self) -> None:
        svc = CalculationReadinessService()
        report = svc.evaluate(_empty_enm())
        pf = report.get("power_flow")
        assert pf is not None
        assert pf.status == "blocked"
        assert any("źródło" in m for m in pf.missing_fields_pl)

    def test_minimal_enm_power_flow_ready(self) -> None:
        svc = CalculationReadinessService()
        report = svc.evaluate(_minimal_enm_with_pf_data())
        pf = report.get("power_flow")
        assert pf is not None
        assert pf.status == "ready"

    def test_short_circuit_partial_when_missing_uk(self) -> None:
        enm = _minimal_enm_with_pf_data()
        # Wyzeruj uk_percent
        enm.transformers[0].uk_percent = 0.0
        svc = CalculationReadinessService()
        sc = svc.evaluate_single(enm, "short_circuit")
        assert sc.status in ("partial", "blocked")
        assert any("u_k" in m for m in sc.missing_fields_pl)

    def test_stability_no_module_with_der(self) -> None:
        enm = _minimal_enm_with_pf_data()
        enm.generators.append(
            Generator(
                ref_id="pv_1",
                name="PV-01",
                bus_ref="bus_lv",
                gen_type="pv_inverter",
                p_mw=2.0,
            ),
        )
        svc = CalculationReadinessService()
        stab = svc.evaluate_single(enm, "stability")
        assert stab.status == "no_module"
        assert "RMS" in (stab.no_module_reason_pl or "")

    def test_stability_n_a_without_der(self) -> None:
        enm = _minimal_enm_with_pf_data()
        svc = CalculationReadinessService()
        stab = svc.evaluate_single(enm, "stability")
        assert stab.status == "n_a"

    def test_frt_hvrt_no_module_with_der(self) -> None:
        enm = _minimal_enm_with_pf_data()
        enm.generators.append(
            Generator(
                ref_id="bess_1",
                name="BESS-01",
                bus_ref="bus_lv",
                gen_type="bess",
                p_mw=1.0,
            ),
        )
        svc = CalculationReadinessService()
        frt = svc.evaluate_single(enm, "frt_hvrt")
        assert frt.status == "no_module"

    def test_ncrfg_no_module_with_der(self) -> None:
        enm = _minimal_enm_with_pf_data()
        enm.generators.append(
            Generator(
                ref_id="fw_1",
                name="FW-01",
                bus_ref="bus_sn",
                gen_type="fw_pmsg",
                p_mw=10.0,
            ),
        )
        svc = CalculationReadinessService()
        ncrfg = svc.evaluate_single(enm, "ncrfg_compliance")
        assert ncrfg.status == "no_module"
        assert "operatorów" in (ncrfg.no_module_reason_pl or "")

    def test_evaluate_returns_10_items(self) -> None:
        svc = CalculationReadinessService()
        report = svc.evaluate(_minimal_enm_with_pf_data())
        assert len(report.items) == 10
        types = [i.calculation_type for i in report.items]
        assert "power_flow" in types
        assert "short_circuit" in types
        assert "stability" in types
        assert "frt_hvrt" in types
        assert "ncrfg_compliance" in types
        assert "report_osd" in types
        assert "report_technical" in types

    def test_overall_status_blocked_when_any_blocked(self) -> None:
        svc = CalculationReadinessService()
        report = svc.evaluate(_empty_enm())
        assert report.overall_status() == "blocked"

    def test_overall_status_partial_or_blocked_for_minimal(self) -> None:
        """Minimal ENM ma kompletny power_flow ale brak r0/x0 (asymmetry partial)
        i brak rating na kabel (loadability blocked) — overall = partial/blocked."""
        svc = CalculationReadinessService()
        report = svc.evaluate(_minimal_enm_with_pf_data())
        pf = report.get("power_flow")
        sc = report.get("short_circuit")
        assert pf is not None and pf.status == "ready"
        assert sc is not None and sc.status == "ready"
        # Zawsze pojawi się jakiś partial/blocked, więc overall ≠ ready
        overall = report.overall_status()
        assert overall in ("partial", "blocked")

    def test_calculation_label_pl_for_all_types(self) -> None:
        for calc_type, label in CALCULATION_LABEL_PL.items():
            assert label  # niepusta etykieta
            # Brak zakazanych tokenów
            for forbidden in ["snapshot", "case", "run", "wizard", "legacy", "fallback"]:
                assert forbidden.lower() not in label.lower()


# ---------------------------------------------------------------------------
# ValidationProblemService
# ---------------------------------------------------------------------------


class TestValidationProblemService:
    def test_bay_without_ports_emits_error(self) -> None:
        enm = EnergyNetworkModel(
            header=_header(),
            substations=[Substation(ref_id="sub_1", name="GPZ", station_type="gpz")],
            bays=[
                Bay(
                    ref_id="bay_no_ports",
                    name="Pole bez portów",
                    bay_role="IN",
                    substation_ref="sub_1",
                    bus_ref="bus_1",
                    # ports=[] — brak portów
                ),
            ],
        )
        svc = ValidationProblemService()
        report = svc.collect_problems(enm)
        bay_problems = [p for p in report.problems if "bay_no_ports" in p.problem_id]
        assert len(bay_problems) >= 1
        assert bay_problems[0].severity == "error"
        assert "fix_actions" in bay_problems[0].model_dump() or bay_problems[0].fix_actions

    def test_endpoint_missing_emits_warning(self) -> None:
        enm = _minimal_enm_with_pf_data()
        # Cable without endpoint_a_port (default)
        svc = ValidationProblemService()
        report = svc.collect_problems(enm)
        endpoint_problems = [
            p for p in report.problems if p.problem_id.startswith("endpoint_missing")
        ]
        assert len(endpoint_problems) >= 1
        assert endpoint_problems[0].severity == "warning"

    def test_report_aggregates_severity_counts(self) -> None:
        enm = _empty_enm()
        svc = ValidationProblemService()
        report = svc.collect_problems(enm)
        # Pusty ENM ma blocked PF → readiness errors
        total = report.error_count + report.warning_count + report.info_count
        assert total >= 0
        assert report.is_blocking == (report.error_count > 0)


# ---------------------------------------------------------------------------
# ReportReadinessAdapter
# ---------------------------------------------------------------------------


class TestReportReadinessAdapter:
    def test_osd_report_blocked_for_empty_enm(self) -> None:
        adapter = ReportReadinessAdapter()
        status = adapter.is_ready_for_osd_report(_empty_enm())
        assert status.can_generate is False
        assert status.status_pl in ("zablokowany", "wynik częściowy")

    def test_technical_report_blocked_for_empty_enm(self) -> None:
        adapter = ReportReadinessAdapter()
        status = adapter.is_ready_for_technical_report(_empty_enm())
        assert status.can_generate is False

    def test_osd_report_ready_for_minimal_enm(self) -> None:
        adapter = ReportReadinessAdapter()
        status = adapter.is_ready_for_osd_report(_minimal_enm_with_pf_data())
        # Minimal może być ready lub partial w zależności od asymmetry
        assert status.status_pl in ("gotowe", "wynik częściowy")

    def test_does_not_fabricate_results(self) -> None:
        """KLUCZOWY INWARIANT: ReportReadinessAdapter NIE generuje fałszywych raportów."""
        adapter = ReportReadinessAdapter()
        status = adapter.is_ready_for_osd_report(_empty_enm())
        # Adapter zwraca STATUS, NIE raport. can_generate=False przy braku danych.
        assert hasattr(status, "can_generate")
        assert hasattr(status, "missing_data_pl")
        assert hasattr(status, "blocking_objects")
        # Nie ma żadnego pola "report_content" ani "fake_results"
        fields = set(status.model_dump().keys())
        for forbidden_field in ("report_content", "fake_results", "fabricated"):
            assert forbidden_field not in fields
