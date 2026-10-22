"""Zmiana `catalog_ref` aktualizacją parametrów idzie przez bramę przypisania (klasa).

Operacja `update_element_parameters` przyjmuje `catalog_ref` z listy dozwolonych kluczy.
Dotąd przez bramę katalogową i materializację tabliczki (`assign_catalog_to_element`)
przechodziła wyłącznie zmiana typu źródła przekształtnikowego (decyzja O-53) — gałąź
i transformator przyjmowały dowolny identyfikator, także pozycję, której w katalogu nie ma,
i zostawały z deklaracją `source_mode: KATALOG` przy starej tabliczce („tabliczka znikąd").

Iloczyn cech: kolekcja z obowiązkowym wiązaniem (gałąź kablowa, transformator) × pozycja
(istniejąca inna, nieistniejąca, ta sama). Aparat SN (gałąź `APARAT_SN`) z wartościami
projektanta pokrywa `tests/api/test_wytrzymalosc_aparatury_api.py`.
"""

from __future__ import annotations

import json
from typing import Any

import pytest
from enm.domain_operations import execute_domain_operation

from tests.reference_networks.budowa_przez_api import TRANSFORMATOR_WN_SN, wiazanie
from tests.test_catalog_materialization_step4_guardians import _empty_enm

KABEL_INNY = "cable-base-epr-al-1c-240"
TRAFO_INNY = "tr-wn-sn-110-15-40mva-yd11"
SPOZA_KATALOGU = "pozycja-spoza-katalogu"


def _siec() -> dict[str, Any]:
    """GPZ z równoważnikiem po stronie 110 kV i jednym transformatorem 110/15 kV z katalogu
    + odcinek kablowy magistrali z katalogu. Karta GPZ-MODEL: transformator 110/SN jest
    elementem modelu WYŁĄCZNIE w tym trybie (równoważnik na szynach SN go nie ma), a obie
    kolekcje iloczynu — gałąź i transformator — muszą istnieć w modelu wejściowym."""
    wynik = execute_domain_operation(
        _empty_enm(),
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "manual_equivalent": {
                "short_circuit_input_side": "HV_110",
                "hv_voltage_kv": 110.0,
                "sk3_hv_mva": 3000.0,
                "rx_ratio": 0.1,
            },
            "transformer_count": 1,
            "transformer_catalog_binding": wiazanie("TRAFO_SN_NN", TRANSFORMATOR_WN_SN),
        },
    )
    assert wynik.get("error") is None, wynik.get("error")
    wynik = execute_domain_operation(
        wynik["snapshot"],
        "continue_trunk_segment_sn",
        {"segment": {"rodzaj": "KABEL", "dlugosc_m": 120, "catalog_ref": "cable-tfk-yakxs-3x120"}},
    )
    assert wynik.get("error") is None, wynik.get("error")
    enm: dict[str, Any] = wynik["snapshot"]
    assert len(enm["transformers"]) == 1 and enm["branches"], "obie kolekcje iloczynu w modelu"
    return enm


def _element(enm: dict[str, Any], kolekcja: str) -> dict[str, Any]:
    element: dict[str, Any] = enm[kolekcja][0]
    return element


def _zmien(enm: dict[str, Any], ref: str, catalog_ref: str) -> dict[str, Any]:
    return execute_domain_operation(
        enm,
        "update_element_parameters",
        {"element_ref": ref, "parameters": {"catalog_ref": catalog_ref}},
    )


@pytest.mark.parametrize(
    ("kolekcja", "pozycja"),
    [("branches", KABEL_INNY), ("transformers", TRAFO_INNY)],
)
def test_inna_istniejaca_pozycja_materializuje_tabliczke(kolekcja: str, pozycja: str) -> None:
    enm = _siec()
    przed = _element(enm, kolekcja)
    wynik = _zmien(enm, przed["ref_id"], pozycja)
    assert wynik.get("error") is None, wynik.get("error")
    po = next(e for e in wynik["snapshot"][kolekcja] if e["ref_id"] == przed["ref_id"])
    assert po["catalog_ref"] == pozycja
    assert po["parameter_source"] == "CATALOG"
    assert po["source_mode"] == "KATALOG"
    # Tabliczka pochodzi z NOWEJ pozycji, nie zostaje po poprzedniej.
    assert po["materialized_params"] != przed["materialized_params"]


@pytest.mark.parametrize("kolekcja", ["branches", "transformers"])
def test_pozycja_spoza_katalogu_jest_odmowa_bez_skutku(kolekcja: str) -> None:
    enm = _siec()
    stan = json.dumps(enm, sort_keys=True)
    ref = _element(enm, kolekcja)["ref_id"]
    wynik = _zmien(enm, ref, SPOZA_KATALOGU)
    assert wynik.get("error_code") == "catalog.item_not_found", wynik
    assert wynik.get("snapshot") is None
    assert json.dumps(enm, sort_keys=True) == stan


@pytest.mark.parametrize("kolekcja", ["branches", "transformers"])
def test_ta_sama_pozycja_nie_przechodzi_ponownego_przypisania(kolekcja: str) -> None:
    """Ten sam `catalog_ref` (np. formularz odsyłający komplet pól) to nie zmiana pozycji —
    tabliczka zostaje bez zmian."""
    enm = _siec()
    przed = _element(enm, kolekcja)
    wynik = _zmien(enm, przed["ref_id"], przed["catalog_ref"])
    assert wynik.get("error") is None, wynik.get("error")
    po = next(e for e in wynik["snapshot"][kolekcja] if e["ref_id"] == przed["ref_id"])
    assert po["materialized_params"] == przed["materialized_params"]
    assert po["parameter_source"] == "CATALOG"
