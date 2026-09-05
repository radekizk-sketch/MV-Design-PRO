#!/usr/bin/env python3
"""Guard JEDNEGO assemblera wejścia solvera (karta CV-4.1, konstytucja C.2.3).

Przepływ ``migawka ENM → IR (NetworkGraph) → kontrakt wejścia solvera`` ma DOKŁADNIE
jednego producenta: ``backend/src/enm/assembler.py``. Pomiar CV-4.0 (2026-09-05)
znalazł 41 konstrukcji kontraktów wejścia w 13 niezależnych „assemblerach" — każdy
z osobna budował slack, PQ/PV, opcje, każdy z osobna mógł pominąć źródło albo
podstawić wartość. Ten guard mierzy WYWOŁANIA konstruktorów kontraktów wejścia
(AST, nie grep — komentarze i docstringi się nie liczą) w ``backend/src`` poza
domem assemblera i wiąże je zapadką w OBIE strony: przyrost = czerwony (nowy
budowniczy równoległy), spadek = czerwony z poleceniem obniżenia zapadki
(utrwalenie kasacji z kart CV-4.2/CV-4.3). Docelowo ``ZASTANE`` jest puste.

ZASIĘG: ``backend/src/**/*.py``.
DOM (nie liczony): ``enm/assembler.py``.
ALLOWLIST (nie liczona, z powodem): ``network_model/solvers/power_flow_gauss_seidel.py`` —
rdzeń FROZEN (B-01); buduje ``PowerFlowInput`` fallbacku GS→NR z pól ISTNIEJĄCEGO
``pf_input`` przekazanego przez assembler, nie z modelu (pomiar CV-4.0 A2).

EXIT CODES: 0 = zgodne z zapadką, 1 = naruszenie. ``--pomiar`` wypisuje pomiar.
"""

from __future__ import annotations

import ast
import sys
from collections import Counter
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_SRC = PROJECT_ROOT / "backend" / "src"

#: Konstruktory kontraktów wejścia solvera (rozpływ: ``power_flow_types``; zwarcie:
#: ``solver_input/contracts.py``). ``ShortCircuitInput`` celowo NIE jest na liście —
#: to DTO kreatora sieci (``network_wizard/dtos.py``), nie kontrakt solvera (pomiar
#: CV-4.0 §1.3.3); ginie razem z kreatorem w CV-4.2.
NAZWY: tuple[str, ...] = (
    "PowerFlowInput",
    "ShortCircuitPayload",
    "LoadFlowPayload",
    "PQSpec",
    "SlackSpec",
    "PVSpec",
    "ShuntSpec",
)

DOM = "enm/assembler.py"

ALLOWLIST: dict[str, str] = {
    "network_model/solvers/power_flow_gauss_seidel.py": (
        "rdzeń FROZEN (B-01): fallback GS→NR buduje PowerFlowInput z pól istniejącego "
        "pf_input podanego przez assembler, nie z modelu"
    ),
    # Karta CV-4.2 (K5, K6): P11/S7, kontrakt LOCKED v1.1 (`solver_input/contracts.py`).
    # `build_solver_input` nie składa już WŁASNEGO grafu/slacka/PQ/PV równolegle do
    # assemblera — wywołujący (`api/solver_input.py::_graph_for_analysis`) buduje graf
    # PRZEZ `enm.assembler.zloz_wejscie_rozplywu`/`zloz_wejscie_zwarcia` (ten sam tor co
    # bieg kanoniczny), a ta funkcja WYPEŁNIA kontrakt `LoadFlowPayload`/`ShortCircuitPayload`
    # z JUŻ ZMONTOWANEGO przez assembler grafu — dokładnie ten sam wzorzec co
    # `power_flow_gauss_seidel.py` wyżej (konstrukcja z pól podanych przez assembler, nie
    # z modelu). Kontrakt sam pozostaje odrębny od `PowerFlowInput`/`ShortCircuitPayload`
    # (rodziny `network_model.solvers.power_flow_types`) z definicji — LOCKED, FROZEN,
    # zmiana kształtu wymaga bumpu wersji, więc konstruktor nie może przenieść się DO
    # `enm/assembler.py` bez naruszenia tej granicy (i bez konfliktu z równoległą kartą
    # A3-04 edytującą ten sam plik — K7).
    "solver_input/builder.py": (
        "kontrakt LOCKED v1.1 (P11/S7) wypełniany z grafu zmontowanego PRZEZ "
        "zloz_wejscie_rozplywu/zloz_wejscie_zwarcia (wywołane przez api/solver_input.py), "
        "nie z modelu równolegle do assemblera"
    ),
}

#: Zapadka w OBIE strony — pomiar 2026-09-05 na stanie po wycięciu assemblera
#: (CV-4.1 krok 1) i po kasacji kreatora/P5/P12 + przepięciu P11 na assembler
#: (CV-4.2). Jedyne pozostałe wpisy: substraty sieci referencyjnych
#: (`application/reference_networks/**`, CV-4.3 — benchmarki jako ENM).
ZASTANE: dict[str, dict[str, int]] = {
    "application/reference_networks/frozen_solver_input.py": {
        "PQSpec": 2,
        "PVSpec": 1,
        "PowerFlowInput": 1,
        "ShuntSpec": 1,
        "SlackSpec": 1,
    },
    "application/reference_networks/sld_substrate_power_flow.py": {
        "PQSpec": 1,
        "PowerFlowInput": 1,
        "SlackSpec": 1,
    },
    "application/reference_networks/station_archetype_substrate.py": {
        "PQSpec": 3,
        "PowerFlowInput": 2,
        "SlackSpec": 2,
    },
}


def _nazwa_wywolania(node: ast.Call) -> str | None:
    funkcja = node.func
    if isinstance(funkcja, ast.Name):
        return funkcja.id
    if isinstance(funkcja, ast.Attribute):
        return funkcja.attr
    return None


def zlicz_konstrukcje(tree: ast.AST) -> dict[str, int]:
    """Liczba WYWOŁAŃ konstruktorów kontraktów wejścia (nazwa → liczba) w drzewie AST."""
    licznik: Counter[str] = Counter()
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            nazwa = _nazwa_wywolania(node)
            if nazwa in NAZWY:
                licznik[nazwa] += 1
    return dict(sorted(licznik.items()))


def zmierz(korzen: Path = BACKEND_SRC) -> dict[str, dict[str, int]]:
    """Pomiar per plik (ścieżka względem ``backend/src``), bez domu i bez allowlisty."""
    pomiar: dict[str, dict[str, int]] = {}
    for plik in sorted(korzen.rglob("*.py")):
        wzgledna = plik.relative_to(korzen).as_posix()
        if wzgledna == DOM or wzgledna in ALLOWLIST:
            continue
        try:
            tree = ast.parse(plik.read_text(encoding="utf-8"))
        except SyntaxError:
            continue
        liczby = zlicz_konstrukcje(tree)
        if liczby:
            pomiar[wzgledna] = liczby
    return pomiar


def porownaj_z_zapadka(
    pomiar: dict[str, dict[str, int]], zastane: dict[str, dict[str, int]]
) -> list[str]:
    bledy: list[str] = []
    for plik in sorted(set(pomiar) | set(zastane)):
        d = pomiar.get(plik, {})
        z = zastane.get(plik, {})
        if plik not in zastane:
            bledy.append(
                f"[dlug-urosl] {plik}: nowy budowniczy wejścia solvera poza assemblerem "
                f"{d} — użyj enm.assembler.zloz_wejscie_rozplywu/zloz_wejscie_zwarcia"
            )
            continue
        if plik not in pomiar:
            bledy.append(f"[dlug-zmalal] {plik}: 0 konstrukcji — usuń wpis z ZASTANE")
            continue
        for nazwa in sorted(set(d) | set(z)):
            if d.get(nazwa, 0) > z.get(nazwa, 0):
                bledy.append(
                    f"[dlug-urosl] {plik}: {nazwa} {z.get(nazwa, 0)} -> {d.get(nazwa, 0)} — "
                    "konstrukcja kontraktu wejścia poza assemblerem"
                )
            elif d.get(nazwa, 0) < z.get(nazwa, 0):
                bledy.append(
                    f"[dlug-zmalal] {plik}: {nazwa} {z.get(nazwa, 0)} -> {d.get(nazwa, 0)} — "
                    f"obniż ZASTANE do {d.get(nazwa, 0)}"
                )
    return bledy


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    pomiar = zmierz()
    if "--pomiar" in args:
        for plik, liczby in pomiar.items():
            print(f"{plik}: {liczby}")
        return 0
    razem = sum(sum(v.values()) for v in pomiar.values())
    print(
        f"solver_input_assembler_guard: {len(pomiar)} plikow z konstrukcjami poza "
        f"{DOM}, {razem} konstrukcji (zapadka {sum(sum(v.values()) for v in ZASTANE.values())})"
    )
    bledy = porownaj_z_zapadka(pomiar, ZASTANE)
    if bledy:
        print(f"FAILED: {len(bledy)} naruszen zapadki assemblera:")
        for blad in bledy:
            print(f"  {blad}")
        return 1
    print("OK: kontrakty wejscia solvera budowane zgodnie z zapadka CV-4.1.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
