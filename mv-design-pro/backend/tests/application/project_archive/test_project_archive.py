"""
Tests for Project Archive — P31.

KANON:
- Import/Export = NOT-A-SOLVER
- Zero nowych obliczeń
- Determinizm absolutny
- Kompatybilność wsteczna

Testy:
- export → import → stan identyczny
- determinism: 2× export = identyczne archiwum (hash)
- import starszej wersji → działa
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from domain.project_archive import (
    ARCHIVE_FORMAT_ID,
    ARCHIVE_SCHEMA_VERSION,
    ArchiveStructureError,
    ArchiveVersionError,
    CasesSection,
    InterpretationsSection,
    IssuesSection,
    NetworkModelSection,
    ProjectArchive,
    ProjectMeta,
    ProofsSection,
    ResultsSection,
    RunsSection,
    SldSection,
    archive_to_dict,
    canonicalize,
    compute_archive_fingerprints,
    compute_hash,
    dict_to_archive,
    verify_archive_integrity,
)

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def sample_project_meta() -> ProjectMeta:
    """Sample project metadata."""
    return ProjectMeta(
        id=str(uuid4()),
        name="Projekt Testowy",
        description="Opis testowego projektu",
        schema_version="1.0.0",
        active_network_snapshot_id="abc123def456",
        connection_node_id=str(uuid4()),
        sources=[{"type": "GRID", "ssc_mva": 100.0}],
        created_at=datetime(2024, 1, 15, 10, 30, 0, tzinfo=UTC).isoformat(),
        updated_at=datetime(2024, 1, 15, 12, 0, 0, tzinfo=UTC).isoformat(),
    )


@pytest.fixture
def sample_network_model() -> NetworkModelSection:
    """Sample network model section."""
    node1_id = str(uuid4())
    node2_id = str(uuid4())

    return NetworkModelSection(
        nodes=[
            {
                "id": node1_id,
                "name": "BUS-1",
                "node_type": "BUS",
                "base_kv": 15.0,
                "attrs_jsonb": {},
            },
            {
                "id": node2_id,
                "name": "BUS-2",
                "node_type": "BUS",
                "base_kv": 15.0,
                "attrs_jsonb": {},
            },
        ],
        branches=[
            {
                "id": str(uuid4()),
                "name": "LINE-1",
                "branch_type": "LINE",
                "from_node_id": node1_id,
                "to_node_id": node2_id,
                "in_service": True,
                "params_jsonb": {"r_ohm_per_km": 0.2, "x_ohm_per_km": 0.3},
            }
        ],
        sources=[
            {
                "id": str(uuid4()),
                "node_id": node1_id,
                "source_type": "GRID",
                "payload_jsonb": {"ssc_mva": 100.0},
                "in_service": True,
            }
        ],
        loads=[
            {
                "id": str(uuid4()),
                "node_id": node2_id,
                "payload_jsonb": {"p_mw": 1.5, "q_mvar": 0.5},
                "in_service": True,
            }
        ],
        snapshots=[],
    )


@pytest.fixture
def sample_sld_section() -> SldSection:
    """Sample SLD section."""
    return SldSection(
        diagrams=[],
        node_symbols=[],
        branch_symbols=[],
        annotations=[],
    )


@pytest.fixture
def sample_cases_section() -> CasesSection:
    """Sample cases section."""
    return CasesSection(
        study_cases=[
            {
                "id": str(uuid4()),
                "name": "Przypadek 1",
                "description": "Opis przypadku",
                "network_snapshot_id": None,
                "study_jsonb": {},
                "is_active": True,
                "result_status": "NONE",
                "result_refs_jsonb": [],
                "revision": 1,
                "created_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat(),
            }
        ],
        operating_cases=[],
        switching_states=[],
        settings=None,
    )


@pytest.fixture
def sample_runs_section() -> RunsSection:
    """Sample runs section."""
    return RunsSection(
        analysis_runs=[],
        analysis_runs_index=[],
        study_runs=[],
    )


@pytest.fixture
def sample_results_section() -> ResultsSection:
    """Sample results section."""
    return ResultsSection(study_results=[])


@pytest.fixture
def sample_proofs_section() -> ProofsSection:
    """Sample proofs section."""
    return ProofsSection(
        design_specs=[],
        design_proposals=[],
        design_evidence=[],
    )


@pytest.fixture
def sample_archive(
    sample_project_meta,
    sample_network_model,
    sample_sld_section,
    sample_cases_section,
    sample_runs_section,
    sample_results_section,
    sample_proofs_section,
) -> ProjectArchive:
    """Create a complete sample archive."""
    # Convert sections to dicts for fingerprint calculation
    project_meta_dict = {
        "id": sample_project_meta.id,
        "name": sample_project_meta.name,
        "description": sample_project_meta.description,
        "schema_version": sample_project_meta.schema_version,
        "active_network_snapshot_id": sample_project_meta.active_network_snapshot_id,
        "connection_node_id": sample_project_meta.connection_node_id,
        "sources": sample_project_meta.sources,
        "created_at": sample_project_meta.created_at,
        "updated_at": sample_project_meta.updated_at,
    }

    network_model_dict = {
        "nodes": sample_network_model.nodes,
        "branches": sample_network_model.branches,
        "sources": sample_network_model.sources,
        "loads": sample_network_model.loads,
        "snapshots": sample_network_model.snapshots,
    }

    sld_dict = {
        "diagrams": sample_sld_section.diagrams,
        "node_symbols": sample_sld_section.node_symbols,
        "branch_symbols": sample_sld_section.branch_symbols,
        "annotations": sample_sld_section.annotations,
    }

    cases_dict = {
        "study_cases": sample_cases_section.study_cases,
        "operating_cases": sample_cases_section.operating_cases,
        "switching_states": sample_cases_section.switching_states,
        "settings": sample_cases_section.settings,
    }

    runs_dict = {
        "analysis_runs": sample_runs_section.analysis_runs,
        "analysis_runs_index": sample_runs_section.analysis_runs_index,
        "study_runs": sample_runs_section.study_runs,
    }

    results_dict = {"study_results": sample_results_section.study_results}

    proofs_dict = {
        "design_specs": sample_proofs_section.design_specs,
        "design_proposals": sample_proofs_section.design_proposals,
        "design_evidence": sample_proofs_section.design_evidence,
    }

    interpretations_dict = {"cached": []}
    issues_dict = {"snapshot": []}

    fingerprints = compute_archive_fingerprints(
        project_meta=project_meta_dict,
        network_model=network_model_dict,
        sld=sld_dict,
        cases=cases_dict,
        runs=runs_dict,
        results=results_dict,
        proofs=proofs_dict,
        interpretations=interpretations_dict,
        issues=issues_dict,
    )

    return ProjectArchive(
        schema_version=ARCHIVE_SCHEMA_VERSION,
        format_id=ARCHIVE_FORMAT_ID,
        project_meta=sample_project_meta,
        network_model=sample_network_model,
        sld_diagrams=sample_sld_section,
        cases=sample_cases_section,
        runs=sample_runs_section,
        results=sample_results_section,
        proofs=sample_proofs_section,
        interpretations=InterpretationsSection(cached=[]),
        issues=IssuesSection(snapshot=[]),
        fingerprints=fingerprints,
    )


# =============================================================================
# Test: Canonicalization and Hashing
# =============================================================================


class TestCanonicalization:
    """Tests for canonicalization and hashing."""

    def test_canonicalize_dict_sorts_keys(self):
        """Canonicalize should sort dictionary keys."""
        data = {"z": 1, "a": 2, "m": 3}
        result = canonicalize(data)
        assert list(result.keys()) == ["a", "m", "z"]

    def test_canonicalize_nested_dict(self):
        """Canonicalize should handle nested dictionaries."""
        data = {"b": {"z": 1, "a": 2}, "a": 1}
        result = canonicalize(data)
        assert list(result.keys()) == ["a", "b"]
        assert list(result["b"].keys()) == ["a", "z"]

    def test_canonicalize_list(self):
        """Canonicalize should handle lists."""
        data = [{"b": 1, "a": 2}, {"d": 3, "c": 4}]
        result = canonicalize(data)
        assert list(result[0].keys()) == ["a", "b"]
        assert list(result[1].keys()) == ["c", "d"]

    def test_compute_hash_deterministic(self):
        """compute_hash should be deterministic."""
        data = {"name": "test", "value": 123}
        hash1 = compute_hash(data)
        hash2 = compute_hash(data)
        assert hash1 == hash2

    def test_compute_hash_different_for_different_data(self):
        """compute_hash should produce different hashes for different data."""
        data1 = {"name": "test1"}
        data2 = {"name": "test2"}
        assert compute_hash(data1) != compute_hash(data2)

    def test_compute_hash_order_independent(self):
        """compute_hash should be order-independent for dict keys."""
        data1 = {"a": 1, "b": 2}
        data2 = {"b": 2, "a": 1}
        assert compute_hash(data1) == compute_hash(data2)


# =============================================================================
# Test: Roundtrip (export → import → identical state)
# =============================================================================


class TestRoundtrip:
    """Tests for export → import roundtrip."""

    def test_archive_to_dict_and_back(self, sample_archive):
        """Archive should survive roundtrip to dict and back."""
        # Export to dict
        archive_dict = archive_to_dict(sample_archive)

        # Import from dict
        restored_archive = dict_to_archive(archive_dict)

        # Verify key fields
        assert restored_archive.schema_version == sample_archive.schema_version
        assert restored_archive.format_id == sample_archive.format_id
        assert restored_archive.project_meta.name == sample_archive.project_meta.name
        assert restored_archive.project_meta.id == sample_archive.project_meta.id

    def test_roundtrip_preserves_network_model(self, sample_archive):
        """Roundtrip should preserve network model."""
        archive_dict = archive_to_dict(sample_archive)
        restored = dict_to_archive(archive_dict)

        assert len(restored.network_model.nodes) == len(sample_archive.network_model.nodes)
        assert len(restored.network_model.branches) == len(sample_archive.network_model.branches)
        assert len(restored.network_model.sources) == len(sample_archive.network_model.sources)
        assert len(restored.network_model.loads) == len(sample_archive.network_model.loads)

    def test_roundtrip_preserves_cases(self, sample_archive):
        """Roundtrip should preserve cases."""
        archive_dict = archive_to_dict(sample_archive)
        restored = dict_to_archive(archive_dict)

        assert len(restored.cases.study_cases) == len(sample_archive.cases.study_cases)
        if sample_archive.cases.study_cases:
            assert (
                restored.cases.study_cases[0]["name"] == sample_archive.cases.study_cases[0]["name"]
            )

    def test_roundtrip_preserves_fingerprints(self, sample_archive):
        """Roundtrip should preserve fingerprints."""
        archive_dict = archive_to_dict(sample_archive)
        restored = dict_to_archive(archive_dict)

        assert restored.fingerprints.archive_hash == sample_archive.fingerprints.archive_hash
        assert (
            restored.fingerprints.network_model_hash
            == sample_archive.fingerprints.network_model_hash
        )


# =============================================================================
# Test: Determinism (2× export = identical archive)
# =============================================================================


class TestDeterminism:
    """Tests for deterministic export."""

    def test_double_export_identical_dict(self, sample_archive):
        """Two exports should produce identical dictionaries."""
        dict1 = archive_to_dict(sample_archive)
        dict2 = archive_to_dict(sample_archive)

        json1 = json.dumps(dict1, sort_keys=True, separators=(",", ":"))
        json2 = json.dumps(dict2, sort_keys=True, separators=(",", ":"))

        assert json1 == json2

    def test_double_export_identical_hash(self, sample_archive):
        """Two exports should produce identical hashes."""
        dict1 = archive_to_dict(sample_archive)
        dict2 = archive_to_dict(sample_archive)

        hash1 = compute_hash(dict1)
        hash2 = compute_hash(dict2)

        assert hash1 == hash2

    def test_fingerprints_deterministic(self):
        """Fingerprints should be deterministic."""
        data = {
            "project_meta": {"id": "123", "name": "Test"},
            "network_model": {"nodes": [], "branches": []},
        }

        fp1 = compute_archive_fingerprints(
            project_meta=data["project_meta"],
            network_model=data["network_model"],
            sld={},
            cases={},
            runs={},
            results={},
            proofs={},
            interpretations={},
            issues={},
        )

        fp2 = compute_archive_fingerprints(
            project_meta=data["project_meta"],
            network_model=data["network_model"],
            sld={},
            cases={},
            runs={},
            results={},
            proofs={},
            interpretations={},
            issues={},
        )

        assert fp1.archive_hash == fp2.archive_hash
        assert fp1.project_meta_hash == fp2.project_meta_hash


# =============================================================================
# Test: Integrity Verification
# =============================================================================


class TestIntegrity:
    """Tests for integrity verification."""

    def test_verify_integrity_valid_archive(self, sample_archive):
        """Valid archive should pass integrity check."""
        errors = verify_archive_integrity(sample_archive)
        assert errors == []

    def test_verify_integrity_detects_tampering(self, sample_archive):
        """Integrity check should detect tampered data."""
        # Tamper with the archive by changing a name
        tampered_meta = ProjectMeta(
            id=sample_archive.project_meta.id,
            name="TAMPERED NAME",  # Changed!
            description=sample_archive.project_meta.description,
            schema_version=sample_archive.project_meta.schema_version,
            active_network_snapshot_id=sample_archive.project_meta.active_network_snapshot_id,
            connection_node_id=sample_archive.project_meta.connection_node_id,
            sources=sample_archive.project_meta.sources,
            created_at=sample_archive.project_meta.created_at,
            updated_at=sample_archive.project_meta.updated_at,
        )

        tampered_archive = ProjectArchive(
            schema_version=sample_archive.schema_version,
            format_id=sample_archive.format_id,
            project_meta=tampered_meta,
            network_model=sample_archive.network_model,
            sld_diagrams=sample_archive.sld_diagrams,
            cases=sample_archive.cases,
            runs=sample_archive.runs,
            results=sample_archive.results,
            proofs=sample_archive.proofs,
            interpretations=sample_archive.interpretations,
            issues=sample_archive.issues,
            fingerprints=sample_archive.fingerprints,  # Original fingerprints!
        )

        errors = verify_archive_integrity(tampered_archive)
        assert len(errors) > 0
        assert any("project_meta" in err for err in errors)


# =============================================================================
# Test: Version Compatibility
# =============================================================================


class TestVersionCompatibility:
    """Tests for version compatibility and migration."""

    def test_reject_incompatible_future_version(self):
        """Should reject archives with incompatible future version."""
        archive_dict = {
            "schema_version": "99.0.0",  # Future incompatible version
            "format_id": ARCHIVE_FORMAT_ID,
            "project_meta": {},
            "network_model": {},
            "sld_diagrams": {},
            "cases": {},
            "runs": {},
            "results": {},
            "proofs": {},
            "fingerprints": {},
        }

        with pytest.raises(ArchiveVersionError) as exc_info:
            dict_to_archive(archive_dict)

        assert "99.0.0" in str(exc_info.value)

    def test_accept_compatible_older_version(self, sample_archive):
        """Should accept archives with compatible older version."""
        archive_dict = archive_to_dict(sample_archive)
        archive_dict["schema_version"] = "1.0.0"  # Same major version

        # Should not raise
        restored = dict_to_archive(archive_dict)
        assert restored.schema_version == "1.0.0"

    def test_reject_invalid_format_id(self, sample_archive):
        """Should reject archives with invalid format ID."""
        archive_dict = archive_to_dict(sample_archive)
        archive_dict["format_id"] = "INVALID-FORMAT"

        with pytest.raises(ArchiveStructureError) as exc_info:
            dict_to_archive(archive_dict)

        assert "INVALID-FORMAT" in str(exc_info.value)


# =============================================================================
# Test: Structure Validation
# =============================================================================


class TestStructureValidation:
    """Tests for archive structure validation."""

    def test_reject_missing_required_section(self):
        """Should reject archives missing required sections."""
        archive_dict = {
            "schema_version": ARCHIVE_SCHEMA_VERSION,
            "format_id": ARCHIVE_FORMAT_ID,
            # Missing: project_meta, network_model, etc.
        }

        with pytest.raises(ArchiveStructureError) as exc_info:
            dict_to_archive(archive_dict)

        assert "Brak wymaganej sekcji" in str(exc_info.value)

    def test_accept_missing_optional_sections(self, sample_archive):
        """Should accept archives with missing optional sections."""
        archive_dict = archive_to_dict(sample_archive)
        # Remove optional sections
        del archive_dict["interpretations"]
        del archive_dict["issues"]

        # Should not raise
        restored = dict_to_archive(archive_dict)
        assert restored.interpretations.cached == []
        assert restored.issues.snapshot == []


# =============================================================================
# Test: Edge Cases
# =============================================================================


class TestEdgeCases:
    """Tests for edge cases."""

    def test_empty_archive(self):
        """Should handle empty archive (no data)."""
        empty_meta = ProjectMeta(
            id=str(uuid4()),
            name="Pusty projekt",
            description=None,
            schema_version="1.0.0",
            active_network_snapshot_id=None,
            connection_node_id=None,
            sources=[],
            created_at=datetime.now(UTC).isoformat(),
            updated_at=datetime.now(UTC).isoformat(),
        )

        empty_network = NetworkModelSection(
            nodes=[], branches=[], sources=[], loads=[], snapshots=[]
        )

        fingerprints = compute_archive_fingerprints(
            project_meta={"id": empty_meta.id, "name": empty_meta.name},
            network_model={
                "nodes": [],
                "branches": [],
                "sources": [],
                "loads": [],
                "snapshots": [],
            },
            sld={"diagrams": [], "node_symbols": [], "branch_symbols": [], "annotations": []},
            cases={
                "study_cases": [],
                "operating_cases": [],
                "switching_states": [],
                "settings": None,
            },
            runs={"analysis_runs": [], "analysis_runs_index": [], "study_runs": []},
            results={"study_results": []},
            proofs={"design_specs": [], "design_proposals": [], "design_evidence": []},
            interpretations={"cached": []},
            issues={"snapshot": []},
        )

        empty_archive = ProjectArchive(
            schema_version=ARCHIVE_SCHEMA_VERSION,
            format_id=ARCHIVE_FORMAT_ID,
            project_meta=empty_meta,
            network_model=empty_network,
            sld_diagrams=SldSection([], [], [], []),
            cases=CasesSection([], [], [], None),
            runs=RunsSection([], [], []),
            results=ResultsSection([]),
            proofs=ProofsSection([], [], []),
            interpretations=InterpretationsSection([]),
            issues=IssuesSection([]),
            fingerprints=fingerprints,
        )

        # Should survive roundtrip
        archive_dict = archive_to_dict(empty_archive)
        restored = dict_to_archive(archive_dict)

        assert restored.project_meta.name == "Pusty projekt"
        assert len(restored.network_model.nodes) == 0

    def test_unicode_in_names(self):
        """Should handle unicode characters in names."""
        meta = ProjectMeta(
            id=str(uuid4()),
            name="Projekt z polskimi znakami: ąęćżźółń",
            description="Opis z emoji: 🔌⚡",
            schema_version="1.0.0",
            active_network_snapshot_id=None,
            connection_node_id=None,
            sources=[],
            created_at=datetime.now(UTC).isoformat(),
            updated_at=datetime.now(UTC).isoformat(),
        )

        fingerprints = compute_archive_fingerprints(
            project_meta={"id": meta.id, "name": meta.name, "description": meta.description},
            network_model={},
            sld={},
            cases={},
            runs={},
            results={},
            proofs={},
            interpretations={},
            issues={},
        )

        archive = ProjectArchive(
            schema_version=ARCHIVE_SCHEMA_VERSION,
            format_id=ARCHIVE_FORMAT_ID,
            project_meta=meta,
            network_model=NetworkModelSection([], [], [], [], []),
            sld_diagrams=SldSection([], [], [], []),
            cases=CasesSection([], [], [], None),
            runs=RunsSection([], [], []),
            results=ResultsSection([]),
            proofs=ProofsSection([], [], []),
            interpretations=InterpretationsSection([]),
            issues=IssuesSection([]),
            fingerprints=fingerprints,
        )

        # Should survive JSON roundtrip
        archive_dict = archive_to_dict(archive)
        json_str = json.dumps(archive_dict, ensure_ascii=False)
        parsed = json.loads(json_str)
        restored = dict_to_archive(parsed)

        assert "ąęćżźółń" in restored.project_meta.name
        assert "🔌" in (restored.project_meta.description or "")

    def test_large_network(self):
        """Should handle large networks efficiently."""
        # Create network with 100 nodes and 99 branches
        nodes = [
            {
                "id": str(uuid4()),
                "name": f"BUS-{i}",
                "node_type": "BUS",
                "base_kv": 15.0,
                "attrs_jsonb": {},
            }
            for i in range(100)
        ]

        branches = [
            {
                "id": str(uuid4()),
                "name": f"LINE-{i}",
                "branch_type": "LINE",
                "from_node_id": nodes[i]["id"],
                "to_node_id": nodes[i + 1]["id"],
                "in_service": True,
                "params_jsonb": {},
            }
            for i in range(99)
        ]

        network = NetworkModelSection(
            nodes=nodes,
            branches=branches,
            sources=[],
            loads=[],
            snapshots=[],
        )

        fingerprints = compute_archive_fingerprints(
            project_meta={"id": "test", "name": "Large"},
            network_model={
                "nodes": nodes,
                "branches": branches,
                "sources": [],
                "loads": [],
                "snapshots": [],
            },
            sld={},
            cases={},
            runs={},
            results={},
            proofs={},
            interpretations={},
            issues={},
        )

        archive = ProjectArchive(
            schema_version=ARCHIVE_SCHEMA_VERSION,
            format_id=ARCHIVE_FORMAT_ID,
            project_meta=ProjectMeta(
                id=str(uuid4()),
                name="Large Network",
                description=None,
                schema_version="1.0.0",
                active_network_snapshot_id=None,
                connection_node_id=None,
                sources=[],
                created_at=datetime.now(UTC).isoformat(),
                updated_at=datetime.now(UTC).isoformat(),
            ),
            network_model=network,
            sld_diagrams=SldSection([], [], [], []),
            cases=CasesSection([], [], [], None),
            runs=RunsSection([], [], []),
            results=ResultsSection([]),
            proofs=ProofsSection([], [], []),
            interpretations=InterpretationsSection([]),
            issues=IssuesSection([]),
            fingerprints=fingerprints,
        )

        # Should survive roundtrip
        archive_dict = archive_to_dict(archive)
        restored = dict_to_archive(archive_dict)

        assert len(restored.network_model.nodes) == 100
        assert len(restored.network_model.branches) == 99
