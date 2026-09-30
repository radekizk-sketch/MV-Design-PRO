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
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from importy_ast import ImportPonadKorzen, moduly_dotkniete, pakiet_pliku  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[1]

FORBIDDEN_IMPORTS = {
    "solvers": ("analysis", "analysis.protection"),
    "analysis": ("solvers",),
    "analysis.protection": ("solvers",),
}


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


def _scan_file(path: Path, backend_root: Path | None = None) -> tuple[str, str] | None:
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
    except SyntaxError as exc:
        return (str(path), f"SyntaxError: {exc.msg}")
    layer = _layer_for_path(path)
    if layer is None:
        return None
    pakiet = _pakiet(path, backend_root or REPO_ROOT / "backend")
    for node in ast.walk(tree):
        try:
            targets = _import_targets(node, pakiet)
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
