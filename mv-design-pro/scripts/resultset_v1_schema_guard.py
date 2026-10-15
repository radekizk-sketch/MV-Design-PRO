#!/usr/bin/env python3
"""ResultSetContractGuard — chroni kontrakty ResultSet v1 SC/Protection przed zmianami.

Karta CV-3.3-A2 (2026-09-05): oba pliki ponizej maja dzis ZERO konsumenta
produkcyjnego w `src/` (jedynym wolajacym byl skasowany E3,
`application/execution_engine/**`) — mimo to ZOSTAJA zamrozone. Ich sasiad
`sc_binding_meta.py` (poza ta lista, ale tworzacy z nimi jedna testowana
pare w `tests/test_pr18_sc_integration.py::TestResultMapper`) rowniez
zostaje z tego samego powodu. Kasacja pliku chronionego przez ten guard to
edycja zamrozonego rdzenia (B-01, `CLAUDE.md`) — wymaga zgody wlasciciela,
nie tylko pomiaru „zero importera". Inwentarz pelnego znaleziska →
`docs/architecture/CONVERGENCE_ROADMAP.md` CV-3.3-A2.
"""
import sys

from guard_diff_base import zmienione_pliki

#: V12K-341 (OD-18, O-74 (2), 2026-09-30): oba mappery sa MARTWE (0 importerow; zywy
#: producent ResultSet v1 = canonical_run_to_resultset_v1.py) i maja sankcje kasacji
#: w karcie W3-A-DOMKNIECIE — kontrakt FROZEN to schemat (domain/result_contract_v1.py,
#: schemas/resultset_v1_schema.json), nie te adaptery. Lista znika razem z plikami.
PROTECTED_FILES = [
    "backend/src/application/result_mapping/short_circuit_to_resultset_v1.py",
    "backend/src/application/result_mapping/protection_to_resultset_v1.py",
]


def main() -> int:
    # Baza porownania z odpornego helpera: brak bazy => JAWNY blad, nigdy
    # ciche „nic sie nie zmienilo" (patrz scripts/guard_diff_base.py).
    wynik = zmienione_pliki()
    if not wynik.ok:
        print(wynik.powod_bledu)
        return 1
    changed = list(wynik.pliki or ())
    violations = []
    for path in changed:
        for protected in PROTECTED_FILES:
            if path.endswith(protected) or protected in path:
                violations.append(path)

    if violations:
        print("BŁĄD [ResultSetContractGuard]: Kontrakt ResultSet v1 został zmieniony.")
        print("Pliki chronione (zamrożone):")
        for v in sorted(set(violations)):
            print(f"  - {v}")
        print()
        print("Kontrakt SC/Protection ResultSet v1 jest zamrożony i NIE MOŻE być modyfikowany.")
        return 1

    print("OK [ResultSetContractGuard]: Kontrakty ResultSet v1 niezmienione.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
