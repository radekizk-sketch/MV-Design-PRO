"""
IEC 60255 Protection Curve Solver — WHITE BOX

Implements IEC 60255-151:2009 inverse-time overcurrent protection curves
with full calculation traceability.

SOLVER LAYER RULES:
    - PHYSICS HERE ONLY
    - WHITE BOX REQUIRED: all intermediate values exposed
    - Deterministic: same inputs -> same outputs
    - Self-contained: imports only from stdlib / numpy

Supported curve types:
    NI  — Normal Inverse:      t = TMS * 0.14 / ((I/Is)^0.02 - 1)
    VI  — Very Inverse:        t = TMS * 13.5 / ((I/Is) - 1)
    EI  — Extremely Inverse:   t = TMS * 80 / ((I/Is)^2 - 1)
    RI  — RI/Definite Inverse: t = TMS * 120 / ((I/Is) - 1)
    DT  — Definite Time:       t = TMS (constant)

Reference: IEC 60255-151:2009, Table 1 — Standard IDMT characteristics
"""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

# =============================================================================
# SOLVER VERSION
# =============================================================================

PROTECTION_IEC60255_SOLVER_VERSION = "1.0.0"


# =============================================================================
# ENUMS
# =============================================================================


class IEC60255CurveType(StrEnum):
    """IEC 60255-151 standard IDMT curve types."""

    NI = "NI"  # Normal Inverse (Normalna odwrotna)
    VI = "VI"  # Very Inverse (Bardzo odwrotna)
    EI = "EI"  # Extremely Inverse (Ekstremalnie odwrotna)
    RI = "RI"  # RI / Definite Inverse (Odwrotna RI / 120)
    DT = "DT"  # Definite Time (Czas niezalezny)


class SelectivityVerdict(StrEnum):
    """Selectivity coordination verdict."""

    PASS = "PASS"  # Margines >= 0.3 s
    MARGINAL = "MARGINAL"  # 0.2 s <= margines < 0.3 s
    FAIL = "FAIL"  # Margines < 0.2 s


# =============================================================================
# IEC 60255 CURVE PARAMETERS — CANONICAL TABLE
# =============================================================================

# (A, B) per IEC 60255-151:2009 Table 1
# Formula: t = TMS * A / ((I/Is)^B - 1)
IEC60255_CURVE_PARAMS: dict[IEC60255CurveType, tuple[float, float]] = {
    IEC60255CurveType.NI: (0.14, 0.02),
    IEC60255CurveType.VI: (13.5, 1.0),
    IEC60255CurveType.EI: (80.0, 2.0),
    IEC60255CurveType.RI: (120.0, 1.0),
    # DT has no A/B — trip time = TMS directly
}

IEC60255_CURVE_FORMULAS_LATEX: dict[IEC60255CurveType, str] = {
    IEC60255CurveType.NI: r"t = \mathrm{TMS} \cdot \frac{0.14}{(I/I_s)^{0.02} - 1}",
    IEC60255CurveType.VI: r"t = \mathrm{TMS} \cdot \frac{13.5}{(I/I_s) - 1}",
    IEC60255CurveType.EI: r"t = \mathrm{TMS} \cdot \frac{80}{(I/I_s)^{2} - 1}",
    IEC60255CurveType.RI: r"t = \mathrm{TMS} \cdot \frac{120}{(I/I_s) - 1}",
    IEC60255CurveType.DT: r"t = \mathrm{TMS}",
}

IEC60255_CURVE_LABELS_PL: dict[IEC60255CurveType, str] = {
    IEC60255CurveType.NI: "Normalna odwrotna (NI)",
    IEC60255CurveType.VI: "Bardzo odwrotna (VI)",
    IEC60255CurveType.EI: "Ekstremalnie odwrotna (EI)",
    IEC60255CurveType.RI: "Odwrotna RI (120)",
    IEC60255CurveType.DT: "Czas niezalezny (DT)",
}


# =============================================================================
# RELAY SETTINGS — FROZEN DATACLASS
# =============================================================================


@dataclass(frozen=True)
class RelaySettings:
    """Settings for a single IEC 60255 overcurrent relay.

    Attributes:
        relay_id: Stable unique identifier for this relay
        curve_type: IEC 60255 curve type (NI/VI/EI/RI/DT)
        pickup_current_a: Pickup current Is [A] (primary side)
        tms: Time Multiplier Setting (dimensionless, typically 0.05..1.5)
    """

    relay_id: str
    curve_type: IEC60255CurveType
    pickup_current_a: float
    tms: float

    def __post_init__(self) -> None:
        if self.pickup_current_a <= 0:
            raise ValueError(f"Pickup current must be positive, got {self.pickup_current_a}")
        if self.tms <= 0:
            raise ValueError(f"TMS must be positive, got {self.tms}")

    def to_dict(self) -> dict[str, Any]:
        return {
            "relay_id": self.relay_id,
            "curve_type": self.curve_type.value,
            "pickup_current_a": self.pickup_current_a,
            "tms": self.tms,
        }


# =============================================================================
# CURVE TRIP TIME RESULT — FROZEN, WHITE BOX
# =============================================================================


@dataclass(frozen=True)
class CurveTripTimeResult:
    """Result of a single IEC 60255 curve trip time calculation.

    WHITE BOX: All intermediate computation values are exposed.

    Attributes:
        curve_type: IEC 60255 curve type
        i_fault_a: Fault current [A]
        is_pickup_a: Pickup current Is [A]
        tms: Time Multiplier Setting
        current_multiple_M: I_fault / Is
        A: Curve constant A
        B: Curve exponent B
        M_power_B: M^B
        denominator: M^B - 1
        base_time_s: A / (M^B - 1) before TMS scaling
        calculated_time_s: Final trip time [s] (None if no trip)
        will_trip: True if I_fault > Is (M > 1)
        formula_latex: LaTeX formula string
        substitution_latex: LaTeX substitution with actual values
        white_box_trace: Complete trace dictionary
    """

    curve_type: IEC60255CurveType
    i_fault_a: float
    is_pickup_a: float
    tms: float
    current_multiple_M: float
    A: float
    B: float
    M_power_B: float
    denominator: float
    base_time_s: float
    calculated_time_s: float | None
    will_trip: bool
    formula_latex: str
    substitution_latex: str
    white_box_trace: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "curve_type": self.curve_type.value,
            "i_fault_a": self.i_fault_a,
            "is_pickup_a": self.is_pickup_a,
            "tms": self.tms,
            "current_multiple_M": self.current_multiple_M,
            "A": self.A,
            "B": self.B,
            "M_power_B": self.M_power_B,
            "denominator": self.denominator,
            "base_time_s": self.base_time_s,
            "calculated_time_s": self.calculated_time_s,
            "will_trip": self.will_trip,
            "formula_latex": self.formula_latex,
            "substitution_latex": self.substitution_latex,
            "white_box_trace": self.white_box_trace,
        }


# =============================================================================
# I^2*t THERMAL ENERGY RESULT
# =============================================================================


@dataclass(frozen=True)
class I2tThermalResult:
    """Thermal energy (I^2*t) calculation result.

    Thermal energy is I_k^2 * t_trip, used for thermal withstand
    verification of conductors and equipment.

    Attributes:
        relay_id: Relay identifier
        i_fault_a: Fault current [A]
        t_trip_s: Trip time [s]
        i2t_a2s: Thermal energy I^2*t [A^2*s]
        formula_latex: LaTeX formula
        substitution_latex: LaTeX substitution
        white_box_trace: Complete trace dictionary
    """

    relay_id: str
    i_fault_a: float
    t_trip_s: float
    i2t_a2s: float
    formula_latex: str
    substitution_latex: str
    white_box_trace: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "relay_id": self.relay_id,
            "i_fault_a": self.i_fault_a,
            "t_trip_s": self.t_trip_s,
            "i2t_a2s": self.i2t_a2s,
            "formula_latex": self.formula_latex,
            "substitution_latex": self.substitution_latex,
            "white_box_trace": self.white_box_trace,
        }


# =============================================================================
# SELECTIVITY PAIR RESULT
# =============================================================================


@dataclass(frozen=True)
class SelectivityPairResult:
    """Selectivity check result for one relay pair at one fault current.

    Attributes:
        upstream_relay_id: Upstream (backup) relay ID
        downstream_relay_id: Downstream (primary) relay ID
        i_fault_a: Fault current at which grading was checked [A]
        t_upstream_s: Upstream relay trip time [s]
        t_downstream_s: Downstream relay trip time [s]
        grading_margin_s: t_upstream - t_downstream [s]
        required_margin_s: Minimum required margin [s]
        verdict: PASS / MARGINAL / FAIL
        upstream_trace: WhiteBox trace for upstream calculation
        downstream_trace: WhiteBox trace for downstream calculation
    """

    upstream_relay_id: str
    downstream_relay_id: str
    i_fault_a: float
    t_upstream_s: float | None
    t_downstream_s: float | None
    grading_margin_s: float | None
    required_margin_s: float
    verdict: SelectivityVerdict
    upstream_trace: dict[str, Any] = field(default_factory=dict)
    downstream_trace: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "upstream_relay_id": self.upstream_relay_id,
            "downstream_relay_id": self.downstream_relay_id,
            "i_fault_a": self.i_fault_a,
            "t_upstream_s": self.t_upstream_s,
            "t_downstream_s": self.t_downstream_s,
            "grading_margin_s": self.grading_margin_s,
            "required_margin_s": self.required_margin_s,
            "verdict": self.verdict.value,
            "upstream_trace": self.upstream_trace,
            "downstream_trace": self.downstream_trace,
        }


# =============================================================================
# PROTECTION COORDINATION RESULT — TOP-LEVEL FROZEN DATACLASS
# =============================================================================


@dataclass(frozen=True)
class ProtectionCoordinationResult:
    """Complete protection coordination analysis result.

    FROZEN — immutable after construction.

    Attributes:
        solver_version: Solver version string
        relay_pairs: Tuple of (upstream_id, downstream_id) pairs analysed
        selectivity_results: Selectivity checks for each pair/current
        i2t_results: Thermal energy results per relay
        overall_verdict: Worst-case verdict across all pairs
        white_box_trace: Full aggregated trace
        deterministic_signature: SHA-256 of canonical result JSON
    """

    solver_version: str
    relay_pairs: tuple[tuple[str, str], ...]
    selectivity_results: tuple[SelectivityPairResult, ...]
    i2t_results: tuple[I2tThermalResult, ...]
    overall_verdict: SelectivityVerdict
    white_box_trace: dict[str, Any] = field(default_factory=dict)
    deterministic_signature: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "solver_version": self.solver_version,
            "relay_pairs": [list(p) for p in self.relay_pairs],
            "selectivity_results": [r.to_dict() for r in self.selectivity_results],
            "i2t_results": [r.to_dict() for r in self.i2t_results],
            "overall_verdict": self.overall_verdict.value,
            "white_box_trace": self.white_box_trace,
            "deterministic_signature": self.deterministic_signature,
        }


# =============================================================================
# GENERIC IDMT ENGINE (N-D4) — JEDYNA FIZYKA KRZYWYCH IDMT
# =============================================================================
#
# Karta P0.7 (nN, docs/nn/H_PLAN_IMPLEMENTACJI_NN.md §P0.7, dług N-D4 —
# docs/nn/A_AUDYT_STANU_NN_2026-08.md: "Dwie implementacje formuly IEC
# 60255"). Przed karta P0.7 formula t = TMS*A/(M^B-1) byla zaimplementowana
# DWA RAZY: tutaj (`compute_curve_trip_time` ponizej) i w
# `protection.curves.iec_curves.calculate_iec_tripping_time` (osobna kopia
# petli obliczeniowej, wlasny epsilon 1e-10 zamiast 1e-12). `protection/
# curves/ieee_curves.py` mial TRZECIA, osobna implementacje analogicznej
# petli dla wzoru IEEE C37.112 (t = TD*(A/(M^p-1)+B) — inna norma, INNY
# ksztalt wzoru: stala addytywna B jest SKALOWANA przez TD, a nie dodawana
# PO przeskalowaniu jak w IEC). Od tej karty: JEDNA implementacja petli
# obliczeniowej per ksztalt wzoru (dwie funkcje ponizej — IEC i IEEE MAJA
# rozny ksztalt matematyczny, wiec dwie funkcje sa POPRAWNA reprezentacja
# fizyki, nie duplikacja), a wszyscy trzej konsumenci
# (`compute_curve_trip_time`, `iec_curves.calculate_iec_tripping_time`,
# `ieee_curves.calculate_ieee_tripping_time`) DELEGUJA do nich. Publiczna
# powierzchnia `protection/curves/{iec,ieee}_curves.py` (nazwy, sygnatury,
# ksztalt wyniku) NIE ZMIENIA SIE — adaptery TYLKO przestaja liczyc M^B-1
# soba, tylko wywoluja generyczny silnik i pakuja wynik w SWOJ dotychczasowy
# dataclass (clamp/inf-dla-braku-wyzwolenia zostaja w adapterze — to
# reprezentacja/numeric-guard specyficzna dla konsumenta, nie druga fizyka).


@dataclass(frozen=True)
class GenericIdmtPoint:
    """Surowy wynik generycznej petli IEC-stylu: t = TMS·A/(M^B-1) + C.

    C jest dodawane PO przeskalowaniu przez TMS (ksztalt wzoru IEC 60255 wg
    `iec_curves.IECCurveParams` — stala addytywna manufacturer-variant, C=0
    dla standardowych krzywych normy). Bez zaokraglania/clampowania — to
    zadanie WOLAJACEGO (kazdy z trzech konsumentow ma wlasna, juz istniejaca
    politike numeryczna, ktora ta funkcja MA zachowac bez zmian).
    """

    current_multiple_m: float
    will_trip: bool
    m_power_b: float
    denominator: float
    base_time_s: float  # A / denominator (przed TMS)
    trip_time_s: float | None  # None gdy nie will_trip


def compute_idmt_generic(
    *,
    i_fault_a: float,
    is_pickup_a: float,
    time_multiplier: float,
    a: float,
    b: float,
    c_additive: float = 0.0,
    denom_guard: float = 1e-10,
) -> GenericIdmtPoint:
    """Generyczna petla IDMT ksztaltu IEC: t = TMS·A/(M^B-1) + C.

    JEDYNE miejsce w repozytorium liczace ten wzor (regula KLASA NIE
    INSTANCJA — N-D4). ``denom_guard`` jest PARAMETREM (nie stala globalna),
    zeby kazdy z trzech wolajacych zachowal WLASNA, juz przetestowana
    tolerancje numeryczna kolo M=1 bez zmiany wynikow istniejacych testow.

    Raises:
        ValueError: ``is_pickup_a <= 0``.
    """
    if is_pickup_a <= 0:
        raise ValueError(f"Pickup current must be positive, got {is_pickup_a}")

    m = i_fault_a / is_pickup_a
    will_trip = m > 1.0
    if not will_trip:
        return GenericIdmtPoint(
            current_multiple_m=m,
            will_trip=False,
            m_power_b=0.0,
            denominator=0.0,
            base_time_s=0.0,
            trip_time_s=None,
        )

    m_power_b = math.pow(m, b)
    denominator = m_power_b - 1.0
    if denominator < denom_guard:
        denominator = denom_guard

    base_time_s = a / denominator
    trip_time_s = time_multiplier * base_time_s + c_additive

    return GenericIdmtPoint(
        current_multiple_m=m,
        will_trip=True,
        m_power_b=m_power_b,
        denominator=denominator,
        base_time_s=base_time_s,
        trip_time_s=trip_time_s,
    )


@dataclass(frozen=True)
class GenericIeeePoint:
    """Surowy wynik generycznej petli IEEE C37.112: t = TD·(A/(M^p-1) + B).

    Ksztalt INNY niz IEC: stala addytywna B jest SKALOWANA przez TD (nie
    dodawana po przeskalowaniu jak C w `GenericIdmtPoint`) — dlatego to
    ODREBNA funkcja, nie parametr wspolnej.
    """

    current_multiple_m: float
    will_trip: bool
    m_power_p: float
    denominator: float
    fraction: float  # A / denominator
    base_time_s: float  # fraction + B (przed TD)
    trip_time_s: float | None  # None gdy nie will_trip


def compute_ieee_c37112_generic(
    *,
    i_fault_a: float,
    is_pickup_a: float,
    time_dial: float,
    a: float,
    b: float,
    p: float,
    denom_guard: float = 1e-10,
) -> GenericIeeePoint:
    """Generyczna petla IEEE C37.112: t = TD·(A/(M^p-1) + B).

    JEDYNE miejsce w repozytorium liczace ten wzor (N-D4).

    Raises:
        ValueError: ``is_pickup_a <= 0``.
    """
    if is_pickup_a <= 0:
        raise ValueError("Pickup current must be positive")

    m = i_fault_a / is_pickup_a
    will_trip = m > 1.0
    if not will_trip:
        return GenericIeeePoint(
            current_multiple_m=m,
            will_trip=False,
            m_power_p=0.0,
            denominator=0.0,
            fraction=0.0,
            base_time_s=0.0,
            trip_time_s=None,
        )

    m_power_p = math.pow(m, p)
    denominator = m_power_p - 1.0
    if denominator < denom_guard:
        denominator = denom_guard

    fraction = a / denominator
    base_time_s = fraction + b
    trip_time_s = time_dial * base_time_s

    return GenericIeeePoint(
        current_multiple_m=m,
        will_trip=True,
        m_power_p=m_power_p,
        denominator=denominator,
        fraction=fraction,
        base_time_s=base_time_s,
        trip_time_s=trip_time_s,
    )


# =============================================================================
# PURE FUNCTIONS — CURVE TRIP TIME CALCULATION
# =============================================================================


def compute_curve_trip_time(
    *,
    curve_type: IEC60255CurveType,
    i_fault_a: float,
    is_pickup_a: float,
    tms: float,
) -> CurveTripTimeResult:
    """Compute trip time for a single IEC 60255 curve.

    Pure function. Deterministic. WHITE BOX.

    Formula (IDMT curves): t = TMS * A / ((I/Is)^B - 1)
    Formula (DT curve):    t = TMS

    Args:
        curve_type: IEC 60255 curve type
        i_fault_a: Fault current [A]
        is_pickup_a: Pickup current Is [A]
        tms: Time Multiplier Setting

    Returns:
        CurveTripTimeResult with full WHITE BOX trace
    """
    if is_pickup_a <= 0:
        raise ValueError(f"Pickup current must be positive, got {is_pickup_a}")
    if tms <= 0:
        raise ValueError(f"TMS must be positive, got {tms}")
    if i_fault_a < 0:
        raise ValueError(f"Fault current cannot be negative, got {i_fault_a}")

    M = i_fault_a / is_pickup_a
    will_trip = M > 1.0
    formula_latex = IEC60255_CURVE_FORMULAS_LATEX[curve_type]

    # --- Definite Time ---
    if curve_type == IEC60255CurveType.DT:
        calculated_time = tms if will_trip else None
        substitution = f"t = {tms}" if will_trip else "M <= 1, brak wyzwolenia"

        trace: dict[str, Any] = {
            "step": "IEC60255_DT",
            "standard": "IEC 60255-151:2009",
            "curve_type": curve_type.value,
            "curve_label_pl": IEC60255_CURVE_LABELS_PL[curve_type],
            "formula_latex": formula_latex,
            "I_fault_A": round(i_fault_a, 6),
            "Is_pickup_A": round(is_pickup_a, 6),
            "TMS": tms,
            "M": round(M, 6),
            "will_trip": will_trip,
            "calculated_time_s": calculated_time,
            "substitution": substitution,
        }

        return CurveTripTimeResult(
            curve_type=curve_type,
            i_fault_a=i_fault_a,
            is_pickup_a=is_pickup_a,
            tms=tms,
            current_multiple_M=round(M, 10),
            A=0.0,
            B=0.0,
            M_power_B=0.0,
            denominator=0.0,
            base_time_s=tms if will_trip else 0.0,
            calculated_time_s=calculated_time,
            will_trip=will_trip,
            formula_latex=formula_latex,
            substitution_latex=substitution,
            white_box_trace=trace,
        )

    # --- Inverse-time curves (NI, VI, EI, RI) ---
    A, B = IEC60255_CURVE_PARAMS[curve_type]

    if not will_trip:
        substitution = (
            f"M = {i_fault_a:.4f} / {is_pickup_a:.4f} = {M:.6f} <= 1.0, " f"brak wyzwolenia"
        )
        trace = {
            "step": f"IEC60255_{curve_type.value}",
            "standard": "IEC 60255-151:2009",
            "curve_type": curve_type.value,
            "curve_label_pl": IEC60255_CURVE_LABELS_PL[curve_type],
            "formula_latex": formula_latex,
            "I_fault_A": round(i_fault_a, 6),
            "Is_pickup_A": round(is_pickup_a, 6),
            "TMS": tms,
            "A": A,
            "B": B,
            "M": round(M, 10),
            "M_power_B": 0.0,
            "denominator": 0.0,
            "base_time_s": 0.0,
            "will_trip": False,
            "calculated_time_s": None,
            "substitution": substitution,
            "result": "NO_TRIP",
        }

        return CurveTripTimeResult(
            curve_type=curve_type,
            i_fault_a=i_fault_a,
            is_pickup_a=is_pickup_a,
            tms=tms,
            current_multiple_M=round(M, 10),
            A=A,
            B=B,
            M_power_B=0.0,
            denominator=0.0,
            base_time_s=0.0,
            calculated_time_s=None,
            will_trip=False,
            formula_latex=formula_latex,
            substitution_latex=substitution,
            white_box_trace=trace,
        )

    # N-D4: petla obliczeniowa (M^B, guard, TMS-skalowanie) deleguje do
    # generycznego silnika IDMT — JEDYNA implementacja tego wzoru w
    # repozytorium (patrz `compute_idmt_generic` powyzej). ``denom_guard``
    # zachowuje dotychczasowy epsilon tej funkcji (1e-12) — bez zmiany
    # wynikow dla istniejacych wolajacych (`czas_wylaczenia_galezi`,
    # `czas_wylaczenia_pola`, testy solvera).
    generic = compute_idmt_generic(
        i_fault_a=i_fault_a,
        is_pickup_a=is_pickup_a,
        time_multiplier=tms,
        a=A,
        b=B,
        c_additive=0.0,
        denom_guard=1e-12,
    )
    m_power_b = generic.m_power_b
    denominator = generic.denominator
    base_time = generic.base_time_s
    assert generic.trip_time_s is not None  # will_trip=True powyzej gwarantuje wartosc
    trip_time = generic.trip_time_s

    # Build substitution string with actual numeric values
    substitution = (
        f"M = {i_fault_a:.4f} / {is_pickup_a:.4f} = {M:.6f}; "
        f"M^{B} = {M:.6f}^{B} = {m_power_b:.10f}; "
        f"denom = {m_power_b:.10f} - 1 = {denominator:.10f}; "
        f"t_base = {A} / {denominator:.10f} = {base_time:.6f} s; "
        f"t = {tms} * {base_time:.6f} = {trip_time:.6f} s"
    )

    trace = {
        "step": f"IEC60255_{curve_type.value}",
        "standard": "IEC 60255-151:2009",
        "curve_type": curve_type.value,
        "curve_label_pl": IEC60255_CURVE_LABELS_PL[curve_type],
        "formula_latex": formula_latex,
        "I_fault_A": round(i_fault_a, 6),
        "Is_pickup_A": round(is_pickup_a, 6),
        "TMS": tms,
        "A": A,
        "B": B,
        "M": round(M, 10),
        "M_power_B": round(m_power_b, 10),
        "denominator": round(denominator, 10),
        "base_time_s": round(base_time, 6),
        "calculated_time_s": round(trip_time, 6),
        "will_trip": True,
        "substitution": substitution,
        "result": "TRIP",
    }

    return CurveTripTimeResult(
        curve_type=curve_type,
        i_fault_a=i_fault_a,
        is_pickup_a=is_pickup_a,
        tms=tms,
        current_multiple_M=round(M, 10),
        A=A,
        B=B,
        M_power_B=round(m_power_b, 10),
        denominator=round(denominator, 10),
        base_time_s=round(base_time, 6),
        calculated_time_s=round(trip_time, 6),
        will_trip=True,
        formula_latex=formula_latex,
        substitution_latex=substitution,
        white_box_trace=trace,
    )


# =============================================================================
# I^2*t THERMAL ENERGY CALCULATION
# =============================================================================


def compute_i2t_thermal_energy(
    *,
    relay_id: str,
    i_fault_a: float,
    t_trip_s: float,
) -> I2tThermalResult:
    """Compute I^2*t thermal energy for a given fault current and trip time.

    Formula: I^2*t = Ik^2 * t_trip

    Used for verifying thermal withstand of conductors, cables,
    and switchgear against short-circuit stresses.

    Args:
        relay_id: Identifier of the relay
        i_fault_a: Fault current Ik [A]
        t_trip_s: Trip time [s]

    Returns:
        I2tThermalResult with full WHITE BOX trace
    """
    if i_fault_a < 0:
        raise ValueError(f"Fault current cannot be negative, got {i_fault_a}")
    if t_trip_s < 0:
        raise ValueError(f"Trip time cannot be negative, got {t_trip_s}")

    i2t = i_fault_a * i_fault_a * t_trip_s

    formula_latex = r"I^2 t = I_k^2 \cdot t_{\mathrm{trip}}"
    substitution = (
        f"I^2*t = {i_fault_a:.4f}^2 * {t_trip_s:.6f} "
        f"= {i_fault_a * i_fault_a:.4f} * {t_trip_s:.6f} "
        f"= {i2t:.4f} A^2*s"
    )

    trace: dict[str, Any] = {
        "step": "I2t_thermal_energy",
        "relay_id": relay_id,
        "formula_latex": formula_latex,
        "I_fault_A": round(i_fault_a, 6),
        "I_fault_squared_A2": round(i_fault_a * i_fault_a, 6),
        "t_trip_s": round(t_trip_s, 6),
        "I2t_A2s": round(i2t, 6),
        "substitution": substitution,
    }

    return I2tThermalResult(
        relay_id=relay_id,
        i_fault_a=round(i_fault_a, 6),
        t_trip_s=round(t_trip_s, 6),
        i2t_a2s=round(i2t, 6),
        formula_latex=formula_latex,
        substitution_latex=substitution,
        white_box_trace=trace,
    )


# =============================================================================
# SELECTIVITY CHECK
# =============================================================================

# Standard grading margins
DEFAULT_REQUIRED_MARGIN_S = 0.3
MARGINAL_THRESHOLD_S = 0.2


def check_selectivity_pair(
    *,
    upstream: RelaySettings,
    downstream: RelaySettings,
    fault_currents_a: tuple[float, ...],
    required_margin_s: float = DEFAULT_REQUIRED_MARGIN_S,
) -> tuple[SelectivityPairResult, ...]:
    """Check selectivity (grading) between two relays at given fault currents.

    For each fault current, computes:
    - Trip time of upstream (backup) relay
    - Trip time of downstream (primary) relay
    - Grading margin = t_upstream - t_downstream
    - Verdict: PASS if margin >= required_margin_s
               MARGINAL if MARGINAL_THRESHOLD_S <= margin < required_margin_s
               FAIL if margin < MARGINAL_THRESHOLD_S

    Args:
        upstream: Upstream (backup) relay settings
        downstream: Downstream (primary) relay settings
        fault_currents_a: Tuple of fault currents to check [A]
        required_margin_s: Required grading margin [s] (default 0.3)

    Returns:
        Tuple of SelectivityPairResult for each fault current
    """
    results: list[SelectivityPairResult] = []

    for i_fault in fault_currents_a:
        upstream_result = compute_curve_trip_time(
            curve_type=upstream.curve_type,
            i_fault_a=i_fault,
            is_pickup_a=upstream.pickup_current_a,
            tms=upstream.tms,
        )
        downstream_result = compute_curve_trip_time(
            curve_type=downstream.curve_type,
            i_fault_a=i_fault,
            is_pickup_a=downstream.pickup_current_a,
            tms=downstream.tms,
        )

        t_up = upstream_result.calculated_time_s
        t_down = downstream_result.calculated_time_s

        # Determine margin and verdict
        if t_up is not None and t_down is not None:
            margin = t_up - t_down
            if margin >= required_margin_s:
                verdict = SelectivityVerdict.PASS
            elif margin >= MARGINAL_THRESHOLD_S:
                verdict = SelectivityVerdict.MARGINAL
            else:
                verdict = SelectivityVerdict.FAIL
        elif t_up is None and t_down is None:
            # Neither relay trips — no selectivity issue
            margin = None
            verdict = SelectivityVerdict.PASS
        elif t_up is None and t_down is not None:
            # Only downstream trips — upstream does not operate,
            # this is acceptable (downstream clears before upstream needed)
            margin = None
            verdict = SelectivityVerdict.PASS
        else:
            # t_up is not None and t_down is None
            # Upstream trips but downstream does not — FAIL
            margin = None
            verdict = SelectivityVerdict.FAIL

        results.append(
            SelectivityPairResult(
                upstream_relay_id=upstream.relay_id,
                downstream_relay_id=downstream.relay_id,
                i_fault_a=round(i_fault, 6),
                t_upstream_s=t_up,
                t_downstream_s=t_down,
                grading_margin_s=round(margin, 6) if margin is not None else None,
                required_margin_s=required_margin_s,
                verdict=verdict,
                upstream_trace=upstream_result.white_box_trace,
                downstream_trace=downstream_result.white_box_trace,
            )
        )

    return tuple(results)


# =============================================================================
# FULL COORDINATION ANALYSIS
# =============================================================================


def run_protection_coordination(
    *,
    relay_pairs: tuple[tuple[RelaySettings, RelaySettings], ...],
    fault_currents_a: tuple[float, ...],
    required_margin_s: float = DEFAULT_REQUIRED_MARGIN_S,
) -> ProtectionCoordinationResult:
    """Run full protection coordination analysis.

    For each (upstream, downstream) relay pair and each fault current:
    1. Compute trip times
    2. Check selectivity (grading margin)
    3. Compute I^2*t thermal energy

    Args:
        relay_pairs: Tuple of (upstream, downstream) RelaySettings pairs
        fault_currents_a: Tuple of fault currents to check [A]
        required_margin_s: Required grading margin [s]

    Returns:
        ProtectionCoordinationResult — frozen, with full white_box_trace
    """
    all_selectivity: list[SelectivityPairResult] = []
    all_i2t: list[I2tThermalResult] = []
    pair_ids: list[tuple[str, str]] = []
    trace_steps: list[dict[str, Any]] = []

    for upstream, downstream in relay_pairs:
        pair_ids.append((upstream.relay_id, downstream.relay_id))

        # Selectivity check
        pair_results = check_selectivity_pair(
            upstream=upstream,
            downstream=downstream,
            fault_currents_a=fault_currents_a,
            required_margin_s=required_margin_s,
        )
        all_selectivity.extend(pair_results)

        # I^2*t for each relay at each fault current
        for i_fault in fault_currents_a:
            # Upstream I^2*t
            up_trip = compute_curve_trip_time(
                curve_type=upstream.curve_type,
                i_fault_a=i_fault,
                is_pickup_a=upstream.pickup_current_a,
                tms=upstream.tms,
            )
            if up_trip.calculated_time_s is not None:
                up_i2t = compute_i2t_thermal_energy(
                    relay_id=upstream.relay_id,
                    i_fault_a=i_fault,
                    t_trip_s=up_trip.calculated_time_s,
                )
                all_i2t.append(up_i2t)

            # Downstream I^2*t
            dn_trip = compute_curve_trip_time(
                curve_type=downstream.curve_type,
                i_fault_a=i_fault,
                is_pickup_a=downstream.pickup_current_a,
                tms=downstream.tms,
            )
            if dn_trip.calculated_time_s is not None:
                dn_i2t = compute_i2t_thermal_energy(
                    relay_id=downstream.relay_id,
                    i_fault_a=i_fault,
                    t_trip_s=dn_trip.calculated_time_s,
                )
                all_i2t.append(dn_i2t)

        # Trace for this pair
        trace_steps.append(
            {
                "pair": [upstream.relay_id, downstream.relay_id],
                "upstream_settings": upstream.to_dict(),
                "downstream_settings": downstream.to_dict(),
                "fault_currents_a": [round(f, 6) for f in fault_currents_a],
                "selectivity_results": [r.to_dict() for r in pair_results],
            }
        )

    # Determine overall verdict (worst case)
    verdicts = [r.verdict for r in all_selectivity]
    if SelectivityVerdict.FAIL in verdicts:
        overall = SelectivityVerdict.FAIL
    elif SelectivityVerdict.MARGINAL in verdicts:
        overall = SelectivityVerdict.MARGINAL
    else:
        overall = SelectivityVerdict.PASS

    # Deduplicate I^2*t results (same relay+current may appear from
    # multiple pairs)
    seen_i2t: set[tuple[str, float]] = set()
    unique_i2t: list[I2tThermalResult] = []
    for r in all_i2t:
        key = (r.relay_id, r.i_fault_a)
        if key not in seen_i2t:
            seen_i2t.add(key)
            unique_i2t.append(r)

    # Build full white-box trace
    full_trace: dict[str, Any] = {
        "solver": "protection_iec60255",
        "solver_version": PROTECTION_IEC60255_SOLVER_VERSION,
        "standard": "IEC 60255-151:2009",
        "required_margin_s": required_margin_s,
        "marginal_threshold_s": MARGINAL_THRESHOLD_S,
        "fault_currents_a": [round(f, 6) for f in fault_currents_a],
        "pair_analyses": trace_steps,
        "i2t_results": [r.to_dict() for r in unique_i2t],
        "overall_verdict": overall.value,
    }

    # Compute deterministic signature
    sig_data = {
        "solver_version": PROTECTION_IEC60255_SOLVER_VERSION,
        "relay_pairs": [list(p) for p in pair_ids],
        "selectivity_results": [r.to_dict() for r in all_selectivity],
        "i2t_results": [r.to_dict() for r in unique_i2t],
        "overall_verdict": overall.value,
    }
    sig_json = json.dumps(sig_data, sort_keys=True, separators=(",", ":"))
    signature = hashlib.sha256(sig_json.encode("utf-8")).hexdigest()

    return ProtectionCoordinationResult(
        solver_version=PROTECTION_IEC60255_SOLVER_VERSION,
        relay_pairs=tuple(pair_ids),
        selectivity_results=tuple(all_selectivity),
        i2t_results=tuple(unique_i2t),
        overall_verdict=overall,
        white_box_trace=full_trace,
        deterministic_signature=signature,
    )
