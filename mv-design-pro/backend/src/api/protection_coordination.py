"""
Protection Coordination API — FIX-12

Endpoints for protection coordination analysis.

CANONICAL ALIGNMENT:
- NOT-A-SOLVER: Consumes PF/SC results, no physics calculations
- 100% Polish labels in responses
- Deterministic output

Endpoints:
- POST /projects/{project_id}/protection-coordination — Run coordination analysis
- GET /protection-coordination/{run_id} — Get coordination result
- GET /protection-coordination/{run_id}/tcc — Get TCC data for visualization
- GET /protection-coordination/{run_id}/export/pdf — Export to PDF
- GET /protection-coordination/{run_id}/export/docx — Export to DOCX
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from application.analyses.protection.coordination import (
    CoordinationConfig,
    CoordinationInput,
    OvercurrentCoordinationAnalyzer,
)
from application.analyses.protection.coordination.models import (
    FaultCurrentData,
    OperatingCurrentData,
)
from domain.protection_device import (
    CurveStandard,
    OvercurrentProtectionSettings,
    OvercurrentStageSettings,
    ProtectionCurveSettings,
    ProtectionDevice,
    ProtectionDeviceType,
)
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

router = APIRouter(prefix="/protection-coordination", tags=["protection-coordination"])


# =============================================================================
# REQUEST/RESPONSE MODELS
# =============================================================================


class CurveSettingsRequest(BaseModel):
    """Curve settings for a protection stage."""

    standard: str = Field(..., description="Curve standard (IEC/IEEE)")
    variant: str = Field(..., description="Curve variant (SI/VI/EI/LTI/DT)")
    pickup_current_a: float = Field(..., gt=0, description="Pickup current [A]")
    time_multiplier: float = Field(..., ge=0.05, le=10.0, description="TMS/TD")
    definite_time_s: float | None = Field(None, ge=0, description="Definite time [s]")


class StageSettingsRequest(BaseModel):
    """Settings for an overcurrent stage."""

    enabled: bool = True
    pickup_current_a: float = Field(..., gt=0, description="Pickup current [A]")
    time_s: float | None = Field(None, ge=0, description="Fixed time [s]")
    curve_settings: CurveSettingsRequest | None = None
    directional: bool = False


class ProtectionSettingsRequest(BaseModel):
    """Complete overcurrent protection settings."""

    stage_51: StageSettingsRequest
    stage_50: StageSettingsRequest | None = None
    stage_50_high: StageSettingsRequest | None = None
    stage_51n: StageSettingsRequest | None = None
    stage_50n: StageSettingsRequest | None = None


class DeviceRequest(BaseModel):
    """Protection device definition."""

    id: str
    name: str
    device_type: str = Field(..., description="RELAY/FUSE/RECLOSER/CIRCUIT_BREAKER")
    location_element_id: str
    settings: ProtectionSettingsRequest
    manufacturer: str | None = None
    model: str | None = None
    location_description: str | None = None
    ct_ratio: str | None = None
    rated_current_a: float | None = None


class FaultCurrentRequest(BaseModel):
    """Fault current data for a location."""

    location_id: str
    ik_max_3f_a: float = Field(..., gt=0, description="Max 3-phase fault [A]")
    ik_min_3f_a: float = Field(..., gt=0, description="Min 3-phase fault [A]")
    ik_max_2f_a: float | None = Field(None, gt=0, description="Max 2-phase fault [A]")
    ik_min_1f_a: float | None = Field(None, gt=0, description="Min 1-phase fault [A]")


class OperatingCurrentRequest(BaseModel):
    """Operating current data for a location."""

    location_id: str
    i_operating_a: float = Field(..., gt=0, description="Operating current [A]")
    i_max_operating_a: float | None = Field(None, gt=0, description="Max operating [A]")
    loading_percent: float | None = None


class CoordinationConfigRequest(BaseModel):
    """Coordination analysis configuration."""

    breaker_time_s: float = Field(0.05, ge=0, description="Breaker time [s]")
    relay_overtravel_s: float = Field(0.05, ge=0, description="Overtravel [s]")
    safety_factor_s: float = Field(0.1, ge=0, description="Safety factor [s]")
    sensitivity_margin_pass: float = Field(1.5, ge=1.0, description="Sensitivity PASS threshold")
    sensitivity_margin_marginal: float = Field(
        1.2, ge=1.0, description="Sensitivity MARGINAL threshold"
    )
    overload_margin_pass: float = Field(1.2, ge=1.0, description="Overload PASS threshold")
    overload_margin_marginal: float = Field(1.1, ge=1.0, description="Overload MARGINAL threshold")


class RunCoordinationRequest(BaseModel):
    """Request to run coordination analysis."""

    devices: list[DeviceRequest]
    fault_currents: list[FaultCurrentRequest]
    operating_currents: list[OperatingCurrentRequest]
    config: CoordinationConfigRequest | None = None
    pf_run_id: str | None = None
    sc_run_id: str | None = None


class CoordinationSummaryResponse(BaseModel):
    """Summary response for coordination analysis."""

    run_id: str
    project_id: str
    overall_verdict: str
    overall_verdict_pl: str
    total_devices: int
    total_checks: int
    sensitivity_pass: int
    sensitivity_fail: int
    selectivity_pass: int
    selectivity_fail: int
    overload_pass: int
    overload_fail: int


class TCCCurveResponse(BaseModel):
    """TCC curve data for a device."""

    device_id: str
    device_name: str
    curve_type: str
    pickup_current_a: float
    time_multiplier: float
    points: list[dict[str, float]]
    color: str


class FaultMarkerResponse(BaseModel):
    """Fault marker for TCC chart."""

    id: str
    label_pl: str
    current_a: float
    fault_type: str
    location: str


class TCCResponse(BaseModel):
    """TCC data response for visualization."""

    curves: list[TCCCurveResponse]
    fault_markers: list[FaultMarkerResponse]


# =============================================================================
# IN-MEMORY STORAGE (replace with proper persistence in production)
# =============================================================================

_coordination_results: dict[str, dict[str, Any]] = {}


# =============================================================================
# HELPERS
# =============================================================================


def _convert_curve_settings(req: CurveSettingsRequest | None) -> ProtectionCurveSettings | None:
    """Convert request curve settings to domain model."""
    if req is None:
        return None
    return ProtectionCurveSettings(
        standard=CurveStandard(req.standard),
        variant=req.variant,
        pickup_current_a=req.pickup_current_a,
        time_multiplier=req.time_multiplier,
        definite_time_s=req.definite_time_s,
    )


def _convert_stage_settings(req: StageSettingsRequest | None) -> OvercurrentStageSettings | None:
    """Convert request stage settings to domain model."""
    if req is None:
        return None
    return OvercurrentStageSettings(
        enabled=req.enabled,
        pickup_current_a=req.pickup_current_a,
        time_s=req.time_s,
        curve_settings=_convert_curve_settings(req.curve_settings),
        directional=req.directional,
    )


def _convert_device(req: DeviceRequest) -> ProtectionDevice:
    """Convert request device to domain model."""
    settings = OvercurrentProtectionSettings(
        stage_51=_convert_stage_settings(req.settings.stage_51),  # type: ignore
        stage_50=_convert_stage_settings(req.settings.stage_50),
        stage_50_high=_convert_stage_settings(req.settings.stage_50_high),
        stage_51n=_convert_stage_settings(req.settings.stage_51n),
        stage_50n=_convert_stage_settings(req.settings.stage_50n),
    )

    return ProtectionDevice(
        id=UUID(req.id),
        name=req.name,
        device_type=ProtectionDeviceType(req.device_type),
        location_element_id=req.location_element_id,
        settings=settings,
        manufacturer=req.manufacturer,
        model=req.model,
        location_description=req.location_description,
        ct_ratio=req.ct_ratio,
        rated_current_a=req.rated_current_a,
    )


# =============================================================================
# ENDPOINTS
# =============================================================================


@router.post(
    "/projects/{project_id}/run",
    status_code=status.HTTP_201_CREATED,
    response_model=CoordinationSummaryResponse,
)
def run_coordination_analysis(
    project_id: UUID,
    request: RunCoordinationRequest,
) -> dict[str, Any]:
    """
    Run protection coordination analysis.

    Analyzes:
    - Sensitivity (will devices trip for minimum fault?)
    - Selectivity (proper time grading between devices?)
    - Overload protection (won't trip on normal current?)

    Returns summary with overall PASS/MARGINAL/FAIL verdict.
    """
    # Convert request to domain models
    devices = tuple(_convert_device(d) for d in request.devices)

    fault_currents = tuple(
        FaultCurrentData(
            location_id=f.location_id,
            ik_max_3f_a=f.ik_max_3f_a,
            ik_min_3f_a=f.ik_min_3f_a,
            ik_max_2f_a=f.ik_max_2f_a,
            ik_min_1f_a=f.ik_min_1f_a,
        )
        for f in request.fault_currents
    )

    operating_currents = tuple(
        OperatingCurrentData(
            location_id=o.location_id,
            i_operating_a=o.i_operating_a,
            i_max_operating_a=o.i_max_operating_a,
            loading_percent=o.loading_percent,
        )
        for o in request.operating_currents
    )

    # Build config
    if request.config:
        config = CoordinationConfig(
            breaker_time_s=request.config.breaker_time_s,
            relay_overtravel_s=request.config.relay_overtravel_s,
            safety_factor_s=request.config.safety_factor_s,
            sensitivity_margin_pass=request.config.sensitivity_margin_pass,
            sensitivity_margin_marginal=request.config.sensitivity_margin_marginal,
            overload_margin_pass=request.config.overload_margin_pass,
            overload_margin_marginal=request.config.overload_margin_marginal,
        )
    else:
        config = CoordinationConfig()

    # Create input
    input_data = CoordinationInput(
        devices=devices,
        fault_currents=fault_currents,
        operating_currents=operating_currents,
        config=config,
        pf_run_id=request.pf_run_id,
        sc_run_id=request.sc_run_id,
        project_id=str(project_id),
    )

    # Run analysis
    analyzer = OvercurrentCoordinationAnalyzer(config=config)
    result = analyzer.analyze(input_data)

    # Store result (in-memory, replace with proper persistence)
    _coordination_results[result.run_id] = result.to_dict()

    # Build summary response
    summary = result.summary
    return {
        "run_id": result.run_id,
        "project_id": result.project_id,
        "overall_verdict": result.overall_verdict,
        "overall_verdict_pl": summary.get("overall_verdict_pl", result.overall_verdict),
        "total_devices": summary.get("total_devices", 0),
        "total_checks": summary.get("total_checks", 0),
        "sensitivity_pass": summary.get("sensitivity", {}).get("pass", 0),
        "sensitivity_fail": summary.get("sensitivity", {}).get("fail", 0),
        "selectivity_pass": summary.get("selectivity", {}).get("pass", 0),
        "selectivity_fail": summary.get("selectivity", {}).get("fail", 0),
        "overload_pass": summary.get("overload", {}).get("pass", 0),
        "overload_fail": summary.get("overload", {}).get("fail", 0),
    }


@router.get(
    "/{run_id}",
    response_model=dict[str, Any],
)
def get_coordination_result(run_id: str) -> dict[str, Any]:
    """
    Get full coordination analysis result.

    Returns all checks (sensitivity, selectivity, overload) with verdicts.
    """
    result = _coordination_results.get(run_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Coordination result not found: {run_id}",
        )
    return result


@router.get(
    "/{run_id}/tcc",
    response_model=TCCResponse,
)
def get_tcc_data(run_id: str) -> dict[str, Any]:
    """
    Get TCC (Time-Current Characteristic) data for visualization.

    Returns curves and fault markers for chart rendering.
    """
    result = _coordination_results.get(run_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Coordination result not found: {run_id}",
        )

    return {
        "curves": result.get("tcc_curves", []),
        "fault_markers": result.get("fault_markers", []),
    }


@router.get(
    "/{run_id}/trace",
    response_model=dict[str, Any],
)
def get_coordination_trace(run_id: str) -> dict[str, Any]:
    """
    Get WHITE BOX trace for coordination analysis.

    Returns all calculation steps for audit purposes.
    """
    result = _coordination_results.get(run_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Coordination result not found: {run_id}",
        )

    return {
        "run_id": run_id,
        "trace_steps": result.get("trace_steps", []),
        "created_at": result.get("created_at"),
    }


@router.get(
    "/{run_id}/checks/sensitivity",
    response_model=list[dict[str, Any]],
)
def get_sensitivity_checks(run_id: str) -> list[dict[str, Any]]:
    """
    Get sensitivity check results.

    Verifies that protection will trip for minimum fault current.
    """
    result = _coordination_results.get(run_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Coordination result not found: {run_id}",
        )

    return result.get("sensitivity_checks", [])


@router.get(
    "/{run_id}/checks/selectivity",
    response_model=list[dict[str, Any]],
)
def get_selectivity_checks(run_id: str) -> list[dict[str, Any]]:
    """
    Get selectivity check results.

    Verifies time grading between upstream and downstream devices.
    """
    result = _coordination_results.get(run_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Coordination result not found: {run_id}",
        )

    return result.get("selectivity_checks", [])


@router.get(
    "/{run_id}/checks/overload",
    response_model=list[dict[str, Any]],
)
def get_overload_checks(run_id: str) -> list[dict[str, Any]]:
    """
    Get overload check results.

    Verifies that protection won't trip on normal operating current.
    """
    result = _coordination_results.get(run_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Coordination result not found: {run_id}",
        )

    return result.get("overload_checks", [])
