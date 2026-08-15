"""
Warstwa topologiczna ENM — identyfikacja TRUNK, corridors, entry points, T-nodes.

Czysta funkcja: ENM → TopologyGraph (bez efektów ubocznych, deterministyczna).
"""

from __future__ import annotations

from dataclasses import dataclass

from .models import (
    Cable,
    EnergyNetworkModel,
    Junction,
    OverheadLine,
)


@dataclass(frozen=True)
class TrunkSegment:
    """Segment toru głównego SN (od GPZ w dół)."""

    branch_ref: str
    from_bus_ref: str
    to_bus_ref: str
    length_km: float
    order: int


@dataclass(frozen=True)
class EntryPoint:
    """Punkt wejścia kabli zewnętrznych do stacji."""

    substation_ref: str
    bus_ref: str
    entry_point_ref: str | None


@dataclass(frozen=True)
class TopologyNode:
    """Węzeł topologiczny (szyna z metadanymi topologicznymi)."""

    bus_ref: str
    voltage_kv: float
    is_source_bus: bool
    substation_ref: str | None
    junction_ref: str | None
    degree: int  # liczba gałęzi podłączonych


@dataclass(frozen=True)
class TopologyGraph:
    """Graf topologiczny — projekcja ENM na przestrzeń topologiczną.

    INVARIANT: Ten sam ENM → identyczny TopologyGraph (determinizm).
    """

    nodes: tuple[TopologyNode, ...]
    trunk_segments: tuple[TrunkSegment, ...]
    entry_points: tuple[EntryPoint, ...]
    corridors: tuple[CorridorInfo, ...]
    junctions: tuple[JunctionInfo, ...]
    source_bus_refs: tuple[str, ...]
    stats: TopologyStats


@dataclass(frozen=True)
class CorridorInfo:
    """Informacja o magistrali."""

    ref_id: str
    name: str
    corridor_type: str
    segment_count: int
    total_length_km: float
    has_no_point: bool


@dataclass(frozen=True)
class JunctionInfo:
    """Informacja o węźle T."""

    ref_id: str
    name: str
    junction_type: str
    branch_count: int
    bus_ref: str | None


@dataclass(frozen=True)
class TopologyStats:
    """Statystyki topologiczne."""

    bus_count: int
    branch_count: int
    transformer_count: int
    substation_count: int
    bay_count: int
    junction_count: int
    corridor_count: int
    total_line_length_km: float
    source_count: int


def build_topology_graph(enm: EnergyNetworkModel) -> TopologyGraph:
    """
    Zbuduj graf topologiczny z ENM.

    Czysta, deterministyczna funkcja. Ten sam ENM → identyczny wynik.

    Args:
        enm: EnergyNetworkModel — kanoniczny model sieci.

    Returns:
        TopologyGraph z pełną informacją topologiczną.
    """
    # Zbierz referencje
    source_bus_refs = sorted({s.bus_ref for s in enm.sources})
    {b.ref_id: b for b in enm.buses}
    branch_map = {b.ref_id: b for b in enm.branches}
    {s.ref_id: s for s in enm.substations}
    {j.ref_id: j for j in enm.junctions}

    # Bus → substation mapping
    bus_to_sub: dict[str, str] = {}
    for sub in enm.substations:
        for br in sub.bus_refs:
            bus_to_sub[br] = sub.ref_id

    # Bus → junction mapping
    bus_to_junc: dict[str, str] = {}
    for _junc in enm.junctions:
        # Heurystyka: szukamy szyny, która ma ≥3 gałęzie (T-node)
        # Na razie mapujemy po branch_refs
        pass

    # Policz stopień węzłów (degree)
    bus_degree: dict[str, int] = {b.ref_id: 0 for b in enm.buses}
    for branch in enm.branches:
        if branch.status == "closed":
            if branch.from_bus_ref in bus_degree:
                bus_degree[branch.from_bus_ref] += 1
            if branch.to_bus_ref in bus_degree:
                bus_degree[branch.to_bus_ref] += 1
    for trafo in enm.transformers:
        if trafo.hv_bus_ref in bus_degree:
            bus_degree[trafo.hv_bus_ref] += 1
        if trafo.lv_bus_ref in bus_degree:
            bus_degree[trafo.lv_bus_ref] += 1

    # Buduj TopologyNodes (posortowane po ref_id dla determinizmu)
    topo_nodes = []
    for bus in sorted(enm.buses, key=lambda b: b.ref_id):
        topo_nodes.append(
            TopologyNode(
                bus_ref=bus.ref_id,
                voltage_kv=bus.voltage_kv,
                is_source_bus=bus.ref_id in source_bus_refs,
                substation_ref=bus_to_sub.get(bus.ref_id),
                junction_ref=bus_to_junc.get(bus.ref_id),
                degree=bus_degree.get(bus.ref_id, 0),
            )
        )

    # Buduj trunk segments (segmenty toru głównego)
    trunk_segments = _identify_trunk(enm, source_bus_refs)

    # Buduj entry points
    entry_points = []
    for sub in sorted(enm.substations, key=lambda s: s.ref_id):
        for br in sorted(sub.bus_refs):
            entry_points.append(
                EntryPoint(
                    substation_ref=sub.ref_id,
                    bus_ref=br,
                    entry_point_ref=sub.entry_point_ref,
                )
            )

    # Corridor info
    corridor_infos = []
    for corr in sorted(enm.corridors, key=lambda c: c.ref_id):
        total_len = 0.0
        for seg_ref in corr.ordered_segment_refs:
            # Osobna nazwa: `branch` z petli po `enm.branches` (wyzej) NIGDY nie jest
            # `None`, a `branch_map.get()` moze nie znalezc segmentu. Wspoldzielenie
            # nazwy chowalo mozliwy brak przed analiza.
            segment = branch_map.get(seg_ref)
            if segment and isinstance(segment, OverheadLine | Cable):
                total_len += segment.length_km
        corridor_infos.append(
            CorridorInfo(
                ref_id=corr.ref_id,
                name=corr.name,
                corridor_type=corr.corridor_type,
                segment_count=len(corr.ordered_segment_refs),
                total_length_km=round(total_len, 3),
                has_no_point=corr.no_point_ref is not None,
            )
        )

    # Junction info
    junction_infos = []
    for junc in sorted(enm.junctions, key=lambda j: j.ref_id):
        # Spróbuj znaleźć szynę powiązaną z węzłem T
        # Heurystyka: szyna, której degree ≥ 3 i jest podłączona do gałęzi z junction
        junc_bus = _find_junction_bus(junc, enm)
        junction_infos.append(
            JunctionInfo(
                ref_id=junc.ref_id,
                name=junc.name,
                junction_type=junc.junction_type,
                branch_count=len(junc.connected_branch_refs),
                bus_ref=junc_bus,
            )
        )

    # Statystyki
    total_line_length = 0.0
    for branch in enm.branches:
        if isinstance(branch, OverheadLine | Cable):
            total_line_length += branch.length_km

    stats = TopologyStats(
        bus_count=len(enm.buses),
        branch_count=len(enm.branches),
        transformer_count=len(enm.transformers),
        substation_count=len(enm.substations),
        bay_count=len(enm.bays),
        junction_count=len(enm.junctions),
        corridor_count=len(enm.corridors),
        total_line_length_km=round(total_line_length, 3),
        source_count=len(enm.sources),
    )

    return TopologyGraph(
        nodes=tuple(topo_nodes),
        trunk_segments=tuple(trunk_segments),
        entry_points=tuple(entry_points),
        corridors=tuple(corridor_infos),
        junctions=tuple(junction_infos),
        source_bus_refs=tuple(source_bus_refs),
        stats=stats,
    )


def _identify_trunk(
    enm: EnergyNetworkModel,
    source_bus_refs: list[str],
) -> list[TrunkSegment]:
    """Identyfikuj segmenty toru głównego SN (BFS od szyny zasilającej)."""
    if not source_bus_refs:
        return []

    # Zbierz gałęzie indeksowane po szynie
    bus_branches: dict[str, list[tuple[str, str, float]]] = {}
    for branch in enm.branches:
        if branch.status != "closed":
            continue
        if isinstance(branch, OverheadLine | Cable):
            length = branch.length_km
        else:
            length = 0.0
        bus_branches.setdefault(branch.from_bus_ref, []).append(
            (branch.ref_id, branch.to_bus_ref, length)
        )
        bus_branches.setdefault(branch.to_bus_ref, []).append(
            (branch.ref_id, branch.from_bus_ref, length)
        )

    # Uwzględnij transformatory (łączą szyny WN/SN — kluczowe dla trunk BFS)
    for trafo in enm.transformers:
        bus_branches.setdefault(trafo.hv_bus_ref, []).append((trafo.ref_id, trafo.lv_bus_ref, 0.0))
        bus_branches.setdefault(trafo.lv_bus_ref, []).append((trafo.ref_id, trafo.hv_bus_ref, 0.0))

    # BFS od szyn źródłowych
    visited: set[str] = set()
    trunk: list[TrunkSegment] = []
    order = 0

    for src_bus in source_bus_refs:
        if src_bus in visited:
            continue
        queue = [src_bus]
        visited.add(src_bus)
        while queue:
            current = queue.pop(0)
            for br_ref, next_bus, length in sorted(
                bus_branches.get(current, []), key=lambda x: x[0]
            ):
                if next_bus in visited:
                    continue
                visited.add(next_bus)
                trunk.append(
                    TrunkSegment(
                        branch_ref=br_ref,
                        from_bus_ref=current,
                        to_bus_ref=next_bus,
                        length_km=length,
                        order=order,
                    )
                )
                order += 1
                queue.append(next_bus)

    return trunk


def _find_junction_bus(junc: Junction, enm: EnergyNetworkModel) -> str | None:
    """Znajdź szynę powiązaną z węzłem T (heurystyka: wspólna szyna gałęzi)."""
    bus_counts: dict[str, int] = {}
    branch_map = {b.ref_id: b for b in enm.branches}
    for br_ref in junc.connected_branch_refs:
        branch = branch_map.get(br_ref)
        if branch:
            bus_counts[branch.from_bus_ref] = bus_counts.get(branch.from_bus_ref, 0) + 1
            bus_counts[branch.to_bus_ref] = bus_counts.get(branch.to_bus_ref, 0) + 1

    if not bus_counts:
        return None

    # Szyna z największą liczbą powiązań
    return max(bus_counts, key=lambda k: bus_counts[k])
