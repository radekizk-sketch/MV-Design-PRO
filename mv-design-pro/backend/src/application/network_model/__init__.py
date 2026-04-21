"""
Application-level helpers for enforcing NetworkModel invariants.
"""

from .errors import MultipleNetworkModelsError, NetworkModelInvariantError
from .graph_builder import build_network_graph
from .identity import (
    ensure_snapshot_matches_project,
    network_model_id_for_project,
)

__all__ = [
    "NetworkModelInvariantError",
    "MultipleNetworkModelsError",
    "build_network_graph",
    "ensure_snapshot_matches_project",
    "network_model_id_for_project",
]
