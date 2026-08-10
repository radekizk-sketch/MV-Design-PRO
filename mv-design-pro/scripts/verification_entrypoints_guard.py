"""Zapadka na martwe wejścia weryfikacyjne i nieistniejące cele skryptów npm."""

from __future__ import annotations

import json
import re
import shlex
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACKAGE_JSON = ROOT / "frontend" / "package.json"
WORKFLOWS_DIR = ROOT.parent / ".github" / "workflows"
VERIFY_SCRIPT_RE = re.compile(r"^verify(?:[_-].*)?\.py$")
PATH_SUFFIXES = (".py", ".mjs", ".js", ".ts", ".tsx")


def referenced_local_paths(command: str) -> list[str]:
    paths: list[str] = []
    for token in shlex.split(command):
        clean = token.rstrip(",;")
        if clean.startswith("-") or not clean.endswith(PATH_SUFFIXES):
            continue
        if clean.startswith(("src/", "scripts/", "./", "../")):
            paths.append(clean)
    return paths


def _resolve_script_path(frontend_dir: Path, token: str) -> Path:
    return (frontend_dir / token).resolve()


def check_verification_entrypoints(
    package_json: Path = PACKAGE_JSON,
    workflows_dir: Path = WORKFLOWS_DIR,
    root: Path = ROOT,
) -> list[str]:
    frontend_dir = package_json.parent
    scripts = json.loads(package_json.read_text(encoding="utf-8")).get("scripts", {})
    violations: list[str] = []
    for name, command in sorted(scripts.items()):
        for token in referenced_local_paths(command):
            if not _resolve_script_path(frontend_dir, token).exists():
                violations.append(f"[npm-missing-target] {name}: {token}")

    workflow_text = "\n".join(
        path.read_text(encoding="utf-8", errors="ignore")
        for path in sorted(workflows_dir.glob("*.yml"))
    )
    for path in sorted((root / "scripts").glob("verify*.py")):
        if VERIFY_SCRIPT_RE.match(path.name) and path.name not in workflow_text:
            violations.append(f"[verification-not-in-ci] scripts/{path.name}")
    return violations


def main() -> int:
    violations = check_verification_entrypoints()
    if violations:
        print("verification-entrypoints-guard: BŁĄD")
        for violation in violations:
            print(f" - {violation}")
        return 1
    print("verification-entrypoints-guard: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
