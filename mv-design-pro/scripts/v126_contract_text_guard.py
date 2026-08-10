"""Zakaz atrap i błędnego kodowania w wiążących kontraktach V12.6."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATHS = (
    "backend/src/api/v126_academic.py",
    "backend/src/api/ncrfg_ptpiree_tests.py",
    "backend/src/application/v126_artifacts.py",
    "backend/src/network_model/solvers/ncrfg_ptpiree/contracts.py",
    "backend/src/network_model/solvers/ncrfg_ptpiree/engine.py",
    "backend/src/network_model/solvers/v126_academic.py",
    "backend/src/solver_input/v126_contracts.py",
    "frontend/src/ui/ncrfg-tests/api.ts",
    "frontend/src/ui/workspace/surfaces/NcRfgTestsTab.tsx",
    "frontend/src/ui/workspace/surfaces/V126AcademicSurface.tsx",
    "docs/analysis/NC_RFG_PTPiREE_TESTY_KANON.md",
    "docs/v12xx/KANON_V12_6_PROFESORSKI.md",
)
FORBIDDEN = ("TODO", "FIXME", "placeholder", "stub", "fake", "OPF-lite", "Â", "Ĺ", "Ä", "Ă", "â")


def check_contract_text(root: Path = ROOT, paths: tuple[str, ...] = CONTRACT_PATHS) -> list[str]:
    violations: list[str] = []
    for relative_path in paths:
        path = root / relative_path
        if not path.exists():
            violations.append(f"[v126-contract-missing] {relative_path}")
            continue
        text = path.read_text(encoding="utf-8")
        for forbidden in FORBIDDEN:
            if forbidden in text:
                violations.append(f"[v126-contract-text] {relative_path}: {forbidden}")
    return violations


def main() -> int:
    violations = check_contract_text()
    if violations:
        print("v126-contract-text-guard: BŁĄD")
        for violation in violations:
            print(f" - {violation}")
        return 1
    print("v126-contract-text-guard: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
