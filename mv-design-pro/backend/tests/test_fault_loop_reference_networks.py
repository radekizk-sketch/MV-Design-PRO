"""
Fault Loop integration with reference networks — GAP-3 z test architect audit.

Reference:
- Test architect audyt GAP-3: "Solver fault_loop nigdy nie przepuszczony
  przez tests/reference_networks/builders.py — realistyczna stacja może
  rzucić błąd walidacji niewidoczny w testach jednostkowych."
- backend/tests/reference_networks/builders.py: GN01-GN05 reference networks
- backend/src/network_model/solvers/fault_loop_iec60364.py

Te testy weryfikują że P0.5 fault_loop solver może być wywołany dla
realistycznych scenariuszy (stacje SN/NN z GN04/GN05), z LoopImpedanceComponent
zbudowanym z representative values per stacja kontekstu.

NOTE (P0.5b TODO):
- Auto-extract LoopImpedanceComponent z NetworkGraph + catalog jest deferred
  do P0.5b (per AUDYT_BRAKI § 5.L5).
- Te testy obecnie używają REPRESENTATIVE VALUES per kontekst stacji.
  Po P0.5b: zamienić na auto-extract i porównać.

INVARIANTS:
- Każdy reference network test wywołuje compute_fault_loop bez błędu
- Result: Z_loop w fizycznym zakresie 1 mΩ – 1 Ω
- Ik_min in [100 A, 100 kA] (zakres realny dla LV networks)
"""

import pytest

from network_model.solvers.fault_loop_builder import (
    FaultLoopBuildRequest,
    build_fault_loop_input,
)
from network_model.solvers.fault_loop_iec60364 import (
    NetworkType,
    ProtectionArrangement,
    compute_fault_loop,
)


def _make_typical_400kva_components() -> dict[str, float]:
    """
    Representative impedances dla typowej stacji 400 kVA SN/NN w sieci GN04.

    Source:
    - TR 400 kVA, U_k=4%, Z_TR_LV ≈ 16 mΩ (norma PN-EN 50588)
    - Kabel L: YAKXS 4x70 mm² Cu, 50 m → 0.524 Ω/km × 50/1000 = 26 mΩ
    - Reactance ~ 0.075 Ω/km × 50/1000 = 3.75 mΩ
    """
    return {
        "phase_r": 0.026,
        "phase_x": 0.00375,
        "return_r": 0.026,  # TN-S: PE = phase cross-section
        "return_x": 0.00375,
        "transformer_r": 0.005,  # TR 400 kVA: R/Z = 0.31
        "transformer_x": 0.0151,  # TR 400 kVA: X/Z = 0.95
    }


def _make_small_station_100kva_components() -> dict[str, float]:
    """Stacja 100 kVA SN/NN — krótszy kabel, wyższa Z_TR.

    Reprezentuje typowo small rural distribution station.
    """
    return {
        "phase_r": 0.040,  # 80 m kabel cieńszy
        "phase_x": 0.005,
        "return_r": 0.040,
        "return_x": 0.005,
        "transformer_r": 0.015,  # TR 100 kVA: wyższa R (mniej żelaza)
        "transformer_x": 0.055,
    }


class TestFaultLoopGN04Scenarios:
    """
    GN04 (SN+nN+OZE z PV+BESS) — typowa stacja SN/NN z DER.

    Stacja w GN04 to TR 400 kVA SN/NN z falownikami PV i BESS po stronie nN.
    Fault na bus nN powinien dać Ik dostosowany do disconnect Time per IEC
    60364-4-41 (typowo Ik ≥ 5×In_breaker → t_dis ≤ 5 s).
    """

    def test_gn04_400kva_fault_at_nN_bus_returns_valid_result(self) -> None:
        """compute_fault_loop runs on representative GN04 stacja bez błędu."""
        c = _make_typical_400kva_components()
        request = FaultLoopBuildRequest(
            fault_node_id="bus_nN_gn04",
            u_nom_v=230.0,
            network_type=NetworkType.TN_S,
            protection_arrangement=ProtectionArrangement.PE,
            phase_conductor_r_ohm=c["phase_r"],
            phase_conductor_x_ohm=c["phase_x"],
            return_conductor_r_ohm=c["return_r"],
            return_conductor_x_ohm=c["return_x"],
            transformer_r_ohm=c["transformer_r"],
            transformer_x_ohm=c["transformer_x"],
        )
        input_obj = build_fault_loop_input(request)
        result = compute_fault_loop(input_obj)

        # Sanity: Z_loop w fizycznym zakresie 1 mΩ – 1 Ω
        assert 0.001 <= result.z_loop_magnitude_ohm <= 1.0, (
            f"Z_loop = {result.z_loop_magnitude_ohm} Ω poza fizycznym zakresem"
        )

    def test_gn04_400kva_ik_in_realistic_lv_range(self) -> None:
        """Ik dla typowej stacji 400 kVA powinno być w zakresie 1-10 kA."""
        c = _make_typical_400kva_components()
        request = FaultLoopBuildRequest(
            fault_node_id="bus_nN_gn04",
            u_nom_v=230.0,
            network_type=NetworkType.TN_S,
            protection_arrangement=ProtectionArrangement.PE,
            phase_conductor_r_ohm=c["phase_r"],
            phase_conductor_x_ohm=c["phase_x"],
            return_conductor_r_ohm=c["return_r"],
            return_conductor_x_ohm=c["return_x"],
            transformer_r_ohm=c["transformer_r"],
            transformer_x_ohm=c["transformer_x"],
        )
        result = compute_fault_loop(build_fault_loop_input(request))
        # 400 kVA station z 50 m kabel: Ik_min ~ 3-5 kA
        assert 1000 < result.ik_min_a < 10000, (
            f"Ik_min = {result.ik_min_a} A poza realistycznym LV range (1-10 kA)"
        )
        assert result.ik_max_a > result.ik_min_a

    def test_gn04_with_upstream_sn_reduces_ik(self) -> None:
        """Dodanie Z upstream SN (250 MVA sk3 per GN04 source) zmniejsza Ik."""
        c = _make_typical_400kva_components()
        base_kwargs = dict(
            fault_node_id="bus_nN_gn04",
            u_nom_v=230.0,
            network_type=NetworkType.TN_S,
            protection_arrangement=ProtectionArrangement.PE,
            phase_conductor_r_ohm=c["phase_r"],
            phase_conductor_x_ohm=c["phase_x"],
            return_conductor_r_ohm=c["return_r"],
            return_conductor_x_ohm=c["return_x"],
            transformer_r_ohm=c["transformer_r"],
            transformer_x_ohm=c["transformer_x"],
        )
        # Bez upstream
        result_base = compute_fault_loop(
            build_fault_loop_input(FaultLoopBuildRequest(**base_kwargs))
        )
        # Z upstream SN (sk3=250 MVA → Z_upstream ≈ U²/sk3 referred do LV side)
        # Per IEC 60909: Z = 1.1 × (15 kV)² / 250 MVA = ~1 mΩ na stronie SN
        # Po sprowadzeniu do LV (1:37.5 ratio): ~3.8 mΩ — używamy 0.001 + j0.005
        result_with_upstream = compute_fault_loop(
            build_fault_loop_input(
                FaultLoopBuildRequest(
                    **base_kwargs,
                    upstream_r_ohm=0.001,
                    upstream_x_ohm=0.005,
                )
            )
        )
        assert result_with_upstream.ik_min_a < result_base.ik_min_a, (
            "Upstream impedance powinien zmniejszyć Ik"
        )


class TestFaultLoopGN05Scenarios:
    """
    GN05 (SN+nN+OZE + ochrona) — analogiczna stacja z dodatkowymi
    zabezpieczeniami. Test sanity że solver radzi sobie z zarówno
    TN-S jak i TN-C-S w tej samej topologii.
    """

    def test_gn05_tn_cs_network(self) -> None:
        """TN-C-S (PEN łączony do split) — wciąż obsługiwane przez MVP solver."""
        c = _make_typical_400kva_components()
        request = FaultLoopBuildRequest(
            fault_node_id="bus_nN_gn05",
            u_nom_v=230.0,
            network_type=NetworkType.TN_C_S,
            protection_arrangement=ProtectionArrangement.PEN,
            phase_conductor_r_ohm=c["phase_r"],
            phase_conductor_x_ohm=c["phase_x"],
            return_conductor_r_ohm=c["return_r"] * 0.5,  # PEN: shared, lower effective R
            return_conductor_x_ohm=c["return_x"] * 0.5,
            transformer_r_ohm=c["transformer_r"],
            transformer_x_ohm=c["transformer_x"],
        )
        result = compute_fault_loop(build_fault_loop_input(request))
        assert result.network_type == NetworkType.TN_C_S
        assert result.ik_min_a > 1000  # nadal w realistycznym zakresie

    def test_gn05_400kva_vs_100kva_ik_difference(self) -> None:
        """Stacja 100 kVA ma wyższą Z_TR → niższe Ik niż 400 kVA."""
        c_400 = _make_typical_400kva_components()
        c_100 = _make_small_station_100kva_components()

        def make_request(node_id: str, c: dict[str, float]) -> FaultLoopBuildRequest:
            return FaultLoopBuildRequest(
                fault_node_id=node_id,
                u_nom_v=230.0,
                network_type=NetworkType.TN_S,
                protection_arrangement=ProtectionArrangement.PE,
                phase_conductor_r_ohm=c["phase_r"],
                phase_conductor_x_ohm=c["phase_x"],
                return_conductor_r_ohm=c["return_r"],
                return_conductor_x_ohm=c["return_x"],
                transformer_r_ohm=c["transformer_r"],
                transformer_x_ohm=c["transformer_x"],
            )

        result_400 = compute_fault_loop(build_fault_loop_input(make_request("bus_nN_400", c_400)))
        result_100 = compute_fault_loop(build_fault_loop_input(make_request("bus_nN_100", c_100)))
        assert result_100.ik_min_a < result_400.ik_min_a, (
            f"Mniejsza stacja (100 kVA Ik={result_100.ik_min_a:.0f} A) powinna mieć "
            f"niższe Ik niż 400 kVA (Ik={result_400.ik_min_a:.0f} A)"
        )


class TestSolverInvariantsAcrossNetworks:
    """Cross-network invariants — solver powinien zachowywać te same gwarancje
    niezależnie od konkretnej reference network."""

    def test_all_scenarios_have_deterministic_result(self) -> None:
        """Same kontekst → identyczny result (per CLAUDE.md §7 Determinism)."""
        c = _make_typical_400kva_components()
        request = FaultLoopBuildRequest(
            fault_node_id="bus_nN_gn04",
            u_nom_v=230.0,
            network_type=NetworkType.TN_S,
            protection_arrangement=ProtectionArrangement.PE,
            phase_conductor_r_ohm=c["phase_r"],
            phase_conductor_x_ohm=c["phase_x"],
            return_conductor_r_ohm=c["return_r"],
            return_conductor_x_ohm=c["return_x"],
            transformer_r_ohm=c["transformer_r"],
            transformer_x_ohm=c["transformer_x"],
        )
        # 5x same call → identical to_dict
        outputs = [
            compute_fault_loop(build_fault_loop_input(request)).to_dict()
            for _ in range(5)
        ]
        assert all(o == outputs[0] for o in outputs)

    def test_all_scenarios_have_white_box_trace(self) -> None:
        """Każdy scenariusz produkuje pełny WHITE BOX trace per V12K canon."""
        c = _make_typical_400kva_components()
        for network_type, protection in [
            (NetworkType.TN_S, ProtectionArrangement.PE),
            (NetworkType.TN_C_S, ProtectionArrangement.PEN),
            (NetworkType.TN_C, ProtectionArrangement.PEN),
        ]:
            request = FaultLoopBuildRequest(
                fault_node_id="bus_nN_test",
                u_nom_v=230.0,
                network_type=network_type,
                protection_arrangement=protection,
                phase_conductor_r_ohm=c["phase_r"],
                phase_conductor_x_ohm=c["phase_x"],
                return_conductor_r_ohm=c["return_r"],
                return_conductor_x_ohm=c["return_x"],
                transformer_r_ohm=c["transformer_r"],
                transformer_x_ohm=c["transformer_x"],
            )
            result = compute_fault_loop(build_fault_loop_input(request))
            assert len(result.white_box_trace) >= 2, (
                f"{network_type.value}: brak white_box_trace"
            )
            assert any(t["step"] == "sum_components" for t in result.white_box_trace)
            assert any(t["step"] == "compute_ik" for t in result.white_box_trace)
