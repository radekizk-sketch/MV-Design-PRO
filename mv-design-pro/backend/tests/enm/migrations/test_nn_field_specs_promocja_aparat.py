"""Wiązanie aparatu pola nN przy promocji `nn_field_specs` (karta #151).

Dawne `except Exception: return None, None` gubiło po cichu wiązanie aparatu przy
KAŻDYM wyjątku materializacji — także błędzie programu — a model szedł dalej bez
parametrów aparatu. Od scalenia SLD-SUBSTRAT (partia 6) wiązanie przypisuje operacja
``assign_catalog_to_element`` (ta sama co akcja naprawcza projektanta) w
``_przypisz_wiazania``; intencja karty zostaje ta sama. Iloczyn: {odmowa danych
(operacja zwraca błąd: pozycji nie ma), brak wiązania we wpisie, obcy wyjątek operacji}.
"""

from __future__ import annotations

from typing import Any

import enm.domain_operations as operacje
import pytest
from enm.migrations import nn_field_specs_promocja as promocja
from enm.migrations.nn_field_specs_promocja import (
    META_KLUCZ_NN_PROMOCJA_ODMOWA_WIAZANIA,
    migruj,
)

from tests.enm.test_nn_field_specs_promocja import _model_z_wiazaniem


def test_pozycja_spoza_katalogu_to_odmowa_danych_bez_wyjatku() -> None:
    zmigrowany, zmieniono = migruj(
        _model_z_wiazaniem("catalog_binding", {"catalog_item_id": "aparat-ktorego-nie-ma"})
    )
    assert zmieniono
    aparat = zmigrowany.branches[0]
    assert aparat.catalog_ref is None
    # Kod odmowy pochodzi z odpowiedzi operacji, nie z kodu zastępczego migracji.
    kod = aparat.meta[META_KLUCZ_NN_PROMOCJA_ODMOWA_WIAZANIA]
    assert isinstance(kod, str) and kod and kod != "UNKNOWN"


@pytest.mark.parametrize(
    "meta_wpisu",
    [
        {},
        {"catalog_binding": None},
        {"catalog_binding": "napis"},
        {"catalog_binding": {}},
        {"catalog_binding": {"catalog_item_id": "  "}},
    ],
)
def test_brak_wiazania_to_brak_materializacji(meta_wpisu: dict[str, Any]) -> None:
    assert promocja._wiazanie_z_wpisu({"meta": meta_wpisu}) is None


@pytest.mark.parametrize("typ", [AttributeError, KeyError, TypeError])
def test_blad_programu_przypisania_wybucha(
    typ: type[Exception], monkeypatch: pytest.MonkeyPatch
) -> None:
    def _zepsuty(*args: Any, **kwargs: Any) -> Any:
        raise typ("błąd programu")

    # `_przypisz_wiazania` importuje operację leniwie z modułu — podmiana w module działa.
    monkeypatch.setattr(operacje, "assign_catalog_to_element", _zepsuty)
    with pytest.raises(typ):
        migruj(_model_z_wiazaniem("catalog_binding", {"catalog_item_id": "cokolwiek"}))
