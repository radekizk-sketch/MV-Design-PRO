"""Impedancja przejścia w miejscu zwarcia Z_f = R_f + jX_f — JEDNO źródło reguł danych.

Karta OD-14 (partia integracji 10), kontrakt wiążący
`docs/domain/KONTRAKT_SCENARIUSZY_ZWARCIOWYCH_TRYB_IMPEDANCE.md` §1: pola `r_f_ohm`
i `x_f_ohm` (ta sama nazwa co w zdarzeniach dynamiki, `network_model/solvers/dynamika/
kontrakty.py`), R_f ≥ 0, X_f ≥ 0. Reaktancja ujemna opisywałaby przejście pojemnościowe
— model zwarcia przez impedancję go nie obejmuje, więc to odmowa nazwana, nie wynik.

Moduł NIE liczy fizyki: rozstrzyga wyłącznie, czy para (R_f, X_f) jest dopuszczalną daną
wejściową. Korzystają z niego wszystkie miejsca wejścia tej danej — scenariusz zwarciowy
(`domain/fault_scenario.py`), składanie wejścia biegu z opcji (`enm/assembler.py`) i rdzeń
IEC 60909 (`network_model/solvers/short_circuit_iec60909.py`) — żeby warunek WEJŚCIA i warunek
OBLICZENIA pochodziły z jednego miejsca (reguła „predykaty parami").
"""

from __future__ import annotations

import math

#: Klucz opcji biegu niosący Z_f = {"r_f_ohm", "x_f_ohm"} — JEDNO źródło dla projekcji
#: scenariusza (`enm.scenariusze.opcje_biegu_ze_scenariusza`) i assemblera (`enm/assembler.py`).
KLUCZ_OPCJI_IMPEDANCJI_ZWARCIA = "fault_impedance"

#: X_f < 0 — przejście pojemnościowe poza modelem zwarcia przez impedancję.
KOD_IMPEDANCJA_POJEMNOSCIOWA = "sc.impedancja_zwarcia_pojemnosciowa"
#: R_f < 0 — rezystancja przejścia ujemna (element aktywny, nie przejście).
KOD_REZYSTANCJA_UJEMNA = "sc.rezystancja_zwarcia_ujemna"
#: R_f albo X_f nie jest liczbą skończoną (NaN, ±Inf, brak liczby).
KOD_IMPEDANCJA_NIESKONCZONA = "sc.impedancja_zwarcia_nieskonczona"

#: Kod → zdanie dla projektanta (bez identyfikatorów; element wskazuje odwołanie odmowy).
OPISY_ODMOW_IMPEDANCJI: dict[str, str] = {
    KOD_IMPEDANCJA_POJEMNOSCIOWA: (
        "Reaktancja przejścia X_f w miejscu zwarcia jest ujemna (przejście pojemnościowe) — "
        "zwarcie przez impedancję przyjmuje X_f ≥ 0."
    ),
    KOD_REZYSTANCJA_UJEMNA: (
        "Rezystancja przejścia R_f w miejscu zwarcia jest ujemna — zwarcie przez impedancję "
        "przyjmuje R_f ≥ 0."
    ),
    KOD_IMPEDANCJA_NIESKONCZONA: (
        "Impedancja przejścia Z_f w miejscu zwarcia wymaga skończonych liczb R_f i X_f [Ω]."
    ),
}


def kod_odmowy_impedancji(r_f_ohm: object, x_f_ohm: object) -> str | None:
    """Kod odmowy pary (R_f, X_f) albo `None`, gdy para jest dopuszczalna.

    Kolejność rozstrzygnięć jest stała (determinizm komunikatu): najpierw liczba skończona,
    potem znak reaktancji, potem znak rezystancji.
    """
    liczby: list[float] = []
    for wartosc in (r_f_ohm, x_f_ohm):
        if isinstance(wartosc, bool) or not isinstance(wartosc, int | float):
            return KOD_IMPEDANCJA_NIESKONCZONA
        if not math.isfinite(float(wartosc)):
            return KOD_IMPEDANCJA_NIESKONCZONA
        liczby.append(float(wartosc))
    r_f, x_f = liczby
    if x_f < 0.0:
        return KOD_IMPEDANCJA_POJEMNOSCIOWA
    if r_f < 0.0:
        return KOD_REZYSTANCJA_UJEMNA
    return None


def impedancja_przejscia_obliczeniowa(r_f_ohm: float, x_f_ohm: float) -> complex | None:
    """Z_f, z którą liczy solver, dla pary DOPUSZCZALNEJ (`kod_odmowy_impedancji` → `None`).

    Z_f = 0 to zwarcie metaliczne (kontrakt OD-14 §1: tryb z R_f = X_f = 0 ≡ zwarcie metaliczne,
    parytet bit w bit; §3: proweniencja `poza_zakresem_iec60909` WYŁĄCZNIE dla Z_f ≠ 0), więc
    zwraca `None` — każde miejsce obliczenia (rdzeń IEC 60909, wielkości SC1, wkłady maszyn)
    i składanie wejścia biegu rozstrzygają „metaliczne czy przez impedancję" TĄ funkcją.
    """
    if r_f_ohm == 0.0 and x_f_ohm == 0.0:
        return None
    return complex(float(r_f_ohm), float(x_f_ohm))


__all__ = [
    "KOD_IMPEDANCJA_NIESKONCZONA",
    "KOD_IMPEDANCJA_POJEMNOSCIOWA",
    "KOD_REZYSTANCJA_UJEMNA",
    "KLUCZ_OPCJI_IMPEDANCJI_ZWARCIA",
    "OPISY_ODMOW_IMPEDANCJI",
    "impedancja_przejscia_obliczeniowa",
    "kod_odmowy_impedancji",
]
