"""Guards for V12.xx draft UI vs committed ENM isolation."""

import pytest
from enm.canonical_analysis import (
    build_execution_result_set,
    build_short_circuit_results,
    create_run,
    execute_run,
    reset_canonical_runs,
)
from enm.models import EnergyNetworkModel
from enm.store import reset_enm_store, set_enm

from tests.catalog_test_helpers import gpz_source_record


def _valid_enm_payload(name: str) -> dict:
    return {
        "header": {
            "name": name,
            "enm_version": "1.0",
            "defaults": {"frequency_hz": 50, "unit_system": "SI"},
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-01T00:00:00Z",
            "revision": 1,
            "hash_sha256": "",
        },
        "buses": [
            {
                "id": "00000000-0000-0000-0000-000000000001",
                "ref_id": "b1",
                "name": "B1",
                "tags": [],
                "meta": {},
                "voltage_kv": 15,
                "phase_system": "3ph",
            }
        ],
        "branches": [],
        "transformers": [],
        "sources": [
            {
                "id": "00000000-0000-0000-0000-000000000002",
                "tags": [],
                "meta": {},
                **gpz_source_record(
                    ref_id="s1",
                    name="S1",
                    bus_ref="b1",
                    voltage_kv=15.0,
                    sk3_mva=200.0,
                    rx_ratio=0.10,
                ),
            }
        ],
        "loads": [],
        "generators": [],
        "substations": [],
        "bays": [],
        "junctions": [],
        "corridors": [],
        "measurements": [],
        "protection_assignments": [],
        "branch_points": [],
    }


def _valid_enm_payload_with_z0(name: str) -> dict:
    payload = _valid_enm_payload(name)
    payload["sources"][0].update({"r0_ohm": 0.16, "x0_ohm": 1.6})
    return payload


@pytest.fixture(autouse=True)
def reset_state():
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def test_execute_run_uses_frozen_snapshot_not_post_creation_enm_mutation():
    case_id = "draft-isolation-sc"
    set_enm(case_id, EnergyNetworkModel.model_validate(_valid_enm_payload("Siec pierwotna")))

    run = create_run(case_id=case_id, analysis_type="short_circuit_sn")
    frozen_hash = run.snapshot_hash
    frozen_name = run.snapshot["header"]["name"]

    set_enm(
        case_id,
        EnergyNetworkModel.model_validate(_valid_enm_payload("Siec zmieniona po zamrozeniu")),
    )

    result = execute_run(run.id)

    assert result.status == "FINISHED", result.error_message
    assert result.snapshot_hash == frozen_hash
    assert result.snapshot["header"]["name"] == frozen_name
    assert result.snapshot["header"]["name"] == "Siec pierwotna"
    assert result.raw_result is not None
    assert result.raw_result["enm_hash"] == frozen_hash


def test_execute_run_supports_1f_when_z0_is_committed_in_enm():
    case_id = "canonical-sc-1f"
    set_enm(case_id, EnergyNetworkModel.model_validate(_valid_enm_payload_with_z0("Siec Z0")))

    run = create_run(
        case_id=case_id,
        analysis_type="short_circuit_sn",
        options={"fault_type": "1F"},
    )
    result = execute_run(run.id)

    assert result.status == "FINISHED", result.error_message
    assert result.to_execution_dict()["analysis_type"] == "SC_1F"
    assert result.raw_result is not None
    assert result.raw_result["analysis_type"] == "short_circuit_1f"
    assert result.raw_result["short_circuit_type"] == "1F"
    assert result.raw_result["reporting_status"] == "reportable"
    assert result.raw_result["proof_status"] == "complete"
    assert result.raw_result["results"][0]["short_circuit_type"] == "1F"
    assert result.raw_result["results"][0]["reporting_status"] == "reportable"
    assert result.raw_result["results"][0]["proof_status"] == "complete"
    assert result.raw_result["results"][0]["proof_ref"].startswith("proof:short-circuit:")
    assert result.raw_result["results"][0]["proof_binding"]["z0_source"] == "ENM_COMMITTED"
    assert "z0_ohm" in result.raw_result["results"][0]["white_box_trace"][0]["inputs"]

    rows = build_short_circuit_results(result)["rows"]
    assert rows[0]["reporting_status"] == "reportable"
    assert rows[0]["proof_status"] == "complete"
    assert rows[0]["dopuszczalnosc_raportowa"] is True

    execution_set = build_execution_result_set(result)
    assert execution_set["analysis_type"] == "SC_1F"
    assert execution_set["global_results"]["analysis_type"] == "short_circuit_1f"
    assert execution_set["element_results"][0]["proof_status"] == "complete"


def test_execute_run_supports_2fg_when_z0_is_committed_in_enm():
    case_id = "canonical-sc-2fg"
    set_enm(case_id, EnergyNetworkModel.model_validate(_valid_enm_payload_with_z0("Siec Z0")))

    run = create_run(
        case_id=case_id,
        analysis_type="short_circuit_sn",
        options={"fault_type": "2F+Z"},
    )
    result = execute_run(run.id)

    assert result.status == "FINISHED", result.error_message
    assert result.to_execution_dict()["analysis_type"] == "SC_2F_G"
    assert result.raw_result is not None
    assert result.raw_result["analysis_type"] == "short_circuit_2fg"
    assert result.raw_result["short_circuit_type"] == "2F+G"
    assert result.raw_result["reporting_status"] == "reportable"
    assert result.raw_result["proof_status"] == "complete"
    row = result.raw_result["results"][0]
    assert row["short_circuit_type"] == "2F+G"
    assert row["analysis_type"] == "short_circuit_2fg"
    assert row["reporting_status"] == "reportable"
    assert row["proof_status"] == "complete"
    assert row["proof_binding"]["trace_step_refs"]
    assert row["proof_binding"]["z0_source"] == "ENM_COMMITTED"
    assert "z0_ohm" in row["white_box_trace"][0]["inputs"]


def test_create_1f_run_blocks_without_committed_z0():
    case_id = "canonical-sc-1f-missing-z0"
    set_enm(case_id, EnergyNetworkModel.model_validate(_valid_enm_payload("Siec bez Z0")))

    with pytest.raises(ValueError, match="skladowej zerowej Z0"):
        create_run(
            case_id=case_id,
            analysis_type="short_circuit_sn",
            options={"fault_type": "1F"},
        )
