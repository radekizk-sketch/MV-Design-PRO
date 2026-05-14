from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from application.symphony.config import SymphonyConfig
from application.symphony.image_payload import ImageAttachmentError
from application.symphony.models import BlockerRef, Issue, RunAttempt
from application.symphony.orchestrator import SymphonyOrchestrator
from application.symphony.protocols import AgentRunResult
from application.symphony.workspace import WorkspaceManager


class FakeTracker:
    def __init__(self, issues: list[Issue]) -> None:
        self.issues = issues
        self.states_by_id = {issue.id: issue.state for issue in issues}

    def list_candidate_issues(self, active_states: tuple[str, ...]) -> list[Issue]:
        return [issue for issue in self.issues if issue.state in active_states]

    def get_issue_states(self, issue_ids: list[str]) -> dict[str, str]:
        return {issue_id: self.states_by_id[issue_id] for issue_id in issue_ids if issue_id in self.states_by_id}

    def list_terminal_issues(self, terminal_states: tuple[str, ...]) -> list[Issue]:
        return [issue for issue in self.issues if issue.state in terminal_states]


@dataclass
class FakeRunner:
    results: list[AgentRunResult]
    runs: list[RunAttempt]
    stopped: list[str]

    def run_attempt(self, attempt: RunAttempt, prompt: str) -> AgentRunResult:
        self.runs.append(attempt)
        if self.results:
            return self.results.pop(0)
        return AgentRunResult(status="success")

    def stop_issue(self, issue_id: str) -> None:
        self.stopped.append(issue_id)


def _cfg(tmp_path: Path) -> SymphonyConfig:
    return SymphonyConfig(
        tracker_kind="linear",
        polling_interval_seconds=1,
        workspace_root=tmp_path / "workspaces",
        active_states=("Todo", "In Progress"),
        terminal_states=("Done",),
        max_concurrency=1,
        retry_max_attempts=2,
        retry_base_delay_seconds=1,
        retry_max_delay_seconds=8,
    )


def _issue(issue_id: str, key: str, priority: int | None, created_offset: int, state: str = "Todo") -> Issue:
    created = datetime.now(UTC) + timedelta(seconds=created_offset)
    return Issue(
        id=issue_id,
        identifier=key,
        title=key,
        description=None,
        priority=priority,
        state=state,
        branch_name=None,
        url=None,
        labels=(),
        blocked_by=(),
        created_at=created,
        updated_at=created,
    )


def test_orchestrator_dispatches_by_priority_then_created_at(tmp_path: Path) -> None:
    i1 = _issue("1", "ABC-1", priority=2, created_offset=10)
    i2 = _issue("2", "ABC-2", priority=1, created_offset=30)
    i3 = _issue("3", "ABC-3", priority=1, created_offset=5)

    tracker = FakeTracker([i1, i2, i3])
    runner = FakeRunner(results=[], runs=[], stopped=[])

    orch = SymphonyOrchestrator(_cfg(tmp_path), "Issue {issue_identifier}", tracker, runner, WorkspaceManager(_cfg(tmp_path)))
    decisions = orch.tick()

    dispatched_ids = [d.issue_id for d in decisions if d.dispatched]
    assert dispatched_ids == ["3"]
    assert runner.runs[0].issue_id == "3"


def test_orchestrator_schedules_retry_with_exponential_backoff(tmp_path: Path) -> None:
    issue = _issue("1", "ABC-1", priority=1, created_offset=0)
    tracker = FakeTracker([issue])
    runner = FakeRunner(results=[AgentRunResult(status="error", error="boom")], runs=[], stopped=[])

    orch = SymphonyOrchestrator(_cfg(tmp_path), "Issue {issue_identifier}", tracker, runner, WorkspaceManager(_cfg(tmp_path)))
    orch.tick()

    retry = orch.state.pending_retries[issue.id]
    assert retry.attempt == 1
    assert retry.error == "boom"

    # fast-forward first retry delay
    orch.state.pending_retries[issue.id] = type(retry)(
        issue_id=retry.issue_id,
        identifier=retry.identifier,
        attempt=retry.attempt,
        due_at_ms=int(time.monotonic() * 1000) - 1,
        error=retry.error,
    )
    orch._release_due_retries()
    assert issue.id not in orch.state.pending_retries


def test_orchestrator_skips_blocked_issues(tmp_path: Path) -> None:
    blocked = _issue("1", "ABC-1", priority=1, created_offset=0)
    blocked = Issue(
        **{**blocked.__dict__, "blocked_by": (BlockerRef(id="x", identifier="ABC-0", state="Todo"),)}
    )
    tracker = FakeTracker([blocked])
    runner = FakeRunner(results=[], runs=[], stopped=[])

    orch = SymphonyOrchestrator(_cfg(tmp_path), "Issue {issue_identifier}", tracker, runner, WorkspaceManager(_cfg(tmp_path)))
    decisions = orch.tick()

    assert decisions[0].reason == "blocked"
    assert not runner.runs


def test_orchestrator_rejects_empty_inline_image_before_agent_runner(tmp_path: Path) -> None:
    issue = _issue("1", "ABC-1", priority=1, created_offset=0)
    issue = Issue(
        **{
            **issue.__dict__,
            "description": "Screenshot: ![broken](data:image/png;base64,)",
        }
    )
    tracker = FakeTracker([issue])
    runner = FakeRunner(results=[], runs=[], stopped=[])

    orch = SymphonyOrchestrator(
        _cfg(tmp_path),
        "Issue {issue_identifier}\n{issue_description}",
        tracker,
        runner,
        WorkspaceManager(_cfg(tmp_path)),
    )

    with pytest.raises(ImageAttachmentError, match="issue.description"):
        orch.tick()

    assert not runner.runs
    assert issue.id not in orch.state.active_issue_ids
