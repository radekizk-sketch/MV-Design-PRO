"""Envelope adapter for energy validation analysis runs."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from analysis.energy_validation.models import EnergyValidationView
from application.analyses.run_envelope import (
    AnalysisRunEnvelope,
    ArtifactRef,
    InputsRef,
    TraceRef,
    fingerprint_envelope,
)


def to_run_envelope(
    result: EnergyValidationView,
    *,
    run_id: str,
    case_id: str | None = None,
    base_snapshot_id: str | None = None,
    inputs_inline: dict[str, Any] | None = None,
    trace_inline: dict[str, Any] | None = None,
) -> AnalysisRunEnvelope:
    analysis_type = "energy_validation.v0"
    artifacts = (ArtifactRef(type="energy_validation_result", id=run_id),)
    inputs = InputsRef(
        base_snapshot_id=base_snapshot_id,
        spec_ref=None,
        inline=inputs_inline or (result.config.to_dict() if result.config else None),
    )
    trace = (
        TraceRef(type="energy_validation", id=None, inline=trace_inline) if trace_inline else None
    )
    created_at_utc = datetime.now(UTC).isoformat()

    envelope_dict = {
        "schema_version": "v0",
        "run_id": run_id,
        "analysis_type": analysis_type,
        "case_id": case_id,
        "inputs": inputs.to_dict(),
        "artifacts": [a.to_dict() for a in artifacts],
        "trace": trace.to_dict() if trace else None,
        "created_at_utc": created_at_utc,
        "fingerprint": "",
    }
    fp = fingerprint_envelope(envelope_dict)

    return AnalysisRunEnvelope(
        run_id=run_id,
        analysis_type=analysis_type,
        case_id=case_id,
        inputs=inputs,
        artifacts=artifacts,
        trace=trace,
        created_at_utc=created_at_utc,
        fingerprint=fp,
    )
