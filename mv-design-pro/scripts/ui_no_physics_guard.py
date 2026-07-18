#!/usr/bin/env python3
"""
UI No-Physics Guard — U5-UI-HIGIENA (part B)

Blocks merge if the clean-room presentation layer (frontend/src/ui2/**) computes
network physics. Physics belongs in backend solvers (network_model/solvers) with
a WHITE BOX trace; the UI only renders values the backend computed authoritatively
(formatting / rounding / axis scaling are fine).

SCOPE = frontend/src/ui2/** ONLY (greenfield / clean-room layer).
  ui2/** is the target layer where new development happens, so a new
  `sensitivityAnalyzer`-class defect (physics leaking into the client) would land
  here first. This guard keeps that layer physics-free from day one.

  The legacy layer frontend/src/ui/** is NOT scanned yet: it still contains real
  network physics in the presentation layer (ΔU, Ik3, PN-EN 50522 earth-fault
  current, IEC 60255 curves). That is a TRACKED debt — see
  docs/uiux/DLUG_FIZYKA_W_UI_2026-07.md (Zero-Debt pt 4: recorded with cause and
  plan, NOT masked, NOT allowlisted as "not physics"). The guard scope will be
  extended to ui/** once the "relocate UI physics -> backend" epic closes.

WHAT IS DETECTED — strong, unambiguous network-physics computation signals:
  - Math.sqrt(3) / √3 used in an arithmetic expression (3-phase line math).
  - Arithmetic (multiply/divide) on impedance / admittance / reactance /
    susceptance quantities.
  - Load-flow sensitivity coefficients dUdP / dUdQ used in arithmetic, and the
    voltage-drop shorthand deltaU used in arithmetic (the removed
    `sensitivityAnalyzer` did `deltaU = dUdP*P + dUdQ*Q`).

WHAT IS NOT DETECTED (deliberately, to avoid false positives):
  - The bare token `current`: ubiquitous NON-physics in React/DOM
    (`aria-current`, Tailwind `bg-current`/`text-current`/`border-current`,
    `data-testid="...current..."`, React setState updaters `(current) => current + 1`,
    ref `.current`). It is therefore excluded from detection entirely.
  - Formatting / rounding / unit conversion / axis scaling of a value already
    computed by the backend (e.g. `sk_mva` read + `toFixed`, `MW -> kW`).
  - Reading/labelling backend short-circuit results (Ik", ip, Ith, Sk columns).
  - Comments, imports, type/interface declarations, string/JSDoc lines.

EXCLUDED PATHS:
  **/__tests__/**, **/*.test.*, **/*.spec.*  (tests reference physics in fixtures).

EXIT CODES:
  0 = clean (no violations)
  1 = violation found
  2 = scan directory not found (skip)
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SCAN_DIRS = [REPO_ROOT / "frontend" / "src" / "ui2"]

# Impedance-family electrical quantities (matched inside identifiers too, e.g.
# `reactanceOhmPerKm`). Multiplying/dividing these is network physics.
_IMPEDANCE_FAMILY = r"\w*(?:impedance|admittance|reactance|susceptance)\w*"

# Strong physics-computation patterns. Each indicates a formula, not formatting.
PHYSICS_PATTERNS = [
    # √3 (3-phase line factor) participating in arithmetic.
    re.compile(r"Math\.sqrt\(\s*3(?:\.0+)?\s*\)\s*[*/]"),
    re.compile(r"[*/]\s*Math\.sqrt\(\s*3(?:\.0+)?\s*\)"),
    re.compile(r"√\s*3\s*[*/]"),
    re.compile(r"[*/]\s*√\s*3"),
    # Arithmetic on impedance-family quantities.
    re.compile(rf"\b{_IMPEDANCE_FAMILY}\b\s*[*/]"),
    re.compile(rf"[*/]\s*\b{_IMPEDANCE_FAMILY}\b"),
    # Load-flow sensitivity coefficients used in arithmetic.
    re.compile(r"\b(?:dUdP|dUdQ)\b\s*[-+*/]"),
    re.compile(r"[-+*/]\s*\b(?:dUdP|dUdQ)\b"),
    # Voltage-drop shorthand used in arithmetic (not plain assignment from API).
    re.compile(r"\bdeltaU\b\s*[-+*/]"),
    re.compile(r"[-+*/]\s*\bdeltaU\b"),
]

# Lines to skip (comments, imports, type declarations, JSDoc, description fields).
SKIP_LINE_PATTERNS = [
    re.compile(r"^\s*//"),            # Single-line comment
    re.compile(r"^\s*\*"),            # Block comment continuation
    re.compile(r"^\s*/\*"),           # Block comment start
    re.compile(r"^\s*import\s"),      # Import statements
    re.compile(r"^\s*export\s+type"),  # Type exports
    re.compile(r"^\s*export\s+interface"),  # Interface exports
    re.compile(r"^\s*\*\s*@"),        # JSDoc annotations
    re.compile(r"^\s*\*\s*-"),        # JSDoc list items
    re.compile(r"^\s*description:"),  # Description fields
]

# File extensions to scan
SCAN_EXTENSIONS = {".ts", ".tsx"}

# Path fragments excluded from scanning.
EXCLUDE_PATTERNS = [
    re.compile(r"__tests__"),
    re.compile(r"\.test\."),
    re.compile(r"\.spec\."),
]


def _should_skip_line(line: str) -> bool:
    for pattern in SKIP_LINE_PATTERNS:
        if pattern.search(line):
            return True
    return False


def _should_exclude_file(path: Path) -> bool:
    path_str = str(path).replace("\\", "/")
    for pattern in EXCLUDE_PATTERNS:
        if pattern.search(path_str):
            return True
    return False


def scan_file(path: Path) -> list[tuple[int, str, str]]:
    """Scan one file. Returns (line_number, line_content, matched_pattern)."""
    violations: list[tuple[int, str, str]] = []
    try:
        content = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return violations

    for line_no, line in enumerate(content.splitlines(), start=1):
        if _should_skip_line(line):
            continue
        for pattern in PHYSICS_PATTERNS:
            if pattern.search(line):
                violations.append((line_no, line.strip(), pattern.pattern))

    return violations


def scan_tree(scan_dirs: list[Path]) -> list[tuple[Path, int, str, str]]:
    """Scan the given directories, returning all violations."""
    all_violations: list[tuple[Path, int, str, str]] = []
    for scan_dir in scan_dirs:
        if not scan_dir.exists():
            continue
        for path in sorted(scan_dir.rglob("*")):
            if not path.is_file():
                continue
            if path.suffix not in SCAN_EXTENSIONS:
                continue
            if _should_exclude_file(path):
                continue
            for line_no, line_content, pattern in scan_file(path):
                all_violations.append((path, line_no, line_content, pattern))
    return all_violations


def main() -> int:
    if not any(d.exists() for d in SCAN_DIRS):
        print(
            "ui-no-physics-guard: no scan directory found: "
            + ", ".join(str(d) for d in SCAN_DIRS),
            file=sys.stderr,
        )
        return 2

    all_violations = scan_tree(SCAN_DIRS)

    if all_violations:
        print("UI-NO-PHYSICS-GUARD VIOLATIONS (ui2/**):", file=sys.stderr)
        for path, line_no, line_content, pattern in all_violations:
            rel_path = path.relative_to(REPO_ROOT)
            print(f"  {rel_path}:{line_no}: {line_content}", file=sys.stderr)
            print(f"    Matched pattern: {pattern}", file=sys.stderr)
        print(
            f"\n{len(all_violations)} violation(s) found. The ui2/** clean-room "
            "layer must not compute network physics (move it to a backend "
            "solver/analysis with a WHITE BOX trace).",
            file=sys.stderr,
        )
        return 1

    print("ui-no-physics-guard: PASS (0 violations in ui2/**)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
