"""P22: Tests for Power Flow Interpretation Builder.

Tests:
- Determinism: Same input -> identical output
- Severity classification correctness
- Ranking determinism
- Polish descriptions
"""

from __future__ import annotations

import json
from datetime import datetime

import pytest
from analysis.power_flow.result import PowerFlowResult
from analysis.power_flow_interpretation import (
    INTERPRETATION_VERSION,
    FindingSeverity,
    InterpretationContext,
    PowerFlowInterpretationBuilder,
)

# =============================================================================
# Test Fixtures
# =============================================================================


@pytest.fixture
def sample_power_flow_result() -> PowerFlowResult:
    """Create a sample PowerFlowResult for testing."""
    return PowerFlowResult(
        converged=True,
        iterations=5,
        tolerance=1e-8,
        max_mismatch_pu=1e-9,
        base_mva=100.0,
        slack_node_id="bus_slack",
        node_u_mag_pu={
            "bus_a": 1.005,  # 0.5% deviation - INFO
            "bus_b": 0.975,  # 2.5% deviation - WARN
            "bus_c": 1.03,  # 3% deviation - WARN
            "bus_d": 0.92,  # 8% deviation - HIGH
            "bus_slack": 1.0,  # 0% deviation - INFO
        },
        node_angle_rad={
            "bus_a": 0.01,
            "bus_b": -0.02,
            "bus_c": 0.03,
            "bus_d": -0.04,
            "bus_slack": 0.0,
        },
        branch_s_from_mva={
            "branch_1": {"re": 0.5, "im": 0.2},  # Low losses
            "branch_2": {"re": 1.0, "im": 0.3},  # Medium losses
            "branch_3": {"re": 2.0, "im": 0.8},  # Higher losses
        },
        branch_s_to_mva={
            "branch_1": {"re": -0.495, "im": -0.19},  # 5 kW losses
            "branch_2": {"re": -0.95, "im": -0.25},  # 50 kW losses
            "branch_3": {"re": -1.85, "im": -0.65},  # 150 kW losses
        },
    )


@pytest.fixture
def sample_context() -> InterpretationContext:
    """Create a sample context for testing."""
    return InterpretationContext(
        project_name="Test Project",
        case_name="Test Case",
        run_timestamp=datetime(2025, 1, 15, 10, 30, 0),
        snapshot_id="snapshot_123",
    )


# =============================================================================
# Determinism Tests
# =============================================================================


def test_interpretation_determinism(
    sample_power_flow_result: PowerFlowResult,
    sample_context: InterpretationContext,
) -> None:
    """Test that same input produces identical output."""
    run_id = "test-run-001"
    run_timestamp = datetime(2025, 1, 15, 10, 30, 0)

    builder = PowerFlowInterpretationBuilder(context=sample_context)

    # Build interpretation twice
    result1 = builder.build(sample_power_flow_result, run_id, run_timestamp)
    result2 = builder.build(sample_power_flow_result, run_id, run_timestamp)

    # Convert to dict for comparison
    dict1 = result1.to_dict()
    dict2 = result2.to_dict()

    # Serialize to JSON for byte-level comparison
    json1 = json.dumps(dict1, sort_keys=True, ensure_ascii=False)
    json2 = json.dumps(dict2, sort_keys=True, ensure_ascii=False)

    assert json1 == json2, "Interpretation should be deterministic"


def test_interpretation_id_determinism(
    sample_power_flow_result: PowerFlowResult,
    sample_context: InterpretationContext,
) -> None:
    """Test that interpretation ID is deterministic."""
    run_id = "test-run-001"
    run_timestamp = datetime(2025, 1, 15, 10, 30, 0)

    builder = PowerFlowInterpretationBuilder(context=sample_context)

    result1 = builder.build(sample_power_flow_result, run_id, run_timestamp)
    result2 = builder.build(sample_power_flow_result, run_id, run_timestamp)

    assert result1.trace.interpretation_id == result2.trace.interpretation_id


# =============================================================================
# Severity Classification Tests
# =============================================================================


def test_voltage_severity_info(
    sample_power_flow_result: PowerFlowResult,
    sample_context: InterpretationContext,
) -> None:
    """Test INFO severity for voltages with <2% deviation."""
    builder = PowerFlowInterpretationBuilder(context=sample_context)
    result = builder.build(sample_power_flow_result, "run-1")

    # Find bus_a (0.5% deviation) and bus_slack (0% deviation)
    bus_a_finding = next(f for f in result.voltage_findings if f.bus_id == "bus_a")
    bus_slack_finding = next(f for f in result.voltage_findings if f.bus_id == "bus_slack")

    assert bus_a_finding.severity == FindingSeverity.INFO
    assert bus_slack_finding.severity == FindingSeverity.INFO


def test_voltage_severity_warn(
    sample_power_flow_result: PowerFlowResult,
    sample_context: InterpretationContext,
) -> None:
    """Test WARN severity for voltages with 2-5% deviation."""
    builder = PowerFlowInterpretationBuilder(context=sample_context)
    result = builder.build(sample_power_flow_result, "run-1")

    # Find bus_b (2.5% deviation) and bus_c (3% deviation)
    bus_b_finding = next(f for f in result.voltage_findings if f.bus_id == "bus_b")
    bus_c_finding = next(f for f in result.voltage_findings if f.bus_id == "bus_c")

    assert bus_b_finding.severity == FindingSeverity.WARN
    assert bus_c_finding.severity == FindingSeverity.WARN


def test_voltage_severity_high(
    sample_power_flow_result: PowerFlowResult,
    sample_context: InterpretationContext,
) -> None:
    """Test HIGH severity for voltages with >5% deviation."""
    builder = PowerFlowInterpretationBuilder(context=sample_context)
    result = builder.build(sample_power_flow_result, "run-1")

    # Find bus_d (8% deviation)
    bus_d_finding = next(f for f in result.voltage_findings if f.bus_id == "bus_d")

    assert bus_d_finding.severity == FindingSeverity.HIGH


# =============================================================================
# Ranking Tests
# =============================================================================


def test_ranking_order(
    sample_power_flow_result: PowerFlowResult,
    sample_context: InterpretationContext,
) -> None:
    """Test that ranking is deterministic and ordered by severity/magnitude."""
    builder = PowerFlowInterpretationBuilder(context=sample_context)
    result = builder.build(sample_power_flow_result, "run-1")

    top_issues = result.summary.top_issues

    # HIGH severity should come first
    if len(top_issues) > 0:
        assert top_issues[0].severity == FindingSeverity.HIGH

    # Ranks should be sequential
    for i, item in enumerate(top_issues):
        assert item.rank == i + 1


def test_summary_counts(
    sample_power_flow_result: PowerFlowResult,
    sample_context: InterpretationContext,
) -> None:
    """Test that summary counts are correct."""
    builder = PowerFlowInterpretationBuilder(context=sample_context)
    result = builder.build(sample_power_flow_result, "run-1")

    summary = result.summary

    # We have 5 voltage findings
    assert summary.total_voltage_findings == 5

    # We have 3 branch findings
    assert summary.total_branch_findings == 3

    # Count HIGH findings (bus_d = 1 voltage + branch_3 with high losses)
    assert summary.high_count >= 1  # At least bus_d

    # Count WARN findings (bus_b, bus_c = 2 voltage)
    assert summary.warn_count >= 2


# =============================================================================
# Polish Description Tests
# =============================================================================


def test_polish_descriptions(
    sample_power_flow_result: PowerFlowResult,
    sample_context: InterpretationContext,
) -> None:
    """Test that descriptions are in Polish."""
    builder = PowerFlowInterpretationBuilder(context=sample_context)
    result = builder.build(sample_power_flow_result, "run-1")

    for finding in result.voltage_findings:
        assert "Szyna" in finding.description_pl
        assert "napiecie" in finding.description_pl

    for finding in result.branch_findings:
        assert "Galaz" in finding.description_pl
        assert "straty" in finding.description_pl


# =============================================================================
# Trace Tests
# =============================================================================


def test_trace_contains_thresholds(
    sample_power_flow_result: PowerFlowResult,
    sample_context: InterpretationContext,
) -> None:
    """Test that trace contains threshold information."""
    builder = PowerFlowInterpretationBuilder(context=sample_context)
    result = builder.build(sample_power_flow_result, "run-1")

    trace = result.trace

    assert trace.thresholds.voltage_info_max_pct == 2.0
    assert trace.thresholds.voltage_warn_max_pct == 5.0
    assert trace.interpretation_version == INTERPRETATION_VERSION


def test_trace_contains_rules(
    sample_power_flow_result: PowerFlowResult,
    sample_context: InterpretationContext,
) -> None:
    """Test that trace contains applied rules."""
    builder = PowerFlowInterpretationBuilder(context=sample_context)
    result = builder.build(sample_power_flow_result, "run-1")

    trace = result.trace

    assert len(trace.rules_applied) > 0
    assert any("VOLTAGE" in rule for rule in trace.rules_applied)
    assert any("RANKING" in rule for rule in trace.rules_applied)


def test_trace_contains_data_sources(
    sample_power_flow_result: PowerFlowResult,
    sample_context: InterpretationContext,
) -> None:
    """Test that trace contains data source references."""
    builder = PowerFlowInterpretationBuilder(context=sample_context)
    result = builder.build(sample_power_flow_result, "run-1")

    trace = result.trace

    assert len(trace.data_sources) > 0
    # K10: odnośniki źródłowe są semantyczne (bez nazw klas kontraktu) —
    # intencja bez zmian: ślad wskazuje napięcia węzłów z wyniku rozpływu.
    assert any("moduły napięć węzłów" in src for src in trace.data_sources)


# =============================================================================
# Serialization Tests
# =============================================================================


def test_serialization_roundtrip(
    sample_power_flow_result: PowerFlowResult,
    sample_context: InterpretationContext,
) -> None:
    """Test that serialization produces valid JSON."""
    builder = PowerFlowInterpretationBuilder(context=sample_context)
    result = builder.build(sample_power_flow_result, "run-1")

    # Convert to dict
    result_dict = result.to_dict()

    # Should be JSON-serializable
    json_str = json.dumps(result_dict, ensure_ascii=False)

    # Should be parseable
    parsed = json.loads(json_str)

    assert parsed["summary"]["total_voltage_findings"] == 5
    assert parsed["trace"]["interpretation_version"] == INTERPRETATION_VERSION


def test_no_context_handling(
    sample_power_flow_result: PowerFlowResult,
) -> None:
    """Test that builder works without context."""
    builder = PowerFlowInterpretationBuilder(context=None)
    result = builder.build(sample_power_flow_result, "run-1")

    assert result.context is None
    assert result.summary.total_voltage_findings == 5


# =============================================================================
# Edge Cases
# =============================================================================


def test_empty_power_flow_result() -> None:
    """Test handling of empty power flow result."""
    empty_result = PowerFlowResult(
        converged=True,
        iterations=1,
        tolerance=1e-8,
        max_mismatch_pu=0.0,
        base_mva=100.0,
        slack_node_id="",
        node_u_mag_pu={},
        node_angle_rad={},
        branch_s_from_mva={},
        branch_s_to_mva={},
    )

    builder = PowerFlowInterpretationBuilder(context=None)
    result = builder.build(empty_result, "run-empty")

    assert len(result.voltage_findings) == 0
    assert len(result.branch_findings) == 0
    assert result.summary.total_voltage_findings == 0
    assert result.summary.total_branch_findings == 0
    assert result.summary.high_count == 0
    assert result.summary.warn_count == 0
    assert result.summary.info_count == 0


def test_branch_missing_one_side_is_skipped_not_zero(caplog: pytest.LogCaptureFixture) -> None:
    """FAB-E (E1): brak jednej strony mocy pozornej galezi nie jest moca zerowa.

    ``branch_2`` ma KOMPLETNA strone "from", ale brakuje jej w
    ``branch_s_to_mva`` (np. bo solver nie zapisal drugiego konca). Przed
    poprawka brakujaca strona byla czytana jako 0+0j, wiec straty galezi
    (`p_from + p_to`) liczyly sie z fikcyjnej polowy danych. Po poprawce galaz
    jest pomijana z jawnym powodem w logu — NIE dostaje sfabrykowanego wyniku
    strat.
    """
    import logging

    result = PowerFlowResult(
        converged=True,
        iterations=5,
        tolerance=1e-8,
        max_mismatch_pu=1e-9,
        base_mva=100.0,
        slack_node_id="bus_slack",
        node_u_mag_pu={},
        node_angle_rad={},
        branch_s_from_mva={
            "branch_1": {"re": 0.5, "im": 0.2},
            "branch_2": {"re": 1.0, "im": 0.3},  # brak odpowiednika w branch_s_to_mva
        },
        branch_s_to_mva={
            "branch_1": {"re": -0.495, "im": -0.19},
        },
    )

    builder = PowerFlowInterpretationBuilder(context=None)
    with caplog.at_level(logging.WARNING, logger="analysis.power_flow_interpretation.builder"):
        interpretation = builder.build(result, "run-missing-side")

    branch_ids = {finding.branch_id for finding in interpretation.branch_findings}
    assert branch_ids == {"branch_1"}, "branch_2 bez kompletu danych nie moze dostac wyniku"
    assert any(
        "branch_2" in record.message and "pominieta" in record.message for record in caplog.records
    ), "brak strony 'to' musi zostac zalogowany z jawnym powodem"


# =============================================================================
# P22b: Deterministic Tie-Breaker Tests
# =============================================================================


def test_ranking_tie_breaker_by_element_type() -> None:
    """P22b: Test deterministic ranking when severity and magnitude are equal.

    When two items have the same severity and magnitude, the tie-breaker
    should be: element_type first, then element_id.

    This ensures: branch_loading < voltage (alphabetically).
    """
    # Create PowerFlowResult with two findings that have same severity but different types
    # bus_x: 3% deviation (WARN) -> magnitude = 3.0
    # branch_y: losses such that magnitude = 3.0 kW (0.003 MW * 1000)
    pf_result = PowerFlowResult(
        converged=True,
        iterations=1,
        tolerance=1e-8,
        max_mismatch_pu=0.0,
        base_mva=100.0,
        slack_node_id="slack",
        node_u_mag_pu={
            "bus_x": 1.03,  # 3% deviation -> WARN, magnitude = 3.0
            "slack": 1.0,
        },
        node_angle_rad={
            "bus_x": 0.0,
            "slack": 0.0,
        },
        branch_s_from_mva={
            # Branch with losses = 3.0 kW (0.003 MW), so magnitude after *1000 = 3.0
            "branch_y": {"re": 0.0015, "im": 0.0},
        },
        branch_s_to_mva={
            "branch_y": {"re": 0.0015, "im": 0.0},  # Total losses = 0.003 MW = 3 kW
        },
    )

    builder = PowerFlowInterpretationBuilder(context=None)
    result = builder.build(pf_result, "run-tie-breaker")

    # Both should be WARN with magnitude = 3.0
    top_issues = result.summary.top_issues

    # Filter to only WARN items with magnitude ~3.0
    relevant_items = [item for item in top_issues if item.severity == FindingSeverity.WARN]

    # Should have at least 2 items (voltage and branch)
    assert len(relevant_items) >= 2

    # Find the two items with same magnitude
    voltage_item = next((item for item in relevant_items if item.element_type == "voltage"), None)
    branch_item = next(
        (item for item in relevant_items if item.element_type == "branch_loading"), None
    )

    assert voltage_item is not None, "Should have voltage finding"
    assert branch_item is not None, "Should have branch finding"

    # branch_loading < voltage alphabetically, so branch should come first
    assert branch_item.rank < voltage_item.rank, (
        f"branch_loading (rank={branch_item.rank}) should come before voltage (rank={voltage_item.rank}) "
        "because 'branch_loading' < 'voltage' alphabetically"
    )


def test_ranking_tie_breaker_by_element_id() -> None:
    """P22b: Test deterministic ranking when severity, magnitude, and element_type are equal.

    When all above are equal, the final tie-breaker is element_id (ascending).
    """
    # Create two voltage findings with same deviation (same severity, same magnitude)
    pf_result = PowerFlowResult(
        converged=True,
        iterations=1,
        tolerance=1e-8,
        max_mismatch_pu=0.0,
        base_mva=100.0,
        slack_node_id="slack",
        node_u_mag_pu={
            "bus_b": 1.03,  # 3% deviation -> WARN
            "bus_a": 1.03,  # 3% deviation -> WARN (same magnitude)
            "slack": 1.0,
        },
        node_angle_rad={
            "bus_a": 0.0,
            "bus_b": 0.0,
            "slack": 0.0,
        },
        branch_s_from_mva={},
        branch_s_to_mva={},
    )

    builder = PowerFlowInterpretationBuilder(context=None)
    result = builder.build(pf_result, "run-tie-breaker-id")

    top_issues = result.summary.top_issues

    # Find bus_a and bus_b
    bus_a_item = next((item for item in top_issues if item.element_id == "bus_a"), None)
    bus_b_item = next((item for item in top_issues if item.element_id == "bus_b"), None)

    assert bus_a_item is not None, "Should have bus_a finding"
    assert bus_b_item is not None, "Should have bus_b finding"

    # bus_a < bus_b alphabetically, so bus_a should come first
    assert bus_a_item.rank < bus_b_item.rank, (
        f"bus_a (rank={bus_a_item.rank}) should come before bus_b (rank={bus_b_item.rank}) "
        "because 'bus_a' < 'bus_b' alphabetically"
    )


def test_ranking_tie_breaker_determinism_multiple_runs() -> None:
    """P22b: Test that tie-breaking is deterministic across multiple runs."""
    pf_result = PowerFlowResult(
        converged=True,
        iterations=1,
        tolerance=1e-8,
        max_mismatch_pu=0.0,
        base_mva=100.0,
        slack_node_id="slack",
        node_u_mag_pu={
            "bus_z": 1.03,  # 3% deviation
            "bus_a": 1.03,  # Same
            "bus_m": 1.03,  # Same
            "slack": 1.0,
        },
        node_angle_rad={
            "bus_z": 0.0,
            "bus_a": 0.0,
            "bus_m": 0.0,
            "slack": 0.0,
        },
        branch_s_from_mva={
            "branch_x": {"re": 0.0015, "im": 0.0},
            "branch_b": {"re": 0.0015, "im": 0.0},
        },
        branch_s_to_mva={
            "branch_x": {"re": 0.0015, "im": 0.0},
            "branch_b": {"re": 0.0015, "im": 0.0},
        },
    )

    builder = PowerFlowInterpretationBuilder(context=None)

    # Run multiple times
    results = [builder.build(pf_result, "run-multi") for _ in range(5)]

    # Extract ranking order from each run
    rankings = []
    for result in results:
        order = [
            (item.rank, item.element_type, item.element_id) for item in result.summary.top_issues
        ]
        rankings.append(order)

    # All rankings should be identical
    for i in range(1, len(rankings)):
        assert (
            rankings[0] == rankings[i]
        ), f"Ranking should be deterministic across runs (run 0 vs run {i})"
