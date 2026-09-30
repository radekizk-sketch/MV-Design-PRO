"""Expected values per sieć referencyjna - z literatury / norm / pandapower offline."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal


def _zaokraglij(wartosc: float | None, miejsca: int) -> float | None:
    """FAB-E (E1): brak oczekiwanej wartosci eksportuje sie jako JSON ``null``.

    ``round(None, ...)`` rzuca TypeError — ta funkcja zachowuje istniejacy
    ksztalt zaokraglania dla wartosci ZNANYCH, a dla ``None`` (pole
    nieobecne w JSON wyroczni) zwraca ``None`` wprost zamiast fabrykowac 0.0.
    """
    if wartosc is None:
        return None
    return round(wartosc, miejsca)


@dataclass(frozen=True)
class ExpectedBusPF:
    """Expected power-flow result per bus."""

    bus_id: str
    v_pu: float
    # FAB-E (E1): brak oczekiwanego kata w JSON wyroczni NIE jest oczekiwaniem
    # "0 stopni" — autor fikstury moze celowo nie podac kata (interesuje go
    # tylko modul napiecia). `None` = brak oczekiwania, comparator.py oznacza
    # taki wiersz NIEPOROWNYWALNY zamiast porownywac z fabrykowanym zerem.
    angle_deg: float | None = None
    rtol: float = 1e-3
    note: str = ""

    def to_dict(self) -> dict[str, object]:
        return {
            "bus_id": self.bus_id,
            "v_pu": round(self.v_pu, 6),
            "angle_deg": _zaokraglij(self.angle_deg, 4),
            "rtol": self.rtol,
            "note": self.note,
        }


@dataclass(frozen=True)
class ExpectedBranchPF:
    """Expected power-flow result per branch."""

    branch_id: str
    # FAB-E (E1): jak w ExpectedBusPF.angle_deg — brak oczekiwania w JSON
    # wyroczni NIE jest oczekiwaniem "0 MW/Mvar".
    p_from_mw: float | None = None
    q_from_mvar: float | None = None
    losses_p_mw: float | None = None
    rtol: float = 5e-3
    note: str = ""

    def to_dict(self) -> dict[str, object]:
        return {
            "branch_id": self.branch_id,
            "p_from_mw": _zaokraglij(self.p_from_mw, 6),
            "q_from_mvar": _zaokraglij(self.q_from_mvar, 6),
            "losses_p_mw": _zaokraglij(self.losses_p_mw, 6),
            "rtol": self.rtol,
            "note": self.note,
        }


@dataclass(frozen=True)
class ExpectedShortCircuit:
    """Expected SC result per fault location."""

    fault_node_id: str
    sc_type: Literal["3F", "2F", "1F", "2F+G"]
    ikss_a: float
    # FAB-E (E1): brak oczekiwania w JSON wyroczni NIE jest oczekiwaniem "0 A/MVA".
    ip_a: float | None = None
    ith_a: float | None = None
    sk_mva: float | None = None
    rtol: float = 2e-2
    note: str = ""

    def to_dict(self) -> dict[str, object]:
        return {
            "fault_node_id": self.fault_node_id,
            "sc_type": self.sc_type,
            "ikss_a": round(self.ikss_a, 3),
            "ip_a": _zaokraglij(self.ip_a, 3),
            "ith_a": _zaokraglij(self.ith_a, 3),
            "sk_mva": _zaokraglij(self.sk_mva, 3),
            "rtol": self.rtol,
            "note": self.note,
        }


@dataclass(frozen=True)
class ExpectedDynamicSample:
    """Expected dynamic trajectory sample for FRT validation."""

    t_s: float
    voltage_pu_min: float
    # FAB-E (E1): brak gornej obwiedni w JSON wyroczni nie jest oczekiwaniem
    # "1.30 pu" — pole to dzis NIEUZYWANE przez zaden komparator
    # (`validate_dynamic` liczy wlasna trajektorie niezaleznie, sprawdzone
    # grepem), wiec placeholder nie moze nikogo wprowadzic w blad, ale
    # eksport JSON i tak nie moze fabrykowac liczby dla nieobecnego pola.
    voltage_pu_max: float | None = None
    note: str = ""

    def to_dict(self) -> dict[str, object]:
        return {
            "t_s": round(self.t_s, 4),
            "voltage_pu_min": round(self.voltage_pu_min, 6),
            "voltage_pu_max": _zaokraglij(self.voltage_pu_max, 6),
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

    def _opcjonalny(item: dict[str, Any], klucz: str) -> float | None:
        wartosc = item.get(klucz)
        return None if wartosc is None else float(wartosc)

    pf = tuple(
        ExpectedBusPF(
            bus_id=item["bus_id"],
            v_pu=float(item["v_pu"]),
            angle_deg=_opcjonalny(item, "angle_deg"),
            rtol=float(item.get("rtol", 1e-3)),
            note=str(item.get("note", "")),
        )
        for item in data.get("power_flow", [])
    )
    pf_branches = tuple(
        ExpectedBranchPF(
            branch_id=item["branch_id"],
            p_from_mw=_opcjonalny(item, "p_from_mw"),
            q_from_mvar=_opcjonalny(item, "q_from_mvar"),
            losses_p_mw=_opcjonalny(item, "losses_p_mw"),
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
            ip_a=_opcjonalny(item, "ip_a"),
            ith_a=_opcjonalny(item, "ith_a"),
            sk_mva=_opcjonalny(item, "sk_mva"),
            rtol=float(item.get("rtol", 2e-2)),
            note=str(item.get("note", "")),
        )
        for item in data.get("short_circuit", [])
    )
    dynamic = tuple(
        ExpectedDynamicSample(
            t_s=float(item["t_s"]),
            voltage_pu_min=float(item["voltage_pu_min"]),
            voltage_pu_max=_opcjonalny(item, "voltage_pu_max"),
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
