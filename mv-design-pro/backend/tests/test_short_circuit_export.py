"""
Tests for short-circuit result JSON export functionality.

Verifies:
- Correct file writing and parent directory creation
- Valid JSON encoding and structure
- Contract compliance (EXPECTED_SHORT_CIRCUIT_RESULT_KEYS)
- Proper handling of complex types (zkk_ohm as dict with re/im)
- JSON Lines export for multiple results
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from network_model.core.branch import BranchType, LineBranch, TransformerBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from network_model.reporting.short_circuit_export import (
    export_short_circuit_result_to_json,
    export_short_circuit_results_to_jsonl,
)
from network_model.solvers.short_circuit_iec60909 import (
    EXPECTED_SHORT_CIRCUIT_RESULT_KEYS,
    ShortCircuitIEC60909Solver,
)


# -----------------------------------------------------------------------------
# Test Helpers (reused from existing tests)
# -----------------------------------------------------------------------------
def create_pq_node(node_id: str, voltage_level: float) -> Node:
    """Create a PQ node with the given voltage level."""
    return Node(
        id=node_id,
        name=f"Node {node_id}",
        node_type=NodeType.PQ,
        voltage_level=voltage_level,
        active_power=5.0,
        reactive_power=2.0,
    )


def create_reference_node(node_id: str, voltage_level: float) -> Node:
    """Create a reference (ground) node."""
    return Node(
        id=node_id,
        name=f"Reference {node_id}",
        node_type=NodeType.PQ,
        voltage_level=voltage_level,
        active_power=0.0,
        reactive_power=0.0,
    )


def create_transformer_branch(
    branch_id: str,
    from_node_id: str,
    to_node_id: str,
    rated_power_mva: float,
    voltage_hv_kv: float,
    voltage_lv_kv: float,
    uk_percent: float,
    pk_kw: float,
) -> TransformerBranch:
    """Create a transformer branch with specified parameters."""
    return TransformerBranch(
        id=branch_id,
        name=f"Transformer {branch_id}",
        branch_type=BranchType.TRANSFORMER,
        from_node_id=from_node_id,
        to_node_id=to_node_id,
        in_service=True,
        rated_power_mva=rated_power_mva,
        voltage_hv_kv=voltage_hv_kv,
        voltage_lv_kv=voltage_lv_kv,
        uk_percent=uk_percent,
        pk_kw=pk_kw,
        i0_percent=0.0,
        p0_kw=0.0,
        vector_group="Dyn11",
        tap_position=0,
        tap_step_percent=2.5,
    )


def create_reference_branch(
    branch_id: str,
    from_node_id: str,
    to_node_id: str,
    r_ohm: float,
) -> LineBranch:
    """Create a reference (very high impedance) line branch."""
    return LineBranch(
        id=branch_id,
        name=f"Reference {branch_id}",
        branch_type=BranchType.LINE,
        from_node_id=from_node_id,
        to_node_id=to_node_id,
        r_ohm_per_km=r_ohm,
        x_ohm_per_km=0.0,
        b_us_per_km=0.0,
        length_km=1.0,
        rated_current_a=0.0,
    )


def build_transformer_only_graph() -> NetworkGraph:
    """Build a minimal test graph with a single transformer."""
    graph = NetworkGraph()
    graph.add_node(create_pq_node("A", 110.0))
    graph.add_node(create_pq_node("B", 20.0))
    graph.add_node(create_reference_node("GND", 20.0))

    transformer = create_transformer_branch(
        "T1",
        "A",
        "B",
        rated_power_mva=25.0,
        voltage_hv_kv=110.0,
        voltage_lv_kv=20.0,
        uk_percent=10.0,
        pk_kw=120.0,
    )
    graph.add_branch(transformer)
    graph.add_branch(create_reference_branch("REF", "B", "GND", r_ohm=1e9))
    return graph


# -----------------------------------------------------------------------------
# Tests for export_short_circuit_result_to_json
# -----------------------------------------------------------------------------
class TestExportShortCircuitResultToJson:
    """Tests for single result JSON export."""

    def test_export_creates_file(self, tmp_path: Path) -> None:
        """Verify that export creates a JSON file at the specified path."""
        graph = build_transformer_only_graph()
        result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id="B",
            c_factor=1.0,
            tk_s=1.0,
        )

        output_file = tmp_path / "result.json"
        returned_path = export_short_circuit_result_to_json(result, output_file)

        assert output_file.exists()
        assert returned_path == output_file

    def test_export_creates_parent_directories(self, tmp_path: Path) -> None:
        """Verify that export creates parent directories if they don't exist."""
        graph = build_transformer_only_graph()
        result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id="B",
            c_factor=1.0,
            tk_s=1.0,
        )

        output_file = tmp_path / "nested" / "deep" / "result.json"
        export_short_circuit_result_to_json(result, output_file)

        assert output_file.exists()
        assert output_file.parent.exists()

    def test_export_produces_valid_json(self, tmp_path: Path) -> None:
        """Verify that the exported file contains valid, loadable JSON."""
        graph = build_transformer_only_graph()
        result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id="B",
            c_factor=1.0,
            tk_s=1.0,
        )

        output_file = tmp_path / "result.json"
        export_short_circuit_result_to_json(result, output_file)

        # Load and verify it's valid JSON
        with open(output_file, encoding="utf-8") as f:
            data = json.load(f)

        assert isinstance(data, dict)

    def test_export_contains_all_contract_keys(self, tmp_path: Path) -> None:
        """Verify that exported JSON contains all keys from the API contract."""
        graph = build_transformer_only_graph()
        result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id="B",
            c_factor=1.0,
            tk_s=1.0,
        )

        output_file = tmp_path / "result.json"
        export_short_circuit_result_to_json(result, output_file)

        with open(output_file, encoding="utf-8") as f:
            data = json.load(f)

        expected_keys = set(EXPECTED_SHORT_CIRCUIT_RESULT_KEYS)
        actual_keys = set(data.keys())

        missing_keys = expected_keys - actual_keys
        assert not missing_keys, f"Missing contract keys: {missing_keys}"

    def test_export_zkk_ohm_is_dict_with_re_im(self, tmp_path: Path) -> None:
        """Verify that zkk_ohm (complex) is serialized as dict with re/im keys."""
        graph = build_transformer_only_graph()
        result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id="B",
            c_factor=1.0,
            tk_s=1.0,
        )

        output_file = tmp_path / "result.json"
        export_short_circuit_result_to_json(result, output_file)

        with open(output_file, encoding="utf-8") as f:
            data = json.load(f)

        zkk_ohm = data["zkk_ohm"]

        # zkk_ohm should be a dict (not raw complex or string)
        assert isinstance(zkk_ohm, dict), f"zkk_ohm should be dict, got {type(zkk_ohm).__name__}"
        assert "re" in zkk_ohm, "zkk_ohm should have 're' key"
        assert "im" in zkk_ohm, "zkk_ohm should have 'im' key"
        assert isinstance(zkk_ohm["re"], float), "zkk_ohm['re'] should be float"
        assert isinstance(zkk_ohm["im"], float), "zkk_ohm['im'] should be float"

    def test_export_white_box_trace_is_list(self, tmp_path: Path) -> None:
        """Verify that white_box_trace is exported as a list."""
        graph = build_transformer_only_graph()
        result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id="B",
            c_factor=1.0,
            tk_s=1.0,
        )

        output_file = tmp_path / "result.json"
        export_short_circuit_result_to_json(result, output_file)

        with open(output_file, encoding="utf-8") as f:
            data = json.load(f)

        assert isinstance(data["white_box_trace"], list)
        assert len(data["white_box_trace"]) >= 1

    def test_export_with_custom_indent(self, tmp_path: Path) -> None:
        """Verify that custom indent parameter is respected."""
        graph = build_transformer_only_graph()
        result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id="B",
            c_factor=1.0,
            tk_s=1.0,
        )

        output_file = tmp_path / "result.json"
        export_short_circuit_result_to_json(result, output_file, indent=4)

        content = output_file.read_text(encoding="utf-8")
        # With indent=4, we should see 4-space indentation
        assert "    " in content

    def test_export_accepts_string_path(self, tmp_path: Path) -> None:
        """Verify that export accepts both str and Path for the path argument."""
        graph = build_transformer_only_graph()
        result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id="B",
            c_factor=1.0,
            tk_s=1.0,
        )

        output_file = str(tmp_path / "result.json")
        returned_path = export_short_circuit_result_to_json(result, output_file)

        assert Path(output_file).exists()
        assert isinstance(returned_path, Path)


# -----------------------------------------------------------------------------
# Tests for export_short_circuit_results_to_jsonl
# -----------------------------------------------------------------------------
class TestExportShortCircuitResultsToJsonl:
    """Tests for JSON Lines export of multiple results."""

    def test_export_creates_jsonl_file(self, tmp_path: Path) -> None:
        """Verify that export creates a JSONL file with multiple records."""
        graph = build_transformer_only_graph()

        result_3f = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id="B",
            c_factor=1.0,
            tk_s=1.0,
        )
        result_2f = ShortCircuitIEC60909Solver.compute_2ph_short_circuit(
            graph=graph,
            fault_node_id="B",
            c_factor=1.0,
            tk_s=1.0,
        )

        output_file = tmp_path / "results.jsonl"
        returned_path = export_short_circuit_results_to_jsonl([result_3f, result_2f], output_file)

        assert output_file.exists()
        assert returned_path == output_file

    def test_export_jsonl_each_line_is_valid_json(self, tmp_path: Path) -> None:
        """Verify that each line in JSONL file is valid JSON."""
        graph = build_transformer_only_graph()

        result_3f = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id="B",
            c_factor=1.0,
            tk_s=1.0,
        )
        result_2f = ShortCircuitIEC60909Solver.compute_2ph_short_circuit(
            graph=graph,
            fault_node_id="B",
            c_factor=1.0,
            tk_s=1.0,
        )

        output_file = tmp_path / "results.jsonl"
        export_short_circuit_results_to_jsonl([result_3f, result_2f], output_file)

        with open(output_file, encoding="utf-8") as f:
            lines = [line.strip() for line in f if line.strip()]

        assert len(lines) == 2

        for line in lines:
            data = json.loads(line)
            assert isinstance(data, dict)

    def test_export_jsonl_each_record_has_contract_keys(self, tmp_path: Path) -> None:
        """Verify that each record in JSONL file has all contract keys."""
        graph = build_transformer_only_graph()

        result_3f = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id="B",
            c_factor=1.0,
            tk_s=1.0,
        )
        result_2f = ShortCircuitIEC60909Solver.compute_2ph_short_circuit(
            graph=graph,
            fault_node_id="B",
            c_factor=1.0,
            tk_s=1.0,
        )

        output_file = tmp_path / "results.jsonl"
        export_short_circuit_results_to_jsonl([result_3f, result_2f], output_file)

        expected_keys = set(EXPECTED_SHORT_CIRCUIT_RESULT_KEYS)

        with open(output_file, encoding="utf-8") as f:
            lines = [line.strip() for line in f if line.strip()]

        for i, line in enumerate(lines):
            data = json.loads(line)
            actual_keys = set(data.keys())
            missing_keys = expected_keys - actual_keys
            assert not missing_keys, f"Record {i} missing keys: {missing_keys}"

    def test_export_jsonl_preserves_fault_types(self, tmp_path: Path) -> None:
        """Verify that different fault types are correctly preserved in JSONL."""
        graph = build_transformer_only_graph()

        result_3f = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id="B",
            c_factor=1.0,
            tk_s=1.0,
        )
        result_2f = ShortCircuitIEC60909Solver.compute_2ph_short_circuit(
            graph=graph,
            fault_node_id="B",
            c_factor=1.0,
            tk_s=1.0,
        )

        output_file = tmp_path / "results.jsonl"
        export_short_circuit_results_to_jsonl([result_3f, result_2f], output_file)

        with open(output_file, encoding="utf-8") as f:
            lines = [line.strip() for line in f if line.strip()]

        data_3f = json.loads(lines[0])
        data_2f = json.loads(lines[1])

        assert data_3f["short_circuit_type"] == "3F"
        assert data_2f["short_circuit_type"] == "2F"

    def test_export_jsonl_creates_parent_directories(self, tmp_path: Path) -> None:
        """Verify that JSONL export creates parent directories."""
        graph = build_transformer_only_graph()

        result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id="B",
            c_factor=1.0,
            tk_s=1.0,
        )

        output_file = tmp_path / "nested" / "results.jsonl"
        export_short_circuit_results_to_jsonl([result], output_file)

        assert output_file.exists()

    def test_export_jsonl_empty_list(self, tmp_path: Path) -> None:
        """Verify that exporting an empty list creates an empty file."""
        output_file = tmp_path / "empty.jsonl"
        export_short_circuit_results_to_jsonl([], output_file)

        assert output_file.exists()
        content = output_file.read_text(encoding="utf-8")
        # Empty list should produce just a newline
        assert content == "\n"


# -----------------------------------------------------------------------------
# Tests for error handling
# -----------------------------------------------------------------------------
class TestExportErrorHandling:
    """Tests for error handling in export functions."""

    def test_export_validates_to_dict_returns_dict(self, tmp_path: Path) -> None:
        """Verify that export raises ValueError if to_dict doesn't return dict."""

        class BadResult:
            def to_dict(self):
                return "not a dict"

        output_file = tmp_path / "result.json"

        with pytest.raises(ValueError, match="must return a dict"):
            export_short_circuit_result_to_json(BadResult(), output_file)  # type: ignore

    def test_export_jsonl_reports_record_index_on_error(self, tmp_path: Path) -> None:
        """Verify that JSONL export includes record index in error messages."""
        graph = build_transformer_only_graph()

        result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id="B",
            c_factor=1.0,
            tk_s=1.0,
        )

        class BadResult:
            def to_dict(self):
                return "not a dict"

        output_file = tmp_path / "results.jsonl"

        with pytest.raises(ValueError, match="Record 1"):
            export_short_circuit_results_to_jsonl(
                [result, BadResult()],
                output_file,  # type: ignore
            )
