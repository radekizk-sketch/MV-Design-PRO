from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime


@dataclass(frozen=True)
class BlockerRef:
    id: str | None
    identifier: str | None
    state: str | None


@dataclass(frozen=True)
class Issue:
    id: str
    identifier: str
    title: str
    description: str | None
    priority: int | None
    state: str
    branch_name: str | None
    url: str | None
    labels: tuple[str, ...] = ()
    blocked_by: tuple[BlockerRef, ...] = ()
    created_at: datetime | None = None
    updated_at: datetime | None = None

    def with_normalized_labels(self) -> Issue:
        normalized_labels = tuple(sorted({label.strip().lower() for label in self.labels if label.strip()}))
        return Issue(
            id=self.id,
            identifier=self.identifier,
            title=self.title,
            description=self.description,
            priority=self.priority,
            state=self.state,
            branch_name=self.branch_name,
            url=self.url,
            labels=normalized_labels,
            blocked_by=self.blocked_by,
            created_at=self.created_at,
            updated_at=self.updated_at,
        )


@dataclass(frozen=True)
class Workspace:
    path: str
    workspace_key: str
    created_now: bool


@dataclass(frozen=True)
class RunAttempt:
    issue_id: str
    issue_identifier: str
    attempt: int | None
    workspace_path: str
    started_at: datetime
    status: str
    error: str | None = None


@dataclass
class LiveSession:
    session_id: str
    thread_id: str
    turn_id: str
    codex_app_server_pid: str | None = None
    last_codex_event: str | None = None
    last_codex_timestamp: datetime | None = None
    last_codex_message: str | None = None
    codex_input_tokens: int = 0
    codex_output_tokens: int = 0
    codex_total_tokens: int = 0
    last_reported_input_tokens: int = 0
    last_reported_output_tokens: int = 0
    last_reported_total_tokens: int = 0
    turn_count: int = 0


@dataclass
class RetryEntry:
    issue_id: str
    identifier: str
    attempt: int
    due_at_ms: int
    error: str | None = None


@dataclass
class RuntimeState:
    active_issue_ids: set[str] = field(default_factory=set)
    pending_retries: dict[str, RetryEntry] = field(default_factory=dict)
    attempts_by_issue_id: dict[str, int] = field(default_factory=dict)
    last_tick_at: datetime | None = None

    def mark_tick(self) -> None:
        self.last_tick_at = datetime.now(UTC)
