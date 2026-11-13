"""Zatwierdzone referencje wykonawcze e²ALPHA — integralność i jawne źródło.

Dane nie są deklaracją katalogową producenta dla wszystkich wariantów.
"""

from copy import deepcopy

import pytest

from reference_engine import get_reference_pack
from reference_engine.models import ReferencePack
from reference_engine.registry import _validate_approved_project_reference


def _approved_reference():
    pack = get_reference_pack("elektrometal_e2alpha")
    reference = pack.approved_project_reference
    assert reference is not None
    return pack, reference


def test_approved_catalog_has_provenance_and_complete_field_variants():
    pack, reference = _approved_reference()
    assert pack.approved_project_reference_file == "approved_project_fields.json"
    assert reference.approval_status == "owner_approved"
    assert reference.evidence_kind == "approved_project_reference"
    assert reference.public_manufacturer_catalog_claim is False
    assert len(reference.product_catalog) >= 70
    assert len(reference.field_profiles) >= 6
    assert len(reference.anonymized_field_examples) == 8
    assert all(product.source_pages for product in reference.product_catalog)
    assert all(field.source_pages for field in reference.field_profiles)
    assert all(example.not_real_site_number for example in reference.anonymized_field_examples)


def test_all_project_fields_resolve_real_product_records():
    _, reference = _approved_reference()
    products = {p.ref for p in reference.product_catalog}
    assert products
    for field in reference.field_profiles:
        assert all(x.ref in products and x.qty > 0 for x in field.primary_equipment)
        assert all(x.ref in products and x.qty > 0 for x in field.secondary_equipment)


def test_reference_separates_vt_line_ct1_line_ct3_and_partial_retrofits():
    _, reference = _approved_reference()
    fields = {f.field_ref: f for f in reference.field_profiles}
    assert {"AIS-VT-3W", "AIS-LINE-CT1", "AIS-LINE-CT3"} <= fields.keys()
    assert {"RETRO-TR-SEC", "RETRO-ZU", "RETRO-COUPLER-SEC"} <= fields.keys()
    ct1 = fields["AIS-LINE-CT1"]
    ct3 = fields["AIS-LINE-CT3"]
    assert any(e.ref == "ALCE_AB12_P" and e.qty == 3 for e in ct1.primary_equipment)
    assert any(e.ref == "ALCE_AB12_M" and e.qty == 3 for e in ct3.primary_equipment)
    assert not fields["RETRO-TR-SEC"].primary_equipment
    assert "nie jest kompletnym" in fields["RETRO-TR-SEC"].applicability


def test_approved_project_data_does_not_automatically_become_public_manufacturer_cells():
    pack, reference = _approved_reference()
    assert pack.cell_configurations == []
    assert reference.public_manufacturer_catalog_claim is False
    vt = {f.field_ref: f for f in reference.field_profiles}["AIS-VT-3W"]
    assert any(e.ref == "VT_FUSE_0_5" for e in vt.primary_equipment)
    assert "NIE przenosić" in vt.notes_pl


def test_injected_unknown_device_is_rejected_by_registry_validation():
    pack, _ = _approved_reference()
    payload = deepcopy(pack.model_dump(mode="python"))
    payload["approved_project_reference"]["field_profiles"][0]["primary_equipment"].append(
        {"ref": "NIEISTNIEJACY_APARAT", "qty": 1}
    )
    sabotaged = ReferencePack.model_validate(payload)
    with pytest.raises(ValueError, match="nieznany produkt"):
        _validate_approved_project_reference(sabotaged)


def test_injected_duplicate_product_ref_is_rejected_by_registry_validation():
    pack, _ = _approved_reference()
    payload = deepcopy(pack.model_dump(mode="python"))
    product = deepcopy(payload["approved_project_reference"]["product_catalog"][0])
    payload["approved_project_reference"]["product_catalog"].append(product)
    sabotaged = ReferencePack.model_validate(payload)
    with pytest.raises(ValueError, match="Duplikat ref produktu"):
        _validate_approved_project_reference(sabotaged)


def test_existing_api_returns_same_approved_project_field_data(app_client):
    response = app_client.get("/api/reference/packs/elektrometal_e2alpha")
    assert response.status_code == 200
    pack = response.json()
    approved = pack["approved_project_reference"]
    assert approved["approval_status"] == "owner_approved"
    assert len(approved["field_profiles"]) >= 6
    assert len(approved["product_catalog"]) >= 70
    assert pack["cell_configurations"] == []
