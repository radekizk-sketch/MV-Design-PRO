#!/usr/bin/env python3
"""
NO-RAW-IDS-IN-UI GUARD — blokuje wyciekanie identyfikatorów debugowych do UI.

BINDING RULE (PR-A/PR-C konsolidacji UI):
- Pola w kartach (CardField, sections) NIE MOGĄ używać etykiet jednoznacznie
  debugowych typu "ID elementu", "Hash treści", "Hash wejścia".
- Pole o etykiecie produktowej (np. "Identyfikator", "Oznaczenie") jest OK -
  ID może być relevantny dla operatora w produkcji.
- Pola hash_* / content_hash same w sobie są zawsze debugowe (key='content_hash'
  niezależnie od etykiety).

Implementacja: TechCard (frontend/src/ui/tech-card/) automatycznie odsiewa
takie pola do sekcji Diagnostyka (widoczna tylko gdy VITE_DEV_DIAGNOSTICS=1).
Ten guard zapewnia że nikt nie wprowadzi z powrotem jawnych pól typu:

  { key: 'ref_id', label: 'ID elementu', value: x.ref_id }
  { key: 'content_hash', label: 'Cokolwiek', value: x }

Usage:
  python scripts/no_raw_ids_in_ui_guard.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import NamedTuple

REPO_ROOT = Path(__file__).resolve().parents[1]

SCAN_DIRS = ["frontend/src"]
FILE_EXTENSIONS = {".ts", ".tsx"}

# Pliki wyłączone (warstwa TechCard ma legalny dostęp do diagnostyki):
EXCLUDED_DIRS = ("frontend/src/ui/tech-card/",)
EXCLUDED_RELATIVE_FILES = {
    # Test artifacts intencjonalnie używają tych literałów:
}

# Wzorzec 1: { key: 'content_hash' / 'input_hash' / ... } - hashe są zawsze debug
# bez względu na etykietę.
LEAK_PATTERN_HASH_FIELD = re.compile(
    r"""\{\s*key:\s*['"](?P<key>content_hash|input_hash|result_hash|snapshot_hash|enm_hash)['"]""",
    re.VERBOSE,
)

# Wzorzec 2: label zawierający jednoznacznie debugową etykietę
LEAK_PATTERN_LABEL_DEBUG = re.compile(
    r"""label:\s*['"](?P<label>ID\s+elementu|ID\s+obiektu|Ref\s+ID|Hash\s+wejścia|Hash\s+wyjścia|Hash\s+treści|Snapshot\s+hash|ENM\s+hash)['"]""",
    re.VERBOSE,
)

# Komentarz inline pozwalający na supress (np. w testach).
IGNORE_PATTERN = re.compile(r"//\s*no-raw-ids-ignore")


class Violation(NamedTuple):
    file_path: str
    line_number: int
    line_content: str
    pattern: str


def is_excluded(file_path: Path) -> bool:
    rel = str(file_path.relative_to(REPO_ROOT)).replace("\\", "/")
    if rel in EXCLUDED_RELATIVE_FILES:
        return True
    return any(rel.startswith(d) for d in EXCLUDED_DIRS)


def scan_file(file_path: Path) -> list[Violation]:
    rel_path = str(file_path.relative_to(REPO_ROOT)).replace("\\", "/")
    violations: list[Violation] = []
    try:
        content = file_path.read_text(encoding="utf-8")
    except OSError:
        return violations

    for i, line in enumerate(content.splitlines(), start=1):
        if IGNORE_PATTERN.search(line):
            continue
        m = LEAK_PATTERN_HASH_FIELD.search(line)
        if m:
            violations.append(
                Violation(
                    file_path=rel_path,
                    line_number=i,
                    line_content=line.strip(),
                    pattern=f"jawne pole key='{m.group('key')}' w CardField (hash zawsze debug)",
                )
            )
            continue
        m = LEAK_PATTERN_LABEL_DEBUG.search(line)
        if m:
            violations.append(
                Violation(
                    file_path=rel_path,
                    line_number=i,
                    line_content=line.strip(),
                    pattern=f"etykieta '{m.group('label')}' w polu UI",
                )
            )
    return violations


def check_excluded_relative_files_freshness(root: Path) -> list[str]:
    """Zapadka swiezosci EXCLUDED_RELATIVE_FILES (karta ZAPADKI-ALLOWLIST-RESZTA,
    pozycja f, 2026-08-12). Lista jest DZIS PUSTA — funkcja jest no-op na HEAD,
    ale wpieta JUZ TERAZ (patrz uzasadnienie w ui_no_physics_guard.ALLOWLIST,
    pozycja a tej samej karty: osierocenie tam JUZ SIE RAZ ZDARZYLO bez
    detektora).

    Pelna zapadka dwukierunkowa: wpis musi wskazywac plik, ktory (a) istnieje
    ORAZ (b) nadal produkowalby >=1 trafienie `scan_file()`, gdyby nie byl
    wykluczony — `scan_file()` sama nie zaglada do EXCLUDED_RELATIVE_FILES,
    wiec mozna ja wywolac wprost i uzyskac ten sam predykat, ktorego uzywa
    `is_excluded()` do decyzji o pominieciu (predykaty parami,
    KLASA-NIE-INSTANCJA S3).
    """
    violations: list[str] = []
    for rel_path in sorted(EXCLUDED_RELATIVE_FILES):
        full_path = root / rel_path
        if not full_path.is_file():
            violations.append(
                f"[no-raw-ids-wykluczenie-osierocone] EXCLUDED_RELATIVE_FILES zawiera "
                f"{rel_path!r}, ktorego juz nie ma w repo — usun ten wpis"
            )
            continue
        if scan_file(full_path):
            continue
        violations.append(
            f"[no-raw-ids-wykluczenie-osierocone] EXCLUDED_RELATIVE_FILES zawiera "
            f"{rel_path!r}, ktory juz nie produkuje zadnego trafienia — usun ten wpis"
        )
    return violations


def main() -> int:
    all_violations: list[Violation] = []
    for scan_dir in SCAN_DIRS:
        base = REPO_ROOT / scan_dir
        if not base.exists():
            continue
        for file_path in base.rglob("*"):
            if not file_path.is_file():
                continue
            if file_path.suffix not in FILE_EXTENSIONS:
                continue
            if is_excluded(file_path):
                continue
            all_violations.extend(scan_file(file_path))

    if all_violations:
        print("=" * 60)
        print("GUARD: no_raw_ids_in_ui_guard")
        print("=" * 60)
        print()
        print(f"FAIL: {len(all_violations)} jawny(ch) wyciek(ów) raw IDs do UI.")
        print()
        print(
            "Zasada: pola raw (ref_id, *_hash) NIE pokazuj jawnie w karcie.\n"
            "Użyj TechCard (frontend/src/ui/tech-card/) - redactor automatycznie\n"
            "odsieje takie pola do sekcji Diagnostyka pod flagą VITE_DEV_DIAGNOSTICS=1.\n"
        )
        for v in all_violations:
            print(f"  {v.file_path}:{v.line_number}: {v.pattern}")
            print(f"    {v.line_content}")
        print()
        print(
            "Jeśli wyciek jest świadomy (np. test redactora) - dodaj komentarz\n"
            "// no-raw-ids-ignore na końcu linii."
        )

    freshness_violations = check_excluded_relative_files_freshness(REPO_ROOT)
    if freshness_violations:
        print("=" * 60)
        print("GUARD: no_raw_ids_in_ui_guard — WYKLUCZENIA OSIEROCONE")
        print("=" * 60)
        for message in freshness_violations:
            print(f"  {message}")
        print()

    if all_violations or freshness_violations:
        return 1

    print("no-raw-ids-in-ui guard: OK (brak naruszeń)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
