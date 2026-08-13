"""
Protection Coordination Analysis Models — FIX-12

Input, configuration, and result models for coordination analysis.

CANONICAL ALIGNMENT:
- Frozen dataclasses for immutability
- Deterministic serialization
- Polish labels
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any


@dataclass(frozen=True)
class FaultCurrentData:
    """
    Fault current data at a specific location.

    From Short Circuit IEC 60909 results.
    """

    location_id: str
    ik_max_3f_a: float  # Maximum 3-phase fault current [A]
    ik_min_3f_a: float  # Minimum 3-phase fault current [A]
    ik_max_2f_a: float | None = None  # Maximum 2-phase fault current [A]
    ik_min_1f_a: float | None = None  # Minimum 1-phase fault current [A]
    ip_peak_a: float | None = None  # Peak short-circuit current [A]
    ith_thermal_a: float | None = None  # Thermal equivalent current [A]

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "location_id": self.location_id,
            "ik_max_3f_a": self.ik_max_3f_a,
            "ik_min_3f_a": self.ik_min_3f_a,
            "ik_max_2f_a": self.ik_max_2f_a,
            "ik_min_1f_a": self.ik_min_1f_a,
            "ip_peak_a": self.ip_peak_a,
            "ith_thermal_a": self.ith_thermal_a,
        }


@dataclass(frozen=True)
class OperatingCurrentData:
    """
    Operating current data at a specific location.

    From Power Flow results.
    """

    location_id: str
    i_operating_a: float  # Normal operating current [A]
    i_max_operating_a: float | None = None  # Maximum operating current [A]
    loading_percent: float | None = None  # Loading percentage

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "location_id": self.location_id,
            "i_operating_a": self.i_operating_a,
            "i_max_operating_a": self.i_max_operating_a,
            "loading_percent": self.loading_percent,
        }


@dataclass(frozen=True)
class CoordinationConfig:
    """
    Configuration for coordination analysis.

    Defines thresholds and margins for checks.
    """

    # Grading margin components
    breaker_time_s: float = 0.05  # Circuit breaker operating time [s]
    relay_overtravel_s: float = 0.05  # Relay overtravel (0 for digital) [s]
    safety_factor_s: float = 0.1  # Safety margin [s]

    # Sensitivity thresholds
    sensitivity_margin_pass: float = 1.5  # I_min / I_pickup >= 1.5 for PASS
    sensitivity_margin_marginal: float = 1.2  # >= 1.2 for MARGINAL

    # Overload thresholds
    overload_margin_pass: float = 1.2  # I_pickup / I_operating >= 1.2 for PASS
    overload_margin_marginal: float = 1.1  # >= 1.1 for MARGINAL

    # Selectivity factors
    cti_margin_factor: float = 1.2  # Require 20% above minimum CTI for PASS

    def get_minimum_grading_margin_s(self) -> float:
        """Calculate minimum grading margin (CTI) [s]."""
        return self.breaker_time_s + self.relay_overtravel_s + self.safety_factor_s

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "breaker_time_s": self.breaker_time_s,
            "relay_overtravel_s": self.relay_overtravel_s,
            "safety_factor_s": self.safety_factor_s,
            "sensitivity_margin_pass": self.sensitivity_margin_pass,
            "sensitivity_margin_marginal": self.sensitivity_margin_marginal,
            "overload_margin_pass": self.overload_margin_pass,
            "overload_margin_marginal": self.overload_margin_marginal,
            "cti_margin_factor": self.cti_margin_factor,
            "minimum_grading_margin_s": self.get_minimum_grading_margin_s(),
        }


@dataclass(frozen=True)
class CoordinationInput:
    """
    Complete input for coordination analysis.

    Contains devices, fault currents, and operating currents.
    """

    devices: tuple[Any, ...]  # ProtectionDevice instances
    fault_currents: tuple[FaultCurrentData, ...]
    operating_currents: tuple[OperatingCurrentData, ...]
    config: CoordinationConfig = field(default_factory=CoordinationConfig)
    # Optional metadata
    pf_run_id: str | None = None
    sc_run_id: str | None = None
    project_id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "devices": [d.to_dict() for d in self.devices],
            "fault_currents": [f.to_dict() for f in self.fault_currents],
            "operating_currents": [o.to_dict() for o in self.operating_currents],
            "config": self.config.to_dict(),
            "pf_run_id": self.pf_run_id,
            "sc_run_id": self.sc_run_id,
            "project_id": self.project_id,
        }


@dataclass(frozen=True)
class TCCPoint:
    """
    Single point on a Time-Current Characteristic curve.
    """

    current_a: float
    current_multiple: float  # I / I_pickup
    time_s: float

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "current_a": self.current_a,
            "current_multiple": self.current_multiple,
            "time_s": self.time_s,
        }


@dataclass(frozen=True)
class TCCCurve:
    """
    Complete Time-Current Characteristic curve for a device.
    """

    device_id: str
    device_name: str
    curve_type: str  # e.g., "IEC_SI", "IEEE_VI", "BRAK_CHARAKTERYSTYKI"
    pickup_current_a: float
    time_multiplier: float
    points: tuple[TCCPoint, ...]
    color: str = "#2563eb"
    #: Skad wzieta jest krzywa (karta N-D5-FUSE). `KRZYWA_PRZEKAZNIKOWA` znaczy
    #: wzor IDMT IEC 60255 / IEEE C37.112. `BRAK_PASMA_BEZPIECZNIKA` znaczy, ze
    #: to bezpiecznik topikowy, ktorego pasma (IEC 60282-1) katalog nie niesie —
    #: wtedy `points` jest PUSTE i nie wolno niczego narysowac. Pole dodane
    #: addytywnie: istniejace ladunki przekaznikowe zachowuja wartosc domyslna.
    podstawa_kod: str = "KRZYWA_PRZEKAZNIKOWA"
    #: Uczciwe zdanie po polsku, gdy `podstawa_kod` mowi o braku podstawy.
    powod_pl: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "device_id": self.device_id,
            "device_name": self.device_name,
            "curve_type": self.curve_type,
            "pickup_current_a": self.pickup_current_a,
            "time_multiplier": self.time_multiplier,
            "points": [p.to_dict() for p in self.points],
            "color": self.color,
            "podstawa_kod": self.podstawa_kod,
            "powod_pl": self.powod_pl,
        }


@dataclass(frozen=True)
class FaultMarker:
    """
    Fault current marker for TCC chart.
    """

    id: str
    label_pl: str
    current_a: float
    fault_type: str  # "3F", "2F", "1F"
    location: str

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "id": self.id,
            "label_pl": self.label_pl,
            "current_a": self.current_a,
            "fault_type": self.fault_type,
            "location": self.location,
        }


@dataclass(frozen=True)
class CoordinationAnalysisResult:
    """
    Complete coordination analysis result.

    Contains all check results, TCC data, and summary.
    """

    run_id: str
    project_id: str
    # Devices analyzed (karta ZAB-100-BACKEND: bez tego pola raport DOCX/PDF
    # zawsze pokazywal "Brak urzadzen" mimo ze urzadzenia byly badane —
    # naprawa u zrodla PRZED montazem eksportow, patrz audyt tras w karcie).
    devices: tuple[Any, ...] = field(default_factory=tuple)  # ProtectionDevice instances
    # Verdicts per device
    sensitivity_checks: tuple[Any, ...] = field(default_factory=tuple)  # SensitivityCheck
    selectivity_checks: tuple[Any, ...] = field(default_factory=tuple)  # SelectivityCheck
    overload_checks: tuple[Any, ...] = field(default_factory=tuple)  # OverloadCheck
    # TCC data for visualization
    tcc_curves: tuple[TCCCurve, ...] = field(default_factory=tuple)
    fault_markers: tuple[FaultMarker, ...] = field(default_factory=tuple)
    # Overall
    overall_verdict: str = "ERROR"  # PASS/MARGINAL/FAIL/ERROR
    summary: dict[str, Any] = field(default_factory=dict)
    # Trace for white-box audit
    trace_steps: tuple[dict[str, Any], ...] = field(default_factory=tuple)
    # Metadata
    pf_run_id: str | None = None
    sc_run_id: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "run_id": self.run_id,
            "project_id": self.project_id,
            "devices": [d.to_dict() for d in self.devices],
            "sensitivity_checks": [c.to_dict() for c in self.sensitivity_checks],
            "selectivity_checks": [c.to_dict() for c in self.selectivity_checks],
            "overload_checks": [c.to_dict() for c in self.overload_checks],
            "tcc_curves": [c.to_dict() for c in self.tcc_curves],
            "fault_markers": [m.to_dict() for m in self.fault_markers],
            "overall_verdict": self.overall_verdict,
            "summary": self.summary,
            "trace_steps": list(self.trace_steps),
            "pf_run_id": self.pf_run_id,
            "sc_run_id": self.sc_run_id,
            "created_at": self.created_at.isoformat(),
        }
