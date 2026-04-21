"""
Protection Current Resolver Tests — PR-27: SC ↔ Protection Bridge

Test coverage:
1. TEST_POINTS mode: pass-through, empty → error, sorted output
2. SC_RESULT mode: valid mapping, missing mapping, ambiguous mapping
3. Determinism: hash equality, permutation invariance
4. FixActions: ambiguous mapping → deterministic candidates
5. Error cases: invalid quantity, missing SC run, duplicate mapping
6. Integration: execute_run_protection with current_source
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from application.protection_current_resolver import ProtectionCurrentResolver
from domain.execution import (
    ElementResult,
    ExecutionAnalysisType,
    build_result_set,
    compute_solver_input_hash,
)
from domain.protection_current_source import (
    AmbiguousMappingError,
    CurrentSourceError,
    CurrentSourceType,
    DuplicateMappingError,
    InvalidQuantityError,
    MissingMappingError,
    ProtectionCurrentSource,
    SCCurrentSelection,
    SCRunNotFoundError,
    TargetRefMapping,
)
from domain.protection_engine_v1 import (
    CTRatio,
    Function50Settings,
    Function51Settings,
    IECCurveTypeV1,
    ProtectionStudyInputV1,
    RelayV1,
    TestPoint,
    execute_protection_v1,
)

# =============================================================================
# FIXTURES
# =============================================================================


@pytest.fixture
def resolver():
    return ProtectionCurrentResolver()


@pytest.fixture
def sample_relay():
    return RelayV1(
        relay_id="relay-001",
        attached_cb_id="cb-001",
        ct_ratio=CTRatio(primary_a=400.0, secondary_a=5.0),
        f51=Function51Settings(
            curve_type=IECCurveTypeV1.STANDARD_INVERSE,
            pickup_a_secondary=1.0,
            tms=0.3,
        ),
        f50=Function50Settings(
            enabled=True,
            pickup_a_secondary=25.0,
            t_trip_s=0.05,
        ),
    )


@pytest.fixture
def sample_relay_b():
    return RelayV1(
        relay_id="relay-002",
        attached_cb_id="cb-002",
        ct_ratio=CTRatio(primary_a=200.0, secondary_a=5.0),
        f51=Function51Settings(
            curve_type=IECCurveTypeV1.VERY_INVERSE,
            pickup_a_secondary=2.0,
            tms=0.5,
        ),
    )


@pytest.fixture
def sample_test_points():
    return (
        TestPoint(point_id="tp-02", i_a_primary=4000.0),
        TestPoint(point_id="tp-01", i_a_primary=1000.0),
    )


@pytest.fixture
def sc_result_set():
    """Build a minimal SC ResultSet for testing."""
    return build_result_set(
        run_id=uuid4(),
        analysis_type=ExecutionAnalysisType.SC_3F,
        validation_snapshot={"valid": True},
        readiness_snapshot={"ready": True},
        element_results=[
            ElementResult(
                element_ref="bus-001",
                element_type="bus",
                values={
                    "ikss_a": 5000.0,
                    "ip_a": 12000.0,
                    "ith_a": 5500.0,
                    "ik_total_a": 5000.0,
                    "sk_mva": 130.0,
                },
            ),
            ElementResult(
                element_ref="bus-002",
                element_type="bus",
                values={
                    "ikss_a": 3000.0,
                    "ip_a": 7200.0,
                    "ith_a": 3300.0,
                    "ik_total_a": 3000.0,
                    "sk_mva": 78.0,
                },
            ),
        ],
        global_results={"fault_type": "SC_3F"},
    )


# =============================================================================
# TEST_POINTS MODE
# =============================================================================


class TestTestPointsMode:
    """Tests for TEST_POINTS current source mode."""

    def test_pass_through_sorted(self, resolver, sample_test_points):
        """Test points are passed through and sorted by point_id."""
        source = ProtectionCurrentSource(
            source_type=CurrentSourceType.TEST_POINTS,
        )

        result = resolver.resolve(
            current_source=source,
            relay_ids=("relay-001",),
            test_points=sample_test_points,
        )

        assert len(result) == 2
        assert result[0].point_id == "tp-01"
        assert result[1].point_id == "tp-02"
        assert result[0].i_a_primary == 1000.0
        assert result[1].i_a_primary == 4000.0

    def test_empty_test_points_raises(self, resolver):
        """Empty test points should raise error."""
        source = ProtectionCurrentSource(
            source_type=CurrentSourceType.TEST_POINTS,
        )

        with pytest.raises(CurrentSourceError) as exc_info:
            resolver.resolve(
                current_source=source,
                relay_ids=("relay-001",),
                test_points=(),
            )

        assert exc_info.value.code == "protection.test_points_empty"

    def test_none_test_points_raises(self, resolver):
        """None test points should raise error."""
        source = ProtectionCurrentSource(
            source_type=CurrentSourceType.TEST_POINTS,
        )

        with pytest.raises(CurrentSourceError) as exc_info:
            resolver.resolve(
                current_source=source,
                relay_ids=("relay-001",),
                test_points=None,
            )

        assert exc_info.value.code == "protection.test_points_empty"


# =============================================================================
# SC_RESULT MODE
# =============================================================================


class TestSCResultMode:
    """Tests for SC_RESULT current source mode."""

    def test_valid_sc_mapping(self, resolver, sc_result_set):
        """Valid explicit mapping resolves currents from SC ResultSet."""
        source = ProtectionCurrentSource(
            source_type=CurrentSourceType.SC_RESULT,
            sc_selection=SCCurrentSelection(
                run_id=str(sc_result_set.run_id),
                quantity="ikss_a",
                target_ref_mapping=(
                    TargetRefMapping(
                        relay_id="relay-001",
                        element_ref="bus-001",
                        element_type="bus",
                    ),
                ),
            ),
        )

        result = resolver.resolve(
            current_source=source,
            relay_ids=("relay-001",),
            sc_result_set=sc_result_set,
        )

        assert len(result) == 1
        assert result[0].i_a_primary == 5000.0
        assert "sc_relay-001_ikss_a" in result[0].point_id

    def test_multiple_relay_mapping(self, resolver, sc_result_set):
        """Multiple relays mapped to different SC elements."""
        source = ProtectionCurrentSource(
            source_type=CurrentSourceType.SC_RESULT,
            sc_selection=SCCurrentSelection(
                run_id=str(sc_result_set.run_id),
                quantity="ikss_a",
                target_ref_mapping=(
                    TargetRefMapping(
                        relay_id="relay-001",
                        element_ref="bus-001",
                        element_type="bus",
                    ),
                    TargetRefMapping(
                        relay_id="relay-002",
                        element_ref="bus-002",
                        element_type="bus",
                    ),
                ),
            ),
        )

        result = resolver.resolve(
            current_source=source,
            relay_ids=("relay-001", "relay-002"),
            sc_result_set=sc_result_set,
        )

        assert len(result) == 2
        # Sorted by point_id
        r1 = next(r for r in result if "relay-001" in r.point_id)
        r2 = next(r for r in result if "relay-002" in r.point_id)
        assert r1.i_a_primary == 5000.0
        assert r2.i_a_primary == 3000.0

    def test_different_quantities(self, resolver, sc_result_set):
        """Different SC quantities produce different currents."""
        for qty, expected_a in [
            ("ikss_a", 5000.0),
            ("ip_a", 12000.0),
            ("ith_a", 5500.0),
        ]:
            source = ProtectionCurrentSource(
                source_type=CurrentSourceType.SC_RESULT,
                sc_selection=SCCurrentSelection(
                    run_id=str(sc_result_set.run_id),
                    quantity=qty,
                    target_ref_mapping=(
                        TargetRefMapping(
                            relay_id="relay-001",
                            element_ref="bus-001",
                            element_type="bus",
                        ),
                    ),
                ),
            )

            result = resolver.resolve(
                current_source=source,
                relay_ids=("relay-001",),
                sc_result_set=sc_result_set,
            )

            assert result[0].i_a_primary == expected_a, f"Failed for {qty}"


# =============================================================================
# ERROR CASES
# =============================================================================


class TestErrorCases:
    """Tests for error conditions and FixActions."""

    def test_invalid_quantity_raises(self, resolver, sc_result_set):
        """Invalid SC quantity raises InvalidQuantityError."""
        source = ProtectionCurrentSource(
            source_type=CurrentSourceType.SC_RESULT,
            sc_selection=SCCurrentSelection(
                run_id=str(sc_result_set.run_id),
                quantity="invalid_quantity",
                target_ref_mapping=(
                    TargetRefMapping(
                        relay_id="relay-001",
                        element_ref="bus-001",
                        element_type="bus",
                    ),
                ),
            ),
        )

        with pytest.raises(InvalidQuantityError):
            resolver.resolve(
                current_source=source,
                relay_ids=("relay-001",),
                sc_result_set=sc_result_set,
            )

    def test_missing_sc_run_raises(self, resolver):
        """Missing SC ResultSet raises SCRunNotFoundError."""
        source = ProtectionCurrentSource(
            source_type=CurrentSourceType.SC_RESULT,
            sc_selection=SCCurrentSelection(
                run_id="nonexistent-run",
                quantity="ikss_a",
                target_ref_mapping=(
                    TargetRefMapping(
                        relay_id="relay-001",
                        element_ref="bus-001",
                        element_type="bus",
                    ),
                ),
            ),
        )

        with pytest.raises(SCRunNotFoundError):
            resolver.resolve(
                current_source=source,
                relay_ids=("relay-001",),
                sc_result_set=None,
            )

    def test_duplicate_relay_mapping_raises(self, resolver, sc_result_set):
        """Duplicate relay_id in mapping raises DuplicateMappingError."""
        source = ProtectionCurrentSource(
            source_type=CurrentSourceType.SC_RESULT,
            sc_selection=SCCurrentSelection(
                run_id=str(sc_result_set.run_id),
                quantity="ikss_a",
                target_ref_mapping=(
                    TargetRefMapping(
                        relay_id="relay-001",
                        element_ref="bus-001",
                        element_type="bus",
                    ),
                    TargetRefMapping(
                        relay_id="relay-001",
                        element_ref="bus-002",
                        element_type="bus",
                    ),
                ),
            ),
        )

        with pytest.raises(DuplicateMappingError):
            resolver.resolve(
                current_source=source,
                relay_ids=("relay-001",),
                sc_result_set=sc_result_set,
            )

    def test_unmapped_relay_raises(self, resolver, sc_result_set):
        """Relay without mapping entry raises MissingMappingError."""
        source = ProtectionCurrentSource(
            source_type=CurrentSourceType.SC_RESULT,
            sc_selection=SCCurrentSelection(
                run_id=str(sc_result_set.run_id),
                quantity="ikss_a",
                target_ref_mapping=(
                    TargetRefMapping(
                        relay_id="relay-001",
                        element_ref="bus-001",
                        element_type="bus",
                    ),
                ),
            ),
        )

        with pytest.raises(MissingMappingError) as exc_info:
            resolver.resolve(
                current_source=source,
                relay_ids=("relay-001", "relay-002"),
                sc_result_set=sc_result_set,
            )

        assert exc_info.value.relay_id == "relay-002"

    def test_ambiguous_mapping_provides_fix_actions(self, resolver, sc_result_set):
        """Non-existent element_ref with matching type → AmbiguousMappingError with candidates."""
        source = ProtectionCurrentSource(
            source_type=CurrentSourceType.SC_RESULT,
            sc_selection=SCCurrentSelection(
                run_id=str(sc_result_set.run_id),
                quantity="ikss_a",
                target_ref_mapping=(
                    TargetRefMapping(
                        relay_id="relay-001",
                        element_ref="bus-999",  # Does not exist
                        element_type="bus",
                    ),
                ),
            ),
        )

        with pytest.raises(AmbiguousMappingError) as exc_info:
            resolver.resolve(
                current_source=source,
                relay_ids=("relay-001",),
                sc_result_set=sc_result_set,
            )

        err = exc_info.value
        assert err.relay_id == "relay-001"
        assert len(err.candidates) == 2  # bus-001, bus-002
        assert len(err.fix_actions) == 2
        # Candidates are sorted deterministically
        assert err.candidates[0]["element_ref"] == "bus-001"
        assert err.candidates[1]["element_ref"] == "bus-002"
        # FixActions have correct structure
        assert err.fix_actions[0]["action_type"] == "SELECT_TARGET_REF"


# =============================================================================
# DETERMINISM TESTS
# =============================================================================


class TestDeterminism:
    """Tests for deterministic behavior of current source resolution."""

    def test_hash_equality_test_points(self):
        """Identical test point inputs produce identical hashes."""
        source_1 = ProtectionCurrentSource(
            source_type=CurrentSourceType.TEST_POINTS,
        )
        source_2 = ProtectionCurrentSource(
            source_type=CurrentSourceType.TEST_POINTS,
        )

        assert source_1.canonical_hash() == source_2.canonical_hash()

    def test_hash_equality_sc_result(self):
        """Identical SC result source configs produce identical hashes."""
        source_1 = ProtectionCurrentSource(
            source_type=CurrentSourceType.SC_RESULT,
            sc_selection=SCCurrentSelection(
                run_id="run-001",
                quantity="ikss_a",
                target_ref_mapping=(
                    TargetRefMapping(
                        relay_id="relay-001", element_ref="bus-001", element_type="bus"
                    ),
                ),
            ),
        )
        source_2 = ProtectionCurrentSource(
            source_type=CurrentSourceType.SC_RESULT,
            sc_selection=SCCurrentSelection(
                run_id="run-001",
                quantity="ikss_a",
                target_ref_mapping=(
                    TargetRefMapping(
                        relay_id="relay-001", element_ref="bus-001", element_type="bus"
                    ),
                ),
            ),
        )

        assert source_1.canonical_hash() == source_2.canonical_hash()

    def test_hash_changes_with_source_type(self):
        """Different source types produce different hashes."""
        source_tp = ProtectionCurrentSource(source_type=CurrentSourceType.TEST_POINTS)
        source_sc = ProtectionCurrentSource(
            source_type=CurrentSourceType.SC_RESULT,
            sc_selection=SCCurrentSelection(
                run_id="run-001",
                quantity="ikss_a",
                target_ref_mapping=(
                    TargetRefMapping(
                        relay_id="relay-001", element_ref="bus-001", element_type="bus"
                    ),
                ),
            ),
        )

        assert source_tp.canonical_hash() != source_sc.canonical_hash()

    def test_hash_changes_with_quantity(self):
        """Different quantities produce different hashes."""
        hash_ikss = ProtectionCurrentSource(
            source_type=CurrentSourceType.SC_RESULT,
            sc_selection=SCCurrentSelection(
                run_id="run-001",
                quantity="ikss_a",
                target_ref_mapping=(
                    TargetRefMapping(
                        relay_id="relay-001", element_ref="bus-001", element_type="bus"
                    ),
                ),
            ),
        ).canonical_hash()

        hash_ip = ProtectionCurrentSource(
            source_type=CurrentSourceType.SC_RESULT,
            sc_selection=SCCurrentSelection(
                run_id="run-001",
                quantity="ip_a",
                target_ref_mapping=(
                    TargetRefMapping(
                        relay_id="relay-001", element_ref="bus-001", element_type="bus"
                    ),
                ),
            ),
        ).canonical_hash()

        assert hash_ikss != hash_ip

    def test_hash_included_in_solver_input(self):
        """Current source hash affects solver input hash."""
        base_input = {"relays": [], "test_points": []}

        input_with_tp = {**base_input, "current_source": {"source_type": "TEST_POINTS"}}
        input_with_sc = {
            **base_input,
            "current_source": {
                "source_type": "SC_RESULT",
                "sc_selection": {
                    "run_id": "run-001",
                    "quantity": "ikss_a",
                    "target_ref_mapping": [],
                },
            },
        }

        hash_tp = compute_solver_input_hash(input_with_tp)
        hash_sc = compute_solver_input_hash(input_with_sc)

        assert hash_tp != hash_sc

    def test_resolver_output_determinism(self, resolver, sc_result_set):
        """Same resolver input produces identical output every time."""
        source = ProtectionCurrentSource(
            source_type=CurrentSourceType.SC_RESULT,
            sc_selection=SCCurrentSelection(
                run_id=str(sc_result_set.run_id),
                quantity="ikss_a",
                target_ref_mapping=(
                    TargetRefMapping(
                        relay_id="relay-001", element_ref="bus-001", element_type="bus"
                    ),
                    TargetRefMapping(
                        relay_id="relay-002", element_ref="bus-002", element_type="bus"
                    ),
                ),
            ),
        )

        results = []
        for _ in range(5):
            result = resolver.resolve(
                current_source=source,
                relay_ids=("relay-001", "relay-002"),
                sc_result_set=sc_result_set,
            )
            results.append(tuple(tp.to_dict() for tp in result))

        assert all(r == results[0] for r in results)


# =============================================================================
# PERMUTATION INVARIANCE
# =============================================================================


class TestPermutationInvariance:
    """Tests that input ordering does not affect output."""

    def test_relay_order_does_not_affect_result(self, resolver, sc_result_set):
        """Different relay_ids ordering → same resolved test points."""
        source = ProtectionCurrentSource(
            source_type=CurrentSourceType.SC_RESULT,
            sc_selection=SCCurrentSelection(
                run_id=str(sc_result_set.run_id),
                quantity="ikss_a",
                target_ref_mapping=(
                    TargetRefMapping(
                        relay_id="relay-001", element_ref="bus-001", element_type="bus"
                    ),
                    TargetRefMapping(
                        relay_id="relay-002", element_ref="bus-002", element_type="bus"
                    ),
                ),
            ),
        )

        result_abc = resolver.resolve(
            current_source=source,
            relay_ids=("relay-001", "relay-002"),
            sc_result_set=sc_result_set,
        )

        result_bac = resolver.resolve(
            current_source=source,
            relay_ids=("relay-002", "relay-001"),
            sc_result_set=sc_result_set,
        )

        # Both should produce same sorted output
        assert tuple(tp.to_dict() for tp in result_abc) == tuple(tp.to_dict() for tp in result_bac)

    def test_mapping_order_does_not_affect_result(self, resolver, sc_result_set):
        """Different mapping ordering → same resolved test points."""
        source_1 = ProtectionCurrentSource(
            source_type=CurrentSourceType.SC_RESULT,
            sc_selection=SCCurrentSelection(
                run_id=str(sc_result_set.run_id),
                quantity="ikss_a",
                target_ref_mapping=(
                    TargetRefMapping(
                        relay_id="relay-001", element_ref="bus-001", element_type="bus"
                    ),
                    TargetRefMapping(
                        relay_id="relay-002", element_ref="bus-002", element_type="bus"
                    ),
                ),
            ),
        )

        source_2 = ProtectionCurrentSource(
            source_type=CurrentSourceType.SC_RESULT,
            sc_selection=SCCurrentSelection(
                run_id=str(sc_result_set.run_id),
                quantity="ikss_a",
                target_ref_mapping=(
                    TargetRefMapping(
                        relay_id="relay-002", element_ref="bus-002", element_type="bus"
                    ),
                    TargetRefMapping(
                        relay_id="relay-001", element_ref="bus-001", element_type="bus"
                    ),
                ),
            ),
        )

        result_1 = resolver.resolve(
            current_source=source_1,
            relay_ids=("relay-001", "relay-002"),
            sc_result_set=sc_result_set,
        )

        result_2 = resolver.resolve(
            current_source=source_2,
            relay_ids=("relay-001", "relay-002"),
            sc_result_set=sc_result_set,
        )

        assert tuple(tp.to_dict() for tp in result_1) == tuple(tp.to_dict() for tp in result_2)

    def test_test_point_order_does_not_affect_result(self, resolver):
        """Different test point ordering → same sorted output."""
        source = ProtectionCurrentSource(source_type=CurrentSourceType.TEST_POINTS)

        points_ab = (
            TestPoint(point_id="tp-b", i_a_primary=2000.0),
            TestPoint(point_id="tp-a", i_a_primary=1000.0),
        )
        points_ba = (
            TestPoint(point_id="tp-a", i_a_primary=1000.0),
            TestPoint(point_id="tp-b", i_a_primary=2000.0),
        )

        result_ab = resolver.resolve(
            current_source=source,
            relay_ids=("relay-001",),
            test_points=points_ab,
        )
        result_ba = resolver.resolve(
            current_source=source,
            relay_ids=("relay-001",),
            test_points=points_ba,
        )

        assert tuple(tp.to_dict() for tp in result_ab) == tuple(tp.to_dict() for tp in result_ba)


# =============================================================================
# SERIALIZATION ROUNDTRIP
# =============================================================================


class TestSerialization:
    """Tests for to_dict / from_dict roundtrip."""

    def test_current_source_roundtrip_test_points(self):
        """ProtectionCurrentSource roundtrip for TEST_POINTS."""
        source = ProtectionCurrentSource(source_type=CurrentSourceType.TEST_POINTS)
        data = source.to_dict()
        restored = ProtectionCurrentSource.from_dict(data)

        assert restored.source_type == CurrentSourceType.TEST_POINTS
        assert restored.sc_selection is None

    def test_current_source_roundtrip_sc_result(self):
        """ProtectionCurrentSource roundtrip for SC_RESULT."""
        source = ProtectionCurrentSource(
            source_type=CurrentSourceType.SC_RESULT,
            sc_selection=SCCurrentSelection(
                run_id="run-001",
                quantity="ikss_a",
                target_ref_mapping=(
                    TargetRefMapping(
                        relay_id="relay-001", element_ref="bus-001", element_type="bus"
                    ),
                    TargetRefMapping(
                        relay_id="relay-002", element_ref="bus-002", element_type="bus"
                    ),
                ),
            ),
        )

        data = source.to_dict()
        restored = ProtectionCurrentSource.from_dict(data)

        assert restored.source_type == CurrentSourceType.SC_RESULT
        assert restored.sc_selection is not None
        assert restored.sc_selection.run_id == "run-001"
        assert restored.sc_selection.quantity == "ikss_a"
        assert len(restored.sc_selection.target_ref_mapping) == 2

    def test_target_ref_mapping_roundtrip(self):
        """TargetRefMapping roundtrip."""
        mapping = TargetRefMapping(
            relay_id="relay-001",
            element_ref="bus-001",
            element_type="bus",
        )

        data = mapping.to_dict()
        restored = TargetRefMapping.from_dict(data)

        assert restored.relay_id == mapping.relay_id
        assert restored.element_ref == mapping.element_ref
        assert restored.element_type == mapping.element_type


# =============================================================================
# INTEGRATION: FULL PIPELINE
# =============================================================================


class TestFullPipeline:
    """Integration tests: resolver → engine → result (end-to-end)."""

    def test_sc_result_through_engine(self, resolver, sample_relay, sc_result_set):
        """SC_RESULT mode produces valid results through Protection Engine."""
        source = ProtectionCurrentSource(
            source_type=CurrentSourceType.SC_RESULT,
            sc_selection=SCCurrentSelection(
                run_id=str(sc_result_set.run_id),
                quantity="ikss_a",
                target_ref_mapping=(
                    TargetRefMapping(
                        relay_id="relay-001",
                        element_ref="bus-001",
                        element_type="bus",
                    ),
                ),
            ),
        )

        test_points = resolver.resolve(
            current_source=source,
            relay_ids=("relay-001",),
            sc_result_set=sc_result_set,
        )

        study_input = ProtectionStudyInputV1(
            relays=(sample_relay,),
            test_points=test_points,
        )

        result = execute_protection_v1(study_input)

        assert result.analysis_type == "PROTECTION"
        assert len(result.relay_results) == 1
        assert len(result.relay_results[0].per_test_point) == 1
        assert result.relay_results[0].per_test_point[0].i_a_secondary > 0
        assert result.deterministic_signature != ""

    def test_end_to_end_determinism(self, resolver, sample_relay, sc_result_set):
        """Full pipeline: same input → identical result hash."""
        source = ProtectionCurrentSource(
            source_type=CurrentSourceType.SC_RESULT,
            sc_selection=SCCurrentSelection(
                run_id=str(sc_result_set.run_id),
                quantity="ikss_a",
                target_ref_mapping=(
                    TargetRefMapping(
                        relay_id="relay-001",
                        element_ref="bus-001",
                        element_type="bus",
                    ),
                ),
            ),
        )

        sigs = []
        for _ in range(3):
            test_points = resolver.resolve(
                current_source=source,
                relay_ids=("relay-001",),
                sc_result_set=sc_result_set,
            )
            study_input = ProtectionStudyInputV1(
                relays=(sample_relay,),
                test_points=test_points,
            )
            result = execute_protection_v1(study_input)
            sigs.append(result.deterministic_signature)

        assert all(
            s == sigs[0] for s in sigs
        ), f"Determinism violation: signatures differ {set(sigs)}"
