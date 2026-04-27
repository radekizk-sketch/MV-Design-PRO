"""
Protection Device Domain Model

CANONICAL ALIGNMENT:
- SYSTEM_SPEC.md: Domain layer model
- ARCHITECTURE.md: Domain entities

DOMAIN LAYER RULES:
    Protection device represents physical protection apparatus.
    This module contains DATA MODELS only, not calculations.
    Settings are stored per device, not in NetworkModel.

NOT-A-SOLVER (BINDING):
    This module does NOT contain any physics calculations.
    It defines data structures for protection devices and settings.
    All coordination calculations happen in the Analysis layer
    (application.analyses.protection.coordination).

INVARIANTS:
- Frozen/immutable data structures (dataclass frozen=True)
- Full Polish validation messages
- Deterministic serialization (to_dict / from_dict)
- No randomness in data structures
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

# =============================================================================
# ENUMS
# =============================================================================


class ProtectionDeviceType(str, Enum):
    """Type of protection device."""

    RELAY = "RELAY"  # Przekaźnik nadprądowy
    FUSE = "FUSE"  # Bezpiecznik
    RECLOSER = "RECLOSER"  # Wyłącznik samoczynny
    CIRCUIT_BREAKER = "CIRCUIT_BREAKER"  # Wyłącznik z wyzwalaczem nadprądowym


class CurveStandard(str, Enum):
    """Protection curve standard."""

    IEC = "IEC"  # IEC 60255
    IEEE = "IEEE"  # IEEE C37.112
    FUSE = "FUSE"  # Charakterystyka bezpiecznikowa


class IECCurveVariant(str, Enum):
    """IEC 60255 curve variants."""

    SI = "SI"  # Standard Inverse (Normalna odwrotna)
    VI = "VI"  # Very Inverse (Bardzo odwrotna)
    EI = "EI"  # Extremely Inverse (Ekstremalnie odwrotna)
    LTI = "LTI"  # Long Time Inverse (Długoczasowa odwrotna)
    DT = "DT"  # Definite Time (Czas niezależny)


class CoordinationVerdict(str, Enum):
    """Coordination analysis verdict."""

    PASS = "PASS"  # Koordynacja prawidłowa
    MARGINAL = "MARGINAL"  # Margines niski (ale akceptowalny)
    FAIL = "FAIL"  # Brak koordynacji
    ERROR = "ERROR"  # Błąd analizy (brak danych)


# Polish labels
DEVICE_TYPE_LABELS_PL: dict[str, str] = {
    "RELAY": "Przekaźnik nadprądowy",
    "FUSE": "Bezpiecznik",
    "RECLOSER": "Wyłącznik samoczynny",
    "CIRCUIT_BREAKER": "Wyłącznik z wyzwalaczem",
}

CURVE_VARIANT_LABELS_PL: dict[str, str] = {
    "SI": "Normalna odwrotna (SI)",
    "VI": "Bardzo odwrotna (VI)",
    "EI": "Ekstremalnie odwrotna (EI)",
    "LTI": "Długoczasowa odwrotna (LTI)",
    "DT": "Czas niezależny (DT)",
}

VERDICT_LABELS_PL: dict[str, str] = {
    "PASS": "Prawidłowa",
    "MARGINAL": "Margines niski",
    "FAIL": "Nieskoordynowane",
    "ERROR": "Błąd analizy",
}


# =============================================================================
# PROTECTION CURVE SETTINGS
# =============================================================================


@dataclass(frozen=True)
class ProtectionCurveSettings:
    """
    Settings for a protection curve (inverse-time or definite-time).

    Attributes:
        standard: Curve standard (IEC/IEEE/FUSE)
        variant: Curve variant code (SI/VI/EI/LTI/DT)
        pickup_current_a: Pickup current Is [A]
        time_multiplier: TMS (IEC) or TD (IEEE), range 0.05-1.5 typically
        definite_time_s: Fixed time for DT curves [s]
        reset_time_s: Reset time after fault clearance [s]
    """

    standard: CurveStandard
    variant: str
    pickup_current_a: float
    time_multiplier: float
    definite_time_s: float | None = None
    reset_time_s: float = 0.0

    def __post_init__(self) -> None:
        """Validate settings ranges."""
        if self.pickup_current_a <= 0:
            raise ValueError("Prąd rozruchowy musi być większy od zera")
        if self.time_multiplier < 0.05:
            raise ValueError("Mnożnik czasowy TMS nie może być mniejszy niż 0.05")
        if self.time_multiplier > 10.0:
            raise ValueError("Mnożnik czasowy TMS nie może być większy niż 10.0")
        if self.definite_time_s is not None and self.definite_time_s < 0:
            raise ValueError("Czas niezależny nie może być ujemny")

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "standard": self.standard.value,
            "variant": self.variant,
            "pickup_current_a": self.pickup_current_a,
            "time_multiplier": self.time_multiplier,
            "definite_time_s": self.definite_time_s,
            "reset_time_s": self.reset_time_s,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ProtectionCurveSettings:
        """Deserialize from dictionary."""
        return cls(
            standard=CurveStandard(data["standard"]),
            variant=str(data["variant"]),
            pickup_current_a=float(data["pickup_current_a"]),
            time_multiplier=float(data["time_multiplier"]),
            definite_time_s=float(data["definite_time_s"]) if data.get("definite_time_s") else None,
            reset_time_s=float(data.get("reset_time_s", 0.0)),
        )


# =============================================================================
# OVERCURRENT SETTINGS (50/51 FUNCTIONS)
# =============================================================================


@dataclass(frozen=True)
class OvercurrentStageSettings:
    """
    Settings for a single overcurrent stage (I>, I>>, I>>>).

    Attributes:
        enabled: Whether this stage is active
        pickup_current_a: Pickup current [A]
        time_s: Operating time [s] (definite time or calculated from curve)
        curve_settings: Curve settings (if inverse-time)
        directional: Whether this stage uses directional criteria
    """

    enabled: bool
    pickup_current_a: float
    time_s: float | None = None  # None if curve-based
    curve_settings: ProtectionCurveSettings | None = None
    directional: bool = False  # Kierunkowosc bez logiki mocy w tym modelu danych

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "enabled": self.enabled,
            "pickup_current_a": self.pickup_current_a,
            "time_s": self.time_s,
            "curve_settings": self.curve_settings.to_dict() if self.curve_settings else None,
            "directional": self.directional,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> OvercurrentStageSettings:
        """Deserialize from dictionary."""
        curve_data = data.get("curve_settings")
        return cls(
            enabled=bool(data.get("enabled", True)),
            pickup_current_a=float(data["pickup_current_a"]),
            time_s=float(data["time_s"]) if data.get("time_s") is not None else None,
            curve_settings=ProtectionCurveSettings.from_dict(curve_data) if curve_data else None,
            directional=bool(data.get("directional", False)),
        )


@dataclass(frozen=True)
class OvercurrentProtectionSettings:
    """
    Complete overcurrent protection settings (50/51).

    Includes phase and earth fault protection stages.

    Attributes:
        stage_51: Time-delayed overcurrent (I>)
        stage_50: Instantaneous overcurrent (I>>)
        stage_50_high: High-set instantaneous (I>>>)
        stage_51n: Earth fault time-delayed (I0>)
        stage_50n: Earth fault instantaneous (I0>>)
    """

    stage_51: OvercurrentStageSettings  # I> (czas-zależny)
    stage_50: OvercurrentStageSettings | None = None  # I>> (szybki)
    stage_50_high: OvercurrentStageSettings | None = None  # I>>> (bardzo szybki)
    stage_51n: OvercurrentStageSettings | None = None  # I0> (ziemnozwarciowy)
    stage_50n: OvercurrentStageSettings | None = None  # I0>> (ziemnozwarciowy szybki)

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "stage_51": self.stage_51.to_dict(),
            "stage_50": self.stage_50.to_dict() if self.stage_50 else None,
            "stage_50_high": self.stage_50_high.to_dict() if self.stage_50_high else None,
            "stage_51n": self.stage_51n.to_dict() if self.stage_51n else None,
            "stage_50n": self.stage_50n.to_dict() if self.stage_50n else None,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> OvercurrentProtectionSettings:
        """Deserialize from dictionary."""
        return cls(
            stage_51=OvercurrentStageSettings.from_dict(data["stage_51"]),
            stage_50=(
                OvercurrentStageSettings.from_dict(data["stage_50"])
                if data.get("stage_50")
                else None
            ),
            stage_50_high=(
                OvercurrentStageSettings.from_dict(data["stage_50_high"])
                if data.get("stage_50_high")
                else None
            ),
            stage_51n=(
                OvercurrentStageSettings.from_dict(data["stage_51n"])
                if data.get("stage_51n")
                else None
            ),
            stage_50n=(
                OvercurrentStageSettings.from_dict(data["stage_50n"])
                if data.get("stage_50n")
                else None
            ),
        )


# =============================================================================
# PROTECTION DEVICE
# =============================================================================


@dataclass(frozen=True)
class ProtectionDevice:
    """
    Protection device entity with settings.

    Represents a physical protection apparatus (relay, fuse, recloser)
    with its configuration and location in the network.

    Attributes:
        id: Unique device identifier
        name: Device name/label
        device_type: Type of device (relay/fuse/recloser)
        manufacturer: Manufacturer name (optional)
        model: Device model (optional)
        location_element_id: ID of element device is protecting (branch/bus)
        location_description: Human-readable location description
        settings: Overcurrent protection settings
        ct_ratio: CT ratio if applicable (e.g., 400/5)
        rated_current_a: Device rated current [A]
        created_at: Creation timestamp
    """

    id: UUID
    name: str
    device_type: ProtectionDeviceType
    location_element_id: str
    settings: OvercurrentProtectionSettings
    manufacturer: str | None = None
    model: str | None = None
    location_description: str | None = None
    ct_ratio: str | None = None
    rated_current_a: float | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "id": str(self.id),
            "name": self.name,
            "device_type": self.device_type.value,
            "manufacturer": self.manufacturer,
            "model": self.model,
            "location_element_id": self.location_element_id,
            "location_description": self.location_description,
            "settings": self.settings.to_dict(),
            "ct_ratio": self.ct_ratio,
            "rated_current_a": self.rated_current_a,
            "created_at": self.created_at.isoformat(),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ProtectionDevice:
        """Deserialize from dictionary."""
        return cls(
            id=UUID(data["id"]),
            name=str(data["name"]),
            device_type=ProtectionDeviceType(data["device_type"]),
            manufacturer=data.get("manufacturer"),
            model=data.get("model"),
            location_element_id=str(data["location_element_id"]),
            location_description=data.get("location_description"),
            settings=OvercurrentProtectionSettings.from_dict(data["settings"]),
            ct_ratio=data.get("ct_ratio"),
            rated_current_a=float(data["rated_current_a"]) if data.get("rated_current_a") else None,
            created_at=(
                datetime.fromisoformat(data["created_at"])
                if "created_at" in data
                else datetime.now(UTC)
            ),
        )


def new_protection_device(
    *,
    name: str,
    device_type: ProtectionDeviceType,
    location_element_id: str,
    settings: OvercurrentProtectionSettings,
    manufacturer: str | None = None,
    model: str | None = None,
    location_description: str | None = None,
    ct_ratio: str | None = None,
    rated_current_a: float | None = None,
) -> ProtectionDevice:
    """
    Factory function to create a new ProtectionDevice.

    Args:
        name: Device name/label
        device_type: Type of device
        location_element_id: ID of protected element
        settings: Overcurrent settings
        manufacturer: Manufacturer name (optional)
        model: Device model (optional)
        location_description: Human-readable location
        ct_ratio: CT ratio (optional)
        rated_current_a: Rated current (optional)

    Returns:
        New ProtectionDevice instance
    """
    return ProtectionDevice(
        id=uuid4(),
        name=name,
        device_type=device_type,
        location_element_id=location_element_id,
        settings=settings,
        manufacturer=manufacturer,
        model=model,
        location_description=location_description,
        ct_ratio=ct_ratio,
        rated_current_a=rated_current_a,
    )


# =============================================================================
# COORDINATION EVALUATION
# =============================================================================


@dataclass(frozen=True)
class SensitivityCheck:
    """
    Result of sensitivity check (czułość).

    Verifies that protection will trip for minimum fault current.

    Attributes:
        device_id: Device being checked
        i_fault_min_a: Minimum fault current at protected element [A]
        i_pickup_a: Pickup current setting [A]
        margin_percent: (I_fault_min / I_pickup - 1) * 100
        verdict: PASS if margin >= 20%, MARGINAL if 10-20%, FAIL if < 10%
        notes_pl: Polish explanation
    """

    device_id: str
    i_fault_min_a: float
    i_pickup_a: float
    margin_percent: float
    verdict: CoordinationVerdict
    notes_pl: str

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "device_id": self.device_id,
            "i_fault_min_a": self.i_fault_min_a,
            "i_pickup_a": self.i_pickup_a,
            "margin_percent": self.margin_percent,
            "verdict": self.verdict.value,
            "verdict_pl": VERDICT_LABELS_PL.get(self.verdict.value, self.verdict.value),
            "notes_pl": self.notes_pl,
        }


@dataclass(frozen=True)
class SelectivityCheck:
    """
    Result of selectivity check (selektywność czasowa).

    Verifies time margin between upstream and downstream devices.

    Attributes:
        upstream_device_id: Backup device ID
        downstream_device_id: Primary device ID
        analysis_current_a: Fault current used for analysis [A]
        t_upstream_s: Upstream device trip time [s]
        t_downstream_s: Downstream device trip time [s]
        margin_s: Time margin (t_upstream - t_downstream) [s]
        required_margin_s: Minimum required margin [s]
        verdict: PASS if margin >= required, MARGINAL if close, FAIL if not
        notes_pl: Polish explanation
    """

    upstream_device_id: str
    downstream_device_id: str
    analysis_current_a: float
    t_upstream_s: float
    t_downstream_s: float
    margin_s: float
    required_margin_s: float
    verdict: CoordinationVerdict
    notes_pl: str

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "upstream_device_id": self.upstream_device_id,
            "downstream_device_id": self.downstream_device_id,
            "analysis_current_a": self.analysis_current_a,
            "t_upstream_s": self.t_upstream_s,
            "t_downstream_s": self.t_downstream_s,
            "margin_s": self.margin_s,
            "required_margin_s": self.required_margin_s,
            "verdict": self.verdict.value,
            "verdict_pl": VERDICT_LABELS_PL.get(self.verdict.value, self.verdict.value),
            "notes_pl": self.notes_pl,
        }


@dataclass(frozen=True)
class OverloadCheck:
    """
    Result of overload check (przeciążalność).

    Verifies that protection won't trip on normal operating current.

    Attributes:
        device_id: Device being checked
        i_operating_a: Normal operating current [A]
        i_pickup_a: Pickup current setting [A]
        margin_percent: (I_pickup / I_operating - 1) * 100
        verdict: PASS if margin >= 20%, MARGINAL if 10-20%, FAIL if < 10%
        notes_pl: Polish explanation
    """

    device_id: str
    i_operating_a: float
    i_pickup_a: float
    margin_percent: float
    verdict: CoordinationVerdict
    notes_pl: str

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "device_id": self.device_id,
            "i_operating_a": self.i_operating_a,
            "i_pickup_a": self.i_pickup_a,
            "margin_percent": self.margin_percent,
            "verdict": self.verdict.value,
            "verdict_pl": VERDICT_LABELS_PL.get(self.verdict.value, self.verdict.value),
            "notes_pl": self.notes_pl,
        }


# =============================================================================
# COORDINATION RESULT
# =============================================================================


@dataclass(frozen=True)
class ProtectionCoordinationResult:
    """
    Complete protection coordination analysis result.

    Contains all checks and overall verdict.

    Attributes:
        run_id: Analysis run ID
        project_id: Project ID
        devices: List of analyzed devices
        sensitivity_checks: Sensitivity check results
        selectivity_checks: Selectivity check results
        overload_checks: Overload check results
        overall_verdict: Combined verdict
        summary: Summary statistics
        created_at: Timestamp
    """

    run_id: str
    project_id: str
    devices: tuple[ProtectionDevice, ...]
    sensitivity_checks: tuple[SensitivityCheck, ...]
    selectivity_checks: tuple[SelectivityCheck, ...]
    overload_checks: tuple[OverloadCheck, ...]
    overall_verdict: CoordinationVerdict
    summary: dict[str, Any]
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
            "overall_verdict": self.overall_verdict.value,
            "overall_verdict_pl": VERDICT_LABELS_PL.get(
                self.overall_verdict.value, self.overall_verdict.value
            ),
            "summary": self.summary,
            "created_at": self.created_at.isoformat(),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ProtectionCoordinationResult:
        """Deserialize from dictionary."""
        return cls(
            run_id=str(data["run_id"]),
            project_id=str(data["project_id"]),
            devices=tuple(ProtectionDevice.from_dict(d) for d in data.get("devices", [])),
            sensitivity_checks=tuple(
                SensitivityCheck(
                    device_id=c["device_id"],
                    i_fault_min_a=c["i_fault_min_a"],
                    i_pickup_a=c["i_pickup_a"],
                    margin_percent=c["margin_percent"],
                    verdict=CoordinationVerdict(c["verdict"]),
                    notes_pl=c["notes_pl"],
                )
                for c in data.get("sensitivity_checks", [])
            ),
            selectivity_checks=tuple(
                SelectivityCheck(
                    upstream_device_id=c["upstream_device_id"],
                    downstream_device_id=c["downstream_device_id"],
                    analysis_current_a=c["analysis_current_a"],
                    t_upstream_s=c["t_upstream_s"],
                    t_downstream_s=c["t_downstream_s"],
                    margin_s=c["margin_s"],
                    required_margin_s=c["required_margin_s"],
                    verdict=CoordinationVerdict(c["verdict"]),
                    notes_pl=c["notes_pl"],
                )
                for c in data.get("selectivity_checks", [])
            ),
            overload_checks=tuple(
                OverloadCheck(
                    device_id=c["device_id"],
                    i_operating_a=c["i_operating_a"],
                    i_pickup_a=c["i_pickup_a"],
                    margin_percent=c["margin_percent"],
                    verdict=CoordinationVerdict(c["verdict"]),
                    notes_pl=c["notes_pl"],
                )
                for c in data.get("overload_checks", [])
            ),
            overall_verdict=CoordinationVerdict(data["overall_verdict"]),
            summary=data.get("summary", {}),
            created_at=(
                datetime.fromisoformat(data["created_at"])
                if "created_at" in data
                else datetime.now(UTC)
            ),
        )


# =============================================================================
# I>> SETTING CHECKS (FIX-12D Integration)
# =============================================================================


@dataclass(frozen=True)
class InstantaneousSelectivityCheck:
    """
    Result of I>> selectivity check (selektywność I>>).

    Verifies I>> setting is above max fault at next protection.
    Criterion: I_nast >= kb * Ikmax(next_protection) / θi

    Attributes:
        line_id: Line/branch identifier
        i_setting_a: I>> setting [A]
        i_min_required_a: Minimum required setting [A]
        ik_max_next_a: Max fault at next protection [A]
        kb_used: Selectivity coefficient used
        ct_ratio: CT ratio used
        verdict: PASS/MARGINAL/FAIL
        notes_pl: Polish explanation
    """

    line_id: str
    i_setting_a: float
    i_min_required_a: float
    ik_max_next_a: float
    kb_used: float
    ct_ratio: float
    verdict: CoordinationVerdict
    notes_pl: str

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "check_type": "instantaneous_selectivity",
            "check_type_pl": "Selektywność I>>",
            "line_id": self.line_id,
            "i_setting_a": self.i_setting_a,
            "i_min_required_a": self.i_min_required_a,
            "ik_max_next_a": self.ik_max_next_a,
            "kb_used": self.kb_used,
            "ct_ratio": self.ct_ratio,
            "verdict": self.verdict.value,
            "verdict_pl": VERDICT_LABELS_PL.get(self.verdict.value, self.verdict.value),
            "notes_pl": self.notes_pl,
        }


@dataclass(frozen=True)
class InstantaneousSensitivityCheck:
    """
    Result of I>> sensitivity check (czułość I>>).

    Verifies I>> will trip for minimum fault at busbars.
    Criterion: Ikmin(busbars) / θi >= kc * I_nast

    Attributes:
        line_id: Line/branch identifier
        i_setting_a: I>> setting [A]
        i_max_allowed_a: Maximum allowed setting [A]
        ik_min_busbars_a: Min fault at busbars [A]
        kc_used: Sensitivity coefficient used
        ct_ratio: CT ratio used
        verdict: PASS/MARGINAL/FAIL
        notes_pl: Polish explanation
    """

    line_id: str
    i_setting_a: float
    i_max_allowed_a: float
    ik_min_busbars_a: float
    kc_used: float
    ct_ratio: float
    verdict: CoordinationVerdict
    notes_pl: str

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "check_type": "instantaneous_sensitivity",
            "check_type_pl": "Czułość I>>",
            "line_id": self.line_id,
            "i_setting_a": self.i_setting_a,
            "i_max_allowed_a": self.i_max_allowed_a,
            "ik_min_busbars_a": self.ik_min_busbars_a,
            "kc_used": self.kc_used,
            "ct_ratio": self.ct_ratio,
            "verdict": self.verdict.value,
            "verdict_pl": VERDICT_LABELS_PL.get(self.verdict.value, self.verdict.value),
            "notes_pl": self.notes_pl,
        }


@dataclass(frozen=True)
class InstantaneousThermalCheck:
    """
    Result of I>> thermal check (wytrzymałość cieplna I>>).

    Verifies I>> setting protects conductor thermal capacity.
    Criterion: I_nast <= kbth * Ithdop / θi

    Attributes:
        line_id: Line/branch identifier
        i_setting_a: I>> setting [A]
        i_max_thermal_a: Maximum setting from thermal [A]
        ithn_a: Rated short-time current 1s [A]
        ithdop_a: Permissible thermal current [A]
        tk_s: Total fault duration [s]
        kbth_used: Thermal coefficient used
        ct_ratio: CT ratio used
        verdict: PASS/MARGINAL/FAIL
        notes_pl: Polish explanation
    """

    line_id: str
    i_setting_a: float
    i_max_thermal_a: float
    ithn_a: float
    ithdop_a: float
    tk_s: float
    kbth_used: float
    ct_ratio: float
    verdict: CoordinationVerdict
    notes_pl: str

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "check_type": "instantaneous_thermal",
            "check_type_pl": "Wytrzymałość cieplna I>>",
            "line_id": self.line_id,
            "i_setting_a": self.i_setting_a,
            "i_max_thermal_a": self.i_max_thermal_a,
            "ithn_a": self.ithn_a,
            "ithdop_a": self.ithdop_a,
            "tk_s": self.tk_s,
            "kbth_used": self.kbth_used,
            "ct_ratio": self.ct_ratio,
            "verdict": self.verdict.value,
            "verdict_pl": VERDICT_LABELS_PL.get(self.verdict.value, self.verdict.value),
            "notes_pl": self.notes_pl,
        }


@dataclass(frozen=True)
class SPZFromInstantaneousCheck:
    """
    Result of SPZ blocking from I>> check.

    Verifies if SPZ should be blocked when I>> operates.

    Attributes:
        line_id: Line/branch identifier
        spz_allowed: Whether SPZ is allowed
        blocking_reason_pl: Reason for blocking (if blocked)
        i_threshold_a: Current threshold for SPZ decision [A]
        i_fault_start_a: Fault current at line start [A]
        tk_single_s: Single fault duration [s]
        verdict: PASS (SPZ allowed) / FAIL (SPZ blocked)
        notes_pl: Polish explanation
    """

    line_id: str
    spz_allowed: bool
    blocking_reason_pl: str | None
    i_threshold_a: float
    i_fault_start_a: float
    tk_single_s: float
    verdict: CoordinationVerdict
    notes_pl: str

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "check_type": "spz_from_instantaneous",
            "check_type_pl": "SPZ od I>>",
            "line_id": self.line_id,
            "spz_allowed": self.spz_allowed,
            "blocking_reason_pl": self.blocking_reason_pl,
            "i_threshold_a": self.i_threshold_a,
            "i_fault_start_a": self.i_fault_start_a,
            "tk_single_s": self.tk_single_s,
            "verdict": self.verdict.value,
            "verdict_pl": VERDICT_LABELS_PL.get(self.verdict.value, self.verdict.value),
            "notes_pl": self.notes_pl,
        }
