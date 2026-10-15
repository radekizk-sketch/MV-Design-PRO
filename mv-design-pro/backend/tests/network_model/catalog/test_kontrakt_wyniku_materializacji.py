"""Kontrakt `MaterializationResult`: odmowa ZAWSZE niesie kod i komunikat, sukces — żadnego.

Podstawa odczytu `kod_odmowy` / `komunikat_odmowy_pl` bez zapasu we wszystkich wołających
(`materialize_elements`, bramy `api/domain_ops_policy.py`, `enm/domain_operations*.py`).
Dawny zapas `"catalog.materialization_failed"` był kodem, którego żaden producent nie
emitował — skasowany z rejestru gotowości razem z zapasami (przegląd PARTIA-6-BACKEND).

Iloczyn cech: {sukces, odmowa} × {kod: brak, pusty, same spacje, nazwany} × {komunikat:
brak, pusty, nazwany}; plus każdy producent odmowy w `materialize_catalog_binding`.
"""

from __future__ import annotations

import pytest
from domain.canonical_operations import READINESS_CODES
from network_model.catalog.materialization import (
    MaterializationResult,
    materialize_catalog_binding,
)
from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.types import CatalogBinding, CatalogNamespace

KABEL_SN = CatalogNamespace.KABEL_SN.value

KODY = (None, "", "   ", "catalog.item_not_found")
KOMUNIKATY = (None, "", "Pozycji nie ma w katalogu.")


def _wynik(sukces: bool, kod: str | None, komunikat: str | None) -> MaterializationResult:
    return MaterializationResult(
        success=sukces,
        solver_fields={},
        ui_fields=[],
        audit=[],
        error_code=kod,
        error_message_pl=komunikat,
    )


@pytest.mark.parametrize("kod", KODY)
@pytest.mark.parametrize("komunikat", KOMUNIKATY)
def test_odmowa_wymaga_kodu_i_komunikatu(kod: str | None, komunikat: str | None) -> None:
    poprawna = kod is not None and kod.strip() != "" and bool(komunikat)
    if poprawna:
        wynik = _wynik(False, kod, komunikat)
        assert wynik.kod_odmowy == kod
        assert wynik.komunikat_odmowy_pl == komunikat
    else:
        with pytest.raises(AssertionError):
            _wynik(False, kod, komunikat)


@pytest.mark.parametrize("kod", KODY)
@pytest.mark.parametrize("komunikat", KOMUNIKATY)
def test_sukces_nie_niesie_kodu_ani_komunikatu(kod: str | None, komunikat: str | None) -> None:
    if kod is None and komunikat is None:
        wynik = _wynik(True, None, None)
        with pytest.raises(AssertionError):
            _ = wynik.kod_odmowy
        with pytest.raises(AssertionError):
            _ = wynik.komunikat_odmowy_pl
    else:
        with pytest.raises(AssertionError):
            _wynik(True, kod, komunikat)


@pytest.mark.parametrize(
    ("wiazanie", "kod"),
    [
        (
            CatalogBinding(KABEL_SN, "cokolwiek", "2024.1", materialize=False),
            "catalog.materialization_required",
        ),
        (
            CatalogBinding("NIE_MA_TAKIEJ_GRUPY", "cokolwiek", "2024.1", materialize=True),
            "catalog.unknown_namespace",
        ),
        (
            CatalogBinding(KABEL_SN, "pozycja-ktorej-nie-ma", "2024.1", materialize=True),
            "catalog.item_not_found",
        ),
    ],
)
def test_kazdy_producent_odmowy_daje_kod_z_rejestru(wiazanie: CatalogBinding, kod: str) -> None:
    wynik = materialize_catalog_binding(wiazanie, get_default_mv_catalog())
    assert not wynik.success
    assert wynik.kod_odmowy == kod
    assert kod in READINESS_CODES
    assert wynik.komunikat_odmowy_pl.strip()


def test_kod_widmo_nie_wraca_do_rejestru() -> None:
    assert "catalog.materialization_failed" not in READINESS_CODES
