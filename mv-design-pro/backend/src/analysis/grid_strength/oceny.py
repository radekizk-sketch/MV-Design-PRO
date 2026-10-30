"""Rekordy werdyktu wyjaśnialnego siły sieci SCR/WSCR (karta WERDYKT-MIGRACJA-190, domena 6).

Każdy węzeł przyłączenia źródeł falownikowych i wskaźnik WSCR zbioru źródeł niesie rekord K:
wskaźnik (SCR albo WSCR) wobec progu sieci słabej z podstawą, margines, dowód (moc zwarciowa
z solvera IEC 60909, dane przyjęte gałęzi, jeśli S_sc'' na nich stoi) i zakres ważności. Kody
zastane (``verdict`` — klasa siły sieci, ``is_weak``) są PROJEKCJĄ rekordu: sieć słaba ⇔
rekord ``NIE_SPELNIA``; „bardzo słaba” to stopień tej samej wielkości wobec drugiego progu
(tylko przy rekordzie niespełnionym); rekord nierozstrzygnięty (brak S_sc'' albo S_n) daje
„brak danych” — nigdy „mocna”.

Warstwa ANALIZY — zero fizyki: SCR/WSCR przychodzą z buildera (iloraz gotowych mocy), tu tylko
porównanie z progiem przez pakiet ``werdykt``.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Final, Literal

from analysis.grid_strength.models import (
    VERDICT_NO_DATA,
    VERDICT_STRONG,
    VERDICT_VERY_WEAK,
    VERDICT_WEAK,
)
from solver_input.provenance import classify_dynamic_capability
from werdykt import DanaPrzyjeta, OcenaKryterium, OdnosnikSladu, Przedmiot, ZakresWaznosci
from werdykt.porownanie import Porownanie, ocena_porownania, podstawa_zalozenia, rozstrzygniecie

ZDOLNOSC_SILY_SIECI: Final = "sila_sieci.scr_wscr"

Wskaznik = Literal["SCR", "WSCR"]

_PODSTAWA: Final = podstawa_zalozenia(
    "IEEE Std 1204-1997 (Guide for Planning DC Links Terminating at AC Locations Having Low "
    "Short-Circuit Capacities); CIGRE TB 671 (źródła falownikowe w sieci słabej); metodyka "
    "ERCOT dla WSCR",
    "klasyfikacja siły sieci: SCR ≥ 3 — sieć mocna, 2 ≤ SCR < 3 — słaba, SCR < 2 — bardzo " "słaba",
    uwagi_pl=(
        "klasyfikacja przewodnika IEEE dla łączy prądu stałego przeniesiona na źródła "
        "falownikowe jako założenie inżynierskie programu; progi parametryzowalne w analizie"
    ),
)

_ZAKRES: Final = ZakresWaznosci(
    rodzaj_analizy="SHORT_CIRCUIT",
    opis_pl=(
        "Moc zwarciowa S_sc'' w węźle z biegu zwarciowego IEC 60909 wobec mocy zainstalowanej "
        "źródeł falownikowych przyłączonych do węzła (stan modelu biegu)"
    ),
    wykluczenia=(
        "stabilność dynamiczna regulatorów i interakcje źródeł — SCR jest wskaźnikiem "
        "przesiewowym, nie analizą stabilności",
        "inne konfiguracje sieci niż zapisana w modelu biegu zwarciowego",
    ),
)

_DEFINICJA: Final[dict[Wskaznik, tuple[str, str, str, str]]] = {
    # (kryterium_id, opis, wielkosc, symbol)
    "SCR": (
        "sila_sieci.scr_wezla",
        "Stosunek mocy zwarciowej węzła do mocy zainstalowanej źródeł falownikowych nie "
        "mniejszy od progu sieci słabej",
        "wskaźnik siły sieci SCR w węźle przyłączenia",
        r"\mathrm{SCR}",
    ),
    "WSCR": (
        "sila_sieci.wscr",
        "Ważony wskaźnik siły sieci zbioru źródeł falownikowych nie mniejszy od progu sieci "
        "słabej",
        "ważony wskaźnik siły sieci WSCR zbioru źródeł",
        r"\mathrm{WSCR}",
    ),
}


def ocena_sily(
    *,
    wskaznik: Wskaznik,
    nazwa_pl: str,
    element_ref: str | None,
    wartosc: float | None,
    prog_slaby: float,
    braki: Sequence[str] = (),
    dane_przyjete: Sequence[DanaPrzyjeta] = (),
) -> OcenaKryterium:
    """Rekord K wskaźnika siły sieci. ``wartosc is None`` — wskaźnika nie wyznaczono
    (``braki`` nazywają brak; reguła daje ``NIE_OCENIONO``, nigdy spełnienie)."""
    kryterium_id, opis_pl, wielkosc_pl, symbol = _DEFINICJA[wskaznik]
    return ocena_porownania(
        Porownanie(
            kryterium_id=kryterium_id,
            opis_pl=opis_pl,
            relacja="NIE_MNIEJ",
            wielkosc_pl=wielkosc_pl,
            warunek_latex=rf"{symbol} \ge {symbol}_{{\text{{słaba}}}}",
            symbol_latex=symbol,
            jednostka="1",
            wynik=wartosc,
            limit=prog_slaby,
            limit_pl="próg sieci słabej",
            braki=tuple(braki),
            dane_przyjete=tuple(dane_przyjete),
        ),
        przedmiot=Przedmiot(
            element_ref=element_ref,
            nazwa_pl=nazwa_pl,
            opis_pl=(
                "Węzeł przyłączenia źródeł falownikowych"
                if wskaznik == "SCR"
                else "Zbiór węzłów przyłączenia źródeł falownikowych z kompletem danych"
            ),
        ),
        podstawa=_PODSTAWA,
        zdolnosc=classify_dynamic_capability(ZDOLNOSC_SILY_SIECI),
        zakres=_ZAKRES,
        dane_przyjete=tuple(dane_przyjete),
        slad=(
            ()
            if wartosc is None
            else (
                OdnosnikSladu(
                    krok=f"grid_strength.{wskaznik.lower()}",
                    opis_pl=f"Wywód wskaźnika {wskaznik} (wzór, podstawienie, wynik, progi)",
                ),
            )
        ),
        odniesienie="analysis/grid_strength/builder.py",
    )


def klasa_sily(
    ocena: OcenaKryterium, *, wartosc: float | None, prog_bardzo_slaby: float
) -> tuple[str, bool]:
    """Kody zastane ``(verdict, is_weak)`` — projekcja rekordu. Stopień „bardzo słaba” czyta
    TĘ SAMĄ wielkość co rekord, wyłącznie przy rekordzie niespełnionym."""
    wynik = rozstrzygniecie((ocena,))
    if wynik is None:
        return VERDICT_NO_DATA, False
    if wynik == "SPELNIA":
        return VERDICT_STRONG, False
    if wartosc is not None and wartosc < prog_bardzo_slaby:
        return VERDICT_VERY_WEAK, True
    return VERDICT_WEAK, True
