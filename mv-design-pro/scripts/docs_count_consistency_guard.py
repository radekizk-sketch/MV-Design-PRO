#!/usr/bin/env python3
"""docs_count_consistency_guard.py — Phase 0B-2 (PARTIAL → RESOLVED).

Cel:
  Wymusza zgodność deklarowanej liczby testów w dokumentacji `docs/` z
  faktyczną liczbą `it(...)`/`test(...)` w plikach testowych. Eliminuje
  "doc rot" gdzie dokument cytuje liczby (np. "117 cases") nieaktualne
  po refaktorze.

Konwencja w dokumentacji:
  Doc cytuje plik testowy w jednym z dwóch formatów:

    1. Liczba dokładna:
       - `<file>.test.tsx` — N cases:
       - `<file>.test.ts`  — N tests:
       - `<file>.test.tsx` — N test cases.

    2. Liczba "co najmniej" (dolne ograniczenie):
       - `<file>.test.tsx` — N+ cases:
       - `<file>.test.tsx` — N+ tests:

  Format 1: actual MUSI być == N.
  Format 2: actual MUSI być >= N (komfort z dodawaniem testów bez
  ciągłej aktualizacji doc — guard zgłosi tylko spadek poniżej deklaracji
  lub rozjazd > tolerancji 50%, czyli "ja byłeś N+, jest 3*N+ → doc nieaktualny").

Wyjście:
  - exit 0 jeśli wszystkie pary zgodne.
  - exit 1 jeśli mismatch — wypisuje listę naruszeń.

Użycie:
  python scripts/docs_count_consistency_guard.py
  python scripts/docs_count_consistency_guard.py --strict   # bez tolerancji w +
  python scripts/docs_count_consistency_guard.py --json     # output dla CI
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path

# Poszukiwane nazwy plików testowych — relative do repo root lub frontend/backend.
SEARCH_ROOTS = [
    Path("frontend/src"),
    Path("backend/tests"),
]

DOCS_ROOTS = [
    Path("docs"),
    Path("."),  # mv-design-pro/*.md (SYSTEM_SPEC, ARCHITECTURE, PLANS, AGENTS, POWERFACTORY_COMPLIANCE)
]

# Tolerancja dla deklaracji "N+" — actual nie może być więcej niż TOLERANCE_X * N
# (np. doc deklaruje 100+, a kod ma 600 → doc nieaktualny, zaktualizować).
TOLERANCE_FACTOR = 3.0

# Pattern parsujący doc — przykłady które musi rozpoznać:
#   `gpzSwitchgearScada.test.tsx` — 117+ cases
#   - `foo.test.ts` — 21 cases:
#   `bar.test.tsx` — 117 test cases.
#   `baz.test.ts` — 8 tests
DOC_PATTERN = re.compile(
    r"`(?P<filename>[A-Za-z0-9_\-./]+\.test\.(?:ts|tsx|py))`\s*[—–-]\s*"
    r"(?P<count>\d+)(?P<plus>\+?)\s*(?:test\s+)?(?:cases?|tests?)\b",
    re.IGNORECASE,
)

# Pattern dla `it(...)` lub `test(...)` w plikach .ts/.tsx, oraz `def test_` w .py.
# Liczy każde wywołanie na początku linii (po whitespace) — `it.skip` i `test.skip`
# WLICZAMY (są w doc count). `it.todo` NIE.
TS_TEST_PATTERN = re.compile(r"^\s*(?:it|test)\s*(?:\.skip)?\s*\(", re.MULTILINE)
PY_TEST_PATTERN = re.compile(r"^\s*(?:async\s+)?def\s+test_\w+\s*\(", re.MULTILINE)


@dataclass(frozen=True)
class DocReference:
    """Pojedyncza deklaracja w dokumencie."""

    doc_path: Path
    line_number: int
    filename: str  # np. "gpzSwitchgearScada.test.tsx"
    declared_count: int
    is_lower_bound: bool  # True dla "117+", False dla "117"


@dataclass(frozen=True)
class Mismatch:
    ref: DocReference
    actual_count: int
    reason: str


def _read_text_safe(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        return ""


def _find_md_files(root: Path) -> list[Path]:
    if not root.exists():
        return []
    return sorted(root.rglob("*.md"))


def _parse_doc_references(repo_root: Path) -> list[DocReference]:
    refs: list[DocReference] = []
    seen_md_paths: set[Path] = set()
    for docs_root in DOCS_ROOTS:
        absolute = repo_root / docs_root
        if not absolute.exists():
            continue
        # Dla "." (root) NIE rekursja (tylko .md w mv-design-pro/), żeby uniknąć
        # zdublowania z docs/.
        md_files = (
            sorted(absolute.glob("*.md")) if str(docs_root) == "." else _find_md_files(absolute)
        )
        for md in md_files:
            if md in seen_md_paths:
                continue
            seen_md_paths.add(md)
            text = _read_text_safe(md)
            if not text:
                continue
            for line_number, line in enumerate(text.splitlines(), start=1):
                for match in DOC_PATTERN.finditer(line):
                    filename = match.group("filename")
                    # Usuwamy ścieżkę katalogu, zostawiamy basename żeby
                    # match po pełnej ścieżce się powiódł.
                    refs.append(
                        DocReference(
                            doc_path=md,
                            line_number=line_number,
                            filename=Path(filename).name,
                            declared_count=int(match.group("count")),
                            is_lower_bound=bool(match.group("plus")),
                        )
                    )
    return refs


def _find_test_file(repo_root: Path, basename: str) -> Path | None:
    """Znajduje pierwszy plik o danym basenamie w SEARCH_ROOTS."""
    for search_root in SEARCH_ROOTS:
        absolute = repo_root / search_root
        if not absolute.exists():
            continue
        candidates = list(absolute.rglob(basename))
        if candidates:
            # Deterministyczny wybór — pierwszy posortowany.
            return sorted(candidates)[0]
    return None


def _count_tests_in_file(path: Path) -> int:
    text = _read_text_safe(path)
    if not text:
        return 0
    suffix = path.suffix.lower()
    if suffix in {".ts", ".tsx"}:
        return len(TS_TEST_PATTERN.findall(text))
    if suffix == ".py":
        return len(PY_TEST_PATTERN.findall(text))
    return 0


def _check_reference(ref: DocReference, repo_root: Path, strict: bool) -> Mismatch | None:
    test_file = _find_test_file(repo_root, ref.filename)
    if test_file is None:
        return Mismatch(
            ref=ref,
            actual_count=0,
            reason=f"Plik testowy '{ref.filename}' nie znaleziony pod {SEARCH_ROOTS}.",
        )
    actual = _count_tests_in_file(test_file)
    if ref.is_lower_bound:
        if actual < ref.declared_count:
            return Mismatch(
                ref=ref,
                actual_count=actual,
                reason=(
                    f"Doc deklaruje {ref.declared_count}+ testów, faktycznie {actual} "
                    f"(spadek). Plik: {test_file}."
                ),
            )
        if not strict and ref.declared_count > 0:
            ratio = actual / ref.declared_count
            if ratio > TOLERANCE_FACTOR:
                return Mismatch(
                    ref=ref,
                    actual_count=actual,
                    reason=(
                        f"Doc deklaruje {ref.declared_count}+ testów, faktycznie {actual} "
                        f"({ratio:.1f}× więcej niż próg {TOLERANCE_FACTOR}×). "
                        f"Zaktualizuj doc count. Plik: {test_file}."
                    ),
                )
        return None
    # Format 1 (dokładny): == declared
    if actual != ref.declared_count:
        return Mismatch(
            ref=ref,
            actual_count=actual,
            reason=(
                f"Doc deklaruje dokładnie {ref.declared_count} testów, "
                f"faktycznie {actual}. Plik: {test_file}."
            ),
        )
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Wymusza dokładną zgodność N+ (bez tolerancji factor).",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output w formacie JSON dla CI.",
    )
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=Path(__file__).resolve().parent.parent,
        help="Korzeń repo (default: mv-design-pro/).",
    )
    args = parser.parse_args()

    repo_root: Path = args.repo_root.resolve()
    refs = _parse_doc_references(repo_root)
    mismatches: list[Mismatch] = []
    for ref in refs:
        mismatch = _check_reference(ref, repo_root, strict=args.strict)
        if mismatch is not None:
            mismatches.append(mismatch)

    if args.json:
        payload = {
            "repo_root": str(repo_root),
            "checked": len(refs),
            "mismatches": [
                {
                    "doc": str(m.ref.doc_path.relative_to(repo_root)),
                    "line": m.ref.line_number,
                    "test_file": m.ref.filename,
                    "declared": m.ref.declared_count,
                    "is_lower_bound": m.ref.is_lower_bound,
                    "actual": m.actual_count,
                    "reason": m.reason,
                }
                for m in mismatches
            ],
        }
        print(json.dumps(payload, indent=2, ensure_ascii=False))
    else:
        if not refs:
            print("docs_count_consistency_guard: brak deklaracji w dokumentach (OK).")
            return 0
        print(
            f"docs_count_consistency_guard: sprawdzono {len(refs)} deklaracji w "
            f"{len({r.doc_path for r in refs})} dokumentach."
        )
        if not mismatches:
            print("OK — wszystkie deklaracje zgodne z faktycznym countem testów.")
            return 0
        print(f"\nNARUSZENIA ({len(mismatches)}):")
        for m in mismatches:
            doc_rel = m.ref.doc_path.relative_to(repo_root)
            print(f"  - {doc_rel}:{m.ref.line_number}")
            print(f"      {m.reason}")

    return 1 if mismatches else 0


if __name__ == "__main__":
    sys.exit(main())
