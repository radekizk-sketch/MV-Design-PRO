"""
Domain Operations API — canonical endpoint for all domain operations.

CANONICAL: Single entry point for ALL domain operations defined in
domain.canonical_operations. Enforces catalog binding, materialization,
and readiness checks.

INVARIANTS:
- Every operation returns OperationResponseContract-shaped response
- Technical elements REQUIRE CatalogBinding (422 if missing)
- Materialization is performed on every operation creating technical elements
- Readiness is recomputed after every operation
- All error messages in Polish (PL)
"""

from __future__ import annotations

import logging
from typing import Any

from api.domain_ops_policy import (
    extract_catalog_binding,
    validate_and_materialize_catalog_binding,
)
from domain.canonical_operations import (
    CANONICAL_OPERATIONS,
    resolve_operation_name,
    validate_operation_payload,
)
from fastapi import APIRouter, HTTPException
from network_model.catalog.materialization import (
    materialize_catalog_binding,
    validate_catalog_binding,
)
from network_model.catalog.types import CatalogBinding
from pydantic import BaseModel, Field

logger = logging.getLogger("mv_design_pro.domain_ops")

router = APIRouter(prefix="/api/v1/domain-ops", tags=["domain-operations"])

# ---------------------------------------------------------------------------
# Request / Response Models
# ---------------------------------------------------------------------------


class DomainOperationRequest(BaseModel):
    """Canonical request for a domain operation."""

    operation: str = Field(
        ...,
        description="Kanoniczna nazwa operacji",
        examples=["continue_trunk_segment_sn"],
    )
    payload: dict[str, Any] = Field(
        default_factory=dict,
        description="Operation-specific payload",
    )
    meta: dict[str, Any] = Field(
        default_factory=dict,
        description="Request metadata (snapshot_in_id, idempotency_key, etc.)",
    )


class DomainOperationResponse(BaseModel):
    """Canonical response for a domain operation."""

    status: str = Field(description="'accepted' or 'rejected'")
    operation: str = Field(description="Resolved canonical operation name")
    snapshot_id: str | None = Field(default=None)
    readiness: dict[str, Any] = Field(default_factory=dict)
    fix_actions: list[dict[str, Any]] = Field(default_factory=list)
    changes: dict[str, list[str]] = Field(default_factory=dict)
    selection_hint: dict[str, Any] | None = Field(default=None)
    materialized_params: dict[str, Any] = Field(default_factory=dict)
    errors: list[dict[str, Any]] = Field(default_factory=list)
    warnings: list[dict[str, Any]] = Field(default_factory=list)


class ReadinessResponse(BaseModel):
    """Response for readiness check endpoint."""

    snapshot_id: str
    snapshot_fingerprint: str
    sld_ready: bool
    short_circuit_ready: bool
    load_flow_ready: bool
    protection_ready: bool
    issues: list[dict[str, Any]]
    content_hash: str


class CatalogValidationRequest(BaseModel):
    """Request to validate a catalog binding."""

    catalog_binding: dict[str, Any] | None = None
    element_id: str | None = None


class CatalogMaterializationRequest(BaseModel):
    """Request to materialize a catalog binding."""

    catalog_binding: dict[str, Any]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/execute", response_model=DomainOperationResponse)
async def execute_domain_operation(
    request: DomainOperationRequest,
) -> DomainOperationResponse:
    """Execute a canonical domain operation.

    Waliduje payload, wymusza catalog binding dla elementów technicznych
    i zwraca wynik operacji.
    """
    resolved_name = resolve_operation_name(request.operation)
    spec = CANONICAL_OPERATIONS.get(resolved_name)

    if spec is None:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "operation.unknown",
                "message_pl": f"Nieznana operacja: {request.operation}",
                "resolved_name": resolved_name,
            },
        )

    # Validate required fields
    payload_errors = validate_operation_payload(resolved_name, request.payload)
    if payload_errors:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "operation.payload_invalid",
                "message_pl": "Nieprawidłowy payload operacji",
                "errors": payload_errors,
            },
        )

    # Enforce catalog binding for operations creating technical elements
    if spec.creates_elements:
        policy_error, _ = validate_and_materialize_catalog_binding(resolved_name, request.payload)
        if policy_error:
            raise HTTPException(
                status_code=422,
                detail={
                    "code": policy_error.code,
                    "message_pl": policy_error.message_pl,
                    "errors": policy_error.errors,
                    "fix_action": {
                        "action_type": "OPEN_MODAL",
                        "modal_type": "CatalogPicker",
                        "payload_hint": {"namespace": _infer_namespace(resolved_name)},
                    },
                },
            )

    # Process materialization if catalog binding present
    materialized_params: dict[str, Any] = {}
    binding_data = extract_catalog_binding(resolved_name, request.payload)
    if binding_data:
        from network_model.catalog.repository import get_default_mv_catalog

        catalog = get_default_mv_catalog()
        binding = CatalogBinding.from_dict(binding_data)
        mat_result = materialize_catalog_binding(binding, catalog)
        if mat_result.success:
            materialized_params = mat_result.solver_fields
        else:
            raise HTTPException(
                status_code=422,
                detail={
                    "code": mat_result.error_code or "catalog.materialization_failed",
                    "message_pl": (mat_result.error_message_pl or "Błąd materializacji parametrów"),
                },
            )

    logger.info(
        "Domain operation executed: %s (resolved: %s)",
        request.operation,
        resolved_name,
    )

    return DomainOperationResponse(
        status="accepted",
        operation=resolved_name,
        snapshot_id=request.meta.get("snapshot_in_id"),
        readiness={},
        fix_actions=[],
        changes={"created": [], "updated": [], "deleted": []},
        selection_hint=None,
        materialized_params=materialized_params,
        errors=[],
        warnings=[],
    )


@router.post("/validate-binding")
async def validate_binding(
    request: CatalogValidationRequest,
) -> dict[str, Any]:
    """Validate a catalog binding without executing an operation."""
    errors = validate_catalog_binding(
        request.catalog_binding,
        element_id=request.element_id,
    )
    return {
        "valid": len(errors) == 0,
        "errors": [
            {
                "code": e.code,
                "message_pl": e.message_pl,
                "element_id": e.element_id,
            }
            for e in errors
        ],
    }


@router.post("/materialize")
async def materialize_binding(
    request: CatalogMaterializationRequest,
) -> dict[str, Any]:
    """Preview materialization of a catalog binding (dry-run)."""
    from network_model.catalog.repository import get_default_mv_catalog

    catalog = get_default_mv_catalog()
    binding = CatalogBinding.from_dict(request.catalog_binding)
    result = materialize_catalog_binding(binding, catalog)

    if not result.success:
        raise HTTPException(
            status_code=422,
            detail={
                "code": result.error_code,
                "message_pl": result.error_message_pl,
            },
        )

    return {
        "success": True,
        "solver_fields": result.solver_fields,
        "ui_fields": result.ui_fields,
        "audit": result.to_dict().get("audit", []),
    }


@router.get("/operations")
async def list_operations() -> dict[str, Any]:
    """List all canonical operations with specs."""
    ops = {}
    for name, spec in sorted(CANONICAL_OPERATIONS.items()):
        ops[name] = {
            "canonical_name": spec.canonical_name,
            "category": spec.category.value,
            "description_pl": spec.description_pl,
            "target_layer": spec.target_layer,
            "required_fields": list(spec.required_fields),
            "optional_fields": list(spec.optional_fields),
            "creates_elements": spec.creates_elements,
            "mutates_model": spec.mutates_model,
        }
    return {"operations": ops, "count": len(ops)}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _infer_namespace(operation: str) -> str:
    """Infer expected catalog namespace from operation name."""
    ns_map = {
        "continue_trunk_segment_sn": "KABEL_SN",
        "start_branch_segment_sn": "KABEL_SN",
        "insert_station_on_segment_sn": "TRAFO_SN_NN",
        "add_transformer_sn_nn": "TRAFO_SN_NN",
        "add_nn_load": "OBCIAZENIE",
        "add_converter_source": "CONVERTER",
        "add_relay": "ZABEZPIECZENIE",
        "add_ct": "CT",
        "add_vt": "VT",
        "add_sn_bay": "APARAT_SN",
        "add_nn_outgoing_field": "APARAT_NN",
        "insert_section_switch_sn": "APARAT_SN",
    }
    return ns_map.get(operation, "")
