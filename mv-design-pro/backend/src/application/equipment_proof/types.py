from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from application.analyses.design_synth.canonical import canonicalize_json


@dataclass(frozen=True)
class DeviceRating:
    device_id: str
    name_pl: str
    type_ref: str | None
    u_m_kv: float | None
    i_cu_ka: float | None
    i_dyn_ka: float | None
    i_th_ka: float | None
    t_th_s: float | None
    meta: dict[str, Any] = field(default_factory=dict)
    #: KARTA UM-ICU-KATALOG (2a): True gdy aparat NIE MA zdolnosci wylaczania
    #: zwarc z definicji normy (rozlacznik/odlacznik/uziemnik — equipment_kind
    #: LOAD_SWITCH/DISCONNECTOR/EARTH_SWITCH). Rozstrzyga, czy brak i_cu_ka w
    #: dowodzie jest stanem "NIE_DOTYCZY" (jawny, nie FAIL) czy "brak danej"
    #: (FAIL — aparat POWINIEN miec te zdolnosc, ale karta jej nie wniosla).
    i_cu_not_applicable: bool = False

    def to_dict(self) -> dict[str, Any]:
        payload = {
            "device_id": self.device_id,
            "name_pl": self.name_pl,
            "type_ref": self.type_ref,
            "u_m_kv": self.u_m_kv,
            "i_cu_ka": self.i_cu_ka,
            "i_dyn_ka": self.i_dyn_ka,
            "i_th_ka": self.i_th_ka,
            "t_th_s": self.t_th_s,
            "meta": self.meta,
            "i_cu_not_applicable": self.i_cu_not_applicable,
        }
        return canonicalize_json(payload)


@dataclass(frozen=True)
class EquipmentProofInput:
    project_id: str
    case_id: str
    run_id: str
    connection_node_id: str
    device: DeviceRating
    required_fault_results: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        payload = {
            "project_id": self.project_id,
            "case_id": self.case_id,
            "run_id": self.run_id,
            "connection_node_id": self.connection_node_id,
            "device": self.device.to_dict(),
            "required_fault_results": self.required_fault_results,
        }
        return canonicalize_json(payload)


@dataclass(frozen=True)
class EquipmentProofCheckResult:
    name: str
    status: str
    required_value: float | str | None
    device_value: float | str | None
    required_source_key: str | None
    device_source_key: str | None
    message_pl: str
    notes: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        payload = {
            "name": self.name,
            "status": self.status,
            "required_value": self.required_value,
            "device_value": self.device_value,
            "required_source_key": self.required_source_key,
            "device_source_key": self.device_source_key,
            "message_pl": self.message_pl,
            "notes": self.notes,
        }
        return canonicalize_json(payload)


@dataclass(frozen=True)
class EquipmentProofResult:
    project_id: str
    case_id: str
    run_id: str
    connection_node_id: str
    device_id: str
    overall_status: str
    failed_checks: tuple[str, ...]
    checks: tuple[EquipmentProofCheckResult, ...]
    key_results: dict[str, str]
    required_fault_results: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        payload = {
            "project_id": self.project_id,
            "case_id": self.case_id,
            "run_id": self.run_id,
            "connection_node_id": self.connection_node_id,
            "device_id": self.device_id,
            "overall_status": self.overall_status,
            "failed_checks": self.failed_checks,
            "checks": [check.to_dict() for check in self.checks],
            "key_results": self.key_results,
            "required_fault_results": self.required_fault_results,
        }
        return canonicalize_json(payload)

    def white_box_trace(self) -> dict[str, Any]:
        return canonicalize_json(
            {
                "project_id": self.project_id,
                "case_id": self.case_id,
                "run_id": self.run_id,
                "connection_node_id": self.connection_node_id,
                "device_id": self.device_id,
                "overall_status": self.overall_status,
                "failed_checks": self.failed_checks,
                "checks": [check.to_dict() for check in self.checks],
                "key_results": self.key_results,
                "required_fault_results": self.required_fault_results,
            }
        )
