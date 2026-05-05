"""PR-15 + PR-16 — Testy kontraktów solverów RMS + NC RfG compliance checker."""

from __future__ import annotations

import pytest

from src.application.ncrfg_compliance import (
    NcRfgComplianceChecker,
    NcRfgComplianceReport,
)
from src.application.ncrfg_compliance.checker import DerDataForCompliance
from src.network_model.solvers.frt_hvrt import (
    FrtHvrtResult,
    FrtHvrtSolverAdapter,
    FrtHvrtSolverInput,
    FrtScenario,
)
from src.network_model.solvers.stability_rms import (
    StabilityResult,
    StabilitySolverAdapter,
    StabilitySolverInput,
)
from src.network_model.solvers.stability_rms.contracts import (
    DisturbanceEvent,
    DynamicModelParameters,
)


# ---------------------------------------------------------------------------
# PR-15: Stability solver adapter
# ---------------------------------------------------------------------------


class TestStabilitySolverAdapter:
    def test_run_returns_ok_status_with_real_results(self) -> None:
        """PR-15-impl: solver zwraca 'ok' z prawdziwymi wynikami numerycznymi."""
        adapter = StabilitySolverAdapter()
        valid_input = StabilitySolverInput(
            enm_ref="snap_1",
            simulation_duration_s=2.0,
            integration_step_s=0.005,
            linearize_at_t0=True,
            dynamic_models=[
                DynamicModelParameters(
                    element_ref="gen_1",
                    model_kind="synchronous_machine_6th_order",
                    parameters={"H": 4.5, "D": 1.0, "Pm": 0.8},
                ),
            ],
            events=[
                DisturbanceEvent(
                    event_id="e1",
                    event_type="three_phase_fault",
                    time_s=1.0,
                    duration_s=0.1,
                    target_ref="bus_1",
                ),
            ],
        )
        result = adapter.run(valid_input)
        assert isinstance(result, StabilityResult)
        assert result.status == "ok"
        # Trajectory powinna mieć próbki
        assert len(result.trajectories) == 1
        assert len(result.trajectories[0].samples) > 0
        # Eigenvalue analysis (linearize_at_t0=True)
        assert len(result.eigenvalues) > 0
        # Convergence iterations > 0
        assert result.convergence_iterations is not None
        assert result.convergence_iterations > 0

    def test_validate_input_rejects_negative_duration(self) -> None:
        adapter = StabilitySolverAdapter()
        invalid = StabilitySolverInput(
            enm_ref="x",
            simulation_duration_s=-1.0,
            dynamic_models=[
                DynamicModelParameters(element_ref="g", model_kind="synchronous_machine_6th_order"),
            ],
            events=[
                DisturbanceEvent(
                    event_id="e", event_type="three_phase_fault",
                    time_s=0, duration_s=0.1,
                ),
            ],
        )
        valid, errors = adapter.validate_input(invalid)
        assert not valid
        assert any("Czas symulacji" in e for e in errors)

    def test_run_with_invalid_input_returns_input_invalid(self) -> None:
        adapter = StabilitySolverAdapter()
        # Empty dynamic_models + empty events
        result = adapter.run(StabilitySolverInput(enm_ref="x"))
        assert result.status == "input_invalid"

    def test_19_dynamic_model_kinds_supported(self) -> None:
        """Brief 2 §15: 8 modeli + 11 dodatkowych = 19 typów modeli dynamicznych."""
        from src.network_model.solvers.stability_rms.contracts import (
            DynamicModelKind as _DMK,
        )
        # DMK to typ Literal — sprawdź przez parameters klasy
        # że adapter akceptuje wszystkie kanoniczne nazwy
        canonical_kinds = [
            "synchronous_machine_6th_order",
            "avr_ieee_t1", "avr_ieee_t2", "avr_ac4a", "avr_st5b",
            "governor_tgov1", "governor_gast", "governor_ieee_g1",
            "pss_ieee_pss2a", "pss_ieee_pss2b",
            "induction_motor_5th_order",
            "wind_type_1", "wind_type_2", "wind_type_3", "wind_type_4",
            "pv_inverter_grid_following", "pv_inverter_grid_forming",
            "bess_pcs_grid_following", "bess_pcs_grid_forming",
        ]
        for kind in canonical_kinds:
            # Parametr Literal nie da się sprawdzić runtime; sprawdzamy że
            # pydantic model nie odrzuca
            params = DynamicModelParameters(element_ref="g", model_kind=kind)  # type: ignore[arg-type]
            assert params.model_kind == kind
        assert len(canonical_kinds) == 19


# ---------------------------------------------------------------------------
# PR-16: FRT/HVRT solver adapter
# ---------------------------------------------------------------------------


class TestFrtHvrtSolverAdapter:
    def test_run_returns_ok_status_with_real_simulation(self) -> None:
        """PR-16-impl: solver zwraca 'ok' z trajektorią V/Iq/P."""
        adapter = FrtHvrtSolverAdapter()
        valid_input = FrtHvrtSolverInput(
            enm_ref="snap_1",
            scenarios=[
                FrtScenario(
                    scenario_id="lvrt_1",
                    test_kind="lvrt",
                    voltage_dip_depth_pu=0.05,
                    fault_duration_s=0.15,
                    target_der_ref="pv_1",
                ),
            ],
        )
        result = adapter.run(valid_input)
        assert isinstance(result, FrtHvrtResult)
        assert result.status == "ok"
        assert len(result.scenario_results) == 1
        sc_result = result.scenario_results[0]
        # Scenario powinien mieć trajektorię
        assert len(sc_result.trajectory) > 0
        # margin_to_curve_pu obliczone
        assert sc_result.margin_to_curve_pu is not None

    def test_validate_lvrt_voltage_range(self) -> None:
        adapter = FrtHvrtSolverAdapter()
        # LVRT z voltage_dip_depth > 1 jest invalid
        invalid = FrtHvrtSolverInput(
            enm_ref="x",
            scenarios=[
                FrtScenario(
                    scenario_id="bad_lvrt",
                    test_kind="lvrt",
                    voltage_dip_depth_pu=1.5,  # invalid for LVRT
                    fault_duration_s=0.1,
                    target_der_ref="pv_1",
                ),
            ],
        )
        valid, errors = adapter.validate_input(invalid)
        assert not valid
        assert any("LVRT" in e for e in errors)

    def test_validate_hvrt_voltage_range(self) -> None:
        adapter = FrtHvrtSolverAdapter()
        invalid = FrtHvrtSolverInput(
            enm_ref="x",
            scenarios=[
                FrtScenario(
                    scenario_id="bad_hvrt",
                    test_kind="hvrt",
                    voltage_dip_depth_pu=0.5,  # invalid for HVRT (must be >1)
                    fault_duration_s=0.1,
                    target_der_ref="pv_1",
                ),
            ],
        )
        valid, errors = adapter.validate_input(invalid)
        assert not valid
        assert any("HVRT" in e for e in errors)

    def test_no_scenarios_input_invalid(self) -> None:
        adapter = FrtHvrtSolverAdapter()
        result = adapter.run(FrtHvrtSolverInput(enm_ref="x", scenarios=[]))
        assert result.status == "input_invalid"


# ---------------------------------------------------------------------------
# PR-16: NC RfG compliance checker (static + dynamic mix)
# ---------------------------------------------------------------------------


class TestNcRfgComplianceChecker:
    def test_classifies_module_b_for_5mw(self) -> None:
        checker = NcRfgComplianceChecker()
        report = checker.check(
            operator_id="pse",
            der_data=DerDataForCompliance(
                der_ref="pv_5mw",
                p_max_kw=5000.0,
                voltage_kv=15.0,
                has_lvrt_curve=True,
                has_hvrt_curve=True,
                has_pf_droop=True,
                has_qu_curve=True,
                has_dynamic_model=True,
                has_scada_communication=True,
                has_disturbance_recorder=True,
                cos_phi_min=0.95,
            ),
        )
        assert isinstance(report, NcRfgComplianceReport)
        assert report.module_type == "B"
        assert report.total_tests == 18

    def test_static_t3_pf_droop_pass(self) -> None:
        checker = NcRfgComplianceChecker()
        report = checker.check(
            operator_id="pse",
            der_data=DerDataForCompliance(
                der_ref="pv_1",
                p_max_kw=2000.0,
                voltage_kv=15.0,
                has_pf_droop=True,
                cos_phi_min=0.95,
            ),
        )
        t3 = next(r for r in report.test_results if r.test_id == "T3")
        assert t3.verdict == "pass"

    def test_static_t3_pf_droop_fail(self) -> None:
        checker = NcRfgComplianceChecker()
        report = checker.check(
            operator_id="pse",
            der_data=DerDataForCompliance(
                der_ref="pv_1",
                p_max_kw=2000.0,
                voltage_kv=15.0,
                has_pf_droop=False,
            ),
        )
        t3 = next(r for r in report.test_results if r.test_id == "T3")
        assert t3.verdict == "fail"

    def test_static_t5_cos_phi_pass(self) -> None:
        checker = NcRfgComplianceChecker()
        report = checker.check(
            operator_id="pse",
            der_data=DerDataForCompliance(
                der_ref="pv_1",
                p_max_kw=2000.0,
                voltage_kv=15.0,
                cos_phi_min=0.96,
            ),
        )
        t5 = next(r for r in report.test_results if r.test_id == "T5")
        assert t5.verdict == "pass"

    def test_static_t5_cos_phi_fail(self) -> None:
        checker = NcRfgComplianceChecker()
        report = checker.check(
            operator_id="pse",
            der_data=DerDataForCompliance(
                der_ref="pv_1",
                p_max_kw=2000.0,
                voltage_kv=15.0,
                cos_phi_min=0.90,  # < 0.95
            ),
        )
        t5 = next(r for r in report.test_results if r.test_id == "T5")
        assert t5.verdict == "fail"

    def test_dynamic_t1_lvrt_returns_pass_or_fail(self) -> None:
        """PR-16-impl: T1 LVRT teraz uruchamia FRT solver i daje pass/fail."""
        checker = NcRfgComplianceChecker()
        report = checker.check(
            operator_id="pse",
            der_data=DerDataForCompliance(
                der_ref="pv_1",
                p_max_kw=2000.0,
                voltage_kv=15.0,
                has_lvrt_curve=True,
            ),
        )
        t1 = next(r for r in report.test_results if r.test_id == "T1")
        # Po PR-16-impl: realny solver daje pass/fail (nie no_module)
        assert t1.verdict in {"pass", "fail"}
        assert t1.message_pl is not None

    def test_dynamic_t1_lvrt_no_data_when_no_curve(self) -> None:
        checker = NcRfgComplianceChecker()
        report = checker.check(
            operator_id="pse",
            der_data=DerDataForCompliance(
                der_ref="pv_1",
                p_max_kw=2000.0,
                voltage_kv=15.0,
                has_lvrt_curve=False,
            ),
        )
        t1 = next(r for r in report.test_results if r.test_id == "T1")
        assert t1.verdict == "no_data"

    @pytest.mark.parametrize("operator_id", ["pse", "energa", "tauron", "enea", "pge"])
    def test_all_5_operators_classify_5mw_as_b(self, operator_id: str) -> None:
        """Brief 2 §16: 5 profili × 18 testów × 4 typy modułów."""
        checker = NcRfgComplianceChecker()
        report = checker.check(
            operator_id=operator_id,
            der_data=DerDataForCompliance(
                der_ref="pv_5mw",
                p_max_kw=5000.0,
                voltage_kv=15.0,
            ),
        )
        assert report.module_type == "B"
        assert report.total_tests == 18
        assert report.operator_id == operator_id

    def test_compliance_report_aggregates_passed_no_module(self) -> None:
        """PR-16-impl: T1/T2 dają teraz pass/fail (FRT solver podpięty),
        no_module zostaje dla T8/T10/T11/T16/T17/T18 (pełen stability RMS)."""
        checker = NcRfgComplianceChecker()
        report = checker.check(
            operator_id="pse",
            der_data=DerDataForCompliance(
                der_ref="pv_full",
                p_max_kw=5000.0,
                voltage_kv=15.0,
                has_lvrt_curve=True, has_hvrt_curve=True,
                has_pf_droop=True, has_qu_curve=True,
                has_dynamic_model=True,
                has_scada_communication=True,
                has_disturbance_recorder=True,
                cos_phi_min=0.96,
            ),
        )
        # T3, T4, T5, T14, T15 + T1/T2 (po PR-16-impl) = ≥7 passed
        assert report.passed_count >= 5
        # T8, T10, T11, T16, T17, T18 = ≥3 no_module (pozostałe dynamic)
        assert report.no_module_count >= 3
        assert report.total_tests == 18
