#!/usr/bin/env python3
"""Regeneracja ``zlote_hashe.json`` parytetu assemblera — URUCHAMIANA ŚWIADOMIE.

ZMIANA ZŁOTEGO HASHA WYMAGA DOWODU SEMANTYCZNEGO W COMMICIE (karta CV-4.1:
wycięcie assemblera ma zachować wynik bit w bit; jedyna dopuszczalna zmiana to
świadoma korekta fizyki wejścia — np. A3-04, PV z modelu — z uzasadnieniem
per sieć, nigdy „naprawa" czerwonego testu regeneracją).

Uruchomienie (z katalogu ``backend``):
    PYTHONPATH=$PWD python tests/golden/parytet_assemblera/regeneruj.py
"""

from __future__ import annotations

import json
import time
from pathlib import Path

from tests.golden.parytet_assemblera.harness import zbierz_hashe

_PLIK_ZLOTYCH_HASHY = Path(__file__).parent / "zlote_hashe.json"


def main() -> None:
    start = time.monotonic()
    hashe = zbierz_hashe()
    czas_s = time.monotonic() - start
    tresc = json.dumps(hashe, sort_keys=True, indent=2, ensure_ascii=False) + "\n"
    _PLIK_ZLOTYCH_HASHY.write_text(tresc, encoding="utf-8")
    odmowy = sum(1 for w in hashe.values() if w["odmowa"] is not None)
    print(
        f"Zapisano {len(hashe)} wpisów ({odmowy} odmów) do {_PLIK_ZLOTYCH_HASHY} "
        f"(bieg harnessu: {czas_s:.1f} s)."
    )


if __name__ == "__main__":
    main()
