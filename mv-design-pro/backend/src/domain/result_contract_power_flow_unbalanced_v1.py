"""Kontrakt wyniku rozpływu niesymetrycznego ``ResultSetPowerFlowUnbalancedV1`` (karta W5-D).

OSOBNY i ADDYTYWNY wobec kontraktów FROZEN ``PowerFlowResultV1`` (rozpływ NR) i
``ShortCircuitResult`` — nowy typ analizy ``rozplyw_niesymetryczny`` dostaje własny,
niezależny kształt wyniku, żeby żadne pole zamrożonych kontraktów nie było dotknięte
(reguła 6 CLAUDE.md, §2 karty W5). Warstwa domenowa: czyste dane wyniku, zero fizyki
(wielkości per faza pochodzą z solvera FROZEN ``power_flow_unbalanced.py``, a
przeliczenia jednostek z ``network_model/pochodne`` w budowniczym
``enm/rozplyw_niesymetryczny_wynik.py``).

Determinizm: ``to_dict`` zaokrągla jak ``UnbalancedPowerFlowBusResult.to_dict``
(napięcia 6 miejsc, kąty 4, moce 6, VUF 4) — ten sam bieg daje bajtowo ten sam
artefakt (test determinizmu w ``tests/enm/test_rozplyw_niesymetryczny_bieg.py``).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

SCHEMA_VERSION_POWER_FLOW_UNBALANCED_V1 = "power-flow-unbalanced-v1"


def _r(value: float | None, miejsca: int) -> float | None:
    return None if value is None else round(value, miejsca)


@dataclass(frozen=True)
class FazaSzynyV1:
    """Napięcie jednej fazy szyny: p.u. napięcia fazowego, kV faza–N, kąt."""

    u_pu: float
    u_kv: float
    angle_deg: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "u_pu": round(self.u_pu, 6),
            "u_kv": round(self.u_kv, 6),
            "angle_deg": round(self.angle_deg, 4),
        }


@dataclass(frozen=True)
class BusResultUnbalancedV1:
    bus_id: str
    element_id: str
    name: str
    un_kv: float
    #: ``None`` = szyna poza wyspą zasiloną (nierozwiązana) — jawny brak, nie liczba.
    faza_a: FazaSzynyV1 | None
    faza_b: FazaSzynyV1 | None
    faza_c: FazaSzynyV1 | None
    voltage_unbalance_factor_pct: float | None
    #: ``ref_id`` źródła sieciowego wyspy, która zasila szynę (``None`` = nierozwiązana).
    zrodlo_ref: str | None

    @property
    def solved(self) -> bool:
        return self.faza_a is not None

    def to_dict(self) -> dict[str, Any]:
        return {
            "bus_id": self.bus_id,
            "element_id": self.element_id,
            "name": self.name,
            "un_kv": round(self.un_kv, 6),
            "solved": self.solved,
            "faza_a": None if self.faza_a is None else self.faza_a.to_dict(),
            "faza_b": None if self.faza_b is None else self.faza_b.to_dict(),
            "faza_c": None if self.faza_c is None else self.faza_c.to_dict(),
            "voltage_unbalance_factor_pct": _r(self.voltage_unbalance_factor_pct, 4),
            "zrodlo_ref": self.zrodlo_ref,
        }


@dataclass(frozen=True)
class FazaGaleziV1:
    """Przepływ jednej fazy na początku gałęzi (strona ``from``) i prąd fazy."""

    p_mw: float
    q_mvar: float
    i_a: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "p_mw": round(self.p_mw, 6),
            "q_mvar": round(self.q_mvar, 6),
            "i_a": round(self.i_a, 3),
        }


@dataclass(frozen=True)
class BranchResultUnbalancedV1:
    branch_id: str
    element_id: str
    name: str
    element_type: str
    from_bus_id: str
    to_bus_id: str
    faza_a: FazaGaleziV1
    faza_b: FazaGaleziV1
    faza_c: FazaGaleziV1
    losses_p_mw: float
    losses_q_mvar: float
    #: Prąd znamionowy gałęzi [A] z IR; ``None`` = brak danej (łącznik, transformator,
    #: linia bez katalogu) — jawny brak, nie liczba.
    rated_current_a: float | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "branch_id": self.branch_id,
            "element_id": self.element_id,
            "name": self.name,
            "element_type": self.element_type,
            "from_bus_id": self.from_bus_id,
            "to_bus_id": self.to_bus_id,
            "faza_a": self.faza_a.to_dict(),
            "faza_b": self.faza_b.to_dict(),
            "faza_c": self.faza_c.to_dict(),
            "losses_p_mw": round(self.losses_p_mw, 6),
            "losses_q_mvar": round(self.losses_q_mvar, 6),
            "rated_current_a": _r(self.rated_current_a, 3),
        }


@dataclass(frozen=True)
class WyspaWynikuUnbalancedV1:
    slack_bus_id: str
    zrodlo_ref: str
    base_kv_ll: float
    converged: bool
    iterations: int
    max_voltage_mismatch_pu: float
    bus_count: int
    branch_count: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "slack_bus_id": self.slack_bus_id,
            "zrodlo_ref": self.zrodlo_ref,
            "base_kv_ll": round(self.base_kv_ll, 6),
            "converged": self.converged,
            "iterations": self.iterations,
            "max_voltage_mismatch_pu": round(self.max_voltage_mismatch_pu, 9),
            "bus_count": self.bus_count,
            "branch_count": self.branch_count,
        }


@dataclass(frozen=True)
class ResultSetPowerFlowUnbalancedV1:
    solver_version: str
    converged: bool
    tolerance: float
    max_iterations: int
    base_mva: float
    wyspy: tuple[WyspaWynikuUnbalancedV1, ...]
    bus_results: tuple[BusResultUnbalancedV1, ...]
    branch_results: tuple[BranchResultUnbalancedV1, ...]
    total_losses_p_mw: float
    total_losses_q_mvar: float
    #: Największy VUF (IEC 61000-4-30) wśród szyn rozwiązanych; ``None`` gdy brak.
    max_voltage_unbalance_factor_pct: float | None
    max_voltage_unbalance_bus_id: str | None
    unsolved_bus_ids: tuple[str, ...]
    schema_version: str = SCHEMA_VERSION_POWER_FLOW_UNBALANCED_V1
    zalozenia: tuple[dict[str, Any], ...] = field(default=())

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema_version": self.schema_version,
            "solver_version": self.solver_version,
            "converged": self.converged,
            "tolerance": self.tolerance,
            "max_iterations": self.max_iterations,
            "base_mva": self.base_mva,
            "wyspy": [w.to_dict() for w in self.wyspy],
            "bus_results": [b.to_dict() for b in self.bus_results],
            "branch_results": [b.to_dict() for b in self.branch_results],
            "summary": {
                "bus_count": len(self.bus_results),
                "branch_count": len(self.branch_results),
                "solved_bus_count": sum(1 for b in self.bus_results if b.solved),
                "total_losses_p_mw": round(self.total_losses_p_mw, 6),
                "total_losses_q_mvar": round(self.total_losses_q_mvar, 6),
                "max_voltage_unbalance_factor_pct": _r(self.max_voltage_unbalance_factor_pct, 4),
                "max_voltage_unbalance_bus_id": self.max_voltage_unbalance_bus_id,
                "unsolved_bus_ids": list(self.unsolved_bus_ids),
            },
            "zalozenia": [dict(z) for z in self.zalozenia],
        }
