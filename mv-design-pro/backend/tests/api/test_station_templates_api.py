"""Tests for K30-16 station templates REST API."""

from __future__ import annotations

from fastapi.testclient import TestClient


def _make_client():
    from api.main import app
    return TestClient(app)


def test_list_endpoint_returns_57_templates() -> None:
    client = _make_client()
    response = client.get("/api/station-templates")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 57
    assert len(data["templates"]) == data["total"]


def test_list_endpoint_filter_by_category() -> None:
    client = _make_client()
    response = client.get("/api/station-templates?category=prosument_pv")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 6  # 6 prosument PV templates
    for t in data["templates"]:
        assert t["category"] == "prosument_pv"


def test_list_endpoint_invalid_category() -> None:
    client = _make_client()
    response = client.get("/api/station-templates?category=invalid")
    assert response.status_code == 400


def test_categories_endpoint_lists_10_categories() -> None:
    client = _make_client()
    response = client.get("/api/station-templates/categories")
    assert response.status_code == 200
    data = response.json()
    assert len(data["categories"]) == 10
    assert data["total_templates"] >= 57
    # Each category has icon + label + count
    for cat in data["categories"]:
        assert "id" in cat
        assert "label_pl" in cat
        assert "icon" in cat
        assert cat["template_count"] >= 1


def test_get_template_returns_full_schema() -> None:
    client = _make_client()
    response = client.get("/api/station-templates/tpl_sn_nn_630kva")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "tpl_sn_nn_630kva"
    assert "schema" in data
    schema = data["schema"]
    # Must expose editable params
    assert "transformer_options" in schema
    assert len(schema["transformer_options"]) > 0
    assert "nn_feeders_count" in schema
    assert "sn_bays_count" in schema
    # Each editable param exposes min/max/default
    assert "min_value" in schema["nn_feeders_count"]
    assert "max_value" in schema["nn_feeders_count"]


def test_get_template_404_for_unknown() -> None:
    client = _make_client()
    response = client.get("/api/station-templates/tpl_nonexistent")
    assert response.status_code == 404


def test_e2tango_protection_appears_in_options() -> None:
    """E2Tango family (K30-16 user-requested) must show w protection options."""
    client = _make_client()
    response = client.get("/api/station-templates/tpl_sn_nn_630kva")
    assert response.status_code == 200
    schema = response.json()["schema"]
    protection_refs = [p["device_catalog_ref"] for p in schema["sn_bay_protection_options"]]
    assert any("E2TANGO" in p for p in protection_refs), (
        f"E2Tango must appear w protection options. Got: {protection_refs}"
    )
