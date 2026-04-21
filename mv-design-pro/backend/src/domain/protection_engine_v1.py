"""
Protection Engine v1 Domain Models — PR-26

Relay-at-CB model with explicit test points.
ANSI 50 (I>>), 51 (I>) with IEC IDMT curves.

INVARIANTS:
- Frozen dataclasses (immutable)
- No heuristics, no auto-defaults
- Deterministic: same inputs → same outputs
- WHITE BOX: all calculation steps exposed
- CT ratio as explicit parameter (no guessing)
- Test points as explicit input (no SC mapping heuristics)
"""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

# =============================================================================
# ENUMS
# =============================================================================


class IECCurveTypeV1(str, Enum):
    """IEC 60255-151 IDMT curve types for Protection Engine v1."""

    STANDARD_INVERSE = "IEC_STANDARD_INVERSE"
    VERY_INVERSE = "IEC_VERY_INVERSE"
    EXTREMELY_INVERSE = "IEC_EXTREMELY_INVERSE"


class ProtectionFunctionType(str, Enum):
    """ANSI protection function types supported in v1."""

    F50 = "50"  # Instantaneous overcurrent (I>>)
    F51 = "51"  # Time overcurrent IDMT (I>)


# =============================================================================
# IEC CURVE PARAMETERS (CANONICAL — IEC 60255-151:2009)
# =============================================================================

# Formula: t = TMS * A / (M^B - 1)
# where M = I / I_pickup

IEC_CURVE_PARAMS: dict[IECCurveTypeV1, tuple[float, float]] = {
    IECCurveTypeV1.STANDARD_INVERSE: (0.14, 0.02),
    IECCurveTypeV1.VERY_INVERSE: (13.5, 1.0),
    IECCurveTypeV1.EXTREMELY_INVERSE: (80.0, 2.0),
}

IEC_CURVE_LABELS_PL: dict[IECCurveTypeV1, str] = {
    IECCurveTypeV1.STANDARD_INVERSE: "Normalna odwrotna (SI)",
    IECCurveTypeV1.VERY_INVERSE: "Bardzo odwrotna (VI)",
    IECCurveTypeV1.EXTREMELY_INVERSE: "Ekstremalnie odwrotna (EI)",
}


# =============================================================================
# CT RATIO
# =============================================================================


@dataclass(frozen=True)
class CTRatio:
    """Current transformer ratio.

    Attributes:
        primary_a: Primary current [A]
        secondary_a: Secondary current [A] (typically 1 or 5)
    """

    primary_a: float
    secondary_a: float

    def to_primary(self, i_secondary: float) -> float:
        """Convert secondary current to primary side."""
        if self.secondary_a <= 0:
            raise ValueError("CT secondary must be positive")
        return i_secondary * (self.primary_a / self.secondary_a)

    def to_secondary(self, i_primary: float) -> float:
        """Convert primary current to secondary side."""
        if self.primary_a <= 0:
            raise ValueError("CT primary must be positive")
        return i_primary * (self.secondary_a / self.primary_a)

    @property
    def ratio(self) -> float:
        """CT ratio (primary / secondary)."""
        if self.secondary_a <= 0:
            raise ValueError("CT secondary must be positive")
        return self.primary_a / self.secondary_a

    def to_dict(self) -> dict[str, Any]:
        return {"primary_a": self.primary_a, "secondary_a": self.secondary_a}

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> CTRatio:
        return cls(
            primary_a=float(data["primary_a"]),
            secondary_a=float(data["secondary_a"]),
        )


# =============================================================================
# FUNCTION 50 (INSTANTANEOUS)
# =============================================================================


@dataclass(frozen=True)
class Function50Settings:
    """ANSI 50 — Instantaneous overcurrent (I>>).

    Attributes:
        enabled: Whether function 50 is active
        pickup_a_secondary: Pickup current on CT secondary side [A]
        t_trip_s: Trip time [s] (if set; instantaneous if None)
    """

    enabled: bool
    pickup_a_secondary: float
    t_trip_s: float | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "enabled": self.enabled,
            "pickup_a_secondary": self.pickup_a_secondary,
            "t_trip_s": self.t_trip_s,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Function50Settings:
        return cls(
            enabled=bool(data["enabled"]),
            pickup_a_secondary=float(data["pickup_a_secondary"]),
            t_trip_s=float(data["t_trip_s"]) if data.get("t_trip_s") is not None else None,
        )


# =============================================================================
# FUNCTION 51 (TIME OVERCURRENT IDMT)
# =============================================================================


@dataclass(frozen=True)
class Function51Settings:
    """ANSI 51 — Time overcurrent with IEC IDMT curve (I>).

    Attributes:
        curve_type: IEC curve type (SI, VI, EI)
        pickup_a_secondary: Pickup current on CT secondary side [A]
        tms: Time Multiplier Setting
        max_time_s: Maximum trip time clamp [s] (None = no clamp)
    """

    curve_type: IECCurveTypeV1
    pickup_a_secondary: float
    tms: float
    max_time_s: float | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "curve_type": self.curve_type.value,
            "pickup_a_secondary": self.pickup_a_secondary,
            "tms": self.tms,
            "max_time_s": self.max_time_s,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Function51Settings:
        return cls(
            curve_type=IECCurveTypeV1(data["curve_type"]),
            pickup_a_secondary=float(data["pickup_a_secondary"]),
            tms=float(data["tms"]),
            max_time_s=float(data["max_time_s"]) if data.get("max_time_s") is not None else None,
        )


# =============================================================================
# RELAY (PROTECTION DEVICE)
# =============================================================================


@dataclass(frozen=True)
class RelayV1:
    """Protection relay attached to a circuit breaker.

    Attributes:
        relay_id: Stable unique identifier
        attached_cb_id: ID of the circuit breaker this relay is attached to
        ct_ratio: Current transformer ratio
        f51: Function 51 settings (required in v1)
        f50: Function 50 settings (optional)
    """

    relay_id: str
    attached_cb_id: str
    ct_ratio: CTRatio
    f51: Function51Settings
    f50: Function50Settings | None = None

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "relay_id": self.relay_id,
            "attached_cb_id": self.attached_cb_id,
            "ct_ratio": self.ct_ratio.to_dict(),
            "f51": self.f51.to_dict(),
        }
        if self.f50 is not None:
            result["f50"] = self.f50.to_dict()
        return result

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> RelayV1:
        return cls(
            relay_id=str(data["relay_id"]),
            attached_cb_id=str(data["attached_cb_id"]),
            ct_ratio=CTRatio.from_dict(data["ct_ratio"]),
            f51=Function51Settings.from_dict(data["f51"]),
            f50=Function50Settings.from_dict(data["f50"]) if data.get("f50") else None,
        )


# =============================================================================
# TEST POINT (CURRENT INPUT)
# =============================================================================


@dataclass(frozen=True)
class TestPoint:
    """Explicit test point — current to evaluate relay against.

    Attributes:
        point_id: Stable identifier / label
        i_a_primary: Test current on primary side [A]
    """

    __test__ = False  # Prevent pytest from collecting this as a test class

    point_id: str
    i_a_primary: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "point_id": self.point_id,
            "i_a_primary": self.i_a_primary,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> TestPoint:
        return cls(
            point_id=str(data["point_id"]),
            i_a_primary=float(data["i_a_primary"]),
        )


# =============================================================================
# PROTECTION STUDY INPUT
# =============================================================================


@dataclass(frozen=True)
class ProtectionStudyInputV1:
    """Complete input for Protection Engine v1 execution.

    Attributes:
        relays: Tuple of relay configurations
        test_points: Tuple of test currents to evaluate
    """

    relays: tuple[RelayV1, ...]
    test_points: tuple[TestPoint, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "relays": [r.to_dict() for r in self.relays],
            "test_points": [tp.to_dict() for tp in self.test_points],
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ProtectionStudyInputV1:
        return cls(
            relays=tuple(RelayV1.from_dict(r) for r in data.get("relays", [])),
            test_points=tuple(TestPoint.from_dict(tp) for tp in data.get("test_points", [])),
        )

    def canonical_hash(self) -> str:
        """Compute deterministic SHA-256 hash of input."""
        payload = json.dumps(self.to_dict(), sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()


# =============================================================================
# FUNCTION RESULTS
# =============================================================================


@dataclass(frozen=True)
class Function50Result:
    """Result of function 50 evaluation for a test point."""

    picked_up: bool
    t_trip_s: float | None = None

    def to_dict(self) -> dict[str, Any]:
        return {"picked_up": self.picked_up, "t_trip_s": self.t_trip_s}

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Function50Result:
        return cls(
            picked_up=bool(data["picked_up"]),
            t_trip_s=float(data["t_trip_s"]) if data.get("t_trip_s") is not None else None,
        )


@dataclass(frozen=True)
class Function51Result:
    """Result of function 51 evaluation for a test point."""

    t_trip_s: float
    curve_type: str
    pickup_a_secondary: float
    tms: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "t_trip_s": self.t_trip_s,
            "curve_type": self.curve_type,
            "pickup_a_secondary": self.pickup_a_secondary,
            "tms": self.tms,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Function51Result:
        return cls(
            t_trip_s=float(data["t_trip_s"]),
            curve_type=str(data["curve_type"]),
            pickup_a_secondary=float(data["pickup_a_secondary"]),
            tms=float(data["tms"]),
        )


@dataclass(frozen=True)
class TestPointFunctionResults:
    """All function results for a single test point."""

    __test__ = False  # Prevent pytest from collecting this as a test class

    f50: Function50Result | None = None
    f51: Function51Result | None = None

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {}
        if self.f50 is not None:
            result["50"] = self.f50.to_dict()
        if self.f51 is not None:
            result["51"] = self.f51.to_dict()
        return result

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> TestPointFunctionResults:
        return cls(
            f50=Function50Result.from_dict(data["50"]) if "50" in data else None,
            f51=Function51Result.from_dict(data["51"]) if "51" in data else None,
        )


# =============================================================================
# TEST POINT RESULT
# =============================================================================


@dataclass(frozen=True)
class TestPointResult:
    """Result for a single test point against a relay."""

    __test__ = False  # Prevent pytest from collecting this as a test class

    point_id: str
    i_a_secondary: float
    function_results: TestPointFunctionResults
    trace: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "point_id": self.point_id,
            "i_a_secondary": self.i_a_secondary,
            "function_results": self.function_results.to_dict(),
            "trace": self.trace,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> TestPointResult:
        return cls(
            point_id=str(data["point_id"]),
            i_a_secondary=float(data["i_a_secondary"]),
            function_results=TestPointFunctionResults.from_dict(data["function_results"]),
            trace=data.get("trace", {}),
        )


# =============================================================================
# RELAY RESULT
# =============================================================================


@dataclass(frozen=True)
class RelayResultV1:
    """Complete result for one relay across all test points."""

    relay_id: str
    attached_cb_id: str
    per_test_point: tuple[TestPointResult, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "relay_id": self.relay_id,
            "attached_cb_id": self.attached_cb_id,
            "per_test_point": [tp.to_dict() for tp in self.per_test_point],
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> RelayResultV1:
        return cls(
            relay_id=str(data["relay_id"]),
            attached_cb_id=str(data["attached_cb_id"]),
            per_test_point=tuple(
                TestPointResult.from_dict(tp) for tp in data.get("per_test_point", [])
            ),
        )


# =============================================================================
# PROTECTION RESULT SET V1
# =============================================================================


@dataclass(frozen=True)
class ProtectionResultSetV1:
    """Protection Engine v1 result set.

    INVARIANTS:
    - analysis_type = "PROTECTION"
    - relay_results sorted by relay_id lexicographically
    - per_test_point sorted by point_id lexicographically
    - Deterministic signature = SHA-256 of canonical JSON
    """

    analysis_type: str = "PROTECTION"
    relay_results: tuple[RelayResultV1, ...] = field(default_factory=tuple)
    deterministic_signature: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "analysis_type": self.analysis_type,
            "relay_results": [rr.to_dict() for rr in self.relay_results],
            "deterministic_signature": self.deterministic_signature,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ProtectionResultSetV1:
        return cls(
            analysis_type=str(data.get("analysis_type", "PROTECTION")),
            relay_results=tuple(
                RelayResultV1.from_dict(rr) for rr in data.get("relay_results", [])
            ),
            deterministic_signature=str(data.get("deterministic_signature", "")),
        )


# =============================================================================
# PURE FUNCTIONS — IEC CURVE TIME CALCULATION
# =============================================================================


def iec_curve_time_seconds(
    *,
    i_a_secondary: float,
    pickup_a_secondary: float,
    tms: float,
    curve_type: IECCurveTypeV1,
    max_time_s: float | None = None,
) -> tuple[float | None, dict[str, Any]]:
    """Compute IEC IDMT trip time — pure function.

    Formula: t = TMS * A / (M^B - 1)
    where M = I / I_pickup

    Args:
        i_a_secondary: Measured/test current on secondary side [A]
        pickup_a_secondary: Pickup setting on secondary side [A]
        tms: Time Multiplier Setting
        curve_type: IEC curve type
        max_time_s: Optional time clamp [s]

    Returns:
        Tuple of (trip_time_s or None if no trip, white-box trace dict)
    """
    if pickup_a_secondary <= 0:
        return None, {
            "error": "pickup_a_secondary <= 0",
            "pickup_a_secondary": pickup_a_secondary,
        }

    A, B = IEC_CURVE_PARAMS[curve_type]
    M = i_a_secondary / pickup_a_secondary

    trace: dict[str, Any] = {
        "formula": "t = TMS * A / (M^B - 1)",
        "standard": "IEC 60255-151:2009",
        "curve_type": curve_type.value,
        "curve_label_pl": IEC_CURVE_LABELS_PL[curve_type],
        "A": A,
        "B": B,
        "TMS": tms,
        "I_secondary": round(i_a_secondary, 6),
        "I_pickup_secondary": round(pickup_a_secondary, 6),
        "M": round(M, 6),
    }

    if M <= 1.0:
        trace["result"] = "NO_TRIP"
        trace["reason_pl"] = (
            f"Prąd ({i_a_secondary:.3f} A) nie przekracza nastawy "
            f"rozruchowej ({pickup_a_secondary:.3f} A)"
        )
        return None, trace

    m_power_b = math.pow(M, B)
    denominator = m_power_b - 1.0

    if denominator <= 1e-12:
        denominator = 1e-12

    base_time = A / denominator
    trip_time = tms * base_time

    trace["M_power_B"] = round(m_power_b, 10)
    trace["denominator"] = round(denominator, 10)
    trace["base_time_s"] = round(base_time, 6)
    trace["trip_time_before_clamp_s"] = round(trip_time, 6)

    if max_time_s is not None and trip_time > max_time_s:
        trace["clamped"] = True
        trace["max_time_s"] = max_time_s
        trip_time = max_time_s

    trip_time = round(trip_time, 6)
    trace["trip_time_s"] = trip_time
    trace["result"] = "TRIP"

    return trip_time, trace


def function_50_evaluate(
    *,
    i_a_secondary: float,
    settings: Function50Settings,
) -> tuple[Function50Result, dict[str, Any]]:
    """Evaluate ANSI 50 (instantaneous overcurrent).

    Returns:
        Tuple of (Function50Result, white-box trace dict)
    """
    trace: dict[str, Any] = {
        "function": "50",
        "label_pl": "Zabezpieczenie zwarciowe (I>>)",
        "I_secondary": round(i_a_secondary, 6),
        "pickup_a_secondary": round(settings.pickup_a_secondary, 6),
    }

    if not settings.enabled:
        trace["result"] = "DISABLED"
        return Function50Result(picked_up=False), trace

    picked_up = i_a_secondary > settings.pickup_a_secondary
    trace["picked_up"] = picked_up

    if picked_up:
        t_trip = settings.t_trip_s
        trace["t_trip_s"] = t_trip
        trace["result"] = "TRIP"
        trace[
            "notes_pl"
        ] = f"Prąd {i_a_secondary:.3f} A > nastawa {settings.pickup_a_secondary:.3f} A"
        return Function50Result(picked_up=True, t_trip_s=t_trip), trace
    else:
        trace["result"] = "NO_TRIP"
        trace[
            "notes_pl"
        ] = f"Prąd {i_a_secondary:.3f} A <= nastawa {settings.pickup_a_secondary:.3f} A"
        return Function50Result(picked_up=False), trace


def function_51_evaluate(
    *,
    i_a_secondary: float,
    settings: Function51Settings,
) -> tuple[Function51Result | None, dict[str, Any]]:
    """Evaluate ANSI 51 (time overcurrent IDMT).

    Returns:
        Tuple of (Function51Result or None if no trip, white-box trace dict)
    """
    trip_time, trace = iec_curve_time_seconds(
        i_a_secondary=i_a_secondary,
        pickup_a_secondary=settings.pickup_a_secondary,
        tms=settings.tms,
        curve_type=settings.curve_type,
        max_time_s=settings.max_time_s,
    )
    trace["function"] = "51"
    trace["label_pl"] = "Zabezpieczenie nadprądowe czasowe (I>)"

    if trip_time is None:
        return None, trace

    result = Function51Result(
        t_trip_s=trip_time,
        curve_type=settings.curve_type.value,
        pickup_a_secondary=settings.pickup_a_secondary,
        tms=settings.tms,
    )
    return result, trace


# =============================================================================
# PROTECTION ENGINE V1 — ORCHESTRATOR
# =============================================================================


def execute_protection_v1(
    study_input: ProtectionStudyInputV1,
) -> ProtectionResultSetV1:
    """Execute Protection Engine v1 — deterministic, pure.

    Evaluates each relay against each test point.
    Results are sorted deterministically.

    Args:
        study_input: Complete input with relays and test points

    Returns:
        ProtectionResultSetV1 with deterministic signature
    """
    relay_results: list[RelayResultV1] = []

    # Sort relays and test points for determinism
    sorted_relays = sorted(study_input.relays, key=lambda r: r.relay_id)
    sorted_test_points = sorted(study_input.test_points, key=lambda tp: tp.point_id)

    for relay in sorted_relays:
        test_point_results: list[TestPointResult] = []

        for tp in sorted_test_points:
            # Convert primary current to secondary via CT
            i_secondary = relay.ct_ratio.to_secondary(tp.i_a_primary)

            # Evaluate function 51 (required)
            f51_result, f51_trace = function_51_evaluate(
                i_a_secondary=i_secondary,
                settings=relay.f51,
            )

            # Evaluate function 50 (optional)
            f50_result: Function50Result | None = None
            f50_trace: dict[str, Any] = {}
            if relay.f50 is not None:
                f50_result, f50_trace = function_50_evaluate(
                    i_a_secondary=i_secondary,
                    settings=relay.f50,
                )

            # Build trace
            trace: dict[str, Any] = {
                "relay_id": relay.relay_id,
                "test_point_id": tp.point_id,
                "i_a_primary": round(tp.i_a_primary, 6),
                "i_a_secondary": round(i_secondary, 6),
                "ct_ratio": relay.ct_ratio.to_dict(),
            }
            trace["f51"] = f51_trace
            if f50_trace:
                trace["f50"] = f50_trace

            # Build function results
            func_results = TestPointFunctionResults(
                f50=f50_result,
                f51=f51_result,
            )

            test_point_results.append(
                TestPointResult(
                    point_id=tp.point_id,
                    i_a_secondary=round(i_secondary, 6),
                    function_results=func_results,
                    trace=trace,
                )
            )

        # Sort test point results by point_id
        sorted_tp_results = sorted(test_point_results, key=lambda t: t.point_id)

        relay_results.append(
            RelayResultV1(
                relay_id=relay.relay_id,
                attached_cb_id=relay.attached_cb_id,
                per_test_point=tuple(sorted_tp_results),
            )
        )

    # Sort relay results by relay_id
    sorted_relay_results = sorted(relay_results, key=lambda r: r.relay_id)

    # Compute deterministic signature
    sig_data = {
        "analysis_type": "PROTECTION",
        "relay_results": [rr.to_dict() for rr in sorted_relay_results],
    }
    sig_json = json.dumps(sig_data, sort_keys=True, separators=(",", ":"))
    signature = hashlib.sha256(sig_json.encode("utf-8")).hexdigest()

    return ProtectionResultSetV1(
        relay_results=tuple(sorted_relay_results),
        deterministic_signature=signature,
    )
