"""Tests for ENM → NetworkGraph mapping and roundtrip to solver."""

import pytest
from enm.mapping import build_zero_sequence_zbus, map_enm_to_network_graph
from enm.models import (
    Bus,
    EnergyNetworkModel,
    ENMHeader,
    Generator,
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

    def test_zero_sequence_zbus_handles_transformer_blocked_lv_side(self):
        enm = _make_enm(
            buses=[
                Bus(ref_id="bus_src", name="GPZ SN", voltage_kv=15),
                Bus(ref_id="bus_fault", name="Szyna SN", voltage_kv=15),
                Bus(ref_id="bus_nn", name="Szyna nN", voltage_kv=0.4),
            ],
            sources=[
                Source(
                    ref_id="src_grid",
                    name="Siec",
                    bus_ref="bus_src",
                    model="thevenin",
                    r_ohm=0.08,
                    x_ohm=0.8,
                    r0_ohm=0.16,
                    x0_ohm=1.6,
                ),
            ],
            branches=[
                OverheadLine(
                    ref_id="ln_1",
                    name="L1",
                    from_bus_ref="bus_src",
                    to_bus_ref="bus_fault",
                    length_km=2.0,
                    r_ohm_per_km=0.25,
                    x_ohm_per_km=0.32,
                    r0_ohm_per_km=0.75,
                    x0_ohm_per_km=0.96,
                ),
            ],
            transformers=[
                Transformer(
                    ref_id="tr_1",
                    name="TR SN/nN",
                    hv_bus_ref="bus_fault",
                    lv_bus_ref="bus_nn",
                    sn_mva=0.63,
                    uhv_kv=15,
                    ulv_kv=0.4,
                    uk_percent=6,
                    pk_kw=7.5,
                    vector_group="Dyn11",
                ),
            ],
        )
        graph = map_enm_to_network_graph(enm)

        z0_bus = build_zero_sequence_zbus(enm, graph)

        assert z0_bus.shape[0] > 0

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

    def test_zero_sequence_builder_uses_enm_z0_without_changing_3f_result(self):
        enm = _make_enm(
            buses=[
                Bus(ref_id="bus_src", name="Szyna zasilajaca", voltage_kv=15),
                Bus(ref_id="bus_fault", name="Szyna zwarcia", voltage_kv=15),
            ],
            sources=[
                Source(
                    ref_id="src_grid",
                    name="Siec",
                    bus_ref="bus_src",
                    model="thevenin",
                    r_ohm=0.08,
                    x_ohm=0.8,
                    r0_ohm=0.16,
                    x0_ohm=1.6,
                ),
            ],
            branches=[
                OverheadLine(
                    ref_id="ln_1",
                    name="L1",
                    from_bus_ref="bus_src",
                    to_bus_ref="bus_fault",
                    length_km=2.0,
                    r_ohm_per_km=0.25,
                    x_ohm_per_km=0.32,
                    r0_ohm_per_km=0.75,
                    x0_ohm_per_km=0.96,
                ),
            ],
        )
        graph = map_enm_to_network_graph(enm)

        from network_model.solvers.short_circuit_iec60909 import (
            ShortCircuitIEC60909Solver,
        )

        fault_node_id = next(
            node.id for node in graph.nodes.values() if node.name == "Szyna zwarcia"
        )
        result_3f_before = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id=fault_node_id,
            c_factor=1.1,
            tk_s=1.0,
        )

        z0_bus = build_zero_sequence_zbus(enm, graph)

        result_3f_after = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id=fault_node_id,
            c_factor=1.1,
            tk_s=1.0,
        )
        assert result_3f_after.ikss_a == pytest.approx(result_3f_before.ikss_a)
        assert result_3f_after.zkk_ohm == pytest.approx(result_3f_before.zkk_ohm)
        assert result_3f_after.short_circuit_type.value == "3F"

        result_1f = ShortCircuitIEC60909Solver.compute_1ph_short_circuit(
            graph=graph,
            fault_node_id=fault_node_id,
            c_factor=1.1,
            tk_s=1.0,
            z0_bus=z0_bus,
        )
        assert result_1f.ikss_a > 0
        assert result_1f.short_circuit_type.value == "1F"
        assert "z0_ohm" in result_1f.white_box_trace[0]["inputs"]

        result_2fg = ShortCircuitIEC60909Solver.compute_2ph_ground_short_circuit(
            graph=graph,
            fault_node_id=fault_node_id,
            c_factor=1.1,
            tk_s=1.0,
            z0_bus=z0_bus,
        )
        assert result_2fg.ikss_a > 0
        assert result_2fg.short_circuit_type.value == "2F+G"


class TestGeneratorShortCircuitSources:
    """G-SCM (V12K-054): enm.generators become IEC 60909 SC sources in the graph.

    Closes the forward-phantom where DER/machines placed by the designer
    contributed only P/Q to the load flow and ZERO fault current to the SC.
    """

    def _enm_with_generator(self, **gen_fields) -> EnergyNetworkModel:
        return _make_enm(
            buses=[
                Bus(ref_id="bus_sn", name="Szyna SN", voltage_kv=15),
                Bus(ref_id="bus_oze", name="Szyna OZE", voltage_kv=15),
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
            branches=[
                OverheadLine(
                    ref_id="ln_1",
                    name="L1",
                    from_bus_ref="bus_sn",
                    to_bus_ref="bus_oze",
                    length_km=2.0,
                    r_ohm_per_km=0.25,
                    x_ohm_per_km=0.32,
                ),
            ],
            generators=[Generator(bus_ref="bus_oze", **gen_fields)],
        )

    def test_pv_inverter_becomes_bounded_current_source(self):
        enm = self._enm_with_generator(
            ref_id="pv1",
            name="Blok PV",
            p_mw=2.0,
            gen_type="pv_inverter",
            materialized_params={"un_kv": 15.0, "sn_mva": 2.5},
        )
        graph = map_enm_to_network_graph(enm)
        inverters = graph.get_inverter_sources()
        assert len(inverters) == 1
        src = inverters[0]
        assert src.id == "pv1"
        # In = S/(√3·U); Ik = k_sc·In (default 1.1)
        expected_in = 2.5 * 1.0e6 / (3.0**0.5 * 15.0 * 1.0e3)
        assert src.in_rated_a == pytest.approx(expected_in, rel=1e-6)
        assert src.ik_sc_a == pytest.approx(1.1 * expected_in, rel=1e-6)
        # No rotating-machine sources for a converter.
        assert len(graph.get_synchronous_machine_sources()) == 0

    def test_synchronous_becomes_machine_source(self):
        enm = self._enm_with_generator(
            ref_id="gen1",
            name="Agregat",
            p_mw=1.0,
            gen_type="synchronous",
            materialized_params={"un_kv": 15.0, "sn_mva": 1.25},
        )
        graph = map_enm_to_network_graph(enm)
        machines = graph.get_synchronous_machine_sources()
        assert len(machines) == 1
        assert machines[0].id == "gen1"
        assert machines[0].sr_mva == pytest.approx(1.25)
        assert machines[0].ur_kv == pytest.approx(15.0)
        # Voltage-behind-Z″ has a positive internal impedance.
        assert abs(machines[0].z_internal_ohm) > 0
        assert len(graph.get_inverter_sources()) == 0

    def test_dfig_becomes_asynchronous_source_with_wind_flag(self):
        enm = self._enm_with_generator(
            ref_id="fw1",
            name="Farma FW (DFIG)",
            p_mw=3.0,
            gen_type="fw_dfig",
            materialized_params={"un_kv": 15.0},
        )
        graph = map_enm_to_network_graph(enm)
        machines = graph.get_asynchronous_machine_sources()
        assert len(machines) == 1
        assert machines[0].id == "fw1"
        assert machines[0].wind_type_3 is True

    def test_no_generators_no_sc_sources(self):
        """Determinism guard: a machine-free network gets no SC sources at all."""
        enm = _make_enm(
            buses=[Bus(ref_id="b1", name="B1", voltage_kv=15)],
            sources=[
                Source(
                    ref_id="s1",
                    name="Grid",
                    bus_ref="b1",
                    model="short_circuit_power",
                    sk3_mva=200,
                )
            ],
        )
        graph = map_enm_to_network_graph(enm)
        assert graph.get_inverter_sources() == []
        assert graph.get_synchronous_machine_sources() == []
        assert graph.get_asynchronous_machine_sources() == []

    def test_generator_without_nameplate_is_skipped(self):
        """Zero fabrication: no rated power ⇒ no fabricated SC source."""
        enm = self._enm_with_generator(
            ref_id="pv0",
            name="PV bez tabliczki",
            p_mw=0.0,
            gen_type="pv_inverter",
            materialized_params={"un_kv": 15.0},
        )
        graph = map_enm_to_network_graph(enm)
        assert graph.get_inverter_sources() == []

    def test_converter_contributes_to_short_circuit(self):
        """Integration: the converter raises the total fault current (ik_total)."""
        from network_model.solvers.short_circuit_iec60909 import (
            ShortCircuitIEC60909Solver,
        )

        def _ikss_at_oze(with_pv: bool) -> tuple[float, float]:
            if with_pv:
                enm = self._enm_with_generator(
                    ref_id="pv1",
                    name="Blok PV",
                    p_mw=2.0,
                    gen_type="pv_inverter",
                    materialized_params={"un_kv": 15.0, "sn_mva": 2.5},
                )
            else:
                enm = _make_enm(
                    buses=[
                        Bus(ref_id="bus_sn", name="Szyna SN", voltage_kv=15),
                        Bus(ref_id="bus_oze", name="Szyna OZE", voltage_kv=15),
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
                    branches=[
                        OverheadLine(
                            ref_id="ln_1",
                            name="L1",
                            from_bus_ref="bus_sn",
                            to_bus_ref="bus_oze",
                            length_km=2.0,
                            r_ohm_per_km=0.25,
                            x_ohm_per_km=0.32,
                        ),
                    ],
                )
            graph = map_enm_to_network_graph(enm)
            fault_node_id = next(
                node.id for node in graph.nodes.values() if node.name == "Szyna OZE"
            )
            result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
                graph=graph,
                fault_node_id=fault_node_id,
                c_factor=1.1,
                tk_s=1.0,
            )
            return result.ikss_a, result.ik_inverters_a

        ikss_grid_only, inv_grid_only = _ikss_at_oze(with_pv=False)
        ikss_with_pv, inv_with_pv = _ikss_at_oze(with_pv=True)

        assert inv_grid_only == 0.0
        assert inv_with_pv > 0.0
        # Total fault current strictly increases with the converter's contribution.
        assert ikss_with_pv > ikss_grid_only
