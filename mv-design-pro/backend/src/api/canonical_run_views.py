from __future__ import annotations

from math import radians
from typing import Any
from uuid import UUID

from analysis.power_flow.result import PowerFlowResult
from analysis.power_flow_interpretation import (
    InterpretationContext,
    PowerFlowInterpretationBuilder,
)
from api.analysis_case_context import build_analysis_case_context
from api.v125_contracts import (
    ExportArtifactKind,
    build_analysis_case_reproducibility,
    build_export_artifact,
    build_export_policy,
    infer_completeness_status,
    resolve_proof_pack_ref,
)
from application.analysis_run import build_trace_summary
from enm.canonical_analysis import (
    CanonicalRun,
    build_automation_trace_results,
    build_branch_results,
    build_bus_results,
    build_dynamic_stability_results,
    build_dynamic_stability_time_series,
    build_extended_trace,
    build_phase_state_results,
    build_results_index,
    build_short_circuit_results,
    build_source_compliance_results,
)


def build_run_trace_payload(run: CanonicalRun) -> dict[str, Any] | list[dict[str, Any]] | None:
    if run.analysis_type == "PF":
        return run.power_flow_trace
    if run.white_box_trace:
        return build_extended_trace(run).get("white_box_trace", [])
    return None


def _build_export_contract(
    run: CanonicalRun,
    *,
    export_kind: ExportArtifactKind = "json",
) -> dict[str, Any]:
    generated_at = run.finished_at or run.created_at
    return {
        "proof_pack_ref": resolve_proof_pack_ref(run),
        "export_artifact": build_export_artifact(
            run,
            export_kind=export_kind,
            generated_at=generated_at,
        ),
        "export_policy": build_export_policy(export_kind),
    }


def build_analysis_run_summary(run: CanonicalRun) -> dict[str, Any]:
    analysis_case_context = build_analysis_case_context(run)
    trace_payload = build_run_trace_payload(run)
    trace_summary = build_trace_summary(trace_payload) if trace_payload is not None else None
    return {
        "id": str(run.id),
        "deterministic_id": run.input_hash,
        "analysis_type": run.analysis_type,
        "status": run.status,
        "result_status": run.result_status,
        "results_valid": run.result_status == "VALID",
        "created_at": run.created_at.isoformat(),
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        "input_hash": run.input_hash,
        "analysis_case_context": analysis_case_context,
        "summary_json": build_run_summary_json(run),
        "trace_summary": trace_summary,
        **_build_export_contract(run),
    }


def build_analysis_run_detail(run: CanonicalRun) -> dict[str, Any]:
    analysis_case_context = build_analysis_case_context(run)
    detail = build_analysis_run_summary(run)
    detail["input_metadata"] = {
        "snapshot_hash": run.snapshot_hash,
        "case_id": run.case_id,
        "project_id": run.project_id,
        "element_counts": _build_element_counts(run),
        "options": dict(run.options),
        "analysis_case_context": analysis_case_context,
    }
    return detail


def build_run_summary_json(run: CanonicalRun) -> dict[str, Any]:
    if run.analysis_type == "PF":
        result_v1 = (run.raw_result or {}).get("result_v1") or {}
        return {
            "converged": result_v1.get("converged"),
            "iterations": result_v1.get("iterations_count"),
            "summary": result_v1.get("summary", {}),
        }
    if run.analysis_type == "short_circuit_sn":
        rows = (run.raw_result or {}).get("results") or []
        ikss_values = [
            float(row["ikss_a"]) / 1000.0 for row in rows if row.get("ikss_a") is not None
        ]
        return {
            "row_count": len(rows),
            "max_ikss_ka": max(ikss_values) if ikss_values else None,
        }
    if run.analysis_type == "phase_state_sn":
        rows = build_phase_state_results(run).get("rows", [])
        row = rows[0] if rows else {}
        return {
            "row_count": len(rows),
            "target_name": row.get("target_name"),
            "voltage_unbalance_percent": row.get("voltage_unbalance_percent"),
            "current_unbalance_percent": row.get("current_unbalance_percent"),
        }
    if run.analysis_type == "dynamic_stability":
        rows = build_dynamic_stability_results(run).get("rows", [])
        row = rows[0] if rows else {}
        return {
            "row_count": len(rows),
            "status": row.get("status"),
            "stability_index": row.get("stability_index"),
            "limiting_factor": row.get("limiting_factor"),
        }
    if run.analysis_type == "source_compliance":
        rows = build_source_compliance_results(run).get("rows", [])
        row = rows[0] if rows else {}
        return {
            "row_count": len(rows),
            "source_type": row.get("source_type"),
            "verdict": row.get("verdict"),
            "reporting_status": row.get("reporting_status"),
        }
    return {"row_count": 0}


def build_result_items(run: CanonicalRun) -> dict[str, Any]:
    analysis_case_context = build_analysis_case_context(run)
    result_type = {
        "PF": "power_flow",
        "short_circuit_sn": "short_circuit_sn",
        "phase_state_sn": "phase_state_sn",
        "dynamic_stability": "dynamic_stability",
        "source_compliance": "source_compliance",
    }.get(run.analysis_type, run.analysis_type)
    payload_summary = build_run_summary_json(run)
    return {
        "analysis_case_context": analysis_case_context,
        "results": [
            {
                "result_type": result_type,
                "payload_summary": payload_summary,
                "reference": {
                    "id": str(run.id),
                    "created_at": (
                        run.finished_at.isoformat()
                        if run.finished_at
                        else run.created_at.isoformat()
                    ),
                },
            }
        ],
    }


def build_sld_overlay(
    run: CanonicalRun,
    *,
    diagram_id: UUID,
    sld_payload: dict[str, Any],
) -> dict[str, Any]:
    bus_rows = {row["bus_id"]: row for row in build_bus_results(run).get("rows", [])}
    branch_rows = {row["branch_id"]: row for row in build_branch_results(run).get("rows", [])}
    sc_rows = {row["target_id"]: row for row in build_short_circuit_results(run).get("rows", [])}
    phase_rows = {row["target_id"]: row for row in build_phase_state_results(run).get("rows", [])}
    stability_rows = build_dynamic_stability_results(run).get("rows", [])
    stability_row = stability_rows[0] if stability_rows else {}
    compliance_rows = build_source_compliance_results(run).get("rows", [])
    compliance_row = compliance_rows[0] if compliance_rows else {}

    node_symbols = list(sld_payload.get("nodes", []))
    if not node_symbols:
        node_symbols = list(sld_payload.get("buses", []))

    nodes: list[dict[str, Any]] = []
    for symbol in node_symbols:
        symbol_id = str(symbol.get("id") or symbol.get("symbol_id") or "")
        node_id = str(symbol.get("node_id") or symbol.get("bus_id") or "")
        bus_data = bus_rows.get(node_id, {})
        sc_data = sc_rows.get(node_id, {})
        phase_data = phase_rows.get(node_id, {})
        nodes.append(
            {
                "symbol_id": symbol_id,
                "bus_id": node_id,
                "node_id": node_id,
                "u_pu": bus_data.get("u_pu"),
                "u_kv": bus_data.get("u_kv"),
                "angle_deg": bus_data.get("angle_deg"),
                "ikss_ka": sc_data.get("ikss_ka"),
                "sk_mva": sc_data.get("sk_mva"),
                "ua_kv": phase_data.get("ua_kv"),
                "ub_kv": phase_data.get("ub_kv"),
                "uc_kv": phase_data.get("uc_kv"),
                "ia_a": phase_data.get("ia_a"),
                "ib_a": phase_data.get("ib_a"),
                "ic_a": phase_data.get("ic_a"),
                "phase_voltage_unbalance_percent": phase_data.get("voltage_unbalance_percent"),
                "phase_current_unbalance_percent": phase_data.get("current_unbalance_percent"),
                "dynamic_stability_status": (
                    stability_row.get("status")
                    if node_id == str(stability_row.get("source_id") or "")
                    else None
                ),
                "source_compliance_verdict": (
                    compliance_row.get("verdict")
                    if node_id == str(compliance_row.get("source_ref") or "")
                    else None
                ),
            }
        )

    branch_symbols = list(sld_payload.get("branches", []))
    branches: list[dict[str, Any]] = []
    for symbol in branch_symbols:
        symbol_id = str(symbol.get("id") or symbol.get("symbol_id") or "")
        branch_id = str(symbol.get("branch_id") or "")
        branch_data = branch_rows.get(branch_id, {})
        branches.append(
            {
                "symbol_id": symbol_id,
                "branch_id": branch_id,
                "p_mw": branch_data.get("p_mw"),
                "q_mvar": branch_data.get("q_mvar"),
                "i_a": branch_data.get("i_a"),
                "loading_pct": branch_data.get("loading_pct"),
            }
        )

    nodes.sort(key=lambda item: (item["bus_id"], item["symbol_id"]))
    branches.sort(key=lambda item: (item["branch_id"], item["symbol_id"]))

    return {
        "diagram_id": str(diagram_id),
        "run_id": str(run.id),
        "result_status": run.result_status,
        "nodes": nodes,
        "buses": nodes,
        "branches": branches,
    }


def build_power_flow_run_header(run: CanonicalRun) -> dict[str, Any]:
    analysis_case_context = build_analysis_case_context(run)
    result_v1 = (run.raw_result or {}).get("result_v1") or {}
    trace_summary = (
        build_trace_summary(run.power_flow_trace or {}) if run.power_flow_trace else None
    )
    return {
        "id": str(run.id),
        "deterministic_id": run.input_hash,
        "project_id": run.project_id,
        "study_case_id": run.case_id,
        "analysis_type": run.analysis_type,
        "status": run.status,
        "result_status": run.result_status,
        "created_at": run.created_at.isoformat(),
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        "input_hash": run.input_hash,
        "analysis_case_context": analysis_case_context,
        "converged": result_v1.get("converged"),
        "iterations": result_v1.get("iterations_count"),
        "trace_summary": trace_summary,
        "input_metadata": {
            "snapshot_hash": run.snapshot_hash,
            "case_id": run.case_id,
            "options": dict(run.options),
            "analysis_case_context": analysis_case_context,
        },
        **_build_export_contract(run),
    }


def get_power_flow_result(run: CanonicalRun) -> dict[str, Any]:
    if run.analysis_type != "PF":
        raise ValueError("Przebieg nie jest rozpływem mocy")
    if run.status != "FINISHED":
        raise ValueError(f"Przebieg {run.id} nie jest zakończony (status={run.status})")
    result_v1 = (run.raw_result or {}).get("result_v1") or None
    if result_v1 is None:
        raise ValueError(f"Wyniki rozpływu mocy nie są dostępne dla przebiegu {run.id}")
    return result_v1


def get_power_flow_trace(run: CanonicalRun) -> dict[str, Any]:
    if run.analysis_type != "PF":
        raise ValueError("Przebieg nie jest rozpływem mocy")
    if run.status != "FINISHED":
        raise ValueError(f"Przebieg {run.id} nie jest zakończony (status={run.status})")
    if run.power_flow_trace is None:
        raise ValueError(f"Ślad obliczeniowy nie jest dostępny dla przebiegu {run.id}")
    trace = dict(run.power_flow_trace)
    extended_trace = build_extended_trace(run)
    trace.setdefault("catalog_context", extended_trace.get("catalog_context", []))
    trace.setdefault(
        "catalog_context_by_element", extended_trace.get("catalog_context_by_element", {})
    )
    trace.setdefault("catalog_context_summary", extended_trace.get("catalog_context_summary", {}))
    return trace


def build_power_flow_interpretation(run: CanonicalRun) -> dict[str, Any]:
    result_v1 = get_power_flow_result(run)
    bus_results = result_v1.get("bus_results", [])
    branch_results = result_v1.get("branch_results", [])

    power_flow_result = PowerFlowResult(
        converged=bool(result_v1.get("converged", False)),
        iterations=int(result_v1.get("iterations_count", 0)),
        tolerance=float(result_v1.get("tolerance_used", 0.0)),
        max_mismatch_pu=0.0,
        base_mva=float(result_v1.get("base_mva", 100.0)),
        slack_node_id=str(result_v1.get("slack_bus_id", "")),
        node_u_mag_pu={str(row["bus_id"]): float(row.get("v_pu", 0.0)) for row in bus_results},
        node_angle_rad={
            str(row["bus_id"]): radians(float(row.get("angle_deg", 0.0))) for row in bus_results
        },
        branch_s_from_mva={
            str(row["branch_id"]): complex(
                float(row.get("p_from_mw", 0.0)),
                float(row.get("q_from_mvar", 0.0)),
            )
            for row in branch_results
        },
        branch_s_to_mva={
            str(row["branch_id"]): complex(
                float(row.get("p_to_mw", 0.0)),
                float(row.get("q_to_mvar", 0.0)),
            )
            for row in branch_results
        },
    )

    context = InterpretationContext(
        project_name=f"Projekt {run.project_id}" if run.project_id else None,
        case_name=f"Przypadek {run.case_id}",
        run_timestamp=run.created_at,
        snapshot_id=run.snapshot_hash,
    )
    interpretation = PowerFlowInterpretationBuilder(context=context).build(
        power_flow_result=power_flow_result,
        run_id=str(run.id),
        run_timestamp=run.created_at,
    )
    return interpretation.to_dict()


def build_power_flow_export_bundle(run: CanonicalRun) -> dict[str, Any]:
    analysis_case_context = build_analysis_case_context(run)
    extended_trace = build_extended_trace(run)
    return {
        "analysis_case_context": analysis_case_context,
        "result": get_power_flow_result(run),
        "trace": get_power_flow_trace(run),
        "white_box_trace": extended_trace.get("white_box_trace", []),
        "catalog_context": extended_trace.get("catalog_context", []),
        "catalog_context_by_element": extended_trace.get("catalog_context_by_element", {}),
        "catalog_context_summary": extended_trace.get("catalog_context_summary", {}),
        "bus_results": build_bus_results(run),
        "branch_results": build_branch_results(run),
        "results_index": build_results_index(run),
        "metadata": {
            "run_id": str(run.id),
            "project_id": run.project_id,
            "study_case_id": run.case_id,
            "created_at": run.created_at.isoformat(),
            "input_hash": run.input_hash,
            "snapshot_hash": run.snapshot_hash,
            "catalog_context_count": len(extended_trace.get("catalog_context", [])),
            "manual_override_count": (extended_trace.get("catalog_context_summary", {}) or {}).get(
                "manual_override_count", 0
            ),
            "analysis_case_context": analysis_case_context,
            "proof_pack_ref": resolve_proof_pack_ref(run),
            "completeness_status": infer_completeness_status(run),
            "reproducibility": build_analysis_case_reproducibility(run),
        },
    }


def build_results_index_response(run: CanonicalRun) -> dict[str, Any]:
    payload = build_results_index(run)
    payload["analysis_case_context"] = build_analysis_case_context(run)
    payload.setdefault("run_header", {})["analysis_case_context"] = build_analysis_case_context(run)
    payload.update(_build_export_contract(run))
    return payload


def build_phase_state_results_response(run: CanonicalRun) -> dict[str, Any]:
    payload = build_phase_state_results(run)
    payload["analysis_case_context"] = build_analysis_case_context(run)
    return payload


def build_dynamic_stability_results_response(run: CanonicalRun) -> dict[str, Any]:
    payload = build_dynamic_stability_results(run)
    payload["analysis_case_context"] = build_analysis_case_context(run)
    return payload


def build_dynamic_stability_time_series_response(run: CanonicalRun) -> dict[str, Any]:
    payload = build_dynamic_stability_time_series(run)
    payload["analysis_case_context"] = build_analysis_case_context(run)
    return payload


def build_automation_trace_results_response(run: CanonicalRun) -> dict[str, Any]:
    payload = build_automation_trace_results(run)
    payload["analysis_case_context"] = build_analysis_case_context(run)
    return payload


def build_source_compliance_results_response(run: CanonicalRun) -> dict[str, Any]:
    payload = build_source_compliance_results(run)
    payload["analysis_case_context"] = build_analysis_case_context(run)
    return payload


def build_bus_results_response(run: CanonicalRun) -> dict[str, Any]:
    payload = build_bus_results(run)
    payload["analysis_case_context"] = build_analysis_case_context(run)
    return payload


def build_branch_results_response(run: CanonicalRun) -> dict[str, Any]:
    payload = build_branch_results(run)
    payload["analysis_case_context"] = build_analysis_case_context(run)
    return payload


def build_short_circuit_results_response(run: CanonicalRun) -> dict[str, Any]:
    payload = build_short_circuit_results(run)
    payload["analysis_case_context"] = build_analysis_case_context(run)
    return payload


def build_extended_trace_response(run: CanonicalRun) -> dict[str, Any]:
    payload = build_extended_trace(run)
    payload["analysis_case_context"] = build_analysis_case_context(run)
    return payload


def _build_element_counts(run: CanonicalRun) -> dict[str, int]:
    snapshot = run.snapshot or {}
    return {
        "buses": len(snapshot.get("buses") or []),
        "branches": len(snapshot.get("branches") or []),
        "transformers": len(snapshot.get("transformers") or []),
        "sources": len(snapshot.get("sources") or []),
        "loads": len(snapshot.get("loads") or []),
        "generators": len(snapshot.get("generators") or []),
    }
