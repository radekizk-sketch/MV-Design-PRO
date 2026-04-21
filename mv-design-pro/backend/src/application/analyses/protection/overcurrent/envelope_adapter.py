from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from application.analyses.design_synth.fingerprint import fingerprint_json
from application.analyses.protection.overcurrent.inputs import ProtectionInput
from application.analyses.run_envelope import (
    AnalysisRunEnvelope,
    ArtifactRef,
    InputsRef,
    TraceRef,
    fingerprint_envelope,
)


def to_run_envelope(
    protection_input: ProtectionInput,
    *,
    outputs: dict[str, Any],
    artifacts: tuple[ArtifactRef, ...] | None = None,
    run_id: str | None = None,
    case_id: str | None = None,
    base_snapshot_id: str | None = None,
    trace_inline: dict[str, Any] | None = None,
    created_at_utc: str | None = None,
) -> AnalysisRunEnvelope:
    analysis_type = "protection.overcurrent.v0"
    input_payload = protection_input.to_dict()
    input_fingerprint = fingerprint_json(input_payload)
    run_fingerprint = fingerprint_json(
        {"analysis_type": analysis_type, "inputs": input_payload, "outputs": outputs}
    )
    resolved_run_id = run_id or f"{analysis_type}:{run_fingerprint}"
    resolved_artifacts = artifacts or (
        ArtifactRef(type="protection_input", id=f"protection_input:{input_fingerprint}"),
    )
    inputs = InputsRef(
        base_snapshot_id=base_snapshot_id,
        spec_ref=None,
        inline=input_payload,
    )
    trace = TraceRef(type="white_box", id=None, inline=trace_inline) if trace_inline else None
    created_at_utc = created_at_utc or datetime.now(UTC).isoformat()

    envelope_dict = {
        "schema_version": "v0",
        "run_id": resolved_run_id,
        "analysis_type": analysis_type,
        "case_id": case_id,
        "inputs": inputs.to_dict(),
        "artifacts": [artifact.to_dict() for artifact in resolved_artifacts],
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
        artifacts=resolved_artifacts,
        trace=trace,
        created_at_utc=created_at_utc,
        fingerprint=fingerprint,
    )
