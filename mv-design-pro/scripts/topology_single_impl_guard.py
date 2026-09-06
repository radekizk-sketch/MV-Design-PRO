#!/usr/bin/env python3
"""Guard: jedna implementacja algorytmów topologii sieci (CV-4.3, konstytucja C.2.2).

Składowe spójne, union-find, przegląd wszerz/w głąb po elementach sieci wolno
implementować WYŁĄCZNIE w ``backend/src/network_model/core/topologia.py`` (DOM).
Każde inne miejsce w ``backend/src`` liczące topologię samo — kolejka BFS
(``deque(``/``.pop(0)`` na kolejce), ``networkx`` (``connected_components``,
``is_connected``, ``node_connected_component``, ``shortest_path``, ``has_path``,
``bfs_*``, ``dfs_*``), własny union-find (klasa ``*UnionFind``/``*Unia*``, para metod
``find``+``union``) — jest drugą prawdą o tym, co jest jedną szyną i co jest zasilone.

ZAPADKA W OBIE STRONY (``ZASTANE``): wzrost = dług urósł (czerwony), spadek = obniż
zapadkę (czerwony, żeby pomiar nie kłamał). Docelowo ``ZASTANE`` jest puste —
pozostałe wpisy to sieci referencyjne kasowane w CV-4.3 (K2).
ALLOWLIST (nie liczona, z powodem): zamrożony rdzeń solvera (B-01).
"""

from __future__ import annotations

import ast
import sys
from collections import Counter
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_SRC = PROJECT_ROOT / "backend" / "src"

DOM = "network_model/core/topologia.py"
ALLOWLIST: dict[str, str] = {
    "network_model/solvers/power_flow_newton_internal.py": (
        "rdzeń solvera FROZEN (B-01): własny przegląd wszerz od slacka wewnątrz "
        "wykonawcy NR — zmiana wymaga pakietu dowodowego właściciela"
    ),
    "network_model/solvers/power_flow_unbalanced.py": (
        "rdzeń solvera FROZEN (B-01): kolejka przeglądu w solverze niesymetrycznym — "
        "zmiana wymaga pakietu dowodowego właściciela"
    ),
}
#: Pomiar 2026-09-05 (po przepięciu ybus/graph/walidatora/energizacji/topology_ops/
#: route/segment_decomposition/layout/czas_wylaczenia/graph_view/trunk na jądro):
#: zostały wyłącznie sieci referencyjne przeznaczone do kasacji (CV-4.3 K2).
ZASTANE: dict[str, dict[str, int]] = {
    "application/reference_networks/sld_network_model.py": {"deque": 1},
    "application/reference_networks/sld_substrate_power_flow.py": {"nx.connected_components": 1},
}

NX_FUNKCJE = {
    "connected_components",
    "is_connected",
    "node_connected_component",
    "shortest_path",
    "has_path",
}
NX_PREFIKSY = ("bfs_", "dfs_")


def _nazwa_atrybutu(node: ast.Call) -> tuple[str | None, str | None]:
    funkcja = node.func
    if isinstance(funkcja, ast.Attribute):
        obiekt = funkcja.value
        return (obiekt.id if isinstance(obiekt, ast.Name) else None), funkcja.attr
    if isinstance(funkcja, ast.Name):
        return None, funkcja.id
    return None, None


def zlicz_wzorce(tree: ast.AST) -> dict[str, int]:
    """Wzorce przeglądu grafu w drzewie AST: ``deque`` (kolejka BFS), ``kolejka.pop(0)``,
    ``nx.<funkcja topologiczna>``, klasa union-find, para metod ``find``+``union``."""
    licznik: Counter[str] = Counter()
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            obiekt, nazwa = _nazwa_atrybutu(node)
            if nazwa == "deque":
                licznik["deque"] += 1
            elif (
                obiekt == "nx" and nazwa and (nazwa in NX_FUNKCJE or nazwa.startswith(NX_PREFIKSY))
            ):
                licznik[f"nx.{nazwa}"] += 1
            elif (
                nazwa == "pop"
                and obiekt
                and ("queue" in obiekt.lower() or "kolejka" in obiekt.lower())
                and node.args
                and isinstance(node.args[0], ast.Constant)
                and node.args[0].value == 0
            ):
                licznik["kolejka.pop(0)"] += 1
        elif isinstance(node, ast.ClassDef):
            if "unionfind" in node.name.lower() or "unia" in node.name.lower():
                licznik["union-find"] += 1
            else:
                metody = {n.name for n in node.body if isinstance(n, ast.FunctionDef)}
                if {"find", "union"} <= metody:
                    licznik["union-find"] += 1
    return dict(sorted(licznik.items()))


def zmierz(korzen: Path = BACKEND_SRC) -> dict[str, dict[str, int]]:
    pomiar: dict[str, dict[str, int]] = {}
    for plik in sorted(korzen.rglob("*.py")):
        wzgledna = plik.relative_to(korzen).as_posix()
        if wzgledna == DOM or wzgledna in ALLOWLIST:
            continue
        try:
            tree = ast.parse(plik.read_text(encoding="utf-8"))
        except SyntaxError:
            continue
        licznik = zlicz_wzorce(tree)
        if licznik:
            pomiar[wzgledna] = licznik
    return pomiar


def porownaj_z_zapadka(
    pomiar: dict[str, dict[str, int]], zapadka: dict[str, dict[str, int]]
) -> list[str]:
    bledy: list[str] = []
    for plik, licznik in sorted(pomiar.items()):
        zastane = zapadka.get(plik)
        if zastane is None:
            bledy.append(
                f"[dlug-urosl] {plik}: {licznik} — własna topologia poza {DOM}; użyj jądra"
            )
            continue
        for nazwa, ile in licznik.items():
            if ile > zastane.get(nazwa, 0):
                bledy.append(f"[dlug-urosl] {plik}: {nazwa} {zastane.get(nazwa, 0)} -> {ile}")
            elif ile < zastane.get(nazwa, 0):
                bledy.append(
                    f"[dlug-zmalal] {plik}: {nazwa} {zastane.get(nazwa, 0)} -> {ile} — obniż ZASTANE"
                )
        for nazwa in zastane:
            if nazwa not in licznik:
                bledy.append(f"[dlug-zmalal] {plik}: {nazwa} 0 konstrukcji — usuń wpis z ZASTANE")
    for plik in sorted(zapadka):
        if plik not in pomiar:
            bledy.append(f"[dlug-zmalal] {plik}: 0 konstrukcji — usuń wpis z ZASTANE")
    return bledy


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    if not (BACKEND_SRC / DOM).exists():
        print(f"BLAD: brak jądra topologii {DOM}")
        return 1
    pomiar = zmierz()
    razem = sum(sum(v.values()) for v in pomiar.values())
    print(
        f"topology_single_impl_guard: {len(pomiar)} plikow poza {DOM}, {razem} wzorcow "
        f"(zapadka {sum(sum(v.values()) for v in ZASTANE.values())})"
    )
    if "--pomiar" in argv:
        for plik, licznik in sorted(pomiar.items()):
            print(f"  {plik}: {licznik}")
    bledy = porownaj_z_zapadka(pomiar, ZASTANE)
    if bledy:
        print("NARUSZENIA:")
        for blad in bledy:
            print("  " + blad)
        return 1
    print("OK: jedna implementacja topologii (zapadka zgodna z pomiarem).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
