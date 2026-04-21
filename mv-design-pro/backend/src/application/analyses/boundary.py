"""
Compatibility wrapper for boundary identification.

PowerFactory Alignment:
- BoundaryNode (Point of Common Coupling) is INTERPRETATION, not physics
- BoundaryNode is identified using heuristics, not model structure
- This is an ANALYSIS, not a SOLVER

This module delegates to analysis.boundary (interpretation layer).
"""

from __future__ import annotations

from analysis.boundary import BoundaryIdentifier as _BoundaryIdentifier
from analysis.boundary import BoundaryResult
from network_model.core.snapshot import NetworkSnapshot, SnapshotMeta


class BoundaryIdentifier:
    """
    Compatibility facade for BoundaryIdentifier.

    Prefer analysis.boundary.BoundaryIdentifier for new usage.
    """

    def __init__(self) -> None:
        self._identifier = _BoundaryIdentifier()

    def identify(
        self, snapshot: NetworkSnapshot, case_params: dict | None = None
    ) -> BoundaryResult:
        return self._identifier.identify(snapshot, case_params)

    def identify_connection_node(
        self, network_graph, case_params: dict | None = None
    ) -> BoundaryResult:
        snapshot = NetworkSnapshot(
            meta=SnapshotMeta.create(
                network_model_id=getattr(network_graph, "network_model_id", None)
            ),
            graph=network_graph,
        )
        return self._identifier.identify(snapshot, case_params)


def identify_connection_node(network_graph, case_params: dict | None = None) -> str | None:
    """
    Convenience function to identify BoundaryNode.

    Args:
        network_graph: NetworkGraph instance.
        case_params: Optional case parameters (sources, loads).

    Returns:
        BoundaryNode node ID or None.
    """
    identifier = BoundaryIdentifier()
    result = identifier.identify_connection_node(network_graph, case_params)
    return result.connection_node_id
