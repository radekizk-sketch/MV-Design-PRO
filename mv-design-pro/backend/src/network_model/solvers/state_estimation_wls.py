"""Weighted Least Squares (WLS) power-system state estimator — WHITE BOX.

Standardowy estymator stanu metodą ważonych najmniejszych kwadratów
(Weighted Least Squares, WLS) wg klasycznej literatury:

  - F. C. Schweppe, J. Wildes, "Power System Static-State Estimation"
    (IEEE Trans. PAS, 1970) — sformułowanie WLS i równania normalne;
  - A. Abur, A. Gómez Expósito, "Power System State Estimation: Theory and
    Implementation" (Marcel Dekker, 2004) — Jacobian pomiarów H, test
    chi-kwadrat oraz test największej znormalizowanej rezyduy (LNR).

D-05c. Jest to NOWY, oddzielny solver numeryczny w warstwie SOLVER. NIE modyfikuje
i NIE jest jednym z zamrożonych solverów (short_circuit_iec60909, power_flow_newton,
power_flow_newton_internal, ybus). Może czytać (read-only) builder Y-bus z warstwy
solvera do policzenia funkcji pomiarowych h(x) — patrz ``ybus_from_network_graph``.

WHITE BOX (CLAUDE.md): solver wystawia KAŻDY krok — Jacobian pomiarów H, macierz
zysku G = Hᵀ W H, rezyduę r = z − h(x), przyrost stanu Δx oraz funkcję celu na
każdej iteracji J(x) = rᵀ W r. Ślad jest deterministyczny.

DETERMINIZM: te same wejścia (Y-bus + zestaw pomiarów) dają identyczny estymat oraz
identyczny identyfikator SHA-256 (``estimate_id``).

WAŻNE — ZAKRES WALIDACJI: ten moduł jest weryfikowany SYNTETYCZNYM benchmarkiem
(``state_estimation_synthetic_benchmark``): pomiary generowane są z rozwiązania
rozpływu znanej sieci + ziarnowany szum gaussowski. To TEST NUMERYCZNY estymatora,
a NIE walidacja wobec rzeczywistych pomiarów SCADA/PMU. Walidacja na realnych danych
SCADA/PMU pozostaje pracą przyszłą (wymaga rzeczywistych telemetrii i kowariancji).

Formulacja (płaski wektor stanu, Abur & Expósito §2):
  x = [θ_i : i ≠ slack]  ⊕  [V_i : wszystkie i]
  z = pomiary {|V|_i, P_i, Q_i (iniekcje węzłowe), P_ij, Q_ij (przepływy gałęzi)}
  R = kowariancja pomiarów (diagonalna);  W = R⁻¹ (wagi)
  h(x) = funkcje pomiarowe z macierzy Y-bus
  G Δx = Hᵀ W (z − h(x)),  G = Hᵀ W H  — równania normalne Gaussa-Newtona
  J(x̂) = r̂ᵀ W r̂  — funkcja celu (resztkowa suma ważonych kwadratów)
"""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass, field
from enum import Enum
from typing import TYPE_CHECKING, Any

import numpy as np

if TYPE_CHECKING:
    from collections.abc import Iterable

    from network_model.core.graph import NetworkGraph

STATE_ESTIMATION_WLS_VERSION = "wls-se-whitebox-1.0"

# Jawny znacznik: wynik tego solvera jest testowany SYNTETYCZNIE, NIE wobec
# rzeczywistych pomiarów. Ten łańcuch musi pojawić się w wyniku, aby nikt nie
# pomylił go z walidacją na danych rzeczywistych.
SYNTHETIC_VALIDATION_MARKER = (
    "SYNTETYCZNY benchmark — test numeryczny estymatora, "
    "NIE walidacja wobec rzeczywistych pomiarów SCADA/PMU"
)


class MeasurementType(str, Enum):
    """Typy pomiarów obsługiwane przez estymator (Abur & Expósito §2.2)."""

    V_MAGNITUDE = "V_MAGNITUDE"  # |V_i| — moduł napięcia węzła [pu]
    P_INJECTION = "P_INJECTION"  # P_i — iniekcja mocy czynnej w węźle [pu]
    Q_INJECTION = "Q_INJECTION"  # Q_i — iniekcja mocy biernej w węźle [pu]
    P_FLOW = "P_FLOW"  # P_ij — przepływ mocy czynnej w gałęzi (od i do j) [pu]
    Q_FLOW = "Q_FLOW"  # Q_ij — przepływ mocy biernej w gałęzi (od i do j) [pu]


@dataclass(frozen=True)
class Measurement:
    """Pojedynczy pomiar telemetryczny (warstwa wejścia, NIEzależna od solvera).

    Wartości w jednostkach względnych (pu) na tej samej bazie co Y-bus.

    Attributes:
        meas_type: typ pomiaru (|V|, P/Q iniekcja, P/Q przepływ).
        bus_i: indeks węzła pomiaru (dla iniekcji i |V|) lub węzeł "od" (dla przepływu).
        value: zmierzona wartość [pu].
        sigma: odchylenie standardowe pomiaru [pu] (pierwiastek z wariancji R_kk).
        bus_j: węzeł "do" gałęzi — wymagany dla P_FLOW/Q_FLOW, w innym razie None.
        label: opcjonalna etykieta (np. identyfikator gałęzi) do śladu/diagnozy.
    """

    meas_type: MeasurementType
    bus_i: int
    value: float
    sigma: float
    bus_j: int | None = None
    label: str | None = None

    def __post_init__(self) -> None:
        if self.sigma <= 0.0:
            raise ValueError("Measurement.sigma musi być > 0 (W = 1/sigma^2).")
        is_flow = self.meas_type in (MeasurementType.P_FLOW, MeasurementType.Q_FLOW)
        if is_flow and self.bus_j is None:
            raise ValueError(f"Pomiar przepływu {self.meas_type} wymaga bus_j.")
        if not is_flow and self.bus_j is not None:
            raise ValueError(f"Pomiar {self.meas_type} nie może mieć bus_j.")


@dataclass(frozen=True)
class MeasurementSet:
    """Zestaw pomiarów dla estymatora WLS (uporządkowany, deterministyczny)."""

    measurements: tuple[Measurement, ...]

    def __post_init__(self) -> None:
        if not self.measurements:
            raise ValueError("MeasurementSet nie może być pusty.")

    @property
    def m(self) -> int:
        """Liczba pomiarów."""
        return len(self.measurements)


@dataclass(frozen=True)
class WhiteBoxIteration:
    """Pełny ślad White Box pojedynczej iteracji Gaussa-Newtona.

    Wszystkie macierze są zserializowane jako listy list (deterministycznie).
    """

    iteration: int
    objective_j: float  # J(x) = r^T W r przed krokiem
    max_abs_residual: float
    h_jacobian: list[list[float]]  # H = ∂h/∂x  (m × n)
    gain_matrix_g: list[list[float]]  # G = H^T W H  (n × n)
    residual_r: list[float]  # r = z − h(x)  (m)
    delta_x: list[float]  # Δx  (n)
    step_norm: float  # ||Δx||_∞
    state_x: list[float]  # x przed krokiem (n)


@dataclass(frozen=True)
class BadDataReport:
    """Wynik detekcji złych danych (chi-kwadrat + LNR)."""

    chi_square_value: float  # J(x̂)
    chi_square_threshold: float  # χ²_{m−n, α}
    degrees_of_freedom: int  # m − n
    alpha: float  # poziom istotności
    chi_square_flag: bool  # True ⇒ test wykrył obecność złych danych
    largest_normalized_residual: float  # max_i |r_i| / sqrt(Ω_ii)
    lnr_measurement_index: int | None  # indeks pomiaru o największej r_N (podejrzany)
    lnr_threshold: float  # próg odrzucenia r_N (domyślnie 3.0)
    lnr_flag: bool  # True ⇒ podejrzany pomiar przekracza próg r_N
    normalized_residuals: list[float]  # r_N_i dla wszystkich pomiarów

    def to_dict(self) -> dict[str, Any]:
        return {
            "chi_square_value": self.chi_square_value,
            "chi_square_threshold": self.chi_square_threshold,
            "degrees_of_freedom": self.degrees_of_freedom,
            "alpha": self.alpha,
            "chi_square_flag": self.chi_square_flag,
            "largest_normalized_residual": self.largest_normalized_residual,
            "lnr_measurement_index": self.lnr_measurement_index,
            "lnr_threshold": self.lnr_threshold,
            "lnr_flag": self.lnr_flag,
            "normalized_residuals": list(self.normalized_residuals),
        }


@dataclass(frozen=True)
class StateEstimationResult:
    """Wynik estymacji stanu WLS (WHITE BOX, deterministyczny).

    Attributes:
        converged: czy iteracja Gaussa-Newtona zbiegła (||Δx||_∞ < tol).
        iterations: liczba wykonanych iteracji.
        v_magnitudes: estymowane moduły napięć |V̂_i| [pu] (indeks = węzeł).
        v_angles_rad: estymowane kąty napięć θ̂_i [rad] (slack = 0).
        objective_j: końcowa funkcja celu J(x̂) = r̂ᵀ W r̂.
        bad_data: raport detekcji złych danych (chi-kwadrat + LNR).
        white_box: ślad każdej iteracji.
        n_states: liczba zmiennych stanu n.
        m_measurements: liczba pomiarów m.
        validation_status: jawny znacznik SYNTETYCZNEJ walidacji.
        estimate_id: deterministyczny identyfikator SHA-256 estymatu.
        solver_version: wersja solvera.
        note: opcjonalna nota (np. ostrzeżenia numeryczne).
    """

    converged: bool
    iterations: int
    v_magnitudes: tuple[float, ...]
    v_angles_rad: tuple[float, ...]
    objective_j: float
    bad_data: BadDataReport
    white_box: tuple[WhiteBoxIteration, ...]
    n_states: int
    m_measurements: int
    validation_status: str
    estimate_id: str
    solver_version: str = STATE_ESTIMATION_WLS_VERSION
    note: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "converged": self.converged,
            "iterations": self.iterations,
            "v_magnitudes": list(self.v_magnitudes),
            "v_angles_rad": list(self.v_angles_rad),
            "objective_j": self.objective_j,
            "bad_data": self.bad_data.to_dict(),
            "n_states": self.n_states,
            "m_measurements": self.m_measurements,
            "validation_status": self.validation_status,
            "estimate_id": self.estimate_id,
            "solver_version": self.solver_version,
            "note": self.note,
            "white_box": [
                {
                    "iteration": it.iteration,
                    "objective_j": it.objective_j,
                    "max_abs_residual": it.max_abs_residual,
                    "h_jacobian": it.h_jacobian,
                    "gain_matrix_g": it.gain_matrix_g,
                    "residual_r": it.residual_r,
                    "delta_x": it.delta_x,
                    "step_norm": it.step_norm,
                    "state_x": it.state_x,
                }
                for it in self.white_box
            ],
        }


class ObservabilityError(ValueError):
    """Układ nieobserwowalny / niedookreślony: macierz zysku G jest osobliwa.

    Zgłaszane zamiast zwracania śmieciowego estymatu (CLAUDE.md: brak zgadywania).
    """


@dataclass
class _StateLayout:
    """Mapowanie zmiennych stanu na pozycje w wektorze x.

    x = [θ_i : i ≠ slack]  ⊕  [V_i : wszystkie i]
    """

    n_buses: int
    slack_index: int
    angle_buses: list[int] = field(default_factory=list)  # węzły z kątem (≠ slack)
    angle_pos: dict[int, int] = field(default_factory=dict)  # węzeł → pozycja w x
    mag_pos: dict[int, int] = field(default_factory=dict)  # węzeł → pozycja w x

    @property
    def n_states(self) -> int:
        return len(self.angle_buses) + self.n_buses

    @classmethod
    def build(cls, n_buses: int, slack_index: int) -> _StateLayout:
        layout = cls(n_buses=n_buses, slack_index=slack_index)
        layout.angle_buses = [i for i in range(n_buses) if i != slack_index]
        for pos, bus in enumerate(layout.angle_buses):
            layout.angle_pos[bus] = pos
        offset = len(layout.angle_buses)
        for bus in range(n_buses):
            layout.mag_pos[bus] = offset + bus
        return layout


def _unpack_state(x: np.ndarray, layout: _StateLayout) -> tuple[np.ndarray, np.ndarray]:
    """Z wektora stanu x odtwórz pełne wektory kątów θ (slack=0 ref) i modułów V."""
    n = layout.n_buses
    theta = np.zeros(n, dtype=float)
    for bus in layout.angle_buses:
        theta[bus] = x[layout.angle_pos[bus]]
    v = np.array([x[layout.mag_pos[bus]] for bus in range(n)], dtype=float)
    return theta, v


def _h_injection_p(g: np.ndarray, b: np.ndarray, v: np.ndarray, th: np.ndarray, i: int) -> float:
    """P_i = V_i Σ_k V_k (G_ik cos θ_ik + B_ik sin θ_ik), θ_ik = θ_i − θ_k."""
    total = 0.0
    for k in range(len(v)):
        ang = th[i] - th[k]
        total += v[k] * (g[i, k] * math.cos(ang) + b[i, k] * math.sin(ang))
    return v[i] * total


def _h_injection_q(g: np.ndarray, b: np.ndarray, v: np.ndarray, th: np.ndarray, i: int) -> float:
    """Q_i = V_i Σ_k V_k (G_ik sin θ_ik − B_ik cos θ_ik)."""
    total = 0.0
    for k in range(len(v)):
        ang = th[i] - th[k]
        total += v[k] * (g[i, k] * math.sin(ang) - b[i, k] * math.cos(ang))
    return v[i] * total


def _series_g_b(ybus: np.ndarray, i: int, j: int) -> tuple[float, float]:
    """Admitancja gałęziowa między i,j: y_ij = −Y_ij = g_ij + j b_ij (model π).

    Dla przepływu używamy konwencji Abur & Expósito (§2.2): bez gałęziowej
    susceptancji poprzecznej w pomiarze (model dwuportowy z admitancją szeregową
    odtworzoną z poza-przekątnej Y-bus). Dla sieci bez bocznika daje to dokładnie
    przepływ szeregowy; gdy bocznik istnieje, jest on traktowany jako część iniekcji.
    """
    y_ij = -ybus[i, j]
    return float(y_ij.real), float(y_ij.imag)


def _h_flow_p(ybus: np.ndarray, v: np.ndarray, th: np.ndarray, i: int, j: int) -> float:
    """P_ij = V_i² g_ij − V_i V_j (g_ij cos θ_ij + b_ij sin θ_ij)."""
    g_ij, b_ij = _series_g_b(ybus, i, j)
    ang = th[i] - th[j]
    return v[i] ** 2 * g_ij - v[i] * v[j] * (g_ij * math.cos(ang) + b_ij * math.sin(ang))


def _h_flow_q(ybus: np.ndarray, v: np.ndarray, th: np.ndarray, i: int, j: int) -> float:
    """Q_ij = −V_i² b_ij − V_i V_j (g_ij sin θ_ij − b_ij cos θ_ij)."""
    g_ij, b_ij = _series_g_b(ybus, i, j)
    ang = th[i] - th[j]
    return -(v[i] ** 2) * b_ij - v[i] * v[j] * (g_ij * math.sin(ang) - b_ij * math.cos(ang))


def _compute_h(
    ybus: np.ndarray, meas: MeasurementSet, theta: np.ndarray, v: np.ndarray
) -> np.ndarray:
    """Wektor funkcji pomiarowych h(x) dla wszystkich pomiarów (kolejność zestawu)."""
    g = ybus.real
    b = ybus.imag
    h = np.zeros(meas.m, dtype=float)
    for idx, mm in enumerate(meas.measurements):
        if mm.meas_type == MeasurementType.V_MAGNITUDE:
            h[idx] = v[mm.bus_i]
        elif mm.meas_type == MeasurementType.P_INJECTION:
            h[idx] = _h_injection_p(g, b, v, theta, mm.bus_i)
        elif mm.meas_type == MeasurementType.Q_INJECTION:
            h[idx] = _h_injection_q(g, b, v, theta, mm.bus_i)
        elif mm.meas_type == MeasurementType.P_FLOW:
            assert mm.bus_j is not None
            h[idx] = _h_flow_p(ybus, v, theta, mm.bus_i, mm.bus_j)
        elif mm.meas_type == MeasurementType.Q_FLOW:
            assert mm.bus_j is not None
            h[idx] = _h_flow_q(ybus, v, theta, mm.bus_i, mm.bus_j)
    return h


def _d_injection_p(
    g: np.ndarray, b: np.ndarray, v: np.ndarray, th: np.ndarray, i: int, layout: _StateLayout
) -> np.ndarray:
    """Wiersz Jacobianu ∂P_i/∂x (kąty + moduły). Abur & Expósito, eq. (2.20)–(2.21)."""
    row = np.zeros(layout.n_states, dtype=float)
    p_i = _h_injection_p(g, b, v, th, i)
    # ∂P_i/∂θ_j
    for j in layout.angle_buses:
        if j == i:
            # ∂P_i/∂θ_i = −Q_i − B_ii V_i²
            q_i = _h_injection_q(g, b, v, th, i)
            row[layout.angle_pos[j]] = -q_i - b[i, i] * v[i] ** 2
        else:
            ang = th[i] - th[j]
            row[layout.angle_pos[j]] = (
                v[i] * v[j] * (g[i, j] * math.sin(ang) - b[i, j] * math.cos(ang))
            )
    # ∂P_i/∂V_j
    for j in range(layout.n_buses):
        if j == i:
            # ∂P_i/∂V_i = P_i / V_i + G_ii V_i
            row[layout.mag_pos[j]] = p_i / v[i] + g[i, i] * v[i]
        else:
            ang = th[i] - th[j]
            row[layout.mag_pos[j]] = v[i] * (g[i, j] * math.cos(ang) + b[i, j] * math.sin(ang))
    return row


def _d_injection_q(
    g: np.ndarray, b: np.ndarray, v: np.ndarray, th: np.ndarray, i: int, layout: _StateLayout
) -> np.ndarray:
    """Wiersz Jacobianu ∂Q_i/∂x. Abur & Expósito, eq. (2.22)–(2.23)."""
    row = np.zeros(layout.n_states, dtype=float)
    p_i = _h_injection_p(g, b, v, th, i)
    q_i = _h_injection_q(g, b, v, th, i)
    # ∂Q_i/∂θ_j
    for j in layout.angle_buses:
        if j == i:
            # ∂Q_i/∂θ_i = P_i − G_ii V_i²
            row[layout.angle_pos[j]] = p_i - g[i, i] * v[i] ** 2
        else:
            ang = th[i] - th[j]
            row[layout.angle_pos[j]] = (
                -v[i] * v[j] * (g[i, j] * math.cos(ang) + b[i, j] * math.sin(ang))
            )
    # ∂Q_i/∂V_j
    for j in range(layout.n_buses):
        if j == i:
            # ∂Q_i/∂V_i = Q_i / V_i − B_ii V_i
            row[layout.mag_pos[j]] = q_i / v[i] - b[i, i] * v[i]
        else:
            ang = th[i] - th[j]
            row[layout.mag_pos[j]] = v[i] * (g[i, j] * math.sin(ang) - b[i, j] * math.cos(ang))
    return row


def _d_flow_p(
    ybus: np.ndarray, v: np.ndarray, th: np.ndarray, i: int, j: int, layout: _StateLayout
) -> np.ndarray:
    """Wiersz Jacobianu ∂P_ij/∂x. Abur & Expósito, eq. (2.24)–(2.27)."""
    row = np.zeros(layout.n_states, dtype=float)
    g_ij, b_ij = _series_g_b(ybus, i, j)
    ang = th[i] - th[j]
    cos_a = math.cos(ang)
    sin_a = math.sin(ang)
    # ∂P_ij/∂θ_i = V_i V_j (g_ij sin θ_ij − b_ij cos θ_ij)
    # ∂P_ij/∂θ_j = −V_i V_j (g_ij sin θ_ij − b_ij cos θ_ij)
    d_theta = v[i] * v[j] * (g_ij * sin_a - b_ij * cos_a)
    if i in layout.angle_pos:
        row[layout.angle_pos[i]] += d_theta
    if j in layout.angle_pos:
        row[layout.angle_pos[j]] += -d_theta
    # ∂P_ij/∂V_i = 2 V_i g_ij − V_j (g_ij cos θ_ij + b_ij sin θ_ij)
    row[layout.mag_pos[i]] += 2.0 * v[i] * g_ij - v[j] * (g_ij * cos_a + b_ij * sin_a)
    # ∂P_ij/∂V_j = −V_i (g_ij cos θ_ij + b_ij sin θ_ij)
    row[layout.mag_pos[j]] += -v[i] * (g_ij * cos_a + b_ij * sin_a)
    return row


def _d_flow_q(
    ybus: np.ndarray, v: np.ndarray, th: np.ndarray, i: int, j: int, layout: _StateLayout
) -> np.ndarray:
    """Wiersz Jacobianu ∂Q_ij/∂x. Abur & Expósito, eq. (2.28)–(2.31)."""
    row = np.zeros(layout.n_states, dtype=float)
    g_ij, b_ij = _series_g_b(ybus, i, j)
    ang = th[i] - th[j]
    cos_a = math.cos(ang)
    sin_a = math.sin(ang)
    # ∂Q_ij/∂θ_i = −V_i V_j (g_ij cos θ_ij + b_ij sin θ_ij)
    # ∂Q_ij/∂θ_j = +V_i V_j (g_ij cos θ_ij + b_ij sin θ_ij)
    d_theta = -v[i] * v[j] * (g_ij * cos_a + b_ij * sin_a)
    if i in layout.angle_pos:
        row[layout.angle_pos[i]] += d_theta
    if j in layout.angle_pos:
        row[layout.angle_pos[j]] += -d_theta
    # ∂Q_ij/∂V_i = −2 V_i b_ij − V_j (g_ij sin θ_ij − b_ij cos θ_ij)
    row[layout.mag_pos[i]] += -2.0 * v[i] * b_ij - v[j] * (g_ij * sin_a - b_ij * cos_a)
    # ∂Q_ij/∂V_j = −V_i (g_ij sin θ_ij − b_ij cos θ_ij)
    row[layout.mag_pos[j]] += -v[i] * (g_ij * sin_a - b_ij * cos_a)
    return row


def _compute_jacobian(
    ybus: np.ndarray, meas: MeasurementSet, theta: np.ndarray, v: np.ndarray, layout: _StateLayout
) -> np.ndarray:
    """Pełny Jacobian pomiarów H = ∂h/∂x  (m × n)."""
    g = ybus.real
    b = ybus.imag
    h_mat = np.zeros((meas.m, layout.n_states), dtype=float)
    for idx, mm in enumerate(meas.measurements):
        if mm.meas_type == MeasurementType.V_MAGNITUDE:
            h_mat[idx, layout.mag_pos[mm.bus_i]] = 1.0
        elif mm.meas_type == MeasurementType.P_INJECTION:
            h_mat[idx, :] = _d_injection_p(g, b, v, theta, mm.bus_i, layout)
        elif mm.meas_type == MeasurementType.Q_INJECTION:
            h_mat[idx, :] = _d_injection_q(g, b, v, theta, mm.bus_i, layout)
        elif mm.meas_type == MeasurementType.P_FLOW:
            assert mm.bus_j is not None
            h_mat[idx, :] = _d_flow_p(ybus, v, theta, mm.bus_i, mm.bus_j, layout)
        elif mm.meas_type == MeasurementType.Q_FLOW:
            assert mm.bus_j is not None
            h_mat[idx, :] = _d_flow_q(ybus, v, theta, mm.bus_i, mm.bus_j, layout)
    return h_mat


def _chi_square_threshold(dof: int, alpha: float) -> float:
    """Próg χ²_{dof, 1−α} (kwantyl rozkładu chi-kwadrat).

    Używa ``scipy.stats.chi2.ppf`` gdy dostępne; w przeciwnym razie korzysta z
    aproksymacji Wilsona-Hilferty'ego (dokładnej do ~0.1% dla dof ≥ 1) — żeby moduł
    nie miał twardej zależności od scipy poza numeryką liniową.
    """
    if dof <= 0:
        return 0.0
    try:
        from scipy.stats import chi2  # noqa: PLC0415

        return float(chi2.ppf(1.0 - alpha, dof))
    except Exception:  # pragma: no cover - ścieżka awaryjna bez scipy
        # Aproksymacja Wilsona-Hilferty'ego: χ² ≈ dof (1 − 2/(9 dof) + z √(2/(9 dof)))³
        z = _normal_ppf(1.0 - alpha)
        term = 2.0 / (9.0 * dof)
        return float(dof * (1.0 - term + z * math.sqrt(term)) ** 3)


def _normal_ppf(p: float) -> float:  # pragma: no cover - tylko ścieżka awaryjna
    """Odwrotna dystrybuanta standardowego rozkładu normalnego (Acklam)."""
    a = [
        -3.969683028665376e01,
        2.209460984245205e02,
        -2.759285104469687e02,
        1.383577518672690e02,
        -3.066479806614716e01,
        2.506628277459239e00,
    ]
    b = [
        -5.447609879822406e01,
        1.615858368580409e02,
        -1.556989798598866e02,
        6.680131188771972e01,
        -1.328068155288572e01,
    ]
    c = [
        -7.784894002430293e-03,
        -3.223964580411365e-01,
        -2.400758277161838e00,
        -2.549732539343734e00,
        4.374664141464968e00,
        2.938163982698783e00,
    ]
    d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e00, 3.754408661907416e00]
    p_low = 0.02425
    if p < p_low:
        q = math.sqrt(-2.0 * math.log(p))
        return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / (
            (((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1.0
        )
    if p <= 1.0 - p_low:
        q = p - 0.5
        r = q * q
        return (
            (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5])
            * q
            / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1.0)
        )
    q = math.sqrt(-2.0 * math.log(1.0 - p))
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / (
        (((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1.0
    )


def _bad_data_analysis(
    h_mat: np.ndarray,
    g_inv: np.ndarray,
    residual: np.ndarray,
    r_diag: np.ndarray,
    objective_j: float,
    dof: int,
    alpha: float,
    lnr_threshold: float,
) -> BadDataReport:
    """Detekcja złych danych: test chi-kwadrat + największa znormalizowana rezydua.

    LNR (Abur & Expósito §5.7): macierz wrażliwości rezyduy Ω = R − H G⁻¹ Hᵀ,
    r_N_i = |r_i| / √Ω_ii. Pomiar o największym r_N przekraczającym próg (≈3.0) jest
    podejrzany o gross error.
    """
    chi_threshold = _chi_square_threshold(dof, alpha)
    chi_flag = bool(dof > 0 and objective_j > chi_threshold)

    # Ω = R − H G⁻¹ Hᵀ  (macierz kowariancji rezyduy pomiarowej)
    omega = np.diag(r_diag) - h_mat @ g_inv @ h_mat.T
    omega_diag = np.clip(np.diag(omega), a_min=1e-12, a_max=None)
    r_norm = np.abs(residual) / np.sqrt(omega_diag)

    # Indeks pomiaru o NAJWIĘKSZEJ znormalizowanej rezydui (zawsze raportowany,
    # niezależnie od progu — to "podejrzany" pomiar wg testu LNR). lnr_flag mówi,
    # czy przekracza próg odrzucenia (gross error).
    lnr_idx: int | None = None
    lnr_value = 0.0
    if r_norm.size:
        lnr_idx = int(np.argmax(r_norm))
        lnr_value = float(r_norm[lnr_idx])
    lnr_flag = bool(lnr_value > lnr_threshold)

    return BadDataReport(
        chi_square_value=float(objective_j),
        chi_square_threshold=float(chi_threshold),
        degrees_of_freedom=int(dof),
        alpha=float(alpha),
        chi_square_flag=chi_flag,
        largest_normalized_residual=lnr_value,
        lnr_measurement_index=lnr_idx,
        lnr_threshold=float(lnr_threshold),
        lnr_flag=lnr_flag,
        normalized_residuals=[float(x) for x in r_norm],
    )


def _round_matrix(mat: np.ndarray, digits: int = 9) -> list[list[float]]:
    return [[round(float(x), digits) for x in row] for row in mat]


def _round_vec(vec: np.ndarray, digits: int = 9) -> list[float]:
    return [round(float(x), digits) for x in vec]


def _compute_estimate_id(
    ybus: np.ndarray,
    meas: MeasurementSet,
    slack_index: int,
    v_mag: tuple[float, ...],
    v_ang: tuple[float, ...],
    objective_j: float,
    converged: bool,
) -> str:
    """Deterministyczny identyfikator SHA-256 (kanoniczny JSON).

    Wzorzec ``compute_ssci_stability_id``: sort_keys, separators bez spacji,
    ensure_ascii=False. Zależy od WEJŚCIA (Y-bus, pomiary, slack) i WYNIKU.
    """
    payload = {
        "solver_version": STATE_ESTIMATION_WLS_VERSION,
        "slack_index": int(slack_index),
        "ybus_real": _round_matrix(ybus.real, 9),
        "ybus_imag": _round_matrix(ybus.imag, 9),
        "measurements": [
            {
                "type": mm.meas_type.value,
                "bus_i": mm.bus_i,
                "bus_j": mm.bus_j,
                "value": round(mm.value, 12),
                "sigma": round(mm.sigma, 12),
            }
            for mm in meas.measurements
        ],
        "result": {
            "converged": converged,
            "v_magnitudes": [round(x, 9) for x in v_mag],
            "v_angles_rad": [round(x, 9) for x in v_ang],
            "objective_j": round(objective_j, 9),
        },
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def estimate_wls(
    ybus_pu: np.ndarray,
    measurements: MeasurementSet,
    slack_index: int,
    *,
    flat_start: bool = True,
    initial_v: np.ndarray | None = None,
    initial_theta: np.ndarray | None = None,
    tolerance: float = 1e-6,
    max_iterations: int = 30,
    alpha: float = 0.01,
    lnr_threshold: float = 3.0,
    validation_status: str = SYNTHETIC_VALIDATION_MARKER,
    trace: bool = True,
) -> StateEstimationResult:
    """Estymacja stanu metodą WLS (Gauss-Newton, równania normalne).

    Args:
        ybus_pu: macierz admitancji węzłowych Y-bus [pu] (n × n, zespolona).
        measurements: zestaw pomiarów (|V|, P/Q iniekcje, P/Q przepływy).
        slack_index: indeks węzła referencyjnego (kąt = 0, nie jest zmienną stanu).
        flat_start: True ⇒ start płaski (V=1.0, θ=0). Gdy False, użyj initial_*.
        initial_v / initial_theta: początkowy stan (gdy flat_start=False).
        tolerance: kryterium zbieżności ||Δx||_∞.
        max_iterations: limit iteracji Gaussa-Newtona.
        alpha: poziom istotności testu chi-kwadrat (domyślnie 0.01).
        lnr_threshold: próg odrzucenia znormalizowanej rezyduy (domyślnie 3.0).
        validation_status: jawny znacznik statusu walidacji (SYNTETYCZNY).
        trace: czy zbierać ślad White Box (domyślnie True).

    Returns:
        StateEstimationResult — pełny wynik WHITE BOX z detekcją złych danych.

    Raises:
        ObservabilityError: gdy m < n (niedookreślony) lub G osobliwa (nieobserwowalny).
        ValueError: błędne wymiary Y-bus lub niepoprawne indeksy.
    """
    ybus = np.asarray(ybus_pu, dtype=complex)
    if ybus.ndim != 2 or ybus.shape[0] != ybus.shape[1]:
        raise ValueError("ybus_pu musi być kwadratową macierzą n×n.")
    n_buses = ybus.shape[0]
    if not (0 <= slack_index < n_buses):
        raise ValueError(f"slack_index {slack_index} poza zakresem [0, {n_buses}).")

    layout = _StateLayout.build(n_buses, slack_index)
    n_states = layout.n_states
    m = measurements.m

    # Walidacja indeksów pomiarów względem rozmiaru sieci.
    for mm in measurements.measurements:
        if not (0 <= mm.bus_i < n_buses):
            raise ValueError(f"Pomiar odnosi się do nieistniejącego węzła bus_i={mm.bus_i}.")
        if mm.bus_j is not None and not (0 <= mm.bus_j < n_buses):
            raise ValueError(f"Pomiar odnosi się do nieistniejącego węzła bus_j={mm.bus_j}.")

    # Obserwowalność (warunek konieczny): m ≥ n. Warunek dostateczny (rank H = n)
    # sprawdzany przez osobliwość G poniżej.
    if m < n_states:
        raise ObservabilityError(
            f"Układ niedookreślony: pomiarów m={m} < zmiennych stanu n={n_states}. "
            "Estymacja niemożliwa (brak obserwowalności)."
        )

    # Wektory pomiaru z i wariancji R (diagonalna), wagi W = R⁻¹.
    z = np.array([mm.value for mm in measurements.measurements], dtype=float)
    r_diag = np.array([mm.sigma**2 for mm in measurements.measurements], dtype=float)
    w_diag = 1.0 / r_diag

    # Stan początkowy.
    if flat_start or initial_v is None or initial_theta is None:
        theta = np.zeros(n_buses, dtype=float)
        v = np.ones(n_buses, dtype=float)
    else:
        theta = np.asarray(initial_theta, dtype=float).copy()
        v = np.asarray(initial_v, dtype=float).copy()
    theta[slack_index] = 0.0  # kąt referencyjny

    # Wektor stanu x = [θ_nonslack] ⊕ [V_all].
    x = np.zeros(n_states, dtype=float)
    for bus in layout.angle_buses:
        x[layout.angle_pos[bus]] = theta[bus]
    for bus in range(n_buses):
        x[layout.mag_pos[bus]] = v[bus]

    white_box: list[WhiteBoxIteration] = []
    converged = False
    iteration = 0
    last_h_mat = np.zeros((m, n_states))
    last_g_inv = np.zeros((n_states, n_states))
    last_residual = np.zeros(m)
    objective_j = 0.0
    note = ""

    for iteration in range(1, max_iterations + 1):
        theta, v = _unpack_state(x, layout)
        h_vec = _compute_h(ybus, measurements, theta, v)
        residual = z - h_vec
        objective_j = float(residual @ (w_diag * residual))
        max_abs_res = float(np.max(np.abs(residual))) if residual.size else 0.0

        h_mat = _compute_jacobian(ybus, measurements, theta, v, layout)
        # Równania normalne: G Δx = Hᵀ W r,  G = Hᵀ W H.
        hw = h_mat.T * w_diag  # = Hᵀ W (broadcast po kolumnach W diag)
        gain_g = hw @ h_mat
        rhs = hw @ residual

        try:
            g_inv = np.linalg.inv(gain_g)
        except np.linalg.LinAlgError as exc:
            raise ObservabilityError(
                "Macierz zysku G = HᵀWH jest osobliwa: układ nieobserwowalny "
                "(rank(H) < n). Estymacja przerwana (brak zgadywania)."
            ) from exc
        # Warunek liczby uwarunkowania — ostrzeżenie o słabej obserwowalności.
        cond = float(np.linalg.cond(gain_g))
        if not math.isfinite(cond) or cond > 1e12:
            raise ObservabilityError(
                f"Macierz zysku G źle uwarunkowana (cond={cond:.3e}): "
                "układ praktycznie nieobserwowalny. Estymacja przerwana."
            )

        delta_x = g_inv @ rhs
        step_norm = float(np.max(np.abs(delta_x))) if delta_x.size else 0.0

        if trace:
            white_box.append(
                WhiteBoxIteration(
                    iteration=iteration,
                    objective_j=round(objective_j, 12),
                    max_abs_residual=round(max_abs_res, 12),
                    h_jacobian=_round_matrix(h_mat),
                    gain_matrix_g=_round_matrix(gain_g),
                    residual_r=_round_vec(residual),
                    delta_x=_round_vec(delta_x),
                    step_norm=round(step_norm, 12),
                    state_x=_round_vec(x),
                )
            )

        last_h_mat = h_mat
        last_g_inv = g_inv
        last_residual = residual

        x = x + delta_x

        if step_norm < tolerance:
            converged = True
            break

    if not converged:
        note = f"Brak zbieżności w {max_iterations} iteracjach (||Δx||_∞={step_norm:.3e})."

    # Stan końcowy + finalna rezydua/J przy x̂.
    theta_hat, v_hat = _unpack_state(x, layout)
    h_final = _compute_h(ybus, measurements, theta_hat, v_hat)
    final_residual = z - h_final
    objective_j = float(final_residual @ (w_diag * final_residual))
    # Jacobian + G⁻¹ przy x̂ dla analizy złych danych (spójne z estymatem).
    h_final_mat = _compute_jacobian(ybus, measurements, theta_hat, v_hat, layout)
    hw_final = h_final_mat.T * w_diag
    g_final = hw_final @ h_final_mat
    try:
        g_final_inv = np.linalg.inv(g_final)
    except np.linalg.LinAlgError:  # pragma: no cover - przechwycone wyżej
        g_final_inv = last_g_inv

    dof = m - n_states
    bad_data = _bad_data_analysis(
        h_final_mat, g_final_inv, final_residual, r_diag, objective_j, dof, alpha, lnr_threshold
    )

    v_mag = tuple(float(x) for x in v_hat)
    v_ang = tuple(float(x) for x in theta_hat)

    estimate_id = _compute_estimate_id(
        ybus, measurements, slack_index, v_mag, v_ang, objective_j, converged
    )

    # Zapewnij obecność jawnego znacznika SYNTETYCZNEJ walidacji.
    status = validation_status or SYNTHETIC_VALIDATION_MARKER

    # Zachowaj referencje do ostatnich macierzy iteracji w nocie diagnostycznej
    # tylko jeśli brak śladu (trace=False) — inaczej są w white_box.
    _ = (last_h_mat, last_residual)

    return StateEstimationResult(
        converged=converged,
        iterations=iteration,
        v_magnitudes=v_mag,
        v_angles_rad=v_ang,
        objective_j=round(objective_j, 12),
        bad_data=bad_data,
        white_box=tuple(white_box),
        n_states=n_states,
        m_measurements=m,
        validation_status=status,
        estimate_id=estimate_id,
        note=note,
    )


def ybus_from_network_graph(
    graph: NetworkGraph,
    base_mva: float,
    slack_node_id: str,
    *,
    shunts: Iterable[Any] = (),
    tap_ratios: dict[str, float] | None = None,
) -> tuple[np.ndarray, dict[str, int]]:
    """Zbuduj Y-bus [pu] z domenowego ``NetworkGraph`` używając ZAMROŻONEGO buildera.

    To AUTORYZOWANE użycie read-only: importuje ``build_ybus_pu`` z
    ``power_flow_newton_internal`` (jeden z zamrożonych solverów) WYŁĄCZNIE do
    odczytu macierzy Y-bus, której funkcje pomiarowe h(x) WLS potrzebują. NIE
    modyfikuje buildera ani solvera (solver_diff_guard pozostaje zielony).

    Zwraca:
        (ybus_pu, node_id_to_index) — macierz admitancji i mapowanie węzeł→indeks.
    """
    from network_model.solvers.power_flow_newton_internal import (  # noqa: PLC0415
        build_slack_island,
        build_ybus_pu,
    )

    slack_island, _not_solved = build_slack_island(graph, slack_node_id)
    ybus_pu, node_id_to_index, _trace, _taps, _shunts = build_ybus_pu(
        graph,
        slack_island,
        base_mva,
        slack_node_id,
        shunts,
        tap_ratios or {},
    )
    return ybus_pu, node_id_to_index
