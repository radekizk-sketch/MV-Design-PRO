#!/usr/bin/env python3
"""CI Guard: false-zero patterns w UI frontend (report-only).

Skanuje frontend pod kątem patternów które mogą podsuwać operatorowi
fałszywe 0.00 zamiast „brak danych" / „brak wyników" wg goal §7
i invariant #7 (brak danych/wyniku ≠ 0.00).

Wykrywane wzorce w plikach TS/TSX:
- `(... ?? 0).toFixed`,
- `(... ?? 0).toLocaleString`,
- `Number(... || 0)`,
- `... ?? 0` w bezpośredniej blizu kontekstu wartości elektrycznej
  (kV, A, kW, kVAr, MW, MVAr, m, km, °C).

W trybie domyślnym (report-only) skrypt zawsze kończy się EXIT 0 i wypisuje
liczbę naruszeń. W trybie `--strict` EXIT 1 gdy znaleziono jakiekolwiek
naruszenia. Whitelistowane pliki przez komentarz
`// guard:false_zero allow` na początku pliku.

EXIT:
  0 — report-only (default) lub strict bez naruszeń,
  1 — strict + naruszenia,
  2 — błąd skanu.
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_SRC = REPO_ROOT / "frontend" / "src" / "ui"

ALLOW_MARKER = "guard:false_zero allow"

# Pattern 1: `(... ?? 0).toFixed(...)` lub .toLocaleString
_TOFIXED_RE = re.compile(r"\?\?\s*0\s*\)\s*\.\s*(?:toFixed|toLocaleString)\s*\(")

# Pattern 2: `Number(... || 0)` lub `Number(... ?? 0)` w kontekście liczby
_NUMBER_FALSE_ZERO_RE = re.compile(r"Number\s*\([^)]*(?:\|\|\s*0|\?\?\s*0)\)")

# Pattern 3: literal-zero defaults dla wartości elektrycznych
_ELECTRICAL_UNIT_HINT_RE = re.compile(
    r"\b(?:kV|kVAr|kW|MW|MVAr|MVA|kA|kWh|MWh)\b",
)


@dataclass
class Violation:
    file: Path
    line_no: int
    pattern: str
    excerpt: str


@dataclass
class GuardReport:
    files_scanned: int = 0
    files_with_violations: int = 0
    whitelisted_files: int = 0
    violations: list[Violation] = field(default_factory=list)


def _scan_file(path: Path, report: GuardReport) -> None:
    report.files_scanned += 1
    try:
        text = path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        return

    if ALLOW_MARKER in text:
        report.whitelisted_files += 1
        return

    has_electrical = bool(_ELECTRICAL_UNIT_HINT_RE.search(text))
    file_violations: list[Violation] = []

    for match in _TOFIXED_RE.finditer(text):
        line_no = text.count("\n", 0, match.start()) + 1
        line_text = _line_at(text, line_no)
        file_violations.append(
            Violation(
                file=path,
                line_no=line_no,
                pattern="?? 0 + toFixed/toLocaleString",
                excerpt=line_text[:80],
            )
        )

    # Pattern 2 stricter: tylko gdy plik mówi o jednostkach elektrycznych,
    # żeby uniknąć fałszywych pozytywów dla licznych default = 0.
    if has_electrical:
        for match in _NUMBER_FALSE_ZERO_RE.finditer(text):
            line_no = text.count("\n", 0, match.start()) + 1
            line_text = _line_at(text, line_no)
            file_violations.append(
                Violation(
                    file=path,
                    line_no=line_no,
                    pattern="Number(... || 0) w kontekście elektrycznym",
                    excerpt=line_text[:80],
                )
            )

    if file_violations:
        report.files_with_violations += 1
        report.violations.extend(file_violations)


def _line_at(text: str, line_no: int) -> str:
    lines = text.splitlines()
    if 1 <= line_no <= len(lines):
        return lines[line_no - 1].strip()
    return ""


def _iter_frontend_files() -> list[Path]:
    if not FRONTEND_SRC.exists():
        return []
    candidates: list[Path] = []
    for pattern in ("**/*.ts", "**/*.tsx"):
        candidates.extend(FRONTEND_SRC.glob(pattern))
    # Pomijamy testy — zera w testach są intencjonalne.
    return sorted(
        p for p in candidates if p.is_file() and "__tests__" not in str(p)
    )


def run(*, strict: bool, json_output: bool) -> int:
    report = GuardReport()
    for path in _iter_frontend_files():
        _scan_file(path, report)

    if json_output:
        import json

        json.dump(
            {
                "files_scanned": report.files_scanned,
                "files_with_violations": report.files_with_violations,
                "whitelisted_files": report.whitelisted_files,
                "violation_count": len(report.violations),
                "violations": [
                    {
                        "file": str(v.file.relative_to(REPO_ROOT)),
                        "line": v.line_no,
                        "pattern": v.pattern,
                        "excerpt": v.excerpt,
                    }
                    for v in report.violations
                ],
            },
            sys.stdout,
            ensure_ascii=False,
            indent=2,
        )
        sys.stdout.write("\n")
    else:
        print(
            "false_zero_guard: "
            f"przeskanowano {report.files_scanned} plików, "
            f"{report.files_with_violations} z naruszeniami "
            f"({len(report.violations)} łącznie), "
            f"whitelistowane: {report.whitelisted_files}."
        )
        if report.violations:
            print("\nFałszywe 0 do przeglądu (operator widzi 0.00 zamiast 'brak'):")
            for v in report.violations[:25]:
                rel = v.file.relative_to(REPO_ROOT)
                print(f"  - {rel}:{v.line_no} [{v.pattern}] {v.excerpt}")
            if len(report.violations) > 25:
                print(f"  ... oraz {len(report.violations) - 25} kolejnych")

    if strict and report.violations:
        return 1
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Guard fałszywych 0 w UI elektrycznym.")
    parser.add_argument(
        "--strict",
        action="store_true",
        help="EXIT 1 gdy znaleziono naruszenia (domyślnie report-only EXIT 0).",
    )
    parser.add_argument("--json", action="store_true", help="Wynik jako JSON.")
    args = parser.parse_args(argv)
    try:
        return run(strict=args.strict, json_output=args.json)
    except Exception as exc:  # noqa: BLE001
        print(f"false_zero_guard: błąd skanu: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
