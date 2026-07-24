"""
Automigracja v_endpoint_ports_001 — przypisanie endpoint_a_port / endpoint_b_port
dla istniejących Cable / OverheadLine.

Konserwatywna: przypisuje port tylko gdy istnieje DOKŁADNIE JEDEN kompatybilny
kandydat. Jeśli zero lub wiele kandydatów → pozostawia endpoint_*_port=None.
ENMValidator emituje wtedy blocker `topology.connection_port_missing`.

Fałszywa topologia (przypisanie portu „na oko") jest gorsza niż brakujący port:
operator musi świadomie wskazać port w UI E-12.

Idempotentny: drugi run nie zmienia modelu.
Deterministyczny: dla danego ENM input → identyczny output (hash stable).
White-box: każde przypisanie zapisuje meta info w raporcie.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from ..models import (
    Cable,
    EnergyNetworkModel,
    OverheadLine,
    Port,
    PortRef,
)

MIGRATION_VERSION = "v_endpoint_ports_001"

# Kompatybilne kindy portów dla endpointów odcinka SN
# Cable/OverheadLine SN łączy pola liniowe — dopuszczamy pełen zestaw portów
# dla pól wejściowych, wyjściowych, odgałęźnych oraz pomiarowych (rzadko, ale
# możliwe topologicznie). Nie dopuszczamy portów transformatorowych ani DER —
# tam kabel idzie do innego pola.
_COMPATIBLE_PORT_KINDS_SN: frozenset[str] = frozenset(
    {
        "sn_input",
        "sn_output",
        "sn_branch",
        "sn_coupler",
        "sn_reserve",
    }
)


@dataclass(frozen=True)
class EndpointPortAssignment:
    """Pojedyncze przypisanie endpoint→port dokonane przez migrację."""

    connection_id: str
    connection_type: Literal["cable", "line_overhead"]
    endpoint: Literal["a", "b"]
    bus_ref: str
    port_id: str
    port_kind: str


@dataclass(frozen=True)
class EndpointPortAmbiguity:
    """Przypadek wieloznaczny: 0 albo >1 kandydatów."""

    connection_id: str
    connection_type: Literal["cable", "line_overhead"]
    endpoint: Literal["a", "b"]
    bus_ref: str
    candidate_count: int
    candidate_port_ids: tuple[str, ...]
    reason: Literal["no_candidates", "multiple_candidates"]


@dataclass
class EndpointPortsMigrationReport:
    """Raport z automigracji portów endpointów."""

    migration_version: str = MIGRATION_VERSION
    connections_scanned: int = 0
    connections_already_complete: int = 0
    endpoints_assigned: int = 0
    endpoints_left_unassigned: int = 0
    assignments: list[EndpointPortAssignment] = field(default_factory=list)
    ambiguities: list[EndpointPortAmbiguity] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "migration_version": self.migration_version,
            "connections_scanned": self.connections_scanned,
            "connections_already_complete": self.connections_already_complete,
            "endpoints_assigned": self.endpoints_assigned,
            "endpoints_left_unassigned": self.endpoints_left_unassigned,
            "assignments": [
                {
                    "connection_id": a.connection_id,
                    "connection_type": a.connection_type,
                    "endpoint": a.endpoint,
                    "bus_ref": a.bus_ref,
                    "port_id": a.port_id,
                    "port_kind": a.port_kind,
                }
                for a in self.assignments
            ],
            "ambiguities": [
                {
                    "connection_id": amb.connection_id,
                    "connection_type": amb.connection_type,
                    "endpoint": amb.endpoint,
                    "bus_ref": amb.bus_ref,
                    "candidate_count": amb.candidate_count,
                    "candidate_port_ids": list(amb.candidate_port_ids),
                    "reason": amb.reason,
                }
                for amb in self.ambiguities
            ],
        }


def _collect_ports_on_bus(model: EnergyNetworkModel, bus_ref: str) -> list[Port]:
    """Zwraca wszystkie porty pól (Bay.ports) zaczepione o szynę `bus_ref`."""
    ports: list[Port] = []
    for bay in model.bays:
        if bay.bus_ref != bus_ref:
            continue
        for port in bay.ports:
            ports.append(port)
    return ports


def _bus_voltage_kv(model: EnergyNetworkModel, bus_ref: str) -> float | None:
    for bus in model.buses:
        if bus.ref_id == bus_ref:
            return bus.voltage_kv
    return None


def _find_endpoint_candidates(
    model: EnergyNetworkModel,
    bus_ref: str,
    connection_id: str,
) -> list[Port]:
    """Konserwatywne kryterium kompatybilnego portu na szynie.

    Port jest kandydatem jeżeli:
    1. leży na szynie `bus_ref`,
    2. ma `kind ∈ _COMPATIBLE_PORT_KINDS_SN`,
    3. jego `nominal_voltage_kv` zgadza się z napięciem szyny (jeśli można
       ustalić; tolerujemy brak, bo to dane historyczne),
    4. NIE jest zajęty (`occupied_by is None` lub równy `connection_id`,
       żeby migracja była idempotentna).
    """
    bus_v = _bus_voltage_kv(model, bus_ref)
    candidates: list[Port] = []
    for port in _collect_ports_on_bus(model, bus_ref):
        if port.kind not in _COMPATIBLE_PORT_KINDS_SN:
            continue
        if bus_v is not None and abs(port.nominal_voltage_kv - bus_v) > 0.5:
            # Tolerancja 0.5 kV — kanoniczne SN: 6/10/15/20/30 kV.
            continue
        if port.occupied_by is not None and port.occupied_by != connection_id:
            continue
        candidates.append(port)
    # Deterministyczna kolejność — port_id sortowane
    candidates.sort(key=lambda p: p.id)
    return candidates


def _assign_endpoint(
    model: EnergyNetworkModel,
    connection_id: str,
    connection_type: Literal["cable", "line_overhead"],
    bus_ref: str,
    endpoint: Literal["a", "b"],
    report: EndpointPortsMigrationReport,
) -> PortRef | None:
    """Próbuje przypisać port konserwatywnie. Zwraca PortRef albo None."""
    candidates = _find_endpoint_candidates(model, bus_ref, connection_id)
    if len(candidates) == 1:
        port = candidates[0]
        # Zaznacz port jako zajęty
        port.occupied_by = connection_id
        report.assignments.append(
            EndpointPortAssignment(
                connection_id=connection_id,
                connection_type=connection_type,
                endpoint=endpoint,
                bus_ref=bus_ref,
                port_id=port.id,
                port_kind=port.kind,
            )
        )
        report.endpoints_assigned += 1
        return PortRef(port_id=port.id)
    # 0 albo >1
    report.ambiguities.append(
        EndpointPortAmbiguity(
            connection_id=connection_id,
            connection_type=connection_type,
            endpoint=endpoint,
            bus_ref=bus_ref,
            candidate_count=len(candidates),
            candidate_port_ids=tuple(p.id for p in candidates),
            reason="no_candidates" if not candidates else "multiple_candidates",
        )
    )
    report.endpoints_left_unassigned += 1
    return None


def needs_migration(model: EnergyNetworkModel) -> bool:
    """True gdy istnieje przynajmniej jeden Cable / OverheadLine z brakującym portem."""
    for branch in model.branches:
        if isinstance(branch, Cable | OverheadLine):
            if branch.endpoint_a_port is None or branch.endpoint_b_port is None:
                return True
    return False


def migrate(
    model: EnergyNetworkModel,
) -> tuple[EnergyNetworkModel, EndpointPortsMigrationReport]:
    """Wykonuje konserwatywną automigrację portów endpointów.

    Mutuje `model` in-place (zgodnie z konwencją `v_ports_001`) i zwraca raport.
    Bezpieczne wielokrotne wywołanie — port o `occupied_by == connection_id`
    nie zostanie przypisany ponownie do innego kabla.
    """
    report = EndpointPortsMigrationReport()

    for branch in model.branches:
        if not isinstance(branch, Cable | OverheadLine):
            continue
        report.connections_scanned += 1
        connection_type: Literal["cable", "line_overhead"] = (
            "cable" if isinstance(branch, Cable) else "line_overhead"
        )

        already_complete = branch.endpoint_a_port is not None and branch.endpoint_b_port is not None
        if already_complete:
            report.connections_already_complete += 1
            continue

        if branch.endpoint_a_port is None:
            assigned = _assign_endpoint(
                model=model,
                connection_id=branch.ref_id,
                connection_type=connection_type,
                bus_ref=branch.from_bus_ref,
                endpoint="a",
                report=report,
            )
            if assigned is not None:
                branch.endpoint_a_port = assigned

        if branch.endpoint_b_port is None:
            assigned = _assign_endpoint(
                model=model,
                connection_id=branch.ref_id,
                connection_type=connection_type,
                bus_ref=branch.to_bus_ref,
                endpoint="b",
                report=report,
            )
            if assigned is not None:
                branch.endpoint_b_port = assigned

    return model, report
