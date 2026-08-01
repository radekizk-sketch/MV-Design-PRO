#!/usr/bin/env python3
"""
UI-PRODUCTION-CODES GUARD — kody produkcji won z treści widocznej dla inżyniera
(karta K10, dyrektywa właściciela 2026-07-29).

REGUŁA WIĄŻĄCA:
- Kody rejestru konfliktów/kanonu (V12K-*), nazwy klas/API kontraktu wyników
  (PowerFlowResult, ShortCircuitResult, ResultSet, FROZEN, branch_results,
  bus_results) oraz ścieżki plików źródłowych (application/analyses/*.py itp.)
  NIGDY nie mogą trafiać do treści widocznej dla inżyniera: stringów UI
  (frontend src/ui, src/ui2) ani pól tekstowych śladów/komunikatów analiz
  backendu (application/analyses/**, analysis/**). W treści obowiązuje
  semantyka po polsku + wzory wyłącznie w LaTeX (konwencja Proof Engine).

ZASIĘG SKANU:
- Backend: literały napisowe (ast, docstringi pomijane) w modułach analiz —
  to one budują pola śladów (wzor/podstawienie/wynik/decyzja/opis/zalozenia)
  trafiające do UI i eksportów.
- Frontend: literały napisowe w src/ui i src/ui2 (bez testów) — etykiety,
  strings.ts, treści JSX.

CO NIE JEST NARUSZENIEM (rozstrzygnięcia K10):
- Komentarze i docstringi — dokumentacja kodu, nie treść dla inżyniera.
- Techniczne identyfikatory/klucze słownikowe bez spacji (np. "branch_results"
  jako klucz kontraktu `result_v1`): nazwy API i ścieżki flagujemy wyłącznie
  w PROZIE (literał zawiera odstęp). Kody V12K-* flagujemy ZAWSZE — nie są
  kluczem żadnego kontraktu.
- Specyfikatory importów/eksportów frontendu (linie `import`/`export ... from`).

Wyjścia: 0 = czysto, 1 = naruszenia.
Użycie: python scripts/ui_production_codes_guard.py [ścieżki...]
        (ścieżki nadpisują SCAN_TARGETS — używane przez test guarda w tests/ci/)
"""

from __future__ import annotations

import ast
import re
import sys
from pathlib import Path
from typing import NamedTuple

REPO_ROOT = Path(__file__).resolve().parents[1]

# Producenci treści dla inżyniera.
SCAN_TARGETS = [
    "backend/src/application/analyses",
    "backend/src/analysis",
    "frontend/src/ui",
    "frontend/src/ui2",
]

# Kody rejestru — zakazane w KAŻDYM literale (nie są kluczem kontraktu).
# Granica słowa z lewej: nazwy handlowe urządzeń typu "HV12K-3H" (certyfikowane
# falowniki PTPiREE) NIE są kodami rejestru.
REGISTRY_CODE_PATTERN = re.compile(r"(?<![A-Za-z0-9])V12K-\d+")
# Nazwy klas/API kontraktu wyników — zakazane w PROZIE (literał ze spacją).
API_NAME_PATTERN = re.compile(
    r"\b(PowerFlowResult|ShortCircuitResult|ResultSet|FROZEN|branch_results|bus_results)\b"
)
# Ścieżki plików źródłowych — zakazane w PROZIE.
SOURCE_PATH_PATTERN = re.compile(r"\b[\w.]+/[\w.]+\.(?:py|ts|tsx)\b")

# Literały frontendu: pojedyncze/podwójne cudzysłowy i template literals.
TS_STRING_PATTERN = re.compile(
    r"""
    (?P<string>
        '(?:[^'\\]|\\.)*'     |
        "(?:[^"\\]|\\.)*"     |
        `(?:[^`\\]|\\.)*`
    )
    """,
    re.VERBOSE,
)
TS_COMMENT_LINE = re.compile(r"^\s*(//|\*|/\*)")
TS_IMPORT_EXPORT_LINE = re.compile(r"^\s*(import\b|export\b.*\bfrom\b|\}\s*from\b)")

# Pliki wyłączone ze skanu (ścieżka względna repo -> uzasadnienie). Wyłącznie
# treść DEWELOPERSKA nieprezentowana inżynierowi. Wpis bez uzasadnienia jest
# niedozwolony.
EXCLUDED_FILES: dict[str, str] = {
    "frontend/src/ui/canon/technicalDebtRegistry.ts": (
        "Rejestr długu technicznego — komendy weryfikacyjne i ścieżki plików to "
        "treść deweloperska (nie jest renderowana inżynierowi w UI ani eksportach)."
    ),
}

# (ścieżka względna repo, nr linii, token) -> uzasadnienie. Wyłącznie
# identyfikatory techniczne NIE prezentowane inżynierowi. Wpis bez
# uzasadnienia jest niedozwolony.
ALLOWLIST: dict[tuple[str, int, str], str] = {}


class Violation(NamedTuple):
    file_path: str
    line_number: int
    token: str
    snippet: str


def _relative(path: Path) -> str:
    try:
        return str(path.relative_to(REPO_ROOT)).replace("\\", "/")
    except ValueError:
        return str(path)


def _tokens_for_text(text: str) -> list[str]:
    """Zakazane tokeny w treści literału wg reguł K10."""
    tokens = list(REGISTRY_CODE_PATTERN.findall(text))
    # Nazwy API i ścieżki: wyłącznie proza (odstęp = zdanie, nie klucz danych).
    if any(ch.isspace() for ch in text.strip()):
        tokens += [m.group(0) for m in API_NAME_PATTERN.finditer(text)]
        tokens += [m.group(0) for m in SOURCE_PATH_PATTERN.finditer(text)]
    return tokens


def _docstring_constants(tree: ast.AST) -> set[int]:
    doc_ids: set[int] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Module | ast.ClassDef | ast.FunctionDef | ast.AsyncFunctionDef):
            body = node.body
            if (
                body
                and isinstance(body[0], ast.Expr)
                and isinstance(body[0].value, ast.Constant)
                and isinstance(body[0].value.value, str)
            ):
                doc_ids.add(id(body[0].value))
    return doc_ids


def scan_python_file(path: Path) -> list[Violation]:
    try:
        source = path.read_text(encoding="utf-8")
        tree = ast.parse(source)
    except (OSError, SyntaxError, UnicodeDecodeError) as exc:
        return [Violation(_relative(path), 0, "PARSE-ERROR", str(exc))]

    doc_ids = _docstring_constants(tree)
    rel = _relative(path)
    violations: list[Violation] = []
    for node in ast.walk(tree):
        if not (isinstance(node, ast.Constant) and isinstance(node.value, str)):
            continue
        if id(node) in doc_ids:
            continue
        for token in _tokens_for_text(node.value):
            if ALLOWLIST.get((rel, node.lineno, token)):
                continue
            snippet = node.value.strip().splitlines()[0][:90] if node.value.strip() else ""
            violations.append(Violation(rel, node.lineno, token, snippet))
    return violations


def scan_ts_file(path: Path) -> list[Violation]:
    try:
        source = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as exc:
        return [Violation(_relative(path), 0, "READ-ERROR", str(exc))]

    rel = _relative(path)
    violations: list[Violation] = []
    for lineno, line in enumerate(source.splitlines(), start=1):
        if TS_COMMENT_LINE.match(line) or TS_IMPORT_EXPORT_LINE.match(line):
            continue
        for match in TS_STRING_PATTERN.finditer(line):
            literal = match.group("string")[1:-1]
            for token in _tokens_for_text(literal):
                if ALLOWLIST.get((rel, lineno, token)):
                    continue
                violations.append(Violation(rel, lineno, token, literal.strip()[:90]))
    return violations


def _is_test_path(path: Path) -> bool:
    parts = set(path.parts)
    if "__tests__" in parts:
        return True
    return path.name.endswith((".test.ts", ".test.tsx"))


def iter_files(targets: list[str]) -> list[Path]:
    files: list[Path] = []
    for target in targets:
        path = Path(target)
        if not path.is_absolute():
            path = REPO_ROOT / target
        if path.is_dir():
            files.extend(p for p in sorted(path.rglob("*.py")))
            files.extend(
                p
                for ext in ("*.ts", "*.tsx")
                for p in sorted(path.rglob(ext))
                if not _is_test_path(p)
            )
        elif path.exists():
            files.append(path)
    return sorted(set(files))


def scan_file(path: Path) -> list[Violation]:
    if _relative(path) in EXCLUDED_FILES:
        return []
    if path.suffix == ".py":
        return scan_python_file(path)
    if path.suffix in (".ts", ".tsx"):
        return scan_ts_file(path)
    return []


def main(argv: list[str]) -> int:
    targets = argv if argv else SCAN_TARGETS
    violations: list[Violation] = []
    for file_path in iter_files(targets):
        violations.extend(scan_file(file_path))

    if violations:
        print("=" * 70, file=sys.stderr)
        print("UI-PRODUCTION-CODES GUARD: NARUSZENIE WYKRYTE", file=sys.stderr)
        print("=" * 70, file=sys.stderr)
        print(
            "Kody rejestru (V12K-*), nazwy API kontraktu wyników i ścieżki plików\n"
            "nie mogą trafiać do treści widocznej dla inżyniera (UI + ślady analiz).\n"
            "Użyj semantyki po polsku; wzory wyłącznie LaTeX (konwencja Proof Engine).",
            file=sys.stderr,
        )
        print(f"\nZnaleziono {len(violations)} naruszeń:", file=sys.stderr)
        print("-" * 70, file=sys.stderr)
        for v in violations:
            print(f"  {v.file_path}:{v.line_number}", file=sys.stderr)
            print(f"    Token: {v.token}", file=sys.stderr)
            print(f"    Literał: {v.snippet}", file=sys.stderr)
        print("-" * 70, file=sys.stderr)
        return 1

    print("ui-production-codes-guard: OK (brak naruszeń)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
