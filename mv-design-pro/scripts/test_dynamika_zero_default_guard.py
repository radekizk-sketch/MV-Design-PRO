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

_CZYSTA_KLASA = '''
from pydantic import BaseModel, Field
from typing import Literal


class Przyklad(BaseModel):
    rodzina: Literal["x"] = "x"
    proweniencja: str
    i_max_pu: float = Field(ge=1.0, le=3.0)
    virtual_inertia_h_s: float | None = Field(default=None, ge=0.0, le=20.0)
'''

_INIEKCJA_PLAIN_DEFAULT = '''
from pydantic import BaseModel


class Zla1(BaseModel):
    h_s: float = 3.0
'''

_INIEKCJA_FIELD_DEFAULT_KWARG = '''
from pydantic import BaseModel, Field


class Zla2(BaseModel):
    tp_s: float = Field(default=0.05, ge=0.001, le=2.0)
'''

_INIEKCJA_FIELD_DEFAULT_POZYCYJNY = '''
from pydantic import BaseModel, Field


class Zla3(BaseModel):
    i_max_pu: float = Field(1.2, ge=1.0, le=3.0)
'''

_INIEKCJA_UJEMNA = '''
from pydantic import BaseModel, Field


class Zla4(BaseModel):
    efd_min_pu: float = Field(default=-5.0, le=0.0)
'''


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
    tresc = '''
from pydantic import BaseModel, Field


class Ok(BaseModel):
    crowbar: str | None = Field(default=None)
'''
    with tempfile.TemporaryDirectory() as katalog:
        plik = Path(katalog) / "ok.py"
        plik.write_text(tresc, encoding="utf-8")
        assert znajdz_naruszenia(plik) == []


def test_dyskryminator_tekstowy_nie_jest_naruszeniem() -> None:
    tresc = '''
from pydantic import BaseModel
from typing import Literal


class Wariant(BaseModel):
    rodzina: Literal["magazyn"] = "magazyn"
    tryb: Literal["droop"] = "droop"
'''
    with tempfile.TemporaryDirectory() as katalog:
        plik = Path(katalog) / "wariant.py"
        plik.write_text(tresc, encoding="utf-8")
        assert znajdz_naruszenia(plik) == []


def test_realne_pliki_sa_zielone() -> None:
    for rel in SCAN_FILES:
        naruszenia = znajdz_naruszenia(ROOT / rel)
        assert naruszenia == [], "\n".join(naruszenia)


if __name__ == "__main__":
    test_czysta_klasa_zielona()
    test_iniekcje_wszystkich_postaci_czerwone()
    test_none_default_nie_jest_naruszeniem()
    test_dyskryminator_tekstowy_nie_jest_naruszeniem()
    test_realne_pliki_sa_zielone()
    print("test_dynamika_zero_default_guard: OK")
