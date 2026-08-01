#!/usr/bin/env python3
"""
PHYSICS-LABEL GUARD — CI enforcement for catalog-first modals.

BINDING RULE (PR-10):
- Modale topologii (BranchModal, TransformerStationModal, LoadDERModal,
  MeasurementModal, ProtectionModal) NIE MOGĄ zawierać edytowalnych pól
  z parametrami fizycznymi (R', X', B', uk%, Sn, ratio, burden, class, etc.).
- Parametry fizyczne mogą być wyświetlane wyłącznie jako READ-ONLY w CatalogPreview.

Skanuje pliki modali i walidacji w poszukiwaniu podejrzanych nazw pól
w kontekście <input>, <Input>, name=, defaultValue=, register(.

Dozwolone:
- CatalogPreview.tsx (podgląd READ-ONLY — nie skanowany)
- ExpertOverrides.tsx (klucze override — nie skanowany)
- Pliki testowe (__tests__/) — nie skanowane
- Komentarze w kodzie

Pattern: physics field names in input/register/name contexts

Usage:
  python scripts/physics_label_guard.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import NamedTuple

REPO_ROOT = Path(__file__).resolve().parents[1]

# Directories to scan (relative to REPO_ROOT)
SCAN_DIRS = [
    "frontend/src/ui/topology/modals",
]

# Files to SKIP (read-only components, test files, shared components)
SKIP_FILENAMES = {
    "CatalogPreview.tsx",
    "ExpertOverrides.tsx",
    "index.ts",
}

SKIP_DIR_PARTS = {"__tests__", "__mocks__", "test", "tests"}

# File extensions to check
FILE_EXTENSIONS = {".ts", ".tsx"}

# Physics field name patterns — these should NOT appear in editable input contexts
PHYSICS_FIELD_NAMES = [
    # Branch impedance parameters
    r"r_ohm_per_km",
    r"x_ohm_per_km",
    r"b_siemens_per_km",
    r"r0_ohm_per_km",
    r"x0_ohm_per_km",
    r"b0_siemens_per_km",
    r"c_nf_per_km",
    r"max_i_ka",
    # Transformer electrical parameters
    r"sn_mva",
    r"uhv_kv",
    r"ulv_kv",
    r"uk_percent",
    r"pk_kw",
    r"p0_kw",
    r"i0_percent",
    r"vector_group",
    r"tap_min",
    r"tap_max",
    r"tap_step_percent",
    # Load/Generator electrical parameters
    r"p_mw",
    r"q_mvar",
    r"cos_phi",
    r"p_min_mw",
    r"p_max_mw",
    r"q_min_mvar",
    r"q_max_mvar",
    # Measurement parameters
    r"ratio_primary",
    r"ratio_secondary",
    r"accuracy_class",
    r"burden_va",
    # Protection settings
    r"threshold_a",
    r"time_delay_s",
    r"curve_type",
]

# Contexts that indicate an editable input field
INPUT_CONTEXTS = [
    r'name\s*[=:]\s*["\']({field})["\']',
    r'register\s*\(\s*["\']({field})["\']',
    r"defaultValue\s*.*({field})",
    r'<input[^>]*name\s*=\s*["\']({field})["\']',
    r'<Input[^>]*name\s*=\s*["\']({field})["\']',
    r'<TextField[^>]*name\s*=\s*["\']({field})["\']',
    r'<NumberInput[^>]*name\s*=\s*["\']({field})["\']',
    r"onChange\s*.*({field})",
]

# Comment line patterns (for lines to skip entirely)
COMMENT_LINE_PATTERNS = [
    re.compile(r"^\s*//"),
    re.compile(r"^\s*\*"),
    re.compile(r"^\s*/\*"),
    re.compile(r"^\s*\*/"),
    re.compile(r"^\s*\{/\*"),
]

# Inline ignore pattern
IGNORE_PATTERN = re.compile(r"//\s*physics-guard-ignore")

# Jawne, punktowe wyjątki (plik, pole) → UZASADNIENIE OBOWIĄZKOWE.
# Wyłącznie dla pól, które są nastawą OPERACYJNĄ instalacji, a nie parametrem
# fizycznym typu katalogowego (PR-10 nienaruszone — parametry typu idą z
# katalogu; nastawa trybu regulacji jest per instalacja). Mechanizm celowo
# NIE osłabia reguły: każdy inny plik/pole (w tym cos_phi w LoadDERModal,
# gdzie jest fizyką modelu odbioru) nadal blokuje CI. Marker inline
# `// physics-guard-ignore` jest niemożliwy w pozycji atrybutu JSX (składnia),
# stąd allowlist po stronie guardu.
ALLOWED_OPERATIONAL_SETPOINTS: dict[tuple[str, str], str] = {
    ("PVInverterModal.tsx", "cos_phi"): (
        "Nastawa trybu regulacji STALY_COS_PHI falownika (DER_PV_BESS_FW_CONFIGURATOR "
        "§3.3 'Tryb regulacji: stały cos φ'), walidowana (0,1]; model falownika "
        "wiązany z katalogu przez catalog_item_id."
    ),
}


class Violation(NamedTuple):
    file_path: str
    line_number: int
    line_content: str
    field_name: str


def is_comment_line(line: str) -> bool:
    """Check if a line is a comment (to be skipped)."""
    trimmed = line.strip()
    return any(pattern.match(trimmed) for pattern in COMMENT_LINE_PATTERNS)


def should_skip_file(file_path: Path) -> bool:
    """Check if file should be skipped."""
    if file_path.name in SKIP_FILENAMES:
        return True
    if any(part in SKIP_DIR_PARTS for part in file_path.parts):
        return True
    return False


def build_patterns() -> list[tuple[re.Pattern, str]]:
    """Build compiled regex patterns for all field × context combinations."""
    patterns = []
    for field in PHYSICS_FIELD_NAMES:
        for ctx_template in INPUT_CONTEXTS:
            ctx = ctx_template.format(field=re.escape(field))
            patterns.append((re.compile(ctx), field))
    return patterns


def scan_file(file_path: Path, patterns: list[tuple[re.Pattern, str]]) -> list[Violation]:
    """Scan a single file for physics fields in input contexts."""
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

        # Check all patterns
        for pattern, field_name in patterns:
            if pattern.search(line):
                if (file_path.name, field_name) in ALLOWED_OPERATIONAL_SETPOINTS:
                    continue
                violations.append(
                    Violation(
                        file_path=str(file_path.relative_to(REPO_ROOT)),
                        line_number=line_num,
                        line_content=trimmed[:100],
                        field_name=field_name,
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
            for f in dir_path.rglob(f"*{ext}"):
                if not should_skip_file(f):
                    files.append(f)
    return sorted(set(files))


def main() -> int:
    """Main entry point."""
    patterns = build_patterns()
    violations = []

    for file_path in iter_files(REPO_ROOT):
        file_violations = scan_file(file_path, patterns)
        violations.extend(file_violations)

    if violations:
        print("=" * 70, file=sys.stderr)
        print("PHYSICS-LABEL GUARD: NARUSZENIE WYKRYTE", file=sys.stderr)
        print("=" * 70, file=sys.stderr)
        print(file=sys.stderr)
        print(
            "Modale topologii nie mogą zawierać edytowalnych pól fizycznych.",
            file=sys.stderr,
        )
        print(
            "Parametry fizyczne powinny być wyłącznie w CatalogPreview (READ-ONLY).",
            file=sys.stderr,
        )
        print(file=sys.stderr)
        print(f"Znaleziono {len(violations)} naruszeń:", file=sys.stderr)
        print("-" * 70, file=sys.stderr)

        for v in violations:
            print(f"  {v.file_path}:{v.line_number}", file=sys.stderr)
            print(f"    Pole fizyczne: {v.field_name}", file=sys.stderr)
            print(f"    Linia: {v.line_content}", file=sys.stderr)
            print(file=sys.stderr)

        print("-" * 70, file=sys.stderr)
        print(
            "Napraw powyższe naruszenia, zanim kod zostanie scalony.",
            file=sys.stderr,
        )
        return 1

    print("physics-label-guard: OK (brak naruszeń)", file=sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
