from __future__ import annotations

import pytest
from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.types import CatalogStatus, CatalogVerificationStatus


@pytest.fixture(scope="module")
def catalog():
    return get_default_mv_catalog()


def test_source_catalog_has_industrial_series_width(catalog):
    sources = catalog.list_source_system_types()
    assert len(sources) >= 20
    assert {item.voltage_rating_kv for item in sources} == {15.0, 20.0}
    assert len({item.sk3_mva for item in sources}) >= 8
    assert len({item.rx_ratio for item in sources}) >= 3


def test_converter_catalog_has_industrial_series_width(catalog):
    converters = catalog.list_converter_types()
    assert len(converters) >= 20
    assert {item.kind.value for item in converters} >= {"PV", "BESS", "WIND"}


def test_pv_catalog_has_industrial_series_width(catalog):
    pv = catalog.list_pv_inverter_types()
    assert len(pv) >= 10
    manufacturers = {item.manufacturer for item in pv if item.manufacturer}
    assert len(manufacturers) >= 4


def test_bess_catalog_has_industrial_series_width(catalog):
    bess = catalog.list_bess_inverter_types()
    assert len(bess) >= 8
    manufacturers = {item.manufacturer for item in bess if item.manufacturer}
    assert len(manufacturers) >= 4


def test_source_and_converter_records_expose_quality_metadata(catalog):
    for item in catalog.list_source_system_types():
        data = item.to_dict()
        assert (
            data["verification_status"] == CatalogVerificationStatus.CZESCIOWO_ZWERYFIKOWANY.value
        )
        assert data["catalog_status"] == CatalogStatus.PRODUKCYJNY_V1.value
        assert data["source_reference"]
        assert data["contract_version"]

    for item in catalog.list_converter_types():
        data = item.to_dict()
        assert data["verification_status"] == CatalogVerificationStatus.REFERENCYJNY.value
        assert data["catalog_status"] == CatalogStatus.REFERENCYJNY_V1.value
        assert data["source_reference"]
        assert data["contract_version"]


def test_switch_equipment_catalog_has_industrial_series_width(catalog):
    switches = catalog.list_switch_equipment_types()
    assert len(switches) >= 32, f"APARAT_SN: {len(switches)} rekordow < 32"
    kinds = {item.equipment_kind for item in switches}
    assert "CIRCUIT_BREAKER" in kinds
    assert "LOAD_SWITCH" in kinds
    assert "DISCONNECTOR" in kinds
    assert "RECLOSER" in kinds
    assert "FUSE" in kinds


def test_lv_apparatus_catalog_has_industrial_series_width(catalog):
    apparatus = catalog.list_lv_apparatus_types()
    assert len(apparatus) >= 12, f"APARAT_NN: {len(apparatus)} rekordow < 12"
    kinds = {item.to_dict().get("device_kind") for item in apparatus}
    assert "WYLACZNIK_GLOWNY" in kinds
    assert "WYLACZNIK_ODPLYWOWY" in kinds
    assert "ROZLACZNIK_BEZPIECZNIKOWY" in kinds


def test_pv_and_bess_derived_namespaces_preserve_metadata(catalog):
    for item in catalog.list_pv_inverter_types():
        data = item.to_dict()
        assert data["verification_status"] == CatalogVerificationStatus.REFERENCYJNY.value
        assert data["catalog_status"] == CatalogStatus.REFERENCYJNY_V1.value
        assert data["source_reference"]
        assert data["contract_version"]

    for item in catalog.list_bess_inverter_types():
        data = item.to_dict()
        assert data["verification_status"] == CatalogVerificationStatus.REFERENCYJNY.value
        assert data["catalog_status"] == CatalogStatus.REFERENCYJNY_V1.value
        assert data["source_reference"]
        assert data["contract_version"]
