"""Serwis aplikacyjny: trajektorie FRT/HVRT modułu OZE z obwiednią profilu operatora.

Warstwa APPLICATION (ZERO fizyki). Dla wskazanego modułu DER (typ katalogowy
przekształtnika) i profilu operatora NC RfG:
- uruchamia FROZEN solver ``FrtHvrtSolverAdapter`` (``network_model.solvers.frt_hvrt``)
  przez współdzieloną budowę wejścia ``build_frt_hvrt_input`` (ta sama ścieżka co
  ``ncrfg_compliance.checker``),
- dokłada OBWIEDNIĘ profilu operatora — punkty krzywej LVRT/HVRT (czas→napięcie)
  z ``NcRfgProfile.voltage_levels`` (``catalog.profiles.nc_rfg.loader``),
- buduje werdykt PL per scenariusz WYŁĄCZNIE z pól solvera (``stayed_connected`` /
  ``margin_to_curve_pu``) — bez własnej oceny numerycznej.

Odwzorowania (plik:linia w kodzie źródłowym):
- trajektoria + status + margines ← ``FrtScenarioResult``
  (``network_model.solvers.frt_hvrt.contracts``),
- obwiednia LVRT/HVRT ← ``NcRfgProfile.voltage_levels.lvrt`` / ``.hvrt``, punkty
  ``NcRfgRideThroughPoint(time_s, voltage_pu)`` (``catalog.profiles.nc_rfg.loader``),
- budowa wejścia solvera ← ``application.ncrfg_compliance.frt_input.build_frt_hvrt_input``.
"""

from __future__ import annotations

from typing import Any, Literal, cast

from application.ncrfg_compliance.frt_input import build_frt_hvrt_input
from catalog.profiles.nc_rfg.loader import NcRfgProfile
from network_model.catalog.types import ConverterType
from network_model.solvers.frt_hvrt import FrtHvrtSolverAdapter
from network_model.solvers.frt_hvrt.contracts import FrtScenario, FrtScenarioResult

# Zaokrąglenie wartości wyjściowych — determinizm i czytelność.
_ROUND = 6

# Werdykty PL per scenariusz — WYŁĄCZNIE z pól solvera.
_WERDYKT_W_OBWIEDNI = "w obwiedni"
_WERDYKT_POZA_OBWIEDNIA = "poza obwiednią"
_WERDYKT_MODUL_WYPADL = "moduł wypadł"

_VALID_TEST_KINDS = ("lvrt", "hvrt")


def _round(value: float) -> float:
    return round(float(value), _ROUND)


def _verdict_pl(scenario_result: FrtScenarioResult) -> str:
    """Werdykt PL na podstawie pól solvera (bez własnej oceny numerycznej).

    - ``stayed_connected`` == False → „moduł wypadł",
    - margines do krzywej < 0 → „poza obwiednią" (solver umieścił trajektorię pod krzywą),
    - w przeciwnym razie → „w obwiedni".
    """
    if not scenario_result.stayed_connected:
        return _WERDYKT_MODUL_WYPADL
    margin = scenario_result.margin_to_curve_pu
    if margin is not None and margin < 0:
        return _WERDYKT_POZA_OBWIEDNIA
    return _WERDYKT_W_OBWIEDNI


def _wejscie_solvera_echo(scenario: FrtScenario | None) -> dict[str, Any] | None:
    """Echo parametrów wejścia solvera dla scenariusza (ślad WHITE BOX).

    Wzorzec ``wejscie_solvera`` z ``frt_sekwencja`` — zapad/wzrost napięcia i czas
    trwania zakłócenia (stałe testbenchu NC RfG z ``frt_input``). ``None`` gdy brak
    dopasowania scenariusza wejścia po ``scenario_id`` (nie powinno wystąpić).
    """
    if scenario is None:
        return None
    return {
        "test_kind": scenario.test_kind,
        "voltage_dip_depth_pu": _round(scenario.voltage_dip_depth_pu),
        "fault_duration_s": _round(scenario.fault_duration_s),
        "target_der_ref": scenario.target_der_ref,
    }


def build_frt_trajectories_view(
    converter: ConverterType,
    profile: NcRfgProfile,
    test_kind: str,
) -> dict[str, Any]:
    """Zbuduj widok trajektorii FRT/HVRT modułu DER z obwiednią profilu operatora.

    Raises:
        ValueError: gdy ``test_kind`` nie jest ``lvrt``/``hvrt`` — komunikat w języku polskim.
    """
    if test_kind not in _VALID_TEST_KINDS:
        raise ValueError(
            f"Nieznany rodzaj testu '{test_kind}'. Dozwolone rodzaje: "
            + ", ".join(_VALID_TEST_KINDS)
            + "."
        )
    kind = cast(Literal["lvrt", "hvrt"], test_kind)

    # Obwiednia profilu operatora — punkty krzywej czas→napięcie.
    curve_points = profile.voltage_levels.lvrt if kind == "lvrt" else profile.voltage_levels.hvrt
    obwiednia = [
        {"czas_s": _round(pt.time_s), "napiecie_pu": _round(pt.voltage_pu)} for pt in curve_points
    ]

    # Bieg FROZEN solvera przez współdzieloną budowę wejścia (ta sama ścieżka co checker).
    solver_input = build_frt_hvrt_input(
        converter.id,
        kind,
        scenario_id=f"{kind}_{converter.id}",
    )
    result = FrtHvrtSolverAdapter().run(solver_input)

    # Echo parametrow wejscia solvera per scenariusz — dopasowanie po scenario_id
    # (wzorzec ``wejscie_solvera`` z ``frt_sekwencja``).
    scenarios_by_id = {sc.scenario_id: sc for sc in solver_input.scenarios}

    scenariusze: list[dict[str, Any]] = []
    for sc in result.scenario_results:
        trajektoria = [
            {
                "czas_s": _round(pt.time_s),
                "napiecie_pu": _round(pt.voltage_pu),
                "iq_bierny_pu": _round(pt.iq_reactive_pu),
                "p_czynna_pu": _round(pt.p_active_pu),
            }
            for pt in sc.trajectory
        ]
        scenariusze.append(
            {
                "scenario_id": sc.scenario_id,
                "status": sc.status,
                "stayed_connected": sc.stayed_connected,
                "margin_to_curve_s": (
                    None if sc.margin_to_curve_s is None else _round(sc.margin_to_curve_s)
                ),
                "margin_to_curve_pu": (
                    None if sc.margin_to_curve_pu is None else _round(sc.margin_to_curve_pu)
                ),
                "p_recovery_time_s": (
                    None if sc.p_recovery_time_s is None else _round(sc.p_recovery_time_s)
                ),
                "werdykt_pl": _verdict_pl(sc),
                "liczba_punktow_trajektorii": len(trajektoria),
                # Ślad WHITE BOX — parametry wejścia solvera dla tego scenariusza.
                "wejscie_solvera": _wejscie_solvera_echo(scenarios_by_id.get(sc.scenario_id)),
                "trajektoria": trajektoria,
            }
        )

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
        "test_kind": kind,
        "status_solvera": result.status,
        "obwiednia_profilu": {
            "rodzaj": kind,
            "opis": (
                "Krzywa "
                + kind.upper()
                + " operatora: dozwolony przebieg napięcia (czas→napięcie) "
                "wg profilu NC RfG."
            ),
            "punkty": obwiednia,
        },
        "scenariusze": scenariusze,
    }
