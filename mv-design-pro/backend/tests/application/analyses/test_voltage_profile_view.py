"""Testy `application.analyses.voltage_profile_view` — FAB-E (E1).

Zakres: odtworzenie ``PowerFlowResultV1`` (`_power_flow_result_v1`) z zapisu
biegu rozpływu.

- Brak pola FIZYCZNEGO szyny (poza wyspą SLACK, solver nie policzył) -> NaN,
  jednolicie z v_pu/angle_deg (już wcześniej poprawne), nie fikcyjne 0.0 MW/Mvar
  wstrzykniętej mocy.
- Brak pola gałęzi/podsumowania — zamrożony kontrakt
  (``PowerFlowBranchResult.to_dict``/``PowerFlowSummary.to_dict``) NIGDY nie
  serializuje tu braku, więc brak pola oznacza uszkodzony zapis biegu -> odmowa
  z nazwą pola, nie fikcyjne 0.0.
- Komplet danych -> regresja: te same liczby co dziś.
"""

from __future__ import annotations

import copy
import dataclasses
import math

import pytest
from application.analyses.voltage_profile_view import _power_flow_result_v1
from enm.canonical_analysis import CanonicalRun, create_run, execute_run, reset_canonical_runs
from enm.store import reset_enm_store, set_enm

from tests.cgmes.golden_enm import build_golden_enm


@pytest.fixture(autouse=True)
def _reset() -> None:
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _pf_run() -> CanonicalRun:
    set_enm("c-pf-vpv", build_golden_enm())
    return execute_run(create_run(case_id="c-pf-vpv", analysis_type="PF").id)


def _with_mutated_result_v1(run: CanonicalRun, mutate) -> CanonicalRun:
    """Kopia biegu z ZMUTOWANYM `raw_result["result_v1"]` (reszta bez zmian)."""
    raw_result = copy.deepcopy(run.raw_result)
    mutate(raw_result["result_v1"])
    return dataclasses.replace(run, raw_result=raw_result)


def test_complete_result_v1_regression_matches_today() -> None:
    """Regresja: komplet danych -> te same liczby co dziś, zero zmiany zachowania."""
    run = _pf_run()
    wynik = _power_flow_result_v1(run)
    result_v1 = run.raw_result["result_v1"]

    zrodlo_bus = {row["bus_id"]: row for row in result_v1["bus_results"]}
    assert len(wynik.bus_results) == len(result_v1["bus_results"])
    for bus in wynik.bus_results:
        zrodlowy = zrodlo_bus[bus.bus_id]
        if zrodlowy.get("p_injected_mw") is not None:
            assert bus.p_injected_mw == pytest.approx(zrodlowy["p_injected_mw"])
        if zrodlowy.get("q_injected_mvar") is not None:
            assert bus.q_injected_mvar == pytest.approx(zrodlowy["q_injected_mvar"])

    assert len(wynik.branch_results) == len(result_v1["branch_results"])
    zrodlo_galaz = {row["branch_id"]: row for row in result_v1["branch_results"]}
    for galaz in wynik.branch_results:
        zrodlowa = zrodlo_galaz[galaz.branch_id]
        assert galaz.p_from_mw == pytest.approx(zrodlowa["p_from_mw"])
        assert galaz.losses_p_mw == pytest.approx(zrodlowa["losses_p_mw"])

    assert wynik.summary.total_losses_p_mw == pytest.approx(
        result_v1["summary"]["total_losses_p_mw"]
    )


def test_missing_bus_p_injected_mw_is_nan_not_zero() -> None:
    """FAB-E (E1): brak p_injected_mw szyny w zapisie biegu -> NaN (jednolicie
    z v_pu/angle_deg), nie fikcyjne 0.0 MW wstrzykniętej mocy (co wyglądałoby
    jak szyna bez żadnego obciążenia/generacji)."""
    run = _pf_run()
    target_bus_id = run.raw_result["result_v1"]["bus_results"][0]["bus_id"]

    def _usun_p(result_v1: dict) -> None:
        for row in result_v1["bus_results"]:
            if row["bus_id"] == target_bus_id:
                del row["p_injected_mw"]

    zmutowany = _with_mutated_result_v1(run, _usun_p)
    wynik = _power_flow_result_v1(zmutowany)
    bus = next(b for b in wynik.bus_results if b.bus_id == target_bus_id)
    assert math.isnan(bus.p_injected_mw)
    # q_injected_mvar (obecne) nadal renderuje się normalnie.
    assert not math.isnan(bus.q_injected_mvar)


def test_missing_bus_q_injected_mvar_is_nan_not_zero() -> None:
    """FAB-E (E1): jak wyżej, dla q_injected_mvar (drugie pole tego samego
    predykatu „szyna rozwiązana" — para z p_injected_mw, karta KLASA-NIE-INSTANCJA)."""
    run = _pf_run()
    target_bus_id = run.raw_result["result_v1"]["bus_results"][0]["bus_id"]

    def _usun_q(result_v1: dict) -> None:
        for row in result_v1["bus_results"]:
            if row["bus_id"] == target_bus_id:
                del row["q_injected_mvar"]

    zmutowany = _with_mutated_result_v1(run, _usun_q)
    wynik = _power_flow_result_v1(zmutowany)
    bus = next(b for b in wynik.bus_results if b.bus_id == target_bus_id)
    assert math.isnan(bus.q_injected_mvar)
    assert not math.isnan(bus.p_injected_mw)


def test_missing_branch_field_raises_naming_branch_and_field() -> None:
    """FAB-E (E1): zamrożony kontrakt (`PowerFlowBranchResult.to_dict`) nigdy nie
    serializuje tu braku — brak pola gałęzi to uszkodzony zapis biegu, odmowa
    z nazwą gałęzi i pola, nie fikcyjne 0.0 MW przepływu."""
    run = _pf_run()
    target_branch_id = run.raw_result["result_v1"]["branch_results"][0]["branch_id"]

    def _usun_p_from(result_v1: dict) -> None:
        for row in result_v1["branch_results"]:
            if row["branch_id"] == target_branch_id:
                del row["p_from_mw"]

    zmutowany = _with_mutated_result_v1(run, _usun_p_from)
    with pytest.raises(ValueError) as exc_info:
        _power_flow_result_v1(zmutowany)
    assert target_branch_id in str(exc_info.value)
    assert "p_from_mw" in str(exc_info.value)


def test_missing_summary_field_raises_naming_field() -> None:
    """FAB-E (E1): brak pola podsumowania (np. total_losses_q_mvar) to uszkodzony
    zapis biegu, odmowa z nazwą pola, nie fikcyjne 0.0 Mvar strat."""
    run = _pf_run()

    def _usun_total_losses_q(result_v1: dict) -> None:
        del result_v1["summary"]["total_losses_q_mvar"]

    zmutowany = _with_mutated_result_v1(run, _usun_total_losses_q)
    with pytest.raises(ValueError, match="total_losses_q_mvar"):
        _power_flow_result_v1(zmutowany)
