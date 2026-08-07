#!/usr/bin/env python3
"""
DOCS GUARD

Checks:
1. No "PCC" term in entrypoint documentation files.
2. No broken relative markdown links in key indexes and entrypoints.
3. Required catalog-first binding documents exist.
4. Canonical index points to binding docs and does not mark docs/spec as source of truth.
5. Explicit file inventories in binding docs do not reference non-existent repo files.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = PROJECT_ROOT.parent

PCC_CHECK_FILES = [
    PROJECT_ROOT / "SYSTEM_SPEC.md",
    PROJECT_ROOT / "ARCHITECTURE.md",
    PROJECT_ROOT / "README.md",
    PROJECT_ROOT / "AGENTS.md",
    PROJECT_ROOT / "PLANS.md",
    PROJECT_ROOT / "docs/INDEX.md",
    PROJECT_ROOT / "docs/INDEX_KANONICZNY.md",
    REPO_ROOT / "README.md",
]

LINK_CHECK_FILES = [
    PROJECT_ROOT / "SYSTEM_SPEC.md",
    PROJECT_ROOT / "ARCHITECTURE.md",
    PROJECT_ROOT / "README.md",
    PROJECT_ROOT / "docs/INDEX.md",
    PROJECT_ROOT / "docs/INDEX_KANONICZNY.md",
    REPO_ROOT / "README.md",
]

ACTIVE_REPO_HYGIENE_DOC = "docs/audit/REPO_HYGIENE_PO_FAZIE_KATALOG_FIRST.md"

REQUIRED_STAGE_DOCS = [
    "docs/catalog/CATALOG_DATA_TRUTH_MATRIX_V1.md",
    "docs/catalog/CATALOG_INDUSTRIAL_SERIES_MATRIX.md",
    "docs/catalog/CATALOG_LINES_AND_CABLES_V1_SPEC.md",
    "docs/catalog/AUDIT_CATALOG_DATA_COMPLETENESS_V1.md",
    "docs/system/SPEC_KATALOGI_I_MATERIALIZACJA_PARAMETROW.md",
    "docs/system/SPEC_MODEL_SYSTEMOWY_SN.md",
    "docs/system/SPEC_OPERACJE_DOMENOWE_I_SNAPSHOT.md",
    "docs/system/SPEC_GOTOWOSC_I_DZIALANIA_NAPRAWCZE.md",
    "docs/system/SPEC_ANALIZY_WYNIKI_WHITE_BOX_RAPORTY.md",
    "docs/system/SPEC_TYPOSZEREGI_I_KLASY_ELEMENTOW_TECHNICZNYCH.md",
    "docs/ui/UX_KATALOG_FIRST_DLA_INZYNIERA_SIECI_SN.md",
    "docs/ui/UX_KREATOR_SIECI_SN_OD_GPZ.md",
    "docs/ui/UX_INSPEKTOR_ANALIZA_WHITE_BOX_RAPORT.md",
    "docs/ui/UX_ZESTAWIENIA_MATERIALOWE_I_KOMPLETNOSC_TECHNICZNA.md",
    "docs/sld/SLD_SYSTEM_SPEC_CANONICAL.md",
    "docs/sld/SLD_MODEL_SEMANTYCZNY.md",
    "docs/sld/SLD_GEOMETRIA_KANONICZNA.md",
    "docs/sld/SLD_TYPY_STACJI_KANONICZNE.md",
    "docs/qa/MACIERZ_TESTOW_GLOBALNYCH.md",
    "docs/audit/AUDYT_KATALOG_FIRST_END_TO_END.md",
    ACTIVE_REPO_HYGIENE_DOC,
]

REQUIRED_BINDING_DOCS = [
    "docs/system/SPEC_KATALOGI_I_MATERIALIZACJA_PARAMETROW.md",
    "docs/system/SPEC_OPERACJE_DOMENOWE_I_SNAPSHOT.md",
    "docs/system/SPEC_ANALIZY_WYNIKI_WHITE_BOX_RAPORTY.md",
    "docs/ui/KATALOG_WIAZANIE_I_MATERIALIZACJA.md",
    "docs/ui/UX_KREATOR_SIECI_SN_OD_GPZ.md",
    "docs/sld/SLD_SYSTEM_SPEC_CANONICAL.md",
    "docs/sld/SLD_GEOMETRIA_KANONICZNA.md",
    "docs/sld/SLD_TYPY_STACJI_KANONICZNE.md",
    "docs/qa/MACIERZ_TESTOW_GLOBALNYCH.md",
    "docs/audit/AUDYT_KATALOG_FIRST_END_TO_END.md",
    ACTIVE_REPO_HYGIENE_DOC,
]

CANONICAL_INDEX_FILE = PROJECT_ROOT / "docs/INDEX_KANONICZNY.md"
CANONICAL_INDEX_REQUIRED_REFERENCES = [
    "docs/system/SPEC_KATALOGI_I_MATERIALIZACJA_PARAMETROW.md",
    "docs/system/SPEC_OPERACJE_DOMENOWE_I_SNAPSHOT.md",
    "docs/system/SPEC_ANALIZY_WYNIKI_WHITE_BOX_RAPORTY.md",
    "docs/ui/UX_KATALOG_FIRST_DLA_INZYNIERA_SIECI_SN.md",
    "docs/sld/SLD_SYSTEM_SPEC_CANONICAL.md",
    "docs/qa/MACIERZ_TESTOW_GLOBALNYCH.md",
]
CANONICAL_INDEX_FORBIDDEN_PHRASES = [
    "source of truth",
    "docs/spec/",
]

PCC_PATTERN = re.compile(r"\bPCC\b")
PCC_ALLOWED_CONTEXTS = [
    "NOT in NetworkModel",
    "Forbidden Terms",
    "prohibited",
    "ZAKAZ",
    "zakaz",
    "nie wolno",
    "belongs to interpretation",
    "no_codenames",
    "docs_guard",
    "PCC_",
    "pcc_",
]
MD_LINK_PATTERN = re.compile(r"\[([^\]]*)\]\(([^)]+)\)")
INLINE_CODE_PATTERN = re.compile(r"`([^`\n]+)`")
REPO_PATH_PREFIXES = ("backend/", "frontend/", "docs/", "scripts/", ".github/")
INVALID_REPO_REF_CHARS = set("{}|")
FILE_INVENTORY_DOCS = {
    "docs/qa/MACIERZ_TESTOW_GLOBALNYCH.md",
}


def _read_text(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return None


def _extract_markdown_targets(path: Path) -> list[str]:
    content = _read_text(path) or ""
    targets: list[str] = []
    for match in MD_LINK_PATTERN.finditer(content):
        target = match.group(2).split("#", 1)[0].strip()
        if not target or target.startswith(("http://", "https://", "mailto:", "#")):
            continue
        targets.append(target)
    return targets


def _normalize_project_target(base_path: Path, target: str) -> str | None:
    resolved = (base_path.parent / target).resolve()
    try:
        return resolved.relative_to(PROJECT_ROOT).as_posix()
    except ValueError:
        return None


def check_pcc() -> list[str]:
    violations: list[str] = []
    for path in PCC_CHECK_FILES:
        if not path.exists():
            continue
        content = _read_text(path)
        if content is None:
            continue
        display = str(path.relative_to(REPO_ROOT))
        for line_number, line in enumerate(content.splitlines(), start=1):
            if PCC_PATTERN.search(line) and not any(ctx in line for ctx in PCC_ALLOWED_CONTEXTS):
                violations.append(f"  {display}:{line_number}: {line.strip()[:120]}")
    return violations


def check_broken_links() -> list[str]:
    violations: list[str] = []
    for path in LINK_CHECK_FILES:
        if not path.exists():
            continue
        content = _read_text(path)
        if content is None:
            continue
        display = str(path.relative_to(REPO_ROOT))
        base = path.parent
        for line_number, line in enumerate(content.splitlines(), start=1):
            for match in MD_LINK_PATTERN.finditer(line):
                target = match.group(2)
                if target.startswith(("http://", "https://", "#", "mailto:")):
                    continue
                link_path = target.split("#", 1)[0]
                if not link_path or "*" in link_path:
                    continue
                resolved = base / link_path
                if not resolved.exists():
                    violations.append(f"  {display}:{line_number}: broken link -> {target}")
    return violations


def check_required_docs(required_paths: list[str]) -> list[str]:
    violations: list[str] = []
    for rel_path in required_paths:
        if not (PROJECT_ROOT / rel_path).exists():
            violations.append(f"  missing required doc -> {rel_path}")
    return violations


def check_required_binding_docs(project_root: Path | None = None) -> list[str]:
    """Backward-compatible API used by backend CI tests."""
    root = project_root or PROJECT_ROOT
    violations: list[str] = []
    for rel_path in REQUIRED_BINDING_DOCS:
        if not (root / rel_path).exists():
            violations.append(f"  missing required doc -> {rel_path}")
    return violations


def check_required_stage_docs(project_root: Path | None = None) -> list[str]:
    """Backward-compatible API used by scripts/tests that expect explicit helpers."""
    root = project_root or PROJECT_ROOT
    violations: list[str] = []
    for rel_path in REQUIRED_STAGE_DOCS:
        if not (root / rel_path).exists():
            violations.append(f"  missing required doc -> {rel_path}")
    return violations


def check_canonical_index() -> list[str]:
    if not CANONICAL_INDEX_FILE.exists():
        return ["  missing canonical index -> docs/INDEX_KANONICZNY.md"]

    content = _read_text(CANONICAL_INDEX_FILE) or ""
    linked_targets = {
        normalized
        for raw_target in _extract_markdown_targets(CANONICAL_INDEX_FILE)
        if (normalized := _normalize_project_target(CANONICAL_INDEX_FILE, raw_target)) is not None
    }
    violations: list[str] = []
    for rel_path in CANONICAL_INDEX_REQUIRED_REFERENCES:
        if rel_path not in linked_targets:
            violations.append(f"  docs/INDEX_KANONICZNY.md missing binding reference -> {rel_path}")

    lowered = content.lower()
    for phrase in CANONICAL_INDEX_FORBIDDEN_PHRASES:
        if phrase.lower() in lowered and "archiwalny / kontekstowy" not in lowered:
            violations.append(
                f"  docs/INDEX_KANONICZNY.md contains forbidden legacy phrase -> {phrase}"
            )
    if "docs/spec/" in lowered and "archiwalny / kontekstowy" not in lowered:
        violations.append(
            "  docs/INDEX_KANONICZNY.md must mark docs/spec/ as archiwalny / kontekstowy"
        )
    return violations


def _looks_like_repo_reference(candidate: str) -> bool:
    normalized = candidate.strip()
    if not normalized.startswith(REPO_PATH_PREFIXES):
        return False
    if "*" in normalized:
        return False
    if any(char in normalized for char in INVALID_REPO_REF_CHARS):
        return False
    if " -> " in normalized or "=>" in normalized:
        return False
    return True


def _check_doc_reference_target(
    base_dir: Path, display: str, line_number: int, target: str
) -> str | None:
    link_path = target.split("#", 1)[0].strip()
    if not _looks_like_repo_reference(link_path):
        return None
    resolved = (
        (REPO_ROOT / link_path) if link_path.startswith(".github/") else (PROJECT_ROOT / link_path)
    )
    if resolved.exists():
        return None
    return f"  {display}:{line_number}: missing repo reference -> {link_path}"


def check_stage_doc_file_references(project_root: Path | None = None) -> list[str]:
    root = project_root or PROJECT_ROOT
    repo_root = root.parent
    violations: list[str] = []

    for rel_path in sorted(FILE_INVENTORY_DOCS):
        path = root / rel_path
        if not path.exists():
            continue
        content = _read_text(path)
        if content is None:
            continue
        display = str(path.relative_to(repo_root))

        for line_number, line in enumerate(content.splitlines(), start=1):
            for match in INLINE_CODE_PATTERN.finditer(line):
                violation = _check_doc_reference_target(
                    path.parent, display, line_number, match.group(1)
                )
                if violation:
                    violations.append(violation)
            for match in MD_LINK_PATTERN.finditer(line):
                violation = _check_doc_reference_target(
                    path.parent, display, line_number, match.group(2)
                )
                if violation:
                    violations.append(violation)

    return violations


#: Audyt jakości SLD — wiersz znaleziska bez statusu jest ZAKAZANY.
#:
#: DLACZEGO MECHANICZNIE: „100% uruchomienia" (pkt 3 dokumentu przekazania)
#: deklaruje, że żaden wiersz audytu nie zostaje bez statusu. Do 2026-08-07 była
#: to deklaracja bez sprawdzenia — pomiar znalazł DZIEWIĘĆ wierszy bez znacznika.
#: Wszystkie okazały się obserwacjami pozytywnymi (nie było czego zamykać), ale
#: czytający nie miał jak ich odróżnić od znalezisk porzuconych, a przy 46
#: wierszach nikt tego nie przejdzie ręcznie drugi raz. Deklaracja bez strażnika
#: jest groźniejsza od samego braku, bo wyłącza czujność (reguła KLASA §4).
SLD_AUDIT_DOC = "docs/sld/AUDYT_JAKOSCI_SLD_2026-08.md"
#: Wiersz tabeli otwierany identyfikatorem znaleziska: `| C-14 |`, `| W-1 |`.
SLD_AUDIT_ROW_PATTERN = re.compile(r"^\|\s*([A-Z]{1,3}-\d+)\s*\|")
#: Statusy DOZWOLONE. Lista zamknięta świadomie: każdy nowy status to decyzja,
#: która ma przejść przez ten plik, a nie wejść bokiem w treści wiersza.
SLD_AUDIT_STATUSES = ("ZAMKNIĘTE", "CZĘŚCIOWO", "OTWARTE", "OBSERWACJA POZYTYWNA")
#: Zapadka na strażnika, który przestał widzieć tabelę (zmiana formatu, podział
#: pliku): pusty skan musi być błędem, nie ciszą. Audyt ma 46 wierszy.
SLD_AUDIT_MIN_ROWS = 40


def check_sld_audit_row_status(project_root: Path | None = None) -> list[str]:
    """Każdy wiersz znaleziska audytu SLD niesie status z listy zamkniętej."""
    root = project_root or PROJECT_ROOT
    path = root / SLD_AUDIT_DOC
    content = _read_text(path)
    if content is None:
        return [f"{SLD_AUDIT_DOC}: nie da się odczytać dokumentu audytu"]

    violations: list[str] = []
    wierszy = 0
    for line_number, line in enumerate(content.splitlines(), start=1):
        match = SLD_AUDIT_ROW_PATTERN.match(line)
        if not match:
            continue
        wierszy += 1
        opis = line.split("|")[2] if line.count("|") > 2 else ""
        if not any(status in opis for status in SLD_AUDIT_STATUSES):
            violations.append(
                f"{SLD_AUDIT_DOC}:{line_number}: wiersz {match.group(1)} bez statusu "
                f"(dozwolone: {', '.join(SLD_AUDIT_STATUSES)})"
            )

    if wierszy < SLD_AUDIT_MIN_ROWS:
        violations.append(
            f"{SLD_AUDIT_DOC}: skan znalazł {wierszy} wierszy znalezisk "
            f"(oczekiwane co najmniej {SLD_AUDIT_MIN_ROWS}) — format tabeli się zmienił "
            f"i strażnik przestał cokolwiek sprawdzać"
        )

    return violations


def _print_block(title: str, violations: list[str]) -> None:
    if not violations:
        return
    print("=" * 70, file=sys.stderr)
    print(title, file=sys.stderr)
    print("=" * 70, file=sys.stderr)
    for violation in violations:
        print(violation, file=sys.stderr)
    print(file=sys.stderr)


def main() -> int:
    all_ok = True

    pcc_violations = check_pcc()
    if pcc_violations:
        _print_block("DOCS GUARD: PCC TERM FOUND IN ENTRYPOINT DOCS", pcc_violations)
        all_ok = False

    broken_links = check_broken_links()
    if broken_links:
        _print_block("DOCS GUARD: BROKEN LINKS IN ENTRYPOINTS", broken_links)
        all_ok = False

    binding_doc_violations = check_required_docs(REQUIRED_BINDING_DOCS)
    if binding_doc_violations:
        _print_block("DOCS GUARD: REQUIRED BINDING DOCS MISSING", binding_doc_violations)
        all_ok = False

    stage_doc_violations = check_required_docs(REQUIRED_STAGE_DOCS)
    if stage_doc_violations:
        _print_block("DOCS GUARD: REQUIRED STAGE DOCS MISSING", stage_doc_violations)
        all_ok = False

    canonical_index_violations = check_canonical_index()
    if canonical_index_violations:
        _print_block("DOCS GUARD: CANONICAL INDEX OUT OF DATE", canonical_index_violations)
        all_ok = False

    stage_ref_violations = check_stage_doc_file_references()
    if stage_ref_violations:
        _print_block(
            "DOCS GUARD: STAGE DOCS CONTAIN MISSING REPO REFERENCES",
            stage_ref_violations,
        )
        all_ok = False

    sld_audit_violations = check_sld_audit_row_status()
    if sld_audit_violations:
        _print_block(
            "DOCS GUARD: WIERSZE AUDYTU SLD BEZ STATUSU",
            sld_audit_violations,
        )
        all_ok = False

    if all_ok:
        print("docs-guard: OK (all checks pass)")
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
