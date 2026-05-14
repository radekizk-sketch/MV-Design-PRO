from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from datetime import UTC, datetime

from application.symphony.config import SymphonyConfig
from application.symphony.models import Issue, RetryEntry, RunAttempt, RuntimeState
from application.symphony.prompt import render_prompt
from application.symphony.protocols import AgentRunner, IssueTrackerClient
from application.symphony.workspace import WorkspaceManager

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class DispatchDecision:
    issue_id: str
    identifier: str
    dispatched: bool
    reason: str


class SymphonyOrchestrator:
    """Spec-aligned orchestration core.

    Responsibilities:
    - poll tracker
    - pick eligible issues with priority ordering
    - enforce max concurrency
    - run retry backoff queue
    - reconcile active runs with latest tracker states
    """

    def __init__(
        self,
        config: SymphonyConfig,
        workflow_prompt_template: str,
        tracker_client: IssueTrackerClient,
        agent_runner: AgentRunner,
        workspace_manager: WorkspaceManager,
    ) -> None:
        self._config = config
        self._prompt_template = workflow_prompt_template
        self._tracker = tracker_client
        self._agent_runner = agent_runner
        self._workspace_manager = workspace_manager
        self.state = RuntimeState()

    def startup_cleanup(self) -> int:
        terminal_issues = self._tracker.list_terminal_issues(self._config.terminal_states)
        cleaned = 0
        for issue in terminal_issues:
            if self._workspace_manager.cleanup_terminal_workspace(issue.identifier):
                cleaned += 1
        return cleaned

    def tick(self) -> list[DispatchDecision]:
        self.state.mark_tick()
        self._reconcile_active_runs()
        self._release_due_retries()

        issues = self._tracker.list_candidate_issues(self._config.active_states)
        ranked_issues = self._rank_candidate_issues(issues)
        available_slots = max(0, self._config.max_concurrency - len(self.state.active_issue_ids))

        decisions: list[DispatchDecision] = []
        for issue in ranked_issues:
            if available_slots <= 0:
                decisions.append(
                    DispatchDecision(issue.id, issue.identifier, False, "concurrency-limit")
                )
                continue
            decision = self._try_dispatch(issue)
            decisions.append(decision)
            if decision.dispatched:
                available_slots -= 1
        return decisions

    def _rank_candidate_issues(self, issues: list[Issue]) -> list[Issue]:
        normalized = [issue.with_normalized_labels() for issue in issues]

        def sort_key(issue: Issue) -> tuple[int, datetime, str]:
            priority = issue.priority if issue.priority is not None else 9999
            created = issue.created_at or datetime.max.replace(tzinfo=UTC)
            return (priority, created, issue.identifier)

        return sorted(normalized, key=sort_key)

    def _try_dispatch(self, issue: Issue) -> DispatchDecision:
        if issue.id in self.state.active_issue_ids:
            return DispatchDecision(issue.id, issue.identifier, False, "already-active")
        if issue.id in self.state.pending_retries:
            return DispatchDecision(issue.id, issue.identifier, False, "waiting-retry")
        if self._is_blocked(issue):
            return DispatchDecision(issue.id, issue.identifier, False, "blocked")
        if len(self.state.active_issue_ids) >= self._config.max_concurrency:
            return DispatchDecision(issue.id, issue.identifier, False, "concurrency-limit")

        self._dispatch(issue)
        return DispatchDecision(issue.id, issue.identifier, True, "started")

    def _is_blocked(self, issue: Issue) -> bool:
        return any(blocker.state not in self._config.terminal_states for blocker in issue.blocked_by)

    def _dispatch(self, issue: Issue) -> None:
        self.state.active_issue_ids.add(issue.id)
        current_attempt = self.state.attempts_by_issue_id.get(issue.id)
        workspace = self._workspace_manager.ensure_workspace(issue.identifier)
        started_at = datetime.now(UTC)
        run_attempt = RunAttempt(
            issue_id=issue.id,
            issue_identifier=issue.identifier,
            attempt=current_attempt,
            workspace_path=workspace.path,
            started_at=started_at,
            status="running",
        )
        try:
            prompt = render_prompt(self._prompt_template, issue, current_attempt)
            result = self._agent_runner.run_attempt(run_attempt, prompt)
        finally:
            self.state.active_issue_ids.discard(issue.id)

        if result.status == "success":
            self.state.attempts_by_issue_id.pop(issue.id, None)
            self.state.pending_retries.pop(issue.id, None)
            return

        self._schedule_retry(issue, error=result.error)

    def _schedule_retry(self, issue: Issue, error: str | None) -> None:
        current_attempt = self.state.attempts_by_issue_id.get(issue.id, 0) + 1
        self.state.attempts_by_issue_id[issue.id] = current_attempt
        if current_attempt > self._config.retry_max_attempts:
            logger.warning("Retry limit exceeded for %s", issue.identifier)
            return

        delay_s = min(
            self._config.retry_base_delay_seconds * (2 ** (current_attempt - 1)),
            self._config.retry_max_delay_seconds,
        )
        due_at_ms = int(time.monotonic() * 1000) + (delay_s * 1000)
        self.state.pending_retries[issue.id] = RetryEntry(
            issue_id=issue.id,
            identifier=issue.identifier,
            attempt=current_attempt,
            due_at_ms=due_at_ms,
            error=error,
        )

    def _release_due_retries(self) -> None:
        now_ms = int(time.monotonic() * 1000)
        due_issue_ids = [
            issue_id
            for issue_id, entry in self.state.pending_retries.items()
            if entry.due_at_ms <= now_ms
        ]
        for issue_id in due_issue_ids:
            self.state.pending_retries.pop(issue_id, None)

    def _reconcile_active_runs(self) -> None:
        if not self.state.active_issue_ids:
            return
        current_states = self._tracker.get_issue_states(list(self.state.active_issue_ids))
        to_stop: list[str] = []
        for issue_id in self.state.active_issue_ids:
            state = current_states.get(issue_id)
            if state is None or state not in self._config.active_states:
                to_stop.append(issue_id)

        for issue_id in to_stop:
            self._agent_runner.stop_issue(issue_id)
            self.state.active_issue_ids.discard(issue_id)
