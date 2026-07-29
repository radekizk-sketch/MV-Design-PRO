from __future__ import annotations

import json
from datetime import UTC, datetime
from uuid import uuid4

from api.analysis_run_exports import (
    build_analysis_run_export_payload,
    build_analysis_run_report_payload,
    build_analysis_run_trace_export_payload,
    export_run_report_docx_response,
    export_run_report_json_response,
    export_run_report_pdf_response,
    normalize_report_options,
)
from api.v125_contracts import build_export_artifact
from enm.canonical_analysis import CanonicalRun


def _build_pf_run() -> CanonicalRun:
    return CanonicalRun(
        id=uuid4(),
        case_id="case-pf",
        project_id="project-1",
        analysis_type="PF",
        status="FINISHED",
        created_at=datetime.now(UTC),
        snapshot_hash="snapshot-pf",
        input_hash="hash-pf",
        snapshot={
            "branches": [
                {
                    "ref_id": "branch-1",
                    "catalog_ref": "cable-120",
                    "catalog_namespace": "mv_cables",
                    "materialized_params": {"r_ohm_per_km": 0.12},
                    "parameter_source": "CATALOG",
                }
            ],
            "buses": [
                {"ref_id": "bus-1"},
                {"ref_id": "bus-2"},
            ],
        },
        validation={},
        readiness={},
        result_status="VALID",
        raw_result={
            "result_v1": {
                "converged": True,
                "iterations_count": 3,
                "slack_bus_id": "bus-1",
                "summary": {
                    "min_v_pu": 0.98,
                    "max_v_pu": 1.0,
                    "total_losses_p_mw": 0.1,
                },
                "bus_results": [
                    {"bus_id": "bus-1", "v_pu": 1.0, "angle_deg": 0.0},
                    {"bus_id": "bus-2", "v_pu": 0.98, "angle_deg": -1.2},
                ],
                "branch_results": [
                    {"branch_id": "branch-1", "p_from_mw": 1.2, "q_from_mvar": 0.4},
                ],
            },
            "graph": {
                "nodes": {
                    "bus-1": {"name": "Szyna 1", "voltage_level": 15.0},
                    "bus-2": {"name": "Szyna 2", "voltage_level": 15.0},
                },
                "branches": {
                    "branch-1": {
                        "name": "Odcinek 1",
                        "from_node_id": "bus-1",
                        "to_node_id": "bus-2",
                        "rated_current_a": 250.0,
                    }
                },
            },
            "node_voltage_kv": {"bus-1": 15.0, "bus-2": 14.7},
            "branch_current_ka": {"branch-1": 0.12},
        },
        white_box_trace=[
            {
                "step": 1,
                "title": "Krok PF",
                "result": {"u_pu": {"value": 0.98, "unit": "pu"}},
            }
        ],
    )


def _build_sc_run() -> CanonicalRun:
    return CanonicalRun(
        id=uuid4(),
        case_id="case-sc",
        project_id="project-1",
        analysis_type="short_circuit_sn",
        status="FINISHED",
        created_at=datetime.now(UTC),
        snapshot_hash="snapshot-sc",
        input_hash="hash-sc",
        snapshot={
            "buses": [{"ref_id": "bus-2"}],
        },
        validation={},
        readiness={},
        result_status="VALID",
        raw_result={
            "analysis_type": "short_circuit_1f",
            "short_circuit_type": "1F",
            "reporting_status": "reportable",
            "proof_status": "complete",
            "proof_engine_version": "white_box_trace_v1",
            "results": [
                {
                    "fault_node_id": "bus-2",
                    "ikss_a": 4500.0,
                    "ip_a": 9200.0,
                    "ith_a": 4700.0,
                    "ib_a": 4100.0,
                    "ik_total_a": 4500.0,
                    "ik_thevenin_a": 4400.0,
                    "ik_inverters_a": 100.0,
                    "zkk_ohm": {"re": 0.5, "im": 1.5},
                    "rx_ratio": 0.3333333333,
                    "kappa": 1.4,
                    "c_factor": 1.1,
                    "un_v": 15000.0,
                    "tk_s": 1.0,
                    "tb_s": 0.1,
                    "sk_mva": 125.0,
                    "short_circuit_type": "1F",
                    "analysis_type": "short_circuit_1f",
                    "reporting_status": "reportable",
                    "proof_status": "complete",
                    "proof_ref": "proof:short-circuit:bus-2",
                    "proof_binding": {
                        "proof_ref": "proof:short-circuit:bus-2",
                        "proof_status": "complete",
                        "reporting_status": "reportable",
                        "trace_step_refs": [1],
                        "method_basis": "IEC_60909",
                        "requires_z0": True,
                        "z0_source": "ENM_COMMITTED",
                        "reporting_limitations": [],
                    },
                    "dopuszczalnosc_raportowa": True,
                    "reporting_limitations": [],
                }
            ],
            "graph": {
                "nodes": {
                    "bus-2": {"name": "Szyna 2", "element_id": "bus-2"},
                }
            },
        },
        white_box_trace=[
            {
                "step": 1,
                "title": "Krok SC",
                "result": {"ikss_a": {"value": 4500.0, "unit": "A"}},
                "proof_ref": "proof:short-circuit:bus-2",
                "proof_status": "complete",
                "reporting_status": "reportable",
                "method_basis": "IEC_60909",
            }
        ],
    )


def test_normalize_report_options_applies_defaults() -> None:
    options = normalize_report_options()

    assert options["profile"] == "osd"
    assert options["detail_level"] == "standardowy"
    assert options["scope"] == "whole_run"
    assert options["sections"] == ["summary", "results", "catalog"]


def test_build_analysis_run_report_payload_filters_to_active_bus_table() -> None:
    payload = build_analysis_run_report_payload(
        _build_pf_run(),
        report_options={
            "profile": "audytowy",
            "detail_level": "pelny",
            "scope": "active_table",
            "focus_table": "buses",
            "sections": ["summary", "results", "trace"],
        },
    )

    assert payload["report_type"] == "analysis_run_report"
    assert payload["report_options"]["profile"] == "audytowy"
    assert payload["analysis_case_context"]["completeness"] == "complete"
    assert (
        payload["analysis_case_context"]["reproducibility"]["proof_renderer_version"]
        == "white_box_trace_v1"
    )
    reproducibility = payload["analysis_case_context"]["reproducibility"]
    assert reproducibility["case_ref"] == "case-pf"
    assert reproducibility["snapshot_ref"] == "snapshot-pf"
    assert reproducibility["enm_hash"] == "snapshot-pf"
    assert reproducibility["variant_ref"] == "variant.uklad_normalny"
    assert reproducibility["switching_snapshot_ref"] == "switching.uklad_normalny.base"
    assert reproducibility["catalog_materialization_status"] == "materialized"
    assert reproducibility["catalog_materialization_ref"].startswith("catalog-materialization:")
    assert len(reproducibility["catalog_materialization_hash"]) == 64
    assert (
        reproducibility["catalog_materialization_contract_version"] == "catalog_materialization_v1"
    )
    assert reproducibility["report_contract_version"] == "analysis_report_v2"
    assert reproducibility["result_rules_version"] == "result_rules_v12_5"
    assert payload["export_artifact"]["export_kind"] == "json"
    assert payload["results"]["index"]["tables"][0]["table_id"] == "buses"
    assert payload["results"]["branches"]["rows"] == []
    assert len(payload["results"]["buses"]["rows"]) == 2
    assert payload["trace"]["white_box_trace"][0]["title"] == "Krok PF"


def test_build_analysis_run_report_payload_supports_short_circuit_runs() -> None:
    payload = build_analysis_run_report_payload(
        _build_sc_run(),
        report_options={
            "profile": "wykonawczy",
            "detail_level": "standardowy",
            "sections": ["summary", "results", "trace"],
        },
    )

    assert payload["title"] == "Raport analizy zwarciowej"
    assert payload["proof_pack_ref"].startswith("proof-pack:")
    assert payload["export_policy"]["carries_generated_by_version"] is True
    assert payload["results"]["short_circuit"]["rows"][0]["target_id"] == "bus-2"
    assert payload["results"]["short_circuit"]["rows"][0]["fault_type"] == "1F"
    assert payload["results"]["short_circuit"]["rows"][0]["reporting_status"] == "reportable"
    assert payload["results"]["short_circuit"]["rows"][0]["proof_status"] == "complete"
    assert payload["results"]["short_circuit"]["rows"][0]["proof_ref"].startswith(
        "proof:short-circuit:"
    )


def test_report_payload_short_circuit_rows_carry_full_iec60909_balance() -> None:
    """ZWARCIA-PRO F5: raport JSON niesie pelny bilans IEC 60909 z wierszy kanonicznych."""
    payload = build_analysis_run_report_payload(
        _build_sc_run(),
        report_options={"sections": ["summary", "results"]},
    )

    row = payload["results"]["short_circuit"]["rows"][0]
    assert row["rk_ohm"] == 0.5
    assert row["xk_ohm"] == 1.5
    assert abs(row["zk_ohm"] - 1.5811388300841898) < 1e-12
    assert abs(row["xr_ratio"] - 3.0) < 1e-6
    assert row["kappa"] == 1.4
    assert row["c_factor"] == 1.1
    assert row["un_kv"] == 15.0
    assert row["tk_s"] == 1.0
    assert row["tb_s"] == 0.1
    assert row["ib_ka"] == 4.1
    assert row["ik_ka"] == 4.5
    assert abs(row["i2t_ka2s"] - 22.09) < 1e-9


def test_export_run_report_docx_includes_full_iec60909_balance() -> None:
    """ZWARCIA-PRO F5: tabela zwarciowa w DOCX zawiera pelny bilans IEC 60909 (1:1 z UI)."""
    import io as _io

    from docx import Document as _Document

    response = export_run_report_docx_response(
        _build_sc_run(),
        filename_stem="analysis_report",
        report_options={"sections": ["summary", "results"]},
    )

    document = _Document(_io.BytesIO(response.body))
    text = "\n".join(paragraph.text for paragraph in document.paragraphs)
    assert "Ik''=4.5 kA | ip=9.2 kA | Ith=4.7 kA | Ib=4.1 kA | Ik=4.5 kA | Sk''=125 MVA" in text
    assert (
        "Bilans IEC 60909: Rk=0.5 Ohm | Xk=1.5 Ohm | |Zk|=1.58114 Ohm | X/R=3 | kappa=1.4" in text
    )
    assert "c=1.1 | Un=15 kV | tk=1 s | tb=0.1 s | I2t=22.09 kA2s" in text


def test_export_run_report_pdf_generates_for_short_circuit_run() -> None:
    """ZWARCIA-PRO F5: raport PDF z pelnym bilansem generuje sie deterministycznie."""
    response = export_run_report_pdf_response(
        _build_sc_run(),
        filename_stem="analysis_report",
        report_options={"sections": ["summary", "results", "trace"]},
    )

    assert response.media_type == "application/pdf"
    assert bytes(response.body).startswith(b"%PDF")
    assert len(response.body) > 1000


def _build_phase_state_run() -> CanonicalRun:
    return CanonicalRun(
        id=uuid4(),
        case_id="case-phase",
        project_id="project-1",
        analysis_type="phase_state_sn",
        status="FINISHED",
        created_at=datetime.now(UTC),
        snapshot_hash="snapshot-phase",
        input_hash="hash-phase",
        snapshot={"buses": [{"ref_id": "bus-load"}]},
        validation={},
        readiness={},
        result_status="VALID",
        raw_result={
            "analysis_type": "phase_state_sn",
            "target_id": "bus-load",
            "target_bus_ref": "bus-load",
            "proof_ref": "proof:phase-state-sn:bus-load",
            "proof_status": "complete",
            "reporting_status": "reportable",
            "result": {
                "ua_kv": 8.648,
                "ub_kv": 8.65,
                "uc_kv": 0.0,
                "ia_a": 120.0,
                "ib_a": 100.0,
                "ic_a": 0.0,
                "phase_losses_kw": {"A": 1.44, "B": 1.0, "C": 0.0},
                "unbalance_indices": {
                    "voltage_percent": 50.0,
                    "current_percent": 50.0,
                    "losses_percent": 70.0,
                },
                "flags": {
                    "has_fault": True,
                    "has_open_phase": True,
                    "faulted_phases": ["A"],
                    "open_phases": ["C"],
                },
            },
        },
        white_box_trace=[
            {
                "step": 1,
                "title": "Krok stanu fazowego",
                "proof_ref": "proof:phase-state-sn:bus-load",
                "proof_status": "complete",
                "reporting_status": "reportable",
            }
        ],
    )


def _build_dynamic_stability_run() -> CanonicalRun:
    return CanonicalRun(
        id=uuid4(),
        case_id="case-dyn",
        project_id="project-1",
        analysis_type="dynamic_stability",
        status="FINISHED",
        created_at=datetime.now(UTC),
        snapshot_hash="snapshot-dyn",
        input_hash="hash-dyn",
        snapshot={"sources": [{"ref_id": "src-main"}]},
        validation={},
        readiness={},
        result_status="VALID",
        raw_result={
            "analysis_type": "dynamic_stability",
            "proof_ref": "proof:dynamic-stability:dyn-1",
            "proof_status": "complete",
            "reporting_status": "reportable",
            "result": {
                "scenario_id": "dyn-1",
                "source_id": "src-main",
                "faulted_element_id": "line-1",
                "status": "STABLE",
                "stability_index": 0.66,
                "clearing_time_ms": 120.0,
                "clearing_margin_ms": 30.0,
                "angle_swing_deg": 65.0,
                "post_fault_voltage_pu": 0.97,
                "post_fault_frequency_pu": 0.99,
                "limiting_factor": "clearing_time",
            },
            "automation_trace": {
                "topology_effect": {"network_state": "RECONFIGURED"},
                "events": [
                    {"event_seq": 1, "event_type": "AUTOMATION_STARTED", "detail": "Start"},
                    {"event_seq": 5, "event_type": "DYNAMIC_STABILITY_EVALUATED", "detail": "Eval"},
                ],
            },
        },
        white_box_trace=[
            {
                "step": 1,
                "title": "Krok stabilnosci",
                "proof_ref": "proof:dynamic-stability:dyn-1",
                "proof_status": "complete",
                "reporting_status": "reportable",
            }
        ],
    )


def _build_source_compliance_run() -> CanonicalRun:
    return CanonicalRun(
        id=uuid4(),
        case_id="case-comp",
        project_id="project-1",
        analysis_type="source_compliance",
        status="FINISHED",
        created_at=datetime.now(UTC),
        snapshot_hash="snapshot-comp",
        input_hash="hash-comp",
        snapshot={"sources": [{"ref_id": "src-main"}]},
        validation={},
        readiness={},
        result_status="VALID",
        raw_result={
            "analysis_type": "source_compliance",
            "source_ref": "src-main",
            "proof_ref": "proof:source-compliance:src-main",
            "proof_status": "complete",
            "reporting_status": "reportable",
            "result": {
                "source_type": "PV",
                "verdict": "compliant",
                "reporting_status": "reportable",
                "proof_status": "complete",
                "limitations": [],
                "checks": {"frt": {"verdict": "compliant"}},
            },
        },
        white_box_trace=[
            {
                "step": 1,
                "title": "Krok zgodnosci zrodla",
                "proof_ref": "proof:source-compliance:src-main",
                "proof_status": "complete",
                "reporting_status": "reportable",
            }
        ],
    )


def test_export_payload_supports_asymmetric_short_circuit_proof_status() -> None:
    payload = build_analysis_run_export_payload(_build_sc_run())

    assert payload["report_type"] == "short_circuit_result"
    assert payload["metadata"]["analysis_type"] == "short_circuit_1f"
    assert payload["metadata"]["reporting_status"] == "reportable"
    assert payload["metadata"]["proof_status"] == "complete"
    row = payload["short_circuit_results"]["rows"][0]
    assert row["fault_type"] == "1F"
    assert row["proof_binding"]["z0_source"] == "ENM_COMMITTED"
    assert row["dopuszczalnosc_raportowa"] is True
    assert payload["white_box_trace"][0]["proof_ref"].startswith("proof:short-circuit:")


def test_export_run_report_json_response_returns_json_payload() -> None:
    response = export_run_report_json_response(
        _build_sc_run(),
        filename_stem="analysis_report",
        report_options={
            "profile": "osd",
            "detail_level": "minimalny",
            "sections": ["summary", "results"],
        },
    )

    payload = json.loads(response.body.decode("utf-8"))
    assert payload["report_version"] == "2.0.0"
    assert payload["report_options"]["detail_level"] == "minimalny"
    assert (
        payload["analysis_case_context"]["reproducibility"]["results_contract_version"] == "V12.5"
    )
    assert (
        payload["analysis_case_context"]["reproducibility"]["catalog_materialization_status"]
        == "not_materialized"
    )
    assert payload["export_artifact"]["completeness_status"] == "complete"
    assert "results" in payload


def test_trace_export_payload_carries_export_lineage() -> None:
    payload = build_analysis_run_trace_export_payload(_build_pf_run())

    assert payload["analysis_case_context"]["case_ref"] == "case-pf"
    assert payload["proof_pack_ref"].startswith("proof-pack:")
    assert payload["export_artifact"]["export_kind"] == "whitebox_package"
    assert payload["export_artifact"]["run_ref"] == payload["run_id"]
    assert payload["export_artifact"]["lineage"]["snapshot_ref"] == payload["snapshot_id"]
    assert payload["export_artifact"]["lineage"]["proof_pack_ref"] == payload["proof_pack_ref"]
    assert payload["export_policy"]["carries_proof_pack_ref"] is True


def test_trace_export_payload_carries_asymmetric_short_circuit_proof_status() -> None:
    payload = build_analysis_run_trace_export_payload(_build_sc_run())

    assert payload["analysis_case_context"]["case_ref"] == "case-sc"
    assert payload["proof_pack_ref"].startswith("proof-pack:")
    assert payload["export_artifact"]["export_kind"] == "whitebox_package"
    assert payload["white_box_trace"][0]["proof_status"] == "complete"
    assert payload["white_box_trace"][0]["reporting_status"] == "reportable"
    assert payload["white_box_trace"][0]["method_basis"] == "IEC_60909"


def test_analysis_run_export_endpoints_support_short_circuit_runs(app_client, monkeypatch) -> None:
    from api import analysis_runs as analysis_runs_api

    run = _build_sc_run()
    monkeypatch.setattr(analysis_runs_api, "_require_canonical_run", lambda _run_id: run)

    report_json = app_client.get(f"/api/analysis-runs/{run.id}/export/report/json")
    assert report_json.status_code == 200
    assert report_json.headers["content-type"].startswith("application/json")
    assert report_json.json()["report_type"] == "analysis_run_report"

    proof_latex = app_client.get(f"/api/analysis-runs/{run.id}/export/proof/latex")
    assert proof_latex.status_code == 200
    assert "Uzasadnienie inżynierskie obliczeń" in proof_latex.text
    assert str(run.id) in proof_latex.text

    proof_json = app_client.get(f"/api/analysis-runs/{run.id}/export/proof/json")
    assert proof_json.status_code == 200
    assert proof_json.json()["proof_pack_ref"].startswith("proof-pack:")


def test_report_payload_supports_phase_state_focus_table() -> None:
    payload = build_analysis_run_report_payload(
        _build_phase_state_run(),
        report_options={
            "profile": "audytowy",
            "detail_level": "pelny",
            "scope": "active_table",
            "focus_table": "phase_state",
            "sections": ["summary", "results", "trace"],
        },
    )

    assert payload["results"]["index"]["tables"][0]["table_id"] == "phase_state"
    assert payload["results"]["phase_state"]["rows"][0]["proof_status"] == "complete"
    assert payload["trace"]["white_box_trace"][0]["proof_ref"].startswith("proof:phase-state-sn:")


def test_export_payload_supports_dynamic_stability_bundle() -> None:
    payload = build_analysis_run_export_payload(_build_dynamic_stability_run())

    assert payload["report_type"] == "dynamic_stability"
    assert payload["dynamic_stability"]["rows"][0]["status"] == "STABLE"
    assert payload["automation_trace"]["rows"][-1]["event_type"] == "DYNAMIC_STABILITY_EVALUATED"
    assert payload["metadata"]["proof_status"] == "complete"


def test_export_payload_supports_source_compliance_bundle() -> None:
    payload = build_analysis_run_export_payload(_build_source_compliance_run())

    assert payload["report_type"] == "source_compliance"
    assert payload["source_compliance"]["rows"][0]["verdict"] == "compliant"
    assert payload["source_compliance"]["rows"][0]["reporting_status"] == "reportable"
    assert payload["metadata"]["analysis_type"] == "source_compliance"


def test_report_payload_marks_readiness_blockers_as_partial_with_missing_prerequisites() -> None:
    run = _build_pf_run()
    run.readiness = {"blockers": [{"code": "catalog.binding.missing"}]}

    payload = build_analysis_run_report_payload(run)

    assert payload["analysis_case_context"]["completeness"] == "partial"
    assert payload["analysis_case_context"]["missing_prerequisites"] == ["catalog.binding.missing"]
    assert payload["export_artifact"]["completeness_status"] == "partial"


def test_export_artifact_includes_run_lineage_for_reproducible_exports() -> None:
    run = _build_pf_run()

    artifact = build_export_artifact(run, export_kind="json")

    assert artifact["run_ref"] == str(run.id)
    assert artifact["proof_pack_ref"].startswith("proof-pack:")
    assert artifact["lineage"] == {
        "run_ref": str(run.id),
        "analysis_case_ref": run.case_id,
        "analysis_type": run.analysis_type,
        "snapshot_ref": run.snapshot_hash,
        "proof_pack_ref": artifact["proof_pack_ref"],
        "input_hash": run.input_hash,
        "result_hash": artifact["result_hash"],
    }
