"""Karta W5-D: rozpływ niesymetryczny przez API — tor wykonawczy (`PF_UNBALANCED`),
końcówka `GET /api/analysis-runs/{id}/results/rozplyw-niesymetryczny`, indeks wyników,
ResultSet wykonawczy, odmowa nazwana jako FAILED z kodem kanonu w `error_message`,
rejestr biegów projektu i determinizm dwóch biegów tej samej migawki.
"""

from __future__ import annotations

import json

import pytest
from enm.canonical_analysis import reset_canonical_runs
from enm.models import Bus, Cable, EnergyNetworkModel, ENMHeader, Load, Source, Transformer
from enm.store import reset_enm_store, set_enm
from fastapi.testclient import TestClient

TRASA = "/api/analysis-runs/{run_id}/results/rozplyw-niesymetryczny"


@pytest.fixture(autouse=True)
def _reset() -> None:
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _enm(*, fazy: str | None = "A") -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="w5d-api"),
        buses=[
            Bus(ref_id="b_gpz", name="GPZ 15 kV", voltage_kv=15.0),
            Bus(ref_id="b_sn", name="Stacja SN", voltage_kv=15.0),
            Bus(ref_id="b_nn", name="Szyna nN", voltage_kv=0.4),
        ],
        sources=[
            Source(
                ref_id="src",
                name="System",
                bus_ref="b_gpz",
                model="short_circuit_power",
                sk3_mva=250.0,
                rx_ratio=0.1,
                catalog_ref="src-gpz-15kv-250mva-rx010",
                catalog_namespace="ZRODLO_SN",
                parameter_source="CATALOG",
                source_mode="KATALOG",
            )
        ],
        branches=[
            Cable(
                ref_id="cab1",
                name="Kabel 1",
                from_bus_ref="b_gpz",
                to_bus_ref="b_sn",
                length_km=2.0,
                r_ohm_per_km=0.253,
                x_ohm_per_km=0.1,
                r0_ohm_per_km=0.759,
                x0_ohm_per_km=0.3,
                catalog_ref="cable-tfk-yakxs-3x120",
                catalog_namespace="KABEL_SN",
                parameter_source="CATALOG",
                source_mode="KATALOG",
            )
        ],
        transformers=[
            Transformer(
                ref_id="tr1",
                name="TR 15/0,4",
                hv_bus_ref="b_sn",
                lv_bus_ref="b_nn",
                sn_mva=0.63,
                uhv_kv=15.0,
                ulv_kv=0.4,
                uk_percent=4.5,
                pk_kw=6.5,
                vector_group="Dyn11",
                catalog_ref="tr-sn-nn-15-04-630kva-dyn11",
                catalog_namespace="TRAFO_SN_NN",
                parameter_source="CATALOG",
                source_mode="KATALOG",
            )
        ],
        loads=[
            Load(ref_id="ld1", name="Odbior", bus_ref="b_nn", p_mw=0.05, q_mvar=0.015, phases=fazy)
        ],
    )


def _nowy_przypadek(client: TestClient) -> tuple[str, str]:
    from enm.klucz_twin import klucz_twin_projektu

    projekt = client.post("/api/projects", json={"name": "W5-D rozplyw niesymetryczny"})
    assert projekt.status_code == 201, projekt.text
    project_id = projekt.json()["id"]
    przypadek = client.post(
        "/api/study-cases", json={"project_id": project_id, "name": "Przypadek W5-D"}
    )
    assert przypadek.status_code == 201, przypadek.text
    return klucz_twin_projektu(project_id), str(przypadek.json()["id"])


def _uruchom(client: TestClient, case_id: str) -> dict:
    create = client.post(
        f"/api/execution/study-cases/{case_id}/runs",
        json={"analysis_type": "PF_UNBALANCED", "solver_input": {}},
    )
    assert create.status_code == 201, create.text
    assert create.json()["analysis_type"] == "PF_UNBALANCED"
    execute = client.post(f"/api/execution/runs/{create.json()['id']}/execute")
    assert execute.status_code == 200, execute.text
    return execute.json()


def test_bieg_pf_unbalanced_przez_api_i_koncowka_wynikow(app_client: TestClient) -> None:
    klucz, case_id = _nowy_przypadek(app_client)
    set_enm(klucz, _enm(fazy="A"))
    bieg = _uruchom(app_client, case_id)
    assert bieg["status"] == "DONE", bieg
    run_id = bieg["id"]

    wynik = app_client.get(TRASA.format(run_id=run_id))
    assert wynik.status_code == 200, wynik.text
    dane = wynik.json()
    assert dane["analysis_type"] == "load_flow_unbalanced"
    assert dane["converged"] is True
    assert len(dane["buses"]) == 3 and len(dane["branches"]) == 2
    nn = next(b for b in dane["buses"] if b["element_id"] == "b_nn")
    assert nn["faza_a"]["u_pu"] < nn["faza_b"]["u_pu"]
    assert nn["voltage_unbalance_factor_pct"] > 0.0
    assert dane["summary"]["max_voltage_unbalance_bus_id"] == nn["bus_id"]
    # Tor API materializuje katalog (pojemność kabla → admitancja poprzeczna pominięta);
    # droga I0 odbioru nN zamyka się w Dyn11, kabel powyżej = artefakt (Z_m := 0) —
    # komplet założeń NAZWANY.
    assert {z["kod"] for z in dane["zalozenia"]} == {
        "power_flow.unbalanced_transformer_series_model",
        "power_flow.unbalanced_shunt_admittance_omitted",
        "power_flow.unbalanced_zero_sequence_confined",
    }
    assert next(z for z in dane["zalozenia"] if z["kod"].endswith("confined"))["elementy"] == [
        "cab1"
    ]
    assert dane["proof_status"] == "complete" and dane["reporting_status"] == "reportable"
    assert dane["analysis_case_context"]["case_kind"] == "ROZPLYW_NIESYMETRYCZNY"

    indeks = app_client.get(f"/api/analysis-runs/{run_id}/results/index")
    assert indeks.status_code == 200
    assert [t["table_id"] for t in indeks.json()["tables"]] == [
        "buses_unbalanced",
        "branches_unbalanced",
        "trace",
    ]
    zestaw = app_client.get(f"/api/execution/runs/{run_id}/results")
    assert zestaw.status_code == 200
    assert zestaw.json()["analysis_type"] == "PF_UNBALANCED"
    assert {e["element_type"] for e in zestaw.json()["element_results"]} == {"Bus", "Branch"}

    slad = app_client.get(f"/api/analysis-runs/{run_id}/results/trace")
    assert slad.status_code == 200
    klucze = [k["key"] for k in slad.json()["white_box_trace"]]
    assert "pf_unbalanced_branch[cab1]" in klucze


def test_bieg_innego_rodzaju_daje_puste_wiersze_na_koncowce(app_client: TestClient) -> None:
    klucz, case_id = _nowy_przypadek(app_client)
    set_enm(klucz, _enm(fazy=None))
    create = app_client.post(
        f"/api/execution/study-cases/{case_id}/runs", json={"analysis_type": "LOAD_FLOW"}
    )
    run_id = create.json()["id"]
    app_client.post(f"/api/execution/runs/{run_id}/execute")
    wynik = app_client.get(TRASA.format(run_id=run_id))
    assert wynik.status_code == 200
    assert wynik.json()["buses"] == [] and wynik.json()["summary"] is None


def test_nieznany_bieg_404(app_client: TestClient) -> None:
    odpowiedz = app_client.get(TRASA.format(run_id="00000000-0000-0000-0000-000000000000"))
    assert odpowiedz.status_code == 404


def test_odmowa_nazwana_konczy_bieg_failed_z_kodem_kanonu(app_client: TestClient) -> None:
    """Odbiór międzyfazowy AB — odmowa niezależna od materializacji katalogu w torze API
    (katalog kabla dopisuje r0/x0, więc brak Z0 nie jest tu osiągalny przez API)."""
    klucz, case_id = _nowy_przypadek(app_client)
    set_enm(klucz, _enm(fazy="AB"))
    bieg = _uruchom(app_client, case_id)
    assert bieg["status"] == "FAILED"
    assert "power_flow.unbalanced_load_phases_unsupported" in (bieg["error_message"] or "")
    assert "ld1" in bieg["error_message"]
    wyniki = app_client.get(f"/api/execution/runs/{bieg['id']}/results")
    assert wyniki.status_code == 409


def test_dwa_biegi_tej_samej_migawki_sa_deterministyczne(app_client: TestClient) -> None:
    klucz, case_id = _nowy_przypadek(app_client)
    set_enm(klucz, _enm(fazy="C"))
    pierwszy = _uruchom(app_client, case_id)
    drugi = _uruchom(app_client, case_id)
    assert pierwszy["solver_input_hash"] == drugi["solver_input_hash"]
    w1 = app_client.get(TRASA.format(run_id=pierwszy["id"])).json()
    w2 = app_client.get(TRASA.format(run_id=drugi["id"])).json()
    for klucz_kontraktu in ("buses", "branches", "summary", "zalozenia", "wyspy"):
        assert json.dumps(w1[klucz_kontraktu], sort_keys=True) == json.dumps(
            w2[klucz_kontraktu], sort_keys=True
        )
    z1 = app_client.get(f"/api/execution/runs/{pierwszy['id']}/results").json()
    z2 = app_client.get(f"/api/execution/runs/{drugi['id']}/results").json()
    assert z1["deterministic_signature"] != z2["deterministic_signature"]  # run_id w podpisie
    assert z1["element_results"] == z2["element_results"]


def test_nieprawidlowy_typ_analizy_400_wymienia_pf_unbalanced(app_client: TestClient) -> None:
    _, case_id = _nowy_przypadek(app_client)
    odpowiedz = app_client.post(
        f"/api/execution/study-cases/{case_id}/runs", json={"analysis_type": "ROZPLYW"}
    )
    assert odpowiedz.status_code == 400
    assert "PF_UNBALANCED" in odpowiedz.json()["detail"]
