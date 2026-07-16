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
    return execute_run(create_run(case_id="c-pf", analysis_type="PF").id)


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
    assert view["context"]["trace_id"] == str(run.id)
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
