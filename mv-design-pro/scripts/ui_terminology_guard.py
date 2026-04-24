#!/usr/bin/env python3
"""
UI terminology guard for canonical V12.5.1 runtime copy.

The guard scans user-facing strings in active frontend source files and blocks
selected banned English/internal terms from leaking into the runtime UI.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import NamedTuple

from active_public_layer import collect_active_frontend_files

REPO_ROOT = Path(__file__).resolve().parents[1]
FILE_EXTENSIONS = {".ts", ".tsx", ".js", ".jsx"}

UI_PROP_PATTERN = re.compile(
    r"""
    (?:
        \b(?:label|labelPl|title|titlePl|description|message|placeholder|eyebrow)\b
        \s*:\s*
    )
    (?P<quote>['"`])
    (?P<content>.*?)
    (?P=quote)
    """,
    re.VERBOSE,
)

JSX_TEXT_PATTERN = re.compile(r">(?P<content>[^<>{}][^<>{}]*)<")
IGNORE_PATTERN = re.compile(r"//\s*ui-terminology-ignore")

BANNED_UI_TERMS: dict[str, re.Pattern[str]] = {
    "Feeder": re.compile(r"\bFeeder\b"),
    "Branch": re.compile(r"\bBranch(?:es)?\b"),
    "Case": re.compile(r"\bCase(?:\s+ref)?\b"),
    "Snapshot": re.compile(r"\bSnapshot\b"),
    "Run": re.compile(r"\bRun(?:\s+ref)?\b"),
    "Proof": re.compile(r"\bProof(?:\s+pack)?\b"),
    "analysis_case_context": re.compile(r"\banalysis_case_context\b"),
    "Migawka": re.compile(r"\bMigawk\w*\b", re.IGNORECASE),
    "Uruchomienie": re.compile(r"\bUruchomieni\w*\b", re.IGNORECASE),
    "Przypadek": re.compile(r"\bPrzypad\w*\b", re.IGNORECASE),
    "Wizard": re.compile(r"\bWizard\b", re.IGNORECASE),
    "Legacy": re.compile(r"\blegacy\b", re.IGNORECASE),
    "Fallback": re.compile(r"\bfallback\b", re.IGNORECASE),
    "CT": re.compile(r"\bCT\b"),
    "VT": re.compile(r"\bVT\b"),
    "PT": re.compile(r"\bPT\b"),
    "CB": re.compile(r"\bCB\b"),
    "DS": re.compile(r"\bDS\b"),
    "ES": re.compile(r"\bES\b"),
    "BRANCH": re.compile(r"\bBRANCH\b"),
    "COUPLER": re.compile(r"\bCOUPLER\b"),
    "Stacja A": re.compile(r"\bStacja A\b"),
    "Stacja B": re.compile(r"\bStacja B\b"),
    "Stacja C": re.compile(r"\bStacja C\b"),
    "Stacja D": re.compile(r"\bStacja D\b"),
    "CASE_CONFIG": re.compile(r"\bCASE_CONFIG\b"),
    "MODEL_EDIT": re.compile(r"\bMODEL_EDIT\b"),
    "RESULT_VIEW": re.compile(r"\bRESULT_VIEW\b"),
    "OperationForm": re.compile(r"\bOperationForm\b"),
    "ObjectCard": re.compile(r"\bObjectCard\b"),
}


class Violation(NamedTuple):
    file_path: str
    line_number: int
    token: str
    snippet: str


def iter_files() -> list[Path]:
    return [
        path
        for path in collect_active_frontend_files()
        if path.suffix in FILE_EXTENSIONS
    ]


def normalize_path(path: Path) -> str:
    try:
        return path.relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return path.resolve().as_posix()


def extract_ui_strings(line: str) -> list[str]:
    fragments = [match.group("content").strip() for match in UI_PROP_PATTERN.finditer(line)]
    fragments.extend(
        match.group("content").strip()
        for match in JSX_TEXT_PATTERN.finditer(line)
        if match.group("content").strip()
    )
    return fragments


def find_banned_terms(text: str) -> list[str]:
    return [label for label, pattern in BANNED_UI_TERMS.items() if pattern.search(text)]


def scan_file(path: Path) -> list[Violation]:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeDecodeError):
        return []

    violations: list[Violation] = []
    for line_number, line in enumerate(lines, start=1):
        if IGNORE_PATTERN.search(line):
            continue
        for fragment in extract_ui_strings(line):
            for token in find_banned_terms(fragment):
                violations.append(
                    Violation(
                        file_path=normalize_path(path),
                        line_number=line_number,
                        token=token,
                        snippet=fragment[:160],
                    )
                )
    return violations


def main() -> int:
    violations: list[Violation] = []
    for path in iter_files():
        violations.extend(scan_file(path))

    if violations:
        print("=" * 72, file=sys.stderr)
        print("UI TERMINOLOGY GUARD: NARUSZENIE WYKRYTE", file=sys.stderr)
        print("=" * 72, file=sys.stderr)
        print(
            "Aktywny frontend zawiera zakazane nazwy angielskie lub techniczne w warstwie uzytkowej.",
            file=sys.stderr,
        )
        print(
            "Zastap je polskim nazewnictwem kanonicznym przed scaleniem zmian.",
            file=sys.stderr,
        )
        print(file=sys.stderr)
        for violation in violations:
            print(
                f"  {violation.file_path}:{violation.line_number} -> {violation.token}",
                file=sys.stderr,
            )
            print(f"    {violation.snippet}", file=sys.stderr)
        return 1

    print("ui-terminology-guard: OK (brak naruszen)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
