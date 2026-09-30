#!/usr/bin/env python3
"""
PTPIREE-CERTIFICATE-NO-GUESS GUARD — karta CERTYFIKAT-Z-KATALOGU (zero fabrykacji).

BINDING RULE. Status certyfikatu PTPiREE ("czy urządzenie jest na wykazie
PTPiREE") ma JEDNO źródło prawdy: backend — adnotacja katalogu
(`network_model/catalog/mv_ptpiree_catalog.py::annotate_with_ptpiree_status`,
pokazywana wprost z `der.catalogs.ptpiree_status` / `ptpiree_certificate_ref`) oraz
dowód certyfikatu dopasowany PO STRONIE SERWERA (`dowod_certyfikatu` /
`certyfikaty_odrzucone` w odpowiedziach klienta V2 `frontend/src/ui2/oze/ncrfg/api.ts`,
typy `ui2/oze/ncrfg/typy.ts`). Frontend nie liczy statusu certyfikatu. Zgadywanie tego
statusu z NAZWY referencji katalogowej (`device_catalog_ref?.includes('ptpiree')`)
jest fabrykacją: rekord nazwany „ptpiree" bez adnotacji backendu daje fałszywy
`ptpiree_verified`, a rekord certyfikowany bez tego słowa w nazwie — fałszywy
`unknown`. Ten guard blokuje POWRÓT tego wzorca w `frontend/src/**`.

Defekt zmierzony i naprawiony (karta CERTYFIKAT-Z-KATALOGU, 2026-09-16):
  - `ui2/oze/macierz/macierzModel.ts::rozwiazCertyfikat`
  - `ui/workspace/surfaces/NcRfgTestsTab.tsx::inferCertificateStatus`
Karta AB-1a Pakiet D2 (2026-09-23): oba miejsca SKASOWANE razem z klienckim statusem
certyfikatu (`station-der/certyfikatPtpiree.ts`, ekran `NcRfgTestsTab`) — dowód
certyfikatu czyta się wyłącznie z odpowiedzi serwera przez klienta V2.

CO WYKRYWA: `.includes('ptpiree')` / `.includes("ptpiree")` (dowolna wielkość
liter w środku literału) w kodzie WYKONYWALNYM. Komentarze/JSDoc (w tym
wielolinijkowe `/** ... */`, dokumentujące USUNIĘTY wzorzec dla przyszłych
czytelników) są pomijane linia-po-linii — ten sam mechanizm śledzenia bloku
komentarza co `no_codenames_guard.py::scan_file`.

CO NIE WYKRYWA (świadomie): dopasowanie SUBSTRINGU wewnątrz wyszukiwarki
rejestru certyfikatów (`ptpireeCertifiedInverters.ts::filterPtpireeCertifiedInverters`
— `haystack.includes(normalized)`, gdzie `normalized` jest zapytaniem
UŻYTKOWNIKA, nie literałem `'ptpiree'`) — inny mechanizm (wyszukiwanie
tekstowe po zapytaniu), nie wyprowadzanie statusu certyfikatu.

EXIT CODES: 0 = clean, 1 = violation found.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import NamedTuple

REPO_ROOT = Path(__file__).resolve().parents[1]

SCAN_DIRS = ["frontend/src"]
FILE_EXTENSIONS = {".ts", ".tsx"}

# `.includes('ptpiree')` / `.includes("ptpiree")` — dowolna wielkość liter,
# dowolna ilość białych znaków wewnątrz nawiasu.
VIOLATION_PATTERN = re.compile(r"\.includes\(\s*['\"]ptpiree['\"]\s*\)", re.IGNORECASE)

COMMENT_LINE_PATTERNS = [
    re.compile(r"^\s*//"),
    re.compile(r"^\s*\*"),
    re.compile(r"^\s*/\*"),
    re.compile(r"^\s*\*/"),
    re.compile(r"^\s*{/\*"),
]


class Violation(NamedTuple):
    file_path: str
    line_number: int
    line_content: str


def is_comment_line(line: str) -> bool:
    trimmed = line.strip()
    return any(pattern.match(trimmed) for pattern in COMMENT_LINE_PATTERNS)


def format_violation_path(file_path: Path) -> str:
    try:
        return str(file_path.relative_to(REPO_ROOT)).replace("\\", "/")
    except ValueError:
        return str(file_path)


def scan_file(file_path: Path) -> list[Violation]:
    """Skanuj jeden plik. Pomija linie komentarzowe (pojedyncze i blokowe)."""
    violations: list[Violation] = []
    try:
        content = file_path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        return violations

    in_block_comment = False
    for line_num, line in enumerate(content.split("\n"), start=1):
        if "/*" in line and "*/" not in line:
            in_block_comment = True
            continue
        if "*/" in line:
            in_block_comment = False
            continue
        if in_block_comment or is_comment_line(line):
            continue
        if VIOLATION_PATTERN.search(line):
            violations.append(
                Violation(
                    file_path=format_violation_path(file_path),
                    line_number=line_num,
                    line_content=line.strip(),
                )
            )
    return violations


def iter_files(root: Path) -> list[Path]:
    files: list[Path] = []
    for scan_dir in SCAN_DIRS:
        dir_path = root / scan_dir
        if not dir_path.exists():
            continue
        for ext in FILE_EXTENSIONS:
            files.extend(dir_path.rglob(f"*{ext}"))
    return sorted(set(files))


def scan_tree(root: Path = REPO_ROOT) -> list[Violation]:
    violations: list[Violation] = []
    for file_path in iter_files(root):
        violations.extend(scan_file(file_path))
    return violations


def main() -> int:
    violations = scan_tree(REPO_ROOT)

    if violations:
        print("=" * 70, file=sys.stderr)
        print("PTPIREE-CERTIFICATE-NO-GUESS GUARD: NARUSZENIE WYKRYTE", file=sys.stderr)
        print("=" * 70, file=sys.stderr)
        print(file=sys.stderr)
        print(
            "Status certyfikatu PTPiREE MUSI pochodzić z pola backendu "
            "(der.catalogs.ptpiree_status / ptpiree_certificate_ref), "
            "nigdy z zawartości nazwy referencji katalogowej.",
            file=sys.stderr,
        )
        print(
            "Dowód certyfikatu czytaj z odpowiedzi serwera przez klienta V2 "
            "(`frontend/src/ui2/oze/ncrfg/api.ts`: `dowod_certyfikatu`, "
            "`certyfikaty_odrzucone`); adnotację katalogu pokazuj wprost "
            "(`der.catalogs.ptpiree_status`).",
            file=sys.stderr,
        )
        print(file=sys.stderr)
        print(f"Znaleziono {len(violations)} naruszeń:", file=sys.stderr)
        print("-" * 70, file=sys.stderr)
        for v in violations:
            print(f"  {v.file_path}:{v.line_number}", file=sys.stderr)
            print(f"    Linia: {v.line_content[:120]}", file=sys.stderr)
            print(file=sys.stderr)
        return 1

    print("ptpiree-certificate-no-guess-guard: OK (brak naruszeń)", file=sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
