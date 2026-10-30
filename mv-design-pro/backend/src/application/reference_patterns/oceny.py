"""Rekordy werdyktu wyjaśnialnego wzorców odniesienia (karta WERDYKT-MIGRACJA-190).

Każde sprawdzenie wzorca niesie rekord K (co oceniono, względem jakiego kryterium, wynik,
limit z podstawą, dowód, zakres ważności), a wzorzec — rekord W nad sprawdzeniami
rozstrzygającymi. Kody zastane (``status`` sprawdzenia: PASS/WARN/FAIL/INFO, ``verdict``
wzorca: ZGODNE/GRANICZNE/NIEZGODNE/NIEROZSTRZYGNIETE) są PROJEKCJĄ rekordów:

* ``NIE_SPELNIA`` → ``FAIL`` / ``NIEZGODNE``;
* ``SPELNIA`` z sygnałem ograniczenia (wąskie okno, wielkość powyżej progu ostrzeżenia,
  ryzyko blokady ZSZ w diagnostyce) → ``WARN`` / ``GRANICZNE``;
* ``SPELNIA`` bez ograniczeń → ``PASS`` / ``ZGODNE``;
* ``NIE_DOTYCZY`` i rekord nierozstrzygnięty (brak wielkości, brak podstawy) → ``INFO``
  dla sprawdzenia, ``NIEROZSTRZYGNIETE`` dla wzorca (brak danych ≠ zgodny).

Sygnał ograniczenia jest wyznaczany z TEJ SAMEJ wielkości co rekord (``wynik`` porównania)
albo z rekordu diagnostyki — nigdy z drugiego, niezależnego warunku.

Warstwa INTERPRETACJI — zero fizyki: liczby przychodzą z silnika nastaw albo z wejścia
wzorca, tu wyłącznie porównanie przez pakiet ``werdykt``.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Final, Literal

from solver_input.provenance import classify_dynamic_capability
from werdykt import (
    OcenaKryterium,
    OdnosnikSladu,
    PodstawaWymagania,
    Przedmiot,
    WynikWymagania,
    ZakresWaznosci,
)
from werdykt.porownanie import (
    Porownanie,
    ocena_porownania,
    podstawa_zalozenia,
    rozstrzygniecie,
    wymaganie_z_ocen,
)

from .base import CheckStatus, ReferenceVerdict

ZDOLNOSC_WZORCA_A: Final = "wzorzec_odniesienia.nastawy_i_bis"
ZDOLNOSC_WZORCA_C: Final = "wzorzec_odniesienia.generacja_lokalna"

Wzorzec = Literal["A", "C"]

PODSTAWA_METODYKI_HOPPLA: Final = podstawa_zalozenia(
    "Metodyka doboru nastaw zabezpieczeń nadprądowych zwarciowych linii SN (Hoppel, „Dobór "
    "nastaw zabezpieczeń nadprądowych zwarciowych dla linii SN”; IRiESD) — silnik doboru "
    "nastaw zabezpieczeń programu",
    "k_b · I''k,max(następna strefa) ≤ I>> ≤ min(I''k3,min / k_b; I_th,max / k_bth); cykl SPZ: "
    "I''k,max ≤ s · j_thn / √t_cyklu",
    uwagi_pl=(
        "metodyka z literatury inżynierskiej przyjęta w programie — nie norma; współczynniki "
        "k_b i k_bth z wejścia wzorca"
    ),
)

_DOKUMENT_WZORCA_C: Final = (
    "Wzorzec odniesienia C programu — wpływ generacji lokalnej na zabezpieczenia SN"
)
_UWAGI_WZORCA_C: Final = "progi umowne wzorca diagnostycznego — bez cytatu normy"


def podstawa_wzorca_c(jednostka_redakcyjna: str) -> PodstawaWymagania:
    """Podstawa progu jednego sprawdzenia wzorca C (jawne założenie programu)."""
    return podstawa_zalozenia(_DOKUMENT_WZORCA_C, jednostka_redakcyjna, uwagi_pl=_UWAGI_WZORCA_C)


PODSTAWA_WZORCA_C: Final = podstawa_wzorca_c(
    "progi diagnostyczne sprawdzeń A (zmiana I''k), B (blokada szyn) i C (selektywność)"
)

_ZAKRES_A: Final = ZakresWaznosci(
    rodzaj_analizy="SHORT_CIRCUIT",
    opis_pl=(
        "Wzorzec odniesienia doboru nastawy I>> linii SN — prądy zwarciowe z danych wzorca, "
        "nastawy z silnika metodyki Hoppla"
    ),
    wykluczenia=(
        "nastawa I> (opóźniona) i ogólny test wytrzymałości cieplnej przewodu nie wchodzą "
        "w zakres wzorca",
    ),
)

_ZAKRES_C: Final = ZakresWaznosci(
    rodzaj_analizy="SHORT_CIRCUIT",
    opis_pl=(
        "Wzorzec odniesienia wpływu generacji lokalnej na zabezpieczenia SN — prądy zwarciowe "
        "scenariuszy bez generacji i z generacją maksymalną z danych wzorca"
    ),
    wykluczenia=("diagnostyka nie zastępuje pełnej analizy koordynacji zabezpieczeń",),
)

_ODNIESIENIE: Final[dict[Wzorzec, str]] = {
    "A": "application/reference_patterns/pattern_line_i_doubleprime_thermal_spz.py",
    "C": "application/reference_patterns/wzorzec_c_generacja_lokalna.py",
}


def ocena_sprawdzenia(
    porownanie: Porownanie,
    *,
    wzorzec: Wzorzec,
    element_ref: str,
    nazwa_pl: str,
    krok_sladu: str,
    podstawa: PodstawaWymagania | None = None,
) -> OcenaKryterium:
    """Rekord K jednego sprawdzenia wzorca (przedmiot: linia albo punkt zabezpieczenia)."""
    rozstrzygalny = porownanie.dotyczy and (
        porownanie.spelniony is not None
        if porownanie.relacja == "LOGICZNE"
        else porownanie.wynik is not None
    )
    return ocena_porownania(
        porownanie,
        przedmiot=Przedmiot(element_ref=element_ref, nazwa_pl=nazwa_pl, opis_pl=porownanie.opis_pl),
        podstawa=podstawa or (PODSTAWA_METODYKI_HOPPLA if wzorzec == "A" else PODSTAWA_WZORCA_C),
        zdolnosc=classify_dynamic_capability(
            ZDOLNOSC_WZORCA_A if wzorzec == "A" else ZDOLNOSC_WZORCA_C
        ),
        zakres=_ZAKRES_A if wzorzec == "A" else _ZAKRES_C,
        slad=(
            (OdnosnikSladu(krok=krok_sladu, opis_pl=f"Ślad sprawdzenia: {porownanie.opis_pl}"),)
            if rozstrzygalny
            else ()
        ),
        odniesienie=_ODNIESIENIE[wzorzec],
    )


def status_sprawdzenia(ocena: OcenaKryterium, *, ograniczenie: bool) -> CheckStatus:
    """Kod zastany sprawdzenia — projekcja rekordu (jedno źródło rozstrzygnięcia).

    ``ograniczenie`` nakłada sygnał ostrzeżenia WYŁĄCZNIE na rekord spełniony; rekord
    nierozstrzygnięty albo niestosujący się daje ``INFO`` (znaczenie niesie rekord)."""
    wynik = rozstrzygniecie((ocena,))
    if wynik == "NIE_SPELNIA":
        return "FAIL"
    if wynik == "SPELNIA":
        return "WARN" if ograniczenie else "PASS"
    return "INFO"


def wymaganie_wzorca(
    *,
    wzorzec: Wzorzec,
    wymaganie_id: str,
    nazwa_pl: str,
    oceny: Sequence[OcenaKryterium],
) -> WynikWymagania:
    """Rekord W wzorca nad sprawdzeniami rozstrzygającymi (agregacja §2.3 kontraktu)."""
    return wymaganie_z_ocen(
        wymaganie_id=wymaganie_id,
        nazwa_pl=nazwa_pl,
        podstawa=PODSTAWA_METODYKI_HOPPLA if wzorzec == "A" else PODSTAWA_WZORCA_C,
        oceny=oceny,
        zdolnosc=classify_dynamic_capability(
            ZDOLNOSC_WZORCA_A if wzorzec == "A" else ZDOLNOSC_WZORCA_C
        ),
        zakres=_ZAKRES_A if wzorzec == "A" else _ZAKRES_C,
        odniesienie=_ODNIESIENIE[wzorzec],
        powod_stosowalnosci_pl="wzorzec odniesienia uruchomiony na danych przypadku",
    )


def werdykt_wzorca(
    oceny: Sequence[OcenaKryterium], *, ograniczenia: Sequence[str]
) -> ReferenceVerdict:
    """Kod zastany wzorca — projekcja rozstrzygnięcia rekordów składowych rekordu W;
    ``ograniczenia`` (zdania sygnałów ograniczenia) obniżają spełnienie do ``GRANICZNE``."""
    wynik = rozstrzygniecie(oceny)
    if wynik is None:
        return "NIEROZSTRZYGNIETE"
    if wynik == "NIE_SPELNIA":
        return "NIEZGODNE"
    return "GRANICZNE" if ograniczenia else "ZGODNE"


def opis_werdyktu(
    wymaganie: WynikWymagania, werdykt: ReferenceVerdict, ograniczenia: Sequence[str]
) -> str:
    """Opis werdyktu wzorca: zdanie rekordu W, a przy spełnieniu z ograniczeniami
    (``GRANICZNE``) — zdania sygnałów ograniczenia (wąskie okno, próg ostrzeżenia,
    diagnostyka)."""
    if werdykt != "GRANICZNE":
        return wymaganie.wyjasnienie.zdanie_pl
    return f"{wymaganie.wyjasnienie.zdanie_pl} Ograniczenia: {'; '.join(ograniczenia)}."
