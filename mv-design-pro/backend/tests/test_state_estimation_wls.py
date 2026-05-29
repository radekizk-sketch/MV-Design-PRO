"""Testy estymatora stanu WLS (D-05c) — walidacja SYNTETYCZNYM benchmarkiem.

⚠ Benchmark jest SYNTETYCZNY: pomiary generowane z rozpływu znanej sieci + ziarnowany
szum. To TEST NUMERYCZNY estymatora, NIE walidacja wobec rzeczywistych pomiarów
SCADA/PMU (patrz znacznik ``SYNTHETIC_VALIDATION_MARKER``).

Pokrycie:
  - odtworzenie stanu (x̂ ≈ x_true w granicach kilku sigma),
  - detekcja złych danych (chi-kwadrat flaguje + LNR wskazuje zły pomiar),
  - determinizm (identyczny estymat + identyfikator przy powtórzeniu),
  - obserwowalność (układ niedookreślony → jawny błąd, nie śmieciowy estymat),
  - obecność śladu White Box,
  - obecność jawnego znacznika SYNTETYCZNEJ walidacji,
  - reużycie (read-only) zamrożonego buildera Y-bus.
"""

from __future__ import annotations

import math

import numpy as np
import pytest
from network_model.solvers.state_estimation_synthetic_benchmark import (
    BENCHMARK_VALIDATION_MARKER,
    build_synthetic_benchmark,
    inject_gross_error,
)
from network_model.solvers.state_estimation_wls import (
    STATE_ESTIMATION_WLS_VERSION,
    SYNTHETIC_VALIDATION_MARKER,
    Measurement,
    MeasurementSet,
    MeasurementType,
    ObservabilityError,
    estimate_wls,
)

# --------------------------------------------------------------------------- #
# Odtworzenie stanu na syntetycznym benchmarku
# --------------------------------------------------------------------------- #


def test_state_recovery_within_tolerance() -> None:
    """x̂ powinno odtworzyć x_true w granicach kilku sigma (poprawność numeryczna)."""
    bm = build_synthetic_benchmark()
    res = estimate_wls(bm.ybus_pu, bm.measurements, bm.slack_index)

    assert res.converged is True
    assert res.n_states == 5  # 2 kąty (nieslack) + 3 moduły
    assert res.m_measurements == 11  # redundancja m − n = 6

    worst_v = max(abs(a - b) for a, b in zip(res.v_magnitudes, bm.v_true, strict=True))
    worst_theta = max(abs(a - b) for a, b in zip(res.v_angles_rad, bm.theta_true, strict=True))

    # Odchylenia poniżej kilku sigma najmniej dokładnego pomiaru (σ ~0.008).
    assert worst_v < 5.0 * bm.sigma_v, f"worst |V-Vtrue|={worst_v}"
    assert worst_theta < 0.02, f"worst |theta-thetatrue|={worst_theta}"

    # Slack pozostaje referencją kątową.
    assert res.v_angles_rad[bm.slack_index] == pytest.approx(0.0, abs=1e-12)


def test_clean_measurements_recover_true_state_exactly() -> None:
    """Bez szumu (idealne pomiary) estymat = stan prawdziwy z dużą dokładnością."""
    bm = build_synthetic_benchmark()
    res = estimate_wls(bm.ybus_pu, bm.clean_measurements, bm.slack_index)

    assert res.converged is True
    for est, true in zip(res.v_magnitudes, bm.v_true, strict=True):
        assert est == pytest.approx(true, abs=1e-8)
    for est, true in zip(res.v_angles_rad, bm.theta_true, strict=True):
        assert est == pytest.approx(true, abs=1e-8)
    # Idealne pomiary ⇒ funkcja celu ~ 0.
    assert res.objective_j == pytest.approx(0.0, abs=1e-12)


def test_clean_case_chi_square_does_not_flag() -> None:
    """Dla zaszumionego (ale zdrowego) zestawu test chi-kwadrat NIE powinien flagować."""
    bm = build_synthetic_benchmark()
    res = estimate_wls(bm.ybus_pu, bm.measurements, bm.slack_index)
    assert res.bad_data.chi_square_flag is False
    assert res.bad_data.lnr_flag is False
    assert res.bad_data.degrees_of_freedom == 6
    assert res.bad_data.chi_square_value < res.bad_data.chi_square_threshold


# --------------------------------------------------------------------------- #
# Detekcja złych danych
# --------------------------------------------------------------------------- #


def test_bad_data_chi_square_flags_gross_error() -> None:
    """Wstrzyknięty gross error → test chi-kwadrat wykrywa obecność złych danych."""
    bm = build_synthetic_benchmark()
    bad_set = inject_gross_error(bm, measurement_index=0, error_magnitude=20.0 * bm.sigma_v)
    res = estimate_wls(bm.ybus_pu, bad_set, bm.slack_index)

    assert res.bad_data.chi_square_flag is True
    assert res.bad_data.chi_square_value > res.bad_data.chi_square_threshold


def test_bad_data_lnr_identifies_bad_measurement() -> None:
    """Test LNR wskazuje DOKŁADNIE pomiar z grubym błędem."""
    bm = build_synthetic_benchmark()
    bad_index = 5  # pomiar P/Q iniekcji w środku zestawu
    bad_set = inject_gross_error(bm, measurement_index=bad_index, error_magnitude=25.0 * bm.sigma_p)
    res = estimate_wls(bm.ybus_pu, bad_set, bm.slack_index)

    assert res.bad_data.lnr_flag is True
    assert res.bad_data.lnr_measurement_index == bad_index
    assert res.bad_data.largest_normalized_residual > res.bad_data.lnr_threshold


def test_bad_data_lnr_identifies_voltage_measurement() -> None:
    """Gross error na pomiarze |V| (indeks 0) jest poprawnie identyfikowany przez LNR."""
    bm = build_synthetic_benchmark()
    bad_set = inject_gross_error(bm, measurement_index=0, error_magnitude=18.0 * bm.sigma_v)
    res = estimate_wls(bm.ybus_pu, bad_set, bm.slack_index)
    assert res.bad_data.lnr_flag is True
    assert res.bad_data.lnr_measurement_index == 0


# --------------------------------------------------------------------------- #
# Determinizm
# --------------------------------------------------------------------------- #


def test_determinism_identical_estimate_and_id() -> None:
    """Te same wejścia → identyczny estymat i identyczny identyfikator SHA-256."""
    bm1 = build_synthetic_benchmark(seed=20260529)
    bm2 = build_synthetic_benchmark(seed=20260529)

    # Ten sam seed ⇒ identyczne pomiary.
    z1 = [m.value for m in bm1.measurements.measurements]
    z2 = [m.value for m in bm2.measurements.measurements]
    assert z1 == z2

    res1 = estimate_wls(bm1.ybus_pu, bm1.measurements, bm1.slack_index)
    res2 = estimate_wls(bm2.ybus_pu, bm2.measurements, bm2.slack_index)

    assert res1.estimate_id == res2.estimate_id
    assert res1.v_magnitudes == res2.v_magnitudes
    assert res1.v_angles_rad == res2.v_angles_rad
    assert res1.objective_j == res2.objective_j


def test_different_seed_changes_measurements_and_id() -> None:
    """Inny seed → inny szum → (na ogół) inny estymat i identyfikator."""
    bm_a = build_synthetic_benchmark(seed=1)
    bm_b = build_synthetic_benchmark(seed=2)
    res_a = estimate_wls(bm_a.ybus_pu, bm_a.measurements, bm_a.slack_index)
    res_b = estimate_wls(bm_b.ybus_pu, bm_b.measurements, bm_b.slack_index)
    assert res_a.estimate_id != res_b.estimate_id


def test_estimate_id_is_sha256_hex() -> None:
    """Identyfikator jest 64-znakowym heksadecymalnym SHA-256."""
    bm = build_synthetic_benchmark()
    res = estimate_wls(bm.ybus_pu, bm.measurements, bm.slack_index)
    assert len(res.estimate_id) == 64
    int(res.estimate_id, 16)  # parsowalny jako hex


# --------------------------------------------------------------------------- #
# Obserwowalność (układ niedookreślony → jawny błąd)
# --------------------------------------------------------------------------- #


def test_underdetermined_raises_observability_error() -> None:
    """m < n → ObservabilityError, NIE śmieciowy estymat (CLAUDE.md: brak zgadywania)."""
    bm = build_synthetic_benchmark()
    # Tylko 3 pomiary |V| przy n=5 stanach → niedookreślony.
    too_few = MeasurementSet(
        tuple(
            Measurement(MeasurementType.V_MAGNITUDE, i, value=float(bm.v_true[i]), sigma=0.004)
            for i in range(3)
        )
    )
    with pytest.raises(ObservabilityError):
        estimate_wls(bm.ybus_pu, too_few, bm.slack_index)


def test_unobservable_singular_gain_raises() -> None:
    """Komplet pomiarów o zerowej wrażliwości na kąty → osobliwa G → ObservabilityError.

    11 pomiarów (m ≥ n), ale WSZYSTKIE to |V| (brak informacji o kątach) ⇒ kolumny
    kątowe Jacobianu są zerowe ⇒ rank(H) < n ⇒ G osobliwa. Estymator musi zgłosić
    brak obserwowalności, a nie zwrócić śmieci.
    """
    bm = build_synthetic_benchmark()
    only_v = MeasurementSet(
        tuple(
            Measurement(
                MeasurementType.V_MAGNITUDE, i % 3, value=float(bm.v_true[i % 3]), sigma=0.004
            )
            for i in range(11)
        )
    )
    with pytest.raises(ObservabilityError):
        estimate_wls(bm.ybus_pu, only_v, bm.slack_index)


# --------------------------------------------------------------------------- #
# White Box + znacznik SYNTETYCZNY
# --------------------------------------------------------------------------- #


def test_white_box_trace_present_and_complete() -> None:
    """Ślad White Box musi wystawiać H, G, r, Δx i J na każdej iteracji."""
    bm = build_synthetic_benchmark()
    res = estimate_wls(bm.ybus_pu, bm.measurements, bm.slack_index, trace=True)

    assert len(res.white_box) == res.iterations
    first = res.white_box[0]
    # H = ∂h/∂x  ma wymiar m × n.
    assert len(first.h_jacobian) == res.m_measurements
    assert len(first.h_jacobian[0]) == res.n_states
    # G = HᵀWH ma wymiar n × n.
    assert len(first.gain_matrix_g) == res.n_states
    assert len(first.gain_matrix_g[0]) == res.n_states
    # r = z − h(x) ma długość m.
    assert len(first.residual_r) == res.m_measurements
    # Δx ma długość n.
    assert len(first.delta_x) == res.n_states
    # state_x ma długość n.
    assert len(first.state_x) == res.n_states
    # J jest skończone i nieujemne.
    assert math.isfinite(first.objective_j)
    assert first.objective_j >= 0.0

    # Funkcja celu maleje (Gauss-Newton na zdrowym zestawie).
    objectives = [it.objective_j for it in res.white_box]
    assert objectives[-1] <= objectives[0]


def test_objective_equals_weighted_residual_sum() -> None:
    """J(x̂) = r̂ᵀ W r̂ — sprawdzenie spójności funkcji celu z definicją."""
    bm = build_synthetic_benchmark()
    res = estimate_wls(bm.ybus_pu, bm.measurements, bm.slack_index)
    # Funkcja celu = wartość testu chi-kwadrat (z definicji J = r^T W r).
    assert res.objective_j == pytest.approx(res.bad_data.chi_square_value, rel=1e-9)


def test_synthetic_marker_present_on_result() -> None:
    """Wynik MUSI nieść jawny znacznik SYNTETYCZNEJ walidacji (nie pomylić z realnymi)."""
    bm = build_synthetic_benchmark()
    res = estimate_wls(bm.ybus_pu, bm.measurements, bm.slack_index)

    assert res.validation_status == SYNTHETIC_VALIDATION_MARKER
    assert "SYNTETYCZNY" in res.validation_status
    assert "NIE walidacja wobec rzeczywistych pomiarów SCADA/PMU" in res.validation_status
    # Znacznik trafia też do serializacji.
    assert res.to_dict()["validation_status"] == SYNTHETIC_VALIDATION_MARKER


def test_benchmark_marker_present() -> None:
    """Sam benchmark również niesie jawny znacznik SYNTETYCZNY."""
    bm = build_synthetic_benchmark()
    assert bm.validation_status == BENCHMARK_VALIDATION_MARKER
    assert "SYNTETYCZNY" in BENCHMARK_VALIDATION_MARKER


def test_result_to_dict_serializable() -> None:
    """to_dict() jest w pełni serializowalne do JSON (determinizm eksportu)."""
    import json

    bm = build_synthetic_benchmark()
    res = estimate_wls(bm.ybus_pu, bm.measurements, bm.slack_index)
    encoded = json.dumps(res.to_dict(), sort_keys=True)
    assert STATE_ESTIMATION_WLS_VERSION in encoded
    # Powtórna serializacja identyczna (determinizm).
    assert encoded == json.dumps(res.to_dict(), sort_keys=True)


# --------------------------------------------------------------------------- #
# Walidacja wejścia
# --------------------------------------------------------------------------- #


def test_measurement_rejects_nonpositive_sigma() -> None:
    with pytest.raises(ValueError, match="sigma"):
        Measurement(MeasurementType.V_MAGNITUDE, 0, value=1.0, sigma=0.0)


def test_flow_measurement_requires_bus_j() -> None:
    with pytest.raises(ValueError, match="bus_j"):
        Measurement(MeasurementType.P_FLOW, 0, value=0.1, sigma=0.01)


def test_injection_measurement_rejects_bus_j() -> None:
    with pytest.raises(ValueError, match="bus_j"):
        Measurement(MeasurementType.P_INJECTION, 0, value=0.1, sigma=0.01, bus_j=1)


def test_empty_measurement_set_rejected() -> None:
    with pytest.raises(ValueError, match="pusty"):
        MeasurementSet(())


def test_non_square_ybus_rejected() -> None:
    bm = build_synthetic_benchmark()
    with pytest.raises(ValueError, match="kwadratową"):
        estimate_wls(np.zeros((3, 2), dtype=complex), bm.measurements, 0)


def test_slack_index_out_of_range_rejected() -> None:
    bm = build_synthetic_benchmark()
    with pytest.raises(ValueError, match="slack_index"):
        estimate_wls(bm.ybus_pu, bm.measurements, 99)


def test_measurement_bus_out_of_range_rejected() -> None:
    bm = build_synthetic_benchmark()
    bad = MeasurementSet(
        (Measurement(MeasurementType.V_MAGNITUDE, 99, value=1.0, sigma=0.004),) * 5
    )
    with pytest.raises(ValueError, match="nieistniejącego węzła"):
        estimate_wls(bm.ybus_pu, bad, 0)


# --------------------------------------------------------------------------- #
# Reużycie zamrożonego buildera Y-bus (read-only)
# --------------------------------------------------------------------------- #


def test_ybus_from_network_graph_reuses_frozen_builder() -> None:
    """``ybus_from_network_graph`` poprawnie reużywa zamrożony build_ybus_pu (read-only).

    Buduje mały 2-szynowy graf domenowy z jedną linią i sprawdza, że zwrócona Y-bus
    jest spójna z bezpośrednim obliczeniem admitancji. Dowodzi autoryzowanego
    reużycia buildera do funkcji pomiarowych h(x).
    """
    from network_model.core.branch import BranchType, LineBranch
    from network_model.core.graph import NetworkGraph
    from network_model.core.node import Node, NodeType
    from network_model.solvers.state_estimation_wls import ybus_from_network_graph

    graph = NetworkGraph()
    graph.add_node(
        Node(
            id="A",
            name="A",
            node_type=NodeType.SLACK,
            voltage_level=15.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    graph.add_node(
        Node(
            id="B",
            name="B",
            node_type=NodeType.PQ,
            voltage_level=15.0,
            active_power=1.0,
            reactive_power=0.5,
        )
    )
    graph.add_branch(
        LineBranch(
            id="L1",
            name="Line A-B",
            branch_type=BranchType.LINE,
            from_node_id="A",
            to_node_id="B",
            r_ohm_per_km=0.1,
            x_ohm_per_km=0.3,
            length_km=2.0,
        )
    )

    ybus, idx_map = ybus_from_network_graph(graph, base_mva=10.0, slack_node_id="A")

    assert ybus.shape == (2, 2)
    assert set(idx_map.keys()) == {"A", "B"}
    # Y-bus symetryczna, suma off-diagonal = −y_series.
    ia, ib = idx_map["A"], idx_map["B"]
    assert ybus[ia, ib] == pytest.approx(ybus[ib, ia])
    # Diagonala = −off-diagonal (brak boczników na tej linii bez b_us_per_km).
    assert ybus[ia, ia] == pytest.approx(-ybus[ia, ib], rel=1e-9)


def test_wls_on_graph_built_ybus_recovers_state() -> None:
    """Estymator działa na Y-bus zbudowanej z grafu (przez zamrożony builder).

    Pełna pętla: graf domenowy → Y-bus (read-only frozen builder) → syntetyczne
    pomiary z założonego stanu → WLS → odtworzenie stanu. SYNTETYCZNY test numeryczny.
    """
    from network_model.core.branch import BranchType, LineBranch
    from network_model.core.graph import NetworkGraph
    from network_model.core.node import Node, NodeType
    from network_model.solvers.state_estimation_wls import (
        _h_injection_p,
        _h_injection_q,
        ybus_from_network_graph,
    )

    graph = NetworkGraph()
    graph.add_node(
        Node(
            id="A",
            name="A",
            node_type=NodeType.SLACK,
            voltage_level=15.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    graph.add_node(
        Node(
            id="B",
            name="B",
            node_type=NodeType.PQ,
            voltage_level=15.0,
            active_power=1.0,
            reactive_power=0.5,
        )
    )
    graph.add_branch(
        LineBranch(
            id="L1",
            name="L1",
            branch_type=BranchType.LINE,
            from_node_id="A",
            to_node_id="B",
            r_ohm_per_km=0.1,
            x_ohm_per_km=0.3,
            length_km=2.0,
        )
    )
    ybus, idx_map = ybus_from_network_graph(graph, base_mva=10.0, slack_node_id="A")

    # Załóż znany stan i wygeneruj idealne pomiary (test numeryczny, syntetyczny).
    g = ybus.real
    b = ybus.imag
    theta_true = np.array([0.0, -0.05])
    v_true = np.array([1.0, 0.97])
    ib = idx_map["B"]
    meas = MeasurementSet(
        (
            Measurement(MeasurementType.V_MAGNITUDE, idx_map["A"], value=1.0, sigma=0.001),
            Measurement(MeasurementType.V_MAGNITUDE, ib, value=float(v_true[ib]), sigma=0.001),
            Measurement(
                MeasurementType.P_INJECTION,
                ib,
                value=_h_injection_p(g, b, v_true, theta_true, ib),
                sigma=0.001,
            ),
            Measurement(
                MeasurementType.Q_INJECTION,
                ib,
                value=_h_injection_q(g, b, v_true, theta_true, ib),
                sigma=0.001,
            ),
        )
    )
    res = estimate_wls(ybus, meas, slack_index=idx_map["A"])
    assert res.converged is True
    assert res.v_magnitudes[ib] == pytest.approx(v_true[ib], abs=1e-4)
    assert res.v_angles_rad[ib] == pytest.approx(theta_true[ib], abs=1e-4)
