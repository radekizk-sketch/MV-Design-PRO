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


def _katalog_skryptow() -> Path:
    for rodzic in Path(__file__).resolve().parents:
        kandydat = rodzic / "scripts" / "dynamika_granica_importow.py"
        if kandydat.exists():
            return kandydat.parent
    raise AssertionError("Nie znaleziono `scripts/dynamika_granica_importow.py`")


_PROGRAM = """
import json, sys, types
korzen = sys.argv[1]
sys.path.insert(0, korzen)
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
    wynik = subprocess.run(  # noqa: S603 — staly, lokalny argv
        [sys.executable, "-c", _PROGRAM, str(_korzen_zrodel())],
        capture_output=True,
        text=True,
        check=False,
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


def test_zaden_modul_rdzenia_nie_odwoluje_sie_do_zamrozonych_solverow() -> None:
    """B-01: rdzen stoi OBOK rdzeni FROZEN — pomiar po drzewie skladni.

    Pomiar wykonaniem tego nie pokaze: `network_model.solvers.__init__` (FROZEN)
    laduje rdzenie zamrozone przy kazdym imporcie czegokolwiek z tego pakietu.
    Dlatego ZAKAZ dotyczy odwolan w ZRODLACH i tak jest sprawdzany.
    """
    sys.path.insert(0, str(_katalog_skryptow()))
    from dynamika_granica_importow import znajdz_naruszenia  # noqa: PLC0415

    assert znajdz_naruszenia() == []
