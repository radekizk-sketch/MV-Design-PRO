"""Kontrakt endpointu `POST /api/nn-proof/circuit/report` (karta P0.10 §0.4) oraz
skasowania ręcznego formularza dowodu obwodu nN (karta OBIEKT-KABEL-NN)."""

from __future__ import annotations

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
                lv_earthing_system="TN-C-S",
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
            )
        ],
    )
    set_enm(_klucz(client, case_id), enm)


def test_reczny_formularz_dowodu_skasowany(app_client) -> None:
    """Karta OBIEKT-KABEL-NN: dowód obwodu z ręcznie wpisanych parametrów i syntetycznego
    identyfikatora biegu nie istnieje — dowód powstaje z modelu i biegu
    (`GET /api/cases/{case_id}/enm/nn-cable/dowod`, test `test_kabel_nn_api.py`)."""
    for trasa in ("/api/nn-proof/circuit/pack", "/api/nn-proof/circuit/preview"):
        assert app_client.post(trasa, json={}).status_code in (404, 405)


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
