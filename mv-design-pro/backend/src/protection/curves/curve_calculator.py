"""
Unified protection curve calculator.

This module provides a unified interface for calculating protection curve
points and trip times (IEC 60255 SI/VI/EI/LTI/DT, IEEE C37.112 MI/VI/EI/STI/DT).

Karta AB-1a Pakiet L (2026-09-23): lokalna ocena koordynacji (`CoordinationStatus`,
`check_coordination`, `analyze_curve_set`, `calculate_grading_margin`) skasowana —
LEGACY_USUNAC A1 inwentarza werdyktow (0 importerow, zaszyty margines 0,05+0,05+0,1 s).
Ocena koordynacji zyje WYLACZNIE w `application/analyses/protection/coordination/`.

WHITE BOX: All calculation steps are exposed for auditability.
"""

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

from .iec_curves import (
    IECCurveParams,
    IECCurveType,
    calculate_iec_tripping_time,
    generate_iec_curve_points,
)
from .ieee_curves import (
    IEEECurveParams,
    IEEECurveType,
    calculate_ieee_tripping_time,
    generate_ieee_curve_points,
)


class CurveStandard(StrEnum):
    """Protection curve standard."""

    IEC = "IEC"  # IEC 60255
    IEEE = "IEEE"  # IEEE C37.112


@dataclass(frozen=True)
class CurvePoint:
    """Single point on a protection curve."""

    current_a: float  # Current [A]
    current_multiple: float  # I/Is
    time_s: float  # Trip time [s]

    def to_dict(self) -> dict[str, float]:
        """Serialize to dictionary."""
        return {
            "current_a": self.current_a,
            "current_multiple": self.current_multiple,
            "time_s": self.time_s,
        }


@dataclass
class CurveDefinition:
    """
    Complete curve definition for plotting and analysis.

    Supports both IEC and IEEE curves with all necessary parameters.
    """

    id: str
    name_pl: str  # Polish name for UI
    standard: CurveStandard
    curve_type: str  # IEC or IEEE curve type code
    pickup_current_a: float  # Is [A]
    time_multiplier: float  # TMS (IEC) or TD (IEEE)
    definite_time_s: float | None = None  # For DT curves
    color: str = "#2563eb"  # Curve color for chart
    device_id: str | None = None  # Associated protection device ID
    enabled: bool = True

    # Computed points (populated by calculate_curve_points)
    points: list[CurvePoint] = field(default_factory=list)

    def get_curve_params(self) -> IECCurveParams | IEEECurveParams:
        """Get the appropriate curve parameters based on standard."""
        if self.standard == CurveStandard.IEC:
            iec_type = IECCurveType(self.curve_type)
            return IECCurveParams.get_standard_params(iec_type)
        else:
            ieee_type = IEEECurveType(self.curve_type)
            return IEEECurveParams.get_standard_params(ieee_type)

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "id": self.id,
            "name_pl": self.name_pl,
            "standard": self.standard.value,
            "curve_type": self.curve_type,
            "pickup_current_a": self.pickup_current_a,
            "time_multiplier": self.time_multiplier,
            "definite_time_s": self.definite_time_s,
            "color": self.color,
            "device_id": self.device_id,
            "enabled": self.enabled,
            "points": [p.to_dict() for p in self.points],
        }


def calculate_curve_points(
    curve: CurveDefinition,
    current_range: tuple[float, float] = (1.1, 20.0),
    num_points: int = 100,
) -> list[CurvePoint]:
    """
    Calculate curve points for plotting.

    Args:
        curve: Curve definition
        current_range: Range as multiples of pickup current
        num_points: Number of points to generate

    Returns:
        List of CurvePoint objects
    """
    if curve.standard == CurveStandard.IEC:
        iec_type = IECCurveType(curve.curve_type)
        iec_params = IECCurveParams.get_standard_params(iec_type)
        raw_points = generate_iec_curve_points(
            curve_params=iec_params,
            pickup_current_a=curve.pickup_current_a,
            time_multiplier=curve.time_multiplier,
            current_range=current_range,
            num_points=num_points,
            definite_time_s=curve.definite_time_s,
        )
    else:
        ieee_type = IEEECurveType(curve.curve_type)
        ieee_params = IEEECurveParams.get_standard_params(ieee_type)
        raw_points = generate_ieee_curve_points(
            curve_params=ieee_params,
            pickup_current_a=curve.pickup_current_a,
            time_dial=curve.time_multiplier,
            current_range=current_range,
            num_points=num_points,
            definite_time_s=curve.definite_time_s,
        )

    return [
        CurvePoint(
            current_a=p["current_a"],
            current_multiple=p["current_multiple"],
            time_s=p["time_s"],
        )
        for p in raw_points
    ]


def calculate_trip_time(
    curve: CurveDefinition,
    fault_current_a: float,
) -> float:
    """
    Calculate trip time for a specific fault current.

    Args:
        curve: Curve definition
        fault_current_a: Fault current [A]

    Returns:
        Trip time in seconds (inf if no trip)
    """
    if curve.standard == CurveStandard.IEC:
        iec_type = IECCurveType(curve.curve_type)
        iec_params = IECCurveParams.get_standard_params(iec_type)
        iec_result = calculate_iec_tripping_time(
            fault_current_a=fault_current_a,
            pickup_current_a=curve.pickup_current_a,
            curve_params=iec_params,
            time_multiplier=curve.time_multiplier,
            definite_time_s=curve.definite_time_s,
        )
        return iec_result.tripping_time_s
    else:
        ieee_type = IEEECurveType(curve.curve_type)
        ieee_params = IEEECurveParams.get_standard_params(ieee_type)
        ieee_result = calculate_ieee_tripping_time(
            fault_current_a=fault_current_a,
            pickup_current_a=curve.pickup_current_a,
            curve_params=ieee_params,
            time_dial=curve.time_multiplier,
            definite_time_s=curve.definite_time_s,
        )
        return ieee_result.tripping_time_s
