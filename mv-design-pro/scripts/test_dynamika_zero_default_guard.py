"""Self-test guarda Dynamika Zero-Default (karta W6-1): czerwona iniekcja +
zielone realne drzewo.

Uruchomienie (z `mv-design-pro`): `python scripts/test_dynamika_zero_default_guard.py`.
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from dynamika_zero_default_guard import ROOT, SCAN_FILES, znajdz_naruszenia  # noqa: E402

_CZYSTA_KLASA = """
from pydantic import BaseModel, Field
from typing import Literal


class Przyklad(BaseModel):
    rodzina: Literal["x"] = "x"
    proweniencja: str
    i_max_pu: float = Field(ge=1.0, le=3.0)
    virtual_inertia_h_s: float | None = Field(default=None, ge=0.0, le=20.0)
"""

_INIEKCJA_PLAIN_DEFAULT = """
from pydantic import BaseModel


class Zla1(BaseModel):
    h_s: float = 3.0
"""

_INIEKCJA_FIELD_DEFAULT_KWARG = """
from pydantic import BaseModel, Field


class Zla2(BaseModel):
    tp_s: float = Field(default=0.05, ge=0.001, le=2.0)
"""

_INIEKCJA_FIELD_DEFAULT_POZYCYJNY = """
from pydantic import BaseModel, Field


class Zla3(BaseModel):
    i_max_pu: float = Field(1.2, ge=1.0, le=3.0)
"""

_INIEKCJA_UJEMNA = """
from pydantic import BaseModel, Field


class Zla4(BaseModel):
    efd_min_pu: float = Field(default=-5.0, le=0.0)
"""


def test_czysta_klasa_zielona() -> None:
    with tempfile.TemporaryDirectory() as katalog:
        plik = Path(katalog) / "czysta.py"
        plik.write_text(_CZYSTA_KLASA, encoding="utf-8")
        assert znajdz_naruszenia(plik) == []


def test_iniekcje_wszystkich_postaci_czerwone() -> None:
    for tresc in (
        _INIEKCJA_PLAIN_DEFAULT,
        _INIEKCJA_FIELD_DEFAULT_KWARG,
        _INIEKCJA_FIELD_DEFAULT_POZYCYJNY,
        _INIEKCJA_UJEMNA,
    ):
        with tempfile.TemporaryDirectory() as katalog:
            plik = Path(katalog) / "zla.py"
            plik.write_text(tresc, encoding="utf-8")
            naruszenia = znajdz_naruszenia(plik)
            assert naruszenia, f"iniekcja nie została wykryta:\n{tresc}"


def test_none_default_nie_jest_naruszeniem() -> None:
    """`default=None` na `X | None` jest DOZWOLONY — to nie liczba."""
    tresc = """
from pydantic import BaseModel, Field


class Ok(BaseModel):
    crowbar: str | None = Field(default=None)
"""
    with tempfile.TemporaryDirectory() as katalog:
        plik = Path(katalog) / "ok.py"
        plik.write_text(tresc, encoding="utf-8")
        assert znajdz_naruszenia(plik) == []


def test_dyskryminator_tekstowy_nie_jest_naruszeniem() -> None:
    tresc = """
from pydantic import BaseModel
from typing import Literal


class Wariant(BaseModel):
    rodzina: Literal["magazyn"] = "magazyn"
    tryb: Literal["droop"] = "droop"
"""
    with tempfile.TemporaryDirectory() as katalog:
        plik = Path(katalog) / "wariant.py"
        plik.write_text(tresc, encoding="utf-8")
        assert znajdz_naruszenia(plik) == []


def test_realne_pliki_sa_zielone() -> None:
    for rel in SCAN_FILES:
        naruszenia = znajdz_naruszenia(ROOT / rel)
        assert naruszenia == [], "\n".join(naruszenia)


def test_kazdy_modul_dziedziny_jest_skanowany() -> None:
    """Karta AB-H0: nowy moduł liścia `dziedziny/` bez wpisu w SCAN_FILES = czerwień
    (lista plików nie może rosnąć wolniej niż pakiet)."""
    moduly = {
        str(sciezka.relative_to(ROOT))
        for sciezka in (ROOT / "backend" / "src" / "dziedziny").glob("*.py")
    }
    assert len(moduly) >= 9, "skan pakietu `dziedziny` stracił kotwicę"
    assert moduly <= set(SCAN_FILES), sorted(moduly - set(SCAN_FILES))


def test_kazdy_modul_rdzenia_dynamiki_jest_skanowany() -> None:
    """Karta AB-1b.1: kontrakty liczbowe rdzenia żyją także poza `kontrakty.py` (dozory,
    profil źródła testowego, agregat częściowej utraty) — skan obejmuje CAŁY pakiet, a
    moduł dopisany w przyszłości wchodzi do skanu bez edycji listy."""
    pakiet = ROOT / "backend" / "src" / "network_model" / "solvers" / "dynamika"
    moduly = {sciezka.relative_to(ROOT).as_posix() for sciezka in pakiet.rglob("*.py")}
    assert len(moduly) >= 36, "skan pakietu rdzenia dynamiki stracił kotwicę"
    assert moduly <= set(SCAN_FILES), sorted(moduly - set(SCAN_FILES))
    for kontrakt in (
        "kontrakty.py",
        "dozory.py",
        "urzadzenia/zrodlo_testowe.py",
        "urzadzenia/czesciowe.py",
    ):
        assert f"backend/src/network_model/solvers/dynamika/{kontrakt}" in SCAN_FILES
    assert len(SCAN_FILES) == len(set(SCAN_FILES)), "plik skanowany dwa razy"


if __name__ == "__main__":
    test_czysta_klasa_zielona()
    test_iniekcje_wszystkich_postaci_czerwone()
    test_none_default_nie_jest_naruszeniem()
    test_dyskryminator_tekstowy_nie_jest_naruszeniem()
    test_realne_pliki_sa_zielone()
    test_kazdy_modul_dziedziny_jest_skanowany()
    test_kazdy_modul_rdzenia_dynamiki_jest_skanowany()
    print("test_dynamika_zero_default_guard: OK")
