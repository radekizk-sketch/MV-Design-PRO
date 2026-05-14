"""
Fault Loop NN API endpoint (P0.5).

POST /api/fault-loop/compute
- Accepts FaultLoopBuildRequest payload (per fault_loop_builder.py)
- Calls compute_fault_loop solver (IEC 60364-4-41)
- Returns FaultLoopResult serialized via to_dict() (WHITE BOX trace)
- Frozen API: result schema versioned

INVARIANTS:
- NO physics (delegate do solver)
- WHITE BOX trace propagated (white_box_trace field)
- DETERMINISTIC (same input → identical result)
- Polish error messages per V12.xx canon
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from network_model.solvers.fault_loop_builder import (
    FaultLoopBuildRequest,
    build_fault_loop_input,
)
from network_model.solvers.fault_loop_iec60364 import (
    NetworkType,
    ProtectionArrangement,
    compute_fault_loop,
)

router = APIRouter(prefix="/api/fault-loop", tags=["fault-loop"])


class FaultLoopComponentModel(BaseModel):
    """Składowa impedancji pętli zwarcia (R + jX)."""

    label: str = Field(..., description="Polska etykieta (np. 'L 25 mm² Cu 30 m')")
    r_ohm: float = Field(..., ge=0, description="Rezystancja [Ω]")
    x_ohm: float = Field(..., ge=0, description="Reaktancja [Ω]")


class FaultLoopComputeRequest(BaseModel):
    """Request dla compute_fault_loop endpoint."""

    fault_node_id: str = Field(..., description="Identyfikator szyny nN gdzie zwarcie")
    u_nom_v: float = Field(230.0, gt=0, description="Napięcie nominalne fazowe [V]")
    phase_conductor: FaultLoopComponentModel
    return_conductor: FaultLoopComponentModel
    transformer_impedance: FaultLoopComponentModel
    upstream_impedance: FaultLoopComponentModel | None = None
    network_type: str = Field("TN-S", description="TN-S | TN-C-S | TN-C | TT | IT")
    protection_arrangement: str = Field("PE", description="PE | PEN | NONE")


class FaultLoopComputeResponse(BaseModel):
    """Response z FaultLoopResult.to_dict() + envelope wrapping ready."""

    fault_node_id: str
    network_type: str
    protection_arrangement: str
    u_nom_v: float
    components: list[dict[str, Any]]
    z_loop_ohm: dict[str, float]
    ik_min_a: float
    ik_max_a: float
    white_box_trace: list[dict[str, Any]]


@router.post(
    "/compute",
    response_model=FaultLoopComputeResponse,
    status_code=status.HTTP_200_OK,
    summary="Oblicz impedancję pętli zwarcia (IEC 60364-4-41)",
)
def compute_fault_loop_endpoint(
    request: FaultLoopComputeRequest,
) -> FaultLoopComputeResponse:
    """
    Oblicz impedancję pętli zwarcia po stronie nN.

    Per IEC 60364-4-41:
        Z_loop = Z_phase + Z_return + Z_transformer (+ Z_upstream opcjonalne)
        I_k = c * U_n / |Z_loop|

    gdzie c = 0.95 (min) / 1.05 (max) per IEC 60909-0 § 5.3.2.

    MVP scope: TN-S, TN-C-S, TN-C. TT/IT rzucają NotImplementedError.
    """
    try:
        # Mapuj string enums na typy domenowe
        net_type_map = {nt.value: nt for nt in NetworkType}
        pa_map = {pa.value: pa for pa in ProtectionArrangement}
        if request.network_type not in net_type_map:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Nieznany typ sieci: '{request.network_type}'. Dozwolone: {list(net_type_map.keys())}",
            )
        if request.protection_arrangement not in pa_map:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Nieznany typ ochrony: '{request.protection_arrangement}'. Dozwolone: {list(pa_map.keys())}",
            )

        # Buduj FaultLoopInput przez fault_loop_builder
        build_req = FaultLoopBuildRequest(
            fault_node_id=request.fault_node_id,
            u_nom_v=request.u_nom_v,
            network_type=net_type_map[request.network_type],
            protection_arrangement=pa_map[request.protection_arrangement],
            phase_conductor_r_ohm=request.phase_conductor.r_ohm,
            phase_conductor_x_ohm=request.phase_conductor.x_ohm,
            return_conductor_r_ohm=request.return_conductor.r_ohm,
            return_conductor_x_ohm=request.return_conductor.x_ohm,
            transformer_r_ohm=request.transformer_impedance.r_ohm,
            transformer_x_ohm=request.transformer_impedance.x_ohm,
            upstream_r_ohm=(
                request.upstream_impedance.r_ohm if request.upstream_impedance else None
            ),
            upstream_x_ohm=(
                request.upstream_impedance.x_ohm if request.upstream_impedance else None
            ),
            phase_label=request.phase_conductor.label,
            return_label=request.return_conductor.label,
            transformer_label=request.transformer_impedance.label,
            upstream_label=(
                request.upstream_impedance.label
                if request.upstream_impedance
                else "Sieć SN (upstream Thevenin)"
            ),
        )
        fault_loop_input = build_fault_loop_input(build_req)
        result = compute_fault_loop(fault_loop_input)
        return FaultLoopComputeResponse(**result.to_dict())
    except NotImplementedError as e:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED, detail=str(e)
        ) from e
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)
        ) from e
