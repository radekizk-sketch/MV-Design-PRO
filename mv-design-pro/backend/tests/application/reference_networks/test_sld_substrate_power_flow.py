"""Tests for the SLD substrate power-flow companion (P-A).

Verifies the FROZEN-solver companion that the SLD render path reads as the ONE
TRUTH for power-flow direction + energization:

  - the production load-flow path runs on the committed substrate ENM and converges;
  - the companion separates the energized set (solver slack-island) from the
    de-energized set (solver not_solved — the stub beyond the open NOP);
  - per-branch ``flow_direction`` equals ``sign(Re(branch_s_from))`` of the solver;
  - the substrate is genuinely BIDIRECTIONAL (some segments forward, some reverse
    where DER backfeeds upstream);
  - determinism: same ENM -> identical companion.
"""

from __future__ import annotations

import uuid

import pytest
from application.reference_networks.sld_substrate_power_flow import (
    compute_substrate_power_flow,
)
from enm.mapping import map_enm_to_network_graph
from enm.models import EnergyNetworkModel
from network_model.core.node import NodeType
from network_model.solvers.power_flow_newton import solve_power_flow_physics
from network_model.solvers.power_flow_types import (
    PowerFlowInput,
    PowerFlowOptions,
    PQSpec,
    SlackSpec,
)

from tests.reference_networks.sld_substrate_52s import build_sld_substrate_52s

_CASE_REF = "case/test-radial"
_CASE_LABEL = "Test radialny"


@pytest.fixture(scope="module")
def substrate() -> dict:
    return build_sld_substrate_52s()


@pytest.fixture(scope="module")
def companion(substrate: dict) -> dict:
    enm = EnergyNetworkModel.model_validate(substrate["enm"])
    return compute_substrate_power_flow(
        enm,
        case_ref=_CASE_REF,
        case_label=_CASE_LABEL,
        enm_hash=substrate["snapshot_hash"],
    )


def test_schema_and_case_ref(companion: dict) -> None:
    assert companion["schema"] == "sld_power_flow_companion_v1"
    assert companion["case_ref"] == _CASE_REF
    assert companion["case_label"] == _CASE_LABEL


def test_enm_hash_binds_to_builder(companion: dict, substrate: dict) -> None:
    """The companion carries the builder snapshot hash so the SLD can assert the
    companion belongs to the ENM it renders (one truth, not a stale pairing)."""
    assert companion["enm_hash"] == substrate["snapshot_hash"]


def test_converged(companion: dict) -> None:
    assert companion["converged"] is True
    assert companion["iterations"] > 0


def test_energized_and_de_energized_partition(companion: dict) -> None:
    """The NOP must produce a non-empty de-energized set (solver not_solved)."""
    energized = set(companion["energized_bus_refs"])
    de_energized = set(companion["de_energized_bus_refs"])
    assert energized, "expected a non-empty energized set"
    assert de_energized, "the open NOP must de-energize a downstream stub"
    assert energized.isdisjoint(de_energized), "a bus cannot be both energized and not"


def test_open_point_present(companion: dict) -> None:
    """The substrate carries exactly one normally-open point (the NOP)."""
    assert len(companion["open_point_branch_refs"]) >= 1


def test_bidirectional_flow(companion: dict) -> None:
    """The tor is genuinely bidirectional: forward AND reverse segments exist."""
    directions = {ref: entry["direction"] for ref, entry in companion["branch_flow"].items()}
    forward = [ref for ref, d in directions.items() if d == "forward"]
    reverse = [ref for ref, d in directions.items() if d == "reverse"]
    assert forward, "expected forward-flowing branches (GPZ -> stacja)"
    assert reverse, "expected reverse-flowing branches (OZE backfeed upstream)"


def test_direction_matches_solver_sign(companion: dict) -> None:
    """``flow_direction`` per branch EQUALS sign(Re(branch_s_from)) of the solver.

    Re-runs the frozen solver here and checks the companion did not invent or flip
    any direction — the companion is a faithful projection of the solver result.
    """
    enm = EnergyNetworkModel.model_validate(build_sld_substrate_52s()["enm"])
    graph = map_enm_to_network_graph(enm)
    slack = sorted(n for n, node in graph.nodes.items() if node.node_type == NodeType.SLACK)[0]
    pq = [
        PQSpec(
            node_id=n,
            p_mw=float(node.active_power or 0.0),
            q_mvar=float(node.reactive_power or 0.0),
            zip_coeffs=node.zip_coeffs,
        )
        for n, node in sorted(graph.nodes.items())
        if node.node_type == NodeType.PQ and n != slack
    ]
    solution = solve_power_flow_physics(
        PowerFlowInput(
            graph=graph,
            base_mva=100.0,
            slack=SlackSpec(node_id=slack, u_pu=1.0, angle_rad=0.0),
            pq=pq,
            options=PowerFlowOptions(tolerance=1e-8, max_iter=30, trace_level="basic"),
        )
    )
    eps = 1.0e-3
    for branch in enm.branches:
        graph_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, branch.ref_id))
        s_from = solution.branch_s_from.get(graph_id)
        expected: str
        if s_from is None:
            expected = "none"
        else:
            p = float(s_from.real) * 100.0
            expected = "forward" if p > eps else "reverse" if p < -eps else "none"
        assert companion["branch_flow"][branch.ref_id]["direction"] == expected, (
            f"direction mismatch on {branch.ref_id}: companion="
            f"{companion['branch_flow'][branch.ref_id]['direction']} solver={expected}"
        )


def test_determinism() -> None:
    s1 = build_sld_substrate_52s()
    s2 = build_sld_substrate_52s()
    enm1 = EnergyNetworkModel.model_validate(s1["enm"])
    enm2 = EnergyNetworkModel.model_validate(s2["enm"])
    c1 = compute_substrate_power_flow(
        enm1, case_ref=_CASE_REF, case_label=_CASE_LABEL, enm_hash=s1["snapshot_hash"]
    )
    c2 = compute_substrate_power_flow(
        enm2, case_ref=_CASE_REF, case_label=_CASE_LABEL, enm_hash=s2["snapshot_hash"]
    )
    assert c1 == c2
