"""Expected values per sieć referencyjna - z literatury / norm / pandapower offline."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal


@dataclass(frozen=True)
class ExpectedBusPF:
    """Expected power-flow result per bus."""

    bus_id: str
    v_pu: float
    angle_deg: float
    rtol: float = 1e-3
    note: str = ""

    def to_dict(self) -> dict[str, object]:
        return {
            "bus_id": self.bus_id,
            "v_pu": round(self.v_pu, 6),
            "angle_deg": round(self.angle_deg, 4),
            "rtol": self.rtol,
            "note": self.note,
        }


@dataclass(frozen=True)
class ExpectedBranchPF:
    """Expected power-flow result per branch."""

    branch_id: str
    p_from_mw: float
    q_from_mvar: float
    losses_p_mw: float
    rtol: float = 5e-3
    note: str = ""

    def to_dict(self) -> dict[str, object]:
        return {
            "branch_id": self.branch_id,
            "p_from_mw": round(self.p_from_mw, 6),
            "q_from_mvar": round(self.q_from_mvar, 6),
            "losses_p_mw": round(self.losses_p_mw, 6),
            "rtol": self.rtol,
            "note": self.note,
        }


@dataclass(frozen=True)
class ExpectedShortCircuit:
    """Expected SC result per fault location."""

    fault_node_id: str
    sc_type: Literal["3F", "2F", "1F", "2F+G"]
    ikss_a: float
    ip_a: float
    ith_a: float
    sk_mva: float
    rtol: float = 2e-2
    note: str = ""

    def to_dict(self) -> dict[str, object]:
        return {
            "fault_node_id": self.fault_node_id,
            "sc_type": self.sc_type,
            "ikss_a": round(self.ikss_a, 3),
            "ip_a": round(self.ip_a, 3),
            "ith_a": round(self.ith_a, 3),
            "sk_mva": round(self.sk_mva, 3),
            "rtol": self.rtol,
            "note": self.note,
        }


@dataclass(frozen=True)
class ExpectedDynamicSample:
    """Expected dynamic trajectory sample for FRT validation."""

    t_s: float
    voltage_pu_min: float
    voltage_pu_max: float
    note: str = ""

    def to_dict(self) -> dict[str, object]:
        return {
            "t_s": round(self.t_s, 4),
            "voltage_pu_min": round(self.voltage_pu_min, 6),
            "voltage_pu_max": round(self.voltage_pu_max, 6),
            "note": self.note,
        }


@dataclass(frozen=True)
class ExpectedValues:
    """Full expected dataset for one reference network."""

    network_id: str
    source: str
    source_note: str = ""
    power_flow: tuple[ExpectedBusPF, ...] = ()
    power_flow_branches: tuple[ExpectedBranchPF, ...] = ()
    short_circuit: tuple[ExpectedShortCircuit, ...] = ()
    dynamic_samples: tuple[ExpectedDynamicSample, ...] = ()

    def to_dict(self) -> dict[str, object]:
        return {
            "network_id": self.network_id,
            "source": self.source,
            "source_note": self.source_note,
            "power_flow": [p.to_dict() for p in self.power_flow],
            "power_flow_branches": [p.to_dict() for p in self.power_flow_branches],
            "short_circuit": [p.to_dict() for p in self.short_circuit],
            "dynamic_samples": [p.to_dict() for p in self.dynamic_samples],
        }

    def has_pf(self) -> bool:
        return len(self.power_flow) > 0

    def has_sc(self) -> bool:
        return len(self.short_circuit) > 0

    def has_dynamic(self) -> bool:
        return len(self.dynamic_samples) > 0


def load_expected_values_from_json(path: Path | str) -> ExpectedValues:
    """Load and validate expected values from JSON."""
    path_obj = Path(path)
    if not path_obj.exists():
        raise FileNotFoundError(f"Expected values JSON not found: {path}")
    data: dict[str, Any] = json.loads(path_obj.read_text(encoding="utf-8"))

    pf = tuple(
        ExpectedBusPF(
            bus_id=item["bus_id"],
            v_pu=float(item["v_pu"]),
            angle_deg=float(item.get("angle_deg", 0.0)),
            rtol=float(item.get("rtol", 1e-3)),
            note=str(item.get("note", "")),
        )
        for item in data.get("power_flow", [])
    )
    pf_branches = tuple(
        ExpectedBranchPF(
            branch_id=item["branch_id"],
            p_from_mw=float(item.get("p_from_mw", 0.0)),
            q_from_mvar=float(item.get("q_from_mvar", 0.0)),
            losses_p_mw=float(item.get("losses_p_mw", 0.0)),
            rtol=float(item.get("rtol", 5e-3)),
            note=str(item.get("note", "")),
        )
        for item in data.get("power_flow_branches", [])
    )
    sc = tuple(
        ExpectedShortCircuit(
            fault_node_id=item["fault_node_id"],
            sc_type=item["sc_type"],
            ikss_a=float(item["ikss_a"]),
            ip_a=float(item.get("ip_a", 0.0)),
            ith_a=float(item.get("ith_a", 0.0)),
            sk_mva=float(item.get("sk_mva", 0.0)),
            rtol=float(item.get("rtol", 2e-2)),
            note=str(item.get("note", "")),
        )
        for item in data.get("short_circuit", [])
    )
    dynamic = tuple(
        ExpectedDynamicSample(
            t_s=float(item["t_s"]),
            voltage_pu_min=float(item["voltage_pu_min"]),
            voltage_pu_max=float(item.get("voltage_pu_max", 1.30)),
            note=str(item.get("note", "")),
        )
        for item in data.get("dynamic_samples", [])
    )

    return ExpectedValues(
        network_id=str(data["network_id"]),
        source=str(data["source"]),
        source_note=str(data.get("source_note", "")),
        power_flow=pf,
        power_flow_branches=pf_branches,
        short_circuit=sc,
        dynamic_samples=dynamic,
    )
