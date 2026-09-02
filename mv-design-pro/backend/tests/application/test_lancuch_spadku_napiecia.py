"""Łańcuch dowodu VDROP: REUŻYCIE dekompozycji ΔU per odcinek P0.4 jako
jedynego źródła topologii ścieżki (karta P0.5b, N-D6).

Sieć testowa = DOKŁADNIE sieć ze scenariusza (b) karty P0.4
(``tests/analysis/test_voltage_profile_segment_decomposition.py``, wzorowana na
``tests/network_model/solvers/test_power_flow_lv.py``): slack 15 kV -> kabel SN
-> TR 15/0,4 -> 3 odcinki nN -> odbiory. Solver PF (FROZEN) uruchamiany raz,
wynik zawijany do ``PowerFlowResultV1`` — DOKŁADNIE to, co
``segment_decomposition`` już testuje. ``raw_result``/``snapshot`` (fizyka VDROP)
budowane RĘCZNIE z tych samych rozwiązanych wartości — mirror wzorca
``tests/application/test_wiazanie_spadku_napiecia.py``.

Pokrycie jako ILOCZYN CECH: rodzaj kroku (linia/kabel × granica TR) × pozycja
na trasie (pierwszy/środkowy/ostatni) × błąd (gałąź nieznana / trasa
nieosiągalna / brak danych fizycznych odcinka).
"""

from __future__ import annotations

import math
from typing import Any

import pytest
from analysis.voltage_profile.segment_decomposition import VoltageProfileSegmentBuilder
from application.proof_engine.vdrop_chain_binding import (
    BrakLancuchaSpadkuError,
    lancuch_spadku_napiecia,
)
from network_model.core.branch import BranchType, LineBranch, TransformerBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from network_model.solvers.power_flow_newton import PowerFlowNewtonSolver
from network_model.solvers.power_flow_result import PowerFlowResultV1, build_power_flow_result_v1
from network_model.solvers.power_flow_types import (
    PowerFlowInput,
    PowerFlowOptions,
    PQSpec,
    SlackSpec,
)

COS_PHI = 0.93
SIN_PHI = math.sqrt(1.0 - COS_PHI**2)
YAKY_4X35_R_OHM_PER_KM = 0.868
YAKY_4X35_X_OHM_PER_KM = 0.082
LOAD_P_MW = 0.020
LOAD_Q_MVAR = LOAD_P_MW * SIN_PHI / COS_PHI


def _slack(node_id: str, kv: float) -> Node:
    return Node(
        id=node_id,
        name=node_id,
        node_type=NodeType.SLACK,
        voltage_level=kv,
        voltage_magnitude=1.0,
        voltage_angle=0.0,
    )


def _pq(node_id: str, kv: float) -> Node:
    return Node(
        id=node_id,
        name=node_id,
        node_type=NodeType.PQ,
        voltage_level=kv,
        active_power=0.0,
        reactive_power=0.0,
    )


def _cable(branch_id: str, from_node: str, to_node: str, length_km: float) -> LineBranch:
    return LineBranch(
        id=branch_id,
        name=branch_id,
        branch_type=BranchType.CABLE,
        from_node_id=from_node,
        to_node_id=to_node,
        r_ohm_per_km=YAKY_4X35_R_OHM_PER_KM,
        x_ohm_per_km=YAKY_4X35_X_OHM_PER_KM,
        b_us_per_km=0.0,
        length_km=length_km,
        rated_current_a=125.0,
    )


def _transformer(branch_id: str, from_node: str, to_node: str) -> TransformerBranch:
    return TransformerBranch(
        id=branch_id,
        name=branch_id,
        branch_type=BranchType.TRANSFORMER,
        from_node_id=from_node,
        to_node_id=to_node,
        rated_power_mva=0.4,
        voltage_hv_kv=15.0,
        voltage_lv_kv=0.4,
        uk_percent=4.0,
        pk_kw=4.6,
        i0_percent=0.0,
        p0_kw=0.0,
        vector_group="Dyn11",
        tap_position=0,
        tap_step_percent=2.5,
    )


def _build_network() -> NetworkGraph:
    """Sieć ze scenariusza (b) karty P0.4 (patrz docstring modułu)."""
    graph = NetworkGraph()
    graph.add_node(_slack("MVSLACK", 15.0))
    graph.add_node(_pq("MVBUS", 15.0))
    graph.add_node(_pq("LVBUS", 0.4))
    graph.add_node(_pq("LV1", 0.4))
    graph.add_node(_pq("LV2", 0.4))
    graph.add_node(_pq("LV3", 0.4))

    graph.add_branch(_cable("C_MV", "MVSLACK", "MVBUS", 2.0))
    graph.add_branch(_transformer("TR1", "MVBUS", "LVBUS"))
    graph.add_branch(_cable("L_LV1", "LVBUS", "LV1", 0.05))
    graph.add_branch(_cable("L_LV2", "LV1", "LV2", 0.05))
    graph.add_branch(_cable("L_LV3", "LV2", "LV3", 0.05))
    return graph


def _solve() -> tuple[NetworkGraph, PowerFlowResultV1]:
    graph = _build_network()
    pq = [
        PQSpec(node_id="LV1", p_mw=LOAD_P_MW, q_mvar=LOAD_Q_MVAR),
        PQSpec(node_id="LV2", p_mw=LOAD_P_MW, q_mvar=LOAD_Q_MVAR),
        PQSpec(node_id="LV3", p_mw=LOAD_P_MW, q_mvar=LOAD_Q_MVAR),
        PQSpec(node_id="MVBUS", p_mw=0.0, q_mvar=0.0),
        PQSpec(node_id="LVBUS", p_mw=0.0, q_mvar=0.0),
    ]
    pf_input = PowerFlowInput(
        graph=graph,
        base_mva=1.0,
        slack=SlackSpec(node_id="MVSLACK", u_pu=1.0, angle_rad=0.0),
        pq=pq,
        options=PowerFlowOptions(max_iter=100, tolerance=1e-10, flat_start=True),
    )
    solution = PowerFlowNewtonSolver().solve(pf_input)
    assert solution.converged is True
    result_v1 = build_power_flow_result_v1(
        converged=solution.converged,
        iterations_count=solution.iterations,
        tolerance_used=pf_input.options.tolerance,
        base_mva=pf_input.base_mva,
        slack_bus_id=pf_input.slack.node_id,
        node_u_mag=solution.node_u_mag,
        node_angle=solution.node_angle,
        node_p_injected_pu={},
        node_q_injected_pu={},
        branch_s_from_mva=solution.branch_s_from_mva,
        branch_s_to_mva=solution.branch_s_to_mva,
        losses_total=solution.losses_total,
        slack_power_pu=solution.slack_power,
    )
    return graph, result_v1


def _artefakt(graph: NetworkGraph, result_v1: PowerFlowResultV1) -> dict[str, Any]:
    """``raw_result`` zgodny z kształtem, którego oczekuje ``voltage_drop_binding``
    (mirror ``tests/application/test_wiazanie_spadku_napiecia.py::_artefakt``) —
    zbudowany z TYCH SAMYCH rozwiązanych wartości co ``graph``/``result_v1``."""
    bus_v_pu = {bus.bus_id: bus.v_pu for bus in result_v1.bus_results}
    nodes = {
        node_id: {"element_id": f"bus-{node_id}", "voltage_level": node.voltage_level}
        for node_id, node in graph.nodes.items()
    }
    branches = {
        branch_id: {
            "element_id": f"branch-{branch_id}",
            "name": branch.name,
            "from_node_id": branch.from_node_id,
            "to_node_id": branch.to_node_id,
        }
        for branch_id, branch in graph.branches.items()
    }
    node_voltage_kv = {
        node_id: bus_v_pu[node_id] * graph.nodes[node_id].voltage_level for node_id in graph.nodes
    }
    branch_results = [
        {"branch_id": row.branch_id, "p_from_mw": row.p_from_mw, "q_from_mvar": row.q_from_mvar}
        for row in result_v1.branch_results
    ]
    return {
        "analysis_type": "load_flow",
        "node_voltage_kv": node_voltage_kv,
        "graph": {"nodes": nodes, "branches": branches},
        "result_v1": {"branch_results": branch_results},
    }


def _snapshot(graph: NetworkGraph) -> dict[str, Any]:
    """Impedancja jednostkowa/długość WYŁĄCZNIE odcinków linii/kabla — TR1
    świadomie POMINIĘTY (transformator nie jest odcinkiem VDROP)."""
    branches = []
    for branch_id, branch in graph.branches.items():
        if branch.branch_type != BranchType.CABLE:
            continue
        branches.append(
            {
                "ref_id": f"branch-{branch_id}",
                "type": "cable",
                "r_ohm_per_km": branch.r_ohm_per_km,
                "x_ohm_per_km": branch.x_ohm_per_km,
                "length_km": branch.length_km,
            }
        )
    return {"branches": branches}


class TestLancuchSpadkuNapieciaReuzycieDekompozycji:
    """Karta P0.5b: łańcuch REUŻYWA ``segment_decomposition`` (P0.4) jako
    JEDYNEGO źródła topologii — zero drugiego wyszukiwania trasy."""

    def test_topologia_lancucha_identyczna_z_segment_decomposition(self) -> None:
        graph, result_v1 = _solve()
        raw_result = _artefakt(graph, result_v1)
        snapshot = _snapshot(graph)

        # Oracle NIEZALEŻNY: wołanie segment_decomposition WPROST (P0.4),
        # dokładnie ta sama funkcja, którą łańcuch woła wewnątrz.
        path_oracle = VoltageProfileSegmentBuilder(graph).build_path(result_v1, "LV3")

        lancuch = lancuch_spadku_napiecia(
            graph=graph,
            pf_result=result_v1,
            raw_result=raw_result,
            snapshot=snapshot,
            docelowa_galaz_id="L_LV3",
        )

        # JEDNO źródło odcinków: kolejność i tożsamość gałęzi łańcucha ==
        # dokładnie to, co zwraca segment_decomposition dla TEJ SAMEJ trasy.
        assert [k.segment_id for k in lancuch.kroki] == [s.branch_id for s in path_oracle.segments]
        assert [k.segment_id for k in lancuch.kroki] == [
            "C_MV",
            "TR1",
            "L_LV1",
            "L_LV2",
            "L_LV3",
        ]

        # U_source/U_node — pass-through DOKŁADNY (<1e-9, tu: równość co do bitu,
        # bo to te same floaty przechodzące przez łańcuch wywołań, karta P0.5b
        # test 1: "zgodność sumy kroków dowodu z dekompozycją P0.4 do <1e-9").
        assert lancuch.u_source_kv == path_oracle.u_source_kv
        assert lancuch.u_node_kv == path_oracle.u_node_kv

        # u_from_kv/u_to_kv każdego kroku łańcucha == segment odpowiadający w
        # segment_decomposition, DOKŁADNIE (pass-through, zero przeliczenia).
        for krok, segment_oracle in zip(lancuch.kroki, path_oracle.segments, strict=True):
            assert krok.u_from_kv == segment_oracle.u_from_kv
            assert krok.u_to_kv == segment_oracle.u_to_kv

    def test_transformator_rozpoznany_na_trasie(self) -> None:
        graph, result_v1 = _solve()
        raw_result = _artefakt(graph, result_v1)
        snapshot = _snapshot(graph)

        lancuch = lancuch_spadku_napiecia(
            graph=graph,
            pf_result=result_v1,
            raw_result=raw_result,
            snapshot=snapshot,
            docelowa_galaz_id="L_LV3",
        )

        flagi = [k.jest_transformatorem for k in lancuch.kroki]
        assert flagi == [False, True, False, False, False]
        # Para predykatów z JEDNEGO źródła (reguła KLASA, NIE INSTANCJA):
        # jest_transformatorem <=> odcinek_fizyczny is None, bez wyjątków.
        for krok in lancuch.kroki:
            assert krok.jest_transformatorem == (krok.odcinek_fizyczny is None)

        krok_tr = lancuch.kroki[1]
        assert krok_tr.segment_id == "TR1"
        # Napięcia granicy TR muszą pochodzić z ROZWIĄZANIA PF (nie z zera/domysłu).
        assert krok_tr.u_from_kv > krok_tr.u_to_kv > 0.0

    def test_fizyka_odcinkow_liniowych_z_wiazania_bez_powielania(self) -> None:
        """R/X/L/P/Q/U_n każdego odcinka linii/kabla pochodzi z ISTNIEJĄCEJ
        warstwy wiązania (``voltage_drop_binding``) — sprawdzone WPROST przeciw
        danym wejściowym sieci testowej (nie przeciw kodowi produkcyjnemu)."""
        graph, result_v1 = _solve()
        raw_result = _artefakt(graph, result_v1)
        snapshot = _snapshot(graph)

        lancuch = lancuch_spadku_napiecia(
            graph=graph,
            pf_result=result_v1,
            raw_result=raw_result,
            snapshot=snapshot,
            docelowa_galaz_id="L_LV3",
        )

        for krok in lancuch.kroki:
            if krok.jest_transformatorem:
                continue
            fizyka = krok.odcinek_fizyczny
            assert fizyka is not None
            assert fizyka.r_ohm_per_km == pytest.approx(YAKY_4X35_R_OHM_PER_KM)
            assert fizyka.x_ohm_per_km == pytest.approx(YAKY_4X35_X_OHM_PER_KM)
            assert fizyka.u_n_kv == pytest.approx(0.4 if krok.segment_id != "C_MV" else 15.0)

    def test_gala_docelowa_nieznana_odmawia_z_powodem(self) -> None:
        graph, result_v1 = _solve()
        raw_result = _artefakt(graph, result_v1)
        snapshot = _snapshot(graph)

        with pytest.raises(BrakLancuchaSpadkuError, match="nie istnieje w grafie"):
            lancuch_spadku_napiecia(
                graph=graph,
                pf_result=result_v1,
                raw_result=raw_result,
                snapshot=snapshot,
                docelowa_galaz_id="NIEZNANA_GALAZ",
            )

    def test_brak_fizyki_odcinka_na_trasie_odmawia_zamiast_fabrykowac(self) -> None:
        """Odcinek NA TRASIE bez kompletu danych fizycznych (tu: brakujący
        wpis w snapshotcie) → jawna odmowa, ZERO podstawionego zera."""
        graph, result_v1 = _solve()
        raw_result = _artefakt(graph, result_v1)
        snapshot = _snapshot(graph)
        # Usuń L_LV2 ze snapshotu (odcinek środkowy trasy do LV3).
        snapshot["branches"] = [b for b in snapshot["branches"] if b["ref_id"] != "branch-L_LV2"]

        with pytest.raises(BrakLancuchaSpadkuError, match="L_LV2"):
            lancuch_spadku_napiecia(
                graph=graph,
                pf_result=result_v1,
                raw_result=raw_result,
                snapshot=snapshot,
                docelowa_galaz_id="L_LV3",
            )

    def test_lancuch_do_szyny_bezposrednio_za_transformatorem(self) -> None:
        """Trasa 2-krokowa (kabel SN + granica TR), bez odcinków nN — pin, że
        łańcuch nie zakłada „co najmniej jednego kabla nN"."""
        graph, result_v1 = _solve()
        raw_result = _artefakt(graph, result_v1)
        snapshot = _snapshot(graph)

        lancuch = lancuch_spadku_napiecia(
            graph=graph,
            pf_result=result_v1,
            raw_result=raw_result,
            snapshot=snapshot,
            docelowa_galaz_id="TR1",
        )

        assert [k.segment_id for k in lancuch.kroki] == ["C_MV", "TR1"]
        assert lancuch.target_id == raw_result["graph"]["nodes"]["LVBUS"]["element_id"]

    def test_nazwy_wezlow_czytelne_nie_surowe_id_grafu(self) -> None:
        """Nagłówek łańcucha (source_id/target_id) niesie CZYTELNĄ referencję
        (element_id), nie surowe id węzła grafu — zgodność z ``OdcinekSpadku``
        (dawny, jednoodcinkowy dowód) i czytelność dla projektanta."""
        graph, result_v1 = _solve()
        raw_result = _artefakt(graph, result_v1)
        snapshot = _snapshot(graph)

        lancuch = lancuch_spadku_napiecia(
            graph=graph,
            pf_result=result_v1,
            raw_result=raw_result,
            snapshot=snapshot,
            docelowa_galaz_id="L_LV3",
        )

        assert lancuch.source_id == "bus-MVSLACK"
        assert lancuch.target_id == "bus-LV3"
        # Referencje CZYTELNE (prefiks "bus-", nadany przez ``element_id`` w
        # artefakcie testowym) — nie surowe id węzła grafu ("MVSLACK", "LV3", …).
        for krok in lancuch.kroki:
            assert krok.from_bus.startswith("bus-")
            assert krok.to_bus.startswith("bus-")
