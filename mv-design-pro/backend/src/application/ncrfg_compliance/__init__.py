"""NC RfG compliance testbench (PR-16) — automatyczny testbench zgodności.

18 testów × 5 profili operatorów × 4 typy modułów A/B/C/D = pełen testbench.
Adapter API gotowy; solver numeryczny w PR-16-impl (osobna sesja).
"""

from application.ncrfg_compliance.checker import (
    ComplianceTestResult,
    DerDataForCompliance,
    NcRfgComplianceChecker,
    NcRfgComplianceReport,
)
from application.ncrfg_compliance.model_bridge import (
    build_der_compliance_from_generator,
    build_der_compliance_list_from_enm,
)

__all__ = [
    "ComplianceTestResult",
    "DerDataForCompliance",
    "NcRfgComplianceChecker",
    "NcRfgComplianceReport",
    "build_der_compliance_from_generator",
    "build_der_compliance_list_from_enm",
]
