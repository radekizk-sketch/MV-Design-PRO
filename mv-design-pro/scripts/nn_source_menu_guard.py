#!/usr/bin/env python3
"""
NN-SOURCE-MENU-GUARD — CI strażnik kompletności menu kontekstowego nN.

Weryfikuje:
1. actionMenuBuilders.ts eksportuje WSZYSTKIE wymagane buildery.
2. ACTION_MENU_MINIMUM_OPTIONS definiuje minimalne liczby opcji.
3. Etykiety menu nie zawierają typowych angielskich słów (tylko PL).
4. Modale źródeł nN istnieją: PVInverterModal, BESSInverterModal, GensetModal, UPSModal.
5. Zwraca exit code 0 (sukces) lub 1 (błąd).

Użycie:
  python scripts/nn_source_menu_guard.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import NamedTuple

REPO_ROOT = Path(__file__).resolve().parents[1]

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

ACTION_MENU_BUILDERS_PATH = (
    REPO_ROOT / "frontend" / "src" / "ui" / "context-menu" / "actionMenuBuilders.ts"
)

MODALS_DIR = REPO_ROOT / "frontend" / "src" / "ui" / "topology" / "modals"

# ---------------------------------------------------------------------------
# Required builders — every nN and SN builder that must be exported
# ---------------------------------------------------------------------------

REQUIRED_BUILDERS = [
    # nN builders
    "buildBusNNContextMenu",
    "buildFeederNNContextMenu",
    "buildSourceFieldNNContextMenu",
    "buildPVInverterContextMenu",
    "buildBESSInverterContextMenu",
    "buildGensetContextMenu",
    "buildUPSContextMenu",
    "buildLoadNNContextMenu",
    "buildEnergyMeterContextMenu",
    "buildSwitchNNContextMenu",
    "buildEnergyStorageContextMenu",
    # SN builders
    "buildSourceSNContextMenu",
    "buildBusSNContextMenu",
    "buildStationContextMenu",
    "buildBaySNContextMenu",
    "buildSwitchSNContextMenu",
    "buildTransformerContextMenu",
    "buildSegmentSNContextMenu",
    "buildRelaySNContextMenu",
    "buildMeasurementSNContextMenu",
    "buildNOPContextMenu",
]

# ---------------------------------------------------------------------------
# Required minimum option keys in ACTION_MENU_MINIMUM_OPTIONS
# ---------------------------------------------------------------------------

REQUIRED_MINIMUM_OPTION_KEYS = [
    # nN
    "BusNN",
    "FeederNN",
    "SourceFieldNN",
    "PVInverter",
    "BESSInverter",
    "Genset",
    "UPS",
    "LoadNN",
    "EnergyMeter",
    "EnergyStorage",
    "SwitchNN",
    # SN
    "Source",
    "Bus",
    "Station",
    "BaySN",
    "Switch",
    "TransformerBranch",
    "Relay",
    "Measurement",
    "NOP",
]

# ---------------------------------------------------------------------------
# Required modal files for nN sources
# ---------------------------------------------------------------------------

# ZDOLNOSC, NIE PLIK DOSTAWCY (V12K-263).
#
# Guard wymagal `GensetModal.tsx` i `UPSModal.tsx` w `ui/topology/modals`. Oba
# zostaly SWIADOMIE zastapione jednym kreatorem ui2 „Zrodlo dyspozycyjne nN
# (agregat / UPS)", ktory obsluguje `DispatchableKind = GENSET | UPS` i zapisuje
# przez `add_genset_nn` / `add_ups_nn` — kontrakt payloadu bez zmian (mowi o tym
# wprost naglowek `zrodloDyspozycyjneModel.ts`). Guard sprawdzal wiec NAZWE
# DOSTAWCY, a nie istnienie zdolnosci: byl czerwony przy KOMPLETNEJ funkcji.
#
# Kanon V12.xx jest rejestrem ZDOLNOSCI, nie ekranow (`componentKey` to metadana
# dostawcy). Dlatego kazda pozycja to teraz para: opis zdolnosci + sciezki, ktore
# moga jej dostarczyc. Wystarczy JEDNA istniejaca — podmiana dostawcy nie lamie
# guarda, ale usuniecie zdolnosci owszem.
DOSTAWCY_ZRODEL_NN: list[tuple[str, list[str]]] = [
    (
        "falownik PV na nN",
        ["frontend/src/ui/topology/modals/PVInverterModal.tsx"],
    ),
    (
        "magazyn BESS na nN",
        ["frontend/src/ui/topology/modals/BESSInverterModal.tsx"],
    ),
    (
        "agregat pradotworczy / UPS na nN",
        [
            "frontend/src/ui2/kreatory/zrodlo-dyspozycyjne/zrodloDyspozycyjneModel.ts",
            "frontend/src/ui/topology/modals/GensetModal.tsx",
            "frontend/src/ui/topology/modals/UPSModal.tsx",
        ],
    ),
]

# ---------------------------------------------------------------------------
# Forbidden English-only words in string labels (case-insensitive).
# Domain abbreviations (PV, BESS, UPS, CT, VT, SN, nN, SOC, NOP, White Box)
# are acceptable as international technical terms.
# ---------------------------------------------------------------------------

FORBIDDEN_ENGLISH_WORDS = [
    r"\bDelete\b",
    r"\bRemove\b",
    r"\bProperties\b",
    r"\bSettings\b",
    r"\bOptions\b",
    r"\bExport data\b",
    r"\bImport\b",
    r"\bToggle\b",
    r"\bConfigure\b",
    r"\bAdd item\b",
    r"\bEdit item\b",
    r"\bShow in tree\b",
    r"\bShow on diagram\b",
    r"\bHistory\b",
    r"\bSelect\b",
    r"\bCreate\b",
]

FORBIDDEN_PATTERNS = [re.compile(p, re.IGNORECASE) for p in FORBIDDEN_ENGLISH_WORDS]

# Regex to extract string literals from TypeScript
STRING_LITERAL_RE = re.compile(
    r"""
    (?P<string>
        '(?:[^'\\]|\\.)*'  |
        "(?:[^"\\]|\\.)*"  |
        `(?:[^`\\]|\\.)*`
    )
    """,
    re.VERBOSE,
)


class Violation(NamedTuple):
    category: str
    message: str


def check_required_builders(content: str) -> list[Violation]:
    """Verify that all required builders are exported from actionMenuBuilders.ts."""
    violations = []
    for builder in REQUIRED_BUILDERS:
        # Check for `export function builderName(` pattern
        pattern = re.compile(rf"\bexport\s+function\s+{re.escape(builder)}\b")
        if not pattern.search(content):
            violations.append(
                Violation(
                    category="MISSING_BUILDER",
                    message=f"Brakuje wymaganego buildera: {builder}",
                )
            )
    return violations


def check_minimum_options_keys(content: str) -> list[Violation]:
    """Verify that ACTION_MENU_MINIMUM_OPTIONS contains all required keys."""
    violations = []

    # Find the ACTION_MENU_MINIMUM_OPTIONS block
    options_match = re.search(
        r"ACTION_MENU_MINIMUM_OPTIONS\s*(?::\s*Record<[^>]+>\s*)?=\s*\{(.*?)\}",
        content,
        re.DOTALL,
    )
    if not options_match:
        violations.append(
            Violation(
                category="MISSING_MAP",
                message="Nie znaleziono ACTION_MENU_MINIMUM_OPTIONS w pliku",
            )
        )
        return violations

    options_block = options_match.group(1)

    for key in REQUIRED_MINIMUM_OPTION_KEYS:
        # Check for `KeyName: <number>` in the block
        key_pattern = re.compile(rf"\b{re.escape(key)}\s*:\s*\d+")
        if not key_pattern.search(options_block):
            violations.append(
                Violation(
                    category="MISSING_MIN_OPTIONS_KEY",
                    message=f"Brakuje klucza '{key}' w ACTION_MENU_MINIMUM_OPTIONS",
                )
            )

    # Verify all values are >= 9 (absolute minimum: properties, show_tree, show_diagram,
    # history, plus at least a few type-specific actions)
    value_pattern = re.compile(r"(\w+)\s*:\s*(\d+)")
    for match in value_pattern.finditer(options_block):
        key_name = match.group(1)
        value = int(match.group(2))
        if value < 9:
            violations.append(
                Violation(
                    category="MIN_OPTIONS_TOO_LOW",
                    message=f"Klucz '{key_name}' ma wartość {value} < 9 (minimum kanoniczne)",
                )
            )

    return violations


def check_english_labels(content: str) -> list[Violation]:
    """Check that LABEL string literals in action() calls do not use forbidden English words.

    The action() helper has the signature: action(id, label, opts?)
    We skip the first string argument (the action ID) and only check the second
    string argument (the user-visible label).
    """
    violations = []
    lines = content.split("\n")
    in_block_comment = False

    # Pattern to extract the label (second argument) from action('id', 'label', ...)
    # Matches: action('some_id', 'Some Label...', ...)
    #      or: action('some_id', result ? 'A' : 'B', ...)
    # We capture all string literals AFTER the first comma in an action() call.
    ACTION_LABEL_RE = re.compile(
        r"""action\(\s*'[^']*'\s*,\s*(.+?)(?:\s*,\s*\{|\s*\))""",
        re.DOTALL,
    )

    for line_num, line in enumerate(lines, start=1):
        stripped = line.strip()

        # Track block comments
        if "/*" in line and "*/" not in line:
            in_block_comment = True
        if "*/" in line:
            in_block_comment = False
            continue
        if in_block_comment or stripped.startswith("//") or stripped.startswith("*"):
            continue

        # Only check lines that contain action() calls
        if "action(" not in line:
            continue

        # Extract label portion (everything after the ID argument)
        for action_match in ACTION_LABEL_RE.finditer(line):
            label_portion = action_match.group(1)

            # Extract string literals from the label portion only
            for string_match in STRING_LITERAL_RE.finditer(label_portion):
                string_content = string_match.group("string")
                inner = string_content[1:-1]
                if not inner:
                    continue

                for pattern in FORBIDDEN_PATTERNS:
                    if pattern.search(inner):
                        violations.append(
                            Violation(
                                category="ENGLISH_LABEL",
                                message=(
                                    f"Linia {line_num}: etykieta {string_content} "
                                    f"zawiera angielski tekst (wzorzec: {pattern.pattern})"
                                ),
                            )
                        )

    return violations


def check_required_modals() -> list[Violation]:
    """Kazda zdolnosc zrodla nN ma co najmniej jednego zyjacego dostawce UI."""
    violations = []
    for zdolnosc, sciezki in DOSTAWCY_ZRODEL_NN:
        zywe = [
            p
            for p in (REPO_ROOT / s for s in sciezki)
            if p.exists() and p.stat().st_size >= 100
        ]
        if not zywe:
            violations.append(
                Violation(
                    category="MISSING_MODAL",
                    message=(
                        f"Brak dostawcy UI dla zdolnosci: {zdolnosc}. "
                        f"Sprawdzone sciezki: {', '.join(sciezki)}"
                    ),
                )
            )
    return violations


def main() -> int:
    """Main entry point."""
    all_violations: list[Violation] = []

    # 1. Read actionMenuBuilders.ts
    if not ACTION_MENU_BUILDERS_PATH.exists():
        print(
            f"BŁĄD KRYTYCZNY: Nie znaleziono pliku {ACTION_MENU_BUILDERS_PATH.relative_to(REPO_ROOT)}",
            file=sys.stderr,
        )
        return 1

    try:
        content = ACTION_MENU_BUILDERS_PATH.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError) as e:
        print(f"BŁĄD: Nie można odczytać pliku: {e}", file=sys.stderr)
        return 1

    # 2. Check required builders
    all_violations.extend(check_required_builders(content))

    # 3. Check minimum option keys
    all_violations.extend(check_minimum_options_keys(content))

    # 4. Check for English labels
    all_violations.extend(check_english_labels(content))

    # 5. Check required modals
    all_violations.extend(check_required_modals())

    # Report
    if all_violations:
        print("=" * 70, file=sys.stderr)
        print("NN-SOURCE-MENU-GUARD: NARUSZENIA WYKRYTE", file=sys.stderr)
        print("=" * 70, file=sys.stderr)
        print(file=sys.stderr)
        print(f"Znaleziono {len(all_violations)} naruszeń:", file=sys.stderr)
        print("-" * 70, file=sys.stderr)

        by_category: dict[str, list[Violation]] = {}
        for v in all_violations:
            by_category.setdefault(v.category, []).append(v)

        for category, items in sorted(by_category.items()):
            print(f"\n  [{category}] ({len(items)} naruszeń):", file=sys.stderr)
            for v in items:
                print(f"    - {v.message}", file=sys.stderr)

        print(file=sys.stderr)
        print("-" * 70, file=sys.stderr)
        print(
            "Napraw powyższe naruszenia, zanim kod zostanie scalony.",
            file=sys.stderr,
        )
        return 1

    print("nn-source-menu-guard: OK (brak naruszeń)", file=sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
