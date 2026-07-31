"""ReportReadinessAdapter — gotowość raportów OSD i technicznego (PR-12).

Brief 2 §3 pkt 13. Integruje stan danych z raportami; przy braku danych
status 'partial' z listą braków, NIE generuje fałszywego raportu.
"""

from application.report_readiness.adapter import (
    ReportReadinessAdapter,
    ReportType,
)

__all__ = [
    "ReportReadinessAdapter",
    "ReportType",
]
