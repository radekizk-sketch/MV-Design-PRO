"""
Tests for SLD Geometry Overrides API (RUN #3H §3).

Covers:
- GET /sld-overrides (empty initial state)
- PUT /sld-overrides (save + deterministic hash)
- POST /sld-overrides/validate (with known node/block ids)
- POST /sld-overrides/reset (back to empty)
- hash stability and determinism
- error handling (invalid scope/operation)
"""

import pytest
from api.main import app
from api.sld_overrides import _overrides_store
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def clear_store():
    """Clear in-memory store before each test."""
    _overrides_store.clear()
    yield
    _overrides_store.clear()


@pytest.fixture
def client():
    return TestClient(app)


# =============================================================================
# GET /sld-overrides
# =============================================================================


class TestGetOverrides:
    def test_get_empty_overrides(self, client: TestClient):
        resp = client.get("/api/study-cases/case-1/sld-overrides")
        assert resp.status_code == 200
        data = resp.json()
        assert data["overrides_version"] == "1.0"
        assert data["study_case_id"] == "case-1"
        assert data["items"] == []
        assert len(data["overrides_hash"]) == 64

    def test_get_returns_saved_overrides(self, client: TestClient):
        # Save first
        client.put(
            "/api/study-cases/case-1/sld-overrides",
            json={
                "snapshot_hash": "snap-abc",
                "items": [
                    {
                        "element_id": "node-1",
                        "scope": "NODE",
                        "operation": "MOVE_DELTA",
                        "payload": {"dx": 40, "dy": -20},
                    }
                ],
            },
        )
        # Get
        resp = client.get("/api/study-cases/case-1/sld-overrides")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["items"]) == 1
        assert data["items"][0]["element_id"] == "node-1"


# =============================================================================
# PUT /sld-overrides
# =============================================================================


class TestPutOverrides:
    def test_save_and_get_back(self, client: TestClient):
        body = {
            "snapshot_hash": "snap-123",
            "items": [
                {
                    "element_id": "node-1",
                    "scope": "NODE",
                    "operation": "MOVE_DELTA",
                    "payload": {"dx": 20, "dy": 0},
                },
                {
                    "element_id": "station-GPZ",
                    "scope": "BLOCK",
                    "operation": "MOVE_DELTA",
                    "payload": {"dx": 60, "dy": -40},
                },
            ],
        }
        resp = client.put("/api/study-cases/case-1/sld-overrides", json=body)
        assert resp.status_code == 200
        data = resp.json()
        assert data["overrides_version"] == "1.0"
        assert data["study_case_id"] == "case-1"
        assert data["snapshot_hash"] == "snap-123"
        assert len(data["items"]) == 2
        assert len(data["overrides_hash"]) == 64

    def test_save_returns_canonical_order(self, client: TestClient):
        body = {
            "snapshot_hash": "snap",
            "items": [
                {
                    "element_id": "z-node",
                    "scope": "NODE",
                    "operation": "MOVE_DELTA",
                    "payload": {"dx": 0, "dy": 0},
                },
                {
                    "element_id": "a-block",
                    "scope": "BLOCK",
                    "operation": "MOVE_DELTA",
                    "payload": {"dx": 0, "dy": 0},
                },
            ],
        }
        resp = client.put("/api/study-cases/case-1/sld-overrides", json=body)
        data = resp.json()
        # Items sorted by element_id
        assert data["items"][0]["element_id"] == "a-block"
        assert data["items"][1]["element_id"] == "z-node"

    def test_hash_deterministic_across_saves(self, client: TestClient):
        body = {
            "snapshot_hash": "snap",
            "items": [
                {
                    "element_id": "node-1",
                    "scope": "NODE",
                    "operation": "MOVE_DELTA",
                    "payload": {"dx": 40, "dy": 20},
                },
            ],
        }
        r1 = client.put("/api/study-cases/case-1/sld-overrides", json=body)
        h1 = r1.json()["overrides_hash"]

        # Save again (same data)
        r2 = client.put("/api/study-cases/case-1/sld-overrides", json=body)
        h2 = r2.json()["overrides_hash"]

        assert h1 == h2

    def test_hash_permutation_invariant(self, client: TestClient):
        items_a = [
            {
                "element_id": "node-1",
                "scope": "NODE",
                "operation": "MOVE_DELTA",
                "payload": {"dx": 10, "dy": 20},
            },
            {
                "element_id": "node-2",
                "scope": "NODE",
                "operation": "MOVE_DELTA",
                "payload": {"dx": 30, "dy": 40},
            },
        ]
        items_b = list(reversed(items_a))

        r1 = client.put(
            "/api/study-cases/case-1/sld-overrides", json={"snapshot_hash": "s", "items": items_a}
        )
        r2 = client.put(
            "/api/study-cases/case-2/sld-overrides", json={"snapshot_hash": "s", "items": items_b}
        )

        assert r1.json()["overrides_hash"] == r2.json()["overrides_hash"]

    def test_invalid_scope_returns_422(self, client: TestClient):
        body = {
            "snapshot_hash": "snap",
            "items": [
                {
                    "element_id": "n",
                    "scope": "INVALID",
                    "operation": "MOVE_DELTA",
                    "payload": {"dx": 0, "dy": 0},
                },
            ],
        }
        resp = client.put("/api/study-cases/case-1/sld-overrides", json=body)
        assert resp.status_code == 422

    def test_invalid_operation_returns_422(self, client: TestClient):
        body = {
            "snapshot_hash": "snap",
            "items": [
                {"element_id": "n", "scope": "NODE", "operation": "INVALID_OP", "payload": {}},
            ],
        }
        resp = client.put("/api/study-cases/case-1/sld-overrides", json=body)
        assert resp.status_code == 422


# =============================================================================
# POST /sld-overrides/validate
# =============================================================================


class TestValidateOverrides:
    def test_valid_overrides(self, client: TestClient):
        body = {
            "snapshot_hash": "snap",
            "items": [
                {
                    "element_id": "node-1",
                    "scope": "NODE",
                    "operation": "MOVE_DELTA",
                    "payload": {"dx": 20, "dy": 0},
                },
            ],
            "known_node_ids": ["node-1", "node-2"],
            "known_block_ids": [],
        }
        resp = client.post("/api/study-cases/case-1/sld-overrides/validate", json=body)
        assert resp.status_code == 200
        data = resp.json()
        assert data["valid"] is True
        assert data["errors"] == []

    def test_invalid_element_id(self, client: TestClient):
        body = {
            "snapshot_hash": "snap",
            "items": [
                {
                    "element_id": "unknown",
                    "scope": "NODE",
                    "operation": "MOVE_DELTA",
                    "payload": {"dx": 0, "dy": 0},
                },
            ],
            "known_node_ids": ["node-1"],
            "known_block_ids": [],
        }
        resp = client.post("/api/study-cases/case-1/sld-overrides/validate", json=body)
        data = resp.json()
        assert data["valid"] is False
        assert data["errors"][0]["code"] == "geometry.override_invalid_element"


# =============================================================================
# POST /sld-overrides/reset
# =============================================================================


class TestResetOverrides:
    def test_reset_clears_overrides(self, client: TestClient):
        # Save some overrides
        client.put(
            "/api/study-cases/case-1/sld-overrides",
            json={
                "snapshot_hash": "snap",
                "items": [
                    {
                        "element_id": "node-1",
                        "scope": "NODE",
                        "operation": "MOVE_DELTA",
                        "payload": {"dx": 20, "dy": 0},
                    },
                ],
            },
        )

        # Reset
        resp = client.post("/api/study-cases/case-1/sld-overrides/reset")
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"] == []

        # Verify GET also returns empty
        resp2 = client.get("/api/study-cases/case-1/sld-overrides")
        assert resp2.json()["items"] == []


# =============================================================================
# Hash stability
# =============================================================================


class TestHashStability:
    def test_hash_50x_stable_through_api(self, client: TestClient):
        body = {
            "snapshot_hash": "snap-stable",
            "items": [
                {
                    "element_id": "node-1",
                    "scope": "NODE",
                    "operation": "MOVE_DELTA",
                    "payload": {"dx": 40, "dy": -20},
                },
                {
                    "element_id": "station-GPZ",
                    "scope": "BLOCK",
                    "operation": "MOVE_DELTA",
                    "payload": {"dx": 60, "dy": 0},
                },
            ],
        }

        hashes = set()
        for _ in range(50):
            resp = client.put(f"/api/study-cases/case-{_}/sld-overrides", json=body)
            hashes.add(resp.json()["overrides_hash"])

        assert len(hashes) == 1, f"Expected 1 unique hash, got {len(hashes)}"
