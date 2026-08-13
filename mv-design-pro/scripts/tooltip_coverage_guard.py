#!/usr/bin/env python3
"""
TOOLTIP COVERAGE GUARD — CI Enforcement (plan Phase 1 kryterium 4)

BINDING RULE (soft):
- Każde pole formularza w `network-build/forms/*.tsx` powinno mieć tooltip
  inżynierski z opisem PL + odniesienie do normy gdzie aplikowalne.
- Tooltip = `title=`, `aria-describedby=`, lub <Tooltip>/<HelpHint> wrapper.

Skanowanie:
- Pliki w `network-build/forms/` (oraz `forms/profiles/`)
- Dla każdego <input>, <select>, <textarea> sprawdza obecność tooltipa w obrębie
  ich rodzica (label + tooltip).
- Reporting jako WARNING (exit 0) — bo nie wszystkie pola wymagają (np. hidden).

Tryb strict: --strict → exit 1 przy brakach.

Usage:
  python scripts/tooltip_coverage_guard.py
  python scripts/tooltip_coverage_guard.py --strict
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
FRONTEND_SRC = REPO_ROOT / "frontend" / "src"
FORMS_DIR = FRONTEND_SRC / "ui" / "network-build" / "forms"

INPUT_PATTERN = re.compile(r"<(input|select|textarea)\b", re.IGNORECASE)
TOOLTIP_HINTS = [
    re.compile(r"title=[\"']"),
    re.compile(r"aria-describedby="),
    re.compile(r"<Tooltip\b"),
    re.compile(r"<HelpHint\b"),
    re.compile(r"<HelpTooltip\b"),
    re.compile(r"<FieldHelp\b"),
]


def scan_file(path: Path) -> list[tuple[int, str]]:
    """Zwraca listę (line_no, tag) dla pól bez tooltipa w okolicy (±5 linii)."""
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    findings: list[tuple[int, str]] = []
    for i, line in enumerate(lines):
        m = INPUT_PATTERN.search(line)
        if not m:
            continue
        tag = m.group(1)
        # Skip hidden inputs
        if 'type="hidden"' in line or "type='hidden'" in line:
            continue
        window_start = max(0, i - 5)
        window_end = min(len(lines), i + 6)
        window = "\n".join(lines[window_start:window_end])
        if not any(p.search(window) for p in TOOLTIP_HINTS):
            findings.append((i + 1, tag))
    return findings


def main() -> int:
    strict = "--strict" in sys.argv

    if not FORMS_DIR.exists():
        print(
            f"tooltip_coverage_guard: katalog {FORMS_DIR} nie istnieje, skip",
            file=sys.stderr,
        )
        return 0

    all_findings: list[tuple[Path, list[tuple[int, str]]]] = []
    total_inputs = 0
    total_missing = 0

    for tsx in sorted(FORMS_DIR.rglob("*.tsx")):
        if tsx.name.endswith(".test.tsx"):
            continue
        findings = scan_file(tsx)
        text = tsx.read_text(encoding="utf-8")
        all_inputs = len(INPUT_PATTERN.findall(text))
        total_inputs += all_inputs
        total_missing += len(findings)
        if findings:
            all_findings.append((tsx.relative_to(REPO_ROOT), findings))

    if total_inputs == 0:
        print("tooltip_coverage_guard: brak pól formularzy do sprawdzenia")
        return 0

    coverage = 1.0 - (total_missing / total_inputs)
    print(
        f"tooltip_coverage_guard: coverage {coverage * 100:.1f}% "
        f"({total_inputs - total_missing}/{total_inputs} pól ma tooltip)"
    )

    if all_findings:
        print()
        print("Pola bez tooltipa (uzupełnij `title=`, `aria-describedby=` lub <Tooltip>):")
        for path, findings in all_findings[:20]:  # max 20 plików
            print(f"  {path}:")
            for line, tag in findings[:5]:  # max 5 per plik
                print(f"    line {line}: <{tag}>")
        if len(all_findings) > 20:
            print(f"  ... oraz {len(all_findings) - 20} więcej plików")

    if strict and total_missing > 0:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
