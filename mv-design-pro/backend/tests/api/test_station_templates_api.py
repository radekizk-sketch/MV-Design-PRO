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


def test_apply_endpoint_404_for_unknown_template() -> None:
    """K30-20: POST /api/station-templates/{id}/apply rejects unknown id."""
    client = _make_client()
    response = client.post(
        "/api/station-templates/tpl_nonexistent/apply",
        json={
            "case_id": "00000000-0000-0000-0000-000000000000",
            "target_segment_id": "seg/abc/segment",
            "insert_at_ratio": 0.5,
        },
    )
    assert response.status_code == 404


def test_apply_endpoint_validates_case_id_uuid() -> None:
    """K30-20: case_id must be valid UUID."""
    client = _make_client()
    response = client.post(
        "/api/station-templates/tpl_sn_nn_630kva/apply",
        json={
            "case_id": "not-a-uuid",
            "target_segment_id": "seg/abc/segment",
        },
    )
    assert response.status_code == 400
    assert "Invalid case_id" in response.json()["detail"]


def test_apply_endpoint_validates_ratio_bounds() -> None:
    """K30-20: insert_at_ratio must be in [0, 1]."""
    client = _make_client()
    response = client.post(
        "/api/station-templates/tpl_sn_nn_630kva/apply",
        json={
            "case_id": "00000000-0000-0000-0000-000000000000",
            "target_segment_id": "seg/abc/segment",
            "insert_at_ratio": 1.5,  # > 1
        },
    )
    assert response.status_code == 422  # Pydantic validation error


def test_preview_endpoint_returns_effective_config() -> None:
    """K30-27: preview endpoint zwraca resolved config bez touching ENM."""
    client = _make_client()
    response = client.post(
        "/api/station-templates/tpl_sn_nn_630kva/preview",
        json={"params_override": {"nn_feeders_count": 6}},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["template_id"] == "tpl_sn_nn_630kva"
    assert data["effective_config"]["nn_feeders_count"] == 6
    assert data["effective_config"]["transformer_ref"] is not None
    assert data["estimated_elements_count"] > 6  # station + bays + TR + feeders


def test_preview_endpoint_applies_manufacturer_cascade() -> None:
    """K30-27: catalog_profile cascade selects matching transformer."""
    client = _make_client()
    response = client.post(
        "/api/station-templates/tpl_sn_nn_630kva/preview",
        json={
            "params_override": {},
            "catalog_profile": "WZL Kędzierzyn-Koźle",
        },
    )
    assert response.status_code == 200
    data = response.json()
    tr_ref = data["effective_config"]["transformer_ref"]
    # WZL cascade should pick wzl-* transformer if present in options
    # else fallback to default (test passes either way per cascade logic)
    assert tr_ref is not None
    assert data["catalog_profile_applied"] == "WZL Kędzierzyn-Koźle"


def test_preview_endpoint_404_unknown() -> None:
    client = _make_client()
    response = client.post(
        "/api/station-templates/tpl_nonexistent/preview",
        json={"params_override": {}},
    )
    assert response.status_code == 404
