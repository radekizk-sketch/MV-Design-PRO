"""Tests for the ENM protection read-model endpoint."""

import pytest
from api.enm import router as enm_router
from enm.canonical_analysis import reset_canonical_runs
from enm.models import EnergyNetworkModel
from enm.store import get_enm, reset_enm_store, set_enm
from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests.catalog_test_helpers import gpz_source_record


def _seed_enm(case_id: str, payload: dict) -> None:
    set_enm(case_id, EnergyNetworkModel.model_validate(payload))


@pytest.fixture(autouse=True)
def reset_state():
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(enm_router)
    return TestClient(app)


def _enm_with_protection() -> dict:
    return {
        "header": {
            "name": "Protection View Test",
            "enm_version": "1.0",
            "defaults": {"frequency_hz": 50, "unit_system": "SI"},
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-01T00:00:00Z",
            "revision": 3,
            "hash_sha256": "",
        },
        "buses": [
            {
                "id": "00000000-0000-0000-0000-000000010101",
                "ref_id": "bus_sn_a",
                "name": "Szyna SN A",
                "tags": [],
                "meta": {},
                "voltage_kv": 15,
                "phase_system": "3ph",
            },
            {
                "id": "00000000-0000-0000-0000-000000010102",
                "ref_id": "bus_sn_b",
                "name": "Szyna SN B",
                "tags": [],
                "meta": {},
                "voltage_kv": 15,
                "phase_system": "3ph",
            },
            {
                "id": "00000000-0000-0000-0000-000000010103",
                "ref_id": "bus_sn_c",
                "name": "Szyna SN C",
                "tags": [],
                "meta": {},
                "voltage_kv": 15,
                "phase_system": "3ph",
            },
        ],
        "sources": [
            {
                "id": "00000000-0000-0000-0000-000000010104",
                "tags": [],
                "meta": {},
                **gpz_source_record(
                    ref_id="src_grid",
                    name="GPZ",
                    bus_ref="bus_sn_a",
                    voltage_kv=15.0,
                    sk3_mva=250.0,
                    rx_ratio=0.1,
                ),
            },
        ],
        "branches": [
            {
                "id": "00000000-0000-0000-0000-000000010105",
                "ref_id": "cb_in_1",
                "name": "Wyłącznik pola IN",
                "tags": [],
                "meta": {},
                "type": "breaker",
                "from_bus_ref": "bus_sn_a",
                "to_bus_ref": "bus_sn_b",
                "status": "closed",
                "materialized_params": {"in_a": 630.0},
            },
            {
                "id": "00000000-0000-0000-0000-000000010106",
                "ref_id": "line_1",
                "name": "Linia SN 1",
                "tags": [],
                "meta": {},
                "type": "line_overhead",
                "from_bus_ref": "bus_sn_b",
                "to_bus_ref": "bus_sn_c",
                "status": "closed",
                "length_km": 4.2,
                "r_ohm_per_km": 0.443,
                "x_ohm_per_km": 0.34,
                "rating": {"in_a": 250.0},
            },
        ],
        "transformers": [],
        "loads": [],
        "generators": [],
        "substations": [
            {
                "id": "00000000-0000-0000-0000-000000010107",
                "ref_id": "sub_1",
                "name": "Stacja 1",
                "tags": [],
                "meta": {},
                "station_type": "mv_lv",
                "bus_refs": ["bus_sn_b"],
            },
        ],
        "bays": [
            {
                "id": "00000000-0000-0000-0000-000000010108",
                "ref_id": "bay_in_1",
                "name": "Pole IN",
                "tags": [],
                "meta": {},
                "bay_role": "IN",
                "substation_ref": "sub_1",
                "bus_ref": "bus_sn_b",
                "equipment_refs": ["cb_in_1", "line_1"],
                "protection_ref": "prot_oc_1",
            },
        ],
        "junctions": [],
        "corridors": [],
        "measurements": [
            {
                "id": "00000000-0000-0000-0000-000000010109",
                "ref_id": "ct_in_1",
                "name": "CT pola IN",
                "tags": [],
                "meta": {},
                "measurement_type": "CT",
                "bus_ref": "bus_sn_b",
                "bay_ref": "bay_in_1",
                "rating": {
                    "ratio_primary": 200.0,
                    "ratio_secondary": 1.0,
                    "accuracy_class": "5P20",
                },
                "connection": "star",
                "purpose": "protection",
            },
        ],
        "protection_assignments": [
            {
                "id": "00000000-0000-0000-0000-000000010110",
                "ref_id": "prot_oc_1",
                "name": "Zabezpieczenie pola IN",
                "tags": [],
                "meta": {},
                "breaker_ref": "cb_in_1",
                "ct_ref": "ct_in_1",
                "device_type": "overcurrent",
                "settings": [
                    {
                        "function_type": "overcurrent_51",
                        "threshold_a": 240.0,
                        "time_delay_s": 0.5,
                        "curve_type": "IEC_SI",
                    },
                    {
                        "function_type": "overcurrent_50",
                        "threshold_a": 800.0,
                        "time_delay_s": 0.05,
                        "curve_type": "DT",
                    },
                ],
                "is_enabled": True,
            },
        ],
        "branch_points": [],
    }


def test_get_protection_view_empty(client):
    response = client.get("/api/cases/protection-empty/enm/protection-view")
    assert response.status_code == 200
    data = response.json()

    assert data["case_id"] == "protection-empty"
    assert data["view_status"] == {
        "data_source": "ENM_PROTECTION_READ_MODEL",
        "result_state": "NONE",
        "has_protection_data": False,
    }
    assert data["summary"] == {
        "total_elements": 0,
        "total_assignments": 0,
        "active_assignments": 0,
        "blocked_assignments": 0,
        "complete_count": 0,
        "incomplete_count": 0,
        "verified_count": 0,
        "failed_count": 0,
        "no_data_count": 0,
        "error_count": 0,
        "warn_count": 0,
        "info_count": 0,
    }
    assert data["assignments"] == []
    assert data["diagnostics"] == []
    assert data["summaries"] == []


def test_get_protection_view_with_assignments_and_diagnostics(client):
    _seed_enm("protection-ready", _enm_with_protection())

    response = client.get("/api/cases/protection-ready/enm/protection-view")
    assert response.status_code == 200
    data = response.json()
    stored_enm = get_enm("protection-ready")

    assert data["case_id"] == "protection-ready"
    assert data["enm_revision"] == stored_enm.header.revision
    assert data["view_status"] == {
        "data_source": "ENM_PROTECTION_READ_MODEL",
        "result_state": "FRESH",
        "has_protection_data": True,
    }
    assert len(data["assignments"]) >= 2
    assert any(item["element_id"] == "line_1" for item in data["assignments"])
    assert any(item["element_id"] == "cb_in_1" for item in data["assignments"])
    assert any(item["device_id"] == "prot_oc_1" for item in data["assignments"])
    assert any(item["device_kind"] == "RELAY_OVERCURRENT" for item in data["assignments"])
    assert all(item["status"] == "ACTIVE" for item in data["assignments"])
    assert isinstance(data["diagnostics"], list)
    assert any(item["element_id"] == "line_1" for item in data["summaries"])
    assert data["summary"]["total_elements"] >= 2
    assert data["summary"]["total_assignments"] >= 2
    assert data["summary"]["active_assignments"] >= 2
    assert data["summary"]["blocked_assignments"] == 0
    assert data["summary"]["complete_count"] >= 1
    assert data["summary"]["incomplete_count"] >= 0
    assert data["summary"]["verified_count"] >= 0
    assert data["summary"]["failed_count"] >= 0
    assert data["summary"]["no_data_count"] >= 0
    assert data["summary"]["error_count"] >= 0
    assert data["summary"]["warn_count"] >= 0
    assert data["summary"]["info_count"] >= 0

    line_summary = next(item for item in data["summaries"] if item["element_id"] == "line_1")
    assert line_summary["ct"]["label"] == "200/1"
    assert line_summary["overcurrent"]["time_overcurrent"]["pickup_a"] == pytest.approx(240.0)


def test_protection_view_serializes_it_curve_from_iec60255_solver(client):
    """protection_ref → funkcje z krzywą I-t (punkty t_s z solvera IEC 60255).

    - Funkcja niezależna (DT, 50 I>>) ma płaską krzywę I-t z solvera.
    - Funkcja odwrotna (IEC_SI, 51 I>) bez TMS w modelu ENM → brak krzywej,
      brak danych ``time_multiplier`` (zero fabrykacji mnożnika czasowego).
    """
    _seed_enm("protection-it", _enm_with_protection())

    response = client.get("/api/cases/protection-it/enm/protection-view")
    assert response.status_code == 200
    data = response.json()

    assignment = next(item for item in data["assignments"] if item["device_id"] == "prot_oc_1")
    functions = assignment["settings_summary"]["functions"]

    inst = next(fn for fn in functions if fn["code"] == "OVERCURRENT_INST")  # 50 I>>, DT
    it_curve = inst["it_curve"]
    assert it_curve is not None
    assert it_curve["standard"] == "IEC_60255"
    assert it_curve["curve_kind"] == "DEFINITE"
    assert it_curve["curve_code"] == "DT"
    assert it_curve["pickup_a"] == pytest.approx(800.0)
    assert len(it_curve["points"]) >= 2
    # Charakterystyka niezależna: czas zadziałania stały = zwłoka (0,05 s) z solvera.
    assert all(point["t_s"] == pytest.approx(0.05) for point in it_curve["points"])
    assert all(point["i_a"] > 800.0 for point in it_curve["points"])
    assert "it_curve_missing_data" not in inst

    time_fn = next(fn for fn in functions if fn["code"] == "OVERCURRENT_TIME")  # 51 I>, IEC_SI
    assert time_fn["it_curve"] is None
    assert time_fn["it_curve_missing_data"] == ["time_multiplier"]


def test_protection_view_instant_without_delay_is_not_missing_data(client):
    """Bezzwłoczna (50 I>>) BEZ zwłoki → krzywa przy t≈0, NIE „brak danych" (S-1).

    Funkcja bezzwłoczna z natury nie ma zwłoki zamierzonej. Read model używa
    podłogi czasowej solvera zamiast fałszywie raportować brak ``definite_time``
    i zamiast generować nieprzedstawialne t_s=0 na osi log-log.
    """
    import copy

    payload = copy.deepcopy(_enm_with_protection())
    device = next(d for d in payload["protection_assignments"] if d["ref_id"] == "prot_oc_1")
    inst_setting = next(s for s in device["settings"] if s["function_type"] == "overcurrent_50")
    del inst_setting["time_delay_s"]  # bezzwłoczna bez skonfigurowanej zwłoki
    _seed_enm("protection-it-instant", payload)

    response = client.get("/api/cases/protection-it-instant/enm/protection-view")
    assert response.status_code == 200
    data = response.json()

    assignment = next(item for item in data["assignments"] if item["device_id"] == "prot_oc_1")
    functions = assignment["settings_summary"]["functions"]
    inst = next(fn for fn in functions if fn["code"] == "OVERCURRENT_INST")

    assert "it_curve_missing_data" not in inst, "Bezzwłoczna nie może być 'brak danych'"
    it_curve = inst["it_curve"]
    assert it_curve is not None
    assert it_curve["curve_kind"] == "DEFINITE"
    assert len(it_curve["points"]) >= 2
    # Podłoga czasowa solvera (0,001 s) — dodatnia, nie literalne t_s=0.
    assert all(point["t_s"] == pytest.approx(0.001) for point in it_curve["points"])
    assert all(point["t_s"] > 0.0 for point in it_curve["points"])


def test_protection_view_inverse_it_curve_with_tms_from_solver(client):
    """Charakterystyka odwrotna (IEC_SI, 51 I>) Z nastawą TMS → krzywa I-t z solvera.

    Gdy ``ProtectionSetting.time_multiplier`` jest podane, read model liczy krzywą
    solverem IEC 60255 (charakterystyka odwrotna, opadająca) — brak fabrykacji.
    """
    import copy

    payload = copy.deepcopy(_enm_with_protection())
    device = next(d for d in payload["protection_assignments"] if d["ref_id"] == "prot_oc_1")
    inverse_setting = next(s for s in device["settings"] if s["curve_type"] == "IEC_SI")
    inverse_setting["time_multiplier"] = 0.2  # TMS
    _seed_enm("protection-it-tms", payload)

    response = client.get("/api/cases/protection-it-tms/enm/protection-view")
    assert response.status_code == 200
    data = response.json()

    assignment = next(item for item in data["assignments"] if item["device_id"] == "prot_oc_1")
    functions = assignment["settings_summary"]["functions"]

    time_fn = next(fn for fn in functions if fn["code"] == "OVERCURRENT_TIME")  # 51 I>, IEC_SI
    it_curve = time_fn["it_curve"]
    assert it_curve is not None
    assert "it_curve_missing_data" not in time_fn
    assert it_curve["standard"] == "IEC_60255"
    assert it_curve["curve_kind"] == "INVERSE"
    assert it_curve["curve_code"] == "SI"
    assert it_curve["pickup_a"] == pytest.approx(240.0)
    assert it_curve["time_multiplier"] == pytest.approx(0.2)
    assert len(it_curve["points"]) > 2
    # Charakterystyka odwrotna: czas maleje monotonicznie ze wzrostem prądu (solver).
    times = [point["t_s"] for point in it_curve["points"]]
    assert all(earlier > later for earlier, later in zip(times, times[1:], strict=False))
    assert all(point["i_a"] > 240.0 for point in it_curve["points"])
