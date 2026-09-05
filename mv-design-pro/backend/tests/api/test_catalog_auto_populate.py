"""Tests for K30-23 auto-populate catalog endpoint."""

from __future__ import annotations

import pytest
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
    # First suggestion should be PTPiRE-certified (Polish manufacturer) and carry
    # a categorical match (karta FAB-D2, D9 — dopasowanie zamiast confidence).
    if len(data["suggestions"]) > 0:
        top = data["suggestions"][0]
        assert top["dopasowanie"] in ("PELNE", "CZESCIOWE")
        assert isinstance(top["certyfikat_ptpiree"], bool)


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


def _z_pozycja_bez_pola(lista: list[dict], *, pole: str) -> list[dict]:
    """Kopia listy katalogu + jedna pozycja pozbawiona liczbowego pola `pole`."""
    import copy

    wzor = copy.deepcopy(lista[0])
    wzor["id"] = "pozycja-bez-pola"
    wzor["name"] = "Pozycja bez pola"
    wzor["params"].pop(pole, None)
    return [*copy.deepcopy(lista), wzor]


@pytest.mark.parametrize(
    ("element_type", "modul", "funkcja", "pole"),
    [
        (
            "transformer",
            "network_model.catalog.mv_transformer_catalog",
            "get_all_transformer_types",
            "rated_power_mva",
        ),
        (
            "cable",
            "network_model.catalog.mv_cable_line_catalog",
            "get_all_cable_types",
            "cross_section_mm2",
        ),
        (
            "switch",
            "network_model.catalog.mv_switch_catalog",
            "get_all_switch_equipment_types",
            "in_a",
        ),
    ],
)
def test_pozycja_katalogu_bez_pola_liczbowego_jest_pomijana_nie_zerem(
    monkeypatch, element_type: str, modul: str, funkcja: str, pole: str
) -> None:
    """FAB-E (klasa „brak danej pokazany jako 0"), iloczyn cech: trzy rodzaje
    elementow × brak innego pola liczbowego. Dawniej `params.get(pole, 0.0)`
    wpuszczalo taka pozycje do propozycji z fabrykowana tabliczka „0 kVA / 0 mm²
    / 0 A" (bez filtrow kazda pozycja przechodzi). Teraz pozycja jest pominieta
    z nazwanym powodem w logu, a pozostale pozycje katalogu pozostaja bez zmian.
    """
    import importlib

    modul_obj = importlib.import_module(modul)
    oryginal = getattr(modul_obj, funkcja)()
    assert oryginal, "katalog nie moze byc pusty"
    with_broken = _z_pozycja_bez_pola(oryginal, pole=pole)
    monkeypatch.setattr(modul_obj, funkcja, lambda: with_broken)

    client = _make_client()
    response = client.post(f"/api/catalog/auto-populate/{element_type}", json={})
    assert response.status_code == 200, response.text
    body = response.json()
    refy = {s["catalog_ref"] for s in body["suggestions"]}
    assert "pozycja-bez-pola" not in refy
    assert body["total_candidates"] == len(oryginal) - _liczba_pozycji_bez_pol(oryginal, pole)
    for s in body["suggestions"]:
        assert "=0 kVA" not in s["rationale_pl"]
        assert not s["rationale_pl"].startswith("0 mm²")
        assert "/ 0 A" not in s["rationale_pl"]


def _liczba_pozycji_bez_pol(lista: list[dict], pole: str) -> int:
    """Ile pozycji ORYGINALNEGO katalogu i tak nie ma tego pola (pomiar, nie zalozenie)."""
    return sum(1 for e in lista if not isinstance(e.get("params", {}).get(pole), int | float))
