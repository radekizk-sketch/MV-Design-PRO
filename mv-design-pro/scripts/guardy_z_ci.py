"""Sprawdza, czy komendy guardów zadeklarowane w workflowach wskazują istniejące pliki."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORKFLOWS = ROOT.parent / ".github" / "workflows"
GUARD_COMMAND_RE = re.compile(
    r"python(?:\s+-m\s+\S+)?\s+(?:mv-design-pro/)?(scripts/[\w.-]+_guard\.py)"
)
REQUIRED = {"scripts/route_prefix_guard.py", "scripts/verification_entrypoints_guard.py"}


def check_ci_guards() -> list[str]:
    references: set[str] = set()
    for workflow in sorted(WORKFLOWS.glob("*.yml")):
        references.update(GUARD_COMMAND_RE.findall(workflow.read_text(encoding="utf-8")))
    violations = [
        f"[ci-guard-missing-file] {reference}"
        for reference in sorted(references)
        if not (ROOT / reference).exists()
    ]
    for required in sorted(REQUIRED - references):
        violations.append(f"[ci-guard-not-called] {required}")
    return violations


def main() -> int:
    violations = check_ci_guards()
    if violations:
        print("guardy-z-ci: BŁĄD")
        for violation in violations:
            print(f" - {violation}")
        return 1
    print("guardy-z-ci: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
