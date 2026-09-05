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
        ("/api/catalog/wind-inverter-types", "conv-wind-2mw-15kv"),
        ("/api/catalog/protection/device-types", "REF-OC-EF-500"),
        ("/api/catalog/protection/curves", "curve_iec_normal_inverse"),
        ("/api/catalog/protection/templates", "template_ref_oc_ef_500"),
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
    wind_response = client.get("/api/catalog/wind-inverter-types")
    converter_response = client.get("/api/catalog/converter-types")

    assert source_response.status_code == 200
    assert pv_response.status_code == 200
    assert bess_response.status_code == 200
    assert wind_response.status_code == 200
    assert converter_response.status_code == 200

    source_payload = source_response.json()
    pv_payload = pv_response.json()
    bess_payload = bess_response.json()
    wind_payload = wind_response.json()
    converter_payload = converter_response.json()

    assert len(source_payload) >= 20
    assert len(pv_payload) >= 10
    assert len(bess_payload) >= 8
    assert len(wind_payload) >= 3
    assert len(converter_payload) >= len(pv_payload) + len(bess_payload) + len(wind_payload)

    source_first = source_payload[0]
    assert source_first["verification_status"] == "CZESCIOWO_ZWERYFIKOWANY"
    assert source_first["catalog_status"] == "PRODUKCYJNY_V1"
    assert source_first["source_reference"]
    assert source_first["contract_version"] == "2.0"

    assert any(item["manufacturer"] for item in pv_payload)
    assert any(item["manufacturer"] for item in bess_payload)
    assert any(item["manufacturer"] for item in wind_payload)
    assert all(item["un_kv"] > 0 for item in pv_payload)
    assert all(item["un_kv"] > 0 for item in bess_payload)
    assert all(item["un_kv"] > 0 for item in wind_payload)
    assert all(item["source_reference"] for item in pv_payload)
    assert all(item["source_reference"] for item in bess_payload)
    assert all(item["source_reference"] for item in wind_payload)


def test_bess_battery_types_endpoint_exposes_pack_catalog(client: TestClient) -> None:
    """Karta FAB-J: pakiet baterii BESS — sprzęt oddzielny od PCS/inwertera
    (`/bess-inverter-types` powyżej), backend nie miał tego katalogu wcale."""
    response = client.get("/api/catalog/bess-battery-types")
    assert response.status_code == 200
    payload = response.json()
    assert len(payload) >= 2

    for item in payload:
        assert item["chemistry"] in ("LFP", "NMC", "LTO")
        assert item["capacity_kwh"] > 0
        assert item["nominal_voltage_dc_v"] > 0
        assert item["c_rate"] > 0
        assert item["verification_status"]
        assert item["source_reference"].strip()
        assert item["catalog_status"]
        assert item["contract_version"] == "2.0"


# ---------------------------------------------------------------------------
# Wykaz certyfikatow PTPiREE — filtr i wycinek (dlug 5 z rejestru V12K-321).
# Pelny wykaz ma ~6887 pozycji (~3 MB); parametry search/limit/offset sa
# ADDYTYWNE (bez nich kontrakt sprzed zmiany), a X-Total-Count niesie
# licznosc PO filtrze, PRZED wycinkiem.
# ---------------------------------------------------------------------------


def test_ptpiree_certificates_domyslnie_pelna_lista_z_licznikiem(client: TestClient) -> None:
    response = client.get("/api/catalog/ptpiree/generator-certificates")
    assert response.status_code == 200
    payload = response.json()
    assert len(payload) > 6000  # pelny wykaz, nie reczna szostka
    assert response.headers["X-Total-Count"] == str(len(payload))


def test_ptpiree_certificates_search_normalizowany_i_wycinek(client: TestClient) -> None:
    szukane = client.get(
        "/api/catalog/ptpiree/generator-certificates",
        params={"search": "huawei sun2000-215ktl"},
    )
    assert szukane.status_code == 200
    wyniki = szukane.json()
    razem = int(szukane.headers["X-Total-Count"])
    assert razem == len(wyniki)
    assert 0 < razem < 100  # filtr realnie zawezil wykaz
    assert all("HUAWEI" in normalizuj(w["manufacturer"]) for w in wyniki)

    strona = client.get(
        "/api/catalog/ptpiree/generator-certificates",
        params={"search": "huawei sun2000-215ktl", "limit": 1, "offset": 1},
    )
    assert strona.status_code == 200
    assert int(strona.headers["X-Total-Count"]) == razem  # licznik PRZED wycinkiem
    assert strona.json() == wyniki[1:2]


def test_ptpiree_certificates_zle_parametry_wycinka(client: TestClient) -> None:
    assert (
        client.get("/api/catalog/ptpiree/generator-certificates", params={"limit": 0}).status_code
        == 422
    )
    assert (
        client.get("/api/catalog/ptpiree/generator-certificates", params={"offset": -1}).status_code
        == 422
    )


def normalizuj(wartosc: str) -> str:
    from network_model.catalog.types import normalize_ptpiree_key

    return normalize_ptpiree_key(wartosc)
