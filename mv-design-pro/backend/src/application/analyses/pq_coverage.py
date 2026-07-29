"""Serwis aplikacyjny: weryfikacja pokrycia krzywej P-Q falownika wymaganiem
operatora NC RfG.

Warstwa APPLICATION (porównanie wartości słownikowych, ZERO fizyki). Dla danego
typu katalogowego przekształtnika (z opcjonalną ``pq_curve``) i profilu operatora
NC RfG porównuje krzywą zdolności producenta z prostokątnym wymaganiem operatora
(zakres Q jako procent Pn) punkt po punkcie i buduje deterministyczny widok:
werdykt całości + wynik per punkt (pokryty/niepokryty + margines [Mvar]) + ślad
WHITE BOX (wzór porównania, dane, podstawienie, wynik).

Odwzorowania (plik:linia w kodzie źródłowym):
- krzywa producenta ← ``ConverterType.pq_curve`` (``network_model.catalog.types``),
- wymaganie operatora ← ``NcRfgProfile.reactive_power`` — pola
  ``q_range_pct_pn_min`` / ``q_range_pct_pn_max`` (``catalog.profiles.nc_rfg.loader``),
- moc odniesienia Pn ← ``ConverterType.pmax_mw``.

Konwencja pokrycia: pasmo producenta [q_min, q_max] w punkcie musi obejmować
pasmo wymagane [q_wym_min, q_wym_max]:
- zapas dolny  = q_wym_min - q_min  (producent siega nizej niz wymaganie),
- zapas gorny  = q_max - q_wym_max  (producent siega wyzej niz wymaganie),
- punkt pokryty  <=>  zapas dolny >= 0  AND  zapas gorny >= 0,
- margines punktu = min(zapas dolny, zapas gorny) (ujemny = deficyt).
"""

from __future__ import annotations

from typing import Any

from catalog.profiles.nc_rfg.loader import NcRfgProfile
from network_model.catalog.types import ConverterType

# Zaokraglenie wartosci wyjsciowych [Mvar] — determinizm i czytelnosc.
_ROUND_MVAR = 6

_COVERAGE_FORMULA = (
    "punkt pokryty  <=>  q_min_prod <= q_wym_min  AND  q_max_prod >= q_wym_max; "
    "margines = min(q_wym_min - q_min_prod, q_max_prod - q_wym_max); "
    "q_wym_min = udzial_min * Pn, q_wym_max = udzial_max * Pn"
)


def _round(value: float) -> float:
    return round(float(value), _ROUND_MVAR)


def build_pq_coverage_view(converter: ConverterType, profile: NcRfgProfile) -> dict[str, Any]:
    """Zbuduj widok pokrycia krzywej P-Q wymaganiem operatora NC RfG.

    Raises:
        ValueError: gdy typ przekształtnika nie ma krzywej producenta
            (``pq_curve`` = None) — komunikat w języku polskim.
    """
    if converter.pq_curve is None:
        raise ValueError(
            f"Typ '{converter.id}' nie ma krzywej producenta (pole pq_curve); "
            "weryfikacja pokrycia P-Q nie jest mozliwa."
        )

    pn_mw = float(converter.pmax_mw)
    udzial_min = float(profile.reactive_power.q_range_pct_pn_min)
    udzial_max = float(profile.reactive_power.q_range_pct_pn_max)
    q_wym_min = udzial_min * pn_mw
    q_wym_max = udzial_max * pn_mw

    punkty: list[dict[str, Any]] = []
    podstawienie: list[str] = []
    for p_mw, q_min_prod, q_max_prod in converter.pq_curve:
        zapas_dolny = q_wym_min - q_min_prod
        zapas_gorny = q_max_prod - q_wym_max
        margines = min(zapas_dolny, zapas_gorny)
        pokryty = zapas_dolny >= 0 and zapas_gorny >= 0
        if pokryty:
            uwaga = "pokryty"
        elif zapas_dolny < zapas_gorny:
            uwaga = (
                f"niepokryty: brak {_round(-zapas_dolny)} Mvar po stronie dolnej (pojemnosciowej)"
            )
        else:
            uwaga = f"niepokryty: brak {_round(-zapas_gorny)} Mvar po stronie gornej (indukcyjnej)"
        punkty.append(
            {
                "p_mw": _round(p_mw),
                "q_min_mvar": _round(q_min_prod),
                "q_max_mvar": _round(q_max_prod),
                "q_wymagane_min_mvar": _round(q_wym_min),
                "q_wymagane_max_mvar": _round(q_wym_max),
                "zapas_dolny_mvar": _round(zapas_dolny),
                "zapas_gorny_mvar": _round(zapas_gorny),
                "margines_mvar": _round(margines),
                "pokryty": pokryty,
                "uwaga": uwaga,
            }
        )
        podstawienie.append(
            f"p={_round(p_mw)} MW: min({_round(zapas_dolny)}, {_round(zapas_gorny)}) "
            f"= {_round(margines)} Mvar -> {'pokryty' if pokryty else 'niepokryty'}"
        )

    liczba_punktow = len(punkty)
    liczba_pokrytych = sum(1 for pt in punkty if pt["pokryty"])
    pokryty_calosc = liczba_pokrytych == liczba_punktow
    min_margines = min(pt["margines_mvar"] for pt in punkty)

    if pokryty_calosc:
        opis_pl = (
            f"Krzywa producenta pokrywa wymaganie operatora we wszystkich "
            f"{liczba_punktow} punktach (najmniejszy margines {_round(min_margines)} Mvar)."
        )
        wynik = f"POKRYTE: {liczba_pokrytych}/{liczba_punktow} punktow."
    else:
        najgorszy = min(punkty, key=lambda pt: pt["margines_mvar"])
        opis_pl = (
            f"Krzywa producenta NIE pokrywa wymagania operatora: "
            f"{liczba_punktow - liczba_pokrytych} z {liczba_punktow} punktow niepokrytych; "
            f"najwiekszy deficyt {_round(-min_margines)} Mvar przy p={najgorszy['p_mw']} MW."
        )
        wynik = f"NIEPOKRYTE: {liczba_pokrytych}/{liczba_punktow} punktow."

    return {
        "typ_katalogowy": {
            "id": converter.id,
            "nazwa": converter.name,
            "kind": converter.kind.value,
            "pmax_mw": _round(pn_mw),
            "sn_mva": _round(converter.sn_mva),
        },
        "operator": {
            "id": profile.operator_id,
            "nazwa": profile.operator_name_pl,
            "udzial_q_min_pct_pn": udzial_min,
            "udzial_q_max_pct_pn": udzial_max,
        },
        "wymaganie": {
            "pn_mw": _round(pn_mw),
            "q_wymagane_min_mvar": _round(q_wym_min),
            "q_wymagane_max_mvar": _round(q_wym_max),
            "opis": (
                "Prostokatne wymaganie zakresu Q operatora: "
                "[udzial_min * Pn, udzial_max * Pn] w kazdym punkcie pracy."
            ),
        },
        "punkty": punkty,
        "werdykt": {
            "pokryty": pokryty_calosc,
            "liczba_punktow": liczba_punktow,
            "liczba_pokrytych": liczba_pokrytych,
            "min_margines_mvar": _round(min_margines),
            "opis_pl": opis_pl,
        },
        "slad_whitebox": {
            "wzor": _COVERAGE_FORMULA,
            "dane": {
                "pn_mw": _round(pn_mw),
                "udzial_q_min_pct_pn": udzial_min,
                "udzial_q_max_pct_pn": udzial_max,
                "q_wymagane_min_mvar": _round(q_wym_min),
                "q_wymagane_max_mvar": _round(q_wym_max),
                "liczba_punktow_krzywej": liczba_punktow,
            },
            "podstawienie": podstawienie,
            "wynik": wynik,
        },
    }
