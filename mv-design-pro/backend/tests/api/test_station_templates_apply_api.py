from __future__ import annotations

import uuid

import pytest
from application.station_templates import get_template

pytest.importorskip("fastapi")

CATALOG_VERSION = "2024.1"
CABLE_ID = "cable-tfk-yakxs-3x120"
SOURCE_ID = "src-gpz-15kv-250mva-rx010"


def _binding(namespace: str, item_id: str) -> dict[str, str]:
    return {
        "catalog_namespace": namespace,
        "catalog_item_id": item_id,
        "catalog_item_version": CATALOG_VERSION,
    }


def _create_project_and_case(app_client) -> tuple[str, str]:
    from enm.store import reset_enm_store

    reset_enm_store()
    suffix = uuid.uuid4().hex[:8]
    project_resp = app_client.post(
        "/api/projects",
        json={
            "name": f"Projekt szablonu {suffix}",
            "description": "Regresja aplikowania szablonu",
            "mode": "TO-BE",
            "voltage_level_kv": 15.0,
            "frequency_hz": 50.0,
        },
    )
    assert project_resp.status_code == 201
    project_id = project_resp.json()["id"]

    case_resp = app_client.post(
        "/api/study-cases",
        json={
            "project_id": project_id,
            "name": f"Przypadek szablonu {suffix}",
            "description": "",
            "config": {},
            "set_active": True,
        },
    )
    assert case_resp.status_code == 201
    return project_id, case_resp.json()["id"]


def _execute_domain_op(app_client, case_id: str, name: str, payload: dict) -> dict:
    response = app_client.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={
            "project_id": "",
            "snapshot_base_hash": "",
            "operation": {
                "name": name,
                "idempotency_key": f"station-template-apply-{uuid.uuid4()}",
                "payload": payload,
            },
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body.get("error") is None
    return body


@pytest.mark.parametrize(
    "template_id",
    [
        "tpl_sn_nn_630kva",
        "tpl_slupowa_100kva",
        "tpl_farma_pv_1mw",
        "tpl_hybrid_pv05_bess05",
        "tpl_bess_5mw_10mwh_fcr_n",
        "tpl_wiatr_3mw",
    ],
)
def test_apply_station_template_reuses_existing_case_enm_snapshot(
    app_client, template_id: str
) -> None:
    _, case_id = _create_project_and_case(app_client)

    _execute_domain_op(
        app_client,
        case_id,
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "sk3_mva": 250.0,
            "rx_ratio": 0.1,
            "catalog_binding": _binding("ZRODLO_SN", SOURCE_ID),
        },
    )
    segment_result = _execute_domain_op(
        app_client,
        case_id,
        "continue_trunk_segment_sn",
        {
            "segment": {
                "rodzaj": "KABEL",
                "dlugosc_m": 120,
                "name": "Odcinek do szablonu",
                "catalog_binding": _binding("KABEL_SN", CABLE_ID),
            },
        },
    )
    segment_ref = segment_result["snapshot"]["corridors"][0]["ordered_segment_refs"][-1]

    response = app_client.post(
        f"/api/station-templates/{template_id}/apply",
        json={
            "case_id": case_id,
            "target_segment_id": segment_ref,
            "insert_at_ratio": 0.5,
            "params_override": {},
            "catalog_profile": None,
        },
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["template_id"] == template_id
    assert payload["station_ref"]
    assert payload["created_element_refs"]

    persisted = app_client.get(f"/api/cases/{case_id}/enm")
    assert persisted.status_code == 200
    snapshot = persisted.json()
    assert len(snapshot["substations"]) == 2
    assert any(station["ref_id"] == payload["station_ref"] for station in snapshot["substations"])
    generator_refs = [generator["ref_id"] for generator in snapshot.get("generators", [])]
    assert len(generator_refs) == len(set(generator_refs))

    template = get_template(template_id)
    assert template is not None
    assert not any(op.get("status") == "FAIL" for op in payload["operations_log"])
    station = next(
        station
        for station in snapshot["substations"]
        if station["ref_id"] == payload["station_ref"]
    )
    nn_specs = station.get("meta", {}).get("nn_field_specs", [])
    feeder_refs = [
        spec["field_ref"]
        for spec in nn_specs
        if spec.get("bay_role") == "FEEDER" and isinstance(spec.get("field_ref"), str)
    ]
    expected_feeders = template.schema.nn_feeders_count.default
    assert len(feeder_refs) == expected_feeders

    expected_load_kw = template.schema.nn_load_default_kw.default
    load_ops = [
        op
        for op in payload["operations_log"]
        if op.get("op") == "add_nn_load" and op.get("status") == "OK"
    ]
    if expected_feeders > 0 and expected_load_kw > 0:
        feeder_ref_set = set(feeder_refs)
        station_loads = [
            load
            for load in snapshot.get("loads", [])
            if load.get("meta", {}).get("feeder_ref") in feeder_ref_set
        ]
        assert len(station_loads) == expected_feeders
        assert len(load_ops) == expected_feeders
        assert all(load.get("catalog_ref") for load in station_loads)
        assert all(load.get("catalog_namespace") == "OBCIAZENIE" for load in station_loads)
    else:
        assert load_ops == []

    expected_der_count = template.schema.der_total_count.default
    der_ops = [
        op
        for op in payload["operations_log"]
        if op.get("op") == "add_converter_source" and op.get("status") == "OK"
    ]
    assert len(der_ops) == expected_der_count
    if expected_der_count > 0:
        station_generators = [
            generator
            for generator in snapshot.get("generators", [])
            if generator.get("station_ref") == payload["station_ref"]
            or (
                isinstance(generator.get("meta"), dict)
                and generator["meta"].get("station_ref") == payload["station_ref"]
            )
        ]
        assert len(station_generators) >= expected_der_count
        assert all(generator.get("catalog_ref") for generator in station_generators)


def test_szablon_z_pomiarem_przylaczany_odgalezieniem_przez_koncowke_api(app_client) -> None:
    """Karta POMIAR-ODGAŁĘZIENIE — REALNA ścieżka produkcyjna (`/apply`).

    Kontrakt `docs/domain/POMIAR_ROZLICZENIOWY_SN_V1.md` §1/§3: stacja abonencka
    z układem pomiarowo-rozliczeniowym (klasa B) wisi w ODGAŁĘZIENIU, więc
    tranzyt magistrali nie przechodzi przez jej rozdzielnicę. Test sprawdza to
    na końcówce HTTP, a nie tylko na funkcjach warstwy aplikacyjnej — inaczej
    pin nie obejmowałby drogi, którą naprawdę idzie kreator.
    """
    _, case_id = _create_project_and_case(app_client)
    _execute_domain_op(
        app_client,
        case_id,
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "sk3_mva": 250.0,
            "rx_ratio": 0.1,
            "catalog_binding": _binding("ZRODLO_SN", SOURCE_ID),
        },
    )
    segmenty: list[str] = []
    for i in range(2):
        wynik = _execute_domain_op(
            app_client,
            case_id,
            "continue_trunk_segment_sn",
            {
                "segment": {
                    "rodzaj": "KABEL",
                    "dlugosc_m": 300 + 50 * i,
                    "name": f"Odcinek {i + 1}",
                    "catalog_binding": _binding("KABEL_SN", CABLE_ID),
                },
            },
        )
        segmenty.append(wynik["snapshot"]["corridors"][0]["ordered_segment_refs"][-1])

    response = app_client.post(
        "/api/station-templates/tpl_sn_nn_1000kva/apply",
        json={
            "case_id": case_id,
            "target_segment_id": segmenty[0],
            "insert_at_ratio": 0.5,
            "params_override": {},
            "catalog_profile": None,
        },
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    operacje = [op["op"] for op in payload["operations_log"]]
    assert "insert_zksn_on_segment_sn" in operacje
    assert "start_branch_segment_sn" in operacje
    assert "append_station_on_endpoint" in operacje
    assert "insert_station_on_segment_sn" not in operacje

    snapshot = app_client.get(f"/api/cases/{case_id}/enm").json()
    stacja = next(s for s in snapshot["substations"] if s["ref_id"] == payload["station_ref"])
    assert stacja["station_type"] == "mv_lv", "Stacja klienta musi być KOŃCOWA"
    role = [spec["bay_role"] for spec in stacja["meta"]["field_specs"]]
    assert role == ["IN", "MEASUREMENT", "TR", "OUT"], role
    assert len(snapshot["branch_points"]) == 1


def test_podglad_szablonu_z_pomiarem_ponizej_minimum_pol_zwraca_422(app_client) -> None:
    """Odmowa liczby pól poniżej zestawu nieusuwalnego ma dojść do projektanta
    jako komunikat (422), a nie jako błąd serwera — końcówka podglądu liczy
    role w tym samym miejscu co aplikacja."""
    response = app_client.post(
        "/api/station-templates/tpl_sn_nn_1000kva/preview",
        json={"params_override": {"sn_bays_count": 2}, "catalog_profile": None},
    )
    assert response.status_code == 422, response.text
    detail = response.json()["detail"]
    assert detail["code"] == "template.sn_bays_count_below_minimum"
    assert "pól SN" in detail["message_pl"]
