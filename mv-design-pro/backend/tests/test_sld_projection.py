from network_model.core.branch import BranchType, LineBranch
from network_model.core.graph import NetworkGraph
from network_model.core.inverter import InverterSource
from network_model.core.node import Node, NodeType
from network_model.core.snapshot import create_network_snapshot
from network_model.sld_projection import project_snapshot_to_sld

NETWORK_MODEL_ID = "model-1"


def _build_node(node_id: str) -> Node:
    return Node(
        id=node_id,
        name=node_id,
        node_type=NodeType.PQ,
        voltage_level=10.0,
        active_power=0.0,
        reactive_power=0.0,
    )


def _build_snapshot() -> tuple[NetworkGraph, str]:
    graph = NetworkGraph(network_model_id=NETWORK_MODEL_ID)
    graph.add_node(_build_node("n1"))
    graph.add_node(_build_node("n2"))
    return graph, "snap-1"


def test_project_two_buses_one_branch() -> None:
    graph, snapshot_id = _build_snapshot()
    branch = LineBranch(
        id="b1",
        name="b1",
        branch_type=BranchType.LINE,
        from_node_id="n1",
        to_node_id="n2",
    )
    graph.add_branch(branch)

    snapshot = create_network_snapshot(
        graph,
        snapshot_id=snapshot_id,
        network_model_id=NETWORK_MODEL_ID,
    )
    diagram = project_snapshot_to_sld(snapshot)

    assert diagram.diagram_id == snapshot_id
    assert diagram.snapshot_id == snapshot_id
    assert [(e.element_type, e.identity) for e in diagram.elements] == [
        ("branch", "b1"),
        ("bus", "n1"),
        ("bus", "n2"),
    ]


def test_connection_node_marker_not_in_projection() -> None:
    """
    Regression test: BoundaryNode – węzeł przyłączenia is NOT stored in NetworkGraph.
    BoundaryNode markers should NOT be generated from the graph (it's an interpretation layer concern).
    """
    graph, snapshot_id = _build_snapshot()
    # NOTE: graph.connection_node_id was removed. BoundaryNode is interpretation, not model property.

    snapshot = create_network_snapshot(
        graph,
        snapshot_id=snapshot_id,
        network_model_id=NETWORK_MODEL_ID,
    )
    diagram = project_snapshot_to_sld(snapshot)

    # Verify no connection_marker elements are generated from graph
    element_types = [e.element_type for e in diagram.elements]
    assert "connection_marker" not in element_types


def test_in_service_false_excludes_entity() -> None:
    graph, snapshot_id = _build_snapshot()
    branch = LineBranch(
        id="b1",
        name="b1",
        branch_type=BranchType.LINE,
        from_node_id="n1",
        to_node_id="n2",
        in_service=False,
    )
    graph.add_branch(branch)
    source = InverterSource(id="s1", node_id="n1", in_service=False)
    graph.add_inverter_source(source)

    snapshot = create_network_snapshot(
        graph,
        snapshot_id=snapshot_id,
        network_model_id=NETWORK_MODEL_ID,
    )
    diagram = project_snapshot_to_sld(snapshot)

    identities = {(e.element_type, e.identity) for e in diagram.elements}
    assert ("branch", "b1") not in identities
    assert ("source", "s1") not in identities


def test_parallel_branches_are_distinct_elements() -> None:
    graph, snapshot_id = _build_snapshot()
    branch_1 = LineBranch(
        id="b1",
        name="b1",
        branch_type=BranchType.LINE,
        from_node_id="n1",
        to_node_id="n2",
    )
    branch_2 = LineBranch(
        id="b2",
        name="b2",
        branch_type=BranchType.LINE,
        from_node_id="n1",
        to_node_id="n2",
    )
    graph.add_branch(branch_1)
    graph.add_branch(branch_2)

    snapshot = create_network_snapshot(
        graph,
        snapshot_id=snapshot_id,
        network_model_id=NETWORK_MODEL_ID,
    )
    diagram = project_snapshot_to_sld(snapshot)

    branch_ids = [
        element.identity for element in diagram.elements if element.element_type == "branch"
    ]
    assert branch_ids == ["b1", "b2"]


def test_projection_is_deterministic() -> None:
    graph, snapshot_id = _build_snapshot()
    branch = LineBranch(
        id="b1",
        name="b1",
        branch_type=BranchType.CABLE,
        from_node_id="n1",
        to_node_id="n2",
    )
    graph.add_branch(branch)
    source = InverterSource(id="s1", node_id="n1")
    graph.add_inverter_source(source)

    snapshot = create_network_snapshot(
        graph,
        snapshot_id=snapshot_id,
        network_model_id=NETWORK_MODEL_ID,
    )

    first = project_snapshot_to_sld(snapshot).to_dict()
    second = project_snapshot_to_sld(snapshot).to_dict()

    assert first == second
