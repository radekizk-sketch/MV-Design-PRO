"""Rodzaj zwarcia w tekście odmów rdzenia IEC 60909 — jedno źródło nazw, komplet wobec
``ShortCircuitType``; odmowa braku Z0 nazywa rodzaj słowami, nigdy kodem (``1F``, ``2F+G``)."""

from __future__ import annotations

import pytest
from network_model.solvers.short_circuit_core import (
    NAZWY_RODZAJOW_ZWARCIA_PL,
    ShortCircuitType,
    impedancja_petli_zwarcia,
)


def test_kazdy_rodzaj_zwarcia_ma_nazwe() -> None:
    assert set(NAZWY_RODZAJOW_ZWARCIA_PL) == set(ShortCircuitType)
    for rodzaj, nazwa in NAZWY_RODZAJOW_ZWARCIA_PL.items():
        assert rodzaj.value not in nazwa and nazwa.strip() == nazwa, nazwa


@pytest.mark.parametrize(
    "rodzaj", [ShortCircuitType.SINGLE_PHASE_GROUND, ShortCircuitType.TWO_PHASE_GROUND]
)
def test_odmowa_braku_z0_nazywa_rodzaj_slowami(rodzaj: ShortCircuitType) -> None:
    with pytest.raises(ValueError) as odmowa:
        impedancja_petli_zwarcia(rodzaj, z1=1 + 1j, z2=1 + 1j, z0=None)
    tekst = str(odmowa.value)
    assert NAZWY_RODZAJOW_ZWARCIA_PL[rodzaj] in tekst, tekst
    assert rodzaj.value not in tekst.replace("Z0", ""), tekst
