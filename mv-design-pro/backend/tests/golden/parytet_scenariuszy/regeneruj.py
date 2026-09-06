#!/usr/bin/env python3
"""Regeneracja ``zlote_hashe.json`` — URUCHAMIANA ŚWIADOMIE, nigdy automatycznie.

ZMIANA ZŁOTEGO HASHA WYMAGA DOWODU SEMANTYCZNEGO W COMMICIE.

Ten harness istnieje po to, żeby udowodnić PARYTET wyników sześciu rodzin
analiz (D1-D6) między stanem SPRZED i PO migracji na ``apply_scenario``
(karta PARITY-CV3). Jeśli po zmianie kodu produkcyjnego ten skrypt zmienia
choćby jeden hash, to migracja NIE zachowała parytetu — commit wprowadzający
taką zmianę musi wyjaśnić PO CO wynik miał się zmienić (np. świadoma korekta
defektu, nie efekt uboczny migracji), inaczej cofnij zmianę kodu, nie hash.

Uruchomienie (z katalogu ``backend``):
    PYTHONPATH=$PWD python tests/golden/parytet_scenariuszy/regeneruj.py
"""

from __future__ import annotations

import json
import time
from pathlib import Path

from tests.golden.parytet_scenariuszy.harness import zbierz_hashe

_PLIK_ZLOTYCH_HASHY = Path(__file__).parent / "zlote_hashe.json"


def main() -> None:
    start = time.monotonic()
    hashe = zbierz_hashe()
    czas_s = time.monotonic() - start

    tresc = json.dumps(hashe, sort_keys=True, indent=2, ensure_ascii=False) + "\n"
    _PLIK_ZLOTYCH_HASHY.write_text(tresc, encoding="utf-8")

    print(f"Zapisano {len(hashe)} hashy do {_PLIK_ZLOTYCH_HASHY} (bieg harnessu: {czas_s:.2f} s).")
    print(
        "UWAGA: zmiana złotego hasha wymaga dowodu semantycznego w commicie "
        "(dlaczego wynik MIAŁ się zmienić) — nie uruchamiaj tego skryptu, żeby "
        "'naprawić' czerwony test parytetu bez takiego dowodu."
    )


if __name__ == "__main__":
    main()
