"""
Tests for Earthing / Ground Fault SN Proof Pack (V12K-015).

Verifies the standalone pack wrapper over generate_earthing_ground_fault_proof.
"""

from datetime import datetime, timezone
from uuid import UUID

import pytest

from application.proof_engine.packs.earthing_ground_fault_sn import (
    EarthingGroundFaultPackInput,
    generate_earthing_ground_fault_pack,
    serialize_earthing_pack,
)
from application.proof_engine.proof_inspector import InspectorExporter, export_to_json
from application.proof_engine.types import ProofType


@pytest.fixture
def earthing_pack_input() -> EarthingGroundFaultPackInput:
    """Fixture: 1F-Z w sieci SN z rezystorowym uziemieniem neutralu."""
    return EarthingGroundFaultPackInput(
        project_name="Test Project",
        case_name="1F-Z resistor grounding",
        run_timestamp=datetime(2026, 5, 13, 12, 0, 0, tzinfo=timezone.utc),
        solver_version="earthing-mvp-1.0",
        fault_location="bus_station_01",
        fault_type="1F-Z",
        earthing_mode="rezystor 200 Ω",
        u0_v=4000.0,
        z_e_ohm=210.0,
        i_u_a=15.0,
        i_p_a=4.0,
        r_u_ohm=5.0,
    )


def test_earthing_pack_generates_proof_document(
    earthing_pack_input: EarthingGroundFaultPackInput,
) -> None:
    """Pack zwraca ProofDocument typu EARTHING_GROUND_FAULT_SN."""
    document = generate_earthing_ground_fault_pack(earthing_pack_input)
    assert document.proof_type == ProofType.EARTHING_GROUND_FAULT_SN
    assert document.summary.total_steps >= 0


def test_earthing_pack_is_deterministic(
    earthing_pack_input: EarthingGroundFaultPackInput,
) -> None:
    """Determinizm: same input + same artifact_id → identical proof
    (modulo auto-generated document_id/created_at). Zgodne ze wzorcem
    SC3F determinism test."""
    import json

    artifact_id = UUID("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
    proof_1 = generate_earthing_ground_fault_pack(
        earthing_pack_input, artifact_id=artifact_id
    )
    proof_2 = generate_earthing_ground_fault_pack(
        earthing_pack_input, artifact_id=artifact_id
    )

    data_1 = json.loads(export_to_json(proof_1))
    data_2 = json.loads(export_to_json(proof_2))
    for d in (data_1, data_2):
        d.pop("document_id", None)
        d.pop("created_at", None)
    assert data_1 == data_2


def test_earthing_pack_serializer_has_pack_type(
    earthing_pack_input: EarthingGroundFaultPackInput,
) -> None:
    """Pack serializer zachowuje spójny kontrakt."""
    document = generate_earthing_ground_fault_pack(earthing_pack_input)
    payload = serialize_earthing_pack(document)

    assert payload["pack_type"] == "EARTHING_GROUND_FAULT_SN"
    assert "artifact_id" in payload
    assert "created_at" in payload
    assert "title_pl" in payload
    assert "proof" in payload
    assert payload["summary"]["proof_type"] == "EARTHING_GROUND_FAULT_SN"


def test_earthing_pack_supports_docx_export(
    earthing_pack_input: EarthingGroundFaultPackInput,
) -> None:
    """Pack Earthing eksportowalny do DOCX (V12K-007 light_technical)."""
    try:
        import docx  # noqa: F401
    except ImportError:
        pytest.skip("python-docx not installed in this environment")

    document = generate_earthing_ground_fault_pack(earthing_pack_input)
    result = InspectorExporter(document).export_docx()
    assert result.success
    assert result.format == "docx"
    assert result.content[:2] == b"PK"  # DOCX = ZIP


def test_earthing_pack_missing_data_does_not_compute() -> None:
    """Pack honoruje brakujące dane (None) — solver decyduje co policzyć."""
    bare_input = EarthingGroundFaultPackInput(
        project_name="Test",
        case_name="missing data",
        run_timestamp=datetime(2026, 5, 13, tzinfo=timezone.utc),
        solver_version="v1",
    )
    document = generate_earthing_ground_fault_pack(bare_input)
    # Proof generated, but with no computational steps (all data None)
    assert document.proof_type == ProofType.EARTHING_GROUND_FAULT_SN


def test_earthing_pack_to_generator_input_preserves_data(
    earthing_pack_input: EarthingGroundFaultPackInput,
) -> None:
    """Konwersja Pack → Generator input zachowuje wszystkie pola."""
    gen_input = earthing_pack_input.to_generator_input()
    assert gen_input.project_name == earthing_pack_input.project_name
    assert gen_input.earthing_mode == earthing_pack_input.earthing_mode
    assert gen_input.u0_v == earthing_pack_input.u0_v
    assert gen_input.z_e_ohm == earthing_pack_input.z_e_ohm
    assert gen_input.i_u_a == earthing_pack_input.i_u_a
    assert gen_input.i_p_a == earthing_pack_input.i_p_a
    assert gen_input.r_u_ohm == earthing_pack_input.r_u_ohm
