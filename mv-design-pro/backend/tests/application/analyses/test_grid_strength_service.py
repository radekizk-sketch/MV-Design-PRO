"""Testy serwisu aplikacyjnego siły sieci (SCR/WSCR) — D1.

Zakres: mapowanie wejść (S_sc'' z wyniku zwarciowego, S_n z modelu), agregacja
mocy wielu źródeł w węźle, uczciwy werdykt „brak danych" bez S_sc, wykluczenie
generatorów synchronicznych, determinizm oraz błędy rodzaju/statusu przebiegu.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from application.analyses.grid_strength import build_grid_strength_view
from enm.canonical_analysis import (
    CanonicalRun,
    create_run,
    execute_run,
    reset_canonical_runs,
)
from enm.models import GenLimits
from enm.store import reset_enm_store, set_enm

from tests.cgmes.golden_enm import build_golden_enm


@pytest.fixture(autouse=True)
def _reset() -> None:
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _sc_run(
    *,
    generators: list[dict],
    buses: list[dict],
    sc_rows: list[dict],
    graph_nodes: dict[str, dict],
    status: str = "FINISHED",
    analysis_type: str = "short_circuit_sn",
) -> CanonicalRun:
    """Zbuduj przebieg zwarciowy z kontrolowanym snapshotem i wynikiem."""
    return CanonicalRun(
        id=uuid4(),
        case_id="case-1",
        project_id="proj-1",
        analysis_type=analysis_type,
        status=status,
        created_at=datetime(2024, 1, 1, tzinfo=UTC),
        snapshot_hash="snap-hash",
        input_hash="in-hash",
        snapshot={"header": {"name": "Projekt"}, "buses": buses, "generators": generators},
        validation={},
        readiness={},
        raw_result={"results": sc_rows, "graph": {"nodes": graph_nodes}},
    )


def _bus(ref_id: str, kv: float = 15.0) -> dict:
    return {"ref_id": ref_id, "voltage_kv": kv}


def _ibg(
    ref_id: str, bus_ref: str, *, sn_mva: float | None = None, gen_type: str = "pv_inverter"
) -> dict:
    gen: dict = {"ref_id": ref_id, "bus_ref": bus_ref, "gen_type": gen_type, "q_mvar": 0.0}
    if sn_mva is not None:
        gen["materialized_params"] = {"sn_mva": sn_mva}
    return gen


# --------------------------------------------------------------------------
# Mapowanie wejść
# --------------------------------------------------------------------------


def test_maps_sk_mva_and_installed_power_to_scr() -> None:
    run = _sc_run(
        generators=[_ibg("g1", "b1", sn_mva=2.0)],
        buses=[_bus("b1")],
        sc_rows=[{"fault_node_id": "n1", "sk_mva": 100.0}],
        graph_nodes={"n1": {"element_id": "b1", "name": "B1"}},
    )
    view = build_grid_strength_view(run)
    assert len(view["entries"]) == 1
    entry = view["entries"][0]
    assert entry["bus_ref"] == "b1"
    assert entry["s_sc_mva"] == 100.0
    assert entry["s_installed_mva"] == 2.0
    assert entry["scr"] == 50.0
    assert entry["verdict"] == "mocna"
    assert len(entry["white_box"]) >= 2


def test_bus_without_short_circuit_yields_no_data_verdict() -> None:
    # IBG na b2, ale wynik zwarciowy nie obejmuje b2 → S_sc = None → brak danych.
    run = _sc_run(
        generators=[_ibg("g1", "b2", sn_mva=2.0)],
        buses=[_bus("b2")],
        sc_rows=[{"fault_node_id": "n1", "sk_mva": 100.0}],
        graph_nodes={"n1": {"element_id": "b1", "name": "B1"}},
    )
    view = build_grid_strength_view(run)
    entry = view["entries"][0]
    assert entry["s_sc_mva"] is None
    assert entry["scr"] is None
    assert entry["verdict"] == "brak danych"
    assert "s_sc_mva" in entry["missing_data"]


def test_aggregates_multiple_sources_in_same_bus() -> None:
    run = _sc_run(
        generators=[_ibg("g1", "b1", sn_mva=2.0), _ibg("g2", "b1", sn_mva=3.0, gen_type="bess")],
        buses=[_bus("b1")],
        sc_rows=[{"fault_node_id": "n1", "sk_mva": 100.0}],
        graph_nodes={"n1": {"element_id": "b1"}},
    )
    view = build_grid_strength_view(run)
    assert len(view["entries"]) == 1
    entry = view["entries"][0]
    assert entry["s_installed_mva"] == 5.0  # 2.0 + 3.0
    assert entry["scr"] == 20.0


def test_n_parallel_multiplies_installed_power() -> None:
    # n_parallel=2 → moc zainstalowana = S_n × 2 (2.0 × 2 = 4.0); SCR = 100/4 = 25.
    gen = _ibg("g1", "b1", sn_mva=2.0)
    gen["n_parallel"] = 2
    run = _sc_run(
        generators=[gen],
        buses=[_bus("b1")],
        sc_rows=[{"fault_node_id": "n1", "sk_mva": 100.0}],
        graph_nodes={"n1": {"element_id": "b1"}},
    )
    entry = build_grid_strength_view(run)["entries"][0]
    assert entry["s_installed_mva"] == 4.0
    assert entry["scr"] == 25.0


def test_missing_n_parallel_defaults_to_single_unit() -> None:
    # Brak n_parallel → krotność 1 (moc zainstalowana = S_n pojedynczej jednostki).
    run = _sc_run(
        generators=[_ibg("g1", "b1", sn_mva=2.0)],
        buses=[_bus("b1")],
        sc_rows=[{"fault_node_id": "n1", "sk_mva": 100.0}],
        graph_nodes={"n1": {"element_id": "b1"}},
    )
    assert build_grid_strength_view(run)["entries"][0]["s_installed_mva"] == 2.0


def test_synchronous_generator_excluded_from_entries() -> None:
    run = _sc_run(
        generators=[_ibg("g_sync", "b1", sn_mva=5.0, gen_type="synchronous")],
        buses=[_bus("b1")],
        sc_rows=[{"fault_node_id": "n1", "sk_mva": 100.0}],
        graph_nodes={"n1": {"element_id": "b1"}},
    )
    view = build_grid_strength_view(run)
    assert view["entries"] == []


def test_installed_power_resolved_from_converter_catalog() -> None:
    # Brak materialized_params → moc z katalogu przekształtnika (pv_inv_sma_2500).
    gen = {
        "ref_id": "g1",
        "bus_ref": "b1",
        "gen_type": "pv_inverter",
        "q_mvar": 0.0,
        "catalog_ref": "pv_inv_sma_2500",
    }
    run = _sc_run(
        generators=[gen],
        buses=[_bus("b1")],
        sc_rows=[{"fault_node_id": "n1", "sk_mva": 100.0}],
        graph_nodes={"n1": {"element_id": "b1"}},
    )
    view = build_grid_strength_view(run)
    assert view["entries"][0]["s_installed_mva"] == pytest.approx(2.75)


def test_ibg_bus_without_installed_power_is_no_data() -> None:
    # Węzeł z IBG bez znanej mocy znamionowej (brak materialized/katalogu).
    run = _sc_run(
        generators=[_ibg("g1", "b1")],
        buses=[_bus("b1")],
        sc_rows=[{"fault_node_id": "n1", "sk_mva": 100.0}],
        graph_nodes={"n1": {"element_id": "b1"}},
    )
    view = build_grid_strength_view(run)
    entry = view["entries"][0]
    assert entry["s_installed_mva"] is None
    assert entry["verdict"] == "brak danych"
    assert "s_installed_mva" in entry["missing_data"]


# --------------------------------------------------------------------------
# Determinizm i błędy
# --------------------------------------------------------------------------


def test_view_is_deterministic() -> None:
    run = _sc_run(
        generators=[_ibg("g1", "b1", sn_mva=2.0)],
        buses=[_bus("b1")],
        sc_rows=[{"fault_node_id": "n1", "sk_mva": 100.0}],
        graph_nodes={"n1": {"element_id": "b1"}},
    )
    assert build_grid_strength_view(run) == build_grid_strength_view(run)


def test_rejects_non_short_circuit_run() -> None:
    run = _sc_run(generators=[], buses=[], sc_rows=[], graph_nodes={}, analysis_type="PF")
    with pytest.raises(ValueError, match="przebiegu zwarciowego"):
        build_grid_strength_view(run)


def test_rejects_unfinished_run() -> None:
    run = _sc_run(generators=[], buses=[], sc_rows=[], graph_nodes={}, status="RUNNING")
    with pytest.raises(ValueError, match="nie jest zakończony"):
        build_grid_strength_view(run)


# --------------------------------------------------------------------------
# Realny przebieg (golden network) — kryterium (1): widok z White Box
# --------------------------------------------------------------------------


def test_real_short_circuit_run_produces_scr_with_white_box() -> None:
    enm = build_golden_enm()
    gens = list(enm.generators)
    gens[1] = gens[1].model_copy(
        update={
            "limits": GenLimits(q_min_mvar=-0.9, q_max_mvar=0.9),
            "materialized_params": {"sn_mva": 2.75},
        }
    )
    enm = enm.model_copy(update={"generators": gens})
    set_enm("c1", enm)
    run = execute_run(create_run(case_id="c1", analysis_type="short_circuit_sn").id)
    assert run.status == "FINISHED", run.error_message

    view = build_grid_strength_view(run)
    entries = {e["bus_ref"]: e for e in view["entries"]}
    assert "bus_nn" in entries  # punkt przyłączenia falownika PV
    pv_entry = entries["bus_nn"]
    assert pv_entry["s_sc_mva"] is not None
    assert pv_entry["s_installed_mva"] == pytest.approx(2.75)
    assert pv_entry["scr"] is not None and pv_entry["scr"] > 0
    assert pv_entry["white_box"]
    assert view["summary"]["wscr"] is not None
