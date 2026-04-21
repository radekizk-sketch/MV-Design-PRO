"""Tests for ENM → NetworkGraph mapping and roundtrip to solver."""

from enm.mapping import map_enm_to_network_graph
from enm.models import (
    Bus,
    EnergyNetworkModel,
    ENMHeader,
    Load,
    OverheadLine,
    Source,
    SwitchBranch,
    Transformer,
)
from network_model.core.node import NodeType


def _make_enm(**kwargs) -> EnergyNetworkModel:
    return EnergyNetworkModel(header=ENMHeader(name="Test"), **kwargs)


class TestBasicMapping:
    def test_empty_enm_empty_graph(self):
        graph = map_enm_to_network_graph(_make_enm())
        assert len(graph.nodes) == 0

    def test_single_bus_to_node(self):
        enm = _make_enm(
            buses=[Bus(ref_id="b1", name="Bus 1", voltage_kv=15)],
        )
        graph = map_enm_to_network_graph(enm)
        assert len(graph.nodes) == 1
        node = list(graph.nodes.values())[0]
        assert node.name == "Bus 1"
        assert node.voltage_level == 15.0
        assert node.node_type == NodeType.PQ

    def test_source_bus_is_slack(self):
        enm = _make_enm(
            buses=[Bus(ref_id="b1", name="Bus 1", voltage_kv=15)],
            sources=[
                Source(
                    ref_id="s1", name="Grid", bus_ref="b1", model="short_circuit_power", sk3_mva=200
                )
            ],
        )
        graph = map_enm_to_network_graph(enm)
        node = list(graph.nodes.values())[0]
        assert node.node_type == NodeType.SLACK
        assert node.voltage_magnitude == 1.0

    def test_overhead_line_to_branch(self):
        enm = _make_enm(
            buses=[
                Bus(ref_id="b1", name="B1", voltage_kv=15),
                Bus(ref_id="b2", name="B2", voltage_kv=15),
            ],
            branches=[
                OverheadLine(
                    ref_id="ln_1",
                    name="L1",
                    from_bus_ref="b1",
                    to_bus_ref="b2",
                    length_km=5,
                    r_ohm_per_km=0.4,
                    x_ohm_per_km=0.3,
                ),
            ],
        )
        graph = map_enm_to_network_graph(enm)
        assert len(graph.branches) == 1
        branch = list(graph.branches.values())[0]
        assert branch.name == "L1"
        assert branch.r_ohm_per_km == 0.4
        assert branch.length_km == 5.0

    def test_switch_branch_closed(self):
        enm = _make_enm(
            buses=[
                Bus(ref_id="b1", name="B1", voltage_kv=15),
                Bus(ref_id="b2", name="B2", voltage_kv=15),
            ],
            branches=[
                SwitchBranch(
                    ref_id="sw_1",
                    name="Q1",
                    from_bus_ref="b1",
                    to_bus_ref="b2",
                    type="breaker",
                    status="closed",
                ),
            ],
        )
        graph = map_enm_to_network_graph(enm)
        assert len(graph.switches) == 1
        sw = list(graph.switches.values())[0]
        assert sw.is_closed

    def test_switch_branch_open(self):
        enm = _make_enm(
            buses=[
                Bus(ref_id="b1", name="B1", voltage_kv=15),
                Bus(ref_id="b2", name="B2", voltage_kv=15),
            ],
            branches=[
                SwitchBranch(
                    ref_id="sw_1",
                    name="Q1",
                    from_bus_ref="b1",
                    to_bus_ref="b2",
                    type="breaker",
                    status="open",
                ),
            ],
        )
        graph = map_enm_to_network_graph(enm)
        sw = list(graph.switches.values())[0]
        assert sw.is_open

    def test_transformer_to_branch(self):
        enm = _make_enm(
            buses=[
                Bus(ref_id="b1", name="HV", voltage_kv=110),
                Bus(ref_id="b2", name="LV", voltage_kv=15),
            ],
            transformers=[
                Transformer(
                    ref_id="t1",
                    name="T1",
                    hv_bus_ref="b1",
                    lv_bus_ref="b2",
                    sn_mva=25,
                    uhv_kv=110,
                    ulv_kv=15,
                    uk_percent=12,
                    pk_kw=120,
                ),
            ],
        )
        graph = map_enm_to_network_graph(enm)
        trafo_branches = [b for b in graph.branches.values() if hasattr(b, "rated_power_mva")]
        assert len(trafo_branches) == 1
        assert trafo_branches[0].rated_power_mva == 25.0

    def test_load_applied_to_node(self):
        enm = _make_enm(
            buses=[Bus(ref_id="b1", name="B1", voltage_kv=15)],
            loads=[Load(ref_id="ld_1", name="Load 1", bus_ref="b1", p_mw=1.0, q_mvar=0.3)],
        )
        graph = map_enm_to_network_graph(enm)
        node = list(graph.nodes.values())[0]
        # Load is negative convention (consumed)
        assert node.active_power == -1.0
        assert node.reactive_power == -0.3


class TestDeterminism:
    def test_same_enm_same_graph(self):
        enm = _make_enm(
            buses=[
                Bus(ref_id="b1", name="B1", voltage_kv=15),
                Bus(ref_id="b2", name="B2", voltage_kv=15),
            ],
            branches=[
                OverheadLine(
                    ref_id="ln_1",
                    name="L1",
                    from_bus_ref="b1",
                    to_bus_ref="b2",
                    length_km=5,
                    r_ohm_per_km=0.4,
                    x_ohm_per_km=0.3,
                ),
            ],
        )
        g1 = map_enm_to_network_graph(enm)
        g2 = map_enm_to_network_graph(enm)
        # Same node IDs (deterministic UUID from ref_id)
        assert list(g1.nodes.keys()) == list(g2.nodes.keys())


class TestSolverRoundtrip:
    def test_minimal_enm_sc_calculation(self):
        """ENM → NetworkGraph → SC solver → result (integration)."""
        enm = _make_enm(
            buses=[
                Bus(ref_id="bus_sn", name="Szyna SN", voltage_kv=15),
                Bus(ref_id="bus_nn", name="Szyna nN", voltage_kv=0.4),
            ],
            sources=[
                Source(
                    ref_id="src_grid",
                    name="Sieć",
                    bus_ref="bus_sn",
                    model="short_circuit_power",
                    sk3_mva=220,
                    rx_ratio=0.1,
                ),
            ],
            transformers=[
                Transformer(
                    ref_id="trafo_T1",
                    name="T1",
                    hv_bus_ref="bus_sn",
                    lv_bus_ref="bus_nn",
                    sn_mva=0.63,
                    uhv_kv=15,
                    ulv_kv=0.4,
                    uk_percent=4,
                    pk_kw=6.5,
                ),
            ],
        )
        graph = map_enm_to_network_graph(enm)
        # 2 buses + 1 virtual ground for source impedance = 3 nodes
        assert len(graph.nodes) == 3

        from network_model.solvers.short_circuit_iec60909 import (
            ShortCircuitIEC60909Solver,
        )

        # Compute SC at first node
        node_ids = sorted(graph.nodes.keys())
        result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id=node_ids[0],
            c_factor=1.1,
            tk_s=1.0,
        )
        assert result.ikss_a > 0
        assert result.ip_a > 0
        assert result.ith_a > 0
        assert result.sk_mva > 0
