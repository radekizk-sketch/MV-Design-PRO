"""
P20d: Tests for Power Flow export functionality.

CANONICAL ALIGNMENT:
- NOT-A-SOLVER: Tests verify export layer does no physics
- Determinism: Same input → identical output
- UTF-8 encoding validation
"""

import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from network_model.reporting.power_flow_export import (
    export_power_flow_comparison_to_json,
    export_power_flow_result_to_json,
    export_power_flow_results_to_jsonl,
)

# =============================================================================
# Test Fixtures
# =============================================================================


class MockPowerFlowResult:
    """Mock PowerFlowResultV1 for testing."""

    def __init__(self, converged: bool = True, iterations: int = 5):
        self._converged = converged
        self._iterations = iterations

    def to_dict(self) -> dict:
        return {
            "result_version": "1.0.0",
            "converged": self._converged,
            "iterations_count": self._iterations,
            "tolerance_used": 1e-8,
            "base_mva": 100.0,
            "slack_bus_id": "bus_001",
            "bus_results": [
                {
                    "bus_id": "bus_001",
                    "v_pu": 1.0,
                    "angle_deg": 0.0,
                    "p_injected_mw": 10.5,
                    "q_injected_mvar": 5.2,
                },
                {
                    "bus_id": "bus_002",
                    "v_pu": 0.98,
                    "angle_deg": -2.5,
                    "p_injected_mw": -5.0,
                    "q_injected_mvar": -2.0,
                },
            ],
            "branch_results": [
                {
                    "branch_id": "line_001",
                    "p_from_mw": 5.5,
                    "q_from_mvar": 2.5,
                    "p_to_mw": -5.4,
                    "q_to_mvar": -2.4,
                    "losses_p_mw": 0.1,
                    "losses_q_mvar": 0.1,
                },
            ],
            "summary": {
                "total_losses_p_mw": 0.1,
                "total_losses_q_mvar": 0.1,
                "min_v_pu": 0.98,
                "max_v_pu": 1.0,
                "slack_p_mw": 10.5,
                "slack_q_mvar": 5.2,
            },
        }


class MockPowerFlowTrace:
    """Mock PowerFlowTrace for testing."""

    def to_dict(self) -> dict:
        return {
            "solver_version": "1.0.0",
            "input_hash": "abc123def456",
            "init_method": "flat",
            "tolerance": 1e-8,
            "max_iterations": 30,
            "converged": True,
            "final_iterations_count": 5,
            "iterations": [
                {"k": 1, "norm_mismatch": 0.5, "max_mismatch_pu": 0.1},
                {"k": 2, "norm_mismatch": 0.05, "max_mismatch_pu": 0.01},
                {"k": 3, "norm_mismatch": 0.005, "max_mismatch_pu": 0.001},
                {"k": 4, "norm_mismatch": 0.0005, "max_mismatch_pu": 0.0001},
                {"k": 5, "norm_mismatch": 1e-9, "max_mismatch_pu": 1e-10},
            ],
        }


# =============================================================================
# JSON Export Tests
# =============================================================================


class TestPowerFlowResultJsonExport:
    """Tests for export_power_flow_result_to_json."""

    def test_export_creates_file(self, tmp_path: Path):
        """Test that export creates a valid JSON file."""
        result = MockPowerFlowResult()
        output_path = tmp_path / "test_result.json"

        returned_path = export_power_flow_result_to_json(result, output_path)

        assert returned_path == output_path
        assert output_path.exists()

    def test_export_contains_report_type(self, tmp_path: Path):
        """Test that exported JSON contains report_type field."""
        result = MockPowerFlowResult()
        output_path = tmp_path / "test_result.json"

        export_power_flow_result_to_json(result, output_path)

        content = json.loads(output_path.read_text(encoding="utf-8"))
        assert content["report_type"] == "power_flow_result"
        assert content["report_version"] == "1.0.0"

    def test_export_contains_result_data(self, tmp_path: Path):
        """Test that exported JSON contains result data."""
        result = MockPowerFlowResult(converged=True, iterations=5)
        output_path = tmp_path / "test_result.json"

        export_power_flow_result_to_json(result, output_path)

        content = json.loads(output_path.read_text(encoding="utf-8"))
        assert "result" in content
        assert content["result"]["converged"] is True
        assert content["result"]["iterations_count"] == 5
        assert len(content["result"]["bus_results"]) == 2
        assert len(content["result"]["branch_results"]) == 1

    def test_export_with_trace(self, tmp_path: Path):
        """Test that export includes trace summary when provided."""
        result = MockPowerFlowResult()
        trace = MockPowerFlowTrace()
        output_path = tmp_path / "test_with_trace.json"

        export_power_flow_result_to_json(result, output_path, trace=trace)

        content = json.loads(output_path.read_text(encoding="utf-8"))
        assert "trace_summary" in content
        assert content["trace_summary"]["solver_version"] == "1.0.0"
        assert content["trace_full_available"] is True

    def test_export_with_metadata(self, tmp_path: Path):
        """Test that export includes metadata when provided."""
        result = MockPowerFlowResult()
        metadata = {
            "project_name": "Test Project",
            "run_id": "12345678-1234-1234-1234-123456789012",
        }
        output_path = tmp_path / "test_with_meta.json"

        export_power_flow_result_to_json(result, output_path, metadata=metadata)

        content = json.loads(output_path.read_text(encoding="utf-8"))
        assert "metadata" in content
        assert content["metadata"]["project_name"] == "Test Project"

    def test_export_determinism(self, tmp_path: Path):
        """Test that same input produces identical output (determinism)."""
        result = MockPowerFlowResult()
        path1 = tmp_path / "result1.json"
        path2 = tmp_path / "result2.json"

        export_power_flow_result_to_json(result, path1)
        export_power_flow_result_to_json(result, path2)

        content1 = path1.read_text(encoding="utf-8")
        content2 = path2.read_text(encoding="utf-8")

        assert content1 == content2, "Export should be deterministic"

    def test_export_creates_parent_directories(self, tmp_path: Path):
        """Test that export creates parent directories if needed."""
        result = MockPowerFlowResult()
        output_path = tmp_path / "nested" / "dir" / "result.json"

        export_power_flow_result_to_json(result, output_path)

        assert output_path.exists()

    def test_export_utf8_encoding(self, tmp_path: Path):
        """Test that export uses UTF-8 encoding."""
        result = MockPowerFlowResult()
        output_path = tmp_path / "test_utf8.json"

        export_power_flow_result_to_json(result, output_path)

        # Read as bytes and verify UTF-8
        raw_bytes = output_path.read_bytes()
        content = raw_bytes.decode("utf-8")
        assert "result_version" in content

    def test_export_invalid_to_dict(self, tmp_path: Path):
        """Test that export raises ValueError for invalid to_dict() return."""
        invalid_result = MagicMock()
        invalid_result.to_dict.return_value = "not a dict"
        output_path = tmp_path / "invalid.json"

        with pytest.raises(ValueError, match="must return a dict"):
            export_power_flow_result_to_json(invalid_result, output_path)


class TestPowerFlowResultsJsonlExport:
    """Tests for export_power_flow_results_to_jsonl."""

    def test_export_creates_file(self, tmp_path: Path):
        """Test that JSONL export creates a valid file."""
        results = [MockPowerFlowResult(), MockPowerFlowResult(converged=False)]
        output_path = tmp_path / "results.jsonl"

        returned_path = export_power_flow_results_to_jsonl(results, output_path)

        assert returned_path == output_path
        assert output_path.exists()

    def test_export_multiple_lines(self, tmp_path: Path):
        """Test that JSONL export creates one line per result."""
        results = [
            MockPowerFlowResult(converged=True),
            MockPowerFlowResult(converged=False),
            MockPowerFlowResult(converged=True),
        ]
        output_path = tmp_path / "results.jsonl"

        export_power_flow_results_to_jsonl(results, output_path)

        lines = output_path.read_text(encoding="utf-8").strip().split("\n")
        assert len(lines) == 3

        # Verify each line is valid JSON
        for idx, line in enumerate(lines):
            data = json.loads(line)
            assert data["index"] == idx
            assert "result" in data


class TestPowerFlowComparisonJsonExport:
    """Tests for export_power_flow_comparison_to_json."""

    def test_export_creates_file(self, tmp_path: Path):
        """Test that comparison export creates a valid JSON file."""
        comparison = {
            "comparison_id": "cmp_001",
            "run_a_id": "run_001",
            "run_b_id": "run_002",
            "summary": {
                "total_buses": 10,
                "total_branches": 9,
                "converged_a": True,
                "converged_b": True,
            },
            "ranking": [],
            "bus_diffs": [],
            "branch_diffs": [],
        }
        output_path = tmp_path / "comparison.json"

        returned_path = export_power_flow_comparison_to_json(comparison, output_path)

        assert returned_path == output_path
        assert output_path.exists()

    def test_export_contains_report_type(self, tmp_path: Path):
        """Test that exported JSON contains correct report_type."""
        comparison = {"comparison_id": "cmp_001"}
        output_path = tmp_path / "comparison.json"

        export_power_flow_comparison_to_json(comparison, output_path)

        content = json.loads(output_path.read_text(encoding="utf-8"))
        assert content["report_type"] == "power_flow_comparison"
        assert content["report_version"] == "1.0.0"

    def test_export_determinism(self, tmp_path: Path):
        """Test that same comparison produces identical output."""
        comparison = {
            "comparison_id": "cmp_001",
            "run_a_id": "run_001",
            "run_b_id": "run_002",
            "ranking": [
                {"issue_code": "VOLTAGE_DELTA_HIGH", "severity": 4},
            ],
        }
        path1 = tmp_path / "cmp1.json"
        path2 = tmp_path / "cmp2.json"

        export_power_flow_comparison_to_json(comparison, path1)
        export_power_flow_comparison_to_json(comparison, path2)

        content1 = path1.read_text(encoding="utf-8")
        content2 = path2.read_text(encoding="utf-8")

        assert content1 == content2, "Comparison export should be deterministic"


# =============================================================================
# NOT-A-SOLVER Compliance Tests
# =============================================================================


class TestNotASolverCompliance:
    """
    P20d NOT-A-SOLVER rule: Export layer must not perform physics calculations.
    These tests verify that the export functions only format data, not compute it.
    """

    def test_export_uses_to_dict_directly(self, tmp_path: Path):
        """Verify export uses to_dict() output directly without modification of physics values."""
        result = MockPowerFlowResult()
        output_path = tmp_path / "compliance_test.json"

        export_power_flow_result_to_json(result, output_path)

        content = json.loads(output_path.read_text(encoding="utf-8"))

        # Verify values match input exactly (no recalculation)
        original = result.to_dict()
        assert content["result"]["converged"] == original["converged"]
        assert content["result"]["iterations_count"] == original["iterations_count"]
        assert (
            content["result"]["summary"]["total_losses_p_mw"]
            == original["summary"]["total_losses_p_mw"]
        )

    def test_export_preserves_bus_results(self, tmp_path: Path):
        """Verify bus results are preserved without recalculation."""
        result = MockPowerFlowResult()
        output_path = tmp_path / "bus_test.json"

        export_power_flow_result_to_json(result, output_path)

        content = json.loads(output_path.read_text(encoding="utf-8"))
        original = result.to_dict()

        # Bus results should be identical
        assert content["result"]["bus_results"] == original["bus_results"]

    def test_export_preserves_branch_results(self, tmp_path: Path):
        """Verify branch results are preserved without recalculation."""
        result = MockPowerFlowResult()
        output_path = tmp_path / "branch_test.json"

        export_power_flow_result_to_json(result, output_path)

        content = json.loads(output_path.read_text(encoding="utf-8"))
        original = result.to_dict()

        # Branch results should be identical
        assert content["result"]["branch_results"] == original["branch_results"]
