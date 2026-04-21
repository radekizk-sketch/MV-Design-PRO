from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Any


def _complex_to_dict(value: complex) -> dict[str, float]:
    return {"re": float(value.real), "im": float(value.imag)}


def _sorted_complex_dict(values: dict[str, complex]) -> dict[str, dict[str, float]]:
    return {key: _complex_to_dict(values[key]) for key in sorted(values.keys())}


def _sorted_float_dict(values: dict[str, float]) -> dict[str, float]:
    return {key: float(values[key]) for key in sorted(values.keys())}


def _sorted_keys(values: Iterable[str]) -> list[str]:
    return sorted(values)


def _serialize_value(value: Any) -> Any:
    if isinstance(value, complex):
        return _complex_to_dict(value)
    if hasattr(value, "item"):
        return _serialize_value(value.item())
    if hasattr(value, "tolist"):
        return _serialize_value(value.tolist())
    if isinstance(value, dict):
        return {key: _serialize_value(value[key]) for key in _sorted_keys(value.keys())}
    if isinstance(value, list | tuple):
        return [_serialize_value(item) for item in value]
    if isinstance(value, set):
        return [_serialize_value(item) for item in sorted(value)]
    return value


@dataclass
class PowerFlowResult:
    converged: bool
    iterations: int
    tolerance: float
    max_mismatch_pu: float
    base_mva: float
    slack_node_id: str
    node_voltage_pu: dict[str, complex] = field(default_factory=dict)
    node_u_mag_pu: dict[str, float] = field(default_factory=dict)
    node_angle_rad: dict[str, float] = field(default_factory=dict)
    node_voltage_kv: dict[str, float] = field(default_factory=dict)
    branch_current_pu: dict[str, complex] = field(default_factory=dict)
    branch_current_ka: dict[str, float] = field(default_factory=dict)
    branch_s_from_pu: dict[str, complex] = field(default_factory=dict)
    branch_s_to_pu: dict[str, complex] = field(default_factory=dict)
    branch_s_from_mva: dict[str, complex] = field(default_factory=dict)
    branch_s_to_mva: dict[str, complex] = field(default_factory=dict)
    losses_total_pu: complex = 0.0 + 0.0j
    slack_power_pu: complex = 0.0 + 0.0j
    violations: list[dict[str, Any]] = field(default_factory=list)
    pv_to_pq_switches: list[dict[str, Any]] = field(default_factory=list)
    white_box_trace: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "converged": bool(self.converged),
            "iterations": int(self.iterations),
            "tolerance": float(self.tolerance),
            "max_mismatch_pu": float(self.max_mismatch_pu),
            "base_mva": float(self.base_mva),
            "slack_node_id": self.slack_node_id,
            "node_voltage_pu": _sorted_complex_dict(self.node_voltage_pu),
            "node_u_mag_pu": _sorted_float_dict(self.node_u_mag_pu),
            "node_angle_rad": _sorted_float_dict(self.node_angle_rad),
            "node_voltage_kv": _sorted_float_dict(self.node_voltage_kv),
            "branch_current_pu": _sorted_complex_dict(self.branch_current_pu),
            "branch_current_ka": _sorted_float_dict(self.branch_current_ka),
            "branch_s_from_pu": _sorted_complex_dict(self.branch_s_from_pu),
            "branch_s_to_pu": _sorted_complex_dict(self.branch_s_to_pu),
            "branch_s_from_mva": _sorted_complex_dict(self.branch_s_from_mva),
            "branch_s_to_mva": _sorted_complex_dict(self.branch_s_to_mva),
            "losses_total_pu": _complex_to_dict(self.losses_total_pu),
            "slack_power_pu": _complex_to_dict(self.slack_power_pu),
            "violations": _serialize_value(self.violations),
            "pv_to_pq_switches": _serialize_value(self.pv_to_pq_switches),
            "white_box_trace": _serialize_value(self.white_box_trace),
        }
