"""Nazwana odmowa „dane projektanta nie pozwalają wykonać operacji" (karta ODMOWA-DANYCH-422).

PO CO. Globalny handler API tłumaczył KAŻDY `ValueError` na 422 z treścią wyjątku — także
`ValueError` rzucony przez błąd programu (uszkodzona fikstura, zły indeks, błąd konwersji,
niezmiennik kontraktu wewnętrznego). Projektant widział wtedy „błąd danych", a dziennik
ostrzeżenie bez śladu. Odtąd 422 daje WYŁĄCZNIE ten wyjątek: odmowa dziedziny podnoszona
jawnie tam, gdzie reguła modelu, walidacja wejścia albo brak danych projektowych nie pozwala
wykonać operacji. Zwykły `ValueError` jest błędem programu: 500 i pełny ślad w dzienniku
(`api/exception_handlers.py`). Wzór: `network_model/brak_zasobu.py::BrakZasobuError` dla 404.

Podklasa `ValueError`, bo wołający, którzy jawnie obsługują odmowę (`except ValueError` przy
konkretnym wywołaniu, krotka `ODMOWY_OBLICZENIA_BIEGU` biegów, walidatory pydantic), obsługują
ją dalej bez zmian. Kierunek odwrotny NIE zachodzi: zwykły `ValueError` nie jest odmową danych.

Moduł jest LIŚCIEM (wyłącznie stdlib) — jak `brak_zasobu.py` — żeby katalogi, ENM, solvery
spoza rdzeni B-01 i warstwa aplikacji mogły go importować bez cyklu.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

__all__ = ["OdmowaDanychError", "odmowa_rdzenia_b01"]


class OdmowaDanychError(ValueError):
    """Dane projektanta nie pozwalają wykonać operacji — API odpowiada 422 z komunikatem PL."""


@contextmanager
def odmowa_rdzenia_b01() -> Iterator[None]:
    """Granica wywołania rdzenia zamrożonego B-01: jego `ValueError` to odmowa danych.

    Rdzenie z listy właściciela (`scripts/rdzenie_b01.py`) zgłaszają odmowę wejścia gołym
    `ValueError` (węzeł zwarcia spoza grafu, nastawa TMS ≤ 0, układ nieobserwowalny,
    moc modułu spoza dziedziny klasyfikacji) i nie wolno ich edytować bez decyzji B-01.
    Wołający spoza rdzenia owija TYLKO wywołanie rdzenia (żadnej innej instrukcji w bloku)
    i tłumaczy jego `ValueError` na nazwaną odmowę z tym samym komunikatem — rozróżnienie po
    typie, nie po tekście. Koszt jawny: błąd programu wewnątrz rdzenia też jest wtedy
    `ValueError` i dostaje 422; znika po decyzji B-01 (rdzeń rzuca `OdmowaDanychError`
    sam, a ta granica przestaje być potrzebna). Wyjątek, który już jest odmową, przechodzi
    bez zmiany; inne typy (`KeyError`, `TypeError`, `ArithmeticError`) nie są dotykane.
    """
    try:
        yield
    except OdmowaDanychError:
        raise
    except ValueError as exc:
        raise OdmowaDanychError(str(exc)) from exc
