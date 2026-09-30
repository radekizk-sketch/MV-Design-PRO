#!/usr/bin/env python3
"""Dziedziny Import Boundary Guard (karta AB-H0 §0.1, decyzja O-45).

Bramka CI granicy importów pakietu-liścia `backend/src/dziedziny/**`. Cała logika
(allowlista, rozstrzyganie importów względnych) żyje w `scripts/dziedziny_granica_importow.py`
— ten plik jest wyłącznie powłoką wywołania.

Self-test z czerwonymi iniekcjami: `scripts/test_dziedziny_granica_importow_guard.py`.

EXIT CODES: 0 = granica nienaruszona; 1 = naruszenie albo pusty skan.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from dziedziny_granica_importow import KATALOG_PAKIETU, raport  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    argumenty = sys.argv[1:] if argv is None else argv
    katalog = Path(argumenty[0]) if argumenty else KATALOG_PAKIETU
    liczba_plikow, naruszenia = raport(katalog)
    if liczba_plikow == 0:
        print(
            "BLAD [DziedzinyImportBoundaryGuard]: pakiet `dziedziny` nie ma ani jednego pliku — "
            "pusty skan nie jest sukcesem."
        )
        return 1
    if naruszenia:
        print("BLAD [DziedzinyImportBoundaryGuard]: granica importów liścia `dziedziny` naruszona:")
        for naruszenie in naruszenia:
            print(f"  - {naruszenie}")
        return 1
    print(
        f"OK [DziedzinyImportBoundaryGuard]: {liczba_plikow} plików liścia `dziedziny`, "
        "0 naruszeń granicy importów."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
