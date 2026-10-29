"""Kolejność plików testów wg zmierzonych czasów (LPT) — kontrakt `tests/kolejnosc_plikow.py`.

Przypina: (1) plik czasów nie kłamie o suicie — każdy wpis to istniejący plik testów;
(2) kolejność jest malejąca, deterministyczna, a plik bez pomiaru dostaje medianę;
(3) hak kolekcji zmienia wyłącznie kolejność PLIKÓW (testy pliku zostają razem, w kolejności
kolekcji); (4) xdist pod `--dist loadfile` wysyła najpierw najcięższe pliki — para predykatów
„hak ustawia kolejność” × „xdist jej nie przestawia” (`--no-loadscope-reorder` w `addopts`).
"""

from __future__ import annotations

import re
import subprocess
import sys
import tomllib
from pathlib import Path

from tests.kolejnosc_plikow import BACKEND, kolejnosc, wagi, wczytaj_czasy

#: Trzy lekkie pliki o wyraźnie różnych zmierzonych czasach (odczyt z pliku czasów niżej).
PLIKI_PROBY = (
    "tests/ci/test_ladunki_nadawcow_frontendu.py",
    "tests/ci/test_guardy_z_ci.py",
    "tests/ci/test_ciagi_liniowe_operacji.py",
)


def test_kazdy_wpis_czasow_to_istniejacy_plik_testow() -> None:
    czasy = wczytaj_czasy()
    assert len(czasy) > 800
    bez_pliku = sorted(
        p for p in czasy if not (BACKEND / p).is_file() or not Path(p).name.startswith("test_")
    )
    assert bez_pliku == [], (
        "wpisy czasów bez pliku testów (plik usunięty albo przemianowany) — odśwież "
        f"`python -m tests.kolejnosc_plikow --aktualizuj …`: {bez_pliku}"
    )


def test_kolejnosc_malejaca_deterministyczna_mediana_dla_nowego() -> None:
    czasy = {"a.py": 1.0, "b.py": 5.0, "c.py": 5.0, "d.py": 3.0}
    assert kolejnosc(["d.py", "a.py", "c.py", "b.py"], czasy) == ["b.py", "c.py", "d.py", "a.py"]
    # Plik bez pomiaru waży tyle, co mediana zmierzonych (4,0) — między 5,0 a 3,0.
    assert wagi(["nowy.py"], czasy) == {"nowy.py": 4.0}
    assert kolejnosc(["a.py", "nowy.py", "b.py", "d.py"], czasy) == [
        "b.py",
        "nowy.py",
        "d.py",
        "a.py",
    ]
    assert kolejnosc(["a.py", "a.py"], czasy) == ["a.py"]


def _pytest(*argumenty: str) -> str:
    wynik = subprocess.run(
        [sys.executable, "-m", "pytest", "-p", "no:cacheprovider", *argumenty],
        cwd=BACKEND,
        capture_output=True,
        text=True,
        check=False,
    )
    assert wynik.returncode == 0, wynik.stdout + wynik.stderr
    return wynik.stdout


def _zebrane(*pliki: str) -> list[str]:
    return [
        linia for linia in _pytest("--collect-only", "-q", *pliki).splitlines() if "::" in linia
    ]


def test_hak_kolekcji_przestawia_wylacznie_pliki() -> None:
    czasy = wczytaj_czasy()
    oczekiwane_pliki = kolejnosc(PLIKI_PROBY, czasy)
    assert len({czasy[p] for p in PLIKI_PROBY}) == 3, "pliki próby muszą mieć różne czasy"
    zebrane = _zebrane(*reversed(PLIKI_PROBY))
    pliki = [linia.split("::", 1)[0] for linia in zebrane]
    # Pliki ciągiem (każdy dokładnie jednym blokiem), w kolejności malejącej po czasie.
    assert [p for i, p in enumerate(pliki) if i == 0 or pliki[i - 1] != p] == oczekiwane_pliki
    # Wynik nie zależy od kolejności argumentów, więc testy pliku stoją w kolejności jego
    # kolekcji (sortowanie stabilne przestawia wyłącznie bloki plików).
    assert _zebrane(*PLIKI_PROBY) == zebrane


def test_xdist_wysyla_najpierw_najciezsze_pliki() -> None:
    assert (
        "--no-loadscope-reorder"
        in tomllib.loads((BACKEND / "pyproject.toml").read_text(encoding="utf-8"))["tool"][
            "pytest"
        ]["ini_options"]["addopts"].split()
    )
    oczekiwane = kolejnosc(PLIKI_PROBY, wczytaj_czasy())
    wyjscie = _pytest("-n", "2", "--dist", "loadfile", "-v", *reversed(PLIKI_PROBY))
    pierwszy: dict[str, str] = {}
    for proces, plik in re.findall(r"\[(gw\d+)\][^\n]*? PASSED (\S+?)::", wyjscie):
        pierwszy.setdefault(proces, plik)
    assert set(pierwszy.values()) == set(oczekiwane[:2]), wyjscie
