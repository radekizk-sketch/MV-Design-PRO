"""
Protection curves module.

Provides IEC 60255 and IEEE C37.112 curve calculations for overcurrent protection.

Partia integracji 10: fasada `curve_calculator.py` (`CurveDefinition`, `CurvePoint`,
`calculate_curve_points`, `calculate_trip_time`, `CurveStandard`) skasowana — zero
konsumentów produkcyjnych i testowych; krzywe liczą adaptery `iec_curves`/`ieee_curves`
delegujące do rdzenia IEC 60255. Bramka wskrzeszenia:
`scripts/legacy_public_path_guard.py::check_partia10_kasacja_resurrection`.
"""

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
]
