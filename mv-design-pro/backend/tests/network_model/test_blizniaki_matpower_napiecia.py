"""Przypięte napięcia szyn bliźniaków MATPOWER (bez pandapower w środowisku).

Wartości = `pandapower 3.5.4`, `pn.caseXX()` + `runpp()` (bez egzekwowania granic Q),
zebrane 2026-09-09 — ta sama wyrocznia, którą w jobie `pandapower` CI sprawdza
`tests/golden/wyrocznie/test_pandapower_blizniaki_matpower.py`; tutaj przypięte, żeby
domyślny bieg CI (bez pandapower) też wykrył regresję fizyki bliźniaka (baza impedancji
linii, napięcie zadane slacka, orientacja zaczepu). Tolerancja 2·10⁻⁴ p.u.
"""

from __future__ import annotations

import importlib

import pytest
from enm.assembler import _graph_id_from_ref
from enm.canonical_analysis import _execute_power_flow
from enm.models import EnergyNetworkModel

from tests.golden.parytet_assemblera.harness import _bieg

TOL_PU = 2e-4
#: pandapower 3.5.4, runpp, vm_pu w kolejności szyn literatury (B0 = szyna 1).
NAPIECIA_PANDAPOWER: dict[str, tuple[str, str, list[float]]] = {
    "case9": (
        "application.reference_networks.enm_builders.ieee_9bus",
        "build_ieee_9bus_enm",
        [1.0, 1.0, 1.0, 0.987, 0.9755, 1.0034, 0.9856, 0.9962, 0.9576],
    ),
    "case14": (
        "application.reference_networks.enm_builders.ieee_14bus",
        "build_ieee_14bus_enm",
        [
            1.06,
            1.045,
            1.01,
            1.0177,
            1.0195,
            1.07,
            1.0615,
            1.09,
            1.0559,
            1.051,
            1.0569,
            1.0552,
            1.0504,
            1.0355,
        ],
    ),
    "case39": (
        "application.reference_networks.enm_builders.ieee_39bus",
        "build_ieee_39bus_enm",
        [
            1.03938,
            1.04849,
            1.03071,
            1.00446,
            1.00601,
            1.00823,
            0.9984,
            0.99787,
            1.03833,
            1.01784,
            1.01339,
            1.00082,
            1.01492,
            1.01232,
            1.01619,
            1.03252,
            1.03424,
            1.03157,
            1.05011,
            0.99101,
            1.03232,
            1.05014,
            1.04515,
            1.038,
            1.05768,
            1.05256,
            1.03834,
            1.05037,
            1.05011,
            1.0499,
            0.982,
            0.9841,
            0.9972,
            1.0123,
            1.0494,
            1.0636,
            1.0275,
            1.0265,
            1.03,
        ],
    ),
}


@pytest.mark.parametrize("nazwa", sorted(NAPIECIA_PANDAPOWER))
def test_blizniak_matpower_napiecia_jak_pandapower(nazwa: str) -> None:
    modul, funkcja, oczekiwane = NAPIECIA_PANDAPOWER[nazwa]
    b = getattr(importlib.import_module(modul), funkcja)()
    enm = EnergyNetworkModel.model_validate(b.enm)
    run = _bieg(enm, klucz=f"pin-{nazwa}", analysis_type="PF", options={})
    _execute_power_flow(run)
    raw = run.raw_result or {}
    assert (raw.get("result_v1") or {}).get("converged") is True
    assert not raw.get("pv_to_pq_switches")
    nodes = raw["graph"]["nodes"]
    nv = raw["node_voltage_kv"]
    assert len(b.bus_map) == len(oczekiwane)
    rozbieznosci = []
    for i, e in enumerate(oczekiwane):
        nid = _graph_id_from_ref(b.bus_map[f"B{i}"])
        pu = nv[nid] / nodes[nid]["voltage_level"]
        if abs(pu - e) > TOL_PU:
            rozbieznosci.append((f"B{i}", round(pu, 5), e))
    assert not rozbieznosci, rozbieznosci
