"""
K-04 / K-09 wiring: build real cross-validation benchmark references.

This module turns the committed IEEE case9/14/39 references (independent
pandapower power-flow results) plus OUR Newton-Raphson output into the
``benchmark_references`` rows consumed by
``V126AcademicSolver._benchmark_validation``.

This is the bridge that flips K-04 to VALIDATED and gives K-09 a REAL proof
(``cross_validation_vs_pandapower_independent_reference``) instead of the
"dane niekompletne" path: the ``reference`` value comes from pandapower (NOT our
solver) and ``calculated`` comes from our solver, so a PASS verdict means two
independent implementations agree — never a tautology.

No pandapower import here: the reference values are read from the committed
``expected/ieee_<n>bus.json`` files.
"""

from __future__ import annotations

import math
from typing import Any

from application.reference_networks.computation import _power_flow_newton_raphson
from application.reference_networks.expected_values import load_expected_values_from_json
from application.reference_networks.frozen_solver_input import build_frozen_power_flow_input
from application.reference_networks.library import get_reference_network
from network_model.solvers.power_flow_newton import solve_power_flow_physics

# Proof types advertised to the academic solver / K-09 report. They differ by the
# solver each row validates, so K-04 makes explicit WHICH implementation agreed
# with pandapower:
#   - the reference-harness NR (application/reference_networks/computation.py), and
#   - the PRODUCTION load-flow solver
#     (network_model/solvers/power_flow_newton.solve_power_flow_physics) — the one
#     a real K-04 must certify.
CROSS_VALIDATION_PROOF_TYPE = "cross_validation_vs_pandapower_independent_reference"
FROZEN_SOLVER_CROSS_VALIDATION_PROOF_TYPE = (
    "cross_validation_production_power_flow_newton_vs_pandapower"
)

# IEEE networks with committed pandapower power-flow references.
IEEE_CROSS_VALIDATION_NETWORK_IDS: tuple[str, ...] = (
    "ieee-9bus",
    "ieee-14bus",
    "ieee-39bus",
)

# Default acceptance gate for the per-bus |V| cross-validation (0.5 %).
_DEFAULT_TOLERANCE_PERCENT = 0.5
_SOLVER_TOLERANCE = 1e-10


def build_ieee_benchmark_references(
    network_ids: tuple[str, ...] = IEEE_CROSS_VALIDATION_NETWORK_IDS,
    *,
    tolerance_percent: float = _DEFAULT_TOLERANCE_PERCENT,
) -> list[dict[str, Any]]:
    """Build ``benchmark_references`` rows from committed refs + the HARNESS NR.

    This validates the reference-harness Newton-Raphson in
    ``application/reference_networks/computation.py`` (NOT the production solver —
    see :func:`build_ieee_frozen_solver_benchmark_references` for that).

    For each registered IEEE network this:
      1. loads the committed pandapower reference (``reference`` values),
      2. runs the harness Newton-Raphson on the committed ENM (``calculated``),
      3. emits one row per bus (test ``"PF_|V|_<bus>"``).

    Each row carries ``proof_type = CROSS_VALIDATION_PROOF_TYPE`` so the verdict
    is recorded as an independent cross-validation, not a self-referential check.
    """
    rows: list[dict[str, Any]] = []
    for network_id in network_ids:
        net = get_reference_network(network_id)
        expected = load_expected_values_from_json(net.expected_path)
        result = _power_flow_newton_raphson(
            net.builder_fn(), tolerance=_SOLVER_TOLERANCE, max_iterations=60
        )
        buses = result["buses"]
        for bus in expected.power_flow:
            calculated = buses.get(bus.bus_id, {}).get("v_pu")
            if calculated is None:
                continue
            rows.append(
                {
                    "network": network_id,
                    "test": f"PF_|V|_{bus.bus_id}",
                    "reference": bus.v_pu,  # pandapower (independent)
                    "calculated": float(calculated),  # harness NR
                    "tolerance_percent": tolerance_percent,
                    "proof_type": CROSS_VALIDATION_PROOF_TYPE,
                }
            )
    return rows


def build_ieee_frozen_solver_benchmark_references(
    network_ids: tuple[str, ...] = IEEE_CROSS_VALIDATION_NETWORK_IDS,
    *,
    tolerance_percent: float = _DEFAULT_TOLERANCE_PERCENT,
) -> list[dict[str, Any]]:
    """Build ``benchmark_references`` rows from committed refs + the PRODUCTION solver.

    This is the row set a real K-04 cares about: ``calculated`` comes from the
    PRIMARY production load-flow solver
    ``network_model.solvers.power_flow_newton.solve_power_flow_physics`` (built
    READ-ONLY from the committed ENM via :mod:`frozen_solver_input`), and
    ``reference`` comes from pandapower. Each row carries
    ``proof_type = FROZEN_SOLVER_CROSS_VALIDATION_PROOF_TYPE`` and a
    ``solver = "power_flow_newton"`` marker, and the ``test`` field is prefixed
    ``PF_prod_|V|_<bus>`` so the proof states which solver it validates.
    """
    rows: list[dict[str, Any]] = []
    for network_id in network_ids:
        net = get_reference_network(network_id)
        expected = load_expected_values_from_json(net.expected_path)
        pf_input = build_frozen_power_flow_input(net.builder_fn(), tolerance=_SOLVER_TOLERANCE)
        solution = solve_power_flow_physics(pf_input)
        for bus in expected.power_flow:
            calculated = solution.node_u_mag.get(bus.bus_id)
            if calculated is None or math.isnan(calculated):
                continue
            rows.append(
                {
                    "network": network_id,
                    "test": f"PF_prod_|V|_{bus.bus_id}",
                    "reference": bus.v_pu,  # pandapower (independent)
                    "calculated": float(calculated),  # production power_flow_newton
                    "tolerance_percent": tolerance_percent,
                    "proof_type": FROZEN_SOLVER_CROSS_VALIDATION_PROOF_TYPE,
                    "solver": "power_flow_newton",
                }
            )
    return rows


def build_ieee_all_benchmark_references(
    network_ids: tuple[str, ...] = IEEE_CROSS_VALIDATION_NETWORK_IDS,
    *,
    tolerance_percent: float = _DEFAULT_TOLERANCE_PERCENT,
) -> list[dict[str, Any]]:
    """Combined K-04 feed: harness-NR rows AND production-solver rows.

    Both implementations are cross-validated against the same committed
    pandapower references. Each row is tagged with its own ``proof_type`` (and
    the production rows additionally carry ``solver = "power_flow_newton"``), so
    the K-04 proof makes explicit which solver each row validates.
    """
    return [
        *build_ieee_benchmark_references(network_ids, tolerance_percent=tolerance_percent),
        *build_ieee_frozen_solver_benchmark_references(
            network_ids, tolerance_percent=tolerance_percent
        ),
    ]
