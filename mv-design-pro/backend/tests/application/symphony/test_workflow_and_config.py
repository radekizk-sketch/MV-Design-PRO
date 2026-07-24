from __future__ import annotations

from pathlib import Path

import pytest
from application.symphony.config import load_symphony_config
from application.symphony.workflow import load_workflow_definition


def test_load_workflow_definition_parses_front_matter_and_body(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("LINEAR_TOKEN", "secret-token")
    workflow = tmp_path / "WORKFLOW.md"
    workflow.write_text(
        """---
tracker:
  kind: linear
  token: ${LINEAR_TOKEN}
  active_states: [Todo, In Progress]
  terminal_states: [Done, Canceled]
polling:
  interval_seconds: 20
workspace:
  root: .symphony/workspaces
---
# Agent Prompt
Ticket: {issue_identifier}
""",
        encoding="utf-8",
    )

    definition = load_workflow_definition(tmp_path)

    assert definition.config["tracker"]["token"] == "secret-token"
    assert "Ticket: {issue_identifier}" in definition.prompt_template


def test_load_symphony_config_applies_defaults(tmp_path: Path) -> None:
    workflow = tmp_path / "WORKFLOW.md"
    workflow.write_text(
        """---
tracker:
  kind: linear
  active_states: [Todo]
  terminal_states: [Done]
---
Prompt {issue_identifier}
""",
        encoding="utf-8",
    )
    definition = load_workflow_definition(tmp_path)

    cfg = load_symphony_config(definition, repo_root=tmp_path)

    assert cfg.polling_interval_seconds == 30
    assert cfg.max_concurrency == 1
    assert cfg.workspace_root == (tmp_path / ".symphony/workspaces").resolve()
