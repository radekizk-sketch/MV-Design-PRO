from __future__ import annotations

from uuid import uuid4

import pytest

pytest.importorskip("fastapi")


def _create_project_and_case(app_client) -> tuple[str, str]:
    project_resp = app_client.post("/api/projects", json={"name": "Projekt DER"})
    assert project_resp.status_code == 201
    project_id = project_resp.json()["id"]

    case_resp = app_client.post(
        "/api/study-cases",
        json={"project_id": project_id, "name": "Przypadek DER"},
    )
    assert case_resp.status_code == 201
    return project_id, case_resp.json()["id"]


def _seed_station_enm(case_id: str, *, transformer_sn_mva: float = 0.63) -> None:
    from enm.models import EnergyNetworkModel
    from enm.store import set_enm

    enm = EnergyNetworkModel.model_validate(
        {
            "header": {
                "name": "Model DER",
                "defaults": {"frequency_hz": 50.0, "unit_system": "SI", "sn_nominal_kv": 15.0},
            },
            "buses": [
                {
                    "ref_id": "station/1/sn_bus",
                    "name": "Szyna SN",
                    "voltage_kv": 15.0,
                    "tags": [],
                    "meta": {},
                },
                {
                    "ref_id": "station/1/nn_bus",
                    "name": "Szyna nN",
                    "voltage_kv": 0.4,
                    "tags": [],
                    "meta": {},
                },
            ],
            "branches": [],
            "sources": [],
            "loads": [],
            "transformers": [
                {
                    "ref_id": "station/1/tr",
                    "name": "Transformator SN/nN",
                    "hv_bus_ref": "station/1/sn_bus",
                    "lv_bus_ref": "station/1/nn_bus",
                    "sn_mva": transformer_sn_mva,
                    "uhv_kv": 15.0,
                    "ulv_kv": 0.4,
                    "uk_percent": 6.0,
                    "pk_kw": 6.5,
                    "tags": [],
                    "meta": {},
                }
            ],
            "generators": [],
            "substations": [
                {
                    "ref_id": "station/1",
                    "name": "Stacja 1",
                    "station_type": "mv_lv",
                    "bus_refs": ["station/1/sn_bus", "station/1/nn_bus"],
                    "transformer_refs": ["station/1/tr"],
                    "tags": [],
                    "meta": {},
                }
            ],
            "bays": [],
            "junctions": [],
            "corridors": [],
            "measurements": [],
            "protection_assignments": [],
            "branch_points": [],
        }
    )
    set_enm(case_id, enm)


def test_create_der_generator_persists_in_case_enm(app_client) -> None:
    project_id, case_id = _create_project_and_case(app_client)
    _seed_station_enm(case_id)

    response = app_client.post(
        f"/api/projects/{project_id}/cases/{case_id}/generators",
        json={
            "station_ref": "station/1",
            "der_kind": "PV",
            "power_mw": 0.5,
            "connection_variant": "nn_side",
            "catalog_ref": "conv-pv-nn-0p5mw-0p4kv",
            "source_name": "PV Stacja 1",
            "nc_rfg_module": "A",
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["error"] is None if "error" in payload else True
    assert payload["changes"]["created_element_ids"]

    generators = payload["snapshot"]["generators"]
    assert len(generators) == 1
    generator = generators[0]
    assert generator["station_ref"] == "station/1"
    assert generator["bus_ref"] == "station/1/nn_bus"
    assert generator["gen_type"] == "pv_inverter"
    assert generator["p_mw"] == 0.5
    assert generator["catalog_ref"] == "conv-pv-nn-0p5mw-0p4kv"
    assert generator["connection_variant"] == "nn_side"

    persisted = app_client.get(f"/api/cases/{case_id}/enm")
    assert persisted.status_code == 200
    assert persisted.json()["generators"][0]["ref_id"] == generator["ref_id"]


def test_create_der_generator_rejects_power_outside_drawer_contract(app_client) -> None:
    project_id, case_id = _create_project_and_case(app_client)
    _seed_station_enm(case_id)

    response = app_client.post(
        f"/api/projects/{project_id}/cases/{case_id}/generators",
        json={
            "station_ref": "station/1",
            "der_kind": "PV",
            "power_mw": 0.0,
            "connection_variant": "nn_side",
            "catalog_ref": "conv-pv-nn-0p5mw-0p4kv",
        },
    )

    assert response.status_code == 422


def test_create_der_generator_rejects_source_above_transformer_capacity(app_client) -> None:
    project_id, case_id = _create_project_and_case(app_client)
    _seed_station_enm(case_id, transformer_sn_mva=0.063)

    response = app_client.post(
        f"/api/projects/{project_id}/cases/{case_id}/generators",
        json={
            "station_ref": "station/1",
            "der_kind": "PV",
            "power_mw": 0.5,
            "connection_variant": "nn_side",
            "catalog_ref": "conv-pv-nn-0p5mw-0p4kv",
            "source_name": "PV za duży dla transformatora",
            "nc_rfg_module": "A",
        },
    )

    assert response.status_code == 422
    body = response.json()
    assert body["detail"]["code"] == "converter.transformer_capacity_exceeded"


def test_create_der_generator_materializes_catalog_block_transformer(app_client) -> None:
    project_id, case_id = _create_project_and_case(app_client)
    _seed_station_enm(case_id, transformer_sn_mva=0.063)

    response = app_client.post(
        f"/api/projects/{project_id}/cases/{case_id}/generators",
        json={
            "station_ref": "station/1",
            "der_kind": "PV",
            "power_mw": 1.0,
            "connection_variant": "dedicated",
            "catalog_ref": "pv_inv_system_1000",
            "block_transformer_catalog_ref": "btr_pv_15_069_1250",
            "source_name": "PV 1000 z transformatorem dedykowanym",
            "nc_rfg_module": "B",
        },
    )

    assert response.status_code == 201
    snapshot = response.json()["snapshot"]
    generator = snapshot["generators"][0]
    assert generator["connection_variant"] == "block_transformer"
    assert generator["catalog_ref"] == "pv_inv_system_1000"
    assert generator["blocking_transformer_ref"]

    block_transformer = next(
        item
        for item in snapshot["transformers"]
        if item["ref_id"] == generator["blocking_transformer_ref"]
    )
    assert block_transformer["catalog_ref"] == "btr_pv_15_069_1250"
    assert block_transformer["sn_mva"] == 1.25
    assert block_transformer["ulv_kv"] == 0.69

    generator_bus = next(
        item for item in snapshot["buses"] if item["ref_id"] == generator["bus_ref"]
    )
    assert generator_bus["voltage_kv"] == 0.69
    assert generator["bus_ref"] == block_transformer["lv_bus_ref"]


def test_create_der_generator_prefers_explicit_block_transformer_catalog(app_client) -> None:
    project_id, case_id = _create_project_and_case(app_client)
    _seed_station_enm(case_id, transformer_sn_mva=0.8)

    response = app_client.post(
        f"/api/projects/{project_id}/cases/{case_id}/generators",
        json={
            "station_ref": "station/1",
            "der_kind": "PV",
            "power_mw": 1.0,
            "connection_variant": "nn_side",
            "catalog_ref": "pv_inv_system_1000",
            "block_transformer_catalog_ref": "btr_pv_15_069_1250",
            "source_name": "PV 1000 przez transformator katalogowy",
            "nc_rfg_module": "B",
        },
    )

    assert response.status_code == 201
    generator = response.json()["snapshot"]["generators"][0]
    assert generator["connection_variant"] == "block_transformer"
    assert generator["blocking_transformer_ref"]


def test_create_der_generator_accepts_materialized_enm_without_study_case(app_client) -> None:
    """Browser-built networks may start from ENM domain ops before DB case hydration."""
    project_id = str(uuid4())
    case_id = str(uuid4())
    _seed_station_enm(case_id)

    response = app_client.post(
        f"/api/projects/{project_id}/cases/{case_id}/generators",
        json={
            "station_ref": "station/1",
            "der_kind": "PV",
            "power_mw": 0.5,
            "connection_variant": "nn_side",
            "catalog_ref": "conv-pv-nn-0p5mw-0p4kv",
            "source_name": "PV Stacja 1",
            "nc_rfg_module": "B",
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["snapshot"]["generators"][0]["station_ref"] == "station/1"


def _utworz_wytworce(app_client) -> tuple[str, str, str]:
    """Projekt + przypadek + wytwórca PV w modelu; zwraca (project_id, case_id, ref)."""
    project_id = str(uuid4())
    case_id = str(uuid4())
    _seed_station_enm(case_id)

    response = app_client.post(
        f"/api/projects/{project_id}/cases/{case_id}/generators",
        json={
            "station_ref": "station/1",
            "der_kind": "PV",
            "power_mw": 0.5,
            "connection_variant": "nn_side",
            "catalog_ref": "conv-pv-nn-0p5mw-0p4kv",
            "source_name": "PV wiązania",
        },
    )
    assert response.status_code == 201
    return project_id, case_id, response.json()["snapshot"]["generators"][0]["ref_id"]


def _wiazania_z_modelu(app_client, case_id: str) -> dict:
    persisted = app_client.get(f"/api/cases/{case_id}/enm")
    assert persisted.status_code == 200
    return persisted.json()["generators"][0].get("materialized_params", {})


def test_wiazania_wytworcy_trafiaja_do_modelu_przez_endpoint(app_client) -> None:
    """V12K-238: wybory z konfiguratora DER mają ścieżkę do modelu.

    Przed tą kartą katalog zabezpieczeń, przekładniki CT/VT, dane prądu zwarciowego i
    model dynamiczny żyły wyłącznie w store przeglądarki (pomiar: V12K-237) — sześć osi
    gotowości opierało werdykt na danych, których model nie zna.
    """
    project_id, case_id, ref = _utworz_wytworce(app_client)

    response = app_client.patch(
        f"/api/projects/{project_id}/cases/{case_id}/generators/{ref}/bindings",
        json={
            "protection_catalog_ref": "ACME_REX200_v1",
            "ct_catalog_ref": "ct_200_5_5p10_10va_abb",
            "vt_catalog_ref": "vt_10kv_100v_05_abb",
            "fault_current_data_ref": "fc_pv_500",
            "dynamic_model_ref": "dyn_pv_wecc",
            "nc_rfg_profile_ref": "pse",
        },
    )

    assert response.status_code == 200
    params = _wiazania_z_modelu(app_client, case_id)
    assert params["protection_catalog_ref"] == "ACME_REX200_v1"
    assert params["ct_catalog_ref"] == "ct_200_5_5p10_10va_abb"
    assert params["vt_catalog_ref"] == "vt_10kv_100v_05_abb"
    assert params["fault_current_data_ref"] == "fc_pv_500"
    assert params["dynamic_model_ref"] == "dyn_pv_wecc"
    assert params["profiles"]["nc_rfg_profile_ref"] == "pse"


def test_pole_pominiete_w_zadaniu_nie_kasuje_wiazania_z_modelu(app_client) -> None:
    """Pominięcie ≠ null. Bez tego rozróżnienia każda edycja jednego pola kasowałaby
    pozostałe wiązania projektowe — cicha utrata danych."""
    project_id, case_id, ref = _utworz_wytworce(app_client)
    baza = f"/api/projects/{project_id}/cases/{case_id}/generators/{ref}/bindings"

    assert (
        app_client.patch(baza, json={"ct_catalog_ref": "ct_150_1_0_5_10va_abb"}).status_code == 200
    )
    assert app_client.patch(baza, json={"vt_catalog_ref": "vt_10kv_100v_05_abb"}).status_code == 200

    params = _wiazania_z_modelu(app_client, case_id)
    assert params["ct_catalog_ref"] == "ct_150_1_0_5_10va_abb"  # PRZEŻYŁO drugie żądanie
    assert params["vt_catalog_ref"] == "vt_10kv_100v_05_abb"


def test_jawny_null_usuwa_wiazanie(app_client) -> None:
    """Jawne wyczyszczenie wiązania musi przywrócić BRAK DANEJ, a nie puste pole."""
    project_id, case_id, ref = _utworz_wytworce(app_client)
    baza = f"/api/projects/{project_id}/cases/{case_id}/generators/{ref}/bindings"

    assert (
        app_client.patch(baza, json={"ct_catalog_ref": "ct_150_1_0_5_10va_abb"}).status_code == 200
    )
    assert app_client.patch(baza, json={"ct_catalog_ref": None}).status_code == 200

    assert "ct_catalog_ref" not in _wiazania_z_modelu(app_client, case_id)


def test_wytworca_nieobecny_w_modelu_daje_blad_a_nie_cichy_zapis(app_client) -> None:
    project_id, case_id, _ = _utworz_wytworce(app_client)

    response = app_client.patch(
        f"/api/projects/{project_id}/cases/{case_id}/generators/gen_nie_ma/bindings",
        json={"ct_catalog_ref": "ct_150_1_0_5_10va_abb"},
    )

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "der_bindings.generator_not_found"


def test_puste_zadanie_jest_odrzucone(app_client) -> None:
    """Żądanie bez ani jednego wiązania nie może „przejść" — wywołujący musiałby wierzyć,
    że coś zapisał."""
    project_id, case_id, ref = _utworz_wytworce(app_client)

    response = app_client.patch(
        f"/api/projects/{project_id}/cases/{case_id}/generators/{ref}/bindings",
        json={},
    )

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "der_bindings.payload_empty"
