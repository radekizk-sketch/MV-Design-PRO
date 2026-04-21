"""
Tests — PR-28: Protection Coordination v1 (Selectivity Margins)

Coverage:
- TestMarginComputation: basic margin calculation correctness
- TestMultiplePairs: multi-pair coordination
- TestEdgeCases: no-trip, partial trip, single point
- TestErrorCases: same relay, missing relay, duplicate pair_id
- TestDeterminism: hash stability, input ordering independence
- TestPermutationInvariance: pair order, point order
- TestNoVerdicts: verify no OK/FAIL in output
- TestSerialization: roundtrip for all types
- TestWhiteBoxTrace: trace content verification
"""

from __future__ import annotations

import pytest
from domain.protection_coordination_v1 import (
    CoordinationResultV1,
    DuplicatePairIdError,
    ProtectionSelectivityPair,
    RelayNotInResultError,
    SameRelayPairError,
    SelectivityMarginPoint,
    SelectivityPairResult,
    compute_coordination_v1,
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


def _make_relay(
    relay_id: str,
    cb_id: str,
    *,
    ct_primary: float = 400.0,
    ct_secondary: float = 5.0,
    f51_pickup: float = 1.0,
    f51_tms: float = 0.3,
    f51_curve: IECCurveTypeV1 = IECCurveTypeV1.STANDARD_INVERSE,
    f50_enabled: bool = False,
    f50_pickup: float = 10.0,
    f50_trip_s: float | None = 0.05,
) -> RelayV1:
    """Create a relay with typical settings."""
    f50 = None
    if f50_enabled:
        f50 = Function50Settings(
            enabled=True,
            pickup_a_secondary=f50_pickup,
            t_trip_s=f50_trip_s,
        )
    return RelayV1(
        relay_id=relay_id,
        attached_cb_id=cb_id,
        ct_ratio=CTRatio(primary_a=ct_primary, secondary_a=ct_secondary),
        f51=Function51Settings(
            curve_type=f51_curve,
            pickup_a_secondary=f51_pickup,
            tms=f51_tms,
        ),
        f50=f50,
    )


def _make_test_points(*currents: float) -> tuple[TestPoint, ...]:
    """Create test points from primary currents."""
    return tuple(
        TestPoint(point_id=f"tp-{i:02d}", i_a_primary=c) for i, c in enumerate(currents, 1)
    )


def _run_protection(
    relays: tuple[RelayV1, ...],
    test_points: tuple[TestPoint, ...],
):
    """Execute protection engine and return result."""
    study_input = ProtectionStudyInputV1(
        relays=relays,
        test_points=test_points,
    )
    return execute_protection_v1(study_input)


# =============================================================================
# TEST: MARGIN COMPUTATION
# =============================================================================


class TestMarginComputation:
    """Verify basic margin calculation correctness."""

    def test_positive_margin_upstream_slower(self):
        """Upstream relay has higher TMS → trips slower → positive margin."""
        downstream = _make_relay("relay-001", "cb-001", f51_tms=0.1)
        upstream = _make_relay("relay-002", "cb-002", f51_tms=0.5)
        test_points = _make_test_points(2000.0)

        result = _run_protection((downstream, upstream), test_points)

        pairs = (
            ProtectionSelectivityPair(
                pair_id="pair-001",
                upstream_relay_id="relay-002",
                downstream_relay_id="relay-001",
            ),
        )

        coord = compute_coordination_v1(
            pairs=pairs,
            protection_result=result,
        )

        assert len(coord.pairs) == 1
        pr = coord.pairs[0]
        assert len(pr.margin_points) == 1
        mp = pr.margin_points[0]
        assert mp.margin_s is not None
        assert mp.margin_s > 0, "Upstream slower → positive margin"

    def test_negative_margin_upstream_faster(self):
        """Upstream relay has lower TMS → trips faster → negative margin."""
        downstream = _make_relay("relay-001", "cb-001", f51_tms=0.5)
        upstream = _make_relay("relay-002", "cb-002", f51_tms=0.1)
        test_points = _make_test_points(2000.0)

        result = _run_protection((downstream, upstream), test_points)

        pairs = (
            ProtectionSelectivityPair(
                pair_id="pair-001",
                upstream_relay_id="relay-002",
                downstream_relay_id="relay-001",
            ),
        )

        coord = compute_coordination_v1(
            pairs=pairs,
            protection_result=result,
        )

        mp = coord.pairs[0].margin_points[0]
        assert mp.margin_s is not None
        assert mp.margin_s < 0, "Upstream faster → negative margin"

    def test_margin_formula_correctness(self):
        """Verify margin = t_upstream - t_downstream."""
        downstream = _make_relay("relay-001", "cb-001", f51_tms=0.1)
        upstream = _make_relay("relay-002", "cb-002", f51_tms=0.3)
        test_points = _make_test_points(3000.0)

        result = _run_protection((downstream, upstream), test_points)

        pairs = (
            ProtectionSelectivityPair(
                pair_id="pair-001",
                upstream_relay_id="relay-002",
                downstream_relay_id="relay-001",
            ),
        )

        coord = compute_coordination_v1(
            pairs=pairs,
            protection_result=result,
        )

        mp = coord.pairs[0].margin_points[0]
        assert mp.t_upstream_s is not None
        assert mp.t_downstream_s is not None
        expected_margin = round(mp.t_upstream_s - mp.t_downstream_s, 6)
        assert mp.margin_s == expected_margin

    def test_multiple_test_points_sorted_by_current(self):
        """Margin points sorted ascending by i_a_primary."""
        relay1 = _make_relay("relay-001", "cb-001", f51_tms=0.1)
        relay2 = _make_relay("relay-002", "cb-002", f51_tms=0.3)
        test_points = _make_test_points(5000.0, 1000.0, 3000.0)

        result = _run_protection((relay1, relay2), test_points)

        pairs = (
            ProtectionSelectivityPair(
                pair_id="pair-001",
                upstream_relay_id="relay-002",
                downstream_relay_id="relay-001",
            ),
        )

        coord = compute_coordination_v1(
            pairs=pairs,
            protection_result=result,
        )

        mps = coord.pairs[0].margin_points
        assert len(mps) == 3
        currents = [mp.i_a_primary for mp in mps]
        assert currents == sorted(currents), "Points must be sorted by current"


# =============================================================================
# TEST: MULTIPLE PAIRS
# =============================================================================


class TestMultiplePairs:
    """Verify coordination with multiple selectivity pairs."""

    def test_two_pairs(self):
        """Two independent pairs computed correctly."""
        relay_a = _make_relay("relay-A", "cb-A", f51_tms=0.1)
        relay_b = _make_relay("relay-B", "cb-B", f51_tms=0.3)
        relay_c = _make_relay("relay-C", "cb-C", f51_tms=0.5)
        test_points = _make_test_points(2000.0)

        result = _run_protection((relay_a, relay_b, relay_c), test_points)

        pairs = (
            ProtectionSelectivityPair(
                pair_id="pair-001",
                upstream_relay_id="relay-B",
                downstream_relay_id="relay-A",
            ),
            ProtectionSelectivityPair(
                pair_id="pair-002",
                upstream_relay_id="relay-C",
                downstream_relay_id="relay-B",
            ),
        )

        coord = compute_coordination_v1(
            pairs=pairs,
            protection_result=result,
        )

        assert len(coord.pairs) == 2
        assert coord.pairs[0].pair_id == "pair-001"
        assert coord.pairs[1].pair_id == "pair-002"

        # Both margins should be positive (higher TMS upstream)
        for pr in coord.pairs:
            assert pr.margin_points[0].margin_s is not None
            assert pr.margin_points[0].margin_s > 0

    def test_pairs_sorted_by_pair_id(self):
        """Pair results sorted lexicographically by pair_id."""
        relay_a = _make_relay("relay-A", "cb-A", f51_tms=0.1)
        relay_b = _make_relay("relay-B", "cb-B", f51_tms=0.3)
        relay_c = _make_relay("relay-C", "cb-C", f51_tms=0.5)
        test_points = _make_test_points(2000.0)

        result = _run_protection((relay_a, relay_b, relay_c), test_points)

        # Input in reverse order
        pairs = (
            ProtectionSelectivityPair(
                pair_id="pair-ZZZ",
                upstream_relay_id="relay-C",
                downstream_relay_id="relay-B",
            ),
            ProtectionSelectivityPair(
                pair_id="pair-AAA",
                upstream_relay_id="relay-B",
                downstream_relay_id="relay-A",
            ),
        )

        coord = compute_coordination_v1(
            pairs=pairs,
            protection_result=result,
        )

        assert coord.pairs[0].pair_id == "pair-AAA"
        assert coord.pairs[1].pair_id == "pair-ZZZ"


# =============================================================================
# TEST: EDGE CASES
# =============================================================================


class TestEdgeCases:
    """Edge cases: no-trip, partial trip, single point."""

    def test_no_trip_both_relays(self):
        """Current below both pickups → no trip → margin is None."""
        relay1 = _make_relay(
            "relay-001",
            "cb-001",
            ct_primary=400.0,
            ct_secondary=5.0,
            f51_pickup=10.0,
            f51_tms=0.3,  # Very high pickup
        )
        relay2 = _make_relay(
            "relay-002",
            "cb-002",
            ct_primary=400.0,
            ct_secondary=5.0,
            f51_pickup=10.0,
            f51_tms=0.5,  # Very high pickup
        )
        # Very low current → secondary will be below pickup
        test_points = _make_test_points(100.0)

        result = _run_protection((relay1, relay2), test_points)

        pairs = (
            ProtectionSelectivityPair(
                pair_id="pair-001",
                upstream_relay_id="relay-002",
                downstream_relay_id="relay-001",
            ),
        )

        coord = compute_coordination_v1(
            pairs=pairs,
            protection_result=result,
        )

        mp = coord.pairs[0].margin_points[0]
        assert mp.t_upstream_s is None
        assert mp.t_downstream_s is None
        assert mp.margin_s is None

    def test_partial_trip_upstream_only(self):
        """Upstream trips, downstream doesn't → margin is None."""
        # Downstream has very high pickup
        downstream = _make_relay(
            "relay-001",
            "cb-001",
            ct_primary=400.0,
            ct_secondary=5.0,
            f51_pickup=50.0,
            f51_tms=0.3,
        )
        # Upstream has normal pickup
        upstream = _make_relay(
            "relay-002",
            "cb-002",
            ct_primary=400.0,
            ct_secondary=5.0,
            f51_pickup=1.0,
            f51_tms=0.3,
        )
        test_points = _make_test_points(2000.0)

        result = _run_protection((downstream, upstream), test_points)

        pairs = (
            ProtectionSelectivityPair(
                pair_id="pair-001",
                upstream_relay_id="relay-002",
                downstream_relay_id="relay-001",
            ),
        )

        coord = compute_coordination_v1(
            pairs=pairs,
            protection_result=result,
        )

        mp = coord.pairs[0].margin_points[0]
        assert mp.t_upstream_s is not None
        assert mp.t_downstream_s is None
        assert mp.margin_s is None

    def test_f50_trip_used_when_faster(self):
        """F50 trip time is used when faster than F51."""
        relay1 = _make_relay(
            "relay-001",
            "cb-001",
            f51_tms=0.3,
            f50_enabled=True,
            f50_pickup=5.0,
            f50_trip_s=0.05,
        )
        relay2 = _make_relay(
            "relay-002",
            "cb-002",
            f51_tms=0.5,
            f50_enabled=False,
        )
        # High current to trigger both F50 and F51 for relay-001
        test_points = _make_test_points(5000.0)

        result = _run_protection((relay1, relay2), test_points)

        pairs = (
            ProtectionSelectivityPair(
                pair_id="pair-001",
                upstream_relay_id="relay-002",
                downstream_relay_id="relay-001",
            ),
        )

        coord = compute_coordination_v1(
            pairs=pairs,
            protection_result=result,
        )

        mp = coord.pairs[0].margin_points[0]
        assert mp.t_downstream_s is not None
        # F50 should be 0.05s if triggered, which is faster than F51
        assert mp.t_downstream_s <= 0.05 + 1e-6


# =============================================================================
# TEST: ERROR CASES
# =============================================================================


class TestErrorCases:
    """Verify error handling for invalid configurations."""

    def test_same_relay_raises(self):
        """Same relay as upstream and downstream raises SameRelayPairError."""
        relay = _make_relay("relay-001", "cb-001")
        test_points = _make_test_points(2000.0)
        result = _run_protection((relay,), test_points)

        pairs = (
            ProtectionSelectivityPair(
                pair_id="pair-001",
                upstream_relay_id="relay-001",
                downstream_relay_id="relay-001",
            ),
        )

        with pytest.raises(SameRelayPairError) as exc_info:
            compute_coordination_v1(pairs=pairs, protection_result=result)
        assert exc_info.value.relay_id == "relay-001"

    def test_missing_upstream_relay_raises(self):
        """Non-existent upstream relay raises RelayNotInResultError."""
        relay = _make_relay("relay-001", "cb-001")
        test_points = _make_test_points(2000.0)
        result = _run_protection((relay,), test_points)

        pairs = (
            ProtectionSelectivityPair(
                pair_id="pair-001",
                upstream_relay_id="relay-999",
                downstream_relay_id="relay-001",
            ),
        )

        with pytest.raises(RelayNotInResultError) as exc_info:
            compute_coordination_v1(pairs=pairs, protection_result=result)
        assert exc_info.value.relay_id == "relay-999"
        assert exc_info.value.pair_id == "pair-001"

    def test_missing_downstream_relay_raises(self):
        """Non-existent downstream relay raises RelayNotInResultError."""
        relay = _make_relay("relay-001", "cb-001")
        test_points = _make_test_points(2000.0)
        result = _run_protection((relay,), test_points)

        pairs = (
            ProtectionSelectivityPair(
                pair_id="pair-001",
                upstream_relay_id="relay-001",
                downstream_relay_id="relay-999",
            ),
        )

        with pytest.raises(RelayNotInResultError) as exc_info:
            compute_coordination_v1(pairs=pairs, protection_result=result)
        assert exc_info.value.relay_id == "relay-999"

    def test_duplicate_pair_id_raises(self):
        """Duplicate pair_id raises DuplicatePairIdError."""
        relay1 = _make_relay("relay-001", "cb-001", f51_tms=0.1)
        relay2 = _make_relay("relay-002", "cb-002", f51_tms=0.3)
        test_points = _make_test_points(2000.0)
        result = _run_protection((relay1, relay2), test_points)

        pairs = (
            ProtectionSelectivityPair(
                pair_id="pair-001",
                upstream_relay_id="relay-002",
                downstream_relay_id="relay-001",
            ),
            ProtectionSelectivityPair(
                pair_id="pair-001",
                upstream_relay_id="relay-001",
                downstream_relay_id="relay-002",
            ),
        )

        with pytest.raises(DuplicatePairIdError) as exc_info:
            compute_coordination_v1(pairs=pairs, protection_result=result)
        assert exc_info.value.pair_id == "pair-001"


# =============================================================================
# TEST: DETERMINISM
# =============================================================================


class TestDeterminism:
    """Verify deterministic output: same input → same hash."""

    def test_identical_inputs_identical_hash(self):
        """Two identical runs produce identical signature."""
        relay1 = _make_relay("relay-001", "cb-001", f51_tms=0.1)
        relay2 = _make_relay("relay-002", "cb-002", f51_tms=0.3)
        test_points = _make_test_points(2000.0, 4000.0)

        result1 = _run_protection((relay1, relay2), test_points)
        result2 = _run_protection((relay1, relay2), test_points)

        pairs = (
            ProtectionSelectivityPair(
                pair_id="pair-001",
                upstream_relay_id="relay-002",
                downstream_relay_id="relay-001",
            ),
        )

        coord1 = compute_coordination_v1(pairs=pairs, protection_result=result1)
        coord2 = compute_coordination_v1(pairs=pairs, protection_result=result2)

        assert coord1.deterministic_signature == coord2.deterministic_signature
        assert coord1.deterministic_signature != ""

    def test_different_tms_different_hash(self):
        """Different TMS values produce different signatures."""
        relay1_a = _make_relay("relay-001", "cb-001", f51_tms=0.1)
        relay2_a = _make_relay("relay-002", "cb-002", f51_tms=0.3)

        relay1_b = _make_relay("relay-001", "cb-001", f51_tms=0.2)
        relay2_b = _make_relay("relay-002", "cb-002", f51_tms=0.3)

        test_points = _make_test_points(2000.0)

        result_a = _run_protection((relay1_a, relay2_a), test_points)
        result_b = _run_protection((relay1_b, relay2_b), test_points)

        pairs = (
            ProtectionSelectivityPair(
                pair_id="pair-001",
                upstream_relay_id="relay-002",
                downstream_relay_id="relay-001",
            ),
        )

        coord_a = compute_coordination_v1(pairs=pairs, protection_result=result_a)
        coord_b = compute_coordination_v1(pairs=pairs, protection_result=result_b)

        assert coord_a.deterministic_signature != coord_b.deterministic_signature

    def test_signature_is_sha256(self):
        """Signature is a valid 64-char hex SHA-256."""
        relay1 = _make_relay("relay-001", "cb-001", f51_tms=0.1)
        relay2 = _make_relay("relay-002", "cb-002", f51_tms=0.3)
        test_points = _make_test_points(2000.0)

        result = _run_protection((relay1, relay2), test_points)

        pairs = (
            ProtectionSelectivityPair(
                pair_id="pair-001",
                upstream_relay_id="relay-002",
                downstream_relay_id="relay-001",
            ),
        )

        coord = compute_coordination_v1(pairs=pairs, protection_result=result)
        sig = coord.deterministic_signature
        assert len(sig) == 64
        assert all(c in "0123456789abcdef" for c in sig)


# =============================================================================
# TEST: PERMUTATION INVARIANCE
# =============================================================================


class TestPermutationInvariance:
    """Verify output is independent of input ordering."""

    def test_pair_order_does_not_affect_results(self):
        """Swapping pair order produces identical per-pair results and signature."""
        relay_a = _make_relay("relay-A", "cb-A", f51_tms=0.1)
        relay_b = _make_relay("relay-B", "cb-B", f51_tms=0.3)
        relay_c = _make_relay("relay-C", "cb-C", f51_tms=0.5)
        test_points = _make_test_points(2000.0)

        result = _run_protection((relay_a, relay_b, relay_c), test_points)

        pairs_v1 = (
            ProtectionSelectivityPair("pair-001", "relay-B", "relay-A"),
            ProtectionSelectivityPair("pair-002", "relay-C", "relay-B"),
        )
        pairs_v2 = (
            ProtectionSelectivityPair("pair-002", "relay-C", "relay-B"),
            ProtectionSelectivityPair("pair-001", "relay-B", "relay-A"),
        )

        coord_v1 = compute_coordination_v1(pairs=pairs_v1, protection_result=result)
        coord_v2 = compute_coordination_v1(pairs=pairs_v2, protection_result=result)

        assert coord_v1.deterministic_signature == coord_v2.deterministic_signature
        assert coord_v1.pairs[0].pair_id == coord_v2.pairs[0].pair_id
        assert coord_v1.pairs[1].pair_id == coord_v2.pairs[1].pair_id

    def test_relay_input_order_does_not_affect_results(self):
        """Relay input order to protection engine doesn't affect coordination."""
        relay1 = _make_relay("relay-001", "cb-001", f51_tms=0.1)
        relay2 = _make_relay("relay-002", "cb-002", f51_tms=0.3)
        test_points = _make_test_points(2000.0, 4000.0)

        result_fwd = _run_protection((relay1, relay2), test_points)
        result_rev = _run_protection((relay2, relay1), test_points)

        pairs = (ProtectionSelectivityPair("pair-001", "relay-002", "relay-001"),)

        coord_fwd = compute_coordination_v1(pairs=pairs, protection_result=result_fwd)
        coord_rev = compute_coordination_v1(pairs=pairs, protection_result=result_rev)

        assert coord_fwd.deterministic_signature == coord_rev.deterministic_signature


# =============================================================================
# TEST: NO VERDICTS
# =============================================================================


class TestNoVerdicts:
    """Verify no OK/FAIL verdicts in output — numbers only."""

    def test_no_verdict_fields_in_result(self):
        """CoordinationResultV1 has no verdict/status/pass/fail fields."""
        relay1 = _make_relay("relay-001", "cb-001", f51_tms=0.1)
        relay2 = _make_relay("relay-002", "cb-002", f51_tms=0.3)
        test_points = _make_test_points(2000.0)

        result = _run_protection((relay1, relay2), test_points)

        pairs = (ProtectionSelectivityPair("pair-001", "relay-002", "relay-001"),)

        coord = compute_coordination_v1(pairs=pairs, protection_result=result)
        result_dict = coord.to_dict()
        str(result_dict).lower()

        # No verdict keywords
        forbidden = ["verdict", "status", "pass", "fail", "ok", "warning", "critical"]
        for word in forbidden:
            # Check in pair results (not in trace metadata)
            for pair in result_dict["pairs"]:
                for mp_dict in pair["margin_points"]:
                    assert (
                        word not in str(mp_dict).lower()
                    ), f"Forbidden word '{word}' found in margin_points"

    def test_margin_point_has_only_numerical_fields(self):
        """SelectivityMarginPoint contains only numerical data."""
        mp = SelectivityMarginPoint(
            i_a_primary=2000.0,
            t_upstream_s=1.5,
            t_downstream_s=0.8,
            margin_s=0.7,
        )
        d = mp.to_dict()
        assert set(d.keys()) == {"i_a_primary", "t_upstream_s", "t_downstream_s", "margin_s"}


# =============================================================================
# TEST: SERIALIZATION
# =============================================================================


class TestSerialization:
    """Verify roundtrip serialization for all types."""

    def test_selectivity_pair_roundtrip(self):
        pair = ProtectionSelectivityPair(
            pair_id="pair-001",
            upstream_relay_id="relay-002",
            downstream_relay_id="relay-001",
        )
        assert ProtectionSelectivityPair.from_dict(pair.to_dict()) == pair

    def test_margin_point_roundtrip(self):
        mp = SelectivityMarginPoint(
            i_a_primary=2000.0,
            t_upstream_s=1.302,
            t_downstream_s=0.801,
            margin_s=0.501,
        )
        assert SelectivityMarginPoint.from_dict(mp.to_dict()) == mp

    def test_margin_point_none_roundtrip(self):
        mp = SelectivityMarginPoint(
            i_a_primary=100.0,
            t_upstream_s=None,
            t_downstream_s=None,
            margin_s=None,
        )
        assert SelectivityMarginPoint.from_dict(mp.to_dict()) == mp

    def test_pair_result_roundtrip(self):
        pr = SelectivityPairResult(
            pair_id="pair-001",
            upstream_relay_id="relay-002",
            downstream_relay_id="relay-001",
            margin_points=(
                SelectivityMarginPoint(2000.0, 1.302, 0.801, 0.501),
                SelectivityMarginPoint(4000.0, 0.650, 0.400, 0.250),
            ),
            trace={"formula": "margin = t_upstream − t_downstream"},
        )
        restored = SelectivityPairResult.from_dict(pr.to_dict())
        assert restored.pair_id == pr.pair_id
        assert len(restored.margin_points) == 2

    def test_coordination_result_roundtrip(self):
        cr = CoordinationResultV1(
            pairs=(
                SelectivityPairResult(
                    pair_id="pair-001",
                    upstream_relay_id="relay-002",
                    downstream_relay_id="relay-001",
                    margin_points=(SelectivityMarginPoint(2000.0, 1.302, 0.801, 0.501),),
                ),
            ),
            deterministic_signature="a" * 64,
        )
        restored = CoordinationResultV1.from_dict(cr.to_dict())
        assert restored.deterministic_signature == cr.deterministic_signature
        assert len(restored.pairs) == 1


# =============================================================================
# TEST: WHITE BOX TRACE
# =============================================================================


class TestWhiteBoxTrace:
    """Verify trace content for auditability."""

    def test_trace_has_formula(self):
        """Trace includes margin formula."""
        relay1 = _make_relay("relay-001", "cb-001", f51_tms=0.1)
        relay2 = _make_relay("relay-002", "cb-002", f51_tms=0.3)
        test_points = _make_test_points(2000.0)

        result = _run_protection((relay1, relay2), test_points)

        pairs = (ProtectionSelectivityPair("pair-001", "relay-002", "relay-001"),)

        coord = compute_coordination_v1(pairs=pairs, protection_result=result)
        trace = coord.pairs[0].trace

        assert "formula" in trace
        assert "upstream" in trace["formula"].lower()
        assert "downstream" in trace["formula"].lower()

    def test_trace_has_statistics(self):
        """Trace includes min/max margin statistics."""
        relay1 = _make_relay("relay-001", "cb-001", f51_tms=0.1)
        relay2 = _make_relay("relay-002", "cb-002", f51_tms=0.3)
        test_points = _make_test_points(2000.0, 4000.0, 6000.0)

        result = _run_protection((relay1, relay2), test_points)

        pairs = (ProtectionSelectivityPair("pair-001", "relay-002", "relay-001"),)

        coord = compute_coordination_v1(pairs=pairs, protection_result=result)
        trace = coord.pairs[0].trace

        assert "min_margin_s" in trace
        assert "max_margin_s" in trace
        assert "total_points" in trace
        assert trace["total_points"] == 3

    def test_trace_has_sign_convention(self):
        """Trace explains sign convention in Polish."""
        relay1 = _make_relay("relay-001", "cb-001", f51_tms=0.1)
        relay2 = _make_relay("relay-002", "cb-002", f51_tms=0.3)
        test_points = _make_test_points(2000.0)

        result = _run_protection((relay1, relay2), test_points)

        pairs = (ProtectionSelectivityPair("pair-001", "relay-002", "relay-001"),)

        coord = compute_coordination_v1(pairs=pairs, protection_result=result)
        trace = coord.pairs[0].trace

        assert "sign_convention_pl" in trace
