"""Punkt startowy iteracji Newtona nie wplywa na wynik zbiezny (QU-FABRYKACJA, runda 3).

PO CO TEN PLIK. Zapadka `solver_input_substitute_guard` po dolozeniu
`network_model/core` do mapy pol wskazala dwa miejsca w
`power_flow_newton_internal.py` (`_build_initial_voltage`):

    mag   = node.voltage_magnitude if node.voltage_magnitude is not None else 1.0
    angle = node.voltage_angle     if node.voltage_angle     is not None else 0.0

Forma jest DOKLADNIE ta, ktora karta zwalcza — brak danej zastapiony liczba.
Roznica jest merytoryczna, nie skladniowa: to nie jest wielkosc wejsciowa fizyki,
tylko PUNKT STARTOWY metody iteracyjnej (kanoniczny „plaski start" 1,0 pu / 0 rad),
a wynik ZBIEZNY nie zalezy od punktu startowego. Wpis do budzetu zapadki stoi
wiec na twierdzeniu — i regula „deklaracja bez testu = falszywa pewnosc" wymaga,
zeby to twierdzenie mialo PRZYPIETY TEST.

POMIAR, KTORY WYMUSIL TEN PLIK: przed nim WSZYSTKIE szesc testow uzywajacych
`flat_start` w calym repozytorium ustawialo `flat_start=True`. Galaz cieplego
startu — ta, w ktorej siedzi podstawienie — nie byla wykonywana przez ZADEN test,
wiec uzasadnienie wpisu budzetowego bylo nie do sprawdzenia.

METODA: ILOCZYN CECH {plaski start · cieply start z kompletem napiec · cieply start
z BRAKIEM napiec (galaz podstawienia) · cieply start z napieciami ODLEGLYMI od
rozwiazania}. Ostatni punkt jest najwazniejszy: gdyby punkt startowy przeciekal do
wyniku, to wlasnie tam byloby to widac.
"""

from __future__ import annotations

import pytest
from network_model.core.branch import BranchType, LineBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from network_model.solvers import PowerFlowNewtonSolver
from network_model.solvers.power_flow_types import (
    PowerFlowInput,
    PowerFlowOptions,
    PQSpec,
    SlackSpec,
)

#: Tolerancja porownania rozwiazan. Solver zbiega do 1e-8 po niewiazce mocy, wiec
#: napiecia z dwoch startow moga sie roznic o rzad tej niewiazki — nie wiecej.
TOL_PU = 1e-7


def _siec(
    *,
    u_pq: float | None,
    kat_pq: float | None,
) -> NetworkGraph:
    """SLACK -- LINIA -- PQ; napiecie wezla PQ zadane albo NIEOBECNE."""
    graph = NetworkGraph()
    graph.add_node(
        Node(
            id="bus_slack",
            name="Slack",
            node_type=NodeType.SLACK,
            voltage_level=110.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    graph.add_node(
        Node(
            id="bus_pq",
            name="PQ",
            node_type=NodeType.PQ,
            voltage_level=110.0,
            voltage_magnitude=u_pq,
            voltage_angle=kat_pq,
            active_power=-10.0,
            reactive_power=-5.0,
        )
    )
    graph.add_branch(
        LineBranch(
            id="line_1",
            name="Line 1",
            branch_type=BranchType.LINE,
            from_node_id="bus_slack",
            to_node_id="bus_pq",
            in_service=True,
            length_km=10.0,
            r_ohm_per_km=0.1,
            x_ohm_per_km=0.4,
            b_us_per_km=2.5,
        )
    )
    return graph


def _rozwiaz(graph: NetworkGraph, *, plaski_start: bool):
    wejscie = PowerFlowInput(
        graph=graph,
        base_mva=100.0,
        options=PowerFlowOptions(
            tolerance=1e-8,
            max_iter=30,
            damping=1.0,
            flat_start=plaski_start,
            validate=False,
            trace_level="off",
        ),
        slack=SlackSpec(node_id="bus_slack", u_pu=1.0, angle_rad=0.0),
        pq=[PQSpec(node_id="bus_pq", p_mw=-10.0, q_mvar=-5.0)],
        pv=[],
        shunts=[],
        taps=[],
    )
    return PowerFlowNewtonSolver().solve(wejscie)


#: Iloczyn cech punktow startowych. `None` w napieciu wezla PQ wchodzi w GALAZ
#: PODSTAWIENIA (1,0 pu / 0 rad) — czyli w te dwa wiersze, ktore sa w budzecie.
_PUNKTY_STARTOWE = [
    pytest.param(True, None, None, id="plaski-start"),
    pytest.param(False, 1.0, 0.0, id="cieply-start-komplet-napiec"),
    pytest.param(False, None, None, id="cieply-start-BRAK-napiec-galaz-podstawienia"),
    pytest.param(False, 0.85, -0.25, id="cieply-start-napiecia-odlegle-od-rozwiazania"),
    pytest.param(False, 1.15, 0.30, id="cieply-start-napiecia-odlegle-w-druga-strone"),
]


@pytest.mark.parametrize(("plaski", "u_pq", "kat_pq"), _PUNKTY_STARTOWE)
def test_wynik_zbiezny_nie_zalezy_od_punktu_startowego(
    plaski: bool, u_pq: float | None, kat_pq: float | None
) -> None:
    """KAZDY punkt startowy daje TO SAMO rozwiazanie zbiezne.

    To jest pin uzasadnienia wpisu budzetowego zapadki: podstawienie 1,0 pu / 0 rad
    w `_build_initial_voltage` jest punktem startowym, a nie zmyslona wielkoscia
    wejsciowa — bo wynik go nie pamieta.
    """
    odniesienie = _rozwiaz(_siec(u_pq=None, kat_pq=None), plaski_start=True)
    assert odniesienie.converged, "Odniesienie nie zbieglo — test nie ma sie do czego odnosic."

    wynik = _rozwiaz(_siec(u_pq=u_pq, kat_pq=kat_pq), plaski_start=plaski)
    assert wynik.converged, f"Nie zbieglo dla startu ({plaski}, {u_pq}, {kat_pq})."

    for node_id, u_ref in odniesienie.node_u_mag.items():
        assert wynik.node_u_mag[node_id] == pytest.approx(u_ref, abs=TOL_PU), (
            f"Amplituda napiecia w {node_id} zalezy od punktu startowego — "
            "podstawienie w `_build_initial_voltage` NIE jest juz tylko startem "
            "iteracji i wpis w budzecie zapadki traci uzasadnienie."
        )
    for node_id, kat_ref in odniesienie.node_angle.items():
        assert wynik.node_angle[node_id] == pytest.approx(
            kat_ref, abs=TOL_PU
        ), f"Kat napiecia w {node_id} zalezy od punktu startowego."


def test_kontrola_dodatnia_punkty_startowe_sa_naprawde_rozne() -> None:
    """Kontrola dodatnia: warianty startu FAKTYCZNIE roznia sie miedzy soba.

    Bez tego caly iloczyn cech moglby porownywac piec razy ten sam przebieg
    (np. gdyby `flat_start=False` byl po cichu ignorowany), a testy wyzej
    swiecilyby na zielono nie dowodzac niczego.
    """
    daleki = _rozwiaz(_siec(u_pq=0.85, kat_pq=-0.25), plaski_start=False)
    plaski = _rozwiaz(_siec(u_pq=None, kat_pq=None), plaski_start=True)
    assert daleki.converged and plaski.converged
    # Ten sam wynik, ale INNA droga do niego — inaczej wariant nie byl wykonany.
    assert daleki.iterations != plaski.iterations or daleki.max_mismatch != plaski.max_mismatch, (
        "Start odlegly od rozwiazania dal identyczny przebieg co plaski — "
        "wariant cieplego startu nie jest wykonywany i iloczyn cech jest pozorny."
    )


def test_galaz_cieplego_startu_jest_wykonywana() -> None:
    """Pin na TYM, ze galaz z podstawieniem w ogole sie wykonuje.

    Przed ta karta zaden test repozytorium nie ustawial `flat_start=False`, wiec
    dwa wiersze objete budzetem zapadki nie byly wykonywane ani razu. Ten pin
    trzyma je pod pradem: gdyby galaz zniknela albo przestala byc osiagalna,
    uzasadnienie wpisu budzetowego trzeba napisac od nowa.
    """
    wynik = _rozwiaz(_siec(u_pq=None, kat_pq=None), plaski_start=False)
    assert wynik.converged, (
        "Cieply start z BRAKIEM napiec wezlowych nie zbiegl — galaz podstawienia "
        "1,0 pu / 0 rad nie robi tego, co deklaruje wpis w budzecie zapadki."
    )
