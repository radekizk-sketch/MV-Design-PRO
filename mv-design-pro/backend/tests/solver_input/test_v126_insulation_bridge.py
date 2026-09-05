from __future__ import annotations

from enm.models import EnergyNetworkModel, ENMHeader
from network_model.catalog.mv_surge_arrester_catalog import get_all_surge_arrester_types
from solver_input.v126_contracts import (
    build_v126_input_from_enm,
    build_v126_insulation_from_enm,
)

_ARRESTER_ID = "arrester-abb-polim-d-24kv-10ka"


def _arrester_params(item_id: str) -> dict:
    for record in get_all_surge_arrester_types():
        if record["id"] == item_id:
            return record["params"]
    raise AssertionError(f"Brak rekordu katalogu ogranicznika: {item_id}")


def _model(
    *,
    devices: list[dict],
    bus_voltage_kv: float = 20.0,
    bus_grounding: dict | None = None,
) -> EnergyNetworkModel:
    bus: dict = {"ref_id": "BUS_SN", "name": "Szyna SN", "voltage_kv": bus_voltage_kv}
    if bus_grounding is not None:
        bus["grounding"] = bus_grounding
    return EnergyNetworkModel.model_validate(
        {
            "header": ENMHeader(name="test-insulation").model_dump(),
            "buses": [bus],
            "substations": [
                {
                    "ref_id": "ST1",
                    "name": "Stacja 1",
                    "station_type": "mv_lv",
                    "bus_refs": ["BUS_SN"],
                }
            ],
            "bays": [
                {
                    "ref_id": "POLE-IN",
                    "name": "Pole liniowe",
                    "bay_role": "IN",
                    "substation_ref": "ST1",
                    "bus_ref": "BUS_SN",
                    "primary_devices": devices,
                }
            ],
        }
    )


def _arrester_device(device_ref: str, catalog_ref: str | None) -> dict:
    device: dict = {
        "device_ref": device_ref,
        "symbol_ref": "surge_arrester_10ka",
        "kind": "SURGE_ARRESTER",
        "placement": "GROUND_BRANCH",
    }
    if catalog_ref is not None:
        device["catalog_ref"] = catalog_ref
    return device


def test_arrester_with_catalog_ref_maps_all_card_params() -> None:
    params = _arrester_params(_ARRESTER_ID)
    model = _model(devices=[_arrester_device("QA1", _ARRESTER_ID)])

    rows = build_v126_insulation_from_enm(model)

    assert len(rows) == 1
    row = rows[0]
    assert row.location_bus_ref == "BUS_SN"
    assert row.u_m_kv == params["u_m_kv"]
    assert row.arrester_mcov_kv == params["mcov_kv"]
    assert row.arrester_residual_10ka_kv == params["u_residual_at_10ka_kv"]
    assert row.predicted_tov_kv == params["tov_10s_kv"]
    assert row.predicted_energy_kj_per_kv == params["energy_absorption_kj_per_kv"]


def test_network_neutral_from_bus_grounding_petersen_is_isolated() -> None:
    model = _model(
        devices=[_arrester_device("QA1", _ARRESTER_ID)],
        bus_grounding={"type": "petersen_coil"},
    )
    rows = build_v126_insulation_from_enm(model)
    assert rows[0].network_neutral == "isolated"


def test_network_neutral_from_bus_grounding_resistor_is_earthed() -> None:
    model = _model(
        devices=[_arrester_device("QA1", _ARRESTER_ID)],
        bus_grounding={"type": "resistor_grounded", "r_ohm": 40.0},
    )
    rows = build_v126_insulation_from_enm(model)
    assert rows[0].network_neutral == "earthed"


def test_no_grounding_data_falls_back_to_contract_default() -> None:
    model = _model(devices=[_arrester_device("QA1", _ARRESTER_ID)])
    rows = build_v126_insulation_from_enm(model)
    assert rows[0].network_neutral == "isolated"


def test_no_arrester_yields_empty_insulation() -> None:
    model = _model(
        devices=[
            {
                "device_ref": "QB1",
                "symbol_ref": "cb",
                "kind": "CB",
                "placement": "MIDSTREAM",
            }
        ]
    )
    assert build_v126_insulation_from_enm(model) == []


def test_phase_arresters_same_location_are_deduplicated() -> None:
    model = _model(
        devices=[
            _arrester_device("QA_L1", _ARRESTER_ID),
            _arrester_device("QA_L2", _ARRESTER_ID),
            _arrester_device("QA_L3", _ARRESTER_ID),
        ]
    )
    rows = build_v126_insulation_from_enm(model)
    assert len(rows) == 1


def test_arrester_without_catalog_ref_derives_um_from_bus_no_card_params() -> None:
    model = _model(devices=[_arrester_device("QA1", None)], bus_voltage_kv=20.0)
    rows = build_v126_insulation_from_enm(model)
    assert len(rows) == 1
    row = rows[0]
    assert row.u_m_kv == 24.0  # najbliższe znormalizowane U_m >= 20 kV
    assert row.arrester_mcov_kv is None
    assert row.arrester_residual_10ka_kv is None
    assert row.predicted_energy_kj_per_kv == 2.0


def test_lv_arrester_without_card_is_skipped() -> None:
    model = _model(devices=[_arrester_device("QA1", None)], bus_voltage_kv=0.4)
    assert build_v126_insulation_from_enm(model) == []


def test_build_input_from_enm_populates_insulation() -> None:
    model = _model(devices=[_arrester_device("QA1", _ARRESTER_ID)])
    academic = build_v126_input_from_enm(model)
    assert len(academic.insulation) == 1
    assert academic.insulation[0].location_bus_ref == "BUS_SN"


def test_bridge_is_deterministic() -> None:
    model = _model(devices=[_arrester_device("QA1", _ARRESTER_ID)])
    first = [r.model_dump() for r in build_v126_insulation_from_enm(model)]
    second = [r.model_dump() for r in build_v126_insulation_from_enm(model)]
    assert first == second


def test_insulation_coordination_run_reads_arresters_from_model() -> None:
    """Łańcuch end-to-end: aparat SURGE_ARRESTER modelu → analiza IEC 60071
    bez żadnych ręcznych parametrów (pusty ``parameters``)."""
    from api.main import app
    from application.twin_key import klucz_twin_dla_przypadku
    from enm.store import reset_enm_store, set_enm
    from fastapi.testclient import TestClient

    reset_enm_store()
    # CV-1-W: przypadek bez wiersza w bazie dostaje 404 z magazynu ENM
    # (inwariant I-2) — realny projekt+przypadek zamiast dowolnego UUID-a,
    # `with` uruchamia lifespan (realne `uow_factory`, wymagane do tłumaczenia).
    with TestClient(app) as client:
        project_resp = client.post("/api/projects", json={"name": "V12.6 izolacja — test"})
        assert project_resp.status_code == 201, project_resp.text
        project_id = project_resp.json()["id"]
        case_resp = client.post(
            "/api/study-cases", json={"project_id": project_id, "name": "Przypadek testu"}
        )
        assert case_resp.status_code == 201, case_resp.text
        case_id = case_resp.json()["id"]

        klucz = klucz_twin_dla_przypadku(case_id, client.app.state.uow_factory)
        set_enm(klucz, _model(devices=[_arrester_device("QA1", _ARRESTER_ID)]))

        created = client.post(
            f"/api/cases/{case_id}/runs/v126/insulation_coordination",
            json={"parameters": {}},
        )
        assert created.status_code == 200, created.text
        result = client.get(created.json()["result_url"])
        assert result.status_code == 200
        arresters = result.json()["result"]["result"]["arresters"]
        assert len(arresters) == 1
        assert arresters[0]["location_bus_ref"] == "BUS_SN"
        assert arresters[0]["bil_margin_percent"] is not None
