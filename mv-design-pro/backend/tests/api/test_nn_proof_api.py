"""Kontrakt endpointu `POST /api/nn-proof/circuit/pack` (karta P0.10, G-21).

Pakiet dowodowy LV_CIRCUIT_VERIFICATION dla obwodu nN. Pokrywa: wymagane pola
(422 na braki), uczciwe „brak danych" (model bez stacji/aparatu → 422 z
powodem po polsku, nigdy 500 ani fikcyjny ZIP), pełen sukces (ZIP z 10
krokami), determinizm dwóch pobrań, podgląd JSON (`/circuit/preview`)."""

from __future__ import annotations

import io
from zipfile import ZipFile

import pytest
from enm.models import (
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMDefaults,
    ENMHeader,
    Source,
    Substation,
    SwitchBranch,
    Transformer,
)
from enm.store import set_enm


def _nowy_przypadek(client) -> str:
    """Utwórz REALNY projekt + przypadek przez API; zwróć `case_id`.

    CV-1-W: przypadek bez wiersza w bazie dostaje teraz 404 z magazynu ENM
    (inwariant I-2) — testy tego pliku potrzebują prawdziwej pary
    projekt+przypadek zamiast dowolnego UUID-a (nawet te, które testują
    "brak danych" na poziomie stacji/aparatu — to inny, uczciwy brak niż
    "przypadek nie należy do żadnego projektu").
    """
    project_resp = client.post("/api/projects", json={"name": "Pakiet dowodowy nN — test"})
    assert project_resp.status_code == 201, project_resp.text
    project_id = project_resp.json()["id"]
    case_resp = client.post(
        "/api/study-cases", json={"project_id": project_id, "name": "Przypadek testu"}
    )
    assert case_resp.status_code == 201, case_resp.text
    return str(case_resp.json()["id"])


def _klucz(client, case_id: str) -> str:
    """Klucz magazynu ENM dla `case_id` — TO SAMO tłumaczenie co warstwa API (CV-1)."""
    from application.twin_key import klucz_twin_dla_przypadku

    return klucz_twin_dla_przypadku(case_id, client.app.state.uow_factory)


def _seed_enm(client, case_id: str) -> None:
    enm = EnergyNetworkModel(
        header=ENMHeader(name="t", defaults=ENMDefaults(sn_nominal_kv=15.0)),
        buses=[
            Bus(ref_id="sn", name="SN", voltage_kv=15.0),
            Bus(ref_id="nn", name="nN", voltage_kv=0.4),
            Bus(ref_id="b1", name="B1", voltage_kv=0.4),
            Bus(ref_id="b2", name="B2", voltage_kv=0.4),
        ],
        sources=[
            Source(
                ref_id="src",
                name="GPZ",
                bus_ref="sn",
                model="thevenin",
                r_ohm=0.1,
                x_ohm=0.5,
                catalog_ref="src-ref",
            )
        ],
        transformers=[
            Transformer(
                ref_id="tr",
                name="TR",
                hv_bus_ref="sn",
                lv_bus_ref="nn",
                sn_mva=0.63,
                uhv_kv=15.0,
                ulv_kv=0.4,
                uk_percent=4.0,
                pk_kw=6.5,
                vector_group="Dyn11",
                lv_earthing_system="TN-C-S",
                lv_voltage_tolerance="PLUS_6",  # tolerancja sieci nN (wiersz nN tabeli 1)
                catalog_ref="tr-ref",
            )
        ],
        branches=[
            Cable(
                ref_id="c1",
                name="C1",
                from_bus_ref="nn",
                to_bus_ref="b1",
                length_km=0.05,
                r_ohm_per_km=0.32,
                x_ohm_per_km=0.08,
                return_conductor_r_ohm_per_km_20c=0.32,
                return_conductor_x_ohm_per_km=0.08,
                # Karta typu kabla (6a): obciążalność, przekrój, dane cieplne z modelu — nie
                # z żądania. I_th(1 s) = J_th · S (zgodne dane cieplne).
                catalog_ref="yaky-120",
                materialized_params={"i_max_a": 100.0},
                insulation="PVC",
                conductor_material="CU",
                cross_section_mm2=120.0,
                jth_1s_a_per_mm2=115.0,
                ith_1s_a=13800.0,
                operating_temperature_c=70.0,
                short_circuit_temperature_c=160.0,
            ),
            SwitchBranch(
                ref_id="ap1",
                name="AP1",
                type="breaker",
                from_bus_ref="b1",
                to_bus_ref="b2",
                catalog_namespace="APARAT_NN_MCB",
                catalog_ref="mcb-b16",
                materialized_params={"in_a": 16.0, "curve_class": "B", "icn_ka": 6.0},
            ),
        ],
        substations=[
            Substation(
                ref_id="stn",
                name="S",
                station_type="mv_lv",
                bus_refs=["nn"],
                transformer_refs=["tr"],
            )
        ],
    )
    set_enm(_klucz(client, case_id), enm)


def _payload(case_id: str, **overrides) -> dict:
    base = {
        "project_id": "proj-1",
        "case_id": case_id,
        "run_id": "run-1",
        "snapshot_id": "snap-1",
        "project_name": "Projekt testowy",
        "case_name": "Przypadek testowy",
        "run_timestamp": "2026-08-14T12:00:00Z",
        "station_ref": "stn",
        "bus_ref": "b1",
        "breaker_ref": "ap1",
        "segment_ref": "c1",
        "p_mw": 0.005,
        "q_mvar": 0.002,
        "vdrop_delta_u_total_kv": 0.005,
        "vdrop_delta_u_total_percent": 1.25,
    }
    base.update(overrides)
    return base


def test_pack_wymaga_pol_obowiazkowych(app_client) -> None:
    resp = app_client.post("/api/nn-proof/circuit/pack", json={})
    assert resp.status_code == 422


def test_pack_brak_danych_daje_422_z_powodem_pl(app_client) -> None:
    case_id = _nowy_przypadek(app_client)  # brak zasianego ENM -> brak stacji
    resp = app_client.post("/api/nn-proof/circuit/pack", json=_payload(case_id))
    assert resp.status_code == 422
    assert resp.json()["detail"]


def test_pack_sukces_zwraca_zip_z_10_krokami(app_client) -> None:
    case_id = _nowy_przypadek(app_client)
    _seed_enm(app_client, case_id)
    resp = app_client.post("/api/nn-proof/circuit/pack", json=_payload(case_id))
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/zip"
    with ZipFile(io.BytesIO(resp.content)) as zf:
        names = set(zf.namelist())
        assert "proof_pack/proof.json" in names
        proof_json = zf.read("proof_pack/proof.json").decode("utf-8")
    assert '"proof_type": "LV_CIRCUIT_VERIFICATION"' in proof_json
    assert '"step_number": 10' in proof_json


def test_pack_determinizm_dwa_pobrania_identyczne(app_client) -> None:
    case_id = _nowy_przypadek(app_client)
    _seed_enm(app_client, case_id)
    payload = _payload(case_id)
    resp1 = app_client.post("/api/nn-proof/circuit/pack", json=payload)
    resp2 = app_client.post("/api/nn-proof/circuit/pack", json=payload)
    assert resp1.status_code == resp2.status_code == 200
    assert resp1.content == resp2.content


def test_preview_zwraca_json_z_dziesiecioma_krokami(app_client) -> None:
    case_id = _nowy_przypadek(app_client)
    _seed_enm(app_client, case_id)
    resp = app_client.post("/api/nn-proof/circuit/preview", json=_payload(case_id))
    assert resp.status_code == 200
    body = resp.json()
    assert body["pack_type"] == "LV_CIRCUIT_VERIFICATION"
    assert body["summary"]["total_steps"] == 10


def test_preview_brak_danych_zwraca_200_z_uczciwym_statusem(app_client) -> None:
    case_id = _nowy_przypadek(app_client)
    resp = app_client.post("/api/nn-proof/circuit/preview", json=_payload(case_id))
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "brak danych"


def _bieg_zwarciowy(client, case_id: str) -> str:
    """Zapisany bieg zwarciowy IEC 60909 przypadku (scenariusz MAX) — realny bieg kanoniczny."""
    from enm.canonical_analysis import create_run, execute_run

    run = execute_run(
        create_run(
            case_id=case_id, klucz_twin=_klucz(client, case_id), analysis_type="short_circuit_sn"
        ).id
    )
    assert run.status == "FINISHED", run.error_message
    return str(run.id)


def _krok_cieplny(body: dict) -> dict:
    return next(k for k in body["proof"]["steps"] if k["step_number"] == 7)


@pytest.mark.parametrize("wskazany", [True, False], ids=["bieg_wskazany", "bieg_najnowszy"])
def test_preview_z_biegiem_bierze_ik_i_czas_z_modelu_i_biegu(app_client, wskazany: bool) -> None:
    """6b-iloczyn dla dowodu: bieg {wskazany, najnowszy przypadku}. I″k i κ z wiersza biegu,
    czas wyłączenia z charakterystyki MCB B16 (I″k ≫ 5·In → wyzwolenie magnetyczne ≤ 0,1 s)."""
    case_id = _nowy_przypadek(app_client)
    _seed_enm(app_client, case_id)
    run_id = _bieg_zwarciowy(app_client, case_id)
    payload = _payload(case_id, **({"short_circuit_run_id": run_id} if wskazany else {}))
    resp = app_client.post("/api/nn-proof/circuit/preview", json=payload)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    zrodla = body["zrodla"]
    assert zrodla["short_circuit_run_id"] == run_id
    assert zrodla["kryterium_cieplne_ocenione"] is True
    assert zrodla["czas_wylaczenia"]["zrodlo"] == "charakterystyka_aparatu"
    assert zrodla["czas_wylaczenia"]["czas_s"] == pytest.approx(0.1)
    assert zrodla["tk_kryterium_cieplnego_s"] == zrodla["czas_wylaczenia"]["czas_s"]


def test_preview_bez_biegu_kryterium_cieplne_nieocenione_z_akcja(app_client) -> None:
    case_id = _nowy_przypadek(app_client)
    _seed_enm(app_client, case_id)
    resp = app_client.post("/api/nn-proof/circuit/preview", json=_payload(case_id))
    assert resp.status_code == 200
    body = resp.json()
    assert body["summary"]["total_steps"] == 10
    assert body["zrodla"]["kryterium_cieplne_ocenione"] is False
    assert body["zrodla"]["akcja_pl"] == "Uruchom obliczenia zwarciowe"
    # Bez I″k charakterystyka nie jest pytana: wartość robocza normy (MCB 16 A, TN-C-S, 230 V).
    czas = body["zrodla"]["czas_wylaczenia"]
    assert (czas["zrodlo"], czas["czas_s"], czas["kompletnosc_dowodu"]) == (
        "wartosc_robocza",
        0.4,
        "NIEPELNY",
    )
    assert czas["dane_przyjete"][0]["jakosc"] == "ESTIMATED"


def test_nadpisanie_czasu_na_aparacie_operacja_domenowa_wygrywa(app_client) -> None:
    """Zasada nr 4: projektant zmienia wartość roboczą w modelu (operacja domenowa) i przelicza."""
    case_id = _nowy_przypadek(app_client)
    _seed_enm(app_client, case_id)
    resp_op = app_client.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={
            "operation": {
                "name": "update_element_parameters",
                "payload": {
                    "element_ref": "ap1",
                    "parameters": {"czas_wylaczenia_zwarcia_s": 0.3},
                },
            }
        },
    )
    assert resp_op.status_code == 200, resp_op.text
    assert resp_op.json().get("error") is None, resp_op.json()
    run_id = _bieg_zwarciowy(app_client, case_id)
    resp = app_client.post(
        "/api/nn-proof/circuit/preview",
        json=_payload(case_id, short_circuit_run_id=run_id),
    )
    czas = resp.json()["zrodla"]["czas_wylaczenia"]
    assert (czas["zrodlo"], czas["czas_s"], czas["kompletnosc_dowodu"]) == (
        "projektant",
        0.3,
        "PELNY",
    )
    assert resp.json()["zrodla"]["tk_kryterium_cieplnego_s"] == pytest.approx(0.3)


@pytest.mark.parametrize(
    "pole",
    ["u_ll_kv", "fault_duration_s", "ikss_a", "kappa", "ith_1s_a", "temperatura_c", "ik_max_ka"],
)
def test_pola_modelu_w_zadaniu_sa_odmowa(app_client, pole: str) -> None:
    """Dane modelu i biegu nie wchodzą żądaniem — pole spoza kontraktu to 422, nie cisza."""
    case_id = _nowy_przypadek(app_client)
    _seed_enm(app_client, case_id)
    resp = app_client.post("/api/nn-proof/circuit/preview", json=_payload(case_id, **{pole: 1.0}))
    assert resp.status_code == 422


def test_report_sekcje_nn_zwraca_wszystkie_sekcje(app_client) -> None:
    case_id = _nowy_przypadek(app_client)
    _seed_enm(app_client, case_id)
    resp = app_client.post(
        "/api/nn-proof/circuit/report",
        json={
            "case_id": case_id,
            "station_ref": "stn",
            "bus_ref": "b1",
            "breaker_ref": "ap1",
            "run_id": "r1",
            "revision_id": "rev1",
            "przypadek_decydujacy": "TR",
            "ib_a": 10.0,
            "iz_prime_a": 100.0,
            "ik_max_ka": 5.0,
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "OK"
    for sekcja in (
        "dane_zrodlowe",
        "transformator",
        "odcinki",
        "delta_u",
        "zwarcia",
        "swz",
        "dobor",
    ):
        assert sekcja in body


def test_report_brak_danych_zwraca_200_z_uczciwym_statusem(app_client) -> None:
    case_id = _nowy_przypadek(app_client)
    resp = app_client.post(
        "/api/nn-proof/circuit/report",
        json={
            "case_id": case_id,
            "station_ref": "brak",
            "bus_ref": "b1",
            "breaker_ref": "ap1",
            "run_id": "r1",
            "revision_id": "rev1",
            "przypadek_decydujacy": "TR",
        },
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "brak danych"
