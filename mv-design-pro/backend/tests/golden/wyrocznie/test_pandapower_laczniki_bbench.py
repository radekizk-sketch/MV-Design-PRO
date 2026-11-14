"""Wyrocznia pandapower: zamknięty łącznik szyna–szyna na sieciach B-BENCH (karta scalenia).

Żadna sieć B-BENCH nie ma łączników (budowniczowie `tests/golden/enm_builders/*` odwzorowują
literaturę bez aparatów), więc wyrocznia WSTAWIA zamknięty łącznik szyn (`bus_coupler`) w
wybraną szynę: nowa sekcja o tym samym napięciu przejmuje co drugą gałąź liniową szyny (oraz,
dla szyny odbiorczej, jej odbiory), a łącznik zamknięty łączy obie sekcje. pandapower scala
szyny połączone zamkniętym łącznikiem szyna–szyna („fused buses"); rozpływ kanoniczny scala je
tym samym predykatem co zwarcia (`core/scalenie_lacznikow`). Obie sieci (z łącznikiem i bez)
muszą dać to samo rozwiązanie co pandapower na sieci z łącznikiem.

ILOCZYN CECH: rodzaj węzła w grupie {bilansujący, napięciowy PV, odbiorczy PQ} × topologia
{oczkowa (IEEE case14), promieniowa (CIGRE MV)}.

Progi z pomiaru 2026-11-13 (pandapower 3.5.4, `tolerance_mva=1e-10`, solver tol 1e-10): max
|ΔU| = 4,0·10⁻¹⁴ pu, |Δφ| = 1,2·10⁻¹¹ °, |ΔP|,|ΔQ| źródła = 2,4·10⁻¹⁰ MW (CIGRE MV; case14:
8,9·10⁻¹⁶ pu); niezmiennik z łącznikiem i bez: 0,0 (bit w bit). Przed kartą (łącznik
0,1 mΩ w rozpływie, ten sam pomiar na 3c6712e19, tol 1e-9): case14 z łącznikiem w szynie PV
NIE ZBIEGAŁ (200 iteracji NR), w szynie bilansującej |ΔU| = 4,2·10⁻⁷ pu, |Δφ| = 2,0·10⁻⁵ °,
|ΔP| = 1,5·10⁻⁴ MW; CIGRE MV |ΔU| = 5,3·10⁻⁷ pu.

Marker `pandapower`: biegnie wyłącznie w izolowanym jobie CI (scipy<1.17).
"""

from __future__ import annotations

import copy
import importlib
from typing import Any

import pytest
from enm.canonical_analysis import _execute_power_flow
from enm.mapping import _ref_to_uuid
from enm.models import EnergyNetworkModel

from tests.golden.parytet_assemblera.harness import _bieg
from tests.golden.wyrocznie import pandapower as most

pytestmark = pytest.mark.pandapower

#: |ΔU| [pu], |Δφ| [°], |ΔP|, |ΔQ| źródła [MW/Mvar] względem pandapower — pomiar 2026-11-13.
TOLERANCJA_U_PU = 1e-12
TOLERANCJA_KAT_DEG = 1e-9
TOLERANCJA_MOC_MW = 1e-8
#: Ta sama sieć z łącznikiem i bez — niezmiennik scalenia (próg wyroczni karty).
TOLERANCJA_NIEZMIENNIKA_U_PU = 1e-10
TOLERANCJA_NIEZMIENNIKA_KAT_DEG = 1e-8

_PRZYPADKI = {
    # (moduł, funkcja, szyna z mapy bus_map albo None = pierwsza szyna odbiorcza z dwiema
    # gałęziami liniowymi i odbiorem, oczekiwany rodzaj węzła)
    "oczkowa_bilansujacy": ("ieee_14bus", "build_ieee_14bus_enm", "B0", "SLACK"),
    "oczkowa_napieciowy": ("ieee_14bus", "build_ieee_14bus_enm", "B1", "PV"),
    "oczkowa_odbiorczy": ("ieee_14bus", "build_ieee_14bus_enm", "B3", "PQ"),
    "promieniowa_odbiorczy": ("cigre_mv", "build_cigre_mv_enm", None, "PQ"),
}


def _siec(modul: str, funkcja: str, szyna: str | None) -> tuple[dict[str, Any], str]:
    budowniczy = getattr(importlib.import_module(f"tests.golden.enm_builders.{modul}"), funkcja)()
    enm = budowniczy.enm if hasattr(budowniczy, "enm") else budowniczy
    enm = copy.deepcopy(enm if isinstance(enm, dict) else enm.model_dump(mode="json"))
    # Bateria kondensatorów (IEEE case14, szyna 9) jest poza zakresem mostu pandapower —
    # usunięta z OBU porównywanych sieci (wyrocznia porównuje tę samą sieć bez niej).
    enm["shunt_capacitors"] = []
    if szyna is None:
        ref = next(
            b["ref_id"]
            for b in sorted(enm["buses"], key=lambda b: b["ref_id"])
            if _rodzaj(enm, b["ref_id"]) == "PQ"
            and any(o["bus_ref"] == b["ref_id"] for o in enm["loads"])
            and _liczba_liniowych(enm, b["ref_id"]) >= 2
        )
    else:
        ref = budowniczy.bus_map[szyna]
    return enm, ref


def _liczba_liniowych(enm: dict[str, Any], ref: str) -> int:
    return sum(
        1
        for g in enm["branches"]
        if g["type"] in ("line_overhead", "cable") and ref in (g["from_bus_ref"], g["to_bus_ref"])
    )


def _rodzaj(enm: dict[str, Any], ref: str) -> str:
    if any(s["bus_ref"] == ref for s in enm["sources"]):
        return "SLACK"
    if any(g["bus_ref"] == ref and g.get("gen_type") != "pv_inverter" for g in enm["generators"]):
        return "PV"
    return "PQ"


def _podziel(enm: dict[str, Any], ref: str) -> tuple[dict[str, Any], str]:
    """Sekcja B szyny `ref` przejmuje co drugą gałąź liniową (i odbiory szyny odbiorczej)."""
    wynik = copy.deepcopy(enm)
    szyna = next(b for b in wynik["buses"] if b["ref_id"] == ref)
    nowa = f"{ref}/sekcja_B"
    wynik["buses"].append({**copy.deepcopy(szyna), "ref_id": nowa, "name": f"{szyna['name']} B"})
    wynik["buses"][-1].pop("id", None)
    liniowe = [
        g
        for g in wynik["branches"]
        if g["type"] in ("line_overhead", "cable") and ref in (g["from_bus_ref"], g["to_bus_ref"])
    ]
    assert len(liniowe) >= 2, "szyna do podziału musi mieć co najmniej dwie gałęzie liniowe"
    for galaz in sorted(liniowe, key=lambda g: g["ref_id"])[1::2]:
        for koniec in ("from_bus_ref", "to_bus_ref"):
            if galaz[koniec] == ref:
                galaz[koniec] = nowa
    if _rodzaj(enm, ref) == "PQ":
        for odbior in wynik["loads"]:
            if odbior["bus_ref"] == ref:
                odbior["bus_ref"] = nowa
    wynik["branches"].append(
        {
            "ref_id": f"{ref}/sprzeglo",
            "name": "Sprzęgło szyn",
            "type": "bus_coupler",
            "from_bus_ref": ref,
            "to_bus_ref": nowa,
            "status": "closed",
        }
    )
    return wynik, nowa


def _kanoniczny(enm: EnergyNetworkModel) -> dict[str, Any]:
    run = _bieg(enm, klucz="pp-lacznik", analysis_type="PF", options={"tolerance": 1e-10})
    _execute_power_flow(run)
    wynik = run.raw_result["result_v1"]
    assert wynik["converged"]
    return {row["bus_id"]: row for row in wynik["bus_results"]}


def _roznica_katow(a: float, b: float) -> float:
    return abs(((a - b) + 180.0) % 360.0 - 180.0)


@pytest.mark.parametrize("przypadek", sorted(_PRZYPADKI))
def test_lacznik_zamkniety_zgodny_z_pandapower(przypadek: str) -> None:
    modul, funkcja, szyna, rodzaj = _PRZYPADKI[przypadek]
    bazowa, ref = _siec(modul, funkcja, szyna)
    assert _rodzaj(bazowa, ref) == rodzaj
    podzielona, nowa = _podziel(bazowa, ref)
    enm_bazowa = EnergyNetworkModel.model_validate(bazowa)
    enm_podzielona = EnergyNetworkModel.model_validate(podzielona)

    nasz_bazowy = _kanoniczny(enm_bazowa)
    nasz = _kanoniczny(enm_podzielona)
    pp = most.rozplyw(enm_podzielona)

    du = dfi = 0.0
    niezm_du = niezm_dfi = 0.0
    for bus in enm_podzielona.buses:
        wiersz = nasz[_ref_to_uuid(bus.ref_id)]
        vm, va = pp["szyny"][bus.ref_id]
        du = max(du, abs(wiersz["v_pu"] - vm))
        dfi = max(dfi, _roznica_katow(wiersz["angle_deg"], va))
        odpowiednik = ref if bus.ref_id == nowa else bus.ref_id
        bazowy = nasz_bazowy[_ref_to_uuid(odpowiednik)]
        niezm_du = max(niezm_du, abs(wiersz["v_pu"] - bazowy["v_pu"]))
        niezm_dfi = max(niezm_dfi, _roznica_katow(wiersz["angle_deg"], bazowy["angle_deg"]))
    dp = 0.0
    for zrodlo in enm_podzielona.sources:
        wiersz = nasz[_ref_to_uuid(zrodlo.bus_ref)]
        p_pp, q_pp = pp["zrodla"][zrodlo.ref_id]
        dp = max(dp, abs(wiersz["p_injected_mw"] - p_pp), abs(wiersz["q_injected_mvar"] - q_pp))

    pomiar = {"du": du, "dfi": dfi, "dp": dp, "niezm_du": niezm_du, "niezm_dfi": niezm_dfi}
    assert du <= TOLERANCJA_U_PU, pomiar
    assert dfi <= TOLERANCJA_KAT_DEG, pomiar
    assert dp <= TOLERANCJA_MOC_MW, pomiar
    assert niezm_du <= TOLERANCJA_NIEZMIENNIKA_U_PU, pomiar
    assert niezm_dfi <= TOLERANCJA_NIEZMIENNIKA_KAT_DEG, pomiar
