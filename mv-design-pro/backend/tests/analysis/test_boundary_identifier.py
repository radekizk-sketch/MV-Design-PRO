from analysis.boundary import BoundaryIdentifier
from network_model.core.branch import Branch, BranchType
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from network_model.core.snapshot import NetworkSnapshot, SnapshotMeta


def _make_snapshot(nodes: list[Node], branches: list[Branch]) -> NetworkSnapshot:
    graph = NetworkGraph(network_model_id="model-1")
    for node in nodes:
        graph.add_node(node)
    for branch in branches:
        graph.add_branch(branch)
    meta = SnapshotMeta.create(snapshot_id="snapshot-1", network_model_id="model-1")
    return NetworkSnapshot(meta=meta, graph=graph)


def _make_node(node_id: str, voltage_level: float = 15.0) -> Node:
    return Node(
        id=node_id,
        name=node_id,
        node_type=NodeType.PQ,
        voltage_level=voltage_level,
        active_power=0.0,
        reactive_power=0.0,
    )


def _make_branch(branch_id: str, from_node_id: str, to_node_id: str) -> Branch:
    return Branch(
        id=branch_id,
        name=branch_id,
        branch_type=BranchType.LINE,
        from_node_id=from_node_id,
        to_node_id=to_node_id,
        in_service=True,
    )


def test_external_grid_identifies_connection_node() -> None:
    snapshot = _make_snapshot(
        nodes=[_make_node("n1"), _make_node("n2")],
        branches=[_make_branch("b1", "n1", "n2")],
    )
    case_params = {
        "sources": [
            {
                "node_id": "n1",
                "source_type": "GRID",
                "payload": {},
                "in_service": True,
            }
        ]
    }

    result = BoundaryIdentifier().identify(snapshot, case_params)

    assert result.connection_node_id == "n1"
    assert result.method == "external_grid"
    assert result.diagnostics == []


def test_fallback_generator_dominant_boundary() -> None:
    snapshot = _make_snapshot(
        nodes=[_make_node("n1"), _make_node("n2")],
        branches=[_make_branch("b1", "n1", "n2")],
    )
    case_params = {
        "sources": [
            {
                "node_id": "n2",
                "source_type": "GENERATOR",
                "payload": {"p_mw": 5.0},
                "in_service": True,
            }
        ],
        "loads": [
            {
                "node_id": "n1",
                "payload": {"p_mw": 1.0},
                "in_service": True,
            }
        ],
    }

    result = BoundaryIdentifier().identify(snapshot, case_params)

    assert result.connection_node_id == "n2"
    assert result.method == "generator_dominant"
    assert result.diagnostics == []


def test_ambiguity_returns_none_with_diagnostics() -> None:
    snapshot = _make_snapshot(
        nodes=[_make_node("n1"), _make_node("n2")],
        branches=[_make_branch("b1", "n1", "n2")],
    )
    case_params = {
        "sources": [
            {"node_id": "n1", "source_type": "GRID", "payload": {}, "in_service": True},
            {"node_id": "n2", "source_type": "GRID", "payload": {}, "in_service": True},
        ]
    }

    result = BoundaryIdentifier().identify(snapshot, case_params)

    assert result.connection_node_id is None
    assert result.diagnostics


def test_generator_missing_p_mw_is_skipped_not_zero(caplog) -> None:
    """FAB-E (E1): brak pola payload.p_mw NIE jest liczba 0.

    Zrodlo bez zmaterializowanej mocy czynnej (payload bez klucza ``p_mw``)
    musi zostac pominiete w sumie wstrzykniecia netto heurystyki
    ``generator_dominant`` z jawnym powodem (log ostrzezenia), a nie po cichu
    doliczone jako moc zerowa — ktora moglaby (dla innej topologii) fałszywie
    zmienic znak sumy i wynik heurystyki.
    """
    snapshot = _make_snapshot(
        nodes=[_make_node("n1"), _make_node("n2")],
        branches=[_make_branch("b1", "n1", "n2")],
    )
    case_params = {
        "sources": [
            {
                "node_id": "n2",
                "source_type": "GENERATOR",
                "payload": {},  # brak "p_mw" — pole niezmaterializowane
                "in_service": True,
            }
        ],
        "loads": [],
    }

    import logging

    with caplog.at_level(logging.WARNING, logger="analysis.boundary.identifier"):
        result = BoundaryIdentifier().identify(snapshot, case_params)

    # Wezel nie moze zostac fałszywie uznany za "generator_dominant" na
    # podstawie fantomowej mocy zerowej — heurystyka spada do nastepnego kroku
    # (single_feeder), bo net_injection zostaje na wartosci startowej 0.0.
    assert result.method != "generator_dominant"
    assert any(
        "p_mw" in record.message and "pominiete" in record.message for record in caplog.records
    ), "brakujace payload.p_mw musi zostac zalogowane z jawnym powodem, nie wchlyniete po cichu"


def test_deterministic_identification() -> None:
    snapshot = _make_snapshot(
        nodes=[_make_node("n1"), _make_node("n2")],
        branches=[_make_branch("b1", "n1", "n2")],
    )
    case_params = {
        "sources": [
            {
                "node_id": "n1",
                "source_type": "GRID",
                "payload": {},
                "in_service": True,
            }
        ]
    }

    identifier = BoundaryIdentifier()
    first = identifier.identify(snapshot, case_params)
    second = identifier.identify(snapshot, case_params)

    assert first == second
