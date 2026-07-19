from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException
from network_model.solvers.cable_voltage_drop import (
    CableRatedCurrentInput,
    CableVoltageDropInput,
    compute_cable_rated_current,
    compute_cable_voltage_drop,
)
from network_model.solvers.grid_source_preview import (
    GridSourcePreviewInput,
    compute_grid_source_preview,
)
from network_model.solvers.shunt_compensator_preview import (
    ShuntCompensatorPreviewInput,
    compute_shunt_compensator_preview,
)
from network_model.solvers.transformer_rated_currents import (
    TransformerRatedCurrentsInput,
    compute_transformer_rated_currents,
)
from pydantic import BaseModel, Field

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


class CableVoltageDropRequest(BaseModel):
    current_a: float
    length_km: float
    r_ohm_per_km: float
    x_ohm_per_km: float
    cos_phi: float
    line_voltage_v: float


class CableVoltageDropResponse(BaseModel):
    delta_u_v: float
    delta_u_pct: float
    r_total_ohm: float
    x_total_ohm: float
    delta_u_resistive_v: float
    delta_u_reactive_v: float
    formula_ref: str
    assumptions: list[str]


@router.post(
    "/api/solver/cable-voltage-drop-preview",
    response_model=CableVoltageDropResponse,
)
def preview_cable_voltage_drop(
    request: CableVoltageDropRequest,
) -> CableVoltageDropResponse:
    try:
        result = compute_cable_voltage_drop(
            CableVoltageDropInput(
                current_a=request.current_a,
                length_km=request.length_km,
                r_ohm_per_km=request.r_ohm_per_km,
                x_ohm_per_km=request.x_ohm_per_km,
                cos_phi=request.cos_phi,
                line_voltage_v=request.line_voltage_v,
            )
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return CableVoltageDropResponse(
        delta_u_v=result.delta_u_v,
        delta_u_pct=result.delta_u_pct,
        r_total_ohm=result.r_total_ohm,
        x_total_ohm=result.x_total_ohm,
        delta_u_resistive_v=result.delta_u_resistive_v,
        delta_u_reactive_v=result.delta_u_reactive_v,
        formula_ref=result.formula_ref,
        assumptions=list(result.assumptions),
    )


class CableRatedCurrentRequest(BaseModel):
    active_power_kw: float
    cos_phi: float
    line_voltage_v: float


class CableRatedCurrentResponse(BaseModel):
    rated_current_a: float
    apparent_power_kva: float
    formula_ref: str
    assumptions: list[str]


@router.post(
    "/api/solver/cable-rated-current-preview",
    response_model=CableRatedCurrentResponse,
)
def preview_cable_rated_current(
    request: CableRatedCurrentRequest,
) -> CableRatedCurrentResponse:
    try:
        result = compute_cable_rated_current(
            CableRatedCurrentInput(
                active_power_kw=request.active_power_kw,
                cos_phi=request.cos_phi,
                line_voltage_v=request.line_voltage_v,
            )
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return CableRatedCurrentResponse(
        rated_current_a=result.rated_current_a,
        apparent_power_kva=result.apparent_power_kva,
        formula_ref=result.formula_ref,
        assumptions=list(result.assumptions),
    )


class TransformerRatedCurrentsRequest(BaseModel):
    rated_power_kva: float
    primary_voltage_kv: float
    secondary_voltage_kv: float


class TransformerRatedCurrentsResponse(BaseModel):
    primary_current_a: float
    secondary_current_a: float
    formula_ref: str
    assumptions: list[str]


@router.post(
    "/api/solver/transformer-rated-currents-preview",
    response_model=TransformerRatedCurrentsResponse,
)
def preview_transformer_rated_currents(
    request: TransformerRatedCurrentsRequest,
) -> TransformerRatedCurrentsResponse:
    try:
        result = compute_transformer_rated_currents(
            TransformerRatedCurrentsInput(
                rated_power_kva=request.rated_power_kva,
                primary_voltage_kv=request.primary_voltage_kv,
                secondary_voltage_kv=request.secondary_voltage_kv,
            )
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return TransformerRatedCurrentsResponse(
        primary_current_a=result.primary_current_a,
        secondary_current_a=result.secondary_current_a,
        formula_ref=result.formula_ref,
        assumptions=list(result.assumptions),
    )


class ShuntCompensatorPreviewRequest(BaseModel):
    rated_mvar: float = Field(gt=0)
    rated_kv: float = Field(gt=0)


class ShuntCompensatorPreviewResponse(BaseModel):
    rated_mvar: float
    rated_kv: float
    reactive_power_var: float
    susceptance_siemens: float
    rated_current_a: float
    formula_ref: str


@router.post(
    "/api/solver/shunt-compensator-preview",
    response_model=ShuntCompensatorPreviewResponse,
)
def preview_shunt_compensator(
    request: ShuntCompensatorPreviewRequest,
) -> ShuntCompensatorPreviewResponse:
    try:
        result = compute_shunt_compensator_preview(
            ShuntCompensatorPreviewInput(
                rated_mvar=request.rated_mvar,
                rated_kv=request.rated_kv,
            )
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return ShuntCompensatorPreviewResponse(
        rated_mvar=result.rated_mvar,
        rated_kv=result.rated_kv,
        reactive_power_var=result.reactive_power_var,
        susceptance_siemens=result.susceptance_siemens,
        rated_current_a=result.rated_current_a,
        formula_ref=result.formula_ref,
    )
