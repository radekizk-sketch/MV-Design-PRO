"""BRAMKA ZALEZNOSCI: brak zaleznosci ZATRZYMUJE bieg, nie odznacza testow (R10 par. 7).

DEFEKT F-5, KTORY TO ZAMYKA. `tests/conftest.py` mial hook `pytest_ignore_collect`,
ktory przy braku `numpy`, `networkx` albo `sqlalchemy` pomijal CALE drzewo testow
poza `tests/proof_engine` i konczyl bieg kodem 0. Zmierzony skutek: „681 deselected,
0 failed" i ZIELONA bramka bez ani jednego wykonanego testu fizyki. Straznik tego
warunku (`tests/test_environment.py`) byl odznaczany przez ten sam hook, wiec
znikal razem z tym, czego mial pilnowac.

Test ponizej uruchamia pytesta w OSOBNYM procesie z zaleznoscia UKRYTA przed
`importlib.util.find_spec` (przez `sitecustomize.py` na poczatku `PYTHONPATH`) i
zada, zeby bieg zakonczyl sie NIEZEROWYM kodem oraz komunikatem nazywajacym brak.
"""

from __future__ import annotations

import os
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest

from tests.conftest import ZALEZNOSCI_OBOWIAZKOWE, brakujace_zaleznosci

KORZEN_BACKENDU = Path(__file__).resolve().parents[2]


def test_zaden_obowiazkowy_pakiet_nie_brakuje_w_tym_srodowisku() -> None:
    assert brakujace_zaleznosci() == ()


def test_lista_obowiazkowa_pokrywa_zaleznosci_glowne() -> None:
    """Lista nie moze byc wezsza niz to, czego produkt naprawde uzywa."""
    for nazwa in ("numpy", "scipy", "networkx", "sqlalchemy", "pydantic", "fastapi"):
        assert nazwa in ZALEZNOSCI_OBOWIAZKOWE, nazwa


@pytest.mark.parametrize("ukrywany", ("numpy", "scipy", "networkx"))
def test_ukrycie_zaleznosci_zatrzymuje_bieg(ukrywany: str, tmp_path: Path) -> None:
    """MUTACJA SRODOWISKA: pakiet znika -> bieg konczy sie PORAZKA z nazwanym powodem.

    Ukrycie dziala przez OWINIECIE kazdego wpisu `sys.meta_path` filtrem, ktory dla
    ukrywanego modulu zwraca `None`. Zwrocenie `None` przez JEDEN finder znaczy
    tylko „nie moj" i przekazuje pytanie dalej — dlatego owijane sa WSZYSTKIE, lacznie
    z `PathFinder`. Dopiero wtedy `importlib.util.find_spec` widzi dokladnie to samo,
    co zobaczylby przy braku pakietu. `sitecustomize` laduje sie przy starcie
    interpretera, czyli PRZED `conftest.py`.

    (Pierwsza wersja tego ukrywacza PODNOSILA `ModuleNotFoundError` z `find_spec`.
    Wyjatek przechodzil przez `importlib.util.find_spec` na zewnatrz i wywracal
    pytesta bledem wewnetrznym — bieg byl czerwony, ale z niewlasciwego powodu, wiec
    niczego nie dowodzil.)
    """
    (tmp_path / "sitecustomize.py").write_text(
        textwrap.dedent(
            f"""
            import sys

            UKRYWANY = {ukrywany!r}


            class _Filtr:
                def __init__(self, bazowy):
                    self._bazowy = bazowy

                def find_spec(self, fullname, path=None, target=None):
                    if fullname == UKRYWANY or fullname.startswith(UKRYWANY + "."):
                        return None
                    znajdz = getattr(self._bazowy, "find_spec", None)
                    return None if znajdz is None else znajdz(fullname, path, target)

                def invalidate_caches(self):
                    unieważnij = getattr(self._bazowy, "invalidate_caches", None)
                    if unieważnij is not None:
                        unieważnij()

                def __getattr__(self, nazwa):
                    return getattr(self._bazowy, nazwa)


            sys.meta_path = [_Filtr(f) for f in sys.meta_path]
            # ZERO ingerencji w `sys.modules`. `sitecustomize` laduje sie przy starcie
            # interpretera, czyli ZANIM cokolwiek zaimportuje ukrywany pakiet — nie ma
            # wiec czego zdejmowac. Wczesniejsza wersja miala tu petle kasujaca; byla
            # martwa, a przy okazji lamala regule KD-10 („kto zdejmuje modul z
            # `sys.modules`, ten musi go oddac") i zaczerwienila bramke
            # `tests/ci/test_jedna_tozsamosc_modulow.py` w pelnej regresji.
            """
        ).strip()
        + "\n"
    )
    srodowisko = dict(os.environ)
    srodowisko["PYTHONPATH"] = os.pathsep.join(
        [str(tmp_path), str(KORZEN_BACKENDU / "src"), str(KORZEN_BACKENDU)]
    )
    proces = subprocess.run(
        [sys.executable, "-m", "pytest", "tests/walidacja_fizyczna", "-q", "--collect-only"],
        cwd=str(KORZEN_BACKENDU),
        env=srodowisko,
        capture_output=True,
        text=True,
        timeout=900,
    )
    polaczone = proces.stdout + proces.stderr
    assert proces.returncode != 0, (
        f"bieg bez pakietu {ukrywany!r} zakonczyl sie kodem 0 — brak zaleznosci znowu jest "
        f"cichy:\n{polaczone[-2000:]}"
    )
    assert "BRAK ZALEZNOSCI OBOWIAZKOWEJ" in polaczone, polaczone[-2000:]
    assert ukrywany in polaczone, polaczone[-2000:]
    assert (
        "deselected" not in polaczone.lower()
    ), "brak zaleznosci nie moze konczyc sie odznaczeniem testow"
