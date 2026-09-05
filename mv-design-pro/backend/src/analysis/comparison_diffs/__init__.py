"""Wspólna arytmetyka różnic między dwoma biegami R1 (`CanonicalRun`).

CV-3.3-B. Trzy serwisy porównań (`power_flow_comparison`, `protection_comparison`,
`comparison`) powielały tę samą klasę operacji: "dopasuj po kluczu, policz deltę,
brakująca strona -> None (nigdy fabrykowane zero)". Ten pakiet jest JEDYNYM
miejscem tej arytmetyki — serwisy porównań wołają go, nie duplikują.
"""

from analysis.comparison_diffs.diffs import (
    RunProvenance,
    complex_delta_lub_none,
    delta_lub_none,
    dopasuj_klucze,
    numeric_delta_lub_none,
    pole_lub_none,
    procent_lub_none,
)

__all__ = [
    "RunProvenance",
    "complex_delta_lub_none",
    "delta_lub_none",
    "dopasuj_klucze",
    "numeric_delta_lub_none",
    "pole_lub_none",
    "procent_lub_none",
]
