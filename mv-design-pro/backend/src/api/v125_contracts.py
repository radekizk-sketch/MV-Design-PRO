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


# V12K-281 (K13): dwie NAJDROŻSZE, czyste derywacje kontekstu liczone raz per
# niemutowalną treść, nie per wywołanie. Zmierzone na sieci 50 stacji: pełny
# kanoniczny skrót artefaktu wyniku (`_stable_hash(run.raw_result)`) plus
# przejście snapshotu pod wpisy materializacji katalogowej kosztowały ~35 s
# NA KAŻDE wywołanie kontekstu przypadku, a raport woła kontekst dla każdej
# sekcji (~200 s serwera przy raporcie 0,9 MiB). Klucze są bezpieczne z
# konstrukcji: artefakt wyniku jest zapisywany RAZ przy zakończeniu biegu i
# niemutowalny (reguła zamrożonych wyników), a snapshot jest adresowany
# treścią (`snapshot_hash`). Wartości pozostają identyczne — pamięć podręczna
# eliminuje wyłącznie powtórne przeliczanie tej samej treści.
_RESULT_HASH_CACHE: dict[tuple[str, str, str], str | None] = {}
_MATERIALIZATION_CACHE: dict[str, tuple[list[dict[str, Any]], str | None]] = {}
_CONTEXT_CACHE_MAX = 16


def _result_hash_for_run(run: CanonicalRun) -> str | None:
    if run.raw_result is None:
        return None
    key = (str(run.id), str(run.finished_at or ""), str(run.result_status))
    if key not in _RESULT_HASH_CACHE:
        if len(_RESULT_HASH_CACHE) >= _CONTEXT_CACHE_MAX:
            _RESULT_HASH_CACHE.pop(next(iter(_RESULT_HASH_CACHE)))
        _RESULT_HASH_CACHE[key] = _stable_hash(run.raw_result)
    return _RESULT_HASH_CACHE[key]


def _materialization_for_run(run: CanonicalRun) -> tuple[list[dict[str, Any]], str | None]:
    key = _snapshot_ref(run)
    if not key:
        entries = _catalog_materialization_entries(run.snapshot or {})
        return entries, (_stable_hash(entries) if entries else None)
    if key not in _MATERIALIZATION_CACHE:
        if len(_MATERIALIZATION_CACHE) >= _CONTEXT_CACHE_MAX:
            _MATERIALIZATION_CACHE.pop(next(iter(_MATERIALIZATION_CACHE)))
        entries = _catalog_materialization_entries(run.snapshot or {})
        _MATERIALIZATION_CACHE[key] = (entries, _stable_hash(entries) if entries else None)
    return _MATERIALIZATION_CACHE[key]


def _snapshot_header(run: CanonicalRun) -> dict[str, Any]:
    header = (run.snapshot or {}).get("header") or {}
    return header if isinstance(header, dict) else {}


def _snapshot_ref(run: CanonicalRun) -> str:
    header = _snapshot_header(run)
    return str(run.snapshot_hash or header.get("hash_sha256") or "")


def _option_or_header(
    run: CanonicalRun,
    key: str,
    *,
    default: str | None = None,
) -> str | None:
    value = run.options.get(key) if isinstance(run.options, dict) else None
    if value is None:
        value = _snapshot_header(run).get(key)
    if value is None:
        return default
    return str(value)


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
    run: CanonicalRun,
    entries: list[dict[str, Any]],
) -> str:
    explicit = _option_or_header(run, "catalog_materialization_ref")
    if explicit:
        return explicit

    entries_hash = _stable_hash(entries) if entries else None
    if entries_hash:
        return f"catalog-materialization:{entries_hash}"
    return f"catalog-materialization:not-materialized:{_snapshot_ref(run)}"


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
    snapshot_header = _snapshot_header(run)
    snapshot_ref = _snapshot_ref(run)
    catalog_materialization_entries, catalog_materialization_hash = _materialization_for_run(run)
    solver_family = {
        "PF": "power_flow_newton",
        "short_circuit_sn": "iec60909_short_circuit",
        "phase_state_sn": "phase_state_sn_radial",
        "dynamic_stability": "dynamic_stability_fault_clear",
        "source_compliance": "source_compliance_profile_match",
    }.get(run.analysis_type, run.analysis_type)
    solver_version = (
        ((run.power_flow_trace or {}).get("solver_version"))
        or run.options.get("solver_version")
        or "1.0.0"
    )
    formula_set_version = {
        "PF": "pf_result_v1",
        "short_circuit_sn": "iec60909_v1",
        "phase_state_sn": "phase_state_sn_v1",
        "dynamic_stability": "dynamic_stability_fault_clear_v1",
        "source_compliance": "source_compliance_v1",
    }.get(run.analysis_type, "canonical_run_v1")
    standard_basis_ref = {
        "PF": "NR_POWER_FLOW",
        "short_circuit_sn": "IEC_60909",
        "phase_state_sn": "PHASE_STATE_SN_RADIAL_V1",
        "dynamic_stability": "DYNAMIC_STABILITY_FAULT_CLEAR_V1",
        "source_compliance": "SOURCE_COMPLIANCE_PROFILE_V1",
    }.get(run.analysis_type, "CANONICAL_ANALYSIS")
    variant_ref = _option_or_header(
        run,
        "variant_ref",
        default=DEFAULT_OPERATING_VARIANT_REF,
    )
    switching_snapshot_ref = (
        _option_or_header(run, "switching_snapshot_ref")
        or _option_or_header(run, "switching_state_ref")
        or DEFAULT_SWITCHING_SNAPSHOT_REF
    )
    return {
        "case_ref": run.case_id,
        "analysis_case_ref": run.case_id,
        "snapshot_ref": snapshot_ref,
        "enm_hash": snapshot_ref,
        "enm_snapshot_ref": _option_or_header(run, "enm_snapshot_ref", default=snapshot_ref),
        "enm_projection_version": _option_or_header(
            run,
            "enm_projection_version",
            default=DEFAULT_ENM_PROJECTION_VERSION,
        ),
        "variant_ref": variant_ref,
        "operating_variant_ref": variant_ref,
        "switching_snapshot_ref": switching_snapshot_ref,
        "solver_family": solver_family,
        "solver_version": solver_version,
        "method_version": run.options.get("method_version") or "canonical_run_v1",
        "formula_set_version": run.options.get("formula_set_version") or formula_set_version,
        "standard_basis_ref": run.options.get("standard_basis_ref") or standard_basis_ref,
        "input_hash": run.input_hash,
        "result_hash": _result_hash_for_run(run),
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
        or snapshot_ref,
        "catalog_materialization_ref": _catalog_materialization_ref(
            run,
            catalog_materialization_entries,
        ),
        "catalog_materialization_hash": catalog_materialization_hash,
        "catalog_materialization_status": _catalog_materialization_status(
            catalog_materialization_entries,
        ),
        "catalog_materialization_contract_version": run.options.get(
            "catalog_materialization_contract_version"
        )
        or DEFAULT_CATALOG_MATERIALIZATION_CONTRACT_VERSION,
        "catalog_schema_version": run.options.get("catalog_schema_version")
        or DEFAULT_CATALOG_SCHEMA_VERSION,
        "tolerance_policy_ref": run.options.get("tolerance_policy_ref")
        or DEFAULT_TOLERANCE_POLICY_REF,
        "rounding_policy_ref": run.options.get("rounding_policy_ref")
        or DEFAULT_ROUNDING_POLICY_REF,
        "quality_gate_policy_version": run.options.get("quality_gate_policy_version")
        or DEFAULT_QUALITY_GATE_POLICY_VERSION,
        "report_contract_version": run.options.get("report_contract_version")
        or DEFAULT_REPORT_CONTRACT_VERSION,
        "export_generator_version": DEFAULT_EXPORT_GENERATOR_VERSION,
        "result_rules_version": run.options.get("result_rules_version")
        or DEFAULT_RESULT_RULES_VERSION,
        "ruleset_version": run.options.get("ruleset_version") or DEFAULT_RESULT_RULES_VERSION,
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
    result_hash = _result_hash_for_run(run)
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
