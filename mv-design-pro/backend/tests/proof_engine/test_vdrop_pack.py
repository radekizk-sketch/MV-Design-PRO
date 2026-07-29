"""
Tests for VDROP Proof Pack (V12K-015).

Verifies the standalone pack wrapper over ProofGenerator.generate_vdrop_proof:
- Input transformation (VDROPPackInput → VDROPInput)
- Pack-level determinism (same input → identical proof)
- Pack serializer contract
- Eksport compatibility (JSON + LaTeX + DOCX via InspectorExporter)
"""

from datetime import UTC, datetime
from uuid import UUID

import pytest
from application.proof_engine.packs.vdrop import (
    VDROPPackInput,
    VDROPPackSegment,
    generate_vdrop_pack,
    serialize_vdrop_pack,
)
from application.proof_engine.proof_inspector import InspectorExporter, export_to_json
from application.proof_engine.types import ProofType


@pytest.fixture
def vdrop_pack_input() -> VDROPPackInput:
    """MVP fixture: single segment line GPZ → station."""
    return VDROPPackInput(
        project_name="Test Project",
        case_name="VDROP MVP single segment",
        source_bus_id="bus_gpz_sn",
        target_bus_id="bus_station_01",
        run_timestamp=datetime(2026, 5, 13, 12, 0, 0, tzinfo=UTC),
        solver_version="vdrop-mvp-1.0",
        segments=[
            VDROPPackSegment(
                segment_id="seg_01",
                from_bus_id="bus_gpz_sn",
                to_bus_id="bus_station_01",
                r_ohm_per_km=0.420,  # AFL-6 70 mm2
                x_ohm_per_km=0.377,
                length_km=2.5,
                p_mw=0.500,
                q_mvar=0.250,
                u_n_kv=15.0,
            )
        ],
        u_source_kv=15.0,
    )


def test_vdrop_pack_generates_proof_document(vdrop_pack_input: VDROPPackInput) -> None:
    """Pack zwraca ProofDocument z typem VDROP."""
    document = generate_vdrop_pack(vdrop_pack_input)
    assert document.proof_type == ProofType.VDROP
    assert document.summary.total_steps > 0


def test_vdrop_pack_is_deterministic(vdrop_pack_input: VDROPPackInput) -> None:
    """Same input + same artifact_id → identical proof (modulo auto-generated
    document_id/created_at). Zgodnie z wzorcem SC3F determinism test."""
    import json

    artifact_id = UUID("11111111-2222-3333-4444-555555555555")
    proof_1 = generate_vdrop_pack(vdrop_pack_input, artifact_id=artifact_id)
    proof_2 = generate_vdrop_pack(vdrop_pack_input, artifact_id=artifact_id)

    data_1 = json.loads(export_to_json(proof_1))
    data_2 = json.loads(export_to_json(proof_2))
    # document_id i created_at są auto-generowane (uuid4 + datetime.utcnow w factory)
    for d in (data_1, data_2):
        d.pop("document_id", None)
        d.pop("created_at", None)
    assert data_1 == data_2


def test_vdrop_pack_serializer_has_pack_type(vdrop_pack_input: VDROPPackInput) -> None:
    """Pack serializer zachowuje spójny kontrakt z innymi packami."""
    document = generate_vdrop_pack(vdrop_pack_input)
    payload = serialize_vdrop_pack(document)

    assert payload["pack_type"] == "VDROP"
    assert "artifact_id" in payload
    assert "created_at" in payload
    assert "title_pl" in payload
    assert "proof" in payload
    assert payload["summary"]["proof_type"] == "VDROP"
    assert payload["summary"]["total_steps"] == document.summary.total_steps


def test_vdrop_pack_supports_docx_export(vdrop_pack_input: VDROPPackInput) -> None:
    """Pack VDROP eksportowalny do DOCX (V12K-007 light_technical)."""
    try:
        import docx  # noqa: F401
    except ImportError:
        pytest.skip("python-docx not installed in this environment")

    document = generate_vdrop_pack(vdrop_pack_input)
    result = InspectorExporter(document).export_docx()
    assert result.success
    assert result.format == "docx"
    assert result.content[:2] == b"PK"  # DOCX = ZIP


def test_vdrop_pack_empty_segments_raises() -> None:
    """Pack waliduje że segments nie jest puste."""
    bad_input = VDROPPackInput(
        project_name="Test",
        case_name="empty",
        source_bus_id="b1",
        target_bus_id="b2",
        run_timestamp=datetime(2026, 5, 13, tzinfo=UTC),
        solver_version="v1",
        segments=[],
        u_source_kv=15.0,
    )
    with pytest.raises(ValueError, match="at least one segment"):
        generate_vdrop_pack(bad_input)


def test_vdrop_pack_to_generator_input_preserves_data(
    vdrop_pack_input: VDROPPackInput,
) -> None:
    """Konwersja Pack → Generator input zachowuje wszystkie pola."""
    gen_input = vdrop_pack_input.to_generator_input()
    assert gen_input.project_name == vdrop_pack_input.project_name
    assert gen_input.source_bus_id == vdrop_pack_input.source_bus_id
    assert len(gen_input.segments) == len(vdrop_pack_input.segments)
    seg_orig = vdrop_pack_input.segments[0]
    seg_conv = gen_input.segments[0]
    assert seg_conv.r_ohm_per_km == seg_orig.r_ohm_per_km
    assert seg_conv.x_ohm_per_km == seg_orig.x_ohm_per_km
    assert seg_conv.length_km == seg_orig.length_km
    assert seg_conv.p_mw == seg_orig.p_mw
    assert seg_conv.q_mvar == seg_orig.q_mvar
    assert seg_conv.u_n_kv == seg_orig.u_n_kv
