#!/usr/bin/env python3
"""Arch Guard — granica warstw solverów i analizy (importy, AST).

Reguła (`FORBIDDEN_IMPORTS`): plik warstwy `solvers` (ścieżka z członem `solvers`) nie
importuje `analysis`; plik warstwy `analysis` nie importuje pakietu `solvers` (warstwa
wywołań/dyspozycji solverów, `backend/src/solvers/**`).

IMPORTY są rozwiązywane wg semantyki interpretera (`scripts/importy_ast.py`, jedno źródło
prawdy bramek). Do 2026-09-30 bramka czytała samo `ImportFrom.module`, więc import
względny `from .solvers import x` w `analysis/pakiet/m.py` (moduł `analysis.pakiet.solvers`)
był raportowany jako import warstwy `solvers`, a nazwa sprowadzona z pakietu
(`from analysis import protection`) nie była liczona jako moduł `analysis.protection`.
Import względny ponad korzeń drzewa importów (interpreter: `ImportError`) jest naruszeniem
— bramka nie zgaduje jego celu. Testy: `scripts/test_granice_importow_wzglednych.py`.

REGUŁA SOLVERÓW FIZYCZNYCH W WARSTWIE ANALIZY (karta TORY-TYLKO-W-TESTACH, 2026-09-30).
Reguła `FORBIDDEN_IMPORTS["analysis"] = ("solvers",)` dopasowuje pakiet dyspozycji
`backend/src/solvers/**`, więc `network_model.solvers.*` z `analysis/**` przechodziło
z konstrukcji — tak w warstwie interpretacji żył adapter wołający solver NR
(`analysis/power_flow/solver.py`, skasowany). Kod produktu `backend/src/analysis/**`
sprowadza z `network_model.solvers*` WYŁĄCZNIE nazwy z listy zamkniętej
`ANALIZA_DOZWOLONE_Z_SOLVEROW` (typy wyników i kontrakty wejścia — dane, nie
obliczenia). Naruszeniem jest: `import network_model.solvers…` (dostęp do każdej funkcji
modułu), `from network_model import solvers`, moduł solvera spoza listy, nazwa spoza
listy, `*`, oraz dynamiczny import napisem (`importlib.import_module`, `__import__`)
modułu `network_model.solvers…`. Testy `backend/tests/analysis/**` są poza regułą — test
woła solver, żeby dowieść fizyki.
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from importy_ast import (  # noqa: E402
    ImportPonadKorzen,
    modul_bazowy,
    moduly_dotkniete,
    pakiet_pliku,
    pod_prefiksem,
)

REPO_ROOT = Path(__file__).resolve().parents[1]

FORBIDDEN_IMPORTS = {
    "solvers": ("analysis", "analysis.protection"),
    "analysis": ("solvers",),
    "analysis.protection": ("solvers",),
}

#: Pakiet solverów fizycznych (WHITE BOX) — warstwa analizy go nie woła.
SOLVERY_FIZYCZNE = ("network_model.solvers",)

#: LISTA ZAMKNIĘTA (pomiar 2026-09-30 na całym `backend/src/analysis/**`): jedyne nazwy,
#: które warstwa analizy sprowadza z solverów. Każda to typ danych, nie obliczenie.
#: Nowy wpis wymaga uzasadnienia przy wpisie; wpis bez importera w `src/analysis/**` jest
#: martwym wyjątkiem (pilnuje `test_lista_dozwolona_bez_martwych_wpisow`).
ANALIZA_DOZWOLONE_Z_SOLVEROW: dict[str, frozenset[str]] = {
    # Kontrakt WEJŚCIA solvera rozpływu (dataclasses bez obliczeń), reeksportowany przez
    # `analysis/power_flow/types.py` jako część publicznego API pakietu typu wyniku.
    "network_model.solvers.power_flow_types": frozenset(
        {
            "BranchLimitSpec",
            "BusVoltageLimitSpec",
            "PowerFlowInput",
            "PowerFlowOptions",
            "PQSpec",
            "PVSpec",
            "ShuntSpec",
            "SlackSpec",
            "TransformerTapSpec",
        }
    ),
    # Typ wyniku rozpływu FROZEN v1 — czytany przez rozkład segmentów profilu napięć
    # (`analysis/voltage_profile/segment_decomposition.py`), bez `build_power_flow_result_v1`.
    "network_model.solvers.power_flow_result": frozenset({"PowerFlowResultV1"}),
}

#: Funkcje dynamicznego importu napisem (obejście reguły importów statycznych).
_IMPORT_DYNAMICZNY = frozenset({"import_module", "__import__"})


def _pakiet(path: Path, backend_root: Path) -> str:
    """`__package__` pliku: korzeniem importów jest `backend/src` dla kodu produktu
    i `backend/` dla testów i skryptów backendu (pakiet `tests`)."""
    for korzen in (backend_root / "src", backend_root):
        try:
            return pakiet_pliku(path, korzen)
        except ValueError:
            continue
    return ""


def _import_targets(node: ast.AST, pakiet: str) -> list[str]:
    """Moduły ładowane przez instrukcję importu. Rzuca `ImportPonadKorzen`."""
    if isinstance(node, ast.Import | ast.ImportFrom):
        return list(moduly_dotkniete(pakiet, node))
    return []


def _matches_forbidden(imported: str, forbidden_prefix: str) -> bool:
    return imported == forbidden_prefix or imported.startswith(f"{forbidden_prefix}.")


def _violates(layer: str, imported: str) -> bool:
    for forbidden_prefix in FORBIDDEN_IMPORTS.get(layer, ()):
        if _matches_forbidden(imported, forbidden_prefix):
            return True
    return False


def _layer_for_path(path: Path) -> str | None:
    parts = path.parts
    if "solvers" in parts:
        return "solvers"
    if "analysis" in parts:
        if "protection" in parts:
            return "analysis.protection"
        return "analysis"
    return None


def _kod_analizy_produktu(path: Path, backend_root: Path) -> bool:
    """Plik kodu produktu warstwy analizy: `backend/src/analysis/**` (testy poza regułą)."""
    try:
        return path.relative_to(backend_root / "src" / "analysis") is not None
    except ValueError:
        return False


def _solver_w_analizie(node: ast.AST, pakiet: str) -> str | None:
    """Naruszenie reguły solverów fizycznych w warstwie analizy albo `None`.

    Rzuca `ImportPonadKorzen` (jak `_import_targets`)."""
    if isinstance(node, ast.Import):
        for alias in node.names:
            if pod_prefiksem(alias.name, SOLVERY_FIZYCZNE):
                return (
                    f"analysis must not import {alias.name} (import modulu solvera daje "
                    "dostep do obliczen; dozwolone wylacznie `from <modul> import <typ>` "
                    "z ANALIZA_DOZWOLONE_Z_SOLVEROW)"
                )
        return None
    if isinstance(node, ast.ImportFrom):
        baza = modul_bazowy(pakiet, node)
        if pod_prefiksem(baza, SOLVERY_FIZYCZNE):
            dozwolone = ANALIZA_DOZWOLONE_Z_SOLVEROW.get(baza)
            if dozwolone is None:
                return (
                    f"analysis must not import {baza} (modul solvera spoza listy typow "
                    "wynikow i kontraktow ANALIZA_DOZWOLONE_Z_SOLVEROW)"
                )
            for alias in node.names:
                if alias.name not in dozwolone:
                    return (
                        f"analysis must not import {baza}.{alias.name} (nazwa spoza listy "
                        "typow wynikow i kontraktow ANALIZA_DOZWOLONE_Z_SOLVEROW)"
                    )
            return None
        for alias in node.names:
            cel = f"{baza}.{alias.name}"
            if pod_prefiksem(cel, SOLVERY_FIZYCZNE):
                return f"analysis must not import {cel} (pakiet solverow fizycznych)"
        return None
    if isinstance(node, ast.Call):
        funkcja = node.func
        nazwa = (
            funkcja.attr
            if isinstance(funkcja, ast.Attribute)
            else funkcja.id if isinstance(funkcja, ast.Name) else None
        )
        if nazwa in _IMPORT_DYNAMICZNY and node.args:
            pierwszy = node.args[0]
            if (
                isinstance(pierwszy, ast.Constant)
                and isinstance(pierwszy.value, str)
                and pod_prefiksem(pierwszy.value, SOLVERY_FIZYCZNE)
            ):
                return f"analysis must not import {pierwszy.value} (dynamiczny import solvera)"
    return None


def _scan_file(path: Path, backend_root: Path | None = None) -> tuple[str, str] | None:
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
    except SyntaxError as exc:
        return (str(path), f"SyntaxError: {exc.msg}")
    layer = _layer_for_path(path)
    if layer is None:
        return None
    korzen = backend_root or REPO_ROOT / "backend"
    pakiet = _pakiet(path, korzen)
    regula_solverow = _kod_analizy_produktu(path, korzen)
    for node in ast.walk(tree):
        try:
            targets = _import_targets(node, pakiet)
            if regula_solverow:
                naruszenie = _solver_w_analizie(node, pakiet)
                if naruszenie is not None:
                    return (str(path), naruszenie)
        except ImportPonadKorzen as blad:
            return (str(path), f"{layer}: {blad}")
        for imported in targets:
            if _violates(layer, imported):
                rule = f"{layer} must not import {imported}"
                return (str(path), rule)
    return None


def _iter_python_files(root: Path) -> list[Path]:
    return sorted(path for path in root.rglob("*.py") if path.is_file())


def main() -> int:
    backend_root = REPO_ROOT / "backend"
    if not backend_root.exists():
        print("arch-guard: backend directory not found", file=sys.stderr)
        return 2
    pliki = _iter_python_files(backend_root)
    for path in pliki:
        violation = _scan_file(path, backend_root)
        if violation:
            file_path, rule = violation
            print(f"ARCH-GUARD VIOLATION: {file_path}", file=sys.stderr)
            print(f"Rule: {rule}", file=sys.stderr)
            return 1
    # Guard konczacy sie sukcesem MUSI powiedziec, ILE obejrzal: pusty log przy
    # RC=0 wyglada identycznie jak bramka, ktora nic nie przeskanowala (defekt H
    # przegladu 2026-08-01: no_direct_fault_params skanowal ZERO plikow i swiecil
    # zielono od dnia powstania). Licznik jest jedynym tanim dowodem biegu.
    print(f"arch-guard: OK, przeskanowano {len(pliki)} plikow backendu")
    return 0


if __name__ == "__main__":
    sys.exit(main())
