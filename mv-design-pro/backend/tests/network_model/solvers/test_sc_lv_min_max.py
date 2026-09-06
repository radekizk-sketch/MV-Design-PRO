"""Karta P0.3 — zwarcia nN: c per pasmo + scenariusz MIN + korekta temperaturowa R.

docs/nn/H_PLAN_IMPLEMENTACJI_NN.md §P0.3, docs/nn/D_KONTRAKT_SN_NN_V1.md §4.

Covers:
1. ``network_model.core.voltage_factor.c_for_node`` — IEC 60909-0 Table 1
   (4 band/scenario combinations + the exact 1.0 kV boundary).
2. Golden MV+LV network built directly through NetworkGraph (no ENM):
   grid source (Sk''=250 MVA, 15 kV) -> SN cable 2 km -> TR 15/0.4 kV 630 kVA
   uk=6% -> szyna nN -> LV cable YAKY 4x120 (60 m) -> koniec obwodu.
   Manual IEC 60909 hand-calc (see module docstring of
   ``_build_golden_mv_lv_graph`` and inline comments) is checked against the
   FROZEN solver's own output within 1% tolerance.
3. Explicit c_factor override + White Box trace entry.
4. Dispatch input_hash differentiates the MIN/MAX scenario (separate cache).
"""

from __future__ import annotations

import math

import pytest
from application.solvers.short_circuit_binding import (
    ShortCircuitBindingResult,
    execute_short_circuit,
)
from domain.execution import ExecutionAnalysisType, compute_solver_input_hash
from domain.study_case import StudyCaseConfig
from network_model.core.branch import BranchType, LineBranch, TransformerBranch
from network_model.core.graph import NetworkGraph
from network_model.core.grid_source import GridShortCircuitSource
from network_model.core.node import Node, NodeType
from network_model.core.voltage_factor import c_for_node

# =============================================================================
# 1. c_for_node — IEC 60909-0 Table 1 lookup
# =============================================================================


class TestCForNode:
    """Table 1: <=1.0 kV -> 1.05/0.95; >1.0 kV -> 1.10/1.00."""

    def test_lv_band_max(self):
        assert c_for_node(0.4, "MAX") == 1.05

    def test_lv_band_min(self):
        assert c_for_node(0.4, "MIN") == 0.95

    def test_mv_band_max(self):
        assert c_for_node(15.0, "MAX") == 1.10

    def test_mv_band_min(self):
        assert c_for_node(15.0, "MIN") == 1.00

    def test_boundary_at_exactly_1kv_is_lv_band(self):
        """1.0 kV itself is <=1.0 kV -> LV band (nN), not MV."""
        assert c_for_node(1.0, "MAX") == 1.05
        assert c_for_node(1.0, "MIN") == 0.95

    def test_just_above_boundary_is_mv_band(self):
        assert c_for_node(1.001, "MAX") == 1.10
        assert c_for_node(1.001, "MIN") == 1.00

    def test_unknown_scenario_raises(self):
        with pytest.raises(ValueError, match="MAX/MIN"):
            c_for_node(15.0, "NOMINAL")  # type: ignore[arg-type]


# =============================================================================
# 2. Golden MV+LV network
# =============================================================================
#
# Topology (all built directly via NetworkGraph — no ENM):
#
#   N0_GPZ_SN --[SN cable 2 km]--> N1_SZYNA_SN --[TR 630 kVA]--> N2_SZYNA_NN
#       (SLACK, 15 kV,               (PQ, 15 kV)      (15/0.4 kV,   (PQ, 0.4 kV)
#        GridShortCircuitSource                          Dyn11,
#        Sk''=250 MVA)                                    uk=6%)
#                                                                       |
#                                                          [LV cable YAKY 4x120, 60 m]
#                                                                       v
#                                                              N3_KONIEC_NN (PQ, 0.4 kV)
#
# Parameters (real catalog-grade values — SN cable = XLPE Al 3x120mm2,
# TR = 15/0.4 kV 630 kVA Dyn11 (ABB-class), LV cable = YAKY 4x120mm2,
# theta_k=160 degC per network_model/catalog/mv_auxiliary_catalog.py):
#
#   Grid source:   Sk''=250 MVA, Un=15 kV, R/X=0.1 (typical SN feeder).
#                  |Z_Q| = c_max(SN)*Un^2/Sk'' = 1.10*15^2/250 = 0.9900 ohm
#                  X_Q = |Z_Q|/sqrt(1+0.1^2) = 0.9850868183 ohm
#                  R_Q = 0.1*X_Q            = 0.0985086818 ohm
#   SN cable:      R20=0.253 ohm/km, X=0.100 ohm/km, L=2 km, theta_k=250 degC (XLPE)
#                  R=0.506 ohm, X=0.200 ohm (uncorrected, MAX)
#   TR 630 kVA:    Sr=0.630 MVA, uk=6%, pk=8.0 kW, Un_LV=0.4 kV
#                  z_pu=uk/100=0.06; r_pu=(pk/1000)/Sr=0.0126984127
#                  x_pu=sqrt(z_pu^2-r_pu^2)=0.0586408588
#                  K_T = 0.95*c_max(LV=1.05)/(1+0.6*x_pu) = 0.9635963302
#                  Z_T_LV_corrected = K_T*(r_pu+j*x_pu)*(Un_LV^2/Sr)
#                                   = 0.0031075921 + j0.0143507597 ohm
#   LV cable:      R20=0.253 ohm/km, X=0.069 ohm/km, L=0.060 km, theta_k=160 degC (PVC)
#                  R=0.01518 ohm, X=0.00414 ohm (uncorrected, MAX)
#
# Referred to the LV side (ratio HV/LV = 15/0.4, tap_position=0 -> ratio=1,
# so per-unit referral is the plain (U_LV/U_HV)^2 turns-ratio square):
#
#   Z_N1 (at SN bus, 15 kV) = Z_Q + Z_cableSN = 0.6045086818 + j1.1850868183 ohm
#   Z_N2 (at nN bus, 0.4 kV, MAX) = Z_N1*(0.4/15)^2 + Z_T_LV_corrected
#                                 = 0.0035374649 + j0.0151934881 ohm
#                                 |Z_N2_max| = 0.0155998634 ohm
#   Ik''max(N2) = c_max(LV=1.05)*400 / (sqrt(3)*|Z_N2_max|) = 15544.18 A = 15.544 kA
#
# This is the classic series-impedance-summation method for a single-source
# radial network — for such a topology it is EXACTLY what the Z-bus/Y-bus
# solver computes (Z-bus diagonal at a node fed by one source through a
# purely series chain equals the impedance sum along that chain), so the
# 1 % tolerance below has large headroom; it is not an approximation gap.

_SK_Q_MVA = 250.0
_UN_HV_KV = 15.0
_C_MAX_HV = 1.10
_RX_SOURCE = 0.1

_R_SN_PER_KM = 0.253
_X_SN_PER_KM = 0.100
_LEN_SN_KM = 2.0
_THETA_SN_C = 250.0  # XLPE

_TR_SR_MVA = 0.630
_TR_UK_PERCENT = 6.0
_TR_PK_KW = 8.0

_R_LV_PER_KM = 0.253
_X_LV_PER_KM = 0.069
_LEN_LV_KM = 0.060
_THETA_LV_C = 160.0  # PVC (YAKY 4x120, catalog value)

_UN_LV_KV = 0.4

N0 = "N0_GPZ_SN"
N1 = "N1_SZYNA_SN"
N2 = "N2_SZYNA_NN"
N3 = "N3_KONIEC_NN"


def _build_golden_mv_lv_graph() -> NetworkGraph:
    """Grid source (Sk''=250 MVA, 15 kV) -> SN cable 2 km -> TR 630 kVA
    15/0.4 kV Dyn11 uk=6% -> szyna nN -> LV cable YAKY 4x120 60 m."""
    z_mag = _C_MAX_HV * _UN_HV_KV**2 / _SK_Q_MVA
    x_q = z_mag / math.sqrt(1 + _RX_SOURCE**2)
    r_q = _RX_SOURCE * x_q

    graph = NetworkGraph()

    graph.add_node(
        Node(
            id=N0,
            name="GPZ 15 kV",
            node_type=NodeType.SLACK,
            voltage_level=_UN_HV_KV,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    graph.add_node(
        Node(
            id=N1,
            name="Szyna SN stacji",
            node_type=NodeType.PQ,
            voltage_level=_UN_HV_KV,
            active_power=0.0,
            reactive_power=0.0,
        )
    )
    graph.add_node(
        Node(
            id=N2,
            name="Szyna nN",
            node_type=NodeType.PQ,
            voltage_level=_UN_LV_KV,
            active_power=0.0,
            reactive_power=0.0,
        )
    )
    graph.add_node(
        Node(
            id=N3,
            name="Koniec obwodu nN",
            node_type=NodeType.PQ,
            voltage_level=_UN_LV_KV,
            active_power=0.0,
            reactive_power=0.0,
        )
    )

    graph.add_grid_sc_source(
        GridShortCircuitSource(
            id="GRID_Q",
            name="Sieć zasilająca 15 kV",
            node_id=N0,
            z_ohm=complex(r_q, x_q),
            in_service=True,
        )
    )

    graph.add_branch(
        LineBranch(
            id="C_SN",
            name="Kabel SN XLPE Al 3x120mm2",
            branch_type=BranchType.CABLE,
            from_node_id=N0,
            to_node_id=N1,
            in_service=True,
            r_ohm_per_km=_R_SN_PER_KM,
            x_ohm_per_km=_X_SN_PER_KM,
            b_us_per_km=0.0,
            length_km=_LEN_SN_KM,
            rated_current_a=230.0,
            short_circuit_temperature_c=_THETA_SN_C,
        )
    )

    graph.add_branch(
        TransformerBranch(
            id="TR1",
            name="TR 15/0.4 kV 630 kVA Dyn11",
            branch_type=BranchType.TRANSFORMER,
            from_node_id=N1,
            to_node_id=N2,
            in_service=True,
            rated_power_mva=_TR_SR_MVA,
            voltage_hv_kv=_UN_HV_KV,
            voltage_lv_kv=_UN_LV_KV,
            uk_percent=_TR_UK_PERCENT,
            pk_kw=_TR_PK_KW,
            i0_percent=1.5,
            p0_kw=1.3,
            vector_group="Dyn11",
            tap_position=0,
            tap_step_percent=2.5,
        )
    )

    graph.add_branch(
        LineBranch(
            id="C_NN",
            name="Kabel nN YAKY 4x120mm2",
            branch_type=BranchType.CABLE,
            from_node_id=N2,
            to_node_id=N3,
            in_service=True,
            r_ohm_per_km=_R_LV_PER_KM,
            x_ohm_per_km=_X_LV_PER_KM,
            b_us_per_km=0.0,
            length_km=_LEN_LV_KM,
            rated_current_a=240.0,
            short_circuit_temperature_c=_THETA_LV_C,
        )
    )

    return graph


def _golden_config() -> StudyCaseConfig:
    """Untouched StudyCaseConfig defaults -> AUTO per-band c (no override)."""
    return StudyCaseConfig(thermal_time_seconds=1.0)


# Manually derived expected values (see module-level hand-calc comment above).
_EXPECTED_IKSS_N2_MAX_A = 15544.18
_EXPECTED_IKSS_N1_MAX_A = 7160.67
_TOLERANCE = 0.01  # 1%


class TestGoldenMvLvShortCircuit:
    """Assertions (a)-(e) per karta P0.3 test matrix."""

    def test_a_ikss_max_at_nn_bus_matches_hand_calc_within_1pct(self):
        graph = _build_golden_mv_lv_graph()
        result = execute_short_circuit(
            graph=graph,
            analysis_type=ExecutionAnalysisType.SC_3F,
            config=_golden_config(),
            fault_node_id=N2,
            scenario="MAX",
        )
        ikss_a = result.solver_result.ikss_a
        assert ikss_a == pytest.approx(_EXPECTED_IKSS_N2_MAX_A, rel=_TOLERANCE)
        # c used at the nN fault node must be the LV-band auto value (Table 1).
        assert result.solver_result.c_factor == pytest.approx(1.05)

    def test_a2_ikss_max_at_sn_bus_matches_hand_calc_within_1pct(self):
        graph = _build_golden_mv_lv_graph()
        result = execute_short_circuit(
            graph=graph,
            analysis_type=ExecutionAnalysisType.SC_3F,
            config=_golden_config(),
            fault_node_id=N1,
            scenario="MAX",
        )
        assert result.solver_result.ikss_a == pytest.approx(_EXPECTED_IKSS_N1_MAX_A, rel=_TOLERANCE)
        assert result.solver_result.c_factor == pytest.approx(1.10)

    def test_b_ikss_min_is_lower_than_ikss_max_at_nn_bus(self):
        graph = _build_golden_mv_lv_graph()
        config = _golden_config()

        result_max = execute_short_circuit(
            graph=graph,
            analysis_type=ExecutionAnalysisType.SC_3F,
            config=config,
            fault_node_id=N2,
            scenario="MAX",
        )
        result_min = execute_short_circuit(
            graph=graph,
            analysis_type=ExecutionAnalysisType.SC_3F,
            config=config,
            fault_node_id=N2,
            scenario="MIN",
        )

        assert result_min.solver_result.ikss_a < result_max.solver_result.ikss_a
        assert result_min.solver_result.c_factor == pytest.approx(0.95)
        assert result_max.solver_result.c_factor == pytest.approx(1.05)

    def test_c_r_theta_correction_lowers_ikss_min_at_end_of_cable(self):
        """Proof the R_theta term does something: Ik''min WITH temperature
        correction at the end of the LV cable is strictly lower than Ik''min
        computed on the SAME (uncorrected) graph — i.e. the decoration the
        MIN scenario applies is not a no-op."""
        graph = _build_golden_mv_lv_graph()
        config = _golden_config()

        result_min_with_correction = execute_short_circuit(
            graph=graph,
            analysis_type=ExecutionAnalysisType.SC_3F,
            config=config,
            fault_node_id=N3,
            scenario="MIN",
        )

        # Reference: MIN c-factor, but solved directly on the UNDECORATED
        # (catalog R20, no temperature correction) graph — this is exactly
        # what execute_short_circuit(scenario="MIN") does MINUS the
        # temperature-correction step, isolating the term's effect.
        from network_model.solvers.short_circuit_iec60909 import (
            ShortCircuitIEC60909Solver,
        )

        result_min_uncorrected = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id=N3,
            c_factor=c_for_node(_UN_LV_KV, "MIN"),
            tk_s=config.thermal_time_seconds,
            tb_s=0.1,
        )

        assert result_min_with_correction.solver_result.ikss_a < result_min_uncorrected.ikss_a
        # Both cable branches (SN theta_k=250, nN theta_k=160) got corrected —
        # White Box notes must say so explicitly, not silently.
        notes = {
            note["branch_id"]: note
            for note in result_min_with_correction.temperature_correction_notes
        }
        assert notes["C_SN"]["corrected"] is True
        assert notes["C_NN"]["corrected"] is True
        assert notes["C_NN"]["theta_k_c"] == pytest.approx(_THETA_LV_C)
        assert notes["C_NN"]["r_theta_ohm_per_km"] > notes["C_NN"]["r20_ohm_per_km"]

    def test_c2_branch_without_theta_k_gets_no_correction_and_explicit_note(self):
        """Zero fabrication: a line/cable branch with unknown theta_k is left
        UNCHANGED for MIN and gets an explicit 'no correction' White Box note."""
        graph = _build_golden_mv_lv_graph()
        # Downgrade the LV cable to "no known temperature" (as if the catalog
        # materialization did not carry short_circuit_temperature_c).
        graph.branches["C_NN"].short_circuit_temperature_c = None

        result = execute_short_circuit(
            graph=graph,
            analysis_type=ExecutionAnalysisType.SC_3F,
            config=_golden_config(),
            fault_node_id=N3,
            scenario="MIN",
        )

        notes = {note["branch_id"]: note for note in result.temperature_correction_notes}
        assert notes["C_NN"]["corrected"] is False
        assert notes["C_NN"]["theta_k_c"] is None
        assert "brak" in notes["C_NN"]["reason"].lower()

    def test_d_c_per_band_sn_node_uses_mv_table(self):
        """Fault at the SN node uses 1.10/1.00, read from the frozen solver
        result's own c_factor (White Box, not a side channel)."""
        graph = _build_golden_mv_lv_graph()
        config = _golden_config()

        r_max = execute_short_circuit(
            graph=graph,
            analysis_type=ExecutionAnalysisType.SC_3F,
            config=config,
            fault_node_id=N1,
            scenario="MAX",
        )
        r_min = execute_short_circuit(
            graph=graph,
            analysis_type=ExecutionAnalysisType.SC_3F,
            config=config,
            fault_node_id=N1,
            scenario="MIN",
        )
        assert r_max.solver_result.c_factor == pytest.approx(1.10)
        assert r_min.solver_result.c_factor == pytest.approx(1.00)

    def test_d2_c_per_band_nn_node_uses_lv_table(self):
        """Fault at the nN node uses 1.05/0.95."""
        graph = _build_golden_mv_lv_graph()
        config = _golden_config()

        r_max = execute_short_circuit(
            graph=graph,
            analysis_type=ExecutionAnalysisType.SC_3F,
            config=config,
            fault_node_id=N2,
            scenario="MAX",
        )
        r_min = execute_short_circuit(
            graph=graph,
            analysis_type=ExecutionAnalysisType.SC_3F,
            config=config,
            fault_node_id=N2,
            scenario="MIN",
        )
        assert r_max.solver_result.c_factor == pytest.approx(1.05)
        assert r_min.solver_result.c_factor == pytest.approx(0.95)

    def test_e_explicit_override_is_applied_and_recorded_in_trace(self):
        """StudyCaseConfig.c_factor_max set to a NON-standard value (neither
        the class default 1.10 nor the nN-band auto 1.05) is an explicit
        operator override: applied verbatim + visible on the binding result
        (result meta) with c_factor_override=True."""
        graph = _build_golden_mv_lv_graph()
        override_config = StudyCaseConfig(c_factor_max=1.15, thermal_time_seconds=1.0)

        result = execute_short_circuit(
            graph=graph,
            analysis_type=ExecutionAnalysisType.SC_3F,
            config=override_config,
            fault_node_id=N2,
            scenario="MAX",
        )

        assert result.solver_result.c_factor == pytest.approx(1.15)
        assert result.c_factor_override is True
        assert result.c_factor_auto == pytest.approx(1.05)

    def test_e2_auto_path_when_config_matches_class_default(self):
        """Untouched StudyCaseConfig() (class default 1.10) at an nN fault
        node must NOT be misread as an override — AUTO (1.05) applies."""
        graph = _build_golden_mv_lv_graph()
        result = execute_short_circuit(
            graph=graph,
            analysis_type=ExecutionAnalysisType.SC_3F,
            config=StudyCaseConfig(),  # untouched defaults: c_factor_max=1.10
            fault_node_id=N2,
            scenario="MAX",
        )
        assert result.c_factor_override is False
        assert result.solver_result.c_factor == pytest.approx(1.05)

    def test_e3_auto_path_when_config_coincides_with_band_auto(self):
        """An explicitly-set value that happens to equal the band's auto
        value is not flagged as an override (no visible difference)."""
        graph = _build_golden_mv_lv_graph()
        result = execute_short_circuit(
            graph=graph,
            analysis_type=ExecutionAnalysisType.SC_3F,
            config=StudyCaseConfig(c_factor_max=1.05),
            fault_node_id=N2,
            scenario="MAX",
        )
        assert result.c_factor_override is False
        assert result.solver_result.c_factor == pytest.approx(1.05)

    def test_binding_result_scenario_metadata_shape(self):
        graph = _build_golden_mv_lv_graph()
        result = execute_short_circuit(
            graph=graph,
            analysis_type=ExecutionAnalysisType.SC_3F,
            config=_golden_config(),
            fault_node_id=N2,
            scenario="MIN",
        )
        assert isinstance(result, ShortCircuitBindingResult)
        assert result.scenario == "MIN"
        assert len(result.temperature_correction_notes) == 2  # C_SN + C_NN


# =============================================================================
# 3. Dispatch: MIN scenario changes input_hash (separate cache entry)
# =============================================================================


class TestDispatchInputHashDifferentiatesScenario:
    def test_scenario_changes_solver_input_hash(self):
        base_payload = {
            "analysis_type": "SC_3F",
            "fault_node_id": N2,
            "c_factor_max": 1.10,
        }
        payload_max = {**base_payload, "scenario": "MAX"}
        payload_min = {**base_payload, "scenario": "MIN"}

        hash_max = compute_solver_input_hash(payload_max)
        hash_min = compute_solver_input_hash(payload_min)

        assert hash_max != hash_min
