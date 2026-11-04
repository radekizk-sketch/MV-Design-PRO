"""Rekord K kryterium prądowego kabla SN po korekcie warunkami ułożenia (C36, karta F-K7).

PO CO. Podgląd ``POST /api/solver/cable-ampacity-derating-preview`` oddawał werdykt
``ok: bool`` (I_obl ≤ I′z) bez wyjaśnienia: bez podstawy kryterium, bez marginesu, bez
informacji, że obciążalność przyjęta dla warunków katalogowych jest założeniem roboczym,
a nie potwierdzoną daną trasy. Kontrakt werdyktu wyjaśnialnego
(``docs/domain/KONTRAKT_WERDYKTU_WYJASNIALNEGO.md``) wymaga rekordu ``OcenaKryterium``
w miejscu każdego statusu — ten moduł go buduje.

Zero fizyki: obciążalność skorygowaną liczy solver ``cable_ampacity_derating``
(``obciazalnosc_skorygowana``) — tu wyłącznie porównanie prądu podanego przez projektanta
z wartością solvera i opis podstawy.
"""

from __future__ import annotations

from typing import Final

from network_model.solvers.cable_ampacity_derating import WspolczynnikiObciazalnosci
from solver_input.provenance import classify_dynamic_capability
from werdykt import (
    DanaPrzyjeta,
    FieldQuality,
    Niepewnosc,
    OcenaKryterium,
    PodstawaWymagania,
    Przedmiot,
    Wielkosc,
    ZakresWaznosci,
    format_liczba,
)
from werdykt.porownanie import Porownanie, ocena_porownania

#: Identyfikator kryterium (stabilny; podgląd ocenia jeden kabel na odpowiedź).
KRYTERIUM_KOREKTY = "kabel_sn.obciazalnosc_skorygowana"
#: Zdolność w rejestrze dowodowym (``solver_input.provenance``).
ZDOLNOSC_KOREKTY = "kabel_sn.obciazalnosc_skorygowana"

_J_A: Final = "A"
_ZAOKR: Final = 6

#: Podstawa KRYTERIUM: dobór przekroju kabla SN na obciążalność długotrwałą. Stan
#: NIEUSTALONE — ta sama podstawa co kryterium obciążalności odcinka magistrali SN
#: (``ocena_doboru_magistrali.py``), wydanie i jednostka redakcyjna nieustalone w rejestrze.
_PODSTAWA_KRYTERIUM: Final = PodstawaWymagania(
    rodzaj="NORMA",
    dokument=(
        "N SEP-E-004 Elektroenergetyczne i sygnalizacyjne linie kablowe — Projektowanie "
        "i budowa (dobór przekroju na obciążalność długotrwałą)"
    ),
    status="NIEUSTALONE",
    uwagi_pl="wydanie i jednostka redakcyjna nieustalone w rejestrze podstaw",
)

_NIEPEWNOSC: Final = Niepewnosc(
    nie_dotyczy=True,
    powod_pl=(
        "porównanie prądu obliczeniowego podanego przez projektanta z iloczynem obciążalności "
        "katalogowej i współczynników tabelarycznych — niepewność numeryczna nie dotyczy"
    ),
)

_ZAKRES: Final = ZakresWaznosci(
    rodzaj_analizy=None,
    opis_pl=(
        "Kryterium prądowe kabla SN w podglądzie kreatora: prąd obliczeniowy podany przez "
        "projektanta wobec obciążalności długotrwałej z karty katalogowej skorygowanej "
        "współczynnikami wybranego zestawu warunków ułożenia"
    ),
    wykluczenia=(
        "obliczenie cieplne trasy (tablice IEC 60287 nie są dołączone do programu)",
        "interpolacja między zestawami warunków ułożenia",
        "obciążenie zmienne w czasie (współczynnik obciążenia dobowego)",
    ),
)


def _podstawa_limitu(wspolczynniki: WspolczynnikiObciazalnosci) -> PodstawaWymagania:
    return PodstawaWymagania(
        rodzaj="KATALOG_PRODUCENTA",
        dokument="karta katalogowa typu kabla SN",
        wydanie="pozycja katalogu typów programu",
        jednostka_redakcyjna="obciążalność długotrwała I_z w warunkach odniesienia producenta",
        status="WSKAZANE",
        uwagi_pl=(
            f"korekta zestawem „{wspolczynniki.etykieta_pl}” (iloczyn "
            f"{format_liczba(wspolczynniki.iloczyn)}); podstawa współczynników: "
            f"{wspolczynniki.podstawa}"
        ),
    )


def _dane_przyjete(
    wspolczynniki: WspolczynnikiObciazalnosci, skorygowana_a: float
) -> tuple[DanaPrzyjeta, ...]:
    """Warunki katalogowe bez korekty to założenie robocze (zasada nr 4): obliczenie biegnie,
    ale ocena na nim ma kompletność NIEPELNY — nie udaje danej trasy."""
    if not wspolczynniki.bez_korekty:
        return ()
    return (
        DanaPrzyjeta(
            nazwa_pl="obciążalność skorygowana I′z (warunki ułożenia trasy)",
            wartosc=Wielkosc(wartosc=round(skorygowana_a, _ZAOKR), jednostka=_J_A),
            powod_pl=(
                "nie wybrano warunków ułożenia — przyjęto warunki katalogowe producenta "
                "(iloczyn współczynników 1,0); w rzeczywistej trasie obciążalność może być "
                "mniejsza"
            ),
            jakosc=FieldQuality.ESTIMATED,
        ),
    )


def ocena_korekty_obciazalnosci(
    *,
    prad_obliczeniowy_a: float,
    obciazalnosc_katalogowa_a: float,
    obciazalnosc_skorygowana_a: float,
    wspolczynniki: WspolczynnikiObciazalnosci,
) -> OcenaKryterium:
    """Rekord K kryterium I_obl ≤ I′z (I′z = I_z · f_grunt · f_wiązka · f_grupa)."""
    porownanie = Porownanie(
        kryterium_id=KRYTERIUM_KOREKTY,
        opis_pl=(
            "Prąd obliczeniowy kabla nie większy od obciążalności długotrwałej skorygowanej "
            "warunkami ułożenia"
        ),
        relacja="NIE_WIECEJ",
        wielkosc_pl="prąd obliczeniowy kabla",
        warunek_latex=r"I_{obl} \le I'_z = I_z \cdot f_{grunt} \cdot f_{wiazka} \cdot f_{grupa}",
        symbol_latex=r"I_{obl}",
        jednostka=_J_A,
        wynik=round(prad_obliczeniowy_a, _ZAOKR),
        limit=round(obciazalnosc_skorygowana_a, _ZAOKR),
        limit_pl=(
            f"I_z = {format_liczba(obciazalnosc_katalogowa_a)} A z karty katalogowej, "
            f"iloczyn współczynników {format_liczba(wspolczynniki.iloczyn)} "
            f"(„{wspolczynniki.etykieta_pl}”)"
        ),
        metoda_wyniku="DEKLARACJA",
        dane_przyjete=_dane_przyjete(wspolczynniki, obciazalnosc_skorygowana_a),
    )
    return ocena_porownania(
        porownanie,
        przedmiot=Przedmiot(
            element_ref=None,
            nazwa_pl="Kabel SN w podglądzie kreatora",
            opis_pl=(
                "Kabel SN o obciążalności katalogowej "
                f"{format_liczba(obciazalnosc_katalogowa_a)} A oceniany w warunkach ułożenia "
                f"„{wspolczynniki.etykieta_pl}”"
            ),
        ),
        podstawa=_PODSTAWA_KRYTERIUM,
        podstawa_limitu=_podstawa_limitu(wspolczynniki),
        zdolnosc=classify_dynamic_capability(ZDOLNOSC_KOREKTY),
        zakres=_ZAKRES,
        niepewnosc=_NIEPEWNOSC,
        odniesienie="network_model/solvers/cable_ampacity_derating.py",
    )
