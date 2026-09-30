"""Izolacja procesów pytest: każdy proces ma własne magazyny i bazę sesji (karta SZYBKIE-TESTY).

PO CO. Pod pytest-xdist `tests/conftest.py` wykonuje się najpierw w procesie kontrolera, a
workery dziedziczą jego środowisko. Dawny warunek „zmienna ustawiona = wskazana z zewnątrz”
dawał wszystkim workerom JEDEN magazyn ENM kontrolera (pomiar 2026-09-30, `-n 4 --dist
loadfile`: 22 czerwone testy, `No such file or directory` przy odczycie modelu, który
sąsiedni worker skasował resetem), a fikstury modułowe z lifespanem API pisały do wspólnego
`backend/mv_design_pro.db` w drzewie repozytorium. Ten test przypina regułę rozstrzygania
wartości (iloczyn: zmienna × stan środowiska) i stan procesu, w którym biegnie.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from tests import conftest

ZMIENNE = (
    "ENM_STORE_DIR",
    "STATION_USER_TEMPLATES_DIR",
    "DATABASE_URL",
    "CLOUD_BACKUP_BUCKET",
)
REPO = Path(__file__).resolve().parents[4]


@pytest.mark.parametrize("zmienna", ZMIENNE)
@pytest.mark.parametrize("stan", ["brak", "zewnetrzna", "obcy_proces", "wlasny_proces"])
def test_wartosc_procesu_wg_stanu_srodowiska(
    zmienna: str, stan: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    znacznik = zmienna + conftest.ZNACZNIK_PROCESU
    wlasny = str(os.getpid())
    monkeypatch.delenv(zmienna, raising=False)
    monkeypatch.delenv(znacznik, raising=False)
    if stan == "zewnetrzna":
        monkeypatch.setenv(zmienna, "wskazana-z-zewnatrz")
    elif stan == "obcy_proces":
        monkeypatch.setenv(zmienna, "wartosc-kontrolera")
        monkeypatch.setenv(znacznik, str(os.getpid() + 1))
    elif stan == "wlasny_proces":
        monkeypatch.setenv(zmienna, "wartosc-tego-procesu")
        monkeypatch.setenv(znacznik, wlasny)

    conftest._wlasna_wartosc_procesu(zmienna, lambda: "nowa")

    oczekiwane = {
        "brak": ("nowa", wlasny),
        "zewnetrzna": ("wskazana-z-zewnatrz", None),
        "obcy_proces": ("nowa", wlasny),
        "wlasny_proces": ("wartosc-tego-procesu", wlasny),
    }[stan]
    assert (os.environ.get(zmienna), os.environ.get(znacznik)) == oczekiwane


@pytest.mark.parametrize("zmienna", ZMIENNE)
def test_biezacy_proces_ma_wlasna_wartosc_poza_drzewem_repo(zmienna: str) -> None:
    """Wartość sesji należy do TEGO procesu i nie wskazuje drzewa repozytorium; wartość bez
    znacznika przyszła spoza pytest i jest wtedy nietknięta. `DATABASE_URL` czytamy z
    wartości sesji, bo per test nadpisuje ją `_izolowana_baza_przebiegow` (baza w pamięci)."""
    znacznik = zmienna + conftest.ZNACZNIK_PROCESU
    wartosc = conftest.WARTOSCI_SESJI[zmienna]
    if znacznik not in os.environ:
        assert wartosc == os.environ.get(zmienna, wartosc) or zmienna == "DATABASE_URL"
        return
    assert os.environ[znacznik] == str(os.getpid())
    sciezka = wartosc.removeprefix("sqlite+pysqlite:///")
    assert os.path.isabs(sciezka), wartosc
    assert not Path(sciezka).resolve().is_relative_to(REPO), wartosc


def _watki_openblas_procesu() -> int:
    """Liczba wątków OpenBLAS załadowanego przez numpy W TYM procesie (z `/proc/self/maps`)."""
    import ctypes

    import numpy as np

    np.dot(np.ones((2, 2)), np.ones((2, 2)))  # biblioteka załadowana i zainicjowana
    sciezki = {
        linia.split()[-1]
        for linia in Path("/proc/self/maps").read_text(encoding="utf-8").splitlines()
        if "openblas" in linia.rsplit("/", 1)[-1]
    }
    assert len(sciezki) == 1, sciezki
    biblioteka = ctypes.CDLL(sciezki.pop())
    for symbol in ("openblas_get_num_threads64_", "openblas_get_num_threads"):
        funkcja = getattr(biblioteka, symbol, None)
        if funkcja is not None:
            return int(funkcja())
    raise AssertionError("OpenBLAS bez funkcji openblas_get_num_threads")


def test_worker_xdist_liczy_jednym_watkiem_blas() -> None:
    """Pod xdist każdy worker ma `OPENBLAS_NUM_THREADS=1` (chyba że wskazano inaczej
    z zewnątrz) i biblioteka NAPRAWDĘ liczy tyloma wątkami — czyli zmienna weszła przed
    pierwszym importem numpy. W biegu jednoprocesowym sprawdzamy tę samą zgodność, gdy
    zmienna jest ustawiona."""
    if "PYTEST_XDIST_WORKER" in os.environ:
        assert os.environ.get("OPENBLAS_NUM_THREADS"), "worker xdist bez OPENBLAS_NUM_THREADS"
    wartosc = os.environ.get("OPENBLAS_NUM_THREADS")
    if wartosc:
        assert _watki_openblas_procesu() == int(wartosc)
