"""Scalanie rozwiązań rozpływu liczonych PER WYSPA (CV-4.3 K3b, A3-05) — bez fizyki.

Solver rozpływu (FROZEN, B-01) liczy wyspę szyny bilansującej z ``PowerFlowInput.slack``
i nic poza nią (``build_slack_island``). Sieć z kilkoma źródłami sieciowymi w OSOBNYCH
wyspach dostaje od assemblera (``enm/assembler.py::zloz_wejscie_rozplywu``) po jednym
wejściu na wyspę zasiloną; wykonawca (``enm/canonical_analysis.py::_execute_power_flow``)
rozwiązuje je po kolei, a ten moduł składa z nich JEDNO rozwiązanie w kształcie
``PowerFlowNewtonSolution``:

* słowniki węzłów i gałęzi = unia rozłącznych słowników wysp (każda wyspa wnosi
  wyłącznie własne węzły i gałęzie); węzły poza wyspami zasilonymi = ``NaN`` i
  ``not_solved_nodes`` — dokładnie ta sama konwencja, którą solver stosuje dla węzłów
  poza wyspą slacka przy jednym wejściu;
* ``losses_total``/``slack_power``/``sum_pq_spec`` = sumy (bilans całej sieci: moc
  wszystkich szyn bilansujących równoważy odbiory i straty);
* ``converged`` = wszystkie wyspy zbieżne; ``iterations``/``max_mismatch`` = maksimum;
* ślad iteracji = konkatenacja śladów wysp, każdy wpis z ``slack_bus_id`` swojej wyspy;
  ``ybus_trace`` = ``{"wyspy": [...]}`` (nie ma jednej macierzy admitancyjnej).

Jedna wyspa zasilona ⇒ TEN SAM obiekt rozwiązania (tożsamość, parytet bit w bit z torem
sprzed karty). Sumowanie i unie to księgowość wyników solvera, nie obliczenia sieci.
"""

from __future__ import annotations

import math
from dataclasses import replace
from typing import Any

from enm.assembler import WyspaRozplywu
from network_model.core.graph import NetworkGraph
from network_model.solvers.power_flow_newton import PowerFlowNewtonSolution

Rozwiazania = list[tuple[WyspaRozplywu, PowerFlowNewtonSolution]]


def _unia(rozwiazania: Rozwiazania, pole: str) -> dict[str, Any]:
    """Unia słowników ``pole`` kolejnych wysp (klucze rozłączne — wyspy są rozłączne)."""
    wynik: dict[str, Any] = {}
    for _wyspa, rozwiazanie in rozwiazania:
        for klucz, wartosc in getattr(rozwiazanie, pole).items():
            if klucz in wynik:
                raise ValueError(
                    f"Wyspy rozpływu nie są rozłączne: klucz {klucz!r} w polu {pole!r} "
                    "pojawia się w dwóch rozwiązaniach."
                )
            wynik[klucz] = wartosc
    return wynik


def _konkatenacja_bez_powtorzen(rozwiazania: Rozwiazania, pole: str) -> list[str]:
    wynik: list[str] = []
    for _wyspa, rozwiazanie in rozwiazania:
        for wpis in getattr(rozwiazanie, pole):
            if wpis not in wynik:
                wynik.append(wpis)
    return wynik


def _z_wyspa(rozwiazania: Rozwiazania, pole: str) -> list[dict[str, Any]]:
    """Konkatenacja list wpisów śladu z dopisanym ``slack_bus_id`` wyspy (addytywnie)."""
    return [
        {**wpis, "slack_bus_id": wyspa.slack_node_id}
        for wyspa, rozwiazanie in rozwiazania
        for wpis in getattr(rozwiazanie, pole)
    ]


def scal_rozwiazania_wysp(rozwiazania: Rozwiazania, graph: NetworkGraph) -> PowerFlowNewtonSolution:
    """Jedno rozwiązanie z rozwiązań wysp (patrz docstring modułu).

    ``graph`` = pełny graf sieci — źródło zbioru węzłów spoza wysp zasilonych
    (``not_solved_nodes``); przy jednej wyspie zwracany jest ten sam obiekt.
    """
    if not rozwiazania:
        raise ValueError("Brak rozwiązań wysp do scalenia")
    if len(rozwiazania) == 1:
        return rozwiazania[0][1]

    pierwsze = rozwiazania[0][1]
    rozwiazane = sorted({w for _wyspa, r in rozwiazania for w in r.slack_island_nodes})
    nierozwiazane = sorted(set(graph.nodes) - set(rozwiazane))

    node_u_mag = _unia(rozwiazania, "node_u_mag")
    node_angle = _unia(rozwiazania, "node_angle")
    node_voltage_kv = _unia(rozwiazania, "node_voltage_kv")
    for wezel in nierozwiazane:
        node_u_mag[wezel] = math.nan
        node_angle[wezel] = math.nan
        node_voltage_kv[wezel] = math.nan

    init_state: dict[str, dict[str, float]] | None = None
    if any(r.init_state is not None for _w, r in rozwiazania):
        init_state = {}
        for _wyspa, rozwiazanie in rozwiazania:
            init_state.update(rozwiazanie.init_state or {})

    slady_ybus = [
        {"slack_bus_id": wyspa.slack_node_id, **rozwiazanie.ybus_trace}
        for wyspa, rozwiazanie in rozwiazania
    ]
    return replace(
        pierwsze,
        converged=all(r.converged for _w, r in rozwiazania),
        iterations=max(r.iterations for _w, r in rozwiazania),
        max_mismatch=max(r.max_mismatch for _w, r in rozwiazania),
        node_voltage=_unia(rozwiazania, "node_voltage"),
        node_u_mag=node_u_mag,
        node_angle=node_angle,
        node_voltage_kv=node_voltage_kv,
        branch_current=_unia(rozwiazania, "branch_current"),
        branch_s_from=_unia(rozwiazania, "branch_s_from"),
        branch_s_to=_unia(rozwiazania, "branch_s_to"),
        branch_current_ka=_unia(rozwiazania, "branch_current_ka"),
        branch_s_from_mva=_unia(rozwiazania, "branch_s_from_mva"),
        branch_s_to_mva=_unia(rozwiazania, "branch_s_to_mva"),
        losses_total=sum((r.losses_total for _w, r in rozwiazania), 0j),
        slack_power=sum((r.slack_power for _w, r in rozwiazania), 0j),
        sum_pq_spec=sum((r.sum_pq_spec for _w, r in rozwiazania), 0j),
        missing_voltage_base_nodes=sorted(
            {w for _wyspa, r in rozwiazania for w in r.missing_voltage_base_nodes}
        ),
        validation_warnings=_konkatenacja_bez_powtorzen(rozwiazania, "validation_warnings"),
        validation_errors=_konkatenacja_bez_powtorzen(rozwiazania, "validation_errors"),
        slack_island_nodes=rozwiazane,
        not_solved_nodes=nierozwiazane,
        ybus_trace={"wyspy": slady_ybus},
        nr_trace=_z_wyspa(rozwiazania, "nr_trace"),
        applied_taps=_z_wyspa(rozwiazania, "applied_taps"),
        applied_shunts=_z_wyspa(rozwiazania, "applied_shunts"),
        pv_to_pq_switches=_z_wyspa(rozwiazania, "pv_to_pq_switches"),
        init_state=init_state,
        node_p_spec_effective_pu=_unia(rozwiazania, "node_p_spec_effective_pu"),
        node_q_spec_effective_pu=_unia(rozwiazania, "node_q_spec_effective_pu"),
    )


def scal_slady_oltc(
    rozwiazania: Rozwiazania, slady: list[dict[str, Any] | None]
) -> dict[str, Any] | None:
    """Ślad regulatorów zaczepowych: przy jednej wyspie ten sam obiekt; przy kilku —
    regulatory i iteracje wszystkich wysp (wpis iteracji z ``slack_bus_id``),
    ``converged`` = wszystkie pętle zbieżne, ``wyspy`` = ślady per wyspa. ``None``,
    gdy żadna wyspa nie ma automatycznego regulatora."""
    if len(slady) != len(rozwiazania):
        raise ValueError("Liczba śladów OLTC różna od liczby rozwiązań wysp")
    if len(slady) == 1:
        return slady[0]
    if all(slad is None for slad in slady):
        return None
    wyspy: list[dict[str, Any] | None] = []
    regulatory: list[dict[str, Any]] = []
    iteracje: list[dict[str, Any]] = []
    zbiezne = True
    for (wyspa, _rozwiazanie), slad in zip(rozwiazania, slady, strict=True):
        if slad is None:
            wyspy.append(None)
            continue
        wyspy.append({"slack_bus_id": wyspa.slack_node_id, **slad})
        regulatory.extend(slad.get("regulators") or [])
        iteracje.extend(
            {**wpis, "slack_bus_id": wyspa.slack_node_id} for wpis in slad.get("iterations") or []
        )
        zbiezne = zbiezne and bool(slad.get("converged"))
    return {
        "regulators": regulatory,
        "iterations": iteracje,
        "converged": zbiezne,
        "wyspy": wyspy,
    }


def opis_wysp(rozwiazania: Rozwiazania) -> list[dict[str, Any]]:
    """Wpis ``raw_result["wyspy"]`` (addytywny, tylko przy kilku wyspach zasilonych):
    tożsamość wyspy (szyna bilansująca, źródło, węzły) i jej wynik zbiorczy w pu
    (moce w MW/Mvar per szyna niesie kontrakt FROZEN ``result_v1.bus_results``)."""
    return [
        {
            "slack_bus_id": wyspa.slack_node_id,
            "zrodlo_ref": wyspa.zrodlo_ref,
            "bus_refs": list(wyspa.szyny),
            "bus_ids": list(wyspa.wezly),
            "converged": rozwiazanie.converged,
            "iterations_count": rozwiazanie.iterations,
            "max_mismatch_pu": float(rozwiazanie.max_mismatch),
            "slack_power_pu": {
                "re": float(rozwiazanie.slack_power.real),
                "im": float(rozwiazanie.slack_power.imag),
            },
            "losses_total_pu": {
                "re": float(rozwiazanie.losses_total.real),
                "im": float(rozwiazanie.losses_total.imag),
            },
        }
        for wyspa, rozwiazanie in rozwiazania
    ]
