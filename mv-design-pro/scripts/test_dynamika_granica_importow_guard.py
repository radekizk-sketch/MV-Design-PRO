"""Self-test bramki granicy importow rdzenia dynamiki — z CZERWONA INIEKCJA.

Guard, ktory nigdy nie byl czerwony, nie jest dowodem niczego. Ten plik wstrzykuje
do skanowanego pakietu pliki z KAZDA rodzina naruszenia (warstwa nad rdzeniem,
zamrozony rdzen solvera, modul stdlib spoza allowlisty, import wzgledny poza
pakiet, `from scipy import` czegos innego niz `sparse`) i sprawdza, ze bramka je
wylapuje — po czym je usuwa. Sprawdza tez, ze na CZYSTYM drzewie bramka jest
zielona i ze pusty skan NIE jest sukcesem.
"""

from __future__ import annotations

import subprocess
import sys
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

from dynamika_granica_importow import (  # noqa: E402
    KATALOG_PAKIETU,
    OBCE_DOZWOLONE,
    STDLIB_DOZWOLONE,
    WLASNE_DOZWOLONE,
    raport,
    znajdz_naruszenia,
)

SKRYPT_BRAMKI = Path(__file__).resolve().parent / "dynamika_granica_importow_guard.py"


@contextmanager
def _wstrzyknij(nazwa: str, tresc: str) -> Iterator[Path]:
    """Dopisz plik do skanowanego pakietu na czas testu i usun go po nim."""
    sciezka = KATALOG_PAKIETU / nazwa
    assert not sciezka.exists(), f"Plik iniekcji {nazwa} juz istnieje — przerwij, nie nadpisuj"
    sciezka.write_text(tresc, encoding="utf-8")
    try:
        yield sciezka
    finally:
        sciezka.unlink()


def test_czyste_drzewo_jest_zielone() -> None:
    liczba_plikow, naruszenia = raport()
    assert liczba_plikow > 0, "pusty skan nie jest sukcesem"
    assert naruszenia == [], f"granica importow naruszona na czystym drzewie: {naruszenia}"


def test_bramka_zwraca_zero_na_czystym_drzewie() -> None:
    wynik = subprocess.run(  # noqa: S603 — staly, lokalny argv
        [sys.executable, str(SKRYPT_BRAMKI)], capture_output=True, text=True, check=False
    )
    assert wynik.returncode == 0, wynik.stdout + wynik.stderr
    assert "OK [DynamikaImportBoundaryGuard]" in wynik.stdout


@pytest.mark.parametrize(
    ("nazwa", "tresc", "fragment_powodu"),
    [
        (
            "_iniekcja_warstwa.py",
            "from enm.models import EnergyNetworkModel\n",
            "warstwa 'enm' jest nad rdzeniem",
        ),
        (
            "_iniekcja_aplikacja.py",
            "from application.contracts.resultset_dynamic_v1 import ResultSetDynamicV1\n",
            "warstwa 'application' jest nad rdzeniem",
        ),
        (
            "_iniekcja_rdzen_frozen.py",
            "from network_model.solvers.power_flow_newton import PowerFlowNewtonSolver\n",
            "stoi OBOK zamrozonych rdzeni",
        ),
        (
            "_iniekcja_stdlib.py",
            "import subprocess\n",
            "spoza ZAMKNIETEJ allowlisty",
        ),
        (
            "_iniekcja_losowosc.py",
            "import random\n",
            "spoza ZAMKNIETEJ allowlisty",
        ),
        (
            "_iniekcja_scipy.py",
            "from scipy import optimize\n",
            "wolno sprowadzic wylacznie `sparse`",
        ),
        (
            "_iniekcja_wzgledny.py",
            "from ...core.graph import NetworkGraph\n",
            "wychodzi poza pakiet dynamiki",
        ),
    ],
)
def test_iniekcja_naruszenia_czerwieni_bramke(nazwa: str, tresc: str, fragment_powodu: str) -> None:
    with _wstrzyknij(nazwa, tresc):
        naruszenia = znajdz_naruszenia()
        assert naruszenia, f"iniekcja {nazwa} nie zostala wylapana"
        opisy = " | ".join(str(naruszenie) for naruszenie in naruszenia)
        assert nazwa in opisy
        assert fragment_powodu in opisy
        wynik = subprocess.run(  # noqa: S603 — staly, lokalny argv
            [sys.executable, str(SKRYPT_BRAMKI)], capture_output=True, text=True, check=False
        )
        assert wynik.returncode == 1
        assert "BLAD [DynamikaImportBoundaryGuard]" in wynik.stdout
    assert znajdz_naruszenia() == [], "iniekcja nie zostala posprzatana"


def test_dozwolone_importy_nie_czerwienia_bramki() -> None:
    """Predykat pary: to, co allowlista DOPUSZCZA, musi przechodzic."""
    dozwolone = (
        "from __future__ import annotations\n"
        "import math\n"
        "import cmath\n"
        "import numpy as np\n"
        "from scipy import sparse\n"
        "from scipy.sparse import linalg\n"
        "from network_model.pochodne import impedancja_z_napiecia_i_mocy_ohm\n"
        "from .kontrakty import OdmowaDynamiki\n"
        "from .urzadzenia.bazowe import admitancja_wewnetrzna\n"
    )
    with _wstrzyknij("_iniekcja_dozwolona.py", dozwolone):
        assert znajdz_naruszenia() == []


def test_allowlisty_sa_zamkniete_i_opisane() -> None:
    """Zamkniete zbiory maja byc male i jawne — deklaracja z przypietym pomiarem."""
    assert STDLIB_DOZWOLONE == frozenset(
        {
            "__future__",
            "cmath",
            "dataclasses",
            "hashlib",
            "json",
            "math",
            "pathlib",
            "time",
            "typing",
        }
    )
    assert OBCE_DOZWOLONE == frozenset({"numpy", "scipy.sparse", "scipy.sparse.linalg"})
    assert WLASNE_DOZWOLONE == frozenset({"network_model.pochodne"})
