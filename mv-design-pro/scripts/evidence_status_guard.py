#!/usr/bin/env python3
"""EVIDENCE STATUS GUARD — zakaz literałów "reportable"/"complete" poza rejestrem.

Karta S-1 (W6-0, `SYNTEZA_DOMKNIECIA_PRODUKTU_2026-09.md` A-2/A-6): przed tą
kartą `_execute_dynamic_stability` (`enm/canonical_analysis.py`) wpisywał
``proof_status="complete"`` / ``reporting_status="reportable"`` NA SZTYWNO dla
wyniku o zdolności bez ustalonej poprawności fizycznej — dowód regulacyjny
bez bezpiecznika. Naprawa: te dwie wartości muszą być WYPROWADZANE z rejestru
dowodowego (``solver_input.provenance.classify_dynamic_capability`` +
``solver_input.dowod_ncrfg.ocena_dowodowa_biegu``), nie zaszyte jako stała.

Guard AST-owy (nie grep — precyzja jak `backend_no_physics_guard.py`): skanuje
``backend/src/**/*.py`` (poza `network_model/solvers/**`, FROZEN B-01 —
osobno rządzone; solvery MOGĄ nieść własne stałe statusy w kontrakcie, poza
zakresem tego guarda) za literałami ``"reportable"``/``"complete"``
przypisanymi do klucza/parametru ``reporting_status``/``proof_status``, w
dwóch postaciach:

1. słownik literal: ``{"reporting_status": "reportable", ...}``;
2. wywołanie z argumentem nazwanym: ``Klasa(reporting_status="reportable")``,
   również gdy wartością jest wyrażenie warunkowe ``"reportable" if … else …``
   (np. ``reporting_status = "reportable" if solution.converged else …``).

Każde trafienie musi leżeć w funkcji z LISTY DOZWOLONYCH MIEJSC (ZAMKNIĘTA,
pilnowana — patrz ``_ALLOWLIST`` niżej) z jednozdaniowym uzasadnieniem
merytorycznym w kodzie. Miejsce poza listą = naruszenie. Wpis na liście, który
guard NIE znajduje w kodzie (funkcja usunięta/przemianowana), jest RÓWNIEŻ
naruszeniem — lista nie może zawierać martwych wpisów (nie maskuje regresji).

Usage:
  python scripts/evidence_status_guard.py

Exit codes:
  0 — brak naruszeń
  1 — naruszenia znalezione
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_SRC = PROJECT_ROOT / "backend" / "src"

#: Całe drzewo solverów FROZEN jest poza zakresem (B-01) — osobno rządzone,
#: literały statusu w kontraktach solvera nie są tym samym ryzykiem (solver
#: nie interpretuje wyniku jako dowód regulacyjny, tylko go oblicza).
_EXCLUDED_PREFIX = "network_model/solvers/"

_BANNED_VALUES: dict[str, str] = {
    "reporting_status": "reportable",
    "proof_status": "complete",
}

#: Lista ZAMKNIĘTA i pilnowana (karta S-1 §0.6). Każdy wpis: (ścieżka względem
#: backend/src, nazwa funkcji, jednozdaniowe uzasadnienie). Dodanie wpisu
#: wymaga uzasadnienia merytorycznego w commicie — to nie jest poczekalnia.
_ALLOWLIST: tuple[tuple[str, str, str], ...] = (
    (
        "enm/canonical_analysis.py",
        "_short_circuit_reportability",
        "Wynik statyczny z solvera FROZEN IEC 60909 (biały ślad, dane kompletne) — "
        "zwarcie 3-fazowe, nie zdolność dynamiczna/normatywna.",
    ),
    (
        "enm/canonical_analysis.py",
        "_execute_phase_state_sn",
        "Wynik statyczny z FROZEN PhaseStateSNSolver (rzeczywiste obliczenie stanu "
        "fazowego), nie deklaracja ani zdolność dynamiczna.",
    ),
    (
        "enm/canonical_analysis.py",
        "_execute_short_circuit",
        "Wynik statyczny (poziom biegu) z solvera FROZEN IEC 60909 — jak wyżej.",
    ),
    (
        "enm/canonical_analysis.py",
        "_execute_power_flow",
        "Wartość WARUNKOWA na rzeczywistej fladze zbieżności solvera FROZEN "
        "(`solution.converged`), nie stała bezwarunkowa.",
    ),
    (
        "enm/canonical_analysis.py",
        "_execute_dynamic_stability",
        "Wartość WYPROWADZONA z rejestru dowodowego "
        "(`classify_dynamic_capability('dynamic_stability.fault_clear')."
        "regulatory_evidence_eligible`) — karta S-1, koniec tautologii.",
    ),
    (
        "solver_input/dowod_ncrfg.py",
        "_ocena_modulu",
        "To JEST rejestr — funkcja oceniająca zgodnie z EvidenceTier per moduł "
        "(brak ograniczeń ⇒ reportable/complete jest WNIOSKIEM klasyfikacji).",
    ),
    (
        "solver_input/dowod_ncrfg.py",
        "ocena_dowodowa_biegu",
        "To JEST rejestr — agregacja ocen modułów (wszystkie reportable/complete "
        "⇒ bieg reportable/complete), jedno źródło prawdy karty S-1.",
    ),
)


class _FunctionTracker(ast.NodeVisitor):
    """Odwiedza drzewo AST, śledząc najbliższą OBEJMUJĄCĄ funkcję (nazwaną)."""

    def __init__(self, rel_path: str) -> None:
        self.rel_path = rel_path
        self._stack: list[str] = []
        self.violations: list[str] = []
        self.hits: set[tuple[str, str]] = set()

    def _current_function(self) -> str | None:
        return self._stack[-1] if self._stack else None

    def _report(self, node: ast.AST, key: str, value: str) -> None:
        func = self._current_function()
        if func is None:
            location = f"{self.rel_path}:{node.lineno}"
            self.violations.append(
                f"  {location}: '{key}': '{value}' poza jakąkolwiek funkcją nazwaną"
            )
            return
        self.hits.add((self.rel_path, func))
        allowed = any(path == self.rel_path and fn == func for path, fn, _reason in _ALLOWLIST)
        if not allowed:
            location = f"{self.rel_path}:{node.lineno}"
            self.violations.append(
                f"  {location} w funkcji '{func}': '{key}': '{value}' poza rejestrem "
                "dozwolonych miejsc"
            )

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:  # noqa: N802
        self._stack.append(node.name)
        self.generic_visit(node)
        self._stack.pop()

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:  # noqa: N802
        self._stack.append(node.name)
        self.generic_visit(node)
        self._stack.pop()

    def visit_Dict(self, node: ast.Dict) -> None:  # noqa: N802
        for key_node, value_node in zip(node.keys, node.values, strict=False):
            if not isinstance(key_node, ast.Constant) or not isinstance(key_node.value, str):
                continue
            key = key_node.value
            banned = _BANNED_VALUES.get(key)
            if banned is None:
                continue
            if isinstance(value_node, ast.Constant) and value_node.value == banned:
                self._report(value_node, key, banned)
        self.generic_visit(node)

    def _check_value_for_key(self, key: str, value_node: ast.expr) -> None:
        banned = _BANNED_VALUES.get(key)
        if banned is None:
            return
        target = value_node
        # Wyrażenie warunkowe: sprawdzamy GAŁĄŹ, która mogłaby wyprodukować
        # wartość zakazaną bezwarunkowo — `"reportable" if x else …` LUB
        # `… if x else "reportable"` — obie gałęzie warte sprawdzenia, bo obie
        # są literałem w kodzie źródłowym (nawet jeśli warunkowo osiągalne).
        candidates: list[ast.expr] = []
        if isinstance(target, ast.IfExp):
            candidates.extend([target.body, target.orelse])
        else:
            candidates.append(target)
        for candidate in candidates:
            if isinstance(candidate, ast.Constant) and candidate.value == banned:
                self._report(candidate, key, banned)

    def visit_Call(self, node: ast.Call) -> None:  # noqa: N802
        for kw in node.keywords:
            if kw.arg is not None:
                self._check_value_for_key(kw.arg, kw.value)
        self.generic_visit(node)

    def _target_name(self, target: ast.expr) -> str | None:
        if isinstance(target, ast.Name):
            return target.id
        if isinstance(target, ast.Attribute):
            return target.attr
        return None

    def visit_Assign(self, node: ast.Assign) -> None:  # noqa: N802
        for target in node.targets:
            name = self._target_name(target)
            if name in _BANNED_VALUES:
                self._check_value_for_key(name, node.value)
        self.generic_visit(node)

    def visit_AnnAssign(self, node: ast.AnnAssign) -> None:  # noqa: N802
        if node.value is not None:
            name = self._target_name(node.target)
            if name in _BANNED_VALUES:
                self._check_value_for_key(name, node.value)
        self.generic_visit(node)


def scan_source(source: str, rel_path: str) -> tuple[list[str], set[tuple[str, str]]]:
    """Skanuj TEKST źródła (bez dysku) — rdzeń logiki, używany też przez testy."""
    try:
        tree = ast.parse(source, filename=rel_path)
    except SyntaxError:
        return [], set()
    tracker = _FunctionTracker(rel_path)
    tracker.visit(tree)
    return tracker.violations, tracker.hits


def _scan_file(path: Path) -> tuple[list[str], set[tuple[str, str]]]:
    rel_path = path.relative_to(BACKEND_SRC).as_posix()
    try:
        source = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return [], set()
    return scan_source(source, rel_path)


def main() -> int:
    if not BACKEND_SRC.exists():
        print(
            f"WARNING: {BACKEND_SRC} nie istnieje — nic do sprawdzenia.",
            file=sys.stderr,
        )
        return 0

    violations: list[str] = []
    all_hits: set[tuple[str, str]] = set()
    for py_file in sorted(BACKEND_SRC.rglob("*.py")):
        rel = py_file.relative_to(BACKEND_SRC).as_posix()
        if rel.startswith(_EXCLUDED_PREFIX):
            continue
        file_violations, hits = _scan_file(py_file)
        violations.extend(file_violations)
        all_hits |= hits

    stale = [
        f"  {path}::{func} — {reason}"
        for path, func, reason in _ALLOWLIST
        if (path, func) not in all_hits
    ]

    if violations or stale:
        print("=" * 70, file=sys.stderr)
        print("EVIDENCE STATUS GUARD: NARUSZENIA", file=sys.stderr)
        print("=" * 70, file=sys.stderr)
        if violations:
            print(file=sys.stderr)
            print(
                f"Literał 'reportable'/'complete' poza rejestrem dozwolonych miejsc "
                f"({len(violations)}):",
                file=sys.stderr,
            )
            for v in violations:
                print(v, file=sys.stderr)
        if stale:
            print(file=sys.stderr)
            print(
                "Martwe wpisy allowlisty (funkcja usunięta/przemianowana — "
                f"usuń wpis z _ALLOWLIST, {len(stale)}):",
                file=sys.stderr,
            )
            for s in stale:
                print(s, file=sys.stderr)
        print(file=sys.stderr)
        print(
            "Fix: wyprowadź reporting_status/proof_status z "
            "solver_input.provenance.classify_dynamic_capability (albo "
            "solver_input.dowod_ncrfg.ocena_dowodowa_biegu dla NC RfG), albo "
            "dodaj miejsce do _ALLOWLIST z jednozdaniowym uzasadnieniem "
            "(wynik statyczny z solvera FROZEN z kompletnymi danymi).",
            file=sys.stderr,
        )
        return 1

    print(
        "evidence-status-guard: OK "
        f"({len(_ALLOWLIST)} dozwolonych miejsc, 0 naruszeń, 0 martwych wpisów)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
