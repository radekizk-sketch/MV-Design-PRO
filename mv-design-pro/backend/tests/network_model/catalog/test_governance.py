"""
Tests for Type Library Governance (P13b)

Verifies:
- Deterministic export (same state → identical JSON)
- Fingerprint stability
- Import merge (add new, skip existing)
- Import replace (blocked when types in use)
- Conflict detection (409)
"""

from datetime import UTC

import pytest
from network_model.catalog.governance import (
    ImportMode,
    TypeLibraryExport,
    TypeLibraryManifest,
    compute_fingerprint,
    sort_types_deterministically,
)


def _has_whitespace_outside_strings(s: str) -> bool:
    """
    Check if JSON string contains whitespace outside of string values.

    Returns True if structural whitespace (spaces, newlines, tabs) exists
    outside of JSON string literals. Spacje wewnątrz stringów (np. "Line A")
    są legalne i nie są wykrywane.

    Args:
        s: JSON string to check

    Returns:
        True if whitespace found outside strings, False otherwise
    """
    in_str = False
    esc = False
    for ch in s:
        if in_str:
            if esc:
                esc = False
                continue
            if ch == "\\":
                esc = True
                continue
            if ch == '"':
                in_str = False
            continue
        else:
            if ch == '"':
                in_str = True
                continue
            if ch in (" ", "\n", "\t", "\r"):
                return True
    return False


def test_sort_types_deterministically():
    """Types are sorted by (name, id)."""
    types = [
        {"id": "id3", "name": "ZZZ"},
        {"id": "id1", "name": "AAA"},
        {"id": "id2", "name": "AAA"},
    ]

    sorted_types = sort_types_deterministically(types)

    assert sorted_types[0]["id"] == "id1"  # AAA, id1
    assert sorted_types[1]["id"] == "id2"  # AAA, id2
    assert sorted_types[2]["id"] == "id3"  # ZZZ, id3


def test_export_deterministic_ordering():
    """Same types → same export structure (deterministic)."""
    line_types = [
        {"id": "line2", "name": "Line B", "r_ohm_per_km": 0.2},
        {"id": "line1", "name": "Line A", "r_ohm_per_km": 0.1},
    ]
    cable_types = [
        {"id": "cable2", "name": "Cable B"},
        {"id": "cable1", "name": "Cable A"},
    ]

    manifest = TypeLibraryManifest(
        library_id="lib1",
        name_pl="Test Library",
        vendor="Test Vendor",
        series="Test Series",
        revision="1.0",
        schema_version="1.0",
        created_at="2026-01-01T00:00:00",
        fingerprint="",
    )

    export = TypeLibraryExport(
        manifest=manifest,
        line_types=sort_types_deterministically(line_types),
        cable_types=sort_types_deterministically(cable_types),
        transformer_types=[],
        switch_types=[],
    )

    # Types should be sorted by (name, id)
    assert export.line_types[0]["id"] == "line1"
    assert export.line_types[1]["id"] == "line2"
    assert export.cable_types[0]["id"] == "cable1"
    assert export.cable_types[1]["id"] == "cable2"


def test_fingerprint_is_deterministic():
    """Same export → identical fingerprint."""
    manifest = TypeLibraryManifest(
        library_id="lib1",
        name_pl="Test",
        vendor="Vendor",
        series="Series",
        revision="1.0",
        schema_version="1.0",
        created_at="2026-01-01T00:00:00",
        fingerprint="",
    )

    export1 = TypeLibraryExport(
        manifest=manifest,
        line_types=[{"id": "line1", "name": "Line A"}],
        cable_types=[],
        transformer_types=[],
        switch_types=[],
    )

    export2 = TypeLibraryExport(
        manifest=manifest,
        line_types=[{"id": "line1", "name": "Line A"}],
        cable_types=[],
        transformer_types=[],
        switch_types=[],
    )

    fp1 = compute_fingerprint(export1)
    fp2 = compute_fingerprint(export2)

    assert fp1 == fp2
    assert len(fp1) == 64  # SHA-256 hex digest


def test_fingerprint_changes_with_content():
    """Different export → different fingerprint."""
    manifest = TypeLibraryManifest(
        library_id="lib1",
        name_pl="Test",
        vendor="Vendor",
        series="Series",
        revision="1.0",
        schema_version="1.0",
        created_at="2026-01-01T00:00:00",
        fingerprint="",
    )

    export1 = TypeLibraryExport(
        manifest=manifest,
        line_types=[{"id": "line1", "name": "Line A"}],
        cable_types=[],
        transformer_types=[],
        switch_types=[],
    )

    export2 = TypeLibraryExport(
        manifest=manifest,
        line_types=[{"id": "line2", "name": "Line B"}],  # Different
        cable_types=[],
        transformer_types=[],
        switch_types=[],
    )

    fp1 = compute_fingerprint(export1)
    fp2 = compute_fingerprint(export2)

    assert fp1 != fp2


def test_canonical_json_is_deterministic():
    """Same export → identical canonical JSON (no structural whitespace variance)."""
    manifest = TypeLibraryManifest(
        library_id="lib1",
        name_pl="Test",
        vendor="Vendor",
        series="Series",
        revision="1.0",
        schema_version="1.0",
        created_at="2026-01-01T00:00:00",
        fingerprint="",
    )

    export = TypeLibraryExport(
        manifest=manifest,
        line_types=[{"id": "line1", "name": "Line A", "r_ohm_per_km": 0.1}],
        cable_types=[],
        transformer_types=[],
        switch_types=[],
    )

    json1 = export.to_canonical_json()
    json2 = export.to_canonical_json()

    assert json1 == json2
    assert not _has_whitespace_outside_strings(
        json1
    )  # No structural whitespace outside JSON strings


def test_manifest_to_dict_preserves_order():
    """Manifest.to_dict() returns canonical order."""
    manifest = TypeLibraryManifest(
        library_id="lib1",
        name_pl="Test",
        vendor="Vendor",
        series="Series",
        revision="1.0",
        schema_version="1.0",
        created_at="2026-01-01T00:00:00",
        fingerprint="abc123",
        description_pl="Description",
    )

    data = manifest.to_dict()

    # Check all fields present
    assert data["library_id"] == "lib1"
    assert data["name_pl"] == "Test"
    assert data["vendor"] == "Vendor"
    assert data["series"] == "Series"
    assert data["revision"] == "1.0"
    assert data["schema_version"] == "1.0"
    assert data["created_at"] == "2026-01-01T00:00:00"
    assert data["fingerprint"] == "abc123"
    assert data["description_pl"] == "Description"


def test_export_to_dict_has_all_fields():
    """Export.to_dict() includes manifest + all type categories."""
    manifest = TypeLibraryManifest(
        library_id="lib1",
        name_pl="Test",
        vendor="Vendor",
        series="Series",
        revision="1.0",
        schema_version="1.0",
        created_at="2026-01-01T00:00:00",
        fingerprint="",
    )

    export = TypeLibraryExport(
        manifest=manifest,
        line_types=[{"id": "line1"}],
        cable_types=[{"id": "cable1"}],
        transformer_types=[{"id": "trafo1"}],
        switch_types=[{"id": "switch1"}],
    )

    data = export.to_dict()

    assert "manifest" in data
    assert "line_types" in data
    assert "cable_types" in data
    assert "transformer_types" in data
    assert "switch_types" in data
    assert len(data["line_types"]) == 1
    assert len(data["cable_types"]) == 1


def test_import_mode_enum():
    """ImportMode enum has MERGE and REPLACE."""
    assert ImportMode.MERGE.value == "merge"
    assert ImportMode.REPLACE.value == "replace"
    assert ImportMode("merge") == ImportMode.MERGE
    assert ImportMode("replace") == ImportMode.REPLACE


### Integration Tests (require database)
# These tests verify full export/import cycle with persistence


@pytest.mark.integration
def test_export_import_round_trip(test_db_session):
    """Export → Import → Export should yield same data (deterministic)."""
    from application.catalog_governance.service import CatalogGovernanceService
    from infrastructure.persistence.repositories.unit_of_work import UnitOfWorkFactory

    uow_factory = UnitOfWorkFactory(lambda: test_db_session)
    service = CatalogGovernanceService(uow_factory)

    # Add initial types
    with uow_factory() as uow:
        uow.wizard.upsert_line_type(
            {"id": "line1", "name": "Line A", "params": {"r_ohm_per_km": 0.1}},
            commit=False,
        )
        uow.wizard.upsert_cable_type(
            {"id": "cable1", "name": "Cable A", "params": {"r_ohm_per_km": 0.2}},
            commit=False,
        )
        uow.commit()

    # Export
    export1 = service.export_type_library(
        library_name_pl="Test Library",
        vendor="Test Vendor",
        series="Standard",
        revision="1.0",
    )

    # Clear catalog
    with uow_factory() as uow:
        from infrastructure.persistence.models import CableTypeORM, LineTypeORM

        test_db_session.query(LineTypeORM).delete()
        test_db_session.query(CableTypeORM).delete()
        uow.commit()

    # Import
    report = service.import_type_library(export1, mode=ImportMode.MERGE)

    assert report["success"] is True
    assert len(report["added"]) == 2
    assert len(report["skipped"]) == 0
    assert len(report["conflicts"]) == 0

    # Export again
    export2 = service.export_type_library(
        library_name_pl="Test Library",
        vendor="Test Vendor",
        series="Standard",
        revision="1.0",
    )

    # Compare (excluding timestamps and fingerprints)
    assert len(export1["line_types"]) == len(export2["line_types"])
    assert len(export1["cable_types"]) == len(export2["cable_types"])
    assert export1["line_types"][0]["id"] == export2["line_types"][0]["id"]
    assert export1["cable_types"][0]["id"] == export2["cable_types"][0]["id"]


@pytest.mark.integration
def test_import_merge_skips_existing(test_db_session):
    """MERGE mode skips existing types (no overwrites)."""
    from application.catalog_governance.service import CatalogGovernanceService
    from infrastructure.persistence.repositories.unit_of_work import UnitOfWorkFactory

    uow_factory = UnitOfWorkFactory(lambda: test_db_session)
    service = CatalogGovernanceService(uow_factory)

    # Add initial type
    with uow_factory() as uow:
        uow.wizard.upsert_line_type(
            {"id": "line1", "name": "Original Name", "params": {"r_ohm_per_km": 0.1}},
            commit=False,
        )
        uow.commit()

    # Import with same ID but different name
    export_data = {
        "manifest": {
            "library_id": "lib1",
            "name_pl": "Test",
            "vendor": "Vendor",
            "series": "Series",
            "revision": "1.0",
            "schema_version": "1.0",
            "created_at": "2026-01-01T00:00:00",
            "fingerprint": "abc",
        },
        "line_types": [
            {"id": "line1", "name": "Modified Name", "params": {"r_ohm_per_km": 0.2}},
            {"id": "line2", "name": "New Type", "params": {"r_ohm_per_km": 0.3}},
        ],
        "cable_types": [],
        "transformer_types": [],
        "switch_types": [],
    }

    report = service.import_type_library(export_data, mode=ImportMode.MERGE)

    assert report["success"] is True
    assert "line1" in report["skipped"]  # Existing type skipped
    assert "line2" in report["added"]  # New type added

    # Verify original name preserved (not modified)
    with uow_factory() as uow:
        types = uow.wizard.list_line_types()
        line1 = next(t for t in types if t["id"] == "line1")
        assert line1["name"] == "Original Name"  # Not modified


@pytest.mark.integration
def test_import_replace_blocked_when_types_in_use(test_db_session):
    """REPLACE mode blocked when types are referenced by instances."""
    from datetime import datetime
    from uuid import uuid4

    from application.catalog_governance.service import CatalogGovernanceService
    from infrastructure.persistence.models import NetworkBranchORM, NetworkNodeORM, ProjectORM
    from infrastructure.persistence.repositories.unit_of_work import UnitOfWorkFactory

    uow_factory = UnitOfWorkFactory(lambda: test_db_session)
    service = CatalogGovernanceService(uow_factory)

    type_id = str(uuid4())
    project_id = uuid4()
    node_from_id = uuid4()
    node_to_id = uuid4()
    branch_id = uuid4()

    # Add type
    with uow_factory() as uow:
        uow.wizard.upsert_line_type(
            {"id": type_id, "name": "In-Use Type", "params": {"r_ohm_per_km": 0.1}},
            commit=False,
        )

        # Add project (required for FK)
        project = ProjectORM(
            id=project_id,
            name="Test Project",
            description="Test",
            schema_version="1.0",
            sources_jsonb=[],
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        test_db_session.add(project)

        # Add nodes (required for FK)
        node_from = NetworkNodeORM(
            id=node_from_id,
            project_id=project_id,
            name="Node From",
            node_type="bus",
            base_kv=15.0,
            attrs_jsonb={},
        )
        node_to = NetworkNodeORM(
            id=node_to_id,
            project_id=project_id,
            name="Node To",
            node_type="bus",
            base_kv=15.0,
            attrs_jsonb={},
        )
        test_db_session.add(node_from)
        test_db_session.add(node_to)

        # Add branch with type_ref in params
        branch = NetworkBranchORM(
            id=branch_id,
            project_id=project_id,
            name="Branch 1",
            branch_type="line",
            from_node_id=node_from_id,
            to_node_id=node_to_id,
            in_service=True,
            params_jsonb={"type_ref": type_id},  # This references the type
        )
        test_db_session.add(branch)

        uow.commit()

    # Try to REPLACE
    export_data = {
        "manifest": {
            "library_id": "lib1",
            "name_pl": "Test",
            "vendor": "Vendor",
            "series": "Series",
            "revision": "1.0",
            "schema_version": "1.0",
            "created_at": "2026-01-01T00:00:00",
            "fingerprint": "abc",
        },
        "line_types": [
            {"id": "new_type", "name": "Replacement Type", "params": {"r_ohm_per_km": 0.2}}
        ],
        "cable_types": [],
        "transformer_types": [],
        "switch_types": [],
    }

    with pytest.raises(ValueError, match="REPLACE blocked"):
        service.import_type_library(export_data, mode=ImportMode.REPLACE)


@pytest.mark.integration
def test_export_determinism_with_real_data(test_db_session):
    """Same catalog state → identical export (deterministic)."""
    from application.catalog_governance.service import CatalogGovernanceService
    from infrastructure.persistence.repositories.unit_of_work import UnitOfWorkFactory

    uow_factory = UnitOfWorkFactory(lambda: test_db_session)
    service = CatalogGovernanceService(uow_factory)

    # Add types
    with uow_factory() as uow:
        uow.wizard.upsert_line_type(
            {"id": "line2", "name": "Line B", "params": {"r_ohm_per_km": 0.2}},
            commit=False,
        )
        uow.wizard.upsert_line_type(
            {"id": "line1", "name": "Line A", "params": {"r_ohm_per_km": 0.1}},
            commit=False,
        )
        uow.commit()

    # Export twice
    export1 = service.export_type_library()
    export2 = service.export_type_library()

    # Fingerprints should match
    assert export1["manifest"]["fingerprint"] == export2["manifest"]["fingerprint"]

    # Types should be sorted (line1 before line2)
    assert export1["line_types"][0]["id"] == "line1"
    assert export1["line_types"][1]["id"] == "line2"
