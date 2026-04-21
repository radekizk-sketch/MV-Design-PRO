from __future__ import annotations

import io
import json
import zipfile
from datetime import datetime
from hashlib import sha256
from uuid import UUID

from application.proof_engine.proof_generator import ProofGenerator, SC3FInput
from application.proof_engine.proof_inspector.exporters import is_pdf_export_available
from application.proof_engine.proof_pack import ProofPackBuilder, ProofPackContext


def _build_sc3f_proof():
    test_input = SC3FInput(
        project_name="Test Project",
        case_name="Test Case SC3F",
        fault_node_id="B2",
        fault_type="THREE_PHASE",
        run_timestamp=datetime(2026, 1, 27, 10, 30, 0),
        solver_version="1.0.0-test",
        c_factor=1.10,
        u_n_kv=15.0,
        z_thevenin_ohm=complex(0.749, 3.419),
        ikss_ka=2.722,
        ip_ka=5.882,
        ith_ka=2.722,
        sk_mva=70.7,
        kappa=1.528,
        rx_ratio=0.219,
        tk_s=1.0,
        m_factor=1.0,
        n_factor=0.0,
    )
    return ProofGenerator.generate_sc3f_proof(test_input)


def _build_context() -> ProofPackContext:
    return ProofPackContext(
        project_id=str(UUID("00000000-0000-0000-0000-000000000001")),
        case_id=str(UUID("00000000-0000-0000-0000-000000000002")),
        run_id=str(UUID("00000000-0000-0000-0000-000000000003")),
        snapshot_id="snapshot-123",
        mv_design_pro_version="0.1.0-test",
    )


def _read_zip(pack_bytes: bytes) -> zipfile.ZipFile:
    return zipfile.ZipFile(io.BytesIO(pack_bytes))


def test_proof_pack_is_deterministic():
    proof = _build_sc3f_proof()
    context = _build_context()
    builder = ProofPackBuilder(context)

    first = builder.build(proof)
    second = builder.build(proof)

    assert first == second


def test_proof_pack_contains_expected_files():
    proof = _build_sc3f_proof()
    pack_bytes = ProofPackBuilder(_build_context()).build(proof)
    with _read_zip(pack_bytes) as zf:
        names = set(zf.namelist())

    assert "proof_pack/manifest.json" in names
    assert "proof_pack/signature.json" in names
    assert "proof_pack/proof.json" in names
    assert "proof_pack/proof.tex" in names
    assert "assets/" in names
    if is_pdf_export_available():
        assert "proof_pack/proof.pdf" in names


def test_proof_pack_manifest_contains_hashes():
    proof = _build_sc3f_proof()
    pack_bytes = ProofPackBuilder(_build_context()).build(proof)

    with _read_zip(pack_bytes) as zf:
        manifest = json.loads(zf.read("proof_pack/manifest.json").decode("utf-8"))
        proof_json = zf.read("proof_pack/proof.json")

        for file_entry in manifest["files"]:
            payload = zf.read(file_entry["path"])
            assert file_entry["sha256"] == sha256(payload).hexdigest()
            assert file_entry["bytes"] == len(payload)

    assert manifest["proof_fingerprint"] == sha256(proof_json).hexdigest()


def test_signature_json_present_in_zip():
    proof = _build_sc3f_proof()
    pack_bytes = ProofPackBuilder(_build_context()).build(proof)

    with _read_zip(pack_bytes) as zf:
        signature = json.loads(zf.read("proof_pack/signature.json").decode("utf-8"))

    assert signature["schema_version"] == "1.0"
    assert signature["algorithm"] == "SHA-256"


def test_signature_json_deterministic():
    proof = _build_sc3f_proof()
    context = _build_context()
    builder = ProofPackBuilder(context)

    first = builder.build(proof)
    second = builder.build(proof)

    with _read_zip(first) as zf:
        first_signature = zf.read("proof_pack/signature.json")
    with _read_zip(second) as zf:
        second_signature = zf.read("proof_pack/signature.json")

    assert first_signature == second_signature


def test_signature_matches_files_hashes():
    proof = _build_sc3f_proof()
    pack_bytes = ProofPackBuilder(_build_context()).build(proof)

    with _read_zip(pack_bytes) as zf:
        signature = json.loads(zf.read("proof_pack/signature.json").decode("utf-8"))
        signature_files = signature["files"]

        for file_entry in signature_files:
            payload = zf.read(file_entry["path"])
            assert file_entry["sha256"] == sha256(payload).hexdigest()
            assert file_entry["bytes"] == len(payload)
