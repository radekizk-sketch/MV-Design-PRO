"""Serwis aplikacyjny: walidacja energetyczna wyniku rozpływu mocy.

Warstwa APPLICATION (mapowanie, NIE fizyka). Odczytuje GOTOWY wynik przebiegu
rozpływu (``PF``) — napięcia, prądy i moce gałęzi oraz bilans węzła slack —
odtwarza zamrożony ``PowerFlowResult`` (analysis) oraz graf sieci ze snapshotu i
deleguje ocenę do gotowego buildera ``analysis.energy_validation``. ZERO fizyki
— wszystkie wielkości pochodzą z solvera power-flow, graf z deterministycznego
mapowania ENM→NetworkGraph.

Odwzorowania (plik:linia w kodzie źródłowym):
- ``branch_current_ka`` ← ``raw_result.branch_current_ka`` (klucz = id gałęzi grafu),
- ``node_voltage_kv`` ← ``raw_result.node_voltage_kv``,
- ``branch_s_from_mva``/``branch_s_to_mva`` ← ``result_v1.branch_results``
  (``p_from_mw``/``q_from_mvar`` itd. → wartość zespolona MVA),
- ``losses_total_pu``/``slack_power_pu`` ← ``result_v1.summary`` (MW/Mvar → p.u.
  przez ``base_mva``),
- graf (LineBranch/TransformerBranch, prądy/moce znamionowe) ←
  ``map_enm_to_network_graph(EnergyNetworkModel.model_validate(run.snapshot))``.
"""

from __future__ import annotations

from typing import Any

from analysis.energy_validation.builder import EnergyValidationBuilder
from analysis.energy_validation.models import (
    EnergyValidationConfig,
    EnergyValidationContext,
)
from analysis.power_flow.result import PowerFlowResult
from enm.canonical_analysis import CanonicalRun
from enm.mapping import map_enm_to_network_graph
from enm.models import EnergyNetworkModel
from network_model.core.graph import NetworkGraph


def _reconstruct_power_flow_result(run: CanonicalRun) -> PowerFlowResult:
    """Odtwórz zamrożony ``PowerFlowResult`` z zapisanego wyniku przebiegu.

    Klucze gałęzi/węzłów są identyczne z tymi, których użył solver (ten sam
    deterministyczny graf ENM→NetworkGraph), więc dopasowują się do grafu
    odtworzonego w ``_graph``.
    """
    raw_result = run.raw_result or {}
    result_v1 = raw_result.get("result_v1") or {}
    base_mva = float(result_v1.get("base_mva", 100.0)) or 100.0
    branch_results = result_v1.get("branch_results", [])
    summary = result_v1.get("summary", {})

    branch_s_from_mva = {
        str(row["branch_id"]): complex(
            float(row.get("p_from_mw", 0.0)), float(row.get("q_from_mvar", 0.0))
        )
        for row in branch_results
    }
    branch_s_to_mva = {
        str(row["branch_id"]): complex(
            float(row.get("p_to_mw", 0.0)), float(row.get("q_to_mvar", 0.0))
        )
        for row in branch_results
    }
    losses_total_pu = (
        complex(
            float(summary.get("total_losses_p_mw", 0.0)),
            float(summary.get("total_losses_q_mvar", 0.0)),
        )
        / base_mva
    )
    slack_power_pu = (
        complex(
            float(summary.get("slack_p_mw", 0.0)),
            float(summary.get("slack_q_mvar", 0.0)),
        )
        / base_mva
    )
    node_voltage_kv = {
        str(node_id): float(value)
        for node_id, value in (raw_result.get("node_voltage_kv") or {}).items()
        if value is not None
    }
    branch_current_ka = {
        str(branch_id): float(value)
        for branch_id, value in (raw_result.get("branch_current_ka") or {}).items()
        if value is not None
    }
    return PowerFlowResult(
        converged=bool(result_v1.get("converged", False)),
        iterations=int(result_v1.get("iterations_count", 0)),
        tolerance=float(result_v1.get("tolerance_used", 0.0)),
        max_mismatch_pu=0.0,
        base_mva=base_mva,
        slack_node_id=str(result_v1.get("slack_bus_id", "")),
        node_voltage_kv=node_voltage_kv,
        branch_current_ka=branch_current_ka,
        branch_s_from_mva=branch_s_from_mva,
        branch_s_to_mva=branch_s_to_mva,
        losses_total_pu=losses_total_pu,
        slack_power_pu=slack_power_pu,
    )


def _graph(run: CanonicalRun) -> NetworkGraph:
    enm = EnergyNetworkModel.model_validate(run.snapshot or {})
    return map_enm_to_network_graph(enm)


def _context(run: CanonicalRun) -> EnergyValidationContext:
    header = (run.snapshot or {}).get("header") or {}
    return EnergyValidationContext(
        project_name=str(header.get("name")) if header.get("name") else None,
        case_name=None,
        case_id=str(run.case_id) if run.case_id else None,
        run_timestamp=run.created_at,
        snapshot_hash=run.snapshot_hash,
        run_id=str(run.id),
    )


def build_energy_validation_view(run: CanonicalRun) -> dict[str, Any]:
    """Zbuduj widok walidacji energetycznej dla przebiegu rozpływu.

    Raises:
        ValueError: gdy przebieg nie jest rozpływem (``PF``) lub nie został
            zakończony — komunikat w języku polskim.
    """
    if run.analysis_type != "PF":
        raise ValueError(
            "Walidacja energetyczna wymaga przebiegu rozpływu mocy; "
            f"otrzymano rodzaj analizy: {run.analysis_type}."
        )
    if run.status != "FINISHED":
        raise ValueError(
            f"Przebieg {run.id} nie jest zakończony (status={run.status}); "
            "wynik rozpływu mocy nie jest dostępny."
        )

    view = EnergyValidationBuilder(context=_context(run)).build(
        _reconstruct_power_flow_result(run),
        _graph(run),
        EnergyValidationConfig(),
    )
    return view.to_dict()
