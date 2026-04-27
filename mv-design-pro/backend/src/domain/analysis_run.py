from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Literal
from uuid import UUID, uuid4

AnalysisType = Literal["PF", "short_circuit_sn", "fault_loop_nn"]
AnalysisRunStatus = Literal["CREATED", "VALIDATED", "RUNNING", "FINISHED", "FAILED"]
ResultStatus = Literal["VALID", "OUTDATED"]
AnalysisCompletenessStatus = Literal["complete", "partial", "failed", "not_applicable"]

DEFAULT_OPERATING_VARIANT_REF = "variant.uklad_normalny"
DEFAULT_SWITCHING_SNAPSHOT_REF = "switching.uklad_normalny.base"
DEFAULT_CATALOG_MATERIALIZATION_CONTRACT_VERSION = "catalog_materialization_v1"
DEFAULT_ENM_PROJECTION_VERSION = "v12xx.m1.1"
DEFAULT_REPORT_CONTRACT_VERSION = "analysis_report_v2"
DEFAULT_RESULT_RULES_VERSION = "result_rules_v12_5"

_CATALOG_SNAPSHOT_COLLECTIONS = (
    "branches",
    "transformers",
    "sources",
    "loads",
    "generators",
    "measurements",
    "protection_assignments",
    "branch_points",
)


def _canonicalize(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _canonicalize(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [_canonicalize(item) for item in value]
    return value


def _stable_hash(value: object) -> str | None:
    if value is None:
        return None
    canonical = json.dumps(_canonicalize(value), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _catalog_materialization_entries(snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for collection in _CATALOG_SNAPSHOT_COLLECTIONS:
        for raw_element in snapshot.get(collection) or []:
            if not isinstance(raw_element, dict):
                continue

            meta = raw_element.get("meta") or {}
            catalog_ref = raw_element.get("catalog_ref")
            catalog_namespace = raw_element.get("catalog_namespace")
            catalog_version = raw_element.get("catalog_version") or meta.get("catalog_item_version")
            materialized_params = raw_element.get("materialized_params")
            parameter_source = raw_element.get("parameter_source")
            overrides = raw_element.get("overrides") or []

            if not any(
                (
                    catalog_ref,
                    catalog_namespace,
                    catalog_version,
                    materialized_params,
                    parameter_source,
                    overrides,
                )
            ):
                continue

            entry: dict[str, Any] = {
                "collection": collection,
                "element_ref": str(raw_element.get("ref_id") or raw_element.get("id") or ""),
                "catalog_ref": catalog_ref,
                "catalog_namespace": catalog_namespace,
                "catalog_version": catalog_version,
                "parameter_source": parameter_source,
                "manual_override_count": len(overrides),
            }
            if materialized_params is not None:
                entry["materialized_params"] = materialized_params
            entries.append(entry)

    entries.sort(key=lambda item: (item["collection"], item["element_ref"]))
    return entries


def _catalog_materialization_status(entries: list[dict[str, Any]]) -> str:
    if not entries:
        return "not_materialized"
    materialized_count = sum(1 for entry in entries if "materialized_params" in entry)
    if materialized_count == len(entries):
        return "materialized"
    if materialized_count:
        return "partial"
    return "not_materialized"


def _catalog_materialization_ref(
    snapshot_ref: str,
    entries: list[dict[str, Any]],
    *,
    explicit_ref: str | None = None,
) -> str:
    if explicit_ref:
        return explicit_ref
    entries_hash = _stable_hash(entries) if entries else None
    if entries_hash:
        return f"catalog-materialization:{entries_hash}"
    return f"catalog-materialization:not-materialized:{snapshot_ref}"


@dataclass(frozen=True)
class AnalysisRun:
    id: UUID
    project_id: UUID
    operating_case_id: UUID
    analysis_type: AnalysisType
    status: AnalysisRunStatus
    result_status: ResultStatus = "VALID"
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    started_at: datetime | None = None
    finished_at: datetime | None = None
    input_snapshot: dict = field(default_factory=dict)
    input_hash: str = ""
    result_summary: dict = field(default_factory=dict)
    trace_json: dict | list | None = None
    white_box_trace: list[dict] | None = None
    error_message: str | None = None
    analysis_case_context: dict[str, Any] = field(default_factory=dict)
    reproducibility: dict[str, Any] = field(default_factory=dict)
    proof_pack_ref: str | None = None
    completeness_status: AnalysisCompletenessStatus | None = None
    export_artifacts: list[dict[str, Any]] = field(default_factory=list)

    @property
    def results_valid(self) -> bool:
        """
        Explicit flag: are this run's results valid for use?

        Returns True ONLY when result_status == "VALID" AND status == "FINISHED".
        OUTDATED results MUST NOT be used for display, export, or further analysis.
        """
        return self.result_status == "VALID" and self.status == "FINISHED"


def infer_analysis_run_completeness(run: AnalysisRun) -> AnalysisCompletenessStatus:
    if run.status == "FAILED":
        return "failed"
    if run.analysis_type == "fault_loop_nn":
        return "not_applicable"
    if run.status != "FINISHED":
        return "partial"
    if run.result_status != "VALID":
        return "partial"
    return "complete"


def build_analysis_run_reproducibility(run: AnalysisRun) -> dict[str, Any]:
    trace_json = run.trace_json if isinstance(run.trace_json, dict) else {}
    snapshot_ref = str(run.input_snapshot.get("snapshot_id") or "")
    snapshot_header = run.input_snapshot.get("header") or {}
    if not isinstance(snapshot_header, dict):
        snapshot_header = {}
    catalog_materialization_entries = _catalog_materialization_entries(run.input_snapshot or {})
    catalog_materialization_hash = (
        _stable_hash(catalog_materialization_entries) if catalog_materialization_entries else None
    )
    variant_ref = str(run.input_snapshot.get("variant_ref") or DEFAULT_OPERATING_VARIANT_REF)
    switching_snapshot_ref = str(
        run.input_snapshot.get("switching_snapshot_ref")
        or run.input_snapshot.get("switching_state_ref")
        or DEFAULT_SWITCHING_SNAPSHOT_REF
    )
    solver_family = {
        "PF": "power_flow_newton",
        "short_circuit_sn": "iec60909_short_circuit",
        "fault_loop_nn": "fault_loop_nn",
    }[run.analysis_type]
    return {
        "case_ref": str(run.operating_case_id),
        "analysis_case_ref": str(run.operating_case_id),
        "snapshot_ref": snapshot_ref or None,
        "enm_hash": snapshot_ref or None,
        "enm_snapshot_ref": str(run.input_snapshot.get("enm_snapshot_ref") or snapshot_ref) or None,
        "enm_projection_version": str(
            run.input_snapshot.get("enm_projection_version") or DEFAULT_ENM_PROJECTION_VERSION
        ),
        "variant_ref": variant_ref,
        "operating_variant_ref": variant_ref,
        "switching_snapshot_ref": switching_snapshot_ref,
        "solver_family": solver_family,
        "solver_version": trace_json.get("solver_version") or "1.0.0",
        "method_version": "analysis_run_service_v1",
        "formula_set_version": {
            "PF": "pf_result_v1",
            "short_circuit_sn": "iec60909_v1",
            "fault_loop_nn": "fault_loop_v1",
        }[run.analysis_type],
        "standard_basis_ref": {
            "PF": "NR_POWER_FLOW",
            "short_circuit_sn": "IEC_60909",
            "fault_loop_nn": "FAULT_LOOP_NN",
        }[run.analysis_type],
        "input_hash": run.input_hash,
        "result_hash": _stable_hash(run.result_summary),
        "domain_model_version": snapshot_header.get("enm_version")
        or snapshot_header.get("schema_version")
        or "network_snapshot_v1",
        "bay_contract_version": "V12.5",
        "results_contract_version": "V12.5",
        "proof_renderer_version": "white_box_trace_v1" if run.white_box_trace else "none",
        "catalog_snapshot_ref": snapshot_ref or None,
        "catalog_materialization_ref": _catalog_materialization_ref(
            snapshot_ref,
            catalog_materialization_entries,
            explicit_ref=run.input_snapshot.get("catalog_materialization_ref"),
        ),
        "catalog_materialization_hash": catalog_materialization_hash,
        "catalog_materialization_status": _catalog_materialization_status(
            catalog_materialization_entries,
        ),
        "catalog_materialization_contract_version": str(
            run.input_snapshot.get("catalog_materialization_contract_version")
            or DEFAULT_CATALOG_MATERIALIZATION_CONTRACT_VERSION
        ),
        "catalog_schema_version": "catalog_v1",
        "tolerance_policy_ref": "solver_tolerance/default",
        "rounding_policy_ref": "rounding/default",
        "quality_gate_policy_version": "v12_5_quality_gate",
        "report_contract_version": DEFAULT_REPORT_CONTRACT_VERSION,
        "export_generator_version": "v12_5_export_artifact/1.0",
        "result_rules_version": DEFAULT_RESULT_RULES_VERSION,
        "ruleset_version": DEFAULT_RESULT_RULES_VERSION,
    }


def build_analysis_run_case_context(run: AnalysisRun) -> dict[str, Any]:
    case_kind = {
        "PF": "ROZPLYW_MAX_OBC",
        "short_circuit_sn": "ZWARCIOWY_MAKS",
        "fault_loop_nn": "POMIAROWY_PETLA_ZWARCIA",
    }[run.analysis_type]
    completeness = run.completeness_status or infer_analysis_run_completeness(run)
    quality_gate = (
        "G4" if completeness == "complete" else ("G3" if run.status == "FAILED" else "G2")
    )
    snapshot_ref = run.input_snapshot.get("snapshot_id")
    return {
        "case_ref": str(run.operating_case_id),
        "case_kind": case_kind,
        "rodzaj_przypadku": case_kind,
        "snapshot_ref": str(snapshot_ref) if snapshot_ref is not None else None,
        "variant_ref": None,
        "run_ref": str(run.id),
        "proof_pack_ref": run.proof_pack_ref or f"proof-pack:{run.id}",
        "quality_gate": quality_gate,
        "applicability_scope": {
            "PF": ["PF", "REPORT"],
            "short_circuit_sn": ["SC", "REPORT"],
            "fault_loop_nn": ["NN", "REPORT"],
        }[run.analysis_type],
        "completeness": completeness,
        "completeness_legacy": {
            "complete": "pelny",
            "partial": "czesciowy",
            "failed": "brak",
            "not_applicable": "nie_dotyczy",
        }[completeness],
        "missing_prerequisites": ["run.failed"] if completeness == "failed" else [],
        "assumptions": {},
        "lineage": {
            "project_ref": str(run.project_id),
            "run_ref": str(run.id),
            "analysis_type": run.analysis_type,
            "snapshot_ref": str(snapshot_ref) if snapshot_ref is not None else None,
        },
        "reproducibility": run.reproducibility or build_analysis_run_reproducibility(run),
    }


def new_analysis_run(
    *,
    project_id: UUID,
    operating_case_id: UUID,
    analysis_type: AnalysisType,
    input_snapshot: dict,
    input_hash: str,
) -> AnalysisRun:
    return AnalysisRun(
        id=uuid4(),
        project_id=project_id,
        operating_case_id=operating_case_id,
        analysis_type=analysis_type,
        status="CREATED",
        result_status="VALID",
        input_snapshot=input_snapshot,
        input_hash=input_hash,
    )
