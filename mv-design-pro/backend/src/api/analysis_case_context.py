from __future__ import annotations

from typing import Any

from api.v125_contracts import (
    build_analysis_case_reproducibility,
    infer_completeness_status,
    legacy_completeness_label,
    resolve_proof_pack_ref,
)
from enm.canonical_analysis import CanonicalRun


def _infer_case_kind(run: CanonicalRun) -> str:
    explicit = str(run.options.get("case_kind") or "").strip()
    if explicit:
        return explicit
    if run.analysis_type == "PF":
        return "ROZPLYW_MAX_OBC"
    if run.analysis_type == "short_circuit_sn":
        return "ZWARCIOWY_MAKS"
    return "RAPORTOWY_BAZOWY"


def _infer_quality_gate(run: CanonicalRun) -> str:
    validation_status = str((run.validation or {}).get("status") or "").upper()
    blockers = len((run.readiness or {}).get("blockers") or [])

    if validation_status == "FAIL":
        return "G0"
    if blockers > 0:
        return "G1"
    if run.status != "FINISHED":
        return "G2"
    if run.result_status != "VALID":
        return "G3"
    return "G4"


def _infer_applicability_scope(run: CanonicalRun) -> list[str]:
    if run.analysis_type == "PF":
        return ["PF", "REPORT"]
    if run.analysis_type == "short_circuit_sn":
        return ["SC", "REPORT"]
    return ["REPORT"]


def _build_assumptions(run: CanonicalRun) -> dict[str, Any]:
    options = run.options or {}
    return {
        "source_assumptions_ref": options.get("source_assumptions_ref")
        or ("sc_source_max" if run.analysis_type == "short_circuit_sn" else "pf_source_nominal"),
        "load_assumptions_ref": options.get("load_assumptions_ref")
        or ("pf_load_max" if run.analysis_type == "PF" else "sc_load_snapshot"),
        "switching_state_ref": options.get("switching_state_ref") or "snapshot_switching_state",
        "grounding_assumptions_ref": options.get("grounding_assumptions_ref")
        or "network_grounding_snapshot",
        "temperature_assumptions_ref": options.get("temperature_assumptions_ref")
        or ("temperature_operating" if run.analysis_type == "PF" else "temperature_short_circuit"),
        "transformer_tap_assumptions_ref": options.get("transformer_tap_assumptions_ref")
        or ("oltc_active" if run.analysis_type == "PF" else "tap_frozen"),
        "ibg_assumptions_ref": options.get("ibg_assumptions_ref") or "ibg_model_snapshot",
    }


def build_analysis_case_context(run: CanonicalRun) -> dict[str, Any]:
    case_kind = _infer_case_kind(run)
    completeness_status = infer_completeness_status(run)
    blockers = (run.readiness or {}).get("blockers") or []
    missing_prerequisites = [
        str(blocker.get("code") or blocker.get("message_pl") or "unknown")
        for blocker in blockers
        if isinstance(blocker, dict)
    ]
    return {
        "case_ref": run.case_id,
        "case_kind": case_kind,
        "rodzaj_przypadku": case_kind,
        "snapshot_ref": run.snapshot_hash,
        "variant_ref": run.options.get("variant_ref"),
        "run_ref": str(run.id),
        "proof_pack_ref": resolve_proof_pack_ref(run),
        "quality_gate": _infer_quality_gate(run),
        "applicability_scope": _infer_applicability_scope(run),
        "completeness": completeness_status,
        "completeness_legacy": legacy_completeness_label(completeness_status),
        "missing_prerequisites": missing_prerequisites,
        "assumptions": _build_assumptions(run),
        "lineage": {
            "project_ref": run.project_id,
            "run_ref": str(run.id),
            "analysis_type": run.analysis_type,
            "snapshot_ref": run.snapshot_hash,
        },
        "reproducibility": build_analysis_case_reproducibility(run),
    }
