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

Moduł jest LIŚCIEM (wyłącznie stdlib) — jak `brak_zasobu.py` — żeby katalogi, ENM, solvery,
warstwa aplikacji i rdzenie B-01 objęte decyzją O-59 (§12.2 (k): zwarcia IEC 60909 i rozpływ
NR) mogły go importować bez cyklu.
"""

from __future__ import annotations

from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from dataclasses import dataclass

__all__ = [
    "RODZAJ_GALAZ",
    "RODZAJ_WEZEL",
    "OdmowaDanychError",
    "OdmowaWejsciaRdzenia",
    "OdwolanieElementu",
    "RekordOdmowy",
    "odmowa_rdzenia_b01",
]

#: Rodzaj elementu grafu sieci w odwołaniu rekordu odmowy (węzeł grafu, gałąź grafu).
RODZAJ_WEZEL = "wezel"
RODZAJ_GALAZ = "galaz"


class OdmowaDanychError(ValueError):
    """Dane projektanta nie pozwalają wykonać operacji — API odpowiada 422 z komunikatem PL."""


@dataclass(frozen=True)
class OdwolanieElementu:
    """Odwołanie rekordu odmowy do elementu grafu: rodzaj (`RODZAJ_*`) i identyfikator.

    Identyfikator jest POLEM strukturalnym (nawigacja, zaznaczenie, nazwa składana przez
    warstwę aplikacji), nigdy częścią treści komunikatu.
    """

    rodzaj: str
    ref: str


@dataclass(frozen=True)
class RekordOdmowy:
    """Jedna odmowa wejścia rdzenia obliczeniowego (decyzja O-59, plan A/B §12.2 (k)).

    `kod` — kod maszynowy odmowy (filtry, API, testy; nie stoi w treści); `tresc` — zdanie po
    polsku BEZ identyfikatorów; `odwolania` — elementy, których odmowa dotyczy. Zdanie z
    nazwami elementów z modelu składa warstwa aplikacji (`enm/zdania_odmow_rdzenia.py`).
    """

    kod: str
    tresc: str
    odwolania: tuple[OdwolanieElementu, ...] = ()


class OdmowaWejsciaRdzenia(OdmowaDanychError):
    """Nazwana odmowa wejścia rdzenia obliczeniowego niosąca rekordy strukturalne.

    Treść wyjątku to zdania rekordów złączone średnikiem (albo zdanie złożone przez warstwę
    aplikacji z nazwami elementów — `tresc`); kody i identyfikatory zostają w `rekordy`.
    """

    def __init__(self, rekordy: Sequence[RekordOdmowy], *, tresc: str | None = None) -> None:
        rekordy_krotka = tuple(rekordy)
        if not rekordy_krotka:
            raise AssertionError("Odmowa wejścia rdzenia wymaga co najmniej jednego rekordu.")
        super().__init__(tresc if tresc is not None else "; ".join(r.tresc for r in rekordy_krotka))
        self.rekordy = rekordy_krotka


@contextmanager
def odmowa_rdzenia_b01() -> Iterator[None]:
    """Granica wywołania rdzenia zamrożonego B-01: jego `ValueError` to odmowa danych.

    Rdzenie z listy właściciela (`scripts/rdzenie_b01.py`) zgłaszają odmowę wejścia gołym
    `ValueError` (nastawa TMS ≤ 0, układ nieobserwowalny, moc modułu spoza dziedziny
    klasyfikacji) i nie wolno ich edytować bez decyzji B-01; rdzeń zwarciowy i rozpływ od
    decyzji O-59 rzucają już `OdmowaWejsciaRdzenia` z rekordami strukturalnymi.
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
