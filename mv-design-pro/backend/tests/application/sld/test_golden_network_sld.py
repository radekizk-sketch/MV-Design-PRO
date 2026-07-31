"""
Integration tests: Golden Network SN -> SLD Auto-Layout.

Verifies that the full MV network topology (GPZ + 3 feeders + 20 stations
+ ring + OZE) is correctly converted and laid out as an SLD diagram.

PR-SLD-NET-01 DoD:
- Bijection: each model element -> exactly one SLD symbol
- Determinism: same graph -> identical diagram
- Switch states: OPEN/CLOSED preserved, OPEN does not affect topology
- Voltage hierarchy: source at top, loads at bottom (vertical mode)
- No collisions: distinct positions per element
- All topologies: radial, ring with NO, sub-branches, OZE, mixed OHL/cable
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

backend_src = Path(__file__).parents[3] / "src"
sys.path.insert(0, str(backend_src))

from application.sld.network_graph_to_sld import (
    _to_uuid,
    build_sld_from_network_graph,
    convert_graph_to_sld_payload,
)

# Import golden network przez PELNA nazwe pakietu testowego (KD-9). Wczesniej
# ten modul dokladal katalog `tests/` na poczatek `sys.path`, co czynilo z
# `tests/reference_engine/` i `tests/enm/` pakiety przeslaniajace pakiety
# zrodlowe o tych samych nazwach.
from tests.golden.golden_network_sn import (
    build_golden_network,
    get_golden_network_statistics,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def golden_graph():
    """Build the golden network once per test function."""
    return build_golden_network()


@pytest.fixture
def golden_payload(golden_graph):
    """Convert golden graph to SLD payload."""
    return convert_graph_to_sld_payload(golden_graph)


@pytest.fixture
def golden_sld(golden_graph):
    """Build full SLD diagram from golden network."""
    return build_sld_from_network_graph(golden_graph, name="Golden SLD")


# ---------------------------------------------------------------------------
# Adapter Tests (convert_graph_to_sld_payload)
# ---------------------------------------------------------------------------


class TestAdapterConversion:
    """Tests for NetworkGraph -> SLD payload adapter."""

    def test_all_nodes_converted(self, golden_graph, golden_payload):
        """Every graph node must appear in the payload."""
        assert len(golden_payload["nodes"]) == len(golden_graph.nodes)

    def test_all_branches_converted(self, golden_graph, golden_payload):
        """Every graph branch must appear in the payload."""
        assert len(golden_payload["branches"]) == len(golden_graph.branches)

    def test_all_switches_converted(self, golden_graph, golden_payload):
        """Every graph switch must appear in the payload."""
        assert len(golden_payload["switches"]) == len(golden_graph.switches)

    def test_uuid_mapping_deterministic(self, golden_graph):
        """Same graph -> same UUIDs on every call."""
        p1 = convert_graph_to_sld_payload(golden_graph)
        p2 = convert_graph_to_sld_payload(golden_graph)
        assert p1["nodes"] == p2["nodes"]
        assert p1["branches"] == p2["branches"]
        assert p1["switches"] == p2["switches"]
        assert p1["connection_node_id"] == p2["connection_node_id"]

    def test_uuid_mapping_covers_all_ids(self, golden_graph, golden_payload):
        """id_map must contain entries for all nodes, branches, switches."""
        id_map = golden_payload["id_map"]
        for nid in golden_graph.nodes:
            assert nid in id_map
        for bid in golden_graph.branches:
            assert bid in id_map
        for sid in golden_graph.switches:
            assert sid in id_map

    def test_all_uuids_unique(self, golden_payload):
        """All generated UUIDs must be unique across element types."""
        all_uuids = set()
        for node in golden_payload["nodes"]:
            all_uuids.add(node["id"])
        for branch in golden_payload["branches"]:
            all_uuids.add(branch["id"])
        for switch in golden_payload["switches"]:
            all_uuids.add(switch["id"])
        total = (
            len(golden_payload["nodes"])
            + len(golden_payload["branches"])
            + len(golden_payload["switches"])
        )
        assert len(all_uuids) == total

    def test_connection_node_node_is_slack(self, golden_graph, golden_payload):
        """BoundaryNode node in payload must correspond to the SLACK node."""
        slack = golden_graph.get_slack_node()
        expected_uuid = _to_uuid(slack.id)
        assert golden_payload["connection_node_id"] == expected_uuid

    def test_switch_states_preserved(self, golden_graph, golden_payload):
        """Switch state (OPEN/CLOSED) must be preserved in payload."""
        id_map = golden_payload["id_map"]
        for sw in golden_graph.switches.values():
            payload_sw = next(s for s in golden_payload["switches"] if s["id"] == id_map[sw.id])
            assert payload_sw["state"] == sw.state.value
            assert payload_sw["switch_type"] == sw.switch_type.value

    def test_voltage_metadata_included(self, golden_payload):
        """All nodes must include voltage_kv metadata."""
        for node in golden_payload["nodes"]:
            assert "voltage_kv" in node
            assert node["voltage_kv"] > 0

    def test_branch_type_metadata_included(self, golden_payload):
        """All branches must include branch_type metadata."""
        for branch in golden_payload["branches"]:
            assert "branch_type" in branch
            assert branch["branch_type"] in {"LINE", "TRANSFORMER"}


# ---------------------------------------------------------------------------
# SLD Diagram Bijection Tests
# ---------------------------------------------------------------------------


class TestSldBijection:
    """SLD-INV-002: Each SLD symbol <-> exactly one model object."""

    def test_node_count_matches(self, golden_graph, golden_sld):
        """Number of SLD node symbols must equal graph nodes."""
        assert len(golden_sld.nodes) == len(golden_graph.nodes)

    def test_branch_count_matches(self, golden_graph, golden_sld):
        """Number of SLD branch symbols must equal graph branches."""
        assert len(golden_sld.branches) == len(golden_graph.branches)

    def test_switch_count_matches(self, golden_graph, golden_sld):
        """Number of SLD switch symbols must equal graph switches."""
        assert len(golden_sld.switches) == len(golden_graph.switches)

    def test_no_helper_nodes(self, golden_graph, golden_sld):
        """Total symbols must equal total model objects (no helpers)."""
        total_model = (
            len(golden_graph.nodes) + len(golden_graph.branches) + len(golden_graph.switches)
        )
        total_sld = len(golden_sld.nodes) + len(golden_sld.branches) + len(golden_sld.switches)
        assert total_sld == total_model

    def test_all_node_ids_referenced(self, golden_graph, golden_sld):
        """Each SLD node symbol must reference a valid graph node."""
        id_map = convert_graph_to_sld_payload(golden_graph)["id_map"]
        expected_uuids = {id_map[nid] for nid in golden_graph.nodes}
        actual_uuids = {ns.node_id for ns in golden_sld.nodes}
        assert actual_uuids == expected_uuids


# ---------------------------------------------------------------------------
# Determinism Tests
# ---------------------------------------------------------------------------


class TestSldDeterminism:
    """SLD-INV-006: Same input -> identical output."""

    def test_same_graph_identical_diagram(self, golden_graph):
        """Building SLD twice from same graph must produce identical payload."""
        sld1 = build_sld_from_network_graph(golden_graph, name="D1")
        sld2 = build_sld_from_network_graph(golden_graph, name="D1")
        assert sld1.to_payload() == sld2.to_payload()

    def test_positions_identical_across_builds(self, golden_graph):
        """Node positions must be bitwise identical across builds."""
        sld1 = build_sld_from_network_graph(golden_graph, name="P1")
        sld2 = build_sld_from_network_graph(golden_graph, name="P1")
        pos1 = {(n.node_id, n.x, n.y) for n in sld1.nodes}
        pos2 = {(n.node_id, n.x, n.y) for n in sld2.nodes}
        assert pos1 == pos2


# ---------------------------------------------------------------------------
# Topology Tests
# ---------------------------------------------------------------------------


class TestSldTopology:
    """Verify correct handling of all network topologies."""

    def test_open_switches_present_in_sld(self, golden_graph, golden_sld):
        """OPEN switches must be visible in SLD (not filtered out)."""
        open_switches_in_graph = [s for s in golden_graph.switches.values() if s.is_open]
        assert len(open_switches_in_graph) >= 3  # coupler, NO ring, rezerwa C8

        id_map = convert_graph_to_sld_payload(golden_graph)["id_map"]
        for sw in open_switches_in_graph:
            sld_sw = next(
                (s for s in golden_sld.switches if s.switch_id == id_map[sw.id]),
                None,
            )
            assert sld_sw is not None, f"Open switch {sw.name} missing from SLD"
            assert sld_sw.state == "OPEN"

    def test_closed_switches_present_in_sld(self, golden_graph, golden_sld):
        """CLOSED switches must be visible in SLD."""
        closed_switches_in_graph = [s for s in golden_graph.switches.values() if s.is_closed]
        assert len(closed_switches_in_graph) >= 10

        id_map = convert_graph_to_sld_payload(golden_graph)["id_map"]
        for sw in closed_switches_in_graph:
            sld_sw = next(
                (s for s in golden_sld.switches if s.switch_id == id_map[sw.id]),
                None,
            )
            assert sld_sw is not None, f"Closed switch {sw.name} missing from SLD"
            assert sld_sw.state == "CLOSED"

    def test_ring_topology_visible(self, golden_graph, golden_sld):
        """Ring topology elements (NO switch, ring line) must be in SLD."""
        id_map = convert_graph_to_sld_payload(golden_graph)["id_map"]

        # NO ring switch
        no_switch_uuid = id_map["sw-no-ring"]
        sld_no_sw = next((s for s in golden_sld.switches if s.switch_id == no_switch_uuid), None)
        assert sld_no_sw is not None
        assert sld_no_sw.state == "OPEN"
        assert sld_no_sw.switch_type == "LOAD_SWITCH"

        # Ring line segment (line-b9)
        ring_line_uuid = id_map["line-b9"]
        sld_ring_branch = next(
            (b for b in golden_sld.branches if b.branch_id == ring_line_uuid), None
        )
        assert sld_ring_branch is not None

    def test_sub_branch_topology(self, golden_graph, golden_sld):
        """Sub-branches (A11/A12 from A5, B10 from B4) must be in SLD."""
        id_map = convert_graph_to_sld_payload(golden_graph)["id_map"]

        for line_id in ["line-a11", "line-a12", "line-b10"]:
            line_uuid = id_map[line_id]
            sld_branch = next((b for b in golden_sld.branches if b.branch_id == line_uuid), None)
            assert sld_branch is not None, f"Sub-branch {line_id} missing from SLD"

    def test_oze_nodes_in_sld(self, golden_graph, golden_sld):
        """OZE nodes (PV farm, BESS) must be in SLD."""
        id_map = convert_graph_to_sld_payload(golden_graph)["id_map"]

        for bus_id in ["bus-c5-pv", "bus-c6-bess"]:
            bus_uuid = id_map[bus_id]
            sld_node = next((n for n in golden_sld.nodes if n.node_id == bus_uuid), None)
            assert sld_node is not None, f"OZE bus {bus_id} missing from SLD"

    def test_switch_types_preserved(self, golden_graph, golden_sld):
        """All switch types (BREAKER, DISCONNECTOR, LOAD_SWITCH, RECLOSER) in SLD."""
        switch_types = {s.switch_type for s in golden_sld.switches}
        assert "BREAKER" in switch_types
        assert "DISCONNECTOR" in switch_types
        assert "LOAD_SWITCH" in switch_types
        assert "RECLOSER" in switch_types


# ---------------------------------------------------------------------------
# Position / Layout Tests
# ---------------------------------------------------------------------------


class TestSldPositions:
    """Verify position quality of the auto-layout."""

    def test_all_nodes_have_positions(self, golden_sld):
        """Every node symbol must have defined (x, y) coordinates."""
        for node in golden_sld.nodes:
            assert isinstance(node.x, float)
            assert isinstance(node.y, float)

    def test_no_overlapping_node_positions(self, golden_sld):
        """No two node symbols at the exact same position."""
        positions = [(n.x, n.y) for n in golden_sld.nodes]
        assert len(set(positions)) == len(positions), "Overlapping node positions"

    def test_root_node_at_minimum_y(self, golden_graph, golden_sld):
        """SLACK (root) node should be at top of diagram (minimum Y)."""
        id_map = convert_graph_to_sld_payload(golden_graph)["id_map"]
        slack_uuid = id_map["bus-system-ref"]
        slack_symbol = next(n for n in golden_sld.nodes if n.node_id == slack_uuid)
        min_y = min(n.y for n in golden_sld.nodes)
        assert slack_symbol.y == min_y

    def test_voltage_hierarchy_general(self, golden_graph, golden_sld):
        """WN nodes should generally be above SN nodes (lower Y = higher on diagram)."""
        id_map = convert_graph_to_sld_payload(golden_graph)["id_map"]

        def avg_y_for_voltage(vl_min: float, vl_max: float) -> float:
            matching = [
                nid
                for nid, node in golden_graph.nodes.items()
                if vl_min <= node.voltage_level <= vl_max
            ]
            if not matching:
                return 0.0
            y_values = []
            for nid in matching:
                uuid = id_map[nid]
                sym = next((n for n in golden_sld.nodes if n.node_id == uuid), None)
                if sym:
                    y_values.append(sym.y)
            return sum(y_values) / len(y_values) if y_values else 0.0

        avg_wn = avg_y_for_voltage(60.0, 200.0)  # WN: 110 kV
        avg_sn = avg_y_for_voltage(1.1, 59.0)  # SN: 15 kV
        avg_nn = avg_y_for_voltage(0.0, 1.0)  # nN: 0.4 kV

        # WN should be above (lower Y) than SN
        assert avg_wn < avg_sn, f"WN avg_y={avg_wn} should be < SN avg_y={avg_sn}"
        # SN should be above (lower Y) than nN
        assert avg_sn < avg_nn, f"SN avg_y={avg_sn} should be < nN avg_y={avg_nn}"

    def test_branch_endpoints_match_nodes(self, golden_sld):
        """Branch symbol endpoints must match their connected node positions."""
        node_pos = {n.node_id: (n.x, n.y) for n in golden_sld.nodes}
        for branch in golden_sld.branches:
            from_pos = node_pos.get(branch.from_node_id)
            to_pos = node_pos.get(branch.to_node_id)
            if from_pos and to_pos:
                assert branch.points[0] == from_pos
                assert branch.points[1] == to_pos

    def test_switch_midpoint_between_nodes(self, golden_sld):
        """Switch symbols should be positioned at midpoint between nodes."""
        node_pos = {n.node_id: (n.x, n.y) for n in golden_sld.nodes}
        for sw in golden_sld.switches:
            from_pos = node_pos.get(sw.from_node_id)
            to_pos = node_pos.get(sw.to_node_id)
            if from_pos and to_pos:
                expected_x = (from_pos[0] + to_pos[0]) / 2
                expected_y = (from_pos[1] + to_pos[1]) / 2
                assert abs(sw.x - expected_x) < 0.01
                assert abs(sw.y - expected_y) < 0.01


# ---------------------------------------------------------------------------
# Scale / Coverage Tests
# ---------------------------------------------------------------------------


class TestSldScale:
    """Verify the golden network SLD covers the full expected topology."""

    def test_golden_network_statistics(self, golden_graph):
        """Cross-check statistics of the golden network."""
        stats = get_golden_network_statistics(golden_graph)
        assert stats["wezly"] >= 40
        assert stats["galezi_liniowe"] >= 30
        assert stats["transformatory_wn_sn"] == 2
        assert stats["transformatory_sn_nn"] == 20
        assert stats["laczniki"] >= 15
        assert stats["laczniki_otwarte"] >= 3
        assert stats["reklozery"] >= 1
        assert stats["stacje"] == 20
        assert stats["inwertery"] == 2

    def test_sld_contains_all_20_stations(self, golden_graph, golden_sld):
        """All 20 station transformers must be visible in SLD."""
        id_map = convert_graph_to_sld_payload(golden_graph)["id_map"]
        for i in range(1, 21):
            station_id = f"st{i:02d}"
            tr_id = f"tr-{station_id}"
            tr_uuid = id_map[tr_id]
            sld_branch = next((b for b in golden_sld.branches if b.branch_id == tr_uuid), None)
            assert sld_branch is not None, f"Station {station_id} transformer missing from SLD"

    def test_sld_contains_wn_sn_transformers(self, golden_graph, golden_sld):
        """Both GPZ WN/SN transformers must be in SLD."""
        id_map = convert_graph_to_sld_payload(golden_graph)["id_map"]
        for tr_id in ["tr-gpz-1", "tr-gpz-2"]:
            tr_uuid = id_map[tr_id]
            sld_branch = next((b for b in golden_sld.branches if b.branch_id == tr_uuid), None)
            assert sld_branch is not None, f"{tr_id} missing from SLD"

    def test_all_three_feeders_present(self, golden_graph, golden_sld):
        """Magistrala A, B, C bay nodes must be in SLD."""
        id_map = convert_graph_to_sld_payload(golden_graph)["id_map"]
        for bay_id in ["bus-bay-a", "bus-bay-b", "bus-bay-c"]:
            bay_uuid = id_map[bay_id]
            sld_node = next((n for n in golden_sld.nodes if n.node_id == bay_uuid), None)
            assert sld_node is not None, f"Feeder bay {bay_id} missing from SLD"


# ---------------------------------------------------------------------------
# Payload Serialization Tests
# ---------------------------------------------------------------------------


class TestSldPayload:
    """Verify SldDiagram payload serialization."""

    def test_to_payload_roundtrip(self, golden_sld):
        """to_payload() must return a valid serializable dict."""
        payload = golden_sld.to_payload()
        assert isinstance(payload, dict)
        assert "version" in payload
        assert payload["version"] == 1
        assert isinstance(payload["nodes"], list)
        assert isinstance(payload["branches"], list)
        assert isinstance(payload["switches"], list)

    def test_payload_node_ids_are_strings(self, golden_sld):
        """Serialized node IDs must be strings (JSON-compatible)."""
        payload = golden_sld.to_payload()
        for node in payload["nodes"]:
            assert isinstance(node["id"], str)
            assert isinstance(node["node_id"], str)

    def test_payload_branch_points_are_dicts(self, golden_sld):
        """Serialized branch points must be {x, y} dicts."""
        payload = golden_sld.to_payload()
        for branch in payload["branches"]:
            for point in branch["points"]:
                assert "x" in point
                assert "y" in point

    def test_payload_switch_has_all_fields(self, golden_sld):
        """Serialized switches must have type, state, position, label."""
        payload = golden_sld.to_payload()
        for sw in payload["switches"]:
            assert "switch_type" in sw
            assert "state" in sw
            assert "x" in sw
            assert "y" in sw
            assert "in_service" in sw
