from __future__ import annotations

import re
import subprocess
from pathlib import Path

from application.symphony.config import SymphonyConfig
from application.symphony.models import Workspace


class WorkspaceManager:
    def __init__(self, config: SymphonyConfig) -> None:
        self._config = config

    @staticmethod
    def sanitize_workspace_key(issue_identifier: str) -> str:
        sanitized = re.sub(r"[^a-zA-Z0-9._-]", "-", issue_identifier.strip())
        sanitized = re.sub(r"-+", "-", sanitized).strip("-._")
        return sanitized.lower() or "unknown-issue"

    def ensure_workspace(self, issue_identifier: str) -> Workspace:
        key = self.sanitize_workspace_key(issue_identifier)
        root = self._config.workspace_root.resolve()
        root.mkdir(parents=True, exist_ok=True)
        path = (root / key).resolve()
        if root not in path.parents and path != root:
            raise ValueError("Unsafe workspace path derived outside workspace.root")

        created_now = not path.exists()
        path.mkdir(parents=True, exist_ok=True)
        workspace = Workspace(path=str(path), workspace_key=key, created_now=created_now)
        self._run_hook(workspace)
        return workspace

    def cleanup_terminal_workspace(self, issue_identifier: str) -> bool:
        key = self.sanitize_workspace_key(issue_identifier)
        path = (self._config.workspace_root.resolve() / key).resolve()
        root = self._config.workspace_root.resolve()
        if root not in path.parents and path != root:
            raise ValueError("Unsafe workspace path derived outside workspace.root")
        if not path.exists() or not path.is_dir():
            return False
        for child in sorted(path.glob("**/*"), key=lambda p: len(p.parts), reverse=True):
            if child.is_file() or child.is_symlink():
                child.unlink(missing_ok=True)
            elif child.is_dir():
                child.rmdir()
        path.rmdir()
        return True

    def _run_hook(self, workspace: Workspace) -> None:
        hook = (
            self._config.workspace_after_create
            if workspace.created_now
            else self._config.workspace_after_reuse
        )
        if not hook:
            return
        subprocess.run(
            hook,
            shell=True,
            cwd=workspace.path,
            check=True,
            env={"WORKSPACE_PATH": workspace.path, "WORKSPACE_KEY": workspace.workspace_key},
        )
