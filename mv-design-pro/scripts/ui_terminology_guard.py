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

REPO_ROOT = Path(__file__).resolve().parents[1]
SCAN_DIRS = [REPO_ROOT / "frontend" / "src"]
FILE_EXTENSIONS = {".ts", ".tsx"}
SKIP_PARTS = ("__tests__", ".test.", ".spec.", ".snap")

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
# Akceptujemy zarówno `// ui-terminology-ignore` jak i `/* ui-terminology-ignore */`
# (block comment) per linia — dla programmatic template literals z nazwami zmiennych
# (np. ${branch.name}) gdzie token jest częścią ścieżki obiektu, nie tekstem UI.
IGNORE_PATTERN = re.compile(r"(?://|/\*)\s*ui-terminology-ignore")
# Skip lines, które są typowymi programmatic referencjami do pól obiektu domenowego
# (np. ${branch.fromNodeId}, state.snapshot as Record, NormativeLabels.terms.branch).
# Dotyczy wyłącznie technicznych template literals w error/log messages.
PROGRAMMATIC_REF_PATTERN = re.compile(
    r"(?:\$\{[^}]*\.(?:branch|run|snapshot|case|proof|wizard)[^}]*\}"
    r"|\bstate\.(?:branch|run|snapshot|case|proof|wizard)\b"
    r"|\bNormativeLabels\.terms\.\w+)"
)

BANNED_UI_TERMS: dict[str, re.Pattern[str]] = {
    # Brief 1 §2 + Brief 2 §2 — 12 tokenów zakazanych w aktywnym UI
    "Feeder": re.compile(r"\bFeeder\b"),
    "feeder": re.compile(r"\bfeeder\b"),
    "Branch": re.compile(r"\bBranch\b"),
    "branch": re.compile(r"\bbranch\b"),
    "Case": re.compile(r"\bCase\b"),
    "case": re.compile(r"\bcase\b"),
    "Snapshot": re.compile(r"\bSnapshot\b"),
    "snapshot": re.compile(r"\bsnapshot\b"),
    "Run": re.compile(r"\bRun\b"),
    "run": re.compile(r"\brun\b"),
    "Proof": re.compile(r"\bProof\b"),
    "proof": re.compile(r"\bproof\b"),
    "Migawka": re.compile(r"\bMigawka\b"),
    "migawka": re.compile(r"\bmigawka\b"),
    "Uruchomienie": re.compile(r"\bUruchomienie\b"),
    "uruchomienie": re.compile(r"\buruchomienie\b"),
    "Przypadek": re.compile(r"\bPrzypadek\b"),
    "przypadek": re.compile(r"\bprzypadek\b"),
    "Wizard": re.compile(r"\bWizard\b"),
    "wizard": re.compile(r"\bwizard\b"),
    "Kreator": re.compile(r"\bKreator\b"),  # alias dla wizard w PL UI
    "kreator": re.compile(r"\bkreator\b"),
    "Fallback": re.compile(r"\bFallback\b"),
    "fallback": re.compile(r"\bfallback\b"),
    "Legacy": re.compile(r"\bLegacy\b"),
    "legacy": re.compile(r"\blegacy\b"),
    # Pozostałe pre-existing tokeny (skróty IEC i kody projektowe)
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
    files: list[Path] = []
    for scan_dir in SCAN_DIRS:
        if not scan_dir.exists():
            continue
        for path in scan_dir.rglob("*"):
            if path.suffix not in FILE_EXTENSIONS:
                continue
            posix_path = path.as_posix()
            if any(part in posix_path for part in SKIP_PARTS):
                continue
            files.append(path)
    return sorted(set(files))


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


# Słownik nowej IA (Program UI/UX 2026-07, decyzja V12K-026 z 2026-07-15):
# w nowej powłoce `frontend/src/ui2/**` terminy „przypadek (obliczeniowy)" i „kreator"
# są KANONICZNE (zatwierdzone makietą U0.6). Bany na te dwa terminy nie obowiązują
# w ui2; pozostałe bany (Run/Proof/Case/... oraz angielskie tokeny) obowiązują wszędzie.
NEW_IA_ALLOWED_TERMS = {"Przypadek", "przypadek", "Kreator", "kreator"}
NEW_IA_PATH_MARKER = "/ui2/"

# E1.6 (reguła U0.9 / MODEL_INTERAKCJI §2.7): w nowej powłoce `ui2/**` teksty
# pierwszoplanowe UI nie mogą zawierać surowych identyfikatorów kodowych
# (snake_case, np. `earthing.resistance_missing`, `run_id`). Identyfikatory
# techniczne wolno pokazywać wyłącznie w strefie „szczegóły techniczne".
NEW_IA_CODE_IDENT = re.compile(r"\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b")


def find_banned_terms(text: str, *, new_ia: bool = False) -> list[str]:
    return [
        label
        for label, pattern in BANNED_UI_TERMS.items()
        if pattern.search(text) and not (new_ia and label in NEW_IA_ALLOWED_TERMS)
    ]


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
            # Pomijamy fragmenty będące programmatic referencjami obiektowymi
            # (np. `${branch.name}` w error message — `branch` to nazwa zmiennej,
            # nie token UI). Dotyczy WYŁĄCZNIE technicznych error/log messages.
            cleaned = PROGRAMMATIC_REF_PATTERN.sub("", fragment)
            is_new_ia = NEW_IA_PATH_MARKER in path.as_posix()
            if is_new_ia and NEW_IA_CODE_IDENT.search(cleaned):
                violations.append(
                    Violation(
                        file_path=normalize_path(path),
                        line_number=line_number,
                        token="identyfikator-kodowy",
                        snippet=fragment[:160],
                    )
                )
            for token in find_banned_terms(cleaned, new_ia=is_new_ia):
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
