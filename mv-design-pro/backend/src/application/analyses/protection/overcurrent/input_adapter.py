from __future__ import annotations

from typing import Any

from application.analyses.protection.overcurrent.inputs import ProtectionInput
from network_model.solvers.short_circuit_core import ShortCircuitType
from network_model.solvers.short_circuit_iec60909 import ShortCircuitResult


def build_protection_input(
    sc_result: ShortCircuitResult,
    *,
    case_id: str | None,
    base_snapshot_id: str | None,
    connection_node: dict[str, Any],
    topology_ref: dict[str, Any] | None,
) -> ProtectionInput:
    return ProtectionInput(
        case_id=case_id,
        base_snapshot_id=base_snapshot_id,
        connection_node=connection_node,
        fault_levels=_build_fault_levels(sc_result),
        topology_ref=topology_ref,
        source_run_id=_resolve_source_run_id(sc_result),
    )


# Granica biegu minimalnego/maksymalnego wg współczynnika napięciowego c
# (IEC 60909-0, Tabela 1): c_max ≥ 1,0 → gałąź maksymalna (wytrzymałość
# aparatury), c_min < 1,0 → gałąź minimalna (czułość zabezpieczeń).
_C_MIN_UPPER_BOUND = 1.0


def _build_fault_levels(sc_result: ShortCircuitResult) -> dict[str, Any]:
    """Poziomy zwarciowe dla doboru nastaw — z ROZRÓŻNIENIEM gałęzi min/max.

    V12K-189: adapter wystawiał wyłącznie ``ik_max_3ph``, a kalkulator nastaw
    czytał ``ik_min_3ph`` — klucz, którego NIGDY nie było. Nastawa bezzwłoczna
    I>> (50) zawsze wpadała więc w wartość zastępczą (5× nastawa rozruchowa), co
    ukrywało rozjazd kontraktu między producentem a konsumentem danych. Po
    usunięciu wartości zastępczych rozjazd ujawnił się natychmiast.

    Nastawę I>> wyznacza się od prądu zwarciowego MINIMALNEGO (zabezpieczenie ma
    zadziałać także przy najsłabszym zwarciu), a wytrzymałość aparatury sprawdza
    prądem MAKSYMALNYM — to dwa różne biegi tego samego solvera, rozróżniane
    współczynnikiem ``c``. Wynik trafia więc do klucza odpowiadającego swojej
    gałęzi; klucz drugiej gałęzi zostaje ``None`` (uczciwy brak, nie podstawienie).
    """
    fault_levels: dict[str, Any] = {
        "ik_max_3ph": None,
        "ik_min_3ph": None,
        "ik_max_1ph": None,
        "ik_min_1ph": None,
        "ip": sc_result.ip_a,
        "ith": sc_result.ith_a,
        "sk": sc_result.sk_mva,
        "c_factor": float(sc_result.c_factor),
    }
    is_min_branch = float(sc_result.c_factor) < _C_MIN_UPPER_BOUND
    if sc_result.short_circuit_type == ShortCircuitType.THREE_PHASE:
        fault_levels["ik_min_3ph" if is_min_branch else "ik_max_3ph"] = sc_result.ikss_a
    if sc_result.short_circuit_type == ShortCircuitType.SINGLE_PHASE_GROUND:
        fault_levels["ik_min_1ph" if is_min_branch else "ik_max_1ph"] = sc_result.ikss_a
    return fault_levels


def _resolve_source_run_id(sc_result: ShortCircuitResult) -> str:
    for attr in ("run_id", "analysis_id"):
        value = getattr(sc_result, attr, None)
        if value:
            return str(value)
    raise ValueError("Wynik zwarciowy nie zawiera identyfikatora biegu (run_id/analysis_id).")
