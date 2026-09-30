"""Wyrocznia pandapower dla sieci ZAIMPORTOWANEJ Z ARKUSZA (W1 — projekt akceptacyjny
klasy A mapy domknięcia: „sieć operatora z arkusza” liczy się tak samo, jak sieć
zbudowana kreatorem).

Sieć: GPZ 15 kV → 5 km AFL-6 120 (typ PROJEKTU z tabliczki arkusza) → stacja 15/0,4 kV
400 kVA (typ PROJEKTU) → dwa odbiory nN. Parametry przewodu i transformatora pochodzą
z pozycji katalogu projektu (`enm/katalog_projektu.py`), więc test dowodzi, że typ z
arkusza materializuje się w torze solvera dokładnie jak typ producenta — i że wynik
zgadza się z niezależnym solverem.

Tolerancje jak w `test_pandapower_wyspy.py` (ta sama klasa różnic: łączniki pól
0,1 mΩ w solverze vs łącznik idealny w pandapower).

Marker ``pandapower``: biegnie wyłącznie w izolowanym jobie CI
``pandapower-cross-validation`` (scipy<1.17); import pandapower leniwy w moście.
"""

from __future__ import annotations

import pytest
from application.xlsx_import import XlsxNetworkImporter
from application.xlsx_import.service import graf_z_arkusza
from enm.canonical_analysis import _execute_power_flow, _execute_short_circuit
from enm.kompilator_grafu import kompiluj_graf
from enm.mapping import _ref_to_uuid
from enm.models import EnergyNetworkModel

from tests.golden.parytet_assemblera.harness import _bieg
from tests.golden.wyrocznie import pandapower as most
from tests.golden.wyrocznie.test_pandapower_wyspy import (
    TOLERANCJA_IK_WZGL,
    TOLERANCJA_KAT_DEG,
    TOLERANCJA_MOC_MW,
    TOLERANCJA_U_PU,
)
from tests.utils.arkusz_xlsx import arkusz_siec_sn

pytestmark = pytest.mark.pandapower

_SC_3F = {"fault_type": "3F", "scenario": "max", "thermal_time_seconds": 1.0}


def _siec_z_arkusza() -> EnergyNetworkModel:
    wynik = XlsxNetworkImporter().import_from_bytes(arkusz_siec_sn(), "siec.xlsx")
    assert wynik.success, wynik.errors
    assert wynik.siec is not None
    return EnergyNetworkModel.model_validate(
        kompiluj_graf(graf_z_arkusza(wynik.siec, "arkusz")).enm
    )


def test_rozplyw_sieci_z_arkusza_zgodny_z_pandapower() -> None:
    enm = _siec_z_arkusza()
    run = _bieg(enm, klucz="arkusz", analysis_type="PF", options={})
    _execute_power_flow(run)
    wynik = run.raw_result["result_v1"]
    assert wynik["converged"]
    szyny = {row["bus_id"]: row for row in wynik["bus_results"]}
    pp = most.rozplyw(enm)
    for bus in enm.buses:
        nasz = szyny[_ref_to_uuid(bus.ref_id)]
        assert nasz["status"] == "solved", bus.ref_id
        vm, va = pp["szyny"][bus.ref_id]
        assert abs(nasz["v_pu"] - vm) <= TOLERANCJA_U_PU, (bus.name, nasz["v_pu"], vm)
        dfi = abs(((nasz["angle_deg"] - va) + 180.0) % 360.0 - 180.0)
        assert dfi <= TOLERANCJA_KAT_DEG, (bus.name, nasz["angle_deg"], va)
    [zrodlo] = enm.sources
    nasz = szyny[_ref_to_uuid(zrodlo.bus_ref)]
    p_pp, q_pp = pp["zrodla"][zrodlo.ref_id]
    assert abs(nasz["p_injected_mw"] - p_pp) <= TOLERANCJA_MOC_MW
    assert abs(nasz["q_injected_mvar"] - q_pp) <= TOLERANCJA_MOC_MW
    # Odbiory nN naprawdę obciążają sieć: napięcie na szynie nN niższe niż na GPZ.
    u_gpz = pp["szyny"][enm.sources[0].bus_ref][0]
    u_nn = pp["szyny"][next(b.ref_id for b in enm.buses if b.name == "Stacja 1 nN")][0]
    assert u_nn < u_gpz


def test_zwarcie_3f_sieci_z_arkusza_zgodne_z_pandapower() -> None:
    enm = _siec_z_arkusza()
    run = _bieg(enm, klucz="arkusz-sc", analysis_type="short_circuit_sn", options=_SC_3F)
    _execute_short_circuit(run)
    wiersze = {str(row["fault_node_id"]): row for row in run.raw_result["results"]}
    pp = most.zwarcie_3f(enm)
    for bus in enm.buses:
        nasz = wiersze[_ref_to_uuid(bus.ref_id)]
        assert nasz["reporting_status"] == "reportable", bus.name
        ik_pp = pp[bus.ref_id]
        assert abs(nasz["ik_thevenin_a"] - ik_pp) / ik_pp <= TOLERANCJA_IK_WZGL, (
            bus.name,
            nasz["ik_thevenin_a"],
            ik_pp,
        )
