from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from network_model.solvers.grid_source_preview import (
    GridSourcePreviewInput,
    compute_grid_source_preview,
)

router = APIRouter(tags=["grid-source-preview"])


class ComplexOhmResponse(BaseModel):
    r_ohm: float
    x_ohm: float


class GridSourcePreviewRequest(BaseModel):
    voltage_kv: float = Field(gt=0)
    short_circuit_mode: Literal["SHORT_CIRCUIT_POWER", "IMPEDANCE"] = "SHORT_CIRCUIT_POWER"
    sk3_mva: float | None = Field(default=None, gt=0)
    rx_ratio: float | None = Field(default=None, ge=0)
    r_ohm: float | None = Field(default=None, ge=0)
    x_ohm: float | None = Field(default=None, gt=0)
    zero_sequence_enabled: bool = False
    r0_ohm: float | None = Field(default=None, ge=0)
    x0_ohm: float | None = Field(default=None, gt=0)
    z0_z1_ratio: float | None = Field(default=None, gt=0)
    tk_s: float = Field(default=1.0, gt=0)
    tb_s: float = Field(default=0.1, gt=0)


class GridSourcePreviewResponse(BaseModel):
    sk_mva: float
    ik3_ka: float
    ik1_ka: float | None
    ip_ka: float
    ith_ka: float
    kappa: float
    z1_ohm: ComplexOhmResponse
    z0_ohm: ComplexOhmResponse | None
    formula_ref: str


@router.post("/api/solver/grid-source-preview", response_model=GridSourcePreviewResponse)
def preview_grid_source_short_circuit(
    request: GridSourcePreviewRequest,
) -> GridSourcePreviewResponse:
    try:
        result = compute_grid_source_preview(
            GridSourcePreviewInput(
                voltage_kv=request.voltage_kv,
                short_circuit_mode=request.short_circuit_mode,
                sk3_mva=request.sk3_mva,
                rx_ratio=request.rx_ratio,
                r_ohm=request.r_ohm,
                x_ohm=request.x_ohm,
                zero_sequence_enabled=request.zero_sequence_enabled,
                r0_ohm=request.r0_ohm,
                x0_ohm=request.x0_ohm,
                z0_z1_ratio=request.z0_z1_ratio,
                tk_s=request.tk_s,
                tb_s=request.tb_s,
            )
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return GridSourcePreviewResponse(
        sk_mva=result.sk_mva,
        ik3_ka=result.ik3_ka,
        ik1_ka=result.ik1_ka,
        ip_ka=result.ip_ka,
        ith_ka=result.ith_ka,
        kappa=result.kappa,
        z1_ohm=ComplexOhmResponse(r_ohm=result.z1_ohm.real, x_ohm=result.z1_ohm.imag),
        z0_ohm=(
            ComplexOhmResponse(r_ohm=result.z0_ohm.real, x_ohm=result.z0_ohm.imag)
            if result.z0_ohm is not None
            else None
        ),
        formula_ref=result.formula_ref,
    )
