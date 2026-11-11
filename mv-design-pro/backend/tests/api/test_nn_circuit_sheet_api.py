"""Kontrakt endpointu `GET /api/cases/{case_id}/enm/nn-circuit-sheet`
(karta ARKUSZ-NN, docs/nn/ARKUSZ_OBLICZEN_NN_2026-08.md).

Pokrywa: sukces (rozdzielnica z jednym odpływem MCB), stacja nieznana
(uczciwe „brak danych", nie 404/500), walidacja biegów opcjonalnych
(``load_flow_run_id``/``short_circuit_run_id`` — UUID niepoprawny → 422,
bieg nieistniejący → 404, bieg innego case_id → 422, bieg złego rodzaju
analizy → 422), determinizm dwóch odczytów."""

from __future__ import annotations

from uuid import uuid4

from enm.canonical_analysis import create_run, execute_run
from enm.models import (
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMDefaults,
    ENMHeader,
    Load,
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
    projekt+przypadek zamiast dowolnego UUID-a.
    """
    project_resp = client.post("/api/projects", json={"name": "Arkusz nN — test"})
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
                catalog_ref="tr-ref",
            )
        ],
        loads=[Load(ref_id="ld1", name="Odbior", bus_ref="b2", p_mw=0.006, q_mvar=0.002)],
        branches=[
            SwitchBranch(
                ref_id="ap1",
                name="AP1",
                type="breaker",
                from_bus_ref="nn",
                to_bus_ref="b1",
                catalog_namespace="APARAT_NN_MCB",
                catalog_ref="mcb-b16",
                materialized_params={"in_a": 16.0, "curve_class": "B", "icn_ka": 6.0},
            ),
            Cable(
                ref_id="c1",
                name="C1",
                from_bus_ref="b1",
                to_bus_ref="b2",
                length_km=0.05,
                r_ohm_per_km=0.32,
                x_ohm_per_km=0.08,
                return_conductor_r_ohm_per_km_20c=0.32,
                return_conductor_x_ohm_per_km=0.08,
                short_circuit_temperature_c=160.0,
                conductor_material="CU",
                cross_section_mm2=16.0,
                catalog_ref="yaky-16",
                materialized_params={"i_max_a": 80.0},
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


def test_sukces_zwraca_jeden_wiersz(app_client) -> None:
    case_id = _nowy_przypadek(app_client)
    _seed_enm(app_client, case_id)
    resp = app_client.get(
        f"/api/cases/{case_id}/enm/nn-circuit-sheet", params={"station_ref": "stn"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "OK"
    assert len(body["wiersze"]) == 1
    assert body["wiersze"][0]["feeder_root_branch_ref"] == "ap1"
    assert body["wiersze"][0]["zrodlo_ib"] == "tabliczka"


def test_stacja_nieznana_daje_200_z_uczciwym_brak_danych(app_client) -> None:
    case_id = _nowy_przypadek(app_client)
    _seed_enm(app_client, case_id)
    resp = app_client.get(
        f"/api/cases/{case_id}/enm/nn-circuit-sheet", params={"station_ref": "nieistniejaca"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "brak danych"


def test_brak_station_ref_daje_422(app_client) -> None:
    case_id = _nowy_przypadek(app_client)
    _seed_enm(app_client, case_id)
    resp = app_client.get(f"/api/cases/{case_id}/enm/nn-circuit-sheet")
    assert resp.status_code == 422


def test_load_flow_run_id_niepoprawny_uuid_daje_422(app_client) -> None:
    case_id = _nowy_przypadek(app_client)
    _seed_enm(app_client, case_id)
    resp = app_client.get(
        f"/api/cases/{case_id}/enm/nn-circuit-sheet",
        params={"station_ref": "stn", "load_flow_run_id": "nie-uuid"},
    )
    assert resp.status_code == 422
    # Odmowa nazywa parametr słowami (mapa pól słownika komunikatów), nie kluczem.
    assert (
        resp.json()["detail"]
        == "Wskazany bieg rozpływu mocy: identyfikator nie jest poprawnym UUID."
    )


def test_load_flow_run_id_nieistniejacy_daje_404(app_client) -> None:
    case_id = _nowy_przypadek(app_client)
    _seed_enm(app_client, case_id)
    resp = app_client.get(
        f"/api/cases/{case_id}/enm/nn-circuit-sheet",
        params={"station_ref": "stn", "load_flow_run_id": str(uuid4())},
    )
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Wskazany bieg rozpływu mocy nie istnieje."


def test_load_flow_run_id_innego_case_daje_422(app_client) -> None:
    case_id = _nowy_przypadek(app_client)
    inny_case_id = _nowy_przypadek(app_client)
    _seed_enm(app_client, case_id)
    _seed_enm(app_client, inny_case_id)
    run = execute_run(
        create_run(
            case_id=inny_case_id,
            klucz_twin=_klucz(app_client, inny_case_id),
            analysis_type="PF",
        ).id
    )
    resp = app_client.get(
        f"/api/cases/{case_id}/enm/nn-circuit-sheet",
        params={"station_ref": "stn", "load_flow_run_id": str(run.id)},
    )
    assert resp.status_code == 422
    assert resp.json()["detail"] == (
        "Wskazany bieg rozpływu mocy należy do innego przypadku obliczeniowego."
    )


def test_short_circuit_run_id_zlego_rodzaju_daje_422(app_client) -> None:
    case_id = _nowy_przypadek(app_client)
    _seed_enm(app_client, case_id)
    pf_run = execute_run(
        create_run(case_id=case_id, klucz_twin=_klucz(app_client, case_id), analysis_type="PF").id
    )
    resp = app_client.get(
        f"/api/cases/{case_id}/enm/nn-circuit-sheet",
        params={"station_ref": "stn", "short_circuit_run_id": str(pf_run.id)},
    )
    assert resp.status_code == 422
    detail = resp.json()["detail"]
    assert detail.startswith("Wskazany bieg zwarciowy jest przebiegiem rodzaju „"), detail
    assert "short_circuit_run_id" not in detail and "'PF'" not in detail, detail


def test_load_flow_run_id_poprawny_daje_ib_z_biegu(app_client) -> None:
    case_id = _nowy_przypadek(app_client)
    _seed_enm(app_client, case_id)
    run = execute_run(
        create_run(case_id=case_id, klucz_twin=_klucz(app_client, case_id), analysis_type="PF").id
    )
    resp = app_client.get(
        f"/api/cases/{case_id}/enm/nn-circuit-sheet",
        params={"station_ref": "stn", "load_flow_run_id": str(run.id)},
    )
    assert resp.status_code == 200
    wiersz = resp.json()["wiersze"][0]
    assert wiersz["zrodlo_ib"] == "rozpływ"


def test_determinizm_dwa_odczyty_identyczne(app_client) -> None:
    case_id = _nowy_przypadek(app_client)
    _seed_enm(app_client, case_id)
    resp1 = app_client.get(
        f"/api/cases/{case_id}/enm/nn-circuit-sheet", params={"station_ref": "stn"}
    )
    resp2 = app_client.get(
        f"/api/cases/{case_id}/enm/nn-circuit-sheet", params={"station_ref": "stn"}
    )
    assert resp1.status_code == resp2.status_code == 200
    assert resp1.json() == resp2.json()


def _zmien_dlugosc_kabla_w_modelu(client, case_id: str, length_km: float) -> None:
    """Edycja modelu bieżącego (HEAD) PO biegu: kabel C1 dłuższy."""
    from enm.store import get_enm

    klucz = _klucz(client, case_id)
    enm = get_enm(klucz)
    galezie = [
        g.model_copy(update={"length_km": length_km}) if g.ref_id == "c1" else g
        for g in enm.branches
    ]
    set_enm(klucz, enm.model_copy(update={"branches": galezie}))


def _dlugosc_wiersza(resp) -> float:
    assert resp.status_code == 200, resp.text
    [wiersz] = resp.json()["wiersze"]
    return float(wiersz["dlugosc_m"]["wartosc"])


def test_arkusz_z_biegiem_czyta_migawke_biegu_nie_model_biezacy(app_client) -> None:
    """Ib z biegu i geometria obwodu z TEJ SAMEJ migawki: edycja modelu po biegu nie miesza
    stanów (dawniej arkusz czytał HEAD, a prąd brał z biegu policzonego na innym modelu)."""
    case_id = _nowy_przypadek(app_client)
    _seed_enm(app_client, case_id)
    run = execute_run(
        create_run(case_id=case_id, klucz_twin=_klucz(app_client, case_id), analysis_type="PF").id
    )
    _zmien_dlugosc_kabla_w_modelu(app_client, case_id, 0.12)
    adres = f"/api/cases/{case_id}/enm/nn-circuit-sheet"
    z_biegiem = app_client.get(
        adres, params={"station_ref": "stn", "load_flow_run_id": str(run.id)}
    )
    bez_biegu = app_client.get(adres, params={"station_ref": "stn"})
    assert _dlugosc_wiersza(z_biegiem) == 50.0
    assert _dlugosc_wiersza(bez_biegu) == 120.0


def test_arkusz_z_biegami_roznych_migawek_daje_422_z_przyczyna(app_client) -> None:
    case_id = _nowy_przypadek(app_client)
    _seed_enm(app_client, case_id)
    klucz = _klucz(app_client, case_id)
    pf_run = execute_run(create_run(case_id=case_id, klucz_twin=klucz, analysis_type="PF").id)
    _zmien_dlugosc_kabla_w_modelu(app_client, case_id, 0.12)
    sc_run = execute_run(
        create_run(case_id=case_id, klucz_twin=klucz, analysis_type="short_circuit_sn").id
    )
    assert pf_run.snapshot_hash != sc_run.snapshot_hash
    resp = app_client.get(
        f"/api/cases/{case_id}/enm/nn-circuit-sheet",
        params={
            "station_ref": "stn",
            "load_flow_run_id": str(pf_run.id),
            "short_circuit_run_id": str(sc_run.id),
        },
    )
    assert resp.status_code == 422
    assert "różnych stanach sieci" in resp.text
