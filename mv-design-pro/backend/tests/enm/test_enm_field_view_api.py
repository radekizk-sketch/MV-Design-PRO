"""Tests for the ENM canonical field read-model endpoint.

WYWOLANIE BEZPOSREDNIE, BEZ `asyncio.run`. Te testy wolaja funkcje koncowki
wprost, z pominieciem warstwy HTTP. Koncowka jest zdefiniowana jako `def` — jej
cialo jest w calosci blokujace (odczyt modelu z pliku + budowa modelu odczytu),
wiec FastAPI wykonuje ja w PULI WATKOW zamiast na petli zdarzen (os
wspolbieznosci programu 10x). Zwraca wiec gotowy slownik, a nie korutyne.

INTENCJA TESTOW BEZ ZMIAN: sprawdzaja TRESC modelu odczytu pol, a nie sposob
wykonania koncowki. `asyncio.run` bylo tu wylacznie adapterem do `async def`.
"""

from uuid import uuid4

import pytest
from api.enm import get_enm_field_view
from application.twin_key import klucz_twin_dla_przypadku
from domain.models import Project
from domain.study_case import StudyCase
from enm.canonical_analysis import reset_canonical_runs, run_short_circuit_now
from enm.models import EnergyNetworkModel
from enm.store import get_enm, reset_enm_store, set_enm

from tests.catalog_test_helpers import gpz_source_record


def _nowy_przypadek(uow_factory) -> str:
    """Utworz REALNY projekt + przypadek wprost przez UoW; zwroc `case_id`.

    CV-1-W: `get_enm_field_view`/`run_short_circuit_now` wolane sa TU
    bezposrednio (bez HTTP) i wymagaja `klucz` juz przetlumaczonego — a
    przypadek bez wiersza w bazie dostaje 404/`PrzypadekBezProjektuError`
    (inwariant I-2), wiec potrzebujemy prawdziwej pary projekt+przypadek,
    dokladnie jak `tests/invariants/test_wlasnosc_modelu_projektu.py
    ::_projekt_z_przypadkami`.
    """
    project_id = uuid4()
    case_id = uuid4()
    with uow_factory() as uow:
        uow.projects.add(Project(id=project_id, name="Test field-view API"), commit=False)
        uow.cases.add_study_case(
            StudyCase(id=case_id, project_id=project_id, name="Przypadek testu"),
            commit=False,
        )
        uow.commit()
    return str(case_id)


def _klucz(case_id: str, uow_factory) -> str:
    """Klucz magazynu ENM dla `case_id` — TO SAMO tlumaczenie co warstwa API (CV-1)."""
    return klucz_twin_dla_przypadku(case_id, uow_factory)


def _seed_enm(case_id: str, payload: dict, uow_factory) -> None:
    set_enm(_klucz(case_id, uow_factory), EnergyNetworkModel.model_validate(payload))


@pytest.fixture(autouse=True)
def reset_state():
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _enm_with_bay() -> dict:
    return {
        "header": {
            "name": "Field View Test",
            "enm_version": "1.0",
            "defaults": {"frequency_hz": 50, "unit_system": "SI"},
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-01T00:00:00Z",
            "revision": 5,
            "hash_sha256": "",
        },
        "buses": [
            {
                "id": "00000000-0000-0000-0000-000000020101",
                "ref_id": "bus_sn_a",
                "name": "Szyna SN A",
                "tags": [],
                "meta": {},
                "voltage_kv": 15,
                "phase_system": "3ph",
            },
            {
                "id": "00000000-0000-0000-0000-000000020102",
                "ref_id": "bus_sn_b",
                "name": "Szyna SN B",
                "tags": [],
                "meta": {},
                "voltage_kv": 15,
                "phase_system": "3ph",
            },
        ],
        "sources": [
            {
                "id": "00000000-0000-0000-0000-000000020103",
                "tags": [],
                "meta": {},
                **gpz_source_record(
                    ref_id="src_grid",
                    name="GPZ",
                    bus_ref="bus_sn_a",
                    voltage_kv=15.0,
                    sk3_mva=250.0,
                    rx_ratio=0.1,
                ),
            },
        ],
        "branches": [
            {
                "id": "00000000-0000-0000-0000-000000020104",
                "ref_id": "cb_in_1",
                "name": "Wyłącznik pola IN",
                "tags": [],
                "meta": {},
                "type": "breaker",
                "from_bus_ref": "bus_sn_a",
                "to_bus_ref": "bus_sn_b",
                "status": "closed",
                "catalog_ref": "breaker.sn.630a",
                "catalog_namespace": "mv_switchgear",
                "materialized_params": {"in_a": 630.0},
            },
            {
                "id": "00000000-0000-0000-0000-000000020105",
                "ref_id": "line_1",
                "name": "Linia SN 1",
                "tags": [],
                "meta": {},
                "type": "line_overhead",
                "from_bus_ref": "bus_sn_b",
                "to_bus_ref": "bus_sn_a",
                "status": "closed",
                "catalog_ref": "line.sn.50",
                "catalog_namespace": "mv_lines",
                "length_km": 1.2,
                "r_ohm_per_km": 0.443,
                "x_ohm_per_km": 0.34,
                "rating": {"in_a": 250.0},
            },
        ],
        "transformers": [],
        "loads": [],
        "generators": [],
        "substations": [
            {
                "id": "00000000-0000-0000-0000-000000020106",
                "ref_id": "sub_1",
                "name": "Stacja 1",
                "tags": [],
                "meta": {},
                "station_type": "mv_lv",
                "bus_refs": ["bus_sn_b"],
            },
        ],
        "bays": [
            {
                "id": "00000000-0000-0000-0000-000000020107",
                "ref_id": "bay_in_1",
                "name": "Pole IN",
                "tags": [],
                "meta": {},
                "bay_role": "IN",
                "substation_ref": "sub_1",
                "bus_ref": "bus_sn_b",
                "equipment_refs": ["cb_in_1", "line_1"],
                "protection_ref": "prot_oc_1",
            },
        ],
        "junctions": [],
        "corridors": [],
        "measurements": [
            {
                "id": "00000000-0000-0000-0000-000000020108",
                "ref_id": "ct_in_1",
                "name": "CT pola IN",
                "tags": [],
                "meta": {},
                "measurement_type": "CT",
                "bus_ref": "bus_sn_b",
                "bay_ref": "bay_in_1",
                "rating": {
                    "ratio_primary": 200.0,
                    "ratio_secondary": 1.0,
                    "accuracy_class": "5P20",
                },
                "connection": "star",
                "purpose": "protection",
            },
        ],
        "protection_assignments": [
            {
                "id": "00000000-0000-0000-0000-000000020109",
                "ref_id": "prot_oc_1",
                "name": "Zabezpieczenie pola IN",
                "tags": [],
                "meta": {},
                "breaker_ref": "cb_in_1",
                "ct_ref": "ct_in_1",
                "device_type": "overcurrent",
                "settings": [
                    {
                        "function_type": "overcurrent_51",
                        "threshold_a": 240.0,
                        "time_delay_s": 0.5,
                        "curve_type": "IEC_SI",
                    },
                    {
                        "function_type": "overcurrent_50",
                        "threshold_a": 800.0,
                        "time_delay_s": 0.05,
                        "curve_type": "DT",
                    },
                ],
                "is_enabled": True,
            },
        ],
        "branch_points": [],
    }


def _enm_with_field_specs_only() -> dict:
    payload = _enm_with_bay()
    bay = payload["bays"].pop(0)
    payload["substations"][0]["meta"] = {
        "field_specs": [
            {
                "field_ref": bay["ref_id"],
                "name": bay["name"],
                "bay_role": bay["bay_role"],
                "bus_ref": bay["bus_ref"],
                "equipment_refs": bay["equipment_refs"],
                "protection_ref": bay["protection_ref"],
                "tags": bay["tags"],
                "meta": bay["meta"],
            }
        ]
    }
    return payload


def _enm_with_nn_field_specs_only() -> dict:
    payload = _enm_with_field_specs_only()
    spec = payload["substations"][0]["meta"].pop("field_specs")[0]
    payload["substations"][0]["meta"]["nn_field_specs"] = [spec]
    return payload


def _enm_with_fw_bay() -> dict:
    payload = _enm_with_bay()
    payload["header"]["revision"] = 6
    payload["bays"][0]["ref_id"] = "bay_fw_1"
    payload["bays"][0]["name"] = "Pole FW"
    payload["bays"][0]["bay_role"] = "OZE"
    payload["measurements"][0]["bay_ref"] = "bay_fw_1"
    payload["measurements"].append(
        {
            "id": "00000000-0000-0000-0000-000000020110",
            "ref_id": "vt_fw_1",
            "name": "VT pola FW",
            "tags": [],
            "meta": {},
            "measurement_type": "VT",
            "bus_ref": "bus_sn_b",
            "bay_ref": "bay_fw_1",
            "rating": {
                "ratio_primary": 15000.0,
                "ratio_secondary": 100.0,
                "accuracy_class": "0.5",
            },
            "connection": "delta",
            "purpose": "combined",
        }
    )
    payload["generators"] = [
        {
            "id": "00000000-0000-0000-0000-000000020111",
            "ref_id": "fw_gen_1",
            "name": "Generator FW 1",
            "tags": [],
            "meta": {},
            "bus_ref": "bus_sn_b",
            "p_mw": 2.5,
            "q_mvar": 0.4,
            "gen_type": "wind_inverter",
            "connection_variant": "block_transformer",
            "blocking_transformer_ref": "tr_block_fw_1",
        }
    ]
    return payload


def test_get_field_view_empty(uow_factory):
    case_id = _nowy_przypadek(uow_factory)
    data = get_enm_field_view(case_id, _klucz(case_id, uow_factory))

    assert data["case_id"] == case_id
    assert data["view_status"] == {
        "data_source": "ENM_FIELD_READ_MODEL",
        "result_state": "NONE",
        "has_field_data": False,
    }
    assert data["summary"]["total_fields"] == 0
    assert data["fields"] == []


def test_get_field_view_returns_canonical_bay_contract(uow_factory):
    case_id = _nowy_przypadek(uow_factory)
    klucz = _klucz(case_id, uow_factory)
    _seed_enm(case_id, _enm_with_bay(), uow_factory)
    run_short_circuit_now(case_id=case_id, klucz_twin=klucz)

    data = get_enm_field_view(case_id, klucz)
    stored_enm = get_enm(klucz)

    assert data["case_id"] == case_id
    assert data["enm_revision"] == stored_enm.header.revision
    assert data["view_status"] == {
        "data_source": "ENM_FIELD_READ_MODEL",
        "result_state": "FRESH",
        "has_field_data": True,
    }
    assert data["summary"]["total_fields"] == 1
    assert data["summary"]["fields_with_results_count"] == 1

    item = data["fields"][0]
    assert item["bay_ref"] == "bay_in_1"
    assert item["bay_name"] == "Pole IN"

    canonical = item["canonical_model"]
    assert canonical["schema_version"] == "v10.bay.1"
    assert canonical["created_from"] == "migracja"
    assert canonical["integrity_status"] == "po_migracji"
    assert canonical["base_model"]["bay_role"] == "LINIA_IN"
    assert canonical["base_model"]["measurement_chain"]["ct_refs"] == ["ct_in_1"]
    assert canonical["base_model"]["protection_config"]["functions"][0]["code"] in {"50", "51"}
    assert canonical["runtime_state"]["measurement_availability"] == "czesciowe"
    assert canonical["runtime_state"]["control_availability"] == "czesciowo_dostepne"

    results = item["project_results"]
    assert results["run_ref"]
    assert results["result_state"] == "czesciowy"
    assert results["main_short_circuit_results_ref"] == results["run_ref"]
    assert results["source_contributions_sc"][0]["source_ref"] == "src_grid"
    assert results["proof_binding"]["proof_ref"].startswith("proof:bay_in_1:")


def test_get_field_view_synthesizes_fields_from_substation_meta(uow_factory):
    case_id = _nowy_przypadek(uow_factory)
    _seed_enm(case_id, _enm_with_field_specs_only(), uow_factory)

    data = get_enm_field_view(case_id, _klucz(case_id, uow_factory))

    assert data["summary"]["total_fields"] == 1
    item = data["fields"][0]
    assert item["bay_ref"] == "bay_in_1"
    assert item["bay_name"] == "Pole IN"
    assert item["canonical_model"]["base_model"]["bay_role"] == "LINIA_IN"
    assert item["canonical_model"]["base_model"]["measurement_chain"]["ct_refs"] == ["ct_in_1"]
    assert item["canonical_model"]["base_model"]["protection_config"]["unit_ref"] == "prot_oc_1"


def test_get_field_view_reads_nn_field_specs_from_substation_meta(uow_factory):
    case_id = _nowy_przypadek(uow_factory)
    _seed_enm(case_id, _enm_with_nn_field_specs_only(), uow_factory)

    data = get_enm_field_view(case_id, _klucz(case_id, uow_factory))

    assert data["summary"]["total_fields"] == 1
    item = data["fields"][0]
    assert item["bay_ref"] == "bay_in_1"
    assert item["canonical_model"]["base_model"]["bay_role"] == "LINIA_IN"
    assert item["canonical_model"]["base_model"]["measurement_chain"]["ct_refs"] == ["ct_in_1"]


def test_get_field_view_returns_fw_source_field(uow_factory):
    case_id = _nowy_przypadek(uow_factory)
    klucz = _klucz(case_id, uow_factory)
    _seed_enm(case_id, _enm_with_fw_bay(), uow_factory)
    run_short_circuit_now(case_id=case_id, klucz_twin=klucz)

    data = get_enm_field_view(case_id, klucz)

    assert data["summary"]["source_fields_count"] == 1

    item = data["fields"][0]
    canonical = item["canonical_model"]
    devices = canonical["base_model"]["primary_devices"]

    assert canonical["base_model"]["bay_role"] == "FW_SN"
    assert canonical["base_model"]["source_endpoint"]["source_kind"] == "FW"
    assert canonical["base_model"]["measurement_chain"]["vt_refs"] == ["vt_fw_1"]
    assert any(device["kind"] == "GENERATOR_FW" for device in devices)

    results = item["project_results"]
    assert results["result_state"] == "czesciowy"
    assert any(entry["source_ref"] == "fw_gen_1" for entry in results["source_contributions_sc"])
