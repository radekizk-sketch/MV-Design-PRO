#!/usr/bin/env python3
"""NO_MODULE ZERO GUARD — `no_module` przestaje istnieć jako stan (karta S-4, W6-0).

Karta S-4 (`SYNTEZA_DOMKNIECIA_PRODUKTU_2026-09.md` A-7): przed tą kartą
`calculation_readiness/service.py` liczył `no_module` jako gotowość
(`all(s in ("ready","n_a","no_module")) → ready`) i literał żył w 21 miejscach
`backend/src` + 13 `frontend/src` (poza testami) — ZASADA NR 1 (CLAUDE.md)
zakazuje `no_module` jako namiastki zdolności.

Ten guard pilnuje ZAMKNIĘTEJ listy miejsc, gdzie literał `no_module` WOLNO
wystąpić (patrz `_ALLOWLIST` — prefiksy ścieżek, nie linie: to wystarczająca
granulacja dla literału stanu, którego jedyna dozwolona rola to FROZEN
kontrakt solvera albo jawny punkt tłumaczenia na granicy aplikacyjnej):

1. **Kontrakty solverów FROZEN** (B-01, NIE DOTKNIĘTE tą kartą):
   `network_model/solvers/stability_rms/**`, `network_model/solvers/frt_hvrt/**`.
2. **`application/ncrfg_compliance/checker.py`** — kasacja odroczona do karty
   S-3 (jeden tor NC RfG); jego `no_module` w `NcRfgComplianceVerdict` ZOSTAJE
   do tego czasu. Jego bezpośredni odbiorcy — `api/ncrfg_ptpiree_tests.py`
   (pole `no_module_count`, relacja nazwy pola, nie osobna decyzja) i
   `frontend/src/ui/ncrfg-tests/api.ts` (ten sam kontrakt po stronie FE) —
   są tym samym odroczeniem, nie osobnym naruszeniem.
3. **Adapter granicy aplikacyjnej** (S-4, właściwy przedmiot tej karty):
   `application/analyses/frt_trajektorie.py` i `.../frt_sekwencja.py` — JEDYNE
   miejsca, które WOLNO ZAMIENIĆ status solvera FRT `no_module` na `blocked`
   z nazwanym kodem gotowości (`der.dynamic_profile_missing`); literał tu jest
   punktem tłumaczenia, nie przepuszczeniem.

Skan: `backend/src/**/*.py` i `frontend/src/**/*.{ts,tsx}` (poza testami —
`__tests__/`, `*.test.ts(x)`, `*.spec.ts(x)` — literał w teście dokumentujący
STARY kontrakt / negatywny test guarda nie jest tym samym ryzykiem co literał
produkcyjny). Wzorzec: PODCIĄG `no_module` (jak `grep no_module` z karty S-4
§6 — łapie też `no_module_reason_pl`/`no_module_count`, pochodne nazwy pól
tej samej rodziny, nie tylko dokładny literał stanu).

Usage:
  python scripts/no_module_zero_guard.py

Exit codes:
  0 — brak naruszeń
  1 — naruszenia znalezione
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_SRC = PROJECT_ROOT / "backend" / "src"
FRONTEND_SRC = PROJECT_ROOT / "frontend" / "src"

_TOKEN = re.compile(r"no_module")

#: Lista ZAMKNIĘTA (karta S-4 §0.7) — prefiksy ścieżek WZGLĘDEM `backend/src`
#: albo `frontend/src`, gdzie literał `no_module` wolno wystąpić. Rozszerzenie
#: wymaga uzasadnienia merytorycznego w commicie, nigdy „żeby przeszło".
_ALLOWLIST_BACKEND: tuple[str, ...] = (
    "network_model/solvers/stability_rms/",
    "network_model/solvers/frt_hvrt/",
    "application/ncrfg_compliance/checker.py",
    "api/ncrfg_ptpiree_tests.py",
    "application/analyses/frt_trajektorie.py",
    "application/analyses/frt_sekwencja.py",
)
_ALLOWLIST_FRONTEND: tuple[str, ...] = ("ui/ncrfg-tests/api.ts",)

_TEST_MARKERS: tuple[str, ...] = ("__tests__/", ".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx")


def _is_allowlisted(rel_path: str, allowlist: tuple[str, ...]) -> bool:
    return any(rel_path == entry or rel_path.startswith(entry) for entry in allowlist)


def _is_frontend_test(rel_path: str) -> bool:
    return any(marker in rel_path for marker in _TEST_MARKERS)


def _scan_tree(root: Path, suffixes: tuple[str, ...]) -> list[Path]:
    if not root.exists():
        return []
    return [p for p in sorted(root.rglob("*")) if p.is_file() and p.suffix in suffixes]


def scan() -> tuple[list[str], list[str]]:
    """Zwróć (naruszenia, martwe_wpisy_allowlisty)."""
    violations: list[str] = []
    backend_hits: set[str] = set()
    frontend_hits: set[str] = set()

    for py_file in _scan_tree(BACKEND_SRC, (".py",)):
        rel = py_file.relative_to(BACKEND_SRC).as_posix()
        try:
            content = py_file.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        if not _TOKEN.search(content):
            continue
        if _is_allowlisted(rel, _ALLOWLIST_BACKEND):
            backend_hits.add(next(e for e in _ALLOWLIST_BACKEND if rel == e or rel.startswith(e)))
            continue
        for line_num, line in enumerate(content.split("\n"), start=1):
            if _TOKEN.search(line):
                violations.append(f"  backend/src/{rel}:{line_num}: {line.strip()[:120]}")

    for ts_file in _scan_tree(FRONTEND_SRC, (".ts", ".tsx")):
        rel = ts_file.relative_to(FRONTEND_SRC).as_posix()
        if _is_frontend_test(rel):
            continue
        try:
            content = ts_file.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        if not _TOKEN.search(content):
            continue
        if _is_allowlisted(rel, _ALLOWLIST_FRONTEND):
            frontend_hits.add(
                next(e for e in _ALLOWLIST_FRONTEND if rel == e or rel.startswith(e))
            )
            continue
        for line_num, line in enumerate(content.split("\n"), start=1):
            if _TOKEN.search(line):
                violations.append(f"  frontend/src/{rel}:{line_num}: {line.strip()[:120]}")

    stale: list[str] = []
    # Wpisy-prefiksy katalogów (stability_rms/, frt_hvrt/) nie muszą mieć
    # dokładnego dopasowania pliku-po-pliku — sprawdzamy tylko wpisy PLIKÓW
    # (nie kończące się na "/"), które muszą realnie zawierać literał.
    for entry in _ALLOWLIST_BACKEND:
        if entry.endswith("/"):
            continue
        if entry not in backend_hits:
            stale.append(f"  backend/src/{entry}")
    for entry in _ALLOWLIST_FRONTEND:
        if entry not in frontend_hits:
            stale.append(f"  frontend/src/{entry}")

    return violations, stale


def main() -> int:
    violations, stale = scan()
    if violations or stale:
        print("=" * 70, file=sys.stderr)
        print("NO_MODULE ZERO GUARD: NARUSZENIA", file=sys.stderr)
        print("=" * 70, file=sys.stderr)
        if violations:
            print(file=sys.stderr)
            print(f"Literał 'no_module' poza dozwolonymi miejscami ({len(violations)}):", file=sys.stderr)
            for v in violations:
                print(v, file=sys.stderr)
        if stale:
            print(file=sys.stderr)
            print(
                "Martwe wpisy allowlisty (literał już nie występuje — usuń wpis, "
                f"{len(stale)}):",
                file=sys.stderr,
            )
            for s in stale:
                print(s, file=sys.stderr)
        print(file=sys.stderr)
        print(
            "Fix: `no_module` nie jest już statusem gotowości (ZASADA NR 1). Brak "
            "modelu numerycznego = `blocked` z nazwanym kodem gotowości "
            "(`der.dynamic_profile_missing`), mapowany na granicy aplikacyjnej — "
            "patrz application/analyses/frt_trajektorie.py.",
            file=sys.stderr,
        )
        return 1

    print(
        "no-module-zero-guard: OK "
        f"({len(_ALLOWLIST_BACKEND)} backend + {len(_ALLOWLIST_FRONTEND)} frontend "
        "dozwolonych miejsc, 0 naruszeń, 0 martwych wpisów)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
