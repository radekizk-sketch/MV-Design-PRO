"""Werdykt stabilności SSCI (kryterium impedancyjne Nyquista) — D-03 / warstwa analizy.

Warstwa interpretacji (Z15): odczytuje gotowy wynik solvera D-03 SSCI (tablice
Z_grid(f)/Z_conv(f)/L(f)) i wydaje werdykt stabilności (stabilny / ryzyko SSCI /
niestabilny / brak danych) z wywodem White Box. NIE liczy fizyki, NIE importuje
solvera (granica warstw, arch_guard).

Odniesienia: Sun (2011) IEEE TPEL 26(11); Wen et al. (2016) IEEE TPEL 31(1);
Cespedes & Sun (2014) IEEE TPEL 29(3).
"""

from analysis.ssci_stability.builder import SsciStabilityBuilder
from analysis.ssci_stability.models import (
    DEFAULT_GAIN_CROSSOVER_MAG,
    DEFAULT_PM_RISK_DEG,
    DEFAULT_PM_UNSTABLE_DEG,
    SOLVER_INCOMPLETE_STATUS,
    SSCI_MANDATORY_FIELDS,
    SSCI_OPTIONAL_FIELDS,
    VERDICT_NO_DATA,
    VERDICT_RISK,
    VERDICT_STABLE,
    VERDICT_UNSTABLE,
    CrossoverPoint,
    NyquistPoint,
    ProvenanceTag,
    SsciStabilityContext,
    SsciStabilityVerdict,
    SsciStabilityView,
    WhiteBoxStep,
    compute_ssci_stability_id,
    worst_field_quality,
)

__all__ = [
    "DEFAULT_GAIN_CROSSOVER_MAG",
    "DEFAULT_PM_RISK_DEG",
    "DEFAULT_PM_UNSTABLE_DEG",
    "SOLVER_INCOMPLETE_STATUS",
    "SSCI_MANDATORY_FIELDS",
    "SSCI_OPTIONAL_FIELDS",
    "VERDICT_NO_DATA",
    "VERDICT_RISK",
    "VERDICT_STABLE",
    "VERDICT_UNSTABLE",
    "CrossoverPoint",
    "NyquistPoint",
    "ProvenanceTag",
    "SsciStabilityBuilder",
    "SsciStabilityContext",
    "SsciStabilityVerdict",
    "SsciStabilityView",
    "WhiteBoxStep",
    "compute_ssci_stability_id",
    "worst_field_quality",
]
