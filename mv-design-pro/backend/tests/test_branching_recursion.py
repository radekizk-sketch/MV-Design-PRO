"""
Test: Recursive branching — build graph with 3+ levels of branching.

Validates:
- Adjacency list correctness
- Spine/laterals classification
- Topology summary determinism
- Cycle detection
"""

from __future__ import annotations

from enm.topology_ops import (
    compute_topology_summary,
    create_branch,
    create_device,
    create_node,
)

# ---------------------------------------------------------------------------
# Fixture: build a real MV network step by step
# ---------------------------------------------------------------------------


def _build_real_mv_network() -> dict:
    """
    Build a real MV network with 3 levels of branching:

    Level 0: GPZ bus (source)
    Level 1: Main trunk — bus_gpz → bus_t1 → bus_t2 → bus_t3
    Level 2: Lateral from bus_t1 → bus_l1_1 → bus_l1_2
    Level 3: Sub-lateral from bus_l1_1 → bus_sl_1

    Plus:
    - Source at bus_gpz
    - Transformer TR1 at bus_t2 → bus_nn_1
    - Load at bus_nn_1
    - PV at bus_l1_2
    - Breaker at bus_gpz → bus_t1
    """
    enm: dict = {
        "header": {
            "enm_version": "1.0",
            "name": "Sieć testowa SN",
            "revision": 1,
            "hash_sha256": "",
            "defaults": {"frequency_hz": 50.0, "unit_system": "SI"},
        },
        "buses": [],
        "branches": [],
        "transformers": [],
        "sources": [],
        "loads": [],
        "generators": [],
        "substations": [],
        "bays": [],
        "junctions": [],
        "corridors": [],
        "measurements": [],
        "protection_assignments": [],
    }

    # Create buses (Level 0 - GPZ)
    result = create_node(
        enm, {"ref_id": "bus_gpz", "name": "Szyna GPZ", "voltage_kv": 15.0, "tags": ["source"]}
    )
    assert result.success
    enm = result.enm

    # Level 1 - Main trunk
    for i in range(1, 4):
        result = create_node(
            enm, {"ref_id": f"bus_t{i}", "name": f"Szyna T{i}", "voltage_kv": 15.0}
        )
        assert result.success
        enm = result.enm

    # Level 2 - Lateral from T1
    result = create_node(
        enm, {"ref_id": "bus_l1_1", "name": "Odgałęzienie L1.1", "voltage_kv": 15.0}
    )
    assert result.success
    enm = result.enm

    result = create_node(
        enm, {"ref_id": "bus_l1_2", "name": "Odgałęzienie L1.2", "voltage_kv": 15.0}
    )
    assert result.success
    enm = result.enm

    # Level 3 - Sub-lateral from L1.1
    result = create_node(
        enm, {"ref_id": "bus_sl_1", "name": "Pododgałęzienie SL1", "voltage_kv": 15.0}
    )
    assert result.success
    enm = result.enm

    # LV bus for transformer
    result = create_node(enm, {"ref_id": "bus_nn_1", "name": "Szyna nn TR1", "voltage_kv": 0.4})
    assert result.success
    enm = result.enm

    # Create branches - Main trunk
    trunk_branches = [
        ("line_gpz_t1", "Linia GPZ-T1", "bus_gpz", "bus_t1"),
        ("line_t1_t2", "Linia T1-T2", "bus_t1", "bus_t2"),
        ("line_t2_t3", "Linia T2-T3", "bus_t2", "bus_t3"),
    ]
    for ref, name, fr, to in trunk_branches:
        result = create_branch(
            enm,
            {
                "ref_id": ref,
                "name": name,
                "type": "line_overhead",
                "from_bus_ref": fr,
                "to_bus_ref": to,
                "length_km": 3.0,
                "r_ohm_per_km": 0.3,
                "x_ohm_per_km": 0.35,
            },
        )
        assert result.success, f"Failed: {ref}: {result.issues}"
        enm = result.enm

    # Lateral branches from T1
    result = create_branch(
        enm,
        {
            "ref_id": "line_t1_l11",
            "name": "Lateral T1→L1.1",
            "type": "cable",
            "from_bus_ref": "bus_t1",
            "to_bus_ref": "bus_l1_1",
            "length_km": 1.5,
            "r_ohm_per_km": 0.2,
            "x_ohm_per_km": 0.1,
        },
    )
    assert result.success
    enm = result.enm

    result = create_branch(
        enm,
        {
            "ref_id": "line_l11_l12",
            "name": "Lateral L1.1→L1.2",
            "type": "cable",
            "from_bus_ref": "bus_l1_1",
            "to_bus_ref": "bus_l1_2",
            "length_km": 0.8,
            "r_ohm_per_km": 0.2,
            "x_ohm_per_km": 0.1,
        },
    )
    assert result.success
    enm = result.enm

    # Sub-lateral from L1.1
    result = create_branch(
        enm,
        {
            "ref_id": "line_l11_sl1",
            "name": "Sub-lateral L1.1→SL1",
            "type": "cable",
            "from_bus_ref": "bus_l1_1",
            "to_bus_ref": "bus_sl_1",
            "length_km": 0.5,
            "r_ohm_per_km": 0.25,
            "x_ohm_per_km": 0.12,
        },
    )
    assert result.success
    enm = result.enm

    # Breaker at GPZ
    result = create_branch(
        enm,
        {
            "ref_id": "brk_gpz",
            "name": "Wyłącznik GPZ",
            "type": "breaker",
            "from_bus_ref": "bus_gpz",
            "to_bus_ref": "bus_t1",
        },
    )
    assert result.success
    enm = result.enm

    # Source
    result = create_device(
        enm,
        {
            "device_type": "source",
            "ref_id": "src_grid",
            "name": "Sieć zasilająca",
            "bus_ref": "bus_gpz",
            "model": "short_circuit_power",
            "sk3_mva": 250,
            "rx_ratio": 0.1,
        },
    )
    assert result.success
    enm = result.enm

    # Transformer TR1 at T2 → nn
    result = create_device(
        enm,
        {
            "device_type": "transformer",
            "ref_id": "trafo_1",
            "name": "TR1 15/0.4",
            "hv_bus_ref": "bus_t2",
            "lv_bus_ref": "bus_nn_1",
            "sn_mva": 0.63,
            "uhv_kv": 15.0,
            "ulv_kv": 0.4,
            "uk_percent": 6.0,
            "pk_kw": 7.5,
            "vector_group": "Dyn5",
        },
    )
    assert result.success
    enm = result.enm

    # Load at nn
    result = create_device(
        enm,
        {
            "device_type": "load",
            "ref_id": "load_1",
            "name": "Odbiór ST1",
            "bus_ref": "bus_nn_1",
            "p_mw": 0.3,
            "q_mvar": 0.1,
        },
    )
    assert result.success
    enm = result.enm

    # PV at lateral end
    result = create_device(
        enm,
        {
            "device_type": "generator",
            "ref_id": "pv_1",
            "name": "PV L1.2",
            "bus_ref": "bus_l1_2",
            "p_mw": 0.5,
            "gen_type": "pv_inverter",
        },
    )
    assert result.success
    enm = result.enm

    return enm


# ---------------------------------------------------------------------------
# TESTS
# ---------------------------------------------------------------------------


class TestBranchingRecursion:
    """Build graph with min 3 levels of branching; validate adjacency + summary."""

    def test_build_real_network(self):
        """Network builds successfully with all elements."""
        enm = _build_real_mv_network()
        assert len(enm["buses"]) == 8  # gpz + t1-t3 + l1_1 + l1_2 + sl_1 + nn_1
        assert len(enm["branches"]) == 7  # 3 trunk + 2 lateral + 1 sub-lat + 1 breaker
        assert len(enm["transformers"]) == 1
        assert len(enm["sources"]) == 1
        assert len(enm["loads"]) == 1
        assert len(enm["generators"]) == 1

    def test_topology_summary_structure(self):
        """Topology summary correctly identifies graph structure."""
        enm = _build_real_mv_network()
        summary = compute_topology_summary(enm)

        assert summary.bus_count == 8
        assert summary.branch_count == 7
        assert summary.transformer_count == 1
        assert summary.source_count == 1
        assert summary.load_count == 1
        assert summary.generator_count == 1

    def test_topology_is_radial(self):
        """Network without cycles is identified as radial."""
        enm = _build_real_mv_network()
        summary = compute_topology_summary(enm)
        assert summary.is_radial is True
        assert summary.has_cycles is False

    def test_adjacency_completeness(self):
        """Adjacency list contains all connections (bidirectional)."""
        enm = _build_real_mv_network()
        summary = compute_topology_summary(enm)

        # Each branch produces 2 adjacency entries (bidirectional)
        # 7 branches + 1 transformer = 8 connections → 16 adjacency entries
        assert len(summary.adjacency) == 16

        # Check specific connections
        adj_set = {(e.bus_ref, e.neighbor_ref) for e in summary.adjacency}
        assert ("bus_gpz", "bus_t1") in adj_set
        assert ("bus_t1", "bus_gpz") in adj_set
        assert ("bus_t1", "bus_l1_1") in adj_set
        assert ("bus_l1_1", "bus_sl_1") in adj_set
        assert ("bus_t2", "bus_nn_1") in adj_set  # transformer

    def test_spine_from_source(self):
        """Spine starts from source bus and covers all reachable nodes."""
        enm = _build_real_mv_network()
        summary = compute_topology_summary(enm)

        spine_refs = {s.bus_ref for s in summary.spine}
        # All buses should be reachable from source
        all_bus_refs = {b["ref_id"] for b in enm["buses"]}
        assert spine_refs == all_bus_refs

        # Source bus should have depth 0
        source_spine = next(s for s in summary.spine if s.bus_ref == "bus_gpz")
        assert source_spine.depth == 0
        assert source_spine.is_source is True

    def test_lateral_detection(self):
        """Lateral roots are correctly identified."""
        enm = _build_real_mv_network()
        summary = compute_topology_summary(enm)

        # bus_t1 has children: bus_t2, bus_l1_1 (and bus_gpz is parent)
        # bus_l1_1 has children: bus_l1_2, bus_sl_1
        # These are lateral branches
        assert len(summary.lateral_roots) > 0

    def test_three_level_depth(self):
        """Spine covers at least 3 levels of depth."""
        enm = _build_real_mv_network()
        summary = compute_topology_summary(enm)

        max_depth = max(s.depth for s in summary.spine)
        assert max_depth >= 3, f"Expected depth >= 3, got {max_depth}"

    def test_adding_cycle_changes_radial_status(self):
        """Adding a cycle makes the network non-radial."""
        enm = _build_real_mv_network()

        # Confirm it's radial first
        summary = compute_topology_summary(enm)
        assert summary.is_radial is True

        # Add a branch that creates a cycle: bus_t3 → bus_l1_2
        result = create_node(enm, {"ref_id": "bus_bridge", "name": "Bridge", "voltage_kv": 15.0})
        # Actually, just add direct cycle branch
        result = create_branch(
            enm,
            {
                "ref_id": "line_cycle",
                "name": "Cycle line",
                "type": "line_overhead",
                "from_bus_ref": "bus_t3",
                "to_bus_ref": "bus_l1_2",
                "length_km": 1.0,
                "r_ohm_per_km": 0.3,
                "x_ohm_per_km": 0.3,
            },
        )
        assert result.success is True  # Should succeed with cycle warning

        enm_with_cycle = result.enm
        summary = compute_topology_summary(enm_with_cycle)
        assert summary.has_cycles is True
        assert summary.is_radial is False


class TestMultiLevelRecursion:
    """Test deeply nested branching structure."""

    def test_five_level_branching(self):
        """Build a 5-level deep branching structure."""
        enm: dict = {
            "header": {
                "enm_version": "1.0",
                "name": "Deep network",
                "revision": 1,
                "hash_sha256": "",
                "defaults": {"frequency_hz": 50.0, "unit_system": "SI"},
            },
            "buses": [],
            "branches": [],
            "transformers": [],
            "sources": [],
            "loads": [],
            "generators": [],
            "substations": [],
            "bays": [],
            "junctions": [],
            "corridors": [],
            "measurements": [],
            "protection_assignments": [],
        }

        # Create source bus
        result = create_node(enm, {"ref_id": "root", "name": "Root", "voltage_kv": 15})
        enm = result.enm

        # Build 5 levels of branching
        prev_ref = "root"
        for level in range(5):
            for branch_idx in range(2):  # 2 branches per node
                bus_ref = f"bus_L{level}_B{branch_idx}"
                result = create_node(
                    enm,
                    {
                        "ref_id": bus_ref,
                        "name": f"Bus L{level} B{branch_idx}",
                        "voltage_kv": 15,
                    },
                )
                assert result.success
                enm = result.enm

                line_ref = f"line_L{level}_B{branch_idx}"
                result = create_branch(
                    enm,
                    {
                        "ref_id": line_ref,
                        "name": f"Line L{level} B{branch_idx}",
                        "type": "cable",
                        "from_bus_ref": prev_ref,
                        "to_bus_ref": bus_ref,
                        "length_km": 1.0,
                        "r_ohm_per_km": 0.2,
                        "x_ohm_per_km": 0.1,
                    },
                )
                assert result.success
                enm = result.enm

            prev_ref = f"bus_L{level}_B0"  # Follow first branch to next level

        # Add source
        result = create_device(
            enm,
            {
                "device_type": "source",
                "ref_id": "src",
                "name": "Grid",
                "bus_ref": "root",
                "model": "short_circuit_power",
                "sk3_mva": 200,
            },
        )
        assert result.success
        enm = result.enm

        summary = compute_topology_summary(enm)
        assert summary.bus_count == 11  # 1 root + 10 (2 per level * 5 levels)
        assert summary.branch_count == 10

        max_depth = max(s.depth for s in summary.spine)
        assert max_depth >= 5

    def test_summary_determinism_deep_network(self):
        """Deep network produces deterministic summary."""
        enm1 = self._build_deep_network()
        enm2 = self._build_deep_network()

        s1 = compute_topology_summary(enm1)
        s2 = compute_topology_summary(enm2)

        assert s1.bus_count == s2.bus_count
        assert s1.spine == s2.spine
        assert s1.adjacency == s2.adjacency
        assert s1.lateral_roots == s2.lateral_roots

    def _build_deep_network(self) -> dict:
        """Helper: build deterministic deep network."""
        enm: dict = {
            "header": {
                "enm_version": "1.0",
                "name": "Deep",
                "revision": 1,
                "hash_sha256": "",
                "defaults": {"frequency_hz": 50.0, "unit_system": "SI"},
            },
            "buses": [],
            "branches": [],
            "transformers": [],
            "sources": [],
            "loads": [],
            "generators": [],
            "substations": [],
            "bays": [],
            "junctions": [],
            "corridors": [],
            "measurements": [],
            "protection_assignments": [],
        }
        result = create_node(enm, {"ref_id": "r", "name": "R", "voltage_kv": 15})
        enm = result.enm

        prev = "r"
        for i in range(3):
            ref = f"n{i}"
            result = create_node(enm, {"ref_id": ref, "name": ref, "voltage_kv": 15})
            enm = result.enm
            result = create_branch(
                enm,
                {
                    "ref_id": f"b{i}",
                    "name": f"b{i}",
                    "type": "cable",
                    "from_bus_ref": prev,
                    "to_bus_ref": ref,
                    "length_km": 1,
                    "r_ohm_per_km": 0.2,
                    "x_ohm_per_km": 0.1,
                },
            )
            enm = result.enm
            prev = ref

        result = create_device(
            enm,
            {
                "device_type": "source",
                "ref_id": "s",
                "name": "S",
                "bus_ref": "r",
                "model": "short_circuit_power",
                "sk3_mva": 200,
            },
        )
        enm = result.enm
        return enm
