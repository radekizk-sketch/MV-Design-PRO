"""Rekordy werdyktu wyjaśnialnego pasm wiarygodności wyniku (karta WERDYKT-MIGRACJA-190).

Pasmo wiarygodności nie jest oceną zgodności projektu, tylko kryterium WIARYGODNOŚCI liczby
z solvera (czy wynik jest fizycznie możliwy, zanim trafi do pakietu OSD). Mimo to stan
„w paśmie / poza zakresem / dane niekompletne” jest statusem i — jak każdy status produktu —
musi nieść rekord: co oceniono, wobec jakiego pasma, z jaką podstawą, z jakim marginesem.
Kod zastany (``CREDIBLE`` / ``OUT_OF_RANGE`` / ``INCOMPLETE``) jest PROJEKCJĄ tego rekordu.

Warstwa ANALIZY — zero fizyki: wielkości przychodzą gotowe z wyniku solvera.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Final, Literal

from solver_input.provenance import classify_dynamic_capability
from werdykt import (
    DanaPrzyjeta,
    OcenaKryterium,
    OdnosnikSladu,
    PodstawaWymagania,
    Przedmiot,
    Relacja,
    ZakresWaznosci,
)
from werdykt.porownanie import (
    Porownanie,
    ocena_porownania,
    podstawa_normy,
    podstawa_zalozenia,
    projekcja_statusu,
)

ZDOLNOSC_PASM: Final = "wiarygodnosc.pasma_wyniku"

#: Kody zastane trójstanu wiarygodności (jedno miejsce — ``short_circuit_bounds`` je eksportuje).
CREDIBLE: Final = "w paśmie wiarygodności"
OUT_OF_RANGE: Final = "poza zakresem wiarygodności"
INCOMPLETE: Final = "dane niekompletne"

_DOKUMENT_PASM: Final = "Pasma wiarygodności wyniku solvera (bramka zdrowego rozsądku programu)"

PODSTAWA_PASMA_IKSS: Final = podstawa_zalozenia(
    _DOKUMENT_PASM,
    "prąd zwarciowy początkowy Ik'' per poziom napięcia węzła",
    uwagi_pl=(
        "granice z typowych wytrzymałości zwarciowych aparatury poziomu napięcia "
        "(nN do 150 kA, SN do 50 kA, WN do 63 kA, NN do 80 kA); dolna granica > 0 kA"
    ),
)
PODSTAWA_PASMA_NAPIECIA: Final = podstawa_normy(
    "PN-EN 50160 (Parametry napięcia zasilającego w publicznych sieciach elektroenergetycznych)",
    "2010",
    "4.2.2 i 5.2.2 — zmiany napięcia zasilającego w warunkach normalnej pracy: Un ± 10 %",
    uwagi_pl="pasmo użyte jako granica wiarygodności wyniku rozpływu, nie kryterium projektowe",
)
PODSTAWA_PASMA_OBCIAZENIA: Final = podstawa_zalozenia(
    _DOKUMENT_PASM,
    "obciążenie gałęzi — prąd zacisku nie większy od prądu znamionowego zacisku",
    uwagi_pl=(
        "prąd znamionowy linii i kabla z obciążalności typu katalogowego, transformatora "
        "z S_n i U_n strony"
    ),
)


def liczba_pl(wartosc: float, format_: str) -> str:
    """Liczba w zdaniu dla inżyniera: ustalona precyzja (przenośność między maszynami) i
    przecinek dziesiętny (język polski) — jedno miejsce formatu dla wszystkich pasm."""
    return format(wartosc, format_).replace(".", ",")


def podstawa_pasma_strat(uzasadnienie_pl: str) -> PodstawaWymagania:
    """Podstawa progu strat (założenie z uzasadnieniem inżynierskim modułu rozpływu)."""
    return podstawa_zalozenia(
        _DOKUMENT_PASM,
        "straty czynne sieci odniesione do sumy mocy czynnej odbiorów",
        uwagi_pl=uzasadnienie_pl,
    )


def ocena_pasma(
    *,
    kryterium_id: str,
    opis_pl: str,
    warunek_latex: str,
    wielkosc_pl: str,
    symbol_latex: str,
    jednostka: str,
    relacja: Relacja,
    wynik: float | None,
    nazwa_pl: str,
    opis_przedmiotu_pl: str,
    podstawa: PodstawaWymagania,
    rodzaj_analizy: Literal["SHORT_CIRCUIT", "POWER_FLOW"],
    limit: float | None = None,
    pasmo: tuple[float, float] | None = None,
    braki: tuple[str, ...] = (),
    dane_przyjete: Sequence[DanaPrzyjeta] = (),
) -> OcenaKryterium:
    """Rekord K wielkości wobec pasma (``pasmo``) albo granicy jednostronnej (``limit``).

    ``wynik is None`` — wielkości nie wyznaczono, ``braki`` nazywają przyczynę (reguła daje
    ``NIE_OCENIONO``; brak danych ≠ wiarygodny). ``dane_przyjete`` — wartości robocze, na
    których stoi wynik (``ESTIMATED`` → dowód niepełny).
    """
    return ocena_porownania(
        Porownanie(
            kryterium_id=kryterium_id,
            opis_pl=opis_pl,
            warunek_latex=warunek_latex,
            relacja=relacja,
            wielkosc_pl=wielkosc_pl,
            symbol_latex=symbol_latex,
            jednostka=jednostka,
            wynik=wynik,
            limit=limit,
            pasmo=pasmo,
            limit_pl="pasmo wiarygodności wyniku solvera",
            braki=braki,
        ),
        przedmiot=Przedmiot(element_ref=None, nazwa_pl=nazwa_pl, opis_pl=opis_przedmiotu_pl),
        podstawa=podstawa,
        zdolnosc=classify_dynamic_capability(ZDOLNOSC_PASM),
        zakres=ZakresWaznosci(
            rodzaj_analizy=rodzaj_analizy,
            opis_pl=(
                "Jeden bieg obliczeń na modelu zapisanym w chwili biegu; pasmo ocenia, czy "
                "liczba jest fizycznie możliwa, nie czy projekt spełnia wymagania."
            ),
            wykluczenia=("ocena zgodności projektowej (osobne kryteria analiz)",),
        ),
        dane_przyjete=dane_przyjete,
        slad=(
            ()
            if wynik is None
            else (
                OdnosnikSladu(
                    krok=f"pasmo_wiarygodnosci.{kryterium_id}",
                    opis_pl="Wielkość wyniku solvera porównana z pasmem wiarygodności",
                ),
            )
        ),
        odniesienie="analysis/sanity_bounds",
    )


def kod_wiarygodnosci(ocena: OcenaKryterium) -> str:
    """Kod trójstanu — projekcja rekordu (jedno źródło rozstrzygnięcia)."""
    return projekcja_statusu(
        (ocena,), spelnia=CREDIBLE, nie_spelnia=OUT_OF_RANGE, nierozstrzygniete=INCOMPLETE
    )
