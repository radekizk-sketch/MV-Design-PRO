"""Testy serwisu aplikacyjnego zdolności przyłączeniowej sieci — D3.

Zakres: deterministyczny przegląd scenariuszy rozpływu na realnym modelu
(golden network), monotoniczność pasma, granica wiążąca napięciowa vs
obciążeniowa, determinizm dwóch wywołań, węzeł bez możliwości (0 MW), parametry
brzegowe oraz błędy rodzaju/statusu przebiegu i węzłów-kandydatów.

ZERO nowej fizyki: rozpływ liczy istniejący solver przez istniejącą ścieżkę
wykonania (``_execute_power_flow``), oceny przez istniejący builder walidacji D2.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from application.analyses.hosting_capacity import (
    _existing_generation_mw,
    build_hosting_capacity_view,
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
    return execute_run(create_run(case_id="c-pf", klucz_twin="c-pf", analysis_type="PF").id)


def _synthetic_pf_run(
    enm: EnergyNetworkModel,
    *,
    status: str = "FINISHED",
    analysis_type: str = "PF",
) -> CanonicalRun:
    """Przebieg PF z realnym snapshotem, bez persystencji.

    Serwis zdolności przyłączeniowej sam wykonuje rozpływ przez istniejącą
    ścieżkę wykonania — bazowy ``raw_result`` nie jest odczytywany.
    """
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
    """Długa linia o dużej impedancji i wysokim prądzie znamionowym: napięcie
    zdalnego węzła przekracza pasmo ZANIM prąd osiągnie granicę obciążenia."""
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
    """Linia już przeciążona przy zerowym wstrzyknięciu — zdolność = 0 MW."""
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


def _no_generators_enm() -> EnergyNetworkModel:
    enm = build_golden_enm()
    return enm.model_copy(update={"generators": []})


# --------------------------------------------------------------------------
# Realny przebieg (golden network)
# --------------------------------------------------------------------------


def test_golden_run_produces_view_structure() -> None:
    run = _golden_pf_run()
    assert run.status == "FINISHED", run.error_message
    view = build_hosting_capacity_view(run)
    assert view["analysis"] == "hosting_capacity"
    assert view["context"]["run_id"] == str(run.id)
    assert view["parameters"]["step_mw"] == 0.5
    assert view["parameters"]["max_steps"] == 40
    assert len(view["nodes"]) == 2
    node = view["nodes"][0]
    assert {"bus_ref", "max_hosting_capacity_mw", "binding_criterion", "scenarios"} <= set(node)


def test_default_candidates_are_generator_buses_sorted() -> None:
    run = _golden_pf_run()
    view = build_hosting_capacity_view(run)
    assert view["parameters"]["candidate_bus_refs"] == ["bus_nn", "bus_sn_c"]


def test_scenarios_are_monotonic_prefix() -> None:
    run = _golden_pf_run()
    view = build_hosting_capacity_view(run, candidate_bus_refs=["bus_sn_c"], max_steps=20)
    scenarios = view["nodes"][0]["scenarios"]
    powers = [s["added_power_mw"] for s in scenarios]
    assert powers == sorted(powers)
    assert powers[0] == 0.0
    acceptable = [s["acceptable"] for s in scenarios]
    # Pasmo dopuszczalne jest prefiksem: True...True, ewentualnie zakończone jednym False.
    assert acceptable.count(False) <= 1
    if False in acceptable:
        assert acceptable[-1] is False
        assert all(acceptable[:-1])
    # Maksymalna moc = ostatnia moc dopuszczalna.
    last_ok = max(s["added_power_mw"] for s in scenarios if s["acceptable"])
    assert view["nodes"][0]["max_hosting_capacity_mw"] == last_ok


def test_loading_bound_criterion_on_golden() -> None:
    run = _golden_pf_run()
    view = build_hosting_capacity_view(run, candidate_bus_refs=["bus_sn_c"])
    node = view["nodes"][0]
    assert node["max_hosting_capacity_mw"] > 0.0
    crit = node["binding_criterion"]
    assert crit["kind"] == "loading"
    assert crit["check_type"] in {"BRANCH_LOADING", "TRANSFORMER_LOADING"}
    assert crit["element_name"] is not None
    assert crit["limit_fail"] == 100.0


def test_voltage_bound_criterion() -> None:
    run = _synthetic_pf_run(_voltage_bound_enm())
    view = build_hosting_capacity_view(run, candidate_bus_refs=["b_rem"])
    crit = view["nodes"][0]["binding_criterion"]
    assert crit["kind"] == "voltage"
    assert crit["check_type"] == "VOLTAGE_DEVIATION"
    assert crit["limit_fail"] == 10.0
    assert crit["observed_value"] > 10.0


def test_zero_capacity_when_base_already_overloaded() -> None:
    run = _synthetic_pf_run(_overloaded_base_enm())
    view = build_hosting_capacity_view(run, candidate_bus_refs=["b_rem"], max_steps=5)
    node = view["nodes"][0]
    assert node["max_hosting_capacity_mw"] == 0.0
    assert node["scenarios"][0]["acceptable"] is False
    assert node["binding_criterion"]["kind"] == "loading"


def test_deterministic_two_calls() -> None:
    run = _golden_pf_run()
    first = build_hosting_capacity_view(run)
    second = build_hosting_capacity_view(run)
    assert json.dumps(first, sort_keys=True) == json.dumps(second, sort_keys=True)


def test_input_hash_changes_with_parameters() -> None:
    run = _golden_pf_run()
    base = build_hosting_capacity_view(run, step_mw=0.5)["input_hash"]
    other = build_hosting_capacity_view(run, step_mw=1.0)["input_hash"]
    assert base != other


def test_json_serializable() -> None:
    run = _golden_pf_run()
    view = build_hosting_capacity_view(run)
    assert len(json.dumps(view, sort_keys=True)) > 100


# --------------------------------------------------------------------------
# Parametry i węzły-kandydaci
# --------------------------------------------------------------------------


def test_explicit_candidate_is_honored() -> None:
    run = _golden_pf_run()
    view = build_hosting_capacity_view(run, candidate_bus_refs=["bus_nn"])
    assert [n["bus_ref"] for n in view["nodes"]] == ["bus_nn"]


def test_unknown_candidate_raises() -> None:
    run = _golden_pf_run()
    with pytest.raises(ValueError, match="nie istnieją"):
        build_hosting_capacity_view(run, candidate_bus_refs=["bus_nieistniejacy"])


def test_empty_candidate_list_raises() -> None:
    run = _golden_pf_run()
    with pytest.raises(ValueError, match="pusta"):
        build_hosting_capacity_view(run, candidate_bus_refs=[])


def test_no_generators_default_raises() -> None:
    run = _synthetic_pf_run(_no_generators_enm())
    with pytest.raises(ValueError, match="Brak węzłów-kandydatów"):
        build_hosting_capacity_view(run)


def test_non_positive_step_raises() -> None:
    run = _golden_pf_run()
    with pytest.raises(ValueError, match="Krok mocy"):
        build_hosting_capacity_view(run, step_mw=0.0)


def test_too_few_steps_raises() -> None:
    run = _golden_pf_run()
    with pytest.raises(ValueError, match="Limit kroków"):
        build_hosting_capacity_view(run, max_steps=0)


def test_rejects_non_pf_run() -> None:
    run = _synthetic_pf_run(build_golden_enm(), analysis_type="short_circuit_sn")
    with pytest.raises(ValueError, match="przebiegu rozpływu"):
        build_hosting_capacity_view(run)


def test_rejects_unfinished_run() -> None:
    run = _synthetic_pf_run(build_golden_enm(), status="RUNNING")
    with pytest.raises(ValueError, match="nie jest zakończony"):
        build_hosting_capacity_view(run)


# --------------------------------------------------------------------------
# D3a: straty i skrajne napięcia scenariuszy (ADDYTYWNE)
# --------------------------------------------------------------------------


def test_scenario_carries_losses_and_voltage_fields() -> None:
    """Każdy scenariusz niesie nowe pola liczbowe (nie None) na zbieżnym golden run."""
    run = _golden_pf_run()
    view = build_hosting_capacity_view(run, candidate_bus_refs=["bus_sn_c"], max_steps=5)
    for scenario in view["nodes"][0]["scenarios"]:
        assert scenario["converged"] is True
        assert isinstance(scenario["total_losses_p_mw"], float)
        assert isinstance(scenario["min_voltage_pu"], float)
        assert isinstance(scenario["max_voltage_pu"], float)
        assert scenario["min_voltage_pu"] <= scenario["max_voltage_pu"]


def test_scenario_losses_and_voltage_are_rounded_to_six_places() -> None:
    run = _golden_pf_run()
    view = build_hosting_capacity_view(run, candidate_bus_refs=["bus_sn_c"], max_steps=3)
    for scenario in view["nodes"][0]["scenarios"]:
        for key in ("total_losses_p_mw", "min_voltage_pu", "max_voltage_pu"):
            value = scenario[key]
            assert round(value, 6) == value


def test_losses_increase_monotonically_with_added_power() -> None:
    """Straty czynne rosną (nie maleją) wraz z dodawaną mocą — sanity walidacji
    poprawności ścieżki odczytu (nie fizyki: solver liczy, tu tylko sprawdzamy
    spójność odczytanych wartości)."""
    run = _golden_pf_run()
    view = build_hosting_capacity_view(run, candidate_bus_refs=["bus_sn_c"], max_steps=10)
    losses = [s["total_losses_p_mw"] for s in view["nodes"][0]["scenarios"] if s["acceptable"]]
    assert len(losses) >= 2
    assert all(b >= a - 1e-9 for a, b in zip(losses, losses[1:], strict=False))


def test_node_losses_baseline_and_at_limit_present_on_golden() -> None:
    run = _golden_pf_run()
    view = build_hosting_capacity_view(run, candidate_bus_refs=["bus_sn_c"], max_steps=10)
    node = view["nodes"][0]
    assert node["losses_baseline_p_mw"] == node["scenarios"][0]["total_losses_p_mw"]
    assert node["losses_at_limit_p_mw"] is not None
    last_acceptable = [s for s in node["scenarios"] if s["acceptable"]][-1]
    assert node["losses_at_limit_p_mw"] == last_acceptable["total_losses_p_mw"]
    # Przyrost strat: granica >= bazowa (więcej mocy dodanej -> więcej strat).
    assert node["losses_at_limit_p_mw"] >= node["losses_baseline_p_mw"]


def test_losses_at_limit_is_null_when_base_already_overloaded() -> None:
    """Gdy 0 MW jest już niedopuszczalne, nie istnieje żaden dopuszczalny
    scenariusz -> losses_at_limit_p_mw = null (bez zgadywania). Baseline nadal
    dostępny, bo rozpływ dla 0 MW jest zbieżny."""
    run = _synthetic_pf_run(_overloaded_base_enm())
    view = build_hosting_capacity_view(run, candidate_bus_refs=["b_rem"], max_steps=5)
    node = view["nodes"][0]
    assert node["losses_at_limit_p_mw"] is None
    assert node["losses_baseline_p_mw"] is not None
    assert node["scenarios"][0]["min_voltage_pu"] is not None
    assert node["scenarios"][0]["max_voltage_pu"] is not None


def test_d3a_fields_are_additive_existing_fields_unchanged() -> None:
    """Addytywność: obecność nowych pól nie zmienia dotychczasowych — kontrakt
    D3 (struktura, wartości monotoniczności/binding) pozostaje identyczny."""
    run = _golden_pf_run()
    view = build_hosting_capacity_view(run, candidate_bus_refs=["bus_sn_c"], max_steps=20)
    node = view["nodes"][0]
    # Stare pola/kontrakt D3 bez zmian.
    assert {
        "bus_ref",
        "bus_name",
        "existing_generation_mw",
        "max_hosting_capacity_mw",
        "binding_criterion",
        "scenarios",
    } <= set(node)
    assert node["max_hosting_capacity_mw"] > 0.0
    assert node["binding_criterion"]["kind"] == "loading"
    powers = [s["added_power_mw"] for s in node["scenarios"]]
    assert powers == sorted(powers)
    # Nowe pola dodane obok starych, nie zamiast.
    assert {"losses_baseline_p_mw", "losses_at_limit_p_mw"} <= set(node)
    for scenario in node["scenarios"]:
        assert {"added_power_mw", "converged", "acceptable", "binding"} <= set(scenario)
        assert {"total_losses_p_mw", "min_voltage_pu", "max_voltage_pu"} <= set(scenario)


class TestExistingGenerationMissingPMwIsNotFabricatedZero:
    """FAB-E (E1): p_mw brakujące dla jednego generatora to uszkodzony wpis,
    nie 0 MW — fabrykowane 0 zaniżyłoby moc istniejącej generacji i mogłoby
    zawyżyć wyliczoną zdolność przyłączeniową."""

    def test_missing_p_mw_skips_generator_not_zero(self) -> None:
        snapshot = {
            "generators": [
                {"bus_ref": "bus_a", "p_mw": 1.5},
                {"bus_ref": "bus_a"},  # p_mw brakuje
            ]
        }
        assert _existing_generation_mw(snapshot, "bus_a") == pytest.approx(1.5)

    def test_complete_generators_regression_sums_normally(self) -> None:
        snapshot = {
            "generators": [
                {"bus_ref": "bus_a", "p_mw": 1.5},
                {"bus_ref": "bus_a", "p_mw": 2.0},
            ]
        }
        assert _existing_generation_mw(snapshot, "bus_a") == pytest.approx(3.5)
