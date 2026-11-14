"""Rozpływ mocy z zamkniętym łącznikiem = rozpływ z węzłami scalonymi (karta scalenia łączników).

CO SIĘ ZMIENIŁO I DLACZEGO. Rozpływ NR/GS/FD modelował zamknięty łącznik impedancją zastępczą
0,0001 + j0,0001 Ω, a sieć zwarciowa IEC 60909 — scaleniem węzłów. Dodanie zamkniętego
wyłącznika do pola zmieniało więc napięcia rozpływu (3·10⁻⁵ j.w.) i moc bierną (5·10⁻³ Mvar).
Teraz rozpływ liczy na węzłach elektrycznych (`power_flow_scalenie`), a przepływ łącznika
odtwarza z bilansu mocy węzłów grupy.

WYROCZNIA NIEZMIENNIKA (dowód pkt 2 karty). Sieć X vs sieć X z węzłem rozdzielonym zamkniętym
łącznikiem (podział szyny): |ΔU| ≤ 1e-10 j.w., |Δkąt| ≤ 1e-8°, |ΔP|, |ΔQ| ≤ 1e-7 MW/Mvar.
ILOCZYN CECH: metoda {NR, GS, FD} × typ węzła rozdzielonego {bilansujący, PV, PQ} × topologia
{promieniowa, pętla} × układ łączników {jeden łącznik, łańcuch dwóch, pętla z dwóch, łącznik
równoległy do gałęzi}. Test był CZERWONY przed kartą (impedancja zastępcza) — iniekcja
`test_iniekcja_impedancji_zastepczej_czerwieni_wyrocznie` odtwarza dawny stempel.
"""

from __future__ import annotations

import cmath
import copy
import itertools
import math
from typing import Any

import numpy as np
import pytest
from network_model.core.branch import BranchType, LineBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from network_model.core.scalenie_lacznikow import scal_laczniki
from network_model.core.switch import Switch, SwitchState, SwitchType
from network_model.core.ybus import AdmittanceMatrixBuilder
from network_model.solvers import power_flow_newton_internal as rdzen
from network_model.solvers.power_flow_fast_decoupled import PowerFlowFastDecoupledSolver
from network_model.solvers.power_flow_gauss_seidel import PowerFlowGaussSeidelSolver
from network_model.solvers.power_flow_newton import PowerFlowNewtonSolver
from network_model.solvers.power_flow_scalenie import (
    KOD_LACZNIK_ROZNE_NAPIECIA,
    KOD_NASTAWY_NAPIECIA_SPRZECZNE,
    KOD_WEZEL_NAPIECIOWY_SCALONY_Z_BILANSUJACYM,
    METODA_PRZEPLYWU_DRZEWO,
    METODA_PRZEPLYWU_PETLA,
    zredukuj_pv,
)
from network_model.solvers.power_flow_types import (
    PowerFlowInput,
    PowerFlowOptions,
    PQSpec,
    PVSpec,
    ShuntSpec,
)
from network_model.solvers.power_flow_types import SlackSpec as Bilansujacy

PROG_U_PU = 1e-10
PROG_KAT_DEG = 1e-8
PROG_MOC = 1e-7  # MW / Mvar
U_KV = 15.0
BASE_MVA = 10.0

METODY = {
    "NR": lambda pfi: PowerFlowNewtonSolver().solve(pfi),
    "GS": lambda pfi: PowerFlowGaussSeidelSolver().solve(pfi),
    "FD": lambda pfi: PowerFlowFastDecoupledSolver().solve(pfi),
}
TOLERANCJA_METODY = {"NR": 1e-12, "GS": 1e-13, "FD": 1e-13}
ITERACJE_METODY = {"NR": 50, "GS": 20000, "FD": 2000}

#: Węzeł dzielony dla każdego typu: bilansujący S, PV G, PQ A.
WEZEL_TYPU = {"bilansujacy": "S", "PV": "G", "PQ": "A"}


def _wezel(ident: str, typ: NodeType) -> Node:
    if typ == NodeType.SLACK:
        return Node(
            id=ident,
            name=ident,
            node_type=typ,
            voltage_level=U_KV,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    if typ == NodeType.PV:
        return Node(
            id=ident,
            name=ident,
            node_type=typ,
            voltage_level=U_KV,
            voltage_magnitude=1.02,
            active_power=1.0,
        )
    return Node(
        id=ident,
        name=ident,
        node_type=typ,
        voltage_level=U_KV,
        active_power=0.0,
        reactive_power=0.0,
    )


def _linia(ident: str, od: str, do: str, dlugosc_km: float, b_us: float = 0.0) -> LineBranch:
    return LineBranch(
        id=ident,
        name=ident,
        branch_type=BranchType.CABLE,
        from_node_id=od,
        to_node_id=do,
        # R/X < 1: rozpływ szybki odsprzężony (XB) zbieżny w całym iloczynie.
        r_ohm_per_km=0.12,
        x_ohm_per_km=0.35,
        b_us_per_km=b_us,
        length_km=dlugosc_km,
        rated_current_a=300.0,
    )


def _lacznik(
    ident: str, od: str, do: str, *, stan: SwitchState = SwitchState.CLOSED, w_ruchu: bool = True
) -> Switch:
    return Switch(
        id=ident,
        name=ident,
        from_node_id=od,
        to_node_id=do,
        switch_type=SwitchType.BREAKER,
        state=stan,
        in_service=w_ruchu,
    )


#: Gałęzie sieci X: (id, od, do, długość km, B µS/km). Pętla dokłada L_CS.
GALEZIE_X = (
    ("L_SA", "S", "A", 2.0, 250.0),
    ("L_AB", "A", "B", 1.5, 250.0),
    ("L_BG", "B", "G", 1.0, 0.0),
    ("L_GC", "G", "C", 2.5, 250.0),
    ("L_AC", "A", "C", 3.0, 0.0),
)
GALAZ_PETLI = ("L_CS", "C", "S", 4.0, 250.0)

#: Zadania sieci X (odbiór dodatni = pobór).
ODBIORY_X = {"A": (2.0, 0.8), "B": (1.5, 0.5), "C": (1.0, 0.3)}
#: Granice Q źródła PV szerokie (±30 Mvar): wyrocznia niezmiennika bada scalenie, nie
#: przełączenie PV→PQ (to ma osobne testy granic w grupie niżej).
PV_X = ("G", -1.0, 1.02, -30.0, 30.0)
BOCZNIK_X = ("B", 0.0, 0.02)


def siec_x(topologia: str) -> tuple[NetworkGraph, list[PQSpec], list[PVSpec], list[ShuntSpec]]:
    graf = NetworkGraph()
    graf.add_node(_wezel("S", NodeType.SLACK))
    for ident in ("A", "B", "C"):
        graf.add_node(_wezel(ident, NodeType.PQ))
    graf.add_node(_wezel("G", NodeType.PV))
    galezie = GALEZIE_X if topologia == "petla" else GALEZIE_X[:-1]
    if topologia == "petla":
        galezie = (*galezie, GALAZ_PETLI)
    for ident, od, do, dl, b in galezie:
        graf.add_branch(_linia(ident, od, do, dl, b))
    pq = [PQSpec(node_id=w, p_mw=p, q_mvar=q) for w, (p, q) in ODBIORY_X.items()]
    pv = [
        PVSpec(node_id=PV_X[0], p_mw=PV_X[1], u_pu=PV_X[2], q_min_mvar=PV_X[3], q_max_mvar=PV_X[4])
    ]
    boczniki = [ShuntSpec(node_id=BOCZNIK_X[0], g_pu=BOCZNIK_X[1], b_pu=BOCZNIK_X[2])]
    return graf, pq, pv, boczniki


#: Odbiór dołożony do węzła nowego grupy z węzłem bilansującym albo PV [MW, Mvar].
ODBIOR_W_GRUPIE = (0.4, 0.1)


def podziel(
    graf: NetworkGraph,
    pq: list[PQSpec],
    pv: list[PVSpec],
    wezel: str,
    uklad: str,
) -> tuple[NetworkGraph, list[PQSpec], list[PVSpec], str]:
    """Sieć X z węzłem `wezel` rozdzielonym zamkniętymi łącznikami (podział szyny).

    Gałęzie węzła o identyfikatorze innym niż pierwszy przechodzą na węzeł nowy. Fizycznie
    to TA SAMA sieć co X, a grupa niesie typ nadrzędny i odbiór naraz:
    * węzeł PQ — jego odbiór dzieli się na dwie części (część na węźle nowym);
    * węzeł PV — węzeł nowy dostaje odbiór `ODBIOR_W_GRUPIE`, a źródło PV tyle samo więcej
      mocy czynnej (wstrzyknięcie netto węzła elektrycznego bez zmian; moc bierna źródła
      rośnie o Q odbioru — `przesuniecia`);
    * węzeł bilansujący — węzeł nowy dostaje odbiór `ODBIOR_W_GRUPIE` (napięcie trzyma sieć
      zasilająca, więc sieć za węzłem bez zmian, a moc źródła rośnie o moc odbioru).
    """
    nowy = f"{wezel}_B"
    wynik = NetworkGraph()
    for _ident, wezel_x in sorted(graf.nodes.items()):
        wynik.add_node(copy.deepcopy(wezel_x))
    wynik.add_node(_wezel(nowy, NodeType.PQ))
    incydentne = sorted(
        g for g, galaz in graf.branches.items() if wezel in (galaz.from_node_id, galaz.to_node_id)
    )
    przeniesione = set(incydentne[1:])
    for ident, galaz in sorted(graf.branches.items()):
        kopia = copy.deepcopy(galaz)
        if ident in przeniesione:
            if kopia.from_node_id == wezel:
                kopia.from_node_id = nowy
            else:
                kopia.to_node_id = nowy
        wynik.add_branch(kopia)
    if uklad == "jeden":
        wynik.add_switch(_lacznik("Q1", wezel, nowy))
    elif uklad == "lancuch":
        posredni = f"{wezel}_A"
        wynik.add_node(_wezel(posredni, NodeType.PQ))
        wynik.add_switch(_lacznik("Q1", wezel, posredni))
        wynik.add_switch(_lacznik("Q2", posredni, nowy))
    elif uklad == "petla":
        wynik.add_switch(_lacznik("Q1", wezel, nowy))
        wynik.add_switch(_lacznik("Q2", nowy, wezel))
    elif uklad == "rownolegly":
        wynik.add_switch(_lacznik("Q1", wezel, nowy))
        wynik.add_branch(_linia("L_ROWN", wezel, nowy, 0.3, 250.0))
    else:
        raise AssertionError(uklad)

    nowe_pq: list[PQSpec] = []
    for spec in pq:
        if spec.node_id == wezel:
            nowe_pq.append(PQSpec(node_id=wezel, p_mw=1.2, q_mvar=0.5))
            nowe_pq.append(PQSpec(node_id=nowy, p_mw=spec.p_mw - 1.2, q_mvar=spec.q_mvar - 0.5))
            continue
        nowe_pq.append(spec)
    if uklad == "lancuch":
        # Każdy węzeł PQ ma zadanie (jak w złożeniu wejścia z modelu, `enm/assembler.py`).
        nowe_pq.append(PQSpec(node_id=f"{wezel}_A", p_mw=0.0, q_mvar=0.0))
    nowe_pv = list(pv)
    if wezel in ("S", "G"):
        nowe_pq.append(PQSpec(node_id=nowy, p_mw=ODBIOR_W_GRUPIE[0], q_mvar=ODBIOR_W_GRUPIE[1]))
    if wezel == "G":
        nowe_pv = [
            PVSpec(
                node_id=spec.node_id,
                p_mw=spec.p_mw - ODBIOR_W_GRUPIE[0],
                u_pu=spec.u_pu,
                q_min_mvar=spec.q_min_mvar,
                q_max_mvar=spec.q_max_mvar,
            )
            for spec in pv
        ]
    return wynik, nowe_pq, nowe_pv, nowy


def przesuniecia(wezel: str) -> tuple[complex, float]:
    """(moc źródła bilansującego, moc bierna PV) sieci podzielonej MINUS sieci X [MVA, Mvar]."""
    odbior = complex(*ODBIOR_W_GRUPIE)
    if wezel == "S":
        return odbior, 0.0
    if wezel == "G":
        return 0j, odbior.imag
    return 0j, 0.0


def _wejscie(
    graf: NetworkGraph,
    pq: list[PQSpec],
    pv: list[PVSpec],
    boczniki: list[ShuntSpec],
    metoda: str,
) -> PowerFlowInput:
    return PowerFlowInput(
        graph=graf,
        base_mva=BASE_MVA,
        slack=Bilansujacy(node_id="S", u_pu=1.0, angle_rad=0.0),
        pq=pq,
        pv=pv,
        shunts=boczniki,
        options=PowerFlowOptions(
            tolerance=TOLERANCJA_METODY[metoda],
            max_iter=ITERACJE_METODY[metoda],
            trace_level="full",
        ),
    )


def roznice(
    x: Any, podzielona: Any, wezel: str, nowy: str, *, straty_galezi_wewnetrznej: complex = 0j
) -> dict[str, float]:
    """Największe różnice wielkości wspólnych sieci X i sieci podzielonej.

    `straty_galezi_wewnetrznej` [MVA] — moc gałęzi, której oba końce leżą w grupie (w sieci X
    jej susceptancja jest bocznikiem węzła, więc nie wchodzi do sumy strat gałęzi).
    """
    wynik = {"u": 0.0, "kat": 0.0, "moc": 0.0}
    for node_id, napiecie in x.node_voltage.items():
        for porownywany in (node_id, *((nowy,) if node_id == wezel else ())):
            druga = podzielona.node_voltage[porownywany]
            wynik["u"] = max(wynik["u"], abs(abs(druga) - abs(napiecie)))
            wynik["kat"] = max(
                wynik["kat"], abs(math.degrees(cmath.phase(druga) - cmath.phase(napiecie)))
            )
    for slownik in ("branch_s_from_mva", "branch_s_to_mva"):
        for branch_id, moc in getattr(x, slownik).items():
            druga = getattr(podzielona, slownik)[branch_id]
            wynik["moc"] = max(wynik["moc"], abs(druga.real - moc.real), abs(druga.imag - moc.imag))
    ds, dq = przesuniecia(wezel)
    wynik["moc"] = max(
        wynik["moc"],
        abs((podzielona.slack_power - x.slack_power) * BASE_MVA - ds),
        abs((podzielona.losses_total - x.losses_total) * BASE_MVA - straty_galezi_wewnetrznej),
        abs(
            (
                podzielona.node_q_spec_effective_pu.get("G", 0.0)
                - x.node_q_spec_effective_pu.get("G", 0.0)
            )
            * BASE_MVA
            - dq
        ),
    )
    return wynik


ILOCZYN = list(
    itertools.product(
        sorted(METODY), sorted(WEZEL_TYPU), ("promieniowa", "petla"), ("jeden", "lancuch", "petla")
    )
)


@pytest.mark.parametrize(
    ("metoda", "typ", "topologia", "uklad"), ILOCZYN, ids=["-".join(c) for c in ILOCZYN]
)
def test_podzial_szyny_zamknietym_lacznikiem_nie_zmienia_rozplywu(
    metoda: str, typ: str, topologia: str, uklad: str
) -> None:
    graf, pq, pv, boczniki = siec_x(topologia)
    wezel = WEZEL_TYPU[typ]
    graf_p, pq_p, pv_p, nowy = podziel(graf, pq, pv, wezel, uklad)
    x = METODY[metoda](_wejscie(graf, pq, pv, boczniki, metoda))
    podzielona = METODY[metoda](_wejscie(graf_p, pq_p, pv_p, boczniki, metoda))
    assert x.converged and podzielona.converged
    r = roznice(x, podzielona, wezel, nowy)
    assert r["u"] <= PROG_U_PU, r
    assert r["kat"] <= PROG_KAT_DEG, r
    assert r["moc"] <= PROG_MOC, r
    # Węzły grupy mają TO SAMO napięcie zespolone (bitowo — jeden węzeł elektryczny).
    grupa = [w for w in podzielona.node_voltage if w.startswith(wezel)]
    assert len({podzielona.node_voltage[w] for w in grupa}) == 1


@pytest.mark.parametrize("metoda", sorted(METODY))
@pytest.mark.parametrize("typ", sorted(WEZEL_TYPU))
def test_lacznik_rownolegly_do_galezi(metoda: str, typ: str) -> None:
    """Gałąź równoległa do zamkniętego łącznika: oba końce w jednym węźle elektrycznym —
    nie przenosi mocy czynnej, a jej susceptancja zostaje na węźle (2·B/2).

    Wyrocznia: sieć X z BOCZNIKIEM o tej samej susceptancji w węźle dzielonym — fizycznie ta
    sama sieć, więc cała wyrocznia niezmiennika (napięcia, przepływy, moce źródeł) obowiązuje.
    """
    graf, pq, pv, boczniki = siec_x("petla")
    wezel = WEZEL_TYPU[typ]
    graf_p, pq_p, pv_p, nowy = podziel(graf, pq, pv, wezel, "rownolegly")
    galaz = graf_p.branches["L_ROWN"]
    z_base = U_KV**2 / BASE_MVA
    b_pu = 2.0 * galaz.get_shunt_admittance_per_end().imag * z_base
    boczniki_x = [*boczniki, ShuntSpec(node_id=wezel, g_pu=0.0, b_pu=b_pu)]
    x = METODY[metoda](_wejscie(graf, pq, pv, boczniki_x, metoda))
    podzielona = METODY[metoda](_wejscie(graf_p, pq_p, pv_p, boczniki, metoda))
    assert x.converged and podzielona.converged
    s_od = podzielona.branch_s_from_mva["L_ROWN"]
    s_do = podzielona.branch_s_to_mva["L_ROWN"]
    r = roznice(x, podzielona, wezel, nowy, straty_galezi_wewnetrznej=s_od + s_do)
    assert r["u"] <= PROG_U_PU and r["kat"] <= PROG_KAT_DEG and r["moc"] <= PROG_MOC, r
    u = abs(podzielona.node_voltage[wezel])
    assert abs(s_od.real) <= 1e-12 and abs(s_do.real) <= 1e-12
    assert s_od.imag + s_do.imag == pytest.approx(-b_pu * u**2 * BASE_MVA, abs=1e-12)


def _slad_scalenia(rozwiazanie: Any) -> dict[str, Any]:
    slad = rozwiazanie.ybus_trace["scalenie_lacznikow"]
    assert isinstance(slad, dict)
    return slad


@pytest.mark.parametrize("metoda", sorted(METODY))
def test_przeplyw_lacznika_z_bilansu_wezla(metoda: str) -> None:
    """Łącznik w drzewie: moc = moc gałęzi i odbioru za łącznikiem (I prawo Kirchhoffa)."""
    graf, pq, pv, boczniki = siec_x("promieniowa")
    graf_p, pq_p, pv_p, nowy = podziel(graf, pq, pv, "A", "lancuch")
    wynik = METODY[metoda](_wejscie(graf_p, pq_p, pv_p, boczniki, metoda))
    slad = _slad_scalenia(wynik)
    (grupa,) = slad["grupy"]
    assert grupa["reprezentant"] == "A"
    assert grupa["czlonkowie"] == ["A", "A_A", "A_B"]
    assert grupa["laczniki"] == ["Q1", "Q2"]
    assert grupa["metoda_przeplywu"] == METODA_PRZEPLYWU_DRZEWO
    assert grupa["rezyduum_bilansu_mva"] <= 1e-9
    po_id = {wpis["switch_id"]: wpis for wpis in slad["laczniki"]}
    # Za A_B: gałęzie przeniesione (L_AC — druga z incydentnych A po L_AB) i odbiór 0,8/0,3.
    s_za = complex(0.8, 0.3)
    for branch_id, galaz in graf_p.branches.items():
        if galaz.from_node_id == nowy:
            s_za += wynik.branch_s_from_mva[branch_id]
        if galaz.to_node_id == nowy:
            s_za += wynik.branch_s_to_mva[branch_id]
    for ident in ("Q1", "Q2"):
        assert po_id[ident]["p_from_mw"] == pytest.approx(s_za.real, abs=1e-9)
        assert po_id[ident]["q_from_mvar"] == pytest.approx(s_za.imag, abs=1e-9)
        prad_ka = abs(s_za) / (math.sqrt(3.0) * abs(wynik.node_voltage["A"]) * U_KV)
        assert po_id[ident]["i_ka"] == pytest.approx(prad_ka, rel=1e-9)


@pytest.mark.parametrize("metoda", sorted(METODY))
def test_przeplyw_w_petli_lacznikow_najmniejsza_norma(metoda: str) -> None:
    """Pętla łączników: KCL nie wyznacza rozdziału — dwa łączniki równoległe niosą po połowie."""
    graf, pq, pv, boczniki = siec_x("promieniowa")
    graf_p, pq_p, pv_p, nowy = podziel(graf, pq, pv, "A", "petla")
    wynik = METODY[metoda](_wejscie(graf_p, pq_p, pv_p, boczniki, metoda))
    slad = _slad_scalenia(wynik)
    (grupa,) = slad["grupy"]
    assert grupa["metoda_przeplywu"] == METODA_PRZEPLYWU_PETLA
    assert "najmniejszej normie" in grupa["metoda_przeplywu"]
    po_id = {wpis["switch_id"]: wpis for wpis in slad["laczniki"]}
    # Q1: A → A_B, Q2: A_B → A (przeciwnie) — równy podział = moce przeciwnych znaków.
    assert po_id["Q1"]["p_from_mw"] == pytest.approx(-po_id["Q2"]["p_from_mw"], abs=1e-12)
    assert po_id["Q1"]["q_from_mvar"] == pytest.approx(-po_id["Q2"]["q_from_mvar"], abs=1e-12)
    s_za = complex(0.8, 0.3)
    for branch_id, galaz in graf_p.branches.items():
        if galaz.from_node_id == nowy:
            s_za += wynik.branch_s_from_mva[branch_id]
        if galaz.to_node_id == nowy:
            s_za += wynik.branch_s_to_mva[branch_id]
    assert po_id["Q1"]["p_from_mw"] - po_id["Q2"]["p_from_mw"] == pytest.approx(s_za.real, abs=1e-9)


def test_dwa_pv_o_zgodnych_nastawach_w_jednym_wezle() -> None:
    """PV + PV zgodne: łączna moc bierna = moc PV sieci X, podział wg reguły MATPOWER."""
    graf, pq, pv, boczniki = siec_x("petla")
    # Łańcuch G — G_A — G_B: źródła PV w G i G_A, odbiór 0,4/0,1 w G_B (`podziel`).
    graf_p, pq_p, _pv, nowy = podziel(graf, pq, pv, "G", "lancuch")
    drugi = "G_A"
    pq_p = [spec for spec in pq_p if spec.node_id != drugi]  # G_A staje się węzłem PV
    # Łącznie 1,4 MW = 1,0 MW źródła sieci X + 0,4 MW odbioru G_B; granice szerokie (±10,
    # ±20 Mvar) — bez przełączenia PV→PQ.
    pv_p = [
        PVSpec(node_id="G", p_mw=-0.84, u_pu=1.02, q_min_mvar=-10.0, q_max_mvar=10.0),
        PVSpec(node_id=drugi, p_mw=-0.56, u_pu=1.02, q_min_mvar=-20.0, q_max_mvar=20.0),
    ]
    for metoda in sorted(METODY):
        x = METODY[metoda](_wejscie(graf, pq, pv, boczniki, metoda))
        podzielona = METODY[metoda](_wejscie(graf_p, pq_p, pv_p, boczniki, metoda))
        r = roznice(x, podzielona, "G", nowy)
        assert r["u"] <= PROG_U_PU and r["kat"] <= PROG_KAT_DEG, (metoda, r)
        q_g = podzielona.node_q_spec_effective_pu["G"] * BASE_MVA
        q_b = podzielona.node_q_spec_effective_pu[drugi] * BASE_MVA
        q_x = x.node_q_spec_effective_pu["G"] * BASE_MVA
        # Bilans grupy (odbiór 0,4/0,1 na G_B): źródła razem = źródło sieci X + Q odbioru.
        assert q_g + q_b == pytest.approx(q_x + ODBIOR_W_GRUPIE[1], abs=PROG_MOC), metoda
        # Ten sam ułamek przedziału [Q_min, Q_max] obu źródeł (reguła MATPOWER).
        assert (q_g + 10.0) / 20.0 == pytest.approx((q_b + 20.0) / 40.0, abs=1e-9), metoda
        p_g = podzielona.node_p_spec_effective_pu["G"] * BASE_MVA
        p_b = podzielona.node_p_spec_effective_pu[drugi] * BASE_MVA
        assert p_g == pytest.approx(0.84, abs=1e-7) and p_b == pytest.approx(0.56, abs=1e-7)


@pytest.mark.parametrize("metoda", ["GS", "FD"])
def test_granica_q_dotyczy_zrodla_nie_wezla_elektrycznego(metoda: str) -> None:
    """Granice Q źródła PV w grupie z odbiorem: porównuje się moc ŹRÓDŁA (moc węzła
    elektrycznego − moc pozostałych węzłów grupy), nie moc węzła.

    Wyrocznia: sieć X z granicami węzła przesuniętymi o Q odbioru grupy ([−2,1; 4,9] Mvar)
    = sieć podzielona z granicami źródła [−2,0; 5,0] Mvar i odbiorem 0,1 Mvar w grupie —
    fizycznie ten sam węzeł; zapotrzebowanie 6,15 Mvar przekracza granicę górną w obu.
    Metody GS/FD: granice niesymetryczne (NR — test niżej, granice symetryczne źródła).
    """
    graf, pq, _pv, boczniki = siec_x("petla")
    pv_x = [PVSpec(node_id="G", p_mw=-1.0, u_pu=1.02, q_min_mvar=-2.1, q_max_mvar=4.9)]
    graf_p, pq_p, _pv_p, nowy = podziel(graf, pq, pv_x, "G", "jeden")
    pv_p = [PVSpec(node_id="G", p_mw=-1.4, u_pu=1.02, q_min_mvar=-2.0, q_max_mvar=5.0)]
    x = METODY[metoda](_wejscie(graf, pq, pv_x, boczniki, metoda))
    podzielona = METODY[metoda](_wejscie(graf_p, pq_p, pv_p, boczniki, metoda))
    assert x.converged and podzielona.converged
    assert x.node_q_spec_effective_pu["G"] * BASE_MVA == pytest.approx(4.9, abs=1e-9)
    assert podzielona.node_q_spec_effective_pu["G"] * BASE_MVA == pytest.approx(5.0, abs=1e-9)
    r = roznice(x, podzielona, "G", nowy)
    assert r["u"] <= PROG_U_PU and r["kat"] <= PROG_KAT_DEG and r["moc"] <= PROG_MOC, r


def test_granica_q_zrodla_w_grupie_nr() -> None:
    """NR: źródło PV w grupie z odbiorem 0,1 Mvar ograniczone DOKŁADNIE do swojej granicy
    (5,0 Mvar), a węzeł elektryczny oddaje 4,9 Mvar netto."""
    graf, pq, pv, boczniki = siec_x("petla")
    graf_p, pq_p, _pv_p, _nowy = podziel(graf, pq, pv, "G", "jeden")
    pv_p = [PVSpec(node_id="G", p_mw=-1.4, u_pu=1.02, q_min_mvar=-5.0, q_max_mvar=5.0)]
    wynik = PowerFlowNewtonSolver().solve(_wejscie(graf_p, pq_p, pv_p, boczniki, "NR"))
    assert wynik.converged
    assert [s["node_id"] for s in wynik.pv_to_pq_switches] == ["G"]
    assert wynik.node_q_spec_effective_pu["G"] * BASE_MVA == pytest.approx(5.0, abs=1e-9)
    assert abs(wynik.node_voltage["G"]) < 1.02


@pytest.mark.parametrize("metoda", sorted(METODY))
def test_dwa_pv_o_sprzecznych_nastawach_to_odmowa(metoda: str) -> None:
    graf, pq, pv, boczniki = siec_x("petla")
    graf_p, pq_p, _pv, _nowy = podziel(graf, pq, pv, "G", "lancuch")
    pq_p = [spec for spec in pq_p if spec.node_id != "G_A"]  # G_A staje się węzłem PV
    pv_p = [
        PVSpec(node_id="G", p_mw=-0.84, u_pu=1.02, q_min_mvar=-10.0, q_max_mvar=10.0),
        PVSpec(node_id="G_A", p_mw=-0.56, u_pu=1.03, q_min_mvar=-20.0, q_max_mvar=20.0),
    ]
    pfi = _wejscie(graf_p, pq_p, pv_p, boczniki, metoda)
    _, odmowy = rdzen.odmowy_wejscia(pfi)
    assert [o.kod for o in odmowy] == [KOD_NASTAWY_NAPIECIA_SPRZECZNE]
    assert {o.ref for o in odmowy[0].odwolania} == {"G", "G_A"}
    with pytest.raises(ValueError, match="różne nastawy napięcia"):
        METODY[metoda](pfi)
    # Ścieżka bez walidacji (`validate=False`) też odmawia — przygotowanie wyspy woła ten sam
    # predykat, a redukcja nastaw nie wybiera po cichu jednej z nich.
    pfi.options.validate = False
    with pytest.raises(rdzen.OdmowaWejsciaRdzenia) as blad:
        METODY[metoda](pfi)
    assert [r.kod for r in blad.value.rekordy] == [KOD_NASTAWY_NAPIECIA_SPRZECZNE]


def test_pv_scalony_z_bilansujacym_to_odmowa() -> None:
    graf, pq, pv, boczniki = siec_x("petla")
    graf.add_switch(_lacznik("Q_SG", "S", "G"))
    _, odmowy = rdzen.odmowy_wejscia(_wejscie(graf, pq, pv, boczniki, "NR"))
    assert [o.kod for o in odmowy] == [KOD_WEZEL_NAPIECIOWY_SCALONY_Z_BILANSUJACYM]


@pytest.mark.parametrize("stan", ["zamkniety", "otwarty"])
def test_lacznik_miedzy_roznymi_napieciami_to_odmowa_tylko_zamkniety(stan: str) -> None:
    graf, pq, pv, boczniki = siec_x("petla")
    graf.add_node(
        Node(
            id="NN",
            name="NN",
            node_type=NodeType.PQ,
            voltage_level=0.4,
            active_power=0.0,
            reactive_power=0.0,
        )
    )
    graf.add_branch(_linia("L_NN", "C", "NN", 0.1))
    graf.add_switch(
        _lacznik(
            "Q_ZLY",
            "A",
            "NN",
            stan=SwitchState.CLOSED if stan == "zamkniety" else SwitchState.OPEN,
        )
    )
    _, odmowy = rdzen.odmowy_wejscia(_wejscie(graf, pq, pv, boczniki, "NR"))
    kody = [o.kod for o in odmowy]
    if stan == "zamkniety":
        assert kody == [KOD_LACZNIK_ROZNE_NAPIECIA]
        assert "0.4 kV, 15 kV" in odmowy[0].tresc
    else:
        assert KOD_LACZNIK_ROZNE_NAPIECIA not in kody


@pytest.mark.parametrize(
    ("stan", "w_ruchu"),
    [(SwitchState.OPEN, True), (SwitchState.CLOSED, False)],
    ids=["otwarty", "wylaczony_z_eksploatacji"],
)
def test_lacznik_nieprzewodzacy_nie_scala(stan: SwitchState, w_ruchu: bool) -> None:
    """Łącznik otwarty albo poza eksploatacją równolegle do gałęzi: węzły osobne, gałąź
    przenosi moc, brak grupy w śladzie — i macierz jest bitowo ta sama co bez łącznika."""
    graf, pq, pv, boczniki = siec_x("petla")
    graf.add_switch(_lacznik("Q_AB", "A", "B", stan=stan, w_ruchu=w_ruchu))
    bez, *_ = siec_x("petla")
    z_lacznikiem = PowerFlowNewtonSolver().solve(_wejscie(graf, pq, pv, boczniki, "NR"))
    bez_lacznika = PowerFlowNewtonSolver().solve(_wejscie(bez, pq, pv, boczniki, "NR"))
    assert "scalenie_lacznikow" not in z_lacznikiem.ybus_trace
    assert z_lacznikiem.node_voltage == bez_lacznika.node_voltage
    assert z_lacznikiem.node_voltage["A"] != z_lacznikiem.node_voltage["B"]
    assert abs(z_lacznikiem.branch_s_from_mva["L_AB"]) > 0.1


def test_wyspa_lacznikow_bez_zasilania() -> None:
    """Węzły połączone wyłącznie łącznikami, bez połączenia z siecią zasilającą: poza wyspą
    zasilaną (status „nie rozwiązano”, napięcie NaN), żadna grupa nie wchodzi do macierzy."""
    graf, pq, pv, boczniki = siec_x("petla")
    for ident in ("W1", "W2", "W3"):
        graf.add_node(_wezel(ident, NodeType.PQ))
    graf.add_switch(_lacznik("QW1", "W1", "W2"))
    graf.add_switch(_lacznik("QW2", "W2", "W3"))
    graf.add_switch(_lacznik("QW3", "W3", "W1"))
    bez, *_ = siec_x("petla")
    for metoda in sorted(METODY):
        wynik = METODY[metoda](_wejscie(graf, pq, pv, boczniki, metoda))
        odniesienie = METODY[metoda](_wejscie(bez, pq, pv, boczniki, metoda))
        assert wynik.converged
        assert wynik.not_solved_nodes == ["W1", "W2", "W3"]
        assert all(math.isnan(wynik.node_u_mag[w]) for w in ("W1", "W2", "W3"))
        assert "scalenie_lacznikow" not in wynik.ybus_trace
        assert {w: wynik.node_voltage[w] for w in odniesienie.node_voltage} == (
            odniesienie.node_voltage
        )


def test_grupa_z_bilansujacym_moc_zrodla_bez_odbioru_grupy() -> None:
    """Moc źródła bilansującego = moc węzła elektrycznego − odbiór pozostałych węzłów grupy."""
    graf, pq, pv, boczniki = siec_x("petla")
    graf_p, pq_p, pv_p, nowy = podziel(graf, pq, pv, "S", "jeden")
    x = PowerFlowNewtonSolver().solve(_wejscie(graf, pq, pv, boczniki, "NR"))
    podzielona = PowerFlowNewtonSolver().solve(_wejscie(graf_p, pq_p, pv_p, boczniki, "NR"))
    assert abs((podzielona.slack_power - x.slack_power) * BASE_MVA - complex(*ODBIOR_W_GRUPIE)) <= (
        PROG_MOC
    )
    assert podzielona.node_p_spec_effective_pu[nowy] * BASE_MVA == pytest.approx(
        -ODBIOR_W_GRUPIE[0], abs=1e-12
    )


def test_slad_white_box_grup_i_determinizm() -> None:
    """Ślad niesie grupy (reprezentant + członkowie) i przepływy; dwa biegi — bitowo te same."""
    graf, pq, pv, boczniki = siec_x("petla")
    graf_p, pq_p, pv_p, _nowy = podziel(graf, pq, pv, "A", "lancuch")
    pierwszy = PowerFlowNewtonSolver().solve(_wejscie(graf_p, pq_p, pv_p, boczniki, "NR"))
    drugi = PowerFlowNewtonSolver().solve(_wejscie(graf_p, pq_p, pv_p, boczniki, "NR"))
    slad = _slad_scalenia(pierwszy)
    assert "impedancja" in slad["podstawa"].lower() or "łącznik" in slad["podstawa"].lower()
    assert pierwszy.ybus_trace == drugi.ybus_trace
    assert pierwszy.node_voltage == drugi.node_voltage
    assert pierwszy.nr_trace == drugi.nr_trace
    # Macierz ma tyle wierszy, ile węzłów elektrycznych (dwa łączniki — dwa wiersze mniej).
    assert pierwszy.ybus_trace["n"] == len(graf_p.nodes) - 2


@pytest.mark.parametrize("kolejnosc", ["rosnaco", "malejaco"])
def test_reprezentant_rozplywu_i_zwarc_ten_sam_niezaleznie_od_kolejnosci(kolejnosc: str) -> None:
    """Jedna funkcja scalenia dla rozpływu i zwarć; reprezentant — najmniejszy identyfikator."""
    graf = NetworkGraph()
    idents = ["Z3", "Z1", "Z2", "S"]
    for ident in sorted(idents, reverse=kolejnosc == "malejaco"):
        graf.add_node(_wezel(ident, NodeType.SLACK if ident == "S" else NodeType.PQ))
    laczniki = [("QA", "Z3", "Z2"), ("QB", "Z2", "Z1")]
    for ident, od, do in sorted(laczniki, reverse=kolejnosc == "malejaco"):
        graf.add_switch(_lacznik(ident, od, do))
    graf.add_branch(_linia("L", "S", "Z3", 1.0))
    scalenie = scal_laczniki(graf)
    (grupa,) = scalenie.grupy
    assert grupa.reprezentant == "Z1"
    _, indeks_pf, *_ = rdzen.build_ybus_pu(graf, sorted(graf.nodes), BASE_MVA, "S", [], {})
    zwarcia = AdmittanceMatrixBuilder(graf)
    zwarcia.build(siec_zwarciowa=False)
    for w in ("Z1", "Z2", "Z3"):
        assert indeks_pf[w] == indeks_pf["Z1"]
        assert zwarcia.node_id_to_index[w] == zwarcia.node_id_to_index["Z1"]


def test_siec_bez_lacznikow_identycznosc_sciezki() -> None:
    """Wyspa bez zamkniętego łącznika: przygotowanie oddaje te same obiekty (bit w bit)."""
    graf, pq, pv, boczniki = siec_x("petla")
    pfi = _wejscie(graf, pq, pv, boczniki, "NR")
    wyspa, _ = rdzen.build_slack_island(graf, "S")
    z = rdzen.przygotuj_rozplyw_wyspy(pfi, graf, wyspa, False)
    assert z.scalenie.trywialne
    probka = np.arange(len(wyspa), dtype=float)
    assert z.scalenie.rozwin(probka) is probka
    assert z.scalenie.zredukuj(probka) is probka
    assert zredukuj_pv(z.scalenie, {0: 1.0}, {0: (-1.0, 1.0)}) == ({0: 1.0}, {0: (-1.0, 1.0)})
    assert "scalenie_lacznikow" not in z.ybus_trace


# ---------------------------------------------------------------------------
# Iniekcje (dowód pkt 4 karty) — każda czerwieni wyrocznię albo predykat
# ---------------------------------------------------------------------------


def test_iniekcja_impedancji_zastepczej_czerwieni_wyrocznie(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Przywrócenie dawnego modelu (łącznik = 0,0001 + j0,0001 Ω, bez scalenia) — wyrocznia
    niezmiennika czerwona. To jest stan sprzed karty: test MUSIAŁ być czerwony."""
    from network_model.solvers import power_flow_scalenie

    oryginal = power_flow_scalenie.scal_laczniki

    def bez_scalenia(graph: Any, wezly: Any = None) -> Any:
        wynik = oryginal(graph, wezly)
        return type(wynik)(reprezentant={w: w for w in wynik.reprezentant}, grupy=())

    monkeypatch.setattr(power_flow_scalenie, "scal_laczniki", bez_scalenia)
    oryginal_ohm = rdzen._build_ybus_ohm

    def z_impedancja(graph: Any, node_id_to_index: Any, *args: Any, **kwargs: Any) -> Any:
        y, *reszta = oryginal_ohm(graph, node_id_to_index, *args, **kwargs)
        y_lacznika = 1.0 / complex(1e-4, 1e-4)
        for switch in graph.switches.values():
            if not (switch.in_service and switch.is_closed):
                continue
            i = node_id_to_index.get(switch.from_node_id)
            j = node_id_to_index.get(switch.to_node_id)
            if i is None or j is None:
                continue
            y[i, i] += y_lacznika
            y[j, j] += y_lacznika
            y[i, j] -= y_lacznika
            y[j, i] -= y_lacznika
        return (y, *reszta)

    monkeypatch.setattr(rdzen, "_build_ybus_ohm", z_impedancja)
    graf, pq, pv, boczniki = siec_x("petla")
    graf_p, pq_p, pv_p, nowy = podziel(graf, pq, pv, "A", "jeden")
    x = PowerFlowNewtonSolver().solve(_wejscie(graf, pq, pv, boczniki, "NR"))
    podzielona = PowerFlowNewtonSolver().solve(_wejscie(graf_p, pq_p, pv_p, boczniki, "NR"))
    r = roznice(x, podzielona, "A", nowy)
    assert r["u"] > PROG_U_PU * 100 or r["moc"] > PROG_MOC * 100, r


def test_iniekcja_reprezentant_inny_niz_najmniejszy_czerwieni_slad(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Reprezentant = ostatni członek grupy (inna reguła niż sieć zwarciowa i dynamika):
    test śladu grup (reprezentant = najmniejszy identyfikator) jest czerwony."""
    from network_model.solvers import power_flow_scalenie

    oryginal = power_flow_scalenie.scal_laczniki

    def inny_reprezentant(graph: Any, wezly: Any = None) -> Any:
        wynik = oryginal(graph, wezly)
        grupy = tuple(
            type(g)(reprezentant=g.czlonkowie[-1], czlonkowie=g.czlonkowie, laczniki=g.laczniki)
            for g in wynik.grupy
        )
        reprezentant = dict(wynik.reprezentant)
        for g in grupy:
            for w in g.czlonkowie:
                reprezentant[w] = g.reprezentant
        return type(wynik)(reprezentant=reprezentant, grupy=grupy)

    monkeypatch.setattr(power_flow_scalenie, "scal_laczniki", inny_reprezentant)
    with pytest.raises(AssertionError):
        test_przeplyw_lacznika_z_bilansu_wezla("NR")


def test_iniekcja_zgubiona_rekonstrukcja_przeplywu_czerwieni_bilans(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Rekonstrukcja przepływu bez bilansu (zera) — test bilansu łącznika czerwony."""
    from network_model.solvers import power_flow_scalenie

    oryginal = power_flow_scalenie.przeplywy_lacznikow

    def zgubiona(*args: Any, **kwargs: Any) -> Any:
        wynik = oryginal(*args, **kwargs)
        for wpis in wynik["laczniki"]:
            wpis["p_from_mw"] = 0.0
            wpis["q_from_mvar"] = 0.0
        return wynik

    monkeypatch.setattr(power_flow_scalenie, "przeplywy_lacznikow", zgubiona)
    monkeypatch.setattr(rdzen, "przeplywy_lacznikow", zgubiona)
    with pytest.raises(AssertionError):
        test_przeplyw_lacznika_z_bilansu_wezla("NR")


def test_iniekcja_pv_sprzeczne_przyjete_cicho_czerwieni_odmowe(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Predykat sprzeczności wyłączony — redukcja nastaw nie wybiera po cichu jednej z nich
    (błąd programu), a test odmowy jest czerwony."""
    from network_model.solvers import power_flow_scalenie

    monkeypatch.setattr(power_flow_scalenie, "odmowy_wezlow_napieciowych", lambda *a, **k: [])
    monkeypatch.setattr(rdzen, "odmowy_wezlow_napieciowych", lambda *a, **k: [])
    with pytest.raises(AssertionError):
        test_dwa_pv_o_sprzecznych_nastawach_to_odmowa("NR")
