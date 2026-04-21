from __future__ import annotations

from collections.abc import Callable
from typing import Any
from uuid import UUID

from application.analyses.design_synth.envelope_adapter import (
    to_run_envelope as design_synth_to_run_envelope,
)
from application.analyses.design_synth.result import DesignSynthRunResult
from application.analyses.run_envelope import AnalysisRunEnvelope
from infrastructure.persistence.unit_of_work import UnitOfWork


def read_run_envelope(
    analysis_type: str, run_id: str, *, uow_factory: Callable[[], UnitOfWork]
) -> AnalysisRunEnvelope:
    if analysis_type == "design_synth.connection_study":
        return _read_design_synth_connection_study(run_id, uow_factory=uow_factory)
    if analysis_type == "short_circuit.iec60909":
        # TODO: Add persistence-backed lookup for IEC 60909 runs when available.
        raise ValueError("Run not found")
    raise ValueError("Unsupported analysis_type")


def _read_design_synth_connection_study(
    run_id: str, *, uow_factory: Callable[[], UnitOfWork]
) -> AnalysisRunEnvelope:
    try:
        evidence_id = UUID(run_id)
    except ValueError as exc:
        raise ValueError("Run not found") from exc
    with uow_factory() as uow:
        evidence = uow.design_evidence.get(evidence_id)
    if evidence is None:
        raise ValueError("Run not found")

    evidence_payload = evidence.evidence_json if isinstance(evidence.evidence_json, dict) else {}
    outputs = _get_payload_section(evidence_payload, "outputs")
    inputs = _get_payload_section(evidence_payload, "inputs")

    design_spec_id = _parse_uuid(outputs.get("design_spec_id"))
    design_proposal_id = _parse_uuid(outputs.get("design_proposal_id"))
    base_snapshot_id = _resolve_base_snapshot_id(inputs, evidence.snapshot_id)
    report_summary = outputs.get("report_summary") if isinstance(outputs, dict) else None

    result = DesignSynthRunResult(
        case_id=evidence.case_id,
        base_snapshot_id=base_snapshot_id,
        design_spec_id=design_spec_id,
        design_proposal_id=design_proposal_id,
        design_evidence_id=evidence.id,
        report_json=report_summary or {},
        created_at=evidence.created_at,
    )
    return design_synth_to_run_envelope(result, evidence_payload=evidence_payload)


def _get_payload_section(payload: dict[str, Any], key: str) -> dict[str, Any]:
    section = payload.get(key)
    if isinstance(section, dict):
        return section
    return {}


def _parse_uuid(value: Any) -> UUID:
    if isinstance(value, UUID):
        return value
    if value:
        return UUID(str(value))
    raise ValueError("Run not found")


def _resolve_base_snapshot_id(inputs: dict[str, Any], fallback: str) -> str:
    base_snapshot_id = inputs.get("base_snapshot_id") if isinstance(inputs, dict) else None
    if base_snapshot_id:
        return str(base_snapshot_id)
    return fallback
