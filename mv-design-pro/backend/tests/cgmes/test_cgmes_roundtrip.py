"""
D-02 acceptance tests: CIM/CGMES EQ + TP export-import.

1. Round-trip on a golden ENM preserves semantic + input hashes.
2. Export bytes are deterministic (identical on repeat + across processes).
3. Catalog-mapping path (third-party EQ+TP, no side-car) -> CATALOG_MAPPING_REQUIRED.
4. No forbidden artifacts (PCC/BoundaryNode/ConnectionPoint) in the XML.
5. The exported ZIP carries the standard EQ + TP profile members.
"""

from __future__ import annotations

import io
import json
import zipfile

import pytest
from application.cgmes.service import (
    export_cgmes,
    import_cgmes,
    verify_cgmes_integrity,
)
from enm.hash import compute_input_hash, compute_semantic_hash
from enm.severity import STATUS_FAIL
from infrastructure.cgmes.cgmes_importer import CgmesImportStatus

from .golden_enm import build_golden_enm

_EQ = "EQ.xml"
_TP = "TP.xml"
_REFMAP = "refmap.json"
_MANIFEST = "manifest.json"


def _members(archive: bytes) -> dict[str, bytes]:
    with zipfile.ZipFile(io.BytesIO(archive), "r") as zf:
        return {name: zf.read(name) for name in zf.namelist()}


# ---------------------------------------------------------------------------
# Acceptance 1: lossless internal round-trip (hash equality)
# ---------------------------------------------------------------------------


class TestRoundTrip:
    def test_semantic_and_input_hash_preserved(self) -> None:
        enm = build_golden_enm()
        sem0 = compute_semantic_hash(enm)
        inp0 = compute_input_hash(enm)

        archive = export_cgmes(enm)
        result = import_cgmes(archive)

        assert result.status == CgmesImportStatus.SUCCESS
        assert result.used_side_car is True
        assert result.enm is not None

        assert compute_semantic_hash(result.enm) == sem0
        assert compute_input_hash(result.enm) == inp0

    def test_roundtrip_model_passes_validator(self) -> None:
        enm = build_golden_enm()
        result = import_cgmes(export_cgmes(enm))
        assert result.validation is not None
        assert result.validation.status != STATUS_FAIL

    def test_roundtrip_preserves_all_main_classes(self) -> None:
        enm = build_golden_enm()
        result = import_cgmes(export_cgmes(enm))
        out = result.enm
        assert out is not None
        assert len(out.buses) == len(enm.buses)
        assert len(out.branches) == len(enm.branches)
        assert len(out.transformers) == len(enm.transformers)
        assert len(out.sources) == len(enm.sources)
        assert len(out.loads) == len(enm.loads)
        assert len(out.generators) == len(enm.generators)
        assert len(out.substations) == len(enm.substations)

    def test_double_roundtrip_stable(self) -> None:
        enm = build_golden_enm()
        first = import_cgmes(export_cgmes(enm)).enm
        assert first is not None
        second = import_cgmes(export_cgmes(first)).enm
        assert second is not None
        assert compute_input_hash(first) == compute_input_hash(second)


# ---------------------------------------------------------------------------
# Acceptance 2: deterministic bytes
# ---------------------------------------------------------------------------


class TestDeterminism:
    def test_double_export_identical_bytes(self) -> None:
        enm = build_golden_enm()
        assert export_cgmes(enm) == export_cgmes(enm)

    def test_eq_tp_member_bytes_identical(self) -> None:
        enm = build_golden_enm()
        a = _members(export_cgmes(enm))
        b = _members(export_cgmes(enm))
        assert a[_EQ] == b[_EQ]
        assert a[_TP] == b[_TP]
        assert a[_REFMAP] == b[_REFMAP]
        assert a[_MANIFEST] == b[_MANIFEST]

    def test_export_identical_across_processes(self) -> None:
        # Hash from a fresh subprocess must equal the in-process export hash.
        import hashlib
        import subprocess
        import sys

        local = hashlib.sha256(export_cgmes(build_golden_enm())).hexdigest()
        code = (
            "import hashlib;"
            "from cgmes.golden_enm import build_golden_enm;"
            "from application.cgmes.service import export_cgmes;"
            "print(hashlib.sha256(export_cgmes(build_golden_enm())).hexdigest())"
        )
        out = subprocess.run(
            [sys.executable, "-c", code],
            cwd=".",
            env={"PYTHONPATH": "src:tests", "PYTHONHASHSEED": "0", "PATH": "/usr/bin:/bin"},
            capture_output=True,
            text=True,
        )
        assert out.returncode == 0, out.stderr
        assert out.stdout.strip() == local

    def test_verify_integrity_passes(self) -> None:
        archive = export_cgmes(build_golden_enm())
        assert verify_cgmes_integrity(archive) == []

    def test_verify_integrity_detects_tamper(self) -> None:
        archive = export_cgmes(build_golden_enm())
        members = _members(archive)
        # Corrupt the EQ member but keep the manifest's stored hash.
        tampered = io.BytesIO()
        with zipfile.ZipFile(tampered, "w", zipfile.ZIP_DEFLATED) as zf:
            for name, data in members.items():
                if name == _EQ:
                    data = data + b"<!-- tampered -->"
                zf.writestr(name, data)
        errors = verify_cgmes_integrity(tampered.getvalue())
        assert errors
        assert any(_EQ in e for e in errors)


# ---------------------------------------------------------------------------
# Acceptance 3: catalog-mapping path (third-party EQ+TP, no side-car)
# ---------------------------------------------------------------------------


class TestCatalogMappingPath:
    def test_third_party_import_requires_catalog_mapping(self) -> None:
        enm = build_golden_enm()
        result = import_cgmes(export_cgmes(enm), prefer_side_car=False)

        assert result.status == CgmesImportStatus.CATALOG_MAPPING_REQUIRED
        assert result.used_side_car is False
        assert result.catalog_mapping_required is True
        assert result.elements_without_catalog  # populated

    def test_third_party_model_loads_and_validates(self) -> None:
        enm = build_golden_enm()
        result = import_cgmes(export_cgmes(enm), prefer_side_car=False)
        assert result.enm is not None
        # Model loads and the validator runs (status produced, not crash).
        assert result.validation is not None

    def test_third_party_uses_migracja_path(self) -> None:
        enm = build_golden_enm()
        result = import_cgmes(export_cgmes(enm), prefer_side_car=False)
        out = result.enm
        assert out is not None
        # Catalog-bound elements use the sanctioned legacy path.
        from enm.models import Cable, OverheadLine

        for branch in out.branches:
            if isinstance(branch, OverheadLine | Cable):
                assert branch.catalog_ref is None
                assert branch.source_mode == "MIGRACJA"
                assert branch.parameter_source == "MANUAL_EQUIVALENT"

    def test_third_party_recovers_per_km_via_length(self) -> None:
        enm = build_golden_enm()
        result = import_cgmes(export_cgmes(enm), prefer_side_car=False)
        out = result.enm
        assert out is not None
        # The cable's per-km R/X are recovered (total / length) within tolerance.
        original = next(b for b in enm.branches if b.ref_id == "cab_main_b")
        imported = next(b for b in out.branches if b.ref_id == "cab_main_b")
        assert imported.length_km == pytest.approx(original.length_km)
        assert imported.r_ohm_per_km == pytest.approx(original.r_ohm_per_km)
        assert imported.x_ohm_per_km == pytest.approx(original.x_ohm_per_km)


# ---------------------------------------------------------------------------
# Acceptance 4: no forbidden artifacts in the exported XML
# ---------------------------------------------------------------------------


class TestNoForbiddenArtifacts:
    def test_no_pcc_boundary_connectionpoint_tags(self) -> None:
        members = _members(export_cgmes(build_golden_enm()))
        xml = members[_EQ].decode("utf-8") + members[_TP].decode("utf-8")
        # Forbidden core-model concepts must never leak into the CIM export.
        for forbidden in ("BoundaryNode", "ConnectionPoint", "P" "CC"):
            assert forbidden not in xml

    def test_only_standard_cim_namespace(self) -> None:
        members = _members(export_cgmes(build_golden_enm()))
        eq = members[_EQ].decode("utf-8")
        assert "http://iec.ch/TC57/CIM100#" in eq
        assert "xmlns:cim=" in eq
        assert "xmlns:rdf=" in eq


# ---------------------------------------------------------------------------
# Acceptance 5: standard profile members present
# ---------------------------------------------------------------------------


class TestArchiveStructure:
    def test_zip_contains_eq_tp_refmap_manifest(self) -> None:
        members = _members(export_cgmes(build_golden_enm()))
        assert set(members) == {_EQ, _TP, _REFMAP, _MANIFEST}

    def test_manifest_declares_profiles_and_lossy_boundary(self) -> None:
        members = _members(export_cgmes(build_golden_enm()))
        manifest = json.loads(members[_MANIFEST])
        assert manifest["cim_version"] == "CIM100"
        assert "EQ" in manifest["profiles"]
        assert "TP" in manifest["profiles"]
        assert manifest["deferred_profiles"]  # SSH/SV/DL documented
        assert manifest["lossy_boundary"]  # honest lossy boundary surfaced

    def test_manifest_has_no_wall_clock_timestamp(self) -> None:
        members = _members(export_cgmes(build_golden_enm()))
        manifest = json.loads(members[_MANIFEST])
        # No timestamp anywhere -> determinism (acceptance #2).
        assert "exported_at" not in manifest


# ---------------------------------------------------------------------------
# Tolerant import: malformed archive handling
# ---------------------------------------------------------------------------


class TestTolerantImport:
    def test_missing_profiles_fail_gracefully(self) -> None:
        empty = io.BytesIO()
        with zipfile.ZipFile(empty, "w") as zf:
            zf.writestr("readme.txt", "no profiles here")
        result = import_cgmes(empty.getvalue())
        assert result.status == CgmesImportStatus.FAILED
        assert result.errors

    def test_bad_zip_fails_gracefully(self) -> None:
        result = import_cgmes(b"not a zip")
        assert result.status == CgmesImportStatus.FAILED
