#!/usr/bin/env python3
"""
Protection No-Heuristics Guard — reguła CLAUDE.md #9 dla warstwy zabezpieczeń.

Karta BIEG-ZABEZPIECZEN-Z-MODELU (2026-09-30): ocena zabezpieczeń ma JEDNĄ ścieżkę
(`application/analyses/protection/ocena_nadpradowa.py`) na urządzeniach i nastawach z modelu
(D-21). Guard pilnuje całego toru — ocena, czasy wyłączenia, koordynacja E-28, zakresy
katalogu, read model nastaw, porównanie A/B, pisarze nastaw — przed trzema klasami defektu:

1. HEURYSTYKA (tekstowo): auto_select, auto_map, fallback, default_target, infer_upstream,
   infer_downstream, guess_*, heuristic, best_match — poza komentarzami i docstringami.
2. WARTOŚĆ DOMYŚLNA NASTAWY (AST): liczba albo napis podstawiony za brak danej —
   ``x or <stała>``, ``słownik.get(k, <stała>)``, ``getattr(o, n, <stała>)`` ze stałą różną od
   ``None``. Brak nastawy jest nazwanym brakiem gotowości, nigdy „typową wartością" (dawny
   silnik brał TMS 0,3 i krzywą SI, gdy szablon ich nie niósł).
3. POŁKNIĘTY WYJĄTEK (AST): blok ``except`` bez ``raise``, którego całe ciało to ``pass``,
   ``continue``, ``break``, ``return <stała>`` albo samo wyrażenie stałe — błąd przeliczenia
   (np. przekładni, jednostki) znika, a wynik liczy się dalej na brakującej danej.

Lista plików jest ZAMKNIĘTA i każdy musi istnieć — brak pliku to kod 2 (guard bez zakresu
byłby cichym no-opem). Lista wyjątków (ALLOWLIST) jest PUSTA; nowy wpis wymaga uzasadnienia
w commicie. Samotest z iniekcją: `scripts/test_protection_no_heuristics_guard.py`.

EXIT CODES: 0 = czysto, 1 = naruszenia, 2 = brak pliku z listy.
"""

from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]

SCAN_FILES: tuple[str, ...] = (
    "backend/src/application/analyses/protection/ocena_nadpradowa.py",
    "backend/src/application/analyses/protection/czas_wylaczenia_galezi.py",
    "backend/src/application/analyses/protection/czas_wylaczenia_pola.py",
    "backend/src/application/analyses/protection/coordination/analyzer.py",
    "backend/src/application/analyses/protection/coordination/z_biegow.py",
    "backend/src/application/analyses/protection/catalog/zakresy.py",
    "backend/src/application/analyses/protection/catalog/validator.py",
    "backend/src/application/protection_read_model.py",
    "backend/src/application/protection_comparison/service.py",
    "backend/src/domain/protection_analysis.py",
    "backend/src/enm/nastawy_zabezpieczen.py",
    "backend/src/enm/wylaczniki_liniowe.py",
    "backend/src/enm/domain_operations_v2.py",
)

#: Zakres AST w pliku zbiorczym operacji domenowych: wyłącznie funkcje toru zabezpieczeń
#: (pisarze nastaw i przekładników). Pozostałe operacje (nazwy elementów, kody błędów) nie są
#: torem nastaw; heurystyki tekstowe obowiązują w CAŁYM pliku.
ZAKRES_FUNKCJI: dict[str, frozenset[str]] = {
    "backend/src/enm/domain_operations_v2.py": frozenset(
        {
            "add_ct",
            "add_relay",
            "update_protection_settings",
            "_default_relay_settings",
            "_relay_device_type",
            "_relay_catalog_binding",
            "_wylacznik_liniowy",
            "_przekladnik_wylacznika",
        }
    ),
}

#: Klucze i atrybuty nastaw zabezpieczeń — napis podstawiony za ich brak też jest domysłem.
KLUCZE_NASTAW: frozenset[str] = frozenset(
    {
        "function_type",
        "threshold_a",
        "threshold_unit",
        "curve_type",
        "time_multiplier",
        "time_delay_s",
        "tms",
        "zwloka_s",
        "krzywa",
        "prog_pierwotny_a",
        "prog_wtorny_a",
        "accuracy_class",
        "ratio_primary",
        "ratio_secondary",
    }
)

#: Wyjątki ``ścieżka:linia:rodzaj`` — lista PUSTA (zapadka tylko w dół).
ALLOWLIST: frozenset[str] = frozenset()

FORBIDDEN_PATTERNS = [
    re.compile(r"\bauto_select\b", re.IGNORECASE),
    re.compile(r"\bauto_map\b", re.IGNORECASE),
    re.compile(r"\bfallback\b", re.IGNORECASE),
    re.compile(r"\bdefault_target\b", re.IGNORECASE),
    re.compile(r"\binfer_upstream\b", re.IGNORECASE),
    re.compile(r"\binfer_downstream\b", re.IGNORECASE),
    re.compile(r"\bguess_\w+", re.IGNORECASE),
    re.compile(r"\bheuristic\b", re.IGNORECASE),
    re.compile(r"\bbest_match\b", re.IGNORECASE),
]

SKIP_LINE_PATTERNS = [
    re.compile(r"^\s*#"),
    re.compile(r"^\s*//"),
    re.compile(r'^\s*"""'),
    re.compile(r"^\s*'''"),
]


def _should_skip_line(line: str) -> bool:
    return any(pattern.match(line) for pattern in SKIP_LINE_PATTERNS)


def _scan_text(content: str) -> list[tuple[int, str, str]]:
    """Heurystyki tekstowe poza komentarzami i docstringami: (linia, treść, dopasowanie)."""
    violations: list[tuple[int, str, str]] = []
    in_docstring = False
    for line_no, line in enumerate(content.splitlines(), start=1):
        stripped = line.strip()
        if '"""' in stripped or "'''" in stripped:
            if stripped.count('"""') + stripped.count("'''") == 1:
                in_docstring = not in_docstring
            continue
        if in_docstring or _should_skip_line(line):
            continue
        for pattern in FORBIDDEN_PATTERNS:
            match = pattern.search(line)
            if match:
                violations.append((line_no, stripped, f"heurystyka '{match.group()}'"))
    return violations


def _liczba(node: ast.AST) -> bool:
    return (
        isinstance(node, ast.Constant)
        and isinstance(node.value, int | float)
        and not isinstance(node.value, bool)
    )


def _logiczna_getattr(funkcja: ast.AST, domyslna: ast.AST) -> bool:
    """``getattr(obiekt, pole, True/False)`` — stan logiczny podstawiony za brak atrybutu
    (np. ``in_service``): obiekt typowany ma pole, więc wartość zastępcza tylko ukrywa błąd."""
    return (
        isinstance(funkcja, ast.Name)
        and funkcja.id == "getattr"
        and isinstance(domyslna, ast.Constant)
        and isinstance(domyslna.value, bool)
    )


def _napis(node: ast.AST) -> bool:
    return isinstance(node, ast.Constant) and isinstance(node.value, str)


def _dotyczy_nastawy(node: ast.AST) -> bool:
    """Czy wyrażenie czyta pole nastawy (atrybut, indeks albo ``.get`` z kluczem nastawy)."""
    for n in ast.walk(node):
        if isinstance(n, ast.Attribute) and n.attr in KLUCZE_NASTAW:
            return True
        if isinstance(n, ast.Constant) and isinstance(n.value, str) and n.value in KLUCZE_NASTAW:
            return True
    return False


def _cialo_polykajace(body: list[ast.stmt]) -> bool:
    for stmt in body:
        if isinstance(stmt, ast.Pass | ast.Continue | ast.Break):
            continue
        if isinstance(stmt, ast.Return) and (
            stmt.value is None or isinstance(stmt.value, ast.Constant)
        ):
            continue
        if isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Constant):
            continue
        return False
    return True


def _wezly_w_zakresie(tree: ast.Module, funkcje: frozenset[str] | None) -> list[ast.AST]:
    if funkcje is None:
        return list(ast.walk(tree))
    wezly: list[ast.AST] = []
    for node in tree.body:
        if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef) and node.name in funkcje:
            wezly.extend(ast.walk(node))
    return wezly


def _scan_ast(content: str, funkcje: frozenset[str] | None = None) -> list[tuple[int, str, str]]:
    """Wartości domyślne nastaw i połknięte wyjątki: (linia, treść, rodzaj).

    Wartość domyślna = liczba podstawiona za brak (``x or 0.0``, ``.get(k, 0.3)``,
    ``getattr(o, n, 1)``), stan logiczny podstawiony za brak atrybutu (``getattr(o,
    "in_service", True)``) albo napis podstawiony za brak POLA NASTAWY (``.get("curve_type",
    "IEC_SI")``, ``nastawa.krzywa or "SI"``). Napis zastępczy nazwy czy kodu błędu nie jest
    nastawą i nie jest tu naruszeniem.
    """
    tree = ast.parse(content)
    linie = content.splitlines()
    violations: list[tuple[int, str, str]] = []

    def dodaj(node: ast.AST, rodzaj: str) -> None:
        numer = getattr(node, "lineno", 0)
        violations.append((numer, linie[numer - 1].strip() if numer else "", rodzaj))

    for node in _wezly_w_zakresie(tree, funkcje):
        if isinstance(node, ast.BoolOp) and isinstance(node.op, ast.Or):
            zastepcze = node.values[1:]
            if any(_liczba(v) for v in zastepcze) or (
                any(_napis(v) for v in zastepcze) and _dotyczy_nastawy(node.values[0])
            ):
                dodaj(node, "wartość domyślna (or <stała>)")
        elif isinstance(node, ast.Call):
            funkcja = node.func
            klucz: ast.AST | None = None
            domyslna: ast.AST | None = None
            if isinstance(funkcja, ast.Attribute) and funkcja.attr == "get" and len(node.args) == 2:
                klucz, domyslna = node.args
            elif isinstance(funkcja, ast.Name) and funkcja.id == "getattr" and len(node.args) == 3:
                klucz, domyslna = node.args[1], node.args[2]
            if domyslna is not None and klucz is not None:
                if (
                    _liczba(domyslna)
                    or _logiczna_getattr(funkcja, domyslna)
                    or (
                        _napis(domyslna)
                        and isinstance(klucz, ast.Constant)
                        and klucz.value in KLUCZE_NASTAW
                    )
                ):
                    dodaj(node, "wartość domyślna (odczyt ze stałą zastępczą)")
        elif isinstance(node, ast.ExceptHandler):
            zawiera_raise = any(isinstance(n, ast.Raise) for n in ast.walk(node))
            if not zawiera_raise and _cialo_polykajace(node.body):
                dodaj(node, "połknięty wyjątek")
    return violations


def skanuj(
    repo_root: Path, pliki: tuple[str, ...]
) -> tuple[list[tuple[str, int, str, str]], list[str]]:
    """(naruszenia, brakujące pliki) dla listy plików względem ``repo_root``."""
    naruszenia: list[tuple[str, int, str, str]] = []
    brakujace: list[str] = []
    for rel_path in pliki:
        full_path = repo_root / rel_path
        if not full_path.is_file():
            brakujace.append(rel_path)
            continue
        content = full_path.read_text(encoding="utf-8")
        zakres = ZAKRES_FUNKCJI.get(rel_path)
        for line_no, line, rodzaj in (*_scan_text(content), *_scan_ast(content, zakres)):
            if f"{rel_path}:{line_no}:{rodzaj}" in ALLOWLIST:
                continue
            naruszenia.append((rel_path, line_no, line, rodzaj))
    return sorted(naruszenia), brakujace


def main(repo_root: Path = REPO_ROOT, pliki: tuple[str, ...] = SCAN_FILES) -> int:
    naruszenia, brakujace = skanuj(repo_root, pliki)
    if brakujace:
        print("PROTECTION-NO-HEURISTICS-GUARD: brak plików z listy:", file=sys.stderr)
        for rel_path in brakujace:
            print(f"  {rel_path}", file=sys.stderr)
        return 2
    if naruszenia:
        print("PROTECTION-NO-HEURISTICS-GUARD VIOLATIONS:", file=sys.stderr)
        for rel_path, line_no, line, rodzaj in naruszenia:
            print(f"  {rel_path}:{line_no}: [{rodzaj}] {line}", file=sys.stderr)
        print(f"\n{len(naruszenia)} violation(s).", file=sys.stderr)
        return 1
    print(f"protection-no-heuristics-guard: PASS ({len(pliki)} files scanned)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
