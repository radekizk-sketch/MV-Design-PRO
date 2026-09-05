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


def _fizyczna_lub_nan(row: dict[str, Any], klucz: str) -> float:
    """Pole fizyczne szyny: brak (solver nie policzył — poza wyspą SLACK,
    ``PowerFlowBusResult.to_dict`` serializuje NaN jako ``None``) -> NaN, nigdy
    fikcyjne 0.0 (jednolita konwencja z ``analysis/energy_validation``)."""
    wartosc = row.get(klucz)
    return float(wartosc) if wartosc is not None else float("nan")


def _wymagana_liczba_galezi(row: dict[str, Any], klucz: str, branch_id: str) -> float:
    """Pole gałęzi bez odpowiednika NaN->None w zamrożonym kontrakcie
    (``PowerFlowBranchResult.to_dict`` serializuje pola wprost — solver NIGDY
    nie zwraca tu NaN) — brak pola oznacza uszkodzony zapis biegu, nie gałąź
    poza wyspą SLACK, więc odmowa z nazwą pola, nie fikcyjne 0.0."""
    wartosc = row.get(klucz)
    if wartosc is None:
        raise ValueError(
            f"Profil napięć: gałąź {branch_id!r} w zapisie biegu rozpływu nie ma pola "
            f"{klucz!r} — zamrożony wynik (PowerFlowBranchResult) nie dopuszcza tu braku, "
            "zapis biegu jest uszkodzony."
        )
    return float(wartosc)


def _wymagana_liczba_podsumowania(summary_raw: dict[str, Any], klucz: str) -> float:
    """Pole podsumowania rozpływu — jak wyżej, zamrożony kontrakt
    (``PowerFlowSummary.to_dict``) nigdy nie serializuje tu NaN/braku."""
    wartosc = summary_raw.get(klucz)
    if wartosc is None:
        raise ValueError(
            f"Profil napięć: podsumowanie przebiegu rozpływu nie ma pola {klucz!r} — "
            "zamrożony wynik (PowerFlowSummary) nie dopuszcza tu braku, zapis biegu "
            "jest uszkodzony."
        )
    return float(wartosc)


def _power_flow_result_v1(run: CanonicalRun) -> PowerFlowResultV1:
    """Odtwórz ``PowerFlowResultV1`` (frozen Result API) z zapisanego wyniku
    przebiegu — mapowanie JSON→dataclass 1:1 pól, zero fizyki.

    FAB-E (E1): odczyt TOLERANCYJNY na status szyny — w odróżnieniu od
    ``application.solvers.power_flow_binding._odtworz_wynik`` (dowód rozpływu,
    wymaga KOMPLETU rozwiązanych szyn — odmawia inaczej), ten widok MA
    pokazywać profil napięć również gdy solver nie objął części szyn (poza
    wyspą SLACK): ten przypadek zgłasza czytelnie
    ``VoltageProfileSegmentBuilder``/``find_worst_nn_path`` (NaN v_pu ->
    ``VoltageProfileSegmentPathError``/pominięcie z listy kandydatów), nie
    wyjątek już przy budowie tego obiektu — stąd DWIE, świadomie różne,
    odtwórki tego samego zamrożonego typu (różna zasada dla „solver nie
    dotarł do szyny": tu tolerowana, w dowodzie — odmowa całości).

    branch_results/summary i iterations_count/tolerance_used/base_mva są dziś
    martwe dla jedynych konsumentów tego obiektu w tym pliku
    (``VoltageProfileSegmentBuilder``/``find_worst_nn_path`` czytają WYŁĄCZNIE
    ``bus_results[].bus_id``/``.v_pu`` — patrz docstring modułu
    ``segment_decomposition.py``) — ale ZERO FABRYKACJI obowiązuje mimo braku
    dzisiejszego czytelnika: branch_results/summary to wielkości fizyczne
    (gałąź/agregat sieci), więc brak pola -> odmowa z nazwą pola (nie 0.0);
    iterations_count/tolerance_used/base_mva to metadane solvera (NIE
    wielkości fizyczne) — bezpieczny, udokumentowany domyślny odczyt, spójny
    z tym samym ustaleniem dla siostrzanego typu ``PowerFlowResult`` w
    ``application/analyses/energy_validation/service.py``.
    """
    raw_result = run.raw_result or {}
    result_v1 = raw_result.get("result_v1") or {}

    bus_results = tuple(
        PowerFlowBusResult(
            bus_id=str(row["bus_id"]),
            v_pu=_fizyczna_lub_nan(row, "v_pu"),
            angle_deg=_fizyczna_lub_nan(row, "angle_deg"),
            p_injected_mw=_fizyczna_lub_nan(row, "p_injected_mw"),
            q_injected_mvar=_fizyczna_lub_nan(row, "q_injected_mvar"),
            status=str(row.get("status", "solved")),
        )
        for row in result_v1.get("bus_results", [])
    )
    branch_results_list: list[PowerFlowBranchResult] = []
    for row in result_v1.get("branch_results", []):
        galaz_id = str(row["branch_id"])
        branch_results_list.append(
            PowerFlowBranchResult(
                branch_id=galaz_id,
                p_from_mw=_wymagana_liczba_galezi(row, "p_from_mw", galaz_id),
                q_from_mvar=_wymagana_liczba_galezi(row, "q_from_mvar", galaz_id),
                p_to_mw=_wymagana_liczba_galezi(row, "p_to_mw", galaz_id),
                q_to_mvar=_wymagana_liczba_galezi(row, "q_to_mvar", galaz_id),
                losses_p_mw=_wymagana_liczba_galezi(row, "losses_p_mw", galaz_id),
                losses_q_mvar=_wymagana_liczba_galezi(row, "losses_q_mvar", galaz_id),
            )
        )
    summary_raw = result_v1.get("summary") or {}
    summary = PowerFlowSummary(
        total_losses_p_mw=_wymagana_liczba_podsumowania(summary_raw, "total_losses_p_mw"),
        total_losses_q_mvar=_wymagana_liczba_podsumowania(summary_raw, "total_losses_q_mvar"),
        min_v_pu=_wymagana_liczba_podsumowania(summary_raw, "min_v_pu"),
        max_v_pu=_wymagana_liczba_podsumowania(summary_raw, "max_v_pu"),
        slack_p_mw=_wymagana_liczba_podsumowania(summary_raw, "slack_p_mw"),
        slack_q_mvar=_wymagana_liczba_podsumowania(summary_raw, "slack_q_mvar"),
    )
    return PowerFlowResultV1(
        result_version=str(result_v1.get("result_version", "")),
        converged=bool(result_v1.get("converged", False)),
        iterations_count=int(result_v1.get("iterations_count", 0)),
        tolerance_used=float(result_v1.get("tolerance_used", 0.0)),
        base_mva=float(result_v1.get("base_mva", 100.0)) or 100.0,
        slack_bus_id=str(result_v1.get("slack_bus_id", "")),
        bus_results=bus_results,
        branch_results=tuple(branch_results_list),
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
