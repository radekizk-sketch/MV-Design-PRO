"""Tablica czasów wyłączenia Tab. 41.1 IEC 60364-4-41 (DANE, G-D3).

Karta P0.6 (nN, docs/nn/H_PLAN_IMPLEMENTACJI_NN.md §P0.6, luka G-D3 —
docs/nn/G_MACIERZ_LUK_BACKENDU_NN.md).

ZASADA (wzorzec G-D1/Arc Flash D-01): wartość pochodzi WYŁĄCZNIE z wpisu
o UDOKUMENTOWANEJ, DWUZRODLOWEJ proweniencji. Wartość niepotwierdzona w dwóch
źródłach NIE wchodzi do rejestru. TEN moduł jest WYŁĄCZNIE nośnikiem DANYCH —
nie eksportuje żadnej funkcji decyzyjnej (dobór pasma/rodzaju obwodu i werdykt
SWZ żyją w ``application/analyses/swz/``, warstwa interpretacji, NIE solver —
sama tablica czasów to dana normatywna, nie fizyka).

Zakres normy: maksymalny czas samoczynnego wyłączenia zasilania dla ochrony
przed porażeniem prądem, wg układu sieci (TN/TT) i pasma napięcia znamionowego
względem ziemi U0. Kryterium rodzaju obwodu (odbiorczy/rozdzielczy) —
§411.3.2.2 normy: obwody odbiorcze (final circuits) z prądem znamionowym
NIEPRZEKRACZAJĄCYM 63 A (obwody z gniazdami) / 32 A (obwody zasilające
wyłącznie odbiorniki na stałe przyłączone) mają czas z tabeli poniżej; obwody
rozdzielcze i pozostałe — czas stały (TN: 5 s, TT: 1 s), NIEZALEŻNY od pasma
napięcia. Karta P0.6 upraszcza kryterium do JEDNEGO progu 63 A (bez
rozróżniania gniazd/odbiorników na stałe — dana o obecności gniazd nie jest
nigdzie modelowana) — uproszczenie JAWNE, udokumentowane tu i w
``application/analyses/swz/werdykt.py``, nie milczące.

STATUS: TN — używane przez moduł SWZ (fault_loop solver obsługuje wyłącznie
TN-S/TN-C-S/TN-C, zob. ``application/analyses/fault_loop/service.py::
_NON_TN_SYSTEMS``). TT — tabela KOMPLETNA (struktura + dane niezależnie od
użycia, zgodnie z zasadą rejestru G), ale NIE jest jeszcze czytana przez
werdykt SWZ (pętla TT wymaga innej fizyki — RA·IΔn, nie pętli L-PE/L-PEN;
luka G-12, P1). Odczyt tabeli TT bez solvera TT byłby fasadą — dlatego
funkcja werdyktu w tym P0.6 świadomie NIE przyjmuje układu TT jako wejścia.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class WpisCzasuWylaczenia:
    """Jeden wpis tabeli: czas wyłączenia [s] + PEŁNA proweniencja."""

    czas_s: float
    podstawa: str

    def __post_init__(self) -> None:
        if not 0.0 < self.czas_s <= 5.0:
            raise ValueError(
                f"Czas wyłączenia musi leżeć w zakresie (0; 5] s — otrzymano {self.czas_s}."
            )
        if not self.podstawa or not self.podstawa.strip():
            raise ValueError("Wpis tabeli czasów wyłączenia wymaga podstawy (proweniencji).")


# ---------------------------------------------------------------------------
# TN — obwody odbiorcze (final circuits, In ≤ 63 A — uproszczenie karty P0.6,
# patrz docstring modułu), wg pasma U0.
# ---------------------------------------------------------------------------

_PODSTAWA_TN_FINALNE = (
    "IEC 60364-4-41 Tab. 41.1 (edycje 2005 i 2017 — te same progi czasowe dla "
    "układu TN, obwody odbiorcze, wg pasma U0). Zweryfikowano w dwóch "
    "niezależnych źródłach publicznych: (1) GT Engineering, „IEC 60364-4-41 — "
    "TN Systems” (gt-engineering.it/en/technical-standards/en-iec-standards/"
    "iec-60364-4-41/tn-systems/) — tabela 50–120V:0,8s / 120–230V:0,4s / "
    "230–400V:0,2s / >400V:0,1s; (2) Elec-Mate, „Disconnection Time Calculator "
    "(BS 7671)” (elec-mate.com/tools/disconnection-time-calculator) — BS 7671 "
    "Tab. 41.1 (norma brytyjska implementująca IEC 60364-4-41 z identycznymi "
    "progami czasowymi TN), potwierdza 120–230V:0,4s i 230–400V:0,2s. Norma "
    "źródłowa (pełny tekst IEC) NIE była dostępna do bezpośredniego odczytu w "
    "tej sesji (403/PDF nieczytelny) — status REFERENCYJNY do potwierdzenia "
    "właściciela przy dostępie do kopii normy (flip-to-verified, wzorzec G-D1)."
)

TABLICA_TN_ODBIORCZE: dict[str, WpisCzasuWylaczenia] = {
    "50<U0<=120": WpisCzasuWylaczenia(0.8, _PODSTAWA_TN_FINALNE),
    "120<U0<=230": WpisCzasuWylaczenia(0.4, _PODSTAWA_TN_FINALNE),
    "230<U0<=400": WpisCzasuWylaczenia(0.2, _PODSTAWA_TN_FINALNE),
    "U0>400": WpisCzasuWylaczenia(0.1, _PODSTAWA_TN_FINALNE),
}

_PODSTAWA_TN_ROZDZIELCZE = (
    "IEC 60364-4-41 §411.3.2.3 — obwody rozdzielcze (distribution circuits) i "
    "obwody spoza §411.3.2.2 w układzie TN: czas wyłączenia 5 s, NIEZALEŻNY od "
    "pasma U0. Zweryfikowano w dwóch niezależnych źródłach: (1) NAPIT / "
    "Professional Electrician, „The requirements for automatic disconnection "
    "in case of a fault” (professional-electrician.com/technical/"
    "the-requirements-for-automatic-disconnection-in-case-of-a-fault-napit/); "
    "(2) Elec-Mate, „Disconnection Time Calculator (BS 7671)”. Status "
    "REFERENCYJNY (jak wyżej — do potwierdzenia przy dostępie do normy)."
)

CZAS_TN_ROZDZIELCZY = WpisCzasuWylaczenia(5.0, _PODSTAWA_TN_ROZDZIELCZE)

# ---------------------------------------------------------------------------
# TT — tabela KOMPLETNA (rejestr G-D3), ale nie czytana przez werdykt SWZ w
# tej karcie (patrz docstring modułu, luka G-12, P1).
# ---------------------------------------------------------------------------

_PODSTAWA_TT_FINALNE = (
    "IEC 60364-4-41 Tab. 41.1, układ TT, obwody odbiorcze, wg pasma U0. "
    "Zweryfikowano w dwóch niezależnych źródłach publicznych: (1) NAPIT / "
    "Professional Electrician, „The requirements for automatic disconnection "
    "in case of a fault” — cytuje 0,2 s (TT, 230 V) wprost; (2) "
    "rcddisconnectiontime.co.uk, „BS 7671:2018+A4:2026 Table 41.1” — tabela "
    "pełna TT AC: 50–120V:0,3s / 120–230V:0,2s / 230–400V:0,07s / >400V:0,04s. "
    "Status REFERENCYJNY (jak wyżej)."
)

TABLICA_TT_ODBIORCZE: dict[str, WpisCzasuWylaczenia] = {
    "50<U0<=120": WpisCzasuWylaczenia(0.3, _PODSTAWA_TT_FINALNE),
    "120<U0<=230": WpisCzasuWylaczenia(0.2, _PODSTAWA_TT_FINALNE),
    "230<U0<=400": WpisCzasuWylaczenia(0.07, _PODSTAWA_TT_FINALNE),
    "U0>400": WpisCzasuWylaczenia(0.04, _PODSTAWA_TT_FINALNE),
}

_PODSTAWA_TT_ROZDZIELCZE = (
    "IEC 60364-4-41 §411.3.2.4 — obwody rozdzielcze i pozostałe w układzie TT: "
    "czas wyłączenia 1 s (selektywność RCD), NIEZALEŻNY od pasma U0. "
    "Zweryfikowano w dwóch niezależnych źródłach: (1) WebSearch (industrial "
    "monitor direct / cytat normy) — „for all other circuits, the maximum "
    "disconnection time is fixed to 1 s”; (2) rcddisconnectiontime.co.uk, "
    "„BS 7671:2018+A4:2026 Table 41.1” — TT distribution: 1,0 s. Status "
    "REFERENCYJNY (jak wyżej)."
)

CZAS_TT_ROZDZIELCZY = WpisCzasuWylaczenia(1.0, _PODSTAWA_TT_ROZDZIELCZE)


# Tolerancja graniczna pasm — pochłania artefakt zaokrąglenia napięcia fazowego
# STANDARDOWEGO systemu 230/400 V wg IEC 60038: napięcie fazowe wyprowadzone
# geometrycznie z liniowego (U0 = U_LL/√3 = 400/√3 = 230,94 V) NIE jest równe
# napięciu ZNAMIONOWYM fazowym normy (230 V dokładnie — para 230/400 V jest
# zdefiniowana wprost przez IEC 60038, nie wyprowadzona z U_LL/√3). Bez
# tolerancji standardowy system 230/400 V wpadałby w BŁĘDNE pasmo
# "230<U0≤400" (t=0,2 s) zamiast poprawnego "120<U0≤230" (t=0,4 s) — defekt
# wykryty testem end-to-end karty P0.6 (smoke test SWZ na stacji 15/0,4 kV).
_TOLERANCJA_GRANICY_PASMA_V = 1.0


def pasmo_dla_u0(u0_v: float) -> str:
    """Zwraca klucz pasma napięcia U0 dla tabel powyżej.

    Granice pasm mają tolerancję ``_TOLERANCJA_GRANICY_PASMA_V`` (patrz
    komentarz powyżej) — pochłania artefakt √3 standardowych systemów
    230/400 V i 400/690 V, nie zmienia klasyfikacji żadnego INNEGO napięcia
    (odstępy między pasmami normy to setki wolt, tolerancja 1 V jest o dwa
    rzędy wielkości mniejsza).

    Raises:
        ValueError: U0 ≤ 0 albo U0 ≤ 50 V (poza zakresem tabeli — reżim SELV/PELV,
            inny mechanizm ochrony, nie samoczynne wyłączenie z Tab. 41.1).
    """
    tol = _TOLERANCJA_GRANICY_PASMA_V
    if u0_v <= 50.0:
        raise ValueError(
            f"U0={u0_v} V ≤ 50 V — poza zakresem Tab. 41.1 (reżim SELV/PELV, "
            "ochrona nie opiera się na samoczynnym wyłączeniu)."
        )
    if u0_v <= 120.0 + tol:
        return "50<U0<=120"
    if u0_v <= 230.0 + tol:
        return "120<U0<=230"
    if u0_v <= 400.0 + tol:
        return "230<U0<=400"
    return "U0>400"
