"""Wiązanie aparatu pola nN przy promocji `nn_field_specs` (karta #151).

Dawne `except Exception: return None, None` gubiło po cichu wiązanie aparatu przy
KAŻDYM wyjątku materializacji — także błędzie programu — a model szedł dalej bez
parametrów aparatu. Iloczyn: {odmowa danych (pozycji nie ma w katalogu), brak
wiązania we wpisie, obcy wyjątek operacji wiązania}.

Karta SLD-SUBSTRAT przeniosła wiązanie aparatu z własnej materializacji migracji
(`_materializuj_aparat` + `materialize_catalog_binding`) na operację domenową
`assign_catalog_to_element` — tę samą, którą wykonuje akcja naprawcza projektanta
(`_wiazanie_z_wpisu` → `_przypisz_wiazania`). Intencja testu bez zmian, przepisana
na obecny mechanizm: odmowa operacji zostawia nazwany brak bez wyjątku, wpis bez
wiązania nie daje payloadu, a wyjątek operacji (błąd programu) wybucha z `migruj`.
"""

from __future__ import annotations

from typing import Any

import pytest
from enm import domain_operations
from enm.migrations import nn_field_specs_promocja as promocja
from enm.models import Bus, EnergyNetworkModel, ENMDefaults, ENMHeader, Substation

REF_APARAT_NN = "cb_nn_630a"


def _model_z_wpisem(meta_wpisu: dict[str, Any]) -> EnergyNetworkModel:
    """Model z jednym niepromowanym wpisem pola nN o podanym `meta`."""
    return EnergyNetworkModel(
        header=ENMHeader(name="promocja-aparatu", defaults=ENMDefaults()),
        buses=[Bus(ref_id="bus-nn", name="Szyna nN", voltage_kv=0.4)],
        substations=[
            Substation(
                ref_id="st1",
                name="ST-1",
                station_type="mv_lv",
                bus_refs=["bus-nn"],
                meta={
                    "nn_field_specs": [
                        {
                            "field_ref": "nn/legacy/outgoing-1",
                            "name": "Odpływ 1",
                            "bay_role": "FEEDER",
                            "bus_ref": "bus-nn",
                            "equipment_refs": [],
                            "protection_ref": None,
                            "tags": [],
                            "meta": {"feeder_role": "ODPLYW_NN", **meta_wpisu},
                        }
                    ]
                },
            )
        ],
    )


def test_pozycja_spoza_katalogu_to_odmowa_danych_bez_wyjatku() -> None:
    zmigrowany, zmieniono = promocja.migruj(
        _model_z_wpisem({"catalog_binding": {"catalog_item_id": "aparat-ktorego-nie-ma"}})
    )
    assert zmieniono
    aparat = zmigrowany.branches[0]
    assert aparat.catalog_ref is None
    assert aparat.meta[promocja.META_KLUCZ_NN_PROMOCJA_BEZ_WIAZANIA] is True
    assert aparat.meta[promocja.META_KLUCZ_NN_PROMOCJA_ODMOWA_WIAZANIA]


@pytest.mark.parametrize("wiazanie", [None, "napis", {}, {"catalog_item_id": "  "}])
def test_brak_wiazania_to_brak_materializacji(wiazanie: Any) -> None:
    assert promocja._wiazanie_z_wpisu({"meta": {"catalog_binding": wiazanie}}) is None
    zmigrowany, _ = promocja.migruj(_model_z_wpisem({"catalog_binding": wiazanie}))
    aparat = zmigrowany.branches[0]
    assert aparat.catalog_ref is None
    assert aparat.meta[promocja.META_KLUCZ_NN_PROMOCJA_BEZ_WIAZANIA] is True
    assert promocja.META_KLUCZ_NN_PROMOCJA_ODMOWA_WIAZANIA not in aparat.meta


@pytest.mark.parametrize("typ", [AttributeError, KeyError, TypeError])
def test_blad_programu_materializacji_wybucha(
    typ: type[Exception], monkeypatch: pytest.MonkeyPatch
) -> None:
    def _zepsuty(*args: Any, **kwargs: Any) -> Any:
        raise typ("błąd programu")

    monkeypatch.setattr(domain_operations, "assign_catalog_to_element", _zepsuty)
    with pytest.raises(typ):
        promocja.migruj(_model_z_wpisem({"catalog_binding": {"catalog_item_id": REF_APARAT_NN}}))
