"""Tests for ValidationReport JSON + PDF export."""

from __future__ import annotations

import json
from pathlib import Path

from application.reference_networks.comparator import (
    ElementComparison,
    build_validation_report,
)
from application.reference_networks.report_export import to_json, to_pdf, to_pdf_bytes


def _sample_report():
    pf = (
        ElementComparison("BUS-1", "v_pu", 1.0, 1.0, 1e-3, 0.0, 0.0, "PASS"),
        ElementComparison("BUS-2", "v_pu", 0.985, 0.982, 5e-3, 0.003, 0.003, "PASS"),
    )
    return build_validation_report(
        network_id="ieee-4bus",
        network_name_pl="IEEE 4-bus",
        source="Stevenson 1982 Example 9.5",
        solver_version="nr-v1",
        pf_comparisons=pf,
        pf_branch_comparisons=(),
        sc_comparisons=(),
    )


class TestJsonExport:
    def test_json_string_is_valid(self) -> None:
        report = _sample_report()
        json_str = to_json(report)
        parsed = json.loads(json_str)
        assert parsed["network_id"] == "ieee-4bus"
        assert parsed["overall_status"] == "PASS"

    def test_json_file_written(self, tmp_path: Path) -> None:
        report = _sample_report()
        target = tmp_path / "report.json"
        to_json(report, target)
        assert target.exists()
        content = json.loads(target.read_text(encoding="utf-8"))
        assert content["network_id"] == "ieee-4bus"


class TestPdfExport:
    def test_pdf_bytes_have_pdf_header(self) -> None:
        report = _sample_report()
        pdf_bytes = to_pdf_bytes(report)
        assert pdf_bytes.startswith(b"%PDF-")

    def test_pdf_file_written(self, tmp_path: Path) -> None:
        report = _sample_report()
        target = tmp_path / "report.pdf"
        to_pdf(report, target)
        assert target.exists()
        assert target.stat().st_size > 1000  # non-trivial size

    def test_pdf_size_reasonable(self) -> None:
        """Generated PDF should be ≥1 KB and ≤500 KB for simple report."""
        report = _sample_report()
        pdf_bytes = to_pdf_bytes(report)
        assert 1000 <= len(pdf_bytes) <= 500_000
