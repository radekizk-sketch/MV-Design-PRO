#!/usr/bin/env python3
"""
UI No-Physics Guard — U5-UI-HIGIENA (part B) + H-1 (scope extension)

Blocks merge if the presentation layer (frontend/src/ui/** and frontend/src/ui2/**)
computes network physics. Physics belongs in backend solvers (network_model/solvers)
with a WHITE BOX trace; the UI only renders values the backend computed
authoritatively (formatting / rounding / axis scaling are fine).

SCOPE = frontend/src/ui/** AND frontend/src/ui2/**.
  ui2/** is the clean-room layer where new development happens, so a new
  `sensitivityAnalyzer`-class defect (physics leaking into the client) would land
  here first. ui/** is the legacy layer; the "relocate UI physics -> backend"
  epic (R1-R3, see docs/uiux/DLUG_FIZYKA_W_UI_2026-07.md) closed it out — every
  enumerated and scan-discovered network-physics module was relocated to a
  backend solver/analysis endpoint or removed as dead code. H-1
  (2026-07-22) measured the remaining ui/** hits against this guard's own
  patterns: 22 raw pattern hits / 18 distinct lines, 0 class-a (real physics),
  9 class-b (false positive: string label or trailing comment), 9 class-c
  (justified exception: fixed IEC 61869-3 VT catalog ratio / catalog-matching
  constant, same class as the R2-resolved `vtMultiWindingContract.ts
  STANDARD_SECONDARY_VOLTAGE_V`). See ALLOWLIST below for the itemised,
  reasoned list — every entry names its class and why it is not network
  physics. No entry hides a class-a defect: none was found.

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

ALLOWLIST (explicit, per file+line, reasoned — see below):
  A hit is allowlisted ONLY if it is (b) a false positive (string literal /
  trailing comment the regex cannot distinguish from code) or (c) a fixed
  catalog constant / catalog-matching conversion defined by an IEC standard
  (not derived from live network topology/state). A hit that computes an
  engineering result FROM network data (ΔU, Ik, load flow, ...) is a class-a
  defect and MUST NOT be allowlisted — it is relocated to a backend solver
  instead (see docs/uiux/DLUG_FIZYKA_W_UI_2026-07.md for the pattern).

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
SCAN_DIRS = [
    REPO_ROOT / "frontend" / "src" / "ui",
    REPO_ROOT / "frontend" / "src" / "ui2",
]

# Explicit allowlist for frontend/src/ui/** (H-1, measured 2026-07-22).
# Keyed by (repo-relative path, 1-based line number) — NOT whole-file, so a new
# violation appearing on a different line of an allowlisted file is still
# caught. Every entry carries its classification (b = false positive,
# c = justified catalog-constant exception) and a one-line reason.
ALLOWLIST: dict[tuple[str, int], str] = {
    # protection-catalogs.ts — VT_CATALOG (VT = voltage transformer, IEC 61869-3).
    # class b: label_pl is a display string for a catalog dropdown, not arithmetic.
    (
        "frontend/src/ui/network-build/station-der/protection-catalogs.ts",
        443,
    ): "b: label_pl string literal (VT nameplate text 'VT 15 kV/root3 / 100 V/root3 ...'), not arithmetic",
    (
        "frontend/src/ui/network-build/station-der/protection-catalogs.ts",
        455,
    ): "b: label_pl string literal (VT nameplate text), not arithmetic",
    (
        "frontend/src/ui/network-build/station-der/protection-catalogs.ts",
        467,
    ): "b: label_pl string literal (VT nameplate text), not arithmetic",
    (
        "frontend/src/ui/network-build/station-der/protection-catalogs.ts",
        479,
    ): "b: label_pl string literal (VT nameplate text), not arithmetic",
    # class c: ratio_primary_kv / ratio_secondary_v are fixed VT ratios per
    # IEC 61869-3 (rated primary/secondary voltage of a VT type is a standard
    # constant, not derived from live network topology/state) — same class as
    # the R2-resolved vtMultiWindingContract.ts STANDARD_SECONDARY_VOLTAGE_V
    # ("100/root3 V = stala katalogowa IEC 61869-3, nie obliczenie fizyki").
    (
        "frontend/src/ui/network-build/station-der/protection-catalogs.ts",
        444,
    ): "c: VT catalog constant per IEC 61869-3 (ratio_primary_kv), see R2 precedent",
    (
        "frontend/src/ui/network-build/station-der/protection-catalogs.ts",
        445,
    ): "c: VT catalog constant per IEC 61869-3 (ratio_secondary_v), see R2 precedent",
    (
        "frontend/src/ui/network-build/station-der/protection-catalogs.ts",
        456,
    ): "c: VT catalog constant per IEC 61869-3 (ratio_primary_kv), see R2 precedent",
    (
        "frontend/src/ui/network-build/station-der/protection-catalogs.ts",
        457,
    ): "c: VT catalog constant per IEC 61869-3 (ratio_secondary_v), see R2 precedent",
    (
        "frontend/src/ui/network-build/station-der/protection-catalogs.ts",
        468,
    ): "c: VT catalog constant per IEC 61869-3 (ratio_primary_kv), see R2 precedent",
    (
        "frontend/src/ui/network-build/station-der/protection-catalogs.ts",
        469,
    ): "c: VT catalog constant per IEC 61869-3 (ratio_secondary_v), see R2 precedent",
    (
        "frontend/src/ui/network-build/station-der/protection-catalogs.ts",
        480,
    ): "c: VT catalog constant per IEC 61869-3 (ratio_primary_kv), see R2 precedent",
    (
        "frontend/src/ui/network-build/station-der/protection-catalogs.ts",
        481,
    ): "c: VT catalog constant per IEC 61869-3 (ratio_secondary_v), see R2 precedent",
    # class c: selectVtForVoltage() converts a nominal system voltage (a
    # discrete catalog-level input, e.g. 15/20 kV) to a per-phase value with
    # the fixed IEC 61869-3 factor 1/root3 to filter VT_CATALOG — a catalog
    # lookup/match, not a computation over network topology/state (no
    # impedance, current, or power-flow term involved).
    (
        "frontend/src/ui/network-build/station-der/protection-catalogs.ts",
        645,
    ): "c: catalog-matching helper (selectVtForVoltage), fixed IEC 61869-3 factor, no network-state term",
    # StationWizardStepContent.tsx — descriptive UI strings, no arithmetic.
    (
        "frontend/src/ui/network-build/station-wizard-v2/StationWizardStepContent.tsx",
        374,
    ): "b: JSX label prop string ('VT 15:root3/0.1:root3 kV - 4-uzwojeniowy'), not arithmetic",
    (
        "frontend/src/ui/network-build/station-wizard-v2/StationWizardStepContent.tsx",
        684,
    ): "b: descriptive string naming the backend solver's method (IEC 60909-0), not a UI computation",
    # metersContract.ts — trailing comment (not a whole-line comment, so the
    # guard's SKIP_LINE_PATTERNS regex does not recognise it as a comment).
    (
        "frontend/src/ui/network-build/station-wizard-v2/metersContract.ts",
        57,
    ): "b: trailing line comment ('typ. 100 / root3'), not code",
    # sldCanonKit.tsx — string template building a display label.
    (
        "frontend/src/ui/sld/v2/station-rozdzielnia/canon/sldCanonKit.tsx",
        55,
    ): "b: string template building a display label ('VT . ${primary}/root3'), computes nothing",
    # ozeTypes.ts — trailing comment documenting a field's meaning.
    (
        "frontend/src/ui/sld/v2/station-rozdzielnia/companions/ozeTypes.ts",
        49,
    ): "b: trailing line comment documenting a field's meaning, not code",
}

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


def _relative_path_str(path: Path) -> str | None:
    """Repo-relative POSIX-style path, or None if path is outside REPO_ROOT
    (e.g. a tmp_path fixture in tests) — such paths are never allowlisted."""
    try:
        return str(path.relative_to(REPO_ROOT)).replace("\\", "/")
    except ValueError:
        return None


def _is_allowlisted(path: Path, line_no: int) -> bool:
    rel = _relative_path_str(path)
    if rel is None:
        return False
    return (rel, line_no) in ALLOWLIST


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
    """Scan the given directories, returning all NON-allowlisted violations.

    Raw detection lives in scan_file() (untouched by the allowlist), so a
    baseline hit-count measurement can still be taken against it; allowlist
    filtering happens only here, keyed to the exact (repo-relative path, line)
    of each reasoned ALLOWLIST entry — a new hit elsewhere in an allowlisted
    file is never silently absorbed.
    """
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
                if _is_allowlisted(path, line_no):
                    continue
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
        print("UI-NO-PHYSICS-GUARD VIOLATIONS (ui/**, ui2/**):", file=sys.stderr)
        for path, line_no, line_content, pattern in all_violations:
            rel_path = path.relative_to(REPO_ROOT)
            print(f"  {rel_path}:{line_no}: {line_content}", file=sys.stderr)
            print(f"    Matched pattern: {pattern}", file=sys.stderr)
        print(
            f"\n{len(all_violations)} violation(s) found. The presentation layer "
            "(ui/**, ui2/**) must not compute network physics (move it to a "
            "backend solver/analysis with a WHITE BOX trace, or add a reasoned "
            "ALLOWLIST entry if it is genuinely not physics — see module "
            "docstring).",
            file=sys.stderr,
        )
        return 1

    print("ui-no-physics-guard: PASS (0 violations in ui/**, ui2/**)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
