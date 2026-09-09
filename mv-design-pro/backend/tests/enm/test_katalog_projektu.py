"""Katalog projektu (W1 mapy domknięcia) — typy z danych inżyniera niesione przez model.

Iloczyn cech: {model bez sekcji, model z sekcją} × {odcisk, resolver, operacja domenowa
odcinka, operacja transformatora, kolizja z katalogiem statycznym, rekord niepełny,
kontekst po operacji}. Zero fabrykacji: rekord bez obciążalności NIE staje się typem
z zerem — operacja odmawia nazwanym kodem.
"""

from __future__ import annotations

import pytest
from enm.hash import compute_enm_hash, hash_migawki_enm
from enm.katalog_projektu import (
    BladKataloguProjektu,
    katalog_biezacy,
    katalog_dla_modelu,
    sekcja_katalogu_projektu,
)
from enm.kompilator_grafu import (
    _gpz_line_fields,
    dodaj_transformator,
    dodaj_zrodlo_slack,
    kontynuuj_z_pola,
    pusty_enm,
)
from enm.models import EnergyNetworkModel, ENMHeader, KatalogProjektu
from network_model.catalog.repository import get_default_mv_catalog
from pydantic import ValidationError

_LINIA = {
    "id": "arkusz-linia-afl-6-120",
    "name": "AFL-6 120 (arkusz)",
    "params": {
        "r_ohm_per_km": 0.253,
        "x_ohm_per_km": 0.081,
        "b_us_per_km": 2.8,
        "rated_current_a": 315.0,
        "voltage_rating_kv": 15.0,
        "max_temperature_c": None,
        "cross_section_mm2": None,
        "source_reference": "arkusz:siec.xlsx#Linie:2",
        "verification_status": "NIEWERYFIKOWANY",
    },
}
_TRAFO = {
    "id": "arkusz-trafo-t1",
    "name": "TR 0,4 MVA 15/0,4 kV (arkusz)",
    "params": {
        "rated_power_mva": 0.4,
        "voltage_hv_kv": 15.0,
        "voltage_lv_kv": 0.4,
        "uk_percent": 6.0,
        "pk_kw": 4.6,
        "vector_group": "Dyn11",
        "tap_min": -2,
        "tap_max": 2,
        "tap_step_percent": 2.5,
        "source_reference": "arkusz:siec.xlsx#Trafo:2",
        "verification_status": "NIEWERYFIKOWANY",
    },
}


def _sekcja(**nadpisania: object) -> dict:
    sekcja = {"line_types": [_LINIA], "cable_types": [], "transformer_types": [_TRAFO]}
    sekcja.update(nadpisania)
    return sekcja


def _gpz_z_odcinkiem(enm: dict) -> tuple[dict, str, dict]:
    enm, _gpz = dodaj_zrodlo_slack(
        enm, voltage_kv=15.0, sk3_mva=250.0, rx_ratio=0.1, line_fields_count=1
    )
    enm, bus_ref = kontynuuj_z_pola(
        enm,
        field_ref=_gpz_line_fields(enm)[0]["field_ref"],
        catalog_ref=_LINIA["id"],
        dlugosc_m=5000.0,
        name="L1",
        bus_name="B2",
        rodzaj="LINIA",
    )
    odcinek = next(b for b in enm["branches"] if b.get("name") == "L1")
    return enm, bus_ref, odcinek


# --- odcisk i resolver ---------------------------------------------------------------


def test_model_bez_sekcji_ma_niezmieniony_odcisk_i_katalog_statyczny() -> None:
    enm = EnergyNetworkModel(header=ENMHeader(name="bez sekcji"))
    migawka = enm.model_dump(mode="json")
    assert migawka["katalog_projektu"] is None
    # Migawka sprzed pola (bez klucza) i migawka z `None` liczą się do TEGO SAMEGO odcisku.
    migawka_sprzed_pola = {k: v for k, v in migawka.items() if k != "katalog_projektu"}
    assert compute_enm_hash(enm) == hash_migawki_enm(migawka_sprzed_pola)
    assert compute_enm_hash(enm) == hash_migawki_enm(migawka)
    assert katalog_dla_modelu(enm) is get_default_mv_catalog()
    assert katalog_dla_modelu(migawka) is get_default_mv_catalog()
    assert sekcja_katalogu_projektu(migawka) is None


def test_sekcja_wchodzi_do_odcisku_a_resolver_widzi_typy_projektu() -> None:
    bez = EnergyNetworkModel(header=ENMHeader(name="x"))
    z_sekcja = EnergyNetworkModel(
        header=ENMHeader(name="x"), katalog_projektu=KatalogProjektu.model_validate(_sekcja())
    )
    assert compute_enm_hash(bez) != compute_enm_hash(z_sekcja)
    katalog = katalog_dla_modelu(z_sekcja)
    assert katalog is not get_default_mv_catalog()
    assert katalog.line_types[_LINIA["id"]].r_ohm_per_km == pytest.approx(0.253)
    assert katalog.transformer_types[_TRAFO["id"]].uk_percent == pytest.approx(6.0)
    # Typy producenckie pozostają widoczne obok typów projektu (nakładka, nie podmiana).
    assert set(get_default_mv_catalog().line_types) <= set(katalog.line_types)
    # Ten sam obiekt dla tej samej treści sekcji (pamięć podręczna po treści, nie po obiekcie).
    assert katalog_dla_modelu(z_sekcja.model_dump(mode="json")) is katalog


def test_sekcja_sortuje_po_id_i_odrzuca_duplikaty() -> None:
    drugi = {**_LINIA, "id": "arkusz-linia-aaa"}
    sekcja = KatalogProjektu.model_validate(_sekcja(line_types=[_LINIA, drugi]))
    assert [r.id for r in sekcja.line_types] == ["arkusz-linia-aaa", _LINIA["id"]]
    with pytest.raises(ValidationError, match="powtarza się"):
        KatalogProjektu.model_validate(_sekcja(cable_types=[{**_LINIA, "id": _TRAFO["id"]}]))
    with pytest.raises(ValidationError, match="pusty identyfikator"):
        KatalogProjektu.model_validate(_sekcja(line_types=[{**_LINIA, "id": "  "}]))


# --- operacje domenowe ----------------------------------------------------------------


def test_typ_projektu_materializuje_odcinek_tak_jak_typ_producenta() -> None:
    enm = pusty_enm(name="arkusz", sn_nominal_kv=15.0)
    enm["katalog_projektu"] = _sekcja()
    enm, _bus, odcinek = _gpz_z_odcinkiem(enm)
    assert odcinek["catalog_ref"] == _LINIA["id"]
    assert odcinek["parameter_source"] == "CATALOG"
    assert odcinek["r_ohm_per_km"] == pytest.approx(0.253)
    assert odcinek["x_ohm_per_km"] == pytest.approx(0.081)
    assert odcinek["length_km"] == pytest.approx(5.0)
    zmaterializowane = odcinek["materialized_params"]
    assert zmaterializowane["rated_current_a"] == pytest.approx(315.0)
    assert zmaterializowane["source_reference"] == "arkusz:siec.xlsx#Linie:2"
    # Nieznana dana pozostaje nieznana — żadnego zera w miejsce brakującej tabliczki.
    assert zmaterializowane["max_temperature_c"] is None
    # Model po operacjach nadal niesie sekcję i waliduje się jako pełny model.
    model = EnergyNetworkModel.model_validate(enm)
    assert model.katalog_projektu is not None
    assert [r.id for r in model.katalog_projektu.line_types] == [_LINIA["id"]]


def test_typ_projektu_materializuje_transformator() -> None:
    enm = pusty_enm(name="arkusz", sn_nominal_kv=15.0)
    enm["katalog_projektu"] = _sekcja()
    enm, bus_ref, _odcinek = _gpz_z_odcinkiem(enm)
    enm, lv_bus = dodaj_transformator(
        enm, hv_bus_ref=bus_ref, catalog_ref=_TRAFO["id"], lv_voltage_kv=0.4
    )
    trafo = enm["transformers"][-1]
    assert trafo["catalog_ref"] == _TRAFO["id"]
    assert trafo["lv_bus_ref"] == lv_bus
    assert trafo["sn_mva"] == pytest.approx(0.4)
    assert trafo["uk_percent"] == pytest.approx(6.0)
    assert trafo["pk_kw"] == pytest.approx(4.6)
    assert trafo["vector_group"] == "Dyn11"
    assert next(b for b in enm["buses"] if b["ref_id"] == lv_bus)["voltage_kv"] == pytest.approx(
        0.4
    )


def test_kontekst_katalogu_konczy_sie_razem_z_operacja() -> None:
    enm = pusty_enm(name="arkusz", sn_nominal_kv=15.0)
    enm["katalog_projektu"] = _sekcja()
    _gpz_z_odcinkiem(enm)
    assert katalog_biezacy() is get_default_mv_catalog()


def test_ten_sam_ref_bez_sekcji_jest_nazwanym_bledem_katalogu() -> None:
    """Bez sekcji `arkusz-...` nie istnieje — operacja odmawia jak dla każdego obcego ref."""
    enm = pusty_enm(name="bez sekcji", sn_nominal_kv=15.0)
    with pytest.raises(Exception, match="catalog|katalog"):
        _gpz_z_odcinkiem(enm)


# --- odmowy nazwane ------------------------------------------------------------------


def test_kolizja_id_z_katalogiem_statycznym_jest_nazwanym_bledem() -> None:
    zajety = sorted(get_default_mv_catalog().line_types)[0]
    sekcja = _sekcja(line_types=[{**_LINIA, "id": zajety}])
    with pytest.raises(BladKataloguProjektu, match="katalogu statycznego"):
        katalog_dla_modelu({"katalog_projektu": sekcja})
    enm = pusty_enm(name="kolizja", sn_nominal_kv=15.0)
    enm["katalog_projektu"] = sekcja
    from enm.domain_operations import execute_domain_operation

    wynik = execute_domain_operation(
        enm,
        "add_grid_source_sn",
        {"voltage_kv": 15.0, "manual_equivalent": {"sn_voltage_kv": 15.0, "sk3_mva": 250.0, "rx_ratio": 0.1}},
    )
    assert wynik.get("error")
    assert wynik["error_code"] == "katalog_projektu.invalid"
    assert "przesłonięty" in wynik["error"]


def test_rekord_bez_obciazalnosci_nie_staje_sie_typem_z_zerem() -> None:
    params = {k: v for k, v in _LINIA["params"].items() if k != "rated_current_a"}
    sekcja = _sekcja(line_types=[{**_LINIA, "params": params}])
    with pytest.raises(BladKataloguProjektu, match="rated_current_a"):
        katalog_dla_modelu({"katalog_projektu": sekcja})
