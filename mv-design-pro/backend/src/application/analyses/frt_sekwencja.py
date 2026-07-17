"""Serwis aplikacyjny: SEKWENCJA wielokrotnych zapadów FRT z kontekstem siły sieci.

Warstwa APPLICATION (ZERO fizyki). Dla wskazanego modułu DER (typ katalogowy
przekształtnika), profilu operatora NC RfG i parametrycznie zdefiniowanej sekwencji
zapadów napięcia (para głębokość_pu + czas_s):

- uruchamia FROZEN solver ``FrtHvrtSolverAdapter`` (``network_model.solvers.frt_hvrt``)
  przez NOWĄ budowę wejścia ``build_frt_sekwencja_input``
  (``application.ncrfg_compliance.frt_input.build_frt_sekwencja_input``) — sekwencja =
  N scenariuszy LVRT w JEDNYM wejściu solvera, każdy zapad liczony od stanu ustalonego,
- dokłada OBWIEDNIĘ LVRT profilu operatora (punkty krzywej czas→napięcie z
  ``NcRfgProfile.voltage_levels.lvrt``, jak D6),
- buduje werdykt PL per zapad WYŁĄCZNIE z pól solvera (reużywa ``_verdict_pl`` z D6,
  ``application.analyses.frt_trajektorie:46``) oraz werdykt sekwencji jako KONIUNKCJĘ
  werdyktów zapadów (kompozycja wyników solvera, nie nowa fizyka),
- opcjonalnie dołącza wiersz SCR/WSCR węzła przyłączenia z widoku siły sieci D1
  (``application.analyses.grid_strength.build_grid_strength_view:128``) — klasyfikacja
  słaba/silna sieć Z WIDOKU D1, zero własnej oceny.

OGRANICZENIE (rozstrzygnięcie zarządcy §0.1, pole odpowiedzi ``zalozenia_pl``):
stan modułu MIĘDZY zapadami (nagrzewanie, niepełny odzysk) NIE jest modelowany —
każdy zapad oceniany niezależnie; werdykt sekwencji = koniunkcja werdyktów zapadów.

Odwzorowania (plik:linia w kodzie źródłowym):
- status/margines/połączenie per zapad ← ``FrtScenarioResult``
  (``network_model.solvers.frt_hvrt.contracts:45``),
- obwiednia LVRT ← ``NcRfgProfile.voltage_levels.lvrt`` (``catalog.profiles.nc_rfg.loader``),
- budowa wejścia solvera ← ``frt_input.build_frt_sekwencja_input``,
- kontekst siły sieci ← wiersz ``entries[]`` z ``build_grid_strength_view`` (D1).
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from application.analyses.frt_trajektorie import _WERDYKT_W_OBWIEDNI, _verdict_pl
from application.ncrfg_compliance.frt_input import build_frt_sekwencja_input
from catalog.profiles.nc_rfg.loader import NcRfgProfile
from network_model.catalog.types import ConverterType
from network_model.solvers.frt_hvrt import FrtHvrtSolverAdapter

# Zaokrąglenie wartości wyjściowych — determinizm i czytelność (jak D6).
_ROUND = 6

# Rozsądny limit długości sekwencji (ochrona przed nadużyciem wejścia).
_MAX_ZAPADY = 10

# Werdykt sekwencji — koniunkcja werdyktów zapadów (pola solvera, bez własnej oceny).
_WERDYKT_SEKWENCJA_W_OBWIEDNI = "sekwencja w obwiedni"

_ZALOZENIA_PL = (
    "Stan modułu MIĘDZY zapadami (nagrzewanie, niepełny odzysk) nie jest modelowany: "
    "każdy zapad liczony od stanu ustalonego i oceniany niezależnie. Werdykt sekwencji "
    "to koniunkcja werdyktów poszczególnych zapadów — kompozycja wyników solvera, "
    "nie nowa fizyka."
)

_KONTEKST_POWOD_BRAK = (
    "Nie wskazano przebiegu zwarciowego (run_id) ani węzła przyłączenia (bus_ref); "
    "kontekst siły sieci (SCR/WSCR) pominięty."
)


def _round(value: float) -> float:
    return round(float(value), _ROUND)


def _werdykt_sekwencji_pl(werdykty: list[str]) -> str:
    """Koniunkcja werdyktów zapadów: sekwencja zaliczona tylko gdy KAŻDY zapad
    jest „w obwiedni"; w przeciwnym razie numer pierwszego niezaliczonego zapadu."""
    for indeks, werdykt in enumerate(werdykty, start=1):
        if werdykt != _WERDYKT_W_OBWIEDNI:
            return f"sekwencja niezaliczona — zapad {indeks}"
    return _WERDYKT_SEKWENCJA_W_OBWIEDNI


def _compute_input_hash(
    converter_id: str,
    operator_id: str,
    zapady: list[tuple[float, float]],
    grid_strength_row: dict[str, Any] | None,
) -> str:
    """Deterministyczny odcisk wejścia (SHA-256 kanonicznego payloadu, stała kolejność)."""
    payload = {
        "modul_der": converter_id,
        "operator": operator_id,
        "zapady": [[_round(depth), _round(czas)] for depth, czas in zapady],
        "kontekst_bus_ref": (
            grid_strength_row.get("bus_ref") if grid_strength_row is not None else None
        ),
        "kontekst_scr": (grid_strength_row.get("scr") if grid_strength_row is not None else None),
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def build_frt_sekwencja_view(
    converter: ConverterType,
    profile: NcRfgProfile,
    zapady: list[tuple[float, float]],
    *,
    grid_strength_row: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Zbuduj widok sekwencji zapadów FRT modułu DER z kontekstem siły sieci.

    Args:
        converter: typ katalogowy przekształtnika (moduł DER).
        profile: profil operatora NC RfG (obwiednia LVRT).
        zapady: lista par ``(głębokość_pu, czas_s)`` — kolejność zachowana; ≥1 zapad,
            maksimum ``_MAX_ZAPADY``.
        grid_strength_row: opcjonalny wiersz SCR/WSCR węzła przyłączenia z widoku D1
            (``build_grid_strength_view``); ``None`` → sekcja ``kontekst_sily_sieci``
            uczciwie pusta z powodem PL.

    Raises:
        ValueError: gdy sekwencja jest pusta, zbyt długa lub gdy solver odrzuci
            parametry (np. głębokość LVRT poza 0..1) — komunikat w języku polskim.
    """
    if not zapady:
        raise ValueError("Sekwencja zapadów jest pusta; podaj co najmniej jeden zapad.")
    if len(zapady) > _MAX_ZAPADY:
        raise ValueError(
            f"Sekwencja zawiera {len(zapady)} zapadów; dozwolone maksimum to {_MAX_ZAPADY}."
        )

    # Sekwencja = N scenariuszy LVRT w JEDNYM wejściu solvera (walidacja zakresów
    # przez validate_input solvera — LVRT 0..1, czas > 0).
    solver_input = build_frt_sekwencja_input(converter.id, zapady)
    adapter = FrtHvrtSolverAdapter()
    valid, errors = adapter.validate_input(solver_input)
    if not valid:
        raise ValueError("Walidacja parametrów sekwencji: " + "; ".join(errors))
    result = adapter.run(solver_input)

    # Wyniki per scenariusz — dopasowanie po scenario_id, kolejność wejścia (determinizm).
    results_by_id = {sc.scenario_id: sc for sc in result.scenario_results}

    # Obwiednia LVRT profilu operatora — punkty krzywej czas→napięcie (jak D6).
    obwiednia = [
        {"czas_s": _round(pt.time_s), "napiecie_pu": _round(pt.voltage_pu)}
        for pt in profile.voltage_levels.lvrt
    ]

    zapady_view: list[dict[str, Any]] = []
    werdykty: list[str] = []
    for scenario in solver_input.scenarios:
        sc = results_by_id[scenario.scenario_id]
        werdykt = _verdict_pl(sc)
        werdykty.append(werdykt)
        zapady_view.append(
            {
                "scenario_id": scenario.scenario_id,
                "glebokosc_pu": _round(scenario.voltage_dip_depth_pu),
                "czas_s": _round(scenario.fault_duration_s),
                "status": sc.status,
                "stayed_connected": sc.stayed_connected,
                "margin_to_curve_pu": (
                    None if sc.margin_to_curve_pu is None else _round(sc.margin_to_curve_pu)
                ),
                "margin_to_curve_s": (
                    None if sc.margin_to_curve_s is None else _round(sc.margin_to_curve_s)
                ),
                "p_recovery_time_s": (
                    None if sc.p_recovery_time_s is None else _round(sc.p_recovery_time_s)
                ),
                "werdykt_pl": werdykt,
                # Ślad WHITE BOX — parametry wejścia solvera dla tego zapadu.
                "wejscie_solvera": {
                    "test_kind": scenario.test_kind,
                    "voltage_dip_depth_pu": _round(scenario.voltage_dip_depth_pu),
                    "fault_duration_s": _round(scenario.fault_duration_s),
                    "target_der_ref": scenario.target_der_ref,
                },
            }
        )

    kontekst_sily_sieci = grid_strength_row
    kontekst_powod_pl = None if grid_strength_row is not None else _KONTEKST_POWOD_BRAK

    return {
        "modul_der": {
            "id": converter.id,
            "nazwa": converter.name,
            "kind": converter.kind.value,
            "pmax_mw": _round(converter.pmax_mw),
            "un_kv": _round(converter.un_kv),
        },
        "operator": {
            "id": profile.operator_id,
            "nazwa": profile.operator_name_pl,
        },
        "status_solvera": result.status,
        "obwiednia_profilu": {
            "rodzaj": "lvrt",
            "opis": (
                "Krzywa LVRT operatora: dozwolony przebieg napięcia (czas→napięcie) "
                "wg profilu NC RfG."
            ),
            "punkty": obwiednia,
        },
        "liczba_zapadow": len(zapady_view),
        "zapady": zapady_view,
        "werdykt_sekwencji_pl": _werdykt_sekwencji_pl(werdykty),
        "zalozenia_pl": _ZALOZENIA_PL,
        "kontekst_sily_sieci": kontekst_sily_sieci,
        "kontekst_sily_sieci_powod_pl": kontekst_powod_pl,
        "input_hash": _compute_input_hash(
            converter.id, profile.operator_id, zapady, grid_strength_row
        ),
    }
