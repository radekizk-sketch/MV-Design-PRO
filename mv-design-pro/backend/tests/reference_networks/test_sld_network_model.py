"""E3 distiller — the 53-station ENM → compact SLD network model: every station reachable
(NO-ORPHAN), the radial tree is intact, the normally-open stub is kept, and it is deterministic.
"""

from __future__ import annotations

import json

import pytest
from application.reference_networks.sld_network_model import distill_sld_network

from .sld_substrate_52s import build_sld_substrate_52s


def _model() -> dict:
    return distill_sld_network(build_sld_substrate_52s()["enm"])


@pytest.fixture(scope="module")
def model() -> dict:
    """Jeden destylat na modul — INTENCJA: kazdy test ponizej sprawdza INNA ceche
    TEGO SAMEGO modelu, wiec budowanie substratu 53 stacji (~12 s) osobno dla kazdego
    testu liczylo piec razy dokladnie to samo. Model jest deterministyczny i czytany
    wylacznie do odczytu; test determinizmu ponizej nadal zestawia DWA niezalezne biegi.
    """
    return _model()


def test_distills_all_53_stations_no_orphan(model: dict) -> None:
    m = model
    assert m["schema"] == "sld_network_model_v1"
    assert len(m["stations"]) == 53
    ids = {s["id"] for s in m["stations"]}
    # every non-root parent is a real station; no dangling parents (NO-ORPHAN).
    for s in m["stations"]:
        if s["parent"] is not None:
            assert s["parent"] in ids
    # exactly one root hangs off the GPZ; the rest are reachable through parents.
    roots = [s for s in m["stations"] if s["parent"] is None]
    assert len(roots) == 1


def test_radial_tree_shape(model: dict) -> None:
    m = model
    kinds = {"trunk": 0, "lateral": 0}
    for s in m["stations"]:
        kinds[s["kind"]] += 1
    assert kinds == {"trunk": 12, "lateral": 41}
    # one feeder edge per parent link + the GPZ→trunk-head edge.
    assert len(m["edges"]) == 53
    assert any(e["from"] == "GPZ" for e in m["edges"])


def test_normally_open_stub_kept(model: dict) -> None:
    m = model
    assert m["nop_station"] is not None
    assert any(s["nop_downstream"] for s in m["stations"])
    assert sum(1 for e in m["edges"] if e["open"]) == 1


def test_der_and_transformers_from_model(model: dict) -> None:
    m = model
    der = {d for s in m["stations"] for d in s["der"]}
    assert der == {"pv_inverter", "bess", "wind_inverter"}
    # FW stations carry the 2.5 MVA transformer, the rest 0.63 MVA — both present, from the ENM.
    mvas = {s["trafo_mva"] for s in m["stations"]}
    assert 0.63 in mvas and 2.5 in mvas


def test_deterministic(model: dict) -> None:
    """INTENCJA: DWA niezalezne biegi budowniczego + destylatora daja identyczny model.
    Bieg A to model wspoldzielony przez modul (osobne wywolanie `_model()` w fixture),
    bieg B liczymy tutaj od zera — porownanie nadal zestawia dwa rozlaczne wywolania.
    """
    assert json.dumps(model, sort_keys=True) == json.dumps(_model(), sort_keys=True)
