"""Tests for ENM API read/validate/run/domain-ops endpoints."""

import pytest
from api.enm import router as enm_router
from enm.canonical_analysis import reset_canonical_runs
from enm.models import EnergyNetworkModel
from enm.store import reset_enm_store, set_enm
from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests.catalog_test_helpers import gpz_payload, gpz_source_record


def _seed_enm(case_id: str, payload: dict) -> None:
    set_enm(case_id, EnergyNetworkModel.model_validate(payload))


@pytest.fixture(autouse=True)
def reset_state():
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


@pytest.fixture
def client():
    """Lightweight app with only ENM router."""
    test_app = FastAPI()
    test_app.include_router(enm_router)
    return TestClient(test_app)


def _valid_enm_payload(name: str) -> dict:
    return {
        "header": {
            "name": name,
            "enm_version": "1.0",
            "defaults": {"frequency_hz": 50, "unit_system": "SI"},
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-01T00:00:00Z",
            "revision": 1,
            "hash_sha256": "",
        },
        "buses": [
            {
                "id": "00000000-0000-0000-0000-000000000001",
                "ref_id": "b1",
                "name": "B1",
                "tags": [],
                "meta": {},
                "voltage_kv": 15,
                "phase_system": "3ph",
            }
        ],
        "branches": [],
        "transformers": [],
        "sources": [
            {
                "id": "00000000-0000-0000-0000-000000000002",
                "tags": [],
                "meta": {},
                **gpz_source_record(
                    ref_id="s1",
                    name="S1",
                    bus_ref="b1",
                    voltage_kv=15.0,
                    sk3_mva=200.0,
                    rx_ratio=0.10,
                ),
            }
        ],
        "loads": [],
        "generators": [],
        "substations": [],
        "bays": [],
        "junctions": [],
        "corridors": [],
        "measurements": [],
        "protection_assignments": [],
        "branch_points": [],
    }


def _valid_enm_payload_with_z0(name: str) -> dict:
    payload = _valid_enm_payload(name)
    payload["sources"][0].update({"r0_ohm": 0.16, "x0_ohm": 1.6})
    return payload


def _valid_enm_with_field_specs(name: str) -> dict:
    payload = _valid_enm_payload(name)
    payload["substations"] = [
        {
            "id": "00000000-0000-0000-0000-000000000003",
            "ref_id": "sub_1",
            "name": "Stacja 1",
            "tags": [],
            "meta": {
                "field_specs": [
                    {
                        "field_ref": "field_in_1",
                        "name": "Pole IN",
                        "bay_role": "IN",
                        "bus_ref": "b1",
                        "equipment_refs": [],
                        "protection_ref": None,
                        "tags": [],
                        "meta": {},
                    }
                ]
            },
            "station_type": "mv_lv",
            "bus_refs": ["b1"],
        }
    ]
    return payload


def _valid_enm_with_legacy_bay(name: str) -> dict:
    payload = _valid_enm_payload(name)
    payload["substations"] = [
        {
            "id": "00000000-0000-0000-0000-000000000003",
            "ref_id": "sub_1",
            "name": "Stacja 1",
            "tags": [],
            "meta": {},
            "station_type": "mv_lv",
            "bus_refs": ["b1"],
        }
    ]
    payload["bays"] = [
        {
            "id": "00000000-0000-0000-0000-000000000004",
            "ref_id": "bay_legacy_1",
            "name": "Pole legacy",
            "tags": [],
            "meta": {},
            "bay_role": "IN",
            "substation_ref": "sub_1",
            "bus_ref": "b1",
            "equipment_refs": [],
            "protection_ref": None,
        }
    ]
    return payload


class TestENMRead:
    def test_get_default_enm(self, client):
        response = client.get("/api/cases/test-case-1/enm")
        assert response.status_code == 200
        data = response.json()
        assert "header" in data
        assert data["header"]["enm_version"] == "1.0"
        assert data["buses"] == []

    def test_get_returns_seeded_enm(self, client):
        _seed_enm("test-case-2", _valid_enm_payload("Updated"))
        response = client.get("/api/cases/test-case-2/enm")
        assert response.status_code == 200
        assert response.json()["header"]["name"] == "Updated"


class TestENMV2Projection:
    def test_v2_projection_returns_read_only_m1_contract(self, client):
        case_id = "test-case-v2-projection"
        _seed_enm(case_id, _valid_enm_payload("V2 Projection"))

        response = client.get(f"/api/cases/{case_id}/enm/v2-projection")

        assert response.status_code == 200
        data = response.json()
        assert data["header"]["enm_version"] == "2.0"
        assert data["header"]["source_enm_version"] == "1.0"
        assert data["header"]["name"] == "V2 Projection"
        assert data["projection_hash_sha256"]
        assert data["element_refs"][0]["ref_id"] == "b1"
        assert data["operating_variants"][0]["ref_id"] == "variant.uklad_normalny"
        assert data["switching_state_snapshots"][0]["ref_id"] == "switching.uklad_normalny.base"
        assert data["summary"]["buses"] == 1

        stored = client.get(f"/api/cases/{case_id}/enm").json()
        assert stored["header"]["enm_version"] == "1.0"

    def test_v2_projection_hash_is_deterministic(self, client):
        case_id = "test-case-v2-projection-deterministic"
        _seed_enm(case_id, _valid_enm_payload("V2 Deterministic"))

        first = client.get(f"/api/cases/{case_id}/enm/v2-projection").json()
        second = client.get(f"/api/cases/{case_id}/enm/v2-projection").json()

        assert first["projection_hash_sha256"] == second["projection_hash_sha256"]


class TestENMValidate:
    def test_empty_enm_fails_validation(self, client):
        client.get("/api/cases/test-case-5/enm")
        response = client.get("/api/cases/test-case-5/enm/validate")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "FAIL"
        codes = [issue["code"] for issue in data["issues"]]
        assert "E001" in codes
        assert "E002" in codes

    def test_valid_enm_passes(self, client):
        _seed_enm("test-case-6", _valid_enm_payload("Test"))
        response = client.get("/api/cases/test-case-6/enm/validate")
        data = response.json()
        assert data["status"] in ("OK", "WARN")
        assert data["analysis_available"]["short_circuit_3f"] is True


class TestRunDispatch:
    def test_run_fails_on_empty_enm(self, client):
        client.get("/api/cases/test-case-7/enm")
        response = client.post("/api/cases/test-case-7/runs/short-circuit")
        assert response.status_code == 422

    def test_run_succeeds_on_valid_enm(self, client):
        _seed_enm("test-case-8", _valid_enm_payload("SC Test"))
        response = client.post("/api/cases/test-case-8/runs/short-circuit")
        assert response.status_code == 200
        data = response.json()
        assert data["analysis_type"] == "short_circuit_3f"
        assert len(data["results"]) >= 1
        assert data["results"][0]["ikss_a"] > 0

    def test_run_dispatch_ignores_client_snapshot_body(self, client):
        case_id = "test-case-run-draft-isolation"
        _seed_enm(case_id, _valid_enm_payload("Committed ENM"))

        response = client.post(
            f"/api/cases/{case_id}/runs/short-circuit",
            json={
                "snapshot": {"header": {"name": "Wstrzykniety draft"}, "buses": []},
                "enm": {"buses": [], "sources": []},
                "buses": [],
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["case_id"] == case_id
        assert data["analysis_type"] == "short_circuit_3f"
        assert len(data["results"]) >= 1
        assert data["results"][0]["ikss_a"] > 0

    def test_run_dispatch_accepts_fault_type_1f_without_accepting_enm_draft(self, client):
        case_id = "test-case-run-sc-1f"
        _seed_enm(case_id, _valid_enm_payload_with_z0("Committed ENM Z0"))

        response = client.post(
            f"/api/cases/{case_id}/runs/short-circuit",
            json={
                "fault_type": "1F",
                "snapshot": {"header": {"name": "Wstrzykniety draft"}, "buses": []},
                "enm": {"buses": [], "sources": []},
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["analysis_type"] == "short_circuit_1f"
        assert data["short_circuit_type"] == "1F"
        assert len(data["results"]) >= 1
        assert data["results"][0]["short_circuit_type"] == "1F"
        assert data["results"][0]["reporting_status"] == "reportable"
        assert data["results"][0]["proof_status"] == "complete"
        assert data["results"][0]["proof_ref"].startswith("proof:short-circuit:")
        assert "z0_ohm" in data["results"][0]["white_box_trace"][0]["inputs"]

    def test_run_dispatch_accepts_fault_type_2fg_with_reportable_proof(self, client):
        case_id = "test-case-run-sc-2fg"
        _seed_enm(case_id, _valid_enm_payload_with_z0("Committed ENM Z0"))

        response = client.post(
            f"/api/cases/{case_id}/runs/short-circuit",
            json={"fault_type": "2F+Z"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["analysis_type"] == "short_circuit_2fg"
        assert data["short_circuit_type"] == "2F+G"
        assert data["reporting_status"] == "reportable"
        assert data["proof_status"] == "complete"
        assert len(data["results"]) >= 1
        assert data["results"][0]["short_circuit_type"] == "2F+G"
        assert data["results"][0]["proof_binding"]["z0_source"] == "ENM_COMMITTED"
        assert data["results"][0]["dopuszczalnosc_raportowa"] is True


class TestDomainOpsCatalogPolicy:
    def test_domain_ops_rejects_missing_catalog_binding_and_keeps_snapshot(self, client):
        case_id = "test-case-domain-ops-1"

        add_source = client.post(
            f"/api/cases/{case_id}/enm/domain-ops",
            json={
                "operation": {
                    "name": "add_grid_source_sn",
                    "payload": gpz_payload(voltage_kv=15.0, sk3_mva=250.0, rx_ratio=0.10),
                },
            },
        )
        assert add_source.status_code == 200

        before = client.get(f"/api/cases/{case_id}/enm").json()
        before_hash = before["header"]["hash_sha256"]

        malformed = client.post(
            f"/api/cases/{case_id}/enm/domain-ops",
            json={
                "snapshot_base_hash": before_hash,
                "operation": {
                    "name": "continue_trunk_segment_sn",
                    "payload": {
                        "from_terminal": {"type": "source"},
                        "segment": {"rodzaj": "KABEL", "dlugosc_m": 200.0},
                    },
                },
            },
        )
        assert malformed.status_code == 422
        body = malformed.json()
        assert body["detail"]["code"] == "catalog.ref_required"

        after = client.get(f"/api/cases/{case_id}/enm").json()
        assert after["header"]["hash_sha256"] == before_hash
        assert after["branches"] == before["branches"]

    def test_domain_ops_add_ct_persists_measurement_for_field_spec(self, client):
        case_id = "test-case-domain-ops-ct-adapter"
        _seed_enm(case_id, _valid_enm_with_field_specs("Field Adapter"))

        response = client.post(
            f"/api/cases/{case_id}/enm/domain-ops",
            json={
                "operation": {
                    "name": "add_ct",
                    "payload": {
                        "field_ref": "field_in_1",
                        "ratio_primary_a": 400.0,
                        "ratio_secondary_a": 5.0,
                        "catalog_binding": {
                            "catalog_namespace": "CT",
                            "catalog_item_id": "ct_400_5_5p20_15va_abb",
                            "catalog_item_version": "2024.1",
                        },
                    },
                }
            },
        )

        assert response.status_code == 200
        body = response.json()
        assert body.get("error") is None
        assert "changes" in body
        assert body["changes"]["created_element_ids"]

        after = client.get(f"/api/cases/{case_id}/enm").json()
        assert len(after["measurements"]) == 1
        measurement = after["measurements"][0]
        assert measurement["measurement_type"] == "CT"
        assert measurement["bay_ref"] == "field_in_1"
        assert measurement["bus_ref"] == "b1"
        assert measurement["catalog_ref"] == "ct_400_5_5p20_15va_abb"
        assert measurement["catalog_namespace"] == "CT"
        assert measurement["source_mode"] == "KATALOG"

    def test_domain_ops_add_relay_persists_protection_for_field_spec(self, client):
        case_id = "test-case-domain-ops-relay-adapter"
        payload = _valid_enm_with_field_specs("Relay Adapter")
        payload["buses"].append(
            {
                "id": "00000000-0000-0000-0000-000000000004",
                "ref_id": "b2",
                "name": "B2",
                "tags": [],
                "meta": {},
                "voltage_kv": 15,
                "phase_system": "3ph",
            }
        )
        payload["branches"].append(
            {
                "id": "00000000-0000-0000-0000-000000000005",
                "ref_id": "brk_1",
                "name": "Wyłącznik pola",
                "tags": [],
                "meta": {},
                "from_bus_ref": "b1",
                "to_bus_ref": "b2",
                "status": "closed",
                "type": "breaker",
            }
        )
        payload["substations"][0]["meta"]["field_specs"][0]["equipment_refs"] = ["brk_1"]
        _seed_enm(case_id, payload)

        add_ct = client.post(
            f"/api/cases/{case_id}/enm/domain-ops",
            json={
                "operation": {
                    "name": "add_ct",
                    "payload": {
                        "field_ref": "field_in_1",
                        "ratio_primary_a": 400.0,
                        "ratio_secondary_a": 5.0,
                        "catalog_binding": {
                            "catalog_namespace": "CT",
                            "catalog_item_id": "ct_400_5_5p20_15va_abb",
                            "catalog_item_version": "2024.1",
                        },
                    },
                }
            },
        )
        assert add_ct.status_code == 200

        response = client.post(
            f"/api/cases/{case_id}/enm/domain-ops",
            json={
                "operation": {
                    "name": "add_relay",
                    "payload": {
                        "field_ref": "field_in_1",
                        "breaker_ref": "brk_1",
                        "relay_type": "NADPRADOWY",
                        "protection": {"catalog_item_id": "ACME_REX500_v1"},
                    },
                }
            },
        )

        assert response.status_code == 200
        body = response.json()
        assert body.get("error") is None

        after = client.get(f"/api/cases/{case_id}/enm").json()
        assert len(after["protection_assignments"]) == 1
        assignment = after["protection_assignments"][0]
        assert assignment["breaker_ref"] == "brk_1"
        assert assignment["ct_ref"] == after["measurements"][0]["ref_id"]
        assert assignment["catalog_ref"] == "ACME_REX500_v1"
        assert assignment["catalog_namespace"] == "ZABEZPIECZENIE"
        field_spec = after["substations"][0]["meta"]["field_specs"][0]
        assert field_spec["protection_ref"] == assignment["ref_id"]

    def test_domain_ops_rejects_legacy_bay_parameter_update_without_persisting(self, client):
        case_id = "test-case-domain-ops-legacy-bay"
        _seed_enm(case_id, _valid_enm_with_legacy_bay("Legacy Bay"))

        before = client.get(f"/api/cases/{case_id}/enm").json()

        response = client.post(
            f"/api/cases/{case_id}/enm/domain-ops",
            json={
                "operation": {
                    "name": "update_element_parameters",
                    "payload": {
                        "element_ref": "bay_legacy_1",
                        "parameters": {"name": "Pole po zmianie"},
                    },
                }
            },
        )

        assert response.status_code == 200
        body = response.json()
        assert body["error_code"] == "field.legacy_write_disabled"

        after = client.get(f"/api/cases/{case_id}/enm").json()
        assert after == before

    def test_domain_ops_rejects_malformed_catalog_binding_and_keeps_snapshot(self, client):
        case_id = "test-case-domain-ops-2"

        add_source = client.post(
            f"/api/cases/{case_id}/enm/domain-ops",
            json={
                "operation": {
                    "name": "add_grid_source_sn",
                    "payload": gpz_payload(voltage_kv=15.0, sk3_mva=250.0, rx_ratio=0.10),
                },
            },
        )
        assert add_source.status_code == 200

        before = client.get(f"/api/cases/{case_id}/enm").json()
        before_hash = before["header"]["hash_sha256"]

        malformed = client.post(
            f"/api/cases/{case_id}/enm/domain-ops",
            json={
                "snapshot_base_hash": before_hash,
                "operation": {
                    "name": "continue_trunk_segment_sn",
                    "payload": {
                        "from_terminal": {"type": "source"},
                        "segment": {
                            "rodzaj": "KABEL",
                            "dlugosc_m": 200.0,
                            "catalog_binding": {"namespace": "KABEL_SN"},
                        },
                    },
                },
            },
        )
        assert malformed.status_code == 422
        body = malformed.json()
        assert body["detail"]["code"] == "catalog.ref_required"

        after = client.get(f"/api/cases/{case_id}/enm").json()
        assert after["header"]["hash_sha256"] == before_hash
        assert after["branches"] == before["branches"]
