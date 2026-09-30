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


def test_validate_all_projekt_bez_modelu_import_nieznany_to_brak_nie_zero(app_client):
    """Phase 49 → karta PROOFPACK-KONTRAKT: projekt bez modelu nie ma odbiorow ANI zrodel
    w modelu — dawniej import stawal sie zerem, a bilans oglaszal „krytyczny eksport".
    Teraz rodzaj „zdolnosc przylaczeniowa" jest jawnym brakiem z przyczyna."""
    pid = _create_project(app_client)
    app_client.put(
        f"/api/v1/projects/{pid}/audit2-station-config/station-real-loads",
        json={
            "mv_neutral_grounding_ref": None,
            "tap_changer_refs": [],
            "der_specs": [
                {"der_id": "der_1", "der_kind": "PV", "nominal_power_kw": 1000},
                {"der_id": "der_2", "der_kind": "PV", "nominal_power_kw": 1000},
            ],
        },
    )
    res = app_client.post(f"/api/v1/projects/{pid}/audit2-station-config/_validate-all")
    assert res.status_code == 200
    stacja = next(s for s in res.json()["per_station"] if s["station_id"] == "station-real-loads")
    assert stacja["proofs"] == []
    assert stacja["station_nazwa"] == "Stacja spoza modelu"
    przyczyny = [
        b["przyczyna_pl"]
        for b in stacja["braki_danych"]
        if b["proof_type"] == "AUDIT2_HOSTING_CAPACITY_EXPORT"
    ]
    assert any("odbiorów stacji nie da się zsumować" in p for p in przyczyny)
    # Zrodla spoza modelu tez sa nazwane (po jednej pozycji na zrodlo).
    assert sum("nie istnieje w modelu sieci" in p for p in przyczyny) == 2


def _model_stacji_z_odbiorami():
    """Model ENM: dwie stacje, trzy odbiory (dwa w stacji A, jeden w B) i odbiór na
    szynie spoza stacji, który nie może być doliczony nigdzie."""
    from enm.models import Bus, EnergyNetworkModel, ENMHeader, Generator, Load, Substation

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
        generators=[
            Generator(ref_id="gen-a", name="PV A", bus_ref="bus-a", p_mw=2.0),
            Generator(ref_id="gen-b", name="PV B", bus_ref="bus-b", p_mw=2.0),
        ],
        loads=[
            Load(ref_id="ld-1", name="Odbiór 1", bus_ref="bus-a", p_mw=1.5, q_mvar=0.3),
            Load(ref_id="ld-2", name="Odbiór 2", bus_ref="bus-a", p_mw=0.5, q_mvar=0.1),
            Load(ref_id="ld-3", name="Odbiór 3", bus_ref="bus-b", p_mw=2.0, q_mvar=0.4),
            Load(ref_id="ld-4", name="Odbiór luźny", bus_ref="bus-luzna", p_mw=9.0, q_mvar=0.0),
        ],
    )


def test_validate_all_bilans_kazdej_stacji_z_jej_odbiorow_w_modelu(app_client):
    """W1 + karta PROOFPACK-KONTRAKT: moce odbiorów sumują się per stacja z JEDYNEJ prawdy
    sieci (ENM: `Load.bus_ref` → `Substation.bus_refs`), MW→kW; odbiór na szynie spoza
    stacji nie jest doliczany nigdzie; KAŻDA stacja ma własny bilans (nie pierwsza)."""
    from uuid import UUID

    from enm.klucz_twin import klucz_twin_projektu
    from enm.store import set_enm

    pid = _create_project(app_client)
    set_enm(klucz_twin_projektu(UUID(pid)), _model_stacji_z_odbiorami())
    for stacja, zrodlo, moc in (("st-A", "gen-a", 2500), ("st-B", "gen-b", 1000)):
        app_client.put(
            f"/api/v1/projects/{pid}/audit2-station-config/{stacja}",
            json={"der_specs": [{"der_id": zrodlo, "der_kind": "PV", "nominal_power_kw": moc}]},
        )
    res = app_client.post(f"/api/v1/projects/{pid}/audit2-station-config/_validate-all")
    assert res.status_code == 200
    body = res.json()
    bilans = {
        s["station_nazwa"]: next(
            d["details"] for d in s["proofs"] if d["proof_type"] == "AUDIT2_HOSTING_CAPACITY_EXPORT"
        )
        for s in body["per_station"]
    }
    assert bilans["Stacja A"]["p_import_kw"] == 2000.0
    assert bilans["Stacja A"]["p_export_kw"] == 2500.0
    assert bilans["Stacja B"]["p_import_kw"] == 2000.0
    assert bilans["Stacja B"]["p_export_kw"] == 1000.0


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
    station_ids = {s["station_id"] for s in body["per_station"]}
    assert station_ids == {"station-V-A", "station-V-B"}
    # Kazdy z pieciu rodzajow ma w kazdej stacji dowod albo jawny brak (nic nie znika).
    for stacja in body["per_station"]:
        rodzaje = {d["proof_type"] for d in stacja["proofs"]} | {
            b["proof_type"] for b in stacja["braki_danych"]
        }
        assert len(rodzaje) == 5
    stacja_b = next(s for s in body["per_station"] if s["station_id"] == "station-V-B")
    assert [d["proof_type"] for d in stacja_b["proofs"]] == ["AUDIT2_DEVICE_WITHSTAND"]
    assert stacja_b["proofs"][0]["summary_pl"].startswith("Pole POLE-01: ")


@pytest.mark.parametrize(
    "wytrzymalosc",
    [
        {
            "device_id": "wstd_breaker_vacuum_15_25",
            "i_peak_calculated_ka": 50,
            "i_thermal_calculated_ka": 20,
            "t_clearing_s": 0,
        },
        {
            "device_id": "wstd_breaker_vacuum_15_25",
            "i_peak_calculated_ka": -1,
            "i_thermal_calculated_ka": 20,
            "t_clearing_s": 1,
        },
        {
            "device_id": "",
            "i_peak_calculated_ka": 50,
            "i_thermal_calculated_ka": 20,
            "t_clearing_s": 1,
        },
        {"device_id": "wstd_breaker_vacuum_15_25", "i_peak_calculated_ka": 50},
    ],
    ids=["czas_zero", "prad_ujemny", "bez_aparatu", "niepelne"],
)
def test_put_odrzuca_dane_wytrzymalosci_z_ktorych_dowodu_nie_da_sie_zlozyc(
    app_client, wytrzymalosc
):
    """Zapis przyjmuje wylacznie dane, z ktorych dowod da sie zlozyc — odmowa 422 przy
    zapisie (ta sama klasa ograniczen co specyfikacja dowodu), nie blad przy skladaniu."""
    pid = _create_project(app_client)
    res = app_client.put(
        f"/api/v1/projects/{pid}/audit2-station-config/station-W",
        json={"bay_device_withstand": {"Pole 1": wytrzymalosc}},
    )
    assert res.status_code == 422


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
