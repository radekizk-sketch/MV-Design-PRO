"""
Protection curves module.

Provides IEC 60255 and IEEE C37.112 curve calculations for overcurrent protection.
"""

from .curve_calculator import (
    CurveDefinition,
    CurvePoint,
    calculate_curve_points,
)
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

__all__ = [
    # IEC curves
    "IECCurveType",
    "IECCurveParams",
    "calculate_iec_tripping_time",
    "generate_iec_curve_points",
    # IEEE curves
    "IEEECurveType",
    "IEEECurveParams",
    "calculate_ieee_tripping_time",
    "generate_ieee_curve_points",
    # Calculator
    "CurveDefinition",
    "CurvePoint",
    "calculate_curve_points",
]
