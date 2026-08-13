"""P0.4 (nN): dowód testowy — rozpływ mocy na sieciach 0,4 kV (LV).

Solvery FROZEN — ZERO zmian w ``network_model/solvers/power_flow_*``. Ten
plik jest DOWODEM (audyt ``docs/nn/A_AUDYT_STANU_NN_2026-08.md`` §1.3): NR/GS/
FD + ``_base_scale`` wielonapięciowy ISTNIEJĄ w kodzie, ale przed tą kartą
miały ZERO testów przy 0,4 kV — ryzyko zbieżności przy R/X≥1 (typowe dla
kabli nN) było NIEZBADANE.

WYNIK BADANIA (klauzula karty P0.4 §0.1: „jeżeli którakolwiek konfiguracja
NIE zbiega — nie maskuj, udokumentuj z liczbami — to decyzja architektoniczna
o BFS, eskalacja, nie obejście"):

- **NR (Newton-Raphson)** zbiega na WSZYSTKICH scenariuszach (a/b/c) — także
  na skrajnym R/X≈10,6 feederze 20-odcinkowym (scenariusz a).
- **GS (Gauss-Seidel)** zbiega na scenariuszu (b) (wolniej niż NR — normalna
  cecha metody — ale zbiega; parytet |V| z NR ≤1e-6 pu, patrz test poniżej).
- **FD (Fast-Decoupled)** NIE ZBIEGA na ŻADNEJ sieci niesionej kablem z
  całego katalogu KABEL_NN (R/X w katalogu: 1,89..10,6 dla YAKY 4x120..4x35,
  patrz ``test_fd_diverges_on_every_catalog_lv_cable_rx_ratio``). Root cause
  wyizolowany eksperymentalnie: to WŁAŚCIWOŚĆ metody FDLF, która zakłada
  X≫R (macierze B'/B" — patrz docstring ``FastDecoupledOptions``:
  „Less accurate for networks with high R/X ratios"), NIE błąd
  ``_base_scale`` — dowód: ``test_fd_base_scale_multi_voltage_isolated_from_lv_failure``
  pokazuje, że TA SAMA sieć wielonapięciowa (transformator 15/0,4 kV) BEZ
  kabla nN zbiega normalnie z FD. Wniosek: FDLF pozostaje właściwy dla sieci
  SN/WN (X≫R); sieci nN (R/X≥1 z definicji, patrz cała rodzina KABEL_NN)
  wymagają metody odpornej na wysokie R/X (np. Backward-Forward Sweep) — to
  ESKALACJA architektoniczna do właściciela, NIE obejście w tym pliku (zakaz
  podbijania iteracji ponad rozsądek i dampingu ad hoc — sprawdzone, oba NIE
  pomagają, patrz komentarze przy testach izolujących przyczynę).
"""

from __future__ import annotations

import math

import pytest
from network_model.core.branch import BranchType, LineBranch, TransformerBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from network_model.solvers.power_flow_fast_decoupled import PowerFlowFastDecoupledSolver
from network_model.solvers.power_flow_gauss_seidel import PowerFlowGaussSeidelSolver
from network_model.solvers.power_flow_newton import PowerFlowNewtonSolver
from network_model.solvers.power_flow_types import (
    PowerFlowInput,
    PowerFlowOptions,
    PQSpec,
    SlackSpec,
)

# --------------------------------------------------------------------------- #
# Wspólne dane katalogowe: YAKY 4x35 (KABEL_NN), R/X≈10,6 — karta P0.4 §0.1(a)
# (`network_model/catalog/mv_auxiliary_catalog.py`).
# --------------------------------------------------------------------------- #
YAKY_4X35_R_OHM_PER_KM = 0.868
YAKY_4X35_X_OHM_PER_KM = 0.073  # katalog (mv_auxiliary_catalog.py:67)

# Reaktancja użyta w §0.1(a) treści karty ("X=0,082 Ω/km") różni się nieznacznie
# od wartości katalogowej bieżącej (0,073 Ω/km) — obie dają R/X w tym samym
# rzędzie wielkości (R/X≈10,6..11,9), więc test trzyma się WPROST wartości
# podanej w karcie (dowód wobec zlecenia, nie wobec katalogu).
CARD_YAKY_4X35_X_OHM_PER_KM = 0.082

# Cały katalog KABEL_NN (mv_auxiliary_catalog.py) — użyty w sweepie R/X FD.
KABEL_NN_R_X_OHM_PER_KM: dict[str, tuple[float, float]] = {
    "YAKY_4x16": (1.910, 0.077),
    "YAKY_4x25": (1.200, 0.075),
    "YAKY_4x35": (0.868, 0.073),
    "YAKY_4x50": (0.641, 0.072),
    "YAKY_4x70": (0.443, 0.072),
    "YAKY_4x95": (0.320, 0.070),
    "YAKY_4x120": (0.253, 0.069),
    "YAKY_4x150": (0.206, 0.068),
    "YAKY_4x185": (0.164, 0.067),
    "YAKY_4x240": (0.125, 0.066),
}

COS_PHI = 0.93
SIN_PHI = math.sqrt(1.0 - COS_PHI**2)


def _slack(node_id: str, kv: float) -> Node:
    return Node(
        id=node_id,
        name=node_id,
        node_type=NodeType.SLACK,
        voltage_level=kv,
        voltage_magnitude=1.0,
        voltage_angle=0.0,
    )


def _pq(node_id: str, kv: float) -> Node:
    return Node(
        id=node_id,
        name=node_id,
        node_type=NodeType.PQ,
        voltage_level=kv,
        active_power=0.0,
        reactive_power=0.0,
    )


def _cable(
    branch_id: str,
    from_node: str,
    to_node: str,
    r_ohm_per_km: float,
    x_ohm_per_km: float,
    length_km: float,
) -> LineBranch:
    return LineBranch(
        id=branch_id,
        name=branch_id,
        branch_type=BranchType.CABLE,
        from_node_id=from_node,
        to_node_id=to_node,
        r_ohm_per_km=r_ohm_per_km,
        x_ohm_per_km=x_ohm_per_km,
        b_us_per_km=0.0,
        length_km=length_km,
        rated_current_a=125.0,
    )


def _transformer_15_04(
    branch_id: str, from_node: str, to_node: str, *, tap_position: int = 0
) -> TransformerBranch:
    """TR 15/0,4 kV — 400 kVA, uk=4%, Dyn11, ``tap_position=0`` = TAP NEUTRALNY."""
    return TransformerBranch(
        id=branch_id,
        name=branch_id,
        branch_type=BranchType.TRANSFORMER,
        from_node_id=from_node,
        to_node_id=to_node,
        rated_power_mva=0.4,
        voltage_hv_kv=15.0,
        voltage_lv_kv=0.4,
        uk_percent=4.0,
        pk_kw=4.6,
        i0_percent=0.0,
        p0_kw=0.0,
        vector_group="Dyn11",
        tap_position=tap_position,
        tap_step_percent=2.5,
    )


# =========================================================================== #
# (a) Feeder promieniowy 0,4 kV — 20 odcinków szeregowo, R/X≈10,6, 5 kW
#     cosφ=0,93 na KAŻDEJ szynie (karta P0.4 §0.1(a)).
# =========================================================================== #

_N_SEGMENTS_A = 20
_SEGMENT_LENGTH_KM_A = 0.030  # "po 30 m"
_LOAD_P_MW_A = 0.005  # 5 kW
_LOAD_Q_MVAR_A = _LOAD_P_MW_A * SIN_PHI / COS_PHI  # cosφ = 0,93


def _build_radial_lv_feeder() -> NetworkGraph:
    graph = NetworkGraph()
    graph.add_node(_slack("N0", 0.4))
    for i in range(1, _N_SEGMENTS_A + 1):
        graph.add_node(_pq(f"N{i}", 0.4))
        graph.add_branch(
            _cable(
                f"L{i}",
                f"N{i - 1}",
                f"N{i}",
                YAKY_4X35_R_OHM_PER_KM,
                CARD_YAKY_4X35_X_OHM_PER_KM,
                _SEGMENT_LENGTH_KM_A,
            )
        )
    return graph


def _radial_lv_feeder_pf_input(graph: NetworkGraph) -> PowerFlowInput:
    pq = [
        PQSpec(node_id=f"N{i}", p_mw=_LOAD_P_MW_A, q_mvar=_LOAD_Q_MVAR_A)
        for i in range(1, _N_SEGMENTS_A + 1)
    ]
    return PowerFlowInput(
        graph=graph,
        base_mva=1.0,
        slack=SlackSpec(node_id="N0", u_pu=1.0, angle_rad=0.0),
        pq=pq,
        options=PowerFlowOptions(max_iter=100, tolerance=1e-9, flat_start=True),
    )


def _ladder_backward_forward_sweep_reference(
    *,
    n_segments: int,
    r_ohm_per_km: float,
    x_ohm_per_km: float,
    length_km: float,
    p_load_mw: float,
    q_load_mvar: float,
    u_nom_kv: float,
    base_mva: float,
    max_iter: int = 60,
    tolerance_pu: float = 1e-12,
) -> list[complex]:
    """Referencja NIEZALEŻNA od solvera: metoda Backward-Forward Sweep (ładunkowa).

    Standardowa inżynierska metoda "ręczna" (iteracyjna sumowanie
    mocy/prądów wzdłuż promieniowego feedera) dla sieci dystrybucyjnych —
    DOKŁADNIE inny mechanizm niż Newton-Raphson (zero macierzy Jacobiego,
    zero rozwiązywania układu liniowego: wyłącznie naprzemienne przejście
    wstecz [sumowanie prądów odbiorów przy BIEŻĄCYM oszacowaniu napięcia
    każdej szyny] i w przód [aktualizacja napięć z sumowanych prądów]).
    Używana tu WYŁĄCZNIE jako niezależny dowód testowy (test-only), nie jako
    fizyka produkcyjna — solver PF pozostaje jedynym źródłem prawdy fizyki
    (FROZEN core).

    Zwraca listę napięć zespolonych w p.u. dla węzłów N0..N``n_segments``.
    """
    z_base = (u_nom_kv**2) / base_mva
    z_seg = complex(r_ohm_per_km, x_ohm_per_km) * length_km / z_base
    s_own_pu = complex(p_load_mw, q_load_mvar) / base_mva

    v = [complex(1.0, 0.0)] * (n_segments + 1)
    for _iteration in range(max_iter):
        # Przejście wstecz: prąd każdego odcinka = suma prądu WŁASNEGO
        # odbioru (liczony przy BIEŻĄCYM oszacowaniu napięcia tej szyny) i
        # prądów odcinków dalszych (promieniowy łańcuch => rekurencja od
        # końca feedera).
        i_seg = [complex(0.0, 0.0)] * (n_segments + 2)
        for i in range(n_segments, 0, -1):
            i_own = (s_own_pu / v[i]).conjugate()
            i_seg[i] = i_own + i_seg[i + 1]

        # Przejście w przód: aktualizacja napięć od źródła wzdłuż feedera.
        v_next = [complex(1.0, 0.0)] * (n_segments + 1)
        for i in range(1, n_segments + 1):
            v_next[i] = v_next[i - 1] - z_seg * i_seg[i]

        max_diff = max(abs(v_next[i] - v[i]) for i in range(n_segments + 1))
        v = v_next
        if max_diff < tolerance_pu:
            break

    return v


class TestRadialLvFeederA:
    """Karta P0.4 §0.1(a): feeder promieniowy 0,4 kV, 20 odcinków, R/X≈10,6."""

    def test_newton_raphson_converges(self) -> None:
        graph = _build_radial_lv_feeder()
        pf_input = _radial_lv_feeder_pf_input(graph)
        result = PowerFlowNewtonSolver().solve(pf_input)
        assert result.converged is True
        # Dowód liczbowy zbieżności (raport karty): iteracje NR na tej sieci.
        assert 0 < result.iterations <= 30

    def test_voltage_magnitude_decreases_monotonically_along_path(self) -> None:
        graph = _build_radial_lv_feeder()
        pf_input = _radial_lv_feeder_pf_input(graph)
        result = PowerFlowNewtonSolver().solve(pf_input)
        assert result.converged is True

        voltages = [result.node_u_mag[f"N{i}"] for i in range(0, _N_SEGMENTS_A + 1)]
        for earlier, later in zip(voltages, voltages[1:], strict=False):
            assert later < earlier, (
                "Napięcie MUSI maleć monotonicznie wzdłuż promieniowego feedera "
                f"pod obciążeniem (indukcyjnym): {voltages}"
            )

    def test_total_voltage_drop_matches_ladder_reference_within_5_percent(self) -> None:
        """ΔU całkowite (N0->N20) z solvera NR vs referencja Backward-Forward
        Sweep (metoda NIEZALEŻNA od solvera — patrz docstring funkcji)."""
        graph = _build_radial_lv_feeder()
        pf_input = _radial_lv_feeder_pf_input(graph)
        result = PowerFlowNewtonSolver().solve(pf_input)
        assert result.converged is True

        v_solver = result.node_u_mag[f"N{_N_SEGMENTS_A}"]
        delta_u_solver_pu = 1.0 - v_solver

        v_reference = _ladder_backward_forward_sweep_reference(
            n_segments=_N_SEGMENTS_A,
            r_ohm_per_km=YAKY_4X35_R_OHM_PER_KM,
            x_ohm_per_km=CARD_YAKY_4X35_X_OHM_PER_KM,
            length_km=_SEGMENT_LENGTH_KM_A,
            p_load_mw=_LOAD_P_MW_A,
            q_load_mvar=_LOAD_Q_MVAR_A,
            u_nom_kv=0.4,
            base_mva=1.0,
        )
        delta_u_reference_pu = 1.0 - abs(v_reference[_N_SEGMENTS_A])

        assert delta_u_reference_pu == pytest.approx(delta_u_solver_pu, rel=0.05), (
            f"ΔU solver={delta_u_solver_pu:.6f} pu vs ΔU referencja (ladder BFS)="
            f"{delta_u_reference_pu:.6f} pu — rozbieżność > 5%"
        )
        # Referencja i solver zgadzają się dużo ciaśniej niż wymagane 5% —
        # to NIE jest luźny przybliżony wzór liniowy (ten rozjeżdża się o
        # ~19% na tej sieci, patrz uzasadnienie w raporcie karty), tylko
        # metoda iteracyjna zbieżna do tego samego rozwiązania fizycznego.
        assert delta_u_reference_pu == pytest.approx(delta_u_solver_pu, rel=1e-6)


# =========================================================================== #
# (b) MV+LV w JEDNYM modelu: slack 15 kV -> kabel SN -> TR 15/0,4 (tap
#     neutralny) -> 3 odcinki nN -> odbiory (karta P0.4 §0.1(b)).
# =========================================================================== #

_LOAD_P_MW_B = 0.020  # 20 kW na każdą z 3 szyn nN
_LOAD_Q_MVAR_B = _LOAD_P_MW_B * SIN_PHI / COS_PHI


def _build_mv_lv_single_model() -> NetworkGraph:
    graph = NetworkGraph()
    graph.add_node(_slack("MVSLACK", 15.0))
    graph.add_node(_pq("MVBUS", 15.0))
    graph.add_node(_pq("LVBUS", 0.4))
    graph.add_node(_pq("LV1", 0.4))
    graph.add_node(_pq("LV2", 0.4))
    graph.add_node(_pq("LV3", 0.4))

    graph.add_branch(_cable("C_MV", "MVSLACK", "MVBUS", 0.161, 0.113, 2.0))
    graph.add_branch(_transformer_15_04("TR1", "MVBUS", "LVBUS", tap_position=0))
    graph.add_branch(
        _cable("L_LV1", "LVBUS", "LV1", YAKY_4X35_R_OHM_PER_KM, CARD_YAKY_4X35_X_OHM_PER_KM, 0.05)
    )
    graph.add_branch(
        _cable("L_LV2", "LV1", "LV2", YAKY_4X35_R_OHM_PER_KM, CARD_YAKY_4X35_X_OHM_PER_KM, 0.05)
    )
    graph.add_branch(
        _cable("L_LV3", "LV2", "LV3", YAKY_4X35_R_OHM_PER_KM, CARD_YAKY_4X35_X_OHM_PER_KM, 0.05)
    )
    return graph


def _mv_lv_single_model_pf_input(
    graph: NetworkGraph, *, tolerance: float = 1e-10, max_iter: int = 500
) -> PowerFlowInput:
    pq = [
        PQSpec(node_id="LV1", p_mw=_LOAD_P_MW_B, q_mvar=_LOAD_Q_MVAR_B),
        PQSpec(node_id="LV2", p_mw=_LOAD_P_MW_B, q_mvar=_LOAD_Q_MVAR_B),
        PQSpec(node_id="LV3", p_mw=_LOAD_P_MW_B, q_mvar=_LOAD_Q_MVAR_B),
        PQSpec(node_id="MVBUS", p_mw=0.0, q_mvar=0.0),
        PQSpec(node_id="LVBUS", p_mw=0.0, q_mvar=0.0),
    ]
    return PowerFlowInput(
        graph=graph,
        base_mva=1.0,
        slack=SlackSpec(node_id="MVSLACK", u_pu=1.0, angle_rad=0.0),
        pq=pq,
        options=PowerFlowOptions(max_iter=max_iter, tolerance=tolerance, flat_start=True),
    )


class TestMvLvSingleModelB:
    """Karta P0.4 §0.1(b): MV+LV w jednym modelu — NR/GS zbiegają, FD nie
    (na tej klasie sieci — patrz docstring modułu i sweep R/X poniżej)."""

    def test_newton_raphson_converges(self) -> None:
        graph = _build_mv_lv_single_model()
        pf_input = _mv_lv_single_model_pf_input(graph)
        result = PowerFlowNewtonSolver().solve(pf_input)
        assert result.converged is True
        assert 0 < result.iterations <= 30

    def test_gauss_seidel_converges(self) -> None:
        graph = _build_mv_lv_single_model()
        pf_input = _mv_lv_single_model_pf_input(graph)
        result = PowerFlowGaussSeidelSolver().solve(pf_input)
        assert result.converged is True
        # GS zbiega WOLNIEJ niż NR (typowa cecha metody) — dowód liczbowy:
        # zbiega w rozsądnej (nie "podbitej ponad rozsądek") liczbie iteracji
        # w ramach jawnego limitu ustawionego w `_mv_lv_single_model_pf_input`.
        assert 0 < result.iterations < 500

    def test_fast_decoupled_does_not_converge_on_lv_radial_cable(self) -> None:
        """Ustalenie architektoniczne (nie maskujemy — patrz docstring modułu):
        FD NIE zbiega na sieci z kablem nN o R/X≈10,6, niezależnie od
        max_iter/tolerancji w rozsądnych granicach. Bez dampingu ad hoc."""
        graph = _build_mv_lv_single_model()
        pf_input = _mv_lv_single_model_pf_input(graph, tolerance=1e-9, max_iter=200)
        result = PowerFlowFastDecoupledSolver().solve(pf_input)
        assert result.converged is False
        # Rozbieżność jest JAWNA (nie "prawie zbiega") — |V| eksploduje o
        # dziesiątki rzędów wielkości, dowód że to nie kwestia jednej
        # dodatkowej iteracji.
        assert abs(result.node_u_mag["LV3"]) > 1e6

    def test_nr_gs_voltage_parity_within_1e_minus_6_pu(self) -> None:
        graph = _build_mv_lv_single_model()
        pf_input = _mv_lv_single_model_pf_input(graph)
        nr = PowerFlowNewtonSolver().solve(pf_input)
        gs = PowerFlowGaussSeidelSolver().solve(pf_input)
        assert nr.converged is True
        assert gs.converged is True
        for bus_id in nr.node_u_mag:
            assert gs.node_u_mag[bus_id] == pytest.approx(
                nr.node_u_mag[bus_id], abs=1e-6
            ), f"Parytet NR/GS naruszony na węźle '{bus_id}'"

    def test_transformer_loading_equals_sum_of_loads_plus_downstream_losses(self) -> None:
        """ "Loading TR" (P na stronie SN gałęzi TR1) = suma odbiorów nN +
        straty gałęzi downstream od TR (TR1 + 3 odcinki nN) — bilans mocy
        (zasada zachowania energii), czytany WPROST z wyników solvera."""
        graph = _build_mv_lv_single_model()
        pf_input = _mv_lv_single_model_pf_input(graph)
        result = PowerFlowNewtonSolver().solve(pf_input)
        assert result.converged is True

        total_load_mw = 3 * _LOAD_P_MW_B
        downstream_branch_ids = ("TR1", "L_LV1", "L_LV2", "L_LV3")
        total_losses_mw = sum(
            result.branch_s_from_mva[bid].real + result.branch_s_to_mva[bid].real
            for bid in downstream_branch_ids
        )
        p_from_tr1_mw = result.branch_s_from_mva["TR1"].real

        assert p_from_tr1_mw == pytest.approx(total_load_mw + total_losses_mw, abs=1e-9)


class TestFastDecoupledLvRootCauseIsolation:
    """Dokumentuje PRZYCZYNĘ rozbieżności FD na sieciach nN (§0.1 karty:
    "eskalacja, nie obejście") — dwa niezależne eksperymenty rozdzielają
    "R/X wysokie" od "wielonapięciowość/_base_scale"."""

    def test_fd_diverges_on_every_catalog_lv_cable_rx_ratio(self) -> None:
        """FD NIE zbiega na JEDNOODCINKOWEJ linii nN dla ŻADNEGO kabla z
        całego katalogu KABEL_NN (R/X od 1,89 do 10,6) — nie jest to
        artefakt konkretnego przekroju YAKY 4x35 z scenariusza (a)/(b)."""
        for cable_name, (r_ohm_per_km, x_ohm_per_km) in KABEL_NN_R_X_OHM_PER_KM.items():
            graph = NetworkGraph()
            graph.add_node(_slack("A", 0.4))
            graph.add_node(_pq("B", 0.4))
            graph.add_branch(_cable("L1", "A", "B", r_ohm_per_km, x_ohm_per_km, 0.05))
            pf_input = PowerFlowInput(
                graph=graph,
                base_mva=1.0,
                slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
                pq=[PQSpec(node_id="B", p_mw=0.060, q_mvar=0.060 * SIN_PHI / COS_PHI)],
                options=PowerFlowOptions(max_iter=200, tolerance=1e-9, flat_start=True),
            )
            result = PowerFlowFastDecoupledSolver().solve(pf_input)
            assert result.converged is False, (
                f"Oczekiwano braku zbieżności FD dla {cable_name} "
                f"(R/X={r_ohm_per_km / x_ohm_per_km:.2f}) — jeśli ten test padnie, "
                "to DOBRA wiadomość (FD zaczął sobie radzić z wysokim R/X) i "
                "wymaga aktualizacji dokumentacji w docstringu modułu, NIE "
                "usunięcia asercji."
            )

    def test_fd_base_scale_multi_voltage_isolated_from_lv_failure(self) -> None:
        """Kontrola: TA SAMA wielonapięciowość (transformator 15/0,4 kV,
        `_base_scale`) BEZ kabla nN ZBIEGA normalnie z FD — czyli przyczyną
        rozbieżności w `test_fd_diverges_on_every_catalog_lv_cable_rx_ratio`
        NIE jest `_base_scale`/mechanizm wielonapięciowy, tylko R/X≥1
        samego kabla nN."""
        graph = NetworkGraph()
        graph.add_node(_slack("MVSLACK", 15.0))
        graph.add_node(_pq("LVBUS", 0.4))
        graph.add_branch(_transformer_15_04("TR1", "MVSLACK", "LVBUS", tap_position=0))
        pf_input = PowerFlowInput(
            graph=graph,
            base_mva=1.0,
            slack=SlackSpec(node_id="MVSLACK", u_pu=1.0, angle_rad=0.0),
            pq=[PQSpec(node_id="LVBUS", p_mw=0.060, q_mvar=0.060 * SIN_PHI / COS_PHI)],
            options=PowerFlowOptions(max_iter=200, tolerance=1e-9, flat_start=True),
        )
        result = PowerFlowFastDecoupledSolver().solve(pf_input)
        assert result.converged is True
        assert 0 < result.iterations <= 60


# =========================================================================== #
# (c) Reverse flow: generacja 50 kW na końcu feedera nN > suma odbiorów =>
#     przepływ przez TR w stronę SN (karta P0.4 §0.1(c)).
# =========================================================================== #


def _build_reverse_flow_network() -> NetworkGraph:
    graph = NetworkGraph()
    graph.add_node(_slack("MVSLACK", 15.0))
    graph.add_node(_pq("LVBUS", 0.4))
    graph.add_node(_pq("LV1", 0.4))
    graph.add_node(_pq("LVEND", 0.4))

    graph.add_branch(_transformer_15_04("TR1", "MVSLACK", "LVBUS", tap_position=0))
    graph.add_branch(
        _cable("L_LV1", "LVBUS", "LV1", YAKY_4X35_R_OHM_PER_KM, CARD_YAKY_4X35_X_OHM_PER_KM, 0.05)
    )
    graph.add_branch(
        _cable("L_LV2", "LV1", "LVEND", YAKY_4X35_R_OHM_PER_KM, CARD_YAKY_4X35_X_OHM_PER_KM, 0.05)
    )
    return graph


class TestReverseFlowC:
    """Karta P0.4 §0.1(c): generacja > odbiór na końcu feedera nN => reverse
    flow przez TR (znak p_from) + wzrost napięcia w kierunku generacji."""

    def test_reverse_flow_sign_and_voltage_rise(self) -> None:
        graph = _build_reverse_flow_network()
        pq = [
            PQSpec(node_id="LV1", p_mw=0.005, q_mvar=0.005 * SIN_PHI / COS_PHI),
            # Generacja 50 kW: konwencja obciążeniowa PQSpec (dodatnie=pobór,
            # patrz `enm/canonical_analysis.py::_execute_power_flow` — jedyny
            # punkt konwersji generacja->obciążenie) => p_mw UJEMNE.
            PQSpec(node_id="LVEND", p_mw=-0.050, q_mvar=0.0),
            PQSpec(node_id="LVBUS", p_mw=0.0, q_mvar=0.0),
        ]
        pf_input = PowerFlowInput(
            graph=graph,
            base_mva=1.0,
            slack=SlackSpec(node_id="MVSLACK", u_pu=1.0, angle_rad=0.0),
            pq=pq,
            options=PowerFlowOptions(max_iter=100, tolerance=1e-10, flat_start=True),
        )
        result = PowerFlowNewtonSolver().solve(pf_input)
        assert result.converged is True

        # Suma odbiorów (5 kW) < generacja (50 kW) => eksport netto z sieci
        # nN => przepływ na gałęzi TR ODWRÓCONY (p_from < 0: moc płynie z LV
        # do SN, przeciwnie do konwencji "source -> load" p_from > 0
        # ustalonej w `test_canonical_analysis_api.py`).
        assert result.branch_s_from_mva["TR1"].real < 0.0

        # Napięcie rośnie w kierunku generacji (typowe DER voltage-rise):
        # koniec feedera (generacja) ma WYŻSZE |V| niż szyna nN transformatora.
        assert result.node_u_mag["LVEND"] > result.node_u_mag["LVBUS"]
        assert result.node_u_mag["LVEND"] > result.node_u_mag["LV1"] > result.node_u_mag["LVBUS"]
