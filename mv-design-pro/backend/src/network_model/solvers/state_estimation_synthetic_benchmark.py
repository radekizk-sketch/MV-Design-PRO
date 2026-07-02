"""SYNTETYCZNY benchmark dla estymatora stanu WLS (D-05c).

⚠ TO JEST SYNTETYCZNY benchmark — TEST NUMERYCZNY estymatora, NIE walidacja wobec
rzeczywistych pomiarów SCADA/PMU. Pomiary są generowane z rozwiązania rozpływu mocy
ZNANEJ sieci (stan prawdziwy x_true) + DETERMINISTYCZNY (ziarnowany) szum gaussowski
o znanej kowariancji R. To pozwala sprawdzić, że estymator odtwarza znany stan z
dokładnością do kilku sigma — czyli że jest NUMERYCZNIE poprawny.

Walidacja na danych rzeczywistych (telemetria SCADA, fazory PMU z realnymi
kowariancjami i obciążeniem komunikacji) pozostaje PRACĄ PRZYSZŁĄ.

Sieć benchmarkowa: prosty układ 3-szynowy (slack + 2 szyny PQ), z jawnie zadanymi
admitancjami gałęziowymi (model π z bocznikami). Y-bus budowany jest deterministycznie
z tych admitancji. Stan prawdziwy = rozwiązanie rozpływu Newtona-Raphsona na tej samej
Y-bus. Zestaw pomiarów jest REDUNDANTNY (m > n) i OBSERWOWALNY.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from network_model.solvers.state_estimation_wls import (
    SYNTHETIC_VALIDATION_MARKER,
    Measurement,
    MeasurementSet,
    MeasurementType,
)

# Jawnie powtórzony znacznik na poziomie modułu benchmarku.
BENCHMARK_VALIDATION_MARKER = SYNTHETIC_VALIDATION_MARKER


@dataclass(frozen=True)
class SyntheticBenchmark:
    """Komplet danych syntetycznego benchmarku.

    Attributes:
        ybus_pu: macierz Y-bus [pu] sieci benchmarkowej.
        slack_index: indeks węzła referencyjnego.
        v_true: prawdziwe moduły napięć |V| [pu] (stan prawdziwy).
        theta_true: prawdziwe kąty napięć θ [rad] (stan prawdziwy, slack=0).
        measurements: zestaw zaszumionych pomiarów (z = h(x_true) + e).
        clean_measurements: zestaw idealnych pomiarów (z = h(x_true), bez szumu).
        seed: ziarno RNG użyte do wygenerowania szumu.
        sigma_v / sigma_p / sigma_q: odchylenia standardowe szumu wg typu pomiaru.
        validation_status: jawny znacznik SYNTETYCZNEJ walidacji.
    """

    ybus_pu: np.ndarray
    slack_index: int
    v_true: tuple[float, ...]
    theta_true: tuple[float, ...]
    measurements: MeasurementSet
    clean_measurements: MeasurementSet
    seed: int
    sigma_v: float
    sigma_p: float
    sigma_q: float
    validation_status: str = BENCHMARK_VALIDATION_MARKER


def _build_benchmark_ybus() -> np.ndarray:
    """Y-bus [pu] układu 3-szynowego, zbudowana deterministycznie z admitancji gałęzi.

    Gałęzie (model π, admitancja szeregowa y, susceptancja boczna b_sh/2 na koniec):
        0-1: z = 0.02 + j0.06,  b_sh = 0.06  (linia)
        0-2: z = 0.03 + j0.09,  b_sh = 0.04  (linia)
        1-2: z = 0.025 + j0.075, b_sh = 0.05 (linia)

    Wartości typowe dla przykładów dydaktycznych (Abur & Expósito, Stevenson).
    """
    branches = [
        (0, 1, complex(0.02, 0.06), 0.06),
        (0, 2, complex(0.03, 0.09), 0.04),
        (1, 2, complex(0.025, 0.075), 0.05),
    ]
    n = 3
    ybus = np.zeros((n, n), dtype=complex)
    for i, j, z, b_sh in branches:
        y = 1.0 / z
        ybus[i, j] -= y
        ybus[j, i] -= y
        ybus[i, i] += y + 1j * (b_sh / 2.0)
        ybus[j, j] += y + 1j * (b_sh / 2.0)
    return ybus


def _solve_power_flow_true_state(
    ybus: np.ndarray,
    slack_index: int,
    slack_v: float,
    p_spec: np.ndarray,
    q_spec: np.ndarray,
    *,
    tol: float = 1e-12,
    max_iter: int = 50,
) -> tuple[np.ndarray, np.ndarray]:
    """Rozwiąż rozpływ mocy (Newton-Raphson) i zwróć stan prawdziwy (θ, V).

    Samodzielna implementacja NR na podanej Y-bus — benchmark NIE zależy od
    zamrożonego solvera dla wyznaczenia stanu prawdziwego (czysta numeryka, pełna
    kontrola determinizmu). Slack ma stałe |V| i θ=0; pozostałe węzły to PQ.

    p_spec/q_spec: zadane iniekcje [pu] (dodatnie = wstrzyknięcie do sieci).
    """
    n = ybus.shape[0]
    g = ybus.real
    b = ybus.imag
    theta = np.zeros(n)
    v = np.ones(n)
    v[slack_index] = slack_v

    pq = [i for i in range(n) if i != slack_index]

    def inj_p(idx: int) -> float:
        return v[idx] * sum(
            v[k]
            * (
                g[idx, k] * np.cos(theta[idx] - theta[k])
                + b[idx, k] * np.sin(theta[idx] - theta[k])
            )
            for k in range(n)
        )

    def inj_q(idx: int) -> float:
        return v[idx] * sum(
            v[k]
            * (
                g[idx, k] * np.sin(theta[idx] - theta[k])
                - b[idx, k] * np.cos(theta[idx] - theta[k])
            )
            for k in range(n)
        )

    for _ in range(max_iter):
        dp = np.array([p_spec[i] - inj_p(i) for i in pq])
        dq = np.array([q_spec[i] - inj_q(i) for i in pq])
        mismatch = np.concatenate([dp, dq])
        if np.max(np.abs(mismatch)) < tol:
            break

        npq = len(pq)
        j11 = np.zeros((npq, npq))  # dP/dθ
        j12 = np.zeros((npq, npq))  # dP/dV
        j21 = np.zeros((npq, npq))  # dQ/dθ
        j22 = np.zeros((npq, npq))  # dQ/dV
        p_calc = {i: inj_p(i) for i in range(n)}
        q_calc = {i: inj_q(i) for i in range(n)}
        for ri, i in enumerate(pq):
            for ci, k in enumerate(pq):
                ang = theta[i] - theta[k]
                if i == k:
                    j11[ri, ci] = -q_calc[i] - b[i, i] * v[i] ** 2
                    j12[ri, ci] = p_calc[i] / v[i] + g[i, i] * v[i]
                    j21[ri, ci] = p_calc[i] - g[i, i] * v[i] ** 2
                    j22[ri, ci] = q_calc[i] / v[i] - b[i, i] * v[i]
                else:
                    j11[ri, ci] = v[i] * v[k] * (g[i, k] * np.sin(ang) - b[i, k] * np.cos(ang))
                    j12[ri, ci] = v[i] * (g[i, k] * np.cos(ang) + b[i, k] * np.sin(ang))
                    j21[ri, ci] = -v[i] * v[k] * (g[i, k] * np.cos(ang) + b[i, k] * np.sin(ang))
                    j22[ri, ci] = v[i] * (g[i, k] * np.sin(ang) - b[i, k] * np.cos(ang))
        jac = np.block([[j11, j12], [j21, j22]])
        step = np.linalg.solve(jac, mismatch)
        for ri, i in enumerate(pq):
            theta[i] += step[ri]
            v[i] += step[npq + ri]

    return theta, v


def _clean_measurements_from_state(
    ybus: np.ndarray, theta: np.ndarray, v: np.ndarray
) -> list[tuple[MeasurementType, int, int | None, float, str]]:
    """Zbuduj listę idealnych pomiarów (typ, bus_i, bus_j, wartość, etykieta).

    Zestaw redundantny + obserwowalny dla układu 3-szynowego:
      - |V| na wszystkich 3 szynach (3 pomiary),
      - P,Q iniekcji na szynach 1 i 2 (4 pomiary),
      - P,Q przepływów 0→1 i 0→2 (4 pomiary).
    Razem m = 11 pomiarów; stan n = 2 kąty + 3 moduły = 5 ⇒ redundancja 6.
    """
    from network_model.solvers.state_estimation_wls import (
        _h_flow_p,
        _h_flow_q,
        _h_injection_p,
        _h_injection_q,
    )

    g = ybus.real
    b = ybus.imag
    out: list[tuple[MeasurementType, int, int | None, float, str]] = []

    for i in range(3):
        out.append((MeasurementType.V_MAGNITUDE, i, None, float(v[i]), f"V{i}"))

    for i in (1, 2):
        out.append(
            (MeasurementType.P_INJECTION, i, None, _h_injection_p(g, b, v, theta, i), f"P{i}")
        )
        out.append(
            (MeasurementType.Q_INJECTION, i, None, _h_injection_q(g, b, v, theta, i), f"Q{i}")
        )

    for j in (1, 2):
        out.append((MeasurementType.P_FLOW, 0, j, _h_flow_p(ybus, v, theta, 0, j), f"P0_{j}"))
        out.append((MeasurementType.Q_FLOW, 0, j, _h_flow_q(ybus, v, theta, 0, j), f"Q0_{j}"))

    return out


def build_synthetic_benchmark(
    seed: int = 20260529,
    *,
    sigma_v: float = 0.004,
    sigma_p: float = 0.008,
    sigma_q: float = 0.008,
) -> SyntheticBenchmark:
    """Zbuduj SYNTETYCZNY benchmark estymatora WLS (deterministyczny przy danym seed).

    Kroki:
      1. Zbuduj Y-bus 3-szynową (deterministycznie z admitancji gałęzi).
      2. Rozwiąż rozpływ NR → stan PRAWDZIWY (θ_true, V_true).
      3. Zbuduj idealne pomiary z = h(x_true).
      4. Dodaj ziarnowany szum gaussowski e ~ N(0, σ²) o znanej kowariancji R.
      5. Zwróć komplet: Y-bus, stan prawdziwy, pomiary zaszumione i idealne.

    Args:
        seed: ziarno RNG (NumPy ``default_rng``) — gwarantuje identyczny szum.
        sigma_v: σ pomiaru |V| [pu] (typ. ~0.4% — klasa przyrządu napięciowego).
        sigma_p / sigma_q: σ pomiarów mocy P/Q [pu] (typ. ~0.8%).

    Returns:
        SyntheticBenchmark z jawnym znacznikiem walidacji SYNTETYCZNEJ.
    """
    ybus = _build_benchmark_ybus()
    slack_index = 0
    slack_v = 1.02

    # Zadane iniekcje [pu] na szynach PQ (obciążenia: ujemne iniekcje).
    # Konwencja: p_spec[i] = wstrzyknięta moc do sieci w węźle i.
    p_spec = np.zeros(3)
    q_spec = np.zeros(3)
    p_spec[1], q_spec[1] = -0.55, -0.13  # obciążenie szyny 1
    p_spec[2], q_spec[2] = -0.30, -0.18  # obciążenie szyny 2

    theta_true, v_true = _solve_power_flow_true_state(ybus, slack_index, slack_v, p_spec, q_spec)

    clean_spec = _clean_measurements_from_state(ybus, theta_true, v_true)

    rng = np.random.default_rng(seed)

    clean_list: list[Measurement] = []
    noisy_list: list[Measurement] = []
    for mtype, bus_i, bus_j, value, label in clean_spec:
        if mtype == MeasurementType.V_MAGNITUDE:
            sigma = sigma_v
        elif mtype in (MeasurementType.P_INJECTION, MeasurementType.P_FLOW):
            sigma = sigma_p
        else:
            sigma = sigma_q
        noise = float(rng.normal(0.0, sigma))
        clean_list.append(
            Measurement(
                meas_type=mtype, bus_i=bus_i, value=value, sigma=sigma, bus_j=bus_j, label=label
            )
        )
        noisy_list.append(
            Measurement(
                meas_type=mtype,
                bus_i=bus_i,
                value=value + noise,
                sigma=sigma,
                bus_j=bus_j,
                label=label,
            )
        )

    return SyntheticBenchmark(
        ybus_pu=ybus,
        slack_index=slack_index,
        v_true=tuple(float(x) for x in v_true),
        theta_true=tuple(float(x) for x in theta_true),
        measurements=MeasurementSet(tuple(noisy_list)),
        clean_measurements=MeasurementSet(tuple(clean_list)),
        seed=seed,
        sigma_v=sigma_v,
        sigma_p=sigma_p,
        sigma_q=sigma_q,
    )


def inject_gross_error(
    benchmark: SyntheticBenchmark, measurement_index: int, error_magnitude: float
) -> MeasurementSet:
    """Wstrzyknij gross error do jednego pomiaru (test detekcji złych danych).

    Zwraca NOWY ``MeasurementSet`` z wartością pomiaru o indeksie
    ``measurement_index`` przesuniętą o ``error_magnitude`` (w wielokrotnościach
    typowych dla błędu grubego, np. +20σ). Reszta pomiarów bez zmian.
    """
    meas = list(benchmark.measurements.measurements)
    if not (0 <= measurement_index < len(meas)):
        raise ValueError(f"measurement_index {measurement_index} poza zakresem.")
    bad = meas[measurement_index]
    meas[measurement_index] = Measurement(
        meas_type=bad.meas_type,
        bus_i=bad.bus_i,
        value=bad.value + error_magnitude,
        sigma=bad.sigma,
        bus_j=bad.bus_j,
        label=bad.label,
    )
    return MeasurementSet(tuple(meas))
