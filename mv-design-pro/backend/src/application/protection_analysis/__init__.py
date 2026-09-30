"""
Protection Analysis Module — P15a FOUNDATION + P15a-EXT-VENDORS

Backend-only protection analysis as interpretation layer.
Consumes SC results + ProtectionCase config + Protection Library
to produce deterministic ProtectionResult + ProtectionTrace.

Vendor Extension (P15a-EXT-VENDORS):
- Multi-manufacturer curve support
- IEC-mapped and vendor-native curves
- Full audit trail with manufacturer info

CV-3.3-B: `ProtectionAnalysisService` (orkiestracja biegu na R3 `study_results`)
usunięty — bieg zabezpieczeń jest odtąd `CanonicalRun` (R1, `analysis_type=
"protection_sn"`, `enm.canonical_analysis._execute_protection`), reużywający
TEN SAM silnik (`ProtectionEvaluationEngine`) i TEN SAM odczyt katalogu
(`catalog_lookup`, wydzielony z usuniętej klasy serwisu).
"""

from application.protection_analysis.engine import (
    FaultPoint,
    ProtectionDevice,
    ProtectionEvaluationEngine,
    ProtectionEvaluationInput,
    build_device_from_template,
    build_device_from_vendor_curve,
    build_fault_from_sc_result,
    compute_definite_time,
    compute_iec_inverse_time,
    compute_margin_percent,
    list_supported_vendor_curves,
)

__all__ = [
    # Engine
    "FaultPoint",
    "ProtectionDevice",
    "ProtectionEvaluationEngine",
    "ProtectionEvaluationInput",
    "build_device_from_template",
    "build_device_from_vendor_curve",
    "build_fault_from_sc_result",
    "compute_definite_time",
    "compute_iec_inverse_time",
    "compute_margin_percent",
    "list_supported_vendor_curves",
]
