"""
Fault Scenarios API — PR-19 + PR-24

REST API endpoints for managing fault scenarios as first-class domain objects.

Endpoints:
    POST   /api/execution/study-cases/{case_id}/fault-scenarios  — Create scenario
    GET    /api/execution/study-cases/{case_id}/fault-scenarios  — List scenarios
    GET    /api/execution/fault-scenarios/{scenario_id}          — Get scenario
    PUT    /api/execution/fault-scenarios/{scenario_id}          — Update scenario
    DELETE /api/execution/fault-scenarios/{scenario_id}          — Delete scenario
    GET    /api/execution/fault-scenarios/{scenario_id}/eligibility — Check eligibility
    GET    /api/execution/fault-scenarios/{scenario_id}/sld-overlay — SLD overlay
    POST   /api/execution/fault-scenarios/{scenario_id}/runs     — Create run

All responses use Polish error messages for UI consistency.
ZERO heuristics. ZERO auto-completion.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from application.fault_scenario_service import (
    FaultScenarioDuplicateError,
    FaultScenarioHasRunsError,
    FaultScenarioNotFoundError,
    FaultScenarioService,
)
from domain.fault_scenario import (
    FaultMode,
    FaultScenarioValidationError,
    FaultType,
)
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

router = APIRouter(tags=["fault-scenarios"])

# Singleton service (in-memory for PR-19/PR-24)
_service = FaultScenarioService()


def get_fault_scenario_service() -> FaultScenarioService:
    """Get the fault scenario service singleton."""
    return _service


# =============================================================================
# Request/Response Models
# =============================================================================


class FaultLocationRequest(BaseModel):
    """Fault location in the network."""

    element_ref: str = Field(..., description="Identyfikator elementu sieci")
    location_type: str = Field(..., description="Typ lokalizacji: BUS lub BRANCH")
    position: float | None = Field(
        None, description="Pozycja na gałęzi (0..1), wymagane dla BRANCH"
    )


class FaultImpedanceRequest(BaseModel):
    """Fault impedance Zf — explicit R + X in Ohms (v2, PR-25)."""

    r_ohm: float = Field(..., description="Rezystancja zwarcia [Ω]")
    x_ohm: float = Field(..., description="Reaktancja zwarcia [Ω]")


class ShortCircuitConfigRequest(BaseModel):
    """Short-circuit calculation configuration."""

    c_factor: float = Field(1.10, description="Współczynnik napięciowy c (IEC 60909)")
    thermal_time_seconds: float = Field(1.0, description="Czas cieplny [s]")
    include_branch_contributions: bool = Field(False, description="Dołącz wkłady gałęziowe")


class CreateFaultScenarioRequest(BaseModel):
    """Request to create a new fault scenario (v1 + v2)."""

    name: str = Field(..., description="Nazwa scenariusza zwarcia (PL)")
    fault_type: str = Field(..., description="Typ zwarcia: SC_3F, SC_2F, SC_1F")
    location: FaultLocationRequest = Field(..., description="Lokalizacja zwarcia")
    config: ShortCircuitConfigRequest | None = Field(
        None, description="Konfiguracja obliczeń (opcjonalna)"
    )
    fault_mode: str | None = Field(
        None, description="Tryb zwarcia: METALLIC lub IMPEDANCE (v2, domyślnie METALLIC)"
    )
    fault_impedance: FaultImpedanceRequest | None = Field(
        None, description="Impedancja zwarcia Zf [Ω] (wymagane dla IMPEDANCE)"
    )
    arc_params: dict[str, Any] | None = Field(
        None, description="Parametry łuku (zarezerwowane — nieobsługiwane w v2)"
    )
    z0_bus_data: dict[str, Any] | None = Field(
        None, description="Dane impedancji zerowej (wymagane dla SC_1F)"
    )


class UpdateFaultScenarioRequest(BaseModel):
    """Request to update an existing fault scenario (v1 + v2)."""

    name: str | None = Field(None, description="Nowa nazwa scenariusza")
    fault_type: str | None = Field(None, description="Nowy typ zwarcia")
    location: FaultLocationRequest | None = Field(None, description="Nowa lokalizacja zwarcia")
    config: ShortCircuitConfigRequest | None = Field(None, description="Nowa konfiguracja obliczeń")
    fault_mode: str | None = Field(None, description="Nowy tryb zwarcia: METALLIC lub IMPEDANCE")
    fault_impedance: FaultImpedanceRequest | None = Field(
        None, description="Nowa impedancja zwarcia Zf [Ω]"
    )
    arc_params: dict[str, Any] | None = Field(
        None, description="Parametry łuku (zarezerwowane — nieobsługiwane)"
    )
    z0_bus_data: dict[str, Any] | None = Field(None, description="Nowe dane impedancji zerowej")


class FaultScenarioResponse(BaseModel):
    """Fault scenario response model (v1 + v2)."""

    scenario_id: str
    study_case_id: str
    name: str
    analysis_type: str
    fault_type: str
    location: dict[str, Any]
    config: dict[str, Any]
    fault_impedance_type: str
    fault_mode: str = "METALLIC"
    fault_impedance: dict[str, Any] | None = None
    arc_params: dict[str, Any] | None = None
    z0_bus_data: dict[str, Any] | None = None
    created_at: str
    updated_at: str
    content_hash: str


class FaultScenarioListResponse(BaseModel):
    """List of fault scenarios response."""

    scenarios: list[FaultScenarioResponse]
    count: int


class ScenarioEligibilityResponse(BaseModel):
    """Scenario eligibility check response."""

    analysis_type: str
    status: str
    blockers: list[dict[str, Any]]
    warnings: list[dict[str, Any]]
    content_hash: str


class CreateRunFromScenarioRequest(BaseModel):
    """Request to create a run from a scenario."""

    solver_input: dict[str, Any] = Field(
        default_factory=dict,
        description="Dodatkowe wejście solvera (opcjonalne)",
    )


class ErrorResponse(BaseModel):
    """Error response model."""

    detail: str
    code: str | None = None


# =============================================================================
# Helper Functions
# =============================================================================


def _parse_uuid(value: str, field_name: str = "id") -> UUID:
    """Parse and validate a UUID string."""
    try:
        return UUID(value)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} musi być poprawnym UUID",
        ) from exc


def _parse_fault_type(value: str) -> str:
    """Validate a fault type string."""
    try:
        FaultType(value)
        return value
    except ValueError as exc:
        valid = ", ".join(t.value for t in FaultType)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Nieprawidłowy typ zwarcia: {value}. Dozwolone: {valid}",
        ) from exc


def _parse_fault_mode(value: str) -> str:
    """Validate a fault mode string (v2)."""
    try:
        FaultMode(value)
        return value
    except ValueError as exc:
        valid = ", ".join(m.value for m in FaultMode)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Nieprawidłowy tryb zwarcia: {value}. Dozwolone: {valid}",
        ) from exc


# =============================================================================
# Endpoints
# =============================================================================


@router.post(
    "/api/execution/study-cases/{case_id}/fault-scenarios",
    response_model=FaultScenarioResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_fault_scenario(
    case_id: str,
    request: CreateFaultScenarioRequest,
) -> dict[str, Any]:
    """
    Utwórz nowy scenariusz zwarcia.

    Waliduje invarianty: nazwa wymagana, SC_1F wymaga z0_bus_data,
    BRANCH wymaga pozycji w (0,1), BUS nie może mieć pozycji.
    """
    parsed_case_id = _parse_uuid(case_id, "case_id")
    _parse_fault_type(request.fault_type)
    if request.fault_mode is not None:
        _parse_fault_mode(request.fault_mode)
    service = get_fault_scenario_service()

    location_dict = {
        "element_ref": request.location.element_ref,
        "location_type": request.location.location_type,
        "position": request.location.position,
    }

    config_dict = None
    if request.config is not None:
        config_dict = {
            "c_factor": request.config.c_factor,
            "thermal_time_seconds": request.config.thermal_time_seconds,
            "include_branch_contributions": request.config.include_branch_contributions,
        }

    fault_impedance_dict = None
    if request.fault_impedance is not None:
        fault_impedance_dict = {
            "r_ohm": request.fault_impedance.r_ohm,
            "x_ohm": request.fault_impedance.x_ohm,
        }

    try:
        scenario = service.create_scenario(
            study_case_id=parsed_case_id,
            name=request.name,
            fault_type=request.fault_type,
            location=location_dict,
            config=config_dict,
            fault_mode=request.fault_mode,
            fault_impedance=fault_impedance_dict,
            arc_params=request.arc_params,
            z0_bus_data=request.z0_bus_data,
        )
        return scenario.to_dict()
    except FaultScenarioValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except FaultScenarioDuplicateError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc


@router.get(
    "/api/execution/study-cases/{case_id}/fault-scenarios",
    response_model=FaultScenarioListResponse,
)
def list_fault_scenarios(case_id: str) -> dict[str, Any]:
    """
    Lista scenariuszy zwarcia dla przypadku obliczeniowego.

    Posortowane deterministycznie po (fault_type, element_ref).
    """
    parsed_case_id = _parse_uuid(case_id, "case_id")
    service = get_fault_scenario_service()

    scenarios = service.list_scenarios(parsed_case_id)
    return {
        "scenarios": [s.to_dict() for s in scenarios],
        "count": len(scenarios),
    }


@router.get(
    "/api/execution/fault-scenarios/{scenario_id}",
    response_model=FaultScenarioResponse,
)
def get_fault_scenario(scenario_id: str) -> dict[str, Any]:
    """
    Pobierz szczegóły scenariusza zwarcia.
    """
    parsed_id = _parse_uuid(scenario_id, "scenario_id")
    service = get_fault_scenario_service()

    try:
        scenario = service.get_scenario(parsed_id)
        return scenario.to_dict()
    except FaultScenarioNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.put(
    "/api/execution/fault-scenarios/{scenario_id}",
    response_model=FaultScenarioResponse,
)
def update_fault_scenario(
    scenario_id: str,
    request: UpdateFaultScenarioRequest,
) -> dict[str, Any]:
    """
    Zaktualizuj scenariusz zwarcia (copy-on-write).

    Waliduje invarianty po aktualizacji. Przelicza content_hash.
    """
    parsed_id = _parse_uuid(scenario_id, "scenario_id")
    service = get_fault_scenario_service()

    location_dict = None
    if request.location is not None:
        location_dict = {
            "element_ref": request.location.element_ref,
            "location_type": request.location.location_type,
            "position": request.location.position,
        }

    config_dict = None
    if request.config is not None:
        config_dict = {
            "c_factor": request.config.c_factor,
            "thermal_time_seconds": request.config.thermal_time_seconds,
            "include_branch_contributions": request.config.include_branch_contributions,
        }

    fault_type_str = None
    if request.fault_type is not None:
        _parse_fault_type(request.fault_type)
        fault_type_str = request.fault_type

    fault_mode_str = None
    if request.fault_mode is not None:
        _parse_fault_mode(request.fault_mode)
        fault_mode_str = request.fault_mode

    fault_impedance_dict = None
    if request.fault_impedance is not None:
        fault_impedance_dict = {
            "r_ohm": request.fault_impedance.r_ohm,
            "x_ohm": request.fault_impedance.x_ohm,
        }

    try:
        scenario = service.update_scenario(
            parsed_id,
            name=request.name,
            fault_type=fault_type_str,
            location=location_dict,
            config=config_dict,
            fault_mode=fault_mode_str,
            fault_impedance=fault_impedance_dict,
            arc_params=request.arc_params,
            z0_bus_data=request.z0_bus_data,
        )
        return scenario.to_dict()
    except FaultScenarioNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except FaultScenarioValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.delete(
    "/api/execution/fault-scenarios/{scenario_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
def delete_fault_scenario(scenario_id: str) -> None:
    """
    Usuń scenariusz zwarcia.

    Blokada usunięcia jeśli scenariusz ma powiązane przebiegi.
    """
    parsed_id = _parse_uuid(scenario_id, "scenario_id")
    service = get_fault_scenario_service()

    try:
        service.delete_scenario(parsed_id)
    except FaultScenarioNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except FaultScenarioHasRunsError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc


@router.get(
    "/api/execution/fault-scenarios/{scenario_id}/eligibility",
    response_model=ScenarioEligibilityResponse,
)
def get_scenario_eligibility(scenario_id: str) -> dict[str, Any]:
    """
    Sprawdź gotowość scenariusza do uruchomienia analizy.

    Zwraca status eligibility z listą problemów i sugestii naprawczych (FixActions).
    """
    parsed_id = _parse_uuid(scenario_id, "scenario_id")
    service = get_fault_scenario_service()

    try:
        result = service.check_scenario_eligibility(parsed_id)
        return result.to_dict()
    except FaultScenarioNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.get(
    "/api/execution/fault-scenarios/{scenario_id}/sld-overlay",
)
def get_scenario_sld_overlay(scenario_id: str) -> dict[str, Any]:
    """
    Pobierz overlay SLD dla scenariusza zwarcia.

    Zwraca payload overlay z elementami, legendą i etykietą PL.
    Deterministyczny: ten sam scenario_id -> identyczny payload.
    """
    parsed_id = _parse_uuid(scenario_id, "scenario_id")
    service = get_fault_scenario_service()

    try:
        overlay = service.get_scenario_sld_overlay(parsed_id)
        return overlay
    except FaultScenarioNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.post(
    "/api/execution/fault-scenarios/{scenario_id}/runs",
    status_code=status.HTTP_201_CREATED,
)
def create_run_from_scenario(
    scenario_id: str,
    request: CreateRunFromScenarioRequest | None = None,
) -> dict[str, Any]:
    """
    Utwórz przebieg obliczeniowy z scenariusza zwarcia.

    Tworzy Run w statusie PENDING powiązany z scenariuszem.
    Sprawdza eligibility przed utworzeniem — blokada jeśli INELIGIBLE.
    """
    parsed_id = _parse_uuid(scenario_id, "scenario_id")
    service = get_fault_scenario_service()

    try:
        scenario = service.get_scenario(parsed_id)
    except FaultScenarioNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    # Check eligibility before creating run
    eligibility = service.check_scenario_eligibility(parsed_id)
    if eligibility.status.value == "INELIGIBLE":
        blocker_msgs = [b.message_pl for b in eligibility.blockers]
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Analiza zablokowana: " + "; ".join(blocker_msgs),
        )

    supported_fault_types = {"SC_3F", "SC_1F", "SC_2F", "SC_2F_G"}
    if scenario.fault_type.value not in supported_fault_types:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Scenariusz zwarciowy ma typ poza kanonicznym zakresem SC_3F, "
                "SC_1F, SC_2F i SC_2F_G."
            ),
        )

    solver_input: dict[str, Any] = {
        "scenario_id": str(scenario.scenario_id),
        "fault_type": scenario.fault_type.value,
        "location": scenario.location.to_dict(),
        "config": scenario.config.to_dict(),
    }
    if request and request.solver_input:
        solver_input.update(request.solver_input)

    from enm.canonical_analysis import create_run as create_canonical_run
    from enm.store import get_enm

    try:
        get_enm(str(scenario.study_case_id))
        run = create_canonical_run(
            case_id=str(scenario.study_case_id),
            project_id=None,
            analysis_type="short_circuit_sn",
            options=solver_input,
        )

        # Register run association
        service.register_run(parsed_id, run.id)

        return {
            "id": str(run.id),
            "study_case_id": str(scenario.study_case_id),
            "analysis_type": scenario.fault_type.value,
            "solver_input_hash": run.input_hash,
            "status": "PENDING",
            "started_at": None,
            "finished_at": None,
            "error_message": None,
            "scenario_id": str(scenario.scenario_id),
        }

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Błąd tworzenia przebiegu: {exc}",
        ) from exc
