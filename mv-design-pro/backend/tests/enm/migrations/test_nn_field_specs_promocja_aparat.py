"""Wiązanie aparatu pola nN przy promocji `nn_field_specs` (karta #151).

Dawne `except Exception: return None, None` gubiło po cichu wiązanie aparatu przy
KAŻDYM wyjątku materializacji — także błędzie programu — a model szedł dalej bez
parametrów aparatu. Od karty SLD-SUBSTRAT (kontynuacja) migracja wiąże aparat TĄ SAMĄ
operacją co akcja naprawcza (`assign_catalog_to_element`), a własna materializacja
(`_materializuj_aparat`) zniknęła; intencja testu zostaje, przepisana na obecny
mechanizm. Iloczyn: {odmowa danych (pozycji nie ma) — nazwany kod odmowy operacji, bez
wyjątku; brak wiązania we wpisie — brak próby wiązania; obcy wyjątek operacji wiązania —
wybucha, nie jest połykany}.
"""

from __future__ import annotations

from typing import Any

import pytest
from enm.migrations import nn_field_specs_promocja as promocja
from enm.migrations.nn_field_specs_promocja import (
    META_KLUCZ_NN_PROMOCJA_BEZ_WIAZANIA,
    META_KLUCZ_NN_PROMOCJA_ODMOWA_WIAZANIA,
    migruj,
)

from tests.enm.test_nn_field_specs_promocja import _model_z_wiazaniem, _stary_model


def test_pozycja_spoza_katalogu_to_nazwana_odmowa_bez_wyjatku() -> None:
    zmigrowany, zmieniono = migruj(
        _model_z_wiazaniem("catalog_binding", {"catalog_item_id": "aparat-ktorego-nie-ma"})
    )
    assert zmieniono is True
    aparat = zmigrowany.branches[0]
    assert aparat.catalog_ref is None
    assert aparat.meta[META_KLUCZ_NN_PROMOCJA_BEZ_WIAZANIA] is True
    # Kod odmowy pochodzi z odpowiedzi operacji wiązania — nie zastępczy kod spoza rejestru.
    kod = aparat.meta[META_KLUCZ_NN_PROMOCJA_ODMOWA_WIAZANIA]
    assert kod.startswith("catalog.") and kod != "catalog.assign_failed", kod


@pytest.mark.parametrize("wiazanie", [None, "napis", {}, {"catalog_item_id": "  "}])
def test_brak_wiazania_to_brak_proby_wiazania(
    wiazanie: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    wywolania: list[Any] = []
    monkeypatch.setattr(promocja, "_przypisz_wiazania", lambda enm, w: wywolania.append(w) or enm)
    model = _stary_model()
    model.substations[0].meta["nn_field_specs"][0]["meta"]["catalog_binding"] = wiazanie
    assert promocja._wiazanie_z_wpisu(model.substations[0].meta["nn_field_specs"][0]) is None
    zmigrowany, _ = migruj(model)
    assert all(not w for w in wywolania), wywolania
    assert zmigrowany.branches[0].meta[META_KLUCZ_NN_PROMOCJA_BEZ_WIAZANIA] is True
    assert META_KLUCZ_NN_PROMOCJA_ODMOWA_WIAZANIA not in zmigrowany.branches[0].meta


@pytest.mark.parametrize("typ", [AttributeError, KeyError, TypeError])
def test_blad_programu_wiazania_wybucha(
    typ: type[Exception], monkeypatch: pytest.MonkeyPatch
) -> None:
    import enm.domain_operations as operacje

    def _zepsuty(*args: Any, **kwargs: Any) -> Any:
        raise typ("błąd programu")

    monkeypatch.setattr(operacje, "assign_catalog_to_element", _zepsuty)
    with pytest.raises(typ):
        migruj(_model_z_wiazaniem("catalog_binding", {"catalog_item_id": "cokolwiek"}))
