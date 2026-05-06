"""
Testy modulu raportu audytu 2 (Phase 5).
"""

from __future__ import annotations

from analysis.reporting.audit2_report import (
    Audit2ReportContext,
    render_audit2_report_all_formats,
    render_audit2_report_json,
    render_audit2_report_latex,
    render_audit2_report_text,
)


def _make_ctx(proofs: list[dict]) -> Audit2ReportContext:
    return Audit2ReportContext(
        project_name="Projekt Test",
        station_id="station_001",
        proof_pack_dict={
            "station_id": "station_001",
            "all_pass": all(p["pass_status"] for p in proofs),
            "fail_count": sum(1 for p in proofs if not p["pass_status"]),
            "proof_count": len(proofs),
            "proofs": proofs,
            "generated_at": "2026-04-01T00:00:00Z",
        },
        operator_pl="PSE",
        generated_at_iso="2026-04-01T00:00:00Z",
    )


def test_json_report_groups_proofs_by_type():
    proofs = [
        {
            "proof_id": "00000000-0000-0000-0000-000000000001",
            "proof_type": "AUDIT2_HOSTING_CAPACITY_EXPORT",
            "pass_status": True,
            "summary_pl": "Eksport normalny",
            "details": {},
            "formulas_latex": [],
            "generated_at": "2026-04-01T00:00:00Z",
        },
        {
            "proof_id": "00000000-0000-0000-0000-000000000002",
            "proof_type": "AUDIT2_VT_GROUNDING_VALIDATION",
            "pass_status": False,
            "summary_pl": "Niezgodne U_th VT z siecia izolowana",
            "details": {},
            "formulas_latex": [],
            "generated_at": "2026-04-01T00:00:00Z",
        },
    ]
    ctx = _make_ctx(proofs)
    report = render_audit2_report_json(ctx)
    assert report["report_kind"] == "audit2_validation_report"
    assert report["station_id"] == "station_001"
    assert report["summary"]["total_proofs"] == 2
    assert report["summary"]["pass_count"] == 1
    assert report["summary"]["fail_count"] == 1
    assert "AUDIT2_HOSTING_CAPACITY_EXPORT" in report["proofs_by_type"]
    assert "AUDIT2_VT_GROUNDING_VALIDATION" in report["proofs_by_type"]


def test_text_report_renders_polish_summary():
    proofs = [
        {
            "proof_id": "00000000-0000-0000-0000-000000000001",
            "proof_type": "AUDIT2_BESS_OPERATION_MODES",
            "pass_status": True,
            "summary_pl": "OK: BESS modes zgodne",
            "details": {},
            "formulas_latex": [],
            "generated_at": "2026-04-01T00:00:00Z",
        }
    ]
    ctx = _make_ctx(proofs)
    text = render_audit2_report_text(ctx)
    assert "RAPORT WALIDACJI" in text
    assert "Projekt: Projekt Test" in text
    assert "Stacja: station_001" in text
    assert "Operator: PSE" in text
    assert "1 walidacji" in text
    assert "AUDIT2_BESS_OPERATION_MODES" in text
    assert "OK: BESS modes zgodne" in text


def test_text_report_for_empty_proofs():
    ctx = _make_ctx([])
    text = render_audit2_report_text(ctx)
    assert "brak dowodow" in text.lower()


def test_latex_report_includes_formulas():
    proofs = [
        {
            "proof_id": "00000000-0000-0000-0000-000000000001",
            "proof_type": "AUDIT2_DEVICE_WITHSTAND",
            "pass_status": True,
            "summary_pl": "OK: aparatura wytrzymala",
            "details": {},
            "formulas_latex": [r"$$I_{\text{dyn}} \geq \kappa \sqrt{2} \cdot I_k''$$"],
            "generated_at": "2026-04-01T00:00:00Z",
        }
    ]
    ctx = _make_ctx(proofs)
    latex = render_audit2_report_latex(ctx)
    assert r"\documentclass" in latex
    assert r"\title{Raport walidacji audytu 2}" in latex
    assert r"\subsection" in latex
    assert r"I_{\text{dyn}}" in latex


def test_all_formats_render_without_errors():
    proofs = [
        {
            "proof_id": "00000000-0000-0000-0000-000000000001",
            "proof_type": "AUDIT2_HOSTING_CAPACITY_EXPORT",
            "pass_status": True,
            "summary_pl": "Eksport normalny",
            "details": {},
            "formulas_latex": [],
            "generated_at": "2026-04-01T00:00:00Z",
        }
    ]
    ctx = _make_ctx(proofs)
    formats = render_audit2_report_all_formats(ctx)
    assert "json" in formats
    assert "text_pl" in formats
    assert "latex" in formats
    assert "pdf_size_bytes" in formats
    assert "docx_size_bytes" in formats
    # PDF i DOCX nieujemne (placeholder lub realne bytes).
    assert formats["pdf_size_bytes"] > 0
    assert formats["docx_size_bytes"] > 0


def test_determinism_same_input_same_output():
    """Identyczny input -> identyczny JSON (DETERMINISM Rule)."""
    proofs = [
        {
            "proof_id": "00000000-0000-0000-0000-000000000001",
            "proof_type": "AUDIT2_VT_GROUNDING_VALIDATION",
            "pass_status": True,
            "summary_pl": "OK",
            "details": {"voltage_factor": 1.9},
            "formulas_latex": [],
            "generated_at": "2026-04-01T00:00:00Z",
        }
    ]
    ctx1 = _make_ctx(proofs)
    ctx2 = _make_ctx(proofs)
    j1 = render_audit2_report_json(ctx1)
    j2 = render_audit2_report_json(ctx2)
    assert j1 == j2
    t1 = render_audit2_report_text(ctx1)
    t2 = render_audit2_report_text(ctx2)
    assert t1 == t2
