"""
Result State and Comparison Domain Models — P10b

CANONICAL ALIGNMENT:
- P10b FULL MAX: Result State + Case A/B Comparison (BACKEND ONLY)
- RunResultState = canonical states for Run results (NONE/FRESH/OUTDATED)
- Comparison DTOs = read-only, no physics, no mutations

RESULT STATE LIFECYCLE (for Run):
- NONE: No results computed for this Run
- FRESH: Results are current (computed on bound snapshot)
- OUTDATED: Snapshot changed since computation

COMPARISON RULES (BINDING):
- Read-only: Zero physics, zero mutations
- Same Project: Both runs must belong to same project
- Data from Result API: Use stored result payloads only
- Deterministic: Same inputs -> identical comparison output
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum
from typing import Any, Literal
from uuid import UUID


class RunResultState(str, Enum):
    """
    Result state for a Study Run (industrial-grade).

    P10b: Canonical states aligned with StudyCaseResultStatus.
    """

    NONE = "NONE"  # No results computed
    FRESH = "FRESH"  # Results are current (valid)
    OUTDATED = "OUTDATED"  # Results need recomputation


RunResultStateLiteral = Literal["NONE", "FRESH", "OUTDATED"]


# -----------------------------------------------------------------------------
# Comparison DTOs — P10b
# -----------------------------------------------------------------------------


@dataclass(frozen=True)
class NumericDelta:
    """
    Numeric difference between two values.

    CANONICAL FIELDS:
    - value_a: Value from Run A
    - value_b: Value from Run B
    - delta: Absolute difference (B - A)
    - percent: Relative difference in percent ((B - A) / A * 100)
    - sign: Direction of change (-1, 0, +1)

    INVARIANT: No physics interpretation, just numbers.
    """

    value_a: float
    value_b: float
    delta: float
    percent: float | None  # None if value_a == 0
    sign: int  # -1, 0, +1

    @classmethod
    def compute(cls, a: float, b: float, tolerance: float = 1e-9) -> NumericDelta:
        """Compute delta between two values."""
        delta = b - a
        if abs(a) < tolerance:
            percent = None
        else:
            percent = (delta / a) * 100.0

        if abs(delta) < tolerance:
            sign = 0
        elif delta > 0:
            sign = 1
        else:
            sign = -1

        return cls(
            value_a=a,
            value_b=b,
            delta=delta,
            percent=percent,
            sign=sign,
        )

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "value_a": self.value_a,
            "value_b": self.value_b,
            "delta": self.delta,
            "percent": self.percent,
            "sign": self.sign,
        }


@dataclass(frozen=True)
class ComplexDelta:
    """
    Complex number difference (for impedances).

    CANONICAL FIELDS:
    - re_a, im_a: Real and imaginary parts from Run A
    - re_b, im_b: Real and imaginary parts from Run B
    - delta_re, delta_im: Component-wise differences
    - magnitude_a, magnitude_b: Absolute values
    - delta_magnitude: Magnitude difference
    - percent_magnitude: Relative magnitude change

    INVARIANT: No physics interpretation, just numbers.
    """

    re_a: float
    im_a: float
    re_b: float
    im_b: float
    delta_re: float
    delta_im: float
    magnitude_a: float
    magnitude_b: float
    delta_magnitude: float
    percent_magnitude: float | None

    @classmethod
    def compute(cls, a: complex, b: complex, tolerance: float = 1e-9) -> ComplexDelta:
        """Compute delta between two complex values."""
        mag_a = abs(a)
        mag_b = abs(b)
        delta_mag = mag_b - mag_a

        if abs(mag_a) < tolerance:
            percent_mag = None
        else:
            percent_mag = (delta_mag / mag_a) * 100.0

        return cls(
            re_a=a.real,
            im_a=a.imag,
            re_b=b.real,
            im_b=b.imag,
            delta_re=b.real - a.real,
            delta_im=b.imag - a.imag,
            magnitude_a=mag_a,
            magnitude_b=mag_b,
            delta_magnitude=delta_mag,
            percent_magnitude=percent_mag,
        )

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "re_a": self.re_a,
            "im_a": self.im_a,
            "re_b": self.re_b,
            "im_b": self.im_b,
            "delta_re": self.delta_re,
            "delta_im": self.delta_im,
            "magnitude_a": self.magnitude_a,
            "magnitude_b": self.magnitude_b,
            "delta_magnitude": self.delta_magnitude,
            "percent_magnitude": self.percent_magnitude,
        }


@dataclass(frozen=True)
class ShortCircuitComparison:
    """
    Short Circuit result comparison (IEC 60909).

    P10b: Compares Ik'', Sk'', Zth between two runs.

    CANONICAL FIELDS:
    - ikss_delta: Initial short-circuit current Ik'' [A]
    - sk_delta: Short-circuit power Sk'' [MVA]
    - zth_delta: Thevenin impedance Zth [Ohm] (complex; delta_re/delta_im/
      delta_magnitude niosą delty Rk/Xk/|Zk| pełnego bilansu)
    - ip_delta: Peak current Ip [A]
    - ith_delta: Thermal equivalent current Ith [A]

    ADDITIVE FIELDS (karta S-C, 2026-07-22 — pełny bilans IEC 60909):
    - xr_ratio_delta: X/R ratio [—] (None dla starszych wyników bez rx_ratio)
    - i2t_delta: Thermal energy I²t [kA²s] (None bez ith_a+tk_s)

    INVARIANT: No normative interpretation, no limits/thresholds.
    """

    ikss_delta: NumericDelta  # Ik'' [A]
    sk_delta: NumericDelta  # Sk'' [MVA]
    zth_delta: ComplexDelta  # Zth [Ohm]
    ip_delta: NumericDelta  # Ip [A]
    ith_delta: NumericDelta  # Ith [A]
    xr_ratio_delta: NumericDelta | None = None  # X/R [—] (addytywne)
    i2t_delta: NumericDelta | None = None  # I²t [kA²s] (addytywne)

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "ikss_delta": self.ikss_delta.to_dict(),
            "sk_delta": self.sk_delta.to_dict(),
            "zth_delta": self.zth_delta.to_dict(),
            "ip_delta": self.ip_delta.to_dict(),
            "ith_delta": self.ith_delta.to_dict(),
            "xr_ratio_delta": (
                self.xr_ratio_delta.to_dict() if self.xr_ratio_delta is not None else None
            ),
            "i2t_delta": self.i2t_delta.to_dict() if self.i2t_delta is not None else None,
        }


@dataclass(frozen=True)
class BusVoltageComparison:
    """
    Bus voltage comparison for Power Flow.

    CANONICAL FIELDS:
    - bus_id: Bus identifier
    - u_kv_delta: Voltage magnitude [kV]
    - u_pu_delta: Voltage in per-unit
    """

    bus_id: str
    u_kv_delta: NumericDelta
    u_pu_delta: NumericDelta

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "bus_id": self.bus_id,
            "node_id": self.bus_id,  # backward-compatible alias
            "u_kv_delta": self.u_kv_delta.to_dict(),
            "u_pu_delta": self.u_pu_delta.to_dict(),
        }


# Backward-compatible alias
NodeVoltageComparison = BusVoltageComparison


@dataclass(frozen=True)
class BranchPowerComparison:
    """
    Branch power comparison for Power Flow.

    CANONICAL FIELDS:
    - branch_id: Branch identifier
    - p_mw_delta: Active power [MW]
    - q_mvar_delta: Reactive power [Mvar]
    """

    branch_id: str
    p_mw_delta: NumericDelta
    q_mvar_delta: NumericDelta

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "branch_id": self.branch_id,
            "p_mw_delta": self.p_mw_delta.to_dict(),
            "q_mvar_delta": self.q_mvar_delta.to_dict(),
        }


@dataclass(frozen=True)
class PowerFlowComparison:
    """
    Power Flow result comparison.

    P10b: Compares delta_U, P, Q between two runs.

    CANONICAL FIELDS:
    - total_losses_p_delta: Total active losses [pu]
    - total_losses_q_delta: Total reactive losses [pu]
    - slack_p_delta: Slack node active power [pu]
    - slack_q_delta: Slack node reactive power [pu]
    - node_voltages: Per-bus voltage comparisons
    - branch_powers: Per-branch power comparisons (from side)

    INVARIANT: No normative interpretation, no limits/thresholds.
    """

    total_losses_p_delta: NumericDelta
    total_losses_q_delta: NumericDelta
    slack_p_delta: NumericDelta
    slack_q_delta: NumericDelta
    node_voltages: tuple[BusVoltageComparison, ...]
    branch_powers: tuple[BranchPowerComparison, ...]

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "total_losses_p_delta": self.total_losses_p_delta.to_dict(),
            "total_losses_q_delta": self.total_losses_q_delta.to_dict(),
            "slack_p_delta": self.slack_p_delta.to_dict(),
            "slack_q_delta": self.slack_q_delta.to_dict(),
            "bus_voltages": [nv.to_dict() for nv in self.node_voltages],
            "node_voltages": [nv.to_dict() for nv in self.node_voltages],  # backward-compat
            "branch_powers": [bp.to_dict() for bp in self.branch_powers],
        }


@dataclass(frozen=True)
class ProtectionEvaluationComparison:
    """
    Protection evaluation comparison for a single device/element.

    P15c: Compares trip state, trip time, margin between two runs.

    CANONICAL FIELDS:
    - element_id: Protected element identifier
    - trip_state_a: Trip state from Run A (TRIPS/NO_TRIP/INVALID)
    - trip_state_b: Trip state from Run B (TRIPS/NO_TRIP/INVALID)
    - state_change: State change description (PL)
    - t_trip_delta: Trip time delta (if both TRIPS)
    - margin_delta: Margin delta (if available)

    INVARIANT: No normative interpretation, just state/value comparison.
    """

    element_id: str
    trip_state_a: str
    trip_state_b: str
    state_change: str  # e.g., "TRIPS→NO_TRIP", "NO_TRIP→TRIPS", "BRAK ZMIANY"
    t_trip_delta: NumericDelta | None = None
    margin_delta: NumericDelta | None = None

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        result: dict[str, Any] = {
            "element_id": self.element_id,
            "trip_state_a": self.trip_state_a,
            "trip_state_b": self.trip_state_b,
            "state_change": self.state_change,
        }
        if self.t_trip_delta is not None:
            result["t_trip_delta"] = self.t_trip_delta.to_dict()
        if self.margin_delta is not None:
            result["margin_delta"] = self.margin_delta.to_dict()
        return result


@dataclass(frozen=True)
class ProtectionComparison:
    """
    Protection analysis result comparison.

    P15c: Compares protection evaluations between two runs.

    CANONICAL FIELDS:
    - evaluations: Per-element comparison (deterministically sorted)
    - trip_count_delta: Change in number of trips
    - no_trip_count_delta: Change in number of no-trips
    - invalid_count_delta: Change in number of invalid evaluations

    INVARIANT: No normative interpretation, no limits/thresholds.
    """

    evaluations: tuple[ProtectionEvaluationComparison, ...]
    trip_count_delta: NumericDelta
    no_trip_count_delta: NumericDelta
    invalid_count_delta: NumericDelta

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "evaluations": [ev.to_dict() for ev in self.evaluations],
            "trip_count_delta": self.trip_count_delta.to_dict(),
            "no_trip_count_delta": self.no_trip_count_delta.to_dict(),
            "invalid_count_delta": self.invalid_count_delta.to_dict(),
        }


@dataclass(frozen=True)
class RunComparisonResult:
    """
    Full comparison result between two Study Runs.

    P10b/P15c: Top-level comparison DTO combining all analysis types.

    CANONICAL FIELDS:
    - run_a_id: UUID of first Run
    - run_b_id: UUID of second Run
    - project_id: UUID of common Project (validated same)
    - analysis_type: Type of analysis compared
    - compared_at: Timestamp of comparison
    - short_circuit: SC comparison (if applicable)
    - power_flow: PF comparison (if applicable)
    - protection: Protection comparison (if applicable)

    INVARIANT: 100% read-only, no mutations, no physics.
    """

    run_a_id: UUID
    run_b_id: UUID
    project_id: UUID
    analysis_type: str
    compared_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    short_circuit: ShortCircuitComparison | None = None
    power_flow: PowerFlowComparison | None = None
    protection: ProtectionComparison | None = None

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary for API responses."""
        result: dict[str, Any] = {
            "run_a_id": str(self.run_a_id),
            "run_b_id": str(self.run_b_id),
            "project_id": str(self.project_id),
            "analysis_type": self.analysis_type,
            "compared_at": self.compared_at.isoformat(),
        }
        if self.short_circuit is not None:
            result["short_circuit"] = self.short_circuit.to_dict()
        if self.power_flow is not None:
            result["power_flow"] = self.power_flow.to_dict()
        if self.protection is not None:
            result["protection"] = self.protection.to_dict()
        return result


class ComparisonError(Exception):
    """Base exception for comparison errors."""

    pass


class ProjectMismatchError(ComparisonError):
    """Raised when runs belong to different projects."""

    def __init__(self, run_a_project: UUID, run_b_project: UUID):
        self.run_a_project = run_a_project
        self.run_b_project = run_b_project
        super().__init__(f"Runs belong to different projects: {run_a_project} vs {run_b_project}")


class AnalysisTypeMismatchError(ComparisonError):
    """Raised when runs have different analysis types."""

    def __init__(self, type_a: str, type_b: str):
        self.type_a = type_a
        self.type_b = type_b
        super().__init__(f"Runs have different analysis types: {type_a} vs {type_b}")


class RunNotFoundError(ComparisonError):
    """Raised when a run is not found."""

    def __init__(self, run_id: UUID):
        self.run_id = run_id
        super().__init__(f"Run not found: {run_id}")


class ResultNotFoundError(ComparisonError):
    """Raised when results are not found for a run."""

    def __init__(self, run_id: UUID, result_type: str):
        self.run_id = run_id
        self.result_type = result_type
        super().__init__(f"Results of type {result_type} not found for run: {run_id}")
