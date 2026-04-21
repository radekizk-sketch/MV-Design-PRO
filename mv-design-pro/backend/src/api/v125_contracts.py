from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from typing import Any, Literal

from enm.canonical_analysis import CanonicalRun

CanonicalCompletenessStatus = Literal["complete", "partial", "failed", "not_applicable"]
ExportArtifactKind = Literal["pdf", "docx", "csv", "xlsx", "json", "whitebox_package"]

DEFAULT_RESULTS_CONTRACT_VERSION = "V12.5"
DEFAULT_BAY_CONTRACT_VERSION = "V12.5"
DEFAULT_PROOF_RENDERER_VERSION = "white_box_trace_v1"
DEFAULT_CATALOG_SCHEMA_VERSION = "catalog_v1"
DEFAULT_TOLERANCE_POLICY_REF = "solver_tolerance/default"
DEFAULT_ROUNDING_POLICY_REF = "rounding/default"
DEFAULT_QUALITY_GATE_POLICY_VERSION = "v12_5_quality_gate"
DEFAULT_EXPORT_GENERATOR_VERSION = "v12_5_export_artifact/1.0"

EXPORT_POLICY_MATRIX: dict[ExportArtifactKind, dict[str, Any]] = {
    "pdf": {
        "allows_partial": True,
        "partial_rendering": "warning_block",
        "not_applicable_rendering": "label",
        "null_rendering": "dash",
        "requires_confirmation": True,
        "carries_analysis_case_context": True,
        "carries_proof_pack_ref": True,
        "carries_result_hash": True,
        "carries_input_hash": True,
        "carries_generated_at": True,
        "carries_generated_by_version": True,
    },
    "docx": {
        "allows_partial": True,
        "partial_rendering": "warning_block",
        "not_applicable_rendering": "label",
        "null_rendering": "dash",
        "requires_confirmation": True,
        "carries_analysis_case_context": True,
        "carries_proof_pack_ref": True,
        "carries_result_hash": True,
        "carries_input_hash": True,
        "carries_generated_at": True,
        "carries_generated_by_version": True,
    },
    "csv": {
        "allows_partial": False,
        "partial_rendering": "blocked",
        "not_applicable_rendering": "empty_cell",
        "null_rendering": "empty_cell",
        "requires_confirmation": False,
        "carries_analysis_case_context": True,
        "carries_proof_pack_ref": False,
        "carries_result_hash": True,
        "carries_input_hash": True,
        "carries_generated_at": True,
        "carries_generated_by_version": True,
    },
    "xlsx": {
        "allows_partial": True,
        "partial_rendering": "worksheet_warning",
        "not_applicable_rendering": "label",
        "null_rendering": "empty_cell",
        "requires_confirmation": True,
        "carries_analysis_case_context": True,
        "carries_proof_pack_ref": True,
        "carries_result_hash": True,
        "carries_input_hash": True,
        "carries_generated_at": True,
        "carries_generated_by_version": True,
    },
    "json": {
        "allows_partial": True,
        "partial_rendering": "status_field",
        "not_applicable_rendering": "status_field",
        "null_rendering": "null",
        "requires_confirmation": False,
        "carries_analysis_case_context": True,
        "carries_proof_pack_ref": True,
        "carries_result_hash": True,
        "carries_input_hash": True,
        "carries_generated_at": True,
        "carries_generated_by_version": True,
    },
    "whitebox_package": {
        "allows_partial": True,
        "partial_rendering": "status_field",
        "not_applicable_rendering": "status_field",
        "null_rendering": "null",
        "requires_confirmation": False,
        "carries_analysis_case_context": True,
        "carries_proof_pack_ref": True,
        "carries_result_hash": True,
        "carries_input_hash": True,
        "carries_generated_at": True,
        "carries_generated_by_version": True,
    },
}


def _canonicalize(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _canonicalize(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [_canonicalize(item) for item in value]
    if isinstance(value, tuple):
        return [_canonicalize(item) for item in value]
    return value


def _stable_hash(value: Any) -> str | None:
    if value is None:
        return None
    canonical = json.dumps(
        _canonicalize(value), ensure_ascii=False, sort_keys=True, separators=(",", ":")
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def infer_completeness_status(run: CanonicalRun) -> CanonicalCompletenessStatus:
    explicit = str(run.options.get("completeness_status") or "").strip().lower()
    if explicit in {"complete", "partial", "failed", "not_applicable"}:
        return explicit  # type: ignore[return-value]
    if bool(run.options.get("not_applicable")):
        return "not_applicable"
    if run.status == "FAILED":
        return "failed"
    if run.status != "FINISHED" or run.raw_result is None:
        return "partial"
    if run.result_status != "VALID":
        return "partial"
    blockers = (run.readiness or {}).get("blockers") or []
    if blockers:
        return "partial"
    return "complete"


def legacy_completeness_label(status: CanonicalCompletenessStatus) -> str:
    return {
        "complete": "pelny",
        "partial": "czesciowy",
        "failed": "brak",
        "not_applicable": "nie_dotyczy",
    }[status]


def resolve_proof_pack_ref(run: CanonicalRun) -> str:
    explicit = str(run.options.get("proof_pack_ref") or "").strip()
    if explicit:
        return explicit
    return f"proof-pack:{run.id}"


def build_analysis_case_reproducibility(run: CanonicalRun) -> dict[str, Any]:
    snapshot_header = (run.snapshot or {}).get("header") or {}
    solver_family = "power_flow_newton" if run.analysis_type == "PF" else "iec60909_short_circuit"
    solver_version = (
        ((run.power_flow_trace or {}).get("solver_version"))
        or run.options.get("solver_version")
        or "1.0.0"
    )
    return {
        "solver_family": solver_family,
        "solver_version": solver_version,
        "method_version": run.options.get("method_version") or "canonical_run_v1",
        "formula_set_version": run.options.get("formula_set_version")
        or ("pf_result_v1" if run.analysis_type == "PF" else "iec60909_v1"),
        "standard_basis_ref": run.options.get("standard_basis_ref")
        or ("NR_POWER_FLOW" if run.analysis_type == "PF" else "IEC_60909"),
        "input_hash": run.input_hash,
        "result_hash": _stable_hash(run.raw_result),
        "domain_model_version": snapshot_header.get("enm_version")
        or snapshot_header.get("schema_version")
        or "ENM/1.0",
        "bay_contract_version": run.options.get("bay_contract_version")
        or DEFAULT_BAY_CONTRACT_VERSION,
        "results_contract_version": run.options.get("results_contract_version")
        or DEFAULT_RESULTS_CONTRACT_VERSION,
        "proof_renderer_version": run.options.get("proof_renderer_version")
        or DEFAULT_PROOF_RENDERER_VERSION,
        "catalog_snapshot_ref": run.options.get("catalog_snapshot_ref")
        or snapshot_header.get("catalog_snapshot_ref")
        or run.snapshot_hash,
        "catalog_schema_version": run.options.get("catalog_schema_version")
        or DEFAULT_CATALOG_SCHEMA_VERSION,
        "tolerance_policy_ref": run.options.get("tolerance_policy_ref")
        or DEFAULT_TOLERANCE_POLICY_REF,
        "rounding_policy_ref": run.options.get("rounding_policy_ref")
        or DEFAULT_ROUNDING_POLICY_REF,
        "quality_gate_policy_version": run.options.get("quality_gate_policy_version")
        or DEFAULT_QUALITY_GATE_POLICY_VERSION,
    }


def build_export_policy(export_kind: ExportArtifactKind) -> dict[str, Any]:
    return dict(EXPORT_POLICY_MATRIX[export_kind])


def build_export_artifact(
    run: CanonicalRun,
    *,
    export_kind: ExportArtifactKind,
    generated_at: datetime | None = None,
) -> dict[str, Any]:
    generated_at_value = (generated_at or datetime.now(UTC)).isoformat()
    completeness_status = infer_completeness_status(run)
    result_hash = _stable_hash(run.raw_result)
    proof_pack_ref = resolve_proof_pack_ref(run)
    lineage = {
        "run_ref": str(run.id),
        "analysis_case_ref": run.case_id,
        "analysis_type": run.analysis_type,
        "snapshot_ref": run.snapshot_hash,
        "proof_pack_ref": proof_pack_ref,
        "input_hash": run.input_hash,
        "result_hash": result_hash,
    }
    payload = {
        "analysis_case_ref": run.case_id,
        "export_kind": export_kind,
        "generated_at": generated_at_value,
        "generated_by_version": DEFAULT_EXPORT_GENERATOR_VERSION,
        "input_hash": run.input_hash,
        "proof_pack_ref": proof_pack_ref,
        "result_hash": result_hash,
        "run_ref": str(run.id),
        "snapshot_ref": run.snapshot_hash,
        "analysis_type": run.analysis_type,
        "lineage": lineage,
    }
    export_ref = hashlib.sha256(
        json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode(
            "utf-8"
        )
    ).hexdigest()
    return {
        "export_ref": export_ref,
        "export_kind": export_kind,
        "analysis_case_ref": run.case_id,
        "run_ref": str(run.id),
        "proof_pack_ref": proof_pack_ref,
        "result_hash": result_hash,
        "input_hash": run.input_hash,
        "generated_at": generated_at_value,
        "generated_by_version": DEFAULT_EXPORT_GENERATOR_VERSION,
        "completeness_status": completeness_status,
        "lineage": lineage,
    }
