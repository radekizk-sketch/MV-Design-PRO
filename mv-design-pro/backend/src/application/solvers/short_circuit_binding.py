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
from typing import Any

import numpy as np
from domain.execution import ExecutionAnalysisType
from domain.study_case import StudyCaseConfig
from network_model.core.graph import NetworkGraph
from network_model.solvers.short_circuit_core import ShortCircuitType
from network_model.solvers.short_circuit_iec60909 import (
    ShortCircuitIEC60909Solver,
    ShortCircuitResult,
)

logger = logging.getLogger(__name__)


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


def execute_short_circuit(
    *,
    graph: NetworkGraph,
    analysis_type: ExecutionAnalysisType,
    config: StudyCaseConfig,
    fault_node_id: str,
    z0_bus: np.ndarray | None = None,
) -> ShortCircuitBindingResult:
    """
    Execute a short-circuit calculation via the IEC 60909 solver.

    This is the single entry point for short-circuit binding.
    Dispatches to the correct solver method based on analysis_type.

    Args:
        graph: NetworkGraph with all elements and topology.
        analysis_type: SC_3F, SC_1F, or SC_2F.
        config: StudyCaseConfig with c_factor, thermal time, etc.
        fault_node_id: ID of the node where the fault occurs.
        z0_bus: Zero-sequence impedance matrix (required for SC_1F).

    Returns:
        ShortCircuitBindingResult wrapping the frozen solver result.

    Raises:
        ShortCircuitBindingError: If analysis_type is not a short-circuit type
            or solver encounters a fatal error.
        ValueError: Propagated from the solver for invalid parameters.
    """
    if analysis_type not in _ANALYSIS_TYPE_TO_SC_TYPE:
        raise ShortCircuitBindingError(
            f"Nieobsługiwany typ analizy zwarciowej: {analysis_type.value}"
        )

    sc_type = _ANALYSIS_TYPE_TO_SC_TYPE[analysis_type]
    c_factor = config.c_factor_max
    tk_s = config.thermal_time_seconds
    tb_s = 0.1  # IEC 60909 default breaking time

    logger.info(
        "Executing short-circuit binding: type=%s, fault_node=%s, c=%.2f, tk=%.2f",
        sc_type.value,
        fault_node_id,
        c_factor,
        tk_s,
    )

    try:
        if analysis_type == ExecutionAnalysisType.SC_3F:
            solver_result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
                graph=graph,
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
                graph=graph,
                fault_node_id=fault_node_id,
                c_factor=c_factor,
                tk_s=tk_s,
                tb_s=tb_s,
                z0_bus=z0_bus,
            )

        elif analysis_type == ExecutionAnalysisType.SC_2F:
            solver_result = ShortCircuitIEC60909Solver.compute_2ph_short_circuit(
                graph=graph,
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
