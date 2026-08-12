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


def scan_python_file_raw(path: Path) -> list[Violation]:
    """Jak `scan_python_file()`, ale PRZED filtrem ALLOWLIST — karta
    ZAPADKI-ALLOWLIST-RESZTA (pozycja e, 2026-08-12), zasila zarowno filtr
    (`scan_python_file`), jak i zapadke swiezosci (`check_allowlist_freshness`)."""
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
            snippet = node.value.strip().splitlines()[0][:90] if node.value.strip() else ""
            violations.append(Violation(rel, node.lineno, token, snippet))
    return violations


def scan_python_file(path: Path) -> list[Violation]:
    rel = _relative(path)
    return [
        v for v in scan_python_file_raw(path) if not ALLOWLIST.get((rel, v.line_number, v.token))
    ]


def scan_ts_file_raw(path: Path) -> list[Violation]:
    """Jak `scan_ts_file()`, ale PRZED filtrem ALLOWLIST (patrz
    `scan_python_file_raw`)."""
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
                violations.append(Violation(rel, lineno, token, literal.strip()[:90]))
    return violations


def scan_ts_file(path: Path) -> list[Violation]:
    rel = _relative(path)
    return [v for v in scan_ts_file_raw(path) if not ALLOWLIST.get((rel, v.line_number, v.token))]


def _raw_violations_for_path(rel_path: str) -> list[Violation]:
    """Surowe trafienia (PRZED ALLOWLIST/EXCLUDED_FILES) dla JEDNEJ sciezki
    wzglednej — uzywane przez zapadki swiezosci ponizej, niezaleznie od tego,
    czy SCAN_TARGETS domyslnie w ogole odwiedza ten plik."""
    full_path = REPO_ROOT / rel_path
    if not full_path.is_file():
        return []
    if full_path.suffix == ".py":
        return scan_python_file_raw(full_path)
    if full_path.suffix in (".ts", ".tsx"):
        return scan_ts_file_raw(full_path)
    return []


def check_allowlist_freshness() -> list[str]:
    """Zapadka swiezosci ALLOWLIST (karta ZAPADKI-ALLOWLIST-RESZTA, pozycja e).

    ALLOWLIST jest DZIS PUSTA — funkcja jest no-op na HEAD, ale MUSI istniec i
    byc wpieta w main() teraz: pierwszy wpis dopisany bez rownoczesnej zapadki
    usypia dokladnie to samo ryzyko, ktore juz raz zmaterializowalo sie w
    ui_no_physics_guard.ALLOWLIST (pozycja a) — osierocenie bez detektora.
    Kazdy wpis musi nadal odpowiadac REALNEMU trafieniu `_raw_violations_for_path()`
    na (sciezka, linia, token) — TA SAMA funkcja, ktorej uzywaja
    `scan_python_file`/`scan_ts_file` do filtrowania (predykaty parami,
    KLASA-NIE-INSTANCJA S3).
    """
    violations: list[str] = []
    for (rel_path, lineno, token), reason in sorted(ALLOWLIST.items()):
        raw = _raw_violations_for_path(rel_path)
        if any(v.line_number == lineno and v.token == token for v in raw):
            continue
        violations.append(
            f"[ui-production-codes-wpis-osierocony] ALLOWLIST[({rel_path!r}, {lineno}, "
            f"{token!r})] nie odpowiada juz zadnemu surowemu trafieniu — usun ten wpis "
            f"(uzasadnienie bylo: {reason})"
        )
    return violations


def check_excluded_files_freshness() -> list[str]:
    """Zapadka swiezosci EXCLUDED_FILES (karta ZAPADKI-ALLOWLIST-RESZTA,
    pozycja e — przy okazji, ta sama klasa co podklasa `f` w innych guardach:
    wykluczenie calego pliku wskazujace plik, ktorego juz nie ma, jest martwym
    wyjatkiem czekajacym, az ktos utworzy NOWY plik pod ta sama sciezka)."""
    violations: list[str] = []
    for rel_path in sorted(EXCLUDED_FILES):
        if not (REPO_ROOT / rel_path).is_file():
            violations.append(
                f"[ui-production-codes-wykluczenie-osierocone] EXCLUDED_FILES zawiera "
                f"{rel_path!r}, ktorego juz nie ma w repo — usun ten wpis"
            )
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

    freshness_violations = check_allowlist_freshness() + check_excluded_files_freshness()
    if freshness_violations:
        print("=" * 70, file=sys.stderr)
        print("UI-PRODUCTION-CODES GUARD: WPISY OSIEROCONE", file=sys.stderr)
        print("=" * 70, file=sys.stderr)
        for message in freshness_violations:
            print(f"  {message}", file=sys.stderr)
        print(file=sys.stderr)

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

    if violations or freshness_violations:
        return 1

    print("ui-production-codes-guard: OK (brak naruszeń)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
