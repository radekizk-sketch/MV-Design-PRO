"""
ENM API — persistence + validation + run dispatch + topology operations.

Routes:
  GET  /api/cases/{case_id}/enm              → current EnergyNetworkModel
  PUT  /api/cases/{case_id}/enm              → autosave (revision++, hash recomputed)
  GET  /api/cases/{case_id}/enm/validate     → ValidationResult
  GET  /api/cases/{case_id}/enm/topology     → TopologyGraph (substations, bays, junctions, corridors)
  GET  /api/cases/{case_id}/enm/topology/summary → TopologySummary (graph view: adjacency, spine, laterals)
  GET  /api/cases/{case_id}/enm/readiness    → ReadinessMatrix (SC/PF/PR)
  POST /api/cases/{case_id}/enm/ops          → Topology operations (atomic graph CRUD)
  POST /api/cases/{case_id}/runs/short-circuit → dispatch SC run via ENM
  POST /api/cases/{case_id}/runs/power-flow    → dispatch PF run via ENM
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from api.domain_ops_policy import validate_and_materialize_catalog_binding
from application.eligibility_service import EligibilityService
from application.field_read_model import build_field_read_model
from application.protection_read_model import build_protection_read_model
from domain.canonical_operations import resolve_operation_name
from enm.canonical_analysis import run_power_flow_now, run_short_circuit_now
from enm.hash import compute_enm_hash
from enm.models import EnergyNetworkModel
from enm.severity import empty_severity_counts, is_failed_status
from enm.store import get_enm as _get_enm
from enm.store import set_enm as _set_enm
from enm.topology_ops import (
    attach_protection,
    compute_topology_summary,
    create_branch,
    create_device,
    create_measurement,
    create_node,
    delete_branch,
    delete_device,
    delete_measurement,
    delete_node,
    detach_protection,
    update_branch,
    update_device,
    update_node,
    update_protection,
)
from enm.v2_projection import project_enm_v1_to_v2
from enm.validator import ENMValidator
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/cases", tags=["enm"])


class WizardStepRequestModel(BaseModel):
    step_id: str
    data: dict[str, Any] = Field(default_factory=dict)


def _resolve_project_id(case_id: str, request: Request) -> str | None:
    uow_factory = getattr(request.app.state, "uow_factory", None)
    if uow_factory is None:
        return None
    try:
        parsed_case_id = UUID(case_id)
    except ValueError:
        return None
    with uow_factory() as uow:
        study_case = uow.cases.get_study_case(parsed_case_id)
        if study_case is not None:
            return str(study_case.project_id)
    return None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/{case_id}/enm")
async def get_enm(case_id: str) -> dict[str, Any]:
    """Return current EnergyNetworkModel for case."""
    enm = _get_enm(case_id)
    return enm.model_dump(mode="json")


@router.get("/{case_id}/enm/v2-projection")
async def get_enm_v2_projection(case_id: str) -> dict[str, Any]:
    """Return the read-only ENM v2.0 projection used by V12.xx M1 migration."""
    enm = _get_enm(case_id)
    projection = project_enm_v1_to_v2(enm)
    return projection.model_dump(mode="json")


@router.put("/{case_id}/enm")
async def put_enm(case_id: str, payload: EnergyNetworkModel) -> dict[str, Any]:
    """Autosave ENM: revision++, hash recomputed."""
    saved = _set_enm(case_id, payload)
    return saved.model_dump(mode="json")


@router.get("/{case_id}/enm/validate")
async def validate_enm(case_id: str) -> dict[str, Any]:
    """Validate ENM and return readiness gate result."""
    enm = _get_enm(case_id)
    validator = ENMValidator()
    result = validator.validate(enm)
    return result.model_dump(mode="json")


@router.get("/{case_id}/enm/topology")
async def get_enm_topology(case_id: str) -> dict[str, Any]:
    """Zwróć podsumowanie topologii (stacje, pola, węzły T, magistrale)."""
    enm = _get_enm(case_id)
    return {
        "case_id": case_id,
        "substations": [s.model_dump(mode="json") for s in enm.substations],
        "bays": [b.model_dump(mode="json") for b in enm.bays],
        "junctions": [j.model_dump(mode="json") for j in enm.junctions],
        "corridors": [c.model_dump(mode="json") for c in enm.corridors],
        "bus_count": len(enm.buses),
        "branch_count": len(enm.branches),
        "transformer_count": len(enm.transformers),
    }


@router.get("/{case_id}/enm/readiness")
async def get_enm_readiness(case_id: str) -> dict[str, Any]:
    """Zwróć macierz gotowości dla wszystkich typów analiz."""
    enm = _get_enm(case_id)
    validator = ENMValidator()
    validation = validator.validate(enm)
    readiness = validator.readiness(validation)

    has_protection_data = bool(enm.protection_assignments) or (
        bool(enm.bays) and any(b.protection_ref is not None for b in enm.bays)
    )

    return {
        "case_id": case_id,
        "enm_revision": enm.header.revision,
        "validation": validation.model_dump(mode="json"),
        "readiness": readiness.model_dump(mode="json"),
        "analysis_readiness": {
            "short_circuit_3f": validation.analysis_available.short_circuit_3f,
            "short_circuit_1f": validation.analysis_available.short_circuit_1f,
            "load_flow": validation.analysis_available.load_flow,
            "protection": has_protection_data and readiness.ready,
        },
        "topology_completeness": {
            "has_substations": len(enm.substations) > 0,
            "has_bays": len(enm.bays) > 0,
            "has_junctions": len(enm.junctions) > 0,
            "has_corridors": len(enm.corridors) > 0,
        },
        "element_counts": {
            "buses": len(enm.buses),
            "branches": len(enm.branches),
            "transformers": len(enm.transformers),
            "sources": len(enm.sources),
            "loads": len(enm.loads),
            "generators": len(enm.generators),
            "substations": len(enm.substations),
            "bays": len(enm.bays),
            "junctions": len(enm.junctions),
            "corridors": len(enm.corridors),
            "measurements": len(enm.measurements),
            "protection_assignments": len(enm.protection_assignments),
        },
    }


@router.get("/{case_id}/enm/protection-view")
async def get_enm_protection_view(case_id: str) -> dict[str, Any]:
    """Return read-only protection view derived directly from ENM."""
    enm = _get_enm(case_id)
    return build_protection_read_model(case_id, enm)


@router.get("/{case_id}/enm/field-view")
async def get_enm_field_view(case_id: str) -> dict[str, Any]:
    """Return canonical bay field view derived directly from ENM."""
    enm = _get_enm(case_id)
    return build_field_read_model(case_id, enm)


# ---------------------------------------------------------------------------
# Engineering Readiness (aggregated UX endpoint)
# ---------------------------------------------------------------------------


@router.get("/{case_id}/engineering-readiness")
async def get_engineering_readiness(case_id: str) -> dict[str, Any]:
    """Agregacyjny endpoint inżynierskiej gotowości modelu.

    Łączy walidację + readiness + fix_action w jeden response
    dla Engineering Readiness Panel.
    NIE zmienia istniejącego /readiness — to nowy endpoint UX.
    Deterministyczny: ten sam ENM → identyczny wynik.
    """
    enm = _get_enm(case_id)
    validator = ENMValidator()
    validation = validator.validate(enm)
    readiness = validator.readiness(validation)

    issues_out: list[dict[str, Any]] = []
    for issue in validation.issues:
        item: dict[str, Any] = {
            "code": issue.code,
            "severity": issue.severity,
            "element_ref": issue.element_refs[0] if issue.element_refs else None,
            "element_refs": issue.element_refs,
            "message_pl": issue.message_pl,
            "wizard_step_hint": issue.wizard_step_hint,
            "suggested_fix": issue.suggested_fix,
            "fix_action": (
                issue.fix_action.model_dump(mode="json") if issue.fix_action else None
            ),
        }
        issues_out.append(item)

    by_severity = empty_severity_counts()
    for issue in validation.issues:
        by_severity[issue.severity] = by_severity.get(issue.severity, 0) + 1

    return {
        "case_id": case_id,
        "enm_revision": enm.header.revision,
        "status": validation.status,
        "ready": readiness.ready,
        "validation": validation.model_dump(mode="json"),
        "readiness": readiness.model_dump(mode="json"),
        "issues": issues_out,
        "total_count": len(issues_out),
        "by_severity": by_severity,
        "analysis_available": validation.analysis_available.model_dump(mode="json"),
    }


# ---------------------------------------------------------------------------
# Analysis Eligibility Matrix (PR-17)
# ---------------------------------------------------------------------------


@router.get("/{case_id}/analysis-eligibility")
async def get_analysis_eligibility(case_id: str) -> dict[str, Any]:
    """Macierz zdolności uruchomienia analiz (eligibility).

    Dla każdego typu analizy (SC_3F, SC_2F, SC_1F, LOAD_FLOW) zwraca:
    - status: ELIGIBLE / INELIGIBLE
    - blockers, warnings, info
    - fix_actions (deklaratywne sugestie naprawcze)
    - content_hash (deterministyczny SHA-256)

    Niezależna od walidacji i readiness — osobna warstwa.
    Deterministyczny: identyczny ENM -> identyczny wynik.
    """
    enm = _get_enm(case_id)
    validator = ENMValidator()
    validation = validator.validate(enm)
    readiness = validator.readiness(validation)

    service = EligibilityService()
    matrix = service.compute_matrix(
        enm=enm,
        readiness=readiness,
        case_id=case_id,
    )

    return matrix.to_dict()


# ---------------------------------------------------------------------------
# Topology Summary (graph view)
# ---------------------------------------------------------------------------


@router.get("/{case_id}/enm/topology/summary")
async def get_topology_summary(case_id: str) -> dict[str, Any]:
    """Zwróć podsumowanie topologiczne: adjacency, spine, laterals.

    Używane przez Tree i SLD do wyświetlania struktury sieci.
    DETERMINISTYCZNE: ten sam ENM → identyczny wynik.
    """
    enm = _get_enm(case_id)
    enm_dict = enm.model_dump(mode="json")
    summary = compute_topology_summary(enm_dict)
    return {
        "case_id": case_id,
        "enm_revision": enm.header.revision,
        "bus_count": summary.bus_count,
        "branch_count": summary.branch_count,
        "transformer_count": summary.transformer_count,
        "source_count": summary.source_count,
        "load_count": summary.load_count,
        "generator_count": summary.generator_count,
        "measurement_count": summary.measurement_count,
        "protection_count": summary.protection_count,
        "is_radial": summary.is_radial,
        "has_cycles": summary.has_cycles,
        "adjacency": [
            {
                "bus_ref": e.bus_ref,
                "neighbor_ref": e.neighbor_ref,
                "via_ref": e.via_ref,
                "via_type": e.via_type,
            }
            for e in summary.adjacency
        ],
        "spine": [
            {
                "bus_ref": s.bus_ref,
                "depth": s.depth,
                "is_source": s.is_source,
                "children_refs": list(s.children_refs),
            }
            for s in summary.spine
        ],
        "lateral_roots": list(summary.lateral_roots),
    }


# ---------------------------------------------------------------------------
# Topology Operations (atomic graph CRUD)
# ---------------------------------------------------------------------------


class TopologyOpRequest(BaseModel):
    """Żądanie operacji topologicznej."""

    op: str = Field(
        ...,
        description="Typ operacji (create_node, update_node, delete_node, "
        "create_branch, update_branch, delete_branch, "
        "create_device, update_device, delete_device, "
        "create_measurement, delete_measurement, "
        "attach_protection, update_protection, detach_protection)",
    )
    data: dict[str, Any] = Field(default_factory=dict, description="Dane operacji")


_OP_DISPATCH = {
    "create_node": lambda enm, data: create_node(enm, data),
    "update_node": lambda enm, data: update_node(enm, data),
    "delete_node": lambda enm, data: delete_node(enm, data.get("ref_id", "")),
    "create_branch": lambda enm, data: create_branch(enm, data),
    "update_branch": lambda enm, data: update_branch(enm, data),
    "delete_branch": lambda enm, data: delete_branch(enm, data.get("ref_id", "")),
    "create_device": lambda enm, data: create_device(enm, data),
    "update_device": lambda enm, data: update_device(enm, data),
    "delete_device": lambda enm, data: delete_device(
        enm,
        data.get("device_type", ""),
        data.get("ref_id", ""),
    ),
    "create_measurement": lambda enm, data: create_measurement(enm, data),
    "delete_measurement": lambda enm, data: delete_measurement(
        enm, data.get("ref_id", "")
    ),
    "attach_protection": lambda enm, data: attach_protection(enm, data),
    "update_protection": lambda enm, data: update_protection(enm, data),
    "detach_protection": lambda enm, data: detach_protection(
        enm, data.get("ref_id", "")
    ),
}


@router.post("/{case_id}/enm/ops")
async def topology_ops(case_id: str, req: TopologyOpRequest) -> dict[str, Any]:
    """Atomic topology operation: validate → mutate → persist.

    Supports: create/update/delete for nodes, branches, devices,
    measurements, and protection assignments.
    Returns operation result with issues and updated ENM revision.
    """
    handler = _OP_DISPATCH.get(req.op)
    if not handler:
        raise HTTPException(
            status_code=400,
            detail=f"Nieznana operacja: '{req.op}'. "
            f"Dostępne: {', '.join(sorted(_OP_DISPATCH.keys()))}",
        )

    enm = _get_enm(case_id)
    enm_dict = enm.model_dump(mode="json")

    result = handler(enm_dict, req.data)

    if result.success:
        saved = _set_enm(case_id, EnergyNetworkModel.model_validate(result.enm))
        return {
            "success": True,
            "op": req.op,
            "created_ref": result.created_ref,
            "issues": [
                {
                    "code": i.code,
                    "severity": i.severity,
                    "message_pl": i.message_pl,
                    "element_ref": i.element_ref,
                }
                for i in result.issues
            ],
            "revision": saved.header.revision,
        }

    return {
        "success": False,
        "op": req.op,
        "created_ref": None,
        "issues": [
            {
                "code": i.code,
                "severity": i.severity,
                "message_pl": i.message_pl,
                "element_ref": i.element_ref,
            }
            for i in result.issues
        ],
        "revision": enm.header.revision,
    }


class BatchOpsRequest(BaseModel):
    """Żądanie wielu operacji topologicznych (batch)."""

    operations: list[TopologyOpRequest] = Field(
        ..., description="Lista operacji do wykonania sekwencyjnie"
    )


@router.post("/{case_id}/enm/ops/batch")
async def topology_ops_batch(case_id: str, req: BatchOpsRequest) -> dict[str, Any]:
    """Batch topology operations: execute sequentially, rollback all on BLOCKER.

    Each operation is applied sequentially on the result of the previous one.
    If any operation fails with BLOCKER, ALL operations are rolled back.
    """
    enm = _get_enm(case_id)
    enm_dict = enm.model_dump(mode="json")

    results: list[dict[str, Any]] = []
    current_enm = enm_dict

    for op_req in req.operations:
        handler = _OP_DISPATCH.get(op_req.op)
        if not handler:
            return {
                "success": False,
                "results": results,
                "error": f"Nieznana operacja: '{op_req.op}'",
                "revision": enm.header.revision,
            }

        result = handler(current_enm, op_req.data)
        op_result = {
            "op": op_req.op,
            "success": result.success,
            "created_ref": result.created_ref,
            "issues": [
                {
                    "code": i.code,
                    "severity": i.severity,
                    "message_pl": i.message_pl,
                    "element_ref": i.element_ref,
                }
                for i in result.issues
            ],
        }
        results.append(op_result)

        if not result.success:
            # Rollback: return original ENM
            return {
                "success": False,
                "results": results,
                "error": f"Operacja '{op_req.op}' nie powiodła się — rollback",
                "revision": enm.header.revision,
            }

        current_enm = result.enm

    # All operations succeeded — persist
    saved = _set_enm(case_id, EnergyNetworkModel.model_validate(current_enm))
    return {
        "success": True,
        "results": results,
        "error": None,
        "revision": saved.header.revision,
    }


# ---------------------------------------------------------------------------
# Run dispatch: ENM → NetworkGraph → Solver → Result
# ---------------------------------------------------------------------------

# Cache: (case_id, enm_hash) → result


@router.post("/{case_id}/runs/short-circuit")
async def run_short_circuit(case_id: str, request: Request) -> dict[str, Any]:
    """
    Dispatch short-circuit 3F run:
    1. Load ENM
    2. Validate (must not FAIL)
    3. Map ENM → NetworkGraph
    4. Run solver
    5. Cache + return
    """
    enm = _get_enm(case_id)

    # Validate
    validator = ENMValidator()
    validation = validator.validate(enm)
    if is_failed_status(validation.status):
        raise HTTPException(
            status_code=422,
            detail=[i.model_dump(mode="json") for i in validation.issues],
        )

    try:
        body = await request.json()
    except Exception:
        body = {}
    allowed_options = {
        key: body[key]
        for key in (
            "fault_type",
            "short_circuit_type",
            "c_factor",
            "thermal_time_seconds",
        )
        if isinstance(body, dict) and key in body
    }

    run = run_short_circuit_now(
        case_id=case_id,
        project_id=_resolve_project_id(case_id, request),
        options=allowed_options,
    )

    # Map ENM → NetworkGraph
    return {
        "case_id": case_id,
        "enm_revision": enm.header.revision,
        "enm_hash": compute_enm_hash(enm),
        "analysis_type": (run.raw_result or {}).get(
            "analysis_type", "short_circuit_3f"
        ),
        "short_circuit_type": (run.raw_result or {}).get("short_circuit_type", "3F"),
        "reporting_status": (run.raw_result or {}).get("reporting_status"),
        "proof_status": (run.raw_result or {}).get("proof_status"),
        "proof_engine_version": (run.raw_result or {}).get("proof_engine_version"),
        "run_id": str(run.id),
        "input_hash": run.input_hash,
        "readiness": run.readiness,
        "results": (run.raw_result or {}).get("results", []),
    }


@router.post("/{case_id}/runs/power-flow")
async def run_power_flow(case_id: str, request: Request) -> dict[str, Any]:
    """Dispatch power-flow run from the canonical ENM snapshot."""
    enm = _get_enm(case_id)

    validator = ENMValidator()
    validation = validator.validate(enm)
    if is_failed_status(validation.status):
        raise HTTPException(
            status_code=422,
            detail=[i.model_dump(mode="json") for i in validation.issues],
        )

    run = run_power_flow_now(
        case_id=case_id,
        project_id=_resolve_project_id(case_id, request),
    )
    return {
        "case_id": case_id,
        "enm_revision": enm.header.revision,
        "enm_hash": compute_enm_hash(enm),
        "analysis_type": "power_flow",
        "run_id": str(run.id),
        "input_hash": run.input_hash,
        "readiness": run.readiness,
        "result": ((run.raw_result or {}).get("result_v1") or {}),
        "trace": run.power_flow_trace or {},
    }


# ---------------------------------------------------------------------------
# Wizard step controller endpoints
# ---------------------------------------------------------------------------


@router.get("/{case_id}/wizard/state")
async def get_wizard_state(case_id: str) -> dict[str, Any]:
    """Return full wizard state for case (deterministic).

    Computes K1-K10 step states, readiness matrix, element counts.
    Used for restoring wizard state after refresh / deep-link.
    """
    from application.network_wizard.validator import validate_wizard_state

    enm = _get_enm(case_id)
    enm_dict = enm.model_dump(mode="json")
    ws = validate_wizard_state(enm_dict)
    return ws.model_dump(mode="json")


@router.post("/{case_id}/wizard/apply-step")
async def wizard_apply_step(
    case_id: str, req: WizardStepRequestModel
) -> dict[str, Any]:
    """Atomic step application: preconditions → mutate → postconditions.

    If preconditions fail → original ENM unchanged, success=False.
    If postconditions fail → rollback, original ENM unchanged, success=False.
    On success → ENM saved with revision++, returns new wizard state.
    """
    from application.network_wizard.schema import ApplyStepResponse
    from application.network_wizard.step_controller import apply_step as ctrl_apply_step
    from application.network_wizard.validator import validate_wizard_state

    enm = _get_enm(case_id)
    enm_dict = enm.model_dump(mode="json")

    result = ctrl_apply_step(enm_dict, req.step_id, req.data)

    if result.success:
        # Persist mutated ENM
        saved = _set_enm(case_id, EnergyNetworkModel.model_validate(result.enm))
        saved_dict = saved.model_dump(mode="json")
        ws = validate_wizard_state(saved_dict)
        return ApplyStepResponse(
            success=True,
            step_id=result.step_id,
            precondition_issues=result.precondition_issues,
            postcondition_issues=result.postcondition_issues,
            can_proceed=result.can_proceed,
            current_step=result.current_step,
            next_step=result.next_step,
            revision=saved.header.revision,
            wizard_state=ws,
        ).model_dump(mode="json")

    # Failure: return issues, ENM unchanged
    ws = validate_wizard_state(enm_dict)
    return ApplyStepResponse(
        success=False,
        step_id=result.step_id,
        precondition_issues=result.precondition_issues,
        postcondition_issues=result.postcondition_issues,
        can_proceed=False,
        current_step=result.current_step,
        next_step=result.next_step,
        revision=enm.header.revision,
        wizard_state=ws,
    ).model_dump(mode="json")


@router.get("/{case_id}/wizard/can-proceed")
async def wizard_can_proceed(
    case_id: str, from_step: str = "K1", to_step: str = "K2"
) -> dict[str, Any]:
    """Check if step transition is allowed.

    Forward transitions require no BLOCKER in current step
    and no BLOCKER preconditions for target step.
    Backward transitions are always allowed.
    """
    from application.network_wizard.schema import CanProceedResponse
    from application.network_wizard.step_controller import (
        can_proceed as ctrl_can_proceed,
    )

    enm = _get_enm(case_id)
    enm_dict = enm.model_dump(mode="json")
    result = ctrl_can_proceed(from_step, to_step, enm_dict)
    return CanProceedResponse(
        allowed=result.allowed,
        from_step=result.from_step,
        to_step=result.to_step,
        blocking_issues=result.blocking_issues,
    ).model_dump(mode="json")


# ---------------------------------------------------------------------------
# Domain Operations (canonical V1 — semantic network building ops)
# ---------------------------------------------------------------------------


class DomainOpPayloadModel(BaseModel):
    """Payload operacji domenowej."""

    name: str = Field(..., description="Kanoniczna nazwa operacji")
    idempotency_key: str = Field("", description="Klucz idempotencji")
    payload: dict[str, Any] = Field(default_factory=dict)


class DomainOpEnvelopeModel(BaseModel):
    """Wspólny envelope wywołania operacji domenowej."""

    project_id: str = ""
    snapshot_base_hash: str = ""
    operation: DomainOpPayloadModel


@router.post("/{case_id}/enm/domain-ops")
async def domain_ops(case_id: str, req: DomainOpEnvelopeModel) -> dict[str, Any]:
    """Kanoniczny endpoint operacji domenowych V1.

    Wspólny kontrakt dla wszystkich operacji budowy sieci SN:
    add_grid_source_sn, continue_trunk_segment_sn,
    insert_station_on_segment_sn, start_branch_segment_sn,
    insert_section_switch_sn, connect_secondary_ring_sn,
    set_normal_open_point, add_transformer_sn_nn,
    assign_catalog_to_element, update_element_parameters.

    Odpowiedź zawiera: snapshot, readiness, fix_actions, changes,
    selection_hint, audit_trail, domain_events.
    """
    from enm.domain_operations import execute_domain_operation

    enm = _get_enm(case_id)
    enm_dict = enm.model_dump(mode="json")

    # Walidacja snapshot_base_hash (optimistic concurrency)
    current_hash = enm.header.hash_sha256
    if req.snapshot_base_hash and req.snapshot_base_hash != current_hash:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Konflikt wersji: oczekiwany hash '{req.snapshot_base_hash}', "
                f"aktualny '{current_hash}'. Odśwież snapshot i spróbuj ponownie."
            ),
        )

    resolved_name = resolve_operation_name(req.operation.name)
    policy_error, _ = validate_and_materialize_catalog_binding(
        resolved_name,
        req.operation.payload,
    )
    if policy_error:
        raise HTTPException(
            status_code=422,
            detail={
                "code": policy_error.code,
                "message_pl": policy_error.message_pl,
                "errors": policy_error.errors,
            },
        )

    result = execute_domain_operation(
        enm_dict=enm_dict,
        op_name=req.operation.name,
        payload=req.operation.payload,
    )

    if result.get("adapter_only"):
        if result.get("attach_field_view"):
            result["field_view"] = build_field_read_model(case_id, enm)
        if result.get("attach_protection_view"):
            result["protection_view"] = build_protection_read_model(case_id, enm)
        return result

    # Persist if operation succeeded (snapshot present and valid)
    if result.get("snapshot") and not result.get("error"):
        try:
            new_enm = EnergyNetworkModel.model_validate(result["snapshot"])
            saved = _set_enm(case_id, new_enm)
            result["snapshot"] = saved.model_dump(mode="json")
        except Exception as e:
            result["error"] = f"Błąd zapisu snapshot: {e}"
            result["error_code"] = "api.snapshot_validation_failed"
            result["snapshot"] = None

    return result


_PRODUCTION_DISABLED_ROUTE_KEYS = {
    ("/api/cases/{case_id}/enm", "PUT"),
    ("/api/cases/{case_id}/enm/ops", "POST"),
    ("/api/cases/{case_id}/enm/ops/batch", "POST"),
    ("/api/cases/{case_id}/wizard/apply-step", "POST"),
}


def _build_production_router() -> APIRouter:
    production = APIRouter()
    for route in router.routes:
        path = getattr(route, "path", "")
        methods = set(getattr(route, "methods", set()))
        if any((path, method) in _PRODUCTION_DISABLED_ROUTE_KEYS for method in methods):
            continue
        production.routes.append(route)
    return production


production_router = _build_production_router()
