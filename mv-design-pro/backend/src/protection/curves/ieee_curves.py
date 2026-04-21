"""
IEEE C37.112 protection curves implementation.

This module implements inverse-time overcurrent characteristic curves
according to IEEE C37.112-2018.

IEEE curve equations differ from IEC and use the formula:
    t = TD * (A / (M^p - 1) + B)

where:
    t  = trip time [s]
    TD = Time Dial setting
    A, B, p = curve constants
    M  = I/Is (current multiple)

WHITE BOX: All intermediate values are exposed for auditability.
"""

import math
from dataclasses import dataclass
from enum import Enum
from typing import Any


class IEEECurveType(str, Enum):
    """
    IEEE C37.112 standard curve types.

    Curves classified as Moderately Inverse, Very Inverse,
    Extremely Inverse, and Short Time Inverse.
    """

    MODERATELY_INVERSE = "MI"  # Umiarkowanie odwrotna
    VERY_INVERSE = "VI"  # Bardzo odwrotna
    EXTREMELY_INVERSE = "EI"  # Ekstremalnie odwrotna
    SHORT_TIME_INVERSE = "STI"  # Krótkoczas. odwrotna
    DEFINITE_TIME = "DT"  # Czas niezależny


# Polish labels for UI display
IEEE_CURVE_LABELS_PL: dict[str, str] = {
    "MI": "Umiarkowanie odwrotna (MI)",
    "VI": "Bardzo odwrotna (VI)",
    "EI": "Ekstremalnie odwrotna (EI)",
    "STI": "Krótkoczas. odwrotna (STI)",
    "DT": "Czas niezależny (DT)",
}


@dataclass(frozen=True)
class IEEECurveParams:
    """
    Parameters for IEEE C37.112 inverse-time curves.

    Attributes:
        curve_type: Type of IEEE curve
        a: Curve constant A
        b: Curve constant B (additive)
        p: Curve exponent p
    """

    curve_type: IEEECurveType
    a: float  # Curve constant A
    b: float  # Additive constant B
    p: float  # Curve exponent p

    @classmethod
    def get_standard_params(cls, curve_type: IEEECurveType) -> "IEEECurveParams":
        """
        Get standard IEEE C37.112 curve parameters.

        Args:
            curve_type: The type of IEEE curve

        Returns:
            IEEECurveParams with standard A, B, p values
        """
        # IEEE C37.112-2018 standard parameters
        # Format: (A, B, p)
        STANDARD_PARAMS: dict[IEEECurveType, tuple[float, float, float]] = {
            IEEECurveType.MODERATELY_INVERSE: (0.0515, 0.114, 0.02),
            IEEECurveType.VERY_INVERSE: (19.61, 0.491, 2.0),
            IEEECurveType.EXTREMELY_INVERSE: (28.2, 0.1217, 2.0),
            IEEECurveType.SHORT_TIME_INVERSE: (0.00342, 0.00262, 0.02),
            IEEECurveType.DEFINITE_TIME: (0.0, 0.0, 0.0),
        }

        a, b, p = STANDARD_PARAMS.get(curve_type, (0.0515, 0.114, 0.02))  # Default to MI
        return cls(curve_type=curve_type, a=a, b=b, p=p)

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary for JSON export."""
        return {
            "curve_type": self.curve_type.value,
            "a": self.a,
            "b": self.b,
            "p": self.p,
            "standard": "IEEE C37.112-2018",
        }


@dataclass(frozen=True)
class IEEETrippingResult:
    """
    Result of IEEE tripping time calculation.

    WHITE BOX: Exposes all intermediate values for audit trail.
    """

    tripping_time_s: float  # Final trip time [s]
    current_multiple: float  # M = I/Is
    time_dial: float  # TD
    curve_params: IEEECurveParams
    # Intermediate calculation values (WHITE BOX)
    m_power_p: float  # M^p
    denominator: float  # M^p - 1
    fraction: float  # A / (M^p - 1)
    base_time_s: float  # A / (M^p - 1) + B before TD scaling
    will_trip: bool  # True if M > 1.0

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary for WHITE BOX trace."""
        return {
            "tripping_time_s": self.tripping_time_s,
            "current_multiple_M": self.current_multiple,
            "time_dial_TD": self.time_dial,
            "curve_type": self.curve_params.curve_type.value,
            "curve_A": self.curve_params.a,
            "curve_B": self.curve_params.b,
            "curve_p": self.curve_params.p,
            "intermediate": {
                "M_power_p": self.m_power_p,
                "denominator": self.denominator,
                "fraction": self.fraction,
                "base_time_s": self.base_time_s,
            },
            "will_trip": self.will_trip,
            "formula": "t = TD * (A / (M^p - 1) + B)",
        }


def calculate_ieee_tripping_time(
    fault_current_a: float,
    pickup_current_a: float,
    curve_params: IEEECurveParams,
    time_dial: float = 1.0,
    definite_time_s: float | None = None,
) -> IEEETrippingResult:
    """
    Calculate tripping time for IEEE C37.112 inverse-time curve.

    Formula: t = TD * (A / (M^p - 1) + B)
    where M = I_fault / I_pickup

    Args:
        fault_current_a: Fault current in Amperes
        pickup_current_a: Pickup (setting) current in Amperes
        curve_params: IEEE curve parameters (A, B, p)
        time_dial: TD (Time Dial setting), default 1.0
        definite_time_s: Fixed trip time for DT curves [s]

    Returns:
        IEEETrippingResult with trip time and WHITE BOX intermediate values
    """
    # Calculate current multiple
    if pickup_current_a <= 0:
        raise ValueError("Pickup current must be positive")

    current_multiple = fault_current_a / pickup_current_a

    # Check if current is above pickup (will trip)
    will_trip = current_multiple > 1.0

    # Definite time curve
    if curve_params.curve_type == IEEECurveType.DEFINITE_TIME:
        dt = definite_time_s if definite_time_s is not None else 0.1
        trip_time = dt if will_trip else float("inf")
        return IEEETrippingResult(
            tripping_time_s=trip_time,
            current_multiple=current_multiple,
            time_dial=time_dial,
            curve_params=curve_params,
            m_power_p=0.0,
            denominator=0.0,
            fraction=0.0,
            base_time_s=dt,
            will_trip=will_trip,
        )

    # Inverse-time curves
    if not will_trip:
        return IEEETrippingResult(
            tripping_time_s=float("inf"),
            current_multiple=current_multiple,
            time_dial=time_dial,
            curve_params=curve_params,
            m_power_p=0.0,
            denominator=0.0,
            fraction=0.0,
            base_time_s=float("inf"),
            will_trip=False,
        )

    # Calculate intermediate values (WHITE BOX)
    M = current_multiple
    A = curve_params.a
    B = curve_params.b
    p = curve_params.p
    TD = time_dial

    m_power_p = math.pow(M, p)
    denominator = m_power_p - 1.0

    # Protect against division by very small numbers near M=1
    if denominator < 1e-10:
        denominator = 1e-10

    fraction = A / denominator
    base_time_s = fraction + B
    trip_time = TD * base_time_s

    # Clamp to reasonable range
    trip_time = max(0.001, min(trip_time, 1000.0))

    return IEEETrippingResult(
        tripping_time_s=trip_time,
        current_multiple=current_multiple,
        time_dial=time_dial,
        curve_params=curve_params,
        m_power_p=m_power_p,
        denominator=denominator,
        fraction=fraction,
        base_time_s=base_time_s,
        will_trip=True,
    )


def generate_ieee_curve_points(
    curve_params: IEEECurveParams,
    pickup_current_a: float,
    time_dial: float = 1.0,
    current_range: tuple[float, float] = (1.1, 20.0),
    num_points: int = 100,
    definite_time_s: float | None = None,
) -> list[dict[str, float]]:
    """
    Generate curve points for plotting.

    Args:
        curve_params: IEEE curve parameters
        pickup_current_a: Pickup current [A]
        time_dial: TD
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

        result = calculate_ieee_tripping_time(
            fault_current_a=fault_current,
            pickup_current_a=pickup_current_a,
            curve_params=curve_params,
            time_dial=time_dial,
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
