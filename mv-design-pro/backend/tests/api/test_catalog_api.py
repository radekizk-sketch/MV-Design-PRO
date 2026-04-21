from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    db_path = tmp_path / "catalog-api.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path}")

    from api.main import app

    with TestClient(app) as test_client:
        yield test_client


@pytest.mark.parametrize(
    ("endpoint", "expected_id"),
    [
        ("/api/catalog/lv-cable-types", "kab_nn_4x120_al"),
        ("/api/catalog/load-types", "load_mieszk_15kw"),
        ("/api/catalog/lv-apparatus-types", "cb_nn_1000a"),
        ("/api/catalog/ct-types", "ct_400_5_5p20_15va_abb"),
        ("/api/catalog/vt-types", "vt_15kv_100v_05_abb"),
        ("/api/catalog/protection/device-types", "ACME_REX500_v1"),
        ("/api/catalog/protection/curves", "curve_iec_normal_inverse"),
        ("/api/catalog/protection/templates", "template_rex500_oc"),
    ],
)
def test_catalog_api_exposes_extended_namespaces(
    client: TestClient,
    endpoint: str,
    expected_id: str,
) -> None:
    response = client.get(endpoint)

    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload, list)
    assert payload
    assert any(item["id"] == expected_id for item in payload)


def test_protection_catalog_api_exposes_unverified_flag_for_analytical_devices(
    client: TestClient,
) -> None:
    response = client.get("/api/catalog/protection/device-types/EM_ETANGO_400_V0")

    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == "EM_ETANGO_400_V0"
    assert payload["params"]["vendor"] == "ELEKTROMETAL"
    assert payload["params"]["series"] == "e2TANGO"
    assert payload["params"]["unverified"] is True
    assert payload["params"]["unverified_ranges"] is True
    assert payload["params"]["source_catalog"].endswith("devices_v0.json")
    assert payload["params"]["verification_status"] == "NIEWERYFIKOWANY"
    assert payload["params"]["catalog_status"] == "ANALITYCZNY_V1"
    assert payload["params"]["contract_version"] == "2.0"
    assert payload["params"]["source_reference"]


def test_switchgear_catalog_api_exposes_quality_metadata(
    client: TestClient,
) -> None:
    response = client.get("/api/catalog/switch-equipment-types")

    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload, list)
    assert payload

    breaker = next(item for item in payload if item["id"] == "sw-cb-abb-vd4-12kv-630a")
    earth_switch = next(item for item in payload if item["id"] == "sw-es-generic-12kv")

    assert breaker["verification_status"] == "ZWERYFIKOWANY"
    assert breaker["catalog_status"] == "PRODUKCYJNY_V1"
    assert breaker["contract_version"] == "2.0"
    assert breaker["source_reference"]

    assert earth_switch["verification_status"] == "CZESCIOWO_ZWERYFIKOWANY"
    assert earth_switch["catalog_status"] == "REFERENCYJNY_V1"
    assert earth_switch["contract_version"] == "2.0"
    assert earth_switch["source_reference"]


def test_catalog_api_exposes_quality_metadata_for_default_namespace(
    client: TestClient,
) -> None:
    response = client.get("/api/catalog/line-types")

    assert response.status_code == 200
    payload = response.json()
    assert payload
    first = payload[0]
    assert first["verification_status"] in {
        "ZWERYFIKOWANY",
        "NIEWERYFIKOWANY",
        "CZESCIOWO_ZWERYFIKOWANY",
        "REFERENCYJNY",
    }
    assert first["catalog_status"] in {
        "PRODUKCYJNY_V1",
        "REFERENCYJNY_V1",
        "ANALITYCZNY_V1",
        "TESTOWY",
    }
    assert first["contract_version"] == "2.0"
    assert first["source_reference"]


def test_protection_export_preserves_quality_metadata(
    client: TestClient,
) -> None:
    response = client.get("/api/catalog/protection/export")

    assert response.status_code == 200
    payload = response.json()
    assert payload["device_types"]
    first_device = payload["device_types"][0]
    assert first_device["params"]["verification_status"] in {
        "ZWERYFIKOWANY",
        "NIEWERYFIKOWANY",
        "CZESCIOWO_ZWERYFIKOWANY",
        "REFERENCYJNY",
    }
    assert first_device["params"]["catalog_status"] in {
        "PRODUKCYJNY_V1",
        "REFERENCYJNY_V1",
        "ANALITYCZNY_V1",
        "TESTOWY",
    }
    assert first_device["params"]["contract_version"] == "2.0"
    assert first_device["params"]["source_reference"]


def test_source_and_converter_catalog_api_expose_quality_metadata(
    client: TestClient,
) -> None:
    source_response = client.get("/api/catalog/source-system-types")
    pv_response = client.get("/api/catalog/pv-inverter-types")
    bess_response = client.get("/api/catalog/bess-inverter-types")

    assert source_response.status_code == 200
    assert pv_response.status_code == 200
    assert bess_response.status_code == 200

    source_payload = source_response.json()
    pv_payload = pv_response.json()
    bess_payload = bess_response.json()

    assert len(source_payload) >= 20
    assert len(pv_payload) >= 10
    assert len(bess_payload) >= 8

    source_first = source_payload[0]
    assert source_first["verification_status"] == "CZESCIOWO_ZWERYFIKOWANY"
    assert source_first["catalog_status"] == "PRODUKCYJNY_V1"
    assert source_first["source_reference"]
    assert source_first["contract_version"] == "2.0"

    assert any(item["manufacturer"] for item in pv_payload)
    assert any(item["manufacturer"] for item in bess_payload)
    assert all(item["source_reference"] for item in pv_payload)
    assert all(item["source_reference"] for item in bess_payload)
