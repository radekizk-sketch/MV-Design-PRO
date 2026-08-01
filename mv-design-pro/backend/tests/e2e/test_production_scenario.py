"""
E2E Production Scenario Test — §13 Deterministic scenario.

Validates the canonical startup scenario with catalog bindings,
materialization and determinism (100× identical hash).

Steps:
1. Create empty network graph
2. Add grid source (GPZ)
3. Add trunk segment ×3 (with catalog binding)
4. Check snapshot changes after operation
5. Check snapshot fingerprint determinism
6. Validate materialized parameters

Gotowości NIE sprawdza już ten plik: `check_snapshot_readiness` był martwym
checkerem (żaden moduł produkcyjny go nie wołał — jedynym konsumentem były te
testy), usuniętym wraz z kartą A audytu szczytu 2026-08-01. Gotowość produkcyjna
powstaje w bramach operacji domenowych (`domain_ops_policy` + `ENMValidator`) i
tam jest sprawdzana — m.in. tests/api/test_brama_katalogowa_stacji_koncowej.py.
"""

import pytest
from network_model.catalog.materialization import (
    materialize_catalog_binding,
)
from network_model.catalog.repository import CatalogRepository, get_default_mv_catalog
from network_model.catalog.types import CatalogBinding, CatalogNamespace
from network_model.core.branch import BranchType, LineBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from network_model.core.snapshot import (
    NetworkSnapshot,
    create_network_snapshot,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def catalog() -> CatalogRepository:
    """Get the default MV catalog."""
    return get_default_mv_catalog()


def _build_source_node(node_id: str = "GPZ_BUS_001") -> Node:
    """Build a grid source node with valid parameters."""
    return Node(
        id=node_id,
        name="GPZ Szyna SN",
        node_type=NodeType.SLACK,
        voltage_magnitude=15.0,
        voltage_angle=0.0,
        active_power=0.0,
        reactive_power=0.0,
    )


def _build_pq_node(node_id: str, name: str = "Szyna SN") -> Node:
    """Build a PQ load node."""
    return Node(
        id=node_id,
        name=name,
        node_type=NodeType.PQ,
        voltage_magnitude=15.0,
        voltage_angle=0.0,
        active_power=0.0,
        reactive_power=0.0,
    )


def _build_line_branch(
    branch_id: str,
    from_node: str,
    to_node: str,
    catalog_item_id: str,
    r_ohm_per_km: float = 0.206,
    x_ohm_per_km: float = 0.074,
    length_km: float = 0.25,
) -> LineBranch:
    """Build a cable branch with catalog binding."""
    return LineBranch(
        id=branch_id,
        name=f"Odcinek {branch_id}",
        from_node_id=from_node,
        to_node_id=to_node,
        branch_type=BranchType.CABLE,
        r_ohm_per_km=r_ohm_per_km,
        x_ohm_per_km=x_ohm_per_km,
        b_us_per_km=0.0,
        length_km=length_km,
        rated_current_a=300.0,
    )


# ---------------------------------------------------------------------------
# Scenario steps
# ---------------------------------------------------------------------------


class TestProductionScenario:
    """12-step E2E production scenario (§13)."""

    def test_step01_create_empty_graph(self) -> None:
        """Step 1: Create empty network graph."""
        graph = NetworkGraph()
        assert len(graph.nodes) == 0
        assert len(graph.branches) == 0

    def test_step02_add_grid_source(self) -> None:
        """Step 2: Add grid source (GPZ) node."""
        graph = NetworkGraph()
        source = _build_source_node()
        graph.add_node(source)

        snapshot = create_network_snapshot(
            graph,
            network_model_id="NM_001",
            snapshot_id="SNAP_0001",
            created_at="2026-02-20T12:00:00Z",
        )

        assert len(snapshot.graph.nodes) == 1
        assert "GPZ_BUS_001" in snapshot.graph.nodes
        assert snapshot.fingerprint

    def test_step03_add_trunk_segments(self, catalog: CatalogRepository) -> None:
        """Step 3: Add 3 trunk segments with catalog binding."""
        graph = NetworkGraph()

        # Add source
        graph.add_node(_build_source_node("GPZ_BUS_001"))

        # Add intermediate nodes
        for i in range(1, 4):
            graph.add_node(_build_pq_node(f"BUS_SN_{i:03d}", f"Szyna SN {i}"))

        # Get a cable type from catalog
        cable_types = catalog.list_cable_types()
        assert len(cable_types) > 0, "Catalog must have cable types"
        cable = cable_types[0]

        # Add 3 trunk segments
        segments = [
            ("SEG_001", "GPZ_BUS_001", "BUS_SN_001"),
            ("SEG_002", "BUS_SN_001", "BUS_SN_002"),
            ("SEG_003", "BUS_SN_002", "BUS_SN_003"),
        ]

        for seg_id, from_n, to_n in segments:
            branch = _build_line_branch(
                seg_id,
                from_n,
                to_n,
                catalog_item_id=cable.id,
                r_ohm_per_km=cable.r_ohm_per_km,
                x_ohm_per_km=cable.x_ohm_per_km,
                length_km=0.25,
            )
            graph.add_branch(branch)

        snapshot = create_network_snapshot(
            graph,
            network_model_id="NM_001",
            snapshot_id="SNAP_0004",
            created_at="2026-02-20T12:01:00Z",
        )

        assert len(snapshot.graph.branches) == 3
        assert snapshot.fingerprint

    def test_step04_snapshot_changes_after_operation(self) -> None:
        """Step 4: Snapshot fingerprint changes after adding element."""
        graph = NetworkGraph()
        graph.add_node(_build_source_node())

        snap1 = create_network_snapshot(
            graph,
            network_model_id="NM_001",
            snapshot_id="SNAP_A",
            created_at="2026-02-20T12:00:00Z",
        )
        fp1 = snap1.fingerprint

        # Add another node
        graph.add_node(_build_pq_node("BUS_NEW_001"))
        snap2 = create_network_snapshot(
            graph,
            network_model_id="NM_001",
            snapshot_id="SNAP_B",
            parent_snapshot_id="SNAP_A",
            created_at="2026-02-20T12:01:00Z",
        )
        fp2 = snap2.fingerprint

        assert fp1 != fp2, "Snapshot fingerprint must change after adding element"

    def test_step05_catalog_materialization(self, catalog: CatalogRepository) -> None:
        """Step 5: Catalog materialization produces solver_fields."""
        cable_types = catalog.list_cable_types()
        if not cable_types:
            pytest.skip("No cable types")

        cable = cable_types[0]
        binding = CatalogBinding(
            catalog_namespace=CatalogNamespace.KABEL_SN.value,
            catalog_item_id=cable.id,
            catalog_item_version="2026.01",
            materialize=True,
        )

        result = materialize_catalog_binding(binding, catalog)
        assert result.success
        assert result.solver_fields["r_ohm_per_km"] == cable.r_ohm_per_km

    def test_step06_transformer_voltage_from_catalog(self, catalog: CatalogRepository) -> None:
        """Step 6: Transformer U_dolne comes ONLY from catalog."""
        trafo_types = catalog.list_transformer_types()
        if not trafo_types:
            pytest.skip("No transformer types")

        trafo = trafo_types[0]
        binding = CatalogBinding(
            catalog_namespace=CatalogNamespace.TRAFO_SN_NN.value,
            catalog_item_id=trafo.id,
            catalog_item_version="2026.01",
            materialize=True,
        )

        result = materialize_catalog_binding(binding, catalog)
        assert result.success
        assert result.solver_fields["voltage_lv_kv"] == trafo.voltage_lv_kv
        assert result.solver_fields["voltage_lv_kv"] > 0

    def test_step10_fingerprint_100x_determinism(self) -> None:
        """Step 10: 100× fingerprint determinism test."""
        graph = NetworkGraph()
        graph.add_node(_build_source_node())
        graph.add_node(_build_pq_node("BUS_001"))
        graph.add_branch(
            _build_line_branch("SEG_1", "GPZ_BUS_001", "BUS_001", "test", length_km=0.5)
        )

        first_snapshot = create_network_snapshot(
            graph,
            network_model_id="NM_001",
            snapshot_id="SNAP_100X",
            created_at="2026-02-20T12:00:00Z",
        )
        reference_fp = first_snapshot.fingerprint

        for i in range(99):
            # Rebuild from scratch each time
            g = NetworkGraph()
            g.add_node(_build_source_node())
            g.add_node(_build_pq_node("BUS_001"))
            g.add_branch(
                _build_line_branch("SEG_1", "GPZ_BUS_001", "BUS_001", "test", length_km=0.5)
            )

            snap = create_network_snapshot(
                g,
                network_model_id="NM_001",
                snapshot_id="SNAP_100X",
                created_at="2026-02-20T12:00:00Z",
            )
            assert snap.fingerprint == reference_fp, f"Fingerprint mismatch at iteration {i + 2}"

    def test_step12_no_500_errors(self, catalog: CatalogRepository) -> None:
        """Step 12: No internal errors in canonical path."""
        # Build a complete small network
        graph = NetworkGraph()
        graph.add_node(_build_source_node())
        for i in range(1, 4):
            graph.add_node(_build_pq_node(f"BUS_{i:03d}"))

        cable_types = catalog.list_cable_types()
        if cable_types:
            cable = cable_types[0]
            for i in range(1, 4):
                from_n = "GPZ_BUS_001" if i == 1 else f"BUS_{i - 1:03d}"
                to_n = f"BUS_{i:03d}"
                graph.add_branch(
                    _build_line_branch(
                        f"SEG_{i:03d}",
                        from_n,
                        to_n,
                        cable.id,
                        cable.r_ohm_per_km,
                        cable.x_ohm_per_km,
                        0.25,
                    )
                )

        snapshot = create_network_snapshot(
            graph,
            network_model_id="NM_001",
            snapshot_id="SNAP_FULL",
            created_at="2026-02-20T12:00:00Z",
        )

        # All these must not raise
        assert snapshot.snapshot_id == "SNAP_FULL"
        assert snapshot.fingerprint

        # Serialize/deserialize round-trip
        snapshot_dict = snapshot.to_dict()
        assert "graph" in snapshot_dict
        assert NetworkSnapshot.from_dict(snapshot_dict).fingerprint == snapshot.fingerprint
