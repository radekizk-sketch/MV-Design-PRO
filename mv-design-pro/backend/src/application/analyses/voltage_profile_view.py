"""Serwis aplikacyjny: profil napięć (BUS-centric) + dekompozycja ΔU per
odcinek na przebiegu rozpływu mocy (karta P0.4, nN).

Warstwa APPLICATION (mapowanie, NIE fizyka). Odczytuje GOTOWY wynik przebiegu
rozpływu (``PF``) i deleguje budowę widoku do gotowych builderów warstwy
ANALIZA:

1. ``analysis.voltage_profile.builder.VoltageProfileBuilder`` — profil per
   szyna z progami normatywnymi (istniejący, P21),
2. ``analysis.voltage_profile.segment_decomposition`` — dekompozycja ΔU per
   odcinek wzdłuż ścieżki źródło (SLACK)→węzeł (P0.4, nN); ADDYTYWNA
   (``node_ref``/``worst_nn``), zero wpływu na istniejący kształt
   odpowiedzi gdy oba parametry pominięte.

Odtwarzanie grafu/wyniku PF — REUŻYCIE ``application.analyses.
energy_validation.service`` (jedno źródło mapowania ENM→NetworkGraph +
odtwarzania ``PowerFlowResult`` dla widoków przebiegu PF w tej rodzinie
końcówek — ten sam wzorzec ``_graph``/``_reconstruct_power_flow_result``,
zero drugiej kopii mapowania, KLASA-NIE-INSTANCJA).

``PowerFlowResultV1`` (frozen Result API), którego wymaga
``VoltageProfileSegmentBuilder``, jest odtwarzany OSOBNO w tym pliku
(``_power_flow_result_v1``) z tego samego ``run.raw_result["result_v1"]`` —
to dosłownie serializacja ``PowerFlowResultV1.to_dict()`` zapisana przy
przebiegu (patrz ``network_model/solvers/power_flow_result.py``), więc
odtworzenie jest czystym mapowaniem 1:1 pól JSON→dataclass, zero fizyki.
"""

from __future__ import annotations

from typing import Any

from analysis.normative.models import NormativeConfig
from analysis.voltage_profile.builder import VoltageProfileBuilder
from analysis.voltage_profile.models import VoltageProfileContext
from analysis.voltage_profile.segment_decomposition import (
    VoltageProfileSegmentBuilder,
    VoltageProfileSegmentPathError,
    find_worst_nn_path,
)

# Jedno źródło odtwarzania grafu/PowerFlowResult dla widoków tej rodziny
# (energy-validation, voltage-profile — obie czytają TEN SAM przebieg PF).
from application.analyses.energy_validation.service import (
    _graph,
    _reconstruct_power_flow_result,
)
from enm.canonical_analysis import CanonicalRun
from network_model.solvers.power_flow_result import (
    PowerFlowBranchResult,
    PowerFlowBusResult,
    PowerFlowResultV1,
    PowerFlowSummary,
)


def _wymagaj_biegu_rozplywu(run: CanonicalRun) -> None:
    if run.analysis_type != "PF":
        raise ValueError(
            "Profil napięć wymaga przebiegu rozpływu mocy; "
            f"otrzymano rodzaj analizy: {run.analysis_type}."
        )
    if run.status != "FINISHED":
        raise ValueError(
            f"Przebieg {run.id} nie jest zakończony (status={run.status}); "
            "wynik rozpływu mocy nie jest dostępny."
        )


def _nazwa_projektu(run: CanonicalRun) -> str | None:
    header = (run.snapshot or {}).get("header") or {}
    nazwa = header.get("name")
    return str(nazwa) if nazwa else None


def _power_flow_result_v1(run: CanonicalRun) -> PowerFlowResultV1:
    """Odtwórz ``PowerFlowResultV1`` (frozen Result API) z zapisanego wyniku
    przebiegu — mapowanie JSON→dataclass 1:1 pól, zero fizyki."""
    raw_result = run.raw_result or {}
    result_v1 = raw_result.get("result_v1") or {}

    bus_results = tuple(
        PowerFlowBusResult(
            bus_id=str(row["bus_id"]),
            v_pu=(float(row["v_pu"]) if row.get("v_pu") is not None else float("nan")),
            angle_deg=(
                float(row["angle_deg"]) if row.get("angle_deg") is not None else float("nan")
            ),
            p_injected_mw=float(row.get("p_injected_mw") or 0.0),
            q_injected_mvar=float(row.get("q_injected_mvar") or 0.0),
            status=str(row.get("status", "solved")),
        )
        for row in result_v1.get("bus_results", [])
    )
    branch_results = tuple(
        PowerFlowBranchResult(
            branch_id=str(row["branch_id"]),
            p_from_mw=float(row.get("p_from_mw", 0.0)),
            q_from_mvar=float(row.get("q_from_mvar", 0.0)),
            p_to_mw=float(row.get("p_to_mw", 0.0)),
            q_to_mvar=float(row.get("q_to_mvar", 0.0)),
            losses_p_mw=float(row.get("losses_p_mw", 0.0)),
            losses_q_mvar=float(row.get("losses_q_mvar", 0.0)),
        )
        for row in result_v1.get("branch_results", [])
    )
    summary_raw = result_v1.get("summary") or {}
    summary = PowerFlowSummary(
        total_losses_p_mw=float(summary_raw.get("total_losses_p_mw", 0.0)),
        total_losses_q_mvar=float(summary_raw.get("total_losses_q_mvar", 0.0)),
        min_v_pu=float(summary_raw.get("min_v_pu", 0.0)),
        max_v_pu=float(summary_raw.get("max_v_pu", 0.0)),
        slack_p_mw=float(summary_raw.get("slack_p_mw", 0.0)),
        slack_q_mvar=float(summary_raw.get("slack_q_mvar", 0.0)),
    )
    return PowerFlowResultV1(
        result_version=str(result_v1.get("result_version", "")),
        converged=bool(result_v1.get("converged", False)),
        iterations_count=int(result_v1.get("iterations_count", 0)),
        tolerance_used=float(result_v1.get("tolerance_used", 0.0)),
        base_mva=float(result_v1.get("base_mva", 100.0)) or 100.0,
        slack_bus_id=str(result_v1.get("slack_bus_id", "")),
        bus_results=bus_results,
        branch_results=branch_results,
        summary=summary,
        unsolved_node_ids=tuple(str(x) for x in result_v1.get("unsolved_node_ids", [])),
    )


def build_voltage_profile_view(
    run: CanonicalRun,
    *,
    node_ref: str | None = None,
    worst_nn: bool = False,
) -> dict[str, Any]:
    """Zbuduj widok profilu napięć (per szyna) dla przebiegu rozpływu mocy.

    ``node_ref``/``worst_nn`` (karta P0.4, §0.3 — ADDYTYWNE): gdy podane,
    odpowiedź niesie dodatkowo klucz ``segmenty`` — dekompozycję ΔU per
    odcinek na trasie źródło (SLACK)→węzeł. ``worst_nn=True`` wybiera
    automatycznie najgorszą (najniższe |V| pu) szynę pasma nN zamiast
    jawnego ``node_ref`` (``node_ref`` ma pierwszeństwo, gdy podane oba;
    sieć bez żadnej szyny nN → ``worst_nn`` po cichu NIE dodaje klucza
    ``segmenty`` — uczciwy brak, to "pokaż jeśli jest", nie żądanie
    konkretnego węzła, więc nie jest to błąd).

    Raises:
        ValueError: gdy przebieg nie jest rozpływem (PF) lub nie został
            zakończony, albo jawny ``node_ref`` jest nieznany/nieosiągalny w
            aktywnej topologii — komunikat po polsku (422 na granicy API).
    """
    _wymagaj_biegu_rozplywu(run)
    graph = _graph(run)
    pf_result = _reconstruct_power_flow_result(run)

    context = VoltageProfileContext(
        project_name=_nazwa_projektu(run),
        case_name=None,
        run_timestamp=run.created_at,
        snapshot_id=None,
        trace_id=None,
        run_id=str(run.id),
    )
    view = VoltageProfileBuilder(graph=graph, context=context).build(pf_result, NormativeConfig())
    payload = view.to_dict()

    if node_ref is not None:
        result_v1 = _power_flow_result_v1(run)
        try:
            path = VoltageProfileSegmentBuilder(graph).build_path(result_v1, node_ref)
        except VoltageProfileSegmentPathError as exc:
            raise ValueError(str(exc)) from exc
        payload["segmenty"] = path.to_dict()
    elif worst_nn:
        result_v1 = _power_flow_result_v1(run)
        worst_path = find_worst_nn_path(graph, result_v1)
        if worst_path is not None:
            payload["segmenty"] = worst_path.to_dict()

    return payload
