"""Self-test bramki granicy importow rdzenia dynamiki — z CZERWONA INIEKCJA.

Guard, ktory nigdy nie byl czerwony, nie jest dowodem niczego. Ten plik dopisuje pliki
z KAZDA rodzina naruszenia (warstwa nad rdzeniem, zamrozony rdzen solvera, modul stdlib
spoza allowlisty, import wzgledny poza pakiet, `from scipy import` czegos innego niz
`sparse`) do KOPII pakietu w katalogu tymczasowym i sprawdza, ze bramka je wylapuje —
takze uruchomiona jako proces z katalogiem kopii w argumencie. Sprawdza tez, ze na CZYSTYM
drzewie bramka jest zielona i ze pusty skan NIE jest sukcesem.

DLACZEGO KOPIA, A NIE ZYWY PAKIET. Poprzednia wersja wstrzykiwala pliki do
`backend/src/network_model/solvers/dynamika/` i usuwala je w `finally`. Test powtarzalnosci
biegow rdzenia (`odcisk_implementacji` = hash wszystkich plikow pakietu) biegnacy rownolegle
do lancucha guardow zobaczyl dwa rozne odciski — drugi policzony z `_iniekcja_scipy.py`
w srodku; przerwany proces zostawilby obcy plik w pakiecie produktu na stale. Zapis
autotestu do drzewa repozytorium odrzuca teraz hak audytu w `scripts/conftest.py`.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
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


def _kopia_pakietu(tmp_path: Path) -> Path:
    cel = tmp_path / "dynamika"
    shutil.copytree(KATALOG_PAKIETU, cel, ignore=shutil.ignore_patterns("__pycache__"))
    return cel


def _bramka(katalog: Path | None = None) -> subprocess.CompletedProcess[str]:
    argumenty = [sys.executable, str(SKRYPT_BRAMKI)]
    if katalog is not None:
        argumenty.append(str(katalog))
    return subprocess.run(  # noqa: S603 — staly, lokalny argv
        argumenty, capture_output=True, text=True, check=False
    )


def test_czyste_drzewo_jest_zielone() -> None:
    liczba_plikow, naruszenia = raport()
    assert liczba_plikow > 0, "pusty skan nie jest sukcesem"
    assert naruszenia == [], f"granica importow naruszona na czystym drzewie: {naruszenia}"


def test_bramka_zwraca_zero_na_czystym_drzewie() -> None:
    wynik = _bramka()
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
            "from application.contracts.resultset_dynamic_v2 import ResultSetDynamicV2\n",
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
def test_iniekcja_naruszenia_czerwieni_bramke(
    tmp_path: Path, nazwa: str, tresc: str, fragment_powodu: str
) -> None:
    kopia = _kopia_pakietu(tmp_path)
    assert znajdz_naruszenia(kopia) == [], "kopia czystego pakietu musi byc zielona"
    (kopia / nazwa).write_text(tresc, encoding="utf-8")
    naruszenia = znajdz_naruszenia(kopia)
    assert naruszenia, f"iniekcja {nazwa} nie zostala wylapana"
    opisy = " | ".join(str(naruszenie) for naruszenie in naruszenia)
    assert nazwa in opisy
    assert fragment_powodu in opisy
    wynik = _bramka(kopia)
    assert wynik.returncode == 1, wynik.stdout
    assert "BLAD [DynamikaImportBoundaryGuard]" in wynik.stdout


def test_dozwolone_importy_nie_czerwienia_bramki(tmp_path: Path) -> None:
    """Predykat pary: to, co allowlista DOPUSZCZA, musi przechodzic."""
    kopia = _kopia_pakietu(tmp_path)
    (kopia / "_iniekcja_dozwolona.py").write_text(
        "from __future__ import annotations\n"
        "import math\n"
        "import cmath\n"
        "import numpy as np\n"
        "from scipy import sparse\n"
        "from scipy.sparse import linalg\n"
        "from network_model.pochodne import impedancja_z_napiecia_i_mocy_ohm\n"
        "from network_model.odmowa_danych import OdmowaDanychError\n"
        "from .kontrakty import OdmowaDynamiki\n"
        "from .urzadzenia.bazowe import admitancja_wewnetrzna\n",
        encoding="utf-8",
    )
    assert znajdz_naruszenia(kopia) == []


def test_pusty_skan_jest_bledem(tmp_path: Path) -> None:
    pusty = tmp_path / "dynamika"
    pusty.mkdir()
    wynik = _bramka(pusty)
    assert wynik.returncode == 1
    assert "pusty skan nie jest sukcesem" in wynik.stdout


def test_wlasne_dozwolone_sa_liscmi_biblioteki_standardowej() -> None:
    """Deklaracja z docstringu allowlisty przypieta pomiarem: kazdy dozwolony modul WLASNY
    importuje (sam i w podmodulach) wylacznie biblioteke standardowa albo siebie."""
    import ast

    src = Path(__file__).resolve().parents[1] / "backend" / "src"
    for modul in sorted(WLASNE_DOZWOLONE):
        baza = src / modul.replace(".", "/")
        pliki = sorted(baza.rglob("*.py")) if baza.is_dir() else [baza.with_suffix(".py")]
        assert pliki, modul
        for plik in pliki:
            for wezel in ast.walk(ast.parse(plik.read_text(encoding="utf-8"))):
                if isinstance(wezel, ast.ImportFrom):
                    if wezel.level:
                        continue
                    nazwy = [wezel.module or ""]
                elif isinstance(wezel, ast.Import):
                    nazwy = [alias.name for alias in wezel.names]
                else:
                    continue
                for nazwa in nazwy:
                    korzen = nazwa.split(".")[0]
                    assert nazwa.startswith(modul) or korzen in sys.stdlib_module_names, (
                        plik,
                        nazwa,
                    )


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
    assert WLASNE_DOZWOLONE == frozenset({"network_model.pochodne", "network_model.odmowa_danych"})
