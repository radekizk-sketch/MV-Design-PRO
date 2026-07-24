from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from application.analyses.design_synth.canonical import canonicalize_json


@dataclass(frozen=True)
class DeviceCapability:
    device_id: str
    vendor: str
    model: str
    functions_supported: tuple[str, ...]
    curves_supported: tuple[str, ...]
    i_pickup_51_a_min: float
    i_pickup_51_a_max: float
    tms_51_min: float
    tms_51_max: float
    i_inst_50_a_min: float
    i_inst_50_a_max: float
    i_pickup_51n_a_min: float
    i_pickup_51n_a_max: float
    tms_51n_min: float
    tms_51n_max: float
    i_inst_50n_a_min: float
    i_inst_50n_a_max: float
    meta: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        payload = {
            "device_id": self.device_id,
            "vendor": self.vendor,
            "model": self.model,
            "functions_supported": self.functions_supported,
            "curves_supported": self.curves_supported,
            "i_pickup_51_a_min": self.i_pickup_51_a_min,
            "i_pickup_51_a_max": self.i_pickup_51_a_max,
            "tms_51_min": self.tms_51_min,
            "tms_51_max": self.tms_51_max,
            "i_inst_50_a_min": self.i_inst_50_a_min,
            "i_inst_50_a_max": self.i_inst_50_a_max,
            "i_pickup_51n_a_min": self.i_pickup_51n_a_min,
            "i_pickup_51n_a_max": self.i_pickup_51n_a_max,
            "tms_51n_min": self.tms_51n_min,
            "tms_51n_max": self.tms_51n_max,
            "i_inst_50n_a_min": self.i_inst_50n_a_min,
            "i_inst_50n_a_max": self.i_inst_50n_a_max,
            "meta": self.meta,
        }
        return canonicalize_json(payload)


@dataclass(frozen=True)
class ProtectionRequirementV0:
    """Wymaganie nastaw wobec aparatu.

    V12K-189: nastawa ``None`` znaczy „niewyznaczalna z danych projektu" — nie
    stawia wymagania wobec aparatu i nie może być zastąpiona liczbą domyślną.
    """

    curve: str
    i_pickup_51_a: float | None
    tms_51: float
    i_inst_50_a: float | None
    i_pickup_51n_a: float | None
    tms_51n: float
    i_inst_50n_a: float | None

    def to_dict(self) -> dict[str, Any]:
        payload = {
            "curve": self.curve,
            "i_pickup_51_a": self.i_pickup_51_a,
            "tms_51": self.tms_51,
            "i_inst_50_a": self.i_inst_50_a,
            "i_pickup_51n_a": self.i_pickup_51n_a,
            "tms_51n": self.tms_51n,
            "i_inst_50n_a": self.i_inst_50n_a,
        }
        return canonicalize_json(payload)


@dataclass(frozen=True)
class DeviceMappingResult:
    compatible: bool
    violations: tuple[str, ...]
    mapped_settings: dict[str, Any]
    assumptions: tuple[str, ...]

    def to_dict(self) -> dict[str, Any]:
        payload = {
            "compatible": self.compatible,
            "violations": self.violations,
            "mapped_settings": self.mapped_settings,
            "assumptions": self.assumptions,
        }
        return canonicalize_json(payload)
