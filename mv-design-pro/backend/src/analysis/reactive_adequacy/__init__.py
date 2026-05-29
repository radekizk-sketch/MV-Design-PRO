"""Adekwatnosc mocy biernej (D-06d) — warstwa analizy (interpretacja, NIE fizyka).

Warstwa interpretacji (Z15): odczytuje gotowy wynik power-flow (napiecia |V| per
wezel) oraz granice mocy biernej regulowalnych zrodel (Q_min/Q_max), i raportuje
adekwatnosc rezerwy biernej do podtrzymania napiecia:

  - per zrodlo: wykorzystanie/rezerwa Q (w gore i w dol) + znacznik NASYCENIA,
  - bilans bierny systemu (Q generowana vs Q pobierana),
  - wezly z naruszeniem pasma napieciowego (|V| poza [U_min; U_max]),
  - werdykt PL: "wystarczajaca rezerwa Q" / "rezerwa Q wyczerpana" /
    "dane niekompletne", z wywodem White Box i deterministycznym SHA-256.

Modul NIE liczy fizyki, NIE importuje solvera (granica warstw, arch_guard:
analysis ↛ solvers). Konsumuje plain dataclass'y wejscia.

ZAKRES (D-06d) celowo NIE obejmuje (odroczone): rekomendacji konkretnej mocy
kompensacji [Mvar] (wymaga czulosci dV/dQ — przyszly element), modelowania
baterii kondensatorow (D-06c), modyfikacji solvera.
"""

from analysis.reactive_adequacy.builder import ReactiveAdequacyBuilder
from analysis.reactive_adequacy.models import (
    DEFAULT_SATURATION_TOL_MVAR,
    DEFAULT_U_MAX_PU,
    DEFAULT_U_MIN_PU,
    VERDICT_ADEQUATE,
    VERDICT_EXHAUSTED,
    VERDICT_NO_DATA,
    BusVoltageInput,
    LoadReactiveInput,
    ProvenanceTag,
    ReactiveAdequacyContext,
    ReactiveAdequacySummary,
    ReactiveAdequacyView,
    ReactiveBalance,
    SourceReactiveEntry,
    SourceReactiveInput,
    VoltageViolationEntry,
    WhiteBoxStep,
    compute_reactive_adequacy_id,
    worst_field_quality,
)

__all__ = [
    "DEFAULT_SATURATION_TOL_MVAR",
    "DEFAULT_U_MAX_PU",
    "DEFAULT_U_MIN_PU",
    "VERDICT_ADEQUATE",
    "VERDICT_EXHAUSTED",
    "VERDICT_NO_DATA",
    "BusVoltageInput",
    "LoadReactiveInput",
    "ProvenanceTag",
    "ReactiveAdequacyBuilder",
    "ReactiveAdequacyContext",
    "ReactiveAdequacySummary",
    "ReactiveAdequacyView",
    "ReactiveBalance",
    "SourceReactiveEntry",
    "SourceReactiveInput",
    "VoltageViolationEntry",
    "WhiteBoxStep",
    "compute_reactive_adequacy_id",
    "worst_field_quality",
]
