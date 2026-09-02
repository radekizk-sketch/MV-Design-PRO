"""
Short-Circuit Solver Binding — PR-18

Application-layer adapter that calls the IEC 60909 solver without modifying it.
Accepts a NetworkGraph + case config, dispatches to the correct solver variant
(SC_3F, SC_1F, SC_2F), and returns the frozen ShortCircuitResult.

INVARIANTS:
- ZERO changes to the solver (frozen API)
- No auto-completion of missing data — if data is missing, readiness/eligibility
  should have blocked upstream before reaching this point
- One input -> one output, deterministic
- No caching (deferred to future PR)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Literal

import numpy as np
from application.solvers.lv_temperature_correction import build_min_scenario_graph
from domain.execution import ExecutionAnalysisType
from domain.study_case import StudyCaseConfig
from network_model.core.graph import NetworkGraph
from network_model.core.voltage_factor import c_for_node
from network_model.solvers.short_circuit_core import ShortCircuitType
from network_model.solvers.short_circuit_iec60909 import (
    ShortCircuitIEC60909Solver,
    ShortCircuitResult,
)

logger = logging.getLogger(__name__)

Scenario = Literal["MAX", "MIN"]

# StudyCaseConfig class defaults (domain/study_case.py) — see _resolve_c_factor.
_STUDY_CASE_CONFIG_C_FACTOR_MAX_DEFAULT = 1.10
_STUDY_CASE_CONFIG_C_FACTOR_MIN_DEFAULT = 0.95


class ShortCircuitBindingError(Exception):
    """Raised when the binding layer encounters a non-recoverable problem."""

    pass


_ANALYSIS_TYPE_TO_SC_TYPE: dict[ExecutionAnalysisType, ShortCircuitType] = {
    ExecutionAnalysisType.SC_3F: ShortCircuitType.THREE_PHASE,
    ExecutionAnalysisType.SC_1F: ShortCircuitType.SINGLE_PHASE_GROUND,
    ExecutionAnalysisType.SC_2F: ShortCircuitType.TWO_PHASE,
}


@dataclass(frozen=True)
class ShortCircuitBindingResult:
    """Wrapper around solver result with binding metadata."""

    solver_result: ShortCircuitResult
    analysis_type: ExecutionAnalysisType
    fault_node_id: str
    # Karta P0.3 (c per pasmo + scenariusz MIN) — additive binding-layer metadata.
    # NOT part of the FROZEN ShortCircuitResult (solver) API: these fields live
    # on the wrapper only, so the solver's own frozen contract stays untouched.
    scenario: Scenario = "MAX"
    c_factor_auto: float = 0.0
    c_factor_override: bool = False
    temperature_correction_notes: tuple[dict[str, object], ...] = ()


def _resolve_c_factor(
    *, voltage_kv: float, scenario: Scenario, config: StudyCaseConfig
) -> tuple[float, float, bool]:
    """Resolve the effective IEC 60909 voltage factor c for one fault node.

    Returns (effective_c, auto_c, is_override).

    AUTO (default): c is picked from the fault node's OWN voltage band per
    IEC 60909-0 Table 1 (``network_model.core.voltage_factor.c_for_node`` —
    docs/nn/D_KONTRAKT_SN_NN_V1.md §4): <=1 kV -> 1.05/0.95, >1 kV -> 1.10/1.00.

    OVERRIDE: ``StudyCaseConfig.c_factor_max``/``c_factor_min`` is a SINGLE
    (not per-band) field inherited from the pre-nN binding. Treating every
    node whose band-auto differs from this field as "overridden" would
    misfire for any caller that never touched the field: the class default
    (1.10 / 0.95) only coincides with ONE band's auto value per scenario,
    so untouched defaults would silently "override" auto on every other
    band and defeat per-node AUTO for callers who did nothing wrong. A
    value is therefore treated as an explicit operator override only when
    it differs from BOTH:
      (1) the StudyCaseConfig class default (the field was actually touched), and
      (2) the auto value for THIS fault node's band (the override is visible).
    When it matches auto, or was never touched, the AUTO path is used and
    no override is recorded — "Gdy zgodna z auto — ścieżka auto" (karta §0.2).
    """
    auto_c = c_for_node(voltage_kv, scenario)
    if scenario == "MAX":
        configured = config.c_factor_max
        class_default = _STUDY_CASE_CONFIG_C_FACTOR_MAX_DEFAULT
    else:
        configured = config.c_factor_min
        class_default = _STUDY_CASE_CONFIG_C_FACTOR_MIN_DEFAULT

    is_override = configured != class_default and configured != auto_c
    effective_c = configured if is_override else auto_c
    return effective_c, auto_c, is_override


def execute_short_circuit(
    *,
    graph: NetworkGraph,
    analysis_type: ExecutionAnalysisType,
    config: StudyCaseConfig,
    fault_node_id: str,
    scenario: Scenario = "MAX",
    z0_bus: np.ndarray | None = None,
) -> ShortCircuitBindingResult:
    """
    Execute a short-circuit calculation via the IEC 60909 solver.

    This is the single entry point for short-circuit binding.
    Dispatches to the correct solver method based on analysis_type.

    Karta P0.3: c is selected PER FAULT NODE from its own voltage band
    (IEC 60909-0 Table 1), not from a single study-wide value. For
    scenario="MIN", line/cable branches get the IEC 60909 resistance
    temperature correction (R_theta) BEFORE the solver runs — a graph-input
    decoration (``application.solvers.lv_temperature_correction``), never a
    change to the FROZEN solver itself.

    Args:
        graph: NetworkGraph with all elements and topology.
        analysis_type: SC_3F, SC_1F, or SC_2F.
        config: StudyCaseConfig with c_factor, thermal time, etc.
        fault_node_id: ID of the node where the fault occurs.
        scenario: "MAX" (Ik''max, Ip, Ith — default) or "MIN" (Ik''min).
        z0_bus: Zero-sequence impedance matrix (required for SC_1F), built
            by the caller against whatever graph they intend to solve on
            (MIN-scenario zero-sequence correction is out of this card's
            scope — 3F is the only fault type this karta's contract covers).

    Returns:
        ShortCircuitBindingResult wrapping the frozen solver result.

    Raises:
        ShortCircuitBindingError: If analysis_type is not a short-circuit type,
            scenario is not MAX/MIN, fault_node_id does not exist, or the
            solver encounters a fatal error.
        ValueError: Propagated from the solver for invalid parameters.
    """
    if analysis_type not in _ANALYSIS_TYPE_TO_SC_TYPE:
        raise ShortCircuitBindingError(
            f"Nieobsługiwany typ analizy zwarciowej: {analysis_type.value}"
        )
    if scenario not in ("MAX", "MIN"):
        raise ShortCircuitBindingError(
            f"Nieznany scenariusz zwarcia: {scenario!r} (oczekiwano MAX/MIN)"
        )
    if fault_node_id not in graph.nodes:
        raise ShortCircuitBindingError(f"Fault node '{fault_node_id}' does not exist in graph")

    sc_type = _ANALYSIS_TYPE_TO_SC_TYPE[analysis_type]
    fault_node_voltage_kv = graph.nodes[fault_node_id].voltage_level
    c_factor, c_factor_auto, c_factor_override = _resolve_c_factor(
        voltage_kv=fault_node_voltage_kv, scenario=scenario, config=config
    )
    tk_s = config.thermal_time_seconds
    tb_s = 0.1  # IEC 60909 default breaking time

    solve_graph = graph
    temperature_correction_notes: tuple[dict[str, object], ...] = ()
    if scenario == "MIN":
        min_scenario = build_min_scenario_graph(graph)
        solve_graph = min_scenario.graph
        temperature_correction_notes = tuple(note.to_dict() for note in min_scenario.notes)

    logger.info(
        "Executing short-circuit binding: type=%s, fault_node=%s, scenario=%s, "
        "c=%.2f (auto=%.2f, override=%s), tk=%.2f",
        sc_type.value,
        fault_node_id,
        scenario,
        c_factor,
        c_factor_auto,
        c_factor_override,
        tk_s,
    )

    try:
        if analysis_type == ExecutionAnalysisType.SC_3F:
            solver_result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
                graph=solve_graph,
                fault_node_id=fault_node_id,
                c_factor=c_factor,
                tk_s=tk_s,
                tb_s=tb_s,
            )

        elif analysis_type == ExecutionAnalysisType.SC_1F:
            if z0_bus is None:
                raise ShortCircuitBindingError(
                    "Macierz impedancji zerowej (Z₀) jest wymagana dla zwarcia 1F"
                )
            solver_result = ShortCircuitIEC60909Solver.compute_1ph_short_circuit(
                graph=solve_graph,
                fault_node_id=fault_node_id,
                c_factor=c_factor,
                tk_s=tk_s,
                tb_s=tb_s,
                z0_bus=z0_bus,
            )

        elif analysis_type == ExecutionAnalysisType.SC_2F:
            solver_result = ShortCircuitIEC60909Solver.compute_2ph_short_circuit(
                graph=solve_graph,
                fault_node_id=fault_node_id,
                c_factor=c_factor,
                tk_s=tk_s,
                tb_s=tb_s,
            )

        else:
            raise ShortCircuitBindingError(f"Nieobsługiwany typ analizy: {analysis_type.value}")

    except (ValueError, ZeroDivisionError, np.linalg.LinAlgError) as exc:
        raise ShortCircuitBindingError(
            f"Błąd solvera zwarciowego ({sc_type.value}): {exc}"
        ) from exc

    logger.info(
        "Short-circuit binding completed: Ik''=%.2f A, Ip=%.2f A, Sk=%.2f MVA",
        solver_result.ikss_a,
        solver_result.ip_a,
        solver_result.sk_mva,
    )

    return ShortCircuitBindingResult(
        solver_result=solver_result,
        analysis_type=analysis_type,
        fault_node_id=fault_node_id,
        scenario=scenario,
        c_factor_auto=c_factor_auto,
        c_factor_override=c_factor_override,
        temperature_correction_notes=temperature_correction_notes,
    )


def wynik_zwarcia_1f_ze_snapshotu(
    *,
    snapshot: dict[str, Any],
    fault_node_id: str,
    c_factor: float,
    tk_s: float,
) -> ShortCircuitResult:
    """FROZEN wynik zwarcia 1F ze snapshotu ENM — impedancje składowe Z1/Z2/Z0.

    PO CO TA FUNKCJA (2026-08-07, naprawa czerwonej bramki po karcie PACK-DOWODY).
    Pakiet dowodowy zwarć niesymetrycznych potrzebuje Z1/Z2/Z0, a sieć zerową
    liczy WYŁĄCZNIE wariant jednofazowy — przebieg 3F ich nie produkuje, więc
    pakiet musi je wyznaczyć. Dotąd robił to SAM: budował graf, składał macierz
    zerową i wołał solver z własnego modułu. Łamało to naraz dwie reguły:

    1. `no_direct_fault_params_guard` — parametry zwarcia wchodziły do warstwy
       solvera spoza warstwy wiązania (CI czerwone: `sc_asymmetrical.py:252`).
       Dopisanie pliku do zapadki `LEGACY_DIRECT_SOLVER_CALLERS` byłoby
       POSZERZENIEM wyjątku, nie naprawą: zapadka trzyma stan ZAMROŻONY
       2026-08-01, a ten plik powstał w sierpniu 2026 i legacy nie jest.
    2. Proof Engine liczył FIZYKĘ. Kanon (`CLAUDE.md`, „Proof Engine reads
       results READ-ONLY", „pure interpretation") stawia pakiety dowodowe w roli
       INTERPRETACJI wyniku, nie jego producenta.

    Tu fizyka wraca na swoje miejsce: mapowanie snapshotu, macierz zerowa i
    wejście w solver dzieją się w warstwie wiązania, a pakiet dostaje gotowy
    FROZEN wynik i tylko go opisuje.

    DETERMINIZM: `tb_s` zostaje domyślne solvera (0,1 s) — dokładnie ta sama
    wartość, którą podaje jawnie `execute_short_circuit`, więc przeniesienie
    wywołania nie zmienia ani jednej cyfry wyniku.
    """
    from enm.mapping import build_zero_sequence_zbus, map_enm_to_network_graph
    from enm.models import EnergyNetworkModel

    enm = EnergyNetworkModel.model_validate(snapshot)
    graph = map_enm_to_network_graph(enm)
    return ShortCircuitIEC60909Solver.compute_1ph_short_circuit(
        graph=graph,
        fault_node_id=fault_node_id,
        c_factor=c_factor,
        tk_s=tk_s,
        z0_bus=build_zero_sequence_zbus(enm, graph),
    )


@dataclass(frozen=True)
class ZwarcieZeSnapshotu:
    """FROZEN wynik zwarcia razem z grafem, na którym powstał.

    Graf wraca do wołającego CELOWO: rozbicie per-maszyna (`compute_machine_contributions`)
    musi liczyć się na TYM SAMYM grafie co zwarcie. Zbudowanie drugiego z tego samego
    snapshotu dałoby dziś ten sam obiekt, ale byłyby to DWA źródła prawdy, które
    rozjadą się przy pierwszej zmianie mapowania (reguła KLASA §3 — predykaty parami
    z jednego źródła).
    """

    wynik: ShortCircuitResult
    graf: NetworkGraph


def zwarcie_3f_ze_snapshotu(
    *,
    snapshot: dict[str, Any],
    fault_node_id: str,
    c_factor: float,
    tk_s: float,
) -> ZwarcieZeSnapshotu:
    """FROZEN wynik zwarcia 3F ze snapshotu ENM — dla pakietu dowodowego SC3F.

    Bliźniak `wynik_zwarcia_1f_ze_snapshotu`, domykający KLASĘ (dług
    PACK-SC3F-WIAZANIE, nazwany przy naprawie pakietu niesymetrycznego 2026-08-07).
    Powód ten sam: pakiet dowodowy ma OPISYWAĆ wynik, nie produkować go — mapowanie
    snapshotu i wejście w solver należą do warstwy wiązania.

    DETERMINIZM: `tb_s` zostaje domyślne solvera, dokładnie jak w wywołaniu, które ta
    funkcja zastąpiła — ani jedna cyfra dowodu SC3F się nie zmienia.
    """
    from enm.mapping import map_enm_to_network_graph
    from enm.models import EnergyNetworkModel

    graph = map_enm_to_network_graph(EnergyNetworkModel.model_validate(snapshot))
    return ZwarcieZeSnapshotu(
        wynik=ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id=fault_node_id,
            c_factor=c_factor,
            tk_s=tk_s,
        ),
        graf=graph,
    )
