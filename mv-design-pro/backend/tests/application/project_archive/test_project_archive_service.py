"""
Integration Tests for Project Archive Service — P31.

Tests:
- Export project from database
- Import project to database
- Roundtrip: export → import → state identical
- Determinism: 2× export = identical ZIP
"""

from __future__ import annotations

import io
import json
import zipfile
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from application.project_archive.service import ProjectArchiveService
from domain.project_archive import (
    ARCHIVE_FORMAT_ID,
    ARCHIVE_SCHEMA_VERSION,
    ArchiveImportStatus,
)
from infrastructure.persistence.models import (
    NetworkBranchORM,
    NetworkNodeORM,
    ProjectORM,
    StudyCaseORM,
)

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def sample_project(test_db_session):
    """Create a sample project in the database."""
    project_id = uuid4()
    now = datetime.now(UTC)

    # Create project
    project = ProjectORM(
        id=project_id,
        name="Projekt Testowy Export",
        description="Opis projektu do testów eksportu",
        schema_version="1.0.0",
        active_network_snapshot_id=None,
        connection_node_id=None,
        sources_jsonb=[{"type": "GRID", "ssc_mva": 100.0}],
        created_at=now,
        updated_at=now,
    )
    test_db_session.add(project)

    # Create nodes
    node1_id = uuid4()
    node2_id = uuid4()

    node1 = NetworkNodeORM(
        id=node1_id,
        project_id=project_id,
        name="BUS-1",
        node_type="BUS",
        base_kv=15.0,
        attrs_jsonb={"nominal_voltage": 15.0},
    )
    node2 = NetworkNodeORM(
        id=node2_id,
        project_id=project_id,
        name="BUS-2",
        node_type="BUS",
        base_kv=15.0,
        attrs_jsonb={"nominal_voltage": 15.0},
    )
    test_db_session.add(node1)
    test_db_session.add(node2)

    # Create branch
    branch = NetworkBranchORM(
        id=uuid4(),
        project_id=project_id,
        name="LINE-1",
        branch_type="LINE",
        from_node_id=node1_id,
        to_node_id=node2_id,
        in_service=True,
        params_jsonb={"r_ohm_per_km": 0.2, "x_ohm_per_km": 0.3, "length_km": 1.0},
    )
    test_db_session.add(branch)

    # Create study case
    case = StudyCaseORM(
        id=uuid4(),
        project_id=project_id,
        name="Przypadek Testowy",
        description="Opis przypadku",
        network_snapshot_id=None,
        study_jsonb={"c_factor_max": 1.1, "c_factor_min": 0.95},
        is_active=True,
        result_status="NONE",
        result_refs_jsonb=[],
        revision=1,
        created_at=now,
        updated_at=now,
    )
    test_db_session.add(case)

    test_db_session.commit()

    return project


# =============================================================================
# Test: Export
# =============================================================================


class TestExport:
    """Tests for project export."""

    def test_export_creates_valid_zip(self, test_db_session, sample_project):
        """Export should create a valid ZIP file."""
        service = ProjectArchiveService(test_db_session)

        archive_bytes = service.export_project(sample_project.id)

        # Should be a valid ZIP
        zip_buffer = io.BytesIO(archive_bytes)
        with zipfile.ZipFile(zip_buffer, "r") as zf:
            assert "project.json" in zf.namelist()
            assert "manifest.json" in zf.namelist()

    def test_export_contains_project_data(self, test_db_session, sample_project):
        """Export should contain project data."""
        service = ProjectArchiveService(test_db_session)

        archive_bytes = service.export_project(sample_project.id)

        zip_buffer = io.BytesIO(archive_bytes)
        with zipfile.ZipFile(zip_buffer, "r") as zf:
            project_json = json.loads(zf.read("project.json"))

        assert project_json["format_id"] == ARCHIVE_FORMAT_ID
        assert project_json["schema_version"] == ARCHIVE_SCHEMA_VERSION
        assert project_json["project_meta"]["name"] == "Projekt Testowy Export"

    def test_export_contains_network_model(self, test_db_session, sample_project):
        """Export should contain network model."""
        service = ProjectArchiveService(test_db_session)

        archive_bytes = service.export_project(sample_project.id)

        zip_buffer = io.BytesIO(archive_bytes)
        with zipfile.ZipFile(zip_buffer, "r") as zf:
            project_json = json.loads(zf.read("project.json"))

        network = project_json["network_model"]
        assert len(network["nodes"]) == 2
        assert len(network["branches"]) == 1
        assert network["nodes"][0]["name"] in ["BUS-1", "BUS-2"]

    def test_export_contains_cases(self, test_db_session, sample_project):
        """Export should contain study cases."""
        service = ProjectArchiveService(test_db_session)

        archive_bytes = service.export_project(sample_project.id)

        zip_buffer = io.BytesIO(archive_bytes)
        with zipfile.ZipFile(zip_buffer, "r") as zf:
            project_json = json.loads(zf.read("project.json"))

        cases = project_json["cases"]
        assert len(cases["study_cases"]) == 1
        assert cases["study_cases"][0]["name"] == "Przypadek Testowy"

    def test_export_includes_fingerprints(self, test_db_session, sample_project):
        """Export should include fingerprints."""
        service = ProjectArchiveService(test_db_session)

        archive_bytes = service.export_project(sample_project.id)

        zip_buffer = io.BytesIO(archive_bytes)
        with zipfile.ZipFile(zip_buffer, "r") as zf:
            project_json = json.loads(zf.read("project.json"))

        fingerprints = project_json["fingerprints"]
        assert "archive_hash" in fingerprints
        assert len(fingerprints["archive_hash"]) == 64  # SHA-256 hex


# =============================================================================
# Test: Determinism
# =============================================================================


class TestExportDeterminism:
    """Tests for deterministic export."""

    def test_double_export_identical(self, test_db_session, sample_project):
        """Two exports should produce identical archives."""
        service = ProjectArchiveService(test_db_session)

        archive1 = service.export_project(sample_project.id)
        archive2 = service.export_project(sample_project.id)

        # Extract project.json from both
        def get_project_json(archive_bytes):
            zip_buffer = io.BytesIO(archive_bytes)
            with zipfile.ZipFile(zip_buffer, "r") as zf:
                return zf.read("project.json").decode("utf-8")

        json1 = get_project_json(archive1)
        json2 = get_project_json(archive2)

        # Content should be identical
        assert json1 == json2

    def test_double_export_identical_hash(self, test_db_session, sample_project):
        """Two exports should have identical archive hashes."""
        service = ProjectArchiveService(test_db_session)

        archive1 = service.export_project(sample_project.id)
        archive2 = service.export_project(sample_project.id)

        def get_archive_hash(archive_bytes):
            zip_buffer = io.BytesIO(archive_bytes)
            with zipfile.ZipFile(zip_buffer, "r") as zf:
                project_json = json.loads(zf.read("project.json"))
            return project_json["fingerprints"]["archive_hash"]

        hash1 = get_archive_hash(archive1)
        hash2 = get_archive_hash(archive2)

        assert hash1 == hash2


# =============================================================================
# Test: Import
# =============================================================================


class TestImport:
    """Tests for project import."""

    def test_import_creates_project(self, test_db_session, sample_project):
        """Import should create a new project."""
        service = ProjectArchiveService(test_db_session)

        # Export
        archive_bytes = service.export_project(sample_project.id)

        # Count projects before import
        projects_before = test_db_session.query(ProjectORM).count()

        # Import
        result = service.import_project(archive_bytes, new_project_name="Imported Project")

        # Should succeed
        assert result.status == ArchiveImportStatus.SUCCESS
        assert result.project_id is not None

        # Should have one more project
        projects_after = test_db_session.query(ProjectORM).count()
        assert projects_after == projects_before + 1

    def test_import_preserves_network(self, test_db_session, sample_project):
        """Import should preserve network model."""
        service = ProjectArchiveService(test_db_session)

        # Export
        archive_bytes = service.export_project(sample_project.id)

        # Count nodes/branches before import
        nodes_before = test_db_session.query(NetworkNodeORM).count()
        branches_before = test_db_session.query(NetworkBranchORM).count()

        # Import
        result = service.import_project(archive_bytes)
        assert result.status == ArchiveImportStatus.SUCCESS

        # Should have more nodes and branches
        nodes_after = test_db_session.query(NetworkNodeORM).count()
        branches_after = test_db_session.query(NetworkBranchORM).count()

        # Should have 2 more nodes (BUS-1, BUS-2) and 1 more branch (LINE-1)
        assert nodes_after == nodes_before + 2
        assert branches_after == branches_before + 1

    def test_import_creates_new_ids(self, test_db_session, sample_project):
        """Import should create new IDs for all entities."""
        service = ProjectArchiveService(test_db_session)

        # Export
        archive_bytes = service.export_project(sample_project.id)

        # Import
        result = service.import_project(archive_bytes)
        assert result.status == ArchiveImportStatus.SUCCESS

        # New project should have different ID
        assert result.project_id != str(sample_project.id)

    def test_import_with_new_name(self, test_db_session, sample_project):
        """Import should use new name if provided."""
        service = ProjectArchiveService(test_db_session)

        # Export
        archive_bytes = service.export_project(sample_project.id)

        # Import with new name
        result = service.import_project(archive_bytes, new_project_name="Nowy Projekt")
        assert result.status == ArchiveImportStatus.SUCCESS

        # Find imported project
        imported = (
            test_db_session.query(ProjectORM).filter(ProjectORM.id == result.project_id).first()
        )

        assert imported is not None
        assert imported.name == "Nowy Projekt"


# =============================================================================
# Test: Roundtrip
# =============================================================================


class TestRoundtrip:
    """Tests for export → import → identical state."""

    def test_roundtrip_preserves_project_name(self, test_db_session, sample_project):
        """Roundtrip should preserve project name."""
        service = ProjectArchiveService(test_db_session)

        # Export
        archive_bytes = service.export_project(sample_project.id)

        # Import (without new name)
        result = service.import_project(archive_bytes)
        assert result.status == ArchiveImportStatus.SUCCESS

        # Find imported project
        imported = (
            test_db_session.query(ProjectORM).filter(ProjectORM.id == result.project_id).first()
        )

        assert imported is not None
        assert imported.name == sample_project.name

    def test_roundtrip_preserves_network_structure(self, test_db_session, sample_project):
        """Roundtrip should preserve network structure."""
        service = ProjectArchiveService(test_db_session)

        # Count original network elements
        original_nodes = (
            test_db_session.query(NetworkNodeORM)
            .filter(NetworkNodeORM.project_id == sample_project.id)
            .all()
        )
        original_branches = (
            test_db_session.query(NetworkBranchORM)
            .filter(NetworkBranchORM.project_id == sample_project.id)
            .all()
        )

        # Export
        archive_bytes = service.export_project(sample_project.id)

        # Import
        result = service.import_project(archive_bytes)
        assert result.status == ArchiveImportStatus.SUCCESS

        # Count imported network elements
        imported_nodes = (
            test_db_session.query(NetworkNodeORM)
            .filter(NetworkNodeORM.project_id == result.project_id)
            .all()
        )
        imported_branches = (
            test_db_session.query(NetworkBranchORM)
            .filter(NetworkBranchORM.project_id == result.project_id)
            .all()
        )

        # Should have same count
        assert len(imported_nodes) == len(original_nodes)
        assert len(imported_branches) == len(original_branches)

        # Should have same names
        original_node_names = {n.name for n in original_nodes}
        imported_node_names = {n.name for n in imported_nodes}
        assert original_node_names == imported_node_names


# =============================================================================
# Test: Preview
# =============================================================================


class TestPreview:
    """Tests for archive preview."""

    def test_preview_valid_archive(self, test_db_session, sample_project):
        """Preview should work for valid archive."""
        service = ProjectArchiveService(test_db_session)

        # Export
        archive_bytes = service.export_project(sample_project.id)

        # Preview
        preview = service.preview_archive(archive_bytes)

        assert preview["valid"] is True
        assert preview["project_name"] == "Projekt Testowy Export"
        assert preview["format_id"] == ARCHIVE_FORMAT_ID

    def test_preview_shows_summary(self, test_db_session, sample_project):
        """Preview should show content summary."""
        service = ProjectArchiveService(test_db_session)

        # Export
        archive_bytes = service.export_project(sample_project.id)

        # Preview
        preview = service.preview_archive(archive_bytes)

        summary = preview["summary"]
        assert summary["nodes_count"] == 2
        assert summary["branches_count"] == 1
        assert summary["study_cases_count"] == 1

    def test_preview_invalid_zip(self, test_db_session):
        """Preview should handle invalid ZIP."""
        service = ProjectArchiveService(test_db_session)

        # Invalid ZIP bytes
        invalid_bytes = b"not a zip file"

        preview = service.preview_archive(invalid_bytes)

        assert preview["valid"] is False
        assert "error" in preview


# =============================================================================
# Test: Error Handling
# =============================================================================


class TestErrorHandling:
    """Tests for error handling."""

    def test_export_nonexistent_project(self, test_db_session):
        """Export should fail for nonexistent project."""
        service = ProjectArchiveService(test_db_session)

        with pytest.raises(Exception) as exc_info:
            service.export_project(uuid4())

        assert "nie istnieje" in str(exc_info.value)

    def test_import_invalid_zip(self, test_db_session):
        """Import should fail for invalid ZIP."""
        service = ProjectArchiveService(test_db_session)

        invalid_bytes = b"not a zip file"

        result = service.import_project(invalid_bytes)

        assert result.status == ArchiveImportStatus.FAILED
        assert len(result.errors) > 0

    def test_import_missing_project_json(self, test_db_session):
        """Import should fail for ZIP without project.json."""
        service = ProjectArchiveService(test_db_session)

        # Create ZIP without project.json
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w") as zf:
            zf.writestr("other_file.txt", "some content")

        result = service.import_project(zip_buffer.getvalue())

        assert result.status == ArchiveImportStatus.FAILED
        assert any("project.json" in err for err in result.errors)
