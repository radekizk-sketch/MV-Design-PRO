from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from application.analyses.design_synth.fingerprint import fingerprint_json
from application.analyses.run_envelope import (
    AnalysisRunEnvelope,
    ArtifactRef,
    InputsRef,
    TraceRef,
    fingerprint_envelope,
)


def to_run_envelope(
    *,
    protection_run_id: str,
    device_id: str,
    requirement_hash: str,
    capability_id: str | None,
    mapping_report_fingerprint: str,
    case_id: str | None,
    base_snapshot_id: str | None,
    trace_inline: dict[str, Any] | None,
    run_id: str | None = None,
    created_at_utc: str | None = None,
) -> AnalysisRunEnvelope:
    analysis_type = "protection.device_mapping.v0"
    input_payload = {
        "protection_run_id": protection_run_id,
        "device_id": device_id,
        "requirement_hash": requirement_hash,
    }
    run_fingerprint = fingerprint_json(
        {
            "analysis_type": analysis_type,
            "inputs": input_payload,
            "mapping_report_fingerprint": mapping_report_fingerprint,
            "capability_id": capability_id,
        }
    )
    resolved_run_id = run_id or f"{analysis_type}:{run_fingerprint}"
    resolved_artifacts = (
        ArtifactRef(
            type="device_capability",
            id=capability_id or "device_capability:missing",
        ),
        ArtifactRef(
            type="protection_requirement_v0",
            id=f"protection_requirement_v0:{requirement_hash}",
        ),
        ArtifactRef(
            type="device_mapping_report_v0",
            id=f"device_mapping_report_v0:{mapping_report_fingerprint}",
        ),
    )
    inputs = InputsRef(
        base_snapshot_id=base_snapshot_id,
        spec_ref=None,
        inline=input_payload,
    )
    trace = TraceRef(type="white_box", id=None, inline=trace_inline)
    created_at_utc = created_at_utc or datetime.now(UTC).isoformat()

    envelope_dict = {
        "schema_version": "v0",
        "run_id": resolved_run_id,
        "analysis_type": analysis_type,
        "case_id": case_id,
        "inputs": inputs.to_dict(),
        "artifacts": [artifact.to_dict() for artifact in resolved_artifacts],
        "trace": trace.to_dict(),
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
