"""
Tests for application/analyses/fault_loop/envelope_adapter.py — P0.5 step 3.

Verifies that FaultLoopResult is wrapped into AnalysisRunEnvelope:
- deterministic (same input → identical envelope + fingerprint)
- WHITE BOX trace propagation
- analysis_type binding: "fault_loop.iec60364"
- read-only (solver result NIE jest modyfikowany)
"""

from __future__ import annotations

import pytest
from application.analyses.fault_loop.envelope_adapter import (
    result_to_serializable_dict,
    to_run_envelope,
)
from network_model.solvers.fault_loop_iec60364 import (
    FaultLoopInput,
    LoopImpedanceComponent,
    NetworkType,
    ProtectionArrangement,
    compute_fault_loop,
)

from tests.utils.determinism import assert_deterministic


def _build_fault_loop_input() -> FaultLoopInput:
    """400 kVA TN-S reference network (per test_fault_loop_iec60364.py)."""
    return FaultLoopInput(
        fault_node_id="bus_LV_outgoing",
        u_nom_v=230.0,
        phase_conductor=LoopImpedanceComponent(
            label="L 50 mm² Cu 30 m", r_ohm=0.0108, x_ohm=0.0024
        ),
        return_conductor=LoopImpedanceComponent(
            label="PE 25 mm² Cu 30 m", r_ohm=0.0216, x_ohm=0.0024
        ),
        transformer_impedance=LoopImpedanceComponent(
            label="TR 400 kVA SN/nN", r_ohm=0.0080, x_ohm=0.0250
        ),
        network_type=NetworkType.TN_S,
        protection_arrangement=ProtectionArrangement.PE,
    )


def test_to_run_envelope_fault_loop_basic() -> None:
    """Wraps FaultLoopResult into envelope with correct analysis_type."""
    result = compute_fault_loop(_build_fault_loop_input())
    run_id = "11111111-1111-1111-1111-111111111111"

    envelope = to_run_envelope(
        result,
        run_id=run_id,
        case_id="case-LV-fault",
    )

    assert envelope.analysis_type == "fault_loop.iec60364"
    assert envelope.run_id == run_id
    assert envelope.case_id == "case-LV-fault"
    assert len(envelope.artifacts) == 1
    assert envelope.artifacts[0].type == "fault_loop_result"
    assert envelope.artifacts[0].id == run_id


def test_to_run_envelope_propagates_white_box_trace() -> None:
    """WHITE BOX trace from solver flows into envelope.trace.inline."""
    result = compute_fault_loop(_build_fault_loop_input())
    envelope = to_run_envelope(result, run_id="run-1")

    assert envelope.trace is not None
    assert envelope.trace.type == "white_box"
    assert envelope.trace.inline is not None
    assert "white_box_trace" in envelope.trace.inline
    # Solver emits 2 trace steps for happy path
    assert len(envelope.trace.inline["white_box_trace"]) == 2


def test_to_run_envelope_explicit_trace_overrides_solver_trace() -> None:
    """Explicit trace_inline takes precedence over solver-provided trace."""
    result = compute_fault_loop(_build_fault_loop_input())
    custom_trace = {"steps": [{"name": "custom", "data": 42}]}

    envelope = to_run_envelope(result, run_id="run-1", trace_inline=custom_trace)

    assert envelope.trace is not None
    assert envelope.trace.inline == custom_trace


def test_to_run_envelope_inputs_inline_propagated() -> None:
    """Caller-provided inputs_inline appears in envelope.inputs.inline."""
    result = compute_fault_loop(_build_fault_loop_input())
    inputs = {"fault_node_id": "bus_LV_outgoing", "u_nom_v": 230.0}

    envelope = to_run_envelope(result, run_id="run-1", inputs_inline=inputs)

    assert envelope.inputs.inline == inputs


def test_to_run_envelope_deterministic() -> None:
    """Same FaultLoopResult + run_id → identical envelope (modulo created_at_utc)."""
    result = compute_fault_loop(_build_fault_loop_input())
    run_id = "22222222-2222-2222-2222-222222222222"
    inputs = {"fault_node_id": "bus_LV_outgoing"}

    e1 = to_run_envelope(result, run_id=run_id, case_id="c1", inputs_inline=inputs)
    e2 = to_run_envelope(result, run_id=run_id, case_id="c1", inputs_inline=inputs)

    assert_deterministic(
        e1.to_dict(),
        e2.to_dict(),
        scrub_keys=("created_at_utc",),
    )
    # Fingerprint excludes created_at_utc since it's per-envelope-dict
    # but compute_fault_loop is deterministic so the data portion is stable.


def test_to_run_envelope_does_not_mutate_result() -> None:
    """Solver result is read-only — Frozen Result API + Determinism Rule."""
    result = compute_fault_loop(_build_fault_loop_input())
    original_z = result.z_loop_ohm
    original_trace_len = len(result.white_box_trace)

    to_run_envelope(result, run_id="run-1")

    assert result.z_loop_ohm == original_z
    assert len(result.white_box_trace) == original_trace_len


def test_to_run_envelope_run_id_required() -> None:
    """run_id MUST be provided by caller (no auto-generation)."""
    result = compute_fault_loop(_build_fault_loop_input())
    # type signature requires run_id keyword
    with pytest.raises(TypeError):
        to_run_envelope(result)  # type: ignore[call-arg]


def test_to_run_envelope_optional_fields_default_to_none() -> None:
    """case_id, base_snapshot_id, inputs_inline default to None."""
    result = compute_fault_loop(_build_fault_loop_input())
    envelope = to_run_envelope(result, run_id="run-1")

    assert envelope.case_id is None
    assert envelope.inputs.base_snapshot_id is None
    assert envelope.inputs.inline is None
    # Trace still present (auto-propagated from solver)
    assert envelope.trace is not None


def test_result_to_serializable_dict_round_trips_with_solver_to_dict() -> None:
    """Convenience wrapper matches FaultLoopResult.to_dict() shape."""
    result = compute_fault_loop(_build_fault_loop_input())
    a = result_to_serializable_dict(result)
    b = result.to_dict()
    assert a == b


def test_envelope_artifact_id_matches_run_id() -> None:
    """artifacts[0].id is the run_id (binding reference)."""
    result = compute_fault_loop(_build_fault_loop_input())
    run_id = "33333333-3333-3333-3333-333333333333"
    envelope = to_run_envelope(result, run_id=run_id)
    assert envelope.artifacts[0].id == run_id
