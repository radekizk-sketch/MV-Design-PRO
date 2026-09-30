#!/usr/bin/env python3
"""ScAuthorityGuard — każde wejście konsumujące wielkości zwarciowe dla
zdolności ZALEŻNEJ od wkładu falownikowego przechodzi przez `wymagaj_autorytetu`
(`network_model.core.autorytet_wyniku_zwarciowego`) — karta S-2 AUTORYTET,
`docs/plan/SYNTEZA_DOMKNIECIA_PRODUKTU_2026-09.md` §0 p. 4-5.

OBEJŚCIE, KTÓRE TA KARTA ZAMYKA (zmierzone na HEAD `c307e95f` przed kartą):
`POST /api/equipment-proof/pack` z `required_fault_results` wypełnionym
liczbami z powietrza i `run_id` wskazującym bieg, którego nigdy nie było,
wytwarzało kompletny pakiet dowodowy — dla 12,5 kA i dla 999 kA jednakowo.
Ten guard pilnuje, żeby TA KLASA obejścia nie wróciła: ani przez zapomnienie
wywołania bramki w nowym kodzie, ani przez nowego konsumenta zbudowanego obok
zamkniętej listy poniżej.

TRZY KONTROLE, AST (nie regex tekstowy — komentarz albo docstring z nazwą
funkcji przechodziłby regex, nic by nie chronił):

1. Pliki z ZAMKNIĘTEJ listy `PLIKI_Z_BRAMKA_AUTORYTETU` MUSZĄ faktycznie
   WYWOŁYWAĆ `wymagaj_autorytetu` (`ast.Call`, nie tylko import).
2. Pliki z ZAMKNIĘTEJ listy `PLIKI_TRASY_HTTP` MUSZĄ importować most
   `wejscie_zwarciowe_z_biegu` albo `wejscie_koordynacji_z_biegow`
   (`application.autorytet_biegu_zwarciowego`) — dowód, że wielkości
   zwarciowe wchodzące do żądania są czytane z ZAPISANEGO BIEGU, nie z
   żądania wprost.
3. ŻADEN plik w `backend/src` POZA `KONSTRUKTORZY_WEJSCIA_ZDOLNOSCI_ZALEZNEJ`
   (zamknięta lista, dokładnie te same dwa pliki co (2)) nie konstruuje
   `EquipmentProofInput(...)` ani `CoordinationInput(...)` — oba typy niosą
   wejście zdolności zależnych od wkładu zwarciowego
   (`network_model.core.zdolnosci_wkladu_zwarciowego.
   ZDOLNOSCI_ZALEZNE_OD_WKLADU_ZWARCIOWEGO`: `BREAKING_CAPACITY_SELECTION`,
   `SC_WITHSTAND_EVIDENCE`, `PROTECTION_COORDINATION`). Nowy konstruktor poza
   listą = nowy konsument, którego ten guard jeszcze nie zna — FAIL-CLOSED,
   nie ciche przepuszczenie (dokładnie klasa błędu, którą ten guard ma łapać).

Self-test: `scripts/test_sc_authority_guard.py`.
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_SRC = REPO_ROOT / "backend" / "src"

#: Zamknięta lista: pliki, które MUSZĄ wywoływać `wymagaj_autorytetu`
#: (network_model.core.autorytet_wyniku_zwarciowego) — jedyny wykonywalny
#: punkt autoryzacji wyniku zwarciowego dla zdolności zależnych.
PLIKI_Z_BRAMKA_AUTORYTETU: tuple[str, ...] = (
    "application/equipment_proof/proof_pack.py",
    "api/protection_coordination.py",
)

#: Zamknięta lista: trasy HTTP, które MUSZĄ czytać wielkości zwarciowe z
#: ZAPISANEGO BIEGU (`application.autorytet_biegu_zwarciowego`), nigdy z
#: żądania wprost.
PLIKI_TRASY_HTTP: tuple[str, ...] = (
    "api/equipment_proof_pack.py",
    "api/protection_coordination.py",
)

#: Zamknięta lista: JEDYNE pliki wolne konstruować `EquipmentProofInput`/
#: `CoordinationInput` (typy niosące wejście zdolności zależnych od wkładu
#: zwarciowego falownika). Dokładnie ten sam zbiór co `PLIKI_TRASY_HTTP` —
#: to są trasy, które te typy budują z mostu autorytetu.
KONSTRUKTORZY_WEJSCIA_ZDOLNOSCI_ZALEZNEJ: frozenset[str] = frozenset(PLIKI_TRASY_HTTP)

#: Nazwy konstruktorów (klas) niosących wejście zdolności zależnej od wkładu
#: zwarciowego falownika. Lista ZAMKNIĘTA — nowy typ wejścia dopisywany tu
#: świadomie, razem z wpisem w `network_model.core.zdolnosci_wkladu_
#: zwarciowego.ZDOLNOSCI_ZALEZNE_OD_WKLADU_ZWARCIOWEGO`.
NAZWY_KONSTRUKTOROW_WEJSCIA: frozenset[str] = frozenset(
    {"EquipmentProofInput", "CoordinationInput"}
)

MOST_AUTORYTETU_NAZWY: frozenset[str] = frozenset(
    {"wejscie_zwarciowe_z_biegu", "wejscie_koordynacji_z_biegow"}
)


def _wczytaj_ast(sciezka: Path) -> ast.Module | None:
    try:
        return ast.parse(sciezka.read_text(encoding="utf-8"), filename=str(sciezka))
    except (SyntaxError, OSError):
        return None


def _wywoluje_funkcje(drzewo: ast.Module, nazwa: str) -> bool:
    """Czy drzewo AST zawiera WYWOŁANIE funkcji o tej nazwie (nie tylko import)."""
    for wezel in ast.walk(drzewo):
        if not isinstance(wezel, ast.Call):
            continue
        func = wezel.func
        if isinstance(func, ast.Name) and func.id == nazwa:
            return True
        if isinstance(func, ast.Attribute) and func.attr == nazwa:
            return True
    return False


def _importuje_ktoras(drzewo: ast.Module, nazwy: frozenset[str]) -> bool:
    for wezel in ast.walk(drzewo):
        if isinstance(wezel, ast.ImportFrom):
            for alias in wezel.names:
                if alias.name in nazwy:
                    return True
        if isinstance(wezel, ast.Import):
            for alias in wezel.names:
                if alias.name.split(".")[-1] in nazwy:
                    return True
    return False


def _konstruowane_typy(drzewo: ast.Module) -> set[str]:
    """Nazwy klas konstruowanych w tym module (``Nazwa(...)`` gdziekolwiek)."""
    znalezione: set[str] = set()
    for wezel in ast.walk(drzewo):
        if not isinstance(wezel, ast.Call):
            continue
        func = wezel.func
        if isinstance(func, ast.Name) and func.id in NAZWY_KONSTRUKTOROW_WEJSCIA:
            znalezione.add(func.id)
        elif isinstance(func, ast.Attribute) and func.attr in NAZWY_KONSTRUKTOROW_WEJSCIA:
            znalezione.add(func.attr)
    return znalezione


def main() -> int:
    if not BACKEND_SRC.is_dir():
        print(f"BŁĄD [ScAuthorityGuard]: katalog {BACKEND_SRC} nie istnieje.")
        return 1

    naruszenia: list[str] = []

    # Kontrola 1: bramka autorytetu FAKTYCZNIE wywołana (nie tylko zaimportowana).
    for wzgledna in PLIKI_Z_BRAMKA_AUTORYTETU:
        sciezka = BACKEND_SRC / wzgledna
        if not sciezka.is_file():
            naruszenia.append(f"{wzgledna}: plik z zamkniętej listy nie istnieje")
            continue
        drzewo = _wczytaj_ast(sciezka)
        if drzewo is None:
            naruszenia.append(f"{wzgledna}: nie udało się sparsować AST")
            continue
        if not _wywoluje_funkcje(drzewo, "wymagaj_autorytetu"):
            naruszenia.append(
                f"{wzgledna}: nie wywołuje `wymagaj_autorytetu` — wejście zdolności "
                "zależnej od wkładu zwarciowego może przejść bez sprawdzenia proweniencji"
            )

    # Kontrola 2: trasy HTTP czytają wielkości zwarciowe z ZAPISANEGO BIEGU.
    for wzgledna in PLIKI_TRASY_HTTP:
        sciezka = BACKEND_SRC / wzgledna
        if not sciezka.is_file():
            naruszenia.append(f"{wzgledna}: plik z zamkniętej listy nie istnieje")
            continue
        drzewo = _wczytaj_ast(sciezka)
        if drzewo is None:
            naruszenia.append(f"{wzgledna}: nie udało się sparsować AST")
            continue
        if not _importuje_ktoras(drzewo, MOST_AUTORYTETU_NAZWY):
            naruszenia.append(
                f"{wzgledna}: nie importuje mostu `application.autorytet_biegu_zwarciowego` "
                f"({'/'.join(sorted(MOST_AUTORYTETU_NAZWY))}) — wielkości zwarciowe mogą "
                "wchodzić do decyzji miarodajnej wprost z żądania"
            )

    # Kontrola 3: żaden konstruktor wejścia zdolności zależnej poza zamkniętą listą.
    for sciezka in sorted(BACKEND_SRC.rglob("*.py")):
        wzgledna = sciezka.relative_to(BACKEND_SRC).as_posix()
        drzewo = _wczytaj_ast(sciezka)
        if drzewo is None:
            continue
        typy = _konstruowane_typy(drzewo)
        if typy and wzgledna not in KONSTRUKTORZY_WEJSCIA_ZDOLNOSCI_ZALEZNEJ:
            naruszenia.append(
                f"{wzgledna}: konstruuje {', '.join(sorted(typy))} spoza zamkniętej listy "
                "`KONSTRUKTORZY_WEJSCIA_ZDOLNOSCI_ZALEZNEJ` — nowy konsument wejścia "
                "zdolności zależnej od wkładu zwarciowego musi przejść przez most "
                "autorytetu (dopisz plik świadomie do obu list w tym guardzie i do "
                "`application.autorytet_biegu_zwarciowego`)"
            )

    if naruszenia:
        print("BŁĄD [ScAuthorityGuard]: granica autorytetu wyniku zwarciowego naruszona.")
        for n in naruszenia:
            print(f"  - {n}")
        return 1

    print(
        "OK [ScAuthorityGuard]: wszystkie wejścia zdolności zależnych od wkładu "
        "zwarciowego przechodzą przez most autorytetu i wywołują wymagaj_autorytetu."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
