"""D4 (RECENZJA_DER_SN_DOBORY_2026-07): raport zgodności (wymaganie 13) + lista
materiałowa (BOM) toru DER-SN.

Tor budujemy REALNĄ operacją domenową ``add_converter_source`` (materializacja
kompletnego toru DER-SN), a następnie generatory dokumentów czytają snapshot ENM —
zero payloadu kreatora, zero fizyki. Przykład: falownik ~0,998 MW, TR blokowy
1000 kVA Dyn11, kabel SN toru.
"""

from __future__ import annotations

from dataclasses import replace
from typing import Any

from application.analyses.der_sn_track import extract_der_sn_track
from application.analyses.lista_materialowa import build_bom_from_track, build_bom_view
from application.analyses.raport_zgodnosci import (
    KOMUNIKAT_KRYTYCZNY,
    build_compliance_report,
)
from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader

_TR_BLOCK = "tr-sn-nn-15-04-1000kva-dyn11"
_CABLE = "cable-base-epr-al-1c-240"
#: Aparat pola SN — RZECZYWISTA pozycja katalogu (dawne „ap-sn-cb-630" nie
#: istniało w katalogu; operacja przyjmowała je bez sprawdzenia — defekt G).
_APARAT_SN = "sw-cb-abb-vd4-17kv-630a"
#: Falownik PV nN 1 MW / 0,4 kV — mieści się w TR blokowym 1 MVA toru DER.
_FALOWNIK_PV = "conv-pv-nn-1mw-0p4kv"


def _sn_station_enm() -> dict[str, Any]:
    enm = EnergyNetworkModel(
        header=ENMHeader(name="der-sn", defaults=ENMDefaults(sn_nominal_kv=15.0)),
    ).model_dump(mode="json")
    enm["buses"] = [
        {
            "ref_id": "bus_sn",
            "name": "Szyna SN",
            "voltage_kv": 15.0,
            "frequency_hz": 50.0,
            "phase_system": "3ph",
            "tags": [],
            "meta": {},
        }
    ]
    enm["transformers"] = []
    enm["substations"] = [
        {
            "ref_id": "st_1",
            "name": "Stacja 1",
            "station_type": "mv_lv",
            "bus_refs": ["bus_sn"],
            "transformer_refs": [],
            "tags": [],
            "meta": {},
        }
    ]
    enm["sources"] = [
        {
            "ref_id": "src_gpz",
            "name": "GPZ",
            "bus_ref": "bus_sn",
            "model": "short_circuit_power",
            "sk3_mva": 500.0,
            "rx_ratio": 0.1,
            "tags": [],
            "meta": {},
        }
    ]
    return enm


def _der_sn_payload(power_mw: float = 0.998) -> dict[str, Any]:
    return {
        "source_technology": "PV",
        "connection_variant": "block_transformer",
        "station_ref": "st_1",
        "bus_nn_ref": "bus_sn",
        "source_name": "Blok PV SN",
        "quantity": 1,
        "power_setpoint_mw": power_mw,
        # Tabliczka pochodzi z katalogu (defekt G) — payload wskazuje POZYCJĘ.
        "catalog_binding": {
            "catalog_namespace": "ZRODLO_NN_PV",
            "catalog_item_id": _FALOWNIK_PV,
            "catalog_item_version": "2024.1",
            "materialize": True,
            "snapshot_mapping_version": "1.0",
        },
        "der_topology": {
            "connection_level": "sn",
            "inverter_output_voltage_kv": 0.4,
            "has_manufacturer_lv_switchgear": True,
            "lv_switchgear_variant": "multi-feeder",
            "has_block_transformer": True,
            "block_transformer": {
                "rated_power_mva": 1.0,
                "primary_voltage_kv": 15.0,
                "secondary_voltage_kv": 0.4,
                "catalog_ref": _TR_BLOCK,
                "catalog_binding": {
                    "catalog_namespace": "TRAFO_SN_NN",
                    "catalog_item_id": _TR_BLOCK,
                    "catalog_item_version": "2024.1",
                    "materialize": True,
                    "snapshot_mapping_version": "1.0",
                },
            },
            "has_dedicated_mv_field": True,
            "mv_bus_ref": "bus_sn",
            "mv_field_configuration": {
                "switching_device": "CB",
                "ct": True,
                "vt": True,
                "earthing_switch": True,
                "surge_arrester": True,
                "protection_relay": True,
                "cable_head": True,
                "cable_length_km": 0.05,
                "apparatus_catalog_binding": {
                    "catalog_namespace": "APARAT_SN",
                    "catalog_item_id": _APARAT_SN,
                    "catalog_item_version": "2024.1",
                    "materialize": True,
                    "snapshot_mapping_version": "1.0",
                },
                "cable_catalog_ref": _CABLE,
                "cable_catalog_binding": {
                    "catalog_namespace": "KABEL_SN",
                    "catalog_item_id": _CABLE,
                    "catalog_item_version": "2024.1",
                    "materialize": True,
                    "snapshot_mapping_version": "1.0",
                },
            },
        },
    }


def _materialized_snapshot(power_mw: float = 0.998) -> dict[str, Any]:
    result = execute_domain_operation(
        _sn_station_enm(), "add_converter_source", _der_sn_payload(power_mw)
    )
    assert not result.get("error"), result.get("error")
    return result["snapshot"]


# ---------------------------------------------------------------------------
# BOM (lista materiałowa)
# ---------------------------------------------------------------------------


def test_bom_from_materialized_track_lists_all_elements() -> None:
    snap = _materialized_snapshot()
    bom = build_bom_view(snap)
    assert bom is not None
    kategorie = [p["kategoria"] for p in bom["pozycje"]]
    # Tor od strony sieci do falownika, kolejność deterministyczna.
    assert kategorie == [
        "transformator_blokowy",
        "kabel_sn",
        "pole_zrodlowe_sn",
        "szyna_nn_producenta",
        "falownik",
    ]
    # Numeracja porządkowa nadana po sortowaniu.
    assert [p["lp"] for p in bom["pozycje"]] == [1, 2, 3, 4, 5]

    tr = bom["pozycje"][0]
    assert tr["catalog_ref"] == _TR_BLOCK
    assert tr["parametry"]["sn_mva"] == 1.0
    assert tr["parametry"]["grupa_polaczen"] == "Dyn11"
    assert tr["parametry"]["uhv_kv"] == 15.0 and tr["parametry"]["ulv_kv"] == 0.4

    kabel = bom["pozycje"][1]
    assert kabel["catalog_ref"] == _CABLE
    assert kabel["parametry"]["dlugosc_km"] == 0.05
    assert kabel["parametry"]["przekroj_mm2"] is not None
    assert kabel["jednostka"] == "km"

    falownik = bom["pozycje"][4]
    assert falownik["catalog_ref"] == _FALOWNIK_PV
    assert falownik["ilosc"] == 1


def test_bom_is_deterministic_across_two_generations() -> None:
    snap = _materialized_snapshot()
    assert build_bom_view(snap) == build_bom_view(snap)


def test_bom_none_when_no_der_sn_track() -> None:
    assert build_bom_view(_sn_station_enm()) is None


def test_bom_reports_missing_links_instead_of_crashing() -> None:
    """Niekompletny tor: BOM wymienia BRAKUJĄCE ogniwa i nie wywraca się.

    Intencja pola ``braki_ogniw`` to uczciwy raport o ogniwach, których w modelu nie ma.
    Wcześniej liczono je jako ``p["kategoria"] for p in raw if p is None`` — czyli
    odczyt klucza z ``None``. Przy KAŻDYM niekompletnym torze generator wywracał się na
    `TypeError`, a przy torze kompletnym pole zawsze było puste, więc defekt nie miał
    jak się ujawnić. Ten test ćwiczy realny tor niekompletny (brak TR blokowego i kabla
    SN) — bez naprawy pada na `TypeError`, po naprawie zwraca nazwy brakujących ogniw.
    """
    track = extract_der_sn_track(_materialized_snapshot())
    assert track is not None
    okrojony = replace(track, block_transformer=None, mv_cable=None)

    bom = build_bom_from_track(okrojony)

    assert bom["braki_ogniw"] == ["transformator_blokowy", "kabel_sn"]
    assert [p["kategoria"] for p in bom["pozycje"]] == [
        "pole_zrodlowe_sn",
        "szyna_nn_producenta",
        "falownik",
    ]
    assert [p["lp"] for p in bom["pozycje"]] == [1, 2, 3]
    assert bom["count"] == 3


# ---------------------------------------------------------------------------
# Raport zgodności (wymaganie 13)
# ---------------------------------------------------------------------------


def test_compliance_report_passes_for_valid_track() -> None:
    snap = _materialized_snapshot()
    report = build_compliance_report(snap, run_status="DONE", readiness_codes=["READY"])
    assert report is not None
    # Wszystkie walidacje D1 spełnione (op przeszła u źródła) → brak ❌.
    assert report["podsumowanie"]["fail"] == 0
    assert report["werdykt"] in {"ZGODNY", "ZGODNY_Z_UWAGAMI"}
    assert report["komunikat_krytyczny"] is None

    codes = {i["code"] for i in report["pozycje"] if i["status"] == "PASS"}
    assert "der_sn.ok.napiecie_falownika" in codes
    assert "der_sn.ok.napiecie_sn" in codes
    assert "der_sn.ok.moc_transformatora" in codes
    # Status biegu ukończony jest pozycją PASS.
    assert any(i["check_id"] == "bieg_analiz" and i["status"] == "PASS" for i in report["pozycje"])


def test_compliance_report_reports_d1_failure_1to1() -> None:
    """❌ mocy TR: raport przenosi kod i komunikat D1 1:1 i oznajmia komunikat krytyczny."""
    from application.analyses.der_sn_track import extract_der_sn_track
    from application.analyses.raport_zgodnosci import build_compliance_report_from_track

    snap = _materialized_snapshot()
    track = extract_der_sn_track(snap)
    assert track is not None
    # Zaniż moc TR poniżej ΣS falowników → walidacja mocy D1 zwróci ❌.
    track.block_transformer["sn_mva"] = 0.1

    report = build_compliance_report_from_track(track)
    fail = [i for i in report["pozycje"] if i["status"] == "FAIL"]
    assert any(i["code"] == "converter.der_sn.moc_transformatora_niewystarczajaca" for i in fail)
    assert any(
        i["message_pl"].startswith("❌ Moc transformatora jest niewystarczająca") for i in fail
    )
    assert report["werdykt"] == "NIEZGODNY"
    assert report["komunikat_krytyczny"] == KOMUNIKAT_KRYTYCZNY


def test_compliance_report_marks_d2_deviation_as_warning_not_error() -> None:
    snap = _materialized_snapshot()
    report = build_compliance_report(
        snap,
        d2_deviations=[
            {
                "parametr": "przekroj_kabla_mm2",
                "zastosowano": 240.0,
                "propozycja": 50.0,
                "odstepstwo": True,
            },
            {
                "parametr": "grupa_polaczen",
                "zastosowano": "Dyn11",
                "propozycja": "Dyn11",
                "odstepstwo": False,
            },
        ],
    )
    assert report is not None
    d2_warn = [
        i for i in report["pozycje"] if i["kategoria"] == "zgodnosc_D2" and i["status"] == "WARN"
    ]
    assert len(d2_warn) == 1
    assert report["podsumowanie"]["fail"] == 0  # odstępstwo NIE jest błędem
    assert report["werdykt"] == "ZGODNY_Z_UWAGAMI"


def test_compliance_report_failed_run_is_critical() -> None:
    snap = _materialized_snapshot()
    report = build_compliance_report(snap, run_status="FAILED")
    assert report is not None
    assert report["werdykt"] == "NIEZGODNY"
    assert report["komunikat_krytyczny"] == KOMUNIKAT_KRYTYCZNY


def test_compliance_report_deterministic() -> None:
    snap = _materialized_snapshot()
    a = build_compliance_report(snap, run_status="DONE")
    b = build_compliance_report(snap, run_status="DONE")
    assert a == b
