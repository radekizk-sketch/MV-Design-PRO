"""Rekordy werdyktu wyjaśnialnego adekwatności mocy biernej (karta WERDYKT-MIGRACJA-190, domena 6).

Wymaganie „rezerwa mocy biernej wystarcza do podtrzymania napięcia” to rekord W złożony
z rekordów K:

- rezerwa w górę ``ΔQ↑ = Q_max − Q_akt`` i rezerwa w dół ``ΔQ↓ = Q_akt − Q_min`` każdego
  regulowalnego źródła, każda nie mniejsza od tolerancji nasycenia ε (``NIE_MNIEJ``) —
  źródło NASYCONE ⇔ rekord kierunku ``NIE_SPELNIA`` (jedno źródło prawdy: rekord; dawny
  warunek ``ΔQ ≤ ε`` w builderze zniknął);
- napięcie |V| każdego rozwiązanego węzła w paśmie ``[U_min; U_max]`` (``PASMO``) — naruszenie
  pasma ⇔ rekord ``NIE_SPELNIA``.

Kody zastane widoku (``verdict``, ``is_adequate``) są PROJEKCJĄ rozstrzygnięcia rekordów
(``rozstrzygniecie``): naruszenie którejkolwiek składowej → „rezerwa Q wyczerpana”, wszystkie
spełnione → „wystarczająca rezerwa Q”, którakolwiek nierozstrzygnięta (brak Q_akt, Q_min,
Q_max, rozpływ niezbieżny, brak źródła, brak napięć) → „dane niekompletne” — brak danych
nigdy nie jest spełnieniem.

Warstwa ANALIZY — zero fizyki: rezerwy i napięcia przychodzą z buildera (różnice gotowych
liczb z wyniku rozpływu i karty regulatora), tu wyłącznie porównanie z progiem przez pakiet
``werdykt``.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Final, Literal

from analysis.normative.kryteria_napiecia import KRYTERIUM_OSTRZEZENIE_PODSTAWA_PL
from solver_input.provenance import classify_dynamic_capability
from werdykt import (
    DanaPrzyjeta,
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
    wymaganie_z_ocen,
)

ZDOLNOSC_ADEKWATNOSCI_Q: Final = "adekwatnosc_q.rezerwa_i_pasmo"

Kierunek = Literal["gora", "dol"]

_ODNIESIENIE: Final = "analysis/reactive_adequacy/builder.py"

PODSTAWA_TOLERANCJI: Final = podstawa_zalozenia(
    "Analiza adekwatności mocy biernej programu (wsparcie napięciowe źródeł wg ENTSO-E "
    "NC RfG art. 20–21 i IEEE 1547 — zdolność regulacji mocy biernej w granicach Q_min…Q_max)",
    "tolerancja nasycenia regulatora ε — rezerwa mniejsza od ε oznacza źródło przy granicy "
    "zakresu regulacji",
    uwagi_pl=(
        "ε jest liczbową tolerancją „blisko granicy” (domyślnie 0,001 Mvar), parametrem "
        "analizy, a nie wartością normową"
    ),
)

PODSTAWA_PASMA_DOMYSLNEGO: Final = podstawa_zalozenia(
    "Kryteria napięciowe SN programu (profil napięć i ocena normatywna)",
    "próg ostrzeżenia ± 5 % Un — pasmo domyślne węzła bez własnego pasma w modelu",
    uwagi_pl=KRYTERIUM_OSTRZEZENIE_PODSTAWA_PL,
)

PODSTAWA_PASMA_WEZLA: Final = podstawa_zalozenia(
    "Pasmo napięcia węzła zapisane w modelu sieci (limity węzła)",
    "napięcie minimalne i maksymalne węzła w jednostkach względnych",
    uwagi_pl="pasmo wprowadzone przez projektanta dla tego węzła zastępuje pasmo domyślne",
)

_PODSTAWA_WYMAGANIA: Final = podstawa_zalozenia(
    "Analiza adekwatności mocy biernej programu",
    "rezerwa regulacyjna mocy biernej każdego źródła nie mniejsza od tolerancji nasycenia "
    "i napięcie każdego rozwiązanego węzła w paśmie dopuszczalnym",
    uwagi_pl=(
        "wymaganie złożone ze składowych: rezerwa w górę i w dół każdego regulowalnego źródła "
        "oraz pasmo napięcia każdego węzła rozwiązanego w rozpływie"
    ),
)

_ZAKRES: Final = ZakresWaznosci(
    rodzaj_analizy="POWER_FLOW",
    opis_pl=(
        "Stan ustalony z biegu rozpływu mocy (moc bierna źródeł i napięcia węzłów) wobec granic "
        "regulatora mocy biernej z karty źródła i pasma napięcia węzłów"
    ),
    wykluczenia=(
        "inne stany pracy sieci niż zapisany w biegu rozpływu (obciążenie, generacja, "
        "położenie łączników)",
        "dynamika regulatorów napięcia i mocy biernej — ocena dotyczy stanu ustalonego",
        "węzły nierozwiązane w rozpływie (bez zasilania) — poza oceną pasma napięcia",
    ),
)

_DEFINICJA_REZERWY: Final[dict[Kierunek, tuple[str, str, str, str, str]]] = {
    # (kryterium_id, opis, wielkość, symbol, opis przedmiotu)
    "gora": (
        "adekwatnosc_q.rezerwa_w_gore",
        "Rezerwa mocy biernej źródła do wstrzykiwania (Q_max − Q_akt) nie mniejsza od "
        "tolerancji nasycenia",
        "rezerwa mocy biernej w górę ΔQ↑ = Q_max − Q_akt",
        r"\Delta Q_{\uparrow}",
        "Regulowalne źródło mocy biernej — kierunek wstrzykiwania (podtrzymanie napięcia)",
    ),
    "dol": (
        "adekwatnosc_q.rezerwa_w_dol",
        "Rezerwa mocy biernej źródła do absorpcji (Q_akt − Q_min) nie mniejsza od tolerancji "
        "nasycenia",
        "rezerwa mocy biernej w dół ΔQ↓ = Q_akt − Q_min",
        r"\Delta Q_{\downarrow}",
        "Regulowalne źródło mocy biernej — kierunek absorpcji (obniżenie napięcia)",
    ),
}


def ocena_rezerwy(
    *,
    kierunek: Kierunek,
    nazwa_pl: str,
    element_ref: str,
    rezerwa_mvar: float | None,
    tolerancja_mvar: float,
    braki: Sequence[str] = (),
    dane_przyjete: Sequence[DanaPrzyjeta] = (),
) -> OcenaKryterium:
    """Rekord K rezerwy mocy biernej źródła w jednym kierunku. ``rezerwa_mvar is None`` —
    rezerwy nie wyznaczono (``braki`` nazywają brak; reguła daje ``NIE_OCENIONO``)."""
    kryterium_id, opis_pl, wielkosc_pl, symbol, opis_przedmiotu = _DEFINICJA_REZERWY[kierunek]
    return ocena_porownania(
        Porownanie(
            # Identyfikator kryterium składowego unikalny w rekordzie W: kryterium.obiekt.
            kryterium_id=f"{kryterium_id}.{element_ref}",
            opis_pl=opis_pl,
            relacja="NIE_MNIEJ",
            wielkosc_pl=wielkosc_pl,
            warunek_latex=rf"{symbol} \ge \varepsilon",
            symbol_latex=symbol,
            jednostka="Mvar",
            wynik=rezerwa_mvar,
            limit=tolerancja_mvar,
            limit_pl="tolerancja nasycenia regulatora ε",
            braki=tuple(braki),
            dane_przyjete=tuple(dane_przyjete),
        ),
        przedmiot=Przedmiot(element_ref=element_ref, nazwa_pl=nazwa_pl, opis_pl=opis_przedmiotu),
        podstawa=PODSTAWA_TOLERANCJI,
        zdolnosc=classify_dynamic_capability(ZDOLNOSC_ADEKWATNOSCI_Q),
        zakres=_ZAKRES,
        slad=(
            ()
            if rezerwa_mvar is None
            else (
                OdnosnikSladu(
                    krok=f"reactive_adequacy.rezerwa_{kierunek}",
                    opis_pl="Wywód rezerwy mocy biernej źródła (wzór, podstawienie, wynik)",
                ),
            )
        ),
        odniesienie=_ODNIESIENIE,
    )


def ocena_pasma(
    *,
    nazwa_pl: str,
    element_ref: str | None,
    v_pu: float | None,
    pasmo_pu: tuple[float, float],
    podstawa: PodstawaWymagania,
    braki: Sequence[str] = (),
) -> OcenaKryterium:
    """Rekord K napięcia węzła w paśmie ``[U_min; U_max]`` p.u. (``v_pu is None`` — napięcia
    nie wyznaczono, ``braki`` nazywają przyczynę)."""
    return ocena_porownania(
        Porownanie(
            kryterium_id=(
                "adekwatnosc_q.pasmo_napiecia"
                if element_ref is None
                else f"adekwatnosc_q.pasmo_napiecia.{element_ref}"
            ),
            opis_pl="Napięcie węzła w paśmie dopuszczalnym [U_min; U_max]",
            relacja="PASMO",
            wielkosc_pl="moduł napięcia węzła |V| z biegu rozpływu mocy",
            warunek_latex=r"U_{min} \le |V| \le U_{max}",
            symbol_latex="|V|",
            jednostka="p.u. (U_n)",
            wynik=v_pu,
            pasmo=pasmo_pu,
            limit_pl="pasmo napięcia węzła",
            braki=tuple(braki),
        ),
        przedmiot=Przedmiot(
            element_ref=element_ref,
            nazwa_pl=nazwa_pl,
            opis_pl="Węzeł sieci rozwiązany w biegu rozpływu mocy",
        ),
        podstawa=podstawa,
        zdolnosc=classify_dynamic_capability(ZDOLNOSC_ADEKWATNOSCI_Q),
        zakres=_ZAKRES,
        slad=(
            ()
            if v_pu is None
            else (
                OdnosnikSladu(
                    krok="reactive_adequacy.pasmo_napiecia",
                    opis_pl="Napięcie węzła z biegu rozpływu wobec pasma dopuszczalnego",
                ),
            )
        ),
        odniesienie=_ODNIESIENIE,
    )


def ocena_braku_zrodla(*, powod_pl: str) -> OcenaKryterium:
    """Rekord K rezerwy systemu, gdy żadne regulowalne źródło nie wchodzi do oceny — rezerwy
    nie ma z czego wyznaczyć (``NIE_OCENIONO``; brak źródła ≠ wystarczająca rezerwa)."""
    return ocena_porownania(
        Porownanie(
            kryterium_id="adekwatnosc_q.rezerwa_systemu",
            opis_pl=(
                "Rezerwa mocy biernej regulowalnych źródeł sieci nie mniejsza od tolerancji "
                "nasycenia"
            ),
            relacja="NIE_MNIEJ",
            wielkosc_pl="rezerwa mocy biernej regulowalnych źródeł sieci",
            warunek_latex=r"\sum \Delta Q \ge \varepsilon",
            symbol_latex=r"\sum \Delta Q",
            jednostka="Mvar",
            wynik=None,
            braki=(powod_pl,),
        ),
        przedmiot=Przedmiot(
            element_ref=None,
            nazwa_pl="Sieć biegu rozpływu",
            opis_pl="Zbiór regulowalnych źródeł mocy biernej sieci",
        ),
        podstawa=PODSTAWA_TOLERANCJI,
        zdolnosc=classify_dynamic_capability(ZDOLNOSC_ADEKWATNOSCI_Q),
        zakres=_ZAKRES,
        odniesienie=_ODNIESIENIE,
    )


def wymaganie_adekwatnosci(
    oceny: Sequence[OcenaKryterium], *, braki: Sequence[str] = ()
) -> WynikWymagania:
    """Rekord W adekwatności mocy biernej nad wszystkimi składowymi."""
    return wymaganie_z_ocen(
        wymaganie_id="adekwatnosc_q",
        nazwa_pl="Adekwatność rezerwy mocy biernej do podtrzymania napięcia",
        podstawa=_PODSTAWA_WYMAGANIA,
        oceny=oceny,
        zdolnosc=classify_dynamic_capability(ZDOLNOSC_ADEKWATNOSCI_Q),
        zakres=_ZAKRES,
        odniesienie=_ODNIESIENIE,
        braki=braki,
    )
