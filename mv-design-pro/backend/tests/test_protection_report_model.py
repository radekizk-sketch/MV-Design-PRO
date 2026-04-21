"""
Tests — PR-31: Protection Report Model + Export Hook

Coverage:
- TestReportBasic: report generation from protection result
- TestCurrentSourceMandatory: current_source always present
- TestCoordinationInReport: coordination summaries included
- TestSorting: relay/pair summaries sorted correctly
- TestDeterminism: signature stability
- TestSerialization: roundtrip for all types
- TestTraceSummary: trace summary content
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
from domain.protection_report_model import (
    CoordinationReportSummary,
    ProtectionReportModel,
    RelayReportSummary,
    build_protection_report,
)

# =============================================================================
# FIXTURES
# =============================================================================


def _make_relay(
    relay_id: str,
    cb_id: str,
    *,
    f51_tms: float = 0.3,
    f50_enabled: bool = False,
    f50_pickup: float = 10.0,
    f50_trip_s: float | None = 0.05,
) -> RelayV1:
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
        ct_ratio=CTRatio(primary_a=400.0, secondary_a=5.0),
        f51=Function51Settings(
            curve_type=IECCurveTypeV1.STANDARD_INVERSE,
            pickup_a_secondary=1.0,
            tms=f51_tms,
        ),
        f50=f50,
    )


def _make_test_points(*currents: float) -> tuple[TestPoint, ...]:
    return tuple(
        TestPoint(point_id=f"tp-{i:02d}", i_a_primary=c) for i, c in enumerate(currents, 1)
    )


def _run_protection(relays, test_points):
    return execute_protection_v1(ProtectionStudyInputV1(relays=relays, test_points=test_points))


def _make_test_points_source() -> ProtectionCurrentSource:
    return ProtectionCurrentSource(
        source_type=CurrentSourceType.TEST_POINTS,
    )


def _make_sc_source() -> ProtectionCurrentSource:
    return ProtectionCurrentSource(
        source_type=CurrentSourceType.SC_RESULT,
        sc_selection=SCCurrentSelection(
            run_id=str(uuid4()),
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


# =============================================================================
# TEST: REPORT BASIC
# =============================================================================


class TestReportBasic:
    """Verify basic report generation."""

    def test_report_from_single_relay(self):
        relay = _make_relay("relay-001", "cb-001")
        test_points = _make_test_points(2000.0)
        prot_result = _run_protection((relay,), test_points)
        source = _make_test_points_source()

        report = build_protection_report(
            run_id=str(uuid4()),
            protection_result=prot_result,
            current_source=source,
        )

        assert report.analysis_type == "PROTECTION"
        assert len(report.relay_summaries) == 1
        assert report.relay_summaries[0].relay_id == "relay-001"
        assert report.relay_summaries[0].attached_cb_id == "cb-001"

    def test_report_id_generated(self):
        relay = _make_relay("relay-001", "cb-001")
        test_points = _make_test_points(2000.0)
        prot_result = _run_protection((relay,), test_points)
        source = _make_test_points_source()

        report = build_protection_report(
            run_id=str(uuid4()),
            protection_result=prot_result,
            current_source=source,
        )

        assert report.report_id  # Non-empty
        assert len(report.report_id) > 0

    def test_run_id_matches(self):
        relay = _make_relay("relay-001", "cb-001")
        test_points = _make_test_points(2000.0)
        prot_result = _run_protection((relay,), test_points)
        source = _make_test_points_source()
        run_id = str(uuid4())

        report = build_protection_report(
            run_id=run_id,
            protection_result=prot_result,
            current_source=source,
        )

        assert report.run_id == run_id

    def test_relay_summary_has_ct_label(self):
        relay = _make_relay("relay-001", "cb-001")
        test_points = _make_test_points(2000.0)
        prot_result = _run_protection((relay,), test_points)
        source = _make_test_points_source()

        report = build_protection_report(
            run_id=str(uuid4()),
            protection_result=prot_result,
            current_source=source,
        )

        assert "400" in report.relay_summaries[0].ct_ratio_label
        assert "5" in report.relay_summaries[0].ct_ratio_label

    def test_relay_summary_has_f51_summary(self):
        relay = _make_relay("relay-001", "cb-001", f51_tms=0.3)
        test_points = _make_test_points(2000.0)
        prot_result = _run_protection((relay,), test_points)
        source = _make_test_points_source()

        report = build_protection_report(
            run_id=str(uuid4()),
            protection_result=prot_result,
            current_source=source,
        )

        f51 = report.relay_summaries[0].f51_summary
        assert f51 is not None
        assert "TMS" in f51

    def test_relay_summary_has_f50_summary(self):
        relay = _make_relay(
            "relay-001",
            "cb-001",
            f50_enabled=True,
            f50_pickup=5.0,
            f50_trip_s=0.05,
        )
        test_points = _make_test_points(5000.0)
        prot_result = _run_protection((relay,), test_points)
        source = _make_test_points_source()

        report = build_protection_report(
            run_id=str(uuid4()),
            protection_result=prot_result,
            current_source=source,
        )

        f50 = report.relay_summaries[0].f50_summary
        assert f50 is not None
        assert "I>>" in f50

    def test_test_point_results_included(self):
        relay = _make_relay("relay-001", "cb-001")
        test_points = _make_test_points(2000.0, 4000.0)
        prot_result = _run_protection((relay,), test_points)
        source = _make_test_points_source()

        report = build_protection_report(
            run_id=str(uuid4()),
            protection_result=prot_result,
            current_source=source,
        )

        tps = report.relay_summaries[0].test_point_results
        assert len(tps) == 2


# =============================================================================
# TEST: CURRENT SOURCE MANDATORY
# =============================================================================


class TestCurrentSourceMandatory:
    """Verify current_source is always present in report."""

    def test_test_points_source_in_report(self):
        relay = _make_relay("relay-001", "cb-001")
        test_points = _make_test_points(2000.0)
        prot_result = _run_protection((relay,), test_points)
        source = _make_test_points_source()

        report = build_protection_report(
            run_id=str(uuid4()),
            protection_result=prot_result,
            current_source=source,
        )

        assert report.current_source_summary
        assert report.current_source_summary["source_type"] == "TEST_POINTS"

    def test_sc_source_in_report(self):
        relay = _make_relay("relay-001", "cb-001")
        test_points = _make_test_points(2000.0)
        prot_result = _run_protection((relay,), test_points)
        source = _make_sc_source()

        report = build_protection_report(
            run_id=str(uuid4()),
            protection_result=prot_result,
            current_source=source,
        )

        assert report.current_source_summary["source_type"] == "SC_RESULT"
        assert "sc_selection" in report.current_source_summary


# =============================================================================
# TEST: COORDINATION IN REPORT
# =============================================================================


class TestCoordinationInReport:
    """Verify coordination summaries in report."""

    def test_coordination_summaries_included(self):
        relay1 = _make_relay("relay-001", "cb-001", f51_tms=0.1)
        relay2 = _make_relay("relay-002", "cb-002", f51_tms=0.3)
        test_points = _make_test_points(2000.0, 4000.0)
        prot_result = _run_protection((relay1, relay2), test_points)
        source = _make_test_points_source()

        pairs = (ProtectionSelectivityPair("pair-001", "relay-002", "relay-001"),)
        coord_result = compute_coordination_v1(
            pairs=pairs,
            protection_result=prot_result,
        )

        report = build_protection_report(
            run_id=str(uuid4()),
            protection_result=prot_result,
            current_source=source,
            coordination_result=coord_result,
        )

        assert report.coordination_summaries is not None
        assert len(report.coordination_summaries) == 1
        cs = report.coordination_summaries[0]
        assert cs.pair_id == "pair-001"
        assert cs.min_margin_s is not None
        assert cs.max_margin_s is not None
        assert cs.margin_points_count == 2

    def test_no_coordination_yields_none(self):
        relay = _make_relay("relay-001", "cb-001")
        test_points = _make_test_points(2000.0)
        prot_result = _run_protection((relay,), test_points)
        source = _make_test_points_source()

        report = build_protection_report(
            run_id=str(uuid4()),
            protection_result=prot_result,
            current_source=source,
        )

        assert report.coordination_summaries is None


# =============================================================================
# TEST: SORTING
# =============================================================================


class TestSorting:
    """Verify relay and pair summaries are sorted."""

    def test_relay_summaries_sorted_by_relay_id(self):
        relay_z = _make_relay("relay-ZZZ", "cb-Z")
        relay_a = _make_relay("relay-AAA", "cb-A")
        test_points = _make_test_points(2000.0)
        prot_result = _run_protection((relay_z, relay_a), test_points)
        source = _make_test_points_source()

        report = build_protection_report(
            run_id=str(uuid4()),
            protection_result=prot_result,
            current_source=source,
        )

        ids = [rs.relay_id for rs in report.relay_summaries]
        assert ids == sorted(ids)

    def test_coordination_summaries_sorted_by_pair_id(self):
        relay_a = _make_relay("relay-A", "cb-A", f51_tms=0.1)
        relay_b = _make_relay("relay-B", "cb-B", f51_tms=0.3)
        relay_c = _make_relay("relay-C", "cb-C", f51_tms=0.5)
        test_points = _make_test_points(2000.0)
        prot_result = _run_protection((relay_a, relay_b, relay_c), test_points)
        source = _make_test_points_source()

        pairs = (
            ProtectionSelectivityPair("pair-ZZZ", "relay-C", "relay-B"),
            ProtectionSelectivityPair("pair-AAA", "relay-B", "relay-A"),
        )
        coord_result = compute_coordination_v1(
            pairs=pairs,
            protection_result=prot_result,
        )

        report = build_protection_report(
            run_id=str(uuid4()),
            protection_result=prot_result,
            current_source=source,
            coordination_result=coord_result,
        )

        assert report.coordination_summaries is not None
        ids = [cs.pair_id for cs in report.coordination_summaries]
        assert ids == sorted(ids)


# =============================================================================
# TEST: DETERMINISM
# =============================================================================


class TestDeterminism:
    """Verify deterministic signature."""

    def test_same_input_same_signature(self):
        relay = _make_relay("relay-001", "cb-001")
        test_points = _make_test_points(2000.0)
        prot_result = _run_protection((relay,), test_points)
        source = _make_test_points_source()
        run_id = str(uuid4())

        report1 = build_protection_report(
            run_id=run_id,
            protection_result=prot_result,
            current_source=source,
        )
        report2 = build_protection_report(
            run_id=run_id,
            protection_result=prot_result,
            current_source=source,
        )

        assert report1.deterministic_signature == report2.deterministic_signature
        # report_id should differ (transient)
        assert report1.report_id != report2.report_id

    def test_different_input_different_signature(self):
        relay1 = _make_relay("relay-001", "cb-001", f51_tms=0.1)
        relay2 = _make_relay("relay-001", "cb-001", f51_tms=0.5)
        test_points = _make_test_points(2000.0)
        result1 = _run_protection((relay1,), test_points)
        result2 = _run_protection((relay2,), test_points)
        source = _make_test_points_source()
        run_id = str(uuid4())

        report1 = build_protection_report(
            run_id=run_id,
            protection_result=result1,
            current_source=source,
        )
        report2 = build_protection_report(
            run_id=run_id,
            protection_result=result2,
            current_source=source,
        )

        assert report1.deterministic_signature != report2.deterministic_signature

    def test_signature_is_sha256(self):
        relay = _make_relay("relay-001", "cb-001")
        test_points = _make_test_points(2000.0)
        prot_result = _run_protection((relay,), test_points)
        source = _make_test_points_source()

        report = build_protection_report(
            run_id=str(uuid4()),
            protection_result=prot_result,
            current_source=source,
        )

        sig = report.deterministic_signature
        assert len(sig) == 64
        assert all(c in "0123456789abcdef" for c in sig)


# =============================================================================
# TEST: SERIALIZATION
# =============================================================================


class TestSerialization:
    """Verify roundtrip serialization."""

    def test_relay_summary_roundtrip(self):
        rs = RelayReportSummary(
            relay_id="relay-001",
            attached_cb_id="cb-001",
            ct_ratio_label="400/5 A",
            f50_summary="I>> = 25.0 A sec, t = 0.05 s",
            f51_summary="SI, TMS=0.3, I> = 1.0 A sec",
            test_point_results=({"point_id": "tp-01", "f51_t_trip_s": 1.302},),
        )
        restored = RelayReportSummary.from_dict(rs.to_dict())
        assert restored.relay_id == rs.relay_id
        assert restored.f50_summary == rs.f50_summary

    def test_coordination_summary_roundtrip(self):
        cs = CoordinationReportSummary(
            pair_id="pair-001",
            upstream_label="relay-002",
            downstream_label="relay-001",
            min_margin_s=0.25,
            max_margin_s=0.75,
            margin_points_count=3,
        )
        restored = CoordinationReportSummary.from_dict(cs.to_dict())
        assert restored == cs

    def test_report_model_roundtrip(self):
        relay = _make_relay("relay-001", "cb-001")
        test_points = _make_test_points(2000.0)
        prot_result = _run_protection((relay,), test_points)
        source = _make_test_points_source()

        report = build_protection_report(
            run_id=str(uuid4()),
            protection_result=prot_result,
            current_source=source,
        )

        restored = ProtectionReportModel.from_dict(report.to_dict())
        assert restored.run_id == report.run_id
        assert restored.deterministic_signature == report.deterministic_signature
        assert len(restored.relay_summaries) == len(report.relay_summaries)


# =============================================================================
# TEST: TRACE SUMMARY
# =============================================================================


class TestTraceSummary:
    """Verify trace summary content."""

    def test_trace_has_relay_count(self):
        relay1 = _make_relay("relay-001", "cb-001")
        relay2 = _make_relay("relay-002", "cb-002")
        test_points = _make_test_points(2000.0)
        prot_result = _run_protection((relay1, relay2), test_points)
        source = _make_test_points_source()

        report = build_protection_report(
            run_id=str(uuid4()),
            protection_result=prot_result,
            current_source=source,
        )

        assert report.trace_summary["total_relays"] == 2

    def test_trace_has_test_point_count(self):
        relay = _make_relay("relay-001", "cb-001")
        test_points = _make_test_points(2000.0, 4000.0, 6000.0)
        prot_result = _run_protection((relay,), test_points)
        source = _make_test_points_source()

        report = build_protection_report(
            run_id=str(uuid4()),
            protection_result=prot_result,
            current_source=source,
        )

        assert report.trace_summary["total_test_points"] == 3

    def test_trace_has_protection_signature(self):
        relay = _make_relay("relay-001", "cb-001")
        test_points = _make_test_points(2000.0)
        prot_result = _run_protection((relay,), test_points)
        source = _make_test_points_source()

        report = build_protection_report(
            run_id=str(uuid4()),
            protection_result=prot_result,
            current_source=source,
        )

        assert "protection_signature" in report.trace_summary

    def test_trace_has_coordination_info(self):
        relay1 = _make_relay("relay-001", "cb-001", f51_tms=0.1)
        relay2 = _make_relay("relay-002", "cb-002", f51_tms=0.3)
        test_points = _make_test_points(2000.0)
        prot_result = _run_protection((relay1, relay2), test_points)
        source = _make_test_points_source()

        pairs = (ProtectionSelectivityPair("pair-001", "relay-002", "relay-001"),)
        coord_result = compute_coordination_v1(
            pairs=pairs,
            protection_result=prot_result,
        )

        report = build_protection_report(
            run_id=str(uuid4()),
            protection_result=prot_result,
            current_source=source,
            coordination_result=coord_result,
        )

        assert report.trace_summary["total_pairs"] == 1
        assert "coordination_signature" in report.trace_summary
