#!/usr/bin/env python3
"""
NO-CODENAMES GUARD — CI/UI Enforcement

BINDING RULE:
- Nazwy kodowe typu P7, P11, P14, P17, P20 itd. NIGDY nie mogą pojawiać się
  w UI-visible stringach, eksportach ani artefaktach testowych.
- Dozwolone są:
  - Komentarze dokumentacyjne (// /* */ *)
  - Parametry techniczne jak P0 (straty jałowe transformatora)
  - Nazwy zmiennych/pól (p0_kw, p_mw, etc.)

Pattern: \\b[pP]\\d+\\b (case-insensitive)
Excluded: P0 (technical parameter)

Usage:
  python scripts/no_codenames_guard.py
  # Or via npm script in frontend/package.json
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import NamedTuple

REPO_ROOT = Path(__file__).resolve().parents[1]

# Directories to scan (relative to REPO_ROOT)
SCAN_DIRS = [
    "frontend/src",
    "frontend/e2e",
]

# File extensions to check
FILE_EXTENSIONS = {".ts", ".tsx", ".css", ".html"}
EXCLUDED_FILE_SUFFIXES = (
    ".generated.ts",
    ".generated.tsx",
)
EXCLUDED_RELATIVE_FILES = {
    "frontend/src/ui/network-build/station-der/ptpireeCertifiedInverters.ts",
}

# Regex for codenames: P1, P7, P11, P20, p14, etc.
# Excludes P0 (technical parameter for transformer no-load losses)
CODENAME_PATTERN = re.compile(r"\b[pP](?!0\b)\d+\b")
ALLOWED_TECHNICAL_TOKENS = {"p50", "p75", "p90", "p95", "p99"}

# Regex for string literals (single, double, or template)
STRING_LITERAL_PATTERN = re.compile(
    r"""
    (?P<string>
        '(?:[^'\\]|\\.)*'     |  # single-quoted
        "(?:[^"\\]|\\.)*"     |  # double-quoted
        `(?:[^`\\]|\\.)*`        # template literal
    )
    """,
    re.VERBOSE,
)

# Comment line patterns (for lines to skip entirely)
COMMENT_LINE_PATTERNS = [
    re.compile(r"^\s*//"),  # // single-line comment
    re.compile(r"^\s*\*"),  # * JSDoc/block comment continuation
    re.compile(r"^\s*/\*"),  # /* block comment start
    re.compile(r"^\s*\*/"),  # */ block comment end
    re.compile(r"^\s*{/\*"),  # JSX comment {/*
]

# Inline ignore pattern (add to line to suppress warning)
IGNORE_PATTERN = re.compile(r"//\s*no-codenames-ignore")


class Violation(NamedTuple):
    file_path: str
    line_number: int
    line_content: str
    match: str


def is_comment_line(line: str) -> bool:
    """Check if a line is a comment (to be skipped)."""
    trimmed = line.strip()
    return any(pattern.match(trimmed) for pattern in COMMENT_LINE_PATTERNS)


def find_codenames_in_strings(line: str) -> list[str]:
    """Find codenames inside string literals in a line."""
    matches = []
    for string_match in STRING_LITERAL_PATTERN.finditer(line):
        string_content = string_match.group("string")
        for codename_match in CODENAME_PATTERN.finditer(string_content):
            token = codename_match.group()
            if token.lower() in ALLOWED_TECHNICAL_TOKENS:
                continue
            matches.append(token)
    return matches


def format_violation_path(file_path: Path) -> str:
    """Render a stable path for diagnostics, also for temp files outside the repo."""
    try:
        return str(file_path.relative_to(REPO_ROOT)).replace("\\", "/")
    except ValueError:
        return str(file_path)


def scan_file(file_path: Path) -> list[Violation]:
    """Scan a single file for codename violations."""
    violations = []

    try:
        content = file_path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        return violations

    lines = content.split("\n")
    in_block_comment = False

    for line_num, line in enumerate(lines, start=1):
        trimmed = line.strip()

        # Track block comments
        if "/*" in line and "*/" not in line:
            in_block_comment = True
        if "*/" in line:
            in_block_comment = False
            continue

        # Skip comment lines
        if in_block_comment or is_comment_line(line):
            continue

        # Skip lines with inline ignore comment
        if IGNORE_PATTERN.search(line):
            continue

        # Find codenames in string literals
        codenames = find_codenames_in_strings(line)
        for codename in codenames:
            violations.append(
                Violation(
                    file_path=format_violation_path(file_path),
                    line_number=line_num,
                    line_content=trimmed,
                    match=codename,
                )
            )

    return violations


def iter_files(root: Path) -> list[Path]:
    """Iterate over files to scan."""
    files = []
    for scan_dir in SCAN_DIRS:
        dir_path = root / scan_dir
        if not dir_path.exists():
            continue
        for ext in FILE_EXTENSIONS:
            for file_path in dir_path.rglob(f"*{ext}"):
                relative_path = format_violation_path(file_path)
                if file_path.name.endswith(EXCLUDED_FILE_SUFFIXES):
                    continue
                if relative_path in EXCLUDED_RELATIVE_FILES:
                    continue
                files.append(file_path)
    return sorted(set(files))


def main() -> int:
    """Main entry point."""
    violations = []

    for file_path in iter_files(REPO_ROOT):
        file_violations = scan_file(file_path)
        violations.extend(file_violations)

    if violations:
        print("=" * 70, file=sys.stderr)
        print("NO-CODENAMES GUARD: NARUSZENIE WYKRYTE", file=sys.stderr)
        print("=" * 70, file=sys.stderr)
        print(file=sys.stderr)
        print(
            "W UI/Proof nie wolno używać nazw kodowych (np. P11, P14, P17).",
            file=sys.stderr,
        )
        print(
            "Użyj polskich etykiet zamiast nazw kodowych projektu.",
            file=sys.stderr,
        )
        print(file=sys.stderr)
        print(f"Znaleziono {len(violations)} naruszeń:", file=sys.stderr)
        print("-" * 70, file=sys.stderr)

        for v in violations:
            print(f"  {v.file_path}:{v.line_number}", file=sys.stderr)
            print(f"    Znaleziono: {v.match}", file=sys.stderr)
            print(f"    Linia: {v.line_content[:80]}", file=sys.stderr)
            print(file=sys.stderr)

        print("-" * 70, file=sys.stderr)
        print(
            "Napraw powyższe naruszenia, zanim kod zostanie scalony.",
            file=sys.stderr,
        )
        return 1

    print("no-codenames-guard: OK (brak naruszeń)", file=sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
