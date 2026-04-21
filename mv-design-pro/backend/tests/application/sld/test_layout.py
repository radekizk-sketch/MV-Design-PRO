"""
SLD Layout Tests.

Tests for PowerFactory-aligned SLD invariants (per sld_rules.md, SYSTEM_SPEC.md):
- SLD-INV-001: Single Model Rule (Wizard and SLD edit same model)
- SLD-INV-002: Bijection (each symbol ↔ exactly one model object)
- SLD-INV-003: Operating modes (MODEL_EDIT, CASE_CONFIG, RESULT_VIEW)
- SLD-INV-004: Overlay (results as presentation layer only)
- SLD-INV-005: in_service vs Switch.state distinction
- SLD-INV-006: Determinism (same input → identical output)
"""

from __future__ import annotations

import sys
from pathlib import Path
from uuid import UUID, uuid4

backend_src = Path(__file__).parents[3] / "src"
sys.path.insert(0, str(backend_src))

from application.sld.layout import build_auto_layout_diagram


def _node_payload(node_id: UUID, name: str, in_service: bool = True) -> dict:
    return {
        "id": node_id,
        "name": name,
        "node_type": "PQ",
        "base_kv": 15.0,
        "attrs": {},
        "in_service": in_service,
    }


def _branch_payload(branch_id: UUID, from_id: UUID, to_id: UUID, in_service: bool = True) -> dict:
    return {
        "id": branch_id,
        "name": "L",
        "branch_type": "LINE",
        "from_node_id": from_id,
        "to_node_id": to_id,
        "in_service": in_service,
        "params": {},
    }


def _switch_payload(
    switch_id: UUID,
    from_id: UUID,
    to_id: UUID,
    switch_type: str = "BREAKER",
    state: str = "CLOSED",
    in_service: bool = True,
    name: str = "SW",
) -> dict:
    return {
        "id": switch_id,
        "name": name,
        "from_node_id": from_id,
        "to_node_id": to_id,
        "switch_type": switch_type,
        "state": state,
        "in_service": in_service,
    }


def test_layout_is_deterministic() -> None:
    """
    SLD-INV-006: Same input must produce identical output regardless of input order.
    """
    project_id = uuid4()
    node_a = uuid4()
    node_b = uuid4()
    node_c = uuid4()
    branch_ab = uuid4()
    branch_bc = uuid4()

    nodes_order_a = [
        _node_payload(node_a, "A"),
        _node_payload(node_b, "B"),
        _node_payload(node_c, "C"),
    ]
    nodes_order_b = [
        _node_payload(node_c, "C"),
        _node_payload(node_b, "B"),
        _node_payload(node_a, "A"),
    ]
    branches = [
        _branch_payload(branch_ab, node_a, node_b),
        _branch_payload(branch_bc, node_b, node_c),
    ]

    diagram_first = build_auto_layout_diagram(
        project_id=project_id,
        name="Main",
        nodes=nodes_order_a,
        branches=branches,
        connection_node_id=node_a,
    )
    diagram_second = build_auto_layout_diagram(
        project_id=project_id,
        name="Main",
        nodes=nodes_order_b,
        branches=reversed(branches),
        connection_node_id=node_a,
    )

    assert diagram_first.to_payload() == diagram_second.to_payload()


def test_bijection_no_helper_nodes() -> None:
    """
    SLD-INV-002: Each SLD symbol corresponds to exactly one model object.
    No helper/virtual nodes allowed.
    """
    project_id = uuid4()
    node_a = uuid4()
    node_b = uuid4()
    branch_ab = uuid4()

    nodes = [_node_payload(node_a, "A"), _node_payload(node_b, "B")]
    branches = [_branch_payload(branch_ab, node_a, node_b)]

    diagram = build_auto_layout_diagram(
        project_id=project_id,
        name="Bijection",
        nodes=nodes,
        branches=branches,
        connection_node_id=node_a,
    )

    payload = diagram.to_payload()

    # Bijection check: exactly 2 nodes (A, B) and 1 branch
    assert len(payload["nodes"]) == 2
    assert len(payload["branches"]) == 1

    # Each node symbol has node_id referencing input node
    node_ids_in_payload = {node["node_id"] for node in payload["nodes"]}
    assert node_ids_in_payload == {str(node_a), str(node_b)}

    # Each branch symbol has branch_id referencing input branch
    branch_ids_in_payload = {branch["branch_id"] for branch in payload["branches"]}
    assert branch_ids_in_payload == {str(branch_ab)}


def test_in_service_false_visible_in_sld() -> None:
    """
    SLD-INV-005: Elements with in_service=False are visible in SLD (grayed).
    Per ui_canonical_parity.md § C.2: out-of-service elements MUST remain visible.
    """
    project_id = uuid4()
    node_a = uuid4()
    node_b = uuid4()
    branch_ab = uuid4()

    nodes = [
        _node_payload(node_a, "A", in_service=True),
        _node_payload(node_b, "B", in_service=False),  # Out of service
    ]
    branches = [_branch_payload(branch_ab, node_a, node_b, in_service=False)]

    diagram = build_auto_layout_diagram(
        project_id=project_id,
        name="InService",
        nodes=nodes,
        branches=branches,
        connection_node_id=node_a,
    )

    payload = diagram.to_payload()

    # Both nodes must be present (even if in_service=False)
    assert len(payload["nodes"]) == 2

    # Branch must be present (even if in_service=False)
    assert len(payload["branches"]) == 1

    # Check in_service flag is preserved
    node_b_symbol = next(n for n in payload["nodes"] if n["node_id"] == str(node_b))
    assert node_b_symbol["in_service"] is False

    branch_symbol = payload["branches"][0]
    assert branch_symbol["in_service"] is False


def test_switch_open_closed_state() -> None:
    """
    SLD-INV-005: Switch.OPEN interrupts topology; Switch.CLOSED connects nodes.
    Per ui_canonical_parity.md § C.3: Switch.state affects topology differently than in_service.
    """
    project_id = uuid4()
    node_a = uuid4()
    node_b = uuid4()
    node_c = uuid4()
    switch_ab = uuid4()
    switch_bc = uuid4()

    nodes = [
        _node_payload(node_a, "A"),
        _node_payload(node_b, "B"),
        _node_payload(node_c, "C"),
    ]
    switches = [
        _switch_payload(switch_ab, node_a, node_b, state="CLOSED"),
        _switch_payload(switch_bc, node_b, node_c, state="OPEN"),  # Open
    ]

    diagram = build_auto_layout_diagram(
        project_id=project_id,
        name="SwitchState",
        nodes=nodes,
        branches=[],
        switches=switches,
        connection_node_id=node_a,
    )

    payload = diagram.to_payload()

    # Both switches must be present in SLD (visible regardless of state)
    assert len(payload["switches"]) == 2

    # Check switch states are preserved
    switch_ab_symbol = next(s for s in payload["switches"] if s["switch_id"] == str(switch_ab))
    assert switch_ab_symbol["state"] == "CLOSED"

    switch_bc_symbol = next(s for s in payload["switches"] if s["switch_id"] == str(switch_bc))
    assert switch_bc_symbol["state"] == "OPEN"


def test_switch_types_breaker_disconnector_fuse() -> None:
    """
    SLD-INV-002/005: Switch symbol variants (BREAKER, DISCONNECTOR, LOAD_SWITCH, FUSE).
    Per sld_rules.md § A.2: Switch has type variants.
    """
    project_id = uuid4()
    node_a = uuid4()
    node_b = uuid4()
    node_c = uuid4()
    node_d = uuid4()

    switches = [
        _switch_payload(uuid4(), node_a, node_b, switch_type="BREAKER", name="CB1"),
        _switch_payload(uuid4(), node_b, node_c, switch_type="DISCONNECTOR", name="DS1"),
        _switch_payload(uuid4(), node_c, node_d, switch_type="FUSE", name="FU1"),
    ]

    diagram = build_auto_layout_diagram(
        project_id=project_id,
        name="SwitchTypes",
        nodes=[
            _node_payload(node_a, "A"),
            _node_payload(node_b, "B"),
            _node_payload(node_c, "C"),
            _node_payload(node_d, "D"),
        ],
        branches=[],
        switches=switches,
        connection_node_id=node_a,
    )

    payload = diagram.to_payload()

    switch_types = {s["switch_type"] for s in payload["switches"]}
    assert switch_types == {"BREAKER", "DISCONNECTOR", "FUSE"}


def test_deterministic_with_switches() -> None:
    """
    SLD-INV-006: Determinism with switches in different input orders.
    """
    project_id = uuid4()
    node_a = uuid4()
    node_b = uuid4()
    switch_ab = uuid4()

    nodes = [_node_payload(node_a, "A"), _node_payload(node_b, "B")]
    switches_order_a = [_switch_payload(switch_ab, node_a, node_b)]
    switches_order_b = [_switch_payload(switch_ab, node_a, node_b)]  # Same but different list

    diagram_first = build_auto_layout_diagram(
        project_id=project_id,
        name="DeterminismSwitch",
        nodes=nodes,
        branches=[],
        switches=switches_order_a,
        connection_node_id=node_a,
    )
    diagram_second = build_auto_layout_diagram(
        project_id=project_id,
        name="DeterminismSwitch",
        nodes=list(reversed(nodes)),
        branches=[],
        switches=switches_order_b,
        connection_node_id=node_a,
    )

    assert diagram_first.to_payload() == diagram_second.to_payload()
