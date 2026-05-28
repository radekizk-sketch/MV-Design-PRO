from __future__ import annotations

from network_model.solvers.ncrfg_ptpiree import (
    NcRfgPtpireeModuleInput,
    NcRfgPtpireeRunRequest,
    NcRfgPtpireeSolver,
)


def _complete_module() -> NcRfgPtpireeModuleInput:
    return NcRfgPtpireeModuleInput(
        der_ref="pv-1",
        der_name="PV 2 MW",
        der_kind="PV",
        operator_id="enea",
        p_max_kw=2000.0,
        p_min_kw=100.0,
        voltage_kv=15.0,
        certificate_status="ptpiree_verified",
        has_lvrt_curve=True,
        has_hvrt_curve=True,
        has_pf_droop=True,
        has_qu_curve=True,
        has_dynamic_model=True,
        has_scada_communication=True,
        has_disturbance_recorder=True,
        active_power_control_enabled=True,
        stop_generation_enabled=True,
        reduction_generation_enabled=True,
        droop_percent=5.0,
        dead_band_hz=0.2,
        ramp_rate_pct_per_min=10.0,
        cos_phi_min=0.95,
        q_range_pct_pn_min=-0.33,
        q_range_pct_pn_max=0.33,
        reactive_current_gain=2.0,
        p_recovery_time_s=0.8,
        harmonic_thdu_percent=3.0,
    )


def test_ncrfg_ptpiree_solver_runs_full_required_pack_with_trace() -> None:
    solver = NcRfgPtpireeSolver()

    result = solver.run(NcRfgPtpireeRunRequest(modules=[_complete_module()]))

    module = result.modules[0]
    assert result.contract == "NcRfgPtpireeTestResultV1"
    assert result.deterministic_hash
    assert module.module_type == "B"
    assert module.required_count > 0
    assert module.fail_count == 0
    assert module.no_data_count == 0
    assert module.overall_status == "zgodny"
    assert len(module.tests) == 20
    assert result.white_box_trace
    assert all(step.proof_ref for step in result.white_box_trace)
    assert "Raport symulacyjny NC RfG / PTPiREE" in result.report_pl


def test_ncrfg_ptpiree_solver_is_deterministic() -> None:
    solver = NcRfgPtpireeSolver()
    request = NcRfgPtpireeRunRequest(modules=[_complete_module()])

    first = solver.run(request)
    second = solver.run(request)

    assert first.deterministic_hash == second.deterministic_hash
    assert first.white_box_trace == second.white_box_trace


def test_ncrfg_ptpiree_solver_reports_missing_catalog_data_without_fake_pass() -> None:
    solver = NcRfgPtpireeSolver()
    incomplete = NcRfgPtpireeModuleInput(
        der_ref="pv-missing",
        der_kind="PV",
        operator_id="enea",
        p_max_kw=2500.0,
        voltage_kv=15.0,
        certificate_status="none",
    )

    result = solver.run(NcRfgPtpireeRunRequest(modules=[incomplete]))

    module = result.modules[0]
    assert module.overall_status == "brak_danych"
    assert module.no_data_count > 0
    assert any(test.verdict == "no_data" for test in module.tests if test.required)
    assert any(test.fix_actions for test in module.tests if test.required)
