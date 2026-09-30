#!/usr/bin/env python3
"""ResultSetContractGuard — chroni REALNY kontrakt ResultSet v1 i jedynego producenta.

Karta RESULTSET-MARTWE-MAPPERY (2026-09-30, zgoda B-01 w decyzji O-59): do tej pory
guard chronił WYŁĄCZNIE dwa martwe adaptery (`short_circuit_to_resultset_v1.py`,
`protection_to_resultset_v1.py` — 0 importerów w `src/` od kasacji E3 w CV-3.3-A2),
czyli nic z kontraktu, który naprawdę trafia do użytkownika. Kontrakt FROZEN to
schemat `ResultSetV1` (`domain/result_contract_v1.py` + `schemas/resultset_v1_schema.json`),
jego budowniczy (`domain/result_builder_v1.py`) i JEDYNY producent z biegu kanonicznego
(`application/result_mapping/canonical_run_to_resultset_v1.py`, konsumenci: końcówka
`api/result_contract_v1.py`, porównania ogólne/PF/zabezpieczeń, projekcja nN).

Dwie bramki:
1. Zmiana pliku z `PROTECTED_FILES` wobec bazy gałęzi = błąd, chyba że plik ma wpis
   w `SANCTIONED_CHANGES` z decyzją (rejestr `docs/v12xx/REJESTR_KONFLIKTOW.md`).
   Wpis zdejmujemy po scaleniu do `main`.
2. Wskrzeszenie martwych mapperów i drugiego silnika zabezpieczeń skasowanych w tej
   karcie (`check_resultset_dead_mappers_resurrection`, wzorzec W3-A): drugi mapper
   tego samego schematu to duplikat mechanizmu, nie rozszerzenie.
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

from guard_diff_base import zmienione_pliki

ROOT = Path(__file__).resolve().parents[1]
BACKEND_SRC_DIR = ROOT / "backend" / "src"

PROTECTED_FILES = [
    "backend/src/domain/result_contract_v1.py",
    "backend/src/domain/result_builder_v1.py",
    "backend/schemas/resultset_v1_schema.json",
    "backend/src/application/result_mapping/canonical_run_to_resultset_v1.py",
]

# Usankcjonowane zmiany chronionych plików na bieżącej gałęzi programu
# (docs/v12xx/REJESTR_KONFLIKTOW.md, wiersz RESULTSET-MARTWE-MAPPERY). Wpis usuwamy
# po scaleniu do main.
SANCTIONED_CHANGES = {
    "backend/src/application/result_mapping/canonical_run_to_resultset_v1.py": (
        "ODMOWA-DANYCH-422 (7f08ecea): odmowa dla biegu niezakonczonego jako "
        "OdmowaDanychError zamiast golego ValueError — typ bledu, zero zmian ksztaltu "
        "wyniku. RESULTSET-MARTWE-MAPPERY (O-59): V12S-011 — mapper wypelnia "
        "element_ref_id (== element_ref, gdy migawka ENM biegu zna ten ref_id, inaczej "
        "None); pole istnialo w schemacie, ale jedyny zywy producent go nie wypelnial. "
        "Schemat i model bit w bit. Wpis do usuniecia po scaleniu do main."
    ),
    "backend/src/domain/result_builder_v1.py": (
        "RESULTSET-MARTWE-MAPPERY (O-59): V12S-011 — budowniczy przenosi "
        "element_ref_id z wejscia do ElementResultV1 (brak klucza = None, jak w "
        "kontrakcie). Schemat i model bit w bit. Wpis do usuniecia po scaleniu do main."
    ),
}

# Skasowane w karcie RESULTSET-MARTWE-MAPPERY — ścieżka względem `backend/src`.
DEAD_RESULTSET_RELATIVE_PATHS: dict[str, str] = {
    "application/result_mapping/short_circuit_to_resultset_v1.py": (
        "drugi mapper ResultSet (zwarcia) bez konsumenta — duplikat jedynego producenta"
    ),
    "application/result_mapping/protection_to_resultset_v1.py": (
        "drugi mapper ResultSet (zabezpieczenia) bez konsumenta — duplikat jedynego producenta"
    ),
    "application/result_mapping/sc_binding_meta.py": (
        "wzbogacenie wyniku martwego mappera zwarć metadanymi wiazania"
    ),
    "domain/protection_engine_v1.py": (
        "drugi silnik zabezpieczen z wlasna petla IDMT — jedyna fizyka IDMT jest w "
        "network_model/solvers/protection_iec60255.py"
    ),
}
# Nazwy, które nie mogą wrócić jako DEFINICJA w `backend/src` (przeniesienie pliku pod
# inną nazwą to nadal wskrzeszenie).
FORBIDDEN_DEAD_RESULTSET_NAMES: frozenset[str] = frozenset(
    {
        "map_short_circuit_to_resultset_v1",
        "map_protection_to_resultset_v1",
        "wzbogac_resultset_o_meta_bindingu",
        "ShortCircuitBindingResult",
        "ProtectionResultSetV1",
        "execute_protection_v1",
        "ProtectionStudyInputV1",
        "RelayV1",
        "RelayResultV1",
        "IECCurveTypeV1",
        "iec_curve_time_seconds",
        "function_50_evaluate",
        "function_51_evaluate",
    }
)


def check_resultset_dead_mappers_resurrection(src_dir: Path | None = None) -> list[str]:
    """Pliki i definicje skasowane w karcie RESULTSET-MARTWE-MAPPERY nie wracają."""
    src_dir = BACKEND_SRC_DIR if src_dir is None else src_dir
    violations: list[str] = []
    for rel, label in DEAD_RESULTSET_RELATIVE_PATHS.items():
        if (src_dir / rel).exists():
            violations.append(f"[resurrected-module] backend/src/{rel}: {label}")
    if not src_dir.is_dir():
        violations.append(f"[brak-skanu] {src_dir} nie istnieje — pusty skan nie jest sukcesem")
        return violations
    for py_file in sorted(src_dir.rglob("*.py")):
        tree = ast.parse(py_file.read_text(encoding="utf-8"), filename=str(py_file))
        rel_path = py_file.relative_to(src_dir).as_posix()
        for node in ast.walk(tree):
            nazwa: str | None = None
            if isinstance(node, ast.ClassDef | ast.FunctionDef | ast.AsyncFunctionDef):
                nazwa = node.name
            elif isinstance(node, ast.Assign):
                nazwy = [t.id for t in node.targets if isinstance(t, ast.Name)]
                nazwa = next((n for n in nazwy if n in FORBIDDEN_DEAD_RESULTSET_NAMES), None)
            if nazwa in FORBIDDEN_DEAD_RESULTSET_NAMES:
                violations.append(
                    f"[resurrected-definition] backend/src/{rel_path}:{node.lineno}: {nazwa} "
                    "(martwy mapper/silnik ResultSet skasowany w RESULTSET-MARTWE-MAPPERY)"
                )
    return violations


def check_protected_changes(
    changed: list[str],
) -> tuple[list[str], list[tuple[str, str]]]:
    """Zmienione pliki chronione: (naruszenia, usankcjonowane)."""
    violations: list[str] = []
    sanctioned: list[tuple[str, str]] = []
    for path in changed:
        for protected in PROTECTED_FILES:
            if path.endswith(protected) or protected in path:
                if protected in SANCTIONED_CHANGES:
                    sanctioned.append((path, SANCTIONED_CHANGES[protected]))
                else:
                    violations.append(path)
    return violations, sanctioned


def main() -> int:
    kod = 0
    wskrzeszenia = check_resultset_dead_mappers_resurrection()
    if wskrzeszenia:
        print("BŁĄD [ResultSetContractGuard]: wskrzeszony martwy mapper/silnik ResultSet:")
        for v in wskrzeszenia:
            print(f"  - {v}")
        print("Jedynym producentem ResultSetV1 jest canonical_run_to_resultset_v1.py.")
        kod = 1

    # Baza porownania z odpornego helpera: brak bazy => JAWNY blad, nigdy
    # ciche „nic sie nie zmienilo" (patrz scripts/guard_diff_base.py).
    wynik = zmienione_pliki()
    if not wynik.ok:
        print(wynik.powod_bledu)
        return 1
    violations, sanctioned = check_protected_changes(list(wynik.pliki or ()))

    for path, powod in sorted(set(sanctioned)):
        print(f"SANKCJA [ResultSetContractGuard]: {path}")
        print(f"  {powod}")

    if violations:
        print("BŁĄD [ResultSetContractGuard]: Kontrakt ResultSet v1 został zmieniony.")
        print("Pliki chronione (zamrożone):")
        for v in sorted(set(violations)):
            print(f"  - {v}")
        print()
        print("Kontrakt ResultSet v1 jest zamrożony — zmiana wymaga wpisu SANCTIONED_CHANGES.")
        return 1

    if kod == 0:
        print("OK [ResultSetContractGuard]: kontrakt ResultSet v1 i jedyny producent nietknięte.")
    return kod


if __name__ == "__main__":
    sys.exit(main())
