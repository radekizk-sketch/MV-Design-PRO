"""Tests for ENM topology and readiness endpoints."""

import pytest
from api.enm import router as enm_router
from enm.canonical_analysis import reset_canonical_runs
from enm.models import EnergyNetworkModel
from enm.store import reset_enm_store, set_enm
from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests.catalog_test_helpers import gpz_source_record


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
    """Lekka aplikacja z routerem ENM."""
    test_app = FastAPI()
    test_app.include_router(enm_router)
    return TestClient(test_app)


def _valid_enm_with_topology():
    """ENM z pełną topologią: stacje, pola, węzły T, magistrale."""
    return {
        "header": {
            "name": "Topology Test",
            "enm_version": "1.0",
            "defaults": {"frequency_hz": 50, "unit_system": "SI"},
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-01T00:00:00Z",
            "revision": 1,
            "hash_sha256": "",
        },
        "buses": [
            {
                "id": "00000000-0000-0000-0000-000000000101",
                "ref_id": "bus_sn_a",
                "name": "Szyna SN A",
                "tags": [],
                "meta": {},
                "voltage_kv": 15,
                "phase_system": "3ph",
            },
            {
                "id": "00000000-0000-0000-0000-000000000102",
                "ref_id": "bus_sn_b",
                "name": "Szyna SN B",
                "tags": [],
                "meta": {},
                "voltage_kv": 15,
                "phase_system": "3ph",
            },
            {
                "id": "00000000-0000-0000-0000-000000000103",
                "ref_id": "bus_nn_1",
                "name": "Szyna nn 1",
                "tags": [],
                "meta": {},
                "voltage_kv": 0.4,
                "phase_system": "3ph",
            },
        ],
        "sources": [
            {
                "id": "00000000-0000-0000-0000-000000000104",
                "tags": [],
                "meta": {},
                **gpz_source_record(
                    ref_id="src_1",
                    name="Grid",
                    bus_ref="bus_sn_a",
                    voltage_kv=15.0,
                    sk3_mva=200.0,
                    rx_ratio=0.10,
                ),
            },
        ],
        "branches": [
            {
                "id": "00000000-0000-0000-0000-000000000105",
                "ref_id": "line_1",
                "name": "Linia L1",
                "tags": [],
                "meta": {},
                "type": "line_overhead",
                "from_bus_ref": "bus_sn_a",
                "to_bus_ref": "bus_sn_b",
                "status": "closed",
                "length_km": 10,
                "r_ohm_per_km": 0.443,
                "x_ohm_per_km": 0.34,
                "catalog_ref": "CAT-CAB-001",
            },
        ],
        "transformers": [
            {
                "id": "00000000-0000-0000-0000-000000000106",
                "ref_id": "trafo_1",
                "name": "T1",
                "tags": [],
                "meta": {},
                "hv_bus_ref": "bus_sn_b",
                "lv_bus_ref": "bus_nn_1",
                "sn_mva": 0.63,
                "uhv_kv": 15,
                "ulv_kv": 0.4,
                "uk_percent": 4.5,
                "pk_kw": 6.5,
                "catalog_ref": "CAT-TR-001",
            },
        ],
        "loads": [
            {
                "id": "00000000-0000-0000-0000-000000000107",
                "ref_id": "load_1",
                "name": "Odbior 1",
                "tags": [],
                "meta": {},
                "bus_ref": "bus_nn_1",
                "p_mw": 0.2,
                "q_mvar": 0.1,
                "model": "pq",
            },
        ],
        "generators": [],
        "substations": [
            {
                "id": "00000000-0000-0000-0000-000000000108",
                "ref_id": "sub_gpz",
                "name": "GPZ",
                "tags": [],
                "meta": {},
                "station_type": "gpz",
                "bus_refs": ["bus_sn_a"],
            },
            {
                "id": "00000000-0000-0000-0000-000000000109",
                "ref_id": "sub_1",
                "name": "Stacja 1",
                "tags": [],
                # P0.1 nN (karta P0.1, E063): stacja z odbiorem na szynie nN
                # (bus_nn_1/load_1 nizej) musi deklarowac uklad uziemienia sieci nN.
                "meta": {"nn_earthing_system": "TN-S"},
                "station_type": "mv_lv",
                "bus_refs": ["bus_sn_b", "bus_nn_1"],
                "transformer_refs": ["trafo_1"],
            },
        ],
        "bays": [
            {
                "id": "00000000-0000-0000-0000-000000000110",
                "ref_id": "bay_in_1",
                "name": "Pole IN",
                "tags": [],
                "meta": {},
                "bay_role": "IN",
                "substation_ref": "sub_1",
                "bus_ref": "bus_sn_b",
            },
            {
                "id": "00000000-0000-0000-0000-000000000111",
                "ref_id": "bay_tr_1",
                "name": "Pole TR",
                "tags": [],
                "meta": {},
                "bay_role": "TR",
                "substation_ref": "sub_1",
                "bus_ref": "bus_sn_b",
            },
        ],
        "junctions": [
            {
                "id": "00000000-0000-0000-0000-000000000112",
                "ref_id": "junc_1",
                "name": "T-node 1",
                "tags": [],
                "meta": {},
                "connected_branch_refs": ["line_1", "line_1", "line_1"],
                "junction_type": "T_node",
            },
        ],
        "corridors": [
            {
                "id": "00000000-0000-0000-0000-000000000113",
                "ref_id": "corr_a",
                "name": "Magistrala A",
                "tags": [],
                "meta": {},
                "corridor_type": "radial",
                "ordered_segment_refs": ["line_1"],
            },
        ],
        "measurements": [],
        "protection_assignments": [],
        "branch_points": [],
    }


class TestTopologyEndpoint:
    def test_get_topology_empty(self, client):
        response = client.get("/api/cases/topo-test-1/enm/topology")
        assert response.status_code == 200
        data = response.json()
        assert data["substations"] == []
        assert data["bays"] == []
        assert data["junctions"] == []
        assert data["corridors"] == []

    def test_get_topology_with_data(self, client):
        _seed_enm("topo-test-2", _valid_enm_with_topology())

        response = client.get("/api/cases/topo-test-2/enm/topology")
        assert response.status_code == 200
        data = response.json()
        assert len(data["substations"]) == 2
        assert len(data["bays"]) == 2
        assert len(data["junctions"]) == 1
        assert len(data["corridors"]) == 1
        assert data["bus_count"] == 3
        assert data["branch_count"] == 1
        assert data["transformer_count"] == 1


class TestReadinessEndpoint:
    def test_readiness_empty_enm(self, client):
        response = client.get("/api/cases/ready-test-1/enm/readiness")
        assert response.status_code == 200
        data = response.json()
        assert data["validation"]["status"] == "FAIL"
        assert data["readiness"]["ready"] is False
        assert any(issue["severity"] == "BLOCKER" for issue in data["readiness"]["blockers"])
        assert data["analysis_readiness"]["short_circuit_3f"] is False
        assert data["topology_completeness"]["has_substations"] is False

    def test_readiness_with_topology(self, client):
        _seed_enm("ready-test-2", _valid_enm_with_topology())

        response = client.get("/api/cases/ready-test-2/enm/readiness")
        assert response.status_code == 200
        data = response.json()
        assert data["validation"]["status"] == "WARN"
        assert data["readiness"]["ready"] is True
        assert data["readiness"]["blockers"] == []
        assert data["analysis_readiness"]["short_circuit_3f"] is True
        assert data["analysis_readiness"]["load_flow"] is True
        assert data["topology_completeness"]["has_substations"] is True
        assert data["topology_completeness"]["has_bays"] is True
        assert data["topology_completeness"]["has_junctions"] is True
        assert data["topology_completeness"]["has_corridors"] is True
        assert data["element_counts"]["substations"] == 2
        assert data["element_counts"]["bays"] == 2
        assert data["element_counts"]["buses"] == 3

    def test_readiness_contract_shape(self, client):
        response = client.get("/api/cases/shape-test-1/enm/readiness")
        assert response.status_code == 200
        data = response.json()
        assert set(data.keys()) == {
            "case_id",
            "enm_revision",
            "validation",
            "readiness",
            "analysis_readiness",
            "topology_completeness",
            "element_counts",
        }
        assert "status" in data["validation"]
        assert "issues" in data["validation"]
        assert data["validation"]["status"] in ("OK", "WARN", "FAIL")
        assert "ready" in data["readiness"]
        assert "blockers" in data["readiness"]
        assert isinstance(data["readiness"]["ready"], bool)
        assert isinstance(data["readiness"]["blockers"], list)
        assert set(data["analysis_readiness"].keys()) == {
            "short_circuit_3f",
            "short_circuit_1f",
            "load_flow",
            "protection",
        }
        assert set(data["topology_completeness"].keys()) == {
            "has_substations",
            "has_bays",
            "has_junctions",
            "has_corridors",
        }
        assert set(data["element_counts"].keys()) == {
            "buses",
            "branches",
            "transformers",
            "sources",
            "loads",
            "generators",
            "substations",
            "bays",
            "junctions",
            "corridors",
            "measurements",
            "protection_assignments",
        }

    def test_readiness_false_blocker_e009(self, client):
        enm = _valid_enm_with_topology()
        enm["branches"][0]["catalog_ref"] = None
        _seed_enm("ready-test-3", enm)

        response = client.get("/api/cases/ready-test-3/enm/readiness")
        assert response.status_code == 200
        data = response.json()
        assert data["validation"]["status"] == "FAIL"
        assert data["readiness"]["ready"] is False
        assert any(issue["code"] == "E009" for issue in data["readiness"]["blockers"])


class TestENMRoundtripExtensions:
    def test_roundtrip_get_with_extensions(self, client):
        _seed_enm("put-ext-2", _valid_enm_with_topology())

        response = client.get("/api/cases/put-ext-2/enm")
        assert response.status_code == 200
        data = response.json()
        assert data["substations"][0]["ref_id"] == "sub_gpz"
        assert data["bays"][0]["ref_id"] == "bay_in_1"
        assert data["junctions"][0]["junction_type"] == "T_node"
        assert data["corridors"][0]["corridor_type"] == "radial"
