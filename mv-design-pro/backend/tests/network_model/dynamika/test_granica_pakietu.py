"""Granica pakietu MIERZONA WYKONANIEM, nie tylko skanem zrodel.

Bramka `scripts/dynamika_granica_importow_guard.py` czyta drzewo skladni i
odpowiada na pytanie „czy ktos NAPISAL zakazany import". Ten test odpowiada na
pytanie mocniejsze: „czy zaimportowanie pakietu FAKTYCZNIE wciaga zakazana
warstwe do procesu". Obie drogi sa potrzebne, bo pierwsza nie widzi importow
POSREDNICH — modulu dozwolonego, ktory sam ciagnie warstwe nad rdzeniem.

CO JEST MIERZONE, A CO NIE. Mierzymy WLASNE domkniecie importowe pakietu
`network_model/solvers/dynamika/**`. Pakiety nadrzedne `network_model` i
`network_model.solvers` maja gorliwe `__init__.py` (FROZEN, B-01: nie wolno ich
edytowac), ktore laduja caly rdzen modelu sieci razem z `networkx`. Ich wklad
jest z pomiaru WYLACZONY przez podstawienie pustych modulow-rodzicow — inaczej
test mierzylby cudza warstwe zamiast naszej i nie dalo by sie go spelnic bez
zlamania B-01. To wylaczenie jest JAWNE i dotyczy wylacznie dwoch nazw; kazda
inna zaleznosc wchodzi do pomiaru.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

#: Warstwy, ktorych rdzen obliczeniowy nie ma prawa wciagac — ani wprost, ani
#: posrednio. `network_model` jest nieobecny CELOWO: pakiet w nim lezy i korzysta
#: z `network_model.pochodne`.
ZAKAZANE_KORZENIE = ("application", "enm", "api", "infrastructure", "solver_input", "domain")

#: Biblioteki ekosystemu, ktorych lisc grafu importow nie ma prawa ciagnac.
ZAKAZANE_BIBLIOTEKI = ("pydantic", "networkx", "sqlalchemy", "fastapi", "pandas")


def _korzen_zrodel() -> Path:
    for rodzic in Path(__file__).resolve().parents:
        kandydat = rodzic / "src" / "network_model" / "solvers" / "dynamika"
        if kandydat.is_dir():
            return rodzic / "src"
    raise AssertionError("Nie znaleziono katalogu zrodel backendu")


# Korzen zrodel trafia do podprocesu przez `PYTHONPATH`, a NIE przez manipulacje
# `sys.path` — testy tego repozytorium nie dokladaja do sciezki niczego poza `src`
# (pilnuje `tests/ci/test_testy_nie_cieniuja_pakietow_zrodlowych.py`: wstrzykniecie
# katalogu `tests/` przeslonilo by pakiet zrodlowy pakietem testowym o tej samej
# nazwie — `tests/network_model` vs `network_model`).
_PROGRAM = """
import json, sys, types
korzen = sys.argv[1]
# Puste moduly-rodzice: gorliwe `__init__.py` pakietow FROZEN (B-01) nie wchodza
# do pomiaru. Kazda inna zaleznosc wchodzi.
for nazwa, podkatalog in (
    ("network_model", "network_model"),
    ("network_model.solvers", "network_model/solvers"),
):
    modul = types.ModuleType(nazwa)
    modul.__path__ = [korzen + "/" + podkatalog]
    sys.modules[nazwa] = modul

import network_model.solvers.dynamika  # noqa: F401
import network_model.solvers.dynamika.silnik  # noqa: F401
import network_model.solvers.dynamika.urzadzenia  # noqa: F401
import network_model.solvers.dynamika.walidacja  # noqa: F401

print(json.dumps(sorted(sys.modules)))
"""


def _wlasne_domkniecie() -> list[str]:
    korzen = str(_korzen_zrodel())
    srodowisko = dict(os.environ)
    srodowisko["PYTHONPATH"] = korzen
    wynik = subprocess.run(  # noqa: S603 — staly, lokalny argv
        [sys.executable, "-c", _PROGRAM, korzen],
        capture_output=True,
        text=True,
        check=False,
        env=srodowisko,
    )
    assert wynik.returncode == 0, wynik.stdout + wynik.stderr
    return json.loads(wynik.stdout.strip().splitlines()[-1])


def test_rdzen_nie_wciaga_warstw_nad_nim() -> None:
    moduly = _wlasne_domkniecie()
    znalezione = sorted(modul for modul in moduly if modul.split(".")[0] in ZAKAZANE_KORZENIE)
    assert (
        znalezione == []
    ), f"Import rdzenia dynamiki wciagnal warstwy spoza granicy pakietu: {znalezione}"


def test_rdzen_nie_wciaga_bibliotek_spoza_allowlisty() -> None:
    """Rdzen ma byc lisciem: numpy i scipy tak, reszta ekosystemu nie."""
    moduly = set(_wlasne_domkniecie())
    for biblioteka in ZAKAZANE_BIBLIOTEKI:
        assert biblioteka not in moduly, (
            f"Import rdzenia dynamiki wciagnal {biblioteka!r} — rdzen ma byc lisciem "
            "grafu importow"
        )
    assert "numpy" in moduly
    assert "scipy.sparse" in moduly
    assert "network_model.pochodne" in moduly


# ZAKAZ ODWOLAN DO ZAMROZONYCH RDZENI (B-01) jest sprawdzany po DRZEWIE SKLADNI, a
# nie wykonaniem: `network_model.solvers.__init__` (FROZEN) laduje rdzenie zamrozone
# przy kazdym imporcie czegokolwiek z tego pakietu, wiec pomiar wykonaniem nigdy by
# tego nie rozdzielil. Sprawdzenie zyje w self-tescie bramki
# `scripts/test_dynamika_granica_importow_guard.py` (tam mieszka implementacja
# reguly i tam wstrzykiwane sa czerwone iniekcje) — powtarzanie go tutaj wymagaloby
# dokladania `scripts/` do `sys.path`, czego testy tego repozytorium nie robia.
