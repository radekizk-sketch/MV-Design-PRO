from __future__ import annotations

from uuid import UUID

from api.main import app
from enm.models import EnergyNetworkModel, ENMHeader
from enm.store import reset_enm_store, set_enm
from fastapi.testclient import TestClient
from network_model.solvers.v126_academic import V126AcademicSolver
from solver_input.v126_contracts import (
    V126AcademicInput,
    V126AnalysisType,
    V126BranchInput,
    V126BusInput,
    V126HarmonicSourceInput,
    V126TransformerInput,
)


def _academic_input() -> V126AcademicInput:
    return V126AcademicInput(
        buses=[
            V126BusInput(ref="B1", name="GPZ", nominal_kv=15.0, fault_level_mva=250.0),
            V126BusInput(
                ref="B2",
                name="Stacja 1",
                nominal_kv=15.0,
                load_mw=1.4,
                load_mvar=0.45,
                generation_mw=0.3,
                customer_count=120,
                fault_level_mva=80.0,
            ),
        ],
        branches=[
            V126BranchInput(
                ref="K1",
                from_bus_ref="B1",
                to_bus_ref="B2",
                kind="cable",
                length_km=4.0,
                r_ohm_per_km=0.206,
                x_ohm_per_km=0.118,
                b_siemens_per_km=2.5e-6,
                ampacity_a=260.0,
            )
        ],
        transformers=[
            V126TransformerInput(
                ref="TR1",
                hv_bus_ref="B1",
                lv_bus_ref="B2",
                sn_mva=16.0,
                uhv_kv=110.0,
                ulv_kv=15.0,
                uk_percent=10.5,
                pk_kw=90.0,
            )
        ],
        harmonic_sources=[
            V126HarmonicSourceInput(
                bus_ref="B2",
                source_ref="PV1",
                base_current_a=80.0,
                spectrum_percent={5: 3.0, 7: 2.0, 11: 1.0},
            )
        ],
        parameters={
            "earthing": {
                "gpz_ref": "GPZ",
                "fault_current_ka": 8.0,
                "length_m": 60.0,
                "width_m": 40.0,
            },
            "insulation": [
                {
                    "location_bus_ref": "B2",
                    "u_m_kv": 17.5,
                    "network_neutral": "isolated",
                    "arrester_residual_10ka_kv": 70.0,
                }
            ],
            "motors": [
                {
                    "ref": "M1",
                    "bus_ref": "B2",
                    "rated_kw": 630.0,
                    "rated_voltage_kv": 6.0,
                }
            ],
            "hosting_monte_carlo_n": 64,
        },
    )


def test_power_quality_trace_and_hash_are_deterministic() -> None:
    solver = V126AcademicSolver()
    model = _academic_input()
    first = solver.run(V126AnalysisType.POWER_QUALITY_HARMONICS, model)
    second = solver.run(V126AnalysisType.POWER_QUALITY_HARMONICS, model)

    assert first["deterministic_hash"] == second["deterministic_hash"]
    assert first["result"]["nodes"][1]["thd_u_percent"] >= 0
    assert first["white_box_trace"][0]["proof_status"] == "complete"


def test_voltage_stability_returns_modal_contract() -> None:
    result = V126AcademicSolver().run(V126AnalysisType.VOLTAGE_STABILITY, _academic_input())
    modal = result["result"]["modal_analysis"]
    assert modal["smallest_eigenvalue"] > 0
    assert modal["critical_mode"]["participating_buses"]


def test_reliability_indices_are_reportable() -> None:
    result = V126AcademicSolver().run(V126AnalysisType.RELIABILITY_CONTINGENCY, _academic_input())
    assert result["result"]["indices"]["saidi_min_per_year"] >= 0
    assert result["result"]["contingency_ranking"][0]["order"] in {"N-1", "N-2"}


def test_earthing_uses_ieee80_contract() -> None:
    result = V126AcademicSolver().run(V126AnalysisType.EARTHING_SAFETY, _academic_input())
    assert result["result"]["r_g_ohm"] > 0
    assert result["result"]["safety_status"] in {"bezpieczny", "wymaga_ochrony", "niezgodny"}


def test_v126_api_run_result_and_trace() -> None:
    reset_enm_store()
    case_id = UUID("11111111-1111-1111-1111-111111111111")
    set_enm(
        str(case_id),
        EnergyNetworkModel.model_validate(
            {
                "header": ENMHeader(name="test").model_dump(),
                "buses": [
                    {"id": "11111111-1111-1111-1111-111111111101", "ref_id": "B1", "name": "GPZ", "voltage_kv": 15.0},
                    {"id": "11111111-1111-1111-1111-111111111102", "ref_id": "B2", "name": "Stacja", "voltage_kv": 15.0},
                ],
                "branches": [
                    {
                        "id": "11111111-1111-1111-1111-111111111201",
                        "ref_id": "K1",
                        "name": "Kabel",
                        "type": "cable",
                        "from_bus_ref": "B1",
                        "to_bus_ref": "B2",
                        "length_km": 2.0,
                        "r_ohm_per_km": 0.2,
                        "x_ohm_per_km": 0.12,
                    }
                ],
                "loads": [
                    {
                        "id": "11111111-1111-1111-1111-111111111301",
                        "ref_id": "L1",
                        "name": "Odbior",
                        "bus_ref": "B2",
                        "p_mw": 1.0,
                        "q_mvar": 0.3,
                    }
                ],
            }
        ),
    )
    client = TestClient(app)
    response = client.post(
        f"/api/cases/{case_id}/runs/v126/voltage_stability",
        json={"parameters": {}},
    )
    assert response.status_code == 200
    run_id = response.json()["run_id"]

    result = client.get(f"/api/analysis-runs/{run_id}/results/v126/voltage_stability")
    trace = client.get(f"/api/analysis-runs/{run_id}/results/v126/voltage_stability/trace")

    assert result.status_code == 200
    assert trace.status_code == 200
    assert trace.json()["steps"][0]["proof_status"] == "complete"
