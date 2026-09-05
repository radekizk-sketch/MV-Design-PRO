"""Wspólny mechanizm deserializacji IR (Intermediate Representation).

Karta FAB-D2 (klasa A6-12, część 2): jeden wyjątek i jeden zestaw pomocników
dla WSZYSTKICH ``from_dict`` w klasie katalog/core — zamiast cichego
podstawienia ``0.0``/``""`` za brakującą daną fizyczną.

Zasada (§0 D4, doprecyzowanie koordynatora): pole WYMAGANE w dataclass/modelu
(typ ``float``/``str``/``int``, NIE ``X | None``) brakujące w słowniku
źródłowym => wyjątek z nazwą pola — NIGDY cichy default. Pole zadeklarowane
jako ``Optional`` (``X | None``) => ``None``, gdy klucz brakuje albo niesie
``None`` — brak danej fizycznej nigdy nie staje się zerem/pustym ciągiem.

Moduł jest LIŚCIEM (wyłącznie stdlib) — nie importuje niczego z ``core`` ani
``catalog``, żeby uniknąć cyklu importów: ``network_model/__init__.py``
importuje ``core``, ``core/branch.py`` importuje ``network_model.catalog``,
a ``catalog/__init__.py`` importuje ``catalog/types.py`` — ten moduł musi być
bezpieczny do zaimportowania z dowolnego punktu tego łańcucha.
"""

from __future__ import annotations

from typing import Any

__all__ = [
    "BrakujacePoleIRError",
    "wymagany_float",
    "wymagany_int",
    "wymagany_str",
]


class BrakujacePoleIRError(ValueError):
    """Wymagane pole fizyczne brakuje w deserializowanym rekordzie IR.

    Podnoszony zamiast cichego podstawienia ``0.0``/``""`` — brak danej
    wejściowej w rekordzie oznaczonym jako WYMAGANY (typ bez ``| None``) jest
    defektem integralności danych (rekord niekompletny), nie legalną
    wartością zerową/pustą. Konsument dostaje nazwę pola i (opcjonalnie)
    kontekst rekordu, żeby dało się go od razu zlokalizować.
    """

    def __init__(self, field: str, *, context: str | None = None) -> None:
        self.field = field
        self.context = context
        opis_kontekstu = f" w rekordzie '{context}'" if context else ""
        super().__init__(
            f"Brakujące wymagane pole IR: '{field}'{opis_kontekstu} — "
            "dana fizyczna nieznana, nie wolno podstawiać 0.0 ani pustego ciągu"
        )


def wymagany_float(data: dict[str, Any], field: str, *, context: str | None = None) -> float:
    """Odczytaj wymagane pole liczbowe (float) — brak klucza/``None`` podnosi wyjątek."""
    if field not in data or data[field] is None:
        raise BrakujacePoleIRError(field, context=context)
    return float(data[field])  # type: ignore[arg-type]


def wymagany_int(data: dict[str, Any], field: str, *, context: str | None = None) -> int:
    """Odczytaj wymagane pole całkowite (int) — brak klucza/``None`` podnosi wyjątek."""
    if field not in data or data[field] is None:
        raise BrakujacePoleIRError(field, context=context)
    return int(data[field])  # type: ignore[arg-type]


def wymagany_str(data: dict[str, Any], field: str, *, context: str | None = None) -> str:
    """Odczytaj wymagane pole tekstowe (str) — brak klucza/``None`` podnosi wyjątek."""
    if field not in data or data[field] is None:
        raise BrakujacePoleIRError(field, context=context)
    return str(data[field])
