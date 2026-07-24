"""Tests for V12S-011: element_ref_id in ResultSet element results.

V12S-011: Solver results carry element_ref_id (additive, Optional[str], default None).
The result_mapping layer populates it from an UUID→ref_id map when provided.
FE can then resolve results by ref_id without a reverse UUID lookup.

Invariants tested:
  1. ElementResult.element_ref_id defaults to None (backward compat).
  2. to_dict() omits element_ref_id when None; includes it when set.
  3. from_dict() round-trips both None and string values.
  4. SC mapper propagates element_ref_id from enm_ref_id_map.
  5. SC mapper works without enm_ref_id_map (backward compat, all None).
  6. Determinism: same enm_ref_id_map → same element_ref_id values.
  7. Partial map: only matched UUIDs get ref_id, others remain None.
  8. ResultSet to_dict / from_dict round-trips element_ref_id.
"""

from __future__ import annotations

from uuid import UUID, uuid4

from application.result_mapping.short_circuit_to_resultset_v1 import (
    map_short_circuit_to_resultset_v1,
)
from application.solvers.short_circuit_binding import (
    ShortCircuitBindingResult,
    execute_short_circuit,
)
from domain.execution import ElementResult, ResultSet
from domain.execution import ExecutionAnalysisType as EAT
from domain.study_case import StudyCaseConfig
from network_model.core.branch import BranchType, LineBranch, TransformerBranch
from network_model.core.graph import NetworkGraph
from network_model.core.inverter import InverterSource
from network_model.core.node import Node, NodeType

# ---------------------------------------------------------------------------
# Minimal network fixture
# ---------------------------------------------------------------------------


def _build_graph() -> NetworkGraph:
    graph = NetworkGraph()
    graph.add_node(
        Node(
            id="SLACK",
            name="Stacja WN",
            node_type=NodeType.PQ,
            voltage_level=110.0,
            active_power=0.0,
            reactive_power=0.0,
        )
    )
    graph.add_node(
        Node(
            id="BUS_SN",
            name="Szyna SN",
            node_type=NodeType.PQ,
            voltage_level=20.0,
            active_power=5.0,
            reactive_power=2.0,
        )
    )
    graph.add_node(
        Node(
            id="BUS_LOAD",
            name="Szyna odbiorcza",
            node_type=NodeType.PQ,
            voltage_level=20.0,
            active_power=10.0,
            reactive_power=3.0,
        )
    )
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
    graph.add_branch(
        TransformerBranch(
            id="T1",
            name="Transformator T1",
            branch_type=BranchType.TRANSFORMER,
            from_node_id="SLACK",
            to_node_id="BUS_SN",
            in_service=True,
            rated_power_mva=16.0,
            voltage_hv_kv=110.0,
            voltage_lv_kv=20.0,
            uk_percent=10.0,
            pk_kw=100.0,
            i0_percent=0.5,
            p0_kw=20.0,
            vector_group="Dyn11",
            tap_position=0,
            tap_step_percent=2.5,
            type_ref="TRAFO_110_20_16MVA",
        )
    )
    graph.add_branch(
        LineBranch(
            id="CAB1",
            name="Kabel CAB1",
            branch_type=BranchType.CABLE,
            from_node_id="BUS_SN",
            to_node_id="BUS_LOAD",
            in_service=True,
            r_ohm_per_km=0.125,
            x_ohm_per_km=0.08,
            b_us_per_km=260.0,
            length_km=2.0,
            rated_current_a=300.0,
            type_ref="YAKY_3x240",
        )
    )
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
    graph.add_inverter_source(
        InverterSource(
            id="INV1",
            name="Falownik PV 1",
            node_id="BUS_LOAD",
            in_rated_a=80.0,
            k_sc=1.1,
            contributes_negative_sequence=False,
            contributes_zero_sequence=False,
            in_service=True,
        )
    )
    return graph


def _sc_config() -> StudyCaseConfig:
    return StudyCaseConfig(
        c_factor_max=1.10,
        c_factor_min=0.95,
        thermal_time_seconds=1.0,
        include_inverter_contribution=True,
    )


def _binding_result() -> ShortCircuitBindingResult:
    graph = _build_graph()
    config = _sc_config()
    return execute_short_circuit(
        graph=graph,
        fault_node_id="BUS_LOAD",
        analysis_type=EAT.SC_3F,
        config=config,
    )


def _run_id() -> UUID:
    return uuid4()


# ---------------------------------------------------------------------------
# Unit tests: ElementResult
# ---------------------------------------------------------------------------


class TestElementResultDefault:
    def test_element_ref_id_defaults_to_none(self) -> None:
        er = ElementResult(element_ref="uuid-abc", element_type="bus")
        assert er.element_ref_id is None

    def test_to_dict_omits_element_ref_id_when_none(self) -> None:
        er = ElementResult(element_ref="uuid-abc", element_type="bus")
        d = er.to_dict()
        assert "element_ref_id" not in d

    def test_to_dict_includes_element_ref_id_when_set(self) -> None:
        er = ElementResult(
            element_ref="uuid-abc",
            element_type="bus",
            element_ref_id="bus_sn_01",
        )
        d = er.to_dict()
        assert d["element_ref_id"] == "bus_sn_01"

    def test_to_dict_preserves_existing_fields(self) -> None:
        er = ElementResult(
            element_ref="uuid-abc",
            element_type="bus",
            values={"ikss_a": 1234.5},
            element_ref_id="bus_sn_01",
        )
        d = er.to_dict()
        assert d["element_ref"] == "uuid-abc"
        assert d["element_type"] == "bus"
        assert d["values"]["ikss_a"] == 1234.5
        assert d["element_ref_id"] == "bus_sn_01"


class TestElementResultRoundTrip:
    def test_from_dict_without_element_ref_id(self) -> None:
        d = {"element_ref": "uuid-abc", "element_type": "bus", "values": {}}
        er = ElementResult.from_dict(d)
        assert er.element_ref_id is None

    def test_from_dict_with_element_ref_id(self) -> None:
        d = {
            "element_ref": "uuid-abc",
            "element_type": "bus",
            "values": {},
            "element_ref_id": "bus_ref_01",
        }
        er = ElementResult.from_dict(d)
        assert er.element_ref_id == "bus_ref_01"

    def test_round_trip_with_ref_id(self) -> None:
        er = ElementResult(
            element_ref="uuid-xyz",
            element_type="source_contribution",
            values={"i_contrib_a": 500.0},
            element_ref_id="src_gpz_01",
        )
        er2 = ElementResult.from_dict(er.to_dict())
        assert er2 == er

    def test_round_trip_without_ref_id(self) -> None:
        er = ElementResult(
            element_ref="uuid-xyz",
            element_type="bus",
            values={"ikss_a": 2000.0},
        )
        er2 = ElementResult.from_dict(er.to_dict())
        assert er2 == er


# ---------------------------------------------------------------------------
# SC mapper: enm_ref_id_map propagation
# ---------------------------------------------------------------------------


class TestSCMapperRefIdPropagation:
    def test_mapper_without_map_all_ref_ids_none(self) -> None:
        br = _binding_result()
        rs = map_short_circuit_to_resultset_v1(
            binding_result=br,
            run_id=_run_id(),
            graph=_build_graph(),
            validation_snapshot={},
            readiness_snapshot={},
        )
        for er in rs.element_results:
            assert er.element_ref_id is None

    def test_mapper_with_empty_map_all_ref_ids_none(self) -> None:
        br = _binding_result()
        rs = map_short_circuit_to_resultset_v1(
            binding_result=br,
            run_id=_run_id(),
            graph=_build_graph(),
            validation_snapshot={},
            readiness_snapshot={},
            enm_ref_id_map={},
        )
        for er in rs.element_results:
            assert er.element_ref_id is None

    def test_mapper_with_full_map_populates_ref_ids(self) -> None:
        br = _binding_result()
        enm_map = {
            "BUS_LOAD": "bus_load_ref",
            "INV1": "src_inv1_ref",
        }
        rs = map_short_circuit_to_resultset_v1(
            binding_result=br,
            run_id=_run_id(),
            graph=_build_graph(),
            validation_snapshot={},
            readiness_snapshot={},
            enm_ref_id_map=enm_map,
        )
        bus_results = [er for er in rs.element_results if er.element_type == "bus"]
        assert len(bus_results) == 1
        assert bus_results[0].element_ref_id == "bus_load_ref"

    def test_mapper_partial_map_only_matched_get_ref_id(self) -> None:
        br = _binding_result()
        enm_map = {"BUS_LOAD": "bus_load_ref"}
        rs = map_short_circuit_to_resultset_v1(
            binding_result=br,
            run_id=_run_id(),
            graph=_build_graph(),
            validation_snapshot={},
            readiness_snapshot={},
            enm_ref_id_map=enm_map,
        )
        bus_results = [er for er in rs.element_results if er.element_type == "bus"]
        contrib_results = [
            er for er in rs.element_results if er.element_type == "source_contribution"
        ]
        assert bus_results[0].element_ref_id == "bus_load_ref"
        for cr in contrib_results:
            assert cr.element_ref_id is None

    def test_mapper_deterministic_with_same_map(self) -> None:
        br = _binding_result()
        enm_map = {"BUS_LOAD": "bus_load_ref", "INV1": "inv1_ref"}
        run_id = uuid4()
        rs1 = map_short_circuit_to_resultset_v1(
            binding_result=br,
            run_id=run_id,
            graph=_build_graph(),
            validation_snapshot={},
            readiness_snapshot={},
            enm_ref_id_map=enm_map,
        )
        rs2 = map_short_circuit_to_resultset_v1(
            binding_result=br,
            run_id=run_id,
            graph=_build_graph(),
            validation_snapshot={},
            readiness_snapshot={},
            enm_ref_id_map=enm_map,
        )
        assert [er.element_ref_id for er in rs1.element_results] == [
            er.element_ref_id for er in rs2.element_results
        ]

    def test_mapper_backward_compat_signature_unchanged(self) -> None:
        """Omitting enm_ref_id_map should not affect deterministic_signature value."""
        br = _binding_result()
        run_id = uuid4()
        rs_no_map = map_short_circuit_to_resultset_v1(
            binding_result=br,
            run_id=run_id,
            graph=_build_graph(),
            validation_snapshot={},
            readiness_snapshot={},
        )
        rs_empty_map = map_short_circuit_to_resultset_v1(
            binding_result=br,
            run_id=run_id,
            graph=_build_graph(),
            validation_snapshot={},
            readiness_snapshot={},
            enm_ref_id_map={},
        )
        assert rs_no_map.deterministic_signature == rs_empty_map.deterministic_signature


# ---------------------------------------------------------------------------
# ResultSet serialization with element_ref_id
# ---------------------------------------------------------------------------


class TestResultSetSerializationWithRefId:
    def test_resultset_to_dict_includes_element_ref_id(self) -> None:
        br = _binding_result()
        enm_map = {"BUS_LOAD": "bus_load_ref"}
        rs = map_short_circuit_to_resultset_v1(
            binding_result=br,
            run_id=_run_id(),
            graph=_build_graph(),
            validation_snapshot={},
            readiness_snapshot={},
            enm_ref_id_map=enm_map,
        )
        d = rs.to_dict()
        bus_rows = [er for er in d["element_results"] if er["element_type"] == "bus"]
        assert len(bus_rows) == 1
        assert bus_rows[0]["element_ref_id"] == "bus_load_ref"

    def test_resultset_to_dict_omits_element_ref_id_when_none(self) -> None:
        br = _binding_result()
        rs = map_short_circuit_to_resultset_v1(
            binding_result=br,
            run_id=_run_id(),
            graph=_build_graph(),
            validation_snapshot={},
            readiness_snapshot={},
        )
        d = rs.to_dict()
        for er in d["element_results"]:
            assert "element_ref_id" not in er

    def test_resultset_from_dict_round_trip_with_ref_id(self) -> None:
        br = _binding_result()
        enm_map = {"BUS_LOAD": "bus_load_ref", "INV1": "inv1_ref"}
        rs = map_short_circuit_to_resultset_v1(
            binding_result=br,
            run_id=_run_id(),
            graph=_build_graph(),
            validation_snapshot={},
            readiness_snapshot={},
            enm_ref_id_map=enm_map,
        )
        d = rs.to_dict()
        rs2 = ResultSet.from_dict(d)
        for er, er2 in zip(rs.element_results, rs2.element_results, strict=True):
            assert er.element_ref_id == er2.element_ref_id
