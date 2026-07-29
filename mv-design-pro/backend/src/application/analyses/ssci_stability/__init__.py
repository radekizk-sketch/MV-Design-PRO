"""Widok werdyktu stabilności SSCI dla gotowego przebiegu (warstwa APPLICATION)."""

from __future__ import annotations

from application.analyses.ssci_stability.service import (
    SSCI_ANALYSIS_TYPE,
    build_ssci_stability_view,
)

__all__ = [
    "SSCI_ANALYSIS_TYPE",
    "build_ssci_stability_view",
]
