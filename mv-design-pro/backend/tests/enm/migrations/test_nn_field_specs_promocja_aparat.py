"""Wiązanie aparatu pola nN przy promocji `nn_field_specs` (karta #151, mechanizm SLD-SUBSTRAT).

INTENCJA (karta #151, bez zmian): dawne `except Exception: return None, None` gubiło po cichu
wiązanie aparatu przy KAŻDYM wyjątku materializacji — także błędzie programu — a model szedł
dalej bez parametrów aparatu. Trzy gwarancje:
  1. pozycja spoza katalogu to ODMOWA DANYCH — migracja przebiega bez wyjątku, aparat zostaje
     bez wiązania, a przyczyna ma NAZWANY kod (nie ciche zero);
  2. brak wiązania we wpisie to brak materializacji — aparat bez katalogu, bez kodu odmowy
     (nie było czego odmówić) i bez wołania operacji przypisania;
  3. błąd programu materializacji WYBUCHA, nie jest połykany.

ZMIANA KANONU (commit 3c246c08, „wiązanie aparatów nN po migracji akcją naprawczą"): migracja
nie materializuje już pozycji własną ścieżką (`_materializuj_aparat` +
`materialize_catalog_binding` w module migracji), tylko przypisuje wiązanie TĄ SAMĄ operacją
co akcja naprawcza projektanta — `assign_catalog_to_element` (`_wiazanie_z_wpisu` →
`_przypisz_wiazania`). Testy ćwiczą więc publiczne `migruj` i ścieżkę magazynu
(`enm.store.get_enm` → `przygotuj_model_po_odczycie`), a nie usunięte funkcje prywatne.

Iloczyn cech: klucz wiązania we wpisie {`catalog_binding`, `catalog_bindings`} × stan
wiązania {pozycja spoza katalogu, brak klucza, napis, pusty słownik, identyfikator z samych
spacji} × zachowanie operacji {odmowa danych, wyjątek materializacji
{AttributeError, KeyError, TypeError}, odpowiedź odmowy bez kodu}.
"""

from __future__ import annotations

from typing import Any

import pytest
from enm import domain_operations
from enm.migrations.nn_field_specs_promocja import (
    META_KLUCZ_NN_PROMOCJA_BEZ_WIAZANIA,
    META_KLUCZ_NN_PROMOCJA_ODMOWA_WIAZANIA,
    migruj,
)
from enm.models import (
    Bus,
    EnergyNetworkModel,
    ENMDefaults,
    ENMHeader,
    Substation,
    SwitchBranch,
)
from enm.store import get_enm, reset_enm_store, set_enm

KLUCZE_WIAZANIA = ("catalog_binding", "catalog_bindings")

#: Brak czegokolwiek, co wskazuje pozycję aparatu. `_BRAK_KLUCZA` = wpis bez klucza wiązania.
_BRAK_KLUCZA = object()
WIAZANIA_BEZ_POZYCJI: tuple[object, ...] = (
    _BRAK_KLUCZA,
    None,
    "napis",
    {},
    {"catalog_item_id": "  "},
)


@pytest.fixture(autouse=True)
def _reset_state(monkeypatch: pytest.MonkeyPatch, tmp_path: Any) -> Any:
    monkeypatch.setenv("ENM_STORE_DIR", str(tmp_path / "enm_store"))
    reset_enm_store()
    yield
    reset_enm_store()


def _model(klucz: str, wiazanie: object) -> EnergyNetworkModel:
    """Model „sprzed promocji": odpływ nN wyłącznie jako wpis `nn_field_specs`."""
    meta: dict[str, Any] = {"feeder_role": "ODPLYW_NN"}
    if wiazanie is not _BRAK_KLUCZA:
        meta[klucz] = wiazanie
    return EnergyNetworkModel(
        header=ENMHeader(name="stary", defaults=ENMDefaults()),
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
                            "meta": meta,
                        }
                    ]
                },
            )
        ],
    )


def _aparat(enm: EnergyNetworkModel) -> SwitchBranch:
    (aparat,) = enm.branches
    assert isinstance(aparat, SwitchBranch)
    return aparat


def _asercje_braku_wiazania(aparat: SwitchBranch) -> None:
    assert aparat.catalog_ref is None
    assert aparat.materialized_params is None
    assert aparat.parameter_source is None
    assert aparat.meta[META_KLUCZ_NN_PROMOCJA_BEZ_WIAZANIA] is True


# --- 1. Pozycja spoza katalogu: odmowa danych bez wyjątku, z NAZWANYM kodem ----------------


@pytest.mark.parametrize("klucz", KLUCZE_WIAZANIA)
def test_pozycja_spoza_katalogu_to_odmowa_danych_bez_wyjatku(klucz: str) -> None:
    zmigrowany, zmieniono = migruj(_model(klucz, {"catalog_item_id": "aparat-ktorego-nie-ma"}))
    assert zmieniono is True
    aparat = _aparat(zmigrowany)
    _asercje_braku_wiazania(aparat)
    # Kod odmowy to kod operacji przypisania (rejestr `READINESS_CODES`), nie zapas zastępczy.
    assert aparat.meta[META_KLUCZ_NN_PROMOCJA_ODMOWA_WIAZANIA] == "catalog.item_not_found"


@pytest.mark.parametrize("klucz", KLUCZE_WIAZANIA)
def test_odmowa_danych_na_sciezce_magazynu(klucz: str) -> None:
    """Realna ścieżka: model zapisany i odczytany z magazynu (migracja przy odczycie)."""
    set_enm("przypadek-odmowy", _model(klucz, {"catalog_item_id": "aparat-ktorego-nie-ma"}))
    aparat = _aparat(get_enm("przypadek-odmowy"))
    _asercje_braku_wiazania(aparat)
    assert aparat.meta[META_KLUCZ_NN_PROMOCJA_ODMOWA_WIAZANIA] == "catalog.item_not_found"


# --- 2. Brak wiązania: brak materializacji, operacja przypisania nie jest wołana ------------


@pytest.mark.parametrize("wiazanie", WIAZANIA_BEZ_POZYCJI)
@pytest.mark.parametrize("klucz", KLUCZE_WIAZANIA)
def test_brak_wiazania_to_brak_materializacji(
    klucz: str, wiazanie: object, monkeypatch: pytest.MonkeyPatch
) -> None:
    def _nie_wolno(*args: Any, **kwargs: Any) -> Any:
        raise AssertionError("brak wiązania nie może wołać operacji przypisania katalogu")

    monkeypatch.setattr(domain_operations, "assign_catalog_to_element", _nie_wolno)
    zmigrowany, zmieniono = migruj(_model(klucz, wiazanie))
    assert zmieniono is True
    aparat = _aparat(zmigrowany)
    _asercje_braku_wiazania(aparat)
    assert META_KLUCZ_NN_PROMOCJA_ODMOWA_WIAZANIA not in aparat.meta


# --- 3. Błąd programu wybucha -----------------------------------------------------------


@pytest.mark.parametrize("typ", [AttributeError, KeyError, TypeError])
@pytest.mark.parametrize("klucz", KLUCZE_WIAZANIA)
def test_blad_programu_materializacji_wybucha(
    klucz: str, typ: type[Exception], monkeypatch: pytest.MonkeyPatch
) -> None:
    def _zepsuty(*args: Any, **kwargs: Any) -> Any:
        raise typ("błąd programu")

    # Materializacja, którą woła operacja przypisania (jedyna droga wiązania w migracji).
    monkeypatch.setattr(domain_operations, "materialize_catalog_binding", _zepsuty)
    with pytest.raises(typ):
        migruj(_model(klucz, {"catalog_item_id": "cb_nn_630a"}))


@pytest.mark.parametrize("klucz", KLUCZE_WIAZANIA)
def test_odmowa_bez_kodu_to_blad_programu_nie_kod_zastepczy(
    klucz: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Każda odmowa operacji niesie `error_code` (`_error_response`). Odpowiedź odmowy bez
    kodu jest błędem programu — migracja nie dopisuje kodu zastępczego spoza rejestru."""

    def _odmowa_bez_kodu(*args: Any, **kwargs: Any) -> dict[str, Any]:
        return {"error": "odmowa bez kodu", "snapshot": None}

    monkeypatch.setattr(domain_operations, "assign_catalog_to_element", _odmowa_bez_kodu)
    with pytest.raises(KeyError):
        migruj(_model(klucz, {"catalog_item_id": "cb_nn_630a"}))
