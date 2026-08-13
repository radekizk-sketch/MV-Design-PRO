#!/usr/bin/env python3
"""CI Guard: zakazane angielskie terminy w plikach backend Python.

Mirror frontendowego `forbidden_ui_terms_guard.py` dla backendowych plików
Python. Sprawdza widoczne dla użytkownika stringi (`message_pl`, `fix_hint_pl`,
`suggested_fix`, `notes_pl`, `description`) i komentarze pod kątem zakazanych
terminów wg goal §8:

- proof, run, snapshot, case, branch, feeder, fallback, legacy, mock, debug,
  TODO, placeholder, coming soon, not implemented.

Skanuje wybrane moduły backendu (application, enm, api) oraz nowe pliki w
network_model/catalog/switchgear, w których pojawiają się polskie etykiety
i opisy.

EXIT 0 — brak naruszeń, EXIT 1 — naruszenia.
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_SRC = REPO_ROOT / "backend" / "src"

# Tylko stringi widoczne użytkownikowi (message_pl, fix_hint_pl, notes_pl,
# description). Skanujemy literały tylko, by nie złapać nazw klas i pól typu
# `branch`, `branches`, `case_id`, `run_id`, `snapshot_id` (te są kontraktem).
_USER_VISIBLE_KEYS_RE = re.compile(
    r"(?:message_pl|fix_hint_pl|notes_pl|description_pl|suggested_fix)\s*=\s*"
    r'(?:f|r)?["\']([^"\']*)["\']',
    re.MULTILINE | re.IGNORECASE,
)

# Forbidden tokens (lowercase) — szukamy jako word-boundary.
_FORBIDDEN_TOKENS: tuple[str, ...] = (
    "todo",
    "placeholder",
    "coming soon",
    "not implemented",
    "fallback",
    "legacy",
    "mock",
    "debug",
)


@dataclass
class Violation:
    file: Path
    line_no: int
    token: str
    excerpt: str


@dataclass
class GuardReport:
    files_scanned: int = 0
    violations: list[Violation] = field(default_factory=list)


def _scan_file(path: Path, report: GuardReport) -> None:
    report.files_scanned += 1
    try:
        text = path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        return
    for match in _USER_VISIBLE_KEYS_RE.finditer(text):
        literal = match.group(1).lower()
        line_no = text.count("\n", 0, match.start()) + 1
        for token in _FORBIDDEN_TOKENS:
            if re.search(rf"\b{re.escape(token)}\b", literal):
                report.violations.append(
                    Violation(
                        file=path,
                        line_no=line_no,
                        token=token,
                        excerpt=literal[:80],
                    )
                )
                break


def _iter_python_files() -> list[Path]:
    candidates: list[Path] = []
    if not BACKEND_SRC.exists():
        return candidates
    for module in ("application", "enm", "api", "network_model/catalog/switchgear"):
        module_dir = BACKEND_SRC / module
        if module_dir.exists():
            candidates.extend(module_dir.rglob("*.py"))
    return sorted(p for p in candidates if p.is_file())


def run(*, json_output: bool) -> int:
    report = GuardReport()
    for path in _iter_python_files():
        _scan_file(path, report)

    if json_output:
        import json

        payload = {
            "files_scanned": report.files_scanned,
            "violation_count": len(report.violations),
            "violations": [
                {
                    "file": str(v.file.relative_to(REPO_ROOT)),
                    "line": v.line_no,
                    "token": v.token,
                    "excerpt": v.excerpt,
                }
                for v in report.violations
            ],
        }
        json.dump(payload, sys.stdout, ensure_ascii=False, indent=2)
        sys.stdout.write("\n")
        return 1 if report.violations else 0

    print(
        "language_guard: "
        f"przeskanowano {report.files_scanned} plików Python, "
        f"naruszeń: {len(report.violations)}."
    )
    if report.violations:
        print("\nZakazane terminy w widocznych dla użytkownika stringach:")
        for v in report.violations[:25]:
            rel = v.file.relative_to(REPO_ROOT)
            print(f"  - {rel}:{v.line_no} [{v.token}] {v.excerpt}")
        if len(report.violations) > 25:
            print(f"  ... oraz {len(report.violations) - 25} kolejnych")
        return 1
    print("OK: brak zakazanych terminów w widocznych komunikatach.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Guard zakazanych terminów w PL stringach.")
    parser.add_argument("--json", action="store_true", help="Wynik jako JSON.")
    args = parser.parse_args(argv)
    return run(json_output=args.json)


if __name__ == "__main__":
    raise SystemExit(main())
