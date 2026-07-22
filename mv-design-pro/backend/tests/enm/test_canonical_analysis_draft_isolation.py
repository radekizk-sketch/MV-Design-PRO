"""Guards for V12.xx draft UI vs committed ENM isolation."""

import pytest
from enm.canonical_analysis import (
    _short_circuit_type_from_options,
    build_execution_result_set,
    build_short_circuit_results,
    create_run,
    execute_run,
    reset_canonical_runs,
)
from enm.models import EnergyNetworkModel
from enm.store import reset_enm_store, set_enm
from network_model.solvers.short_circuit_iec60909 import ShortCircuitType

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


def _valid_enm_payload_with_helper_terminal(name: str) -> dict:
    payload = _valid_enm_payload(name)
    payload["buses"].append(
        {
            "id": "00000000-0000-0000-0000-000000000003",
            "ref_id": "b_helper",
            "name": "Zacisk techniczny",
            "tags": ["helper_bus", "field_terminal"],
            "meta": {
                "render_on_sld": False,
                "show_in_project_tree": False,
            },
            "voltage_kv": 15,
            "phase_system": "3ph",
        }
    )
    payload["buses"].append(
        {
            "id": "00000000-0000-0000-0000-000000000005",
            "ref_id": "gpz/test/section/001/bus_sn",
            "name": "Szyna techniczna sekcji GPZ",
            "tags": [],
            "meta": {},
            "voltage_kv": 15,
            "phase_system": "3ph",
        }
    )
    payload["branches"].append(
        {
            "id": "00000000-0000-0000-0000-000000000004",
            "ref_id": "brk_helper",
            "name": "Aparat pola",
            "tags": [],
            "meta": {"render_on_sld": False, "show_in_project_tree": False},
            "from_bus_ref": "b1",
            "to_bus_ref": "b_helper",
            "status": "closed",
            "type": "breaker",
            "r_ohm": 0.0,
            "x_ohm": 0.0,
        }
    )
    payload["branches"].append(
        {
            "id": "00000000-0000-0000-0000-000000000006",
            "ref_id": "brk_section_bus",
            "name": "Lacznik szyny technicznej",
            "tags": [],
            "meta": {"render_on_sld": False, "show_in_project_tree": False},
            "from_bus_ref": "b1",
            "to_bus_ref": "gpz/test/section/001/bus_sn",
            "status": "closed",
            "type": "breaker",
            "r_ohm": 0.0,
            "x_ohm": 0.0,
        }
    )
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


def test_short_circuit_does_not_report_helper_field_terminals():
    case_id = "canonical-sc-helper-terminal"
    set_enm(
        case_id,
        EnergyNetworkModel.model_validate(
            _valid_enm_payload_with_helper_terminal("Siec z zaciskiem technicznym")
        ),
    )

    run = create_run(case_id=case_id, analysis_type="short_circuit_sn")
    result = execute_run(run.id)

    assert result.status == "FINISHED", result.error_message
    assert result.raw_result is not None
    rows = build_short_circuit_results(result)["rows"]
    assert rows
    assert "b_helper" not in {row["element_id"] for row in rows}
    assert "gpz/test/section/001/bus_sn" not in {row["element_id"] for row in rows}
    assert all(row["target_name"] != "Zacisk techniczny" for row in rows)
    assert all(row["target_name"] != "Szyna techniczna sekcji GPZ" for row in rows)


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
    # Delta FROZEN V12K-128 (addytywnie): składowe symetryczne w pozycji wyniku
    # (nie tylko w śladzie). Bieg doziemny 1F → pełen komplet Z1/Z2/Z0.
    item0 = result.raw_result["results"][0]
    for pole in ("z1_ohm", "z2_ohm", "z0_ohm"):
        assert isinstance(item0[pole], dict), pole
        assert "re" in item0[pole] and "im" in item0[pole], pole
    # GAP passthrough (V12K-128): wymóg/źródło Z0 na poziomie pozycji wyniku.
    assert item0["requires_z0"] is True
    assert item0["z0_source"] == "ENM_COMMITTED"

    rows = build_short_circuit_results(result)["rows"]
    assert rows[0]["reporting_status"] == "reportable"
    assert rows[0]["proof_status"] == "complete"
    assert rows[0]["dopuszczalnosc_raportowa"] is True
    # Delta FROZEN V12K-128: składowe Z1/Z2/Z0 + GAP passthrough w wierszu
    # kanonicznym (konsument read-only ma komplet bilansu i wymóg Z0).
    for pole in ("z1_ohm", "z2_ohm", "z0_ohm"):
        assert isinstance(rows[0][pole], dict), pole
    assert rows[0]["requires_z0"] is True
    assert rows[0]["z0_source"] == "ENM_COMMITTED"

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


def test_short_circuit_type_accepts_sc2fg_alias_from_ui():
    assert (
        _short_circuit_type_from_options({"fault_type": "2FG"}) is ShortCircuitType.TWO_PHASE_GROUND
    )
    assert (
        _short_circuit_type_from_options({"fault_type": "SC2FG"})
        is ShortCircuitType.TWO_PHASE_GROUND
    )


def test_create_1f_run_blocks_without_committed_z0():
    case_id = "canonical-sc-1f-missing-z0"
    set_enm(case_id, EnergyNetworkModel.model_validate(_valid_enm_payload("Siec bez Z0")))

    with pytest.raises(ValueError, match="skladowej zerowej Z0"):
        create_run(
            case_id=case_id,
            analysis_type="short_circuit_sn",
            options={"fault_type": "1F"},
        )
