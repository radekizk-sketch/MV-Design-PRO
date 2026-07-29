"""
Boundary identification heuristics (BoundaryNode) for interpretation layer.

PowerFactory alignment:
- BoundaryNode is interpretation-only (no model mutation)
- Deterministic, heuristic identification
- Read-only access to NetworkSnapshot + Case params
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field

from network_model.core.snapshot import NetworkSnapshot, snapshot_read_only_guard

EXTERNAL_GRID_SOURCE_TYPES = {"GRID", "EXTERNAL_GRID"}


@dataclass
class BoundaryResult:
    """
    Result of boundary identification.

    Attributes:
        connection_node_id: Identified BoundaryNode node (if any).
        method: Heuristic method used for identification.
        confidence: Confidence level of identification (0.0-1.0).
        diagnostics: Diagnostics and reason codes if no unique BoundaryNode.
    """

    connection_node_id: str | None
    method: str | None
    confidence: float
    diagnostics: list[str] = field(default_factory=list)


class BoundaryIdentifier:
    """
    Identifies network boundaries (BoundaryNode) using PowerFactory-style heuristics.

    Heuristic order (first satisfied wins):
    1) External Grid / Source boundary
    2) Generator-dominant boundary
    3) Single-feeder boundary
    4) Voltage-level boundary
    """

    def identify(
        self,
        snapshot: NetworkSnapshot,
        case_params: Mapping | None = None,
    ) -> BoundaryResult:
        with snapshot_read_only_guard(snapshot, operation="BoundaryIdentifier.identify"):
            return self._identify(snapshot, case_params)

    def _identify(
        self,
        snapshot: NetworkSnapshot,
        case_params: Mapping | None = None,
    ) -> BoundaryResult:
        diagnostics: list[str] = []
        case_params = case_params or {}
        graph = snapshot.graph

        if not graph.nodes:
            return BoundaryResult(
                connection_node_id=None,
                method=None,
                confidence=0.0,
                diagnostics=["snapshot.empty"],
            )

        external_grid_nodes = self._external_grid_nodes(graph, case_params)
        if len(external_grid_nodes) == 1:
            return BoundaryResult(
                connection_node_id=external_grid_nodes[0],
                method="external_grid",
                confidence=0.95,
                diagnostics=[],
            )
        if len(external_grid_nodes) > 1:
            diagnostics.append("external_grid.multiple")
            return BoundaryResult(
                connection_node_id=None,
                method=None,
                confidence=0.0,
                diagnostics=diagnostics,
            )

        generator_nodes = self._generator_dominant_nodes(graph, case_params)
        if len(generator_nodes) == 1:
            return BoundaryResult(
                connection_node_id=generator_nodes[0],
                method="generator_dominant",
                confidence=0.75,
                diagnostics=[],
            )
        if len(generator_nodes) > 1:
            diagnostics.append("generator_dominant.multiple")
            return BoundaryResult(
                connection_node_id=None,
                method=None,
                confidence=0.0,
                diagnostics=diagnostics,
            )

        feeder_nodes = self._single_feeder_nodes(graph)
        if len(feeder_nodes) == 1:
            return BoundaryResult(
                connection_node_id=feeder_nodes[0],
                method="single_feeder",
                confidence=0.6,
                diagnostics=[],
            )
        if len(feeder_nodes) > 1:
            diagnostics.append("single_feeder.multiple")
            return BoundaryResult(
                connection_node_id=None,
                method=None,
                confidence=0.0,
                diagnostics=diagnostics,
            )

        voltage_nodes = self._voltage_level_boundary_nodes(graph)
        if len(voltage_nodes) == 1:
            return BoundaryResult(
                connection_node_id=voltage_nodes[0],
                method="voltage_level",
                confidence=0.5,
                diagnostics=[],
            )
        if len(voltage_nodes) > 1:
            diagnostics.append("voltage_level.multiple")
            return BoundaryResult(
                connection_node_id=None,
                method=None,
                confidence=0.0,
                diagnostics=diagnostics,
            )

        return BoundaryResult(
            connection_node_id=None,
            method=None,
            confidence=0.0,
            diagnostics=["connection_node.not_found"],
        )

    def _external_grid_nodes(self, graph, case_params: Mapping) -> list[str]:
        sources = case_params.get("sources") or []
        candidates = {
            str(source.get("node_id"))
            for source in sources
            if source.get("in_service", True)
            and str(source.get("source_type")).upper() in EXTERNAL_GRID_SOURCE_TYPES
        }
        candidates = {node_id for node_id in candidates if node_id in graph.nodes}
        return sorted(candidates)

    def _generator_dominant_nodes(self, graph, case_params: Mapping) -> list[str]:
        sources = case_params.get("sources") or []
        loads = case_params.get("loads") or []

        net_injection: dict[str, float] = dict.fromkeys(graph.nodes, 0.0)

        for source in sources:
            if not source.get("in_service", True):
                continue
            source_type = str(source.get("source_type", "")).upper()
            if source_type in EXTERNAL_GRID_SOURCE_TYPES:
                continue
            node_id = str(source.get("node_id"))
            if node_id not in net_injection:
                continue
            payload = source.get("payload") or {}
            net_injection[node_id] += self._as_float(payload.get("p_mw", 0.0))

        for load in loads:
            if not load.get("in_service", True):
                continue
            node_id = str(load.get("node_id"))
            if node_id not in net_injection:
                continue
            payload = load.get("payload") or {}
            net_injection[node_id] -= self._as_float(payload.get("p_mw", 0.0))

        if not sources and not loads:
            for node_id, node in graph.nodes.items():
                if node.active_power is not None:
                    net_injection[node_id] = float(node.active_power)

        degree_map = self._degree_map(graph)
        candidates = [
            node_id
            for node_id, net in net_injection.items()
            if net > 0.0 and degree_map.get(node_id, 0) == 1
        ]
        candidates.sort()
        return candidates

    def _single_feeder_nodes(self, graph) -> list[str]:
        degree_map = self._degree_map(graph)
        candidates = [node_id for node_id, degree in degree_map.items() if degree == 1]
        candidates.sort()
        return candidates

    def _voltage_level_boundary_nodes(self, graph) -> list[str]:
        transitions: list[tuple[str, str]] = []
        seen_edges: set[tuple[str, str]] = set()

        for node_a, node_b in graph._graph.edges():
            edge_key = tuple(sorted((node_a, node_b)))
            if edge_key in seen_edges:
                continue
            seen_edges.add(edge_key)
            node_a_obj = graph.nodes.get(node_a)
            node_b_obj = graph.nodes.get(node_b)
            if node_a_obj is None or node_b_obj is None:
                continue
            if node_a_obj.voltage_level == node_b_obj.voltage_level:
                continue
            if node_a_obj.voltage_level > node_b_obj.voltage_level:
                transitions.append((node_a, node_b))
            else:
                transitions.append((node_b, node_a))

        transitions.sort()
        candidates = [higher for higher, _lower in transitions]
        return candidates

    @staticmethod
    def _degree_map(graph) -> dict[str, int]:
        return {node_id: graph._graph.degree(node_id) for node_id in graph.nodes}

    @staticmethod
    def _as_float(value: object) -> float:
        try:
            return float(value) if value is not None else 0.0
        except (TypeError, ValueError):
            return 0.0
