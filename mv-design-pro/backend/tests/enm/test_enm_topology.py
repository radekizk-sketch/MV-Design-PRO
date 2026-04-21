"""Testy warstwy topologicznej — build_topology_graph(), trunk, corridors, junctions."""

from enm.models import (
    Bay,
    Bus,
    Cable,
    Corridor,
    EnergyNetworkModel,
    ENMHeader,
    Junction,
    Load,
    OverheadLine,
    Source,
    Substation,
    Transformer,
)
from enm.topology import build_topology_graph


def _enm(**kwargs) -> EnergyNetworkModel:
    return EnergyNetworkModel(header=ENMHeader(name="Test"), **kwargs)


def _golden_enm() -> EnergyNetworkModel:
    """Sieć referencyjna: GPZ → 3 szyny SN → 2 stacje → magistrala."""
    return _enm(
        buses=[
            Bus(ref_id="bus_sn_gpz", name="Szyna SN GPZ", voltage_kv=15),
            Bus(ref_id="bus_sn_1", name="Szyna SN Stacja 1", voltage_kv=15),
            Bus(ref_id="bus_nn_1", name="Szyna nn Stacja 1", voltage_kv=0.4),
            Bus(ref_id="bus_sn_2", name="Szyna SN Stacja 2", voltage_kv=15),
            Bus(ref_id="bus_nn_2", name="Szyna nn Stacja 2", voltage_kv=0.4),
        ],
        sources=[
            Source(
                ref_id="src_grid",
                name="Sieć 110kV",
                bus_ref="bus_sn_gpz",
                model="short_circuit_power",
                sk3_mva=4000,
            ),
        ],
        branches=[
            OverheadLine(
                ref_id="line_gpz_s1",
                name="GPZ→S1",
                from_bus_ref="bus_sn_gpz",
                to_bus_ref="bus_sn_1",
                length_km=5.0,
                r_ohm_per_km=0.249,
                x_ohm_per_km=0.362,
            ),
            Cable(
                ref_id="cable_s1_s2",
                name="S1→S2",
                from_bus_ref="bus_sn_1",
                to_bus_ref="bus_sn_2",
                length_km=3.0,
                r_ohm_per_km=0.253,
                x_ohm_per_km=0.093,
            ),
        ],
        transformers=[
            Transformer(
                ref_id="trafo_1",
                name="T1",
                hv_bus_ref="bus_sn_1",
                lv_bus_ref="bus_nn_1",
                sn_mva=0.63,
                uhv_kv=15,
                ulv_kv=0.4,
                uk_percent=4.5,
                pk_kw=6.5,
            ),
            Transformer(
                ref_id="trafo_2",
                name="T2",
                hv_bus_ref="bus_sn_2",
                lv_bus_ref="bus_nn_2",
                sn_mva=0.4,
                uhv_kv=15,
                ulv_kv=0.4,
                uk_percent=4.0,
                pk_kw=4.6,
            ),
        ],
        loads=[
            Load(ref_id="load_1", name="Odbiór 1", bus_ref="bus_nn_1", p_mw=0.3, q_mvar=0.15),
            Load(ref_id="load_2", name="Odbiór 2", bus_ref="bus_nn_2", p_mw=0.2, q_mvar=0.1),
        ],
        substations=[
            Substation(ref_id="sub_gpz", name="GPZ", station_type="gpz", bus_refs=["bus_sn_gpz"]),
            Substation(
                ref_id="sub_1",
                name="Stacja 1",
                station_type="mv_lv",
                bus_refs=["bus_sn_1", "bus_nn_1"],
                transformer_refs=["trafo_1"],
                entry_point_ref="ep_s1",
            ),
            Substation(
                ref_id="sub_2",
                name="Stacja 2",
                station_type="mv_lv",
                bus_refs=["bus_sn_2", "bus_nn_2"],
                transformer_refs=["trafo_2"],
            ),
        ],
        bays=[
            Bay(
                ref_id="bay_gpz_out1",
                name="Pole OUT 1",
                bay_role="OUT",
                substation_ref="sub_gpz",
                bus_ref="bus_sn_gpz",
            ),
            Bay(
                ref_id="bay_s1_in",
                name="Pole IN S1",
                bay_role="IN",
                substation_ref="sub_1",
                bus_ref="bus_sn_1",
            ),
            Bay(
                ref_id="bay_s1_tr",
                name="Pole TR S1",
                bay_role="TR",
                substation_ref="sub_1",
                bus_ref="bus_sn_1",
            ),
        ],
        junctions=[
            Junction(
                ref_id="junc_t1",
                name="Węzeł T1",
                junction_type="T_node",
                connected_branch_refs=["line_gpz_s1", "cable_s1_s2", "line_gpz_s1"],
            ),
        ],
        corridors=[
            Corridor(
                ref_id="corr_a",
                name="Magistrala A",
                corridor_type="radial",
                ordered_segment_refs=["line_gpz_s1", "cable_s1_s2"],
            ),
        ],
    )


class TestBuildTopologyGraph:
    def test_deterministic(self):
        enm = _golden_enm()
        topo1 = build_topology_graph(enm)
        topo2 = build_topology_graph(enm)
        assert topo1 == topo2

    def test_node_count(self):
        enm = _golden_enm()
        topo = build_topology_graph(enm)
        assert len(topo.nodes) == 5

    def test_source_bus_identified(self):
        enm = _golden_enm()
        topo = build_topology_graph(enm)
        assert "bus_sn_gpz" in topo.source_bus_refs
        source_nodes = [n for n in topo.nodes if n.is_source_bus]
        assert len(source_nodes) == 1
        assert source_nodes[0].bus_ref == "bus_sn_gpz"

    def test_substation_mapping(self):
        enm = _golden_enm()
        topo = build_topology_graph(enm)
        gpz_node = next(n for n in topo.nodes if n.bus_ref == "bus_sn_gpz")
        assert gpz_node.substation_ref == "sub_gpz"

        s1_node = next(n for n in topo.nodes if n.bus_ref == "bus_sn_1")
        assert s1_node.substation_ref == "sub_1"

    def test_degree_calculation(self):
        enm = _golden_enm()
        topo = build_topology_graph(enm)
        # bus_sn_1 jest podłączona do: line_gpz_s1, cable_s1_s2, trafo_1 → degree = 3
        s1_node = next(n for n in topo.nodes if n.bus_ref == "bus_sn_1")
        assert s1_node.degree == 3

    def test_trunk_segments(self):
        enm = _golden_enm()
        topo = build_topology_graph(enm)
        # BFS od bus_sn_gpz powinien dać trunk z 2+ segmentami (line + cable + trafo branches)
        assert len(topo.trunk_segments) >= 2

    def test_entry_points(self):
        enm = _golden_enm()
        topo = build_topology_graph(enm)
        # 3 stacje z łącznie 5 bus_refs → 5 entry points
        assert len(topo.entry_points) == 5
        ep_s1 = [ep for ep in topo.entry_points if ep.substation_ref == "sub_1"]
        assert len(ep_s1) == 2  # bus_sn_1, bus_nn_1
        assert any(ep.entry_point_ref == "ep_s1" for ep in ep_s1)

    def test_corridor_info(self):
        enm = _golden_enm()
        topo = build_topology_graph(enm)
        assert len(topo.corridors) == 1
        corr = topo.corridors[0]
        assert corr.ref_id == "corr_a"
        assert corr.corridor_type == "radial"
        assert corr.segment_count == 2
        assert corr.total_length_km == 8.0  # 5 + 3
        assert corr.has_no_point is False

    def test_junction_info(self):
        enm = _golden_enm()
        topo = build_topology_graph(enm)
        assert len(topo.junctions) == 1
        junc = topo.junctions[0]
        assert junc.ref_id == "junc_t1"
        assert junc.junction_type == "T_node"
        assert junc.branch_count == 3

    def test_stats(self):
        enm = _golden_enm()
        topo = build_topology_graph(enm)
        assert topo.stats.bus_count == 5
        assert topo.stats.branch_count == 2
        assert topo.stats.transformer_count == 2
        assert topo.stats.substation_count == 3
        assert topo.stats.bay_count == 3
        assert topo.stats.junction_count == 1
        assert topo.stats.corridor_count == 1
        assert topo.stats.total_line_length_km == 8.0
        assert topo.stats.source_count == 1


class TestTopologyEmpty:
    def test_empty_enm(self):
        enm = _enm()
        topo = build_topology_graph(enm)
        assert len(topo.nodes) == 0
        assert len(topo.trunk_segments) == 0
        assert topo.stats.bus_count == 0

    def test_minimal_enm_no_topology(self):
        """ENM z szyną i źródłem, ale bez stacji/bayów/junctions/corridors."""
        enm = _enm(
            buses=[Bus(ref_id="b1", name="B1", voltage_kv=15)],
            sources=[
                Source(
                    ref_id="s1", name="S1", bus_ref="b1", model="short_circuit_power", sk3_mva=220
                )
            ],
        )
        topo = build_topology_graph(enm)
        assert len(topo.nodes) == 1
        assert topo.nodes[0].is_source_bus is True
        assert topo.stats.substation_count == 0
        assert len(topo.corridors) == 0
