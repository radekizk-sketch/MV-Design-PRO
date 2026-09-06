from __future__ import annotations

from typing import Any

from api.v125_contracts import (
    build_analysis_case_reproducibility,
    infer_completeness_status,
    legacy_completeness_label,
    resolve_proof_pack_ref,
)
from enm.canonical_analysis import CanonicalRun
from enm.severity import is_failed_status


def _infer_case_kind(run: CanonicalRun) -> str:
    explicit = str(run.options.get("case_kind") or "").strip()
    if explicit:
        return explicit
    if run.analysis_type == "PF":
        return "ROZPLYW_MAX_OBC"
    if run.analysis_type == "short_circuit_sn":
        return "ZWARCIOWY_MAKS"
    if run.analysis_type == "phase_state_sn":
        return "STAN_FAZOWY_SN"
    if run.analysis_type == "dynamic_stability":
        return "PRACA_PO_ZAKLOCENIU"
    if run.analysis_type == "source_compliance":
        return "ZGODNOSC_PRZYLACZENIOWA"
    return "RAPORTOWY_BAZOWY"


def _infer_quality_gate(run: CanonicalRun) -> str:
    validation_status = str((run.validation or {}).get("status") or "").upper()
    blockers = len((run.readiness or {}).get("blockers") or [])

    if is_failed_status(validation_status):
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
    if run.analysis_type == "phase_state_sn":
        return ["PHASE_STATE_SN", "REPORT"]
    if run.analysis_type == "dynamic_stability":
        return ["DYNAMIC_STABILITY", "AUTOMATION", "REPORT"]
    if run.analysis_type == "source_compliance":
        return ["SOURCE_COMPLIANCE", "REPORT"]
    return ["REPORT"]


def _build_assumptions(run: CanonicalRun) -> dict[str, Any]:
    options = run.options or {}
    return {
        "source_assumptions_ref": options.get("source_assumptions_ref")
        or (
            "sc_source_max"
            if run.analysis_type == "short_circuit_sn"
            else (
                "phase_state_source_snapshot"
                if run.analysis_type == "phase_state_sn"
                else (
                    "dynamic_fault_source_state"
                    if run.analysis_type == "dynamic_stability"
                    else (
                        "source_profile_snapshot"
                        if run.analysis_type == "source_compliance"
                        else "pf_source_nominal"
                    )
                )
            )
        ),
        "load_assumptions_ref": options.get("load_assumptions_ref")
        or (
            "pf_load_max"
            if run.analysis_type == "PF"
            else (
                "phase_state_load_snapshot"
                if run.analysis_type == "phase_state_sn"
                else "sc_load_snapshot"
            )
        ),
        # CV-2 (H3): brak jawnej migawki lacznikowej = `None`, nie etykieta
        # „snapshot_switching_state" udajaca referencje (stan lacznikow biegu
        # kanonicznego JEST w migawce biegu — `CanonicalRun.snapshot`).
        "switching_state_ref": options.get("switching_state_ref"),
        "grounding_assumptions_ref": options.get("grounding_assumptions_ref")
        or "network_grounding_snapshot",
        "temperature_assumptions_ref": options.get("temperature_assumptions_ref")
        or ("temperature_operating" if run.analysis_type == "PF" else "temperature_short_circuit"),
        "transformer_tap_assumptions_ref": options.get("transformer_tap_assumptions_ref")
        or ("oltc_active" if run.analysis_type == "PF" else "tap_frozen"),
        "ibg_assumptions_ref": options.get("ibg_assumptions_ref") or "ibg_model_snapshot",
    }


def _rewizja_modelu(run: CanonicalRun) -> int | None:
    """Rewizja modelu z naglowka snapshotu biegu — bez zgadywania (V12K-264)."""
    snapshot = run.snapshot or {}
    header = snapshot.get("header") if isinstance(snapshot, dict) else None
    if not isinstance(header, dict):
        return None
    rewizja = header.get("revision")
    return rewizja if isinstance(rewizja, int) else None


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
        # V12K-264: LICZBOWA rewizja modelu, na ktorej policzono bieg — pole
        # ADDYTYWNE, brane WPROST z naglowka snapshotu biegu (zero wyliczen).
        #
        # DLACZEGO TO BLOKOWALO CALY LANCUCH SWIEZOSCI. Kontrakt wynikow niosl
        # tylko `snapshot_ref` (hash) i `result_status` (enum), wiec zaden ekran
        # analizy nie mial LICZBY do porownania z `header.revision` modelu.
        # `zwarciaModel.ts` i `rozplywAdapter.ts` opisuja to wprost i POMIJAJA
        # znacznik swiezosci — a mapowanie enum→liczba byloby zgadywaniem. Bez tego
        # pola `FreshnessBadge` nie pokazywal sie NIGDY, mimo ze istnial.
        #
        # Starszy bieg bez rewizji w snapshotcie → `None` (uczciwy brak; konsument
        # pomija znacznik, tak jak dotad, zamiast dostac zmyslona liczbe).
        "rewizja_modelu": _rewizja_modelu(run),
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
