"""Uruchamianie SOND kampanii mutacyjnej — w osobnym procesie.

KOD BADAWCZY — patrz `backend/research/README.md`. Nie jest dowodem regulacyjnym.

DLACZEGO OSOBNY PROCES. Mutacja podmienia realnie wykonywany kod laboratorium.
Wykonana w procesie kampanii zostawiłaby stan zależny od kolejności mutacji —
czyli reintrodukowałaby klasę defektu, którą to laboratorium już raz naprawiło
(stan przeciekający między biegami). Proces potomny umiera razem z podmianą.

DLACZEGO SONDĄ SĄ TESTY LABORATORIUM, A NIE OSOBNE ASERCJE. Pytanie kampanii
brzmi „czy MECHANIZMY, którymi się posługujemy, wykryją ten defekt" — a tymi
mechanizmami są testy. Sonda pisana osobno badałaby siebie samą: to był defekt
poprzedniej kampanii, w której „mutacja" sprawdzała typ wyjątku zamiast
uruchamiać cokolwiek.

Wywołanie::

    python -m dynamic_lab.sonda_mutacyjna --mutacja M-KON-01
    python -m dynamic_lab.sonda_mutacyjna --mutacja M-KON-01 --bez-mutacji

Kod wyjścia 0 = sondy PRZESZŁY. Każdy inny = sondy padły.
"""

from __future__ import annotations

import argparse
import contextlib
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

from dynamic_lab.mutacje import WynikSondy

#: Katalog główny backendu — potrzebny, żeby pytest znalazł `tests/`.
KATALOG_BACKENDU = Path(__file__).resolve().parents[2]

#: Limit czasu JEDNEGO przebiegu sond [s]. Sonda, która się zawiesi, ma zgłosić
#: BŁĄD WYKONANIA, a nie zatrzymać kampanię na zawsze.
LIMIT_CZASU_SONDY_S = 900


def _polecenie(ident: str, *, bez_mutacji: bool) -> str:
    przyrostek = " --bez-mutacji" if bez_mutacji else ""
    return f"python -m dynamic_lab.sonda_mutacyjna --mutacja {ident}{przyrostek}"


def uruchom(ident: str, *, bez_mutacji: bool) -> int:
    """Uruchom sondy mutacji ``ident``. Zwraca kod wyjścia pytest."""
    import pytest

    from dynamic_lab.katalog_mutacji import mutacja_po_identyfikatorze

    mutacja = mutacja_po_identyfikatorze(ident)
    argumenty = [
        *mutacja.sondy,
        "-q",
        "--no-header",
        "-p",
        "no:randomly",
        "-p",
        "no:cacheprovider",
    ]
    with contextlib.ExitStack() as stos:
        if not bez_mutacji:
            stos.enter_context(mutacja.zastosuj())
        return int(pytest.main(argumenty))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Sondy kampanii mutacyjnej")
    parser.add_argument("--mutacja", required=True, help="identyfikator mutacji z katalogu")
    parser.add_argument(
        "--bez-mutacji",
        action="store_true",
        help="przebieg KONTROLNY: te same sondy bez podmiany kodu",
    )
    argumenty = parser.parse_args(argv)
    return uruchom(argumenty.mutacja, bez_mutacji=argumenty.bez_mutacji)


if __name__ == "__main__":  # pragma: no cover - wejście procesu potomnego
    sys.exit(main())


def wykonaj_sondy_w_podprocesie(sondy: tuple[str, ...], mutacja: Any | None) -> WynikSondy:
    """Uruchom sondy w PROCESIE POTOMNYM — z mutacją albo bez niej.

    ``mutacja=None`` to przebieg KONTROLNY. Zwracany ``polecenie`` jest dokładnie
    tym, co trzeba wpisać, żeby odtworzyć ten przebieg ręcznie — raport bez tego
    pola nie byłby sprawdzalny przez recenzenta.
    """
    ident = "KONTROLA" if mutacja is None else mutacja.ident
    if mutacja is None:
        # Kontrola bazowa nie potrzebuje katalogu — uruchamiamy sondy wprost.
        argumenty = [
            sys.executable,
            "-m",
            "pytest",
            *sondy,
            "-q",
            "--no-header",
            "-p",
            "no:randomly",
            "-p",
            "no:cacheprovider",
        ]
        polecenie = "python -m pytest " + " ".join(sondy) + " -q"
    else:
        argumenty = [
            sys.executable,
            "-m",
            "dynamic_lab.sonda_mutacyjna",
            "--mutacja",
            ident,
        ]
        polecenie = _polecenie(ident, bez_mutacji=False)

    srodowisko = dict(os.environ)
    sciezki = [str(KATALOG_BACKENDU / "research"), srodowisko.get("PYTHONPATH", "")]
    srodowisko["PYTHONPATH"] = os.pathsep.join(p for p in sciezki if p)
    proces = subprocess.run(  # noqa: S603 - polecenie budowane w całości tutaj
        argumenty,
        cwd=KATALOG_BACKENDU,
        env=srodowisko,
        capture_output=True,
        text=True,
        timeout=LIMIT_CZASU_SONDY_S,
        check=False,
    )
    slad = (proces.stdout or "") + (proces.stderr or "")
    return WynikSondy(
        przeszly=proces.returncode == 0,
        slad=slad[-4000:],
        polecenie=polecenie,
    )
