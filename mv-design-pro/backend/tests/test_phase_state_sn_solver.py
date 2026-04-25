from __future__ import annotations

import pytest
from network_model.solvers.phase_state_sn import (
    OpenPhaseFlags,
    PhaseStateSNInput,
    PhaseStateSNSolver,
    PhaseValues,
)


def _build_balanced_input() -> PhaseStateSNInput:
    return PhaseStateSNInput(
        source_voltage_kv=PhaseValues(8.66, 8.66, 8.66),
        load_current_a=PhaseValues(100.0, 100.0, 100.0),
        branch_resistance_ohm=PhaseValues(0.1, 0.1, 0.1),
    )


def _build_faulted_open_phase_input() -> PhaseStateSNInput:
    return PhaseStateSNInput(
        source_voltage_kv=PhaseValues(8.66, 8.66, 8.66),
        load_current_a=PhaseValues(100.0, 100.0, 100.0),
        branch_resistance_ohm=PhaseValues(0.1, 0.1, 0.1),
        fault_current_a=PhaseValues(20.0, 0.0, 0.0),
        open_phase=OpenPhaseFlags(c=True),
        unbalance_alert_percent=10.0,
    )


def test_phase_state_sn_solver_balanced_reference_case() -> None:
    result = PhaseStateSNSolver.solve(_build_balanced_input())

    assert result.ua_kv == pytest.approx(8.65)
    assert result.ub_kv == pytest.approx(8.65)
    assert result.uc_kv == pytest.approx(8.65)
    assert result.ia_a == pytest.approx(100.0)
    assert result.ib_a == pytest.approx(100.0)
    assert result.ic_a == pytest.approx(100.0)
    assert result.phase_losses_kw.to_dict() == {
        "A": pytest.approx(1.0),
        "B": pytest.approx(1.0),
        "C": pytest.approx(1.0),
    }
    assert result.unbalance_indices.voltage_percent == pytest.approx(0.0)
    assert result.unbalance_indices.current_percent == pytest.approx(0.0)
    assert result.unbalance_indices.losses_percent == pytest.approx(0.0)
    assert result.flags.to_dict() == {
        "has_fault": False,
        "has_open_phase": False,
        "faulted_phases": [],
        "open_phases": [],
        "voltage_unbalance_alert": False,
        "current_unbalance_alert": False,
        "losses_unbalance_alert": False,
    }


def test_phase_state_sn_solver_fault_and_open_phase_are_reflected_in_outputs() -> None:
    result = PhaseStateSNSolver.solve(_build_faulted_open_phase_input())

    assert result.ua_kv == pytest.approx(8.648)
    assert result.ub_kv == pytest.approx(8.65)
    assert result.uc_kv == pytest.approx(0.0)
    assert result.ia_a == pytest.approx(120.0)
    assert result.ib_a == pytest.approx(100.0)
    assert result.ic_a == pytest.approx(0.0)
    assert result.phase_losses_kw.to_dict() == {
        "A": pytest.approx(1.44),
        "B": pytest.approx(1.0),
        "C": pytest.approx(0.0),
    }
    assert result.flags.has_fault is True
    assert result.flags.has_open_phase is True
    assert result.flags.faulted_phases == ("A",)
    assert result.flags.open_phases == ("C",)
    assert result.flags.voltage_unbalance_alert is True
    assert result.flags.current_unbalance_alert is True
    assert result.flags.losses_unbalance_alert is True
    assert result.unbalance_indices.voltage_percent > 0.0
    assert result.unbalance_indices.current_percent > 0.0
    assert result.unbalance_indices.losses_percent > 0.0


def test_phase_state_sn_solver_is_deterministic_for_identical_input() -> None:
    data = _build_faulted_open_phase_input()

    first = PhaseStateSNSolver.solve(data).to_dict()
    second = PhaseStateSNSolver.solve(data).to_dict()

    assert first == second


def test_phase_state_sn_solver_rejects_negative_branch_resistance() -> None:
    data = PhaseStateSNInput(
        source_voltage_kv=PhaseValues(8.66, 8.66, 8.66),
        load_current_a=PhaseValues(100.0, 100.0, 100.0),
        branch_resistance_ohm=PhaseValues(0.1, -0.1, 0.1),
    )

    with pytest.raises(ValueError, match="branch_resistance_ohm.B must be >= 0.0"):
        PhaseStateSNSolver.solve(data)
