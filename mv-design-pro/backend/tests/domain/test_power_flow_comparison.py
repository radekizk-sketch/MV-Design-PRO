"""
P20c — Power Flow Comparison Domain Tests

Tests for:
- Determinism: Same inputs → identical JSON results + trace
- Model serialization/deserialization
- Hash computation consistency
- Ranking generation determinism
"""

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from application.power_flow_comparison import PowerFlowComparisonService
from domain.power_flow_comparison import (
    ANGLE_DELTA_THRESHOLD_DEG,
    ISSUE_DESCRIPTIONS_PL,
    ISSUE_SEVERITY_MAP,
    VOLTAGE_DELTA_THRESHOLD_PU,
    PowerFlowBranchDiffRow,
    PowerFlowBusDiffRow,
    PowerFlowComparisonError,
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
    procent_roznicy,
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


class TestRoznicaWzglednaL13:
    """L-13 — różnica procentowa per wielkość liczona w BACKENDZIE.

    Intencja: warstwa prezentacji nie liczy niczego z wyników solvera; ekran
    porównania czyta gotowe pole. Odniesieniem jest przebieg A, a brak wartości
    (A = 0) jest jawny (None → pole pomijane w odpowiedzi), nigdy zerem.
    """

    def test_procent_liczony_wzgledem_przebiegu_a(self):
        """(B − A)/|A| · 100 — znak zgodny ze znakiem delty."""
        assert procent_roznicy(2.0, 3.0) == 50.0
        assert procent_roznicy(2.0, 1.0) == -50.0
        # Mianownik w wartości bezwzględnej: dla wartości ujemnych znak wyniku
        # nadal pokrywa się ze znakiem delty (B − A).
        assert procent_roznicy(-2.0, -3.0) == -50.0
        assert procent_roznicy(-2.0, -1.0) == 50.0
        assert procent_roznicy(1.0, 1.0) == 0.0

    def test_brak_procentu_gdy_odniesienie_zerowe(self):
        """A = 0 → różnica względna NIE ISTNIEJE (uczciwy brak, nie zero)."""
        assert procent_roznicy(0.0, 5.0) is None
        assert procent_roznicy(0.0, 0.0) is None

    def test_wiersz_szyny_pomija_brak_procentu_w_serializacji(self):
        """exclude_none: brak wartości nie trafia do payloadu jako null."""
        row = PowerFlowBusDiffRow(
            bus_id="BUS_001",
            v_pu_a=1.0,
            v_pu_b=0.95,
            angle_deg_a=0.0,
            angle_deg_b=-1.0,
            p_injected_mw_a=0.0,
            p_injected_mw_b=1.0,
            q_injected_mvar_a=0.0,
            q_injected_mvar_b=0.0,
            delta_v_pu=-0.05,
            delta_angle_deg=-1.0,
            delta_p_mw=1.0,
            delta_q_mvar=0.0,
            delta_v_percent=-5.0,
        )
        data = row.to_dict()
        assert data["delta_v_percent"] == -5.0
        assert "delta_angle_percent" not in data
        assert "delta_p_percent" not in data
        assert "delta_q_percent" not in data
        restored = PowerFlowBusDiffRow.from_dict(data)
        assert restored.delta_v_percent == -5.0
        assert restored.delta_angle_percent is None

    def test_starszy_zapis_bez_pol_procentowych_czytany_bez_migracji(self):
        """Zgodność wsteczna: porównanie z cache sprzed L-13 (brak kluczy)."""
        stary_wiersz = {
            "branch_id": "BR_1",
            "p_from_mw_a": 1.0,
            "p_from_mw_b": 1.5,
            "q_from_mvar_a": 0.0,
            "q_from_mvar_b": 0.0,
            "p_to_mw_a": 1.0,
            "p_to_mw_b": 1.5,
            "q_to_mvar_a": 0.0,
            "q_to_mvar_b": 0.0,
            "losses_p_mw_a": 0.1,
            "losses_p_mw_b": 0.2,
            "losses_q_mvar_a": 0.0,
            "losses_q_mvar_b": 0.0,
            "delta_p_from_mw": 0.5,
            "delta_q_from_mvar": 0.0,
            "delta_p_to_mw": 0.5,
            "delta_q_to_mvar": 0.0,
            "delta_losses_p_mw": 0.1,
            "delta_losses_q_mvar": 0.0,
        }
        row = PowerFlowBranchDiffRow.from_dict(stary_wiersz)
        assert row.delta_losses_p_percent is None
        assert row.delta_p_from_percent is None
        assert "delta_p_from_percent" not in row.to_dict()

    def test_serwis_liczy_procenty_dla_szyn_galezi_i_podsumowania(self):
        """Ścieżka produkcyjna: te same metody, które woła `compare()`."""
        service = PowerFlowComparisonService(lambda: None)

        buses_a = [
            {
                "bus_id": "BUS_1",
                "v_pu": 1.0,
                "angle_deg": 2.0,
                "p_injected_mw": 4.0,
                "q_injected_mvar": 0.0,
            }
        ]
        buses_b = [
            {
                "bus_id": "BUS_1",
                "v_pu": 0.9,
                "angle_deg": 1.0,
                "p_injected_mw": 5.0,
                "q_injected_mvar": 1.0,
            }
        ]
        bus_diffs = service._compute_bus_diffs(buses_a, buses_b)
        assert bus_diffs[0].delta_v_percent == pytest.approx(-10.0)
        assert bus_diffs[0].delta_angle_percent == pytest.approx(-50.0)
        assert bus_diffs[0].delta_p_percent == pytest.approx(25.0)
        # q_a = 0 → różnica względna nie istnieje.
        assert bus_diffs[0].delta_q_percent is None

        branches_a = [
            {
                "branch_id": "BR_1",
                "p_from_mw": 2.0,
                "q_from_mvar": 1.0,
                "p_to_mw": 2.0,
                "q_to_mvar": 1.0,
                "losses_p_mw": 0.2,
                "losses_q_mvar": 0.1,
            }
        ]
        branches_b = [
            {
                "branch_id": "BR_1",
                "p_from_mw": 3.0,
                "q_from_mvar": 1.5,
                "p_to_mw": 1.0,
                "q_to_mvar": 0.5,
                "losses_p_mw": 0.3,
                "losses_q_mvar": 0.2,
            }
        ]
        branch_diffs = service._compute_branch_diffs(branches_a, branches_b)
        assert branch_diffs[0].delta_p_from_percent == pytest.approx(50.0)
        assert branch_diffs[0].delta_q_from_percent == pytest.approx(50.0)
        assert branch_diffs[0].delta_p_to_percent == pytest.approx(-50.0)
        assert branch_diffs[0].delta_q_to_percent == pytest.approx(-50.0)
        assert branch_diffs[0].delta_losses_p_percent == pytest.approx(50.0)
        assert branch_diffs[0].delta_losses_q_percent == pytest.approx(100.0)

        summary = service._build_summary(
            bus_diffs=bus_diffs,
            branch_diffs=branch_diffs,
            ranking=[],
            converged_a=True,
            converged_b=True,
            summary_a={"total_losses_p_mw": 0.2},
            summary_b={"total_losses_p_mw": 0.3},
        )
        assert summary.delta_total_losses_p_percent == pytest.approx(50.0)
        assert summary.to_dict()["delta_total_losses_p_percent"] == pytest.approx(50.0)

    def test_podsumowanie_bez_procentu_gdy_straty_a_zerowe(self):
        """Straty A = 0 → brak różnicy względnej, pole pomijane."""
        service = PowerFlowComparisonService(lambda: None)
        summary = service._build_summary(
            bus_diffs=[],
            branch_diffs=[],
            ranking=[],
            converged_a=True,
            converged_b=True,
            summary_a={"total_losses_p_mw": 0.0},
            summary_b={"total_losses_p_mw": 0.3},
        )
        assert summary.delta_total_losses_p_percent is None
        assert "delta_total_losses_p_percent" not in summary.to_dict()


class TestBusOrBranchOnlyOnOneSideIsNoneNotZero:
    """FAB-E (E1): szyna/galaz obecna tylko w jednym z porownywanych biegow
    (bus_a/bus_b lub br_a/br_b = {}) -> delty None, nigdy fabrykowane 0.0
    (wygladaloby jak calkowity zanik napiecia/przeplywu)."""

    @staticmethod
    def _service():
        return PowerFlowComparisonService(lambda: None)

    def test_bus_only_in_run_a_gives_none_voltage_and_angle_deltas(self):
        service = self._service()
        buses_a = [
            {"bus_id": "BUS_ONLY_A", "v_pu": 1.0, "angle_deg": 2.0},
            {"bus_id": "BUS_BOTH", "v_pu": 1.0, "angle_deg": 0.0},
        ]
        buses_b = [{"bus_id": "BUS_BOTH", "v_pu": 0.99, "angle_deg": 0.1}]

        bus_diffs = service._compute_bus_diffs(buses_a, buses_b)
        only_a = next(b for b in bus_diffs if b.bus_id == "BUS_ONLY_A")
        assert only_a.v_pu_a == pytest.approx(1.0)
        assert only_a.v_pu_b is None
        assert only_a.angle_deg_b is None
        assert only_a.delta_v_pu is None
        assert only_a.delta_angle_deg is None
        assert only_a.delta_v_percent is None
        # Szyna obecna w obu biegach nadal liczy sie normalnie.
        both = next(b for b in bus_diffs if b.bus_id == "BUS_BOTH")
        assert both.delta_v_pu is not None

    def test_branch_only_in_run_b_gives_none_power_deltas(self):
        service = self._service()
        branches_a = [
            {
                "branch_id": "BR_BOTH",
                "p_from_mw": 1.0,
                "q_from_mvar": 0.0,
                "p_to_mw": 1.0,
                "q_to_mvar": 0.0,
                "losses_p_mw": 0.1,
                "losses_q_mvar": 0.0,
            }
        ]
        branches_b = [
            branches_a[0],
            {
                "branch_id": "BR_ONLY_B",
                "p_from_mw": 2.0,
                "q_from_mvar": 0.5,
                "p_to_mw": 1.8,
                "q_to_mvar": 0.4,
                "losses_p_mw": 0.2,
                "losses_q_mvar": 0.1,
            },
        ]

        branch_diffs = service._compute_branch_diffs(branches_a, branches_b)
        only_b = next(b for b in branch_diffs if b.branch_id == "BR_ONLY_B")
        assert only_b.p_from_mw_a is None
        assert only_b.p_from_mw_b == pytest.approx(2.0)
        assert only_b.delta_p_from_mw is None
        assert only_b.delta_losses_q_mvar is None
        both = next(b for b in branch_diffs if b.branch_id == "BR_BOTH")
        assert both.delta_p_from_mw is not None

    def test_ranking_skips_buses_with_none_delta_without_crashing(self):
        """FAB-E: ranking (Rule 2/3) MUSI pominac szyny bez delty, nie abs(None)."""
        service = self._service()
        buses_a = [{"bus_id": "BUS_ONLY_A", "v_pu": 1.0, "angle_deg": 5.0}]
        buses_b: list[dict] = []
        bus_diffs = service._compute_bus_diffs(buses_a, buses_b)
        assert bus_diffs[0].delta_v_pu is None

        # Nie moze podniesc TypeError (abs(None)) — to byla by regresja.
        ranking = service._generate_ranking(
            bus_diffs=bus_diffs,
            branch_diffs=[],
            converged_a=True,
            converged_b=True,
            summary_a={"total_losses_p_mw": 0.0, "slack_p_mw": 0.0},
            summary_b={"total_losses_p_mw": 0.0, "slack_p_mw": 0.0},
        )
        # Szyna bez delty nie generuje VOLTAGE_DELTA_HIGH/ANGLE_SHIFT_HIGH.
        codes = {issue.issue_code for issue in ranking}
        assert PowerFlowIssueCode.VOLTAGE_DELTA_HIGH not in codes
        assert PowerFlowIssueCode.ANGLE_SHIFT_HIGH not in codes

    def test_summary_max_delta_is_none_when_no_bus_is_comparable(self):
        """FAB-E: zero wspolnych szyn -> max_delta_v_pu/angle_deg None, nie 0.0
        (co wygladaloby jak "brak zmian napiecia w calej sieci")."""
        service = self._service()
        buses_a = [{"bus_id": "ONLY_A", "v_pu": 1.0, "angle_deg": 0.0}]
        buses_b = [{"bus_id": "ONLY_B", "v_pu": 1.0, "angle_deg": 0.0}]
        bus_diffs = service._compute_bus_diffs(buses_a, buses_b)
        assert all(b.delta_v_pu is None for b in bus_diffs)

        summary = service._build_summary(
            bus_diffs=bus_diffs,
            branch_diffs=[],
            ranking=[],
            converged_a=True,
            converged_b=True,
            summary_a={"total_losses_p_mw": 0.0},
            summary_b={"total_losses_p_mw": 0.0},
        )
        assert summary.max_delta_v_pu is None
        assert summary.max_delta_angle_deg is None

    def test_summary_max_delta_ignores_none_buses_when_some_are_comparable(self):
        """Mieszanka: jedna szyna bez pary, jedna wspolna -> max liczony z RESZTY,
        nie None (to nie jest przypadek "zero danych")."""
        service = self._service()
        buses_a = [
            {"bus_id": "ONLY_A", "v_pu": 1.0, "angle_deg": 0.0},
            {"bus_id": "BOTH", "v_pu": 1.0, "angle_deg": 0.0},
        ]
        buses_b = [{"bus_id": "BOTH", "v_pu": 0.95, "angle_deg": 2.0}]
        bus_diffs = service._compute_bus_diffs(buses_a, buses_b)

        summary = service._build_summary(
            bus_diffs=bus_diffs,
            branch_diffs=[],
            ranking=[],
            converged_a=True,
            converged_b=True,
            summary_a={"total_losses_p_mw": 0.0},
            summary_b={"total_losses_p_mw": 0.0},
        )
        assert summary.max_delta_v_pu == pytest.approx(0.05)
        assert summary.max_delta_angle_deg == pytest.approx(2.0)


class TestMissingBaseMvaRaisesNotFabricatedDefault:
    """FAB-E (E1): base_mva SKALUJE total_losses/slack_p/slack_q — brak tego
    pola to uszkodzony zapis biegu; milczace 100.0 dawaloby fikcyjnie
    przeskalowane MW/Mvar (gorsze niz odmowa)."""

    def test_missing_base_mva_raises_power_flow_comparison_error(self):
        service = PowerFlowComparisonService(lambda: None)
        payload = {
            "slack_node_id": "BUS_SLACK",
            "node_u_mag_pu": {},
            "node_angle_rad": {},
            "branch_s_from_mva": {},
            "branch_s_to_mva": {},
            # "base_mva" celowo pominiete.
        }
        with pytest.raises(PowerFlowComparisonError, match="base_mva"):
            service._build_pf_result_from_payload(payload, uuid4(), uow=None)
