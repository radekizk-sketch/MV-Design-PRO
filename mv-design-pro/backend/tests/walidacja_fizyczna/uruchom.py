"""JEDNO WEJSCIE aparatu dowodowego — do uruchomienia z CZYSTEGO KLONU (R10 par. 34).

    poetry install --with dev
    poetry run python -m tests.walidacja_fizyczna.uruchom

Co robi, po kolei, i dlaczego akurat w tej kolejnosci:

1. BLOKADA SRODOWISKA — brak zaleznosci konczy bieg NATYCHMIAST i z nazwanym powodem.
   Gdyby szedl dalej, wszystkie pozniejsze „zielone" byly by warte tyle, co nic.
2. MANIFEST — sprawdzenie, ze kazde twierdzenie wskazuje istniejacy test i istniejaca
   mutacje. To jest bramka na fikcje w dokumencie, nie na fizyke.
3. BRAMKI FIZYCZNE — komplet G1-G13 wobec wyroczni analitycznej.
4. POZOSTALE TESTY PAKIETU — obserwable, zdarzenia, odpornosc numeryczna, mutacje.
5. PODSUMOWANIE — jeden werdykt i jeden kod wyjscia.

Czego tu NIE MA i dlaczego: eksperyment wobec ANDES (`andes/`) wymaga srodowiska z
wyrocznia zewnetrzna (wlasny pin `scipy`), wiec biegnie osobno — patrz `README.md`.
Manifest nazywa to wprost przy twierdzeniu D-09 i z tego powodu daje mu L4, nie L5.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from . import srodowisko

KORZEN_BACKENDU = Path(__file__).resolve().parents[2]


def _krok(nazwa: str, polecenie: list[str]) -> dict:
    proces = subprocess.run(polecenie, cwd=str(KORZEN_BACKENDU))
    return {"krok": nazwa, "polecenie": " ".join(polecenie), "kod": proces.returncode}


def main() -> int:
    stan = srodowisko.zbadaj()
    print(
        json.dumps(
            {
                "krok": "blokada srodowiska",
                "python": stan.python,
                "platforma": stan.platforma,
                "wersje": dict(stan.wersje),
                "brakujace": list(stan.brakujace),
                "wyrocznia_zewnetrzna_dostepna": srodowisko.wyrocznia_zewnetrzna_dostepna(),
            },
            indent=1,
            ensure_ascii=False,
        ),
        flush=True,
    )
    if not stan.kompletne:
        print(
            "WALIDACJA NIEWYKONANA / BRAK ZALEZNOSCI: " + ", ".join(stan.brakujace),
            file=sys.stderr,
        )
        return 2

    kroki = [
        _krok(
            "manifest dowodow",
            [sys.executable, "-m", "pytest", "tests/walidacja_fizyczna/test_manifest.py", "-q"],
        ),
        _krok(
            "bramki fizyczne G1-G13",
            [sys.executable, "-m", "pytest", "tests/walidacja_fizyczna/test_bramki.py", "-q"],
        ),
        _krok(
            "obserwable, zdarzenia, odpornosc, mutacje",
            [
                sys.executable,
                "-m",
                "pytest",
                "tests/walidacja_fizyczna",
                "-q",
                "--ignore=tests/walidacja_fizyczna/test_bramki.py",
                "--ignore=tests/walidacja_fizyczna/test_manifest.py",
                "-m",
                "not andes",
            ],
        ),
    ]
    for krok in kroki:
        print(json.dumps(krok, ensure_ascii=False), flush=True)

    niepowodzenia = [k["krok"] for k in kroki if k["kod"] != 0]
    print(
        json.dumps(
            {
                "WERDYKT": "WALIDACJA WYKONANA" if not niepowodzenia else "WALIDACJA NIEUDANA",
                "kroki_nieudane": niepowodzenia,
            },
            indent=1,
            ensure_ascii=False,
        )
    )
    return 0 if not niepowodzenia else 1


if __name__ == "__main__":  # pragma: no cover — wejscie procesu
    raise SystemExit(main())
