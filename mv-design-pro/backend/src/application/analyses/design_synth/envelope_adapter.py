from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from application.analyses.design_synth.result import DesignSynthRunResult
from application.analyses.run_envelope import (
    AnalysisRunEnvelope,
    ArtifactRef,
    InputsRef,
    TraceRef,
    fingerprint_envelope,
)


def to_run_envelope(
    result: DesignSynthRunResult,
    *,
    evidence_payload: dict[str, Any] | None = None,
    trace_inline: dict[str, Any] | None = None,
) -> AnalysisRunEnvelope:
    analysis_type = "design_synth.connection_study"
    run_id = str(result.design_evidence_id)
    case_id = str(result.case_id) if result.case_id else None
    spec_ref = ArtifactRef(type="design_spec", id=str(result.design_spec_id))
    artifacts = (
        spec_ref,
        ArtifactRef(type="design_proposal", id=str(result.design_proposal_id)),
        ArtifactRef(type="design_evidence", id=str(result.design_evidence_id)),
    )
    inputs = InputsRef(
        base_snapshot_id=result.base_snapshot_id,
        spec_ref=spec_ref,
        inline=None,
    )
    trace = None
    if trace_inline:
        trace = TraceRef(type="white_box", id=None, inline=trace_inline)
    created_at_utc = _resolve_created_at_utc(result.created_at, evidence_payload)

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


def _resolve_created_at_utc(created_at: datetime, evidence_payload: dict[str, Any] | None) -> str:
    if evidence_payload:
        meta = evidence_payload.get("meta")
        if isinstance(meta, dict) and meta.get("created_at_utc"):
            return str(meta["created_at_utc"])
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=UTC)
    else:
        created_at = created_at.astimezone(UTC)
    return created_at.isoformat()
