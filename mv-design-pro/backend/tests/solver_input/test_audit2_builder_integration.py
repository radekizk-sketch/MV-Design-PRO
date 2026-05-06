"""
Test integracji audit2 extensions z solver_input/builder.py (Phase 12).

Sprawdza:
- audit2_extensions = None gdy brak audit2_station_payload (default)
- audit2_extensions populated gdy payload przekazany
- determinism (same input -> same extensions)
"""

from __future__ import annotations

import pytest

pytest.importorskip("pydantic")


def test_solver_input_envelope_no_audit2_extensions_default():
    """Domyslnie audit2_extensions = None gdy nie przekazano payload."""
    from solver_input.contracts import (
        SolverInputEnvelope,
        SolverAnalysisType,
    )
    from solver_input.eligibility import EligibilityResult

    env = SolverInputEnvelope(
        solver_input_version="2.0.0",
        case_id="case-1",
        enm_revision="rev-1",
        analysis_type=SolverAnalysisType.SHORT_CIRCUIT_3F,
        eligibility=EligibilityResult(eligible=True, reasons=[]),
    )
    assert env.audit2_extensions is None


def test_audit2_extensions_can_be_populated():
    """audit2_extensions akceptuje dict gdy przekazany."""
    from solver_input.contracts import (
        SolverInputEnvelope,
        SolverAnalysisType,
    )
    from solver_input.eligibility import EligibilityResult

    extensions = {
        "sc_iec60909_extensions": {"mv_neutral_grounding": {"grounding_type": "petersen_coil"}},
        "power_flow_extensions": {"tap_changers": []},
        "protection_extensions": {"grounding_type": "petersen_coil"},
    }
    env = SolverInputEnvelope(
        solver_input_version="2.0.0",
        case_id="case-1",
        enm_revision="rev-1",
        analysis_type=SolverAnalysisType.SHORT_CIRCUIT_3F,
        eligibility=EligibilityResult(eligible=True, reasons=[]),
        audit2_extensions=extensions,
    )
    assert env.audit2_extensions is not None
    assert env.audit2_extensions["sc_iec60909_extensions"]["mv_neutral_grounding"]["grounding_type"] == "petersen_coil"


def test_audit2_extensions_deterministic():
    """Identyczny payload -> identyczne extensions."""
    from solver_input.audit2_der_payload import (
        build_station_audit2_payload,
        extract_solver_extensions_from_payload,
    )

    payload_kwargs = dict(
        station_id="station_X",
        mv_neutral_grounding_ref="mng_petersen",
        tap_changer_refs=["tc_oltc_110sn_19_125"],
        der_specs=[
            {
                "der_id": "der_001",
                "der_kind": "BESS",
                "bess_operation_mode_refs": ["mode_fcr_n", "mode_voltage_support"],
                "pf_curve_ref": "pf_pse_b",
            }
        ],
    )
    p1 = build_station_audit2_payload(**payload_kwargs)
    p2 = build_station_audit2_payload(**payload_kwargs)
    e1 = extract_solver_extensions_from_payload(p1)
    e2 = extract_solver_extensions_from_payload(p2)
    assert e1 == e2
