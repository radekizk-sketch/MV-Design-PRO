#!/usr/bin/env python3
"""ResultSetContractGuard — chroni kontrakty ResultSet v1 SC/Protection przed zmianami."""
import sys

from guard_diff_base import zmienione_pliki

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
