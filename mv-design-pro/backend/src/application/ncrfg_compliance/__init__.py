"""NC RfG compliance testbench (PR-16) — automatyczny testbench zgodności.

18 testów × 5 profili operatorów × 4 typy modułów A/B/C/D = pełen testbench.
Adapter API gotowy; solver numeryczny w PR-16-impl (osobna sesja).
"""

from src.application.ncrfg_compliance.checker import (
    ComplianceTestResult,
    NcRfgComplianceChecker,
    NcRfgComplianceReport,
)

__all__ = [
    "ComplianceTestResult",
    "NcRfgComplianceChecker",
    "NcRfgComplianceReport",
]
