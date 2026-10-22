"""Osadzenie agregatu/UPS nN w polu rozdzielnicy + słownik trybu pracy źródła.

Defekt (karta V12K-351, pomiar spec × odczyty handlera): kreator „Źródło dyspozycyjne nN"
wysyłał ``placement`` / ``existing_field_ref`` / ``source_field`` / ``station_ref``, a
``add_genset_nn`` / ``add_ups_nn`` ich nie czytały — wybór pola przepadał bez śladu, źródło
lądowało wprost na szynie. Naprawa: ta sama droga pola, co dla źródła przekształtnikowego
(``_append_converter_field_if_needed``), ``Generator.meta.field_ref`` jak w DER.

Iloczyn cech: rodzaj źródła (agregat, UPS) × osadzenie (brak klucza, nowe pole bez aparatu,
nowe pole z aparatem katalogowym, nowe pole z aparatem spoza katalogu, istniejące pole,
istniejące pole nieistniejące, wartość spoza słownika).

Drugi defekt tej samej klasy (zapis bez kontroli słownika, który odczyt stosuje):
``set_source_operating_mode`` zapisywał dowolny ``mode`` (także ``None``), a read-model
i SLD odrzucają wartości spoza ``BaySourceEndpoint.operating_mode`` — operacja meldowała
sukces, a żaden konsument nie widział danej. Iloczyn: każdy tryb słownika × odczyt
read-modelu oraz wartości spoza słownika × odmowa bez skutku.
"""

from __future__ import annotations

import pytest
from application.field_read_model import _generator_operating_mode
from enm.domain_operations import execute_domain_operation
from enm.models import TRYBY_PRACY_ZRODLA, EnergyNetworkModel, Generator
from enm.pola import pola_nn_stacji
from enm.slownik_komunikatow import NAZWY_OSADZENIA_ZRODLA_PL, NAZWY_TRYBOW_PRACY_ZRODLA_PL

_APARAT_NN = "cb_nn_630a"
_POLE_ISTNIEJACE = "nn/pole-zrodlowe-istniejace"


def _enm() -> dict:
    return {
        "header": {"name": "Osadzenie agregatu/UPS"},
        "buses": [{"ref_id": "bus-nn", "name": "Szyna nN", "voltage_kv": 0.4}],
        "substations": [
            {"ref_id": "st-1", "name": "ST-1", "station_type": "mv_lv", "bus_refs": ["bus-nn"]}
        ],
    }


def _enm_z_polem() -> dict:
    """Model z istniejącym polem źródłowym nN (zapis tą samą operacją co w kreatorze)."""
    wynik = execute_domain_operation(
        _enm(),
        "add_nn_outgoing_field",
        {
            "bus_nn_ref": "bus-nn",
            "station_ref": "st-1",
            "field_role": "SOURCE",
            "source_field_kind": "AGREGAT",
            "field_name": "Pole rezerwowe",
        },
    )
    assert not wynik.get("error"), wynik
    return wynik["snapshot"]


def _ladunek(rodzaj: str, **osadzenie: object) -> tuple[str, dict]:
    if rodzaj == "GENSET":
        spec = {
            "genset_spec": {
                "rated_power_kw": 400.0,
                "rated_voltage_kv": 0.4,
                "power_factor": 0.8,
                "operation_mode": "PRACA_AWARYJNA",
                "fuel_type": "DIESEL",
            }
        }
        return "add_genset_nn", {"bus_nn_ref": "bus-nn", **spec, **osadzenie}
    spec = {
        "ups_spec": {
            "rated_power_kw": 120.0,
            "backup_time_min": 15.0,
            "operation_mode": "ONLINE",
            "battery_type": "VRLA",
        }
    }
    return "add_ups_nn", {"bus_nn_ref": "bus-nn", **spec, **osadzenie}


_RODZAJE = [("GENSET", "AGREGAT", "genset"), ("UPS", "UPS", "ups")]


def _zrodlo(snapshot: dict) -> dict:
    return next(
        g for g in snapshot["generators"] if g["meta"].get("source_kind") in ("GENSET", "UPS")
    )


@pytest.mark.parametrize(("rodzaj", "rodzaj_pola", "_prefiks"), _RODZAJE)
def test_bez_klucza_osadzenia_zrodlo_wprost_na_szynie(rodzaj, rodzaj_pola, _prefiks):
    op, ladunek = _ladunek(rodzaj)
    wynik = execute_domain_operation(_enm(), op, ladunek)
    assert not wynik.get("error"), wynik
    zrodlo = _zrodlo(wynik["snapshot"])
    assert "field_ref" not in zrodlo["meta"]
    assert pola_nn_stacji(wynik["snapshot"], "st-1") == []
    EnergyNetworkModel.model_validate(wynik["snapshot"])


@pytest.mark.parametrize(("rodzaj", "rodzaj_pola", "_prefiks"), _RODZAJE)
@pytest.mark.parametrize("z_aparatem", [False, True])
def test_nowe_pole_tworzy_pole_zrodlowe_i_wiaze_zrodlo(rodzaj, rodzaj_pola, _prefiks, z_aparatem):
    pole_zrodla: dict = {"source_field_kind": rodzaj_pola, "field_name": "Pole rezerwy"}
    if z_aparatem:
        pole_zrodla["catalog_binding"] = {
            "catalog_namespace": "APARAT_NN",
            "catalog_item_id": _APARAT_NN,
            "catalog_item_version": "2024.1",
        }
    op, ladunek = _ladunek(
        rodzaj, placement="NEW_FIELD", station_ref="st-1", source_field=pole_zrodla
    )
    wynik = execute_domain_operation(_enm(), op, ladunek)
    assert not wynik.get("error"), wynik
    snapshot = wynik["snapshot"]
    pola = pola_nn_stacji(snapshot, "st-1")
    assert len(pola) == 1
    pole = pola[0]
    assert pole["name"] == "Pole rezerwy"
    assert pole["meta"]["source_field_kind"] == rodzaj_pola
    assert pole.get("apparatus_catalog_ref") == (_APARAT_NN if z_aparatem else None)
    zrodlo = _zrodlo(snapshot)
    assert zrodlo["meta"]["field_ref"] == pole["ref_id"]
    # Pole i źródło w jednej odpowiedzi; zdarzenia numerowane kolejno.
    assert wynik["changes"]["created_element_ids"] == [pole["ref_id"], zrodlo["ref_id"]]
    assert [z["event_seq"] for z in wynik["domain_events"]] == [1, 2]
    # Dane opisowe kreatora trafiają do modelu (dawniej pomijane).
    if rodzaj == "GENSET":
        assert zrodlo["meta"]["fuel_type"] == "DIESEL"
    else:
        assert zrodlo["meta"]["battery_type"] == "VRLA"
    EnergyNetworkModel.model_validate(snapshot)


@pytest.mark.parametrize(("rodzaj", "rodzaj_pola", "prefiks"), _RODZAJE)
def test_nowe_pole_z_aparatem_spoza_katalogu_odmawia_bez_skutku(rodzaj, rodzaj_pola, prefiks):
    op, ladunek = _ladunek(
        rodzaj,
        placement="NEW_FIELD",
        station_ref="st-1",
        source_field={
            "source_field_kind": rodzaj_pola,
            "catalog_binding": {"catalog_namespace": "APARAT_NN", "catalog_item_id": "nie-ma"},
        },
    )
    wynik = execute_domain_operation(_enm(), op, ladunek)
    assert wynik.get("error")
    assert "snapshot" not in wynik or wynik["snapshot"] is None


@pytest.mark.parametrize(("rodzaj", "rodzaj_pola", "_prefiks"), _RODZAJE)
def test_istniejace_pole_wiaze_zrodlo_bez_nowego_pola(rodzaj, rodzaj_pola, _prefiks):
    model = _enm_z_polem()
    pole = pola_nn_stacji(model, "st-1")[0]
    op, ladunek = _ladunek(rodzaj, placement="EXISTING_FIELD", existing_field_ref=pole["ref_id"])
    wynik = execute_domain_operation(model, op, ladunek)
    assert not wynik.get("error"), wynik
    snapshot = wynik["snapshot"]
    assert [p["ref_id"] for p in pola_nn_stacji(snapshot, "st-1")] == [pole["ref_id"]]
    assert _zrodlo(snapshot)["meta"]["field_ref"] == pole["ref_id"]


@pytest.mark.parametrize(("rodzaj", "rodzaj_pola", "prefiks"), _RODZAJE)
def test_istniejace_pole_nieistniejace_odmawia_kodem_operacji(rodzaj, rodzaj_pola, prefiks):
    op, ladunek = _ladunek(rodzaj, placement="EXISTING_FIELD", existing_field_ref=_POLE_ISTNIEJACE)
    wynik = execute_domain_operation(_enm(), op, ladunek)
    assert wynik["error_code"] == f"{prefiks}.field_not_found"


@pytest.mark.parametrize(("rodzaj", "rodzaj_pola", "_prefiks"), _RODZAJE)
def test_osadzenie_spoza_slownika_odmawia(rodzaj, rodzaj_pola, _prefiks):
    op, ladunek = _ladunek(rodzaj, placement="POLE_GDZIEKOLWIEK")
    wynik = execute_domain_operation(_enm(), op, ladunek)
    assert wynik["error_code"] == "params.invalid_value"


def _model_ze_zrodlem() -> tuple[dict, str]:
    op, ladunek = _ladunek("GENSET")
    wynik = execute_domain_operation(_enm(), op, ladunek)
    return wynik["snapshot"], _zrodlo(wynik["snapshot"])["ref_id"]


@pytest.mark.parametrize("tryb", TRYBY_PRACY_ZRODLA)
def test_tryb_pracy_ze_slownika_zapisany_i_widoczny_w_read_modelu(tryb):
    model, ref = _model_ze_zrodlem()
    wynik = execute_domain_operation(
        model, "set_source_operating_mode", {"source_ref": ref, "mode": tryb}
    )
    assert not wynik.get("error"), wynik
    zrodlo = next(g for g in wynik["snapshot"]["generators"] if g["ref_id"] == ref)
    assert zrodlo["meta"]["operating_mode"] == tryb
    # Odczyt (read-model pól) widzi DOKŁADNIE zapisaną wartość — jeden słownik.
    assert _generator_operating_mode(Generator.model_validate(zrodlo)) == tryb


@pytest.mark.parametrize("tryb", [None, "", "praca", "GOTOWOSC", 1])
def test_tryb_pracy_spoza_slownika_odmowa_bez_skutku(tryb):
    model, ref = _model_ze_zrodlem()
    wynik = execute_domain_operation(
        model, "set_source_operating_mode", {"element_ref": ref, "mode": tryb}
    )
    assert wynik["error_code"] == "params.invalid_value"
    zrodlo = next(g for g in model["generators"] if g["ref_id"] == ref)
    assert "operating_mode" not in zrodlo["meta"]


def test_nazwy_trybow_pracy_rowne_slownikowi_modelu():
    """Odmowa wylicza tryby słowami — mapa nazw ma DOKŁADNIE klucze słownika modelu."""
    assert tuple(NAZWY_TRYBOW_PRACY_ZRODLA_PL) == TRYBY_PRACY_ZRODLA


def test_odmowa_trybu_i_osadzenia_nazywa_wartosci_slowami():
    model, ref = _model_ze_zrodlem()
    tryb = execute_domain_operation(
        model, "set_source_operating_mode", {"source_ref": ref, "mode": "praca"}
    )
    assert all(nazwa in tryb["error"] for nazwa in NAZWY_TRYBOW_PRACY_ZRODLA_PL.values())
    assert "praca_sieciowa" not in tryb["error"]
    op, ladunek = _ladunek("UPS", placement="POLE_GDZIEKOLWIEK")
    osadzenie = execute_domain_operation(_enm(), op, ladunek)
    assert all(nazwa in osadzenie["error"] for nazwa in NAZWY_OSADZENIA_ZRODLA_PL.values())
    assert "NEW_FIELD" not in osadzenie["error"]
