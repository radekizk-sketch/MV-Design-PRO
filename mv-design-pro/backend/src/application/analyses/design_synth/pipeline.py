from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from application.analyses.design_synth.canonical import canonicalize_json
from application.analyses.design_synth.evidence_m3 import build_evidence_payload
from application.analyses.design_synth.fingerprint import fingerprint_json
from application.analyses.design_synth.reporting import build_connection_study_report
from application.analyses.design_synth.result import DesignSynthRunResult
from application.analyses.design_synth.service import DesignSynthService
from application.analyses.design_synth.trace import DesignSynthTrace, TraceStep
from infrastructure.persistence.unit_of_work import UnitOfWork


def run_connection_study(
    case_id: UUID,
    base_snapshot_id: str,
    spec_payload: dict,
    *,
    uow_factory: Callable[[], UnitOfWork],
) -> DesignSynthRunResult:
    service = DesignSynthService(uow_factory)
    spec_id = service.create_spec(case_id, base_snapshot_id, spec_payload)
    spec = service.get_spec(spec_id)

    proposal_payload = _build_proposal_payload(spec.spec_json)
    proposal_id = service.create_proposal(
        case_id,
        base_snapshot_id,
        proposal_payload,
        status="GENERATED",
    )
    proposal = service.get_proposal(proposal_id)

    report_json = build_connection_study_report(spec, proposal)
    report_fingerprint = fingerprint_json(report_json)
    report_json_with_fingerprint = canonicalize_json(
        {**report_json, "fingerprint": report_fingerprint}
    )
    spec_payload_canonical = canonicalize_json(spec.spec_json)
    connection_payload = _extract_connection_node(spec_payload_canonical)
    trace = _build_trace(
        spec_payload_canonical, proposal.proposal_json, report_json, report_fingerprint
    )

    evidence_id = uuid4()
    created_at = datetime.now(UTC)
    evidence_payload = build_evidence_payload(
        case_id=str(case_id),
        base_snapshot_id=base_snapshot_id,
        spec_payload_canonical=spec_payload_canonical,
        connection_node=connection_payload,
        trace=trace,
        design_spec_id=str(spec_id),
        design_proposal_id=str(proposal_id),
        design_evidence_id=str(evidence_id),
        report_json=report_json,
        report_fingerprint=report_fingerprint,
        created_at_utc_iso=created_at.isoformat(),
    )
    service.create_evidence(case_id, base_snapshot_id, evidence_payload, evidence_id=evidence_id)

    return DesignSynthRunResult(
        case_id=case_id,
        base_snapshot_id=base_snapshot_id,
        design_spec_id=spec_id,
        design_proposal_id=proposal_id,
        design_evidence_id=evidence_id,
        report_json=report_json_with_fingerprint,
        created_at=created_at,
    )


def _build_proposal_payload(spec_payload: dict[str, Any]) -> dict[str, Any]:
    connection_payload = _extract_connection_node(spec_payload)
    proposal = {
        "stage": "connection_study",
        "proposal_version": "M2",
        "connection_node": connection_payload,
        "constraints": spec_payload.get("constraints", {}),
        "assumptions": spec_payload.get("assumptions", {}),
        "grid": spec_payload.get("grid", {}),
        "recommended_actions": [
            {
                "action": "review_constraints",
                "status": "pending",
                "notes": "Placeholder for deterministic connection study proposal.",
            }
        ],
        "notes": "Deterministic placeholder proposal. No solver execution.",
    }
    return canonicalize_json(proposal)


def _build_trace(
    spec_payload: dict[str, Any],
    proposal_payload: dict[str, Any],
    report_json: dict[str, Any],
    report_fingerprint: str,
) -> DesignSynthTrace:
    steps = (
        TraceStep(
            name="normalize_spec",
            version="M3",
            inputs={"raw_spec_keys": sorted(spec_payload.keys())},
            outputs={
                "canonical_spec_keys": sorted(spec_payload.keys()),
                "connection_node": _extract_connection_node(spec_payload),
            },
        ),
        TraceStep(
            name="generate_proposal",
            version="M3",
            inputs={"spec_keys": sorted(spec_payload.keys())},
            outputs={"proposal_keys": sorted(proposal_payload.keys())},
        ),
        TraceStep(
            name="build_report",
            version="M3",
            inputs={"report_sections": sorted(report_json.keys())},
            outputs={
                "report_keys": sorted(report_json.keys()),
                "report_fingerprint": report_fingerprint,
            },
        ),
        TraceStep(
            name="persist_artifacts",
            version="M3",
            inputs={"artifact_types": ["design_spec", "design_proposal", "design_evidence"]},
            outputs={"artifact_count": 3},
        ),
    )
    return DesignSynthTrace(steps=steps)


def _extract_connection_node(spec_payload: dict[str, Any]) -> dict[str, Any]:
    if "connection_node" in spec_payload:
        return spec_payload["connection_node"]
    if "BoundaryNode" in spec_payload:
        return spec_payload["BoundaryNode"]
    return {}
