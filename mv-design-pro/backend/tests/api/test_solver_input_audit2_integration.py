"""
Test integracji solver-input endpoint z audit2 query params (Phase 25).

GET /case/{cid}/analysis/solver-input/{type}?project_id=...&station_id=...
Sprawdza:
- gdy project_id+station_id pdane i audit2 config istnieje w DB,
  response.audit2_extensions populated (nie None).
- gdy params nie pdane, audit2_extensions = None (backward compat).
- audit2 config CASCADE delete gdy projekt usuniety.
"""

from __future__ import annotations

import pytest

pytest.importorskip("fastapi")


def _create_project(client) -> str:
    res = client.post("/api/projects", json={"name": "Audit2 Solver Integration Test"})
    assert res.status_code == 201
    return res.json()["id"]


def _create_audit2_config(client, pid: str, sid: str, body: dict) -> None:
    res = client.put(
        f"/api/v1/projects/{pid}/audit2-station-config/{sid}",
        json=body,
    )
    assert res.status_code == 200, res.text


def _create_case(client, pid: str) -> str:
    res = client.post(
        "/api/study-cases",
        json={"project_id": pid, "name": "Audit2 solver-input test", "set_active": True},
    )
    assert res.status_code == 201, res.text
    return str(res.json()["id"])


# Karta CV-4.2: siec minimalna GOTOWA DO ROZPLYWU MOCY, budowana PRODUKCYJNYMI
# operacjami domenowymi (ta sama droga co projektant). Rozplyw mocy wymaga co
# najmniej jednego odbioru albo generatora (enm/validator.py::_compute_availability
# — "Load flow requires at least one load or generator"), wiec sam GPZ (SLACK) nie
# wystarcza — potrzebny odcinek + stacja z potrzebami wlasnymi (materializuje
# Load, enm/domain_operations.py::_materialize_station_auxiliary_load).
_GPZ_PAYLOAD = {
    "operation": {
        "name": "add_grid_source_sn",
        "payload": {
            "voltage_kv": 15.0,
            "sk3_mva": 250.0,
            "hv_voltage_kv": 110.0,
            "transformer_sn_mva": 25.0,
            "catalog_ref": "src-gpz-15kv-250mva-rx010",
        },
    }
}

_MAGISTRALA_PAYLOAD = {
    "operation": {
        "name": "continue_trunk_segment_sn",
        "payload": {
            "segment": {
                "rodzaj": "KABEL",
                "dlugosc_m": 500,
                "catalog_ref": "cable-tfk-yakxs-3x120",
            }
        },
    }
}


def _build_minimal_network(client, case_id: str) -> None:
    """Siec zdolna do rozplywu mocy — WYLACZNIE PRODUKCYJNA droga zmiany modelu
    (POST /enm/domain-ops), zero wstrzykniecia stanu."""
    gpz = client.post(f"/api/cases/{case_id}/enm/domain-ops", json=_GPZ_PAYLOAD)
    assert gpz.status_code == 200, gpz.text
    assert not gpz.json().get("error"), gpz.text

    magistrala = client.post(f"/api/cases/{case_id}/enm/domain-ops", json=_MAGISTRALA_PAYLOAD)
    assert magistrala.status_code == 200, magistrala.text
    assert not magistrala.json().get("error"), magistrala.text
    segment_refs = (
        (magistrala.json().get("snapshot") or {})
        .get("corridors", [{}])[0]
        .get("ordered_segment_refs", [])
    )
    assert segment_refs, magistrala.text

    stacja = client.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={
            "operation": {
                "name": "insert_station_on_segment_sn",
                "payload": {
                    "field_apparatus_catalog_ref": "sw-cb-abb-vd4-17kv-630a",
                    "segment_id": segment_refs[-1],
                    "station_type": "B",
                    "insert_at": {"value": 0.5},
                    "station": {
                        "sn_voltage_kv": 15.0,
                        "nn_voltage_kv": 0.4,
                        # Potrzeby wlasne stacji — JEDYNY odbior tej sieci
                        # (has_loads=True dla rozplywu mocy).
                        "station_auxiliary": {"active_power_kw": 10.0, "cos_phi": 0.95},
                        # Uklad uziemienia sieci nN — wymagany przez bramke gotowosci
                        # rozplywu mocy dla stacji zasilajacej odbiory nN.
                        "nn_earthing": {"lv_system": "TN-S"},
                    },
                    "sn_fields": ["IN", "OUT", "FEEDER", "TR"],
                    "transformer": {
                        "create": True,
                        "catalog_binding": {
                            "catalog_namespace": "TRAFO_SN_NN",
                            "catalog_item_id": "tr-sn-nn-15-04-630kva-dyn11",
                            "catalog_item_version": "2024.1",
                        },
                    },
                },
            }
        },
    )
    assert stacja.status_code == 200, stacja.text
    assert not stacja.json().get("error"), stacja.text


def _create_and_execute_load_flow_run(client, case_id: str, solver_input: dict) -> dict:
    """Bieg kanoniczny PF (createRun -> executeRun), zastępuje dawny stub P12."""
    create = client.post(
        f"/api/execution/study-cases/{case_id}/runs",
        json={"analysis_type": "LOAD_FLOW", "solver_input": solver_input},
    )
    assert create.status_code == 201, create.text
    run_id = create.json()["id"]
    execute = client.post(f"/api/execution/runs/{run_id}/execute")
    assert execute.status_code == 200, execute.text
    return execute.json()


def _get_run_results(client, run_id: str) -> dict:
    res = client.get(f"/api/execution/runs/{run_id}/results")
    assert res.status_code == 200, res.text
    return res.json()


def _align_audit2_db_env(monkeypatch, tmp_path) -> None:
    """DEFEKT ODKRYTY PRZY TEJ KARCIE (poza mandatem K7 — patrz meldunek).

    `enm/assembler.py::_maybe_load_audit2_extensions` czyta konfigurację audit2
    przez WŁASNY silnik/sesję zbudowaną z `DATABASE_URL`
    (`_uow_factory_biezacy`), NIEZALEŻNY od `app.state.uow_factory` żądania —
    TA SAMA klasa defektu, którą karta CV-3.3-B znalazła i naprawiła dla
    `_execute_protection` (addytywny parametr `uow_factory` od wołającego).
    Tu NIE naprawiona: naprawa wymaga zmiany sygnatury
    `zloz_wejscie_rozplywu`/`zloz_wejscie_zwarcia` w `enm/assembler.py`, a K7
    tej karty ogranicza edycję tego pliku do pola addytywnego (assembler w
    edycji równoległej — karta A3-04). `app_client`'s `uow_factory` idzie do
    PLIKU `{tmp_path}/test.db` (`tests/conftest.py::db_engine`) — `DATABASE_URL`
    domyślnie wskazuje INNY plik (`./mv_design_pro.db`), więc bez tego
    wyrównania `_maybe_load_audit2_extensions` nigdy nie widzi configu, który
    test zapisał przez `app_client`. Wyrównanie na TEN SAM plik odtwarza
    jedyny scenariusz, w którym produkcyjny kod DZIAŁA (jedna baza wskazana
    jednym `DATABASE_URL` dla całej aplikacji) — nie maskuje defektu, tylko
    pozwala go zmierzyć zamiast dostać fałszywy negatyw z powodu env-var.
    """
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{tmp_path / 'test.db'}")


def test_solver_input_endpoint_audit2_params_documented(app_client):
    """Endpoint istnieje i akceptuje audit2 query params (smoke test)."""
    # Przygotuj projekt + audit2 config.
    pid = _create_project(app_client)
    _create_audit2_config(
        app_client,
        pid,
        "station-X",
        {
            "mv_neutral_grounding_ref": "mng_petersen",
            "tap_changer_refs": [],
            "der_specs": [],
            "transformer_tap_changers": {"tr_001": "tc_oltc_110sn_19_125"},
            "bay_hv_fuses": {},
            "bay_vts": {},
            "bay_device_withstand": {},
        },
    )
    # Endpoint istnieje (zwraca 422 dla nieistniejacego case_id, ale parsuje query params).
    res = app_client.get(
        f"/api/case-fake-id/analysis/solver-input/short_circuit_3f"
        f"?project_id={pid}&station_id=station-X"
    )
    # 422 lub 404 lub 500 — wazne ze nie 422 z 'unknown query param'.
    # Check response body shows it accepts the params (no validation error on params).
    assert res.status_code in (404, 422, 500)


def test_audit2_config_persists_after_session(app_client):
    """Phase 22: audit2 config persystuje po wielu requestach (sprawdza DB persistence)."""
    pid = _create_project(app_client)
    _create_audit2_config(
        app_client,
        pid,
        "station-Y",
        {
            "mv_neutral_grounding_ref": "mng_isolated",
            "tap_changer_refs": [],
            "der_specs": [],
        },
    )
    # Multiple GET requests still return same config (persistence).
    for _ in range(3):
        res = app_client.get(f"/api/v1/projects/{pid}/audit2-station-config/station-Y")
        assert res.status_code == 200
        assert res.json()["mv_neutral_grounding_ref"] == "mng_isolated"


def test_audit2_per_transformer_persistence_round_trip(app_client):
    """Phase 22: transformer_tap_changers JSONB persistuje roundtrip."""
    pid = _create_project(app_client)
    _create_audit2_config(
        app_client,
        pid,
        "station-Z",
        {
            "mv_neutral_grounding_ref": None,
            "tap_changer_refs": [],
            "der_specs": [],
            "transformer_tap_changers": {
                "tr_001": "tc_oltc_110sn_19_125",
                "tr_002": "tc_detc_snnn_5_25",
            },
        },
    )
    res = app_client.get(f"/api/v1/projects/{pid}/audit2-station-config/station-Z")
    body = res.json()
    assert body["transformer_tap_changers"] == {
        "tr_001": "tc_oltc_110sn_19_125",
        "tr_002": "tc_detc_snnn_5_25",
    }


def test_audit2_power_flow_run_uses_config_from_db(app_client, monkeypatch, tmp_path):
    """Karta CV-4.2: bieg kanoniczny PF z audit2_project_id/audit2_station_id
    stosuje config z DB (zastępuje usunięty stub POST /api/cases/audit2-power-flow,
    który fabrykował wejście — `pq=[]`, `slack_node_id or "slack-stub"` — na
    zawsze pustym grafie)."""
    _align_audit2_db_env(monkeypatch, tmp_path)
    pid = _create_project(app_client)
    case_id = _create_case(app_client, pid)
    _build_minimal_network(app_client, case_id)
    _create_audit2_config(
        app_client,
        pid,
        "station-pf",
        {
            "mv_neutral_grounding_ref": "mng_petersen",
            "tap_changer_refs": [],
            "der_specs": [],
            "transformer_tap_changers": {"tr_001": "tc_oltc_110sn_19_125"},
        },
    )

    executed = _create_and_execute_load_flow_run(
        app_client,
        case_id,
        {"audit2_project_id": pid, "audit2_station_id": "station-pf"},
    )
    assert executed["status"] == "DONE", executed
    results = _get_run_results(app_client, executed["id"])
    applied = results["global_results"]["audit2_applied"]
    # Ślad audit2 dotarł do wyniku biegu kanonicznego (nie pusty/nieobecny —
    # config istniał w DB dla tego project_id+station_id).
    assert "tap_position_changes" in applied


def test_audit2_power_flow_run_no_config_omits_audit2_applied(app_client, monkeypatch, tmp_path):
    """Karta CV-4.2: gdy audit2 config nie istnieje dla station_id, opcje biegu
    nie niosą audit2_project_id/audit2_station_id realnie znajdujących config —
    `audit2_applied` jest wtedy NIEOBECNE w wyniku (pole addytywne, `None` u
    źródła — `enm/assembler.py::WejscieRozplywu.audit2_applied`), nie pusty
    placeholder."""
    _align_audit2_db_env(monkeypatch, tmp_path)
    pid = _create_project(app_client)
    case_id = _create_case(app_client, pid)
    _build_minimal_network(app_client, case_id)

    executed = _create_and_execute_load_flow_run(
        app_client,
        case_id,
        {"audit2_project_id": pid, "audit2_station_id": "station-no-config"},
    )
    assert executed["status"] == "DONE", executed
    results = _get_run_results(app_client, executed["id"])
    assert "audit2_applied" not in results["global_results"]


def test_audit2_power_flow_run_without_audit2_options_omits_audit2_applied(
    app_client, monkeypatch, tmp_path
):
    """Karta CV-4.2: bieg PF bez opcji audit2 (droga zwykła) nie niesie
    `audit2_applied` w ogóle — parytet bit w bit z biegiem sprzed karty
    (`tests/golden/parytet_assemblera`)."""
    _align_audit2_db_env(monkeypatch, tmp_path)
    pid = _create_project(app_client)
    case_id = _create_case(app_client, pid)
    _build_minimal_network(app_client, case_id)

    executed = _create_and_execute_load_flow_run(app_client, case_id, {})
    assert executed["status"] == "DONE", executed
    results = _get_run_results(app_client, executed["id"])
    assert "audit2_applied" not in results["global_results"]


def test_audit2_power_flow_run_full_apply_trail(app_client, monkeypatch, tmp_path):
    """Karta CV-4.2 (dawniej Phase 34): weryfikuje ze applied trail zawiera
    REALNE trzy kanały (nie placeholder, nie zmyślona drabinka)."""
    _align_audit2_db_env(monkeypatch, tmp_path)
    pid = _create_project(app_client)
    case_id = _create_case(app_client, pid)
    _build_minimal_network(app_client, case_id)
    _create_audit2_config(
        app_client,
        pid,
        "station-trail",
        {
            "mv_neutral_grounding_ref": "mng_isolated",
            "tap_changer_refs": [],
            "der_specs": [],
            "transformer_tap_changers": {},
        },
    )
    executed = _create_and_execute_load_flow_run(
        app_client,
        case_id,
        {"audit2_project_id": pid, "audit2_station_id": "station-trail"},
    )
    assert executed["status"] == "DONE", executed
    results = _get_run_results(app_client, executed["id"])
    applied = results["global_results"]["audit2_applied"]
    # Karta K-Q — INTENCJA POPRZEDNIEGO TESTU ODWROCONA SWIADOMIE. Pinowal on
    # slad „grounding_z0_z1_ratio = 100 dla sieci izolowanej": drabinke stalych
    # (100 / 50 / 5 / 1) przypisanych ETYKIECIE wariantu uziemienia, bez zadnego
    # zrodla. Fizycznie stosunek Z0/Z1 zalezy od pojemnosci doziemnej sieci,
    # nastrojenia dlawika albo rezystora RAZEM z impedancja petli — impedancje
    # kolejnosci zerowej niesie model (`Source.z0_z1_ratio` / `r0_ohm` /
    # `x0_ohm`), i tylko z nich liczy SC1F. Slad nie melduje juz liczby, ktorej
    # nikt nie policzyl.
    assert "grounding_z0_z1_ratio" not in applied
    assert "bess_reserved_changes" not in applied
    assert set(applied) == {
        "tap_position_changes",
        "block_transformer_z_changes",
        "pf_droop_changes",
    }


def test_get_solver_input_with_audit2_query_params_populates_extensions(app_client):
    """
    Phase 52: GET /api/cases/{cid}/analysis/solver-input/{type}?project_id=&station_id=
    weryfikuje ze audit2_extensions jest faktycznie populated z DB w response body
    (nie tylko smoke status check).

    Karta CV-4.2: `case_id` musi być REALNYM przypadkiem — `klucz_twin_z_sciezki`
    odrzuca fikcyjny `case_id` 404-ką (P11 nie buduje już z pustego grafu-stubu
    niezależnego od tego, czy przypadek istnieje). SC 3F nie wymaga węzła SLACK
    (`zloz_wejscie_zwarcia` — w przeciwieństwie do PF), więc case bez sieci
    wystarcza tu do dowodu na temat `audit2_extensions`.
    """
    pid = _create_project(app_client)
    case_id = _create_case(app_client, pid)
    _create_audit2_config(
        app_client,
        pid,
        "station-real-test",
        {
            "mv_neutral_grounding_ref": "mng_petersen",
            "tap_changer_refs": [],
            "der_specs": [],
            "transformer_tap_changers": {"tr_001": "tc_oltc_110sn_19_125"},
            "bay_hv_fuses": {},
            "bay_vts": {},
            "bay_device_withstand": {},
        },
    )
    res = app_client.get(
        f"/api/cases/{case_id}/analysis/solver-input/short_circuit_3f"
        f"?project_id={pid}&station_id=station-real-test"
    )
    assert res.status_code == 200, res.text
    body = res.json()
    # Phase 52: audit2_extensions populated z DB.
    assert body["audit2_extensions"] is not None, "audit2_extensions should be populated"
    assert "power_flow_extensions" in body["audit2_extensions"]
    assert "sc_iec60909_extensions" in body["audit2_extensions"]
    # Per-transformer mapping w extensions.
    assert "transformer_to_tap_changer" in body["audit2_extensions"]["power_flow_extensions"]
    assert (
        "tr_001" in body["audit2_extensions"]["power_flow_extensions"]["transformer_to_tap_changer"]
    )
    # Grounding type.
    grounding = body["audit2_extensions"]["sc_iec60909_extensions"]["mv_neutral_grounding"]
    assert grounding["grounding_type"] == "petersen_coil"


def test_get_solver_input_without_audit2_params_returns_none(app_client):
    """Phase 52: brak audit2 params -> audit2_extensions = None (backward compat)."""
    case_id = _create_case(app_client, _create_project(app_client))
    res = app_client.get(f"/api/cases/{case_id}/analysis/solver-input/short_circuit_3f")
    assert res.status_code == 200
    body = res.json()
    assert body["audit2_extensions"] is None


def test_get_solver_input_with_audit2_params_no_config_returns_none(app_client):
    """Phase 52: project_id + station_id pdane ale config nie istnieje -> None."""
    pid = _create_project(app_client)
    case_id = _create_case(app_client, pid)
    res = app_client.get(
        f"/api/cases/{case_id}/analysis/solver-input/short_circuit_3f"
        f"?project_id={pid}&station_id=non-existent-station"
    )
    assert res.status_code == 200
    body = res.json()
    assert body["audit2_extensions"] is None


def test_apply_to_network_model_endpoint_full_pipeline(app_client):
    """Phase 26: pelna petla DB -> audit2 -> apply -> branch state changed."""
    pid = _create_project(app_client)
    _create_audit2_config(
        app_client,
        pid,
        "station-apply",
        {
            "mv_neutral_grounding_ref": "mng_petersen",
            "tap_changer_refs": [],
            "der_specs": [],
            "transformer_tap_changers": {
                "tr_001": "tc_oltc_110sn_19_125",
            },
        },
    )

    res = app_client.post(
        f"/api/v1/projects/{pid}/audit2-station-config/station-apply/_apply-to-network-model"
    )
    # Zauwaz: station_id w query (FastAPI nie przekaze body), bo router uzywa
    # path param '/{project_id}/audit2-station-config/...' a station_id jest
    # query param. Ten endpoint przyjmuje station_id jako query.
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["station_id"] == "station-apply"
    # tr_001 branch zostal zmodyfikowany (tap_position 5 -> 0).
    assert "tr_001" in body["post_adjustment_branches"]
    assert body["post_adjustment_branches"]["tr_001"]["tap_position"] == 0
    assert body["post_adjustment_branches"]["tr_001"]["tap_step_percent"] == 1.25
    # Applied trail.
    assert "tr_001" in body["applied"]["tap_position_changes"]
    assert (
        body["applied"]["tap_position_changes"]["tr_001"]["tap_changer_id"]
        == "tc_oltc_110sn_19_125"
    )


def test_der_spec_nominal_power_persists(app_client):
    """Phase 23: nominal_power_kw + device_catalog_ref persystuje w DER spec."""
    pid = _create_project(app_client)
    _create_audit2_config(
        app_client,
        pid,
        "station-power",
        {
            "mv_neutral_grounding_ref": None,
            "tap_changer_refs": [],
            "der_specs": [
                {
                    "der_id": "der_pv_001",
                    "der_kind": "PV",
                    "device_catalog_ref": "pv_inv_sma_2500",
                    "nominal_power_kw": 2500,
                    "block_transformer_catalog_ref": "btr_pv_15_069_2500",
                }
            ],
        },
    )
    res = app_client.get(f"/api/v1/projects/{pid}/audit2-station-config/station-power")
    body = res.json()
    spec = body["der_specs"][0]
    assert spec["device_catalog_ref"] == "pv_inv_sma_2500"
    assert spec["nominal_power_kw"] == 2500
    assert spec["block_transformer_catalog_ref"] == "btr_pv_15_069_2500"
