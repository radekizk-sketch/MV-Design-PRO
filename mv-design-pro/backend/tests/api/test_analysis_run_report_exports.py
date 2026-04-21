from __future__ import annotations

import json
from datetime import UTC, datetime
from uuid import uuid4

from api.analysis_run_exports import (
    build_analysis_run_report_payload,
    build_analysis_run_trace_export_payload,
    export_run_report_json_response,
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
                "formula_latex": r"U_{bus} = U_{nom} \cdot 0{,}98",
                "substitution": "0.98 * 15.0",
                "substitution_latex": r"0{,}98 \cdot 15{,}0",
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
            "results": [
                {
                    "fault_node_id": "bus-2",
                    "ikss_a": 4500.0,
                    "ip_a": 9200.0,
                    "ith_a": 4700.0,
                    "sk_mva": 125.0,
                    "short_circuit_type": "3PH",
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
    assert payload["trace"]["white_box_trace"][0]["title"] == "Krok SC"


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
    assert payload["white_box_trace"][0]["substitution_latex"] == r"0{,}98 \cdot 15{,}0"


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
