"""Wiązanie aparatu pola nN przy promocji `nn_field_specs` (karta #151, po SLD-SUBSTRAT).

Dawne `except Exception: return None, None` gubiło po cichu wiązanie aparatu przy KAŻDYM
wyjątku materializacji — także błędzie programu. Od karty SLD-SUBSTRAT migracja wiąże aparat
TĄ SAMĄ operacją co akcja naprawcza (`assign_catalog_to_element`, `_przypisz_wiazania`).
Iloczyn: {odmowa danych operacji (pozycji nie ma), brak wiązania we wpisie, wyjątek operacji}
× {kod odmowy z rejestru, wyjątek programu wybucha}.
"""

from __future__ import annotations

from typing import Any

import pytest
from domain.canonical_operations import READINESS_CODES
from enm.migrations import nn_field_specs_promocja as promocja
from enm.migrations.nn_field_specs_promocja import (
    META_KLUCZ_NN_PROMOCJA_ODMOWA_WIAZANIA,
    migruj,
)

from tests.enm.test_nn_field_specs_promocja import _model_z_wiazaniem


def test_pozycja_spoza_katalogu_to_odmowa_danych_z_kodem_rejestru() -> None:
    """Odmowa operacji to nazwany brak z KODEM Z REJESTRU (nie kod zastępczy), bez wyjątku."""
    zmigrowany, _ = migruj(
        _model_z_wiazaniem("catalog_binding", {"catalog_item_id": "aparat-ktorego-nie-ma"})
    )
    kod = zmigrowany.branches[0].meta[META_KLUCZ_NN_PROMOCJA_ODMOWA_WIAZANIA]
    assert kod in READINESS_CODES


@pytest.mark.parametrize("wiazanie", [None, "napis", {}, {"catalog_item_id": "  "}])
def test_brak_wiazania_to_brak_przypisania(wiazanie: Any) -> None:
    assert promocja._wiazanie_z_wpisu({"meta": {"catalog_binding": wiazanie}}) is None


@pytest.mark.parametrize("typ", [AttributeError, KeyError, TypeError])
def test_blad_programu_operacji_wiazania_wybucha(
    typ: type[Exception], monkeypatch: pytest.MonkeyPatch
) -> None:
    import enm.domain_operations as operacje

    def _zepsuty(*args: Any, **kwargs: Any) -> Any:
        raise typ("błąd programu")

    monkeypatch.setattr(operacje, "assign_catalog_to_element", _zepsuty)
    with pytest.raises(typ):
        migruj(_model_z_wiazaniem("catalog_binding", {"catalog_item_id": "cokolwiek"}))
