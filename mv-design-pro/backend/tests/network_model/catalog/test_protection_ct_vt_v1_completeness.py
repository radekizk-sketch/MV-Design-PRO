from __future__ import annotations

import re

import pytest
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

    assert len(devices) >= 14
    assert len(curves) >= 8
    # 5 szablonów: 3 referencyjne OC/EF i 2 e2TANGO-400/-800 istniejących modeli; szablony
    # fikcyjnych e2TANGO-1250/-1600/-2000 skasowane razem z modelami.
    assert len(templates) >= 5

    device_dicts = [item.to_dict() for item in devices]
    curve_dicts = [item.to_dict() for item in curves]
    template_dicts = [item.to_dict() for item in templates]

    # Karta FAB-A/D-33: 5 pozycji sa profilami REFERENCYJNYMI bez marki
    # (catalog_status REFERENCYJNY_V1, verification_status REFERENCYJNY) —
    # pozostale 7 (Elektrometal e2TANGO) sa analitycznymi rekordami producenta.
    assert {data["catalog_status"] for data in device_dicts} == {
        CatalogStatus.ANALITYCZNY_V1.value,
        CatalogStatus.REFERENCYJNY_V1.value,
    }
    assert {data["verification_status"] for data in device_dicts} <= {
        CatalogVerificationStatus.CZESCIOWO_ZWERYFIKOWANY.value,
        CatalogVerificationStatus.NIEWERYFIKOWANY.value,
        CatalogVerificationStatus.REFERENCYJNY.value,
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

    # Karta FAB-A/D-33: te 5 pozycje NIE MAJA producenta (byly falszywie
    # przypisane ABB — usuniete). Sa profilami referencyjnymi: `vendor` None,
    # rozpoznawalne po katalog_status REFERENCYJNY_V1 i przedrostku ID "REF-".
    referencyjne_device_ids = {
        data["id"]
        for data in device_dicts
        if data["vendor"] is None and data["catalog_status"] == CatalogStatus.REFERENCYJNY_V1.value
    }
    assert referencyjne_device_ids == {
        "REF-OC-100",
        "REF-OC-200",
        "REF-OC-EF-300",
        "REF-OC-EF-500",
        "REF-OC-EF-700",
    }
    assert all(
        data["vendor"] is None for data in device_dicts if data["id"] in referencyjne_device_ids
    ), "Profil referencyjny NIGDY nie niesie tekstu udajacego producenta"

    etango_device_ids = {data["id"] for data in device_dicts if data["vendor"] == "ELEKTROMETAL"}
    assert etango_device_ids == {
        "EM_ETANGO_400_V0",
        "EM_ETANGO_600_V0",
        "EM_ETANGO_800_V0",
        "EM_ETANGO_1000_V0",
        *(f"EM_E2TANGO_{model}" for model in MODELE_ETANGO_POLA_SN),
    }


#: Modele rodziny e²TANGO dla pola SN/nN, dla których producent publikuje kartę katalogową
#: (strona producenta, 2026-11-04). Lista ZAMKNIĘTA: detektor e²TANGO-50, zespoły WN
#: e²TANGO-2000 i automatyka SZR/PPZ nie są urządzeniami zabezpieczeniowymi pola SN.
MODELE_ETANGO_POLA_SN = ("100", "150", "200", "250", "400", "450", "600", "800", "1000", "1200")


@pytest.mark.parametrize("model", MODELE_ETANGO_POLA_SN)
def test_rodzina_etango_z_karty_producenta_bez_zgadywania(model: str) -> None:
    """Każda pozycja rodziny: karta producenta w źródle, wejście 5 A/1 A w notach, numer
    modelu NIE jest prądem znamionowym, brak domyślnego podpięcia do biblioteki analitycznej
    i brak obcego słownika statusów (POTWIERDZONE, ROZBIEZNOSC_*, SPRZECZNOSC_*,
    DOSTEPNY_DO_WYBORU_NIE_ZAINSTALOWANY)."""
    pozycja = get_default_mv_catalog().get_protection_device_type(f"EM_E2TANGO_{model}")
    assert pozycja is not None
    assert pozycja.vendor == "ELEKTROMETAL"
    assert pozycja.series == "e2TANGO"
    assert f"e²TANGO-{model}" in pozycja.name_pl
    assert pozycja.rated_current_a is None
    assert pozycja.analytical_library_ref is None
    assert pozycja.verification_status == "CZESCIOWO_ZWERYFIKOWANY"
    assert pozycja.catalog_status == "REFERENCYJNY_V1"
    assert re.search(
        r"karta katalogowa K-[0-9.]+, [0-9]{2}/20[0-9]{2}: https://", pozycja.source_reference
    )
    assert "elektrometal-energetyka.pl/wp-content/uploads/" in pozycja.source_reference
    notes = pozycja.notes_pl or ""
    assert notes.startswith("Wejście prądowe: 5 A")
    assert "1 A" in notes
    assert "numer modelu nie jest prądem znamionowym" in notes
    for obcy in ("POTWIERDZONE", "ROZBIEZNOSC", "SPRZECZNOSC", "NIE_ZAINSTALOWANY"):
        assert obcy not in notes and obcy not in (pozycja.verification_note or "")


def test_abb_vendor_adapter_covers_reference_devices() -> None:
    adapter = build_adapter()
    supported = adapter.supported_devices()
    # K30-16: ABB Relion expansion
    assert "ABB_REF615" in supported
    assert "ABB_REF620" in supported
    assert "ABB_REF630" in supported
    assert "ABB_REF650" in supported
    assert "ABB_RET615" in supported
    assert "ABB_REB670" in supported
    assert "ABB_REG670" in supported
    # Karta FAB-A/D-33: profile referencyjne bez marki NIE naleza do zadnego
    # adaptera producenta — nie ma dla nich realnej konwencji nastaw producenta
    # do zmapowania, wiec przypisanie ich do adaptera ABB byloby ta sama klasa
    # fabrykacji, ktora ta karta usuwa.
    assert "REF-OC-100" not in supported
    assert "REF-OC-200" not in supported
    assert "REF-OC-EF-300" not in supported
    assert "REF-OC-EF-500" not in supported
    assert "REF-OC-EF-700" not in supported
