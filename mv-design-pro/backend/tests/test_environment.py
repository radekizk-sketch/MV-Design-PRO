"""Zaleznosci OBOWIAZKOWE produktu — importowalne, nie „opcjonalne".

Ten plik do R10 par. 7 nazywal zaleznosci glowne „optional runtime dependencies"
i sprawdzal dwie z osmiu. Byl przy tym odznaczany przez ten sam warunek, ktorego
mial pilnowac (`pytest_ignore_collect` w `tests/conftest.py`): przy braku `numpy`
znikal razem z cala suita, wiec bieg konczyl sie zielono i bez ani jednego testu
fizyki. Teraz lista jest JEDNA (`conftest.ZALEZNOSCI_OBOWIAZKOWE`), a jej
naruszenie zatrzymuje bieg kodem 4 przed kolekcja.
"""

from __future__ import annotations

import importlib

import pytest

from tests.conftest import ZALEZNOSCI_OBOWIAZKOWE, brakujace_zaleznosci


@pytest.mark.parametrize("nazwa", ZALEZNOSCI_OBOWIAZKOWE)
def test_zaleznosc_obowiazkowa_importowalna(nazwa: str) -> None:
    """Sam `find_spec` nie wystarcza — pakiet musi dac sie ZAIMPORTOWAC."""
    assert importlib.import_module(nazwa) is not None


def test_zadna_zaleznosc_obowiazkowa_nie_brakuje() -> None:
    """Predykat bramki i rzeczywistosc srodowiska pochodza z jednego zrodla."""
    assert brakujace_zaleznosci() == ()
