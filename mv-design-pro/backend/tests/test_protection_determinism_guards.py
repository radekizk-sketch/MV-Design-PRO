"""
Tests — PR-32: Protection Governance & Determinism Guards

Comprehensive determinism verification across the entire Protection Block.

Coverage:
- TestProtectionHashEquality: identical input → identical output
- TestBridgeHashDeterminism: current_source affects hash
- TestRelayOrderInvariance: relay permutation → same result
- TestPointOrderInvariance: test point permutation → same result
- TestPairOrderInvariance: coordination pair permutation → same result
- TestCoordinationSign: swap upstream/downstream → flipped margin sign
- TestReportDeterminism: report signature stability + float format
- TestEndToEndPipeline: full pipeline determinism (engine → coordination → report)

Karta CV-3.3-A2 (2026-09-05): `TestOverlayDeterminism` skasowana razem z
`application/result_mapping/protection_to_overlay_v1.py` (zero konsumenta
produkcyjnego — żywa końcówka `GET .../protection-overlay` w
`api/protection_runs.py` buduje nakładkę WŁASNYM, prostszym mechanizmem
inline, nie przez ten mapper; własna regresja tej końcówki:
`tests/api/test_protection_overlay_swiezosc.py`). Krok nakładki wycięty też
z `TestEndToEndPipeline` — determinizm silnika/koordynacji/raportu zostaje
dowiedziony bez niego.
"""

from __future__ import annotations

from uuid import uuid4

from domain.protection_coordination_v1 import (
    ProtectionSelectivityPair,
    compute_coordination_v1,
)
from domain.protection_current_source import (
    CurrentSourceType,
    ProtectionCurrentSource,
    SCCurrentSelection,
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
from domain.protection_report_model import build_protection_report

# =============================================================================
# FIXTURES
# =============================================================================


def _relay(
    relay_id: str,
    cb_id: str,
    *,
    tms: float = 0.3,
    pickup: float = 1.0,
    curve: IECCurveTypeV1 = IECCurveTypeV1.STANDARD_INVERSE,
    f50: bool = False,
    f50_pickup: float = 10.0,
    f50_trip: float | None = 0.05,
) -> RelayV1:
    f50_settings = None
    if f50:
        f50_settings = Function50Settings(
            enabled=True,
            pickup_a_secondary=f50_pickup,
            t_trip_s=f50_trip,
        )
    return RelayV1(
        relay_id=relay_id,
        attached_cb_id=cb_id,
        ct_ratio=CTRatio(primary_a=400.0, secondary_a=5.0),
        f51=Function51Settings(
            curve_type=curve,
            pickup_a_secondary=pickup,
            tms=tms,
        ),
        f50=f50_settings,
    )


def _tps(*currents: float) -> tuple[TestPoint, ...]:
    return tuple(
        TestPoint(point_id=f"tp-{i:02d}", i_a_primary=c) for i, c in enumerate(currents, 1)
    )


def _run(relays, test_points):
    return execute_protection_v1(ProtectionStudyInputV1(relays=relays, test_points=test_points))


def _test_points_source() -> ProtectionCurrentSource:
    return ProtectionCurrentSource(source_type=CurrentSourceType.TEST_POINTS)


def _sc_source(relay_ids: list[str]) -> ProtectionCurrentSource:
    return ProtectionCurrentSource(
        source_type=CurrentSourceType.SC_RESULT,
        sc_selection=SCCurrentSelection(
            run_id=str(uuid4()),
            quantity="ikss_a",
            target_ref_mapping=tuple(
                TargetRefMapping(relay_id=rid, element_ref=f"bus-{rid}", element_type="bus")
                for rid in relay_ids
            ),
        ),
    )


# =============================================================================
# TEST: PROTECTION HASH EQUALITY
# =============================================================================


class TestProtectionHashEquality:
    """Identical input produces identical output hash."""

    def test_same_input_same_signature(self):
        r1 = _relay("r1", "cb1", tms=0.1)
        r2 = _relay("r2", "cb2", tms=0.3)
        tps = _tps(2000.0, 4000.0)

        sig1 = _run((r1, r2), tps).deterministic_signature
        sig2 = _run((r1, r2), tps).deterministic_signature
        assert sig1 == sig2

    def test_different_tms_different_signature(self):
        r1a = _relay("r1", "cb1", tms=0.1)
        r1b = _relay("r1", "cb1", tms=0.2)
        r2 = _relay("r2", "cb2", tms=0.3)
        tps = _tps(2000.0)

        sig_a = _run((r1a, r2), tps).deterministic_signature
        sig_b = _run((r1b, r2), tps).deterministic_signature
        assert sig_a != sig_b

    def test_different_current_different_signature(self):
        relays = (_relay("r1", "cb1"),)
        sig_a = _run(relays, _tps(2000.0)).deterministic_signature
        sig_b = _run(relays, _tps(3000.0)).deterministic_signature
        assert sig_a != sig_b


# =============================================================================
# TEST: BRIDGE HASH DETERMINISM
# =============================================================================


class TestBridgeHashDeterminism:
    """Current source affects hash deterministically."""

    def test_hash_changes_with_source_type(self):
        tp_source = _test_points_source()
        sc_source = _sc_source(["r1"])
        assert tp_source.canonical_hash() != sc_source.canonical_hash()

    def test_hash_same_for_identical_source(self):
        s1 = _test_points_source()
        s2 = _test_points_source()
        assert s1.canonical_hash() == s2.canonical_hash()

    def test_hash_changes_with_quantity(self):
        s1 = ProtectionCurrentSource(
            source_type=CurrentSourceType.SC_RESULT,
            sc_selection=SCCurrentSelection(
                run_id="run-1",
                quantity="ikss_a",
                target_ref_mapping=(),
            ),
        )
        s2 = ProtectionCurrentSource(
            source_type=CurrentSourceType.SC_RESULT,
            sc_selection=SCCurrentSelection(
                run_id="run-1",
                quantity="ip_a",
                target_ref_mapping=(),
            ),
        )
        assert s1.canonical_hash() != s2.canonical_hash()


# =============================================================================
# TEST: RELAY ORDER INVARIANCE
# =============================================================================


class TestRelayOrderInvariance:
    """Relay insertion order does not affect result."""

    def test_two_relays(self):
        r1 = _relay("r1", "cb1", tms=0.1)
        r2 = _relay("r2", "cb2", tms=0.3)
        tps = _tps(2000.0, 4000.0)

        sig_12 = _run((r1, r2), tps).deterministic_signature
        sig_21 = _run((r2, r1), tps).deterministic_signature
        assert sig_12 == sig_21

    def test_three_relays(self):
        r1 = _relay("r1", "cb1", tms=0.1)
        r2 = _relay("r2", "cb2", tms=0.3)
        r3 = _relay("r3", "cb3", tms=0.5)
        tps = _tps(2000.0)

        sig_123 = _run((r1, r2, r3), tps).deterministic_signature
        sig_312 = _run((r3, r1, r2), tps).deterministic_signature
        sig_231 = _run((r2, r3, r1), tps).deterministic_signature
        assert sig_123 == sig_312 == sig_231


# =============================================================================
# TEST: TEST POINT ORDER INVARIANCE
# =============================================================================


class TestPointOrderInvariance:
    """Test point insertion order does not affect result."""

    def test_two_points(self):
        relays = (_relay("r1", "cb1"),)
        tp_a = TestPoint(point_id="tp-A", i_a_primary=2000.0)
        tp_b = TestPoint(point_id="tp-B", i_a_primary=4000.0)

        sig_ab = _run(relays, (tp_a, tp_b)).deterministic_signature
        sig_ba = _run(relays, (tp_b, tp_a)).deterministic_signature
        assert sig_ab == sig_ba

    def test_three_points(self):
        relays = (_relay("r1", "cb1"),)
        t1 = TestPoint(point_id="tp-01", i_a_primary=1000.0)
        t2 = TestPoint(point_id="tp-02", i_a_primary=3000.0)
        t3 = TestPoint(point_id="tp-03", i_a_primary=5000.0)

        sig_123 = _run(relays, (t1, t2, t3)).deterministic_signature
        sig_321 = _run(relays, (t3, t2, t1)).deterministic_signature
        assert sig_123 == sig_321


# =============================================================================
# TEST: PAIR ORDER INVARIANCE
# =============================================================================


class TestPairOrderInvariance:
    """Coordination pair insertion order does not affect result."""

    def test_two_pairs(self):
        r1 = _relay("r1", "cb1", tms=0.1)
        r2 = _relay("r2", "cb2", tms=0.3)
        r3 = _relay("r3", "cb3", tms=0.5)
        tps = _tps(2000.0)
        result = _run((r1, r2, r3), tps)

        p1 = ProtectionSelectivityPair("pair-1", "r2", "r1")
        p2 = ProtectionSelectivityPair("pair-2", "r3", "r2")

        sig_12 = compute_coordination_v1(
            pairs=(p1, p2), protection_result=result
        ).deterministic_signature
        sig_21 = compute_coordination_v1(
            pairs=(p2, p1), protection_result=result
        ).deterministic_signature
        assert sig_12 == sig_21


# =============================================================================
# TEST: COORDINATION SIGN
# =============================================================================


class TestCoordinationSign:
    """Swapping upstream/downstream reverses margin sign."""

    def test_swap_flips_sign(self):
        r1 = _relay("r1", "cb1", tms=0.1)
        r2 = _relay("r2", "cb2", tms=0.3)
        tps = _tps(2000.0)
        result = _run((r1, r2), tps)

        pair_normal = ProtectionSelectivityPair("p", "r2", "r1")
        pair_swapped = ProtectionSelectivityPair("p", "r1", "r2")

        coord_normal = compute_coordination_v1(
            pairs=(pair_normal,),
            protection_result=result,
        )
        coord_swapped = compute_coordination_v1(
            pairs=(pair_swapped,),
            protection_result=result,
        )

        m_normal = coord_normal.pairs[0].margin_points[0].margin_s
        m_swapped = coord_swapped.pairs[0].margin_points[0].margin_s

        assert m_normal is not None
        assert m_swapped is not None
        assert (
            abs(m_normal + m_swapped) < 1e-9
        ), "Swapping upstream/downstream should flip margin sign"


# =============================================================================
# TEST: REPORT DETERMINISM
# =============================================================================


class TestReportDeterminism:
    """Report produces deterministic output."""

    def test_same_input_same_signature(self):
        r1 = _relay("r1", "cb1")
        tps = _tps(2000.0)
        result = _run((r1,), tps)
        source = _test_points_source()
        run_id = str(uuid4())

        sig1 = build_protection_report(
            run_id=run_id,
            protection_result=result,
            current_source=source,
        ).deterministic_signature
        sig2 = build_protection_report(
            run_id=run_id,
            protection_result=result,
            current_source=source,
        ).deterministic_signature
        assert sig1 == sig2

    def test_float_format_no_comma(self):
        """Report uses stable float formatting — no locale-dependent commas."""
        r1 = _relay("r1", "cb1")
        tps = _tps(2000.0, 4000.0)
        result = _run((r1,), tps)
        source = _test_points_source()

        report = build_protection_report(
            run_id=str(uuid4()),
            protection_result=result,
            current_source=source,
        )

        for summary in report.relay_summaries:
            for tp in summary.test_point_results:
                for _key, val in tp.items():
                    if isinstance(val, float):
                        # Float should use dot, not comma
                        assert "," not in str(val)


# =============================================================================
# TEST: END-TO-END PIPELINE
# =============================================================================


class TestEndToEndPipeline:
    """Full pipeline determinism: engine → coordination → report."""

    def test_full_pipeline_determinism(self):
        r1 = _relay("r1", "cb1", tms=0.1, f50=True, f50_pickup=5.0)
        r2 = _relay("r2", "cb2", tms=0.3)
        r3 = _relay("r3", "cb3", tms=0.5)
        tps = _tps(2000.0, 4000.0, 6000.0)
        run_id = uuid4()
        source = _test_points_source()

        # Run 1
        prot1 = _run((r1, r2, r3), tps)
        pairs = (
            ProtectionSelectivityPair("p1", "r2", "r1"),
            ProtectionSelectivityPair("p2", "r3", "r2"),
        )
        coord1 = compute_coordination_v1(pairs=pairs, protection_result=prot1)
        report1 = build_protection_report(
            run_id=str(run_id),
            protection_result=prot1,
            current_source=source,
            coordination_result=coord1,
        )

        # Run 2 (reversed relay order, reversed pair order)
        prot2 = _run((r3, r1, r2), tps)
        pairs_rev = (
            ProtectionSelectivityPair("p2", "r3", "r2"),
            ProtectionSelectivityPair("p1", "r2", "r1"),
        )
        coord2 = compute_coordination_v1(pairs=pairs_rev, protection_result=prot2)
        report2 = build_protection_report(
            run_id=str(run_id),
            protection_result=prot2,
            current_source=source,
            coordination_result=coord2,
        )

        # All signatures must match
        assert prot1.deterministic_signature == prot2.deterministic_signature
        assert coord1.deterministic_signature == coord2.deterministic_signature
        assert report1.deterministic_signature == report2.deterministic_signature
