"""
Protection Engine v1 API — PR-26

Endpoints for Protection Engine v1 with explicit test points.
Relay-at-CB model, ANSI 50/51, IEC IDMT curves.

INVARIANTS:
- No heuristics, no auto-defaults
- Test points as explicit input
- SC ResultSet untouched
- 100% PL error messages
"""

from __future__ import annotations

from typing import Any

from domain.protection_engine_v1 import (
    CTRatio,
    Function50Settings,
    Function51Settings,
    IECCurveTypeV1,
    ProtectionStudyInputV1,
    RelayV1,
    TestPoint,
    execute_protection_v1,
    iec_curve_time_seconds,
)
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

router = APIRouter(
    prefix="/api/protection-engine/v1",
    tags=["protection-engine-v1"],
)


# =============================================================================
# REQUEST / RESPONSE MODELS
# =============================================================================


class CTRatioDTO(BaseModel):
    primary_a: float = Field(..., gt=0, description="CT primary [A]")
    secondary_a: float = Field(..., gt=0, description="CT secondary [A]")


class Function50DTO(BaseModel):
    enabled: bool
    pickup_a_secondary: float = Field(..., gt=0)
    t_trip_s: float | None = None


class Function51DTO(BaseModel):
    curve_type: str = Field(
        ..., description="IEC_STANDARD_INVERSE | IEC_VERY_INVERSE | IEC_EXTREMELY_INVERSE"
    )
    pickup_a_secondary: float = Field(..., gt=0)
    tms: float = Field(..., gt=0)
    max_time_s: float | None = None


class RelayDTO(BaseModel):
    relay_id: str
    attached_cb_id: str
    ct_ratio: CTRatioDTO
    f51: Function51DTO
    f50: Function50DTO | None = None


class TestPointDTO(BaseModel):
    point_id: str
    i_a_primary: float = Field(..., gt=0)


class ExecuteProtectionRequest(BaseModel):
    relays: list[RelayDTO] = Field(..., min_length=1)
    test_points: list[TestPointDTO] = Field(..., min_length=1)


class CurveTimeRequest(BaseModel):
    i_a_secondary: float = Field(..., gt=0)
    pickup_a_secondary: float = Field(..., gt=0)
    tms: float = Field(..., gt=0)
    curve_type: str = Field(
        ..., description="IEC_STANDARD_INVERSE | IEC_VERY_INVERSE | IEC_EXTREMELY_INVERSE"
    )
    max_time_s: float | None = None


# =============================================================================
# ENDPOINTS
# =============================================================================


@router.post(
    "/execute",
    status_code=status.HTTP_200_OK,
    summary="Uruchom analizę zabezpieczeń v1",
)
def execute_protection(request: ExecuteProtectionRequest) -> dict[str, Any]:
    """
    Execute Protection Engine v1 with explicit test points.

    Evaluates each relay against each test point.
    Returns deterministic results with white-box trace.

    No heuristics. No auto-defaults. All parameters must be explicit.
    """
    try:
        # Convert DTOs to domain objects
        relays = tuple(_dto_to_relay(r) for r in request.relays)
        test_points = tuple(_dto_to_test_point(tp) for tp in request.test_points)

        study_input = ProtectionStudyInputV1(
            relays=relays,
            test_points=test_points,
        )

        # Execute
        result = execute_protection_v1(study_input)

        return {
            "status": "OK",
            "input_hash": study_input.canonical_hash(),
            "result": result.to_dict(),
        }

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Nieprawidlowe dane wejsciowe: {exc}",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Blad silnika zabezpieczen: {exc}",
        ) from exc


@router.post(
    "/curve-time",
    status_code=status.HTTP_200_OK,
    summary="Oblicz czas zadziałania krzywej IEC",
)
def calculate_curve_time(request: CurveTimeRequest) -> dict[str, Any]:
    """
    Calculate IEC IDMT trip time for a single current/settings pair.

    Pure function — no side effects, no state.
    Returns trip time and full white-box trace.
    """
    try:
        curve_type = IECCurveTypeV1(request.curve_type)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Nieznany typ krzywej: {request.curve_type}. "
                f"Dozwolone: {[ct.value for ct in IECCurveTypeV1]}"
            ),
        )

    trip_time, trace = iec_curve_time_seconds(
        i_a_secondary=request.i_a_secondary,
        pickup_a_secondary=request.pickup_a_secondary,
        tms=request.tms,
        curve_type=curve_type,
        max_time_s=request.max_time_s,
    )

    return {
        "trip_time_s": trip_time,
        "will_trip": trip_time is not None,
        "trace": trace,
    }


@router.get(
    "/curve-types",
    summary="Lista dostępnych krzywych IEC",
)
def list_curve_types() -> dict[str, Any]:
    """List available IEC curve types with Polish labels and parameters."""
    from domain.protection_engine_v1 import IEC_CURVE_LABELS_PL, IEC_CURVE_PARAMS

    curves = []
    for ct in IECCurveTypeV1:
        A, B = IEC_CURVE_PARAMS[ct]
        curves.append(
            {
                "value": ct.value,
                "label_pl": IEC_CURVE_LABELS_PL[ct],
                "A": A,
                "B": B,
                "formula": "t = TMS * A / (M^B - 1)",
                "standard": "IEC 60255-151:2009",
            }
        )

    return {"curves": curves}


# =============================================================================
# VALIDATION ENDPOINT
# =============================================================================


@router.post(
    "/validate",
    status_code=status.HTTP_200_OK,
    summary="Walidacja danych wejściowych",
)
def validate_input(request: ExecuteProtectionRequest) -> dict[str, Any]:
    """
    Validate protection input without executing.

    Returns list of issues (error codes + Polish messages).
    No auto-correction — only diagnostics.
    """
    issues: list[dict[str, Any]] = []

    for relay in request.relays:
        # CT ratio validation
        if relay.ct_ratio.primary_a <= 0 or relay.ct_ratio.secondary_a <= 0:
            issues.append(
                {
                    "code": "protection.relay_missing_ct_ratio",
                    "relay_id": relay.relay_id,
                    "message_pl": f"Przekaźnik {relay.relay_id}: nieprawidłowa przekładnia CT",
                    "severity": "BLOCKER",
                    "fix_action": {
                        "action_type": "NAVIGATE_TO_ELEMENT",
                        "element_ref": relay.attached_cb_id,
                        "description_pl": "Uzupełnij przekładnię CT",
                    },
                }
            )

        # Curve type validation
        try:
            IECCurveTypeV1(relay.f51.curve_type)
        except ValueError:
            issues.append(
                {
                    "code": "protection.curve_invalid_params",
                    "relay_id": relay.relay_id,
                    "message_pl": (
                        f"Przekaźnik {relay.relay_id}: "
                        f"nieprawidłowy typ krzywej '{relay.f51.curve_type}'"
                    ),
                    "severity": "BLOCKER",
                    "fix_action": {
                        "action_type": "OPEN_MODAL",
                        "element_ref": relay.attached_cb_id,
                        "modal_type": "relay_settings",
                        "description_pl": "Wybierz prawidłowy typ krzywej IEC",
                    },
                }
            )

        # TMS validation
        if relay.f51.tms <= 0:
            issues.append(
                {
                    "code": "protection.curve_invalid_params",
                    "relay_id": relay.relay_id,
                    "message_pl": f"Przekaźnik {relay.relay_id}: TMS musi być dodatni",
                    "severity": "BLOCKER",
                }
            )

    # Test point validation
    if not request.test_points:
        issues.append(
            {
                "code": "protection.test_point_missing_current",
                "message_pl": "Brak punktów testowych prądu",
                "severity": "BLOCKER",
                "fix_action": {
                    "action_type": "ADD_MISSING_DEVICE",
                    "description_pl": "Dodaj punkt testowy prądu",
                },
            }
        )

    for tp in request.test_points:
        if tp.i_a_primary <= 0:
            issues.append(
                {
                    "code": "protection.test_point_missing_current",
                    "point_id": tp.point_id,
                    "message_pl": f"Punkt testowy {tp.point_id}: prąd musi być dodatni",
                    "severity": "BLOCKER",
                }
            )

    valid = len([i for i in issues if i.get("severity") == "BLOCKER"]) == 0

    return {
        "valid": valid,
        "issues": issues,
        "issue_count": len(issues),
    }


# =============================================================================
# DTO CONVERTERS
# =============================================================================


def _dto_to_relay(dto: RelayDTO) -> RelayV1:
    """Convert API DTO to domain RelayV1."""
    curve_type = IECCurveTypeV1(dto.f51.curve_type)

    f51 = Function51Settings(
        curve_type=curve_type,
        pickup_a_secondary=dto.f51.pickup_a_secondary,
        tms=dto.f51.tms,
        max_time_s=dto.f51.max_time_s,
    )

    f50: Function50Settings | None = None
    if dto.f50 is not None:
        f50 = Function50Settings(
            enabled=dto.f50.enabled,
            pickup_a_secondary=dto.f50.pickup_a_secondary,
            t_trip_s=dto.f50.t_trip_s,
        )

    return RelayV1(
        relay_id=dto.relay_id,
        attached_cb_id=dto.attached_cb_id,
        ct_ratio=CTRatio(
            primary_a=dto.ct_ratio.primary_a,
            secondary_a=dto.ct_ratio.secondary_a,
        ),
        f51=f51,
        f50=f50,
    )


def _dto_to_test_point(dto: TestPointDTO) -> TestPoint:
    """Convert API DTO to domain TestPoint."""
    return TestPoint(
        point_id=dto.point_id,
        i_a_primary=dto.i_a_primary,
    )
