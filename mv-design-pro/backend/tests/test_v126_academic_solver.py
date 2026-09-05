from __future__ import annotations

from api.main import app
from application.v126_artifacts import build_v126_proof_artifact, build_v126_report_artifact
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
                p0_kw=18.0,
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


def test_each_v126_analysis_has_deterministic_proof_and_report_artifacts() -> None:
    solver = V126AcademicSolver()
    model = _academic_input()
    for analysis_type in V126AnalysisType:
        result = solver.run(analysis_type, model)
        run_record = {
            "run_id": "run-test",
            "case_id": "case-test",
            "analysis_type": analysis_type.value,
            "result": result,
        }
        proof = build_v126_proof_artifact(run_record)
        report = build_v126_report_artifact(run_record, proof)
        proof_again = build_v126_proof_artifact(run_record)
        report_again = build_v126_report_artifact(run_record, proof_again)

        assert proof["proof_hash"] == proof_again["proof_hash"]
        assert report["report_hash"] == report_again["report_hash"]
        assert proof["trace_step_count"] >= 1
        assert report["export_policy"] == "frozen_result_and_proof_only"


def test_voltage_stability_returns_modal_contract() -> None:
    """Kontrakt stabilności napięciowej jest KOMPLETNY, a wartości są jawnym brakiem.

    INTENCJA ZACHOWANA (karta QU-FABRYKACJA): pierwotnie test pilnował, że analiza
    zwraca komplet kluczy bloku modalnego. Ten wymóg ZOSTAJE — kontrakty są FROZEN,
    więc żaden klucz nie może zniknąć. Zmieniła się WARTOŚĆ: solver przestał
    wyznaczać te wielkości ze współczynników bez pokrycia w danych, więc melduje
    `None` z powodem po polsku zamiast liczby. Asercja „> 0" pilnowała wyłącznie
    tego, że fabrykacja zwraca liczbę dodatnią.
    """
    result = V126AcademicSolver().run(V126AnalysisType.VOLTAGE_STABILITY, _academic_input())
    modal = result["result"]["modal_analysis"]
    assert set(modal) == {"smallest_eigenvalue", "critical_mode", "brak_danych"}
    assert modal["smallest_eigenvalue"] is None
    assert set(modal["critical_mode"]) == {"eigenvalue", "participating_buses"}
    assert modal["critical_mode"]["eigenvalue"] is None
    assert modal["critical_mode"]["participating_buses"] == []
    assert len(modal["brak_danych"]) > 40


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
    # CV-1-W: przypadek bez wiersza w bazie dostaje 404 z magazynu ENM
    # (inwariant I-2) — realny projekt+przypadek zamiast dowolnego UUID-a,
    # `with` uruchamia lifespan (realne `uow_factory`, wymagane do tłumaczenia).
    with TestClient(app) as client:
        project_resp = client.post("/api/projects", json={"name": "V12.6 academic — test"})
        assert project_resp.status_code == 201, project_resp.text
        project_id = project_resp.json()["id"]
        case_resp = client.post(
            "/api/study-cases", json={"project_id": project_id, "name": "Przypadek testu"}
        )
        assert case_resp.status_code == 201, case_resp.text
        case_id = case_resp.json()["id"]

        from application.twin_key import klucz_twin_dla_przypadku

        klucz = klucz_twin_dla_przypadku(case_id, client.app.state.uow_factory)
        set_enm(
            klucz,
            EnergyNetworkModel.model_validate(
                {
                    "header": ENMHeader(name="test").model_dump(),
                    "buses": [
                        {
                            "id": "11111111-1111-1111-1111-111111111101",
                            "ref_id": "B1",
                            "name": "GPZ",
                            "voltage_kv": 15.0,
                        },
                        {
                            "id": "11111111-1111-1111-1111-111111111102",
                            "ref_id": "B2",
                            "name": "Stacja",
                            "voltage_kv": 15.0,
                        },
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
        response = client.post(
            f"/api/cases/{case_id}/runs/v126/voltage_stability",
            json={"parameters": {}},
        )
        assert response.status_code == 200
        run_id = response.json()["run_id"]

        result = client.get(f"/api/analysis-runs/{run_id}/results/v126/voltage_stability")
        trace = client.get(f"/api/analysis-runs/{run_id}/results/v126/voltage_stability/trace")
        proof = client.get(f"/api/analysis-runs/{run_id}/results/v126/voltage_stability/proof")
        report = client.get(f"/api/analysis-runs/{run_id}/results/v126/voltage_stability/report")

        assert result.status_code == 200
        assert trace.status_code == 200
        assert proof.status_code == 200
        assert report.status_code == 200
        assert trace.json()["steps"][0]["proof_status"] == "complete"
        assert result.json()["proof_ref"] == proof.json()["proof_id"]
        assert result.json()["report_ref"] == report.json()["report_id"]
        assert report.json()["source_proof_hash"] == proof.json()["proof_hash"]
