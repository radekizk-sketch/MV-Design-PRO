from __future__ import annotations

from application.analyses.protection.catalog.vendors.abb_v0 import build_adapter
from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.types import CatalogStatus, CatalogVerificationStatus


def test_ct_vt_catalog_has_industrial_series_width_and_metadata() -> None:
    repo = get_default_mv_catalog()

    ct_types = repo.list_ct_types()
    vt_types = repo.list_vt_types()

    assert len(ct_types) >= 12
    assert len(vt_types) >= 8

    for item in ct_types:
        data = item.to_dict()
        assert data["verification_status"] == CatalogVerificationStatus.REFERENCYJNY.value
        assert data["catalog_status"] == CatalogStatus.REFERENCYJNY_V1.value
        assert data["source_reference"]
        assert data["contract_version"] == "2.0"

    for item in vt_types:
        data = item.to_dict()
        assert data["verification_status"] == CatalogVerificationStatus.REFERENCYJNY.value
        assert data["catalog_status"] == CatalogStatus.REFERENCYJNY_V1.value
        assert data["source_reference"]
        assert data["contract_version"] == "2.0"


def test_protection_catalog_has_industrial_series_width_and_semantic_split() -> None:
    repo = get_default_mv_catalog()

    devices = repo.list_protection_device_types()
    curves = repo.list_protection_curves()
    templates = repo.list_protection_setting_templates()

    assert len(devices) >= 12
    assert len(curves) >= 8
    assert len(templates) >= 8

    device_dicts = [item.to_dict() for item in devices]
    curve_dicts = [item.to_dict() for item in curves]
    template_dicts = [item.to_dict() for item in templates]

    assert {data["catalog_status"] for data in device_dicts} == {CatalogStatus.ANALITYCZNY_V1.value}
    assert {data["verification_status"] for data in device_dicts} <= {
        CatalogVerificationStatus.CZESCIOWO_ZWERYFIKOWANY.value,
        CatalogVerificationStatus.NIEWERYFIKOWANY.value,
    }
    assert all(data["source_reference"] for data in device_dicts)
    assert all(data["contract_version"] == "2.0" for data in device_dicts)

    assert {data["catalog_status"] for data in curve_dicts} == {CatalogStatus.REFERENCYJNY_V1.value}
    assert {data["verification_status"] for data in curve_dicts} == {
        CatalogVerificationStatus.REFERENCYJNY.value
    }
    assert all(data["source_reference"] for data in curve_dicts)
    assert all(data["contract_version"] == "2.0" for data in curve_dicts)

    assert {data["catalog_status"] for data in template_dicts} == {
        CatalogStatus.REFERENCYJNY_V1.value
    }
    assert {data["verification_status"] for data in template_dicts} == {
        CatalogVerificationStatus.REFERENCYJNY.value
    }
    assert all(data["source_reference"] for data in template_dicts)
    assert all(data["contract_version"] == "2.0" for data in template_dicts)

    device_ids = {data["id"] for data in device_dicts}
    curve_ids = {data["id"] for data in curve_dicts}
    assert {data["device_type_ref"] for data in template_dicts} <= device_ids
    assert {data["curve_ref"] for data in template_dicts} <= curve_ids

    abb_device_ids = {data["id"] for data in device_dicts if data["vendor"] == "ABB"}
    assert abb_device_ids == {
        "ACME_REX100_v1",
        "ACME_REX200_v1",
        "ACME_REX300_v1",
        "ACME_REX500_v1",
        "ACME_REX700_v1",
    }

    etango_device_ids = {data["id"] for data in device_dicts if data["vendor"] == "ELEKTROMETAL"}
    assert etango_device_ids == {
        "EM_ETANGO_400_V0",
        "EM_ETANGO_600_V0",
        "EM_ETANGO_800_V0",
        "EM_ETANGO_1000_V0",
        "EM_ETANGO_1250_V0",
        "EM_ETANGO_1600_V0",
        "EM_ETANGO_2000_V0",
    }


def test_abb_vendor_adapter_covers_reference_devices() -> None:
    adapter = build_adapter()
    assert adapter.supported_devices() == (
        "ACME_REX100_v1",
        "ACME_REX200_v1",
        "ACME_REX300_v1",
        "ACME_REX500_v1",
        "ACME_REX700_v1",
    )
