"""ADR-011: cross-solver parity for the ZIP load model (NR vs GS vs FD).

The strong correctness gate: on the same ZIP network all three solvers must
converge to the same voltage. reduce-to-NR byte-identity alone cannot catch a
ZIP-specific bug (it exercises a=b=0); this parity does.
"""

from __future__ import annotations

import pytest
from network_model.core.branch import BranchType, LineBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from network_model.solvers.power_flow_fast_decoupled import PowerFlowFastDecoupledSolver
from network_model.solvers.power_flow_gauss_seidel import PowerFlowGaussSeidelSolver
from network_model.solvers.power_flow_newton import solve_power_flow_physics
from network_model.solvers.power_flow_types import (
    PowerFlowInput,
    PowerFlowOptions,
    PQSpec,
    SlackSpec,
)
from network_model.solvers.power_flow_zip import ZipCoeffs

CONST_Z = ZipCoeffs(1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
CONST_I = ZipCoeffs(0.0, 1.0, 0.0, 0.0, 1.0, 0.0)


def _net() -> NetworkGraph:
    g = NetworkGraph()
    g.add_node(
        Node(
            id="A",
            name="A",
            node_type=NodeType.SLACK,
            voltage_level=10.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    g.add_node(
        Node(
            id="B",
            name="B",
            node_type=NodeType.PQ,
            voltage_level=10.0,
            active_power=0.0,
            reactive_power=0.0,
        )
    )
    g.add_branch(
        LineBranch(
            id="L",
            name="L",
            branch_type=BranchType.LINE,
            from_node_id="A",
            to_node_id="B",
            r_ohm_per_km=0.4,
            x_ohm_per_km=0.8,
            b_us_per_km=0.0,
            length_km=1.0,
            rated_current_a=300.0,
        )
    )
    return g


def _input(zc: ZipCoeffs | None, f_hz: float = 50.0) -> PowerFlowInput:
    return PowerFlowInput(
        graph=_net(),
        base_mva=10.0,
        slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
        pq=[PQSpec(node_id="B", p_mw=3.0, q_mvar=1.0, zip_coeffs=zc)],
        options=PowerFlowOptions(max_iter=200, tolerance=1e-10),
        base_frequency_hz=f_hz,
    )


def _v_all(zc: ZipCoeffs | None, f_hz: float = 50.0) -> tuple[float, float, float]:
    nr = solve_power_flow_physics(_input(zc, f_hz))
    gs = PowerFlowGaussSeidelSolver().solve(_input(zc, f_hz))
    fd = PowerFlowFastDecoupledSolver().solve(_input(zc, f_hz))
    assert nr.converged and gs.converged and fd.converged
    return nr.node_u_mag["B"], gs.node_u_mag["B"], fd.node_u_mag["B"]


@pytest.mark.parametrize("zc", [CONST_Z, CONST_I], ids=["const_Z", "const_I"])
def test_all_solvers_agree_on_zip(zc: ZipCoeffs) -> None:
    nr, gs, fd = _v_all(zc)
    assert gs == pytest.approx(nr, abs=1e-4)
    assert fd == pytest.approx(nr, abs=1e-4)


def test_all_solvers_agree_on_frequency_dependence() -> None:
    zc = ZipCoeffs(0, 0, 1, 0, 0, 1, k_pf=2.0, k_qf=1.0, f0_hz=50.0)
    nr, gs, fd = _v_all(zc, f_hz=49.0)
    assert gs == pytest.approx(nr, abs=1e-4)
    assert fd == pytest.approx(nr, abs=1e-4)


def test_zip_changes_voltage_vs_constant_power_all_solvers() -> None:
    nr_z, gs_z, fd_z = _v_all(CONST_Z)
    nr_p, gs_p, fd_p = _v_all(None)
    # const-Z sags less than constant power in every solver
    assert nr_z > nr_p and gs_z > gs_p and fd_z > fd_p
