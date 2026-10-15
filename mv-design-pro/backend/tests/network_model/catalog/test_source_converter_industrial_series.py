from __future__ import annotations

from network_model.catalog.mv_converter_catalog import (
    CONVERTER_BESS,
    CONVERTER_PV,
    CONVERTER_WIND,
    get_converter_catalog_statistics,
)
from network_model.catalog.mv_source_catalog import (
    SOURCE_SYSTEM_TYPES,
    get_source_catalog_statistics,
)
from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.types import (
    CATALOG_CONTRACT_VERSION,
    CatalogStatus,
    CatalogVerificationStatus,
)

from tests.network_model.catalog.test_katalog_proweniencja_kompletnosc import (
    oczekiwana_proweniencja,
)


def test_source_records_have_explicit_quality_metadata() -> None:
    assert len(SOURCE_SYSTEM_TYPES) >= 20
    for record in SOURCE_SYSTEM_TYPES:
        params = record["params"]
        assert (
            params["verification_status"] == CatalogVerificationStatus.CZESCIOWO_ZWERYFIKOWANY.value
        )
        assert params["catalog_status"] == CatalogStatus.PRODUKCYJNY_V1.value
        assert params["source_reference"]
        assert params["contract_version"] == CATALOG_CONTRACT_VERSION
        assert params["ik3_ka"] is not None


def test_source_catalog_statistics_reflect_wide_operating_range() -> None:
    stats = get_source_catalog_statistics()
    assert stats["liczba_zrodel_ogolem"] >= 20
    assert stats["napiecia_kv"] == [15.0, 20.0]
    assert len(stats["sk3_mva"]) >= 8
    assert len(stats["verification_statuses"]) == 1


def _oczekiwana_proweniencja(params: dict) -> tuple[str, str]:
    return oczekiwana_proweniencja(params["source_reference"])


def test_converter_records_have_explicit_quality_metadata() -> None:
    all_records = CONVERTER_PV + CONVERTER_WIND + CONVERTER_BESS
    assert len(all_records) >= 20
    for record in all_records:
        params = record["params"]
        assert (params["verification_status"], params["catalog_status"]) == (
            _oczekiwana_proweniencja(params)
        ), record["id"]
        assert params["contract_version"] == CATALOG_CONTRACT_VERSION


def test_converter_catalog_statistics_reflect_industrial_breadth() -> None:
    stats = get_converter_catalog_statistics()
    assert stats["liczba_konwerterow_ogolem"] >= 20
    assert stats["liczba_pv"] >= 10
    assert stats["liczba_bess"] >= 8
    assert {"PV", "BESS", "WIND"} <= set(stats["rodzaje"])
    assert len(stats["producenci"]) >= 4


def test_derived_pv_and_bess_namespaces_remain_provenanced() -> None:
    catalog = get_default_mv_catalog()

    pv = catalog.list_pv_inverter_types()
    bess = catalog.list_bess_inverter_types()

    assert len(pv) >= 10
    assert len(bess) >= 8

    for item in pv + bess:
        data = item.to_dict()
        assert (data["verification_status"], data["catalog_status"]) == (
            _oczekiwana_proweniencja(data)
        ), data["id"]
        assert data["contract_version"] == CATALOG_CONTRACT_VERSION
