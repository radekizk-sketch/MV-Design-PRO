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
from network_model.solvers.short_circuit_iec60909 import ShortCircuitResult


def to_run_envelope(
    result: ShortCircuitResult,
    *,
    run_id: str | None = None,
    case_id: str | None = None,
    base_snapshot_id: str | None = None,
    inputs_inline: dict[str, Any] | None = None,
    trace_inline: dict[str, Any] | None = None,
) -> AnalysisRunEnvelope:
    analysis_type = "short_circuit.iec60909"
    resolved_run_id = _resolve_run_id(result, run_id)
    trace = _resolve_trace(result, trace_inline)
    created_at_utc = _resolve_created_at_utc(result)
    artifacts = (ArtifactRef(type="short_circuit_result", id=resolved_run_id),)
    inputs = InputsRef(
        base_snapshot_id=base_snapshot_id,
        spec_ref=None,
        inline=inputs_inline,
    )

    envelope_dict = {
        "schema_version": "v0",
        "run_id": resolved_run_id,
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
        run_id=resolved_run_id,
        analysis_type=analysis_type,
        case_id=case_id,
        inputs=inputs,
        artifacts=artifacts,
        trace=trace,
        created_at_utc=created_at_utc,
        fingerprint=fingerprint,
    )


def _resolve_run_id(result: ShortCircuitResult, run_id: str | None) -> str:
    if run_id:
        return run_id
    for attr in ("run_id", "analysis_id"):
        value = getattr(result, attr, None)
        if value:
            return str(value)
    raise ValueError("run_id must be provided for IEC 60909 run envelope")


def _resolve_trace(
    result: ShortCircuitResult, trace_inline: dict[str, Any] | None
) -> TraceRef | None:
    if trace_inline is not None:
        return TraceRef(type="white_box", id=None, inline=trace_inline)
    if result.white_box_trace:
        return TraceRef(
            type="white_box", id=None, inline={"white_box_trace": result.white_box_trace}
        )
    return None


def _resolve_created_at_utc(result: ShortCircuitResult) -> str:
    created_at = getattr(result, "created_at", None) or getattr(result, "timestamp", None)
    if isinstance(created_at, datetime):
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=UTC)
        else:
            created_at = created_at.astimezone(UTC)
        return created_at.isoformat()
    if created_at is not None:
        return str(created_at)
    return datetime.now(UTC).isoformat()
