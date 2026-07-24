#!/usr/bin/env python3
"""SolverBoundaryGuard — blokuje PR-y LF modyfikujące solvery SC/Protection.

Sprawdza git diff i failuje jeśli dotknięte są chronione pliki solverów.

SANKCJE (2026-07-22): zmiana chronionego pliku jest dopuszczalna WYŁĄCZNIE
z jawną sankcją w SANCTIONED_CHANGES (ścieżka -> wpis rejestru V12K-*
z uzasadnieniem). Guard pozostaje czerwony dla każdej nieusankcjonowanej
zmiany — sankcja jest audytowalna i punktowa, nie wyłącza ochrony.
"""
import subprocess
import sys

WATCHED_PATHS = [
    "backend/src/network_model/solvers/short_circuit_iec60909.py",
    "backend/src/network_model/solvers/short_circuit_iec60909_internal.py",
    "backend/src/network_model/solvers/short_circuit_contributions.py",
    "backend/src/domain/protection_engine_v1.py",
]

# Usankcjonowane zmiany chronionych plików na bieżącej gałęzi programu
# (docs/v12xx/REJESTR_KONFLIKTOW.md). Wpis usuwamy po scaleniu do main.
SANCTIONED_CHANGES = {
    "backend/src/network_model/solvers/short_circuit_iec60909.py": (
        "V12K-120: FIX pre-existing (wymiar wektora iniekcji w "
        "_build_branch_contributions_for_inverters dla scalonych wezlow) "
        "+ test regresyjny; dowod addytywnosci to_dict testem. "
        "V12K-128: delta FROZEN zatwierdzona przez wlasciciela - z1/z2/z0 "
        "addytywnie. "
        "V12K-132: rozszerzenie WHITE BOX wkladow galeziowych o tor Thevenina "
        "(rozplyw pradu od zrodla zastepczego po galeziach) - pkt 7 karty "
        "wlasciciela; addytywnie (branch_flow_trace + wpisy source_id="
        "'THEVENIN_GRID'), wpis do usuniecia po scaleniu do main. "
        "V12K-178 (SM-1): korekcja K_T IEC 60909 par. 3.3.3 dla TR sieciowych, "
        "twarde wg decyzji wlasciciela V12K-175, WHITE BOX + re-baseline "
        "goldenow z dowodem; wpis do usuniecia po scaleniu do main. "
        "V12K-184: FIX pre-existing - wklad zrodel przeksztaltnikowych (IEC "
        "60909-0 par. 6.8, zrodlo pradowe) wchodzil do zwarcia 1:1 w amperach, "
        "bez przeniesienia przez przekladnie ani podzialu Z-bus; parametr "
        "fault_node_id byl przyjmowany i ignorowany. Skutek: 15 mikrozrodel "
        "0,4 kV dawalo 21,5 kA na szynie 15 kV. Naprawa: I_k = I_j*|Z_kj/Z_kk|"
        "*(U_j/U_k), zero heurystyk, WHITE BOX. Przy okazji naprawione "
        "mieszanie jednostek pu/SI w torze wkladow galeziowych falownikow "
        "(iniekcja jednostkowa + _series_admittance_pu). Dla zrodla W wezle "
        "zwarcia wspolczynnik = 1 -> bit-identycznosc. Wpis do usuniecia po "
        "scaleniu do main."
    ),
    "backend/src/network_model/solvers/power_flow_newton_internal.py": (
        "V12K-180 (SM-2): przesuniecie fazowe grupy polaczen w PF, twarde wg "
        "V12K-175, WHITE BOX + re-baseline katow goldenow z dowodem |V| "
        "niezmienione; wpis do usuniecia po scaleniu do main."
    ),
    "backend/src/domain/protection_engine_v1.py": (
        "V12K-174: WYLACZNIE formatowanie black (parentezacja przypisan "
        "f-string w trace notes_pl) - zero zmian semantycznych, zero zmian "
        "AST poza stylem; pre-existing konflikt bramki black --check z "
        "ochrona pliku. Dowod: pelny pytest 6609 passed + "
        "trace_determinism_guard 0 na drzewie z ta zmiana. Wpis do "
        "usuniecia po scaleniu do main."
    ),
}

def get_changed_files() -> list[str]:
    try:
        result = subprocess.run(
            ["git", "diff", "--name-only", "origin/main...HEAD"],
            capture_output=True, text=True, check=True,
        )
        return [line.strip() for line in result.stdout.strip().split("\n") if line.strip()]
    except subprocess.CalledProcessError:
        result = subprocess.run(
            ["git", "diff", "--name-only", "HEAD~1"],
            capture_output=True, text=True, check=True,
        )
        return [line.strip() for line in result.stdout.strip().split("\n") if line.strip()]

def main() -> int:
    changed = get_changed_files()
    violations = []
    sanctioned = []
    for path in changed:
        for watched in WATCHED_PATHS:
            if path.endswith(watched) or watched in path:
                if watched in SANCTIONED_CHANGES:
                    sanctioned.append((path, SANCTIONED_CHANGES[watched]))
                else:
                    violations.append(path)

    for path, powod in sorted(set(sanctioned)):
        print(f"SANKCJA [SolverBoundaryGuard]: {path}")
        print(f"  {powod}")

    if violations:
        print("BŁĄD [SolverBoundaryGuard]: PR modyfikuje pliki solvera SC/Protection.")
        print("Zmienione pliki chronione:")
        for v in sorted(set(violations)):
            print(f"  - {v}")
        print()
        print("Load Flow PR NIE MOŻE modyfikować solverów zwarciowych ani zabezpieczeń.")
        return 1

    print("OK [SolverBoundaryGuard]: Brak zmian w chronionych plikach solverów.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
