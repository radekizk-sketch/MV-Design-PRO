"""Wyrocznia pandapower dla rozpływu PER WYSPA i zwarcia z wieloma źródłami (CV-4.3 K3b).

Sieci rejestru ``scenariusz-stAB``: 02 (jedno źródło — kontrola konwencji mostu na
torze, który istniał przed kartą), 05 (dwa GPZ w OSOBNYCH wyspach — rozpływ liczony
przez wykonawcę po jednej wyspie i scalony), 06 (dwa GPZ w JEDNEJ wyspie — zwarcie
IEC 60909 z superpozycją obu źródeł; rozpływ odmawia nazwanym kodem). Tolerancje
przypięte Z POMIARU (patrz ``TOLERANCJA_*``), nie „na wszelki wypadek".

Marker ``pandapower``: biegnie wyłącznie w izolowanym jobie CI
``pandapower-cross-validation`` (scipy<1.17); import pandapower leniwy w moście.
"""

from __future__ import annotations

import math

import pytest
from enm.canonical_analysis import _execute_power_flow, _execute_short_circuit
from enm.mapping import _ref_to_uuid

from tests.application.analyses.lv_domain.scenariusze_nn import SCENARIUSZ_PO_SLUGU
from tests.golden.parytet_assemblera.harness import _bieg
from tests.golden.wyrocznie import pandapower as most

pytestmark = pytest.mark.pandapower

#: |ΔU| [pu] i |Δφ| [°] między solverem kanonicznym a pandapower — pomiar 2026-09-06
#: (scenariusze 02 i 05, 15/16 szyn): max |ΔU| = 5,4·10⁻⁵ pu, max |Δφ| = 2,5·10⁻³ °;
#: różnica pochodzi z modelu ZAMKNIĘTEGO łącznika (solver: R = X = 0,1 mΩ w każdym
#: łączniku pola nN; pandapower: łącznik idealny scala szyny) — spadek ~10 mV na 400 V.
TOLERANCJA_U_PU = 1e-4
TOLERANCJA_KAT_DEG = 5e-3
#: Moc źródła [MW/Mvar] — ta sama przyczyna (straty na łącznikach 0,1 mΩ): pomiar
#: max 3,8·10⁻⁶ MW (02), 2,1·10⁻⁶ MW (05).
TOLERANCJA_MOC_MW = 1e-5
#: Ik'' — względna; pomiar 2026-09-06 (02, 05, 06 — 47 szyn): ≤ 1·10⁻⁴ przy K_T
#: liczonym po obu stronach (IEC 60909-0 §6.3.3) i c z tej samej Tab. 1.
TOLERANCJA_IK_WZGL = 1e-4

_SC_3F = {"fault_type": "3F", "scenario": "max", "thermal_time_seconds": 1.0}


def _siec(slug: str):
    return SCENARIUSZ_PO_SLUGU[slug].budowniczy()


def _rozplyw_kanoniczny(enm):
    run = _bieg(enm, klucz="pp", analysis_type="PF", options={})
    _execute_power_flow(run)
    return run


def _porownaj_rozplyw(slug: str) -> dict[str, float]:
    enm = _siec(slug)
    run = _rozplyw_kanoniczny(enm)
    wynik = run.raw_result["result_v1"]
    assert wynik["converged"], slug
    szyny = {row["bus_id"]: row for row in wynik["bus_results"]}
    pp = most.rozplyw(enm)
    max_du = max_dfi = 0.0
    for bus in enm.buses:
        nasz = szyny[_ref_to_uuid(bus.ref_id)]
        assert nasz["status"] == "solved", (slug, bus.ref_id)
        vm, va = pp["szyny"][bus.ref_id]
        max_du = max(max_du, abs(nasz["v_pu"] - vm))
        dfi = abs(((nasz["angle_deg"] - va) + 180.0) % 360.0 - 180.0)
        max_dfi = max(max_dfi, dfi)
    # Moc szyn bilansujących: per źródło (wstrzyknięcie na szynie źródła) vs ext_grid.
    max_dp = 0.0
    for zrodlo in enm.sources:
        nasz = szyny[_ref_to_uuid(zrodlo.bus_ref)]
        p_pp, q_pp = pp["zrodla"][zrodlo.ref_id]
        # ext_grid pandapower oddaje moc DO sieci (dodatnia = generacja) — tak jak
        # kontrakt ``p_injected_mw`` (wstrzyknięcie) na szynie bilansującej.
        max_dp = max(max_dp, abs(nasz["p_injected_mw"] - p_pp), abs(nasz["q_injected_mvar"] - q_pp))
    return {"du": max_du, "dfi": max_dfi, "dp": max_dp}


@pytest.mark.parametrize("slug", ["02_two_tr_qbc_open", "05_independent_upstream"])
def test_rozplyw_zgodny_z_pandapower(slug: str) -> None:
    pomiar = _porownaj_rozplyw(slug)
    assert pomiar["du"] <= TOLERANCJA_U_PU, pomiar
    assert pomiar["dfi"] <= TOLERANCJA_KAT_DEG, pomiar
    assert pomiar["dp"] <= TOLERANCJA_MOC_MW, pomiar


def test_rozplyw_dwoch_wysp_ma_dwie_szyny_bilansujace_jak_dwa_ext_grid() -> None:
    enm = _siec("05_independent_upstream")
    run = _rozplyw_kanoniczny(enm)
    wyspy = run.raw_result["wyspy"]
    assert [w["zrodlo_ref"] for w in wyspy] == sorted(z.ref_id for z in enm.sources)
    pp = most.rozplyw(enm)
    base_mva = run.raw_result["result_v1"]["base_mva"]
    for wyspa in wyspy:
        p_pp, q_pp = pp["zrodla"][wyspa["zrodlo_ref"]]
        assert math.isclose(
            wyspa["slack_power_pu"]["re"] * base_mva, p_pp, abs_tol=TOLERANCJA_MOC_MW
        )
        assert math.isclose(
            wyspa["slack_power_pu"]["im"] * base_mva, q_pp, abs_tol=TOLERANCJA_MOC_MW
        )
    suma = run.raw_result["result_v1"]["summary"]["slack_p_mw"]
    assert math.isclose(
        suma, sum(p for p, _q in pp["zrodla"].values()), abs_tol=2 * TOLERANCJA_MOC_MW
    )


@pytest.mark.parametrize(
    "slug", ["02_two_tr_qbc_open", "05_independent_upstream", "06_conflict_parallel_sources"]
)
def test_zwarcie_3f_sieci_thevenina_zgodne_z_pandapower(slug: str) -> None:
    enm = _siec(slug)
    run = _bieg(enm, klucz="pp-sc", analysis_type="short_circuit_sn", options=_SC_3F)
    _execute_short_circuit(run)
    wiersze = {str(row["fault_node_id"]): row for row in run.raw_result["results"]}
    pp = most.zwarcie_3f(enm)
    max_wzgl = 0.0
    for bus in enm.buses:
        nasz = wiersze[_ref_to_uuid(bus.ref_id)]
        assert nasz["reporting_status"] == "reportable", (slug, bus.ref_id)
        ik_pp = pp[bus.ref_id]
        max_wzgl = max(max_wzgl, abs(nasz["ik_thevenin_a"] - ik_pp) / ik_pp)
    assert max_wzgl <= TOLERANCJA_IK_WZGL, (slug, max_wzgl)
