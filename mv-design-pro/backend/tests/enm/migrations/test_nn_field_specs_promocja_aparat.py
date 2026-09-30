"""Wiązanie aparatu pola nN przy promocji `nn_field_specs` (karta #151 na obecnym API).

Dawne `except Exception: return None, None` gubiło po cichu wiązanie aparatu przy
KAŻDYM wyjątku materializacji — także błędzie programu — a model szedł dalej bez
parametrów aparatu. Karta SLD-SUBSTRAT zastąpiła własną materializację migracji
(`_materializuj_aparat`) operacją akcji naprawczej `assign_catalog_to_element`
(`_wiazanie_z_wpisu` + `_przypisz_wiazania`); trzy twierdzenia karty #151 obowiązują
dalej i są tu sprawdzane na ścieżce `migruj`, którą model przechodzi przy każdym odczycie.

Iloczyn cech: {odmowa danych (pozycji nie ma), brak wiązania (cztery kształty), obcy
wyjątek materializacji (trzy typy)} × klucz wiązania we wpisie {`catalog_binding`,
`catalog_bindings`}.
"""

from __future__ import annotations

import ast
import inspect
from pathlib import Path
from typing import Any

import enm.domain_operations as operacje
import pytest
from enm.migrations import nn_field_specs_promocja as promocja
from enm.models import (
    Bus,
    EnergyNetworkModel,
    ENMDefaults,
    ENMHeader,
    Substation,
    SwitchBranch,
)

KLUCZE_WIAZANIA = ("catalog_binding", "catalog_bindings")


def _model(klucz: str, wiazanie: Any) -> EnergyNetworkModel:
    """Stacja z jednym niepromowanym odpływem nN niosącym `wiazanie` pod `klucz`."""
    return EnergyNetworkModel(
        header=ENMHeader(name="promocja-aparat", defaults=ENMDefaults()),
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
                            "field_ref": "nn/f1",
                            "name": "Odpływ 1",
                            "bay_role": "FEEDER",
                            "bus_ref": "bus-nn",
                            "meta": {"feeder_role": "ODPLYW_NN", klucz: wiazanie},
                        }
                    ]
                },
            )
        ],
    )


def _aparat(model: EnergyNetworkModel) -> SwitchBranch:
    aparaty = [
        b
        for b in model.branches
        if (b.meta or {}).get(promocja.META_KLUCZ_GALAZ_ZRODLO_FIELD_REF) == "nn/f1"
    ]
    assert len(aparaty) == 1
    aparat = aparaty[0]
    assert isinstance(aparat, SwitchBranch)
    return aparat


@pytest.mark.parametrize("klucz", KLUCZE_WIAZANIA)
def test_pozycja_spoza_katalogu_to_odmowa_danych_bez_wyjatku(klucz: str) -> None:
    # Twierdzenie #151 (1): pozycji nie ma w katalogu = odmowa DANYCH, nie wyjątek.
    # Dawniej `_materializuj_aparat(...) == (None, None)`; dziś migracja kończy się,
    # aparat zostaje niezwiązany, a odmowa ma NAZWANY kod z odpowiedzi operacji
    # (czytany wprost, bez zapasu spoza rejestru gotowości).
    zmigrowany, zmieniono = promocja.migruj(
        _model(klucz, {"catalog_item_id": "aparat-ktorego-nie-ma"})
    )
    assert zmieniono is True
    aparat = _aparat(zmigrowany)
    assert aparat.catalog_ref is None
    assert aparat.meta[promocja.META_KLUCZ_NN_PROMOCJA_BEZ_WIAZANIA] is True
    assert aparat.meta[promocja.META_KLUCZ_NN_PROMOCJA_ODMOWA_WIAZANIA] == "catalog.item_not_found"


@pytest.mark.parametrize("klucz", KLUCZE_WIAZANIA)
@pytest.mark.parametrize("wiazanie", [None, "napis", {}, {"catalog_item_id": "  "}])
def test_brak_wiazania_to_brak_materializacji(
    klucz: str, wiazanie: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Twierdzenie #151 (2): brak wiązania = brak materializacji. Dawniej
    # `_materializuj_aparat(wiazanie) == (None, None)`; dziś `_wiazanie_z_wpisu` nie
    # buduje payloadu, operacja przypisania NIE jest wołana, a aparat wchodzi do modelu
    # bez wiązania i bez kodu odmowy (brak ≠ odmowa).
    def _nie_wolno(*args: Any, **kwargs: Any) -> Any:
        raise AssertionError("przypisanie katalogu wołane mimo braku wiązania")

    monkeypatch.setattr(operacje, "assign_catalog_to_element", _nie_wolno)
    model = _model(klucz, wiazanie)
    spec = model.substations[0].meta["nn_field_specs"][0]
    assert promocja._wiazanie_z_wpisu(spec) is None

    zmigrowany, _ = promocja.migruj(model)
    aparat = _aparat(zmigrowany)
    assert aparat.catalog_ref is None
    assert aparat.meta[promocja.META_KLUCZ_NN_PROMOCJA_BEZ_WIAZANIA] is True
    assert promocja.META_KLUCZ_NN_PROMOCJA_ODMOWA_WIAZANIA not in aparat.meta


@pytest.mark.parametrize("klucz", KLUCZE_WIAZANIA)
@pytest.mark.parametrize("typ", [AttributeError, KeyError, TypeError])
def test_blad_programu_materializacji_wybucha(
    klucz: str, typ: type[Exception], monkeypatch: pytest.MonkeyPatch
) -> None:
    # Twierdzenie #151 (3): błąd programu w materializacji wybucha. Dawniej zepsuty
    # `promocja.materialize_catalog_binding`; dziś materializację wykonuje operacja
    # akcji naprawczej, więc psujemy materializator, z którego ona czyta — wyjątek musi
    # przejść przez `assign_catalog_to_element` i `_przypisz_wiazania` aż do `migruj`.
    def _zepsuty(*args: Any, **kwargs: Any) -> Any:
        raise typ("błąd programu")

    monkeypatch.setattr(operacje, "materialize_catalog_binding", _zepsuty)
    with pytest.raises(typ):
        promocja.migruj(_model(klucz, {"catalog_item_id": "cokolwiek"}))


def test_odmowa_operacji_domenowej_zawsze_niesie_kod() -> None:
    # Podstawa odczytu `wynik["error_code"]` bez zapasu (migracja, `api/generators.py`,
    # `application/station_templates/apply.py`, bramy materializacji w operacjach):
    # (a) `_error_response` nie ma domyślnego kodu — dawny `"UNKNOWN"` był kodem spoza
    # rejestru gotowości; (b) żaden moduł `enm/` nie składa odpowiedzi błędu z pominięciem
    # `_error_response` (literał słownika z kluczem "error").
    parametr = inspect.signature(operacje._error_response).parameters["code"]
    assert parametr.default is inspect.Parameter.empty

    katalog_enm = Path(operacje.__file__).resolve().parent
    obce: list[str] = []
    for plik in sorted(katalog_enm.rglob("*.py")):
        drzewo = ast.parse(plik.read_text(encoding="utf-8"))
        for funkcja in ast.walk(drzewo):
            if not isinstance(funkcja, ast.FunctionDef) or funkcja.name == "_error_response":
                continue
            for wezel in ast.walk(funkcja):
                if isinstance(wezel, ast.Dict) and any(
                    isinstance(k, ast.Constant) and k.value == "error" for k in wezel.keys
                ):
                    obce.append(f"{plik.name}:{wezel.lineno}")
    assert obce == [], f"odpowiedź błędu złożona poza `_error_response`: {obce}"
