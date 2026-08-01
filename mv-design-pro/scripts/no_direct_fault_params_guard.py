#!/usr/bin/env python3
"""
CI Guard: no_direct_fault_params_guard.py — PR-19, przepisany na AST (V12K-306).

Inwariant: parametry zwarcia trafiają do solvera WYŁĄCZNIE przez kanoniczne
wiązanie FaultScenario, a nie jako surowy identyfikator węzła wstrzykiwany
z warstwy API/analiz.

Wykrywa (analiza składni, nie dopasowanie tekstu):
  A. Wywołanie funkcji/metody WARSTWY SOLVERA z argumentem kluczowym
     `fault_node_id=`.  Callee rozwiązywany po imporcie (`network_model.solvers`,
     `analysis.machine_short_circuit`), więc odczyt `result.fault_node_id`,
     kolumna ORM, literał w słowniku, docstring i nazwa pola DTO nie są
     trafieniami Z KONSTRUKCJI REGUŁY — bez żadnej białej listy dla warstwy
     odczytu wyniku.  Budowa obiektu danych (klasa CamelCase, `cls(...)`)
     odtwarza wynik, który JUŻ istnieje, więc nie jest wejściem w fizykę.
  B. Wywołanie `execute_short_circuit` albo `_execute_short_circuit` poza
     warstwą wiązania.  Definicja funkcji (`def`) naruszeniem nie jest —
     naruszeniem jest jej wołanie z pominięciem kanonicznej ścieżki.

Świadome ograniczenie reguły A (nazwane, nie ukryte): przekazanie identyfikatora
pozycyjnie albo opakowanego w obiekt wejściowy nie jest wykrywane; inwariant
celuje w jawną iniekcję nazwanego parametru.  Rozszerzenie zakresu to decyzja
architektoniczna (definicja kanonicznej warstwy wiązania FaultScenario).

Dozwolone lokalizacje: warstwa wiązania (WHITELISTED_PATHS), warstwa solvera
(SOLVER_LAYER_PREFIXES), zapadka zastanych wywołań (LEGACY_DIRECT_SOLVER_CALLERS),
testy i skrypty.

Exit 0 = PASS, Exit 1 = FAIL.
An EMPTY SCAN (missing scan root or 0 inspected files) is a FAIL, not a PASS:
a guard that looks at nothing must never report green.
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

# Korzeń źródeł backendu.
# UWAGA (V12K-306 / audyt 2026-08-01, defekt D3): ten plik leży w
# <repo>/mv-design-pro/scripts/, więc parent.parent to JUŻ <repo>/mv-design-pro.
# Historyczna stała doklejała drugi segment "mv-design-pro" i kierowała skan do
# katalogu, który nigdy nie istniał — bramka skanowała 0 plików i kończyła się
# kodem 0 od dnia powstania.  Nie przywracaj zdublowanego segmentu.
# Stała BACKEND_TESTS została USUNIĘTA (V12K-306): skan testów nie jest treścią
# inwariantu, bo testy z definicji wołają solvery bezpośrednio.
PROJECT_ROOT = Path(__file__).resolve().parent.parent
BACKEND_SRC = PROJECT_ROOT / "backend" / "src"

#: Moduły warstwy solvera — callee zaimportowany stąd to wejście w fizykę.
SOLVER_MODULE_PREFIXES = ("network_model.solvers", "analysis.machine_short_circuit")

#: Warstwa solvera po ścieżce pliku: `fault_node_id` jest tam nazwą parametru
#: WŁASNEJ sygnatury i wewnętrznym wywołaniem fizyki, nie iniekcją z zewnątrz.
SOLVER_LAYER_PREFIXES = ("network_model/solvers/", "analysis/machine_short_circuit/")

#: Nazwy wywołań kanonicznego wiązania (naruszenie B).
BINDING_CALL_NAMES = frozenset({"execute_short_circuit", "_execute_short_circuit"})

#: Kanoniczna warstwa wiązania FaultScenario — tu parametry zwarcia mają prawo
#: powstawać i przechodzić do solvera.
WHITELISTED_PATHS = {
    "domain/fault_scenario.py",
    "application/solvers/short_circuit_binding.py",
    "application/execution_engine/service.py",
    "application/result_mapping/short_circuit_to_resultset_v1.py",
    "application/fault_scenario_service.py",
}

#: ZAPADKA zastanych miejsc wiązania (stan zamrożony w V12K-306, audyt 2026-08-01).
#: Znane zastane miejsca wołające solver bezpośrednio, z pominięciem kanonicznego
#: `execute_short_circuit`.  Konsolidacja tych ścieżek do jednego wiązania to
#: OSOBNY dług architektoniczny prowadzony w rejestrze — nie wolno go tutaj cicho
#: zamykać.  Lista jest ZAMKNIĘTA: KAŻDE NOWE miejsce = naruszenie.
LEGACY_DIRECT_SOLVER_CALLERS = {
    "api/case_runs.py",
    "api/fault_loop.py",
    "api/proof_pack.py",
    "application/analyses/fault_loop/service.py",
    "application/analysis_run/service.py",
    "application/network_wizard/service.py",
    "application/proof_engine/packs/sc_symmetrical.py",
    "application/reference_networks/computation.py",
    "application/reference_networks/station_archetype_substrate.py",
    "enm/canonical_analysis.py",
}


def is_whitelisted(filepath: Path) -> bool:
    """Czy plik jest poza zakresem inwariantu."""
    # Testy i skrypty są zawsze dozwolone.
    absolute = str(filepath)
    if "/tests/" in absolute or "/scripts/" in absolute:
        return True

    # Plik, którego nie da się wyrazić względem korzenia skanowania, NIE jest
    # białolistowany: połknięcie ValueError bieliło KAŻDY plik, gdy korzeń był
    # zepsuty (druga warstwa pustki defektu D3).  Reguła fail-closed.
    try:
        relative = filepath.relative_to(BACKEND_SRC)
    except ValueError:
        return False

    rel = relative.as_posix()
    if any(rel.startswith(prefix) for prefix in SOLVER_LAYER_PREFIXES):
        return True
    return rel in WHITELISTED_PATHS or rel in LEGACY_DIRECT_SOLVER_CALLERS


def solver_aliases(tree: ast.AST) -> set[str]:
    """Nazwy lokalne (funkcje, klasy, moduły) zaimportowane z warstwy solvera."""
    aliases: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            module = node.module or ""
            if any(
                module == prefix or module.startswith(prefix + ".")
                for prefix in SOLVER_MODULE_PREFIXES
            ):
                for alias in node.names:
                    aliases.add(alias.asname or alias.name)
        elif isinstance(node, ast.Import):
            for alias in node.names:
                if any(
                    alias.name == prefix or alias.name.startswith(prefix + ".")
                    for prefix in SOLVER_MODULE_PREFIXES
                ):
                    aliases.add(alias.asname or alias.name.split(".")[0])
    return aliases


def root_name(expr: ast.expr) -> str:
    """Najbardziej lewa nazwa wyrażenia wywołania (`A.b.c()` -> `A`)."""
    while isinstance(expr, ast.Attribute):
        expr = expr.value
    return expr.id if isinstance(expr, ast.Name) else ""


def callee_name(call: ast.Call) -> str:
    """Nazwa wołanego obiektu (`f()` -> `f`, `a.b.f()` -> `f`)."""
    if isinstance(call.func, ast.Name):
        return call.func.id
    if isinstance(call.func, ast.Attribute):
        return call.func.attr
    return ""


def is_data_construction(call: ast.Call) -> bool:
    """Czy to budowa obiektu danych, a nie wejście w obliczenie.

    Klasa (nazwa CamelCase) albo `cls(...)` w metodzie klasowej odtwarza DTO,
    wiersz ORM lub model żądania z danych, które JUŻ istnieją — to nie jest
    wstrzyknięcie parametru do fizyki.
    """
    name = callee_name(call)
    return name == "cls" or name[:1].isupper()


def check_file(filepath: Path) -> list[str]:
    """Naruszenia w jednym pliku (pusta lista = plik czysty)."""
    violations: list[str] = []

    if filepath.suffix != ".py":
        return violations

    if is_whitelisted(filepath):
        return violations

    try:
        source = filepath.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return violations

    try:
        tree = ast.parse(source, filename=str(filepath))
    except SyntaxError as exc:
        # Plik liczy się jako obejrzany; ostrzeżenie zamiast wywrócenia bramki.
        print(f"WARN: {filepath}:{exc.lineno}: nie da sie sparsowac ({exc.msg})")
        return violations

    aliases = solver_aliases(tree)

    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue

        name = callee_name(node)

        if (
            root_name(node.func) in aliases
            and not is_data_construction(node)
            and any(keyword.arg == "fault_node_id" for keyword in node.keywords)
        ):
            violations.append(
                f"  {filepath}:{node.lineno}: iniekcja 'fault_node_id=' do wywolania "
                f"warstwy solvera '{name}' poza warstwa wiazania FaultScenario"
            )

        if name in BINDING_CALL_NAMES:
            violations.append(
                f"  {filepath}:{node.lineno}: bezposrednie wywolanie '{name}' "
                "poza warstwa wiazania FaultScenario"
            )

    return violations


def main() -> int:
    violations: list[str] = []

    if not BACKEND_SRC.exists():
        print(f"FAIL: Backend source directory not found: {BACKEND_SRC}")
        print("A guard that cannot reach its scan root is a false green — fix the path.")
        return 1

    scanned = 0
    for py_file in sorted(BACKEND_SRC.rglob("*.py")):
        scanned += 1
        violations.extend(check_file(py_file))

    print(f"Scanned {scanned} Python file(s) under {BACKEND_SRC}.")

    if scanned == 0:
        print("FAIL: Empty scan — 0 files inspected. An empty guard proves nothing.")
        return 1

    if violations:
        print("FAIL: Direct fault parameter usage detected outside whitelisted modules:")
        for violation in sorted(violations):
            print(violation)
        print(f"\n{len(violations)} violation(s) found.")
        print("Use FaultScenario domain objects instead of raw fault parameters.")
        return 1

    print("PASS: No direct fault parameter violations found.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
