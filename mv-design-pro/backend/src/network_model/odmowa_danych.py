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

from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from types import MappingProxyType

__all__ = ["OdmowaDanychError", "OdmowaNazwana", "odmowa_rdzenia_b01"]


class OdmowaDanychError(ValueError):
    """Dane projektanta nie pozwalają wykonać operacji — API odpowiada 422 z komunikatem PL."""


class OdmowaNazwana(OdmowaDanychError):
    """Odmowa z KODEM MASZYNOWYM w polu, nie w treści zdania (karty W10-2a i OD-17a).

    Komunikat jest zdaniem dla projektanta (po polsku, z nazwami elementów z modelu, bez
    identyfikatorów maszynowych); ``kod`` służy agregacji, filtrom i API; ``dane`` niosą
    strukturę odmowy (np. listę ``type_id`` bez ceny). Handler 422 przenosi oba pola do ciała
    odpowiedzi (``kod``, ``dane``) obok ``detail``. ``dane`` są niemutowalne i zawierają
    wyłącznie wartości serializowalne do JSON (napis, liczba, krotka napisów).
    """

    def __init__(
        self, komunikat: str, *, kod: str, dane: Mapping[str, object] | None = None
    ) -> None:
        if not kod.strip():
            raise ValueError("OdmowaNazwana wymaga niepustego kodu maszynowego.")
        if kod in komunikat:
            raise ValueError(f"Kod maszynowy {kod!r} nie należy do treści zdania dla projektanta.")
        super().__init__(komunikat)
        self.kod = kod
        self.dane: Mapping[str, object] = MappingProxyType(dict(dane or {}))


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
