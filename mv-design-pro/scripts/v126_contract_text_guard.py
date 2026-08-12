#!/usr/bin/env python3
"""CI guard: kontrakt tekstowy V12.6 (kanon akademicki NC RfG/PTPiREE).

Wydobyty z `scripts/verify_v12_6.py` (karta SUITA-BEZ-WYWOLANIA, 2026-08-12):
agregator 254 linii wolal ten sam sprawdzian jako `_check_v126_contract_text`,
ale sam agregator nigdy nie stal w zadnym workflow CI
(`grep -rn "verify_v12_6" .github/workflows/` = 0 trafien) — wiec sprawdzian
nigdy sie nie wykonywal. Ta sama klasa defektu co reszta karty: suita
weryfikacyjna bez wywolania.

Sprawdza, ze pliki kontraktowe V12.6 (solver akademicki + testy NC RfG/PTPiREE
+ dokumenty kanonu) NIE zawieraja fragmentow tekstu swiadczacych o
niedokonczonej pracy (TODO, FIXME, placeholder, stub, fake, OPF-lite) ani
mojibake UTF-8 typowego dla zlego przekodowania (Â, Ĺ, Ä, Ă, â).

Brakujacy plik z listy ponizej jest bledem tego guarda (RC=1), nie cichym
pominieciem — dokladnie ten wzorzec (agregator wskazujacy nieistniejacy plik)
byl przedmiotem karty, ktora ten guard wydzielila.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# UWAGA: `frontend/src/ui/workspace/surfaces/V126AcademicSurface.tsx` byl na
# tej liscie w skasowanym `verify_v12_6.py`, ale NIGDY nie istnial w repo
# (zweryfikowane: `find frontend/src -iname "*v126*"` = tylko pliki ponizej).
# Nie fabrykujemy pliku ani wpisu, ktoremu nie odpowiada zaden byt — usuniety
# z zasiegu tego guarda; dlug nazwany w meldunku karty SUITA-BEZ-WYWOLANIA.
V126_CONTRACT_FILES: tuple[Path, ...] = (
    ROOT / "backend/src/api/v126_academic.py",
    ROOT / "backend/src/api/ncrfg_ptpiree_tests.py",
    ROOT / "backend/src/application/v126_artifacts.py",
    ROOT / "backend/src/network_model/solvers/ncrfg_ptpiree/contracts.py",
    ROOT / "backend/src/network_model/solvers/ncrfg_ptpiree/engine.py",
    ROOT / "backend/src/network_model/solvers/v126_academic.py",
    ROOT / "backend/src/solver_input/v126_contracts.py",
    ROOT / "frontend/src/ui/ncrfg-tests/api.ts",
    ROOT / "frontend/src/ui/workspace/surfaces/NcRfgTestsTab.tsx",
    ROOT / "docs/analysis/NC_RFG_PTPiREE_TESTY_KANON.md",
    ROOT / "docs/v12xx/KANON_V12_6_PROFESORSKI.md",
)

V126_FORBIDDEN_TEXT: tuple[str, ...] = (
    "TODO",
    "FIXME",
    "placeholder",
    "stub",
    "fake",
    "OPF-lite",
    "Â",
    "Ĺ",
    "Ä",
    "Ă",
    "â",
)


def _display(path: Path) -> str:
    """Sciezka wzgledem ROOT, a gdy to niemozliwe (np. fixtura testowa poza
    repo) — sciezka bezwzgledna. `Path.relative_to` rzuca ValueError zamiast
    zwrocic cos uzytecznego, wiec guard nie moze wolac go bez zabezpieczenia."""
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def run() -> int:
    missing: list[str] = []
    violations: list[str] = []

    for path in V126_CONTRACT_FILES:
        if not path.exists():
            missing.append(_display(path))
            continue
        text = path.read_text(encoding="utf-8")
        for forbidden in V126_FORBIDDEN_TEXT:
            if forbidden in text:
                violations.append(f"{_display(path)} contains forbidden text fragment: {forbidden}")

    if missing:
        print(
            "v126_contract_text_guard: kontraktowe pliki V12.6 nie istnieja:",
            file=sys.stderr,
        )
        for path in missing:
            print(f"  - {path}", file=sys.stderr)

    if violations:
        print(
            "v126_contract_text_guard: znaleziono zakazane fragmenty tekstu:",
            file=sys.stderr,
        )
        for violation in violations:
            print(f"  - {violation}", file=sys.stderr)

    if missing or violations:
        return 1

    print("v126_contract_text_guard: OK")
    return 0


if __name__ == "__main__":
    sys.exit(run())
