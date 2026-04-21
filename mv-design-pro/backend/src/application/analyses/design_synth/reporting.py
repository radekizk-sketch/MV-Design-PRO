from __future__ import annotations

from typing import Any

from application.analyses.design_synth.canonical import canonicalize_json
from application.analyses.design_synth.models import DesignProposal, DesignSpec

BoundaryNode_SECTION_TITLE = "BoundaryNode – węzeł przyłączenia"


def build_connection_study_report(spec: DesignSpec, proposal: DesignProposal) -> dict[str, Any]:
    connection_payload = _extract_connection_node(spec.spec_json)
    report_body: dict[str, Any] = {
        "report_type": "connection_study",
        "case_id": str(spec.case_id),
        "base_snapshot_id": spec.base_snapshot_id,
        BoundaryNode_SECTION_TITLE: connection_payload,
        "assumptions": spec.spec_json.get("assumptions", {}),
        "constraints": spec.spec_json.get("constraints", {}),
        "proposal": proposal.proposal_json,
    }
    return canonicalize_json(report_body)


def _extract_connection_node(spec_json: dict[str, Any]) -> dict[str, Any]:
    if "connection_node" in spec_json:
        return spec_json["connection_node"]
    if "BoundaryNode" in spec_json:
        return spec_json["BoundaryNode"]
    return {}
