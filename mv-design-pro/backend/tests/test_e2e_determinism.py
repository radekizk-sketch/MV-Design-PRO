"""E2E determinism tests — KROK 5.

Tests that the chain ElementRef → ResultJoin → ExportManifest
produces deterministic output regardless of input order.

BINDING: any failure blocks merge.
"""

import itertools

from domain.element_ref import ElementRefV1, ElementTypeV1, build_element_ref_index
from domain.export_manifest import build_export_manifest
from domain.result_join import join_results

# =============================================================================
# FIXTURES
# =============================================================================


def _make_generators(count: int = 5) -> list[dict]:
    """Create a mix of PV, BESS, and synchronous generators."""
    gens = []
    for i in range(count):
        gen_type = ["pv_inverter", "bess", "synchronous"][i % 3]
        variant = None
        block_ref = None
        station_ref = None

        if gen_type in ("pv_inverter", "bess"):
            if i % 2 == 0:
                variant = "nn_side"
                station_ref = f"sta_{i}"
            else:
                variant = "block_transformer"
                block_ref = f"tr_block_{i}"

        gens.append(
            {
                "ref_id": f"gen_{i:03d}",
                "name": f"Generator {i}",
                "gen_type": gen_type,
                "bus_ref": f"bus_{i}",
                "catalog_ref": f"cat_{i}" if i % 4 != 0 else None,
                "connection_variant": variant,
                "blocking_transformer_ref": block_ref,
                "station_ref": station_ref,
            }
        )
    return gens


def _make_snapshot_index(ids: list[str]) -> dict[str, ElementRefV1]:
    """Create snapshot element index from IDs."""
    return {eid: ElementRefV1(element_id=eid, element_type=ElementTypeV1.GENERATOR) for eid in ids}


def _make_element_results(ids: list[str]) -> list[dict]:
    """Create element results list from IDs."""
    return [{"element_ref": eid, "values": {"p_mw": 1.0 * i}} for i, eid in enumerate(ids)]


# =============================================================================
# RESULT JOIN DETERMINISM
# =============================================================================


class TestResultJoinDeterminism:
    """ResultJoinV1.content_hash is deterministic."""

    def test_same_input_same_hash(self) -> None:
        ids = ["bus_1", "bus_2", "bus_3", "tr_1"]
        snapshot_index = _make_snapshot_index(ids)
        results = [
            {"element_ref": "bus_1", "values": {"ik3_ka": 12.5, "ip_ka": 30.2}},
            {"element_ref": "bus_2", "values": {"ik3_ka": 8.1, "ip_ka": 19.5}},
            {"element_ref": "bus_3", "values": {"ik3_ka": 5.3, "ip_ka": 12.8}},
            {"element_ref": "tr_1", "values": {"loading_percent": 85}},
        ]

        join1 = join_results(
            snapshot_element_ids=snapshot_index,
            element_results=results,
            analysis_type="SC_3F",
        )
        join2 = join_results(
            snapshot_element_ids=snapshot_index,
            element_results=list(reversed(results)),
            analysis_type="SC_3F",
        )

        assert join1.content_hash == join2.content_hash

    def test_100x_stable(self) -> None:
        ids = [f"elem_{i:03d}" for i in range(50)]
        snapshot_index = _make_snapshot_index(ids)
        results = [{"element_ref": eid, "values": {"value": i * 1.5}} for i, eid in enumerate(ids)]

        reference = join_results(
            snapshot_element_ids=snapshot_index,
            element_results=results,
            analysis_type="LOAD_FLOW",
        )
        for _ in range(100):
            j = join_results(
                snapshot_element_ids=snapshot_index,
                element_results=results,
                analysis_type="LOAD_FLOW",
            )
            assert j.content_hash == reference.content_hash


# =============================================================================
# EXPORT MANIFEST DETERMINISM
# =============================================================================


class TestExportManifestDeterminism:
    """ExportManifestV1.content_hash is deterministic."""

    def test_same_input_same_hash(self) -> None:
        m1 = build_export_manifest(
            snapshot_hash="snap_abc",
            layout_hash="layout_xyz",
            run_hash="run_123",
            element_ids=["bus_2", "bus_1", "tr_1"],
            analysis_types=["LOAD_FLOW", "SC_3F"],
        )
        m2 = build_export_manifest(
            snapshot_hash="snap_abc",
            layout_hash="layout_xyz",
            run_hash="run_123",
            element_ids=["tr_1", "bus_1", "bus_2"],
            analysis_types=["SC_3F", "LOAD_FLOW"],
        )

        assert m1.content_hash == m2.content_hash

    def test_element_ids_sorted_and_deduplicated(self) -> None:
        m = build_export_manifest(
            snapshot_hash="snap",
            layout_hash="layout",
            element_ids=["c", "a", "b", "a", "c"],
            analysis_types=[],
        )
        assert m.element_ids == ("a", "b", "c")

    def test_analysis_types_sorted(self) -> None:
        m = build_export_manifest(
            snapshot_hash="snap",
            layout_hash="layout",
            element_ids=[],
            analysis_types=["SC_3F", "LOAD_FLOW", "PROTECTION"],
        )
        assert m.analysis_types == ("LOAD_FLOW", "PROTECTION", "SC_3F")

    def test_100x_stable_hash(self) -> None:
        ref = build_export_manifest(
            snapshot_hash="snap_stable",
            layout_hash="layout_stable",
            run_hash="run_stable",
            element_ids=[f"elem_{i}" for i in range(100)],
            analysis_types=["SC_3F", "LOAD_FLOW"],
        )
        for _ in range(100):
            m = build_export_manifest(
                snapshot_hash="snap_stable",
                layout_hash="layout_stable",
                run_hash="run_stable",
                element_ids=[f"elem_{i}" for i in range(100)],
                analysis_types=["SC_3F", "LOAD_FLOW"],
            )
            assert m.content_hash == ref.content_hash

    def test_no_run_hash(self) -> None:
        m = build_export_manifest(
            snapshot_hash="snap",
            layout_hash="layout",
            run_hash=None,
            element_ids=["bus_1"],
            analysis_types=[],
        )
        assert m.run_hash is None
        assert m.content_hash != ""


# =============================================================================
# ELEMENT REF INDEX DETERMINISM
# =============================================================================


class TestElementRefIndexDeterminism:
    """build_element_ref_index produces deterministic output."""

    def test_permutation_invariance(self) -> None:
        refs = [
            ElementRefV1(element_id=f"elem_{i:03d}", element_type=ElementTypeV1.NODE)
            for i in range(20)
        ]

        index1 = build_element_ref_index(refs)
        index2 = build_element_ref_index(list(reversed(refs)))

        keys1 = list(index1.keys())
        keys2 = list(index2.keys())
        assert keys1 == keys2
        assert keys1 == sorted(keys1)


# =============================================================================
# FULL CHAIN: ELEMENT REFS → RESULT JOIN → EXPORT
# =============================================================================


class TestFullChainDeterminism:
    """End-to-end chain: same input → same ExportManifest hash."""

    def test_e2e_chain_deterministic(self) -> None:
        """Full chain 50x → identical export manifest hash."""
        gens = _make_generators(8)
        snapshot_ids = [g["ref_id"] for g in gens]
        snapshot_index = _make_snapshot_index(snapshot_ids)
        results = _make_element_results(snapshot_ids)

        reference_hash = None

        for _ in range(50):
            # Step 1: Join results
            join = join_results(
                snapshot_element_ids=snapshot_index,
                element_results=results,
                analysis_type="LOAD_FLOW",
            )

            # Step 2: Build export manifest
            manifest = build_export_manifest(
                snapshot_hash="fp_e2e",
                layout_hash="layout_e2e",
                run_hash=join.content_hash,
                element_ids=snapshot_ids,
                analysis_types=["LOAD_FLOW"],
            )

            if reference_hash is None:
                reference_hash = manifest.content_hash
            else:
                assert manifest.content_hash == reference_hash

    def test_e2e_chain_permutation_invariant(self) -> None:
        """Permuted generator order → same export manifest hash."""
        gens = _make_generators(5)
        snapshot_ids = [g["ref_id"] for g in gens]
        snapshot_index = _make_snapshot_index(snapshot_ids)
        results = _make_element_results(snapshot_ids)

        def run_chain(gen_list: list[dict]) -> str:
            join = join_results(
                snapshot_element_ids=snapshot_index,
                element_results=results,
                analysis_type="SC_3F",
            )
            manifest = build_export_manifest(
                snapshot_hash="fp_e2e",
                layout_hash="layout_e2e",
                run_hash=join.content_hash,
                element_ids=[g["ref_id"] for g in gen_list],
                analysis_types=["SC_3F"],
            )
            return manifest.content_hash

        reference = run_chain(gens)

        # All permutations of 5 generators
        for perm in itertools.permutations(gens):
            assert run_chain(list(perm)) == reference
