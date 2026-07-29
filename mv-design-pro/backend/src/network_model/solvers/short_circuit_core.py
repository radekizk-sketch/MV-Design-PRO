from __future__ import annotations

import math
from dataclasses import dataclass
from enum import Enum

import numpy as np
from network_model.core.graph import NetworkGraph
from network_model.core.ybus import AdmittanceMatrixBuilder

OMEGA_50HZ = 2.0 * math.pi * 50.0


class ShortCircuitType(Enum):
    THREE_PHASE = "3F"
    SINGLE_PHASE_GROUND = "1F"
    TWO_PHASE = "2F"
    TWO_PHASE_GROUND = "2F+G"


@dataclass(frozen=True)
class ShortCircuitCoreResult:
    z_equiv: complex
    z1: complex
    z2: complex
    z0: complex | None


@dataclass(frozen=True)
class ShortCircuitPostProcessResult:
    rx_ratio: float
    kappa: float
    ip_a: float
    ith_a: float
    ib_a: float
    sk_mva: float
    # Audyt fizyki fala G (2026-07): wspolczynniki cieplne m (skladowa DC) i n
    # (skladowa AC) faktycznie uzyte do policzenia ith_a = ikss*sqrt(m+n) —
    # niesione addytywnie, zeby biale-skrzynkowy wywod (proof engine) mogl
    # pokazac PRAWDZIWE m,n zamiast domyslnych placeholderow. Patrz
    # _thermal_mn_factors ponizej.
    m_factor: float = 0.0
    n_factor: float = 1.0


def build_zbus(graph: NetworkGraph) -> tuple[AdmittanceMatrixBuilder, np.ndarray]:
    builder = AdmittanceMatrixBuilder(graph)
    y_bus = builder.build(ground_slack_buses=True)

    try:
        z_bus = np.linalg.inv(y_bus)
    except np.linalg.LinAlgError as exc:
        raise ValueError("Y-bus is singular; cannot compute Z-bus for short-circuit") from exc
    return builder, z_bus


def voltage_factor_for_fault(short_circuit_type: ShortCircuitType) -> float:
    if short_circuit_type == ShortCircuitType.THREE_PHASE:
        return 1.0 / math.sqrt(3.0)
    if short_circuit_type == ShortCircuitType.SINGLE_PHASE_GROUND:
        return math.sqrt(3.0)
    if short_circuit_type in {ShortCircuitType.TWO_PHASE, ShortCircuitType.TWO_PHASE_GROUND}:
        return 1.0
    raise ValueError(f"Unsupported short-circuit type: {short_circuit_type}")


def compute_equivalent_impedance(
    *,
    graph: NetworkGraph,
    fault_node_id: str,
    short_circuit_type: ShortCircuitType,
    z0_bus: np.ndarray | None = None,
    z2_bus: np.ndarray | None = None,
) -> ShortCircuitCoreResult:
    if fault_node_id not in graph.nodes:
        raise ValueError(f"Fault node '{fault_node_id}' does not exist in graph")

    builder, z1_bus_pu = build_zbus(graph)
    node_index = builder.node_id_to_index[fault_node_id]
    z_base_ohm = builder.get_zbase_ohm(fault_node_id)
    z1 = z1_bus_pu[node_index, node_index] * z_base_ohm
    z2 = (z2_bus[node_index, node_index] * z_base_ohm) if z2_bus is not None else z1

    def require_z0_bus(message: str) -> complex:
        if z0_bus is None:
            raise ValueError(message)
        return z0_bus[node_index, node_index] * z_base_ohm

    z0: complex | None = None
    if short_circuit_type == ShortCircuitType.THREE_PHASE:
        z_equiv = z1
    elif short_circuit_type == ShortCircuitType.TWO_PHASE:
        z_equiv = z1 + z2
    elif short_circuit_type == ShortCircuitType.SINGLE_PHASE_GROUND:
        z0 = require_z0_bus("Z0 bus matrix is required for 1F fault computation")
        z_equiv = z1 + z2 + z0
    elif short_circuit_type == ShortCircuitType.TWO_PHASE_GROUND:
        z0 = require_z0_bus("Z0 bus matrix is required for 2F+G fault computation")
        denominator = z2 + z0
        if abs(denominator) == 0:
            raise ZeroDivisionError("Z2 + Z0 is zero; cannot compute Ik''")
        z_equiv = z1 + (z2 * z0) / denominator
    else:
        raise ValueError(f"Unsupported short-circuit type: {short_circuit_type}")

    if abs(z_equiv) == 0:
        raise ZeroDivisionError("Equivalent impedance is zero; cannot compute Ik''")

    return ShortCircuitCoreResult(z_equiv=z_equiv, z1=z1, z2=z2, z0=z0)


def compute_ikss(
    *,
    un_v: float,
    c_factor: float,
    short_circuit_type: ShortCircuitType,
    z_equiv: complex,
) -> float:
    voltage_factor = voltage_factor_for_fault(short_circuit_type)
    return (c_factor * un_v * voltage_factor) / abs(z_equiv)


def _thermal_mn_factors(kappa: float, tk_s: float, f_hz: float = 50.0) -> tuple[float, float]:
    """Wspolczynniki cieplne m (skladowa DC) i n (skladowa AC) — IEC 60909-0 §4.7/§12.

    I_th = I_k'' * sqrt(m + n) (norma; patrz rowniez
    docs/proof/NORMATIVE_COMPLETION_PACK_IEC_60909.md §4.7 i
    docs/proof_engine/EQUATIONS_IEC60909_SC3F.md EQ_SC3F_008 — TA SAMA formula
    jest juz udokumentowana jako wiazaca i uzyta w proof_generator.py dla
    SC1/SC3F, ale do audytu fizyki fala G (2026-07) NIE byla uzyta tutaj — ten
    rdzenny solver liczyl ith_a = ikss*sqrt(tk_s), co jest niezgodne
    wymiarowo (sqrt(tk_s) ma jednostke sqrt(s), nie jest bezwymiarowe) i
    fizycznie (Ith rosloby bez ograniczen z czasem trwania zwarcia zamiast
    pozostac ograniczone w poblizu Ikss).

    m — postac zamknieta (norma, powszechnie cytowana rowniez w publicznych
    przewodnikach inzynierskich IEC 60909, NIE tablica wspolczynnikow objeta
    prawem autorskim — jak juz istniejaca formula kappa w tym samym module):
        m = 1/(2*f*tk*ln(kappa-1)) * (exp(4*f*tk*ln(kappa-1)) - 1),  kappa > 1
    kappa<=1 (brak skladowej DC, tj. R/X->inf) -> m=0.

    n — skladowa okresowa (AC decay). n=1 dla zwarc DALEKO OD GENERATORA
    (brak zaniku skladowej okresowej — zalozenie stale w tym module, ktory
    nie modeluje zanikania reaktancji synchronicznej/podprzejsciowej
    generatorow w oknie tk_s). Dla zwarc BLISKO GENERATORA n<1 wymaga
    krzywych normowych I_k''/I_rG (dane generatora poza sygnatura tej
    funkcji) — udokumentowane jako ograniczenie modelu (audyt fizyki fala G,
    2026-07; sprawa do decyzji produktowej, patrz raport audytu).
    """
    if tk_s <= 0.0:
        return 0.0, 1.0
    if kappa <= 1.0:
        return 0.0, 1.0
    ln_term = math.log(kappa - 1.0)
    if abs(ln_term) < 1e-9:
        # kappa -> 2.0 (R/X -> 0): ln_term -> 0, formula ma usuwalna osobliwosc
        # 0/0. Granica (regula de l'Hopitala / rozwiniecie Taylora pierwszego
        # rzedu wzgledem ln_term): m -> 2.0. Zweryfikowane numerycznie
        # (kappa=1.999999 -> m=1.99980...).
        return 2.0, 1.0
    denom = 2.0 * f_hz * tk_s * ln_term
    exponent = 4.0 * f_hz * tk_s * ln_term
    if exponent < -700:
        m = -1.0 / denom
    elif exponent > 700:
        m = math.inf
    else:
        m = (math.exp(exponent) - 1.0) / denom
    return max(m, 0.0), 1.0


def compute_post_fault_quantities(
    *,
    ikss: float,
    un_v: float,
    z_equiv: complex,
    tk_s: float,
    tb_s: float,
) -> ShortCircuitPostProcessResult:
    if z_equiv.imag == 0:
        rx_ratio = math.inf
    else:
        rx_ratio = z_equiv.real / z_equiv.imag
    exp_arg = -3.0 * rx_ratio
    if exp_arg > 700:
        kappa = 2.0
    elif exp_arg < -700:
        kappa = 1.02
    else:
        kappa = 1.02 + 0.98 * math.exp(exp_arg)
    ip_a = kappa * math.sqrt(2.0) * ikss
    m_factor, n_factor = _thermal_mn_factors(kappa, tk_s)
    ith_a = ikss * math.sqrt(m_factor + n_factor)
    sk_mva = (math.sqrt(3.0) * un_v * ikss) / 1_000_000.0

    r_ohm = z_equiv.real
    x_ohm = z_equiv.imag
    if r_ohm <= 0 or x_ohm <= 0:
        ta_s = 0.0
    else:
        ta_s = x_ohm / (OMEGA_50HZ * r_ohm)
    exp_factor = 0.0 if ta_s <= 0 else math.exp(-tb_s / ta_s)
    ib_a = ikss * math.sqrt(1.0 + ((kappa - 1.0) * exp_factor) ** 2)

    return ShortCircuitPostProcessResult(
        rx_ratio=rx_ratio,
        kappa=kappa,
        ip_a=ip_a,
        ith_a=ith_a,
        ib_a=ib_a,
        sk_mva=sk_mva,
        m_factor=m_factor,
        n_factor=n_factor,
    )
