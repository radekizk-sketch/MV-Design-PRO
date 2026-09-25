"""Stabilność SSCI (kryterium impedancyjne Nyquista) — D-03 / warstwa analizy.

Warstwa interpretacji (Z15): odczytuje gotowy wynik solvera D-03 SSCI (tablice
Z_grid(f)/Z_conv(f)/L(f)) i liczy metryki kryterium z wywodem White Box jako materiał
audytowy. Werdyktu NIE wydaje (status `NIE_OCENIONO` z wyjaśnieniem — Z_grid(f) solvera
liczone bez przekładni transformatora, `models.BRAKI_OCENY_SSCI`). NIE liczy fizyki, NIE
importuje solvera (granica warstw, arch_guard).

Odniesienia: Sun (2011) IEEE TPEL 26(11); Wen et al. (2016) IEEE TPEL 31(1);
Cespedes & Sun (2014) IEEE TPEL 29(3).
"""

from analysis.ssci_stability.builder import SsciStabilityBuilder
from analysis.ssci_stability.models import (
    DEFAULT_GAIN_CROSSOVER_MAG,
    SOLVER_INCOMPLETE_STATUS,
    SSCI_MANDATORY_FIELDS,
    SSCI_OPTIONAL_FIELDS,
    VERDICT_NIE_OCENIONO,
    CrossoverPoint,
    NyquistPoint,
    ProvenanceTag,
    SsciStabilityContext,
    SsciStabilityVerdict,
    SsciStabilityView,
    WhiteBoxStep,
    compute_ssci_stability_id,
    ocena_ssci_niewykonana,
    worst_field_quality,
)

__all__ = [
    "DEFAULT_GAIN_CROSSOVER_MAG",
    "SOLVER_INCOMPLETE_STATUS",
    "SSCI_MANDATORY_FIELDS",
    "SSCI_OPTIONAL_FIELDS",
    "VERDICT_NIE_OCENIONO",
    "CrossoverPoint",
    "NyquistPoint",
    "ProvenanceTag",
    "SsciStabilityBuilder",
    "SsciStabilityContext",
    "SsciStabilityVerdict",
    "SsciStabilityView",
    "WhiteBoxStep",
    "compute_ssci_stability_id",
    "ocena_ssci_niewykonana",
    "worst_field_quality",
]
