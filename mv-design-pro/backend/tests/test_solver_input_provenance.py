"""
Test parameter provenance tracing in solver-input.

INVARIANT: Every technical/numerical field in payload has a trace entry
with source_kind documenting its origin.
"""

from network_model.catalog.repository import CatalogRepository
from network_model.catalog.types import ConverterKind
from network_model.core.branch import (
    BranchType,
    LineBranch,
    LineImpedanceOverride,
)
from network_model.core.graph import NetworkGraph
from network_model.core.inverter import InverterSource
from network_model.core.node import Node, NodeType
from solver_input.builder import build_solver_input
from solver_input.contracts import SolverAnalysisType
from solver_input.provenance import compute_value_hash


def _make_network_with_catalog_line() -> tuple[NetworkGraph, CatalogRepository]:
    """Network with a line that has a catalog type_ref."""
    catalog = CatalogRepository.from_records(
        line_types=[
            {
                "id": "lt-afl70",
                "name": "AFL-6 70mm2",
                "params": {
                    "r_ohm_per_km": 0.420,
                    "x_ohm_per_km": 0.377,
                    "b_us_per_km": 2.84,
                    "rated_current_a": 210.0,
                },
            }
        ],
        cable_types=[],
        transformer_types=[],
    )

    g = NetworkGraph()
    g.add_node(
        Node(
            id="slack",
            name="Slack",
            node_type=NodeType.SLACK,
            voltage_level=15.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    g.add_node(
        Node(
            id="load",
            name="Load",
            node_type=NodeType.PQ,
            voltage_level=15.0,
            active_power=1.0,
            reactive_power=0.5,
        )
    )
    g.add_branch(
        LineBranch(
            id="line_cat",
            name="Cataloged Line",
            branch_type=BranchType.LINE,
            from_node_id="slack",
            to_node_id="load",
            type_ref="lt-afl70",
            length_km=2.0,
            rated_current_a=210.0,
            r_ohm_per_km=0.0,  # Should be overridden by catalog
            x_ohm_per_km=0.0,
            b_us_per_km=0.0,
        )
    )

    return g, catalog


def _make_network_with_override_line() -> tuple[NetworkGraph, CatalogRepository]:
    """Network with a line that has an impedance override."""
    catalog = CatalogRepository.from_records(
        line_types=[],
        cable_types=[],
        transformer_types=[],
    )

    g = NetworkGraph()
    g.add_node(
        Node(
            id="slack",
            name="Slack",
            node_type=NodeType.SLACK,
            voltage_level=15.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    g.add_node(
        Node(
            id="load",
            name="Load",
            node_type=NodeType.PQ,
            voltage_level=15.0,
            active_power=1.0,
            reactive_power=0.5,
        )
    )
    g.add_branch(
        LineBranch(
            id="line_ovr",
            name="Override Line",
            branch_type=BranchType.LINE,
            from_node_id="slack",
            to_node_id="load",
            r_ohm_per_km=0.420,
            x_ohm_per_km=0.377,
            b_us_per_km=2.84,
            length_km=5.0,
            rated_current_a=210.0,
            impedance_override=LineImpedanceOverride(
                r_total_ohm=2.5,
                x_total_ohm=2.0,
                b_total_us=15.0,
            ),
        )
    )

    return g, catalog


def _make_network_with_inverter() -> tuple[NetworkGraph, CatalogRepository]:
    """Network with an inverter source."""
    catalog = CatalogRepository.from_records(
        line_types=[],
        cable_types=[],
        transformer_types=[],
    )

    g = NetworkGraph()
    g.add_node(
        Node(
            id="slack",
            name="Slack",
            node_type=NodeType.SLACK,
            voltage_level=15.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    g.add_node(
        Node(
            id="pv_bus",
            name="PV Bus",
            node_type=NodeType.PQ,
            voltage_level=15.0,
            active_power=0.0,
            reactive_power=0.0,
        )
    )
    g.add_branch(
        LineBranch(
            id="line_pv",
            name="Line to PV",
            branch_type=BranchType.LINE,
            from_node_id="slack",
            to_node_id="pv_bus",
            r_ohm_per_km=0.420,
            x_ohm_per_km=0.377,
            b_us_per_km=2.84,
            length_km=1.0,
            rated_current_a=210.0,
        )
    )
    g.add_inverter_source(
        InverterSource(
            id="pv_1",
            name="PV Farma 1",
            node_id="pv_bus",
            type_ref="conv-pv-100",
            converter_kind=ConverterKind.PV,
            in_rated_a=350.0,
            k_sc=1.1,
        )
    )

    return g, catalog


class TestSolverInputProvenance:
    """Provenance trace completeness and correctness."""

    def test_catalog_source_kind_for_type_ref_line(self):
        """Line with catalog type_ref → all params have source_kind=CATALOG."""
        graph, catalog = _make_network_with_catalog_line()

        env = build_solver_input(
            graph=graph,
            catalog=catalog,
            case_id="c",
            enm_revision="r",
            analysis_type=SolverAnalysisType.SHORT_CIRCUIT_3F,
        )

        # Find trace entries for line_cat
        line_traces = [t for t in env.trace if t.element_ref == "line_cat"]
        assert len(line_traces) > 0, "No trace entries for cataloged line"

        # Impedance fields should be CATALOG-sourced
        impedance_traces = [
            t
            for t in line_traces
            if any(
                f in t.field_path
                for f in ["r_ohm_per_km", "x_ohm_per_km", "b_us_per_km", "rated_current_a"]
            )
        ]
        for trace in impedance_traces:
            assert (
                trace.source_kind == "CATALOG"
            ), f"Field {trace.field_path} should be CATALOG, got {trace.source_kind}"

    def test_catalog_ref_in_source_ref(self):
        """Catalog-sourced fields include catalog_ref in source_ref."""
        graph, catalog = _make_network_with_catalog_line()

        env = build_solver_input(
            graph=graph,
            catalog=catalog,
            case_id="c",
            enm_revision="r",
            analysis_type=SolverAnalysisType.SHORT_CIRCUIT_3F,
        )

        catalog_traces = [
            t for t in env.trace if t.source_kind == "CATALOG" and t.element_ref == "line_cat"
        ]
        for trace in catalog_traces:
            assert (
                "catalog_ref" in trace.source_ref
            ), f"CATALOG trace {trace.field_path} missing catalog_ref"
            assert trace.source_ref["catalog_ref"] == "lt-afl70"

    def test_override_source_kind(self):
        """Line with impedance_override → source_kind=OVERRIDE."""
        graph, catalog = _make_network_with_override_line()

        env = build_solver_input(
            graph=graph,
            catalog=catalog,
            case_id="c",
            enm_revision="r",
            analysis_type=SolverAnalysisType.SHORT_CIRCUIT_3F,
        )

        override_traces = [
            t
            for t in env.trace
            if t.element_ref == "line_ovr"
            and any(f in t.field_path for f in ["r_ohm_per_km", "x_ohm_per_km", "b_us_per_km"])
        ]
        for trace in override_traces:
            assert (
                trace.source_kind == "OVERRIDE"
            ), f"Field {trace.field_path} should be OVERRIDE, got {trace.source_kind}"
            assert "override_reason" in trace.source_ref

    def test_instance_source_kind_no_type_ref(self):
        """Line without type_ref or override → source_kind=DERIVED (instance params)."""
        catalog = CatalogRepository.from_records(
            line_types=[],
            cable_types=[],
            transformer_types=[],
        )
        g = NetworkGraph()
        g.add_node(
            Node(
                id="s",
                name="S",
                node_type=NodeType.SLACK,
                voltage_level=15.0,
                voltage_magnitude=1.0,
                voltage_angle=0.0,
            )
        )
        g.add_node(
            Node(
                id="l",
                name="L",
                node_type=NodeType.PQ,
                voltage_level=15.0,
                active_power=0.0,
                reactive_power=0.0,
            )
        )
        g.add_branch(
            LineBranch(
                id="line_inst",
                name="Instance Line",
                branch_type=BranchType.LINE,
                from_node_id="s",
                to_node_id="l",
                r_ohm_per_km=0.420,
                x_ohm_per_km=0.377,
                b_us_per_km=2.84,
                length_km=1.0,
                rated_current_a=210.0,
            )
        )

        env = build_solver_input(
            graph=g,
            catalog=catalog,
            case_id="c",
            enm_revision="r",
            analysis_type=SolverAnalysisType.SHORT_CIRCUIT_3F,
        )

        instance_traces = [
            t for t in env.trace if t.element_ref == "line_inst" and "r_ohm_per_km" in t.field_path
        ]
        assert len(instance_traces) == 1
        assert instance_traces[0].source_kind == "DERIVED"

    def test_value_hash_is_deterministic(self):
        """value_hash for same numeric value is identical across calls."""
        h1 = compute_value_hash(0.420)
        h2 = compute_value_hash(0.420)
        assert h1 == h2

        h3 = compute_value_hash(0.421)
        assert h1 != h3

    def test_provenance_summary_catalogs(self):
        """provenance_summary.catalog_refs_used contains used catalog refs."""
        graph, catalog = _make_network_with_catalog_line()

        env = build_solver_input(
            graph=graph,
            catalog=catalog,
            case_id="c",
            enm_revision="r",
            analysis_type=SolverAnalysisType.SHORT_CIRCUIT_3F,
        )

        assert "lt-afl70" in env.provenance_summary.catalog_refs_used

    def test_inverter_with_type_ref_has_catalog_trace(self):
        """Inverter source with type_ref has CATALOG trace entries."""
        graph, catalog = _make_network_with_inverter()

        env = build_solver_input(
            graph=graph,
            catalog=catalog,
            case_id="c",
            enm_revision="r",
            analysis_type=SolverAnalysisType.SHORT_CIRCUIT_3F,
        )

        pv_traces = [t for t in env.trace if t.element_ref == "pv_1"]
        assert len(pv_traces) > 0

        # type_ref is set → CATALOG source kind
        for trace in pv_traces:
            assert trace.source_kind == "CATALOG"

    def test_trace_entries_are_sorted(self):
        """Trace entries are sorted by (element_ref, field_path)."""
        graph, catalog = _make_network_with_catalog_line()

        env = build_solver_input(
            graph=graph,
            catalog=catalog,
            case_id="c",
            enm_revision="r",
            analysis_type=SolverAnalysisType.SHORT_CIRCUIT_3F,
        )

        trace_keys = [(t.element_ref, t.field_path) for t in env.trace]
        assert trace_keys == sorted(trace_keys), "Trace entries not sorted"

    def test_length_km_is_derived(self):
        """length_km always has source_kind=DERIVED (topology)."""
        graph, catalog = _make_network_with_catalog_line()

        env = build_solver_input(
            graph=graph,
            catalog=catalog,
            case_id="c",
            enm_revision="r",
            analysis_type=SolverAnalysisType.SHORT_CIRCUIT_3F,
        )

        length_traces = [t for t in env.trace if "length_km" in t.field_path]
        for trace in length_traces:
            assert trace.source_kind == "DERIVED"
