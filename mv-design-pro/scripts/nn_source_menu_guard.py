#!/usr/bin/env python3
"""
NN-SOURCE-MENU-GUARD — CI straznik kompletnosci wejsc menu dla zrodel nN.

K5-A: dawna sciezka menu (actionMenuBuilders.ts + EngineeringContextMenu.tsx)
zostala skasowana jako martwy kod. Jedyna zywa sciezka menu kanwy SLD to
SLD_MENU_REGISTRY (frontend/src/ui/sld/v2/command/SldCommandService.ts)
z wykonawca w frontend/src/ui/sld/shared/sldActionExecutor.ts. Guard pilnuje
ZDOLNOSCI (nie plikow dostawcy — V12K-263):

1. Menu stacji SN/nN w SLD_MENU_REGISTRY zawiera wejscia zrodel i odbioru nN:
   add-source (PV/BESS/FW), add-load, add-genset (agregat), add-ups (UPS).
2. Wykonawca mapuje wejscia agregatu/UPS na REALNE operacje domenowe
   (opByAction: add-genset -> add_genset_nn, add-ups -> add_ups_nn) — wpis
   w rejestrze bez operacji bylby martwym klikiem.
3. Etykiety SLD_MENU_REGISTRY (labelPl) nie zawieraja typowych angielskich
   slow (tylko PL; skroty domenowe PV/BESS/UPS/CT/VT/SN/nN dopuszczone).
4. Kazda zdolnosc zrodla nN ma zyjacego dostawce UI (kreator/modal).
5. Zwraca exit code 0 (sukces) lub 1 (blad).

Uzycie:
  python scripts/nn_source_menu_guard.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import NamedTuple

REPO_ROOT = Path(__file__).resolve().parents[1]

# ---------------------------------------------------------------------------
# Paths — jedyna zywa sciezka menu SLD (K5-A)
# ---------------------------------------------------------------------------

SLD_COMMAND_SERVICE_PATH = (
    REPO_ROOT / "frontend" / "src" / "ui" / "sld" / "v2" / "command" / "SldCommandService.ts"
)
SLD_ACTION_EXECUTOR_PATH = (
    REPO_ROOT / "frontend" / "src" / "ui" / "sld" / "shared" / "sldActionExecutor.ts"
)

# ---------------------------------------------------------------------------
# Wymagane wejscia menu stacji (kategoria `station` w SLD_MENU_REGISTRY)
# ---------------------------------------------------------------------------

REQUIRED_STATION_ACTION_IDS = [
    "add-source",  # PV/BESS/FW z katalogu (kreator DER w E-13)
    "add-load",  # odbior nN
    "add-genset",  # agregat pradotworczy nN (add_genset_nn)
    "add-ups",  # zasilacz UPS nN (add_ups_nn)
]

# Wejscie menu -> wymagana operacja kanoniczna w opByAction wykonawcy.
REQUIRED_EXECUTOR_OPERATIONS = {
    "add-genset": "add_genset_nn",
    "add-ups": "add_ups_nn",
}

# ---------------------------------------------------------------------------
# Required provider files for nN sources
# ---------------------------------------------------------------------------

# ZDOLNOSC, NIE PLIK DOSTAWCY (V12K-263).
#
# Kanon V12.xx jest rejestrem ZDOLNOSCI, nie ekranow (`componentKey` to metadana
# dostawcy). Dlatego kazda pozycja to para: opis zdolnosci + sciezki, ktore
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
        ],
    ),
]

# ---------------------------------------------------------------------------
# Forbidden English-only words in menu labels (case-insensitive).
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


class Violation(NamedTuple):
    category: str
    message: str


def extract_registry_block(content: str) -> str | None:
    """Zwraca tekst literalu SLD_MENU_REGISTRY (do domykajacego `};`)."""
    start = content.find("SLD_MENU_REGISTRY")
    if start < 0:
        return None
    end = content.find("};", start)
    if end < 0:
        return None
    return content[start:end]


def extract_category_block(registry: str, category: str) -> str | None:
    """Zwraca blok tablicy jednej kategorii (np. `station: [ ... ]`)."""
    match = re.search(rf"\b{re.escape(category)}:\s*\[(.*?)\n  \]", registry, re.DOTALL)
    return match.group(1) if match else None


def check_station_menu_entries(registry: str) -> list[Violation]:
    """Menu stacji musi zawierac wejscia zrodel/odbioru nN (pkt 1)."""
    violations: list[Violation] = []
    station_block = extract_category_block(registry, "station")
    if station_block is None:
        return [
            Violation(
                category="MISSING_CATEGORY",
                message="Nie znaleziono kategorii `station` w SLD_MENU_REGISTRY",
            )
        ]
    station_ids = set(re.findall(r"""\bid:\s*['"]([a-z][a-z0-9_-]+)['"]""", station_block))
    for action_id in REQUIRED_STATION_ACTION_IDS:
        if action_id not in station_ids:
            violations.append(
                Violation(
                    category="MISSING_STATION_ACTION",
                    message=(
                        f"Brakuje wejscia '{action_id}' w kategorii `station` "
                        "SLD_MENU_REGISTRY (SldCommandService.ts)"
                    ),
                )
            )
    return violations


def check_executor_operations(executor_content: str) -> list[Violation]:
    """Wejscia agregat/UPS musza mapowac na realne operacje domenowe (pkt 2)."""
    violations: list[Violation] = []
    start = executor_content.find("const opByAction")
    if start < 0:
        return [
            Violation(
                category="MISSING_MAP",
                message="Nie znaleziono tabeli opByAction w sldActionExecutor.ts",
            )
        ]
    end = executor_content.find("};", start)
    block = executor_content[start : end if end > 0 else start + 4000]
    for action_id, operation in REQUIRED_EXECUTOR_OPERATIONS.items():
        pattern = re.compile(
            rf"""['"]{re.escape(action_id)}['"]\s*:\s*['"]{re.escape(operation)}['"]"""
        )
        if not pattern.search(block):
            violations.append(
                Violation(
                    category="MISSING_EXECUTOR_OP",
                    message=(
                        f"Brakuje mapowania '{action_id}' -> '{operation}' w opByAction "
                        "(sldActionExecutor.ts) — wpis rejestru bez operacji = martwy klik"
                    ),
                )
            )
    return violations


def check_english_labels(registry: str) -> list[Violation]:
    """Etykiety labelPl w SLD_MENU_REGISTRY bez angielskich slow (pkt 3)."""
    violations: list[Violation] = []
    for match in re.finditer(r"""labelPl:\s*'((?:[^'\\]|\\.)*)'""", registry):
        label = match.group(1)
        for pattern in FORBIDDEN_PATTERNS:
            if pattern.search(label):
                violations.append(
                    Violation(
                        category="ENGLISH_LABEL",
                        message=(
                            f"Etykieta '{label}' zawiera angielski tekst "
                            f"(wzorzec: {pattern.pattern})"
                        ),
                    )
                )
    return violations


def check_required_modals() -> list[Violation]:
    """Kazda zdolnosc zrodla nN ma co najmniej jednego zyjacego dostawce UI."""
    violations = []
    for zdolnosc, sciezki in DOSTAWCY_ZRODEL_NN:
        zywe = [
            p for p in (REPO_ROOT / s for s in sciezki) if p.exists() and p.stat().st_size >= 100
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

    for path in (SLD_COMMAND_SERVICE_PATH, SLD_ACTION_EXECUTOR_PATH):
        if not path.exists():
            print(
                f"BLAD KRYTYCZNY: Nie znaleziono pliku {path.relative_to(REPO_ROOT)}",
                file=sys.stderr,
            )
            return 1

    try:
        command_service_content = SLD_COMMAND_SERVICE_PATH.read_text(encoding="utf-8")
        executor_content = SLD_ACTION_EXECUTOR_PATH.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError) as e:
        print(f"BLAD: Nie mozna odczytac pliku: {e}", file=sys.stderr)
        return 1

    registry = extract_registry_block(command_service_content)
    if registry is None:
        print(
            "BLAD KRYTYCZNY: Nie znaleziono SLD_MENU_REGISTRY w SldCommandService.ts",
            file=sys.stderr,
        )
        return 1

    # 1. Wejscia menu stacji (zrodla/odbior nN)
    all_violations.extend(check_station_menu_entries(registry))

    # 2. Pokrycie wykonawcy (agregat/UPS -> operacje domenowe)
    all_violations.extend(check_executor_operations(executor_content))

    # 3. Polskie etykiety rejestru
    all_violations.extend(check_english_labels(registry))

    # 4. Dostawcy UI zdolnosci zrodel nN
    all_violations.extend(check_required_modals())

    # Report
    if all_violations:
        print("=" * 70, file=sys.stderr)
        print("NN-SOURCE-MENU-GUARD: NARUSZENIA WYKRYTE", file=sys.stderr)
        print("=" * 70, file=sys.stderr)
        print(file=sys.stderr)
        print(f"Znaleziono {len(all_violations)} naruszen:", file=sys.stderr)
        print("-" * 70, file=sys.stderr)

        by_category: dict[str, list[Violation]] = {}
        for v in all_violations:
            by_category.setdefault(v.category, []).append(v)

        for category, items in sorted(by_category.items()):
            print(f"\n  [{category}] ({len(items)} naruszen):", file=sys.stderr)
            for v in items:
                print(f"    - {v.message}", file=sys.stderr)

        print(file=sys.stderr)
        print("-" * 70, file=sys.stderr)
        print(
            "Napraw powyzsze naruszenia, zanim kod zostanie scalony.",
            file=sys.stderr,
        )
        return 1

    print("nn-source-menu-guard: OK (brak naruszen)", file=sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
