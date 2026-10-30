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

    assert len(devices) >= 22
    assert len(curves) >= 8
    assert len(templates) >= 8

    device_dicts = [item.to_dict() for item in devices]
    curve_dicts = [item.to_dict() for item in curves]
    template_dicts = [item.to_dict() for item in templates]

    # Karta FAB-A/D-33: 5 pozycji sa profilami REFERENCYJNYMI bez marki
    # (catalog_status REFERENCYJNY_V1, verification_status REFERENCYJNY) —
    # 7 wpisow e2TANGO legacy pozostaje ANALITYCZNY; 10 nowszych/weryfikowanych
    # typow SN to CZESCIOWO_ZWERYFIKOWANY/REFERENCYJNY (nie dane nastaw).
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
        "EM_ETANGO_1250_V0",
        "EM_ETANGO_1600_V0",
        "EM_ETANGO_2000_V0",
        "EM_E2TANGO_250",
        "EM_E2TANGO_450",
        "EM_E2TANGO_100",
        "EM_E2TANGO_150",
        "EM_E2TANGO_200",
        "EM_E2TANGO_400",
        "EM_E2TANGO_600",
        "EM_E2TANGO_800",
        "EM_E2TANGO_1000",
        "EM_E2TANGO_1200",
    }

def test_new_etango_families_are_catalogued_without_guessed_functions() -> None:
    repo = get_default_mv_catalog()
    for identyfikator in ("EM_E2TANGO_250", "EM_E2TANGO_450"):
        pozycja = repo.get_protection_device_type(identyfikator)
        assert pozycja is not None
        assert pozycja.vendor == "ELEKTROMETAL"
        assert pozycja.rated_current_a is None
        assert pozycja.analytical_library_ref is None
        assert pozycja.verification_status == "CZESCIOWO_ZWERYFIKOWANY"
        assert pozycja.catalog_status == "REFERENCYJNY_V1"
        assert "elektrometal-energetyka.pl" in pozycja.source_reference
        assert "1 A lub 5 A" in (pozycja.notes_pl or "")


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
