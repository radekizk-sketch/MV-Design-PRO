"""
Testy API persystencji audit2 station config (Punkt 3 Phase 2).

CRUD endpoints:
  GET  /api/v1/projects/{pid}/audit2-station-config — lista
  GET  /api/v1/projects/{pid}/audit2-station-config/{sid} — jeden
  PUT  /api/v1/projects/{pid}/audit2-station-config/{sid} — UPSERT
  DELETE /api/v1/projects/{pid}/audit2-station-config/{sid} — usun
"""

from __future__ import annotations

from urllib.parse import quote

import pytest

pytest.importorskip("fastapi")


def _create_project(client) -> str:
    res = client.post("/api/projects", json={"name": "Audit2 Test Project"})
    assert res.status_code == 201
    return res.json()["id"]


def test_get_returns_404_when_no_config(app_client):
    pid = _create_project(app_client)
    res = app_client.get(f"/api/v1/projects/{pid}/audit2-station-config/station-001")
    assert res.status_code == 404


def test_list_returns_empty_when_no_configs(app_client):
    pid = _create_project(app_client)
    res = app_client.get(f"/api/v1/projects/{pid}/audit2-station-config")
    assert res.status_code == 200
    assert res.json() == []


def test_put_creates_new_config(app_client):
    pid = _create_project(app_client)
    body = {
        "mv_neutral_grounding_ref": "mng_petersen",
        "tap_changer_refs": ["tc_oltc_110sn_19_125"],
        "der_specs": [
            {
                "der_id": "der_001",
                "der_kind": "PV",
                "block_transformer_catalog_ref": "btr_pv_15_069_2500",
                "pf_curve_ref": "pf_droop_5",
            }
        ],
    }
    res = app_client.put(
        f"/api/v1/projects/{pid}/audit2-station-config/station-001",
        json=body,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["mv_neutral_grounding_ref"] == "mng_petersen"
    assert data["tap_changer_refs"] == ["tc_oltc_110sn_19_125"]
    assert len(data["der_specs"]) == 1
    assert data["der_specs"][0]["der_id"] == "der_001"


def test_put_upserts_existing_config(app_client):
    pid = _create_project(app_client)
    # 1. Initial PUT
    res = app_client.put(
        f"/api/v1/projects/{pid}/audit2-station-config/station-002",
        json={"mv_neutral_grounding_ref": "mng_isolated", "tap_changer_refs": [], "der_specs": []},
    )
    assert res.status_code == 200
    initial_id = res.json()["id"]

    # 2. Second PUT — should UPDATE, not create new.
    res2 = app_client.put(
        f"/api/v1/projects/{pid}/audit2-station-config/station-002",
        json={"mv_neutral_grounding_ref": "mng_petersen", "tap_changer_refs": [], "der_specs": []},
    )
    assert res2.status_code == 200
    # ID nie zmienia sie po update
    assert res2.json()["id"] == initial_id
    assert res2.json()["mv_neutral_grounding_ref"] == "mng_petersen"


def test_get_after_put_returns_config(app_client):
    pid = _create_project(app_client)
    body = {
        "mv_neutral_grounding_ref": "mng_resistor_low",
        "tap_changer_refs": ["tc_detc_snnn_5_25"],
        "der_specs": [
            {
                "der_id": "der_bess_001",
                "der_kind": "BESS",
                "bess_operation_mode_refs": ["mode_fcr_n", "mode_voltage_support"],
            }
        ],
    }
    app_client.put(f"/api/v1/projects/{pid}/audit2-station-config/station-003", json=body)

    res = app_client.get(f"/api/v1/projects/{pid}/audit2-station-config/station-003")
    assert res.status_code == 200
    data = res.json()
    assert data["mv_neutral_grounding_ref"] == "mng_resistor_low"
    assert data["der_specs"][0]["bess_operation_mode_refs"] == [
        "mode_fcr_n",
        "mode_voltage_support",
    ]


def test_station_id_accepts_enm_reference_with_slashes(app_client):
    pid = _create_project(app_client)
    station_ref = "stn/e7ac9af3834811e633a6a98f1d3d4112/station"
    encoded_station_ref = quote(station_ref, safe="")
    body = {"mv_neutral_grounding_ref": None, "tap_changer_refs": [], "der_specs": []}

    put_res = app_client.put(
        f"/api/v1/projects/{pid}/audit2-station-config/{encoded_station_ref}",
        json=body,
    )
    assert put_res.status_code == 200
    assert put_res.json()["station_id"] == station_ref

    get_res = app_client.get(
        f"/api/v1/projects/{pid}/audit2-station-config/{encoded_station_ref}",
    )
    assert get_res.status_code == 200
    assert get_res.json()["station_id"] == station_ref


def test_list_returns_multiple_stations(app_client):
    pid = _create_project(app_client)
    for sid in ["station-A", "station-B", "station-C"]:
        app_client.put(
            f"/api/v1/projects/{pid}/audit2-station-config/{sid}",
            json={
                "mv_neutral_grounding_ref": "mng_petersen",
                "tap_changer_refs": [],
                "der_specs": [],
            },
        )

    res = app_client.get(f"/api/v1/projects/{pid}/audit2-station-config")
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 3
    sids = [r["station_id"] for r in data]
    assert sids == ["station-A", "station-B", "station-C"]  # sorted


def test_delete_removes_config(app_client):
    pid = _create_project(app_client)
    app_client.put(
        f"/api/v1/projects/{pid}/audit2-station-config/station-D",
        json={"mv_neutral_grounding_ref": None, "tap_changer_refs": [], "der_specs": []},
    )
    # Delete
    res = app_client.delete(f"/api/v1/projects/{pid}/audit2-station-config/station-D")
    assert res.status_code == 204

    # Subsequent GET zwraca 404
    res2 = app_client.get(f"/api/v1/projects/{pid}/audit2-station-config/station-D")
    assert res2.status_code == 404


def test_delete_404_when_no_config(app_client):
    pid = _create_project(app_client)
    res = app_client.delete(f"/api/v1/projects/{pid}/audit2-station-config/nonexistent")
    assert res.status_code == 404


def test_isolation_between_projects(app_client):
    """Configs jednego projektu nie sa widoczne w innym."""
    pid1 = _create_project(app_client)
    pid2 = _create_project(app_client)
    app_client.put(
        f"/api/v1/projects/{pid1}/audit2-station-config/station-X",
        json={"mv_neutral_grounding_ref": "mng_petersen", "tap_changer_refs": [], "der_specs": []},
    )

    # Project 1 widzi config
    res1 = app_client.get(f"/api/v1/projects/{pid1}/audit2-station-config")
    assert len(res1.json()) == 1

    # Project 2 nic nie widzi
    res2 = app_client.get(f"/api/v1/projects/{pid2}/audit2-station-config")
    assert res2.json() == []


def test_validate_all_uses_real_p_import_from_snapshot_loads(app_client):
    """Phase 49: validate_all uzywa real loads z snapshot, nie placeholder 0.0."""
    pid = _create_project(app_client)
    # Setup config z DER (p_export = 2 * 1000 kW = 2000 kW, w/o real nominal_power_kw).
    app_client.put(
        f"/api/v1/projects/{pid}/audit2-station-config/station-real-loads",
        json={
            "mv_neutral_grounding_ref": None,
            "tap_changer_refs": [],
            "der_specs": [
                {"der_id": "der_1", "der_kind": "PV", "nominal_power_kw": 1000},
                {"der_id": "der_2", "der_kind": "PV", "nominal_power_kw": 1000},
            ],
            "transformer_tap_changers": {},
            "bay_hv_fuses": {},
            "bay_vts": {},
            "bay_device_withstand": {},
        },
    )
    # Run validate-all — bez snapshotu w DB, p_import = 0 (no loads found).
    res = app_client.post(f"/api/v1/projects/{pid}/audit2-station-config/_validate-all")
    assert res.status_code == 200
    body = res.json()
    # Hosting capacity proof istnieje dla station-real-loads.
    station_result = next(s for s in body["per_station"] if s["station_id"] == "station-real-loads")
    hosting_proofs = [
        p for p in station_result["proofs"] if p["proof_type"] == "AUDIT2_HOSTING_CAPACITY_EXPORT"
    ]
    assert len(hosting_proofs) > 0
    # p_export_kw = 2000, p_import_kw = 0 (no snapshot).
    proof = hosting_proofs[0]
    assert proof["details"]["p_export_kw"] == 2000.0
    assert proof["details"]["p_import_kw"] == 0.0
    # Status: requires_ramp_down (ratio inf).


def _model_stacji_z_odbiorami():
    """Model ENM: dwie stacje, trzy odbiory (dwa w stacji A, jeden w B) i odbiór na
    szynie spoza stacji, który nie może być doliczony nigdzie."""
    from enm.models import Bus, EnergyNetworkModel, ENMHeader, Load, Substation

    return EnergyNetworkModel(
        header=ENMHeader(name="Audyt 2 — agregacja odbiorów"),
        buses=[
            Bus(ref_id="bus-a", name="Szyna A", voltage_kv=0.4),
            Bus(ref_id="bus-b", name="Szyna B", voltage_kv=0.4),
            Bus(ref_id="bus-luzna", name="Szyna poza stacją", voltage_kv=0.4),
        ],
        substations=[
            Substation(ref_id="st-A", name="Stacja A", station_type="mv_lv", bus_refs=["bus-a"]),
            Substation(ref_id="st-B", name="Stacja B", station_type="mv_lv", bus_refs=["bus-b"]),
        ],
        loads=[
            Load(ref_id="ld-1", name="Odbiór 1", bus_ref="bus-a", p_mw=1.5, q_mvar=0.3),
            Load(ref_id="ld-2", name="Odbiór 2", bus_ref="bus-a", p_mw=0.5, q_mvar=0.1),
            Load(ref_id="ld-3", name="Odbiór 3", bus_ref="bus-b", p_mw=2.0, q_mvar=0.4),
            Load(ref_id="ld-4", name="Odbiór luźny", bus_ref="bus-luzna", p_mw=9.0, q_mvar=0.0),
        ],
    )


def test_aggregate_loads_per_station_helper_no_model(app_client):
    """Projekt bez modelu ENM ⇒ pusty słownik (uczciwy brak, nie zgadywanie)."""
    from uuid import UUID

    from api.audit2_station_config import _aggregate_loads_per_station_for_project

    pid = _create_project(app_client)
    uow_factory = app_client.app.state.uow_factory  # type: ignore[attr-defined]
    assert _aggregate_loads_per_station_for_project(UUID(pid), uow_factory) == {}


def test_aggregate_loads_per_station_from_enm(app_client):
    """W1: moce odbiorów sumują się per stacja z JEDYNEJ prawdy sieci (ENM:
    `Load.bus_ref` → `Substation.bus_refs`), MW→kW; odbiór na szynie spoza stacji
    nie jest doliczany nigdzie."""
    from uuid import UUID

    from api.audit2_station_config import _aggregate_loads_per_station_for_project
    from enm.klucz_twin import klucz_twin_projektu
    from enm.store import set_enm

    pid = _create_project(app_client)
    set_enm(klucz_twin_projektu(UUID(pid)), _model_stacji_z_odbiorami())
    uow_factory = app_client.app.state.uow_factory  # type: ignore[attr-defined]

    assert _aggregate_loads_per_station_for_project(UUID(pid), uow_factory) == {
        "st-A": 2000.0,
        "st-B": 2000.0,
    }


def test_aggregate_loads_zero_power_load_is_counted(app_client):
    """Odbiór z p_mw = 0 zostaje w agregacie jako 0.0 — ta sama klasa defektu
    (or-łańcuch gubiący zero), której pilnował dawny test na migawce legacy."""
    from uuid import UUID

    from api.audit2_station_config import _aggregate_loads_per_station_for_project
    from enm.klucz_twin import klucz_twin_projektu
    from enm.models import Bus, EnergyNetworkModel, ENMHeader, Load, Substation
    from enm.store import set_enm

    pid = _create_project(app_client)
    model = EnergyNetworkModel(
        header=ENMHeader(name="Audyt 2 — odbiór zerowy"),
        buses=[Bus(ref_id="bus-1", name="Szyna 1", voltage_kv=0.4)],
        substations=[
            Substation(ref_id="st-1", name="Stacja 1", station_type="mv_lv", bus_refs=["bus-1"])
        ],
        loads=[Load(ref_id="ld-0", name="Odbiór zerowy", bus_ref="bus-1", p_mw=0.0, q_mvar=0.0)],
    )
    set_enm(klucz_twin_projektu(UUID(pid)), model)
    uow_factory = app_client.app.state.uow_factory  # type: ignore[attr-defined]

    assert _aggregate_loads_per_station_for_project(UUID(pid), uow_factory) == {"st-1": 0.0}


def test_validate_all_returns_pack_per_station(app_client):
    """Phase 13: POST /_validate-all zwraca proof pack per stacja."""
    pid = _create_project(app_client)
    # Setup 2 stacje.
    app_client.put(
        f"/api/v1/projects/{pid}/audit2-station-config/station-V-A",
        json={
            "mv_neutral_grounding_ref": "mng_petersen",
            "tap_changer_refs": [],
            "der_specs": [{"der_id": "der_001", "der_kind": "PV"}],
            "transformer_tap_changers": {"tr_001": "tc_oltc_110sn_19_125"},
            "bay_hv_fuses": {},
            "bay_vts": {},
            "bay_device_withstand": {},
        },
    )
    app_client.put(
        f"/api/v1/projects/{pid}/audit2-station-config/station-V-B",
        json={
            "mv_neutral_grounding_ref": "mng_isolated",
            "tap_changer_refs": [],
            "der_specs": [],
            "transformer_tap_changers": {},
            "bay_hv_fuses": {},
            "bay_vts": {},
            "bay_device_withstand": {
                "POLE-01": {
                    "device_id": "wstd_breaker_vacuum_15_25",
                    "i_peak_calculated_ka": 50,
                    "i_thermal_calculated_ka": 20,
                    "t_clearing_s": 1.0,
                }
            },
        },
    )

    res = app_client.post(f"/api/v1/projects/{pid}/audit2-station-config/_validate-all")
    assert res.status_code == 200
    body = res.json()
    assert body["station_count"] == 2
    assert len(body["per_station"]) == 2
    # Both stations should have proofs (per logic).
    station_ids = {s["station_id"] for s in body["per_station"]}
    assert station_ids == {"station-V-A", "station-V-B"}


def test_persistence_round_trip_complex_der_spec(app_client):
    """JSONB der_specs zachowuje wszystkie pola po round-tripie."""
    pid = _create_project(app_client)
    der_specs = [
        {
            "der_id": "der_001",
            "der_kind": "PV",
            "bess_operation_mode_refs": None,
            "block_transformer_catalog_ref": "btr_pv_15_069_2500",
            "pf_curve_ref": "pf_droop_5",
        },
        {
            "der_id": "der_002",
            "der_kind": "BESS",
            "bess_operation_mode_refs": ["mode_fcr_n", "mode_voltage_support"],
            "block_transformer_catalog_ref": "btr_bess_15_04_1600",
            "pf_curve_ref": None,
        },
    ]
    app_client.put(
        f"/api/v1/projects/{pid}/audit2-station-config/station-rt",
        json={
            "mv_neutral_grounding_ref": "mng_petersen",
            "tap_changer_refs": ["tc_oltc_110sn_19_125"],
            "der_specs": der_specs,
        },
    )
    res = app_client.get(f"/api/v1/projects/{pid}/audit2-station-config/station-rt")
    data = res.json()
    assert len(data["der_specs"]) == 2
    bess = next(s for s in data["der_specs"] if s["der_id"] == "der_002")
    assert sorted(bess["bess_operation_mode_refs"]) == ["mode_fcr_n", "mode_voltage_support"]


def test_dowod_VT_nie_udaje_zgodnosci_dla_typu_spoza_katalogu(app_client):
    """Nieznany typ VT daje dowod NIEZALICZONY, nie zgodnosc na wartosci domyslnej.

    V12K-258: endpoint rozwiazywal `bay_vts` przez czteroelementowa mape syntetycznych
    identyfikatorow frontu z fallbackiem `1.9` — wiec KAZDY typ spoza tej mapy (czyli
    kazdy typ z realnego katalogu i kazda literowka) dostawal wspolczynnik z powietrza,
    a pakiet dowodowy oglaszal na jego podstawie zgodnosc z siecia kompensowana.

    Test sprawdza OBIE galezie na jednym pakiecie: realny typ katalogowy z F_v 1,9
    przechodzi, typ nieistniejacy jest nazwany brakiem — inaczej bramka nie odroznialaby
    naprawy od fallbacku.
    """
    pid = _create_project(app_client)
    app_client.put(
        f"/api/v1/projects/{pid}/audit2-station-config/station-vt",
        json={
            "mv_neutral_grounding_ref": "mng_petersen",
            "tap_changer_refs": [],
            "der_specs": [],
            "transformer_tap_changers": {},
            "bay_hv_fuses": {},
            "bay_vts": {
                "POLE-REALNE": "vt_20kv_fz_100_3_05_3p_siemens",
                "POLE-WIDMO": "vt_20kv_dual",
            },
            "bay_device_withstand": {},
        },
    )

    res = app_client.post(f"/api/v1/projects/{pid}/audit2-station-config/_validate-all")
    assert res.status_code == 200
    stacja = next(s for s in res.json()["per_station"] if s["station_id"] == "station-vt")
    dowody = {
        d["details"]["bay_designation"]: d
        for d in stacja["proofs"]
        if d["proof_type"] == "AUDIT2_VT_GROUNDING_VALIDATION"
    }

    realny = dowody["POLE-REALNE"]
    assert realny["pass_status"] is True
    assert realny["details"]["vt_voltage_factor"] == 1.9

    widmo = dowody["POLE-WIDMO"]
    assert widmo["pass_status"] is False
    assert widmo["details"]["vt_voltage_factor"] is None
    assert "nieznany" in widmo["summary_pl"].lower()
