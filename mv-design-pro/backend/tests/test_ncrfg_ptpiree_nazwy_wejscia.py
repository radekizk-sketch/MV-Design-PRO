"""Rodzaj źródła i rodzina modułu wejścia PTPiREE w tekście odmów — komplet nazw wobec
literałów wejścia (kod zostaje w polach ``der_kind`` i ``module_family``)."""

from __future__ import annotations

from typing import get_args

from network_model.solvers.ncrfg_ptpiree.contracts import (
    NAZWY_RODZAJOW_ZRODLA_PL,
    NAZWY_RODZIN_MODULU_PL,
    PtpireeDerKind,
    PtpireeModuleFamily,
)


def test_nazwy_rodzajow_i_rodzin_kompletne_bez_kodow() -> None:
    assert set(NAZWY_RODZAJOW_ZRODLA_PL) == set(get_args(PtpireeDerKind))
    assert set(NAZWY_RODZIN_MODULU_PL) == set(get_args(PtpireeModuleFamily))
    for kod, nazwa in (*NAZWY_RODZAJOW_ZRODLA_PL.items(), *NAZWY_RODZIN_MODULU_PL.items()):
        assert kod not in nazwa and nazwa.strip() == nazwa, nazwa
