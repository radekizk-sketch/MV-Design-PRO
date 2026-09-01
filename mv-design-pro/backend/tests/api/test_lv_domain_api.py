"""Kontrakt endpointów `GET /api/cases/{case_id}/enm/lv-domain/{station_ref}`
i `.../upstream-equivalent` (karta T5b, docs/nn/KONCEPCJA_LOD_NN_2026-08.md).
"""

from __future__ import annotations

from uuid import uuid4

from enm.models import (
    Bus,
    EnergyNetworkModel,
    ENMDefaults,
    ENMHeader,
    Source,
    Substation,
    Transformer,
)
from enm.store import set_enm


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
        assert body["contract_version"] == "1.0.0"
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
        assert first["swz_snapshot"]["feeders"] == []

    def test_unknown_run_is_not_silently_replaced(self, app_client) -> None:
        case_id = str(uuid4())
        _seed_enm(case_id)

        resp = app_client.get(
            f"/api/cases/{case_id}/enm/lv-domain/stn/projection/v1",
            params={"run_id": str(uuid4())},
        )

        assert resp.status_code == 404
