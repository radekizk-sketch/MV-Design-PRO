from __future__ import annotations

from collections.abc import Callable

from network_model.core import Branch, NetworkGraph, Node

from .errors import NetworkModelInvariantError


def build_network_graph(
    *,
    nodes: list[dict],
    branches: list[dict],
    switching_states: dict,
    node_payload_builder: Callable[[dict], dict],
    branch_payload_builder: Callable[[dict], dict],
    network_model_id: str,
) -> NetworkGraph:
    if not network_model_id:
        raise NetworkModelInvariantError("NetworkModel id is required to build graph.")
    graph = NetworkGraph(network_model_id=network_model_id)
    for node in nodes:
        node_data = node_payload_builder(node)
        graph.add_node(Node.from_dict(node_data))
    for branch in branches:
        branch_data = branch_payload_builder(branch)
        branch_state = switching_states.get(branch["id"])
        if branch_state is not None:
            branch_data["in_service"] = branch_state["in_service"]
        graph.add_branch(Branch.from_dict(branch_data))
    return graph
