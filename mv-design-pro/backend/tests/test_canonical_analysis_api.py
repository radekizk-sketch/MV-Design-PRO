from __future__ import annotations

import io
import math
import zipfile
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from api.main import app
from fastapi.testclient import TestClient

from tests.catalog_test_helpers import gpz_payload, gpz_source_record


def _reset_backend_state() -> None:
    from api.execution_runs import get_engine
    from api.power_flow_runs import _interpretation_cache
    from enm.canonical_analysis import reset_canonical_runs
    from enm.store import reset_enm_store

    engine = get_engine()
    engine._runs.clear()
    engine._result_sets.clear()
    engine._study_cases.clear()
    engine._case_runs.clear()
    _interpretation_cache.clear()
    reset_canonical_runs()
    reset_enm_store()


def _seed_power_flow_enm(client: TestClient, case_id: str) -> None:
    from enm.models import EnergyNetworkModel
    from enm.store import set_enm

    set_enm(
        case_id,
        EnergyNetworkModel.model_validate(
            {
                "header": {
                    "name": "Power Flow Canonical",
                    "enm_version": "1.0",
                    "defaults": {"frequency_hz": 50, "unit_system": "SI"},
                    "created_at": "2024-01-01T00:00:00Z",
                    "updated_at": "2024-01-01T00:00:00Z",
                    "revision": 1,
                    "hash_sha256": "",
                },
                "buses": [
                    {
                        "id": "00000000-0000-0000-0000-000000000301",
                        "ref_id": "bus-main",
                        "name": "Szyna glowna",
                        "tags": [],
                        "meta": {},
                        "voltage_kv": 15.0,
                        "phase_system": "3ph",
                    },
                    {
                        "id": "00000000-0000-0000-0000-000000000302",
                        "ref_id": "bus-load",
                        "name": "Szyna odbioru",
                        "tags": [],
                        "meta": {},
                        "voltage_kv": 15.0,
                        "phase_system": "3ph",
                    },
                ],
                "branches": [
                    {
                        "id": "00000000-0000-0000-0000-000000000303",
                        "ref_id": "branch-load",
                        "name": "Kabel odbioru",
                        "tags": [],
                        "meta": {},
                        "type": "cable",
                        "from_bus_ref": "bus-main",
                        "to_bus_ref": "bus-load",
                        "status": "closed",
                        "catalog_ref": "KABEL_SN_TEST",
                        "parameter_source": "CATALOG",
                        "length_km": 0.5,
                        "r_ohm_per_km": 0.253,
                        "x_ohm_per_km": 0.073,
                        "b_siemens_per_km": 2.6e-07,
                        "rating": {"in_a": 270.0},
                    }
                ],
                "sources": [
                    {
                        "id": "00000000-0000-0000-0000-000000000304",
                        "tags": [],
                        "meta": {},
                        **gpz_source_record(
                            ref_id="src-grid",
                            name="Zasilanie GPZ",
                            bus_ref="bus-main",
                            voltage_kv=15.0,
                            sk3_mva=250.0,
                            rx_ratio=0.10,
                        ),
                    }
                ],
                "loads": [
                    {
                        "id": "00000000-0000-0000-0000-000000000305",
                        "ref_id": "load-1",
                        "name": "Odbior SN",
                        "tags": [],
                        "meta": {},
                        "bus_ref": "bus-load",
                        "p_mw": 1.2,
                        "q_mvar": 0.35,
                        "catalog_ref": "LOAD_TEST",
                        "parameter_source": "OVERRIDE",
                    }
                ],
                "transformers": [],
                "generators": [],
                "substations": [],
                "bays": [],
                "junctions": [],
                "corridors": [],
                "measurements": [],
                "protection_assignments": [],
                "branch_points": [],
            }
        ),
    )


@pytest.fixture
def client() -> TestClient:
    _reset_backend_state()
    with TestClient(app) as test_client:
        yield test_client


def test_domain_operation_snapshot_feeds_analysis_result_and_trace(client: TestClient) -> None:
    case_id = str(uuid4())

    domain_op = client.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={
            "operation": {
                "name": "add_grid_source_sn",
                "payload": gpz_payload(voltage_kv=15.0, sk3_mva=250.0, rx_ratio=0.10),
            }
        },
    )
    assert domain_op.status_code == 200
    op_payload = domain_op.json()
    snapshot = op_payload["snapshot"]
    snapshot_hash = snapshot["header"]["hash_sha256"]
    assert snapshot["sources"]

    readiness_response = client.get(f"/api/cases/{case_id}/enm/readiness")
    assert readiness_response.status_code == 200
    readiness_payload = readiness_response.json()

    create_run = client.post(
        f"/api/execution/study-cases/{case_id}/runs",
        json={"analysis_type": "SC_3F", "solver_input": {}},
    )
    assert create_run.status_code == 201
    run_payload = create_run.json()
    run_id = run_payload["id"]
    input_hash = run_payload["solver_input_hash"]

    execute_run = client.post(f"/api/execution/runs/{run_id}/execute")
    assert execute_run.status_code == 200
    assert execute_run.json()["status"] == "DONE"

    execution_results = client.get(f"/api/execution/runs/{run_id}/results")
    assert execution_results.status_code == 200
    execution_payload = execution_results.json()
    assert execution_payload["validation_snapshot"] == readiness_payload["validation"]
    assert execution_payload["readiness_snapshot"] == readiness_payload["readiness"]

    results_index = client.get(f"/api/analysis-runs/{run_id}/results/index")
    assert results_index.status_code == 200
    index_payload = results_index.json()
    assert index_payload["run_header"]["snapshot_id"] == snapshot_hash
    assert index_payload["run_header"]["input_hash"] == input_hash
    assert index_payload["analysis_case_context"]["case_ref"] == case_id
    assert index_payload["analysis_case_context"]["rodzaj_przypadku"] == "ZWARCIOWY_MAKS"
    assert index_payload["analysis_case_context"]["completeness"] == "complete"
    assert index_payload["analysis_case_context"]["proof_pack_ref"].startswith("proof-pack:")
    assert (
        index_payload["analysis_case_context"]["reproducibility"]["results_contract_version"]
        == "V12.5"
    )
    assert index_payload["run_header"]["analysis_case_context"]["snapshot_ref"] == snapshot_hash
    assert index_payload["proof_pack_ref"].startswith("proof-pack:")
    assert index_payload["export_artifact"]["export_kind"] == "json"
    assert index_payload["export_artifact"]["proof_pack_ref"].startswith("proof-pack:")
    assert index_payload["export_policy"]["carries_analysis_case_context"] is True
    assert index_payload["export_policy"]["carries_proof_pack_ref"] is True

    detail_response = client.get(f"/api/analysis-runs/{run_id}")
    assert detail_response.status_code == 200
    detail_payload = detail_response.json()
    assert detail_payload["id"] == run_id
    assert detail_payload["proof_pack_ref"].startswith("proof-pack:")
    assert detail_payload["export_artifact"]["export_kind"] == "json"
    assert detail_payload["export_artifact"]["proof_pack_ref"].startswith("proof-pack:")
    assert detail_payload["export_policy"]["carries_analysis_case_context"] is True
    assert detail_payload["input_metadata"]["analysis_case_context"]["proof_pack_ref"].startswith(
        "proof-pack:"
    )

    short_circuit = client.get(f"/api/analysis-runs/{run_id}/results/short-circuit")
    assert short_circuit.status_code == 200
    short_circuit_payload = short_circuit.json()
    assert short_circuit_payload["run_id"] == run_id
    assert short_circuit_payload["analysis_case_context"]["case_ref"] == case_id
    assert short_circuit_payload["rows"]
    assert all("element_id" in row for row in short_circuit_payload["rows"])
    # Pelny bilans IEC 60909 (ZWARCIA-PRO F1): wielkosci FROZEN solvera
    # przechodza do wierszy kanonicznych (Rk/Xk/|Zk|/X/R/kappa/c/Un/tk/Ib/I2t).
    wiersz = short_circuit_payload["rows"][0]
    for pole in (
        "rk_ohm",
        "xk_ohm",
        "zk_ohm",
        "rx_ratio",
        "xr_ratio",
        "kappa",
        "c_factor",
        "un_kv",
        "tk_s",
        "ib_ka",
        "ik_ka",
        "i2t_ka2s",
    ):
        assert pole in wiersz, pole
        assert wiersz[pole] is not None, pole
    assert wiersz["zk_ohm"] == pytest.approx(
        math.hypot(wiersz["rk_ohm"], wiersz["xk_ohm"]), rel=1e-9
    )
    assert wiersz["xr_ratio"] == pytest.approx(1.0 / wiersz["rx_ratio"], rel=1e-9)
    assert wiersz["i2t_ka2s"] == pytest.approx(wiersz["ith_ka"] ** 2 * wiersz["tk_s"], rel=1e-9)
    assert wiersz["kappa"] > 1.0
    assert wiersz["c_factor"] == pytest.approx(1.10, abs=0.01)
    # ZWARCIA-PRO F4 (karta W-C): pole addytywne rozpływu gałęziowego obecne w
    # każdym wierszu; sieć bez falowników → pusta lista (policzono, brak wkładów
    # falownikowych — kontrakt solvera, zero fabrykacji).
    for row in short_circuit_payload["rows"]:
        assert "branch_contributions" in row
        assert isinstance(row["branch_contributions"], list)
    # Delta FROZEN V12K-128 (addytywnie): składowe symetryczne Z1/Z2/Z0 wprost
    # z solvera. Bieg 3F → Z1/Z2 obecne jako complex {re, im}, Z0 nie dotyczy.
    for pole in ("z1_ohm", "z2_ohm"):
        assert isinstance(wiersz[pole], dict), pole
        assert "re" in wiersz[pole] and "im" in wiersz[pole], pole
    assert wiersz["z0_ohm"] is None
    # GAP passthrough (V12K-128): wymóg/źródło sieci zerowej Z0 w wierszu
    # kanonicznym. 3F → Z0 nie dotyczy.
    assert wiersz["requires_z0"] is False
    assert wiersz["z0_source"] == "NOT_APPLICABLE"

    trace_details = client.get(f"/api/analysis-runs/{run_id}/results/trace")
    assert trace_details.status_code == 200
    trace_payload = trace_details.json()
    assert trace_payload["run_id"] == run_id
    assert trace_payload["snapshot_id"] == snapshot_hash
    assert trace_payload["input_hash"] == input_hash
    assert trace_payload["analysis_case_context"]["quality_gate"] in {"G1", "G2", "G3", "G4"}
    assert trace_payload["white_box_trace"]
    assert "selection_index" in trace_payload
    assert trace_payload["selection_index"]
    assert "catalog_context" in trace_payload
    assert isinstance(trace_payload["catalog_context"], list)
    assert any("element_id" in step for step in trace_payload["white_box_trace"])
    assert any("primary_element_ref" in step for step in trace_payload["white_box_trace"])
    assert any("related_elements" in step for step in trace_payload["white_box_trace"])

    trace_view = client.get(f"/api/analysis-runs/{run_id}/trace")
    assert trace_view.status_code == 200
    assert trace_view.json()["trace"] == trace_payload["white_box_trace"]

    snapshot_view = client.get(f"/api/analysis-runs/{run_id}/snapshot")
    assert snapshot_view.status_code == 200
    snapshot_payload = snapshot_view.json()
    assert snapshot_payload["run_id"] == run_id
    assert snapshot_payload["snapshot_id"] == snapshot_hash
    assert snapshot_payload["snapshot"]["header"]["hash_sha256"] == snapshot_hash

    assert client.get(f"/analysis-runs/{run_id}/results/index").status_code == 404
    assert client.get(f"/analysis-runs/{run_id}").status_code == 404
    assert client.get(f"/analysis-runs/{run_id}/results/short-circuit").status_code == 404
    assert client.get(f"/analysis-runs/{run_id}/results/trace").status_code == 404
    assert client.get(f"/analysis-runs/{run_id}/trace").status_code == 404
    assert client.get(f"/analysis-runs/{run_id}/snapshot").status_code == 404


def test_analysis_run_snapshot_completes_legacy_station_catalog_loads(
    client: TestClient,
) -> None:
    from enm.canonical_analysis import CanonicalRun
    from infrastructure.persistence.repositories.canonical_run_repository import (
        canonical_run_repository_scope,
    )

    run_id = uuid4()
    station_ref = "stn/test/station"
    nn_bus_ref = "stn/test/nn_bus"
    snapshot = {
        "header": {
            "name": "Legacy station snapshot",
            "enm_version": "1.0",
            "defaults": {"frequency_hz": 50, "unit_system": "SI"},
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-01T00:00:00Z",
            "revision": 1,
            "hash_sha256": "legacy-hash",
        },
        "buses": [
            {
                "ref_id": "stn/test/sn_bus",
                "name": "Szyna SN stacji",
                "tags": [],
                "meta": {},
                "voltage_kv": 15.0,
                "phase_system": "3ph",
            },
            {
                "ref_id": nn_bus_ref,
                "name": "Szyna nN stacji",
                "tags": [],
                "meta": {},
                "voltage_kv": 0.4,
                "phase_system": "3ph",
            },
        ],
        "loads": [],
        "substations": [
            {
                "ref_id": station_ref,
                "name": "Stacja katalogowa",
                "tags": [],
                "station_type": "inline",
                "bus_refs": ["stn/test/sn_bus", nn_bus_ref],
                "transformer_refs": [],
                "meta": {
                    "nn_field_specs": [
                        {
                            "field_ref": "stn/test/nn_feeder/001",
                            "bus_ref": nn_bus_ref,
                            "bay_role": "FEEDER",
                        },
                        {
                            "field_ref": "stn/test/nn_feeder/002",
                            "bus_ref": nn_bus_ref,
                            "bay_role": "FEEDER",
                        },
                    ]
                },
            }
        ],
    }
    with canonical_run_repository_scope() as repository:
        repository.create(
            CanonicalRun(
                id=run_id,
                case_id="case-legacy-station",
                project_id="project-legacy-station",
                analysis_type="short_circuit_sn",
                status="FINISHED",
                created_at=datetime.now(UTC),
                snapshot_hash="legacy-hash",
                input_hash="input-hash",
                snapshot=snapshot,
                validation={},
                readiness={},
            )
        )

    response = client.get(f"/api/analysis-runs/{run_id}/snapshot")

    assert response.status_code == 200
    payload = response.json()
    loads = payload["snapshot"]["loads"]
    assert payload["snapshot_id"] == "legacy-hash"
    assert len(loads) == 2
    assert {load["bus_ref"] for load in loads} == {nn_bus_ref}
    assert {load["catalog_namespace"] for load in loads} == {"OBCIAZENIE"}
    assert {load["parameter_source"] for load in loads} == {"CATALOG"}


def _seed_short_circuit_enm_with_inverter(case_id: str) -> None:
    """ENM: GPZ na szynie głównej + falownik PV na szynie odbioru (kabel między).

    Zwarcie na szynie głównej → wkład falownika płynie kablem (branch flow),
    więc wiersz kanoniczny tego punktu niesie niepusty rozpływ gałęziowy.
    """
    from enm.models import EnergyNetworkModel
    from enm.store import set_enm

    set_enm(
        case_id,
        EnergyNetworkModel.model_validate(
            {
                "header": {
                    "name": "SC rozplyw galeziowy",
                    "enm_version": "1.0",
                    "defaults": {"frequency_hz": 50, "unit_system": "SI"},
                    "created_at": "2024-01-01T00:00:00Z",
                    "updated_at": "2024-01-01T00:00:00Z",
                    "revision": 1,
                    "hash_sha256": "",
                },
                "buses": [
                    {
                        "id": "00000000-0000-0000-0000-000000000401",
                        "ref_id": "bus-main",
                        "name": "Szyna glowna",
                        "tags": [],
                        "meta": {},
                        "voltage_kv": 15.0,
                        "phase_system": "3ph",
                    },
                    {
                        "id": "00000000-0000-0000-0000-000000000402",
                        "ref_id": "bus-oze",
                        "name": "Szyna OZE",
                        "tags": [],
                        "meta": {},
                        "voltage_kv": 15.0,
                        "phase_system": "3ph",
                    },
                ],
                "branches": [
                    {
                        "id": "00000000-0000-0000-0000-000000000403",
                        "ref_id": "branch-oze",
                        "name": "Kabel OZE",
                        "tags": [],
                        "meta": {},
                        "type": "cable",
                        "from_bus_ref": "bus-main",
                        "to_bus_ref": "bus-oze",
                        "status": "closed",
                        "catalog_ref": "KABEL_SN_TEST",
                        "parameter_source": "CATALOG",
                        "length_km": 0.5,
                        "r_ohm_per_km": 0.253,
                        "x_ohm_per_km": 0.073,
                        "b_siemens_per_km": 2.6e-07,
                        "rating": {"in_a": 270.0},
                    }
                ],
                "sources": [
                    {
                        "id": "00000000-0000-0000-0000-000000000404",
                        "tags": [],
                        "meta": {},
                        **gpz_source_record(
                            ref_id="src-grid",
                            name="Zasilanie GPZ",
                            bus_ref="bus-main",
                            voltage_kv=15.0,
                            sk3_mva=250.0,
                            rx_ratio=0.10,
                        ),
                    }
                ],
                "loads": [],
                "transformers": [],
                "generators": [
                    {
                        "id": "00000000-0000-0000-0000-000000000405",
                        "ref_id": "gen-pv",
                        "name": "Falownik PV",
                        "tags": [],
                        "meta": {},
                        "bus_ref": "bus-oze",
                        "p_mw": 1.0,
                        "q_mvar": 0.0,
                        "gen_type": "pv_inverter",
                        # Wariant z trafem w torze (Decision #14) — walidator E028/E029
                        # dopuszcza przyłącze SN; mapowanie SC czyta nameplate (p_mw).
                        "connection_variant": "DEDICATED_MV_CONNECTION",
                    }
                ],
                "substations": [],
                "bays": [],
                "junctions": [],
                "corridors": [],
                "measurements": [],
                "protection_assignments": [],
                "branch_points": [],
            }
        ),
    )


def test_short_circuit_rows_carry_branch_flow_contributions(client: TestClient) -> None:
    """ZWARCIA-PRO F4 (karta W-C): rozpływ prądu zwarciowego w gałęziach.

    Tor kanoniczny woła FROZEN solver z include_branch_contributions=True, a
    `build_short_circuit_results` przenosi wkłady gałęziowe ADDYTYWNIE do
    wierszy (projekcja A→kA + nazwy z grafu przebiegu, kierunek z solvera).
    Determinizm: ponowny odczyt daje bajtowo identyczne wiersze.
    """
    case_id = str(uuid4())
    _seed_short_circuit_enm_with_inverter(case_id)

    create_run = client.post(
        f"/api/execution/study-cases/{case_id}/runs",
        json={"analysis_type": "SC_3F", "solver_input": {}},
    )
    assert create_run.status_code == 201
    run_id = create_run.json()["id"]
    execute_run = client.post(f"/api/execution/runs/{run_id}/execute")
    assert execute_run.status_code == 200
    assert execute_run.json()["status"] == "DONE"

    response = client.get(f"/api/analysis-runs/{run_id}/results/short-circuit")
    assert response.status_code == 200
    rows = response.json()["rows"]
    assert rows

    # Pole addytywne obecne w KAŻDYM wierszu (lista — opcja policzona).
    for row in rows:
        assert "branch_contributions" in row
        assert isinstance(row["branch_contributions"], list)

    # Punkt zwarcia na szynie głównej: wkład falownika z szyny OZE płynie kablem.
    row_main = next(row for row in rows if row["target_name"] == "Szyna glowna")
    flows = row_main["branch_contributions"]
    assert flows, "wkład falownika musi płynąć kablem do punktu zwarcia"
    for flow in flows:
        for pole in (
            "branch_id",
            "branch_name",
            "source_id",
            "from_node_id",
            "from_node_name",
            "to_node_id",
            "to_node_name",
            "i_ka",
            "direction",
        ):
            assert pole in flow, pole
        assert flow["i_ka"] > 0
        assert flow["direction"] in {"from_to", "to_from"}
    assert any(flow["branch_name"] == "Kabel OZE" for flow in flows)
    assert any(flow["source_id"] == "gen-pv" for flow in flows)

    # Istniejące wielkości punktu (FROZEN + bilans F1) nietknięte — obecne i dodatnie.
    assert row_main["ikss_ka"] is not None and row_main["ikss_ka"] > 0
    assert row_main["ip_ka"] is not None and row_main["ip_ka"] > 0
    assert row_main["zk_ohm"] is not None and row_main["zk_ohm"] > 0

    # Determinizm odczytu: drugi odczyt → identyczny payload wierszy.
    response2 = client.get(f"/api/analysis-runs/{run_id}/results/short-circuit")
    assert response2.status_code == 200
    assert response2.json()["rows"] == rows


def test_analysis_creation_requires_canonical_enm_snapshot(client: TestClient) -> None:
    case_id = str(uuid4())

    response = client.post(
        f"/api/execution/study-cases/{case_id}/runs",
        json={"analysis_type": "SC_3F", "solver_input": {}},
    )

    assert response.status_code == 409
    assert (
        "model" in response.json()["detail"].lower()
        or "analiza" in response.json()["detail"].lower()
    )


def test_power_flow_read_and_export_endpoints_use_canonical_run(client: TestClient) -> None:
    case_id = str(uuid4())
    _seed_power_flow_enm(client, case_id)

    run_response = client.post(f"/api/cases/{case_id}/runs/power-flow")
    assert run_response.status_code == 200
    run_payload = run_response.json()
    run_id = run_payload["run_id"]

    header_response = client.get(f"/power-flow-runs/{run_id}")
    assert header_response.status_code == 200
    header_payload = header_response.json()
    assert header_payload["id"] == run_id
    assert header_payload["study_case_id"] == case_id
    assert "operating_case_id" not in header_payload
    assert header_payload["input_hash"] == run_payload["input_hash"]
    assert header_payload["input_metadata"]["snapshot_hash"] == run_payload["enm_hash"]
    assert header_payload["analysis_case_context"]["rodzaj_przypadku"] == "ROZPLYW_MAX_OBC"
    assert header_payload["analysis_case_context"]["completeness"] == "complete"
    assert (
        header_payload["analysis_case_context"]["reproducibility"]["solver_family"]
        == "power_flow_newton"
    )
    assert (
        header_payload["input_metadata"]["analysis_case_context"]["snapshot_ref"]
        == run_payload["enm_hash"]
    )
    assert header_payload["proof_pack_ref"].startswith("proof-pack:")
    assert header_payload["export_artifact"]["export_kind"] == "json"
    assert header_payload["export_artifact"]["proof_pack_ref"].startswith("proof-pack:")
    assert header_payload["export_policy"]["carries_analysis_case_context"] is True
    assert header_payload["export_policy"]["carries_proof_pack_ref"] is True

    result_response = client.get(f"/power-flow-runs/{run_id}/results")
    assert result_response.status_code == 200
    result_payload = result_response.json()
    assert result_payload["converged"] is True
    assert result_payload["bus_results"]
    assert result_payload["branch_results"]

    trace_response = client.get(f"/power-flow-runs/{run_id}/trace")
    assert trace_response.status_code == 200
    trace_payload = trace_response.json()
    assert trace_payload["iterations"]
    assert trace_payload["run_id"] == run_id
    assert trace_payload["snapshot_id"] == run_payload["enm_hash"]
    assert "catalog_context" in trace_payload
    assert any(entry["element_id"] == "branch-load" for entry in trace_payload["catalog_context"])

    bus_results_response = client.get(f"/api/analysis-runs/{run_id}/results/buses")
    assert bus_results_response.status_code == 200
    bus_results_payload = bus_results_response.json()
    assert bus_results_payload["analysis_case_context"]["case_ref"] == case_id
    assert {"bus-load", "bus-main"}.issubset(
        {row["element_id"] for row in bus_results_payload["rows"]}
    )

    branch_results_response = client.get(f"/api/analysis-runs/{run_id}/results/branches")
    assert branch_results_response.status_code == 200
    branch_results_payload = branch_results_response.json()
    assert branch_results_payload["analysis_case_context"]["rodzaj_przypadku"] == "ROZPLYW_MAX_OBC"
    assert "branch-load" in {row["element_id"] for row in branch_results_payload["rows"]}

    export_response = client.get(f"/power-flow-runs/{run_id}/export/json")
    assert export_response.status_code == 200
    export_payload = export_response.json()
    assert export_payload["analysis_case_context"]["case_ref"] == case_id
    assert export_payload["export_artifact"]["export_kind"] == "json"
    assert export_payload["export_artifact"]["completeness_status"] == "complete"
    assert export_payload["export_policy"]["carries_analysis_case_context"] is True
    assert export_payload["metadata"]["run_id"] == run_id
    assert export_payload["metadata"]["study_case_id"] == case_id
    assert "operating_case_id" not in export_payload["metadata"]
    assert export_payload["metadata"]["snapshot_hash"] == run_payload["enm_hash"]
    assert export_payload["metadata"]["proof_pack_ref"].startswith("proof-pack:")
    assert (
        export_payload["metadata"]["reproducibility"]["quality_gate_policy_version"]
        == "v12_5_quality_gate"
    )
    assert export_payload["trace_summary"]["input_hash"] == run_payload["input_hash"]
    assert export_payload["trace_summary"]["converged"] is True
    assert export_payload["metadata"]["catalog_context_count"] >= 2
    assert any(entry["element_id"] == "branch-load" for entry in export_payload["catalog_context"])
    assert any(entry["element_id"] == "src-grid" for entry in export_payload["catalog_context"])
    assert {"bus-load", "bus-main"}.issubset(
        {row["element_id"] for row in export_payload["bus_results"]["rows"]}
    )
    assert "branch-load" in {row["element_id"] for row in export_payload["branch_results"]["rows"]}
    assert export_payload["white_box_trace"]

    xlsx_response = client.get(f"/power-flow-runs/{run_id}/export/xlsx")
    assert xlsx_response.status_code == 200
    assert (
        xlsx_response.headers["content-type"]
        == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    with zipfile.ZipFile(io.BytesIO(xlsx_response.content)) as archive:
        names = set(archive.namelist())
    assert "[Content_Types].xml" in names
    assert "xl/workbook.xml" in names
    assert "xl/worksheets/sheet1.xml" in names


def test_resultset_v1_includes_branch_elements_for_load_flow(client: TestClient) -> None:
    """F9.6 (c): `build_execution_result_set` musi wolac `build_branch_results`
    dla PF, inaczej `/api/execution/runs/{id}/results/v1` nie niesie elementow
    galeziowych i nakladka przeplywu mocy (F9.5, spec Sec14.2) buduje sie pusta
    na kazdym realnym przebiegu. Sieć referencyjna: `bus-main` (zrodlo) ->
    `branch-load` (kabel, from_bus_ref=bus-main) -> `bus-load` (odbior)."""
    case_id = str(uuid4())
    _seed_power_flow_enm(client, case_id)

    run_response = client.post(f"/api/cases/{case_id}/runs/power-flow")
    assert run_response.status_code == 200
    run_id = run_response.json()["run_id"]

    # Wartosc referencyjna: ten sam run, inny (juz istniejacy, przetestowany
    # gdzie indziej) endpoint galeziowy — `build_branch_results_response`.
    reference_response = client.get(f"/api/analysis-runs/{run_id}/results/branches")
    assert reference_response.status_code == 200
    reference_row = next(
        row for row in reference_response.json()["rows"] if row["element_id"] == "branch-load"
    )

    resultset_response = client.get(f"/api/execution/runs/{run_id}/results/v1")
    assert resultset_response.status_code == 200
    resultset_payload = resultset_response.json()

    branch_elements = [
        er for er in resultset_payload["element_results"] if er["element_type"] == "Branch"
    ]
    assert branch_elements, "resultset v1 musi niesc elementy galeziowe dla LOAD_FLOW"
    branch_refs = {er["element_ref"] for er in branch_elements}
    assert "branch-load" in branch_refs

    # F9.6 (f) — dowod PRZEPUSZCZENIA (nie fabrykacji) na realnych danych:
    # `values` w resultset v1 MUSZA byc DOKLADNIE tym, co juz zwraca
    # `build_branch_results` (ten sam run, inny endpoint) — zero podmiany
    # znaku/wartosci przy dolozeniu petli w `build_execution_result_set`.
    # NAPRAWIONE w F9.8 (2026-07-15): znalezisko powyzej (znak `p_from_mw`
    # ujemny dla zrodlo->odbior, sprzeczny z fizyka) bylo objawem podwojnej
    # negacji w `canonical_analysis.py::_execute_power_flow` (PQSpec budowany
    # wprost z `Node.active_power`, ktory jest w konwencji generacyjnej, a
    # solver oczekuje konwencji obciazeniowej). Naprawiono konwersja gen->load
    # NA GRANICY budowy PQSpec (`p_mw=-float(node.active_power or 0.0)`,
    # analogicznie q). Dowod fizyczny na realnych danych ponizej w
    # `test_resultset_v1_load_flow_direction_and_voltage_drop_are_physically_correct`.
    branch_load_values = next(
        er["values"] for er in branch_elements if er["element_ref"] == "branch-load"
    )
    assert branch_load_values["p_mw"] == pytest.approx(reference_row["p_mw"])
    assert branch_load_values["q_mvar"] == pytest.approx(reference_row["q_mvar"])
    assert branch_load_values["i_a"] == pytest.approx(reference_row["i_a"])
    assert branch_load_values["p_mw"] != 0.0
    assert branch_load_values["i_a"] > 0.0

    overlay_elements = resultset_payload["overlay_payload"]["elements"]
    assert "branch-load" in overlay_elements
    branch_metrics = overlay_elements["branch-load"]["metrics"]
    assert branch_metrics["P_MW"]["value"] == pytest.approx(branch_load_values["p_mw"])
    assert branch_metrics["Q_Mvar"]["value"] == pytest.approx(branch_load_values["q_mvar"])
    assert branch_metrics["I_A"]["value"] == pytest.approx(branch_load_values["i_a"])


def test_resultset_v1_load_flow_direction_and_voltage_drop_are_physically_correct(
    client: TestClient,
) -> None:
    """F9.8: independent physical proof of the correct sign convention on real
    resultset v1 data (closes F9.6 (f) / F9.5 arrow-direction finding).

    Network: `bus-main` (slack, source) -[branch-load, from=bus-main,
    to=bus-load]-> `bus-load` (pure PQ load, p_mw=1.2, q_mvar=0.35). Basic
    circuit theory (independent of any internal solver sign convention):
    active power flowing INTO a bus that only consumes power (no local
    generation) must have `p_from_mw > 0` in the branch's own from->to
    orientation, and the source-side bus (held at the slack setpoint) must sit
    at a strictly higher |V| than the loaded bus downstream of a resistive/
    inductive cable (voltage drop in the direction of flow). This does not
    depend on re-deriving the PQSpec sign convention — it only uses the
    physical fact that a load sink cannot be a net source.
    """
    case_id = str(uuid4())
    _seed_power_flow_enm(client, case_id)

    run_response = client.post(f"/api/cases/{case_id}/runs/power-flow")
    assert run_response.status_code == 200
    run_id = run_response.json()["run_id"]

    resultset_response = client.get(f"/api/execution/runs/{run_id}/results/v1")
    assert resultset_response.status_code == 200
    resultset_payload = resultset_response.json()

    branch_elements = {
        er["element_ref"]: er
        for er in resultset_payload["element_results"]
        if er["element_type"] == "Branch"
    }
    bus_elements = {
        er["element_ref"]: er
        for er in resultset_payload["element_results"]
        if er["element_type"] == "Bus"
    }

    branch_values = branch_elements["branch-load"]["values"]
    # Power must flow FROM the source TOWARDS the load (from_bus_ref=bus-main,
    # to_bus_ref=bus-load) — a pure sink cannot backfeed its only supply.
    assert branch_values["p_from_mw"] > 0.0, (
        "expected p_from_mw > 0 (source -> load); got "
        f"{branch_values['p_from_mw']} — sign convention regression"
    )

    v_main = bus_elements["bus-main"]["values"]["u_pu"]
    v_load = bus_elements["bus-load"]["values"]["u_pu"]
    assert v_load < v_main, (
        f"expected voltage drop towards the load (v_pu(bus-load)={v_load} < "
        f"v_pu(bus-main)={v_main})"
    )


def test_canonical_run_persists_outside_process_memory(client: TestClient) -> None:
    case_id = str(uuid4())
    _seed_power_flow_enm(client, case_id)

    from enm.canonical_analysis import create_run, execute_run, reset_canonical_runs
    from infrastructure.persistence.repositories.canonical_run_repository import (
        canonical_run_repository_scope,
    )

    run = create_run(case_id=case_id, analysis_type="PF")

    with canonical_run_repository_scope() as repository:
        stored_created = repository.get(run.id)

    assert stored_created is not None
    assert stored_created.status == "CREATED"
    assert stored_created.case_id == case_id
    assert stored_created.input_hash == run.input_hash

    execute_run(run.id)

    with canonical_run_repository_scope() as repository:
        stored_finished = repository.get(run.id)

    assert stored_finished is not None
    assert stored_finished.status == "FINISHED"
    assert stored_finished.raw_result is not None
    assert stored_finished.power_flow_trace is not None

    reset_canonical_runs()

    with canonical_run_repository_scope() as repository:
        assert repository.get(run.id) is None


def test_phase_state_sn_run_exposes_canonical_results_and_trace(client: TestClient) -> None:
    case_id = str(uuid4())
    _seed_power_flow_enm(client, case_id)

    create_run = client.post(
        f"/api/execution/study-cases/{case_id}/runs",
        json={
            "analysis_type": "PHASE_STATE_SN",
            "solver_input": {
                "target_bus_ref": "bus-load",
                "source_voltage_kv": {"A": 8.66, "B": 8.66, "C": 8.66},
                "load_current_a": {"A": 120.0, "B": 100.0, "C": 80.0},
                "branch_resistance_ohm": {"A": 0.1, "B": 0.1, "C": 0.1},
                "fault_current_a": {"A": 20.0, "B": 0.0, "C": 0.0},
                "open_phase": {"C": True},
            },
        },
    )
    assert create_run.status_code == 201
    run_id = create_run.json()["id"]

    execute_run = client.post(f"/api/execution/runs/{run_id}/execute")
    assert execute_run.status_code == 200
    assert execute_run.json()["analysis_type"] == "PHASE_STATE_SN"

    result_set = client.get(f"/api/execution/runs/{run_id}/results")
    assert result_set.status_code == 200
    result_payload = result_set.json()
    assert result_payload["analysis_type"] == "PHASE_STATE_SN"
    assert result_payload["element_results"]
    assert result_payload["global_results"]["analysis_type"] == "phase_state_sn"

    results_index = client.get(f"/api/analysis-runs/{run_id}/results/index")
    assert results_index.status_code == 200
    assert any(table["table_id"] == "phase_state" for table in results_index.json()["tables"])

    phase_state = client.get(f"/api/analysis-runs/{run_id}/results/phase-state")
    assert phase_state.status_code == 200
    phase_state_payload = phase_state.json()
    assert phase_state_payload["analysis_case_context"]["rodzaj_przypadku"] == "STAN_FAZOWY_SN"
    assert phase_state_payload["rows"][0]["proof_status"] == "complete"
    assert phase_state_payload["rows"][0]["reporting_status"] == "reportable"
    assert phase_state_payload["rows"][0]["proof_ref"].startswith("proof:phase-state-sn:")

    trace_payload = client.get(f"/api/analysis-runs/{run_id}/results/trace")
    assert trace_payload.status_code == 200
    assert trace_payload.json()["white_box_trace"][0]["proof_status"] == "complete"


def test_dynamic_stability_run_exposes_results_and_automation_trace(client: TestClient) -> None:
    case_id = str(uuid4())
    _seed_power_flow_enm(client, case_id)

    create_run = client.post(
        f"/api/execution/study-cases/{case_id}/runs",
        json={
            "analysis_type": "DYNAMIC_STABILITY",
            "solver_input": {
                "scenario_id": "dyn-api-1",
                "source_ref": "src-grid",
                "faulted_element_id": "branch-load",
                "cleared_by_element_ids": ["cb-a", "cb-b"],
                "clearing_time_ms": 120.0,
                "pre_fault_angle_deg": 10.0,
                "during_fault_angle_deg": 75.0,
                "post_fault_angle_deg": 28.0,
                "post_fault_voltage_pu": 0.97,
                "post_fault_frequency_pu": 0.99,
                "isolated_element_ids": ["load-1"],
            },
        },
    )
    assert create_run.status_code == 201
    run_id = create_run.json()["id"]

    execute_run = client.post(f"/api/execution/runs/{run_id}/execute")
    assert execute_run.status_code == 200
    assert execute_run.json()["analysis_type"] == "DYNAMIC_STABILITY"

    result_set = client.get(f"/api/execution/runs/{run_id}/results")
    assert result_set.status_code == 200
    assert result_set.json()["global_results"]["analysis_type"] == "dynamic_stability"

    stability = client.get(f"/api/analysis-runs/{run_id}/results/dynamic-stability")
    assert stability.status_code == 200
    stability_payload = stability.json()
    assert stability_payload["analysis_case_context"]["rodzaj_przypadku"] == "PRACA_PO_ZAKLOCENIU"
    assert stability_payload["rows"][0]["status"] == "STABLE"
    assert stability_payload["rows"][0]["proof_ref"].startswith("proof:dynamic-stability:")

    automation_trace = client.get(f"/api/analysis-runs/{run_id}/results/automation-trace")
    assert automation_trace.status_code == 200
    automation_payload = automation_trace.json()
    assert len(automation_payload["rows"]) == 5
    assert automation_payload["rows"][-1]["event_type"] == "DYNAMIC_STABILITY_EVALUATED"


def test_source_compliance_run_exposes_reportable_statuses(client: TestClient) -> None:
    case_id = str(uuid4())
    _seed_power_flow_enm(client, case_id)

    operator_profile = {
        "frt": {"points": [{"u_pu": 0.15, "min_duration_ms": 150.0}]},
        "q_u": {"points": [{"u_pu": 1.0, "q_pu": 0.0}]},
        "cos_phi_p": {"points": [{"p_pu": 1.0, "cos_phi": 0.95}]},
    }
    source_profile = {
        "frt": {"points": [{"u_pu": 0.15, "min_duration_ms": 200.0}]},
        "q_u": {"points": [{"u_pu": 1.0, "q_pu": 0.0}]},
        "cos_phi_p": {"points": [{"p_pu": 1.0, "cos_phi": 0.95}]},
    }

    create_run = client.post(
        f"/api/execution/study-cases/{case_id}/runs",
        json={
            "analysis_type": "SOURCE_COMPLIANCE",
            "solver_input": {
                "source_ref": "src-grid",
                "source_type": "PV",
                "operator_profile": operator_profile,
                "source_profile": source_profile,
            },
        },
    )
    assert create_run.status_code == 201
    run_id = create_run.json()["id"]

    execute_run = client.post(f"/api/execution/runs/{run_id}/execute")
    assert execute_run.status_code == 200
    assert execute_run.json()["analysis_type"] == "SOURCE_COMPLIANCE"

    result_set = client.get(f"/api/execution/runs/{run_id}/results")
    assert result_set.status_code == 200
    assert result_set.json()["global_results"]["analysis_type"] == "source_compliance"

    source_compliance = client.get(f"/api/analysis-runs/{run_id}/results/source-compliance")
    assert source_compliance.status_code == 200
    source_payload = source_compliance.json()
    assert source_payload["analysis_case_context"]["rodzaj_przypadku"] == "ZGODNOSC_PRZYLACZENIOWA"
    assert source_payload["rows"][0]["verdict"] == "compliant"
    assert source_payload["rows"][0]["reporting_status"] == "reportable"
    assert source_payload["rows"][0]["proof_ref"].startswith("proof:source-compliance:")


def test_legacy_snapshot_and_analysis_index_routes_are_disabled_in_main_app(
    client: TestClient,
) -> None:
    case_id = str(uuid4())

    assert client.get("/snapshots/snap-1").status_code == 404
    assert client.get(f"/cases/{case_id}/snapshot").status_code == 404
    assert client.post(f"/cases/{case_id}/actions/batch", json={"actions": []}).status_code == 404
    assert client.get("/analysis-runs/design_synth.connection_study/run-1").status_code == 404
    assert client.get("/analysis-runs").status_code == 404
