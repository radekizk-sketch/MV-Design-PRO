from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class WorkflowDefinition:
    config: dict[str, Any]
    prompt_template: str


def _split_front_matter(text: str) -> tuple[str, str]:
    if not text.startswith("---\n"):
        raise ValueError("WORKFLOW.md must start with YAML front matter delimited by ---")
    marker = "\n---\n"
    offset = text.find(marker, 4)
    if offset < 0:
        raise ValueError("WORKFLOW.md front matter closing delimiter --- not found")
    front_matter = text[4:offset]
    body = text[offset + len(marker) :].strip()
    if not body:
        raise ValueError("WORKFLOW.md prompt body cannot be empty")
    return front_matter, body


def _parse_scalar(value: str) -> Any:
    value = value.strip()
    if value.startswith("[") and value.endswith("]"):
        inner = value[1:-1].strip()
        if not inner:
            return []
        return [item.strip().strip("\"'") for item in inner.split(",") if item.strip()]
    if value in {"true", "false"}:
        return value == "true"
    if value.isdigit():
        return int(value)
    return value.strip("\"'")


def _parse_minimal_yaml(front_matter: str) -> dict[str, Any]:
    root: dict[str, Any] = {}
    stack: list[tuple[int, dict[str, Any]]] = [(-1, root)]

    for raw_line in front_matter.splitlines():
        line = raw_line.rstrip()
        if not line or line.lstrip().startswith("#"):
            continue
        indent = len(line) - len(line.lstrip(" "))
        if ":" not in line:
            raise ValueError(f"Invalid front matter line: {line}")
        key, raw_value = line.strip().split(":", 1)
        key = key.strip()
        value = raw_value.strip()

        while stack and indent <= stack[-1][0]:
            stack.pop()
        parent = stack[-1][1]

        if value == "":
            node: dict[str, Any] = {}
            parent[key] = node
            stack.append((indent, node))
            continue
        parent[key] = _parse_scalar(value)

    return root


def _resolve_env_tokens(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _resolve_env_tokens(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_resolve_env_tokens(v) for v in value]
    if isinstance(value, str) and value.startswith("${") and value.endswith("}"):
        env_name = value[2:-1].strip()
        resolved = os.getenv(env_name)
        if resolved is None:
            raise ValueError(f"WORKFLOW.md references missing environment variable: {env_name}")
        return resolved
    return value


def load_workflow_definition(
    repo_root: str | Path, workflow_path: str = "WORKFLOW.md"
) -> WorkflowDefinition:
    path = Path(repo_root).resolve() / workflow_path
    if not path.is_file():
        raise FileNotFoundError(f"WORKFLOW.md not found at: {path}")
    text = path.read_text(encoding="utf-8")
    front_matter, body = _split_front_matter(text)
    parsed = _parse_minimal_yaml(front_matter)
    resolved = _resolve_env_tokens(parsed)
    return WorkflowDefinition(config=resolved, prompt_template=body)
