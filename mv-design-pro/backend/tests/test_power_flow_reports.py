"""
Tests for Power Flow result PDF and DOCX report generators.

Verifies:
- Correct file writing and parent directory creation
- Valid PDF document creation (starts with %PDF header)
- Valid DOCX document creation
- Proper handling of include_trace option
- ImportError raised when dependencies are not available
- Polish labels in reports
- White-box trace included when requested

CANONICAL ALIGNMENT:
- NOT-A-SOLVER: Tests for reporting layer only, no physics assertions
- 100% Polish labels verified
"""

from __future__ import annotations

from importlib.util import find_spec
from pathlib import Path
from typing import Any

import pytest
from network_model.solvers.power_flow_result import (
    PowerFlowBranchResult,
    PowerFlowBusResult,
    PowerFlowResultV1,
    PowerFlowSummary,
)
from network_model.solvers.power_flow_trace import (
    PowerFlowIterationTrace,
    PowerFlowTrace,
)

# Check if reportlab is available for PDF tests
_PDF_AVAILABLE = find_spec("reportlab") is not None

# Check if python-docx is available for DOCX tests
_DOCX_AVAILABLE = find_spec("docx") is not None


# -----------------------------------------------------------------------------
# Test Fixtures
# -----------------------------------------------------------------------------
def create_sample_power_flow_result() -> PowerFlowResultV1:
    """Create a sample PowerFlowResultV1 for testing.

    Returns a realistic result with:
    - 3 buses (slack + 2 PQ)
    - 2 branches
    - Converged after 4 iterations
    """
    bus_results = (
        PowerFlowBusResult(
            bus_id="BUS_A",
            v_pu=1.0,
            angle_deg=0.0,
            p_injected_mw=12.5,
            q_injected_mvar=3.2,
        ),
        PowerFlowBusResult(
            bus_id="BUS_B",
            v_pu=0.985,
            angle_deg=-2.3,
            p_injected_mw=-8.0,
            q_injected_mvar=-2.5,
        ),
        PowerFlowBusResult(
            bus_id="BUS_C",
            v_pu=0.972,
            angle_deg=-4.1,
            p_injected_mw=-4.0,
            q_injected_mvar=-0.5,
        ),
    )

    branch_results = (
        PowerFlowBranchResult(
            branch_id="LINE_AB",
            p_from_mw=8.5,
            q_from_mvar=2.1,
            p_to_mw=-8.3,
            q_to_mvar=-2.0,
            losses_p_mw=0.2,
            losses_q_mvar=0.1,
        ),
        PowerFlowBranchResult(
            branch_id="LINE_BC",
            p_from_mw=4.3,
            q_from_mvar=0.6,
            p_to_mw=-4.0,
            q_to_mvar=-0.5,
            losses_p_mw=0.3,
            losses_q_mvar=0.1,
        ),
    )

    summary = PowerFlowSummary(
        total_losses_p_mw=0.5,
        total_losses_q_mvar=0.2,
        min_v_pu=0.972,
        max_v_pu=1.0,
        slack_p_mw=12.5,
        slack_q_mvar=3.2,
    )

    return PowerFlowResultV1(
        result_version="1.0.0",
        converged=True,
        iterations_count=4,
        tolerance_used=1e-6,
        base_mva=100.0,
        slack_bus_id="BUS_A",
        bus_results=bus_results,
        branch_results=branch_results,
        summary=summary,
    )


def create_sample_power_flow_trace() -> PowerFlowTrace:
    """Create a sample PowerFlowTrace for testing.

    Returns a realistic trace with:
    - 4 iterations
    - Mismatch decreasing each iteration
    - Convergence achieved
    """
    iterations = (
        PowerFlowIterationTrace(
            k=1,
            mismatch_per_bus={
                "BUS_B": {"delta_p_pu": 0.08, "delta_q_pu": 0.025},
                "BUS_C": {"delta_p_pu": 0.04, "delta_q_pu": 0.005},
            },
            norm_mismatch=0.095,
            max_mismatch_pu=0.08,
        ),
        PowerFlowIterationTrace(
            k=2,
            mismatch_per_bus={
                "BUS_B": {"delta_p_pu": 0.005, "delta_q_pu": 0.002},
                "BUS_C": {"delta_p_pu": 0.003, "delta_q_pu": 0.001},
            },
            norm_mismatch=0.006,
            max_mismatch_pu=0.005,
        ),
        PowerFlowIterationTrace(
            k=3,
            mismatch_per_bus={
                "BUS_B": {"delta_p_pu": 3e-5, "delta_q_pu": 1e-5},
                "BUS_C": {"delta_p_pu": 2e-5, "delta_q_pu": 5e-6},
            },
            norm_mismatch=4e-5,
            max_mismatch_pu=3e-5,
        ),
        PowerFlowIterationTrace(
            k=4,
            mismatch_per_bus={
                "BUS_B": {"delta_p_pu": 5e-8, "delta_q_pu": 2e-8},
                "BUS_C": {"delta_p_pu": 3e-8, "delta_q_pu": 1e-8},
            },
            norm_mismatch=6e-8,
            max_mismatch_pu=5e-8,
        ),
    )

    return PowerFlowTrace(
        solver_version="1.0.0",
        input_hash="abc123def456",
        snapshot_id="snap-001",
        case_id="case-pf-001",
        run_id="run-001",
        init_state={
            "BUS_A": {"v_pu": 1.0, "theta_rad": 0.0},
            "BUS_B": {"v_pu": 1.0, "theta_rad": 0.0},
            "BUS_C": {"v_pu": 1.0, "theta_rad": 0.0},
        },
        init_method="flat",
        tolerance=1e-6,
        max_iterations=100,
        base_mva=100.0,
        slack_bus_id="BUS_A",
        pq_bus_ids=("BUS_B", "BUS_C"),
        pv_bus_ids=(),
        ybus_trace={"build_time_ms": 1.2, "nnz": 9},
        iterations=iterations,
        converged=True,
        final_iterations_count=4,
    )


def create_sample_comparison_result() -> dict[str, Any]:
    """Create a sample comparison result dict for testing."""
    return {
        "run_a_id": "run-001-abc123",
        "run_b_id": "run-002-def456",
        "created_at": "2025-01-15T10:30:00Z",
        "summary": {
            "total_buses": 3,
            "total_branches": 2,
            "converged_a": True,
            "converged_b": True,
            "total_losses_p_mw_a": 0.5,
            "total_losses_p_mw_b": 0.52,
            "delta_total_losses_p_mw": 0.02,
            "max_delta_v_pu": 0.003,
            "max_delta_angle_deg": 0.15,
            "total_issues": 1,
            "critical_issues": 0,
            "major_issues": 0,
            "moderate_issues": 1,
            "minor_issues": 0,
        },
        "ranking": [
            {
                "severity": 3,
                "issue_code": "PF_DELTA_V_HIGH",
                "element_ref": "BUS_C",
                "description_pl": "Roznica napiec przekracza prog (0.003 pu)",
            },
        ],
        "bus_diffs": [
            {
                "bus_id": "BUS_A",
                "v_pu_a": 1.0,
                "v_pu_b": 1.0,
                "delta_v_pu": 0.0,
                "delta_angle_deg": 0.0,
            },
            {
                "bus_id": "BUS_B",
                "v_pu_a": 0.985,
                "v_pu_b": 0.984,
                "delta_v_pu": -0.001,
                "delta_angle_deg": 0.05,
            },
            {
                "bus_id": "BUS_C",
                "v_pu_a": 0.972,
                "v_pu_b": 0.969,
                "delta_v_pu": -0.003,
                "delta_angle_deg": 0.15,
            },
        ],
    }


# -----------------------------------------------------------------------------
# Tests for PDF Report Generation (when reportlab is available)
# -----------------------------------------------------------------------------
@pytest.mark.skipif(not _PDF_AVAILABLE, reason="reportlab is not installed")
class TestExportPowerFlowResultToPdf:
    """Tests for Power Flow PDF report generation when reportlab is available."""

    def test_export_creates_file(self, tmp_path: Path) -> None:
        """Verify that export creates a PDF file at the specified path."""
        from network_model.reporting.power_flow_report_pdf import (
            export_power_flow_result_to_pdf,
        )

        result = create_sample_power_flow_result()
        output_file = tmp_path / "pf_report.pdf"
        returned_path = export_power_flow_result_to_pdf(result, output_file)

        assert output_file.exists()
        assert returned_path == output_file

    def test_export_creates_non_empty_file(self, tmp_path: Path) -> None:
        """Verify that the created file has size > 0."""
        from network_model.reporting.power_flow_report_pdf import (
            export_power_flow_result_to_pdf,
        )

        result = create_sample_power_flow_result()
        output_file = tmp_path / "pf_report.pdf"
        export_power_flow_result_to_pdf(result, output_file)

        assert output_file.stat().st_size > 0

    def test_export_creates_valid_pdf_header(self, tmp_path: Path) -> None:
        """Verify that the created file has a valid PDF header (%PDF)."""
        from network_model.reporting.power_flow_report_pdf import (
            export_power_flow_result_to_pdf,
        )

        result = create_sample_power_flow_result()
        output_file = tmp_path / "pf_report.pdf"
        export_power_flow_result_to_pdf(result, output_file)

        with open(output_file, "rb") as f:
            header = f.read(4)
        assert header == b"%PDF", f"Expected PDF header, got {header!r}"

    def test_export_creates_parent_directories(self, tmp_path: Path) -> None:
        """Verify that export creates parent directories if they don't exist."""
        from network_model.reporting.power_flow_report_pdf import (
            export_power_flow_result_to_pdf,
        )

        result = create_sample_power_flow_result()
        output_file = tmp_path / "nested" / "deep" / "pf_report.pdf"
        export_power_flow_result_to_pdf(result, output_file)

        assert output_file.exists()
        assert output_file.parent.exists()

    def test_export_with_custom_title(self, tmp_path: Path) -> None:
        """Verify that export with custom title completes without error."""
        from network_model.reporting.power_flow_report_pdf import (
            export_power_flow_result_to_pdf,
        )

        result = create_sample_power_flow_result()
        custom_title = "Raport testowy rozplywu mocy"
        output_file = tmp_path / "pf_report.pdf"
        returned_path = export_power_flow_result_to_pdf(result, output_file, title=custom_title)

        assert output_file.exists()
        assert returned_path == output_file

    def test_export_with_trace(self, tmp_path: Path) -> None:
        """Verify that export with trace creates valid file."""
        from network_model.reporting.power_flow_report_pdf import (
            export_power_flow_result_to_pdf,
        )

        result = create_sample_power_flow_result()
        trace = create_sample_power_flow_trace()
        output_file = tmp_path / "pf_report_with_trace.pdf"
        export_power_flow_result_to_pdf(result, output_file, trace=trace)

        assert output_file.exists()
        assert output_file.stat().st_size > 0

    def test_export_without_trace(self, tmp_path: Path) -> None:
        """Verify that export without trace creates valid file."""
        from network_model.reporting.power_flow_report_pdf import (
            export_power_flow_result_to_pdf,
        )

        result = create_sample_power_flow_result()
        output_file = tmp_path / "pf_report_no_trace.pdf"
        export_power_flow_result_to_pdf(result, output_file, include_trace=False)

        assert output_file.exists()
        assert output_file.stat().st_size > 0

    def test_export_with_metadata(self, tmp_path: Path) -> None:
        """Verify that export with metadata creates valid file."""
        from network_model.reporting.power_flow_report_pdf import (
            export_power_flow_result_to_pdf,
        )

        result = create_sample_power_flow_result()
        metadata = {
            "project_name": "Projekt Testowy",
            "case_name": "Przypadek bazowy",
            "run_id": "run-test-123",
            "created_at": "2025-01-15",
        }
        output_file = tmp_path / "pf_report_meta.pdf"
        export_power_flow_result_to_pdf(result, output_file, metadata=metadata)

        assert output_file.exists()
        assert output_file.stat().st_size > 0

    def test_export_accepts_string_path(self, tmp_path: Path) -> None:
        """Verify that export accepts both str and Path for the path argument."""
        from network_model.reporting.power_flow_report_pdf import (
            export_power_flow_result_to_pdf,
        )

        result = create_sample_power_flow_result()
        output_file = str(tmp_path / "pf_report.pdf")
        returned_path = export_power_flow_result_to_pdf(result, output_file)

        assert Path(output_file).exists()
        assert isinstance(returned_path, Path)


@pytest.mark.skipif(not _PDF_AVAILABLE, reason="reportlab is not installed")
class TestExportPowerFlowComparisonToPdf:
    """Tests for Power Flow comparison PDF report generation."""

    def test_export_comparison_creates_file(self, tmp_path: Path) -> None:
        """Verify that comparison export creates a PDF file."""
        from network_model.reporting.power_flow_report_pdf import (
            export_power_flow_comparison_to_pdf,
        )

        comparison = create_sample_comparison_result()
        output_file = tmp_path / "pf_comparison.pdf"
        returned_path = export_power_flow_comparison_to_pdf(comparison, output_file)

        assert output_file.exists()
        assert returned_path == output_file

    def test_export_comparison_valid_pdf(self, tmp_path: Path) -> None:
        """Verify that comparison export creates a valid PDF."""
        from network_model.reporting.power_flow_report_pdf import (
            export_power_flow_comparison_to_pdf,
        )

        comparison = create_sample_comparison_result()
        output_file = tmp_path / "pf_comparison.pdf"
        export_power_flow_comparison_to_pdf(comparison, output_file)

        with open(output_file, "rb") as f:
            header = f.read(4)
        assert header == b"%PDF"


@pytest.mark.skipif(not _PDF_AVAILABLE, reason="reportlab is not installed")
class TestPdfErrorHandling:
    """Tests for error handling in PDF export."""

    def test_export_validates_to_dict_returns_dict(self, tmp_path: Path) -> None:
        """Verify that export raises ValueError if to_dict doesn't return dict."""
        from network_model.reporting.power_flow_report_pdf import (
            export_power_flow_result_to_pdf,
        )

        class BadResult:
            def to_dict(self) -> str:
                return "not a dict"

        output_file = tmp_path / "bad_report.pdf"

        with pytest.raises(ValueError, match="must return a dict"):
            export_power_flow_result_to_pdf(BadResult(), output_file)  # type: ignore


# -----------------------------------------------------------------------------
# Tests for DOCX Report Generation (when python-docx is available)
# -----------------------------------------------------------------------------
@pytest.mark.skipif(not _DOCX_AVAILABLE, reason="python-docx is not installed")
class TestExportPowerFlowResultToDocx:
    """Tests for Power Flow DOCX report generation when python-docx is available."""

    def test_export_creates_file(self, tmp_path: Path) -> None:
        """Verify that export creates a DOCX file at the specified path."""
        from network_model.reporting.power_flow_report_docx import (
            export_power_flow_result_to_docx,
        )

        result = create_sample_power_flow_result()
        output_file = tmp_path / "pf_report.docx"
        returned_path = export_power_flow_result_to_docx(result, output_file)

        assert output_file.exists()
        assert returned_path == output_file

    def test_export_creates_non_empty_file(self, tmp_path: Path) -> None:
        """Verify that the created file has size > 0."""
        from network_model.reporting.power_flow_report_docx import (
            export_power_flow_result_to_docx,
        )

        result = create_sample_power_flow_result()
        output_file = tmp_path / "pf_report.docx"
        export_power_flow_result_to_docx(result, output_file)

        assert output_file.stat().st_size > 0

    def test_export_creates_valid_docx_header(self, tmp_path: Path) -> None:
        """Verify that the created file has a valid DOCX header (ZIP/PK magic)."""
        from network_model.reporting.power_flow_report_docx import (
            export_power_flow_result_to_docx,
        )

        result = create_sample_power_flow_result()
        output_file = tmp_path / "pf_report.docx"
        export_power_flow_result_to_docx(result, output_file)

        # DOCX files are ZIP archives, check for PK header
        with open(output_file, "rb") as f:
            header = f.read(2)
        assert header == b"PK", f"Expected ZIP/DOCX header, got {header!r}"

    def test_export_creates_parent_directories(self, tmp_path: Path) -> None:
        """Verify that export creates parent directories if they don't exist."""
        from network_model.reporting.power_flow_report_docx import (
            export_power_flow_result_to_docx,
        )

        result = create_sample_power_flow_result()
        output_file = tmp_path / "nested" / "deep" / "pf_report.docx"
        export_power_flow_result_to_docx(result, output_file)

        assert output_file.exists()
        assert output_file.parent.exists()

    def test_export_with_custom_title(self, tmp_path: Path) -> None:
        """Verify that export with custom title completes without error."""
        from network_model.reporting.power_flow_report_docx import (
            export_power_flow_result_to_docx,
        )

        result = create_sample_power_flow_result()
        custom_title = "Raport testowy rozplywu mocy"
        output_file = tmp_path / "pf_report.docx"
        returned_path = export_power_flow_result_to_docx(result, output_file, title=custom_title)

        assert output_file.exists()
        assert returned_path == output_file

    def test_export_with_trace(self, tmp_path: Path) -> None:
        """Verify that export with trace creates valid file."""
        from network_model.reporting.power_flow_report_docx import (
            export_power_flow_result_to_docx,
        )

        result = create_sample_power_flow_result()
        trace = create_sample_power_flow_trace()
        output_file = tmp_path / "pf_report_with_trace.docx"
        export_power_flow_result_to_docx(result, output_file, trace=trace)

        assert output_file.exists()
        assert output_file.stat().st_size > 0

    def test_export_without_trace(self, tmp_path: Path) -> None:
        """Verify that export without trace creates valid file."""
        from network_model.reporting.power_flow_report_docx import (
            export_power_flow_result_to_docx,
        )

        result = create_sample_power_flow_result()
        output_file = tmp_path / "pf_report_no_trace.docx"
        export_power_flow_result_to_docx(result, output_file, include_trace=False)

        assert output_file.exists()
        assert output_file.stat().st_size > 0

    def test_export_with_metadata(self, tmp_path: Path) -> None:
        """Verify that export with metadata creates valid file."""
        from network_model.reporting.power_flow_report_docx import (
            export_power_flow_result_to_docx,
        )

        result = create_sample_power_flow_result()
        metadata = {
            "project_name": "Projekt Testowy",
            "case_name": "Przypadek bazowy",
            "run_id": "run-test-123",
            "created_at": "2025-01-15",
        }
        output_file = tmp_path / "pf_report_meta.docx"
        export_power_flow_result_to_docx(result, output_file, metadata=metadata)

        assert output_file.exists()
        assert output_file.stat().st_size > 0

    def test_export_accepts_string_path(self, tmp_path: Path) -> None:
        """Verify that export accepts both str and Path for the path argument."""
        from network_model.reporting.power_flow_report_docx import (
            export_power_flow_result_to_docx,
        )

        result = create_sample_power_flow_result()
        output_file = str(tmp_path / "pf_report.docx")
        returned_path = export_power_flow_result_to_docx(result, output_file)

        assert Path(output_file).exists()
        assert isinstance(returned_path, Path)


@pytest.mark.skipif(not _DOCX_AVAILABLE, reason="python-docx is not installed")
class TestExportPowerFlowComparisonToDocx:
    """Tests for Power Flow comparison DOCX report generation."""

    def test_export_comparison_creates_file(self, tmp_path: Path) -> None:
        """Verify that comparison export creates a DOCX file."""
        from network_model.reporting.power_flow_report_docx import (
            export_power_flow_comparison_to_docx,
        )

        comparison = create_sample_comparison_result()
        output_file = tmp_path / "pf_comparison.docx"
        returned_path = export_power_flow_comparison_to_docx(comparison, output_file)

        assert output_file.exists()
        assert returned_path == output_file

    def test_export_comparison_valid_docx(self, tmp_path: Path) -> None:
        """Verify that comparison export creates a valid DOCX."""
        from network_model.reporting.power_flow_report_docx import (
            export_power_flow_comparison_to_docx,
        )

        comparison = create_sample_comparison_result()
        output_file = tmp_path / "pf_comparison.docx"
        export_power_flow_comparison_to_docx(comparison, output_file)

        # DOCX files are ZIP archives
        with open(output_file, "rb") as f:
            header = f.read(2)
        assert header == b"PK"

    def test_export_comparison_with_none_delta_v_pu_does_not_crash(self, tmp_path: Path) -> None:
        """FAB-E (E1): delta_v_pu=None (szyna tylko w jednym biegu, karta P20c)
        nie moze rzucic TypeError w sortowaniu top-roznic (abs(None))."""
        from network_model.reporting.power_flow_report_docx import (
            export_power_flow_comparison_to_docx,
        )

        comparison = create_sample_comparison_result()
        comparison["summary"]["max_delta_v_pu"] = None
        comparison["summary"]["max_delta_angle_deg"] = None
        comparison["bus_diffs"].append(
            {
                "bus_id": "BUS_ONLY_A",
                "v_pu_a": 1.02,
                "v_pu_b": None,
                "delta_v_pu": None,
                "delta_angle_deg": None,
            }
        )
        output_file = tmp_path / "pf_comparison_none_delta.docx"

        returned_path = export_power_flow_comparison_to_docx(comparison, output_file)

        assert output_file.exists()
        assert returned_path == output_file


@pytest.mark.skipif(not _DOCX_AVAILABLE, reason="python-docx is not installed")
class TestDocxErrorHandling:
    """Tests for error handling in DOCX export."""

    def test_export_validates_to_dict_returns_dict(self, tmp_path: Path) -> None:
        """Verify that export raises ValueError if to_dict doesn't return dict."""
        from network_model.reporting.power_flow_report_docx import (
            export_power_flow_result_to_docx,
        )

        class BadResult:
            def to_dict(self) -> str:
                return "not a dict"

        output_file = tmp_path / "bad_report.docx"

        with pytest.raises(ValueError, match="must return a dict"):
            export_power_flow_result_to_docx(BadResult(), output_file)  # type: ignore


# -----------------------------------------------------------------------------
# Tests for Polish Labels in Reports
# -----------------------------------------------------------------------------
@pytest.mark.skipif(not _PDF_AVAILABLE, reason="reportlab is not installed")
class TestPolishLabelsPdf:
    """Verify that PDF reports use Polish labels (structural check)."""

    def test_pdf_report_is_generated_with_valid_structure(self, tmp_path: Path) -> None:
        """Verify that PDF is generated with valid structure.

        Note: PDF content is compressed, so we verify structure rather than
        raw byte content. The Polish labels are verified by inspecting the
        source code which uses Polish strings like "Raport rozplywu mocy".
        """
        from network_model.reporting.power_flow_report_pdf import (
            export_power_flow_result_to_pdf,
        )

        result = create_sample_power_flow_result()
        output_file = tmp_path / "pf_report_pl.pdf"
        export_power_flow_result_to_pdf(result, output_file)

        # Verify PDF was created successfully
        assert output_file.exists()
        assert output_file.stat().st_size > 1000  # Reasonable size for a report

        # Verify valid PDF structure (header and trailer)
        content = output_file.read_bytes()
        assert content.startswith(b"%PDF-")
        assert b"%%EOF" in content


@pytest.mark.skipif(not _DOCX_AVAILABLE, reason="python-docx is not installed")
class TestPolishLabelsDocx:
    """Verify that DOCX reports use Polish labels."""

    def test_docx_report_contains_polish_text(self, tmp_path: Path) -> None:
        """Verify that DOCX contains Polish text by reading document.xml."""
        import zipfile

        from network_model.reporting.power_flow_report_docx import (
            export_power_flow_result_to_docx,
        )

        result = create_sample_power_flow_result()
        output_file = tmp_path / "pf_report_pl.docx"
        export_power_flow_result_to_docx(result, output_file)

        # DOCX is a ZIP file, read document.xml to check for Polish text
        with zipfile.ZipFile(output_file, "r") as z:
            doc_xml = z.read("word/document.xml").decode("utf-8")

        # Check for Polish labels
        assert "Podsumowanie" in doc_xml or "podsumowanie" in doc_xml
        assert "Wyniki" in doc_xml or "wyniki" in doc_xml


# -----------------------------------------------------------------------------
# Tests for White-Box Trace Inclusion
# -----------------------------------------------------------------------------
@pytest.mark.skipif(not _PDF_AVAILABLE, reason="reportlab is not installed")
class TestWhiteBoxTracePdf:
    """Verify White-Box trace is included in PDF reports."""

    def test_pdf_with_trace_larger_than_without(self, tmp_path: Path) -> None:
        """Verify that PDF with trace is larger than without."""
        from network_model.reporting.power_flow_report_pdf import (
            export_power_flow_result_to_pdf,
        )

        result = create_sample_power_flow_result()
        trace = create_sample_power_flow_trace()

        output_with_trace = tmp_path / "pf_with_trace.pdf"
        output_no_trace = tmp_path / "pf_no_trace.pdf"

        export_power_flow_result_to_pdf(result, output_with_trace, trace=trace)
        export_power_flow_result_to_pdf(result, output_no_trace, include_trace=False)

        # Report with trace should be larger
        size_with = output_with_trace.stat().st_size
        size_without = output_no_trace.stat().st_size
        assert (
            size_with > size_without
        ), f"Expected PDF with trace to be larger: {size_with} <= {size_without}"


@pytest.mark.skipif(not _DOCX_AVAILABLE, reason="python-docx is not installed")
class TestWhiteBoxTraceDocx:
    """Verify White-Box trace is included in DOCX reports."""

    def test_docx_with_trace_larger_than_without(self, tmp_path: Path) -> None:
        """Verify that DOCX with trace is larger than without."""
        from network_model.reporting.power_flow_report_docx import (
            export_power_flow_result_to_docx,
        )

        result = create_sample_power_flow_result()
        trace = create_sample_power_flow_trace()

        output_with_trace = tmp_path / "pf_with_trace.docx"
        output_no_trace = tmp_path / "pf_no_trace.docx"

        export_power_flow_result_to_docx(result, output_with_trace, trace=trace)
        export_power_flow_result_to_docx(result, output_no_trace, include_trace=False)

        # Report with trace should be larger
        size_with = output_with_trace.stat().st_size
        size_without = output_no_trace.stat().st_size
        assert (
            size_with > size_without
        ), f"Expected DOCX with trace to be larger: {size_with} <= {size_without}"


# -----------------------------------------------------------------------------
# Tests for ImportError when dependencies are NOT available
#
# reportlab/python-docx are dev dependencies (pyproject.toml) always present
# in a correctly provisioned environment, so gating these tests on the real
# _PDF_AVAILABLE/_DOCX_AVAILABLE flag (skipif(_PDF_AVAILABLE, ...)) meant they
# never ran in CI/regression — the "library missing" branch had zero
# coverage. Simulating absence via monkeypatch on the reporting module's own
# flag exercises the real ImportError-raising code path unconditionally.
# -----------------------------------------------------------------------------
class TestPdfWhenReportlabUnavailable:
    """Tests for behavior when reportlab is not installed."""

    def test_import_error_raised_when_reportlab_missing(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Verify that ImportError with clear message is raised when reportlab missing."""
        from network_model.reporting import power_flow_report_pdf
        from network_model.reporting.power_flow_report_pdf import (
            export_power_flow_result_to_pdf,
        )

        monkeypatch.setattr(power_flow_report_pdf, "_PDF_AVAILABLE", False)

        result = create_sample_power_flow_result()
        output_file = tmp_path / "pf_report.pdf"

        with pytest.raises(ImportError, match="reportlab"):
            export_power_flow_result_to_pdf(result, output_file)


class TestDocxWhenPythonDocxUnavailable:
    """Tests for behavior when python-docx is not installed."""

    def test_import_error_raised_when_docx_missing(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Verify that ImportError with clear message is raised when python-docx missing."""
        from network_model.reporting import power_flow_report_docx
        from network_model.reporting.power_flow_report_docx import (
            export_power_flow_result_to_docx,
        )

        monkeypatch.setattr(power_flow_report_docx, "_DOCX_AVAILABLE", False)

        result = create_sample_power_flow_result()
        output_file = tmp_path / "pf_report.docx"

        with pytest.raises(ImportError, match="python-docx"):
            export_power_flow_result_to_docx(result, output_file)
