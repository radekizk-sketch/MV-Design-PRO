"""
Tests for short-circuit result PDF report generator.

Verifies:
- Correct file writing and parent directory creation
- Valid PDF document creation (starts with %PDF header)
- Proper handling of include_white_box=False
- ImportError raised when reportlab is not available
- No numerical value assertions (only structure/presence checks)
"""

from __future__ import annotations

from importlib.util import find_spec
from pathlib import Path

import pytest
from network_model.core.branch import BranchType, LineBranch, TransformerBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from network_model.solvers.short_circuit_iec60909 import (
    ShortCircuitIEC60909Solver,
)

# Check if reportlab is available for tests
_PDF_AVAILABLE = find_spec("reportlab") is not None


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
# Tests for export_short_circuit_result_to_pdf (when reportlab is available)
# -----------------------------------------------------------------------------
@pytest.mark.skipif(not _PDF_AVAILABLE, reason="reportlab is not installed")
class TestExportShortCircuitResultToPdf:
    """Tests for PDF report generation when reportlab is available."""

    def test_export_creates_file(self, tmp_path: Path) -> None:
        """Verify that export creates a PDF file at the specified path."""
        from network_model.reporting.short_circuit_report_pdf import (
            export_short_circuit_result_to_pdf,
        )

        graph = build_transformer_only_graph()
        result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id="B",
            c_factor=1.0,
            tk_s=1.0,
        )

        output_file = tmp_path / "report.pdf"
        returned_path = export_short_circuit_result_to_pdf(result, output_file)

        assert output_file.exists()
        assert returned_path == output_file

    def test_export_creates_non_empty_file(self, tmp_path: Path) -> None:
        """Verify that the created file has size > 0."""
        from network_model.reporting.short_circuit_report_pdf import (
            export_short_circuit_result_to_pdf,
        )

        graph = build_transformer_only_graph()
        result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id="B",
            c_factor=1.0,
            tk_s=1.0,
        )

        output_file = tmp_path / "report.pdf"
        export_short_circuit_result_to_pdf(result, output_file)

        assert output_file.stat().st_size > 0

    def test_export_creates_valid_pdf_header(self, tmp_path: Path) -> None:
        """Verify that the created file has a valid PDF header (%PDF)."""
        from network_model.reporting.short_circuit_report_pdf import (
            export_short_circuit_result_to_pdf,
        )

        graph = build_transformer_only_graph()
        result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id="B",
            c_factor=1.0,
            tk_s=1.0,
        )

        output_file = tmp_path / "report.pdf"
        export_short_circuit_result_to_pdf(result, output_file)

        # Read first bytes to verify PDF header
        with open(output_file, "rb") as f:
            header = f.read(4)
        assert header == b"%PDF", f"Expected PDF header, got {header!r}"

    def test_export_creates_parent_directories(self, tmp_path: Path) -> None:
        """Verify that export creates parent directories if they don't exist."""
        from network_model.reporting.short_circuit_report_pdf import (
            export_short_circuit_result_to_pdf,
        )

        graph = build_transformer_only_graph()
        result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id="B",
            c_factor=1.0,
            tk_s=1.0,
        )

        output_file = tmp_path / "nested" / "deep" / "report.pdf"
        export_short_circuit_result_to_pdf(result, output_file)

        assert output_file.exists()
        assert output_file.parent.exists()

    def test_export_with_custom_title(self, tmp_path: Path) -> None:
        """Verify that export with custom title completes without error."""
        from network_model.reporting.short_circuit_report_pdf import (
            export_short_circuit_result_to_pdf,
        )

        graph = build_transformer_only_graph()
        result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id="B",
            c_factor=1.0,
            tk_s=1.0,
        )

        custom_title = "Custom Short-Circuit Report"
        output_file = tmp_path / "report.pdf"
        returned_path = export_short_circuit_result_to_pdf(result, output_file, title=custom_title)

        assert output_file.exists()
        assert returned_path == output_file
        # Verify PDF header is valid
        with open(output_file, "rb") as f:
            header = f.read(4)
        assert header == b"%PDF"

    def test_export_accepts_string_path(self, tmp_path: Path) -> None:
        """Verify that export accepts both str and Path for the path argument."""
        from network_model.reporting.short_circuit_report_pdf import (
            export_short_circuit_result_to_pdf,
        )

        graph = build_transformer_only_graph()
        result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id="B",
            c_factor=1.0,
            tk_s=1.0,
        )

        output_file = str(tmp_path / "report.pdf")
        returned_path = export_short_circuit_result_to_pdf(result, output_file)

        assert Path(output_file).exists()
        assert isinstance(returned_path, Path)


@pytest.mark.skipif(not _PDF_AVAILABLE, reason="reportlab is not installed")
class TestExportPdfWithoutWhiteBox:
    """Tests for PDF export with include_white_box=False."""

    def test_export_without_white_box_creates_file(self, tmp_path: Path) -> None:
        """Verify that export without white box creates a valid file."""
        from network_model.reporting.short_circuit_report_pdf import (
            export_short_circuit_result_to_pdf,
        )

        graph = build_transformer_only_graph()
        result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id="B",
            c_factor=1.0,
            tk_s=1.0,
        )

        output_file = tmp_path / "report.pdf"
        export_short_circuit_result_to_pdf(result, output_file, include_white_box=False)

        assert output_file.exists()
        assert output_file.stat().st_size > 0

    def test_export_without_white_box_has_valid_pdf_header(self, tmp_path: Path) -> None:
        """Verify that PDF without white box has valid header."""
        from network_model.reporting.short_circuit_report_pdf import (
            export_short_circuit_result_to_pdf,
        )

        graph = build_transformer_only_graph()
        result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id="B",
            c_factor=1.0,
            tk_s=1.0,
        )

        output_file = tmp_path / "report.pdf"
        export_short_circuit_result_to_pdf(result, output_file, include_white_box=False)

        with open(output_file, "rb") as f:
            header = f.read(4)
        assert header == b"%PDF"


@pytest.mark.skipif(not _PDF_AVAILABLE, reason="reportlab is not installed")
class TestExportPdfErrorHandling:
    """Tests for error handling in PDF export when reportlab is available."""

    def test_export_validates_to_dict_returns_dict(self, tmp_path: Path) -> None:
        """Verify that export raises ValueError if to_dict doesn't return dict."""
        from network_model.reporting.short_circuit_report_pdf import (
            export_short_circuit_result_to_pdf,
        )

        class BadResult:
            def to_dict(self) -> str:
                return "not a dict"

        output_file = tmp_path / "report.pdf"

        with pytest.raises(ValueError, match="must return a dict"):
            export_short_circuit_result_to_pdf(BadResult(), output_file)  # type: ignore


# -----------------------------------------------------------------------------
# Tests for ImportError when reportlab is NOT available
# -----------------------------------------------------------------------------
@pytest.mark.skipif(_PDF_AVAILABLE, reason="reportlab IS installed, skip unavailable test")
class TestExportPdfWhenReportlabUnavailable:
    """Tests for behavior when reportlab is not installed."""

    def test_import_error_raised_when_reportlab_missing(self, tmp_path: Path) -> None:
        """Verify that ImportError with clear message is raised when reportlab missing."""
        # This test only runs when reportlab is NOT available
        # We need to import the module and test directly
        from network_model.reporting.short_circuit_report_pdf import (
            export_short_circuit_result_to_pdf,
        )

        class DummyResult:
            def to_dict(self) -> dict:
                return {"short_circuit_type": "3ph"}

        output_file = tmp_path / "report.pdf"

        with pytest.raises(ImportError, match="reportlab"):
            export_short_circuit_result_to_pdf(DummyResult(), output_file)  # type: ignore
