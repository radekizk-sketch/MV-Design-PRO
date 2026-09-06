"""FAB-E (E4): odczyt wymaganych pol fikstur sieci referencyjnych.

Sieci referencyjne (``application/reference_networks/**``) sa recznie
autoryzowanymi fiksturami testowymi budujacymi WEJSCIE solvera (weryfikacja
poprawnosci wzgledem znanych przykladow podrecznikowych — IEEE 4-bus
Stevenson, IEEE 13/34-bus itd.) — to NIE jest odczyt WYNIKU solvera. Brakujace
pole fikstury (np. ``p_mw`` obciazenia) jest bledem AUTORSTWA fikstury, nie
brakujacym wynikiem obliczen. Dlatego brak pola NIE dostaje cichego
zastepnika (0.0 / typowa wartosc fizyczna) — zglaszamy blad z nazwa pola i
identyfikatorem elementu, zeby autor fikstury od razu zobaczyl, co uzupelnic,
zamiast cicho zmienic scenariusz walidacji solvera.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any


class ReferenceFixtureError(ValueError):
    """Fikstura sieci referencyjnej pomija wymagane pole wejscia solvera."""


def pole_wymagane(zrodlo: Mapping[str, Any], klucz: str, *, opis: str) -> Any:
    """Zwroc ``zrodlo[klucz]``, albo zglos ``ReferenceFixtureError``.

    Args:
        zrodlo: slownik elementu fikstury (bus/branch/load/generator/source/
            shunt/transformer) z sieci referencyjnej.
        klucz: nazwa wymaganego pola wejscia solvera.
        opis: czytelny opis elementu (typ + identyfikator) do komunikatu bledu.

    Zwraca wartosc, gdy klucz jest obecny i nie jest ``None``; w przeciwnym
    razie zglasza ``ReferenceFixtureError`` nazywajac brakujace pole — NIGDY
    nie podstawia cichego zastepnika liczbowego.
    """
    wartosc = zrodlo.get(klucz)
    if wartosc is None:
        raise ReferenceFixtureError(
            f"Fikstura sieci referencyjnej: {opis} nie ma wymaganego pola {klucz!r} "
            "(wejscie solvera niekompletne)."
        )
    return wartosc


def pole_z_aliasem(zrodlo: Mapping[str, Any], klucz: str, alias: str, *, opis: str) -> Any:
    """Jak ``pole_wymagane``, ale dopuszcza JEDEN z dwoch mozliwych kluczy.

    Niektore fikstury sieci referencyjnych uzywaja alternatywnej nazwy pola
    (np. katalogowe ``sn_mva`` zamiast wewnetrznego ``rated_power_mva``) — to
    legalne aliasowanie tego samego pojecia, nie brak danych. Blad zglaszany
    jest tylko, gdy ANI klucz glowny, ANI alias nie sa obecne.
    """
    wartosc = zrodlo.get(klucz)
    if wartosc is not None:
        return wartosc
    wartosc = zrodlo.get(alias)
    if wartosc is not None:
        return wartosc
    raise ReferenceFixtureError(
        f"Fikstura sieci referencyjnej: {opis} nie ma pola {klucz!r} (ani aliasu {alias!r})."
    )
