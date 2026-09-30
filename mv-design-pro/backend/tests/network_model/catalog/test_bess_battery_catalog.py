"""Katalog pakietów baterii BESS (karta FAB-J) — `BESSBatteryType`.

Sprzęt oddzielny od przekształtnika/PCS (`BESSInverterType`/`ConverterType`):
backend nie miał tego katalogu wcale przed tą kartą.
"""

from __future__ import annotations

import pytest
from network_model.catalog.mv_bess_battery_catalog import get_all_bess_battery_types
from network_model.catalog.repository import CatalogRepository, get_default_mv_catalog
from network_model.catalog.types import (
    CATALOG_CONTRACT_VERSION,
    BESSBatteryType,
    CatalogNamespace,
)


class TestBESSBatteryTypeDataclass:
    def test_to_dict_from_dict_round_trip(self) -> None:
        original = BESSBatteryType(
            id="test-battery-1",
            name="Test Battery",
            chemistry="LFP",
            capacity_kwh=1000.0,
            nominal_voltage_dc_v=800.0,
            c_rate=0.5,
        )
        restored = BESSBatteryType.from_dict(original.to_dict())
        assert restored == original

    @pytest.mark.parametrize(
        ("pole", "wartosc"),
        [("capacity_kwh", 0.0), ("nominal_voltage_dc_v", -1.0), ("c_rate", 0.0)],
    )
    def test_odrzuca_niefizyczne_wartosci(self, pole: str, wartosc: float) -> None:
        kwargs = {
            "id": "t",
            "name": "T",
            "chemistry": "LFP",
            "capacity_kwh": 1000.0,
            "nominal_voltage_dc_v": 800.0,
            "c_rate": 0.5,
        }
        kwargs[pole] = wartosc
        with pytest.raises(ValueError):
            BESSBatteryType(**kwargs)

    def test_from_dict_odrzuca_nieznana_chemie(self) -> None:
        with pytest.raises(ValueError, match="[Cc]hemi"):
            BESSBatteryType.from_dict(
                {
                    "id": "t",
                    "name": "T",
                    "chemistry": "SODOWO_JONOWA",
                    "capacity_kwh": 1000.0,
                    "nominal_voltage_dc_v": 800.0,
                    "c_rate": 0.5,
                }
            )

    @pytest.mark.parametrize("chemistry", ["LFP", "NMC", "LTO"])
    def test_from_dict_akceptuje_wszystkie_dozwolone_chemie(self, chemistry: str) -> None:
        item = BESSBatteryType.from_dict(
            {
                "id": "t",
                "name": "T",
                "chemistry": chemistry,
                "capacity_kwh": 1000.0,
                "nominal_voltage_dc_v": 800.0,
                "c_rate": 0.5,
            }
        )
        assert item.chemistry == chemistry


class TestCatalogNamespaceIRepozytorium:
    def test_bateria_bess_jest_w_enumie_namespace(self) -> None:
        assert CatalogNamespace.BATERIA_BESS.value == "BATERIA_BESS"

    def test_pusty_repozytorium_ma_pusty_katalog_baterii(self) -> None:
        repo = CatalogRepository.from_records(line_types=[], cable_types=[], transformer_types=[])
        assert repo.list_bess_battery_types() == []
        assert repo.get_bess_battery_type("nieznana") is None

    def test_repozytorium_z_rekordami_buduje_katalog(self) -> None:
        repo = CatalogRepository.from_records(
            line_types=[],
            cable_types=[],
            transformer_types=[],
            bess_battery_types=get_all_bess_battery_types(),
        )
        items = repo.list_bess_battery_types()
        assert len(items) == 2
        assert all(isinstance(item, BESSBatteryType) for item in items)


class TestKatalogDomyslnyMvCatalog:
    """`get_default_mv_catalog()` — katalog produkcyjny użyty przez API/kreator."""

    def test_domyslny_katalog_niesie_pozycje_baterii(self) -> None:
        repo = get_default_mv_catalog()
        items = repo.list_bess_battery_types()
        assert len(items) >= 2

    def test_kazda_pozycja_ma_pelna_proweniencje(self) -> None:
        for item in get_default_mv_catalog().list_bess_battery_types():
            data = item.to_dict()
            assert data["verification_status"]
            assert data["source_reference"].strip()
            assert data["catalog_status"]
            assert data["contract_version"] == CATALOG_CONTRACT_VERSION
            # Zero fabrykacji: identyfikator referencyjny, bez marki producenta
            # (karta FAB-J, jak FAB-A) — dokładnie te tokeny, których zakazywały
            # naprawy K-Q dla PV/wiatru/PCS w tym samym module.
            marki_zabronione = ("byd", "catl", "tesla", "samsung", "lg", "panasonic")
            assert not any(marka in data["id"].lower() for marka in marki_zabronione), data["id"]

    def test_kazda_pozycja_ma_fizyczne_parametry(self) -> None:
        for item in get_default_mv_catalog().list_bess_battery_types():
            assert item.capacity_kwh > 0
            assert item.nominal_voltage_dc_v > 0
            assert item.c_rate > 0
            assert item.chemistry in ("LFP", "NMC", "LTO")

    def test_identyfikatory_sa_unikalne(self) -> None:
        ids = [item.id for item in get_default_mv_catalog().list_bess_battery_types()]
        assert len(ids) == len(set(ids))

    def test_get_bess_battery_type_zwraca_pozycje_po_id(self) -> None:
        repo = get_default_mv_catalog()
        pierwszy = repo.list_bess_battery_types()[0]
        assert repo.get_bess_battery_type(pierwszy.id) == pierwszy
        assert repo.get_bess_battery_type("nie-istnieje") is None
