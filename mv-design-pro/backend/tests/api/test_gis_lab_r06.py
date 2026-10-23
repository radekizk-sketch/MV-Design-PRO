from __future__ import annotations

import copy

from api.gis_lab import router
from fastapi import FastAPI
from fastapi.testclient import TestClient

app = FastAPI()
app.include_router(router)
client = TestClient(app)

LINE = {
    "type": "Feature", "id": "SYN-LINE-001",
    "properties": {
        "identity": "SYN-LINE-001", "category": "line_sn",
        "source_locked": True, "electrical_connection_confirmed": False,
    },
    "geometry": {"type": "LineString", "coordinates": [[19.0, 53.0], [19.01, 53.01]]},
}

BASE = {
    "schema": "MV-GIS-LAB-R06", "synthetic": True,
    "enm_write_allowed": False, "scope_equal": False,
    "before_digest": "a" * 64, "after_digest": "b" * 64,
    "before": {"type": "FeatureCollection", "features": []},
    "after": {"type": "FeatureCollection", "features": []},
}


def test_status_blocks_enm():
    assert client.get("/api/gis-lab/r06/status").json()["can_write_to_enm"] is False


def test_preview_returns_revision_diff():
    data = copy.deepcopy(BASE)
    data["after"]["features"].append(copy.deepcopy(LINE))
    response = client.post("/api/gis-lab/r06/reconcile", json=data)
    assert response.status_code == 200, response.text
    report = response.json()
    assert report["counts"]["NEW_CANDIDATE"] == 1
    assert report["enm_write_allowed"] is False


def test_false_enm_write_denied():
    data = copy.deepcopy(BASE)
    data["enm_write_allowed"] = True
    assert client.post("/api/gis-lab/r06/reconcile", json=data).status_code == 422


def test_hidden_domain_ops_denied():
    data = copy.deepcopy(BASE)
    data["domain_operations"] = [{"op": "delete_branch"}]
    assert client.post("/api/gis-lab/r06/reconcile", json=data).status_code == 422


def test_malicious_origin_denied():
    response = client.post(
        "/api/gis-lab/r06/reconcile", json=BASE,
        headers={"Origin": "https://untrusted.example"},
    )
    assert response.status_code == 403


def test_non_lab_identity_denied():
    data = copy.deepcopy(BASE)
    feature = copy.deepcopy(LINE)
    feature["id"] = "OPERATOR-REAL-123"
    data["after"]["features"].append(feature)
    assert client.post("/api/gis-lab/r06/reconcile", json=data).status_code == 422


def test_size_guard_denies_excessive_payload():
    data = copy.deepcopy(BASE)
    feature = copy.deepcopy(LINE)
    feature["properties"]["junk"] = "X" * 2_010_000
    data["after"]["features"].append(feature)
    assert client.post("/api/gis-lab/r06/reconcile", json=data).status_code == 413


def test_geometry_outside_world_denied():
    data = copy.deepcopy(BASE)
    feature = copy.deepcopy(LINE)
    feature["geometry"]["coordinates"][1] = [9999, 9999]
    data["after"]["features"].append(feature)
    assert client.post("/api/gis-lab/r06/reconcile", json=data).status_code == 422
