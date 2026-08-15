#!/usr/bin/env python3
"""
Protection No-Heuristics Guard — PR-32

Blocks merge if protection code contains forbidden heuristic patterns.
Ensures NO auto-mapping, NO fallback, NO guessing in protection layer.

SCAN FILES:
  backend/src/domain/protection_engine_v1.py
  backend/src/domain/protection_coordination_v1.py
  backend/src/domain/protection_current_source.py
  backend/src/domain/protection_report_model.py
  backend/src/application/protection_current_resolver.py
  backend/src/application/result_mapping/protection_to_overlay_v1.py
  backend/src/application/result_mapping/protection_to_resultset_v1.py

FORBIDDEN PATTERNS:
  auto_select, auto_map, fallback, default_target,
  infer_upstream, infer_downstream, guess_, heuristic, best_match

ALLOWED CONTEXTS (skip):
  - Comments (# or //)
  - Docstrings (inside triple quotes)
  - Test files
  - This guard script itself

EXIT CODES:
  0 = clean (no violations)
  1 = violations found
  2 = scan directory not found
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]

SCAN_FILES = [
    "backend/src/domain/protection_engine_v1.py",
    "backend/src/domain/protection_coordination_v1.py",
    "backend/src/domain/protection_current_source.py",
    "backend/src/domain/protection_report_model.py",
    "backend/src/application/protection_current_resolver.py",
    "backend/src/application/result_mapping/protection_to_overlay_v1.py",
    "backend/src/application/result_mapping/protection_to_resultset_v1.py",
]

FORBIDDEN_PATTERNS = [
    re.compile(r"\bauto_select\b", re.IGNORECASE),
    re.compile(r"\bauto_map\b", re.IGNORECASE),
    re.compile(r"\bfallback\b", re.IGNORECASE),
    re.compile(r"\bdefault_target\b", re.IGNORECASE),
    re.compile(r"\binfer_upstream\b", re.IGNORECASE),
    re.compile(r"\binfer_downstream\b", re.IGNORECASE),
    re.compile(r"\bguess_\w+", re.IGNORECASE),
    re.compile(r"\bheuristic\b", re.IGNORECASE),
    re.compile(r"\bbest_match\b", re.IGNORECASE),
]

# Lines to skip
SKIP_LINE_PATTERNS = [
    re.compile(r"^\s*#"),  # Python comment
    re.compile(r"^\s*//"),  # JS comment
    re.compile(r'^\s*"""'),  # Docstring boundary
    re.compile(r"^\s*'''"),  # Docstring boundary
]


def _should_skip_line(line: str) -> bool:
    for pattern in SKIP_LINE_PATTERNS:
        if pattern.match(line):
            return True
    return False


def _scan_file(path: Path) -> list[tuple[int, str, str]]:
    """Scan a file for forbidden patterns. Returns (line_no, line, pattern)."""
    violations: list[tuple[int, str, str]] = []

    try:
        content = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return violations

    in_docstring = False

    for line_no, line in enumerate(content.splitlines(), start=1):
        stripped = line.strip()

        # Track docstring boundaries
        if '"""' in stripped or "'''" in stripped:
            count = stripped.count('"""') + stripped.count("'''")
            if count == 1:
                in_docstring = not in_docstring
                continue
            # Opening and closing on same line — skip this line
            continue

        if in_docstring:
            continue

        if _should_skip_line(line):
            continue

        for pattern in FORBIDDEN_PATTERNS:
            match = pattern.search(line)
            if match:
                violations.append((line_no, stripped, match.group()))

    return violations


def main() -> int:
    all_violations: list[tuple[str, int, str, str]] = []

    for rel_path in SCAN_FILES:
        full_path = REPO_ROOT / rel_path
        if not full_path.exists():
            continue

        violations = _scan_file(full_path)
        for line_no, line_content, matched in violations:
            all_violations.append((rel_path, line_no, line_content, matched))

    if all_violations:
        print("PROTECTION-NO-HEURISTICS-GUARD VIOLATIONS:", file=sys.stderr)
        for rel_path, line_no, line_content, matched in all_violations:
            print(f"  {rel_path}:{line_no}: {line_content}", file=sys.stderr)
            print(f"    Matched: '{matched}'", file=sys.stderr)
        print(
            f"\n{len(all_violations)} violation(s). "
            "Protection code must not contain heuristic patterns.",
            file=sys.stderr,
        )
        return 1

    print(f"protection-no-heuristics-guard: PASS " f"({len(SCAN_FILES)} files scanned)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
