"""
Testy Golden Network Terrain — weryfikacja kompletnosci, topologii, determinizmu i zwarc.

Sprawdza:
- Kompletnosc topologiczna (wezly, galezi, stacje, ring, OZE)
- Inwarianty topologiczne (brak wiszacych galezi, petli, unikalne ID)
- Determinizm (2x build → identyczny wynik)
- Obliczenia zwarciowe IEC 60909 (monotonicznosc, WHITE BOX)
"""

import math

import pytest
from network_model.core.branch import LineBranch, TransformerBranch
from network_model.core.node import NodeType
from network_model.core.switch import SwitchState, SwitchType
from network_model.solvers.short_circuit_iec60909 import ShortCircuitIEC60909Solver

from tests.golden.golden_network_terrain import (
    build_terrain_network,
    get_terrain_network_statistics,
)

# =============================================================================
# TESTY KOMPLETNOSCI TOPOLOGICZNEJ
# =============================================================================


class TestTerrainNetworkCompleteness:
    @pytest.fixture
    def gn(self):
        return build_terrain_network()

    @pytest.fixture
    def stats(self, gn):
        return get_terrain_network_statistics(gn)

    def test_has_enough_nodes(self, stats):
        """Siec ma >= 25 wezlow (1 SLACK + 14 SN + 11 nN)."""
        assert stats["wezly"] >= 25

    def test_has_sn_nodes(self, stats):
        """Siec ma >= 14 wezlow SN (GPZ + magistrala + odgalezienia)."""
        assert stats["wezly_sn"] >= 14

    def test_has_nn_nodes(self, stats):
        """Siec ma >= 11 wezlow nN (wszystkie stacje z TR)."""
        assert stats["wezly_nn"] >= 11

    def test_has_line_segments(self, stats):
        """Siec ma >= 14 odcinkow linii (magistrala + odgalezienia + impedancja GPZ)."""
        assert stats["galezi_liniowe"] >= 14

    def test_has_transformers(self, stats):
        """Siec ma >= 11 transformatorow SN/nN."""
        assert stats["transformatory"] >= 11

    def test_has_stations(self, stats):
        """Siec ma >= 12 stacji."""
        assert stats["stacje"] >= 12

    def test_has_switches(self, stats):
        """Siec ma >= 2 laczniki (sprzeglo S4, NOP)."""
        assert stats["laczniki"] >= 2

    def test_has_open_switches(self, stats):
        """Siec ma lacznik NOP (otwarty)."""
        assert stats["laczniki_otwarte"] >= 1

    def test_has_inverter_pv(self, stats):
        """Siec ma >= 1 zrodlo inwerterowe PV."""
        assert stats["inwertery"] >= 1

    def test_has_slack_bus(self, gn):
        """Siec ma dokladnie 1 wezel SLACK."""
        slack_nodes = [n for n in gn.nodes.values() if n.node_type == NodeType.SLACK]
        assert len(slack_nodes) == 1

    def test_voltage_levels_correct(self, gn):
        """Wezly maja poprawne poziomy napiec (15 kV lub 0.4 kV)."""
        for node in gn.nodes.values():
            assert node.voltage_level in (
                15.0,
                0.4,
            ), f"Node {node.id}: unexpected voltage {node.voltage_level} kV"

    def test_has_nop_switch(self, gn):
        """Siec ma lacznik NOP (normalnie otwarty)."""
        sw = gn.switches.get("sw-nop-s6-s1")
        assert sw is not None
        assert sw.state == SwitchState.OPEN
        assert sw.switch_type == SwitchType.LOAD_SWITCH

    def test_has_sectional_coupler(self, gn):
        """Siec ma sprzeglo sekcyjne S4 (zamkniete)."""
        sw = gn.switches.get("sw-coupler-s4")
        assert sw is not None
        assert sw.state == SwitchState.CLOSED
        assert sw.switch_type == SwitchType.BREAKER

    def test_has_pv_source(self, gn):
        """Siec ma PV 0.5 MW na stronie nN stacji B3."""
        inv = gn.inverter_sources.get("inv-pv-b3")
        assert inv is not None
        assert inv.in_rated_a > 700
        assert inv.converter_kind.value == "PV"

    def test_s4_has_no_transformer(self, gn):
        """Stacja sekcyjna S4 nie ma transformatora."""
        station = gn.stations.get("station-s4")
        assert station is not None
        assert len(station.branch_ids) == 0, "S4 nie powinna miec transformatora"
        assert station.station_type.value == "SWITCHING"


# =============================================================================
# TESTY INWARIANTOW TOPOLOGICZNYCH
# =============================================================================


class TestTerrainNetworkTopology:
    @pytest.fixture
    def gn(self):
        return build_terrain_network()

    def test_no_dangling_branches(self, gn):
        """Wszystkie galezi maja wezly w grafie."""
        for b in gn.branches.values():
            assert b.from_node_id in gn.nodes, f"Branch {b.id}: from_node {b.from_node_id} missing"
            assert b.to_node_id in gn.nodes, f"Branch {b.id}: to_node {b.to_node_id} missing"

    def test_no_dangling_switches(self, gn):
        """Wszystkie laczniki maja wezly w grafie."""
        for s in gn.switches.values():
            assert s.from_node_id in gn.nodes, f"Switch {s.id}: from_node {s.from_node_id} missing"
            assert s.to_node_id in gn.nodes, f"Switch {s.id}: to_node {s.to_node_id} missing"

    def test_no_self_loops_branches(self, gn):
        """Brak petli (from == to) w galeziach."""
        for b in gn.branches.values():
            assert b.from_node_id != b.to_node_id, f"Branch {b.id}: self-loop"

    def test_no_self_loops_switches(self, gn):
        """Brak petli (from == to) w lacznikach."""
        for s in gn.switches.values():
            assert s.from_node_id != s.to_node_id, f"Switch {s.id}: self-loop"

    def test_unique_node_ids(self, gn):
        """ID wezlow sa unikalne."""
        ids = list(gn.nodes.keys())
        assert len(ids) == len(set(ids))

    def test_unique_branch_ids(self, gn):
        """ID galezi sa unikalne."""
        ids = list(gn.branches.keys())
        assert len(ids) == len(set(ids))

    def test_unique_switch_ids(self, gn):
        """ID lacznikow sa unikalne."""
        ids = list(gn.switches.keys())
        assert len(ids) == len(set(ids))

    def test_transformer_voltage_consistency(self, gn):
        """Transformatory maja Uhv > Ulv."""
        for b in gn.branches.values():
            if isinstance(b, TransformerBranch):
                assert (
                    b.voltage_hv_kv > b.voltage_lv_kv
                ), f"Transformer {b.id}: Uhv={b.voltage_hv_kv} <= Ulv={b.voltage_lv_kv}"

    def test_line_impedances_positive(self, gn):
        """Linie maja R > 0 i X > 0."""
        for b in gn.branches.values():
            if isinstance(b, LineBranch):
                assert b.r_ohm_per_km > 0, f"Line {b.id}: R <= 0"
                assert b.x_ohm_per_km > 0, f"Line {b.id}: X <= 0"
                assert b.length_km > 0, f"Line {b.id}: length <= 0"


# =============================================================================
# TESTY DETERMINIZMU
# =============================================================================


class TestTerrainNetworkDeterminism:
    def test_build_twice_same_counts(self):
        """Dwa wywolania build_terrain_network() daja ten sam wynik."""
        g1 = build_terrain_network()
        g2 = build_terrain_network()
        assert len(g1.nodes) == len(g2.nodes)
        assert len(g1.branches) == len(g2.branches)
        assert len(g1.switches) == len(g2.switches)
        assert len(g1.stations) == len(g2.stations)
        assert len(g1.inverter_sources) == len(g2.inverter_sources)

    def test_build_twice_same_node_ids(self):
        """Dwa wywolania daja te same ID wezlow."""
        g1 = build_terrain_network()
        g2 = build_terrain_network()
        assert set(g1.nodes.keys()) == set(g2.nodes.keys())

    def test_build_twice_same_branch_ids(self):
        """Dwa wywolania daja te same ID galezi."""
        g1 = build_terrain_network()
        g2 = build_terrain_network()
        assert set(g1.branches.keys()) == set(g2.branches.keys())


# =============================================================================
# BENCHMARK — OBLICZENIA ZWARCIOWE
# =============================================================================


class TestTerrainNetworkShortCircuit:
    """
    Weryfikacja wynikow zwarciowych:
    - Zwarcie na szynie GPZ: Ik'' ≈ Un * c / (sqrt(3) * Zsys)
    - Monotonicznosc: Ik'' maleje wzdluz magistrali
    - WHITE BOX trace obecny
    """

    @pytest.fixture
    def gn(self):
        return build_terrain_network()

    @staticmethod
    def _sc3f(gn, bus_id):
        return ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=gn,
            fault_node_id=bus_id,
            c_factor=1.10,
            tk_s=1.0,
        )

    def test_sc3f_at_gpz(self, gn):
        """Zwarcie 3F na wyprowadzeniu GPZ: Ik'' w rozsadnym zakresie (5-20 kA)."""
        result = self._sc3f(gn, "bus-gpz-out")
        ik_ka = result.ikss_a / 1000.0
        assert 5.0 < ik_ka < 20.0, f"Ik'' at GPZ = {ik_ka:.2f} kA (expected 5-20 kA)"

    def test_sc3f_has_whitebox(self, gn):
        """Wynik zwarciowy ma White Box trace."""
        result = self._sc3f(gn, "bus-gpz-out")
        assert result.white_box_trace is not None
        assert len(result.white_box_trace) > 0

    def test_sc3f_decreasing_along_trunk(self, gn):
        """Prad zwarciowy maleje wzdluz magistrali (GPZ → S1 → S2 → S3 → S5).

        Uwaga: S6 pominiety — ring NOP (odcinek S6-S1 z admitancja shunt)
        moze nieznacznie podnosic Ik'' na S6 wzgledem S5.
        """
        buses = ["bus-gpz-out", "bus-s1-sn", "bus-s2-sn", "bus-s3-sn", "bus-s5-sn"]
        ik_values = []
        for bus in buses:
            result = self._sc3f(gn, bus)
            ik_values.append(result.ikss_a)

        for i in range(1, len(ik_values)):
            assert ik_values[i] <= ik_values[i - 1] * 1.01, (
                f"Ik'' should decrease: {buses[i]} = {ik_values[i]:.0f} A > "
                f"{buses[i-1]} = {ik_values[i-1]:.0f} A"
            )

    def test_sc3f_branch_lower_than_trunk(self, gn):
        """Prad zwarciowy na odgalezieniu jest nizszy niz na punkcie odgalezienia."""
        result_s2 = self._sc3f(gn, "bus-s2-sn")
        result_b1 = self._sc3f(gn, "bus-b1-sn")
        result_b2 = self._sc3f(gn, "bus-b2-sn")
        assert (
            result_b1.ikss_a < result_s2.ikss_a
        ), f"Ik'' at B1 ({result_b1.ikss_a:.0f} A) should be < S2 ({result_s2.ikss_a:.0f} A)"
        assert (
            result_b2.ikss_a < result_b1.ikss_a
        ), f"Ik'' at B2 ({result_b2.ikss_a:.0f} A) should be < B1 ({result_b1.ikss_a:.0f} A)"

    def test_ip_at_gpz(self, gn):
        """Prad udarowy na GPZ: ip >= Ik'' * sqrt(2)."""
        result = self._sc3f(gn, "bus-gpz-out")
        ip_a = result.ip_a
        ik_a = result.ikss_a
        assert (
            ip_a >= ik_a * math.sqrt(2) * 0.95
        ), f"ip = {ip_a:.0f} A should be >= sqrt(2) * Ik'' = {ik_a * math.sqrt(2):.0f} A"

    def test_sk_at_gpz(self, gn):
        """Moc zwarciowa na GPZ: Sk'' = sqrt(3) * Un * Ik''."""
        result = self._sc3f(gn, "bus-gpz-out")
        sk_mva = result.sk_mva
        assert 50 < sk_mva < 400, f"Sk'' at GPZ = {sk_mva:.1f} MVA (expected 50-400)"
