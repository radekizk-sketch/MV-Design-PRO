"""
Unified protection curve calculator.

This module provides a unified interface for calculating protection curves
and performing coordination analysis between multiple protection devices.

The calculator supports:
- IEC 60255 curves (SI, VI, EI, LTI, DT)
- IEEE C37.112 curves (MI, VI, EI, STI, DT)
- Coordination margin analysis
- Grading calculations

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


class CoordinationStatus(StrEnum):
    """Coordination analysis result status."""

    COORDINATED = "COORDINATED"  # Skoordynowane
    MARGIN_LOW = "MARGIN_LOW"  # Margines niski
    NOT_COORDINATED = "NOT_COORDINATED"  # Nieskoordynowane
    UNKNOWN = "UNKNOWN"  # Nieznane


# Polish labels
COORDINATION_STATUS_LABELS_PL: dict[str, str] = {
    "COORDINATED": "Skoordynowane",
    "MARGIN_LOW": "Margines niski",
    "NOT_COORDINATED": "Nieskoordynowane",
    "UNKNOWN": "Nieznane",
}


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


@dataclass(frozen=True)
class FaultMarker:
    """Fault current marker for display on curve chart."""

    id: str
    label_pl: str  # Polish label
    current_a: float  # Fault current [A]
    fault_type: str  # e.g., "3F", "2F", "1F"
    location: str  # Fault location description

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "id": self.id,
            "label_pl": self.label_pl,
            "current_a": self.current_a,
            "fault_type": self.fault_type,
            "location": self.location,
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


@dataclass(frozen=True)
class CoordinationResult:
    """
    Result of coordination analysis between two curves.

    WHITE BOX: Exposes all intermediate values.
    """

    upstream_curve_id: str
    downstream_curve_id: str
    status: CoordinationStatus
    margin_s: float  # Time margin [s]
    margin_percent: float  # Margin as percentage
    # Analysis at specific current
    analysis_current_a: float
    upstream_trip_time_s: float
    downstream_trip_time_s: float
    # Recommendations
    recommendation_pl: str  # Polish recommendation text
    min_required_margin_s: float  # Required grading margin

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary for WHITE BOX trace."""
        return {
            "upstream_curve_id": self.upstream_curve_id,
            "downstream_curve_id": self.downstream_curve_id,
            "status": self.status.value,
            "status_pl": COORDINATION_STATUS_LABELS_PL.get(self.status.value, self.status.value),
            "margin_s": self.margin_s,
            "margin_percent": self.margin_percent,
            "analysis": {
                "current_a": self.analysis_current_a,
                "upstream_trip_time_s": self.upstream_trip_time_s,
                "downstream_trip_time_s": self.downstream_trip_time_s,
            },
            "recommendation_pl": self.recommendation_pl,
            "min_required_margin_s": self.min_required_margin_s,
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


def calculate_grading_margin(
    breaker_time_s: float = 0.05,
    relay_overtravel_s: float = 0.05,
    safety_factor_s: float = 0.1,
) -> float:
    """
    Calculate minimum grading margin for coordination.

    Standard formula: CTI = CB + OR + SF
    where:
        CB = Circuit breaker operating time
        OR = Relay overtravel (for electromechanical relays)
        SF = Safety factor

    For modern digital relays, typical values:
        - CB: 50-80ms
        - OR: 0-50ms (0 for digital)
        - SF: 100-200ms

    Total typical CTI: 200-400ms

    Args:
        breaker_time_s: Circuit breaker operating time [s]
        relay_overtravel_s: Relay overtravel time [s]
        safety_factor_s: Safety factor [s]

    Returns:
        Minimum grading margin [s]
    """
    return breaker_time_s + relay_overtravel_s + safety_factor_s


def check_coordination(
    upstream_curve: CurveDefinition,
    downstream_curve: CurveDefinition,
    analysis_current_a: float | None = None,
    min_margin_s: float | None = None,
) -> CoordinationResult:
    """
    Check coordination between upstream and downstream protection curves.

    The downstream device should trip before the upstream device with
    sufficient time margin (grading margin / CTI).

    Args:
        upstream_curve: Upstream (backup) protection curve
        downstream_curve: Downstream (primary) protection curve
        analysis_current_a: Current at which to analyze (default: max pickup)
        min_margin_s: Minimum required margin (default: calculated)

    Returns:
        CoordinationResult with analysis details
    """
    # Use default analysis current if not specified
    if analysis_current_a is None:
        # Analyze at 10x the higher pickup current
        max_pickup = max(
            upstream_curve.pickup_current_a,
            downstream_curve.pickup_current_a,
        )
        analysis_current_a = max_pickup * 10.0

    # Calculate default grading margin if not specified
    if min_margin_s is None:
        min_margin_s = calculate_grading_margin()

    # Calculate trip times
    upstream_trip_s = calculate_trip_time(upstream_curve, analysis_current_a)
    downstream_trip_s = calculate_trip_time(downstream_curve, analysis_current_a)

    # Calculate margin
    if upstream_trip_s == float("inf") or downstream_trip_s == float("inf"):
        margin_s = float("inf")
        margin_percent = float("inf")
    else:
        margin_s = upstream_trip_s - downstream_trip_s
        if downstream_trip_s > 0:
            margin_percent = (margin_s / downstream_trip_s) * 100
        else:
            margin_percent = float("inf")

    # Determine coordination status
    if margin_s >= min_margin_s * 1.2:  # 20% above minimum
        status = CoordinationStatus.COORDINATED
        recommendation_pl = "Koordynacja prawidłowa. Margines czasowy wystarczający."
    elif margin_s >= min_margin_s:
        status = CoordinationStatus.MARGIN_LOW
        recommendation_pl = (
            f"Margines czasowy niski ({margin_s:.3f}s). "
            f"Zalecane zwiększenie do min. {min_margin_s * 1.2:.3f}s."
        )
    elif margin_s > 0:
        status = CoordinationStatus.NOT_COORDINATED
        recommendation_pl = (
            f"Brak koordynacji! Margines {margin_s:.3f}s poniżej wymaganego "
            f"{min_margin_s:.3f}s. Wymagana korekta nastaw."
        )
    else:
        status = CoordinationStatus.NOT_COORDINATED
        recommendation_pl = (
            "Brak koordynacji! Zabezpieczenie nadrzędne zadziała przed podrzędnym. "
            "Konieczna zmiana charakterystyk lub nastaw."
        )

    return CoordinationResult(
        upstream_curve_id=upstream_curve.id,
        downstream_curve_id=downstream_curve.id,
        status=status,
        margin_s=margin_s if margin_s != float("inf") else 999.999,
        margin_percent=margin_percent if margin_percent != float("inf") else 999.999,
        analysis_current_a=analysis_current_a,
        upstream_trip_time_s=upstream_trip_s if upstream_trip_s != float("inf") else 999.999,
        downstream_trip_time_s=downstream_trip_s if downstream_trip_s != float("inf") else 999.999,
        recommendation_pl=recommendation_pl,
        min_required_margin_s=min_margin_s,
    )


def analyze_curve_set(
    curves: list[CurveDefinition],
    fault_markers: list[FaultMarker] | None = None,
) -> dict[str, Any]:
    """
    Analyze a complete set of protection curves.

    Performs:
    - Point generation for all curves
    - Coordination check between adjacent curves
    - Trip time calculation at fault points

    Args:
        curves: List of curve definitions (ordered downstream to upstream)
        fault_markers: Optional list of fault current markers

    Returns:
        Analysis results dictionary
    """
    results: dict[str, Any] = {
        "curves": [],
        "coordination": [],
        "fault_analysis": [],
    }

    # Generate points for each curve
    for curve in curves:
        if curve.enabled:
            curve.points = calculate_curve_points(curve)
            results["curves"].append(curve.to_dict())

    # Check coordination between adjacent curves
    enabled_curves = [c for c in curves if c.enabled]
    for i in range(len(enabled_curves) - 1):
        downstream = enabled_curves[i]
        upstream = enabled_curves[i + 1]
        coord_result = check_coordination(upstream, downstream)
        results["coordination"].append(coord_result.to_dict())

    # Analyze at fault points
    if fault_markers:
        for marker in fault_markers:
            fault_result: dict[str, Any] = {
                "marker": marker.to_dict(),
                "trip_times": [],
            }
            for curve in enabled_curves:
                trip_time = calculate_trip_time(curve, marker.current_a)
                fault_result["trip_times"].append(
                    {
                        "curve_id": curve.id,
                        "curve_name": curve.name_pl,
                        "trip_time_s": trip_time if trip_time != float("inf") else None,
                        "will_trip": trip_time != float("inf"),
                    }
                )
            results["fault_analysis"].append(fault_result)

    return results
