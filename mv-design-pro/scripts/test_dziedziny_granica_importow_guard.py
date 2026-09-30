"""Self-test bramki granicy importów liścia `dziedziny` — z CZERWONYMI INIEKCJAMI.

Strażnik, który nigdy nie był czerwony, nie jest dowodem niczego. Każda iniekcja trafia do
KOPII pakietu w katalogu tymczasowym (w żywym drzewie pracują równolegle inni wykonawcy —
wstrzykiwanie plików do `backend/src/dziedziny/` mogłoby zaczerwienić ich biegi). Sprawdzane:
czyste drzewo jest zielone, każda rodzina naruszenia jest wyłapana z nazwanym powodem (także
przez uruchomienie bramki jako procesu), dozwolone importy przechodzą, pusty skan jest
błędem, a listy allowlisty są zamknięte (przypięte wartościami).
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

from dziedziny_granica_importow import (  # noqa: E402
    KATALOG_PAKIETU,
    OBCE_DOZWOLONE,
    STDLIB_DOZWOLONE,
    WARSTWY_ZAKAZANE,
    WLASNE_DOZWOLONE,
    raport,
    znajdz_naruszenia,
)

SKRYPT_BRAMKI = Path(__file__).resolve().parent / "dziedziny_granica_importow_guard.py"


def _kopia_pakietu(tmp_path: Path) -> Path:
    cel = tmp_path / "dziedziny"
    shutil.copytree(KATALOG_PAKIETU, cel, ignore=shutil.ignore_patterns("__pycache__"))
    return cel


def _bramka(katalog: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(  # noqa: S603 — stały, lokalny argv
        [sys.executable, str(SKRYPT_BRAMKI), str(katalog)],
        capture_output=True,
        text=True,
        check=False,
    )


def test_czyste_drzewo_jest_zielone() -> None:
    liczba_plikow, naruszenia = raport()
    assert liczba_plikow >= 9, f"skan stracił pakiet (plików: {liczba_plikow})"
    assert naruszenia == [], f"granica importów naruszona na czystym drzewie: {naruszenia}"


def test_bramka_zwraca_zero_na_czystym_drzewie() -> None:
    wynik = subprocess.run(  # noqa: S603 — stały, lokalny argv
        [sys.executable, str(SKRYPT_BRAMKI)], capture_output=True, text=True, check=False
    )
    assert wynik.returncode == 0, wynik.stdout + wynik.stderr
    assert "OK [DziedzinyImportBoundaryGuard]" in wynik.stdout


@pytest.mark.parametrize(
    ("nazwa", "tresc", "fragment_powodu"),
    [
        (
            "_iniekcja_katalog.py",
            "from network_model.catalog.types import ConverterType\n",
            "warstwa 'network_model' jest nad liściem",
        ),
        (
            "_iniekcja_pochodne.py",
            "from network_model.pochodne import prad_roboczy_a\n",
            "`network_model.pochodne` jest zakazane",
        ),
        (
            "_iniekcja_enm.py",
            "import enm.models\n",
            "warstwa 'enm' jest nad liściem",
        ),
        (
            "_iniekcja_solver_input.py",
            "from solver_input.provenance import FieldQuality\n",
            "warstwa 'solver_input' jest nad liściem",
        ),
        (
            "_iniekcja_profil.py",
            "from catalog.profiles.nc_rfg import loader\n",
            "warstwa 'catalog' jest nad liściem",
        ),
        (
            "_iniekcja_werdykt_decyzja.py",
            "from werdykt.decyzja import ocen_kryterium\n",
            "wyłącznie `werdykt.kontrakt`",
        ),
        (
            "_iniekcja_werdykt_korzen.py",
            "from werdykt import PodstawaWymagania\n",
            "import z korzenia `werdykt`",
        ),
        (
            "_iniekcja_stdlib.py",
            "import subprocess\n",
            "spoza ZAMKNIĘTEJ allowlisty",
        ),
        (
            "_iniekcja_numpy.py",
            "import numpy as np\n",
            "spoza ZAMKNIĘTEJ allowlisty",
        ),
        (
            "_iniekcja_wzgledny.py",
            "from ..enm import models\n",
            "wychodzi poza pakiet `dziedziny`",
        ),
    ],
)
def test_iniekcja_naruszenia_czerwieni_bramke(
    tmp_path: Path, nazwa: str, tresc: str, fragment_powodu: str
) -> None:
    kopia = _kopia_pakietu(tmp_path)
    assert znajdz_naruszenia(kopia) == [], "kopia czystego pakietu musi być zielona"
    (kopia / nazwa).write_text(tresc, encoding="utf-8")
    naruszenia = znajdz_naruszenia(kopia)
    assert naruszenia, f"iniekcja {nazwa} nie została wyłapana"
    opisy = " | ".join(str(n) for n in naruszenia)
    assert nazwa in opisy
    assert fragment_powodu in opisy
    wynik = _bramka(kopia)
    assert wynik.returncode == 1, wynik.stdout
    assert "BLAD [DziedzinyImportBoundaryGuard]" in wynik.stdout


def test_iniekcja_w_podpakiecie_tez_jest_wylapana(tmp_path: Path) -> None:
    kopia = _kopia_pakietu(tmp_path)
    podpakiet = kopia / "zagniezdzony"
    podpakiet.mkdir()
    (podpakiet / "__init__.py").write_text("", encoding="utf-8")
    (podpakiet / "_iniekcja.py").write_text("from api.main import app\n", encoding="utf-8")
    naruszenia = znajdz_naruszenia(kopia)
    assert len(naruszenia) == 1
    assert "warstwa 'api' jest nad liściem" in str(naruszenia[0])


def test_dozwolone_importy_nie_czerwienia_bramki(tmp_path: Path) -> None:
    """Predykat pary: to, co allowlista DOPUSZCZA, musi przechodzić."""
    kopia = _kopia_pakietu(tmp_path)
    (kopia / "_iniekcja_dozwolona.py").write_text(
        "from __future__ import annotations\n"
        "import hashlib\n"
        "import json\n"
        "from collections.abc import Mapping\n"
        "from types import MappingProxyType\n"
        "from typing import Literal\n"
        "from pydantic import BaseModel\n"
        "from pydantic.functional_validators import AfterValidator\n"
        "from werdykt.kontrakt import PodstawaWymagania\n"
        "from werdykt.proweniencja import FieldQuality\n"
        "from dziedziny.kanon import KontraktDziedziny\n"
        "from .widmo import ModelZrodlaWidmowego\n",
        encoding="utf-8",
    )
    assert znajdz_naruszenia(kopia) == []


def test_pusty_skan_jest_bledem(tmp_path: Path) -> None:
    pusty = tmp_path / "dziedziny"
    pusty.mkdir()
    wynik = _bramka(pusty)
    assert wynik.returncode == 1
    assert "pusty skan nie jest sukcesem" in wynik.stdout


def test_allowlisty_sa_zamkniete_i_opisane() -> None:
    """Zamknięte zbiory są małe i jawne — deklaracja z przypiętym pomiarem."""
    assert STDLIB_DOZWOLONE == frozenset(
        {
            "__future__",
            "collections",
            "dataclasses",
            "datetime",
            "decimal",
            "enum",
            "hashlib",
            "json",
            "math",
            "re",
            "types",
            "typing",
        }
    )
    assert OBCE_DOZWOLONE == frozenset({"pydantic"})
    assert WLASNE_DOZWOLONE == frozenset({"werdykt.kontrakt", "werdykt.proweniencja"})
    assert WARSTWY_ZAKAZANE == frozenset(
        {
            "network_model",
            "enm",
            "catalog",
            "application",
            "api",
            "analysis",
            "solvers",
            "solver_input",
            "infrastructure",
            "domain",
        }
    )
