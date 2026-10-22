#!/usr/bin/env python3
"""Wspolne czytanie i parsowanie zrodel Pythona dla strazników.

PO CO: strażnik, który nie umie przeczytać pliku z zakresu skanu i mimo to melduje
„czysto", daje fałszywą pewność. Precedens: przy scaleniu partii 13 moduł
`application/analyses/wytrzymalosc_aparatury_pol.py` miał urwany koniec funkcji, a
`solver_input_substitute_guard` zwrócił PASS i policzył 4241 pól zamiast 4242, bo
łapał `SyntaxError` i robił `continue`.

REGUŁA (jedno źródło): plik w zakresie skanu, którego nie da się odczytać albo
sparsować, to CZERWIEŃ z nazwą pliku, linią i komunikatem — nigdy pominięcie.
Funkcje tu rzucają `BladZrodla`; strażnik albo zamienia go na naruszenie
(`str(blad)`), albo oddaje wyjątek do `uruchom()`, które drukuje `FAIL: ...` i
zwraca kod 1.
"""

from __future__ import annotations

import ast
from collections.abc import Callable
from pathlib import Path


class BladZrodla(Exception):
    """Plik z zakresu skanu nie daje się odczytać/sparsować (komunikat: plik:linia: powód)."""


def czytaj_tekst(sciezka: Path, etykieta: str | None = None) -> str:
    """Tekst UTF-8 pliku; błąd odczytu/dekodowania => `BladZrodla`."""
    try:
        return sciezka.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as exc:
        raise BladZrodla(
            f"{etykieta or sciezka}:0: nie da sie odczytac pliku z zakresu skanu "
            f"({type(exc).__name__}: {exc}) — straznik nie moze go ocenic"
        ) from exc


def sparsuj_tekst(tekst: str, etykieta: str) -> ast.Module:
    """AST z gotowego tekstu; błąd składni => `BladZrodla` z linią."""
    try:
        return ast.parse(tekst, filename=etykieta)
    except SyntaxError as exc:
        raise BladZrodla(
            f"{etykieta}:{exc.lineno or 0}: blad skladni ({exc.msg}) — plik z zakresu skanu "
            "nie daje sie sparsowac, straznik nie moze go ocenic"
        ) from exc


def sparsuj_plik(sciezka: Path, etykieta: str | None = None) -> ast.Module:
    """Odczyt + parsowanie pliku; każdy błąd => `BladZrodla` (plik:linia: powód)."""
    nazwa = etykieta or str(sciezka)
    return sparsuj_tekst(czytaj_tekst(sciezka, nazwa), nazwa)


def uruchom(glowna: Callable[[], int]) -> int:
    """Wykonaj `main()` strażnika; `BladZrodla` => `FAIL: ...` i kod 1."""
    try:
        return glowna()
    except BladZrodla as blad:
        print(f"FAIL: {blad}")
        return 1
