"""ReportReadinessAdapter (PR-12 brief 2 §3 pkt 13).

Integruje stan danych z raportami OSD i technicznym. Przy braku danych —
zwraca status partial z listą braków, NIE generuje fałszywego raportu.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from src.application.calculation_readiness.service import (
    CalculationReadinessService,
    ReadinessTypeReport,
)
from src.enm.models import EnergyNetworkModel

ReportType = Literal["osd", "technical"]


class ReportReadinessStatus(BaseModel):
    """Status gotowości raportu."""

    report_type: ReportType
    can_generate: bool
    status_pl: str  # "gotowe" / "wynik częściowy" / "zablokowany" / "nie dotyczy"
    missing_data_pl: list[str] = Field(default_factory=list)
    blocking_objects: list[str] = Field(default_factory=list)
    rationale_pl: str | None = None


class ReportReadinessAdapter:
    """Adapter integrujący gotowość obliczeń z raportami."""

    def __init__(
        self,
        readiness_service: CalculationReadinessService | None = None,
    ) -> None:
        self._readiness = readiness_service or CalculationReadinessService()

    def is_ready_for_osd_report(self, enm: EnergyNetworkModel) -> ReportReadinessStatus:
        """Raport OSD wymaga power_flow + short_circuit kompletnych."""
        report = self._readiness.evaluate_single(enm, "report_osd")
        return self._to_status("osd", report)

    def is_ready_for_technical_report(self, enm: EnergyNetworkModel) -> ReportReadinessStatus:
        """Raport techniczny wymaga 5 podstawowych typów obliczeń."""
        report = self._readiness.evaluate_single(enm, "report_technical")
        return self._to_status("technical", report)

    def _to_status(
        self, report_type: ReportType, report: ReadinessTypeReport
    ) -> ReportReadinessStatus:
        status_map = {
            "ready": "gotowe",
            "partial": "wynik częściowy",
            "blocked": "zablokowany",
            "no_module": "brak modułu obliczeniowego",
            "n_a": "nie dotyczy",
        }
        return ReportReadinessStatus(
            report_type=report_type,
            can_generate=report.status == "ready",
            status_pl=status_map[report.status],
            missing_data_pl=list(report.missing_fields_pl),
            blocking_objects=list(report.blocking_object_refs),
            rationale_pl=report.recommended_action_pl,
        )
