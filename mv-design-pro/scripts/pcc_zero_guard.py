#!/usr/bin/env python3
"""
PCC ZERO GUARD — Ensures "PCC" does NOT appear in production backend code.

The PCC Prohibition Rule (from SYSTEM_SPEC / CLAUDE.md) states that PCC is a
business/interpretation concept and must NEVER appear in the core Network Model
or any production backend source code.  It belongs exclusively in the
analysis/interpretation layer's documentation or in test files.

Scans:
  backend/src/**/*.py  (production code only — tests are excluded)

Allowed exceptions on a per-line basis:
  - Comments or docstrings that explicitly document the prohibition rule
    (e.g. "# PCC is NOT in NetworkModel", "PCC Prohibition", etc.)
  - This guard script itself (pcc_zero_guard.py)

Usage:
  python scripts/pcc_zero_guard.py

Exit codes:
  0 — no violations found
  1 — violations found
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

# mv-design-pro/ directory (parent of scripts/)
PROJECT_ROOT = Path(__file__).resolve().parents[1]

# Production source directory
BACKEND_SRC = PROJECT_ROOT / "backend" / "src"

# This script's own filename — always excluded from violations
SELF_NAME = Path(__file__).resolve().name

# ---------------------------------------------------------------------------
# Patterns
# ---------------------------------------------------------------------------

PCC_PATTERN = re.compile(r"\bPCC\b")

# If a line matches PCC **and** contains any of these substrings it is
# considered an allowed reference (documenting the prohibition rule itself).
PCC_ALLOWED_CONTEXTS = [
    "NOT in NetworkModel",
    "Forbidden Terms",
    "Prohibition",
    "prohibited",
    "ZAKAZ",
    "zakaz",
    "nie wolno",
    "belongs to interpretation",
    "belongs to Analysis",
    "belongs ONLY",
    "interpretation, not physics",
    "PCC_ZERO_GUARD",
    "pcc_zero_guard",
    "PCC prohibition",
    "PCC Prohibition",
    "PCC is NOT",
    "PCC does NOT",
    "no PCC",
]


# ---------------------------------------------------------------------------
# Scanner
# ---------------------------------------------------------------------------


def scan_backend_src() -> list[str]:
    """Scan all .py files under backend/src/ for prohibited PCC references."""
    violations: list[str] = []

    if not BACKEND_SRC.exists():
        print(
            f"WARNING: {BACKEND_SRC} does not exist — nothing to scan.",
            file=sys.stderr,
        )
        return violations

    for py_file in sorted(BACKEND_SRC.rglob("*.py")):
        # Skip this guard script if it somehow ends up inside backend/src/
        if py_file.name == SELF_NAME:
            continue

        try:
            content = py_file.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue

        display_path = str(py_file.relative_to(PROJECT_ROOT))

        for line_num, line in enumerate(content.split("\n"), start=1):
            if PCC_PATTERN.search(line):
                # Allow lines that document the prohibition rule
                if any(ctx in line for ctx in PCC_ALLOWED_CONTEXTS):
                    continue
                violations.append(f"  {display_path}:{line_num}: {line.strip()[:120]}")

    return violations


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> int:
    violations = scan_backend_src()

    if violations:
        print("=" * 70, file=sys.stderr)
        print(
            "PCC ZERO GUARD: PROHIBITED 'PCC' TERM FOUND IN BACKEND SOURCE",
            file=sys.stderr,
        )
        print("=" * 70, file=sys.stderr)
        print(file=sys.stderr)
        print(
            "The term 'PCC' must NOT appear in production backend code.",
            file=sys.stderr,
        )
        print(
            "PCC is a business/interpretation concept — it does NOT belong in",
            file=sys.stderr,
        )
        print(
            "the Network Model or any solver/application/domain layer code.",
            file=sys.stderr,
        )
        print(file=sys.stderr)
        print(f"Found {len(violations)} violation(s):", file=sys.stderr)
        for v in violations:
            print(v, file=sys.stderr)
        print(file=sys.stderr)
        print(
            "Fix: Remove or replace 'PCC' with the appropriate domain term.",
            file=sys.stderr,
        )
        print(
            "     If this is an analysis-layer interpretation reference, move it",
            file=sys.stderr,
        )
        print(
            "     to the analysis layer or add an allowed-context comment.",
            file=sys.stderr,
        )
        return 1

    print("pcc-zero-guard: OK (no PCC violations in backend/src/)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
