"""Trwały test diagnostyczny V12K-040 (WYMÓG WŁAŚCICIELA 1 + 3, karta §2a).

Dowód liczbowy na PRODUKCYJNEJ ścieżce solvera (``enm.canonical_analysis.execute_run``),
przypadek minimalny jak K1: Slack → linia 5 km → odbiór indukcyjny 1,0 MW + j0,5 Mvar
[→ bateria]. Weryfikuje:
- wartości ODNIESIENIA rzeczywistego solvera (cecha implementacji, nie ocena),
- brak/częściowa/bliska pełnej/przekompensowanie w konwencji kanonicznej,
- wzrost cosφ kanonicznego z kompensacją + spadek po przekompensowaniu,
- poprawność ``Q_cap_eff = rated_mvar · V²`` oraz ``Q_netto = Q_load − Q_cap_eff``,
- (WYMÓG 3) adapter i D8 NIE modyfikują pól ``PowerFlowResult`` — bus/branch/summary
  identyczne przed i po przejściu wyniku przez adapter.

READ-MODEL: adapter (``konwencja_mocy``) tylko INTERPRETUJE wynik. ``PowerFlowResult``
pozostaje FROZEN (ZERO zmian w ``network_model/solvers/**`` i ``enm/**``).

REKALIBRACJA K3 (2026-07-17, karta ``U4_K3_REKALIBRACJA_PO_F98.md``): wartości
odniesienia przemierzone po naprawie F9.8 (commit ``6508c12f`` — usunięcie podwójnej
negacji znaku mocy w canonical PF pipeline; pierwotna przyczyna anomalii V12K-040).
Po F9.8: ``v_load < 1`` (fizyczny spadek), ``slack_q > 0`` (pobór indukcyjny z
systemu), kompensacja ZMNIEJSZA przepływ bierny gałęzi; odwzorowanie kanoniczne
adaptera = NEGACJA końca incydentnego.
"""

from __future__ import annotations

import copy
import math
from collections.abc import Iterator
from typing import Any

import pytest
from application.analyses.konwencja_mocy import (
    moc_kanoniczna_punktu,
    q_netto_po_kompensacji,
)
from enm.canonical_analysis import (
    _graph_id_from_ref,
    create_run,
    execute_run,
    reset_canonical_runs,
)
from enm.models import (
    BranchRating,
    Bus,
    EnergyNetworkModel,
    ENMHeader,
    Load,
    OverheadLine,
    ShuntCapacitor,
    Source,
)
from enm.store import reset_enm_store, set_enm

_NODE_LOAD = _graph_id_from_ref("bus_load")
_ENDPOINTS = {_graph_id_from_ref("line"): (_graph_id_from_ref("bus_slack"), _NODE_LOAD)}


@pytest.fixture(autouse=True)
def _reset() -> Iterator[None]:
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _minimal_net(*, load_q_mvar: float, cap_mvar: float | None = None) -> EnergyNetworkModel:
    shunts: list[ShuntCapacitor] = []
    if cap_mvar is not None:
        shunts.append(
            ShuntCapacitor(
                ref_id="cap",
                name="Bateria",
                bus_ref="bus_load",
                rated_mvar=cap_mvar,
                rated_kv=15.0,
                status="closed",
                catalog_ref="KOMP",
                catalog_namespace="KOMPENSATOR_SN",
                parameter_source="CATALOG",
                source_mode="KATALOG",
            )
        )
    return EnergyNetworkModel(
        header=ENMHeader(name="Dowod V12K-040"),
        buses=[
            Bus(ref_id="bus_slack", name="Slack SN", voltage_kv=15.0),
            Bus(ref_id="bus_load", name="Odbior SN", voltage_kv=15.0),
        ],
        sources=[
            Source(
                ref_id="src",
                name="System",
                bus_ref="bus_slack",
                model="short_circuit_power",
                sk3_mva=2500.0,
                r_ohm=0.5,
                x_ohm=5.0,
                rx_ratio=0.1,
                r0_ohm=0.6,
                x0_ohm=6.0,
                catalog_ref="src-x",
                catalog_namespace="ZRODLO_SN",
                parameter_source="CATALOG",
                source_mode="KATALOG",
            )
        ],
        branches=[
            OverheadLine(
                ref_id="line",
                name="Linia SN",
                from_bus_ref="bus_slack",
                to_bus_ref="bus_load",
                length_km=5.0,
                r_ohm_per_km=0.306,
                x_ohm_per_km=0.34,
                b_siemens_per_km=0.0,
                r0_ohm_per_km=0.46,
                x0_ohm_per_km=1.2,
                rating=BranchRating(in_a=210.0),
                catalog_ref="line-afl-70",
                catalog_namespace="LINIA_SN",
                parameter_source="CATALOG",
                source_mode="KATALOG",
            )
        ],
        loads=[Load(ref_id="ld", name="Odbior", bus_ref="bus_load", p_mw=1.0, q_mvar=load_q_mvar)],
        shunt_capacitors=shunts,
    )


def _result_v1(load_q_mvar: float, cap_mvar: float | None) -> dict[str, Any]:
    set_enm("c", _minimal_net(load_q_mvar=load_q_mvar, cap_mvar=cap_mvar))
    result = execute_run(create_run(case_id="c", analysis_type="PF").id)
    rv: dict[str, Any] = (result.raw_result or {}).get("result_v1") or {}
    assert rv.get("converged") is True
    return rv


def _pomiar(load_q_mvar: float, cap_mvar: float | None) -> dict[str, float]:
    rv = _result_v1(load_q_mvar, cap_mvar)
    v_load = next(float(b["v_pu"]) for b in rv["bus_results"] if str(b["bus_id"]) == _NODE_LOAD)
    kanon = moc_kanoniczna_punktu(
        branch_results=rv["branch_results"], endpoints=_ENDPOINTS, point_node=_NODE_LOAD
    )
    p_to = kanon["p_mw"]
    q_to = kanon["q_mvar"]  # przepływ gałęzi (kanoniczny) na końcu przy odbiorze
    q_cap_eff = (cap_mvar or 0.0) * v_load**2
    # Po F9.8 przepływ kanoniczny ZAWIERA efekt baterii → odzysk zapotrzebowania
    # odbioru wymaga DODANIA Q_cap_eff (rekalibracja K3).
    q_load = q_to + q_cap_eff
    q_netto = q_netto_po_kompensacji(q_load, q_cap_eff)
    return {
        "v_load": v_load,
        "slack_q": float(rv["summary"]["slack_q_mvar"]),
        "q_from": float(
            next(b for b in rv["branch_results"] if abs(float(b["p_to_mw"])) > 0.1)["q_from_mvar"]
        ),
        "p_to": p_to,
        "q_to": q_to,
        "q_cap_eff": q_cap_eff,
        "q_load": q_load,
        "q_netto": q_netto,
        "cosfi_przekroju": abs(p_to) / math.hypot(p_to, q_to),
        "cosfi_kanon": abs(p_to) / math.hypot(p_to, q_netto),
    }


# ---------------------------------------------------------------------------
# Wartości odniesienia rzeczywistego solvera (karta §2a).
# ---------------------------------------------------------------------------


def test_odniesienie_bez_kompensacji() -> None:
    m = _pomiar(0.5, None)
    assert m["v_load"] == pytest.approx(0.989299, abs=1e-6)  # <1 — fizyczny spadek (F9.8)
    assert m["q_to"] == pytest.approx(+0.500000, abs=1e-6)  # kanonicznie: pobór indukcyjny
    assert m["slack_q"] == pytest.approx(+0.509650, abs=1e-6)
    assert m["cosfi_przekroju"] == pytest.approx(0.894427, abs=1e-6)  # cosφ_D8 (przekrój)


def test_odniesienie_cap_05() -> None:
    m = _pomiar(0.5, 0.5)
    assert m["v_load"] == pytest.approx(0.993071, abs=1e-6)
    assert m["q_to"] == pytest.approx(+0.006904, abs=1e-5)  # po F9.8: przepływ MALEJE z baterią
    assert m["slack_q"] == pytest.approx(+0.014566, abs=1e-5)
    assert m["cosfi_przekroju"] == pytest.approx(0.999976, abs=1e-5)  # cosφ przekroju ROŚNIE


def test_slack_q_rowna_q_from() -> None:
    """Spójność solvera (karta §2a): Slack_Q ≡ Q_from (6 miejsc)."""
    for cap in (None, 0.5):
        m = _pomiar(0.5, cap)
        assert m["slack_q"] == pytest.approx(m["q_from"], abs=1e-6)


# ---------------------------------------------------------------------------
# Przegląd wielkości baterii — cosφ kanoniczny (Q_netto = Q_load − rated·V²).
# ---------------------------------------------------------------------------


_REFERENCJA_COSFI_KANON = {
    0.0: 0.89443,
    0.1: 0.92784,
    0.2: 0.95686,
    0.3: 0.97962,
    0.4: 0.99442,
    0.5: 0.99998,
    0.6: 0.99574,
}


def test_przeglad_cosfi_kanon_odniesienie() -> None:
    """cosφ kanoniczny trafia w wartości odniesienia solvera dla całego przeglądu."""
    for cap, ref in _REFERENCJA_COSFI_KANON.items():
        m = _pomiar(0.5, cap if cap > 0 else None)
        assert m["cosfi_kanon"] == pytest.approx(ref, abs=1e-4), f"cap={cap}"


def test_cosfi_kanon_rosnie_do_pelnej_potem_spada() -> None:
    """cosφ kanoniczny ROŚNIE monotonicznie do pełnej kompensacji (0,5), a przy
    przekompensowaniu (0,6) SPADA — dokładnie fizyczne zachowanie kompensacji."""
    seria = [
        _pomiar(0.5, cap if cap > 0 else None)["cosfi_kanon"]
        for cap in (0.0, 0.1, 0.2, 0.3, 0.4, 0.5)
    ]
    assert seria == sorted(seria)  # monotoniczny wzrost aż do pełnej kompensacji
    nad = _pomiar(0.5, 0.6)["cosfi_kanon"]
    assert nad < seria[-1]  # spadek po przekompensowaniu


def test_q_netto_znak_i_model_baterii() -> None:
    """Q_cap_eff = rated·V²; Q_netto = Q_load − Q_cap_eff; Q_load ≈ 0,5 (stałe)."""
    for cap in (0.1, 0.3, 0.5, 0.6):
        m = _pomiar(0.5, cap)
        assert m["q_cap_eff"] == pytest.approx(cap * m["v_load"] ** 2, abs=1e-9)
        assert m["q_load"] == pytest.approx(0.5, abs=1e-4)  # zapotrzebowanie odbioru — stałe
        assert m["q_netto"] == pytest.approx(m["q_load"] - m["q_cap_eff"], abs=1e-9)
    # Znak Q_netto: indukcyjny (>0) przy niedokompensowaniu, pojemnościowy (<0) przy nadmiarze.
    assert _pomiar(0.5, 0.3)["q_netto"] > 0.0
    assert _pomiar(0.5, 0.6)["q_netto"] < 0.0


# ---------------------------------------------------------------------------
# WYMÓG 3 — adapter NIE modyfikuje PowerFlowResult (bus/branch/summary).
# ---------------------------------------------------------------------------


def test_solver_niezmieniony_przed_i_po_adapterze() -> None:
    """Adapter tylko INTERPRETUJE: bus_results/branch_results/summary identyczne
    przed i po przejściu wyniku przez adapter (PowerFlowResult FROZEN, WYMÓG 3)."""
    rv = _result_v1(0.5, 0.5)
    przed = copy.deepcopy(
        {
            "bus_results": rv["bus_results"],
            "branch_results": rv["branch_results"],
            "summary": rv["summary"],
        }
    )
    # Przejście wyniku przez adapter (READ-ONLY).
    _ = moc_kanoniczna_punktu(
        branch_results=rv["branch_results"], endpoints=_ENDPOINTS, point_node=_NODE_LOAD
    )
    assert rv["bus_results"] == przed["bus_results"]
    assert rv["branch_results"] == przed["branch_results"]
    assert rv["summary"] == przed["summary"]
