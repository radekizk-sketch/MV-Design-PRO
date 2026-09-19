"""Budowniczy wyniku rozpływu niesymetrycznego (karta W5-D): wyjście solvera FROZEN
``power_flow_unbalanced.py`` (per wyspa) → ``ResultSetPowerFlowUnbalancedV1``.

Zero fizyki: napięcia/moce/straty/VUF pochodzą WPROST z solvera; przeliczenia jednostek
(p.u. → kV faza–N, moc fazy i napięcie fazy → prąd fazy w A) idą przez
``network_model/pochodne`` (jedyne miejsce algebry wielkości pochodnych poza solverami).
Szyny spoza wysp zasilonych są nierozwiązane (``faza_* = None``) — jawny brak.
"""

from __future__ import annotations

import math
from typing import Any

from domain.result_contract_power_flow_unbalanced_v1 import (
    BranchResultUnbalancedV1,
    BusResultUnbalancedV1,
    FazaGaleziV1,
    FazaSzynyV1,
    ResultSetPowerFlowUnbalancedV1,
    WyspaWynikuUnbalancedV1,
)
from enm.assembler import WejscieRozplywuNiesymetrycznego, WyspaRozplywuNiesymetrycznego
from network_model.pochodne import napiecie_fazowe_v, prad_fazy_z_mocy_i_napiecia_a
from network_model.solvers.power_flow_unbalanced import (
    UnbalancedPowerFlowBranchResult,
    UnbalancedPowerFlowBusResult,
    UnbalancedPowerFlowResult,
)


def json_bezpieczny(wartosc: Any) -> Any:
    """Ślad złożenia do kolumny JSON biegu: liczba zespolona → ``{"re", "im"}`` (ta sama
    postać co ``z1/z2/z0_ohm`` w wyniku zwarciowym, ``analysis/power_flow/result.py``),
    rekurencyjnie po słownikach i sekwencjach; pozostałe wartości bez zmian."""
    if isinstance(wartosc, complex):
        return {"re": float(wartosc.real), "im": float(wartosc.imag)}
    if isinstance(wartosc, dict):
        return {str(k): json_bezpieczny(v) for k, v in wartosc.items()}
    if isinstance(wartosc, list | tuple):
        return [json_bezpieczny(v) for v in wartosc]
    return wartosc


def _faza_szyny(u_pu: float, angle_deg: float, un_kv: float) -> FazaSzynyV1:
    # Napięcie fazowe [kV] = |U_pu| · U_LL/√3 (baza solvera to napięcie fazowe).
    return FazaSzynyV1(u_pu=u_pu, u_kv=u_pu * napiecie_fazowe_v(un_kv), angle_deg=angle_deg)


def _faza_galezi(p_mw: float, q_mvar: float, u_faz_kv: float) -> FazaGaleziV1:
    s_mva = math.hypot(p_mw, q_mvar)
    i_a = prad_fazy_z_mocy_i_napiecia_a(s_mva, u_faz_kv) if u_faz_kv > 0.0 else 0.0
    return FazaGaleziV1(p_mw=p_mw, q_mvar=q_mvar, i_a=i_a)


def zbuduj_wynik_rozplywu_niesymetrycznego(
    wejscie: WejscieRozplywuNiesymetrycznego,
    rozwiazania: list[tuple[WyspaRozplywuNiesymetrycznego, UnbalancedPowerFlowResult]],
) -> ResultSetPowerFlowUnbalancedV1:
    graph = wejscie.graph
    napiecia = wejscie.napiecia_znamionowe_kv
    szyny_wyniku: dict[str, UnbalancedPowerFlowBusResult] = {}
    zrodlo_szyny: dict[str, str] = {}
    galezie_wyniku: dict[str, UnbalancedPowerFlowBranchResult] = {}
    wyspy_wyniku: list[WyspaWynikuUnbalancedV1] = []
    straty_p = 0.0
    straty_q = 0.0
    solver_version = ""
    for wyspa, wynik in rozwiazania:
        solver_version = wynik.solver_version
        for szyna in wynik.bus_results:
            szyny_wyniku[szyna.bus_id] = szyna
            zrodlo_szyny[szyna.bus_id] = wyspa.zrodlo_ref
        for galaz in wynik.branch_results:
            galezie_wyniku[galaz.branch_id] = galaz
        straty_p += wynik.total_losses_p_mw
        straty_q += wynik.total_losses_q_mvar
        wyspy_wyniku.append(
            WyspaWynikuUnbalancedV1(
                slack_bus_id=wyspa.slack_node_id,
                zrodlo_ref=wyspa.zrodlo_ref,
                base_kv_ll=wyspa.base_kv_ll,
                converged=wynik.converged,
                iterations=wynik.iterations,
                max_voltage_mismatch_pu=wynik.max_voltage_mismatch_pu,
                bus_count=len(wynik.bus_results),
                branch_count=len(wynik.branch_results),
            )
        )

    bus_results: list[BusResultUnbalancedV1] = []
    unsolved: list[str] = []
    max_vuf: float | None = None
    max_vuf_bus: str | None = None
    for node_id in sorted(graph.nodes):
        node = graph.nodes[node_id]
        element_id = str(wejscie.graph_nodes.get(node_id, {}).get("element_id") or node_id)
        wynik_szyny = szyny_wyniku.get(node_id)
        un_kv = napiecia[node_id]
        if wynik_szyny is None:
            unsolved.append(node_id)
            bus_results.append(
                BusResultUnbalancedV1(
                    bus_id=node_id,
                    element_id=element_id,
                    name=node.name,
                    un_kv=un_kv,
                    faza_a=None,
                    faza_b=None,
                    faza_c=None,
                    voltage_unbalance_factor_pct=None,
                    zrodlo_ref=None,
                )
            )
            continue
        vuf = wynik_szyny.voltage_unbalance_factor_pct
        if max_vuf is None or vuf > max_vuf:
            max_vuf, max_vuf_bus = vuf, node_id
        bus_results.append(
            BusResultUnbalancedV1(
                bus_id=node_id,
                element_id=element_id,
                name=node.name,
                un_kv=un_kv,
                faza_a=_faza_szyny(
                    wynik_szyny.voltage_pu_magnitude_a, wynik_szyny.angle_deg_a, un_kv
                ),
                faza_b=_faza_szyny(
                    wynik_szyny.voltage_pu_magnitude_b, wynik_szyny.angle_deg_b, un_kv
                ),
                faza_c=_faza_szyny(
                    wynik_szyny.voltage_pu_magnitude_c, wynik_szyny.angle_deg_c, un_kv
                ),
                voltage_unbalance_factor_pct=vuf,
                zrodlo_ref=zrodlo_szyny[node_id],
            )
        )

    branch_results: list[BranchResultUnbalancedV1] = []
    for branch_id in sorted(galezie_wyniku):
        galaz = galezie_wyniku[branch_id]
        kontekst = wejscie.graph_branches.get(branch_id, {})
        element_id = str(kontekst.get("element_id") or branch_id)
        element_type = str(kontekst.get("element_type") or "BRANCH")
        obiekt = graph.branches.get(branch_id)
        if obiekt is None:
            obiekt_lacznika = graph.switches.get(branch_id)
            nazwa = obiekt_lacznika.name if obiekt_lacznika is not None else branch_id
            rated: float | None = None
            element_type = "SWITCH" if obiekt_lacznika is not None else element_type
        else:
            nazwa = obiekt.name
            # IR: `LineBranch.rated_current_a` = 0.0 oznacza brak danej katalogowej
            # (kontrakt `core/branch.py`), transformator jej nie niesie → jawny brak.
            rated_ir = getattr(obiekt, "rated_current_a", None)
            rated = (
                float(rated_ir) if isinstance(rated_ir, int | float) and rated_ir > 0.0 else None
            )
        szyna_from = szyny_wyniku[galaz.from_bus_id]
        un_from = napiecia[galaz.from_bus_id]
        u_faz = napiecie_fazowe_v(un_from)
        branch_results.append(
            BranchResultUnbalancedV1(
                branch_id=branch_id,
                element_id=element_id,
                name=nazwa,
                element_type=element_type,
                from_bus_id=galaz.from_bus_id,
                to_bus_id=galaz.to_bus_id,
                faza_a=_faza_galezi(
                    galaz.p_mw_a, galaz.q_mvar_a, szyna_from.voltage_pu_magnitude_a * u_faz
                ),
                faza_b=_faza_galezi(
                    galaz.p_mw_b, galaz.q_mvar_b, szyna_from.voltage_pu_magnitude_b * u_faz
                ),
                faza_c=_faza_galezi(
                    galaz.p_mw_c, galaz.q_mvar_c, szyna_from.voltage_pu_magnitude_c * u_faz
                ),
                losses_p_mw=galaz.losses_p_mw,
                losses_q_mvar=galaz.losses_q_mvar,
                rated_current_a=rated,
            )
        )

    return ResultSetPowerFlowUnbalancedV1(
        solver_version=solver_version,
        converged=all(w.converged for w in wyspy_wyniku),
        tolerance=wejscie.tolerance,
        max_iterations=wejscie.max_iterations,
        base_mva=wejscie.base_mva,
        wyspy=tuple(wyspy_wyniku),
        bus_results=tuple(bus_results),
        branch_results=tuple(branch_results),
        total_losses_p_mw=straty_p,
        total_losses_q_mvar=straty_q,
        max_voltage_unbalance_factor_pct=max_vuf,
        max_voltage_unbalance_bus_id=max_vuf_bus,
        unsolved_bus_ids=tuple(unsolved),
        zalozenia=tuple(dict(z) for z in wejscie.zalozenia),
    )


def slad_iteracji(
    rozwiazania: list[tuple[WyspaRozplywuNiesymetrycznego, UnbalancedPowerFlowResult]]
) -> list[dict[str, Any]]:
    """Ślad iteracji solvera per wyspa (WHITE BOX: niedopasowanie napięcia per iteracja)."""
    return [
        {
            "zrodlo_ref": wyspa.zrodlo_ref,
            "slack_bus_id": wyspa.slack_node_id,
            "converged": wynik.converged,
            "iterations": wynik.iterations,
            "tolerance": wynik.tolerance,
            "max_iterations": wynik.max_iterations,
            "iteracje": [dict(krok) for krok in wynik.white_box_trace],
        }
        for wyspa, wynik in rozwiazania
    ]
