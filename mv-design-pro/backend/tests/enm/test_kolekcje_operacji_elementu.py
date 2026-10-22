"""Operacje uniwersalne na elemencie widzą KAŻDĄ kolekcję elementów modelu ENM.

Defekt (pomiar 2026-10-22, łańcuch przykładów dokumentu kontraktu operacji): bateria
kondensatorów SN (``shunt_capacitors``) nie należała do ``KOLEKCJE_WYSZUKIWANIA_ELEMENTU``,
więc ``delete_element`` meldował ``delete.element_not_found`` dla istniejącej baterii,
``update_element_parameters`` i ``assign_catalog_to_element`` jej nie widziały, a usunięcie
szyny zostawiało baterię z wiszącym ``bus_ref``. Naprawa: kolekcja w zbiorze wyszukiwania,
w kaskadzie usunięcia szyny, w liście dopuszczonych parametrów, a zmiana pozycji katalogu
stosuje tabliczkę baterii tą samą regułą co dodanie (``odmowa_tabliczki_baterii``).

Klasa: każda lista modelu, której elementy są ``ENMElement``, jest w zbiorze wyszukiwania
operacji uniwersalnych (albo w jawnie wycofanych kolekcjach pól).

Iloczyn cech dla baterii: operacja (usunięcie, korekta parametru dopuszczonego, korekta
parametru tabliczki, korekta statusu spoza słownika, zmiana pozycji katalogu, przestrzeń
katalogu obca, zdjęcie katalogu, pozycja o innym napięciu, usunięcie szyny) × skutek
(zmiana zgodna z regułą albo odmowa nazwana bez zmiany modelu).
"""

from __future__ import annotations

import copy
import types
import typing
from typing import Any

import pytest
from enm.domain_operations import (
    KOLEKCJE_WYSZUKIWANIA_ELEMENTU,
    LEGACY_FIELD_COLLECTIONS,
    execute_domain_operation,
)
from enm.models import EnergyNetworkModel, ENMElement

from tests.ci.dokument_operacji_enm import KABEL_SN, ZRODLO_GPZ, _wiazanie
from tests.enm.siec_lacznikowa import _pusty, wykonaj

BATERIA_15KV = "KOMP_SN_1V2_15KV"
BATERIA_15KV_WIEKSZA = "KOMP_SN_2V4_15KV"
BATERIA_20KV = "KOMP_SN_1V8_20KV"


def _klasy_elementow(adnotacja: object) -> set[type]:
    """Klasy elementów listy modelu (przez ``Annotated`` i unie rodzajów gałęzi)."""
    if isinstance(adnotacja, type):
        return {adnotacja}
    pochodzenie = typing.get_origin(adnotacja)
    argumenty = typing.get_args(adnotacja)
    if pochodzenie is typing.Annotated:
        return _klasy_elementow(argumenty[0])
    if pochodzenie in (typing.Union, types.UnionType):
        return {k for a in argumenty for k in _klasy_elementow(a)}
    return set()


def kolekcje_elementow_modelu() -> set[str]:
    wynik: set[str] = set()
    for nazwa, pole in EnergyNetworkModel.model_fields.items():
        if typing.get_origin(pole.annotation) is not list:
            continue
        (element,) = typing.get_args(pole.annotation)
        if any(issubclass(k, ENMElement) for k in _klasy_elementow(element)):
            wynik.add(nazwa)
    return wynik


def test_kazda_kolekcja_elementow_w_zbiorze_wyszukiwania() -> None:
    kolekcje = kolekcje_elementow_modelu()
    assert {"branches", "shunt_capacitors", "buses"} <= kolekcje  # analiza widzi unie i proste
    assert kolekcje - set(KOLEKCJE_WYSZUKIWANIA_ELEMENTU) - set(LEGACY_FIELD_COLLECTIONS) == set()


def test_iniekcja_kolekcja_spoza_zbioru_wykryta() -> None:
    bez_baterii = set(KOLEKCJE_WYSZUKIWANIA_ELEMENTU) - {"shunt_capacitors"}
    assert kolekcje_elementow_modelu() - bez_baterii - set(LEGACY_FIELD_COLLECTIONS) == {
        "shunt_capacitors"
    }


# -- bateria kondensatorów SN × operacje uniwersalne ---------------------------------------


def _model() -> tuple[dict[str, Any], str, str]:
    enm = wykonaj(
        _pusty(),
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "sk3_mva": 300.0,
            "rx_ratio": 0.1,
            "catalog_binding": _wiazanie("ZRODLO_SN", ZRODLO_GPZ),
            "hv_voltage_kv": 110.0,
            "transformer_sn_mva": 25.0,
        },
    )
    enm = wykonaj(
        enm,
        "continue_trunk_segment_sn",
        {
            "segment": {
                "rodzaj": "KABEL",
                "dlugosc_m": 300,
                "catalog_binding": _wiazanie("KABEL_SN", KABEL_SN),
            }
        },
    )
    szyna = enm["branches"][-1]["to_bus_ref"]
    enm = wykonaj(
        enm,
        "add_shunt_compensator_sn",
        {
            "bus_ref": szyna,
            "name": "Bateria K1",
            "catalog_binding": _wiazanie("KOMPENSATOR_SN", BATERIA_15KV),
        },
    )
    return enm, szyna, enm["shunt_capacitors"][0]["ref_id"]


def _bateria(enm: dict[str, Any], ref: str) -> dict[str, Any]:
    return next(b for b in enm["shunt_capacitors"] if b["ref_id"] == ref)


def _odmowa(enm: dict[str, Any], operacja: str, ladunek: dict[str, Any], kod: str) -> None:
    przed = copy.deepcopy(enm)
    wynik = execute_domain_operation(enm, operacja, ladunek)
    assert wynik.get("error_code") == kod, (wynik.get("error_code"), wynik.get("error"))
    assert wynik.get("snapshot") is None
    assert enm == przed


def test_usuniecie_baterii() -> None:
    enm, _, ref = _model()
    wynik = execute_domain_operation(enm, "delete_element", {"element_ref": ref})
    assert wynik.get("error") is None, wynik.get("error_code")
    assert wynik["snapshot"]["shunt_capacitors"] == []
    assert wynik["changes"]["deleted_element_ids"] == [ref]


def test_usuniecie_szyny_usuwa_baterie_kaskadowo() -> None:
    enm, szyna, ref = _model()
    wynik = execute_domain_operation(enm, "delete_element", {"element_ref": szyna})
    assert wynik.get("error") is None, (wynik.get("error_code"), wynik.get("error"))
    snapshot = wynik["snapshot"]
    assert all(b["ref_id"] != ref for b in snapshot["shunt_capacitors"])
    szyny = {b["ref_id"] for b in snapshot["buses"]}
    assert all(b["bus_ref"] in szyny for b in snapshot["shunt_capacitors"])
    EnergyNetworkModel.model_validate(snapshot)


@pytest.mark.parametrize(("klucz", "wartosc"), [("name", "Bateria K2"), ("status", "open")])
def test_korekta_parametru_dopuszczonego(klucz: str, wartosc: str) -> None:
    enm, _, ref = _model()
    wynik = execute_domain_operation(
        enm, "update_element_parameters", {"element_ref": ref, "parameters": {klucz: wartosc}}
    )
    assert wynik.get("error") is None, (wynik.get("error_code"), wynik.get("error"))
    assert _bateria(wynik["snapshot"], ref)[klucz] == wartosc
    assert wynik["changes"]["updated_element_ids"] == [ref]


@pytest.mark.parametrize("klucz", ["rated_mvar", "rated_kv", "bus_ref"])
def test_korekta_tabliczki_odmowa(klucz: str) -> None:
    enm, _, ref = _model()
    _odmowa(
        enm,
        "update_element_parameters",
        {"element_ref": ref, "parameters": {klucz: 9.9}},
        "params.key_not_allowed",
    )


@pytest.mark.parametrize("status", ["wylaczona", None, 1])
def test_status_spoza_slownika_odmowa(status: object) -> None:
    enm, _, ref = _model()
    _odmowa(
        enm,
        "update_element_parameters",
        {"element_ref": ref, "parameters": {"status": status}},
        "params.invalid_value",
    )


def test_zmiana_pozycji_katalogu_stosuje_tabliczke() -> None:
    enm, _, ref = _model()
    przed = _bateria(enm, ref)
    wynik = execute_domain_operation(
        enm,
        "assign_catalog_to_element",
        {"element_ref": ref, "catalog_binding": _wiazanie("KOMPENSATOR_SN", BATERIA_15KV_WIEKSZA)},
    )
    assert wynik.get("error") is None, (wynik.get("error_code"), wynik.get("error"))
    po = _bateria(wynik["snapshot"], ref)
    assert po["rated_mvar"] == pytest.approx(2.4)
    assert po["rated_mvar"] != przed["rated_mvar"]
    assert po["rated_kv"] == pytest.approx(15.0)
    EnergyNetworkModel.model_validate(wynik["snapshot"])


def test_pozycja_katalogu_o_innym_napieciu_odmowa() -> None:
    enm, _, ref = _model()
    _odmowa(
        enm,
        "assign_catalog_to_element",
        {"element_ref": ref, "catalog_binding": _wiazanie("KOMPENSATOR_SN", BATERIA_20KV)},
        "shunt.voltage_mismatch",
    )


def test_obca_przestrzen_katalogu_odmowa() -> None:
    enm, _, ref = _model()
    _odmowa(
        enm,
        "assign_catalog_to_element",
        {"element_ref": ref, "catalog_binding": _wiazanie("KABEL_SN", KABEL_SN)},
        "catalog.namespace_mismatch",
    )


def test_zdjecie_katalogu_odmowa() -> None:
    enm, _, ref = _model()
    _odmowa(
        enm,
        "assign_catalog_to_element",
        {"element_ref": ref, "catalog_item_id": None},
        "catalog.clear_forbidden",
    )
