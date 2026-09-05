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

from tests.golden.parytet_assemblera.harness import wpis_do_zapisu, zbierz_hashe

_PLIK_ZLOTYCH_HASHY = Path(__file__).parent / "zlote_hashe.json"


def main() -> None:
    start = time.monotonic()
    hashe = zbierz_hashe()
    czas_s = time.monotonic() - start
    do_zapisu = {klucz: wpis_do_zapisu(wpis) for klucz, wpis in hashe.items()}
    tresc = json.dumps(do_zapisu, sort_keys=True, ensure_ascii=False, separators=(",", ":")) + "\n"
    _PLIK_ZLOTYCH_HASHY.write_text(tresc, encoding="utf-8")
    odmowy = sum(1 for w in hashe.values() if w["odmowa"] is not None)
    print(
        f"Zapisano {len(hashe)} wpisów ({odmowy} odmów, {len(tresc) // 1024} KiB) do "
        f"{_PLIK_ZLOTYCH_HASHY} (bieg harnessu: {czas_s:.1f} s)."
    )


if __name__ == "__main__":
    main()
