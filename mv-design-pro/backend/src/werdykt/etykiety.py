"""Słownik etykiet statusu werdyktu i semantyki koloru (§9) — JEDYNE takie mapowanie w produkcie.

Backend jest właścicielem etykiet: każdy rekord K i W niesie ``etykieta`` wyliczoną tutaj,
dokument formalny (``werdykt.dokument``) czyta etykietę z rekordu, a interfejs mapuje wyłącznie
``semantyka`` → kolor i nie definiuje żadnej mapy „status → etykieta". ``SLOWNIK_ETYKIET`` jest
wystawiany w API w stałej kolejności (lista rekordów ``poziom``, ``status``, ``kompletnosc``,
``etykieta_pl``, ``semantyka``): najpierw poziom K, potem poziom W.

Etykieta zależy od POZIOMU rekordu: na poziomie K „Kryterium spełnione" / „Kryterium naruszone",
na poziomie W „Wymaganie spełnione" / „Wymaganie naruszone" (słowo „Kryterium" zastąpione
słowem „Wymaganie", §9); etykiety pozostałych statusów są wspólne dla obu poziomów.
Kompletność dowodu rozróżnia wyłącznie status ``SPELNIA``: przy dowodzie niepełnym kryterium
spełnione jest etykietowane ostrzegawczo („dowód niepełny"). Na poziomie wymagania ``SPELNIA``
zawsze idzie z dowodem pełnym (reguła §2.3 pkt 9), więc para ``SPELNIA`` + ``NIEPELNY`` na
poziomie W nie ma pozycji słownika i jest odrzucana.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict
from werdykt.kontrakt import (
    Etykieta,
    KompletnoscDowodu,
    PoziomRekordu,
    SemantykaKoloru,
    StatusWerdyktu,
    Tekst,
)


class PozycjaSlownikaEtykiet(BaseModel):
    """Wiersz słownika etykiet: poziom rekordu, status (i kompletność dla ``SPELNIA``) →
    etykieta i semantyka."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    poziom: PoziomRekordu
    status: StatusWerdyktu
    kompletnosc: KompletnoscDowodu | None
    etykieta_pl: Tekst
    semantyka: SemantykaKoloru


#: Wiersze wspólne dla obu poziomów: (status, etykieta, semantyka).
_ETYKIETY_WSPOLNE: tuple[tuple[StatusWerdyktu, str, SemantykaKoloru], ...] = (
    ("NIEJEDNOZNACZNY", "Wynik niejednoznaczny — wymaga weryfikacji", "ostrzegawcza"),
    ("NIE_OCENIONO", "Ocena niewykonana", "neutralna"),
    ("BRAK_DOWODU", "Brak wystarczającego dowodu", "ostrzegawcza"),
    ("BRAK_PODSTAWY", "Brak zweryfikowanej podstawy wymagania", "ostrzegawcza"),
    ("NIE_DOTYCZY", "Nie dotyczy", "neutralna"),
)


def _wspolne(poziom: PoziomRekordu) -> tuple[PozycjaSlownikaEtykiet, ...]:
    return tuple(
        PozycjaSlownikaEtykiet(
            poziom=poziom,
            status=status,
            kompletnosc=None,
            etykieta_pl=etykieta_pl,
            semantyka=semantyka,
        )
        for status, etykieta_pl, semantyka in _ETYKIETY_WSPOLNE
    )


#: Tabela §9 kontraktu w stałej kolejności prezentacji: poziom K, potem poziom W.
SLOWNIK_ETYKIET: tuple[PozycjaSlownikaEtykiet, ...] = (
    PozycjaSlownikaEtykiet(
        poziom="K",
        status="SPELNIA",
        kompletnosc="PELNY",
        etykieta_pl="Kryterium spełnione",
        semantyka="pozytywna",
    ),
    PozycjaSlownikaEtykiet(
        poziom="K",
        status="SPELNIA",
        kompletnosc="NIEPELNY",
        etykieta_pl="Kryterium spełnione — dowód niepełny",
        semantyka="ostrzegawcza",
    ),
    PozycjaSlownikaEtykiet(
        poziom="K",
        status="NIE_SPELNIA",
        kompletnosc=None,
        etykieta_pl="Kryterium naruszone",
        semantyka="negatywna",
    ),
    *_wspolne("K"),
    PozycjaSlownikaEtykiet(
        poziom="W",
        status="SPELNIA",
        kompletnosc="PELNY",
        etykieta_pl="Wymaganie spełnione",
        semantyka="pozytywna",
    ),
    PozycjaSlownikaEtykiet(
        poziom="W",
        status="NIE_SPELNIA",
        kompletnosc=None,
        etykieta_pl="Wymaganie naruszone",
        semantyka="negatywna",
    ),
    *_wspolne("W"),
)


def etykieta(
    status: StatusWerdyktu,
    kompletnosc: KompletnoscDowodu | None,
    poziom: PoziomRekordu,
) -> Etykieta:
    """Etykieta statusu rekordu danego poziomu wg tabeli §9.

    Dla ``SPELNIA`` kompletność jest obowiązkowa i musi być ``PELNY`` albo ``NIEPELNY`` —
    kryterium spełnione bez określonej kompletności dowodu nie ma etykiety; na poziomie W
    ``SPELNIA`` wymaga ``PELNY`` (para ``SPELNIA`` + ``NIEPELNY`` jest odrzucana). Dla
    pozostałych statusów etykieta nie zależy od kompletności.
    """
    if status == "SPELNIA":
        if kompletnosc not in ("PELNY", "NIEPELNY"):
            raise ValueError(
                f"Status SPELNIA wymaga kompletności dowodu PELNY albo NIEPELNY (podano "
                f"{kompletnosc})."
            )
        if poziom == "W" and kompletnosc != "PELNY":
            raise ValueError(
                "Na poziomie wymagania status SPELNIA wymaga dowodu pełnego — przy dowodzie "
                "niepełnym reguła agregacji (§2.3 pkt 9) daje BRAK_DOWODU."
            )
        klucz: KompletnoscDowodu | None = kompletnosc
    else:
        klucz = None
    for pozycja in SLOWNIK_ETYKIET:
        if pozycja.poziom == poziom and pozycja.status == status and pozycja.kompletnosc == klucz:
            return Etykieta(etykieta_pl=pozycja.etykieta_pl, semantyka=pozycja.semantyka)
    raise ValueError(f"Słownik etykiet nie ma pozycji dla statusu {status} na poziomie {poziom}.")
