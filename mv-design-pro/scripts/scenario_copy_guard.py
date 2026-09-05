#!/usr/bin/env python3
"""
CI Guard: scenario_copy_guard.py — karta CV-3.1 (2026-09-05).

Inwariant (docs/architecture/CANONICAL_TWIN_ARCHITECTURE.md §B.3, `enm/scenariusze.py`):
JEDYNYM miejscem kopii modelu do analizy z nadpisaniami jest
`enm.scenariusze.apply_scenario` (→ `EffectiveNetworkSnapshot`), JEDYNA fabryka biegu
wariantu w pamieci to `enm.canonical_analysis.bieg_wariantu`, a JEDYNY dyspozytor
wykonania to `wykonaj_bieg_w_pamieci` / `execute_run`. Rodziny analiz (kontyngencje
N-1, zdolnosc przylaczeniowa, obszar P-Q, odpowiedz OSD, dobor kompensacji, bieg
zbiorczy nastaw) robily to dotad SZESCIOMA prywatnymi drogami: kopia migawki biegu
bazowego → reczna mutacja slownika → `CanonicalRun(...)` w pamieci → prywatny
`_execute_power_flow` importowany wprost. Zaden z tych wariantow nie mial nazwy,
hasha ani proweniencji.

PO CO TA BRAMKA. Migracja rodzin na `apply_scenario` jest stranglerowa (rodzina po
rodzinie, z parytetem bit w bit — `tests/golden/parytet_scenariuszy/`). Bez bramki
nowa analiza (kopiuj-wklej z ktorejs zastanej) wchodzi do repo z siodma prywatna
droga, a dlug rosnie zamiast malec. Zapadka `ZASTANE` wiaze KONKRETNE zastane
miejsca; kazde nowe trafienie = czerwone CI; kazde zniknieciu trafienia = obowiazek
obnizenia zapadki (dlug ma malec JAWNIE, nie po cichu).

CO WYKRYWA (analiza skladni AST, nie dopasowanie tekstu) — cztery reguly:

  R1 IMPORT_PRYWATNY   — import `_execute_power_flow` / `_execute_short_circuit`
                         z `enm.canonical_analysis` (`from … import`, alias, albo
                         dostep atrybutowy `canonical_analysis._execute_power_flow`).
  R2 BIEG_W_PAMIECI    — konstrukcja `CanonicalRun(...)` poza fabryka
                         (`bieg_wariantu` / `create_run` w `enm/canonical_analysis.py`).
  R3 KOPIA_MIGAWKI     — `copy.deepcopy(<migawka>)` / `deepcopy(<migawka>)`, gdzie
                         argument jest nazwa/atrybutem zawierajacym `snapshot` albo
                         `migawk` (takze wewnatrz `x or {}` / `x if … else …`).
  R4 PLYTKA_KOPIA      — `nazwa = dict(<migawka>)`, po ktorej w tym samym zakresie
                         (funkcja/modul) jest zapis po indeksie na `nazwa`
                         (`nazwa[...] = …`) — plytka kopia POD MUTACJE. Sama
                         plytka kopia bez zapisu (obrona przed `None`, kopia do
                         odczytu) nie jest scenariuszem i nie jest trafieniem.

ZASIEG: `backend/src/application/**`, `backend/src/api/**`, `backend/src/enm/**`
z wylaczeniem `enm/scenariusze.py` (dom `apply_scenario`) i `enm/canonical_analysis.py`
(dom fabryk i dyspozytorow). Testy poza zasiegiem (testy pinuja prywatne funkcje
celowo, jako wyrocznie parytetu).

Uzycie: `python scripts/scenario_copy_guard.py` (RC 0 = zgodne z zapadka),
`--zmierz` wypisuje aktualny pomiar per plik (do przepisania zapadki).
"""

from __future__ import annotations

import ast
import sys
from collections import Counter
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
BACKEND_SRC = PROJECT_ROOT / "backend" / "src"

KORZENIE_SKANU = ("application", "api", "enm")
WYLACZONE = frozenset({"enm/scenariusze.py", "enm/canonical_analysis.py"})

MODUL_ANALIZY = "enm.canonical_analysis"
FUNKCJE_PRYWATNE = frozenset({"_execute_power_flow", "_execute_short_circuit"})
NAZWA_BIEGU = "CanonicalRun"
TOKENY_MIGAWKI = ("snapshot", "migawk")

R1, R2, R3, R4 = "R1", "R2", "R3", "R4"
OPISY = {
    R1: "import prywatnego wykonawcy z enm.canonical_analysis — uzyj wykonaj_bieg_w_pamieci",
    R2: "konstrukcja CanonicalRun poza fabryka — uzyj enm.canonical_analysis.bieg_wariantu",
    R3: "gleboka kopia migawki pod mutacje — uzyj enm.scenariusze.apply_scenario",
    R4: "plytka kopia migawki (dict) pod mutacje — uzyj enm.scenariusze.apply_scenario",
}

#: ZAPADKA zastanych trafien (pomiar 2026-09-05, przed migracja rodzin D1–D6).
#: Klucz: sciezka wzgledem `backend/src`; wartosc: liczba trafien per regula.
#: Obniz wpis, gdy rodzina przechodzi na apply_scenario; wpis zerowy usun.
ZASTANE: dict[str, dict[str, int]] = {
    "application/analyses/dobor_kompensacji.py": {R1: 1, R2: 1, R3: 1},
    "application/analyses/hosting_capacity.py": {R1: 1, R2: 1, R3: 1},
    "application/analyses/kontyngencje_n1.py": {R1: 1, R2: 1, R4: 1},
    "application/analyses/odpowiedz_osd.py": {R1: 1, R2: 1, R3: 1},
    "application/analyses/pq_area.py": {R1: 1, R2: 1, R3: 1},
    "application/protection_settings/batch_run.py": {R2: 2, R3: 2},
}


def _sciezka_kropkowana(expr: ast.expr) -> str:
    if isinstance(expr, ast.Name):
        return expr.id
    if isinstance(expr, ast.Attribute):
        rdzen = _sciezka_kropkowana(expr.value)
        return f"{rdzen}.{expr.attr}" if rdzen else expr.attr
    return ""


def _wyglada_na_migawke(expr: ast.expr) -> bool:
    """Czy wyrazenie adresuje migawke: nazwa/atrybut z tokenem migawki, takze
    schowany w `x or {}` / `x if c else y` / nawiasach."""
    if isinstance(expr, ast.BoolOp):
        return any(_wyglada_na_migawke(v) for v in expr.values)
    if isinstance(expr, ast.IfExp):
        return _wyglada_na_migawke(expr.body) or _wyglada_na_migawke(expr.orelse)
    nazwa = _sciezka_kropkowana(expr).lower()
    return any(token in nazwa for token in TOKENY_MIGAWKI)


def _nazwy_importow(tree: ast.AST) -> tuple[set[str], set[str], set[str]]:
    """(lokalne nazwy prywatnych wykonawcow, lokalne nazwy modulu analizy,
    lokalne nazwy klasy CanonicalRun) — z importow pliku."""
    prywatne: set[str] = set()
    moduly: set[str] = set()
    biegi: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module == MODUL_ANALIZY:
            for alias in node.names:
                if alias.name in FUNKCJE_PRYWATNE:
                    prywatne.add(alias.asname or alias.name)
                if alias.name == NAZWA_BIEGU:
                    biegi.add(alias.asname or alias.name)
        elif isinstance(node, ast.ImportFrom) and node.module == "enm":
            for alias in node.names:
                if alias.name == "canonical_analysis":
                    moduly.add(alias.asname or alias.name)
        elif isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name == MODUL_ANALIZY:
                    moduly.add(alias.asname or alias.name)
    return prywatne, moduly, biegi


def zbierz_naruszenia(tree: ast.AST) -> list[tuple[str, int, str]]:
    """Lista (regula, linia, opis) dla drzewa jednego pliku."""
    prywatne, moduly, biegi = _nazwy_importow(tree)
    naruszenia: list[tuple[str, int, str]] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module == MODUL_ANALIZY:
            for alias in node.names:
                if alias.name in FUNKCJE_PRYWATNE:
                    naruszenia.append((R1, node.lineno, f"import {alias.name}"))
        elif isinstance(node, ast.Attribute) and node.attr in FUNKCJE_PRYWATNE:
            if _sciezka_kropkowana(node.value) in moduly or _sciezka_kropkowana(
                node.value
            ).endswith("canonical_analysis"):
                naruszenia.append((R1, node.lineno, f"dostep {node.attr}"))
        elif isinstance(node, ast.Call):
            nazwa = _sciezka_kropkowana(node.func)
            if nazwa in biegi or (
                nazwa.endswith(f".{NAZWA_BIEGU}") and nazwa.split(".")[0] in moduly
            ):
                naruszenia.append((R2, node.lineno, f"{NAZWA_BIEGU}(...)"))
            elif nazwa in {"copy.deepcopy", "deepcopy"} and node.args:
                if _wyglada_na_migawke(node.args[0]):
                    naruszenia.append((R3, node.lineno, f"deepcopy({_opis(node.args[0])})"))
    naruszenia.extend(_plytkie_kopie_pod_mutacje(tree))
    naruszenia.sort(key=lambda n: (n[1], n[0]))
    return naruszenia


def _zakresy(tree: ast.AST) -> list[ast.AST]:
    """Modul i kazda funkcja (zakresy, w ktorych szukamy pary kopia→zapis)."""
    return [tree] + [
        n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef | ast.AsyncFunctionDef)
    ]


def _cialo_bez_zagniezdzonych_funkcji(zakres: ast.AST) -> list[ast.AST]:
    """Wezly zakresu bez wchodzenia do funkcji zagniezdzonych (te maja wlasny zakres)."""
    wynik: list[ast.AST] = []
    stos: list[ast.AST] = list(ast.iter_child_nodes(zakres))
    while stos:
        wezel = stos.pop()
        wynik.append(wezel)
        if isinstance(wezel, ast.FunctionDef | ast.AsyncFunctionDef | ast.Lambda):
            continue
        stos.extend(ast.iter_child_nodes(wezel))
    return wynik


def _plytkie_kopie_pod_mutacje(tree: ast.AST) -> list[tuple[str, int, str]]:
    trafienia: list[tuple[str, int, str]] = []
    for zakres in _zakresy(tree):
        wezly = _cialo_bez_zagniezdzonych_funkcji(zakres)
        kopie: dict[str, tuple[int, str]] = {}
        for wezel in wezly:
            if not isinstance(wezel, ast.Assign) or len(wezel.targets) != 1:
                continue
            cel, wartosc = wezel.targets[0], wezel.value
            if (
                isinstance(cel, ast.Name)
                and isinstance(wartosc, ast.Call)
                and _sciezka_kropkowana(wartosc.func) == "dict"
                and len(wartosc.args) == 1
                and not wartosc.keywords
                and _wyglada_na_migawke(wartosc.args[0])
            ):
                kopie[cel.id] = (wezel.lineno, f"dict({_opis(wartosc.args[0])})")
        if not kopie:
            continue
        mutowane: set[str] = set()
        for wezel in wezly:
            cele: list[ast.expr] = []
            if isinstance(wezel, ast.Assign):
                cele = list(wezel.targets)
            elif isinstance(wezel, ast.AugAssign | ast.AnnAssign):
                cele = [wezel.target]
            for cel in cele:
                if isinstance(cel, ast.Subscript) and isinstance(cel.value, ast.Name):
                    mutowane.add(cel.value.id)
        for nazwa, (linia, opis) in kopie.items():
            if nazwa in mutowane:
                trafienia.append((R4, linia, f"{nazwa} = {opis}; {nazwa}[...] = ..."))
    return trafienia


def _opis(expr: ast.expr) -> str:
    return ast.unparse(expr) if hasattr(ast, "unparse") else _sciezka_kropkowana(expr)


def pliki_w_zasiegu(src: Path = BACKEND_SRC) -> list[Path]:
    wynik: list[Path] = []
    for korzen in KORZENIE_SKANU:
        for plik in sorted((src / korzen).rglob("*.py")):
            if plik.relative_to(src).as_posix() in WYLACZONE:
                continue
            wynik.append(plik)
    return wynik


def zmierz(src: Path = BACKEND_SRC) -> dict[str, dict[str, int]]:
    """Pomiar per plik: {sciezka: {regula: liczba}} (tylko pliki z trafieniami)."""
    pomiar: dict[str, dict[str, int]] = {}
    for plik in pliki_w_zasiegu(src):
        tree = ast.parse(plik.read_text(encoding="utf-8"), filename=str(plik))
        naruszenia = zbierz_naruszenia(tree)
        if naruszenia:
            liczby = Counter(regula for regula, _, _ in naruszenia)
            pomiar[plik.relative_to(src).as_posix()] = {k: liczby[k] for k in sorted(liczby)}
    return pomiar


def porownaj_z_zapadka(
    pomiar: dict[str, dict[str, int]], zapadka: dict[str, dict[str, int]]
) -> list[str]:
    """Bledy zapadki: wzrost (nowe trafienie) I spadek (zapadka do obnizenia)."""
    bledy: list[str] = []
    for plik in sorted(set(pomiar) | set(zapadka)):
        zmierzone = pomiar.get(plik, {})
        dozwolone = zapadka.get(plik, {})
        for regula in sorted(set(zmierzone) | set(dozwolone)):
            z, d = zmierzone.get(regula, 0), dozwolone.get(regula, 0)
            if z > d:
                bledy.append(f"[dlug-urosl] {plik}: {regula} {d} -> {z} — {OPISY[regula]}")
            elif z < d:
                bledy.append(
                    f"[dlug-zmalal] {plik}: {regula} {d} -> {z} — obniz ZASTANE do {z}"
                    + (" (usun wpis)" if z == 0 else "")
                )
    return bledy


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    pomiar = zmierz()
    if "--zmierz" in args:
        for plik, liczby in pomiar.items():
            print(f"{plik}: {liczby}")
        return 0
    bledy = porownaj_z_zapadka(pomiar, ZASTANE)
    suma = sum(sum(v.values()) for v in pomiar.values())
    print(
        f"scenario_copy_guard: {len(pliki_w_zasiegu())} plikow w zasiegu, "
        f"{len(pomiar)} z trafieniami, {suma} trafien (zapadka "
        f"{sum(sum(v.values()) for v in ZASTANE.values())})"
    )
    if bledy:
        print(f"FAILED: {len(bledy)} naruszen zapadki kopii migawki:")
        for blad in bledy:
            print(f"  {blad}")
        return 1
    print("OK: kopie migawki i biegi wariantow zgodne z zapadka CV-3.1.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
