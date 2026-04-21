"""
Tests for Switchgear Config API — round-trip PUT→GET + validation.

RUN #3I COMMIT 2.
"""

import pytest
from api.main import app
from api.switchgear_config import _config_store
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def _clear_store():
    """Clear in-memory store before each test."""
    _config_store.clear()
    yield
    _config_store.clear()


client = TestClient(app)


# =============================================================================
# HELPERS
# =============================================================================

MINIMAL_CONFIG = {
    "fields": [
        {
            "field_id": "field_1",
            "pole_type": "POLE_LINIOWE_SN",
            "field_role": "LINE_IN",
            "bus_section_id": "bus_1",
        }
    ],
    "devices": [
        {
            "device_id": "dev_cb_1",
            "field_id": "field_1",
            "device_type": "CB",
            "aparat_type": "WYLACZNIK",
        },
        {
            "device_id": "dev_ch_1",
            "field_id": "field_1",
            "device_type": "CABLE_HEAD",
            "aparat_type": "GLOWICA_KABLOWA",
        },
    ],
    "catalog_bindings": [
        {
            "device_id": "dev_cb_1",
            "catalog_id": "cat_001",
            "catalog_name": "Wylacznik ABB",
        },
        {
            "device_id": "dev_ch_1",
            "catalog_id": "cat_002",
            "catalog_name": "Glowica 24kV",
        },
    ],
    "protection_bindings": [],
}


# =============================================================================
# GET (empty)
# =============================================================================


class TestGetConfig:
    def test_get_empty_returns_default(self) -> None:
        resp = client.get("/api/switchgear/station_x/config")
        assert resp.status_code == 200
        data = resp.json()
        assert data["station_id"] == "station_x"
        assert data["fields"] == []
        assert data["devices"] == []
        assert "canonical_hash" in data

    def test_get_returns_canonical_hash(self) -> None:
        resp = client.get("/api/switchgear/s1/config")
        data = resp.json()
        assert len(data["canonical_hash"]) == 64


# =============================================================================
# PUT → GET round-trip
# =============================================================================


class TestPutGetRoundTrip:
    def test_put_then_get_identical(self) -> None:
        # PUT
        put_resp = client.put("/api/switchgear/station_1/config", json=MINIMAL_CONFIG)
        assert put_resp.status_code == 200
        put_data = put_resp.json()

        # GET
        get_resp = client.get("/api/switchgear/station_1/config")
        assert get_resp.status_code == 200
        get_data = get_resp.json()

        # Round-trip: identical hash
        assert put_data["canonical_hash"] == get_data["canonical_hash"]
        assert put_data["fields"] == get_data["fields"]
        assert put_data["devices"] == get_data["devices"]
        assert put_data["catalog_bindings"] == get_data["catalog_bindings"]

    def test_put_canonicalizes_order(self) -> None:
        # Send fields in reverse order
        config = {
            "fields": [
                {"field_id": "z_field", "pole_type": "POLE_LINIOWE_SN", "field_role": "LINE_IN"},
                {"field_id": "a_field", "pole_type": "POLE_LINIOWE_SN", "field_role": "LINE_OUT"},
            ],
            "devices": [],
            "catalog_bindings": [],
            "protection_bindings": [],
        }
        resp = client.put("/api/switchgear/s1/config", json=config)
        data = resp.json()
        # Should be sorted by field_id
        assert data["fields"][0]["field_id"] == "a_field"
        assert data["fields"][1]["field_id"] == "z_field"

    def test_put_overwrite(self) -> None:
        # First PUT
        client.put("/api/switchgear/s1/config", json=MINIMAL_CONFIG)

        # Second PUT with empty
        empty = {"fields": [], "devices": [], "catalog_bindings": [], "protection_bindings": []}
        resp = client.put("/api/switchgear/s1/config", json=empty)
        data = resp.json()
        assert data["fields"] == []
        assert data["devices"] == []


# =============================================================================
# VALIDATE
# =============================================================================


class TestValidate:
    def test_validate_valid_config(self) -> None:
        resp = client.post("/api/switchgear/station_1/validate", json=MINIMAL_CONFIG)
        assert resp.status_code == 200
        data = resp.json()
        assert data["valid"] is True
        assert len(data["issues"]) == 0

    def test_validate_catalog_missing(self) -> None:
        config = {
            "fields": [
                {"field_id": "f1", "pole_type": "POLE_LINIOWE_SN", "field_role": "LINE_IN"},
            ],
            "devices": [
                {
                    "device_id": "d1",
                    "field_id": "f1",
                    "device_type": "CB",
                    "aparat_type": "WYLACZNIK",
                },
            ],
            "catalog_bindings": [],
            "protection_bindings": [],
        }
        resp = client.post("/api/switchgear/s1/validate", json=config)
        data = resp.json()
        assert data["valid"] is False

        catalog_issues = [i for i in data["issues"] if i["code"] == "catalog.ref_missing"]
        assert len(catalog_issues) >= 1

        catalog_fixes = [fa for fa in data["fix_actions"] if fa["code"] == "catalog.ref_missing"]
        assert len(catalog_fixes) >= 1
        assert catalog_fixes[0]["action"] == "NAVIGATE_TO_WIZARD_CATALOG_PICKER"

    def test_validate_polish_messages(self) -> None:
        config = {
            "fields": [
                {"field_id": "f1", "pole_type": "POLE_LINIOWE_SN", "field_role": "LINE_IN"},
            ],
            "devices": [],
            "catalog_bindings": [],
            "protection_bindings": [],
        }
        resp = client.post("/api/switchgear/s1/validate", json=config)
        data = resp.json()
        # Should have field.missing_required_device issues with Polish messages
        for issue in data["issues"]:
            assert "message_pl" in issue
            assert len(issue["message_pl"]) > 0

    def test_validate_returns_hash(self) -> None:
        resp = client.post("/api/switchgear/s1/validate", json=MINIMAL_CONFIG)
        data = resp.json()
        assert "canonical_hash" in data
        assert len(data["canonical_hash"]) == 64
