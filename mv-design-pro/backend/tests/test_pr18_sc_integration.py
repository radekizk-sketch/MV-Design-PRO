"""
Tests for PR-18: Short-Circuit Solver Integration (Engine Binding)

Test categories:
1. Determinism — identical inputs produce identical hashes and signatures
3. Contract shape — ResultSet v1 structure invariants
5. Binding adapter — `execute_short_circuit` unit tests
6. Result mapper — `map_short_circuit_to_resultset_v1` unit tests

INVARIANTS UNDER TEST:
- ZERO randomness: same graph + same config → same hash + same signature
- ResultSet v1 contains expected keys and sorted elements
- SC_3F, SC_1F, SC_2F all produce results via `execute_short_circuit`

Karta CV-3.3-A (2026-09-05): kategorie 2 (Gating) i 4 (Golden fixtures, przez
`ExecutionEngineService.execute_run_sc`) skasowane razem z E3
(`application.execution_engine` — drugi tor wykonania biegów bez konsumenta
produkcyjnego). Gating byl mechanika WYLACZNIE E3 (kwargs `readiness=`/
`eligibility=` na `create_run`, ktorych kanoniczny `enm.canonical_analysis.
create_run` nie ma — waliduje sam, z ENM). Fizyka golden fixtures (zbieznosc,
dodatnie prady, 3F>2F, Z0 wymagane dla 1F, determinizm, ksztalt kontraktu,
slad WHITE BOX) przepisana na tor kanoniczny na sieci koncepcyjnie tej samej:
`tests/enm/test_short_circuit_migracja_e3_golden.py`.
"""

from __future__ import annotations

import copy
from uuid import uuid4

import pytest
from application.result_mapping.sc_binding_meta import (
    wzbogac_resultset_o_meta_bindingu,
)
from application.result_mapping.short_circuit_to_resultset_v1 import (
    map_short_circuit_to_resultset_v1,
)
from application.solvers.short_circuit_binding import (
    ShortCircuitBindingError,
    ShortCircuitBindingResult,
    execute_short_circuit,
)
from domain.execution import (
    ExecutionAnalysisType,
    ResultSet,
    compute_result_signature,
    compute_solver_input_hash,
)
from domain.study_case import StudyCaseConfig
from network_model.core.branch import BranchType, LineBranch, TransformerBranch
from network_model.core.graph import NetworkGraph
from network_model.core.inverter import InverterSource
from network_model.core.node import Node, NodeType

# =============================================================================
# Fixtures: Golden network (production-grade MV network)
# =============================================================================


def _create_golden_graph() -> NetworkGraph:
    """
    Create a production-grade MV network for golden fixture tests.

    Topology:
        SLACK (110 kV) --[Transformer T1]--> BUS_MV (20 kV) --[Cable C1]--> BUS_LOAD (20 kV)
                                                                  |
                                                             [Inverter INV1]

    This covers: source (via SLACK), transformer, cable, load bus, inverter source.
    All catalog_ref and impedance parameters are complete (no eligibility blockers for SC_3F).
    """
    graph = NetworkGraph()

    # Nodes
    graph.add_node(
        Node(
            id="SLACK",
            name="Stacja 110kV",
            node_type=NodeType.PQ,
            voltage_level=110.0,
            active_power=0.0,
            reactive_power=0.0,
        )
    )
    graph.add_node(
        Node(
            id="BUS_MV",
            name="Szyna SN 20kV",
            node_type=NodeType.PQ,
            voltage_level=20.0,
            active_power=5.0,
            reactive_power=2.0,
        )
    )
    graph.add_node(
        Node(
            id="BUS_LOAD",
            name="Szyna odbiorcza 20kV",
            node_type=NodeType.PQ,
            voltage_level=20.0,
            active_power=10.0,
            reactive_power=4.0,
        )
    )
    # Reference node for Y-bus invertibility
    graph.add_node(
        Node(
            id="GND",
            name="Uziemienie",
            node_type=NodeType.PQ,
            voltage_level=20.0,
            active_power=0.0,
            reactive_power=0.0,
        )
    )

    # Transformer: 110/20 kV, 25 MVA, uk=10%, pk=120 kW
    graph.add_branch(
        TransformerBranch(
            id="T1",
            name="Transformator T1",
            branch_type=BranchType.TRANSFORMER,
            from_node_id="SLACK",
            to_node_id="BUS_MV",
            in_service=True,
            rated_power_mva=25.0,
            voltage_hv_kv=110.0,
            voltage_lv_kv=20.0,
            uk_percent=10.0,
            pk_kw=120.0,
            i0_percent=0.5,
            p0_kw=25.0,
            vector_group="Dyn11",
            tap_position=0,
            tap_step_percent=2.5,
            type_ref="TRAFO_110_20_25MVA",
        )
    )

    # Cable: BUS_MV -> BUS_LOAD (YAKY 3x240, 5 km)
    graph.add_branch(
        LineBranch(
            id="C1",
            name="Kabel C1",
            branch_type=BranchType.CABLE,
            from_node_id="BUS_MV",
            to_node_id="BUS_LOAD",
            in_service=True,
            r_ohm_per_km=0.125,
            x_ohm_per_km=0.08,
            b_us_per_km=260.0,
            length_km=5.0,
            rated_current_a=400.0,
            type_ref="YAKY_3x240",
        )
    )

    # Reference branch to GND (for Y-bus invertibility)
    graph.add_branch(
        LineBranch(
            id="REF",
            name="Ref GND",
            branch_type=BranchType.LINE,
            from_node_id="BUS_LOAD",
            to_node_id="GND",
            in_service=True,
            r_ohm_per_km=1e9,
            x_ohm_per_km=0.0,
            b_us_per_km=0.0,
            length_km=1.0,
            rated_current_a=1.0,
        )
    )

    # Inverter source (PV, 100 A rated, k_sc=1.1)
    graph.add_inverter_source(
        InverterSource(
            id="INV1",
            name="Falownik PV 1",
            node_id="BUS_LOAD",
            in_rated_a=100.0,
            k_sc=1.1,
            contributes_negative_sequence=False,
            contributes_zero_sequence=False,
            in_service=True,
        )
    )

    return graph


def _golden_config() -> StudyCaseConfig:
    """Standard study case config for golden tests."""
    return StudyCaseConfig(
        c_factor_max=1.10,
        c_factor_min=0.95,
        thermal_time_seconds=1.0,
        include_inverter_contribution=True,
    )


def _sample_solver_input() -> dict:
    """Realistic solver input dict for hash tests."""
    return {
        "buses": [
            {"ref_id": "SLACK", "voltage_level_kv": 110.0},
            {"ref_id": "BUS_MV", "voltage_level_kv": 20.0},
            {"ref_id": "BUS_LOAD", "voltage_level_kv": 20.0},
        ],
        "branches": [
            {"ref_id": "C1", "r_ohm_per_km": 0.125, "x_ohm_per_km": 0.08},
        ],
        "transformers": [
            {"ref_id": "T1", "uk_percent": 10.0, "rated_power_mva": 25.0},
        ],
        "inverter_sources": [
            {"ref_id": "INV1", "in_rated_a": 100.0, "k_sc": 1.1},
        ],
        "switches": [],
        "c_factor_max": 1.10,
    }


# =============================================================================
# 1. DETERMINISM TESTS
# =============================================================================


class TestDeterminism:
    """Identical inputs produce identical hashes and signatures."""

    def test_solver_input_hash_deterministic(self):
        """Same solver input → same hash."""
        input_a = _sample_solver_input()
        input_b = copy.deepcopy(input_a)
        assert compute_solver_input_hash(input_a) == compute_solver_input_hash(input_b)

    def test_solver_input_hash_key_order_independent(self):
        """Dict key order does not affect hash."""
        input_a = {"z": 1, "a": 2, "m": 3}
        input_b = {"a": 2, "m": 3, "z": 1}
        assert compute_solver_input_hash(input_a) == compute_solver_input_hash(input_b)

    def test_solver_input_hash_bus_order_independent(self):
        """Bus list order does not affect hash (canonical sorting by ref_id)."""
        input_a = _sample_solver_input()
        input_b = copy.deepcopy(input_a)
        input_b["buses"] = list(reversed(input_b["buses"]))
        assert compute_solver_input_hash(input_a) == compute_solver_input_hash(input_b)

    def test_result_signature_deterministic(self):
        """Same result data → same signature."""
        data = {"ikss_a": 12345.0, "ip_a": 25000.0}
        assert compute_result_signature(data) == compute_result_signature(data)

    def test_result_signature_differs_on_change(self):
        """Different result data → different signature."""
        data_a = {"ikss_a": 12345.0}
        data_b = {"ikss_a": 12346.0}
        assert compute_result_signature(data_a) != compute_result_signature(data_b)


# =============================================================================
# 3. CONTRACT SHAPE TESTS
# =============================================================================


class TestContractShape:
    """ResultSet v1 structure invariants."""

    def test_sc_2f_analysis_type_in_enum(self):
        """SC_2F is a valid ExecutionAnalysisType."""
        assert ExecutionAnalysisType.SC_2F.value == "SC_2F"


# =============================================================================
# 5. BINDING ADAPTER UNIT TESTS
# =============================================================================


class TestShortCircuitBinding:
    """Unit tests for the short-circuit binding adapter."""

    def test_binding_sc3f_returns_result(self):
        """execute_short_circuit for SC_3F returns a valid result."""
        graph = _create_golden_graph()
        config = _golden_config()

        result = execute_short_circuit(
            graph=graph,
            analysis_type=ExecutionAnalysisType.SC_3F,
            config=config,
            fault_node_id="BUS_MV",
        )

        assert isinstance(result, ShortCircuitBindingResult)
        assert result.analysis_type == ExecutionAnalysisType.SC_3F
        assert result.fault_node_id == "BUS_MV"
        assert result.solver_result.ikss_a > 0

    def test_binding_sc2f_returns_result(self):
        """execute_short_circuit for SC_2F returns a valid result."""
        graph = _create_golden_graph()
        config = _golden_config()

        result = execute_short_circuit(
            graph=graph,
            analysis_type=ExecutionAnalysisType.SC_2F,
            config=config,
            fault_node_id="BUS_MV",
        )

        assert isinstance(result, ShortCircuitBindingResult)
        assert result.analysis_type == ExecutionAnalysisType.SC_2F
        assert result.solver_result.ikss_a > 0

    def test_binding_sc1f_requires_z0(self):
        """execute_short_circuit for SC_1F without Z0 raises."""
        graph = _create_golden_graph()
        config = _golden_config()

        with pytest.raises(ShortCircuitBindingError, match="Z₀"):
            execute_short_circuit(
                graph=graph,
                analysis_type=ExecutionAnalysisType.SC_1F,
                config=config,
                fault_node_id="BUS_MV",
            )

    def test_binding_unsupported_type_raises(self):
        """execute_short_circuit for LOAD_FLOW raises."""
        graph = _create_golden_graph()
        config = _golden_config()

        with pytest.raises(ShortCircuitBindingError, match="Nieobsługiwany"):
            execute_short_circuit(
                graph=graph,
                analysis_type=ExecutionAnalysisType.LOAD_FLOW,
                config=config,
                fault_node_id="BUS_MV",
            )

    def test_binding_invalid_fault_node_raises(self):
        """execute_short_circuit with invalid fault node raises."""
        graph = _create_golden_graph()
        config = _golden_config()

        with pytest.raises(ShortCircuitBindingError, match="Fault node"):
            execute_short_circuit(
                graph=graph,
                analysis_type=ExecutionAnalysisType.SC_3F,
                config=config,
                fault_node_id="NONEXISTENT",
            )

    # -------------------------------------------------------------------
    # Karta P0.3 (docs/nn/H_PLAN_IMPLEMENTACJI_NN.md): scenario MAX/MIN +
    # per-node c. This golden graph is entirely SN (20/110 kV, no nN
    # branches with a known theta_k), so it exercises the "no correction"
    # White Box path deterministically — the MV+LV physics (per-band c,
    # R_theta correction) has its own dedicated golden fixture:
    # tests/network_model/solvers/test_sc_lv_min_max.py.
    # -------------------------------------------------------------------

    def test_binding_defaults_to_max_scenario(self):
        """execute_short_circuit with no scenario kwarg behaves exactly as
        before this karta (scenario="MAX", no behavior change)."""
        graph = _create_golden_graph()
        config = _golden_config()

        result = execute_short_circuit(
            graph=graph,
            analysis_type=ExecutionAnalysisType.SC_3F,
            config=config,
            fault_node_id="BUS_MV",
        )

        assert result.scenario == "MAX"
        assert result.temperature_correction_notes == ()

    def test_binding_min_scenario_produces_lower_ikss(self):
        """MIN scenario on a 20 kV bus uses c=1.00 (< MAX c=1.10) -> lower Ik''."""
        graph = _create_golden_graph()
        config = _golden_config()

        result_max = execute_short_circuit(
            graph=graph,
            analysis_type=ExecutionAnalysisType.SC_3F,
            config=config,
            fault_node_id="BUS_MV",
            scenario="MAX",
        )
        result_min = execute_short_circuit(
            graph=graph,
            analysis_type=ExecutionAnalysisType.SC_3F,
            config=config,
            fault_node_id="BUS_MV",
            scenario="MIN",
        )

        assert result_min.solver_result.ikss_a < result_max.solver_result.ikss_a
        assert result_max.solver_result.c_factor == pytest.approx(1.10)
        assert result_min.solver_result.c_factor == pytest.approx(1.00)

    def test_binding_min_scenario_notes_uncorrected_branches(self):
        """C1/REF have no short_circuit_temperature_c -> explicit 'no
        correction' White Box notes, never a silently fabricated theta_k."""
        graph = _create_golden_graph()
        config = _golden_config()

        result = execute_short_circuit(
            graph=graph,
            analysis_type=ExecutionAnalysisType.SC_3F,
            config=config,
            fault_node_id="BUS_MV",
            scenario="MIN",
        )

        notes = {n["branch_id"]: n for n in result.temperature_correction_notes}
        assert notes["C1"]["corrected"] is False
        assert notes["C1"]["theta_k_c"] is None

    def test_binding_unknown_scenario_raises(self):
        graph = _create_golden_graph()
        config = _golden_config()

        with pytest.raises(ShortCircuitBindingError, match="MAX/MIN"):
            execute_short_circuit(
                graph=graph,
                analysis_type=ExecutionAnalysisType.SC_3F,
                config=config,
                fault_node_id="BUS_MV",
                scenario="NOMINAL",  # type: ignore[arg-type]
            )


# =============================================================================
# 6. RESULT MAPPER UNIT TESTS
# =============================================================================


class TestResultMapper:
    """Unit tests for the short-circuit → ResultSet v1 mapper."""

    def test_mapper_produces_resultset(self):
        """Mapper transforms binding result to ResultSet."""
        graph = _create_golden_graph()
        config = _golden_config()
        run_id = uuid4()

        binding_result = execute_short_circuit(
            graph=graph,
            analysis_type=ExecutionAnalysisType.SC_3F,
            config=config,
            fault_node_id="BUS_MV",
        )

        rs = map_short_circuit_to_resultset_v1(
            binding_result=binding_result,
            run_id=run_id,
            graph=graph,
            validation_snapshot={"is_valid": True},
            readiness_snapshot={"ready": True},
        )

        assert isinstance(rs, ResultSet)
        assert rs.run_id == run_id
        assert rs.analysis_type == ExecutionAnalysisType.SC_3F
        assert len(rs.element_results) > 0
        assert len(rs.deterministic_signature) == 64

    def test_mapper_global_results_complete(self):
        """Mapper produces complete global results."""
        graph = _create_golden_graph()
        config = _golden_config()
        run_id = uuid4()

        binding_result = execute_short_circuit(
            graph=graph,
            analysis_type=ExecutionAnalysisType.SC_3F,
            config=config,
            fault_node_id="BUS_MV",
        )

        # Klucze P0.3 dokłada wrapper POZA zamrożonym mapperem — test ćwiczy
        # ten sam wzorzec kompozycji, jaki stosował dawny E3
        # (`application.execution_engine`, skasowany kartą CV-3.3-A, 2026-09-05).
        # ZNALEZISKO (poza tą kartą): `map_short_circuit_to_resultset_v1` i
        # `wzbogac_resultset_o_meta_bindingu` nie mają dziś ŻADNEGO konsumenta
        # produkcyjnego — E3 był ich jedynym wołającym w `src/`. Ten sam klaster
        # (`load_flow_to_resultset_v1.py::map_power_flow_to_resultset_v1`,
        # `protection_to_resultset_v1.py::map_protection_to_resultset_v1`,
        # `protection_to_overlay_v1.py::map_protection_to_overlay_v1`,
        # `sc_binding_meta.py`) wymaga osobnej karty kasacji (zbadanie
        # `_build_element_results`/`_build_global_results`, dzielonych krzyżowo
        # miedzy short_circuit_to_resultset_v1.py i protection_to_resultset_v1.py).
        rs = wzbogac_resultset_o_meta_bindingu(
            map_short_circuit_to_resultset_v1(
                binding_result=binding_result,
                run_id=run_id,
                graph=graph,
                validation_snapshot={},
                readiness_snapshot={},
            ),
            binding_result,
        )

        gr = rs.global_results
        assert gr["analysis_type"] == "SC_3F"
        assert gr["short_circuit_type"] == "3F"
        assert isinstance(gr["zkk_ohm"], dict)
        assert "re" in gr["zkk_ohm"]
        assert "im" in gr["zkk_ohm"]
        assert gr["contributions_count"] >= 1
        assert gr["white_box_steps_count"] >= 7
        # D-14b: guard sanity-bounds Ik'' wpięty na ścieżce konsumpcji (overlay/proof
        # czytają global_results). Golden MV → Ik'' wiarygodny.
        assert "ikss_sanity" in gr
        assert gr["ikss_sanity"]["status"] == "zweryfikowany"
        assert gr["ikss_sanity"]["in_range"] is True
        assert gr["ikss_sanity"]["voltage_band"] == "SN"
        assert gr["ikss_sanity"]["blocks_osd_package"] is False
        # Karta P0.3: scenario/override metadata additive on ResultSet v1.
        assert gr["scenario"] == "MAX"
        assert gr["c_factor_override"] is False
        assert gr["c_factor_auto"] == pytest.approx(1.10)

    def test_mapper_global_results_min_scenario_carries_temperature_notes(self):
        graph = _create_golden_graph()
        config = _golden_config()
        run_id = uuid4()

        binding_result = execute_short_circuit(
            graph=graph,
            analysis_type=ExecutionAnalysisType.SC_3F,
            config=config,
            fault_node_id="BUS_MV",
            scenario="MIN",
        )

        rs = wzbogac_resultset_o_meta_bindingu(
            map_short_circuit_to_resultset_v1(
                binding_result=binding_result,
                run_id=run_id,
                graph=graph,
                validation_snapshot={},
                readiness_snapshot={},
            ),
            binding_result,
        )

        gr = rs.global_results
        assert gr["scenario"] == "MIN"
        assert gr["c_factor"] == pytest.approx(1.00)
        assert "temperature_correction_notes" in gr
        assert len(gr["temperature_correction_notes"]) >= 1

    def test_mapper_deterministic(self):
        """Same binding result → same ResultSet signature."""
        graph = _create_golden_graph()
        config = _golden_config()
        run_id = uuid4()

        binding_result = execute_short_circuit(
            graph=graph,
            analysis_type=ExecutionAnalysisType.SC_3F,
            config=config,
            fault_node_id="BUS_MV",
        )

        rs1 = map_short_circuit_to_resultset_v1(
            binding_result=binding_result,
            run_id=run_id,
            graph=graph,
            validation_snapshot={},
            readiness_snapshot={},
        )
        rs2 = map_short_circuit_to_resultset_v1(
            binding_result=binding_result,
            run_id=run_id,
            graph=graph,
            validation_snapshot={},
            readiness_snapshot={},
        )

        assert rs1.deterministic_signature == rs2.deterministic_signature
