"""Diagnoza karty PF-OD19 (2026-09-30): rozwiązanie zerowe szyny PQ o zerowej mocy a kryterium J_R.

PO CO TEN PLIK. Karta PF-OD19 (decyzja OD-19, zgoda B-01 warunkowa) zaczyna się od
diagnozy zmierzonego przypadku W3-G2 w White Box i ma STOP-warunek: jeśli
zredukowany jakobian ``J_R = J_QV − J_Qθ·J_Pθ⁻¹·J_PV`` w punkcie zbieżności NIE ma
ujemnej wartości własnej, korekty rdzenia nie wolno wdrożyć (ani dosztukować progu
czy innego kryterium). Ten plik jest PRZYPIĘTYM POMIAREM tej diagnozy (reguła
„deklaracja bez testu = fałszywa pewność"), nie testem poprawności produktu — każde
twierdzenie meldunku ``MELDUNEK_PF_OD19.md`` ma tu asercję.

WYNIK POMIARU (w skrócie; liczby w asercjach niżej):
1. Rozwiązanie z W3-G2 (U ≈ 1e-19 p.u. na „Szyna 110 kV TR1") NIE jest gałęzią
   niskonapięciową krzywej P–V szyny obciążonej. Jest to rozwiązanie TRYWIALNE
   równań bilansu szyny PQ o ZEROWEJ mocy: ``S_k = U_k · I_k* = 0`` zachodzi dla
   U_k = 0 przy dowolnym prądzie, więc U_k = 0 spełnia ΔP_k = ΔQ_k = 0 dokładnie.
   Wiersze jakobianu tej szyny skalują się z U_k (``∂P_k/∂θ = U_k·U_m·(…)``), więc
   jakobian jest OSOBLIWY (σ_min(J) ~ 1e-13), a kąt szyny — nieokreślony.
2. Czułość U–Q w tym punkcie jest DODATNIA: ``∂Q_k/∂U_k → −b_km·U_m > 0`` (b_km < 0
   dla gałęzi indukcyjnej). Wszystkie wartości własne J_R są dodatnie — kryterium
   karty jest strukturalnie ślepe na tę klasę, a nie „ledwo nie łapie".
3. Klasa jest niezależna od topologii W3-G2: dwuszynowa sieć slack — linia — PQ(0, 0)
   ma to samo rozwiązanie zerowe i tę samą dodatnią czułość (wyprowadzenie
   analityczne zgodne z ``build_jacobian_v2`` do 1e-9).
4. Mechanizm W3-G2: spec e2e nadpisuje parametrami 630 kVA 15/0,4 kV także TR1
   110/15 kV, więc przekładnia poza-znamionowa TR1 = (15/110)/(0,4/15) ≈ 5,11 i
   rozwiązanie robocze leży w |U_110| ≈ 5,11 p.u.; start płaski 1,0 p.u. ląduje na
   zerze. Z TR1 nietkniętym (25 MVA) start płaski zbiega do gałęzi roboczej — ale
   start bliski zera dalej ląduje na rozwiązaniu zerowym (klasa, nie fikstura).

Korekta wobec twierdzenia w ``test_punkt_startowy_nie_zmienia_wyniku.py``: „wynik
zbieżny nie zależy od punktu startowego" zachodzi dla szyny OBCIĄŻONEJ; dla szyny
PQ o zerowej mocy istnieją co najmniej dwa rozwiązania zbieżne i wybór należy do
punktu startowego.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient
from network_model.core.branch import BranchType, LineBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from network_model.solvers.power_flow_newton import (
    PowerFlowNewtonSolution,
    solve_power_flow_physics,
)
from network_model.solvers.power_flow_newton_internal import (
    build_initial_voltage,
    build_jacobian_v2,
    build_power_spec_v2,
    build_slack_island,
    build_ybus_pu,
    compute_power_injections,
    newton_raphson_solve_v2,
)
from network_model.solvers.power_flow_types import (
    PowerFlowInput,
    PowerFlowOptions,
    PQSpec,
    SlackSpec,
)

from tests.reference_networks.w3g2_pasma_rozplywu import (
    NAZWA_SZYNY_110,
    tr1_gpz,
    zbuduj_siec_w3g2,
)

#: Rozwiązanie zerowe: |U| poniżej tej wartości to numeryczne zero (pomiar: 1e-19…1e-11
#: zależnie od startu; pandapower 3.5.4 daje 0,000000).
U_ZERO_PU = 1e-9
#: Osobliwość jakobianu w rozwiązaniu zerowym (pomiar: σ_min(J) = 1,9e-13 … 1,7e-9).
SIGMA_MIN_OSOBLIWY = 1e-8
#: Moc szyny bilansującej w rozwiązaniu zerowym W3-G2 (pomiar: 5713,390880 MW).
SLACK_MW_ROZWIAZANIE_ZEROWE_SPEC = 5713.390880
#: Moc szyny bilansującej na gałęzi roboczej W3-G2 (pomiar: 0,500255 MW; wyrocznia
#: pandapower 3.5.4 przy i0 = P0 = 0: 0,500255 MW, |ΔP| = 2,5e-7 MW).
SLACK_MW_GALAZ_ROBOCZA = 0.500255
#: Przekładnia poza-znamionowa TR1 po nadpisaniu 15/0,4 kV: (15/110)/(0,4/15).
PRZEKLADNIA_TR1_NADPISANEGO = (15.0 / 110.0) / (0.4 / 15.0)


# --- narzędzia pomiaru (poza rdzeniem) -------------------------------------------


def _ybus_i_indeksy(pfi: PowerFlowInput) -> tuple[np.ndarray, dict[str, int], list[str], int]:
    graph = pfi.typed_graph()
    wyspa, _ = build_slack_island(graph, pfi.slack.node_id)
    zaczepy = {s.branch_id: s.tap_ratio for s in pfi.taps}
    ybus, indeks, _, _, _ = build_ybus_pu(
        graph, wyspa, pfi.base_mva, pfi.slack.node_id, pfi.shunts, zaczepy
    )
    return ybus, indeks, wyspa, indeks[pfi.slack.node_id]


def _wektor_napiec(sol: PowerFlowNewtonSolution, indeks: dict[str, int]) -> np.ndarray:
    v = np.zeros(len(indeks), dtype=complex)
    for node_id, i in indeks.items():
        v[i] = sol.node_voltage[node_id]
    return v


def zredukowany_jakobian(
    pfi: PowerFlowInput, v: np.ndarray
) -> tuple[np.ndarray, np.ndarray, list[str]]:
    """``(J, J_R, kolejność szyn PQ)`` w punkcie ``v`` — J_R = J_QV − J_Qθ·J_Pθ⁻¹·J_PV."""
    ybus, indeks, _, slack_i = _ybus_i_indeksy(pfi)
    pq = sorted(indeks[s.node_id] for s in pfi.pq if s.node_id in indeks)
    pv = sorted(indeks[s.node_id] for s in pfi.pv if s.node_id in indeks)
    ns = sorted(i for i in pq + pv if i != slack_i)
    p_calc, q_calc = compute_power_injections(ybus, v)
    jac = build_jacobian_v2(ybus, v, ns, pq, p_calc, q_calc)
    n_p = len(ns)
    j_pth, j_pv = jac[:n_p, :n_p], jac[:n_p, n_p:]
    j_qth, j_qv = jac[n_p:, :n_p], jac[n_p:, n_p:]
    j_r = j_qv - j_qth @ np.linalg.solve(j_pth, j_pv)
    odwrotny = {i: node_id for node_id, i in indeks.items()}
    return jac, j_r, [odwrotny[i] for i in pq]


def _rozwiaz_ze_startu(
    pfi: PowerFlowInput, *, node_id: str, u_start_pu: float
) -> tuple[np.ndarray, bool, float]:
    """NR rdzenia (``newton_raphson_solve_v2``) ze startem płaskim, w którym JEDNA szyna
    ma zadany moduł startowy — reszta parametrów jak w ``PowerFlowNewtonSolver.solve``."""
    ybus, indeks, wyspa, slack_i = _ybus_i_indeksy(pfi)
    graph = pfi.typed_graph()
    pq = sorted(indeks[s.node_id] for s in pfi.pq if s.node_id in indeks)
    pv = sorted(indeks[s.node_id] for s in pfi.pv if s.node_id in indeks)
    p_spec, q_spec, pv_setpoints, pv_q_limits = build_power_spec_v2(
        wyspa, pfi.base_mva, pfi.pq, pfi.pv
    )
    v0 = build_initial_voltage(
        wyspa, pfi.slack.node_id, pfi.slack.u_pu, pfi.slack.angle_rad, pfi.options, graph
    )
    i = indeks[node_id]
    v0[i] = u_start_pu * np.exp(1j * np.angle(v0[i]))
    odwrotny = {i: node_id for node_id, i in indeks.items()}
    v, converged, _, _, _, _ = newton_raphson_solve_v2(
        ybus,
        slack_i,
        pq,
        pv,
        p_spec,
        q_spec,
        pv_setpoints,
        pv_q_limits,
        v0,
        pfi.options,
        pfi.base_mva,
        odwrotny,
    )
    p_calc, _ = compute_power_injections(ybus, v)
    return v, converged, float(p_calc[slack_i] * pfi.base_mva)


# --- 1. Klasa na sieci dwuszynowej: slack — linia — PQ(0, 0) ----------------------


def _siec_dwuszynowa(*, p_mw: float, q_mvar: float, u_start_pq: float | None) -> PowerFlowInput:
    graph = NetworkGraph()
    graph.add_node(
        Node(
            id="slack",
            name="Szyna bilansująca",
            node_type=NodeType.SLACK,
            voltage_level=15.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    graph.add_node(
        Node(
            id="pq",
            name="Szyna PQ",
            node_type=NodeType.PQ,
            voltage_level=15.0,
            voltage_magnitude=u_start_pq,
            voltage_angle=0.0 if u_start_pq is not None else None,
            active_power=-p_mw,
            reactive_power=-q_mvar,
        )
    )
    graph.add_branch(
        LineBranch(
            id="linia",
            name="Linia",
            branch_type=BranchType.LINE,
            from_node_id="slack",
            to_node_id="pq",
            r_ohm_per_km=0.2,
            x_ohm_per_km=0.35,
            b_us_per_km=0.0,
            length_km=2.0,
            rated_current_a=300.0,
        )
    )
    return PowerFlowInput(
        graph=graph,
        base_mva=100.0,
        slack=SlackSpec(node_id="slack", u_pu=1.0, angle_rad=0.0),
        pq=[PQSpec(node_id="pq", p_mw=p_mw, q_mvar=q_mvar)],
        options=PowerFlowOptions(flat_start=u_start_pq is None, trace_level="full"),
    )


def test_szyna_pq_zerowej_mocy_ma_rozwiazanie_zerowe_zalezne_od_startu() -> None:
    """Ta sama sieć, dwa starty, dwa RÓŻNE rozwiązania zbieżne (klasa, nie W3-G2)."""
    plaski = solve_power_flow_physics(_siec_dwuszynowa(p_mw=0.0, q_mvar=0.0, u_start_pq=None))
    assert plaski.converged
    assert plaski.node_u_mag["pq"] == pytest.approx(1.0, abs=1e-12)

    bliski_zera = solve_power_flow_physics(_siec_dwuszynowa(p_mw=0.0, q_mvar=0.0, u_start_pq=1e-3))
    assert bliski_zera.converged, "rozwiązanie zerowe JEST raportowane jako zbieżne"
    assert bliski_zera.node_u_mag["pq"] < U_ZERO_PU
    assert bliski_zera.max_mismatch < bliski_zera.nr_trace[0]["max_mismatch_pu"] or (
        bliski_zera.max_mismatch < 1e-8
    )
    # Bilans szyny bilansującej to moc zwarcia gałęzi do U = 0 (U_s²·g), nie moc odbioru.
    assert plaski.slack_power.real == pytest.approx(0.0, abs=1e-9)
    assert bliski_zera.slack_power.real > 1.0


def _wyrazy_szyny_zerowej(
    pfi: PowerFlowInput, v: np.ndarray
) -> tuple[float, float, float, float, float, float]:
    """(J_Pθ_kk, J_PV_kk, J_Qθ_kk, J_QV_kk, θ_km, J_R zamknięta postać) dla sieci dwuszynowej."""
    ybus, indeks, _, s = _ybus_i_indeksy(pfi)
    k = indeks["pq"]
    jac, _, _ = zredukowany_jakobian(pfi, v)
    theta_km = float(np.angle(v[k]) - np.angle(v[s]))
    g_km, b_km = ybus[k, s].real, ybus[k, s].imag
    u_m = abs(v[s])
    # Zamknięta postać granicy U_k → 0 (wyprowadzenie w docstringu modułu i meldunku):
    #   J_R → U_m·|Y_km|² / (G_km·sin θ_km − B_km·cos θ_km)
    zamknieta = u_m * (g_km**2 + b_km**2) / (g_km * np.sin(theta_km) - b_km * np.cos(theta_km))
    return (
        float(jac[0, 0]),
        float(jac[0, 1]),
        float(jac[1, 0]),
        float(jac[1, 1]),
        theta_km,
        float(zamknieta),
    )


def test_j_r_w_rozwiazaniu_zerowym_jest_granica_0_przez_0_o_znaku_zaleznym_od_kata() -> None:
    """W punkcie U_k = 0 wiersze ∂P_k/∂θ i ∂Q_k/∂θ znikają (~U_k), więc człon sprzęgający
    J_Qθ·J_Pθ⁻¹·J_PV jest ilorazem dwóch wielkości → 0. Granica jest skończona:

        J_R → U_m·|Y_km|² / (G_km·sin θ_km − B_km·cos θ_km),

    a jej ZNAK zależy od kąta θ_km, który w rozwiązaniu zerowym jest NIEOKREŚLONY
    (jakobian osobliwy) — o kącie decyduje droga iteracji (moduł przechodzący przez
    zero obraca fazor o π). Pomiar: start 1e-3 ląduje w θ_km = π → J_R = +3,214 > 0;
    ta sama postać w θ_km = 0 dałaby −3,214 < 0. Kryterium „wszystkie wartości własne
    J_R dodatnie" nie jest w tej klasie ani prawdziwe, ani fałszywe — jest artefaktem
    kąta."""
    pfi = _siec_dwuszynowa(p_mw=0.0, q_mvar=0.0, u_start_pq=1e-3)
    sol = solve_power_flow_physics(pfi)
    assert sol.converged and sol.node_u_mag["pq"] < U_ZERO_PU
    _, indeks, _, s = _ybus_i_indeksy(pfi)
    v = _wektor_napiec(sol, indeks)
    j_pth, j_pv, j_qth, j_qv, theta_km, zamknieta = _wyrazy_szyny_zerowej(pfi, v)
    # Wiersze kątowe szyny zerowej ~ U_k (tu ~1e-12), wiersze napięciowe skończone.
    assert abs(j_pth) < 1e-9 and abs(j_qth) < 1e-9
    assert abs(j_pv) > 1.0 and abs(j_qv) > 1.0
    assert abs(abs(theta_km) - np.pi) < 1e-6, "pomiar: moduł przeszedł przez zero → θ_km = π"
    _, j_r, _ = zredukowany_jakobian(pfi, v)
    assert j_r.shape == (1, 1)
    assert j_r[0, 0] == pytest.approx(zamknieta, rel=1e-9)
    assert j_r[0, 0] == pytest.approx(3.2142857, abs=1e-6)
    assert j_r[0, 0] > 0.0
    # Ta sama zamknięta postać w θ_km = 0 (równie uprawnionym kącie zera) jest ujemna.
    ybus, _, _, _ = _ybus_i_indeksy(pfi)
    k = indeks["pq"]
    g_km, b_km = ybus[k, s].real, ybus[k, s].imag
    assert b_km > 0.0  # −Im(y_linii): gałąź indukcyjna
    w_zerze_kata = abs(v[s]) * (g_km**2 + b_km**2) / (-b_km)
    assert w_zerze_kata == pytest.approx(-j_r[0, 0], rel=1e-9)
    # Osobliwość jakobianu pełnego w tym punkcie.
    jac, _, _ = zredukowany_jakobian(pfi, v)
    assert np.linalg.svd(jac, compute_uv=False).min() < SIGMA_MIN_OSOBLIWY
    # Gałąź robocza (start płaski): J_R = U_m·(…) > 0 regularnie, jakobian regularny.
    plaski = solve_power_flow_physics(_siec_dwuszynowa(p_mw=0.0, q_mvar=0.0, u_start_pq=None))
    jac_p, j_r_p, _ = zredukowany_jakobian(pfi, _wektor_napiec(plaski, indeks))
    assert j_r_p[0, 0] > 0.0 and np.linalg.svd(jac_p, compute_uv=False).min() > 1.0


@pytest.mark.parametrize("u_start", [1e-4, 1e-3, 1e-2, 0.05, 0.1, 0.3])
def test_kazdy_start_ponizej_polowy_laduje_na_zerze_z_tym_samym_j_r(u_start: float) -> None:
    sol = solve_power_flow_physics(_siec_dwuszynowa(p_mw=0.0, q_mvar=0.0, u_start_pq=u_start))
    assert sol.converged and sol.node_u_mag["pq"] < U_ZERO_PU
    assert sol.slack_power.real * 100.0 == pytest.approx(138.4615, abs=1e-3)


# --- 1b. Kontrola dodatnia kryterium: PRAWDZIWA gałąź niskonapięciowa szyny obciążonej


def test_galaz_niskonapieciowa_szyny_obciazonej_ma_j_r_ujemny() -> None:
    """Klasa, na którą kryterium karty JEST celne: szyna z odbiorem 2 MW / 0,5 Mvar ze
    startu bliskiego zera zbiega (``converged=True``!) do dolnej gałęzi krzywej P–U:
    |U| = 0,00743 p.u., θ = −45,9°, moc slacka 139 MW zamiast 2 MW — i tu J_R < 0.
    W3-G2 do tej klasy NIE należy (szyna o zerowej mocy, rozwiązanie zerowe)."""
    pfi = _siec_dwuszynowa(p_mw=2.0, q_mvar=0.5, u_start_pq=1e-3)
    sol = solve_power_flow_physics(pfi)
    assert sol.converged
    assert sol.node_u_mag["pq"] == pytest.approx(7.4253e-3, rel=1e-3)
    assert sol.slack_power.real * 100.0 == pytest.approx(139.0385, abs=1e-3)
    _, indeks, _, _ = _ybus_i_indeksy(pfi)
    jac, j_r, _ = zredukowany_jakobian(pfi, _wektor_napiec(sol, indeks))
    assert j_r[0, 0] == pytest.approx(-11.14888, abs=1e-4)
    assert j_r[0, 0] < 0.0
    assert np.linalg.svd(jac, compute_uv=False).min() > 1e-3, "jakobian regularny, nie 0/0"
    # Gałąź robocza tej samej sieci: 0,99485 p.u., J_R > 0.
    robocza = solve_power_flow_physics(_siec_dwuszynowa(p_mw=2.0, q_mvar=0.5, u_start_pq=None))
    assert robocza.converged and robocza.node_u_mag["pq"] == pytest.approx(0.99485, abs=1e-5)
    _, j_r_r, _ = zredukowany_jakobian(pfi, _wektor_napiec(robocza, indeks))
    assert j_r_r[0, 0] > 0.0


def test_szyna_obciazona_nie_ma_rozwiazania_zerowego() -> None:
    """S_k ≠ 0 wyklucza U_k = 0: żaden start nie daje zbieżnego |U| < 1e-9."""
    for u_start in (1e-4, 1e-3, 1e-2, 0.1, 0.3):
        sol = solve_power_flow_physics(_siec_dwuszynowa(p_mw=2.0, q_mvar=0.5, u_start_pq=u_start))
        assert not sol.converged or sol.node_u_mag["pq"] > U_ZERO_PU


# --- 2. Zmierzony przypadek W3-G2 (receptura speca e2e 1:1) -------------------------


@pytest.fixture(scope="module")
def migawki_w3g2() -> dict[str, dict[str, Any]]:
    from api.main import app

    with TestClient(app) as klient:
        return {
            "spec": zbuduj_siec_w3g2(klient, tr1_nadpisany=True),
            "czysty": zbuduj_siec_w3g2(klient, tr1_nadpisany=False),
        }


def _wejscie(snapshot: dict[str, Any]) -> PowerFlowInput:
    from enm.assembler import zloz_wejscie_rozplywu

    wejscie = zloz_wejscie_rozplywu(snapshot, {"solver_method": "newton-raphson"})
    assert len(wejscie.wyspy) == 1
    pfi = wejscie.wyspy[0].pf_input
    pfi.options.trace_level = "full"
    return pfi


def _szyna_110(pfi: PowerFlowInput) -> str:
    return next(nid for nid, n in pfi.typed_graph().nodes.items() if n.name == NAZWA_SZYNY_110)


def test_spec_nadpisuje_parametry_630_kva_na_tr1_110_15_kv(migawki_w3g2) -> None:
    """Mechanizm W3-G2: TR1 GPZ w migawce speca ma tabliczkę 15/0,4 kV, 0,63 MVA."""
    tr1_spec = tr1_gpz(migawki_w3g2["spec"])
    assert (tr1_spec["sn_mva"], tr1_spec["uhv_kv"], tr1_spec["ulv_kv"]) == (0.63, 15.0, 0.4)
    assert tr1_spec["name"] == "TR1 110/15 kV"
    tr1_czysty = tr1_gpz(migawki_w3g2["czysty"])
    assert (tr1_czysty["sn_mva"], tr1_czysty["uhv_kv"], tr1_czysty["ulv_kv"]) == (25.0, 110.0, 15.0)


def test_w3g2_szyna_110_kv_jest_szyna_pq_zerowej_mocy(migawki_w3g2) -> None:
    """Szyna bilansująca to szyna SN GPZ; „Szyna 110 kV TR1" to szyna PQ o P = Q = 0
    zawieszona wyłącznie na TR1 — czyli dokładnie klasa z sieci dwuszynowej."""
    pfi = _wejscie(migawki_w3g2["spec"])
    szyna_110 = _szyna_110(pfi)
    assert pfi.slack.node_id != szyna_110
    spec_110 = next(s for s in pfi.pq if s.node_id == szyna_110)
    assert (spec_110.p_mw, spec_110.q_mvar) == (0.0, 0.0)
    galezie = [
        b
        for b in pfi.typed_graph().branches.values()
        if szyna_110 in (b.from_node_id, b.to_node_id)
    ]
    assert len(galezie) == 1


def test_w3g2_start_plaski_zbiega_do_rozwiazania_zerowego_a_j_r_jest_dodatni(migawki_w3g2) -> None:
    """POMIAR STOP-WARUNKU: J_R w punkcie zbieżności W3-G2 NIE ma ujemnej wartości własnej."""
    pfi = _wejscie(migawki_w3g2["spec"])
    sol = solve_power_flow_physics(pfi)
    szyna_110 = _szyna_110(pfi)
    assert sol.converged and sol.max_mismatch < pfi.options.tolerance
    assert sol.node_u_mag[szyna_110] < U_ZERO_PU
    assert sol.slack_power.real * pfi.base_mva == pytest.approx(
        SLACK_MW_ROZWIAZANIE_ZEROWE_SPEC, abs=1e-3
    )
    assert sol.init_state is not None and sol.init_state[szyna_110]["v_pu"] == 1.0
    _, indeks, _, _ = _ybus_i_indeksy(pfi)
    jac, j_r, szyny_pq = zredukowany_jakobian(pfi, _wektor_napiec(sol, indeks))
    wartosci = np.linalg.eigvals(j_r)
    assert np.abs(wartosci.imag).max() < 1e-9
    assert wartosci.real.min() > 0.0, wartosci
    assert wartosci.real.min() == pytest.approx(0.080879, abs=1e-5)
    assert szyna_110 in szyny_pq
    assert np.linalg.svd(jac, compute_uv=False).min() < SIGMA_MIN_OSOBLIWY


def test_w3g2_galaz_robocza_lezy_w_przekladni_poza_znamionowej_tr1(migawki_w3g2) -> None:
    """Start |U_110| = 5 p.u. → rozwiązanie robocze |U_110| ≈ 5,11 p.u. (przekładnia
    (15/110)/(0,4/15)), moc slacka = odbiór + straty; J_R również dodatni."""
    pfi = _wejscie(migawki_w3g2["spec"])
    szyna_110 = _szyna_110(pfi)
    v, converged, slack_mw = _rozwiaz_ze_startu(pfi, node_id=szyna_110, u_start_pu=5.0)
    assert converged
    _, indeks, _, _ = _ybus_i_indeksy(pfi)
    assert abs(v[indeks[szyna_110]]) == pytest.approx(PRZEKLADNIA_TR1_NADPISANEGO, rel=1e-3)
    assert slack_mw == pytest.approx(SLACK_MW_GALAZ_ROBOCZA, abs=1e-3)
    _, j_r, _ = zredukowany_jakobian(pfi, v)
    assert np.linalg.eigvals(j_r).real.min() > 0.0


@pytest.mark.parametrize("u_start", [0.5, 0.2, 1e-3])
def test_w3g2_starty_ponizej_przekladni_laduja_na_zerze(migawki_w3g2, u_start: float) -> None:
    pfi = _wejscie(migawki_w3g2["spec"])
    szyna_110 = _szyna_110(pfi)
    v, converged, slack_mw = _rozwiaz_ze_startu(pfi, node_id=szyna_110, u_start_pu=u_start)
    _, indeks, _, _ = _ybus_i_indeksy(pfi)
    assert converged and abs(v[indeks[szyna_110]]) < U_ZERO_PU
    assert slack_mw == pytest.approx(SLACK_MW_ROZWIAZANIE_ZEROWE_SPEC, abs=1e-3)


def test_w3g2_tr1_nietkniety_start_plaski_zbiega_do_galezi_roboczej(migawki_w3g2) -> None:
    """Z TR1 25 MVA 110/15 kV start płaski daje U_110 = 1,0 p.u. i 0,500 MW na slacku."""
    pfi = _wejscie(migawki_w3g2["czysty"])
    sol = solve_power_flow_physics(pfi)
    szyna_110 = _szyna_110(pfi)
    assert sol.converged
    assert sol.node_u_mag[szyna_110] == pytest.approx(1.0, abs=1e-9)
    assert sol.slack_power.real * pfi.base_mva == pytest.approx(SLACK_MW_GALAZ_ROBOCZA, abs=1e-3)
    _, indeks, _, _ = _ybus_i_indeksy(pfi)
    _, j_r, _ = zredukowany_jakobian(pfi, _wektor_napiec(sol, indeks))
    assert np.linalg.eigvals(j_r).real.min() > 0.0


def test_w3g2_tr1_nietkniety_start_bliski_zera_dalej_laduje_na_zerze(migawki_w3g2) -> None:
    """Klasa, nie fikstura: także z poprawnym TR1 rozwiązanie zerowe istnieje i jest
    raportowane jako zbieżne (moc slacka = moc zwarcia TR1 ≈ U²/Z_T)."""
    pfi = _wejscie(migawki_w3g2["czysty"])
    szyna_110 = _szyna_110(pfi)
    v, converged, slack_mw = _rozwiaz_ze_startu(pfi, node_id=szyna_110, u_start_pu=1e-3)
    _, indeks, _, _ = _ybus_i_indeksy(pfi)
    assert converged and abs(v[indeks[szyna_110]]) < U_ZERO_PU
    assert slack_mw == pytest.approx(10.4176, abs=1e-3)
    _, j_r, _ = zredukowany_jakobian(pfi, v)
    assert np.linalg.eigvals(j_r).real.min() > 0.0
