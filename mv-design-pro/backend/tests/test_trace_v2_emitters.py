"""
Tests for Trace v2 emitters — PR-35, PR-36, PR-36B.

Tests:
- SC emitter: golden trace, signature determinism, outputs match ResultSet v1
- Protection emitter: golden traces (SI/VI/EI), determinism
- Load Flow emitter: golden trace, determinism
"""

from __future__ import annotations

import math

from application.trace_emitters.deterministic_ids import deterministic_trace_id
from application.trace_emitters.load_flow_emitter import TraceEmitterLoadFlow
from application.trace_emitters.protection_emitter import TraceEmitterProtection
from application.trace_emitters.sc_emitter import TraceEmitterSC
from domain.trace_v2.artifact import AnalysisTypeV2

# ===========================================================================
# SC Emitter Tests
# ===========================================================================


def _sc_result_dict() -> dict:
    """Minimal SC result dict for testing."""
    return {
        "short_circuit_type": "THREE_PHASE",
        "fault_node_id": "bus_01",
        "c_factor": 1.1,
        "un_v": 20000.0,
        "zkk_ohm": "1.5+j3.2",
        "rx_ratio": 0.46875,
        "kappa": 1.72,
        "tk_s": 1.0,
        "tb_s": 0.1,
        "ikss_a": 3500.0,
        "ip_a": 8519.0,
        "ith_a": 3500.0,
        "ib_a": 3550.0,
        "sk_mva": 121.24,
        "ik_thevenin_a": 3500.0,
        "ik_inverters_a": 0.0,
        "ik_total_a": 3500.0,
        "contributions": [],
        "branch_contributions": [],
        "white_box_trace": [
            {
                "key": "Zk",
                "title": "Impedancja zastępcza w punkcie zwarcia",
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                    "z1_ohm": "1.5+j3.2",
                    "z2_ohm": "1.5+j3.2",
                    "fault_node_id": "bus_01",
                    "short_circuit_type": "THREE_PHASE",
                },
                "substitution": "1.5+j3.2",
                "result": {"z_equiv_ohm": "1.5+j3.2"},
            },
            {
                "key": "Ikss",
                "title": "Prąd zwarciowy początkowy symetryczny",
                "formula_latex": "I_{k}'' = (c * U_n * k_U) / |Z_k|",
                "inputs": {
                    "c_factor": 1.1,
                    "un_v": 20000.0,
                    "voltage_factor": 1.0,
                    "z_equiv_abs_ohm": 3.534,
                },
                "substitution": "(1.1 * 20000 * 1.0) / 3.534",
                "result": {"ikss_a": 3500.0},
            },
            {
                "key": "kappa",
                "title": "Współczynnik udaru",
                "formula_latex": "kappa = 1.02 + 0.98 * e^{-3 R/X}",
                "inputs": {"r_ohm": 1.5, "x_ohm": 3.2, "rx_ratio": 0.46875},
                "substitution": "1.02 + 0.98 * exp(-3 * 0.46875)",
                "result": {"kappa": 1.72},
            },
            {
                "key": "Ip",
                "title": "Prąd udarowy",
                "formula_latex": "I_p = kappa * sqrt(2) * I_k''",
                "inputs": {"kappa": 1.72, "ikss_a": 3500.0},
                "substitution": "1.72 * sqrt(2) * 3500",
                "result": {"ip_a": 8519.0},
            },
            {
                "key": "Ib",
                "title": "Prąd zwarciowy do obliczeń cieplnych",
                "formula_latex": "I_b = ...",
                "inputs": {
                    "ikss_a": 3500.0,
                    "kappa": 1.72,
                    "tb_s": 0.1,
                    "ta_s": 0.02,
                    "exp_factor": 0.006,
                },
                "substitution": "3500 * sqrt(1 + ((1.72-1)*0.006)^2)",
                "result": {"ib_a": 3550.0},
            },
            {
                "key": "Ith",
                "title": "Prąd zastępczy cieplny",
                "formula_latex": "I_th = I_k'' * sqrt(t_k)",
                "inputs": {"ikss_a": 3500.0, "tk_s": 1.0},
                "substitution": "3500 * sqrt(1.0)",
                "result": {"ith_a": 3500.0},
            },
            {
                "key": "Sk",
                "title": "Moc zwarciowa",
                "formula_latex": "S_k = sqrt(3) * U_n * I_k'' / 1e6",
                "inputs": {"un_v": 20000.0, "ikss_a": 3500.0},
                "substitution": "sqrt(3) * 20000 * 3500 / 1e6",
                "result": {"sk_mva": 121.24},
            },
        ],
    }


class TestTraceEmitterSC:
    def test_emit_produces_artifact(self) -> None:
        emitter = TraceEmitterSC()
        artifact = emitter.emit(
            snapshot_hash="snap123",
            analysis_input={"fault_node_id": "bus_01", "sc_type": "3F"},
            sc_result_dict=_sc_result_dict(),
        )
        assert artifact.analysis_type == AnalysisTypeV2.SC
        assert artifact.math_spec_version == "1.0.0"
        assert artifact.trace_signature != ""

    def test_7_solver_steps_plus_idyn(self) -> None:
        emitter = TraceEmitterSC()
        artifact = emitter.emit(
            snapshot_hash="snap123",
            analysis_input={"fault_node_id": "bus_01"},
            sc_result_dict=_sc_result_dict(),
        )
        # 7 solver steps + 1 I_dyn adapter step
        assert len(artifact.equation_steps) == 8

    def test_idyn_always_present(self) -> None:
        emitter = TraceEmitterSC()
        artifact = emitter.emit(
            snapshot_hash="snap123",
            analysis_input={"fault_node_id": "bus_01"},
            sc_result_dict=_sc_result_dict(),
        )
        step_ids = [s.step_id for s in artifact.equation_steps]
        assert "SC_IDYN_008" in step_ids

        idyn_step = [s for s in artifact.equation_steps if s.step_id == "SC_IDYN_008"][0]
        assert idyn_step.origin == "adapter"
        assert idyn_step.derived_in_adapter is True

    def test_ith_present_in_outputs(self) -> None:
        emitter = TraceEmitterSC()
        artifact = emitter.emit(
            snapshot_hash="snap123",
            analysis_input={"fault_node_id": "bus_01"},
            sc_result_dict=_sc_result_dict(),
        )
        assert "ith_a" in artifact.outputs
        assert "idyn_a" in artifact.outputs

    def test_signature_determinism(self) -> None:
        emitter = TraceEmitterSC()
        a1 = emitter.emit(
            snapshot_hash="snap123",
            analysis_input={"fault_node_id": "bus_01"},
            sc_result_dict=_sc_result_dict(),
        )
        a2 = emitter.emit(
            snapshot_hash="snap123",
            analysis_input={"fault_node_id": "bus_01"},
            sc_result_dict=_sc_result_dict(),
        )
        # run_hash must be identical
        assert a1.run_hash == a2.run_hash

        assert a1.trace_id == a2.trace_id

    def test_anti_double_counting_c(self) -> None:
        """c_factor must appear in exactly one equation step (SC_IKSS)."""
        emitter = TraceEmitterSC()
        artifact = emitter.emit(
            snapshot_hash="snap123",
            analysis_input={"fault_node_id": "bus_01"},
            sc_result_dict=_sc_result_dict(),
        )
        steps_with_c = [s for s in artifact.equation_steps if "c_factor" in s.inputs_used]
        # c_factor appears in Ikss step as input (via white_box_trace)
        assert len(steps_with_c) == 1
        assert steps_with_c[0].eq_id == "SC_IKSS"

    def test_missing_ip_a_shows_brak_danych_not_zero(self) -> None:
        """FAB-E (E1): brak ip_a w wyniku SC renderuje 'brak danych' w kroku
        I_dyn (adapter) i w outputs, nie fikcyjne 0.0 A (co wygladaloby jak
        zerowy prad udarowy/dynamiczny)."""
        result = _sc_result_dict()
        del result["ip_a"]

        emitter = TraceEmitterSC()
        artifact = emitter.emit(
            snapshot_hash="snap123",
            analysis_input={"fault_node_id": "bus_01"},
            sc_result_dict=result,
        )
        idyn_step = [s for s in artifact.equation_steps if s.step_id == "SC_IDYN_008"][0]
        assert idyn_step.intermediate_values["ip_a"].value == "brak danych"
        assert idyn_step.result.value == "brak danych"
        assert artifact.outputs["idyn_a"].value == "brak danych"
        # ikss_a (obecne) nadal renderuje sie normalnie.
        assert isinstance(artifact.outputs["ikss_a"].value, float)

    def test_white_box_step_missing_result_value_shows_brak_danych_not_zero(self) -> None:
        """FAB-E (E1): krok white_box_trace z pustym slownikiem 'result'
        (uszkodzony/niekompletny wpis sladu solvera) renderuje 'brak danych'
        w TraceValue wyniku kroku, nie fikcyjne 0.0."""
        result = _sc_result_dict()
        # Krok "Zk" bez wartosci wyniku — result_dict pusty.
        result["white_box_trace"][0]["result"] = {}

        emitter = TraceEmitterSC()
        artifact = emitter.emit(
            snapshot_hash="snap123",
            analysis_input={"fault_node_id": "bus_01"},
            sc_result_dict=result,
        )
        zk_step = [s for s in artifact.equation_steps if s.eq_id == "SC_ZK_3F"][0]
        assert zk_step.result.value == "brak danych"
        # Krok Ikss (result kompletny) nadal renderuje sie normalnie.
        ikss_step = [s for s in artifact.equation_steps if s.eq_id == "SC_IKSS"][0]
        assert isinstance(ikss_step.result.value, float)


# ===========================================================================
# Protection Emitter Tests
# ===========================================================================


def _protection_result_dict() -> dict:
    """Minimal Protection ResultSetV1 dict for testing."""
    return {
        "relay_results": [
            {
                "relay_id": "relay_01",
                "test_points": [
                    {
                        "point_id": "tp_01",
                        "i_a_primary": 500.0,
                        "i_a_secondary": 2.5,
                        "function_results": [
                            {
                                "function": "51",
                                "trace": {
                                    "function": "51",
                                    "formula": "t = TMS * A / (M^B - 1)",
                                    "standard": "IEC 60255-151:2009",
                                    "curve_type": "IEC_STANDARD_INVERSE",
                                    "curve_label_pl": "Normalna odwrotna (SI)",
                                    "A": 0.14,
                                    "B": 0.02,
                                    "TMS": 0.5,
                                    "I_secondary": 2.5,
                                    "I_pickup_secondary": 1.0,
                                    "M": 2.5,
                                    "M_power_B": 1.0185,
                                    "denominator": 0.0185,
                                    "base_time_s": 7.5676,
                                    "trip_time_s": 3.7838,
                                    "result": "TRIP",
                                },
                            },
                            {
                                "function": "50",
                                "trace": {
                                    "function": "50",
                                    "label_pl": "Zabezpieczenie zwarciowe (I>>)",
                                    "I_secondary": 2.5,
                                    "pickup_a_secondary": 10.0,
                                    "picked_up": False,
                                    "result": "NO_TRIP",
                                },
                            },
                        ],
                        "trace": {},
                    },
                ],
            },
        ],
        "deterministic_signature": "abc123sig",
    }


class TestTraceEmitterProtection:
    def test_emit_produces_artifact(self) -> None:
        emitter = TraceEmitterProtection()
        artifact = emitter.emit(
            snapshot_hash="snap456",
            analysis_input={"template": "default"},
            protection_result_dict=_protection_result_dict(),
        )
        assert artifact.analysis_type == AnalysisTypeV2.PROTECTION
        assert len(artifact.equation_steps) > 0

    def test_ct_conversion_step(self) -> None:
        emitter = TraceEmitterProtection()
        artifact = emitter.emit(
            snapshot_hash="snap456",
            analysis_input={"template": "default"},
            protection_result_dict=_protection_result_dict(),
        )
        ct_steps = [s for s in artifact.equation_steps if s.eq_id == "PROT_CT_CONVERSION"]
        assert len(ct_steps) == 1

    def test_trace_id_deterministic(self) -> None:
        emitter = TraceEmitterProtection()
        a1 = emitter.emit(
            snapshot_hash="snap456",
            analysis_input={"template": "default"},
            protection_result_dict=_protection_result_dict(),
        )
        a2 = emitter.emit(
            snapshot_hash="snap456",
            analysis_input={"template": "default"},
            protection_result_dict=_protection_result_dict(),
        )
        assert a1.trace_id == a2.trace_id

    def test_idmt_step_with_intermediates(self) -> None:
        emitter = TraceEmitterProtection()
        artifact = emitter.emit(
            snapshot_hash="snap456",
            analysis_input={"template": "default"},
            protection_result_dict=_protection_result_dict(),
        )
        idmt_steps = [s for s in artifact.equation_steps if s.eq_id == "PROT_IEC_IDMT"]
        assert len(idmt_steps) == 1
        step = idmt_steps[0]
        assert "M" in step.intermediate_values
        assert "M_power_B" in step.intermediate_values
        assert "denominator" in step.intermediate_values
        assert "base_time_s" in step.intermediate_values

    def test_missing_idmt_field_shows_brak_danych_not_zero(self) -> None:
        """FAB-E (E1): brak pola sladu IDMT (np. denominator) renderuje 'brak
        danych', nie fikcyjne 0 — ktore w dowodzie zadzialania zabezpieczenia
        wygladaloby jak realnie policzony mianownik krzywej."""
        result = _protection_result_dict()
        del result["relay_results"][0]["test_points"][0]["function_results"][0]["trace"][
            "denominator"
        ]

        emitter = TraceEmitterProtection()
        artifact = emitter.emit(
            snapshot_hash="snap456",
            analysis_input={"template": "default"},
            protection_result_dict=result,
        )
        idmt_step = next(s for s in artifact.equation_steps if s.eq_id == "PROT_IEC_IDMT")
        assert idmt_step.intermediate_values["denominator"].value == "brak danych"
        # M_power_B (obecne) nadal renderuje sie normalnie.
        assert isinstance(idmt_step.intermediate_values["M_power_B"].value, float)


# ===========================================================================
# Load Flow Emitter Tests
# ===========================================================================


def _lf_trace_dict() -> dict:
    return {
        "solver_version": "1.0.0",
        "input_hash": "lf_input_hash",
        "snapshot_id": "snap789",
        "case_id": "case_01",
        "run_id": "run_01",
        "init_state": {"bus_1": {"v_pu": 1.0, "theta_rad": 0.0}},
        "init_method": "flat",
        "tolerance": 1e-6,
        "max_iterations": 100,
        "base_mva": 100.0,
        "slack_bus_id": "bus_1",
        "pq_bus_ids": ["bus_2"],
        "pv_bus_ids": [],
        "ybus_trace": {},
        "iterations": [
            {"k": 1, "mismatch_per_bus": {}, "norm_mismatch": 0.01, "max_mismatch_pu": 0.01},
            {"k": 2, "mismatch_per_bus": {}, "norm_mismatch": 0.0001, "max_mismatch_pu": 0.0001},
        ],
        "converged": True,
        "final_iterations_count": 2,
    }


def _lf_result_dict() -> dict:
    return {
        "result_version": "1.0.0",
        "converged": True,
        "iterations_count": 2,
        "tolerance_used": 1e-6,
        "base_mva": 100.0,
        "slack_bus_id": "bus_1",
        "bus_results": [
            {
                "bus_id": "bus_1",
                "v_pu": 1.0,
                "angle_deg": 0.0,
                "p_injected_mw": 5.0,
                "q_injected_mvar": 2.0,
            },
            {
                "bus_id": "bus_2",
                "v_pu": 0.98,
                "angle_deg": -1.5,
                "p_injected_mw": -3.0,
                "q_injected_mvar": -1.0,
            },
        ],
        "branch_results": [
            {
                "branch_id": "line_1",
                "p_from_mw": 3.0,
                "q_from_mvar": 1.0,
                "p_to_mw": -2.95,
                "q_to_mvar": -0.95,
                "losses_p_mw": 0.05,
                "losses_q_mvar": 0.05,
            },
        ],
        "summary": {
            "total_losses_p_mw": 0.05,
            "total_losses_q_mvar": 0.05,
            "min_v_pu": 0.98,
            "max_v_pu": 1.0,
            "slack_p_mw": 5.0,
            "slack_q_mvar": 2.0,
        },
    }


class TestTraceEmitterLoadFlow:
    def test_emit_produces_artifact(self) -> None:
        emitter = TraceEmitterLoadFlow()
        artifact = emitter.emit(
            snapshot_hash="snap789",
            analysis_input={"solver": "newton"},
            pf_trace_dict=_lf_trace_dict(),
            pf_result_dict=_lf_result_dict(),
        )
        assert artifact.analysis_type == AnalysisTypeV2.LOAD_FLOW
        assert len(artifact.equation_steps) > 0

    def test_convergence_step(self) -> None:
        emitter = TraceEmitterLoadFlow()
        artifact = emitter.emit(
            snapshot_hash="snap789",
            analysis_input={"solver": "newton"},
            pf_trace_dict=_lf_trace_dict(),
            pf_result_dict=_lf_result_dict(),
        )
        conv_steps = [s for s in artifact.equation_steps if s.eq_id == "LF_CONVERGENCE"]
        assert len(conv_steps) == 1
        assert "converged" in conv_steps[0].intermediate_values

    def test_per_bus_voltage_steps(self) -> None:
        emitter = TraceEmitterLoadFlow()
        artifact = emitter.emit(
            snapshot_hash="snap789",
            analysis_input={"solver": "newton"},
            pf_trace_dict=_lf_trace_dict(),
            pf_result_dict=_lf_result_dict(),
        )
        bus_steps = [s for s in artifact.equation_steps if s.eq_id == "LF_BUS_VOLTAGE"]
        assert len(bus_steps) == 2  # bus_1 + bus_2

    def test_trace_id_deterministic(self) -> None:
        emitter = TraceEmitterLoadFlow()
        a1 = emitter.emit(
            snapshot_hash="snap789",
            analysis_input={"solver": "newton"},
            pf_trace_dict=_lf_trace_dict(),
            pf_result_dict=_lf_result_dict(),
        )
        a2 = emitter.emit(
            snapshot_hash="snap789",
            analysis_input={"solver": "newton"},
            pf_trace_dict=_lf_trace_dict(),
            pf_result_dict=_lf_result_dict(),
        )
        assert a1.trace_id == a2.trace_id

    def test_per_branch_flow_and_losses(self) -> None:
        emitter = TraceEmitterLoadFlow()
        artifact = emitter.emit(
            snapshot_hash="snap789",
            analysis_input={"solver": "newton"},
            pf_trace_dict=_lf_trace_dict(),
            pf_result_dict=_lf_result_dict(),
        )
        flow_steps = [s for s in artifact.equation_steps if s.eq_id == "LF_BRANCH_FLOW"]
        loss_steps = [s for s in artifact.equation_steps if s.eq_id == "LF_BRANCH_LOSSES"]
        assert len(flow_steps) == 1
        assert len(loss_steps) == 1

    def test_missing_bus_v_pu_shows_brak_danych_not_zero(self) -> None:
        """FAB-E (E1): brak v_pu w wyniku PF renderuje 'brak danych' w White Box
        trace, nie fikcyjne 0.0 p.u. (co wygladaloby jak calkowity zanik napiecia)."""
        result = _lf_result_dict()
        del result["bus_results"][1]["v_pu"]  # bus_2 bez v_pu

        emitter = TraceEmitterLoadFlow()
        artifact = emitter.emit(
            snapshot_hash="snap789",
            analysis_input={"solver": "newton"},
            pf_trace_dict=_lf_trace_dict(),
            pf_result_dict=result,
        )
        bus_steps = {
            s.subject_id: s for s in artifact.equation_steps if s.eq_id == "LF_BUS_VOLTAGE"
        }
        assert bus_steps["bus_2"].intermediate_values["v_pu"].value == "brak danych"
        assert bus_steps["bus_2"].result.value == "brak danych"
        # bus_1 (komplet danych) nadal renderuje sie normalnie.
        assert bus_steps["bus_1"].intermediate_values["v_pu"].value == 1.0

    def test_missing_summary_field_shows_brak_danych_not_zero(self) -> None:
        """FAB-E (E1): brak pola podsumowania (np. total_losses_q_mvar) to
        'brak danych' w White Box outputs, nie fikcyjne 0.0 MW/Mvar strat."""
        result = _lf_result_dict()
        del result["summary"]["total_losses_q_mvar"]

        emitter = TraceEmitterLoadFlow()
        artifact = emitter.emit(
            snapshot_hash="snap789",
            analysis_input={"solver": "newton"},
            pf_trace_dict=_lf_trace_dict(),
            pf_result_dict=result,
        )
        assert artifact.outputs["total_losses_q_mvar"].value == "brak danych"
        # total_losses_p_mw (obecne) nadal renderuje sie normalnie.
        assert isinstance(artifact.outputs["total_losses_p_mw"].value, float)


def test_deterministic_trace_id_is_permutation_invariant_for_equation_steps() -> None:
    """Logical-equivalent step sets must produce identical trace_id."""
    steps_order_a = [
        {"step_id": "SC_IKSS_002", "result": {"name": "ikss", "value": 3500.0}},
        {"step_id": "SC_ZK_001", "result": {"name": "zk", "value": "1.5+j3.2"}},
    ]
    steps_order_b = [
        {"step_id": "SC_ZK_001", "result": {"name": "zk", "value": "1.5+j3.2"}},
        {"step_id": "SC_IKSS_002", "result": {"name": "ikss", "value": 3500.0}},
    ]

    trace_id_a = deterministic_trace_id(
        analysis_type="SC",
        snapshot_hash="snap123",
        run_hash="run123",
        inputs={"fault_node_id": "bus_01"},
        equation_steps=steps_order_a,
        outputs={"ikss_a": 3500.0},
    )
    trace_id_b = deterministic_trace_id(
        analysis_type="SC",
        snapshot_hash="snap123",
        run_hash="run123",
        inputs={"fault_node_id": "bus_01"},
        equation_steps=steps_order_b,
        outputs={"ikss_a": 3500.0},
    )

    assert trace_id_a == trace_id_b


def test_deterministic_trace_id_is_permutation_invariant_with_duplicate_step_ids() -> None:
    """Duplicate step_id entries still yield stable trace_id regardless of order."""
    steps_order_a = [
        {"step_id": "SC_MISC_999", "result": {"name": "a", "value": 1.0}},
        {"step_id": "SC_MISC_999", "result": {"name": "b", "value": 2.0}},
    ]
    steps_order_b = [
        {"step_id": "SC_MISC_999", "result": {"name": "b", "value": 2.0}},
        {"step_id": "SC_MISC_999", "result": {"name": "a", "value": 1.0}},
    ]

    trace_id_a = deterministic_trace_id(
        analysis_type="SC",
        snapshot_hash="snap123",
        run_hash="run123",
        inputs={"fault_node_id": "bus_01"},
        equation_steps=steps_order_a,
        outputs={"ikss_a": 3500.0},
    )
    trace_id_b = deterministic_trace_id(
        analysis_type="SC",
        snapshot_hash="snap123",
        run_hash="run123",
        inputs={"fault_node_id": "bus_01"},
        equation_steps=steps_order_b,
        outputs={"ikss_a": 3500.0},
    )

    assert trace_id_a == trace_id_b


def test_deterministic_trace_id_accepts_tuple_equation_steps() -> None:
    """The helper should accept immutable Sequence inputs (tuple) as well."""
    steps_tuple = (
        {"step_id": "SC_ZK_001", "result": {"name": "zk", "value": "1.5+j3.2"}},
        {"step_id": "SC_IKSS_002", "result": {"name": "ikss", "value": 3500.0}},
    )

    trace_id = deterministic_trace_id(
        analysis_type="SC",
        snapshot_hash="snap123",
        run_hash="run123",
        inputs={"fault_node_id": "bus_01"},
        equation_steps=steps_tuple,
        outputs={"ikss_a": 3500.0},
    )

    assert trace_id.startswith("trace_sc_")


def test_deterministic_trace_id_handles_non_finite_floats() -> None:
    """NaN/Inf values should be normalized deterministically and remain hashable."""
    trace_id_1 = deterministic_trace_id(
        analysis_type="SC",
        snapshot_hash="snap-nf",
        run_hash="run-nf",
        inputs={"v_nan": math.nan, "v_pos_inf": math.inf, "v_neg_inf": -math.inf},
        equation_steps=(),
        outputs={"ok": 1.0},
    )
    trace_id_2 = deterministic_trace_id(
        analysis_type="SC",
        snapshot_hash="snap-nf",
        run_hash="run-nf",
        inputs={"v_nan": math.nan, "v_pos_inf": math.inf, "v_neg_inf": -math.inf},
        equation_steps=(),
        outputs={"ok": 1.0},
    )

    assert trace_id_1 == trace_id_2
    assert trace_id_1.startswith("trace_sc_")


def test_deterministic_trace_id_is_set_order_invariant() -> None:
    """Set-like inputs must not affect trace_id due to iteration order."""
    trace_id_a = deterministic_trace_id(
        analysis_type="SC",
        snapshot_hash="snap-set",
        run_hash="run-set",
        inputs={"zones": {"A", "B", "C"}},
        equation_steps=(),
        outputs={"ok": 1.0},
    )
    trace_id_b = deterministic_trace_id(
        analysis_type="SC",
        snapshot_hash="snap-set",
        run_hash="run-set",
        inputs={"zones": {"C", "A", "B"}},
        equation_steps=(),
        outputs={"ok": 1.0},
    )

    assert trace_id_a == trace_id_b


def test_deterministic_trace_id_is_frozenset_order_invariant() -> None:
    """frozenset inputs should be canonicalized identically to set."""
    trace_id_a = deterministic_trace_id(
        analysis_type="SC",
        snapshot_hash="snap-fset",
        run_hash="run-fset",
        inputs={"zones": frozenset(["Z1", "Z2"])},
        equation_steps=(),
        outputs={"ok": 1.0},
    )
    trace_id_b = deterministic_trace_id(
        analysis_type="SC",
        snapshot_hash="snap-fset",
        run_hash="run-fset",
        inputs={"zones": frozenset(["Z2", "Z1"])},
        equation_steps=(),
        outputs={"ok": 1.0},
    )

    assert trace_id_a == trace_id_b


def test_deterministic_trace_id_handles_complex_values() -> None:
    """Complex values should be canonicalized to a deterministic JSON-safe shape."""
    trace_id_a = deterministic_trace_id(
        analysis_type="SC",
        snapshot_hash="snap-cplx",
        run_hash="run-cplx",
        inputs={"z_equiv": 1.5 + 3.2j},
        equation_steps=(),
        outputs={"ok": 1.0},
    )
    trace_id_b = deterministic_trace_id(
        analysis_type="SC",
        snapshot_hash="snap-cplx",
        run_hash="run-cplx",
        inputs={"z_equiv": complex(1.5, 3.2)},
        equation_steps=(),
        outputs={"ok": 1.0},
    )

    assert trace_id_a == trace_id_b


def test_deterministic_trace_id_handles_bytes_values() -> None:
    """bytes/bytearray inputs should be canonicalized deterministically."""
    trace_id_a = deterministic_trace_id(
        analysis_type="SC",
        snapshot_hash="snap-bytes",
        run_hash="run-bytes",
        inputs={"blob": b"\x00\xffabc"},
        equation_steps=(),
        outputs={"ok": 1.0},
    )
    trace_id_b = deterministic_trace_id(
        analysis_type="SC",
        snapshot_hash="snap-bytes",
        run_hash="run-bytes",
        inputs={"blob": bytearray(b"\x00\xffabc")},
        equation_steps=(),
        outputs={"ok": 1.0},
    )

    assert trace_id_a == trace_id_b
