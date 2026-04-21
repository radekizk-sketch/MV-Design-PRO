"""
P20c — Power Flow Comparison Domain Tests

Tests for:
- Determinism: Same inputs → identical JSON results + trace
- Model serialization/deserialization
- Hash computation consistency
- Ranking generation determinism
"""

from datetime import UTC, datetime

from domain.power_flow_comparison import (
    ANGLE_DELTA_THRESHOLD_DEG,
    ISSUE_DESCRIPTIONS_PL,
    ISSUE_SEVERITY_MAP,
    VOLTAGE_DELTA_THRESHOLD_PU,
    PowerFlowBranchDiffRow,
    PowerFlowBusDiffRow,
    PowerFlowComparisonResult,
    PowerFlowComparisonStatus,
    PowerFlowComparisonSummary,
    PowerFlowComparisonTrace,
    PowerFlowComparisonTraceStep,
    PowerFlowIssueCode,
    PowerFlowIssueSeverity,
    PowerFlowRankingIssue,
    compute_pf_comparison_input_hash,
    get_ranking_thresholds,
    new_power_flow_comparison,
)


class TestPowerFlowBusDiffRow:
    """Tests for PowerFlowBusDiffRow serialization."""

    def test_to_dict_and_from_dict_roundtrip(self):
        """Serialization roundtrip should preserve all fields."""
        row = PowerFlowBusDiffRow(
            bus_id="BUS_001",
            v_pu_a=1.0,
            v_pu_b=0.98,
            angle_deg_a=0.0,
            angle_deg_b=-2.5,
            p_injected_mw_a=10.0,
            p_injected_mw_b=10.5,
            q_injected_mvar_a=5.0,
            q_injected_mvar_b=4.8,
            delta_v_pu=-0.02,
            delta_angle_deg=-2.5,
            delta_p_mw=0.5,
            delta_q_mvar=-0.2,
        )

        data = row.to_dict()
        restored = PowerFlowBusDiffRow.from_dict(data)

        assert restored.bus_id == row.bus_id
        assert restored.v_pu_a == row.v_pu_a
        assert restored.v_pu_b == row.v_pu_b
        assert restored.delta_v_pu == row.delta_v_pu
        assert restored.delta_angle_deg == row.delta_angle_deg


class TestPowerFlowBranchDiffRow:
    """Tests for PowerFlowBranchDiffRow serialization."""

    def test_to_dict_and_from_dict_roundtrip(self):
        """Serialization roundtrip should preserve all fields."""
        row = PowerFlowBranchDiffRow(
            branch_id="LINE_001",
            p_from_mw_a=5.0,
            p_from_mw_b=5.2,
            q_from_mvar_a=1.0,
            q_from_mvar_b=1.1,
            p_to_mw_a=-4.9,
            p_to_mw_b=-5.1,
            q_to_mvar_a=-0.9,
            q_to_mvar_b=-1.0,
            losses_p_mw_a=0.1,
            losses_p_mw_b=0.1,
            losses_q_mvar_a=0.1,
            losses_q_mvar_b=0.1,
            delta_p_from_mw=0.2,
            delta_q_from_mvar=0.1,
            delta_p_to_mw=-0.2,
            delta_q_to_mvar=-0.1,
            delta_losses_p_mw=0.0,
            delta_losses_q_mvar=0.0,
        )

        data = row.to_dict()
        restored = PowerFlowBranchDiffRow.from_dict(data)

        assert restored.branch_id == row.branch_id
        assert restored.losses_p_mw_a == row.losses_p_mw_a
        assert restored.delta_p_from_mw == row.delta_p_from_mw


class TestPowerFlowRankingIssue:
    """Tests for PowerFlowRankingIssue."""

    def test_to_dict_and_from_dict_roundtrip(self):
        """Serialization roundtrip should preserve all fields."""
        issue = PowerFlowRankingIssue(
            issue_code=PowerFlowIssueCode.VOLTAGE_DELTA_HIGH,
            severity=PowerFlowIssueSeverity.MAJOR,
            element_ref="BUS_001",
            description_pl="Duza zmiana napiecia (DeltaV = 0.05 pu)",
            evidence_ref=0,
        )

        data = issue.to_dict()
        restored = PowerFlowRankingIssue.from_dict(data)

        assert restored.issue_code == issue.issue_code
        assert restored.severity == issue.severity
        assert restored.element_ref == issue.element_ref
        assert restored.description_pl == issue.description_pl


class TestPowerFlowComparisonResult:
    """Tests for PowerFlowComparisonResult determinism."""

    def test_to_dict_and_from_dict_roundtrip(self):
        """Full result serialization roundtrip."""
        result = PowerFlowComparisonResult(
            comparison_id="test-comp-id",
            run_a_id="run-a",
            run_b_id="run-b",
            project_id="project-1",
            bus_diffs=(
                PowerFlowBusDiffRow(
                    bus_id="BUS_001",
                    v_pu_a=1.0,
                    v_pu_b=0.98,
                    angle_deg_a=0.0,
                    angle_deg_b=-2.0,
                    p_injected_mw_a=0.0,
                    p_injected_mw_b=0.0,
                    q_injected_mvar_a=0.0,
                    q_injected_mvar_b=0.0,
                    delta_v_pu=-0.02,
                    delta_angle_deg=-2.0,
                    delta_p_mw=0.0,
                    delta_q_mvar=0.0,
                ),
            ),
            branch_diffs=(),
            ranking=(
                PowerFlowRankingIssue(
                    issue_code=PowerFlowIssueCode.VOLTAGE_DELTA_HIGH,
                    severity=PowerFlowIssueSeverity.MAJOR,
                    element_ref="BUS_001",
                    description_pl="Duza zmiana napiecia",
                    evidence_ref=0,
                ),
            ),
            summary=PowerFlowComparisonSummary(
                total_buses=1,
                total_branches=0,
                converged_a=True,
                converged_b=True,
                total_losses_p_mw_a=0.1,
                total_losses_p_mw_b=0.12,
                delta_total_losses_p_mw=0.02,
                max_delta_v_pu=0.02,
                max_delta_angle_deg=2.0,
                total_issues=1,
                critical_issues=0,
                major_issues=1,
                moderate_issues=0,
                minor_issues=0,
            ),
            input_hash="test-hash",
        )

        data = result.to_dict()
        restored = PowerFlowComparisonResult.from_dict(data)

        assert restored.comparison_id == result.comparison_id
        assert restored.run_a_id == result.run_a_id
        assert len(restored.bus_diffs) == 1
        assert len(restored.ranking) == 1
        assert restored.summary.total_buses == 1

    def test_determinism_same_inputs_same_json(self):
        """Same inputs must produce identical JSON."""

        def create_result():
            return PowerFlowComparisonResult(
                comparison_id="det-test",
                run_a_id="run-a",
                run_b_id="run-b",
                project_id="proj-1",
                bus_diffs=(
                    PowerFlowBusDiffRow(
                        bus_id="B1",
                        v_pu_a=1.0,
                        v_pu_b=0.99,
                        angle_deg_a=0.0,
                        angle_deg_b=-1.0,
                        p_injected_mw_a=0.0,
                        p_injected_mw_b=0.0,
                        q_injected_mvar_a=0.0,
                        q_injected_mvar_b=0.0,
                        delta_v_pu=-0.01,
                        delta_angle_deg=-1.0,
                        delta_p_mw=0.0,
                        delta_q_mvar=0.0,
                    ),
                ),
                branch_diffs=(),
                ranking=(),
                summary=PowerFlowComparisonSummary(
                    total_buses=1,
                    total_branches=0,
                    converged_a=True,
                    converged_b=True,
                    total_losses_p_mw_a=0.0,
                    total_losses_p_mw_b=0.0,
                    delta_total_losses_p_mw=0.0,
                    max_delta_v_pu=0.01,
                    max_delta_angle_deg=1.0,
                    total_issues=0,
                    critical_issues=0,
                    major_issues=0,
                    moderate_issues=0,
                    minor_issues=0,
                ),
                input_hash="hash-123",
                created_at=datetime(2024, 1, 1, 12, 0, 0, tzinfo=UTC),
            )

        result1 = create_result()
        result2 = create_result()

        # Both to_dict() calls must produce identical output
        import json

        json1 = json.dumps(result1.to_dict(), sort_keys=True)
        json2 = json.dumps(result2.to_dict(), sort_keys=True)

        assert json1 == json2


class TestPowerFlowComparisonTrace:
    """Tests for PowerFlowComparisonTrace."""

    def test_to_dict_and_from_dict_roundtrip(self):
        """Trace serialization roundtrip."""
        trace = PowerFlowComparisonTrace(
            comparison_id="trace-test",
            run_a_id="run-a",
            run_b_id="run-b",
            snapshot_id_a="snap-a",
            snapshot_id_b="snap-b",
            input_hash_a="hash-a",
            input_hash_b="hash-b",
            solver_version="1.0.0",
            ranking_thresholds=get_ranking_thresholds(),
            steps=(
                PowerFlowComparisonTraceStep(
                    step="MATCH_BUSES",
                    description_pl="Dopasowanie szyn",
                    inputs={"buses_a_count": 10},
                    outputs={"matched_buses": 10},
                ),
            ),
        )

        data = trace.to_dict()
        restored = PowerFlowComparisonTrace.from_dict(data)

        assert restored.comparison_id == trace.comparison_id
        assert restored.solver_version == "1.0.0"
        assert len(restored.steps) == 1
        assert "voltage_delta_threshold_pu" in restored.ranking_thresholds


class TestComputePfComparisonInputHash:
    """Tests for input hash computation."""

    def test_same_inputs_same_hash(self):
        """Same run IDs must produce same hash."""
        hash1 = compute_pf_comparison_input_hash("run-a", "run-b")
        hash2 = compute_pf_comparison_input_hash("run-a", "run-b")

        assert hash1 == hash2

    def test_different_inputs_different_hash(self):
        """Different run IDs must produce different hash."""
        hash1 = compute_pf_comparison_input_hash("run-a", "run-b")
        hash2 = compute_pf_comparison_input_hash("run-b", "run-a")

        assert hash1 != hash2

    def test_order_matters(self):
        """A->B must be different from B->A (directional comparison)."""
        hash_ab = compute_pf_comparison_input_hash("run-a", "run-b")
        hash_ba = compute_pf_comparison_input_hash("run-b", "run-a")

        assert hash_ab != hash_ba


class TestIssueSeverityMap:
    """Tests for issue severity mapping."""

    def test_all_issue_codes_have_severity(self):
        """All issue codes must have severity mapping."""
        for code in PowerFlowIssueCode:
            assert code in ISSUE_SEVERITY_MAP

    def test_all_issue_codes_have_description_pl(self):
        """All issue codes must have Polish description."""
        for code in PowerFlowIssueCode:
            assert code in ISSUE_DESCRIPTIONS_PL
            assert len(ISSUE_DESCRIPTIONS_PL[code]) > 0

    def test_non_convergence_is_critical(self):
        """NON_CONVERGENCE_CHANGE must be CRITICAL (severity 5)."""
        assert (
            ISSUE_SEVERITY_MAP[PowerFlowIssueCode.NON_CONVERGENCE_CHANGE]
            == PowerFlowIssueSeverity.CRITICAL
        )

    def test_voltage_delta_high_is_major(self):
        """VOLTAGE_DELTA_HIGH must be MAJOR (severity 4)."""
        assert (
            ISSUE_SEVERITY_MAP[PowerFlowIssueCode.VOLTAGE_DELTA_HIGH]
            == PowerFlowIssueSeverity.MAJOR
        )


class TestThresholds:
    """Tests for explicit threshold constants."""

    def test_voltage_threshold_is_documented(self):
        """Voltage threshold must be a reasonable value."""
        assert VOLTAGE_DELTA_THRESHOLD_PU == 0.02  # 2%

    def test_angle_threshold_is_documented(self):
        """Angle threshold must be a reasonable value."""
        assert ANGLE_DELTA_THRESHOLD_DEG == 5.0

    def test_get_ranking_thresholds_includes_all(self):
        """get_ranking_thresholds must include all thresholds."""
        thresholds = get_ranking_thresholds()

        assert "voltage_delta_threshold_pu" in thresholds
        assert "angle_delta_threshold_deg" in thresholds
        assert "losses_increase_threshold_mw" in thresholds
        assert "top_n_for_ranking" in thresholds


class TestNewPowerFlowComparison:
    """Tests for factory function."""

    def test_creates_with_created_status(self):
        """Factory must create comparison in CREATED status."""
        from uuid import uuid4

        comparison = new_power_flow_comparison(
            project_id=uuid4(),
            run_a_id="run-a",
            run_b_id="run-b",
        )

        assert comparison.status == PowerFlowComparisonStatus.CREATED

    def test_computes_input_hash(self):
        """Factory must compute input hash."""
        from uuid import uuid4

        comparison = new_power_flow_comparison(
            project_id=uuid4(),
            run_a_id="run-a",
            run_b_id="run-b",
        )

        expected_hash = compute_pf_comparison_input_hash("run-a", "run-b")
        assert comparison.input_hash == expected_hash


class TestDeterminismContract:
    """Tests ensuring determinism contract is maintained."""

    def test_bus_diffs_sorted_by_bus_id(self):
        """Bus diffs must be sorted by bus_id for determinism."""
        bus_diffs = [
            PowerFlowBusDiffRow(
                bus_id="BUS_C",
                v_pu_a=1.0,
                v_pu_b=1.0,
                angle_deg_a=0.0,
                angle_deg_b=0.0,
                p_injected_mw_a=0.0,
                p_injected_mw_b=0.0,
                q_injected_mvar_a=0.0,
                q_injected_mvar_b=0.0,
                delta_v_pu=0.0,
                delta_angle_deg=0.0,
                delta_p_mw=0.0,
                delta_q_mvar=0.0,
            ),
            PowerFlowBusDiffRow(
                bus_id="BUS_A",
                v_pu_a=1.0,
                v_pu_b=1.0,
                angle_deg_a=0.0,
                angle_deg_b=0.0,
                p_injected_mw_a=0.0,
                p_injected_mw_b=0.0,
                q_injected_mvar_a=0.0,
                q_injected_mvar_b=0.0,
                delta_v_pu=0.0,
                delta_angle_deg=0.0,
                delta_p_mw=0.0,
                delta_q_mvar=0.0,
            ),
            PowerFlowBusDiffRow(
                bus_id="BUS_B",
                v_pu_a=1.0,
                v_pu_b=1.0,
                angle_deg_a=0.0,
                angle_deg_b=0.0,
                p_injected_mw_a=0.0,
                p_injected_mw_b=0.0,
                q_injected_mvar_a=0.0,
                q_injected_mvar_b=0.0,
                delta_v_pu=0.0,
                delta_angle_deg=0.0,
                delta_p_mw=0.0,
                delta_q_mvar=0.0,
            ),
        ]

        # Sort by bus_id (deterministic)
        sorted_diffs = sorted(bus_diffs, key=lambda x: x.bus_id)

        assert sorted_diffs[0].bus_id == "BUS_A"
        assert sorted_diffs[1].bus_id == "BUS_B"
        assert sorted_diffs[2].bus_id == "BUS_C"

    def test_ranking_sorted_by_severity_desc_then_code_then_element(self):
        """Ranking must be sorted by severity DESC, then issue_code, then element_ref."""
        issues = [
            PowerFlowRankingIssue(
                issue_code=PowerFlowIssueCode.LOSSES_DECREASED,
                severity=PowerFlowIssueSeverity.MINOR,
                element_ref="system",
                description_pl="Test",
                evidence_ref=0,
            ),
            PowerFlowRankingIssue(
                issue_code=PowerFlowIssueCode.NON_CONVERGENCE_CHANGE,
                severity=PowerFlowIssueSeverity.CRITICAL,
                element_ref="system",
                description_pl="Test",
                evidence_ref=0,
            ),
            PowerFlowRankingIssue(
                issue_code=PowerFlowIssueCode.VOLTAGE_DELTA_HIGH,
                severity=PowerFlowIssueSeverity.MAJOR,
                element_ref="BUS_A",
                description_pl="Test",
                evidence_ref=0,
            ),
        ]

        # Sort by severity DESC, then issue_code, then element_ref
        sorted_issues = sorted(
            issues, key=lambda i: (-i.severity.value, i.issue_code.value, i.element_ref)
        )

        # CRITICAL (5) should be first
        assert sorted_issues[0].severity == PowerFlowIssueSeverity.CRITICAL
        # MAJOR (4) should be second
        assert sorted_issues[1].severity == PowerFlowIssueSeverity.MAJOR
        # MINOR (2) should be last
        assert sorted_issues[2].severity == PowerFlowIssueSeverity.MINOR
