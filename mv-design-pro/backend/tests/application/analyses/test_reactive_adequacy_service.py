"""Testy serwisu aplikacyjnego adekwatności mocy biernej (rezerwy Q) — D1.

Zakres: mapowanie wejść (|V| z rozpływu, granice Q z modelu/katalogu), nasycenie
źródła, uczciwe „brak danych" bez granic Q, naruszenie pasma napięciowego,
proweniencja z karty przekształtnika, brak zbieżności, determinizm i błędy.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from application.analyses.reactive_adequacy import build_reactive_adequacy_view
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


def _pf_run(
    *,
    generators: list[dict],
    buses: list[dict],
    loads: list[dict],
    bus_results: list[dict],
    graph_nodes: dict[str, dict],
    converged: bool = True,
    status: str = "FINISHED",
    analysis_type: str = "PF",
) -> CanonicalRun:
    return CanonicalRun(
        id=uuid4(),
        case_id="case-1",
        project_id="proj-1",
        analysis_type=analysis_type,
        status=status,
        created_at=datetime(2024, 1, 1, tzinfo=UTC),
        snapshot_hash="snap-hash",
        input_hash="in-hash",
        snapshot={
            "header": {"name": "Projekt"},
            "buses": buses,
            "generators": generators,
            "loads": loads,
        },
        validation={},
        readiness={},
        raw_result={
            "result_v1": {"converged": converged, "bus_results": bus_results},
            "graph": {"nodes": graph_nodes},
        },
    )


def _bus(
    ref_id: str, kv: float = 15.0, u_min: float | None = None, u_max: float | None = None
) -> dict:
    bus: dict = {"ref_id": ref_id, "voltage_kv": kv}
    if u_min is not None or u_max is not None:
        bus["nominal_limits"] = {"u_min_pu": u_min, "u_max_pu": u_max}
    return bus


def _gen(
    ref_id: str,
    bus_ref: str,
    *,
    q: float | None,
    q_min: float | None,
    q_max: float | None,
    catalog_ref: str | None = None,
) -> dict:
    gen: dict = {"ref_id": ref_id, "bus_ref": bus_ref, "gen_type": "pv_inverter", "q_mvar": q}
    if q_min is not None or q_max is not None:
        gen["limits"] = {"q_min_mvar": q_min, "q_max_mvar": q_max}
    if catalog_ref is not None:
        gen["catalog_ref"] = catalog_ref
    return gen


# --------------------------------------------------------------------------
# Mapowanie i werdykty
# --------------------------------------------------------------------------


def test_source_within_range_is_adequate() -> None:
    run = _pf_run(
        generators=[_gen("g1", "b1", q=0.1, q_min=-0.5, q_max=0.5)],
        buses=[_bus("b1")],
        loads=[],
        bus_results=[{"bus_id": "n1", "v_pu": 1.0}],
        graph_nodes={"n1": {"element_id": "b1", "name": "B1"}},
    )
    view = build_reactive_adequacy_view(run)
    assert view["verdict"] == "wystarczajaca rezerwa Q"
    source = view["sources"][0]
    assert source["q_actual_mvar"] == 0.1
    assert source["is_saturated"] is False
    assert source["headroom_up_mvar"] == pytest.approx(0.4)
    assert len(source["white_box"]) >= 3


def test_saturated_source_exhausts_reserve() -> None:
    run = _pf_run(
        generators=[_gen("g1", "b1", q=0.5, q_min=-0.5, q_max=0.5)],
        buses=[_bus("b1")],
        loads=[],
        bus_results=[{"bus_id": "n1", "v_pu": 1.0}],
        graph_nodes={"n1": {"element_id": "b1"}},
    )
    view = build_reactive_adequacy_view(run)
    assert view["verdict"] == "rezerwa Q wyczerpana"
    assert view["sources"][0]["is_saturated"] is True
    assert view["sources"][0]["at_limit_pl"] == "Q_max"


def test_source_without_limits_is_no_data() -> None:
    run = _pf_run(
        generators=[_gen("g1", "b1", q=0.2, q_min=None, q_max=None)],
        buses=[_bus("b1")],
        loads=[],
        bus_results=[{"bus_id": "n1", "v_pu": 1.0}],
        graph_nodes={"n1": {"element_id": "b1"}},
    )
    view = build_reactive_adequacy_view(run)
    source = view["sources"][0]
    assert "q_min_mvar" in source["missing_data"]
    assert "q_max_mvar" in source["missing_data"]


def test_voltage_violation_detected() -> None:
    run = _pf_run(
        generators=[_gen("g1", "b1", q=0.1, q_min=-0.5, q_max=0.5)],
        buses=[_bus("b1", u_min=0.95, u_max=1.05)],
        loads=[],
        bus_results=[{"bus_id": "n1", "v_pu": 1.09}],
        graph_nodes={"n1": {"element_id": "b1"}},
    )
    view = build_reactive_adequacy_view(run)
    assert view["verdict"] == "rezerwa Q wyczerpana"
    assert len(view["voltage_violations"]) == 1
    assert view["voltage_violations"][0]["bus_ref"] == "b1"
    assert view["voltage_violations"][0]["kind_pl"] == "przekroczenie U_max"


def test_q_limits_and_provenance_from_converter_catalog() -> None:
    # Brak GenLimits → granice i proweniencja z karty przekształtnika.
    run = _pf_run(
        generators=[_gen("g1", "b1", q=0.1, q_min=None, q_max=None, catalog_ref="pv_inv_sma_2500")],
        buses=[_bus("b1")],
        loads=[],
        bus_results=[{"bus_id": "n1", "v_pu": 1.0}],
        graph_nodes={"n1": {"element_id": "b1"}},
    )
    view = build_reactive_adequacy_view(run)
    source = view["sources"][0]
    assert source["q_min_mvar"] == pytest.approx(-0.9)
    assert source["q_max_mvar"] == pytest.approx(0.9)
    assert source["missing_data"] == []
    assert view["provenance"]["worst_quality"] == "DATASHEET"


def test_not_converged_is_no_data() -> None:
    run = _pf_run(
        generators=[_gen("g1", "b1", q=0.1, q_min=-0.5, q_max=0.5)],
        buses=[_bus("b1")],
        loads=[],
        bus_results=[{"bus_id": "n1", "v_pu": 1.0}],
        graph_nodes={"n1": {"element_id": "b1"}},
        converged=False,
    )
    view = build_reactive_adequacy_view(run)
    assert view["verdict"] == "dane niekompletne"
    assert "power_flow_not_converged" in view["missing_data"]


def test_load_reactive_power_enters_balance() -> None:
    run = _pf_run(
        generators=[_gen("g1", "b1", q=0.5, q_min=-1.0, q_max=1.0)],
        buses=[_bus("b1")],
        loads=[{"ref_id": "l1", "q_mvar": 0.3}],
        bus_results=[{"bus_id": "n1", "v_pu": 1.0}],
        graph_nodes={"n1": {"element_id": "b1"}},
    )
    view = build_reactive_adequacy_view(run)
    assert view["balance"]["q_load_mvar"] == pytest.approx(0.3)
    assert view["balance"]["net_source_q_mvar"] == pytest.approx(0.5)


# --------------------------------------------------------------------------
# Determinizm i błędy
# --------------------------------------------------------------------------


def test_view_is_deterministic() -> None:
    run = _pf_run(
        generators=[_gen("g1", "b1", q=0.1, q_min=-0.5, q_max=0.5)],
        buses=[_bus("b1")],
        loads=[],
        bus_results=[{"bus_id": "n1", "v_pu": 1.0}],
        graph_nodes={"n1": {"element_id": "b1"}},
    )
    assert build_reactive_adequacy_view(run) == build_reactive_adequacy_view(run)


def test_rejects_non_power_flow_run() -> None:
    run = _pf_run(
        generators=[],
        buses=[],
        loads=[],
        bus_results=[],
        graph_nodes={},
        analysis_type="short_circuit_sn",
    )
    with pytest.raises(ValueError, match="przebiegu rozpływu"):
        build_reactive_adequacy_view(run)


def test_rejects_unfinished_run() -> None:
    run = _pf_run(
        generators=[], buses=[], loads=[], bus_results=[], graph_nodes={}, status="RUNNING"
    )
    with pytest.raises(ValueError, match="nie jest zakończony"):
        build_reactive_adequacy_view(run)


# --------------------------------------------------------------------------
# Realny przebieg (golden network) — kryterium (1): widok z White Box
# --------------------------------------------------------------------------


def test_real_power_flow_run_produces_view_with_provenance() -> None:
    enm = build_golden_enm()
    gens = list(enm.generators)
    gens[1] = gens[1].model_copy(
        update={
            "q_mvar": 0.5,
            "limits": GenLimits(q_min_mvar=-0.9, q_max_mvar=0.9),
            "catalog_ref": "pv_inv_sma_2500",
        }
    )
    enm = enm.model_copy(update={"generators": gens})
    set_enm("c1", enm)
    run = execute_run(create_run(case_id="c1", klucz_twin="c1", analysis_type="PF").id)
    assert run.status == "FINISHED", run.error_message

    view = build_reactive_adequacy_view(run)
    assert view["verdict"] in {
        "wystarczajaca rezerwa Q",
        "rezerwa Q wyczerpana",
        "dane niekompletne",
    }
    pv_sources = [s for s in view["sources"] if s["ref"] == "gen_pv"]
    assert pv_sources and pv_sources[0]["white_box"]
    assert view["provenance"]["worst_quality"] == "DATASHEET"
