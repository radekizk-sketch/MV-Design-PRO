"""Kontrakt endpointu `POST /api/nn-proof/circuit/pack` (karta P0.10, G-21).

Pakiet dowodowy LV_CIRCUIT_VERIFICATION dla obwodu nN. Pokrywa: wymagane pola
(422 na braki), uczciwe „brak danych" (model bez stacji/aparatu → 422 z
powodem po polsku, nigdy 500 ani fikcyjny ZIP), pełen sukces (ZIP z 10
krokami), determinizm dwóch pobrań, podgląd JSON (`/circuit/preview`)."""

from __future__ import annotations

import io
from uuid import uuid4
from zipfile import ZipFile

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


def _seed_enm(case_id: str) -> None:
    enm = EnergyNetworkModel(
        header=ENMHeader(name="t", defaults=ENMDefaults(sn_nominal_kv=15.0)),
        buses=[
            Bus(ref_id="sn", name="SN", voltage_kv=15.0),
            Bus(ref_id="nn", name="nN", voltage_kv=0.4),
            Bus(ref_id="b1", name="B1", voltage_kv=0.4),
            Bus(ref_id="b2", name="B2", voltage_kv=0.4),
        ],
        sources=[
            Source(ref_id="src", name="GPZ", bus_ref="sn", model="thevenin", r_ohm=0.1, x_ohm=0.5)
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
                short_circuit_temperature_c=160.0,
            ),
            SwitchBranch(
                ref_id="ap1",
                name="AP1",
                type="breaker",
                from_bus_ref="b1",
                to_bus_ref="b2",
                catalog_namespace="APARAT_NN_MCB",
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
                meta={"nn_earthing_system": "TN-C-S"},
            )
        ],
    )
    set_enm(case_id, enm)


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
        "u_ll_kv": 0.4,
        "iz_katalogowe_a": 100.0,
        "srodowisko": "powietrze",
        "izolacja": "PVC",
        "temperatura_c": 30.0,
        "liczba_obwodow": 1,
        "ik_max_ka": 5.0,
        "ith_a": 200.0,
        "fault_duration_s": 0.1,
        "ith_1s_a": 6000.0,
        "cross_section_mm2": 120.0,
        "jth_1s_a_per_mm2": 50.0,
        "vdrop_u_source_kv": 0.4,
        "vdrop_delta_u_total_kv": 0.005,
        "vdrop_delta_u_total_percent": 1.25,
    }
    base.update(overrides)
    return base


def test_pack_wymaga_pol_obowiazkowych(app_client) -> None:
    resp = app_client.post("/api/nn-proof/circuit/pack", json={})
    assert resp.status_code == 422


def test_pack_brak_danych_daje_422_z_powodem_pl(app_client) -> None:
    case_id = str(uuid4())  # brak zasianego ENM -> brak stacji
    resp = app_client.post("/api/nn-proof/circuit/pack", json=_payload(case_id))
    assert resp.status_code == 422
    assert resp.json()["detail"]


def test_pack_sukces_zwraca_zip_z_10_krokami(app_client) -> None:
    case_id = str(uuid4())
    _seed_enm(case_id)
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
    case_id = str(uuid4())
    _seed_enm(case_id)
    payload = _payload(case_id)
    resp1 = app_client.post("/api/nn-proof/circuit/pack", json=payload)
    resp2 = app_client.post("/api/nn-proof/circuit/pack", json=payload)
    assert resp1.status_code == resp2.status_code == 200
    assert resp1.content == resp2.content


def test_preview_zwraca_json_z_dziesiecioma_krokami(app_client) -> None:
    case_id = str(uuid4())
    _seed_enm(case_id)
    resp = app_client.post("/api/nn-proof/circuit/preview", json=_payload(case_id))
    assert resp.status_code == 200
    body = resp.json()
    assert body["pack_type"] == "LV_CIRCUIT_VERIFICATION"
    assert body["summary"]["total_steps"] == 10


def test_preview_brak_danych_zwraca_200_z_uczciwym_statusem(app_client) -> None:
    case_id = str(uuid4())
    resp = app_client.post("/api/nn-proof/circuit/preview", json=_payload(case_id))
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "brak danych"


def test_ik_max_ka_opcjonalny(app_client) -> None:
    case_id = str(uuid4())
    _seed_enm(case_id)
    payload = _payload(case_id)
    payload["ik_max_ka"] = None
    resp = app_client.post("/api/nn-proof/circuit/preview", json=payload)
    assert resp.status_code == 200
    assert resp.json()["summary"]["total_steps"] == 10


def test_report_sekcje_nn_zwraca_wszystkie_sekcje(app_client) -> None:
    case_id = str(uuid4())
    _seed_enm(case_id)
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
    case_id = str(uuid4())
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
