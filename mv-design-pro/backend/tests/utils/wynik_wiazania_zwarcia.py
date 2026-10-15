"""Wejście zamrożonego mappera `short_circuit_to_resultset_v1` dla testów jego kontraktu.

PO CO (karta TORY-TYLKO-W-TESTACH, 2026-09-30). Mapper `application/result_mapping/
short_circuit_to_resultset_v1.py` i jego sąsiad `sc_binding_meta.py` są zamrożone
decyzją właściciela (B-01, karta CV-3.3-A2, `scripts/resultset_v1_schema_guard.py`) i
nie mają konsumenta w produkcie; ich testy kontraktu zostają. Dawny producent ich
wejścia — `application.solvers.short_circuit_binding.execute_short_circuit` — sam był
torem istniejącym tylko w testach i został skasowany. Ten pomocnik składa
`ShortCircuitBindingResult` z tych samych ogniw, z których bieg kanoniczny składa
wejście zwarciowe (`enm/assembler.py::zloz_wejscie_zwarcia`): c z pasma napięciowego
węzła zwarcia (`c_for_node`, IEC 60909-0 tab. 1), graf scenariusza MIN z korektą
temperaturową R_θ (`build_min_scenario_graph`) i zamrożony solver IEC 60909.
"""

from __future__ import annotations

from application.solvers.lv_temperature_correction import build_min_scenario_graph
from application.solvers.short_circuit_binding import (
    Scenario,
    ShortCircuitBindingResult,
)
from domain.execution import ExecutionAnalysisType
from network_model.core.graph import NetworkGraph
from network_model.core.voltage_factor import c_for_node
from network_model.solvers.short_circuit_iec60909 import ShortCircuitIEC60909Solver


def wynik_wiazania_zwarcia_3f(
    graph: NetworkGraph,
    fault_node_id: str,
    *,
    scenario: Scenario = "MAX",
    tk_s: float = 1.0,
) -> ShortCircuitBindingResult:
    """Zwarcie trójfazowe w `fault_node_id` opakowane w typ wejścia zamrożonego mappera."""
    c_factor = c_for_node(graph.nodes[fault_node_id].voltage_level, scenario)
    graf_solvera = graph
    noty: tuple[dict[str, object], ...] = ()
    if scenario == "MIN":
        scenariusz_min = build_min_scenario_graph(graph)
        graf_solvera = scenariusz_min.graph
        noty = tuple(nota.to_dict() for nota in scenariusz_min.notes)
    wynik = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graf_solvera,
        fault_node_id=fault_node_id,
        c_factor=c_factor,
        tk_s=tk_s,
        tb_s=0.1,
    )
    return ShortCircuitBindingResult(
        solver_result=wynik,
        analysis_type=ExecutionAnalysisType.SC_3F,
        fault_node_id=fault_node_id,
        scenario=scenario,
        c_factor_auto=c_factor,
        c_factor_override=False,
        temperature_correction_notes=noty,
    )
