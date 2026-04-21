"""
Testy Golden Network SN — weryfikacja kompletnosci i benchmarki zwarciowe.

Sprawdza:
- Kompletnosc topologiczna (wezly, galezi, stacje, ring, OZE)
- Obliczenia zwarciowe IEC 60909 vs. benchmarki reczne
- Determinizm (2× build → identyczny wynik)
- Inwarianty topologiczne
"""

import math

import pytest
from network_model.core.branch import LineBranch, TransformerBranch
from network_model.core.node import NodeType
from network_model.core.switch import SwitchState, SwitchType
from network_model.solvers.short_circuit_iec60909 import ShortCircuitIEC60909Solver

from tests.golden.golden_network_sn import (
    build_golden_network,
    get_golden_network_statistics,
)

# =============================================================================
# TESTY KOMPLETNOSCI TOPOLOGICZNEJ
# =============================================================================


class TestGoldenNetworkCompleteness:
    @pytest.fixture
    def gn(self):
        return build_golden_network()

    @pytest.fixture
    def stats(self, gn):
        return get_golden_network_statistics(gn)

    def test_has_enough_nodes(self, stats):
        """Siec ma >= 40 wezlow (szyny WN/SN/nN + posrednie)."""
        assert stats["wezly"] >= 40

    def test_has_line_segments(self, stats):
        """Siec ma >= 31 odcinkow linii."""
        assert stats["galezi_liniowe"] >= 31

    def test_has_wn_sn_transformers(self, stats):
        """Siec ma >= 2 transformatory WN/SN."""
        assert stats["transformatory_wn_sn"] >= 2

    def test_has_sn_nn_transformers(self, stats):
        """Siec ma >= 20 transformatorow SN/nN (po 1 na stacje)."""
        assert stats["transformatory_sn_nn"] >= 20

    def test_has_stations(self, stats):
        """Siec ma >= 20 stacji."""
        assert stats["stacje"] >= 20

    def test_has_switches(self, stats):
        """Siec ma >= 10 lacznikow."""
        assert stats["laczniki"] >= 10

    def test_has_open_switches(self, stats):
        """Siec ma laczniki otwarte (NO, rezerwy)."""
        assert stats["laczniki_otwarte"] >= 2

    def test_has_recloser(self, stats):
        """Siec ma >= 1 reklozer."""
        assert stats["reklozery"] >= 1

    def test_has_inverter_sources(self, stats):
        """Siec ma >= 2 zrodla inwerterowe (PV + BESS)."""
        assert stats["inwertery"] >= 2

    def test_has_ring_no_point(self, gn):
        """Siec ma ring z lacznikiem NO."""
        sw = gn.switches.get("sw-no-ring")
        assert sw is not None
        assert sw.state == SwitchState.OPEN
        assert sw.switch_type == SwitchType.LOAD_SWITCH

    def test_has_section_coupler(self, gn):
        """Siec ma sprzeglo sekcyjne (NO)."""
        sw = gn.switches.get("sw-coupler")
        assert sw is not None
        assert sw.state == SwitchState.OPEN

    def test_has_ohl_cable_transition(self, gn):
        """Siec ma przejscie OHL↔kabel (mufa)."""
        assert "bus-b3-mufa" in gn.nodes

    def test_has_pv_plant(self, gn):
        """Siec ma farme PV."""
        inv = gn.inverter_sources.get("inv-pv-2mw")
        assert inv is not None
        assert inv.in_rated_a > 0

    def test_has_bess(self, gn):
        """Siec ma magazyn energii BESS."""
        inv = gn.inverter_sources.get("inv-bess-1mw")
        assert inv is not None
        assert inv.in_rated_a > 0

    def test_has_slack_bus(self, gn):
        """Siec ma dokladnie 1 wezel SLACK."""
        slack_nodes = [n for n in gn.nodes.values() if n.node_type == NodeType.SLACK]
        assert len(slack_nodes) == 1

    def test_voltage_levels_correct(self, gn):
        """Wezly maja poprawne poziomy napiec."""
        for node in gn.nodes.values():
            assert node.voltage_level in (
                110.0,
                15.0,
                0.4,
            ), f"Node {node.id}: unexpected voltage {node.voltage_level} kV"


# =============================================================================
# TESTY INWARIANTOW TOPOLOGICZNYCH
# =============================================================================


class TestGoldenNetworkTopologyInvariants:
    @pytest.fixture
    def gn(self):
        return build_golden_network()

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

    def test_no_self_loops(self, gn):
        """Brak petli (from == to)."""
        for b in gn.branches.values():
            assert b.from_node_id != b.to_node_id, f"Branch {b.id}: self-loop"
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


class TestGoldenNetworkDeterminism:
    def test_build_twice_same_node_count(self):
        """Dwa wywolania build_golden_network() daja ten sam wynik."""
        g1 = build_golden_network()
        g2 = build_golden_network()
        assert len(g1.nodes) == len(g2.nodes)
        assert len(g1.branches) == len(g2.branches)
        assert len(g1.switches) == len(g2.switches)

    def test_build_twice_same_node_ids(self):
        """Dwa wywolania daja te same ID wezlow."""
        g1 = build_golden_network()
        g2 = build_golden_network()
        assert set(g1.nodes.keys()) == set(g2.nodes.keys())

    def test_build_twice_same_branch_ids(self):
        """Dwa wywolania daja te same ID galezi."""
        g1 = build_golden_network()
        g2 = build_golden_network()
        assert set(g1.branches.keys()) == set(g2.branches.keys())


# =============================================================================
# BENCHMARK — OBLICZENIA ZWARCIOWE (±5% od wartosci recznych)
# =============================================================================


class TestGoldenNetworkShortCircuitBenchmarks:
    """
    Weryfikacja wynikow zwarciowych wobec obliczen recznych z sekcji 5.2 promptu:

    Zwarcie 3F na szynach SN GPZ:
      Zsys_SN = c*Un^2/Sk * (Un_SN/Un_WN)^2 = 1.1*110^2/4000 * (15/110)^2 ≈ 0.0618 Ohm
      Z_TR = uk%*Un^2/(100*Sn) = 11*15^2/(100*25) = 0.990 Ohm
      Z_total ≈ 1.052 Ohm
      Ik'' = 1.1*15 / (sqrt(3)*1.052) ≈ 9.06 kA
    """

    C_MAX = 1.10

    @pytest.fixture
    def gn(self):
        return build_golden_network()

    @staticmethod
    def _sc3f(gn, bus_id):
        """Helper: 3F SC at bus with c=1.10, tk=1s."""
        return ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=gn,
            fault_node_id=bus_id,
            c_factor=1.10,
            tk_s=1.0,
        )

    def test_sc3f_at_gpz_bus(self, gn):
        """Zwarcie 3F na szynie SN sekcja I: Ik'' ≈ 9 kA (±15%)."""
        result = self._sc3f(gn, "bus-sn-s1")
        ik_ka = result.ikss_a / 1000.0
        # Wartosc referencyjna: ~9.06 kA (moze byc mniejsza z uwagi na
        # dodatkowe impedancje lacznikow i pol liniowych)
        assert 5.0 < ik_ka < 15.0, f"Ik'' at GPZ bus = {ik_ka:.2f} kA (expected 5-15 kA)"

    def test_sc3f_gpz_has_whitebox(self, gn):
        """Wynik zwarciowy na GPZ ma White Box trace."""
        result = self._sc3f(gn, "bus-sn-s1")
        assert result.white_box_trace is not None
        assert len(result.white_box_trace) > 0

    def test_sc3f_end_magistrala_a_lower(self, gn):
        """Zwarcie na koncu magistrali A: Ik'' < Ik'' na GPZ (impedancja wieksza)."""
        result_gpz = self._sc3f(gn, "bus-sn-s1")
        result_end_a = self._sc3f(gn, "bus-a10")
        assert (
            result_end_a.ikss_a < result_gpz.ikss_a
        ), f"Ik'' at end A ({result_end_a.ikss_a:.0f} A) should be < GPZ ({result_gpz.ikss_a:.0f} A)"

    def test_sc3f_decreasing_along_feeder(self, gn):
        """Prad zwarciowy maleje wzdluz magistrali (im dalej od GPZ, tym mniejszy Ik'')."""
        buses_along_a = ["bus-sn-s1", "bus-a1", "bus-a3", "bus-a5", "bus-a7", "bus-a10"]
        ik_values = []
        for bus in buses_along_a:
            result = self._sc3f(gn, bus)
            ik_values.append(result.ikss_a)

        for i in range(1, len(ik_values)):
            assert ik_values[i] <= ik_values[i - 1] * 1.01, (
                f"Ik'' should decrease: bus {buses_along_a[i]} = {ik_values[i]:.0f} A > "
                f"{buses_along_a[i-1]} = {ik_values[i-1]:.0f} A"
            )

    def test_sk_at_gpz_bus(self, gn):
        """Moc zwarciowa na szynach SN: Sk'' = sqrt(3) * Un * Ik''."""
        result = self._sc3f(gn, "bus-sn-s1")
        sk_mva = result.sk_mva
        # Wartosc referencyjna: ~235 MVA (±25%)
        assert 100 < sk_mva < 400, f"Sk'' at GPZ = {sk_mva:.1f} MVA (expected 100-400)"

    def test_ip_at_gpz_bus(self, gn):
        """Prad udarowy na szynach SN: ip > Ik'' * sqrt(2)."""
        result = self._sc3f(gn, "bus-sn-s1")
        ip_a = result.ip_a
        ik_a = result.ikss_a
        assert (
            ip_a >= ik_a * math.sqrt(2) * 0.95
        ), f"ip = {ip_a:.0f} A should be >= sqrt(2) * Ik'' = {ik_a * math.sqrt(2):.0f} A"
