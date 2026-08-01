#!/usr/bin/env python3
"""
Overlay No-Physics Guard — PR-16

Blocks merge if frontend/src/ui/sld-overlay/ contains physics keywords
in a physics-computation context.

SCANNED DIRECTORY:
  frontend/src/ui/sld-overlay/

BLOCKED KEYWORDS (in physics context):
  voltage, current, impedance, percent, rating, threshold

ALLOWED CONTEXTS:
  - Comments explaining the rule (e.g., "// NO voltage calculations")
  - Type/field names in overlay types (e.g., element_type: string)
  - String literals in test descriptions
  - Import statements

EXIT CODES:
  0 = clean (no violations)
  1 = violation found
  2 = directory not found (skip)
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
OVERLAY_DIR = REPO_ROOT / "frontend" / "src" / "ui" / "sld-overlay"

# Physics keywords that should NOT appear in overlay code
# (except in comments, strings, and type annotations)
PHYSICS_KEYWORDS = [
    "voltage",
    "current",
    "impedance",
    "percent",
    "rating",
    "threshold",
]

# Patterns that indicate physics COMPUTATION (not just reference)
PHYSICS_PATTERNS = [
    # Comparisons with physics values
    re.compile(r"if\s*\(.*(?:voltage|current|impedance|rating|threshold).*[<>]=?"),
    # Arithmetic with physics values
    re.compile(r"(?:voltage|current|impedance)\s*[\+\-\*\/]"),
    re.compile(r"[\+\-\*\/]\s*(?:voltage|current|impedance)"),
    # Physics threshold definitions
    re.compile(r"(?:const|let|var)\s+\w*(?:threshold|limit|rating)\w*\s*=\s*\d"),
    # Direct physics comparisons
    re.compile(r">\s*(?:1\.05|0\.95|100|80)\s*(?://.*(?:voltage|pu|percent))?"),
]

# Lines to skip (comments, imports, type annotations)
SKIP_LINE_PATTERNS = [
    re.compile(r"^\s*//"),  # Single-line comment
    re.compile(r"^\s*\*"),  # Block comment continuation
    re.compile(r"^\s*/\*"),  # Block comment start
    re.compile(r"^\s*import\s"),  # Import statements
    re.compile(r"^\s*export\s+type"),  # Type exports
    re.compile(r"^\s*\*\s*@"),  # JSDoc annotations
    re.compile(r"^\s*\*\s*-"),  # JSDoc list items
    re.compile(r"^\s*description:"),  # Description fields
    re.compile(r"^\s*//.*FORBIDDEN"),  # Rule documentation
    re.compile(r"^\s*//.*INVARIANT"),  # Invariant documentation
    re.compile(r"^\s*//.*NO\s"),  # "NO physics" style comments
]

# File extensions to scan
SCAN_EXTENSIONS = {".ts", ".tsx"}

# Exclude test files from guard (tests may reference physics in descriptions)
EXCLUDE_PATTERNS = [
    re.compile(r"__tests__"),
    re.compile(r"\.test\."),
    re.compile(r"\.spec\."),
]


def _should_skip_line(line: str) -> bool:
    """Check if a line should be skipped (comment, import, etc.)."""
    for pattern in SKIP_LINE_PATTERNS:
        if pattern.search(line):
            return True
    return False


def _should_exclude_file(path: Path) -> bool:
    """Check if a file should be excluded from scanning."""
    path_str = str(path)
    for pattern in EXCLUDE_PATTERNS:
        if pattern.search(path_str):
            return True
    return False


def _scan_file(path: Path) -> list[tuple[int, str, str]]:
    """
    Scan a single file for physics violations.

    Returns list of (line_number, line_content, matched_pattern).
    """
    violations: list[tuple[int, str, str]] = []

    try:
        content = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return violations

    for line_no, line in enumerate(content.splitlines(), start=1):
        if _should_skip_line(line):
            continue

        # Check for physics computation patterns
        for pattern in PHYSICS_PATTERNS:
            match = pattern.search(line)
            if match:
                violations.append((line_no, line.strip(), pattern.pattern))

    return violations


def main() -> int:
    if not OVERLAY_DIR.exists():
        print(
            f"overlay-no-physics-guard: directory not found: {OVERLAY_DIR}",
            file=sys.stderr,
        )
        return 2

    all_violations: list[tuple[Path, int, str, str]] = []

    for path in sorted(OVERLAY_DIR.rglob("*")):
        if not path.is_file():
            continue
        if path.suffix not in SCAN_EXTENSIONS:
            continue
        if _should_exclude_file(path):
            continue

        violations = _scan_file(path)
        for line_no, line_content, pattern in violations:
            all_violations.append((path, line_no, line_content, pattern))

    if all_violations:
        print(
            "OVERLAY-NO-PHYSICS-GUARD VIOLATIONS:",
            file=sys.stderr,
        )
        for path, line_no, line_content, pattern in all_violations:
            rel_path = path.relative_to(REPO_ROOT)
            print(
                f"  {rel_path}:{line_no}: {line_content}",
                file=sys.stderr,
            )
            print(
                f"    Matched pattern: {pattern}",
                file=sys.stderr,
            )
        print(
            f"\n{len(all_violations)} violation(s) found. "
            "Overlay code must not contain physics calculations.",
            file=sys.stderr,
        )
        return 1

    print("overlay-no-physics-guard: PASS (0 violations)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
