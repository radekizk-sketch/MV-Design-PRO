"""Zastępstwo `application/reference_networks/benchmark_wiring.py` (karta K2, 2026-09-09).

Kontrola jakości zdolności WYCOFANEJ `V126AnalysisType.BENCHMARK_VALIDATION`
(rejestr wycofań projektanta: `tests/ci/test_v126_rodzaje_parytet.py::
KONTROLA_JAKOSCI_WYCOFANYCH["benchmark_validation"]` wskazuje na
`test_ieee_benchmark_wiring.py`, konsumenta tego modułu).

Buduje wiersze `benchmark_references` (network/test/reference/calculated/
tolerance_percent/proof_type/solver) konsumowane przez
`V126AcademicSolver._benchmark_validation` — TĄ SAMĄ infrastrukturą co
wyrocznia (a) (`test_wyrocznia_a_expected_json.py`, K1.3 „USE, don't copy"):
sieć budują `tests/golden/enm_builders/*.py` (operacje domenowe), ``reference``
= pandapower (niezależny, `expected/*.json`), ``calculated`` = PRODUKCYJNY,
kanoniczny `power_flow_newton` przez `enm/canonical_analysis.py::
_execute_power_flow` — NIGDY dialekt.

Dawny `benchmark_wiring.py` niósł DWA tory: (1) harness — WŁASNY Newton-Raphson
dialektu benchmarków (`application/reference_networks/computation.py`,
`_power_flow_newton_raphson`) i (2) produkcyjny — `frozen_solver_input.py` +
`power_flow_newton.solve_power_flow_physics` na dialekcie słownikowym
(`application/reference_networks/library.py`). Karta K2 skasowała CAŁY dialekt
w całości (`builders/`, `computation.py`, `frozen_solver_input.py`,
`library.py`) razem z `test_ieee_benchmark_wiring.py::TestIeeeBenchmarkWiring`
(tor harness — porównywał DWIE homegrown implementacje NR ze sobą, żadna z
nich produkcyjna; ten tor bez sensu bez drugiego uczestnika, `computation.py`).
Zostaje WYŁĄCZNIE tor (2), przepięty na ENM-bliźniaki + tor kanoniczny —
`TestIeeeFrozenSolverBenchmarkWiring` w `test_ieee_benchmark_wiring.py` niżej.
"""

from __future__ import annotations

import importlib
from typing import Any

from enm.canonical_analysis import _execute_power_flow
from enm.models import EnergyNetworkModel

from tests.golden.parytet_benchmarkow.expected_values import load_expected_values_from_json
from tests.golden.parytet_benchmarkow.test_wyrocznia_a_expected_json import (
    _EXPECTED_DIR,
    _actual_pf_buses,
    _bieg,
)

#: Proof type ogłaszany solverowi akademickiemu / raportowi K-09 — ten sam
#: napis co dawny `benchmark_wiring.FROZEN_SOLVER_CROSS_VALIDATION_PROOF_TYPE`
#: (kontrakt `V126AcademicSolver._benchmark_validation` nie zmienił się).
FROZEN_SOLVER_CROSS_VALIDATION_PROOF_TYPE = (
    "cross_validation_production_power_flow_newton_vs_pandapower"
)

#: IEEE networks z komitowanymi referencjami pandapower — te same trzy co dawny
#: `benchmark_wiring.IEEE_CROSS_VALIDATION_NETWORK_IDS`.
IEEE_CROSS_VALIDATION_NETWORK_IDS: tuple[str, ...] = ("ieee-9bus", "ieee-14bus", "ieee-39bus")

#: Domyślna brama akceptacji dla porównania |V| per szyna (0,5 %) — jak dawniej.
_DEFAULT_TOLERANCE_PERCENT = 0.5

_BUDOWNICZOWIE: dict[str, tuple[str, str]] = {
    "ieee-9bus": ("tests.golden.enm_builders.ieee_9bus", "build_ieee_9bus_enm"),
    "ieee-14bus": ("tests.golden.enm_builders.ieee_14bus", "build_ieee_14bus_enm"),
    "ieee-39bus": ("tests.golden.enm_builders.ieee_39bus", "build_ieee_39bus_enm"),
}
_PLIKI_EXPECTED: dict[str, str] = {
    "ieee-9bus": "ieee_9bus.json",
    "ieee-14bus": "ieee_14bus.json",
    "ieee-39bus": "ieee_39bus.json",
}


def _zbuduj_siec(network_id: str) -> Any:
    modul, atrybut = _BUDOWNICZOWIE[network_id]
    budowniczy = getattr(importlib.import_module(modul), atrybut)
    return budowniczy()


def build_ieee_frozen_solver_benchmark_references(
    network_ids: tuple[str, ...] = IEEE_CROSS_VALIDATION_NETWORK_IDS,
    *,
    tolerance_percent: float = _DEFAULT_TOLERANCE_PERCENT,
) -> list[dict[str, Any]]:
    """Wiersze ``benchmark_references``: PRODUKCYJNY ``power_flow_newton`` vs pandapower.

    Dla każdej sieci: (1) zbuduj ENM-bliźniak (operacje domenowe), (2) policz
    torem kanonicznym (`enm/canonical_analysis.py::_execute_power_flow`), (3)
    porównaj |V| na każdej szynie z komitowaną referencją pandapower
    (`expected/*.json`). ``test`` jest prefiksowany ``PF_prod_|V|_<bus>``, żeby
    dowód nazwał solver, który waliduje.
    """
    rows: list[dict[str, Any]] = []
    for network_id in network_ids:
        result = _zbuduj_siec(network_id)
        validated = EnergyNetworkModel.model_validate(result.enm)
        bus_kv_by_ref = {b.ref_id: b.voltage_kv for b in validated.buses}
        snapshot = validated.model_dump(mode="json")
        run = _bieg(snapshot, "PF", {"base_mva": 100.0})
        _execute_power_flow(run)
        raw_result = dict(run.raw_result)
        raw_result["_bus_kv_by_ref"] = bus_kv_by_ref
        actual_buses = _actual_pf_buses(result.bus_map, raw_result)

        expected = load_expected_values_from_json(_EXPECTED_DIR / _PLIKI_EXPECTED[network_id])
        for bus in expected.power_flow:
            actual = actual_buses.get(bus.bus_id)
            if actual is None or actual.get("v_pu") is None:
                continue
            rows.append(
                {
                    "network": network_id,
                    "test": f"PF_prod_|V|_{bus.bus_id}",
                    "reference": bus.v_pu,  # pandapower (niezależny)
                    "calculated": float(actual["v_pu"]),  # produkcyjny power_flow_newton
                    "tolerance_percent": tolerance_percent,
                    "proof_type": FROZEN_SOLVER_CROSS_VALIDATION_PROOF_TYPE,
                    "solver": "power_flow_newton",
                }
            )
    return rows
