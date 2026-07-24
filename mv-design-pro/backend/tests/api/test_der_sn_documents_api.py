"""Testy końcówek API dokumentów toru DER-SN (D4): raport zgodności + BOM.

Kontrakt GET (200 z widokiem, 404 gdy brak toru), determinizm dwóch wywołań oraz
opt-in ``zapisz_do_magazynu`` przechwytujący REALNY dokument do magazynu F-E8.3.
"""

from __future__ import annotations

import pytest
from api.main import app
from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader
from enm.store import reset_enm_store, set_enm
from fastapi.testclient import TestClient
from infrastructure.persistence.repositories.document_store_repository import (
    document_store_repository_scope,
)

_TR_BLOCK = "tr-sn-nn-15-04-1000kva-dyn11"
_CABLE = "cable-base-epr-al-1c-240"
_APARAT_SN = "ap-sn-cb-630"

client = TestClient(app)


@pytest.fixture(autouse=True)
def _reset() -> None:
    reset_enm_store()
    yield
    reset_enm_store()


def _sn_station_enm() -> dict:
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


def _der_sn_payload() -> dict:
    return {
        "source_technology": "PV",
        "connection_variant": "block_transformer",
        "station_ref": "st_1",
        "bus_nn_ref": "bus_sn",
        "source_name": "Blok PV SN",
        "quantity": 1,
        "power_setpoint_mw": 0.998,
        "catalog_binding": {
            "catalog_namespace": "ZRODLO_NN_PV",
            "catalog_item_id": "conv-pv-04kv",
            "catalog_item_version": "2024.1",
            "materialize": True,
            "snapshot_mapping_version": "1.0",
        },
        "materialized_params": {
            "catalog_item_id": "conv-pv-04kv",
            "catalog_item_version": "2024.1",
            "un_kv": 0.4,
            "pmax_mw": 0.998,
            "sn_mva": 1.0,
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


def _seed_case(case_id: str) -> None:
    result = execute_domain_operation(_sn_station_enm(), "add_converter_source", _der_sn_payload())
    assert not result.get("error"), result.get("error")
    set_enm(case_id, EnergyNetworkModel.model_validate(result["snapshot"]))


def test_compliance_report_endpoint_returns_checklist() -> None:
    _seed_case("case-d4-report")
    resp = client.get("/api/der-sn/case-d4-report/compliance-report", params={"run_status": "DONE"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["werdykt"] in {"ZGODNY", "ZGODNY_Z_UWAGAMI"}
    assert body["podsumowanie"]["fail"] == 0
    # Determinizm dwóch wywołań.
    assert (
        client.get(
            "/api/der-sn/case-d4-report/compliance-report", params={"run_status": "DONE"}
        ).json()
        == body
    )


def test_bom_endpoint_returns_positions() -> None:
    _seed_case("case-d4-bom")
    resp = client.get("/api/der-sn/case-d4-bom/bom")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    kategorie = [p["kategoria"] for p in body["pozycje"]]
    assert "transformator_blokowy" in kategorie and "falownik" in kategorie
    assert body["pozycje"][0]["lp"] == 1


def test_missing_track_returns_404() -> None:
    set_enm("case-empty", EnergyNetworkModel.model_validate(_sn_station_enm()))
    assert client.get("/api/der-sn/case-empty/bom").status_code == 404
    assert client.get("/api/der-sn/case-empty/compliance-report").status_code == 404


def test_missing_case_returns_404() -> None:
    assert client.get("/api/der-sn/nieznany/bom").status_code == 404


def test_opt_in_store_captures_documents() -> None:
    _seed_case("case-d4-store")
    resp = client.get(
        "/api/der-sn/case-d4-store/bom",
        params={"zapisz_do_magazynu": True, "project_id": "proj-d4"},
    )
    assert resp.status_code == 200
    client.get(
        "/api/der-sn/case-d4-store/compliance-report",
        params={"zapisz_do_magazynu": True, "project_id": "proj-d4", "run_status": "DONE"},
    )
    with document_store_repository_scope() as repo:
        records = repo.list_by_project("proj-d4")
    doc_types = {r.doc_type for r in records}
    assert "LISTA_MATERIALOWA" in doc_types
    assert "RAPORT_ZGODNOSCI" in doc_types
