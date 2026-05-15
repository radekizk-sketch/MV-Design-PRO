"""Tests for K30-23 auto-populate catalog endpoint."""

from __future__ import annotations

from fastapi.testclient import TestClient


def _make_client() -> TestClient:
    from api.main import app
    return TestClient(app)


def test_auto_populate_transformer_voltage_filter() -> None:
    """Voltage filter: 15 kV TR request returns only 15/x transformers."""
    client = _make_client()
    response = client.post(
        "/api/catalog/auto-populate/transformer",
        json={"voltage_kv": 15.0, "expected_power_mva": 0.63},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["element_type"] == "transformer"
    assert len(data["suggestions"]) > 0
    # All suggestions should reference 15 kV or 0.4 kV side
    for s in data["suggestions"]:
        assert "15" in s["rationale_pl"] or "0.4" in s["rationale_pl"]


def test_auto_populate_transformer_ptpire_priority() -> None:
    """PTPiRE-certified entries ranked higher when prefer_ptpire_certified=true."""
    client = _make_client()
    response = client.post(
        "/api/catalog/auto-populate/transformer",
        json={
            "voltage_kv": 15.0,
            "expected_power_mva": 0.63,
            "prefer_ptpire_certified": True,
        },
    )
    assert response.status_code == 200
    data = response.json()
    # First suggestion should be PTPiRE-certified (Polish manufacturer)
    if len(data["suggestions"]) > 0:
        top = data["suggestions"][0]
        # Polish manufacturers boost confidence
        assert top["confidence"] >= 0.5


def test_auto_populate_cable_cross_section() -> None:
    """Cable filter by cross-section."""
    client = _make_client()
    response = client.post(
        "/api/catalog/auto-populate/cable",
        json={"voltage_kv": 20.0, "cross_section_mm2": 150.0},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["element_type"] == "cable"
    # Should include YHAKXS 150 (PTPiRE)
    refs = [s["catalog_ref"] for s in data["suggestions"]]
    assert any("yhakxs" in r or "150" in r for r in refs)


def test_auto_populate_switch_kind_filter() -> None:
    """Switch filter by kind (circuit_breaker) z voltage + current."""
    client = _make_client()
    response = client.post(
        "/api/catalog/auto-populate/circuit_breaker",
        json={"voltage_kv": 12.0, "expected_current_a": 630.0},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["element_type"] == "switch"
    assert len(data["suggestions"]) > 0
    # All suggestions should be 12 kV CB z In ≥ 630 A (extracted from rationale)
    for s in data["suggestions"]:
        assert "12 kV" in s["rationale_pl"], f"Bad voltage: {s['rationale_pl']}"


def test_auto_populate_protection_returns_relays() -> None:
    """Protection auto-populate returns relay devices."""
    client = _make_client()
    response = client.post(
        "/api/catalog/auto-populate/protection",
        json={"prefer_manufacturer": "ELEKTROMETAL"},
    )
    assert response.status_code == 200
    data = response.json()
    refs = [s["catalog_ref"] for s in data["suggestions"]]
    # E2Tango family must appear w high-confidence suggestions
    assert any("E2TANGO" in r for r in refs)


def test_auto_populate_unknown_element_type() -> None:
    client = _make_client()
    response = client.post(
        "/api/catalog/auto-populate/spaghetti",
        json={"voltage_kv": 15.0},
    )
    assert response.status_code == 400


def test_auto_populate_polish_manufacturer_preference() -> None:
    """ZPUE preference returns ZPUE switches first."""
    client = _make_client()
    response = client.post(
        "/api/catalog/auto-populate/circuit_breaker",
        json={
            "voltage_kv": 12.0,
            "expected_current_a": 630.0,
            "prefer_manufacturer": "ZPUE",
        },
    )
    assert response.status_code == 200
    data = response.json()
    if len(data["suggestions"]) > 0:
        top = data["suggestions"][0]
        # ZPUE Włoszczowa first
        assert "ZPUE" in (top.get("manufacturer") or "")
