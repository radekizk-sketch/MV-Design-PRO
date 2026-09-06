"""FAB-E (E1): odczyt pol WYNIKU solvera dla emiterow White Box (TraceArtifactV2).

Brak pola wyniku solvera w sladzie White Box NIE jest liczba 0 — analog
`formatPolishValue`/`MISSING_LABEL` z warstwy UI
(``frontend/src/ui/shared/formatPolishValue.ts``). ``TraceValue.value: float | str``
juz dopuszcza tekst, wiec brak danych renderuje sie bez zmiany kontraktu
``domain.trace_v2.artifact.TraceValue``.
"""

from __future__ import annotations

from typing import Any

from domain.trace_v2.artifact import canonical_float

#: Jedyny, jednolity napis dla brakujacego pola WYNIKU solvera w sladzie White Box.
BRAK_DANYCH = "brak danych"


def wynik(raw: Any) -> float | str:
    """Odczytaj pole WYNIKU solvera: `None` (nieobecne w wyniku) -> `BRAK_DANYCH`.

    Uzyj zamiast `canonical_float(slownik.get("pole", 0.0))` — czytaj pole przez
    `.get("pole")` (BEZ domyslnej liczby) i przekaz tu.
    """
    if raw is None:
        return BRAK_DANYCH
    return canonical_float(float(raw))


def fmt(x: float | str) -> str:
    """Formatuj wartosc do podstawienia LaTeX — tekst przechodzi bez zmian."""
    if isinstance(x, str):
        return x
    return f"{x:.6g}"
