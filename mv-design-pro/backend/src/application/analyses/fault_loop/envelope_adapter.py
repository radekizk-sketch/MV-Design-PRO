"""
Fault Loop (IEC 60364-4-41) — Application-layer envelope adapter (P0.5 step 3).

Bridge: FaultLoopResult (solver output) → AnalysisRunEnvelope (canonical
run record dla persistence / audit / determinism).

Reference:
- backend/src/network_model/solvers/fault_loop_iec60364.py (solver, WHITE BOX)
- backend/src/application/analyses/run_envelope.py (canonical envelope)
- backend/src/application/analyses/iec60909/envelope_adapter.py (pattern reused)
- docs/v12xx/KANON_V12_XX.md (Determinism Rule, Frozen Result API)

INVARIANTS:
- NO physics (interpretation only)
- DETERMINISTIC (same FaultLoopResult → identical envelope + fingerprint)
- READ-ONLY: solver result NIE jest modyfikowany
- WHITE BOX trace propagation: if result has trace, envelope contains it inline
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from application.analyses.run_envelope import (
    AnalysisRunEnvelope,
    ArtifactRef,
    InputsRef,
    TraceRef,
    fingerprint_envelope,
)
from network_model.solvers.fault_loop_iec60364 import FaultLoopResult


def to_run_envelope(
    result: FaultLoopResult,
    *,
    run_id: str,
    case_id: str | None = None,
    base_snapshot_id: str | None = None,
    inputs_inline: dict[str, Any] | None = None,
    trace_inline: dict[str, Any] | None = None,
) -> AnalysisRunEnvelope:
    """
    Wrap a FaultLoopResult into a canonical AnalysisRunEnvelope.

    Args:
        result: Solver output (read-only).
        run_id: Externally-assigned UUID for this run (caller responsibility).
        case_id: Optional Study Case binding reference.
        base_snapshot_id: Optional snapshot ID this run computed against.
        inputs_inline: Optional inline serialization of the FaultLoopInput
            (caller may attach it for audit).
        trace_inline: Optional inline WHITE BOX trace override; if None and
            result has white_box_trace, it is propagated automatically.

    Returns:
        Frozen AnalysisRunEnvelope with deterministic fingerprint.
    """
    analysis_type = "fault_loop.iec60364"
    trace = _resolve_trace(result, trace_inline)
    created_at_utc = datetime.now(UTC).isoformat()
    artifacts = (ArtifactRef(type="fault_loop_result", id=run_id),)
    inputs = InputsRef(
        base_snapshot_id=base_snapshot_id,
        spec_ref=None,
        inline=inputs_inline,
    )

    envelope_dict = {
        "schema_version": "v0",
        "run_id": run_id,
        "analysis_type": analysis_type,
        "case_id": case_id,
        "inputs": inputs.to_dict(),
        "artifacts": [artifact.to_dict() for artifact in artifacts],
        "trace": trace.to_dict() if trace else None,
        "created_at_utc": created_at_utc,
        "fingerprint": "",
    }
    fingerprint = fingerprint_envelope(envelope_dict)
    return AnalysisRunEnvelope(
        run_id=run_id,
        analysis_type=analysis_type,
        case_id=case_id,
        inputs=inputs,
        artifacts=artifacts,
        trace=trace,
        created_at_utc=created_at_utc,
        fingerprint=fingerprint,
    )


def result_to_serializable_dict(result: FaultLoopResult) -> dict[str, Any]:
    """Serialize FaultLoopResult into a JSON-safe canonical dict.

    Convenience wrapper for `result.to_dict()` — used when caller chooses
    to populate `inputs_inline` or persistence with the full result snapshot.
    """
    return result.to_dict()


def _resolve_trace(
    result: FaultLoopResult,
    trace_inline: dict[str, Any] | None,
) -> TraceRef | None:
    """
    Resolve WHITE BOX trace for envelope.

    Priority order (deterministic):
      1. Explicit `trace_inline` provided by caller
      2. Solver `result.white_box_trace` (if non-empty)
      3. None (no trace)
    """
    if trace_inline is not None:
        return TraceRef(type="white_box", id=None, inline=trace_inline)
    if result.white_box_trace:
        return TraceRef(
            type="white_box",
            id=None,
            inline={"white_box_trace": list(result.white_box_trace)},
        )
    return None
