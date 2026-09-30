#!/usr/bin/env python3
"""Dynamika Import Boundary Guard (karta W6-2 SS0 p.1).

Bramka CI dla granicy importow pakietu `network_model/solvers/dynamika/**`.
Cala logika (allowlista, rozstrzyganie importow wzglednych) zyje w
`scripts/dynamika_granica_importow.py` — ten plik jest wylacznie powloka
wywolania, zeby ta sama regula obowiazywala tu i w `solver_boundary_guard.py`
bez drugiej kopii listy.

Self-test z czerwona iniekcja: `scripts/test_dynamika_granica_importow_guard.py`.
"""

from __future__ import annotations

import sys

from dynamika_granica_importow import raport


def main() -> int:
    liczba_plikow, naruszenia = raport()
    if liczba_plikow == 0:
        print(
            "BLAD [DynamikaImportBoundaryGuard]: pakiet dynamiki nie ma ani jednego pliku — "
            "pusty skan nie jest sukcesem."
        )
        return 1
    if naruszenia:
        print("BLAD [DynamikaImportBoundaryGuard]: granica importow rdzenia dynamiki naruszona:")
        for naruszenie in naruszenia:
            print(f"  - {naruszenie}")
        return 1
    print(
        f"OK [DynamikaImportBoundaryGuard]: {liczba_plikow} plikow rdzenia dynamiki, "
        "0 naruszen granicy importow."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
