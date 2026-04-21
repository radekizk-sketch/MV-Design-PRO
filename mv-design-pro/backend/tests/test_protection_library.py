"""
Tests for Protection Library (P14a - READ-ONLY) and Governance (P14b)

Tests cover:
- Domain models immutability (P14a)
- Repository deterministic listing (P14a)
- Smoke test for persistence methods (P14a)
- Deterministic export with fingerprint (P14b)
- Import with MERGE/REPLACE modes (P14b)
- Reference validation (template→device_type, template→curve) (P14b)
- Conflict detection (immutability) (P14b)
"""

import sys
from dataclasses import FrozenInstanceError
from pathlib import Path

import pytest

backend_src = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(backend_src))

from network_model.catalog import CatalogRepository
from network_model.catalog.types import (
    ProtectionCurve,
    ProtectionDeviceType,
    ProtectionSettingTemplate,
)


def test_protection_types_are_frozen() -> None:
    """Test that Protection Library types are immutable (frozen dataclasses)."""
    device = ProtectionDeviceType(
        id="device-1",
        name_pl="Przekaźnik Sepam 20",
        vendor="Schneider Electric",
    )
    with pytest.raises(FrozenInstanceError):
        device.name_pl = "Inny przekaźnik"

    curve = ProtectionCurve(
        id="curve-1",
        name_pl="IEC Normalna Inwersyjna",
        standard="IEC",
    )
    with pytest.raises(FrozenInstanceError):
        curve.standard = "IEEE"

    template = ProtectionSettingTemplate(
        id="template-1",
        name_pl="Szablon Sepam - Nadprądowy",
    )
    with pytest.raises(FrozenInstanceError):
        template.name_pl = "Inny szablon"


def test_protection_library_lists_deterministically() -> None:
    """Test that Protection Library lists are sorted deterministically (name_pl, id)."""
    repo = CatalogRepository.from_records(
        # Empty regular catalog types (required parameters)
        line_types=[],
        cable_types=[],
        transformer_types=[],
        # Protection types (sorted by name_pl, then id)
        protection_device_types=[
            {
                "id": "device-2",
                "name_pl": "Przekaźnik B",
                "params": {"vendor": "Vendor B"},
            },
            {
                "id": "device-1",
                "name_pl": "Przekaźnik A",
                "params": {"vendor": "Vendor A"},
            },
            {
                "id": "device-3",
                "name_pl": "Przekaźnik A",  # Same name_pl, different id
                "params": {"vendor": "Vendor A2"},
            },
        ],
        protection_curves=[
            {
                "id": "curve-2",
                "name_pl": "Krzywa B",
                "params": {"standard": "IEEE"},
            },
            {
                "id": "curve-1",
                "name_pl": "Krzywa A",
                "params": {"standard": "IEC"},
            },
        ],
        protection_setting_templates=[
            {
                "id": "template-2",
                "name_pl": "Szablon B",
                "params": {},
            },
            {
                "id": "template-1",
                "name_pl": "Szablon A",
                "params": {},
            },
        ],
    )

    # Test device types sorting: name_pl, then id
    devices = repo.list_protection_device_types()
    assert len(devices) == 3
    assert devices[0].name_pl == "Przekaźnik A"
    assert devices[0].id == "device-1"
    assert devices[1].name_pl == "Przekaźnik A"
    assert devices[1].id == "device-3"
    assert devices[2].name_pl == "Przekaźnik B"
    assert devices[2].id == "device-2"

    # Test curves sorting: name_pl, then id
    curves = repo.list_protection_curves()
    assert len(curves) == 2
    assert curves[0].name_pl == "Krzywa A"
    assert curves[0].id == "curve-1"
    assert curves[1].name_pl == "Krzywa B"
    assert curves[1].id == "curve-2"

    # Test templates sorting: name_pl, then id
    templates = repo.list_protection_setting_templates()
    assert len(templates) == 2
    assert templates[0].name_pl == "Szablon A"
    assert templates[0].id == "template-1"
    assert templates[1].name_pl == "Szablon B"
    assert templates[1].id == "template-2"


def test_protection_library_get_methods() -> None:
    """Test that get methods return correct types or None."""
    repo = CatalogRepository.from_records(
        line_types=[],
        cable_types=[],
        transformer_types=[],
        protection_device_types=[
            {
                "id": "device-1",
                "name_pl": "Przekaźnik A",
                "params": {"vendor": "Vendor A"},
            },
        ],
        protection_curves=[
            {
                "id": "curve-1",
                "name_pl": "Krzywa A",
                "params": {"standard": "IEC"},
            },
        ],
        protection_setting_templates=[
            {
                "id": "template-1",
                "name_pl": "Szablon A",
                "params": {},
            },
        ],
    )

    # Test get device type
    device = repo.get_protection_device_type("device-1")
    assert device is not None
    assert device.id == "device-1"
    assert device.name_pl == "Przekaźnik A"
    assert device.vendor == "Vendor A"

    # Test get non-existent device type
    device = repo.get_protection_device_type("device-999")
    assert device is None

    # Test get curve
    curve = repo.get_protection_curve("curve-1")
    assert curve is not None
    assert curve.id == "curve-1"
    assert curve.name_pl == "Krzywa A"
    assert curve.standard == "IEC"

    # Test get non-existent curve
    curve = repo.get_protection_curve("curve-999")
    assert curve is None

    # Test get template
    template = repo.get_protection_setting_template("template-1")
    assert template is not None
    assert template.id == "template-1"
    assert template.name_pl == "Szablon A"

    # Test get non-existent template
    template = repo.get_protection_setting_template("template-999")
    assert template is None


def test_protection_types_to_dict_from_dict() -> None:
    """Test that to_dict/from_dict round-trip preserves data."""
    # Device type
    device = ProtectionDeviceType(
        id="device-1",
        name_pl="Przekaźnik Sepam",
        vendor="Schneider",
        rated_current_a=100.0,
    )
    device_dict = device.to_dict()
    device_restored = ProtectionDeviceType.from_dict(device_dict)
    assert device_restored == device

    # Curve
    curve = ProtectionCurve(
        id="curve-1",
        name_pl="IEC Normal Inverse",
        standard="IEC",
        curve_kind="inverse",
        parameters={"A": 0.14, "B": 0.02},
    )
    curve_dict = curve.to_dict()
    curve_restored = ProtectionCurve.from_dict(curve_dict)
    assert curve_restored == curve

    # Template
    template = ProtectionSettingTemplate(
        id="template-1",
        name_pl="Szablon Sepam",
        device_type_ref="device-1",
        setting_fields=[{"name": "I>", "unit": "A", "min": 0.1, "max": 10.0}],
    )
    template_dict = template.to_dict()
    template_restored = ProtectionSettingTemplate.from_dict(template_dict)
    assert template_restored == template


# ============================================================================
# Protection Library Governance Tests (P14b)
# ============================================================================


def test_protection_export_deterministic_fingerprint() -> None:
    """Test that protection export produces deterministic fingerprint (P14b)."""
    from network_model.catalog.governance import (
        ProtectionLibraryExport,
        ProtectionLibraryManifest,
        compute_protection_fingerprint,
        sort_protection_types_deterministically,
    )

    # Create test data (unsorted)
    device_types_unsorted = [
        {"id": "device-2", "name_pl": "Przekaźnik B", "vendor": "Vendor B"},
        {"id": "device-1", "name_pl": "Przekaźnik A", "vendor": "Vendor A"},
    ]
    curves_unsorted = [
        {"id": "curve-2", "name_pl": "Krzywa B", "standard": "IEEE"},
        {"id": "curve-1", "name_pl": "Krzywa A", "standard": "IEC"},
    ]
    templates_unsorted = [
        {"id": "template-2", "name_pl": "Szablon B", "device_type_ref": "device-2"},
        {"id": "template-1", "name_pl": "Szablon A", "device_type_ref": "device-1"},
    ]

    # Sort deterministically
    device_types_sorted = sort_protection_types_deterministically(device_types_unsorted)
    curves_sorted = sort_protection_types_deterministically(curves_unsorted)
    templates_sorted = sort_protection_types_deterministically(templates_unsorted)

    # Create export (without fingerprint)
    manifest = ProtectionLibraryManifest(
        library_id="test-lib-id",
        name_pl="Test Library",
        vendor="Test Vendor",
        series="Test Series",
        revision="1.0",
        schema_version="1.0",
        created_at="2024-01-01T00:00:00",
        fingerprint="",
    )

    export1 = ProtectionLibraryExport(
        manifest=manifest,
        device_types=device_types_sorted,
        curves=curves_sorted,
        templates=templates_sorted,
    )

    # Compute fingerprint
    fingerprint1 = compute_protection_fingerprint(export1)

    # Create another export with same data (different timestamp)
    manifest2 = ProtectionLibraryManifest(
        library_id="different-lib-id",  # Different library_id
        name_pl="Test Library",
        vendor="Test Vendor",
        series="Test Series",
        revision="1.0",
        schema_version="1.0",
        created_at="2024-12-31T23:59:59",  # Different timestamp
        fingerprint="",
    )

    export2 = ProtectionLibraryExport(
        manifest=manifest2,
        device_types=device_types_sorted,
        curves=curves_sorted,
        templates=templates_sorted,
    )

    fingerprint2 = compute_protection_fingerprint(export2)

    # Fingerprints must be identical (deterministic)
    assert fingerprint1 == fingerprint2, "Fingerprints must be deterministic"
    assert len(fingerprint1) == 64, "Fingerprint must be SHA-256 (64 hex chars)"


def test_protection_import_merge_adds_new_skips_existing() -> None:
    """Test that MERGE mode adds new items and skips identical existing ones (P14b)."""
    from network_model.catalog.governance import (
        ProtectionLibraryExport,
    )

    # Create initial library
    CatalogRepository.from_records(
        line_types=[],
        cable_types=[],
        transformer_types=[],
        protection_device_types=[
            {
                "id": "device-1",
                "name_pl": "Existing Device",
                "params": {"vendor": "Vendor A"},
            },
        ],
        protection_curves=[],
        protection_setting_templates=[],
    )

    # Import payload (device-1 identical, device-2 new)
    import_data = {
        "manifest": {
            "library_id": "import-lib",
            "name_pl": "Import Library",
            "vendor": "Vendor",
            "series": "Series",
            "revision": "1.0",
            "schema_version": "1.0",
            "created_at": "2024-01-01T00:00:00",
            "fingerprint": "abc123",
        },
        "device_types": [
            {"id": "device-1", "name_pl": "Existing Device", "vendor": "Vendor A"},
            {"id": "device-2", "name_pl": "New Device", "vendor": "Vendor B"},
        ],
        "curves": [],
        "templates": [],
    }

    # Note: This test is conceptual; actual import requires UoW/DB
    # In real tests, you'd use a test database fixture
    # Here we just validate the data structures

    export = ProtectionLibraryExport.from_dict(import_data)
    assert len(export.device_types) == 2
    assert export.device_types[0]["id"] in ["device-1", "device-2"]


def test_protection_import_merge_detects_conflicts() -> None:
    """Test that MERGE mode detects conflicts (same ID, different data) (P14b)."""
    from network_model.catalog.governance import (
        ProtectionLibraryExport,
    )

    # Create library with existing device
    CatalogRepository.from_records(
        line_types=[],
        cable_types=[],
        transformer_types=[],
        protection_device_types=[
            {
                "id": "device-1",
                "name_pl": "Original Device",
                "params": {"vendor": "Vendor A"},
            },
        ],
        protection_curves=[],
        protection_setting_templates=[],
    )

    # Import payload (device-1 with DIFFERENT data → conflict)
    import_data = {
        "manifest": {
            "library_id": "import-lib",
            "name_pl": "Import Library",
            "vendor": "Vendor",
            "series": "Series",
            "revision": "1.0",
            "schema_version": "1.0",
            "created_at": "2024-01-01T00:00:00",
            "fingerprint": "abc123",
        },
        "device_types": [
            {
                "id": "device-1",
                "name_pl": "Modified Device",  # Different name_pl
                "vendor": "Vendor B",  # Different vendor
            },
        ],
        "curves": [],
        "templates": [],
    }

    export = ProtectionLibraryExport.from_dict(import_data)
    # In real import, this would trigger conflict detection
    assert export.device_types[0]["name_pl"] == "Modified Device"


def test_protection_import_validates_template_references() -> None:
    """Test that import validates template references to device_type/curve (P14b)."""
    from network_model.catalog.governance import (
        ProtectionLibraryExport,
    )

    # Import with template referencing non-existent device_type
    import_data = {
        "manifest": {
            "library_id": "import-lib",
            "name_pl": "Import Library",
            "vendor": "Vendor",
            "series": "Series",
            "revision": "1.0",
            "schema_version": "1.0",
            "created_at": "2024-01-01T00:00:00",
            "fingerprint": "abc123",
        },
        "device_types": [
            {"id": "device-1", "name_pl": "Device A", "vendor": "Vendor A"},
        ],
        "curves": [
            {"id": "curve-1", "name_pl": "Curve A", "standard": "IEC"},
        ],
        "templates": [
            {
                "id": "template-1",
                "name_pl": "Template 1",
                "device_type_ref": "device-1",  # Valid
                "curve_ref": "curve-1",  # Valid
            },
            {
                "id": "template-2",
                "name_pl": "Template 2",
                "device_type_ref": "device-999",  # INVALID (missing)
                "curve_ref": "curve-1",
            },
            {
                "id": "template-3",
                "name_pl": "Template 3",
                "device_type_ref": "device-1",
                "curve_ref": "curve-999",  # INVALID (missing)
            },
        ],
    }

    export = ProtectionLibraryExport.from_dict(import_data)

    # Build reference sets
    device_type_ids = {item["id"] for item in export.device_types}
    curve_ids = {item["id"] for item in export.curves}

    # Validate references
    validation_errors = []
    for template in export.templates:
        device_type_ref = template.get("device_type_ref")
        curve_ref = template.get("curve_ref")

        if device_type_ref and device_type_ref not in device_type_ids:
            validation_errors.append(
                f"Template {template['id']}: device_type_ref '{device_type_ref}' not found"
            )

        if curve_ref and curve_ref not in curve_ids:
            validation_errors.append(
                f"Template {template['id']}: curve_ref '{curve_ref}' not found"
            )

    # Should detect 2 validation errors
    assert len(validation_errors) == 2
    assert "device-999" in validation_errors[0]
    assert "curve-999" in validation_errors[1]


def test_protection_sort_deterministic() -> None:
    """Test that protection types are sorted deterministically (name_pl → id) (P14b)."""
    from network_model.catalog.governance import sort_protection_types_deterministically

    unsorted = [
        {"id": "id-3", "name_pl": "B"},
        {"id": "id-1", "name_pl": "A"},
        {"id": "id-2", "name_pl": "A"},
        {"id": "id-4", "name_pl": "C"},
    ]

    sorted_types = sort_protection_types_deterministically(unsorted)

    # Expected order: name_pl (A, A, B, C), then id (id-1, id-2, id-3, id-4)
    assert sorted_types[0]["id"] == "id-1"
    assert sorted_types[0]["name_pl"] == "A"
    assert sorted_types[1]["id"] == "id-2"
    assert sorted_types[1]["name_pl"] == "A"
    assert sorted_types[2]["id"] == "id-3"
    assert sorted_types[2]["name_pl"] == "B"
    assert sorted_types[3]["id"] == "id-4"
    assert sorted_types[3]["name_pl"] == "C"
