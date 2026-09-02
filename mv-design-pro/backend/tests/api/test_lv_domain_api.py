"""Kontrakt endpointów `GET /api/cases/{case_id}/enm/lv-domain/{station_ref}`,
`.../upstream-equivalent` i `.../projection/v1` (karta T5b,
docs/nn/KONCEPCJA_LOD_NN_2026-08.md; karta B-02 — projekcja atomowa).
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from enm.canonical_analysis import create_run, execute_run, reset_canonical_runs
from enm.models import (
    Bus,
    EnergyNetworkModel,
    ENMDefaults,
    ENMHeader,
    Source,
    Substation,
    Transformer,
)
from enm.store import reset_enm_store, set_enm

from tests.application.analyses.lv_domain.fixtury_stacji_nn import zbuduj_stacje_nn


@pytest.fixture(autouse=True)
def _reset_stan_przypadkow():
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _seed_enm(case_id: str) -> None:
    enm = EnergyNetworkModel(
        header=ENMHeader(name="t5b-api", defaults=ENMDefaults(sn_nominal_kv=15.0)),
        buses=[
            Bus(ref_id="sn", name="SN", voltage_kv=15.0),
            Bus(ref_id="nn", name="nN", voltage_kv=0.4),
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
        substations=[
            Substation(
                ref_id="stn",
                name="Stacja",
                station_type="mv_lv",
                bus_refs=["nn"],
                transformer_refs=["tr"],
            )
        ],
    )
    set_enm(case_id, enm)


class TestLvDomainViewEndpoint:
    def test_success_returns_domain_graph(self, app_client) -> None:
        case_id = str(uuid4())
        _seed_enm(case_id)
        resp = app_client.get(f"/api/cases/{case_id}/enm/lv-domain/stn")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "OK"
        assert body["station_ref"] == "stn"
        assert {b["ref_id"] for b in body["buses"]} == {"nn"}
        assert {t["ref_id"] for t in body["transformers"]} == {"tr"}
        assert body["boundary_links"] == []

    def test_unknown_station_returns_200_with_honest_brak_danych(self, app_client) -> None:
        case_id = str(uuid4())
        _seed_enm(case_id)
        resp = app_client.get(f"/api/cases/{case_id}/enm/lv-domain/nieistniejaca")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "brak danych"


class TestUpstreamEquivalentEndpoint:
    def test_success_returns_snapshot(self, app_client) -> None:
        case_id = str(uuid4())
        _seed_enm(case_id)
        resp = app_client.get(f"/api/cases/{case_id}/enm/lv-domain/stn/upstream-equivalent")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "OK"
        assert body["source_node_id"] is not None
        assert body["voltage_level_id"] == "kv:15"
        assert body["scenario_id"] == "MAX"
        assert body["z1_ohm"]["r"] > 0
        assert body["calculation_run_id"] is not None

    def test_scenario_query_param_selects_min(self, app_client) -> None:
        case_id = str(uuid4())
        _seed_enm(case_id)
        resp = app_client.get(
            f"/api/cases/{case_id}/enm/lv-domain/stn/upstream-equivalent",
            params={"scenario": "MIN"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["scenario_id"] == "MIN"
        assert body["c_factor"] == 1.00

    def test_invalid_scenario_value_returns_422(self, app_client) -> None:
        case_id = str(uuid4())
        _seed_enm(case_id)
        resp = app_client.get(
            f"/api/cases/{case_id}/enm/lv-domain/stn/upstream-equivalent",
            params={"scenario": "NIEPOPRAWNY"},
        )
        assert resp.status_code == 422

    def test_unknown_station_returns_200_with_honest_brak_danych(self, app_client) -> None:
        case_id = str(uuid4())
        _seed_enm(case_id)
        resp = app_client.get(
            f"/api/cases/{case_id}/enm/lv-domain/nieistniejaca/upstream-equivalent"
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "brak danych"

    def test_two_calls_are_deterministic(self, app_client) -> None:
        case_id = str(uuid4())
        _seed_enm(case_id)
        resp1 = app_client.get(f"/api/cases/{case_id}/enm/lv-domain/stn/upstream-equivalent")
        resp2 = app_client.get(f"/api/cases/{case_id}/enm/lv-domain/stn/upstream-equivalent")
        assert resp1.json() == resp2.json()


class TestLvDomainProjectionV1Endpoint:
    def test_returns_one_versioned_atomic_snapshot(self, app_client) -> None:
        case_id = str(uuid4())
        _seed_enm(case_id)

        resp = app_client.get(f"/api/cases/{case_id}/enm/lv-domain/stn/projection/v1")

        assert resp.status_code == 200
        body = resp.json()
        assert body["contract"] == "LvDomainProjectionV1"
        # 3.0.0 — stany zacisków/odcinków/wysp, role urządzeń, tożsamość
        # zasilania SN i komunikaty walidacji (mandat „profesjonalizacja SLD
        # nN"); 2.0.0 wprowadziło `swz_snapshot.transformers[]`. Każda zmiana
        # niezgodna wstecz = MAJOR (karta B-02 §0.2).
        assert body["contract_version"] == "3.0.0"
        assert isinstance(body["validation_messages"], list)
        assert body["status"] == "OK"
        assert body["graph"]["station_ref"] == "stn"
        assert {row["transformer_ref"] for row in body["upstream_equivalents"]} == {"tr"}

    def test_snapshot_identity_is_shared_and_projection_is_deterministic(self, app_client) -> None:
        case_id = str(uuid4())
        _seed_enm(case_id)
        url = f"/api/cases/{case_id}/enm/lv-domain/stn/projection/v1"

        first = app_client.get(url).json()
        second = app_client.get(url).json()

        assert first == second
        assert first["projection_hash"]
        assert (
            first["upstream_equivalents"][0]["model_hash"] == first["model_snapshot"]["model_hash"]
        )
        assert (
            first["upstream_equivalents"][0]["operating_state_id"]
            == first["model_snapshot"]["operating_state_id"]
        )
        assert first["result_snapshot"]["status"] == "NONE"
        assert first["result_snapshot"]["overlay_payload"] is None
        # Stacja bez odpływów: transformator JEST w odpowiedzi (z pustą listą
        # odpływów), bo cicha nieobecność transformatora byłaby kłamstwem przez
        # pominięcie (karta B-02 §0.2).
        assert [row["transformer_ref"] for row in first["swz_snapshot"]["transformers"]] == ["tr"]
        assert first["swz_snapshot"]["transformers"][0]["feeders"] == []

    def test_model_snapshot_carries_request_identity(self, app_client) -> None:
        """§0.4: klient porównuje tożsamość odpowiedzi z tym, o co prosił."""
        case_id = str(uuid4())
        _seed_enm(case_id)

        body = app_client.get(
            f"/api/cases/{case_id}/enm/lv-domain/stn/projection/v1",
            params={"scenario": "MIN"},
        ).json()

        snapshot = body["model_snapshot"]
        assert snapshot["case_id"] == case_id
        assert snapshot["station_ref"] == "stn"
        assert snapshot["scenario_id"] == "MIN"
        assert snapshot["run_snapshot_hash"] is None
        assert snapshot["model_hash"]
        assert snapshot["operating_state_id"]

    def test_graph_buses_carry_energization_and_islands(self, app_client) -> None:
        case_id = str(uuid4())
        _seed_enm(case_id)

        body = app_client.get(f"/api/cases/{case_id}/enm/lv-domain/stn/projection/v1").json()

        bus = body["graph"]["buses"][0]
        assert bus["energization_state"] == "ENERGIZED"
        assert bus["is_energized"] is True
        assert bus["supply_refs"] == ["tr"]
        assert bus["island_ref"] == "island-1"
        assert bus["is_board"] is True
        assert len(body["graph"]["islands"]) == 1
        wyspa = body["graph"]["islands"][0]
        assert wyspa["island_ref"] == "island-1"
        assert wyspa["bus_refs"] == ["nn"]
        assert wyspa["energization_state"] == "ENERGIZED"
        assert wyspa["is_islanded"] is False
        assert wyspa["energizing_source_ids"] == ["tr"]
        assert wyspa["neutral_reference"]["source_ref"] == "tr"
        assert wyspa["power_balance"]["state"] == "z_sieci"
        assert body["graph"]["segments"] == []
        assert body["graph"]["supply_paths"] == [
            {"bus_ref": "nn", "source_ref": "tr", "source_bus_ref": "nn", "branch_refs": []}
        ]

    def test_two_transformer_station_returns_two_swz_positions(self, app_client) -> None:
        """Stacja 2×TR: dwie pozycje `swz_snapshot.transformers`, każdy odpływ
        pod swoim transformatorem (karta B-02 §0.2)."""
        case_id = str(uuid4())
        set_enm(case_id, zbuduj_stacje_nn(transformatory=2, sprzeglo="closed"))

        body = app_client.get(f"/api/cases/{case_id}/enm/lv-domain/stn/projection/v1").json()

        transformers = body["swz_snapshot"]["transformers"]
        assert [row["transformer_ref"] for row in transformers] == ["tr1", "tr2"]
        assert [row["nn_bus_ref"] for row in transformers] == ["nn_a", "nn_b"]
        odplywy = {
            row["transformer_ref"]: [f["feeder_root_branch_ref"] for f in row["feeders"]]
            for row in transformers
        }
        assert odplywy == {"tr1": ["ap_a"], "tr2": ["ap_b"]}
        for row in transformers:
            for feeder in row["feeders"]:
                assert feeder["supply"] == "wielostronne"
                assert feeder["supply_assumption_pl"]
                assert feeder["swz"]["transformer_ref"] == row["transformer_ref"]

    def test_unknown_run_is_not_silently_replaced(self, app_client) -> None:
        case_id = str(uuid4())
        _seed_enm(case_id)

        resp = app_client.get(
            f"/api/cases/{case_id}/enm/lv-domain/stn/projection/v1",
            params={"run_id": str(uuid4())},
        )

        assert resp.status_code == 404

    def test_run_from_another_case_is_rejected_with_409(self, app_client) -> None:
        case_id = str(uuid4())
        obcy_case_id = str(uuid4())
        set_enm(case_id, zbuduj_stacje_nn())
        set_enm(obcy_case_id, zbuduj_stacje_nn())
        run = execute_run(create_run(case_id=obcy_case_id, analysis_type="PF").id)

        resp = app_client.get(
            f"/api/cases/{case_id}/enm/lv-domain/stn/projection/v1",
            params={"run_id": str(run.id)},
        )

        assert resp.status_code == 409
        assert obcy_case_id in resp.json()["detail"]

    def test_unfinished_run_is_rejected_with_409(self, app_client) -> None:
        case_id = str(uuid4())
        set_enm(case_id, zbuduj_stacje_nn())
        run = create_run(case_id=case_id, analysis_type="PF")
        assert run.status != "FINISHED"

        resp = app_client.get(
            f"/api/cases/{case_id}/enm/lv-domain/stn/projection/v1",
            params={"run_id": str(run.id)},
        )

        assert resp.status_code == 409
        assert str(run.id) in resp.json()["detail"]

    def test_finished_run_of_this_case_is_fresh_and_identity_matches(self, app_client) -> None:
        case_id = str(uuid4())
        set_enm(case_id, zbuduj_stacje_nn())
        run = execute_run(create_run(case_id=case_id, analysis_type="PF").id)

        body = app_client.get(
            f"/api/cases/{case_id}/enm/lv-domain/stn/projection/v1",
            params={"run_id": str(run.id)},
        ).json()

        assert body["result_snapshot"]["status"] == "FRESH"
        assert body["result_snapshot"]["run_id"] == str(run.id)
        assert body["model_snapshot"]["run_snapshot_hash"] == run.snapshot_hash
        assert body["model_snapshot"]["run_snapshot_hash"] == body["model_snapshot"]["model_hash"]

    def test_concurrent_model_write_does_not_change_the_response(
        self, app_client, monkeypatch
    ) -> None:
        """§0.5 na REALNEJ ścieżce HTTP: końcówka pobiera model RAZ, więc zapis
        współbieżny (inny wątek podmienia model w magazynie w trakcie budowy)
        nie może przemieszać w jednej odpowiedzi dwóch rewizji."""
        from application.analyses.lv_domain import projection_v1

        case_id = str(uuid4())
        set_enm(case_id, zbuduj_stacje_nn())
        url = f"/api/cases/{case_id}/enm/lv-domain/stn/projection/v1"
        wzorzec = app_client.get(url).json()

        prawdziwy_graf = projection_v1.build_lv_domain_view
        podmieniony = zbuduj_stacje_nn(transformatory=2, sprzeglo="closed")

        def _graf_z_zapisem_wspolbieznym(model, station_ref):
            set_enm(case_id, podmieniony)
            return prawdziwy_graf(model, station_ref)

        monkeypatch.setattr(projection_v1, "build_lv_domain_view", _graf_z_zapisem_wspolbieznym)
        body = app_client.get(url).json()

        assert body["model_snapshot"]["model_hash"] == wzorzec["model_snapshot"]["model_hash"]
        assert body["projection_hash"] == wzorzec["projection_hash"]
        assert [row["transformer_ref"] for row in body["swz_snapshot"]["transformers"]] == ["tr1"]
