from __future__ import annotations

import pytest
from application.designer.actions import Action, ActionType
from application.designer.context import ProjectContext
from application.designer.engine import run
from application.designer.errors import BlockedActionError, NotImplementedActionError
from application.designer.messages import BlockedCode
from application.designer.state import ProjectState


def _context(network_complete: bool, results: set[ActionType] | None = None) -> ProjectContext:
    state = ProjectState(
        available_results=results or set(),
        completeness_flags={"network_complete": network_complete},
    )
    return ProjectContext(state=state)


def test_run_blocks_incomplete_network() -> None:
    action = Action(action_type=ActionType.SHORT_CIRCUIT, label="Run Short-Circuit")

    with pytest.raises(BlockedActionError) as exc:
        run(action, _context(network_complete=False))

    assert exc.value.reason.code == BlockedCode.NETWORK_INCOMPLETE


def test_run_analysis_not_implemented() -> None:
    action = Action(action_type=ActionType.ANALYSIS, label="Run Analysis")

    with pytest.raises(NotImplementedActionError):
        run(action, _context(network_complete=True, results={ActionType.POWER_FLOW}))


def test_run_requests_solver_action() -> None:
    action = Action(action_type=ActionType.POWER_FLOW, label="Run Power Flow")

    result = run(action, _context(network_complete=True))

    assert result.status == "REQUESTED"
    assert result.action_type == ActionType.POWER_FLOW
