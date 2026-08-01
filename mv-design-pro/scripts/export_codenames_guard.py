#!/usr/bin/env python3
"""
EXPORT-CODENAMES GUARD — kody projektowe won z treści eksportów (K7-A, 2026-07-29)

REGUŁA WIĄŻĄCA (CLAUDE.md "No Codenames in UI/Exports"):
- Kody projektowe (P7, P11, P14, P20, P24+, ...) oraz porównawcze nazwy
  produktowe (ETAP+, ETAP++) NIGDY nie mogą trafiać do TREŚCI dokumentów
  eksportowych (PDF/DOCX/LaTeX/SVG). W treści obowiązują polskie etykiety
  inżynierskie.

ZASIĘG SKANU (v1): źródła producentów eksportów — renderery PDF/DOCX raportów
analiz, dokumentu studium, wniosku OSD, certyfikatu, eksportów API oraz
eksporterów proof/reporting w network_model. Skan obejmuje WYŁĄCZNIE literały
napisowe (ast), bo tylko one mogą trafić do dokumentu.

CO NIE JEST NARUSZENIEM (rozstrzygnięcia, patrz karta K7-A):
- Docstringi modułów/klas/funkcji — dokumentacja kodu, nie treść dokumentu
  (pomijane automatycznie).
- Komentarze — ast ich nie widzi.
- Techniczne identyfikatory reguł w POLACH DANYCH (np. "NR_P20_001",
  "NR_P18_004"): wzorzec z granicą słowa ich nie łapie (podkreślenie jest
  znakiem słowa), więc nie wymagają allowlisty. To identyfikatory kontraktu
  wyników (rule_id), nie proza — ich zmiana łamałaby FROZEN result API.
- Percentyle p50/p75/p90/p95/p99 (żargon techniczny, nie kody projektu).

ALLOWLISTA: wpisy (ścieżka względna, nr linii, token) z uzasadnieniem — TYLKO
dla identyfikatorów technicznych, które NIE są drukowane w treści dokumentu
(np. klucz słownika danych). Wpis bez uzasadnienia jest niedozwolony.

DŁUG NAZWANY (poza zasięgiem v1 — warstwa DANYCH, nie renderery; pomiar K7-A):
1) Tytuły dowodów w application/proof_engine (np. "Dowód: ... (P18)",
   latex_renderer "(P15)") — renderowane także w UI inspektora dowodów;
   czyszczenie wymaga koordynacji z wątkiem frontendu.
2) Buildery analiz produkują kody w POLACH DANYCH widoków, które renderery
   drukują (scenario_comparison/builder.py key_drivers "P20: FAIL=...",
   recommendations/builder.py confidence_note/source, coverage_score/builder.py
   missing_items "P11: SC3F"). Dotknięte testy: test_scenario_comparison,
   test_recommendations, test_coverage_score, test_lf_sensitivity_p33.
Po wyczyszczeniu dodać "backend/src/application/proof_engine" oraz katalogi
builderów analiz do SCAN_TARGETS.

Wyjścia: 0 = czysto, 1 = naruszenia.
Użycie: python scripts/export_codenames_guard.py [ścieżki...]
        (ścieżki nadpisują SCAN_TARGETS — używane przez test guarda w tests/ci/)
"""

from __future__ import annotations

import ast
import re
import sys
from pathlib import Path
from typing import NamedTuple

REPO_ROOT = Path(__file__).resolve().parents[1]

# Producenci eksportów (katalogi skanowane rekursywnie, pliki wprost).
SCAN_TARGETS = [
    "backend/src/analysis/reporting",
    "backend/src/network_model/reporting",
    "backend/src/network_model/proof",
    "backend/src/analysis/power_flow/violations_report.py",
    "backend/src/analysis/protection_curves_it/renderer_pdf.py",
    "backend/src/analysis/protection_curves_it/renderer_svg.py",
    "backend/src/application/analyses/dokument_studium.py",
    "backend/src/application/analyses/wniosek_osd.py",
    "backend/src/application/analyses/certyfikat_zgodnosci.py",
    "backend/src/application/reference_patterns/reporting.py",
    "backend/src/application/reference_networks/report_export.py",
    "backend/src/api/analysis_run_exports.py",
    "backend/src/api/power_flow_runs.py",
    "backend/src/api/power_flow_comparisons.py",
    "backend/src/api/reference_patterns.py",
]

# Kody projektowe: P<liczba> (opcjonalny sufiks "+", np. P24+). P0 wyłączone
# (parametr techniczny strat jałowych transformatora). Granice: znak słowa
# przed/po wyklucza identyfikatory typu NR_P20_001 i p0_kw.
CODENAME_PATTERN = re.compile(r"(?<![\w])[pP](?!0\b)\d+\+?(?![\w])")
# Porównawcze nazwy produktowe w treści eksportu (ETAP, ETAP+, ETAP++).
PRODUCT_PATTERN = re.compile(r"\bETAP\+{0,2}(?![\w])")

# Rozszerzenie K10 (dyrektywa 2026-07-29): kody rejestru, nazwy klas/API
# kontraktu wyników i ścieżki plików źródłowych nie mogą trafiać do treści
# eksportów. Kody rejestru flagowane zawsze (granica słowa z lewej — nazwy
# handlowe typu "HV12K-3H" to nie kody); nazwy API i ścieżki wyłącznie w
# PROZIE (literał z odstępem), żeby nie flagować kluczy kontraktu danych.
REGISTRY_CODE_PATTERN = re.compile(r"(?<![A-Za-z0-9])V12K-\d+")
API_NAME_PATTERN = re.compile(
    r"\b(PowerFlowResult|ShortCircuitResult|ResultSet|FROZEN|branch_results|bus_results)\b"
)
SOURCE_PATH_PATTERN = re.compile(r"\b[\w.]+/[\w.]+\.(?:py|ts|tsx)\b")

ALLOWED_TECHNICAL_TOKENS = {"p50", "p75", "p90", "p95", "p99"}

# (ścieżka względna repo, nr linii, token) -> uzasadnienie.
# Wyłącznie identyfikatory techniczne NIE drukowane w treści dokumentu.
ALLOWLIST: dict[tuple[str, int, str], str] = {}


class Violation(NamedTuple):
    file_path: str
    line_number: int
    token: str
    snippet: str


def _docstring_constants(tree: ast.AST) -> set[int]:
    """Zbiera id() węzłów-stałych będących docstringami (pomijane w skanie)."""
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


def _relative(path: Path) -> str:
    try:
        return str(path.relative_to(REPO_ROOT)).replace("\\", "/")
    except ValueError:
        return str(path)


def scan_file(path: Path) -> list[Violation]:
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
        text = node.value
        tokens = [
            t for t in CODENAME_PATTERN.findall(text) if t.lower() not in ALLOWED_TECHNICAL_TOKENS
        ]
        tokens += PRODUCT_PATTERN.findall(text)
        # K10: kody rejestru zawsze; nazwy API/ścieżki tylko w prozie (odstęp).
        tokens += REGISTRY_CODE_PATTERN.findall(text)
        if any(ch.isspace() for ch in text.strip()):
            tokens += [m.group(0) for m in API_NAME_PATTERN.finditer(text)]
            tokens += [m.group(0) for m in SOURCE_PATH_PATTERN.finditer(text)]
        for token in tokens:
            if ALLOWLIST.get((rel, node.lineno, token)):
                continue
            snippet = text.strip().splitlines()[0][:90] if text.strip() else ""
            violations.append(Violation(rel, node.lineno, token, snippet))
    return violations


def iter_files(targets: list[str]) -> list[Path]:
    files: list[Path] = []
    for target in targets:
        path = Path(target)
        if not path.is_absolute():
            path = REPO_ROOT / target
        if path.is_dir():
            files.extend(sorted(path.rglob("*.py")))
        elif path.exists():
            files.append(path)
    return sorted(set(files))


def main(argv: list[str]) -> int:
    targets = argv if argv else SCAN_TARGETS
    violations: list[Violation] = []
    for file_path in iter_files(targets):
        violations.extend(scan_file(file_path))

    if violations:
        print("=" * 70, file=sys.stderr)
        print("EXPORT-CODENAMES GUARD: NARUSZENIE WYKRYTE", file=sys.stderr)
        print("=" * 70, file=sys.stderr)
        print(
            "Kody projektowe (P11, P24+, ...) i nazwy porównawcze (ETAP+) nie mogą\n"
            "trafiać do treści eksportów. Użyj polskich etykiet inżynierskich.",
            file=sys.stderr,
        )
        print(f"\nZnaleziono {len(violations)} naruszeń:", file=sys.stderr)
        print("-" * 70, file=sys.stderr)
        for v in violations:
            print(f"  {v.file_path}:{v.line_number}", file=sys.stderr)
            print(f"    Token: {v.token}", file=sys.stderr)
            print(f"    Literał: {v.snippet}", file=sys.stderr)
        print("-" * 70, file=sys.stderr)
        print(
            "Napraw naruszenia przed scaleniem (etykiety PL zamiast kodów).",
            file=sys.stderr,
        )
        return 1

    print("export-codenames-guard: OK (brak naruszeń)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
