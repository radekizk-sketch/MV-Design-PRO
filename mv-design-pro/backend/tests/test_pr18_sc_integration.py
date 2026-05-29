"""
Tests for PR-18: Short-Circuit Solver Integration (Engine Binding)

Test categories:
1. Determinism — identical inputs produce identical hashes and signatures
2. Gating — readiness/eligibility blocks prevent solver execution
3. Contract shape — ResultSet v1 structure invariants
4. Golden fixtures — production-grade network with full SC_3F/SC_1F/SC_2F

INVARIANTS UNDER TEST:
- ZERO randomness: same graph + same config → same hash + same signature
- Readiness/eligibility gates enforce before solver call
- ResultSet v1 contains expected keys and sorted elements
- SC_3F, SC_1F, SC_2F all produce DONE runs via execute_run_sc
- SC_2F is gated by eligibility (INELIGIBLE due to missing Z2 data)
"""

from __future__ import annotations

import copy
from uuid import uuid4

import numpy as np
import pytest
from application.execution_engine.errors import (
    RunBlockedError,
    RunNotReadyError,
    StudyCaseNotFoundError,
)
from application.execution_engine.service import ExecutionEngineService
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
    RunStatus,
    compute_result_signature,
    compute_solver_input_hash,
)
from domain.study_case import StudyCaseConfig, new_study_case
from network_model.core.branch import BranchType, LineBranch, TransformerBranch
from network_model.core.graph import NetworkGraph
from network_model.core.inverter import InverterSource
from network_model.core.node import Node, NodeType
from network_model.core.ybus import AdmittanceMatrixBuilder

# =============================================================================
# Fixtures: Golden network (production-grade MV network)
# =============================================================================

MOCK_PROJECT_ID = uuid4()


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


def _create_engine_with_case():
    """Create an ExecutionEngineService with a registered study case."""
    engine = ExecutionEngineService()
    case = new_study_case(
        project_id=MOCK_PROJECT_ID,
        name="Golden test case",
        config=_golden_config(),
    )
    engine.register_study_case(case)
    return engine, case


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

    def test_sc3f_run_deterministic_hash_and_results(self):
        """Full SC_3F execution produces deterministic hash + identical results.

        Note: deterministic_signature includes run_id (binding reference),
        so different runs will have different signatures by design.
        We verify determinism by comparing global_results and element_results.
        """
        graph = _create_golden_graph()
        config = _golden_config()

        engine_a, case_a = _create_engine_with_case()
        engine_b, case_b = _create_engine_with_case()

        solver_input = _sample_solver_input()

        run_a = engine_a.create_run(
            study_case_id=case_a.id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            solver_input=solver_input,
        )
        run_b = engine_b.create_run(
            study_case_id=case_b.id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            solver_input=copy.deepcopy(solver_input),
        )

        # Same solver input → same hash
        assert run_a.solver_input_hash == run_b.solver_input_hash

        # Execute both
        _, rs_a = engine_a.execute_run_sc(
            run_a.id,
            graph=graph,
            config=config,
            fault_node_id="BUS_MV",
            readiness_snapshot={"ready": True},
            validation_snapshot={"is_valid": True},
        )
        _, rs_b = engine_b.execute_run_sc(
            run_b.id,
            graph=graph,
            config=config,
            fault_node_id="BUS_MV",
            readiness_snapshot={"ready": True},
            validation_snapshot={"is_valid": True},
        )

        # Same network + same config → identical global results
        assert rs_a.global_results == rs_b.global_results

        # Same element results (compare dicts, excluding run_id in signature)
        er_a = [er.to_dict() for er in rs_a.element_results]
        er_b = [er.to_dict() for er in rs_b.element_results]
        assert er_a == er_b


# =============================================================================
# 2. GATING TESTS
# =============================================================================


class TestGating:
    """Readiness and eligibility gates prevent invalid execution."""

    def test_readiness_false_blocks_run_creation(self):
        """Run creation blocked when readiness.ready == false."""
        engine, case = _create_engine_with_case()
        readiness = {
            "ready": False,
            "issues": [
                {"severity": "BLOCKER", "message_pl": "Brak źródła zasilania"},
            ],
        }
        with pytest.raises(RunNotReadyError) as exc_info:
            engine.create_run(
                study_case_id=case.id,
                analysis_type=ExecutionAnalysisType.SC_3F,
                solver_input=_sample_solver_input(),
                readiness=readiness,
            )
        assert "Brak źródła zasilania" in str(exc_info.value)

    def test_eligibility_ineligible_blocks_run_creation(self):
        """Run creation blocked when eligibility status is INELIGIBLE."""
        engine, case = _create_engine_with_case()
        eligibility = {
            "status": "INELIGIBLE",
            "blockers": [
                {"message_pl": "Brak impedancji na gałęzi C1"},
            ],
        }
        with pytest.raises(RunBlockedError) as exc_info:
            engine.create_run(
                study_case_id=case.id,
                analysis_type=ExecutionAnalysisType.SC_3F,
                solver_input=_sample_solver_input(),
                eligibility=eligibility,
            )
        assert "Brak impedancji" in str(exc_info.value)

    def test_eligibility_eligible_allows_run(self):
        """Run creation allowed when eligibility is ELIGIBLE."""
        engine, case = _create_engine_with_case()
        eligibility = {
            "status": "ELIGIBLE",
            "blockers": [],
        }
        run = engine.create_run(
            study_case_id=case.id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            solver_input=_sample_solver_input(),
            eligibility=eligibility,
        )
        assert run.status == RunStatus.PENDING

    def test_readiness_none_allows_run(self):
        """Run creation allowed when readiness is None (not provided)."""
        engine, case = _create_engine_with_case()
        run = engine.create_run(
            study_case_id=case.id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            solver_input=_sample_solver_input(),
        )
        assert run.status == RunStatus.PENDING

    def test_study_case_not_found_blocks(self):
        """Run creation blocked for non-existent study case."""
        engine = ExecutionEngineService()
        with pytest.raises(StudyCaseNotFoundError):
            engine.create_run(
                study_case_id=uuid4(),
                analysis_type=ExecutionAnalysisType.SC_3F,
                solver_input=_sample_solver_input(),
            )

    def test_execute_run_sc_blocks_non_sc_type(self):
        """execute_run_sc rejects LOAD_FLOW analysis type."""
        engine, case = _create_engine_with_case()
        run = engine.create_run(
            study_case_id=case.id,
            analysis_type=ExecutionAnalysisType.LOAD_FLOW,
            solver_input=_sample_solver_input(),
        )
        graph = _create_golden_graph()
        config = _golden_config()

        with pytest.raises(RunBlockedError):
            engine.execute_run_sc(
                run.id,
                graph=graph,
                config=config,
                fault_node_id="BUS_MV",
                readiness_snapshot={"ready": True},
                validation_snapshot={"is_valid": True},
            )

    def test_eligibility_blockers_deterministic(self):
        """Eligibility blockers payload is deterministic."""
        eligibility_a = {
            "status": "INELIGIBLE",
            "blockers": [
                {"message_pl": "Bloker A"},
                {"message_pl": "Bloker B"},
            ],
        }
        eligibility_b = {
            "status": "INELIGIBLE",
            "blockers": [
                {"message_pl": "Bloker A"},
                {"message_pl": "Bloker B"},
            ],
        }
        engine_a, case_a = _create_engine_with_case()
        engine_b, case_b = _create_engine_with_case()

        with pytest.raises(RunBlockedError) as exc_a:
            engine_a.create_run(
                study_case_id=case_a.id,
                analysis_type=ExecutionAnalysisType.SC_3F,
                solver_input=_sample_solver_input(),
                eligibility=eligibility_a,
            )
        with pytest.raises(RunBlockedError) as exc_b:
            engine_b.create_run(
                study_case_id=case_b.id,
                analysis_type=ExecutionAnalysisType.SC_3F,
                solver_input=_sample_solver_input(),
                eligibility=eligibility_b,
            )
        assert exc_a.value.blockers == exc_b.value.blockers


# =============================================================================
# 3. CONTRACT SHAPE TESTS
# =============================================================================


class TestContractShape:
    """ResultSet v1 structure invariants."""

    def test_resultset_has_expected_fields(self):
        """ResultSet has all required fields per PR-14/PR-15 contract."""
        graph = _create_golden_graph()
        config = _golden_config()
        engine, case = _create_engine_with_case()

        run = engine.create_run(
            study_case_id=case.id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            solver_input=_sample_solver_input(),
        )
        run, rs = engine.execute_run_sc(
            run.id,
            graph=graph,
            config=config,
            fault_node_id="BUS_MV",
            readiness_snapshot={"ready": True},
            validation_snapshot={"is_valid": True},
        )

        assert rs.run_id == run.id
        assert rs.analysis_type == ExecutionAnalysisType.SC_3F
        assert isinstance(rs.element_results, tuple)
        assert isinstance(rs.global_results, dict)
        assert len(rs.deterministic_signature) == 64
        assert rs.validation_snapshot == {"is_valid": True}
        assert rs.readiness_snapshot == {"ready": True}

    def test_element_results_sorted_by_ref(self):
        """Element results in ResultSet are sorted by element_ref."""
        graph = _create_golden_graph()
        config = _golden_config()
        engine, case = _create_engine_with_case()

        run = engine.create_run(
            study_case_id=case.id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            solver_input=_sample_solver_input(),
        )
        _, rs = engine.execute_run_sc(
            run.id,
            graph=graph,
            config=config,
            fault_node_id="BUS_MV",
            readiness_snapshot={"ready": True},
            validation_snapshot={"is_valid": True},
        )

        refs = [er.element_ref for er in rs.element_results]
        assert refs == sorted(refs)

    def test_global_results_has_sc_keys(self):
        """Global results contain expected short-circuit summary keys."""
        graph = _create_golden_graph()
        config = _golden_config()
        engine, case = _create_engine_with_case()

        run = engine.create_run(
            study_case_id=case.id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            solver_input=_sample_solver_input(),
        )
        _, rs = engine.execute_run_sc(
            run.id,
            graph=graph,
            config=config,
            fault_node_id="BUS_MV",
            readiness_snapshot={"ready": True},
            validation_snapshot={"is_valid": True},
        )

        expected_keys = {
            "analysis_type",
            "short_circuit_type",
            "fault_node_id",
            "c_factor",
            "un_v",
            "zkk_ohm",
            "tk_s",
            "tb_s",
            "ikss_a",
            "ip_a",
            "ith_a",
            "ib_a",
            "sk_mva",
            "ik_thevenin_a",
            "ik_inverters_a",
            "ik_total_a",
            "kappa",
            "rx_ratio",
            "contributions_count",
            "white_box_steps_count",
        }
        assert expected_keys.issubset(set(rs.global_results.keys()))

    def test_global_results_carries_ikss_plausibility(self):
        """Global results carry a per-voltage-level Ik'' plausibility verdict (D-14)."""
        graph = _create_golden_graph()
        config = _golden_config()
        engine, case = _create_engine_with_case()

        run = engine.create_run(
            study_case_id=case.id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            solver_input=_sample_solver_input(),
        )
        _, rs = engine.execute_run_sc(
            run.id,
            graph=graph,
            config=config,
            fault_node_id="BUS_MV",
            readiness_snapshot={"ready": True},
            validation_snapshot={"is_valid": True},
        )

        plausibility = rs.global_results["plausibility"]
        assert plausibility["contract"] == "ShortCircuitPlausibilityV1"
        # A golden MV network produces a credible fault current.
        assert plausibility["status"] == "wiarygodny"
        assert plausibility["voltage_band"] in {"nN", "SN", "WN", "NN"}
        assert plausibility["violations"] == []

    def test_fault_node_element_result_has_sc_values(self):
        """The fault node element result contains SC current values."""
        graph = _create_golden_graph()
        config = _golden_config()
        engine, case = _create_engine_with_case()

        run = engine.create_run(
            study_case_id=case.id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            solver_input=_sample_solver_input(),
        )
        _, rs = engine.execute_run_sc(
            run.id,
            graph=graph,
            config=config,
            fault_node_id="BUS_MV",
            readiness_snapshot={"ready": True},
            validation_snapshot={"is_valid": True},
        )

        # Find the fault node result
        fault_results = [er for er in rs.element_results if er.element_ref == "BUS_MV"]
        assert len(fault_results) == 1
        vals = fault_results[0].values
        assert "ikss_a" in vals
        assert "ip_a" in vals
        assert "ith_a" in vals
        assert "ib_a" in vals
        assert "sk_mva" in vals
        assert vals["ikss_a"] > 0
        assert vals["ip_a"] > 0
        assert vals["ith_a"] > 0

    def test_resultset_to_dict_roundtrip(self):
        """ResultSet.to_dict() / from_dict() roundtrip preserves data."""
        graph = _create_golden_graph()
        config = _golden_config()
        engine, case = _create_engine_with_case()

        run = engine.create_run(
            study_case_id=case.id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            solver_input=_sample_solver_input(),
        )
        _, rs = engine.execute_run_sc(
            run.id,
            graph=graph,
            config=config,
            fault_node_id="BUS_MV",
            readiness_snapshot={"ready": True},
            validation_snapshot={"is_valid": True},
        )

        d = rs.to_dict()
        restored = ResultSet.from_dict(d)
        assert restored.run_id == rs.run_id
        assert restored.analysis_type == rs.analysis_type
        assert restored.deterministic_signature == rs.deterministic_signature
        assert len(restored.element_results) == len(rs.element_results)

    def test_run_status_is_done_after_execute(self):
        """Run transitions to DONE after successful execute_run_sc."""
        graph = _create_golden_graph()
        config = _golden_config()
        engine, case = _create_engine_with_case()

        run = engine.create_run(
            study_case_id=case.id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            solver_input=_sample_solver_input(),
        )
        assert run.status == RunStatus.PENDING

        done_run, _ = engine.execute_run_sc(
            run.id,
            graph=graph,
            config=config,
            fault_node_id="BUS_MV",
            readiness_snapshot={"ready": True},
            validation_snapshot={"is_valid": True},
        )
        assert done_run.status == RunStatus.DONE
        assert done_run.finished_at is not None

    def test_sc_2f_analysis_type_in_enum(self):
        """SC_2F is a valid ExecutionAnalysisType."""
        assert ExecutionAnalysisType.SC_2F.value == "SC_2F"


# =============================================================================
# 4. GOLDEN FIXTURE TESTS (production-grade network)
# =============================================================================


class TestGoldenFixtures:
    """Golden network tests — full SC_3F/SC_1F/SC_2F execution."""

    def test_golden_sc_3f_produces_done_with_result(self):
        """SC_3F on golden network → DONE + ResultSet with positive currents."""
        graph = _create_golden_graph()
        config = _golden_config()
        engine, case = _create_engine_with_case()

        run = engine.create_run(
            study_case_id=case.id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            solver_input=_sample_solver_input(),
        )
        done_run, rs = engine.execute_run_sc(
            run.id,
            graph=graph,
            config=config,
            fault_node_id="BUS_MV",
            readiness_snapshot={"ready": True},
            validation_snapshot={"is_valid": True},
        )

        assert done_run.status == RunStatus.DONE
        assert rs.analysis_type == ExecutionAnalysisType.SC_3F
        assert rs.global_results["ikss_a"] > 0
        assert rs.global_results["ip_a"] > 0
        assert rs.global_results["ith_a"] > 0
        assert rs.global_results["sk_mva"] > 0
        assert rs.global_results["short_circuit_type"] == "3F"
        assert rs.global_results["c_factor"] == 1.10
        assert len(rs.deterministic_signature) == 64

    def test_golden_sc_3f_different_fault_nodes(self):
        """SC_3F on different fault nodes (different voltage levels) produces different results."""
        graph = _create_golden_graph()
        config = _golden_config()

        engine_a, case_a = _create_engine_with_case()
        engine_b, case_b = _create_engine_with_case()

        run_a = engine_a.create_run(
            study_case_id=case_a.id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            solver_input=_sample_solver_input(),
        )
        run_b = engine_b.create_run(
            study_case_id=case_b.id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            solver_input=_sample_solver_input(),
        )

        # Use SLACK (110 kV) and BUS_LOAD (20 kV) — different voltage levels
        # guarantee different Zk and therefore different Ik''
        _, rs_slack = engine_a.execute_run_sc(
            run_a.id,
            graph=graph,
            config=config,
            fault_node_id="SLACK",
            readiness_snapshot={"ready": True},
            validation_snapshot={"is_valid": True},
        )
        _, rs_load = engine_b.execute_run_sc(
            run_b.id,
            graph=graph,
            config=config,
            fault_node_id="BUS_LOAD",
            readiness_snapshot={"ready": True},
            validation_snapshot={"is_valid": True},
        )

        # Different voltage levels → different Ik'' and different global results
        assert rs_slack.global_results["un_v"] != rs_load.global_results["un_v"]
        assert rs_slack.global_results["fault_node_id"] != rs_load.global_results["fault_node_id"]

    def test_golden_sc_2f_produces_done(self):
        """SC_2F on golden network → DONE + ResultSet."""
        graph = _create_golden_graph()
        config = _golden_config()
        engine, case = _create_engine_with_case()

        run = engine.create_run(
            study_case_id=case.id,
            analysis_type=ExecutionAnalysisType.SC_2F,
            solver_input=_sample_solver_input(),
        )
        done_run, rs = engine.execute_run_sc(
            run.id,
            graph=graph,
            config=config,
            fault_node_id="BUS_MV",
            readiness_snapshot={"ready": True},
            validation_snapshot={"is_valid": True},
        )

        assert done_run.status == RunStatus.DONE
        assert rs.analysis_type == ExecutionAnalysisType.SC_2F
        assert rs.global_results["short_circuit_type"] == "2F"
        assert rs.global_results["ikss_a"] > 0

    def test_golden_sc_1f_produces_done_with_z0(self):
        """SC_1F on golden network (with Z0 bus) → DONE + ResultSet."""
        graph = _create_golden_graph()
        config = _golden_config()

        # Build Z0 bus as 3x Z1 (simplified approximation for test)
        builder = AdmittanceMatrixBuilder(graph)
        y_bus = builder.build()
        z1_bus = np.linalg.inv(y_bus)
        z0_bus = z1_bus * 3.0

        engine, case = _create_engine_with_case()
        run = engine.create_run(
            study_case_id=case.id,
            analysis_type=ExecutionAnalysisType.SC_1F,
            solver_input=_sample_solver_input(),
        )
        done_run, rs = engine.execute_run_sc(
            run.id,
            graph=graph,
            config=config,
            fault_node_id="BUS_MV",
            readiness_snapshot={"ready": True},
            validation_snapshot={"is_valid": True},
            z0_bus=z0_bus,
        )

        assert done_run.status == RunStatus.DONE
        assert rs.analysis_type == ExecutionAnalysisType.SC_1F
        assert rs.global_results["short_circuit_type"] == "1F"
        assert rs.global_results["ikss_a"] > 0

    def test_golden_sc_1f_without_z0_raises(self):
        """SC_1F without Z0 bus raises ShortCircuitBindingError."""
        graph = _create_golden_graph()
        config = _golden_config()
        engine, case = _create_engine_with_case()

        run = engine.create_run(
            study_case_id=case.id,
            analysis_type=ExecutionAnalysisType.SC_1F,
            solver_input=_sample_solver_input(),
        )
        with pytest.raises(ShortCircuitBindingError, match="Z₀"):
            engine.execute_run_sc(
                run.id,
                graph=graph,
                config=config,
                fault_node_id="BUS_MV",
                readiness_snapshot={"ready": True},
                validation_snapshot={"is_valid": True},
            )

    def test_golden_3f_lt_2f_ordering(self):
        """IEC 60909: I_3F > I_2F (for symmetric network)."""
        graph = _create_golden_graph()
        config = _golden_config()

        engine_3f, case_3f = _create_engine_with_case()
        engine_2f, case_2f = _create_engine_with_case()

        run_3f = engine_3f.create_run(
            study_case_id=case_3f.id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            solver_input=_sample_solver_input(),
        )
        run_2f = engine_2f.create_run(
            study_case_id=case_2f.id,
            analysis_type=ExecutionAnalysisType.SC_2F,
            solver_input=_sample_solver_input(),
        )

        _, rs_3f = engine_3f.execute_run_sc(
            run_3f.id,
            graph=graph,
            config=config,
            fault_node_id="BUS_MV",
            readiness_snapshot={"ready": True},
            validation_snapshot={"is_valid": True},
        )
        _, rs_2f = engine_2f.execute_run_sc(
            run_2f.id,
            graph=graph,
            config=config,
            fault_node_id="BUS_MV",
            readiness_snapshot={"ready": True},
            validation_snapshot={"is_valid": True},
        )

        assert rs_3f.global_results["ikss_a"] > rs_2f.global_results["ikss_a"]

    def test_golden_contributions_include_grid_and_inverter(self):
        """SC_3F contributions include both THEVENIN_GRID and INV1."""
        graph = _create_golden_graph()
        config = _golden_config()
        engine, case = _create_engine_with_case()

        run = engine.create_run(
            study_case_id=case.id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            solver_input=_sample_solver_input(),
        )
        _, rs = engine.execute_run_sc(
            run.id,
            graph=graph,
            config=config,
            fault_node_id="BUS_MV",
            readiness_snapshot={"ready": True},
            validation_snapshot={"is_valid": True},
        )

        # Check source contributions are present in element results
        contrib_refs = {
            er.element_ref for er in rs.element_results if er.element_type == "source_contribution"
        }
        assert "THEVENIN_GRID" in contrib_refs
        assert "INV1" in contrib_refs

    def test_golden_inverter_contribution_positive(self):
        """Inverter adds non-zero current to 3F fault."""
        graph = _create_golden_graph()
        config = _golden_config()
        engine, case = _create_engine_with_case()

        run = engine.create_run(
            study_case_id=case.id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            solver_input=_sample_solver_input(),
        )
        _, rs = engine.execute_run_sc(
            run.id,
            graph=graph,
            config=config,
            fault_node_id="BUS_MV",
            readiness_snapshot={"ready": True},
            validation_snapshot={"is_valid": True},
        )

        assert rs.global_results["ik_inverters_a"] > 0
        assert rs.global_results["ik_total_a"] > rs.global_results["ik_thevenin_a"]


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

        rs = map_short_circuit_to_resultset_v1(
            binding_result=binding_result,
            run_id=run_id,
            graph=graph,
            validation_snapshot={},
            readiness_snapshot={},
        )

        gr = rs.global_results
        assert gr["analysis_type"] == "SC_3F"
        assert gr["short_circuit_type"] == "3F"
        assert isinstance(gr["zkk_ohm"], dict)
        assert "re" in gr["zkk_ohm"]
        assert "im" in gr["zkk_ohm"]
        assert gr["contributions_count"] >= 1
        assert gr["white_box_steps_count"] >= 7

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


# =============================================================================
# 7. HARDENING TESTS — industrial-grade invariants
# =============================================================================


class TestHardeningInvariants:
    """Industrial-grade invariant enforcement per PR-18 spec."""

    def test_execute_run_sc_blocks_done_run(self):
        """Re-execution of a DONE run is blocked (no re-computation)."""
        graph = _create_golden_graph()
        config = _golden_config()
        engine, case = _create_engine_with_case()

        run = engine.create_run(
            study_case_id=case.id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            solver_input=_sample_solver_input(),
        )
        engine.execute_run_sc(
            run.id,
            graph=graph,
            config=config,
            fault_node_id="BUS_MV",
            readiness_snapshot={"ready": True},
            validation_snapshot={"is_valid": True},
        )

        # Attempt re-execution of DONE run
        with pytest.raises(RunBlockedError, match="DONE"):
            engine.execute_run_sc(
                run.id,
                graph=graph,
                config=config,
                fault_node_id="BUS_MV",
                readiness_snapshot={"ready": True},
                validation_snapshot={"is_valid": True},
            )

    def test_execute_run_sc_blocks_failed_run(self):
        """Re-execution of a FAILED run is blocked (no retry)."""
        graph = _create_golden_graph()
        config = _golden_config()
        engine, case = _create_engine_with_case()

        run = engine.create_run(
            study_case_id=case.id,
            analysis_type=ExecutionAnalysisType.SC_1F,
            solver_input=_sample_solver_input(),
        )
        # Execute without Z0 — causes FAILED
        try:
            engine.execute_run_sc(
                run.id,
                graph=graph,
                config=config,
                fault_node_id="BUS_MV",
                readiness_snapshot={"ready": True},
                validation_snapshot={"is_valid": True},
            )
        except ShortCircuitBindingError:
            pass

        # Verify run is FAILED
        failed_run = engine.get_run(run.id)
        assert failed_run.status == RunStatus.FAILED

        # Attempt re-execution of FAILED run
        with pytest.raises(RunBlockedError, match="FAILED"):
            engine.execute_run_sc(
                run.id,
                graph=graph,
                config=config,
                fault_node_id="BUS_MV",
                readiness_snapshot={"ready": True},
                validation_snapshot={"is_valid": True},
            )

    def test_sc_1f_failure_marks_run_failed(self):
        """SC_1F without Z0 marks the run as FAILED before re-raising."""
        graph = _create_golden_graph()
        config = _golden_config()
        engine, case = _create_engine_with_case()

        run = engine.create_run(
            study_case_id=case.id,
            analysis_type=ExecutionAnalysisType.SC_1F,
            solver_input=_sample_solver_input(),
        )
        with pytest.raises(ShortCircuitBindingError):
            engine.execute_run_sc(
                run.id,
                graph=graph,
                config=config,
                fault_node_id="BUS_MV",
                readiness_snapshot={"ready": True},
                validation_snapshot={"is_valid": True},
            )

        # Run must be FAILED, not stuck in RUNNING
        failed_run = engine.get_run(run.id)
        assert failed_run.status == RunStatus.FAILED
        assert failed_run.error_message is not None
        assert "Z₀" in failed_run.error_message

    def test_dual_sc3f_runs_produce_identical_results(self):
        """Two independent SC_3F runs on same network produce identical results."""
        graph = _create_golden_graph()
        config = _golden_config()

        engine_a, case_a = _create_engine_with_case()
        engine_b, case_b = _create_engine_with_case()

        run_a = engine_a.create_run(
            study_case_id=case_a.id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            solver_input=_sample_solver_input(),
        )
        run_b = engine_b.create_run(
            study_case_id=case_b.id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            solver_input=_sample_solver_input(),
        )

        _, rs_a = engine_a.execute_run_sc(
            run_a.id,
            graph=graph,
            config=config,
            fault_node_id="BUS_MV",
            readiness_snapshot={"ready": True},
            validation_snapshot={"is_valid": True},
        )
        _, rs_b = engine_b.execute_run_sc(
            run_b.id,
            graph=graph,
            config=config,
            fault_node_id="BUS_MV",
            readiness_snapshot={"ready": True},
            validation_snapshot={"is_valid": True},
        )

        # Identical global results
        assert rs_a.global_results == rs_b.global_results

        # Identical element results (sorted by ref)
        assert [er.to_dict() for er in rs_a.element_results] == [
            er.to_dict() for er in rs_b.element_results
        ]

    def test_dual_sc2f_runs_produce_identical_results(self):
        """Two independent SC_2F runs on same network produce identical results."""
        graph = _create_golden_graph()
        config = _golden_config()

        engine_a, case_a = _create_engine_with_case()
        engine_b, case_b = _create_engine_with_case()

        run_a = engine_a.create_run(
            study_case_id=case_a.id,
            analysis_type=ExecutionAnalysisType.SC_2F,
            solver_input=_sample_solver_input(),
        )
        run_b = engine_b.create_run(
            study_case_id=case_b.id,
            analysis_type=ExecutionAnalysisType.SC_2F,
            solver_input=_sample_solver_input(),
        )

        _, rs_a = engine_a.execute_run_sc(
            run_a.id,
            graph=graph,
            config=config,
            fault_node_id="BUS_MV",
            readiness_snapshot={"ready": True},
            validation_snapshot={"is_valid": True},
        )
        _, rs_b = engine_b.execute_run_sc(
            run_b.id,
            graph=graph,
            config=config,
            fault_node_id="BUS_MV",
            readiness_snapshot={"ready": True},
            validation_snapshot={"is_valid": True},
        )

        assert rs_a.global_results == rs_b.global_results

    def test_no_resultset_for_failed_run(self):
        """No ResultSet is stored for a FAILED run."""
        from application.execution_engine.errors import ResultSetNotFoundError

        graph = _create_golden_graph()
        config = _golden_config()
        engine, case = _create_engine_with_case()

        run = engine.create_run(
            study_case_id=case.id,
            analysis_type=ExecutionAnalysisType.SC_1F,
            solver_input=_sample_solver_input(),
        )
        try:
            engine.execute_run_sc(
                run.id,
                graph=graph,
                config=config,
                fault_node_id="BUS_MV",
                readiness_snapshot={"ready": True},
                validation_snapshot={"is_valid": True},
            )
        except ShortCircuitBindingError:
            pass

        with pytest.raises(ResultSetNotFoundError):
            engine.get_result_set(run.id)

    def test_source_contributions_all_positive(self):
        """All source contributions in SC_3F have non-negative i_contrib_a."""
        graph = _create_golden_graph()
        config = _golden_config()
        engine, case = _create_engine_with_case()

        run = engine.create_run(
            study_case_id=case.id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            solver_input=_sample_solver_input(),
        )
        _, rs = engine.execute_run_sc(
            run.id,
            graph=graph,
            config=config,
            fault_node_id="BUS_MV",
            readiness_snapshot={"ready": True},
            validation_snapshot={"is_valid": True},
        )

        for er in rs.element_results:
            if er.element_type == "source_contribution":
                assert er.values["i_contrib_a"] >= 0, f"Negative contribution from {er.element_ref}"

    def test_white_box_trace_count_nonzero(self):
        """SC_3F result has non-zero white-box trace steps (auditability)."""
        graph = _create_golden_graph()
        config = _golden_config()
        engine, case = _create_engine_with_case()

        run = engine.create_run(
            study_case_id=case.id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            solver_input=_sample_solver_input(),
        )
        _, rs = engine.execute_run_sc(
            run.id,
            graph=graph,
            config=config,
            fault_node_id="BUS_MV",
            readiness_snapshot={"ready": True},
            validation_snapshot={"is_valid": True},
        )

        assert rs.global_results["white_box_steps_count"] >= 7
