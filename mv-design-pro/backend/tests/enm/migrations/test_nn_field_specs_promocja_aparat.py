"""Materializacja aparatu pola nN przy promocji `nn_field_specs` (karta #151).

Dawne `except Exception: return None, None` gubiło po cichu wiązanie aparatu przy
KAŻDYM wyjątku materializacji — także błędzie programu — a model szedł dalej bez
parametrów aparatu. Iloczyn: {odmowa danych (`success=False`: pozycji nie ma), brak
wiązania, obcy wyjątek materializacji}.
"""

from __future__ import annotations

from typing import Any

import pytest
from enm.migrations import nn_field_specs_promocja as promocja


def test_pozycja_spoza_katalogu_to_odmowa_danych_bez_wyjatku() -> None:
    assert promocja._materializuj_aparat({"catalog_item_id": "aparat-ktorego-nie-ma"}) == (
        None,
        None,
    )


@pytest.mark.parametrize("wiazanie", [None, "napis", {}, {"catalog_item_id": "  "}])
def test_brak_wiazania_to_brak_materializacji(wiazanie: Any) -> None:
    assert promocja._materializuj_aparat(wiazanie) == (None, None)


@pytest.mark.parametrize("typ", [AttributeError, KeyError, TypeError])
def test_blad_programu_materializacji_wybucha(
    typ: type[Exception], monkeypatch: pytest.MonkeyPatch
) -> None:
    def _zepsuty(*args: Any, **kwargs: Any) -> Any:
        raise typ("błąd programu")

    monkeypatch.setattr(promocja, "materialize_catalog_binding", _zepsuty)
    with pytest.raises(typ):
        promocja._materializuj_aparat({"catalog_item_id": "cokolwiek"})
