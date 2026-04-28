from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from application.symphony.workflow import WorkflowDefinition


@dataclass(frozen=True)
class SymphonyConfig:
    tracker_kind: str
    polling_interval_seconds: int
    workspace_root: Path
    active_states: tuple[str, ...]
    terminal_states: tuple[str, ...]
    max_concurrency: int
    retry_max_attempts: int
    retry_base_delay_seconds: int
    retry_max_delay_seconds: int
    workspace_after_create: str | None = None
    workspace_after_reuse: str | None = None


def _string_list(payload: dict[str, Any], field: str) -> tuple[str, ...]:
    value = payload.get(field, [])
    if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
        raise ValueError(f"Config field '{field}' must be a list[str]")
    return tuple(v.strip() for v in value if v.strip())


def load_symphony_config(definition: WorkflowDefinition, repo_root: str | Path) -> SymphonyConfig:
    cfg = definition.config
    tracker = cfg.get("tracker") or {}
    polling = cfg.get("polling") or {}
    workspace = cfg.get("workspace") or {}
    hooks = cfg.get("hooks") or {}

    if tracker.get("kind") != "linear":
        raise ValueError("tracker.kind must be 'linear' for this Symphony implementation")

    polling_interval_seconds = int(polling.get("interval_seconds", 30))
    max_concurrency = int(polling.get("max_concurrency", 1))
    retry_max_attempts = int(polling.get("retry_max_attempts", 3))
    retry_base_delay_seconds = int(polling.get("retry_base_delay_seconds", 10))
    retry_max_delay_seconds = int(polling.get("retry_max_delay_seconds", 300))

    if polling_interval_seconds <= 0:
        raise ValueError("polling.interval_seconds must be > 0")
    if max_concurrency <= 0:
        raise ValueError("polling.max_concurrency must be > 0")
    if retry_max_attempts < 0:
        raise ValueError("polling.retry_max_attempts must be >= 0")

    active_states = _string_list(tracker, "active_states")
    if not active_states:
        raise ValueError("tracker.active_states must not be empty")
    terminal_states = _string_list(tracker, "terminal_states")

    workspace_root = Path(workspace.get("root", ".symphony/workspaces"))
    if not workspace_root.is_absolute():
        workspace_root = (Path(repo_root).resolve() / workspace_root).resolve()

    return SymphonyConfig(
        tracker_kind="linear",
        polling_interval_seconds=polling_interval_seconds,
        workspace_root=workspace_root,
        active_states=active_states,
        terminal_states=terminal_states,
        max_concurrency=max_concurrency,
        retry_max_attempts=retry_max_attempts,
        retry_base_delay_seconds=retry_base_delay_seconds,
        retry_max_delay_seconds=retry_max_delay_seconds,
        workspace_after_create=hooks.get("workspace_after_create"),
        workspace_after_reuse=hooks.get("workspace_after_reuse"),
    )
