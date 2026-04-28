from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from application.symphony.models import Issue, RunAttempt


class IssueTrackerClient(Protocol):
    def list_candidate_issues(self, active_states: tuple[str, ...]) -> list[Issue]: ...

    def get_issue_states(self, issue_ids: list[str]) -> dict[str, str]: ...

    def list_terminal_issues(self, terminal_states: tuple[str, ...]) -> list[Issue]: ...


@dataclass(frozen=True)
class AgentRunResult:
    status: str
    error: str | None = None


class AgentRunner(Protocol):
    def run_attempt(self, attempt: RunAttempt, prompt: str) -> AgentRunResult: ...

    def stop_issue(self, issue_id: str) -> None: ...
