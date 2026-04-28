from __future__ import annotations

from pathlib import Path

from application.symphony.config import SymphonyConfig
from application.symphony.workspace import WorkspaceManager


def _config(tmp_path: Path) -> SymphonyConfig:
    return SymphonyConfig(
        tracker_kind="linear",
        polling_interval_seconds=10,
        workspace_root=tmp_path / "workspaces",
        active_states=("Todo",),
        terminal_states=("Done",),
        max_concurrency=1,
        retry_max_attempts=2,
        retry_base_delay_seconds=1,
        retry_max_delay_seconds=10,
    )


def test_workspace_manager_creates_and_reuses_workspace(tmp_path: Path) -> None:
    manager = WorkspaceManager(_config(tmp_path))

    first = manager.ensure_workspace("ABC-123")
    second = manager.ensure_workspace("ABC-123")

    assert Path(first.path).is_dir()
    assert first.created_now is True
    assert second.created_now is False
    assert first.workspace_key == "abc-123"


def test_cleanup_terminal_workspace(tmp_path: Path) -> None:
    manager = WorkspaceManager(_config(tmp_path))
    workspace = manager.ensure_workspace("ABC-100")
    nested = Path(workspace.path) / "nested"
    nested.mkdir(parents=True)
    (nested / "file.txt").write_text("x", encoding="utf-8")

    removed = manager.cleanup_terminal_workspace("ABC-100")

    assert removed is True
    assert not Path(workspace.path).exists()
