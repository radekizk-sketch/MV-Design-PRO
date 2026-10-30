"""Przewód N sieci nN w rozpływie niesymetrycznym (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA,
odcinek faza N).

FIZYKA (``network_model/solvers/power_flow_unbalanced.py`` — postać Krona gałęzi): napięcia
solvera są napięciami faza–N; impedancja wzajemna Z_m = (Z0 − Z1)/3 jest w sieci nN impedancją
przewodu N (Z0 = Z1 + 3·Z_N ⇒ Z_m = Z_N). Prąd przewodu N gałęzi I_N = I_a + I_b + I_c;
potencjał przewodu N węzła V_N,do = V_N,od + Z_m·I_N, z zerem w węźle bilansującym i po
stronie transformatora z uziemionym punktem gwiazdowym (Dyn11: strona nN). Kontrakt wyniku
(``domain/result_contract_power_flow_unbalanced_v1.py``): ``u_n_pe_v`` szyny nN, ``prad_n_a``
linii/kabla nN, maksima w podsumowaniu — pola addytywne WYŁĄCZNIE dla nN.

ILOCZYN CECH: obciążenie {symetryczne, jedna faza, dwie fazy} × pasmo elementu {szyna SN,
szyna nN przy transformatorze, szyna nN na końcu obwodu; kabel SN, transformator, kabel nN}
× determinizm. Wyrocznia ręczna: Z_m kabla nN ze śladu WHITE BOX i prądy faz z kontraktu.
"""

from __future__ import annotations

import cmath
import json
import math
from typing import Any

import pytest
from enm.assembler import OdmowaWejsciaRozplywu
from enm.canonical_analysis import _wykonaj_analize_biegu
from enm.models import Bus, Cable, EnergyNetworkModel, Load

from tests.enm.test_rozplyw_niesymetryczny_bieg import bieg, siec

R1_NN, X1_NN, R0_NN, X0_NN, DL_NN_KM = 0.32, 0.08, 1.28, 0.32, 0.25


def _siec_z_obwodem_nn(odbiory: dict[str, tuple[float, float]]) -> EnergyNetworkModel:
    """Sieć biegu W5-D + obwód nN: kabel nN 250 m z szyny nN stacji do szyny odbioru
    ``b_odb``; odbiory faza–N (albo trójfazowy symetryczny ``ABC``) na końcu obwodu."""
    dane = siec(fazy="A").model_dump(mode="json")
    dane["buses"].append(Bus(ref_id="b_odb", name="Złącze nN", voltage_kv=0.4).model_dump())
    dane["branches"].append(
        Cable(
            ref_id="kab_nn",
            name="Obwód nN 1",
            from_bus_ref="b_nn",
            to_bus_ref="b_odb",
            length_km=DL_NN_KM,
            r_ohm_per_km=R1_NN,
            x_ohm_per_km=X1_NN,
            r0_ohm_per_km=R0_NN,
            x0_ohm_per_km=X0_NN,
        ).model_dump(mode="json")
    )
    dane["loads"] = [
        Load(
            ref_id=f"ld_{fazy}",
            name=f"Odbiór {fazy}",
            bus_ref="b_odb",
            p_mw=p,
            q_mvar=q,
            phases=None if fazy == "ABC" else fazy,
        ).model_dump(mode="json")
        for fazy, (p, q) in sorted(odbiory.items())
    ]
    return EnergyNetworkModel.model_validate(dane)


def _wynik(odbiory: dict[str, tuple[float, float]]) -> tuple[dict[str, Any], list[dict]]:
    run = bieg(_siec_z_obwodem_nn(odbiory))
    _wykonaj_analize_biegu(run)
    return run.raw_result["result_v1"], run.white_box_trace


@pytest.mark.parametrize(
    "odbiory",
    [
        {"ABC": (0.06, 0.02)},
        {"A": (0.02, 0.005)},
        {"A": (0.02, 0.005), "B": (0.01, 0.0)},
    ],
    ids=["symetryczny", "faza-A", "fazy-A-B"],
)
def test_przewod_n_nn_z_wyroczni(odbiory: dict[str, tuple[float, float]]) -> None:
    rv, slad = _wynik(odbiory)
    assert rv["converged"] is True
    szyny = {b["element_id"]: b for b in rv["bus_results"]}
    galezie = {g["element_id"]: g for g in rv["branch_results"]}

    # Pola przewodu N wyłącznie w paśmie nN — SN i transformator bez pól (brak ≠ zero).
    assert "u_n_pe_v" not in szyny["b_gpz"] and "u_n_pe_v" not in szyny["b_sn"]
    assert "prad_n_a" not in galezie["cab1"] and "prad_n_a" not in galezie["tr1"]
    assert "u_n_pe_v" in szyny["b_nn"] and "u_n_pe_v" in szyny["b_odb"]
    assert "prad_n_a" in galezie["kab_nn"]

    # Punkt gwiazdowy Dyn11 uziemiony: przewód N szyny nN stacji ma potencjał ziemi.
    assert szyny["b_nn"]["u_n_pe_v"] == 0.0
    # Gałąź transformatora w biegu ENM: Z0 = Z1 ⇒ Z_m = 0 (zerowanie potencjału N w szynie
    # gwiazdy rozróżnia dopiero test rdzenia poniżej).
    krok_tr = next(k for k in slad if k["key"] == "pf_unbalanced_branch[tr1]")
    assert krok_tr["result"]["z_mutual_ohm"] == {"re": 0.0, "im": 0.0}

    kabel = galezie["kab_nn"]
    odb = szyny["b_odb"]
    prady: dict[str, complex] = {}
    for faza in "abc":
        napiecie = odb[f"faza_{faza}"]
        u = cmath.rect(napiecie["u_kv"] * 1e3, math.radians(napiecie["angle_deg"]))
        p = sum(
            pq[0] / (3.0 if klucz == "ABC" else 1.0)
            for klucz, pq in odbiory.items()
            if klucz == "ABC" or klucz.lower() == faza
        )
        q = sum(
            pq[1] / (3.0 if klucz == "ABC" else 1.0)
            for klucz, pq in odbiory.items()
            if klucz == "ABC" or klucz.lower() == faza
        )
        prady[faza] = (complex(p, q) * 1e6 / u).conjugate()
        assert kabel[f"faza_{faza}"]["i_a"] == pytest.approx(abs(prady[faza]), rel=2e-3)
    i_n = abs(sum(prady.values()))
    krok = next(k for k in slad if k["key"] == "pf_unbalanced_branch[kab_nn]")
    # Ślad niesie impedancje odniesione do bazy wyspy (U_odn = napięcie szyny bilansującej);
    # wyrocznia wraca do napięcia własnego gałęzi: Z = Z'·(U_wl/U_odn)².
    odniesienie = (krok["inputs"]["napiecie_wlasne_kv"] / krok["inputs"]["base_kv_ll"]) ** 2
    z_m = (
        complex(krok["result"]["z_mutual_ohm"]["re"], krok["result"]["z_mutual_ohm"]["im"])
        * odniesienie
    )
    if "ABC" in odbiory:
        # Obciążenie symetryczne: przewód N bez prądu i bez spadku napięcia.
        assert kabel["prad_n_a"] == pytest.approx(0.0, abs=1e-3)
        assert odb["u_n_pe_v"] == pytest.approx(0.0, abs=1e-3)
        return
    # Z_m kabla nN = Z_N = (Z0 − Z1)/3 · ℓ (realny I0 — droga zamyka się w Dyn11).
    assert z_m == pytest.approx(complex(R0_NN - R1_NN, X0_NN - X1_NN) * DL_NN_KM / 3.0, rel=1e-9)
    assert kabel["prad_n_a"] == pytest.approx(i_n, rel=2e-3)
    if len(odbiory) == 1:
        # Jedna faza: prąd N = prąd fazy.
        assert kabel["prad_n_a"] == pytest.approx(kabel["faza_a"]["i_a"], abs=2e-3)
    # U_N–PE końca obwodu = |Z_N·I_N| (V_N szyny stacji = 0).
    assert odb["u_n_pe_v"] == pytest.approx(abs(z_m) * kabel["prad_n_a"], rel=2e-3)
    assert odb["u_n_pe_v"] > 0.5
    # Podsumowanie: maksima z tych samych wierszy.
    assert rv["summary"]["max_u_n_pe_v"] == odb["u_n_pe_v"]
    assert rv["summary"]["max_u_n_pe_bus_id"] == odb["bus_id"]
    assert rv["summary"]["max_prad_n_a"] == kabel["prad_n_a"]
    assert rv["summary"]["max_prad_n_branch_id"] == kabel["branch_id"]


def test_siec_bez_nn_bez_pol_przewodu_n() -> None:
    """Odbiór faza–N wprost na SN (bez gałęzi nN w obwodzie odbioru): kontrakt nie dostaje
    pól przewodu N dla SN; podsumowanie niesie maksima tylko z szyny nN stacji (zero)."""
    run = bieg(siec(fazy="A", szyna_odbioru="b_sn"))
    _wykonaj_analize_biegu(run)
    rv = run.raw_result["result_v1"]
    for szyna in rv["bus_results"]:
        assert ("u_n_pe_v" in szyna) is (szyna["element_id"] == "b_nn")
    assert all("prad_n_a" not in g for g in rv["branch_results"])
    assert "max_prad_n_a" not in rv["summary"]


def test_determinizm_przewodu_n() -> None:
    a, _ = _wynik({"A": (0.02, 0.005), "B": (0.01, 0.0)})
    b, _ = _wynik({"A": (0.02, 0.005), "B": (0.01, 0.0)})
    assert json.dumps(a, sort_keys=True, default=str) == json.dumps(b, sort_keys=True, default=str)


@pytest.mark.parametrize("uziemiona_posrednia", [False, True], ids=["bez-uziemienia", "uziemiona"])
@pytest.mark.parametrize("faza_a", [False, True], ids=["symetryczny", "faza-A"])
def test_solver_potencjal_n_zerowany_w_uziemionym_punkcie_gwiazdowym(
    uziemiona_posrednia: bool, faza_a: bool
) -> None:
    """Rdzeń BFS wprost: SLACK —L1(Z_m ≠ 0)— E —L2(Z_m ≠ 0)— L, odbiór na końcu. Szyna E
    na liście ``neutral_earthed_bus_ids`` (strona gwiazdy uziemionej transformatora) zeruje
    potencjał przewodu N; bez niej spadek Z_m1·I_N gałęzi L1 przenosi się dalej. Ten
    przypadek rozróżnia regułę zerowania — w sieci biegu ENM gałąź transformatora Dyn11 ma
    Z0 = Z1, czyli Z_m = 0 (przypięte w ``test_przewod_n_nn_z_wyroczni``), więc tam zerowanie
    i propagacja dają ten sam potencjał szyny nN stacji."""
    from network_model.solvers.power_flow_unbalanced import (
        UnbalancedBranchSpec,
        UnbalancedLoadSpec,
        UnbalancedNetworkInput,
        solve_unbalanced_backward_forward_sweep,
    )

    base_mva, base_kv = 1.0 / 3.0, 0.4 / math.sqrt(3.0)
    z_m1, z_m2 = complex(0.02, 0.01), complex(0.03, 0.008)
    obciazenie = (0.02, 0.0, 0.0) if faza_a else (0.01, 0.01, 0.01)
    wejscie = UnbalancedNetworkInput(
        base_mva=base_mva,
        base_kv=base_kv,
        slack_bus_id="SLACK",
        bus_ids=("SLACK", "E", "L"),
        branches=(
            UnbalancedBranchSpec("L1", "SLACK", "E", 0.05, 0.02, z_m1.real, z_m1.imag),
            UnbalancedBranchSpec("L2", "E", "L", 0.06, 0.016, z_m2.real, z_m2.imag),
        ),
        loads=(UnbalancedLoadSpec("L", *obciazenie, 0.0, 0.0, 0.0),),
        neutral_earthed_bus_ids=("E",) if uziemiona_posrednia else (),
    )
    wynik = solve_unbalanced_backward_forward_sweep(wejscie)
    assert wynik.converged is True
    z_baza = base_kv**2 / base_mva
    galezie = {g.branch_id: g for g in wynik.branch_results}
    szyny = {s.bus_id: s for s in wynik.bus_results}
    i_n1, i_n2 = galezie["L1"].neutral_current_pu, galezie["L2"].neutral_current_pu
    # Gałęzie promieniowe bez odbioru pośredniego: ten sam prąd powrotny w L1 i L2.
    assert i_n1 == pytest.approx(i_n2, abs=1e-12)
    assert szyny["SLACK"].neutral_voltage_pu == 0j
    v_e = 0j if uziemiona_posrednia else z_m1 / z_baza * i_n1
    assert szyny["E"].neutral_voltage_pu == pytest.approx(v_e, abs=1e-12)
    assert szyny["L"].neutral_voltage_pu == pytest.approx(v_e + z_m2 / z_baza * i_n2, abs=1e-12)
    if faza_a:
        assert abs(i_n1) > 1e-3
        assert abs(szyny["L"].neutral_voltage_pu) > 1e-4
    else:
        assert abs(i_n1) == pytest.approx(0.0, abs=1e-9)


@pytest.mark.parametrize(
    ("grupa", "uziemione"),
    [
        ("Dyn11", {"b_nn"}),
        ("YNd11", {"b_sn"}),
        ("YNyn0", {"b_sn", "b_nn"}),
        ("Yyn0", set()),
        ("Yd11", set()),
        ("Dd0", set()),
    ],
)
def test_assembler_punkty_odniesienia_przewodu_n_z_modelu_polaczen(
    grupa: str, uziemione: set[str]
) -> None:
    """Szyny zerowania potencjału N = strony transformatora z gwiazdą uziemioną w modelu
    składowej zerowej (bocznik do ziemi albo przejście YN–yn) — ten sam model połączeń co
    droga I0. Gwiazda bez drogi I0 (Yyn0) nie jest punktem odniesienia, a bieg z odbiorem
    faza–N za takim transformatorem kończy się odmową nazwaną (przypięte niżej)."""
    from enm.assembler import _graph_id_from_ref, zloz_wejscie_rozplywu_niesymetrycznego

    wejscie = zloz_wejscie_rozplywu_niesymetrycznego(
        siec(fazy=None, vector_group=grupa).model_dump(mode="json"), {}
    )
    odwrotnie = {_graph_id_from_ref(ref): ref for ref in ("b_gpz", "b_sn", "b_nn")}
    (wyspa,) = wejscie.wyspy
    assert {odwrotnie[w] for w in wyspa.wejscie.neutral_earthed_bus_ids} == uziemione
    if grupa in ("Yyn0", "Yd11", "Dd0"):
        with pytest.raises(OdmowaWejsciaRozplywu, match="unbalanced_no_zero_sequence_path"):
            _wykonaj_analize_biegu(bieg(siec(fazy="A", vector_group=grupa)))
