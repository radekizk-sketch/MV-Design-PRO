"""
Short-Circuit Result → ResultSet v1 Mapper — PR-18

Maps the frozen ShortCircuitResult from the IEC 60909 solver to the
canonical ResultSet v1 domain model (PR-14/PR-15).

INVARIANTS:
- Deterministic: identical solver output → identical ResultSet + signature
- Per-element results sorted by element_ref (guaranteed by build_result_set)
- No physics calculations — pure data mapping
- No modification of the solver result
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from analysis.sanity_bounds import evaluate_short_circuit_current
from application.solvers.short_circuit_binding import ShortCircuitBindingResult
from domain.execution import (
    ElementResult,
    ExecutionAnalysisType,
    ResultSet,
    build_result_set,
)
from network_model.core.graph import NetworkGraph


def map_short_circuit_to_resultset_v1(
    *,
    binding_result: ShortCircuitBindingResult,
    run_id: UUID,
    graph: NetworkGraph,
    validation_snapshot: dict[str, Any],
    readiness_snapshot: dict[str, Any],
    enm_ref_id_map: dict[str, str] | None = None,
) -> ResultSet:
    """
    Map a ShortCircuitBindingResult to a canonical ResultSet v1.

    Args:
        binding_result: Result from the short-circuit binding adapter.
        run_id: UUID of the Run this result belongs to.
        graph: NetworkGraph used for the calculation (for element enumeration).
        validation_snapshot: Validation state at run time.
        readiness_snapshot: Readiness state at run time.
        enm_ref_id_map: Optional UUID→ref_id mapping from ENM (V12S-011).
            When provided, element_ref_id is populated on each ElementResult
            so the frontend can resolve results without a reverse UUID lookup.

    Returns:
        Immutable ResultSet with deterministic signature.
    """
    sr = binding_result.solver_result

    # Build per-element results: one entry for the fault node
    element_results = _build_element_results(sr, graph, enm_ref_id_map or {})

    # Build global results from the solver output
    global_results = _build_global_results(sr, binding_result.analysis_type)
    # Karta P0.3: scenario/override/temperature-correction are BINDING-layer
    # metadata (ShortCircuitBindingResult), never part of the FROZEN solver
    # result — added here as additive ResultSet v1 "meta" keys (contract has
    # additionalProperties:true; older results without these keys are
    # unaffected).
    global_results["scenario"] = binding_result.scenario
    global_results["c_factor_auto"] = float(binding_result.c_factor_auto)
    global_results["c_factor_override"] = bool(binding_result.c_factor_override)
    if binding_result.temperature_correction_notes:
        global_results["temperature_correction_notes"] = list(
            binding_result.temperature_correction_notes
        )

    return build_result_set(
        run_id=run_id,
        analysis_type=binding_result.analysis_type,
        validation_snapshot=validation_snapshot,
        readiness_snapshot=readiness_snapshot,
        element_results=element_results,
        global_results=global_results,
    )


def _build_element_results(
    sr: Any,
    graph: NetworkGraph,
    enm_ref_id_map: dict[str, str],
) -> list[ElementResult]:
    """Build per-element results from the solver result.

    The primary result is for the fault node. Contributions from
    sources and branches (if available) are also included.

    enm_ref_id_map maps UUID → ENM ref_id for V12S-011 element_ref_id population.
    """
    results: list[ElementResult] = []

    # Fault node result
    results.append(
        ElementResult(
            element_ref=sr.fault_node_id,
            element_type="bus",
            values={
                "ikss_a": float(sr.ikss_a),
                "ip_a": float(sr.ip_a),
                "ith_a": float(sr.ith_a),
                "ib_a": float(sr.ib_a),
                "sk_mva": float(sr.sk_mva),
                "ik_thevenin_a": float(sr.ik_thevenin_a),
                "ik_inverters_a": float(sr.ik_inverters_a),
                "ik_total_a": float(sr.ik_total_a),
                "kappa": float(sr.kappa),
                "rx_ratio": float(sr.rx_ratio),
            },
            element_ref_id=enm_ref_id_map.get(sr.fault_node_id),
        )
    )

    # Source contributions as element results
    for contrib in sr.contributions:
        results.append(
            ElementResult(
                element_ref=contrib.source_id,
                element_type="source_contribution",
                values={
                    "i_contrib_a": float(contrib.i_contrib_a),
                    "share": float(contrib.share),
                    "source_type": contrib.source_type.value,
                },
                element_ref_id=enm_ref_id_map.get(contrib.source_id),
            )
        )

    # Branch contributions (if computed)
    if sr.branch_contributions:
        for bc in sr.branch_contributions:
            results.append(
                ElementResult(
                    element_ref=f"{bc.source_id}:{bc.branch_id}",
                    element_type="branch_contribution",
                    values={
                        "source_id": bc.source_id,
                        "branch_id": bc.branch_id,
                        "i_contrib_a": float(bc.i_contrib_a),
                        "direction": bc.direction,
                    },
                    element_ref_id=enm_ref_id_map.get(bc.branch_id),
                )
            )

    return results


def _build_global_results(
    sr: Any,
    analysis_type: ExecutionAnalysisType,
) -> dict[str, Any]:
    """Build global results dict from solver output."""
    zkk_ohm = sr.zkk_ohm
    # D-14b (DEF-01 / K-08): guard sanity-bounds Ik'' per poziom napięcia, wpięty na
    # ścieżce konsumpcji wyników (overlay/proof/tabele czytają global_results — jedna
    # prawda, Z15). Czyta zamrożony wynik (un_v, ikss_a), nie modyfikuje solvera (B-01).
    ikss_sanity = evaluate_short_circuit_current(
        float(sr.un_v) / 1000.0 if sr.un_v else None,
        float(sr.ikss_a) / 1000.0,
    ).to_dict()
    global_results: dict[str, Any] = {
        "analysis_type": analysis_type.value,
        "short_circuit_type": sr.short_circuit_type.value,
        "fault_node_id": sr.fault_node_id,
        "c_factor": float(sr.c_factor),
        "un_v": float(sr.un_v),
        "zkk_ohm": {"re": float(zkk_ohm.real), "im": float(zkk_ohm.imag)},
        "tk_s": float(sr.tk_s),
        "tb_s": float(sr.tb_s),
        "ikss_a": float(sr.ikss_a),
        "ip_a": float(sr.ip_a),
        "ith_a": float(sr.ith_a),
        "ib_a": float(sr.ib_a),
        "sk_mva": float(sr.sk_mva),
        "ik_thevenin_a": float(sr.ik_thevenin_a),
        "ik_inverters_a": float(sr.ik_inverters_a),
        "ik_total_a": float(sr.ik_total_a),
        "kappa": float(sr.kappa),
        "rx_ratio": float(sr.rx_ratio),
        "contributions_count": len(sr.contributions),
        "white_box_steps_count": len(sr.white_box_trace),
        "ikss_sanity": ikss_sanity,
    }
    # Delta FROZEN V12K-128 (addytywnie): składowe symetryczne Z1/Z2/Z0 wprost
    # z wyniku solvera. Dołączane tylko gdy policzone (Z1/Z2 dla wszystkich typów,
    # Z0 dla zwarć doziemnych 1F/2F+G). `global_results` ma additionalProperties:true
    # (kontrakt ResultSet v1) — pole addytywne, starszy wynik bez pól → pominięte.
    for seq_key in ("z1_ohm", "z2_ohm", "z0_ohm"):
        seq_val = getattr(sr, seq_key, None)
        if seq_val is not None:
            global_results[seq_key] = {"re": float(seq_val.real), "im": float(seq_val.imag)}
    return global_results
