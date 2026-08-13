#!/usr/bin/env python3
from __future__ import annotations

import ast
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]

FORBIDDEN_IMPORTS = {
    "solvers": ("analysis", "analysis.protection"),
    "analysis": ("solvers",),
    "analysis.protection": ("solvers",),
}


def _normalize_module(module: str | None) -> str | None:
    if module is None:
        return None
    return module.strip()


def _import_targets(node: ast.AST) -> list[str]:
    if isinstance(node, ast.Import):
        return [alias.name for alias in node.names]
    if isinstance(node, ast.ImportFrom):
        module = _normalize_module(node.module)
        if module is None:
            return []
        return [module]
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


def _scan_file(path: Path) -> tuple[str, str] | None:
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
    except SyntaxError as exc:
        return (str(path), f"SyntaxError: {exc.msg}")
    layer = _layer_for_path(path)
    if layer is None:
        return None
    for node in ast.walk(tree):
        for imported in _import_targets(node):
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
        violation = _scan_file(path)
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
