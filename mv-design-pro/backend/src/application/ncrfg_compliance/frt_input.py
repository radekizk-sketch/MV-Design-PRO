"""Budowa wejścia solvera FRT/HVRT dla testbenchu NC RfG (współdzielona ścieżka).

Warstwa APPLICATION — składa parametry scenariusza testowego LVRT/HVRT w kontrakt
``FrtHvrtSolverInput`` (FROZEN API solvera ``network_model.solvers.frt_hvrt``).
Wydzielone z ``ncrfg_compliance.checker`` (testy T1/T2), aby ta sama logika
budowy wejścia była reużywana przez serwis trajektorii FRT/HVRT — ZERO fizyki,
ZERO zmiany zachowania checkera.
"""

from __future__ import annotations

from typing import Literal

from src.network_model.solvers.frt_hvrt import FrtHvrtSolverInput, FrtScenario

# Parametry scenariusza testowego NC RfG (Brief 2 §16) — stałe testbenchu.
NCRFG_ENM_REF = "ncrfg_test"
LVRT_VOLTAGE_DIP_PU = 0.05  # zapad napięcia dla testu LVRT (p.u.)
HVRT_VOLTAGE_SWELL_PU = 1.30  # wzrost napięcia dla testu HVRT (p.u.)
FRT_FAULT_DURATION_S = 0.15  # czas trwania zakłócenia (s)


def build_frt_hvrt_input(
    der_ref: str,
    test_kind: Literal["lvrt", "hvrt"],
    *,
    scenario_id: str,
    enm_ref: str = NCRFG_ENM_REF,
) -> FrtHvrtSolverInput:
    """Zbuduj wejście solvera FRT/HVRT dla pojedynczego scenariusza testowego.

    Parametry (zapad/wzrost napięcia, czas trwania) są stałymi testbenchu NC RfG,
    identycznymi jak w checkerze zgodności — patrz stałe modułu.
    """
    voltage_dip = LVRT_VOLTAGE_DIP_PU if test_kind == "lvrt" else HVRT_VOLTAGE_SWELL_PU
    scenario = FrtScenario(
        scenario_id=scenario_id,
        test_kind=test_kind,
        voltage_dip_depth_pu=voltage_dip,
        fault_duration_s=FRT_FAULT_DURATION_S,
        target_der_ref=der_ref,
    )
    return FrtHvrtSolverInput(enm_ref=enm_ref, scenarios=[scenario])


def build_frt_sekwencja_input(
    der_ref: str,
    zapady: list[tuple[float, float]],
    *,
    enm_ref: str = NCRFG_ENM_REF,
) -> FrtHvrtSolverInput:
    """Zbuduj wejście solvera FRT dla SEKWENCJI wielokrotnych zapadów LVRT.

    Sekwencja = N scenariuszy LVRT w JEDNYM wejściu solvera (``scenarios`` to lista,
    ``network_model.solvers.frt_hvrt.contracts.FrtHvrtSolverInput.scenarios:25``);
    solver liczy każdy zapad od stanu ustalonego. Kolejność wywołującego zachowana
    (determinizm), identyfikatory scenariuszy nadawane deterministycznie ``zapad_{i}``.

    Args:
        der_ref: referencja modułu DER (``FrtScenario.target_der_ref:17``).
        zapady: lista par ``(głębokość_pu, czas_s)`` — parametry kolejnych zapadów;
            głębokość → ``voltage_dip_depth_pu`` (zakres LVRT 0..1 waliduje
            ``FrtHvrtSolverAdapter.validate_input`` w ``contracts.py:89-94``),
            czas → ``fault_duration_s``.

    W odróżnieniu od ``build_frt_hvrt_input:23`` (stałe testbenchu, używana przez
    checker) parametry pochodzą od wywołującego — bez zmiany zachowania checkera.
    """
    scenarios = [
        FrtScenario(
            scenario_id=f"zapad_{index}",
            test_kind="lvrt",
            voltage_dip_depth_pu=float(depth_pu),
            fault_duration_s=float(czas_s),
            target_der_ref=der_ref,
        )
        for index, (depth_pu, czas_s) in enumerate(zapady, start=1)
    ]
    return FrtHvrtSolverInput(enm_ref=enm_ref, scenarios=scenarios)
