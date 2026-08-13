"""
IEC 60255 protection curves implementation.

This module implements standard inverse-time overcurrent characteristic curves
according to IEC 60255-151:2009.

Curve equation: t = TMS * (A / (M^B - 1))
where:
    t   = trip time [s]
    TMS = Time Multiplier Setting (dial setting)
    A   = curve constant
    B   = curve exponent
    M   = I/Is (current multiple, ratio of fault current to pickup current)

WHITE BOX: All intermediate values are exposed for auditability.

N-D4 (karta P0.7, docs/nn/H_PLAN_IMPLEMENTACJI_NN.md §P0.7): ten modul jest
CIENKIM ADAPTEREM — petla obliczeniowa (M^B, guard, TMS-skalowanie) zyje
WYLACZNIE w `network_model.solvers.protection_iec60255.compute_idmt_generic`
(JEDYNA implementacja formuly IEC w repozytorium). Publiczna powierzchnia
tego modulu (nazwy, sygnatury, ksztalt `IECTrippingResult`) NIE ZMIENIA SIE —
konsumenci (w tym `protection.curves.curve_calculator`, uzywany przez
`application.analyses.protection.coordination`) dzialaja bez edycji.
Post-processing specyficzny dla tego adaptera (clamp do zakresu skonczonego,
``inf`` dla braku wyzwolenia, DT jako osobny parametr ``definite_time_s``)
ZOSTAJE tutaj — to reprezentacja wyniku dla tego konsumenta, nie druga
fizyka.
"""

import math
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from network_model.solvers.protection_iec60255 import compute_idmt_generic

# Numeric guard for inverse-time results, NOT a protection setting.
# The IEC 60255 inverse curves diverge as M -> 1 (e.g. LTI at M=1.1, TMS=1 gives
# t = 120/(0.1) = 1200 s). To keep results finite and JSON-safe we cap the
# reported trip time at this documented ceiling. WHITE BOX: whenever the cap is
# applied, the raw (uncapped) value and a ``clamp_applied`` flag are exposed in
# the trace so the correction is auditable, never silent.
MAX_TRIPPING_TIME_S = 100_000.0
MIN_TRIPPING_TIME_S = 0.001


class IECCurveType(StrEnum):
    """
    IEC 60255-151 standard curve types.

    Curves are defined by their characteristic equation parameters.
    """

    STANDARD_INVERSE = "SI"  # Normalna odwrotna
    VERY_INVERSE = "VI"  # Bardzo odwrotna
    EXTREMELY_INVERSE = "EI"  # Ekstremalnie odwrotna
    LONG_TIME_INVERSE = "LTI"  # Długoczasowa odwrotna
    DEFINITE_TIME = "DT"  # Czas niezależny


# Polish labels for UI display (no codenames)
IEC_CURVE_LABELS_PL: dict[str, str] = {
    "SI": "Normalna odwrotna (SI)",
    "VI": "Bardzo odwrotna (VI)",
    "EI": "Ekstremalnie odwrotna (EI)",
    "LTI": "Długoczasowa odwrotna (LTI)",
    "DT": "Czas niezależny (DT)",
}


@dataclass(frozen=True)
class IECCurveParams:
    """
    Parameters for IEC 60255 inverse-time curves.

    Attributes:
        curve_type: Type of IEC curve
        a: Curve constant A
        b: Curve exponent B
        c: Optional additive constant (for some manufacturer variants)
    """

    curve_type: IECCurveType
    a: float  # Curve constant A
    b: float  # Curve exponent B
    c: float = 0.0  # Additive constant (default 0)

    @classmethod
    def get_standard_params(cls, curve_type: IECCurveType) -> "IECCurveParams":
        """
        Get standard IEC 60255-151 curve parameters.

        Args:
            curve_type: The type of IEC curve

        Returns:
            IECCurveParams with standard A, B, C values
        """
        # IEC 60255-151:2009 standard parameters
        STANDARD_PARAMS: dict[IECCurveType, tuple[float, float, float]] = {
            IECCurveType.STANDARD_INVERSE: (0.14, 0.02, 0.0),
            IECCurveType.VERY_INVERSE: (13.5, 1.0, 0.0),
            IECCurveType.EXTREMELY_INVERSE: (80.0, 2.0, 0.0),
            IECCurveType.LONG_TIME_INVERSE: (120.0, 1.0, 0.0),
            IECCurveType.DEFINITE_TIME: (0.0, 0.0, 0.0),  # Fixed time curve
        }

        a, b, c = STANDARD_PARAMS.get(curve_type, (0.14, 0.02, 0.0))  # Default to SI
        return cls(curve_type=curve_type, a=a, b=b, c=c)

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary for JSON export."""
        return {
            "curve_type": self.curve_type.value,
            "a": self.a,
            "b": self.b,
            "c": self.c,
            "standard": "IEC 60255-151:2009",
        }


@dataclass(frozen=True)
class IECTrippingResult:
    """
    Result of IEC tripping time calculation.

    WHITE BOX: Exposes all intermediate values for audit trail.
    """

    tripping_time_s: float  # Final trip time [s]
    current_multiple: float  # M = I/Is
    time_multiplier: float  # TMS
    curve_params: IECCurveParams
    # Intermediate calculation values (WHITE BOX)
    m_power_b: float  # M^B
    denominator: float  # M^B - 1
    numerator: float  # A
    base_time_s: float  # A / (M^B - 1) before TMS scaling
    will_trip: bool  # True if M > 1.0
    # Numeric-guard audit (WHITE BOX): raw value before the finite-range cap and
    # whether the cap actually changed the reported time. Additive fields with
    # defaults so existing callers/serializers stay compatible.
    unclamped_tripping_time_s: float = 0.0  # TMS * base_time_s + C, before cap
    clamp_applied: bool = False  # True when the cap altered tripping_time_s

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary for WHITE BOX trace."""
        return {
            "tripping_time_s": self.tripping_time_s,
            "current_multiple_M": self.current_multiple,
            "time_multiplier_TMS": self.time_multiplier,
            "curve_type": self.curve_params.curve_type.value,
            "curve_A": self.curve_params.a,
            "curve_B": self.curve_params.b,
            "curve_C": self.curve_params.c,
            "intermediate": {
                "M_power_B": self.m_power_b,
                "denominator": self.denominator,
                "numerator": self.numerator,
                "base_time_s": self.base_time_s,
            },
            "will_trip": self.will_trip,
            "unclamped_tripping_time_s": self.unclamped_tripping_time_s,
            "clamp_applied": self.clamp_applied,
            "formula": "t = TMS * (A / (M^B - 1)) + C",
        }


def calculate_iec_tripping_time(
    fault_current_a: float,
    pickup_current_a: float,
    curve_params: IECCurveParams,
    time_multiplier: float = 1.0,
    definite_time_s: float | None = None,
) -> IECTrippingResult:
    """
    Calculate tripping time for IEC 60255 inverse-time curve.

    Formula: t = TMS * (A / (M^B - 1)) + C
    where M = I_fault / I_pickup

    Args:
        fault_current_a: Fault current in Amperes
        pickup_current_a: Pickup (setting) current in Amperes
        curve_params: IEC curve parameters (A, B, C)
        time_multiplier: TMS (Time Multiplier Setting), default 1.0
        definite_time_s: Fixed trip time for DT curves [s]

    Returns:
        IECTrippingResult with trip time and WHITE BOX intermediate values
    """
    # Calculate current multiple
    if pickup_current_a <= 0:
        raise ValueError("Pickup current must be positive")

    current_multiple = fault_current_a / pickup_current_a

    # Check if current is above pickup (will trip)
    will_trip = current_multiple > 1.0

    # Definite time curve
    if curve_params.curve_type == IECCurveType.DEFINITE_TIME:
        dt = definite_time_s if definite_time_s is not None else 0.1
        trip_time = dt if will_trip else float("inf")
        return IECTrippingResult(
            tripping_time_s=trip_time,
            current_multiple=current_multiple,
            time_multiplier=time_multiplier,
            curve_params=curve_params,
            m_power_b=0.0,
            denominator=0.0,
            numerator=0.0,
            base_time_s=dt,
            will_trip=will_trip,
            unclamped_tripping_time_s=trip_time,
            clamp_applied=False,
        )

    # Inverse-time curves
    if not will_trip:
        return IECTrippingResult(
            tripping_time_s=float("inf"),
            current_multiple=current_multiple,
            time_multiplier=time_multiplier,
            curve_params=curve_params,
            m_power_b=0.0,
            denominator=0.0,
            numerator=curve_params.a,
            base_time_s=float("inf"),
            will_trip=False,
            unclamped_tripping_time_s=float("inf"),
            clamp_applied=False,
        )

    # N-D4: petla obliczeniowa (M^B, guard, TMS-skalowanie) deleguje do
    # generycznego silnika `protection_iec60255.compute_idmt_generic` —
    # JEDYNA implementacja tego wzoru w repozytorium. ``denom_guard=1e-10``
    # zachowuje dotychczasowy epsilon TEGO adaptera (bez zmiany wynikow
    # istniejacych wolajacych — `curve_calculator`, `coordination/**`).
    numerator = curve_params.a
    generic = compute_idmt_generic(
        i_fault_a=fault_current_a,
        is_pickup_a=pickup_current_a,
        time_multiplier=time_multiplier,
        a=curve_params.a,
        b=curve_params.b,
        c_additive=curve_params.c,
        denom_guard=1e-10,
    )
    m_power_b = generic.m_power_b
    denominator = generic.denominator
    base_time_s = generic.base_time_s
    assert generic.trip_time_s is not None  # will_trip=True powyzej gwarantuje wartosc
    unclamped_trip_time = generic.trip_time_s

    # Numeric guard to a finite, JSON-safe range. WHITE BOX: keep the raw value
    # and flag when the cap actually altered the result, so the correction is
    # auditable instead of silently flattening the LTI tail.
    trip_time = max(MIN_TRIPPING_TIME_S, min(unclamped_trip_time, MAX_TRIPPING_TIME_S))
    clamp_applied = trip_time != unclamped_trip_time

    return IECTrippingResult(
        tripping_time_s=trip_time,
        current_multiple=current_multiple,
        time_multiplier=time_multiplier,
        curve_params=curve_params,
        m_power_b=m_power_b,
        denominator=denominator,
        numerator=numerator,
        base_time_s=base_time_s,
        will_trip=True,
        unclamped_tripping_time_s=unclamped_trip_time,
        clamp_applied=clamp_applied,
    )


def generate_iec_curve_points(
    curve_params: IECCurveParams,
    pickup_current_a: float,
    time_multiplier: float = 1.0,
    current_range: tuple[float, float] = (1.1, 20.0),
    num_points: int = 100,
    definite_time_s: float | None = None,
) -> list[dict[str, float]]:
    """
    Generate curve points for plotting.

    Args:
        curve_params: IEC curve parameters
        pickup_current_a: Pickup current [A]
        time_multiplier: TMS
        current_range: Range as multiples of pickup (min, max)
        num_points: Number of points to generate
        definite_time_s: Fixed time for DT curves

    Returns:
        List of {current_a, current_multiple, time_s} dictionaries
    """
    points: list[dict[str, float]] = []

    min_mult, max_mult = current_range
    # Generate logarithmic distribution of current multiples
    log_min = math.log10(min_mult)
    log_max = math.log10(max_mult)

    for i in range(num_points):
        # Logarithmic spacing
        if num_points > 1:
            log_mult = log_min + (log_max - log_min) * i / (num_points - 1)
        else:
            log_mult = log_min
        mult = math.pow(10, log_mult)

        fault_current = pickup_current_a * mult

        result = calculate_iec_tripping_time(
            fault_current_a=fault_current,
            pickup_current_a=pickup_current_a,
            curve_params=curve_params,
            time_multiplier=time_multiplier,
            definite_time_s=definite_time_s,
        )

        if result.will_trip and result.tripping_time_s < float("inf"):
            points.append(
                {
                    "current_a": fault_current,
                    "current_multiple": mult,
                    "time_s": result.tripping_time_s,
                }
            )

    return points
