#!/usr/bin/env python3
"""
DOMAIN-OPS-UNIFIED GUARD — jeden kanoniczny klient HTTP dla operacji domenowych.

BINDING RULE (PR-F konsolidacji UI):
- Wszystkie wywołania endpointa `/api/cases/{id}/enm/domain-ops` MUSZĄ
  przechodzić przez `executeDomainOp()` z `frontend/src/ui/topology/domainApi.ts`
  (lub `useSnapshotStore().executeDomainOperation` które go wraps).
- Brak bezpośrednich `fetch()` / `axios.post()` do tego endpointa w UI.

Cel: spójność envelope (project_id + snapshot_base_hash + operation envelope
z idempotency_key), spójna obsługa błędów (DomainApiError), spójne propagowanie
semantic_issues do snapshotStore.

Usage:
  python scripts/domain_ops_unified_guard.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import NamedTuple

REPO_ROOT = Path(__file__).resolve().parents[1]

SCAN_DIRS = ["frontend/src"]
FILE_EXTENSIONS = {".ts", ".tsx"}

# Pliki wyłączone (legalny dostęp do domain-ops):
EXCLUDED_RELATIVE_FILES = {
    # Kanoniczny klient (definiuje endpoint):
    "frontend/src/ui/topology/domainApi.ts",
}

# Wzorzec wykrywający adres endpointa W KAŻDEJ POSTACI zapisu: literal pojedynczy
# (`'/api/cases/x/enm/domain-ops'`), szablon z interpolacją
# (`${API_BASE}/${id}/enm/domain-ops`), sklejanie (`'/api/cases/' + id + '/enm/domain-ops'`)
# i warianty `/api/v1/domain-operations|domain-ops`. Korekta 2026-10-28 (scalenie gałęzi
# UI/UX z gałęzią programu): dawny wzorzec łapał WYŁĄCZNIE pojedynczy literal w cudzysłowie,
# więc drugi klient HTTP (`ui2/kreatory/stacja/stacjaPodglad.ts`, adres z interpolacji, własna
# koperta i własny klucz idempotencji) żył obok kanonicznego niewidoczny dla strażnika, a test
# z literalem był czerwony — forma zapisu decydowała o werdykcie, nie rola kodu.
# Linie komentarza (`//`, `*`, `/*`) nie są kodem i nie są oceniane.
ENDPOINT_PATTERN = re.compile(r"/enm/domain-ops\b|/api/v1/domain-operations|/api/v1/domain-ops")
COMMENT_LINE = re.compile(r"^\s*(?://|/\*|\*)")

IGNORE_PATTERN = re.compile(r"//\s*domain-ops-ignore")


class Violation(NamedTuple):
    file_path: str
    line_number: int
    line_content: str


def is_excluded(file_path: Path) -> bool:
    rel = str(file_path.relative_to(REPO_ROOT)).replace("\\", "/")
    return rel in EXCLUDED_RELATIVE_FILES


def scan_file(file_path: Path, root: Path = REPO_ROOT) -> list[Violation]:
    rel_path = str(file_path.relative_to(root)).replace("\\", "/")
    violations: list[Violation] = []
    try:
        content = file_path.read_text(encoding="utf-8")
    except OSError:
        return violations

    for i, line in enumerate(content.splitlines(), start=1):
        if IGNORE_PATTERN.search(line) or COMMENT_LINE.match(line):
            continue
        if ENDPOINT_PATTERN.search(line):
            violations.append(
                Violation(
                    file_path=rel_path,
                    line_number=i,
                    line_content=line.strip(),
                )
            )
    return violations


def check_excluded_relative_files_freshness(root: Path) -> list[str]:
    """Zapadka swiezosci EXCLUDED_RELATIVE_FILES — PELNA (korekta 2026-10-28).

    Jedyny wpis (`domainApi.ts`) jest wykluczony PO ROLI: to kanoniczny klient, jedyne
    miejsce budowy adresu endpointa (`domainOpsEndpoint`). Do 2026-10-28 zapadka byla
    minimalna (samo istnienie pliku), bo wzorzec lapal wylacznie pojedynczy literal, a adres
    w kliencie jest szablonem z interpolacja — `scan_file()` zwracal [] i pelna zapadka
    uznalaby wpis za sierote. Od poszerzenia wzorca na kazda postac zapisu adresu kanoniczny
    klient MUSI dawac trafienie: wpis bez trafienia znaczy, ze adres przeniesiono gdzie
    indziej (a wtedy wykluczenie chroni plik, ktory juz nie jest klientem) — czerwien.
    """
    violations: list[str] = []
    for rel_path in sorted(EXCLUDED_RELATIVE_FILES):
        sciezka = root / rel_path
        if not sciezka.is_file():
            violations.append(
                f"[domain-ops-wykluczenie-osierocone] EXCLUDED_RELATIVE_FILES zawiera "
                f"{rel_path!r}, ktorego juz nie ma w repo — usun ten wpis"
            )
        elif not scan_file(sciezka, root):
            violations.append(
                f"[domain-ops-wykluczenie-osierocone] {rel_path!r} nie buduje juz adresu "
                f"endpointa domain-ops — wykluczenie chroni plik, ktory nie jest klientem; "
                f"usun wpis albo przywroc budowe adresu w kanonicznym kliencie"
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
        print("GUARD: domain_ops_unified_guard")
        print("=" * 60)
        print()
        print(f"FAIL: {len(all_violations)} bezpośredni(ch) odwołań do endpointa domain-ops.")
        print()
        print(
            "Zasada: używaj `executeDomainOp(caseId, opName, payload)` z\n"
            "`frontend/src/ui/topology/domainApi.ts` lub `useSnapshotStore().executeDomainOperation`.\n"
            "Endpoint URL `/api/cases/{id}/enm/domain-ops` jest hermetyzowany w jednym miejscu.\n"
        )
        for v in all_violations:
            print(f"  {v.file_path}:{v.line_number}")
            print(f"    {v.line_content}")
        print()
        print(
            "Jeśli ścieżka jest świadomie poza domainApi (np. test infrastruktura)\n"
            "- dodaj komentarz // domain-ops-ignore na końcu linii."
        )

    freshness_violations = check_excluded_relative_files_freshness(REPO_ROOT)
    if freshness_violations:
        print("=" * 60)
        print("GUARD: domain_ops_unified_guard — WYKLUCZENIA OSIEROCONE")
        print("=" * 60)
        for message in freshness_violations:
            print(f"  {message}")
        print()

    if all_violations or freshness_violations:
        return 1

    print("domain-ops-unified-guard: OK (brak naruszeń)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
