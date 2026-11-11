"""Nazwy warstw profilu NC RfG w tekście odmów — komplet wobec ``WarstwaNormatywna``.

Odmowa wczytania profilu nazywa warstwę słowami (``NAZWY_WARSTW_PL``), kod zostaje w polu
``warstwa``. Nowa warstwa bez nazwy dałaby ``KeyError`` w odmowie — ten test czerwieni się
wcześniej.
"""

from __future__ import annotations

from typing import get_args

import pytest
from catalog.profiles.nc_rfg.loader import (
    KOLEJNOSC_WARSTW,
    NAZWY_WARSTW_PL,
    WarstwaNormatywna,
    _stan_zbioru,
)


def test_kazda_warstwa_ma_nazwe_bez_kodu() -> None:
    assert set(NAZWY_WARSTW_PL) == set(get_args(WarstwaNormatywna)) == set(KOLEJNOSC_WARSTW)
    for warstwa, nazwa in NAZWY_WARSTW_PL.items():
        assert nazwa.strip() == nazwa and "_" not in nazwa and nazwa != warstwa, nazwa


@pytest.mark.parametrize(
    ("status", "pozycje", "stany", "fragment"),
    [
        ("WSKAZANE", [], [], "pusty zbiór pozycji nie może mieć stanu „wskazane"),
        ("ZWERYFIKOWANE", ["a"], ["NIEUSTALONE"], "stan „zweryfikowane” mocniejszy"),
        ("NIEUSTALONE", ["a", "b", "a"], ["NIEUSTALONE"] * 3, "powtórzone pozycje a."),
    ],
)
def test_odmowa_zbioru_nazywa_stan_slowami(
    status: str, pozycje: list[str], stany: list[str], fragment: str
) -> None:
    """Iloczyn: rodzaj odmowy spójności zbioru × stan źródła — stan słowami, kod nigdy."""
    with pytest.raises(ValueError) as odmowa:
        _stan_zbioru("Bank Nastaw", status, None, pozycje, stany)  # type: ignore[arg-type]
    tekst = str(odmowa.value)
    assert fragment in tekst, tekst
    assert status not in tekst, tekst
