"""Testy serwisu aplikacyjnego obszaru bezpiecznej pracy P–Q węzła — D5.

Zakres: deterministyczna siatka scenariuszy rozpływu na realnym modelu (golden
network) oraz syntetycznych sieciach; sensowność kształtu obszaru (pasmo Q
zwęża się przy dużym P), granica napięciowa vs obciążeniowa per skrajny punkt,
determinizm dwóch wywołań, węzeł nieznany, parametry brzegowe, limit biegów oraz
błędy rodzaju/statusu przebiegu.

ZERO nowej fizyki: rozpływ liczy istniejący solver przez istniejącą ścieżkę
wykonania (``_execute_power_flow``), oceny przez istniejący builder walidacji D2.
Q generatora próbnego wpływa na rozpływ (recon: ``enm/mapping.py:201``).
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from application.analyses.pq_area import (
    DEFAULT_MAX_STEPS_P,
    DEFAULT_MAX_STEPS_Q,
    DEFAULT_STEP_P_MW,
    DEFAULT_STEP_Q_MVAR,
    build_pq_area_view,
)
from enm.canonical_analysis import (
    CanonicalRun,
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
    Source,
)
from enm.store import reset_enm_store, set_enm

from tests.cgmes.golden_enm import build_golden_enm


@pytest.fixture(autouse=True)
def _reset() -> None:
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _golden_pf_run() -> CanonicalRun:
    set_enm("c-pf", build_golden_enm())
    return execute_run(create_run(case_id="c-pf", analysis_type="PF").id)


def _synthetic_pf_run(
    enm: EnergyNetworkModel,
    *,
    status: str = "FINISHED",
    analysis_type: str = "PF",
) -> CanonicalRun:
    """Przebieg PF z realnym snapshotem, bez persystencji."""
    return CanonicalRun(
        id=uuid4(),
        case_id="case-1",
        project_id="proj-1",
        analysis_type=analysis_type,
        status=status,
        created_at=datetime(2024, 1, 1, tzinfo=UTC),
        snapshot_hash="snap-hash",
        input_hash="in-hash",
        snapshot=enm.model_dump(mode="json"),
        validation={},
        readiness={},
    )


def _voltage_bound_enm() -> EnergyNetworkModel:
    """Słaba, długa linia: wstrzyknięcie mocy (P lub Q dodatnie) podnosi napięcie
    zdalnego węzła ponad pasmo ZANIM prąd osiągnie granicę obciążenia."""
    return EnergyNetworkModel(
        header=ENMHeader(name="Napiecie graniczne"),
        buses=[
            Bus(ref_id="b_slack", name="Slack", voltage_kv=15.0),
            Bus(ref_id="b_rem", name="Wezel zdalny", voltage_kv=15.0),
        ],
        sources=[
            Source(
                ref_id="s",
                name="System",
                bus_ref="b_slack",
                model="short_circuit_power",
                sk3_mva=5000.0,
                r_ohm=0.1,
                x_ohm=1.0,
            ),
        ],
        loads=[Load(ref_id="ld", name="Odbior", bus_ref="b_rem", p_mw=0.1, q_mvar=0.03)],
        branches=[
            OverheadLine(
                ref_id="ln",
                name="Linia dluga",
                from_bus_ref="b_slack",
                to_bus_ref="b_rem",
                length_km=20.0,
                r_ohm_per_km=0.5,
                x_ohm_per_km=0.4,
                rating=BranchRating(in_a=3000.0),
            ),
        ],
    )


def _overloaded_base_enm() -> EnergyNetworkModel:
    """Linia już przeciążona przy zerowym wstrzyknięciu — brak pasma pracy."""
    return EnergyNetworkModel(
        header=ENMHeader(name="Przeciazenie bazowe"),
        buses=[
            Bus(ref_id="b_slack", name="Slack", voltage_kv=15.0),
            Bus(ref_id="b_rem", name="Wezel zdalny", voltage_kv=15.0),
        ],
        sources=[
            Source(
                ref_id="s",
                name="System",
                bus_ref="b_slack",
                model="short_circuit_power",
                sk3_mva=5000.0,
                r_ohm=0.1,
                x_ohm=1.0,
            ),
        ],
        loads=[Load(ref_id="ld", name="Odbior", bus_ref="b_rem", p_mw=8.0, q_mvar=2.0)],
        branches=[
            OverheadLine(
                ref_id="ln",
                name="Linia",
                from_bus_ref="b_slack",
                to_bus_ref="b_rem",
                length_km=5.0,
                r_ohm_per_km=0.3,
                x_ohm_per_km=0.3,
                rating=BranchRating(in_a=200.0),
            ),
        ],
    )


# --------------------------------------------------------------------------
# Struktura i parametry
# --------------------------------------------------------------------------


def test_golden_run_produces_view_structure() -> None:
    run = _golden_pf_run()
    assert run.status == "FINISHED", run.error_message
    view = build_pq_area_view(run, bus_ref="bus_sn_c", max_steps_p=2, max_steps_q=2)
    assert view["analysis"] == "pq_area"
    assert view["context"]["run_id"] == str(run.id)
    assert view["bus_ref"] == "bus_sn_c"
    assert view["bus_name"] == "Stacja C SN"
    assert {"parameters", "input_hash", "vertices", "total_runs", "existing_generation"} <= set(
        view
    )
    vertex = view["vertices"][0]
    assert {
        "p_mw",
        "feasible",
        "q_min_dop_mvar",
        "q_max_dop_mvar",
        "binding_low",
        "binding_high",
        "binding_center",
        "runs",
    } <= set(vertex)


def test_default_parameters_are_documented_values() -> None:
    assert DEFAULT_STEP_P_MW == 0.5
    assert DEFAULT_STEP_Q_MVAR == 0.25
    assert DEFAULT_MAX_STEPS_P == 20
    assert DEFAULT_MAX_STEPS_Q == 16
    run = _golden_pf_run()
    view = build_pq_area_view(run, bus_ref="bus_sn_c", max_steps_p=2, max_steps_q=2)
    params = view["parameters"]
    assert params["step_p_mw"] == 0.5
    assert params["step_q_mvar"] == 0.25
    assert params["max_total_runs"] == (2 + 1) * (1 + 2 * 2)


def test_vertices_sorted_by_p_ascending() -> None:
    run = _golden_pf_run()
    view = build_pq_area_view(run, bus_ref="bus_sn_c", max_steps_p=6, max_steps_q=4)
    powers = [v["p_mw"] for v in view["vertices"]]
    assert powers == sorted(powers)
    assert powers[0] == 0.0


def test_feasible_band_contains_zero() -> None:
    run = _golden_pf_run()
    view = build_pq_area_view(run, bus_ref="bus_sn_c", max_steps_p=6, max_steps_q=6)
    for vertex in view["vertices"]:
        if vertex["feasible"]:
            assert vertex["q_min_dop_mvar"] <= 0.0 <= vertex["q_max_dop_mvar"]


def test_existing_generation_reported() -> None:
    run = _golden_pf_run()
    view = build_pq_area_view(run, bus_ref="bus_sn_c", max_steps_p=1, max_steps_q=1)
    # Golden: generator synchroniczny na bus_sn_c (P=2.0, Q=0.6).
    assert view["existing_generation"] == {"p_mw": 2.0, "q_mvar": 0.6}


# --------------------------------------------------------------------------
# Sensowność kształtu obszaru
# --------------------------------------------------------------------------


def test_q_band_narrows_with_growing_p_on_weak_network() -> None:
    """Sieć słaba: pasmo Q (od strony dodatniej) zwęża się monotonicznie wraz z P."""
    run = _synthetic_pf_run(_voltage_bound_enm())
    view = build_pq_area_view(run, bus_ref="b_rem", max_steps_p=4, max_steps_q=12)
    q_max = [v["q_max_dop_mvar"] for v in view["vertices"] if v["feasible"]]
    assert len(q_max) >= 3
    # Nierosnące i faktycznie zwężające się (nie płaskie) na słabej sieci.
    assert all(b <= a + 1e-9 for a, b in zip(q_max, q_max[1:], strict=False))
    assert q_max[-1] < q_max[0]


def test_q_band_flat_or_narrowing_on_golden() -> None:
    run = _golden_pf_run()
    view = build_pq_area_view(run, bus_ref="bus_sn_c", max_steps_p=8, max_steps_q=10)
    feasible = [v for v in view["vertices"] if v["feasible"]]
    width_first = feasible[0]["q_max_dop_mvar"] - feasible[0]["q_min_dop_mvar"]
    width_last = feasible[-1]["q_max_dop_mvar"] - feasible[-1]["q_min_dop_mvar"]
    # Pasmo nie rozszerza się przy dużym P (zwęża się LUB pozostaje płaskie).
    assert width_last <= width_first + 1e-9


def test_voltage_binding_on_high_edge_weak_network() -> None:
    """Granica napięciowa: wstrzyknięcie dodatniego Q w słabej sieci przekracza
    pasmo napięć (binding skrajnego górnego punktu = voltage)."""
    run = _synthetic_pf_run(_voltage_bound_enm())
    view = build_pq_area_view(run, bus_ref="b_rem", max_steps_p=4, max_steps_q=12)
    highs = [v["binding_high"] for v in view["vertices"] if v["feasible"]]
    voltage_edges = [b for b in highs if b["kind"] == "voltage"]
    assert voltage_edges, "oczekiwano granicy napięciowej na górnym skraju Q"
    top = voltage_edges[0]
    assert top["check_type"] == "VOLTAGE_DEVIATION"
    assert top["element_name"] is not None
    assert top["limit_fail"] == 10.0


def test_loading_binding_on_golden() -> None:
    """Granica obciążeniowa: na golden network przy dużym P skrajny punkt Q jest
    ograniczony obciążeniem gałęzi/transformatora (nie napięciem).

    V12K-187: zasięg po P zwiększony 8 → 20. Do naprawy bazy napięciowej Y-bus
    rozpływu impedancje gałęzi spoza poziomu slacka były zaniżone o (U/U_slack)²,
    więc prądy w sieci wzorcowej wychodziły niefizyczne i granica obciążeniowa
    pojawiała się już przy 8 krokach. Przy poprawnych impedancjach sieć jest
    realnie mniej obciążona i trzeba sięgnąć dalej po P, żeby to OBCIĄŻENIE — a
    nie napięcie — stało się wiążące. Intencja testu bez zmian.
    """
    run = _golden_pf_run()
    view = build_pq_area_view(run, bus_ref="bus_sn_c", max_steps_p=20, max_steps_q=10)
    bindings = [
        b
        for v in view["vertices"]
        for b in (v["binding_low"], v["binding_high"])
        if b["kind"] == "loading"
    ]
    assert bindings, "oczekiwano granicy obciążeniowej na golden network"
    top = bindings[0]
    assert top["check_type"] in {"BRANCH_LOADING", "TRANSFORMER_LOADING"}
    assert top["limit_fail"] == 100.0


def test_center_infeasible_breaks_p_dimension() -> None:
    """Gdy scenariusz środkowy (Q = 0) staje się niedopuszczalny, wiersz P nie ma
    pasma pracy i wymiar P jest zamykany — ostatni wierzchołek jest niefeasible."""
    run = _synthetic_pf_run(_voltage_bound_enm())
    view = build_pq_area_view(run, bus_ref="b_rem", max_steps_p=20, max_steps_q=12)
    last = view["vertices"][-1]
    assert last["feasible"] is False
    assert last["q_min_dop_mvar"] is None
    assert last["q_max_dop_mvar"] is None
    assert last["binding_center"]["kind"] == "voltage"
    # Tylko ostatni wierzchołek jest niefeasible (prefiks dopuszczalny).
    assert all(v["feasible"] for v in view["vertices"][:-1])


def test_base_overloaded_yields_single_infeasible_vertex() -> None:
    run = _synthetic_pf_run(_overloaded_base_enm())
    view = build_pq_area_view(run, bus_ref="b_rem", max_steps_p=5, max_steps_q=5)
    assert len(view["vertices"]) == 1
    vertex = view["vertices"][0]
    assert vertex["p_mw"] == 0.0
    assert vertex["feasible"] is False
    assert vertex["binding_center"]["kind"] == "loading"
    assert view["total_runs"] == 1


# --------------------------------------------------------------------------
# Determinizm, hash, limit biegów
# --------------------------------------------------------------------------


def test_deterministic_two_calls() -> None:
    run = _golden_pf_run()
    first = build_pq_area_view(run, bus_ref="bus_sn_c", max_steps_p=3, max_steps_q=3)
    second = build_pq_area_view(run, bus_ref="bus_sn_c", max_steps_p=3, max_steps_q=3)
    assert json.dumps(first, sort_keys=True) == json.dumps(second, sort_keys=True)


def test_input_hash_changes_with_parameters() -> None:
    run = _golden_pf_run()
    base = build_pq_area_view(run, bus_ref="bus_sn_c", max_steps_p=2, max_steps_q=2)["input_hash"]
    other = build_pq_area_view(
        run, bus_ref="bus_sn_c", step_q_mvar=0.5, max_steps_p=2, max_steps_q=2
    )["input_hash"]
    assert base != other


def test_total_runs_within_documented_limit() -> None:
    run = _golden_pf_run()
    view = build_pq_area_view(run, bus_ref="bus_sn_c", max_steps_p=5, max_steps_q=4)
    assert view["total_runs"] <= view["parameters"]["max_total_runs"]
    assert view["parameters"]["max_total_runs"] == (5 + 1) * (1 + 2 * 4)


def test_json_serializable() -> None:
    run = _golden_pf_run()
    view = build_pq_area_view(run, bus_ref="bus_sn_c", max_steps_p=2, max_steps_q=2)
    assert len(json.dumps(view, sort_keys=True)) > 100


# --------------------------------------------------------------------------
# Węzeł i parametry brzegowe / błędy
# --------------------------------------------------------------------------


def test_unknown_bus_raises() -> None:
    run = _golden_pf_run()
    with pytest.raises(ValueError, match="nie istnieje"):
        build_pq_area_view(run, bus_ref="bus_nieistniejacy")


def test_non_positive_step_p_raises() -> None:
    run = _golden_pf_run()
    with pytest.raises(ValueError, match="Krok mocy czynnej"):
        build_pq_area_view(run, bus_ref="bus_sn_c", step_p_mw=0.0)


def test_non_positive_step_q_raises() -> None:
    run = _golden_pf_run()
    with pytest.raises(ValueError, match="Krok mocy biernej"):
        build_pq_area_view(run, bus_ref="bus_sn_c", step_q_mvar=0.0)


def test_too_few_p_steps_raises() -> None:
    run = _golden_pf_run()
    with pytest.raises(ValueError, match="Limit kroków mocy czynnej"):
        build_pq_area_view(run, bus_ref="bus_sn_c", max_steps_p=0)


def test_too_few_q_steps_raises() -> None:
    run = _golden_pf_run()
    with pytest.raises(ValueError, match="Limit kroków mocy biernej"):
        build_pq_area_view(run, bus_ref="bus_sn_c", max_steps_q=0)


def test_rejects_non_pf_run() -> None:
    run = _synthetic_pf_run(build_golden_enm(), analysis_type="short_circuit_sn")
    with pytest.raises(ValueError, match="przebiegu rozpływu"):
        build_pq_area_view(run, bus_ref="bus_sn_c")


def test_rejects_unfinished_run() -> None:
    run = _synthetic_pf_run(build_golden_enm(), status="RUNNING")
    with pytest.raises(ValueError, match="nie jest zakończony"):
        build_pq_area_view(run, bus_ref="bus_sn_c")
