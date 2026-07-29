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
    _build_power_flow_input,
    compute_substrate_power_flow,
)
from enm.models import EnergyNetworkModel
from network_model.solvers.power_flow_newton import solve_power_flow_physics

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

    F9.8 note: this used to hand-duplicate the ``PQSpec`` construction inline
    (map ENM -> graph -> PQSpec by hand), which silently carried the SAME
    reversed-sign bug as production (`p_mw=float(node.active_power or 0.0)`
    without the gen->load conversion) — so the test was self-consistent WITH
    the bug and blind to it (both sides negated twice, cancelling out). It now
    reuses the single production input builder (`_build_power_flow_input`,
    already fixed at the PQSpec construction boundary in F9.8) instead of a
    second hand-rolled copy of the sign convention, so this test verifies
    wiring fidelity (does `compute_substrate_power_flow`'s direction/threshold
    logic match a raw re-solve of the SAME correct input) rather than
    re-deriving — and risking re-breaking — the sign convention itself.
    Independent, topology-derived physical proof of the correct sign (not
    dependent on any internal PQSpec convention) lives in
    ``test_shunt_capacitor_d06c.py::test_power_flow_capacitor_raises_bus_voltage``
    (absolute v_pu<1.0 behind an inductive load) and
    ``test_canonical_analysis_api.py::test_resultset_v1_load_flow_direction_and_voltage_drop_are_physically_correct``
    (p_from_mw>0 source->load and v_pu(load)<v_pu(slack) on a minimal,
    hand-verified 2-bus network).
    """
    enm = EnergyNetworkModel.model_validate(build_sld_substrate_52s()["enm"])
    pf_input, _slack = _build_power_flow_input(enm)
    solution = solve_power_flow_physics(pf_input)
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
