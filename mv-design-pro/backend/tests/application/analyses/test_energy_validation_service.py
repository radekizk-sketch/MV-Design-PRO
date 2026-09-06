"""Testy serwisu aplikacyjnego walidacji energetycznej rozpływu — D2.

Zakres: odtworzenie zamrożonego PowerFlowResult i grafu ze snapshotu, obecność
pięciu typów kontroli na realnym przebiegu (golden network), determinizm, dane
niepełne → uczciwe statusy NOT_COMPUTED bez wyjątków oraz błędy rodzaju/statusu
przebiegu.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from application.analyses.energy_validation.service import build_energy_validation_view
from enm.canonical_analysis import (
    CanonicalRun,
    create_run,
    execute_run,
    reset_canonical_runs,
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


def _pf_run() -> CanonicalRun:
    set_enm("c-pf", build_golden_enm())
    return execute_run(create_run(case_id="c-pf", klucz_twin="c-pf", analysis_type="PF").id)


def _synthetic_pf_run(
    *,
    raw_result: dict | None,
    status: str = "FINISHED",
    analysis_type: str = "PF",
) -> CanonicalRun:
    """Przebieg PF z realnym snapshotem golden, lecz kontrolowanym wynikiem."""
    snapshot = build_golden_enm().model_dump(mode="json")
    return CanonicalRun(
        id=uuid4(),
        case_id="case-1",
        project_id="proj-1",
        analysis_type=analysis_type,
        status=status,
        created_at=datetime(2024, 1, 1, tzinfo=UTC),
        snapshot_hash="snap-hash",
        input_hash="in-hash",
        snapshot=snapshot,
        validation={},
        readiness={},
        raw_result=raw_result,
    )


# --------------------------------------------------------------------------
# Realny przebieg (golden network)
# --------------------------------------------------------------------------


def test_real_pf_run_produces_all_check_types() -> None:
    run = _pf_run()
    assert run.status == "FINISHED", run.error_message

    view = build_energy_validation_view(run)
    check_types = {item["check_type"] for item in view["items"]}
    assert check_types == {
        "BRANCH_LOADING",
        "TRANSFORMER_LOADING",
        "VOLTAGE_DEVIATION",
        "LOSS_BUDGET",
        "REACTIVE_BALANCE",
    }
    assert view["context"]["run_id"] == str(run.id)
    assert view["summary"]["pass_count"] >= 1


def test_real_pf_run_is_deterministic() -> None:
    run = _pf_run()
    first = build_energy_validation_view(run)
    second = build_energy_validation_view(run)
    assert json.dumps(first, sort_keys=True) == json.dumps(second, sort_keys=True)


def test_json_serializable() -> None:
    run = _pf_run()
    view = build_energy_validation_view(run)
    serialized = json.dumps(view, sort_keys=True)
    assert len(serialized) > 100


# --------------------------------------------------------------------------
# Dane niepełne — uczciwe statusy bez wyjątków
# --------------------------------------------------------------------------


def test_incomplete_result_yields_not_computed_without_exception() -> None:
    # Przebieg zakończony, lecz bez zapisanego wyniku (result_v1) — builder musi
    # wydać uczciwie NOT_COMPUTED zamiast rzucać wyjątkiem.
    run = _synthetic_pf_run(raw_result={})
    view = build_energy_validation_view(run)
    assert view["summary"]["not_computed_count"] >= 1
    assert view["summary"]["fail_count"] == 0
    assert any(item["status"] == "NOT_COMPUTED" for item in view["items"])


def test_missing_slack_q_mvar_is_not_computed_not_zero() -> None:
    """FAB-E (E1): brak JEDNEJ skladowej bilansu slacka nie jest bilansem zerowym.

    Przebieg ma kompletna moc czynna strat/slacka, ale brak ``total_losses_q_mvar``
    i ``slack_q_mvar`` w podsumowaniu solvera. Przed poprawka brakujaca skladowa
    byla czytana jako 0.0, wiec LOSS_BUDGET/REACTIVE_BALANCE liczyly bilans z
    polowy danych i mogly wydac PASS/WARN/FAIL na podstawie fikcyjnej wartosci.
    Po poprawce caly bilans jest NIEZNANY (NaN, kontrakt solvera dla „nieznana")
    -> obie pozycje NOT_COMPUTED z jawnym powodem, bez wyjatku.
    """
    run = _synthetic_pf_run(
        raw_result={
            "result_v1": {
                "base_mva": 100.0,
                "iterations_count": 3,
                "tolerance_used": 1e-6,
                "converged": True,
                "branch_results": [],
                "bus_results": [],
                "summary": {
                    "total_losses_p_mw": 0.5,
                    "slack_p_mw": 5.0,
                    # total_losses_q_mvar / slack_q_mvar celowo nieobecne
                },
            }
        }
    )

    view = build_energy_validation_view(run)

    by_type = {
        item["check_type"]: item
        for item in view["items"]
        if item["check_type"] in {"LOSS_BUDGET", "REACTIVE_BALANCE"}
    }
    assert by_type["LOSS_BUDGET"]["status"] == "NOT_COMPUTED"
    assert by_type["LOSS_BUDGET"]["observed_value"] is None
    assert "nieoznaczon" in by_type["LOSS_BUDGET"]["why_pl"]
    assert by_type["REACTIVE_BALANCE"]["status"] == "NOT_COMPUTED"
    assert by_type["REACTIVE_BALANCE"]["observed_value"] is None
    assert "nieoznaczon" in by_type["REACTIVE_BALANCE"]["why_pl"]


def test_missing_branch_q_from_mvar_drops_branch_from_s_from_mva() -> None:
    """FAB-E (E1): brak ``q_from_mvar`` galezi nie jest moca zerowa.

    Wiersz realnej galezi (golden PF run) z usunieta skladowa ``q_from_mvar`` —
    strona "from" musi zniknac z ``branch_s_from_mva`` (nie fikcyjne 0+0j),
    zeby ``analysis.energy_validation.builder`` poprawnie odczytal ja jako
    NIEZNANA (a nie jako moc pozorna zlozona z polowy danych).
    """
    from application.analyses.energy_validation.service import _reconstruct_power_flow_result

    run = _pf_run()
    real_branch_rows = run.raw_result["result_v1"]["branch_results"]
    assert real_branch_rows, "golden PF run musi miec przynajmniej jedna galaz"
    branch_id = str(real_branch_rows[0]["branch_id"])

    incomplete_row = dict(real_branch_rows[0])
    del incomplete_row["q_from_mvar"]

    synthetic_result_v1 = dict(run.raw_result["result_v1"])
    synthetic_result_v1["branch_results"] = [incomplete_row]
    synthetic_raw_result = dict(run.raw_result)
    synthetic_raw_result["result_v1"] = synthetic_result_v1

    run_niekompletny = _synthetic_pf_run(raw_result=synthetic_raw_result)
    pf_result = _reconstruct_power_flow_result(run_niekompletny)

    assert (
        branch_id not in pf_result.branch_s_from_mva
    ), "brak q_from_mvar musi usunac wpis (nie wstawic fikcyjne 0+0j)"
    assert branch_id in pf_result.branch_s_to_mva, "strona 'to' byla kompletna — musi zostac"


def test_missing_raw_result_yields_not_computed() -> None:
    run = _synthetic_pf_run(raw_result=None)
    view = build_energy_validation_view(run)
    assert all(
        item["status"] in {"NOT_COMPUTED", "PASS", "WARNING", "FAIL"} for item in view["items"]
    )
    assert view["summary"]["not_computed_count"] >= 1


# --------------------------------------------------------------------------
# Błędy rodzaju/statusu przebiegu
# --------------------------------------------------------------------------


def test_rejects_non_pf_run() -> None:
    run = _synthetic_pf_run(raw_result={}, analysis_type="short_circuit_sn")
    with pytest.raises(ValueError, match="przebiegu rozpływu"):
        build_energy_validation_view(run)


def test_rejects_unfinished_run() -> None:
    run = _synthetic_pf_run(raw_result={}, status="RUNNING")
    with pytest.raises(ValueError, match="nie jest zakończony"):
        build_energy_validation_view(run)
