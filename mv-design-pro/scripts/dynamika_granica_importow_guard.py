#!/usr/bin/env python3
"""Dynamika Import Boundary Guard (karta W6-2 SS0 p.1).

Bramka CI dla granicy importow pakietu `network_model/solvers/dynamika/**`.
Cala logika (allowlista i jej zastosowanie) zyje w
`scripts/dynamika_granica_importow.py`, a rozwiazywanie importow wzglednych — w
`scripts/importy_ast.py` (jedno zrodlo prawdy wszystkich bramek importow). Ten plik
jest wylacznie powloka wywolania, zeby ta sama regula obowiazywala tu i w
`solver_boundary_guard.py` bez drugiej kopii listy.

Self-test z czerwona iniekcja: `scripts/test_dynamika_granica_importow_guard.py` (na KOPII
pakietu w katalogu tymczasowym — katalog skanu jest pierwszym argumentem wywolania).

EXIT CODES: 0 = granica nienaruszona; 1 = naruszenie albo pusty skan.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from dynamika_granica_importow import KATALOG_PAKIETU, raport  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    argumenty = sys.argv[1:] if argv is None else argv
    katalog = Path(argumenty[0]) if argumenty else KATALOG_PAKIETU
    liczba_plikow, naruszenia = raport(katalog)
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
