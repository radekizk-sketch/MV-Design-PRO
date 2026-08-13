"""Meta bindingu SC (scenariusz MAX/MIN, c per pasmo, korekta R_θ) w ResultSet v1.

Karta P0.3 (docs/nn/H_PLAN_IMPLEMENTACJI_NN.md §P0.3). Plik mappera
`short_circuit_to_resultset_v1.py` jest ZAMROŻONY (resultset_v1_schema_guard),
więc wzbogacenie żyje TUTAJ: wynik zamrożonego mappera jest PRZEBUDOWYWANY
budowniczym kanonicznym z rozszerzonym `global_results` — podpis
deterministyczny liczony PO wzbogaceniu (zero mutacji po podpisie). Klucze są
addytywne (kontrakt: additionalProperties:true); stare wyniki bez nich są
nietknięte.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from domain.execution import ResultSet, build_result_set

if TYPE_CHECKING:
    from application.solvers.short_circuit_binding import ShortCircuitBindingResult


def wzbogac_resultset_o_meta_bindingu(
    result_set: ResultSet,
    binding_result: ShortCircuitBindingResult,
) -> ResultSet:
    """Dołóż meta warstwy bindingu do global_results i przelicz podpis."""
    global_results: dict[str, Any] = dict(result_set.global_results)
    global_results["scenario"] = binding_result.scenario
    global_results["c_factor_auto"] = float(binding_result.c_factor_auto)
    global_results["c_factor_override"] = bool(binding_result.c_factor_override)
    if binding_result.temperature_correction_notes:
        global_results["temperature_correction_notes"] = list(
            binding_result.temperature_correction_notes
        )
    return build_result_set(
        run_id=result_set.run_id,
        analysis_type=result_set.analysis_type,
        validation_snapshot=result_set.validation_snapshot,
        readiness_snapshot=result_set.readiness_snapshot,
        element_results=list(result_set.element_results),
        global_results=global_results,
        fault_scenario_id=result_set.fault_scenario_id,
        fault_type=result_set.fault_type,
        fault_location=result_set.fault_location,
    )
