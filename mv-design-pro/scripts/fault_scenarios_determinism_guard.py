#!/usr/bin/env python3
"""
Fault Scenarios Determinism Guard — PR-24

CI sentinel that blocks merge if fault scenarios code contains
non-deterministic patterns or forbidden terms.

SCANNED DIRECTORIES:
  frontend/src/ui/fault-scenarios/
  backend/src/domain/fault_scenario.py
  backend/src/application/fault_scenario_service.py
  backend/src/api/fault_scenarios.py

BLOCKED PATTERNS (frontend):
  - Date.now()         — non-deterministic timestamp
  - Math.random()      — non-deterministic value
  - .sort() without comparator — implementation-dependent order
  - PCC (forbidden domain term)

BLOCKED PATTERNS (backend):
  - PCC (forbidden domain term)

ALLOWED CONTEXTS:
  - Comments
  - Test files
  - Import statements

EXIT CODES:
  0 = clean (no violations)
  1 = violation found
  2 = scanned directories not found (skip)
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]

# Directories to scan
SCAN_DIRS_FRONTEND = [
    REPO_ROOT / "frontend" / "src" / "ui" / "fault-scenarios",
]

SCAN_FILES_BACKEND = [
    REPO_ROOT / "backend" / "src" / "domain" / "fault_scenario.py",
    REPO_ROOT / "backend" / "src" / "application" / "fault_scenario_service.py",
    REPO_ROOT / "backend" / "src" / "api" / "fault_scenarios.py",
]

# File extensions
SCAN_EXTENSIONS_FRONTEND = {".ts", ".tsx"}

# Non-determinism patterns (frontend)
FRONTEND_VIOLATIONS = [
    (re.compile(r"Date\.now\(\)"), "Date.now() — niedeterministyczny timestamp"),
    (re.compile(r"Math\.random\(\)"), "Math.random() — niedeterministyczna wartość"),
    (
        re.compile(r"\.sort\(\s*\)"),
        ".sort() bez komparatora — niedeterministyczna kolejność",
    ),
    (re.compile(r"new Date\(\)"), "new Date() — niedeterministyczny timestamp"),
    (
        re.compile(r"performance\.now\(\)"),
        "performance.now() — niedeterministyczny czas",
    ),
    (
        re.compile(r"crypto\.randomUUID\(\)"),
        "crypto.randomUUID() — niedeterministyczny ID",
    ),
]

# PCC guard (all files)
PCC_VIOLATIONS = [
    (re.compile(r"\bPCC\b"), "PCC — zabroniony termin domenowy w modelu sieci"),
]

# Lines to skip
SKIP_LINE_PATTERNS = [
    re.compile(r"^\s*#"),  # Python comment
    re.compile(r"^\s*//"),  # JS comment
    re.compile(r"^\s*\*"),  # Block comment continuation
    re.compile(r"^\s*/\*"),  # Block comment start
    re.compile(r"^\s*import\s"),  # Import statements
    re.compile(r"^\s*from\s"),  # Python from-imports
    re.compile(r'^\s*"""'),  # Python docstrings
    re.compile(r"^\s*'''"),  # Python docstrings
]

# Exclude test files
EXCLUDE_PATTERNS = [
    re.compile(r"__tests__"),
    re.compile(r"\.test\."),
    re.compile(r"\.spec\."),
    re.compile(r"tests/"),
    re.compile(r"test_"),
]


def _should_skip_line(line: str) -> bool:
    for pattern in SKIP_LINE_PATTERNS:
        if pattern.search(line):
            return True
    return False


def _should_exclude_file(path: Path) -> bool:
    path_str = str(path)
    for pattern in EXCLUDE_PATTERNS:
        if pattern.search(path_str):
            return True
    return False


def _scan_file(
    path: Path,
    violations: list[tuple[re.Pattern, str]],
) -> list[tuple[int, str, str]]:
    results: list[tuple[int, str, str]] = []

    try:
        content = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return results

    for line_no, line in enumerate(content.splitlines(), start=1):
        if _should_skip_line(line):
            continue

        for pattern, description in violations:
            if pattern.search(line):
                results.append((line_no, line.strip(), description))

    return results


def main() -> int:
    found_any = False
    all_violations: list[tuple[Path, int, str, str]] = []

    # Scan frontend directories
    for scan_dir in SCAN_DIRS_FRONTEND:
        if not scan_dir.exists():
            continue
        found_any = True

        for path in sorted(scan_dir.rglob("*")):
            if not path.is_file():
                continue
            if path.suffix not in SCAN_EXTENSIONS_FRONTEND:
                continue
            if _should_exclude_file(path):
                continue

            # Check determinism violations
            file_violations = _scan_file(path, FRONTEND_VIOLATIONS)
            for line_no, line_content, description in file_violations:
                all_violations.append((path, line_no, line_content, description))

            # Check PCC violations
            pcc_violations = _scan_file(path, PCC_VIOLATIONS)
            for line_no, line_content, description in pcc_violations:
                all_violations.append((path, line_no, line_content, description))

    # Scan backend files
    for path in SCAN_FILES_BACKEND:
        if not path.exists():
            continue
        found_any = True

        # Check PCC violations in backend
        pcc_violations = _scan_file(path, PCC_VIOLATIONS)
        for line_no, line_content, description in pcc_violations:
            all_violations.append((path, line_no, line_content, description))

    if not found_any:
        print(
            "fault-scenarios-determinism-guard: brak katalogów do skanowania",
            file=sys.stderr,
        )
        return 2

    if all_violations:
        print(
            "FAULT-SCENARIOS-DETERMINISM-GUARD — NARUSZENIA:",
            file=sys.stderr,
        )
        for path, line_no, line_content, description in all_violations:
            rel_path = path.relative_to(REPO_ROOT)
            print(
                f"  {rel_path}:{line_no}: {line_content}",
                file=sys.stderr,
            )
            print(
                f"    -> {description}",
                file=sys.stderr,
            )
        print(
            f"\n{len(all_violations)} naruszenie(a). "
            "Kod scenariuszy zwarciowych musi być w pełni deterministyczny i bez PCC.",
            file=sys.stderr,
        )
        return 1

    print("fault-scenarios-determinism-guard: PASS (0 naruszeń)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
