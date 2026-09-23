"""Słownik etykiet statusu werdyktu i semantyki koloru (§9) — JEDYNE takie mapowanie w produkcie.

Backend jest właścicielem etykiet: każdy rekord K i W niesie ``etykieta`` wyliczoną tutaj,
dokument formalny (``werdykt.dokument``) czyta etykietę z rekordu, a interfejs mapuje wyłącznie
``semantyka`` → kolor i nie definiuje żadnej mapy „status → etykieta". ``SLOWNIK_ETYKIET`` jest
wystawiany w API w stałej kolejności (lista rekordów ``status``, ``kompletnosc``,
``etykieta_pl``, ``semantyka``).

Kompletność dowodu rozróżnia wyłącznie status ``SPELNIA``: przy dowodzie niepełnym kryterium
spełnione jest etykietowane ostrzegawczo („dowód niepełny"). Na poziomie wymagania ``SPELNIA``
zawsze idzie z dowodem pełnym (reguła §2.3), więc wiersz ``SPELNIA`` + ``NIEPELNY`` dotyczy
poziomu kryterium.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict
from werdykt.kontrakt import Etykieta, KompletnoscDowodu, SemantykaKoloru, StatusWerdyktu, Tekst


class PozycjaSlownikaEtykiet(BaseModel):
    """Wiersz słownika etykiet: status (i kompletność dla ``SPELNIA``) → etykieta i semantyka."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    status: StatusWerdyktu
    kompletnosc: KompletnoscDowodu | None
    etykieta_pl: Tekst
    semantyka: SemantykaKoloru


#: Tabela §9 kontraktu w stałej kolejności prezentacji.
SLOWNIK_ETYKIET: tuple[PozycjaSlownikaEtykiet, ...] = (
    PozycjaSlownikaEtykiet(
        status="SPELNIA",
        kompletnosc="PELNY",
        etykieta_pl="Kryterium spełnione",
        semantyka="pozytywna",
    ),
    PozycjaSlownikaEtykiet(
        status="SPELNIA",
        kompletnosc="NIEPELNY",
        etykieta_pl="Kryterium spełnione — dowód niepełny",
        semantyka="ostrzegawcza",
    ),
    PozycjaSlownikaEtykiet(
        status="NIE_SPELNIA",
        kompletnosc=None,
        etykieta_pl="Kryterium naruszone",
        semantyka="negatywna",
    ),
    PozycjaSlownikaEtykiet(
        status="NIEJEDNOZNACZNY",
        kompletnosc=None,
        etykieta_pl="Wynik niejednoznaczny — wymaga weryfikacji",
        semantyka="ostrzegawcza",
    ),
    PozycjaSlownikaEtykiet(
        status="NIE_OCENIONO",
        kompletnosc=None,
        etykieta_pl="Ocena niewykonana",
        semantyka="neutralna",
    ),
    PozycjaSlownikaEtykiet(
        status="BRAK_DOWODU",
        kompletnosc=None,
        etykieta_pl="Brak wystarczającego dowodu",
        semantyka="ostrzegawcza",
    ),
    PozycjaSlownikaEtykiet(
        status="BRAK_PODSTAWY",
        kompletnosc=None,
        etykieta_pl="Brak zweryfikowanej podstawy wymagania",
        semantyka="ostrzegawcza",
    ),
    PozycjaSlownikaEtykiet(
        status="NIE_DOTYCZY",
        kompletnosc=None,
        etykieta_pl="Nie dotyczy",
        semantyka="neutralna",
    ),
)


def etykieta(status: StatusWerdyktu, kompletnosc: KompletnoscDowodu | None) -> Etykieta:
    """Etykieta statusu wg tabeli §9.

    Dla ``SPELNIA`` kompletność jest obowiązkowa i musi być ``PELNY`` albo ``NIEPELNY`` —
    kryterium spełnione bez określonej kompletności dowodu nie ma etykiety. Dla pozostałych
    statusów etykieta nie zależy od kompletności.
    """
    if status == "SPELNIA":
        if kompletnosc not in ("PELNY", "NIEPELNY"):
            raise ValueError(
                f"Status SPELNIA wymaga kompletności dowodu PELNY albo NIEPELNY (podano "
                f"{kompletnosc})."
            )
        klucz: KompletnoscDowodu | None = kompletnosc
    else:
        klucz = None
    for pozycja in SLOWNIK_ETYKIET:
        if pozycja.status == status and pozycja.kompletnosc == klucz:
            return Etykieta(etykieta_pl=pozycja.etykieta_pl, semantyka=pozycja.semantyka)
    raise ValueError(f"Słownik etykiet nie ma pozycji dla statusu {status}.")
