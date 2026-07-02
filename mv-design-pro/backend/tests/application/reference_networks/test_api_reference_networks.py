"""FastAPI integration tests for reference_networks endpoints."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_list_endpoint_returns_all_networks() -> None:
    from api.main import app

    client = TestClient(app)
    response = client.get("/api/v1/reference-networks")
    assert response.status_code == 200
    networks = response.json()
    assert len(networks) == 12


def test_list_endpoint_includes_required_fields() -> None:
    from api.main import app

    client = TestClient(app)
    response = client.get("/api/v1/reference-networks")
    networks = response.json()
    for net in networks:
        assert "id" in net
        assert "name_pl" in net
        assert "source" in net
        assert "voltage_kv" in net
        assert "has_der" in net


def test_detail_endpoint_for_ieee_4bus() -> None:
    from api.main import app

    client = TestClient(app)
    response = client.get("/api/v1/reference-networks/ieee-4bus")
    assert response.status_code == 200
    detail = response.json()
    assert detail["id"] == "ieee-4bus"
    assert detail["bus_count"] == 4
    assert detail["has_pf_expected"] is True


def test_detail_endpoint_unknown_returns_404() -> None:
    from api.main import app

    client = TestClient(app)
    response = client.get("/api/v1/reference-networks/does-not-exist")
    assert response.status_code == 404


def test_run_endpoint_returns_result() -> None:
    from api.main import app

    client = TestClient(app)
    response = client.post("/api/v1/reference-networks/ieee-4bus/run?solver_kind=power_flow_newton")
    assert response.status_code == 200
    body = response.json()
    assert body["network_id"] == "ieee-4bus"
    assert body["success"] is True
    assert "buses" in body["result"]


def test_validate_endpoint_ieee_4bus_passes() -> None:
    """End-to-end validation: actual matches expected → PASS."""
    from api.main import app

    client = TestClient(app)
    response = client.post("/api/v1/reference-networks/ieee-4bus/validate")
    assert response.status_code == 200
    body = response.json()
    report = body["report"]
    assert report["network_id"] == "ieee-4bus"
    assert report["overall_status"] == "PASS"
    assert report["pf_pass_count"] >= 4  # 4 buses


def test_validate_endpoint_all_networks_pass() -> None:
    """All registered networks must return PASS with real solver outputs."""
    from api.main import app

    client = TestClient(app)
    for net_id in [
        "ieee-4bus",
        "ieee-9bus",
        "ieee-14bus",
        "ieee-39bus",
        "iec60909-example",
        "pandapower-iec60909-radial",
        "cigre-mv-14",
        "pp-simple-4bus",
        "oze-pv-bess",
        "ieee-13bus",
        "ieee-34bus",
        "cigre-lv-benchmark",
    ]:
        response = client.post(f"/api/v1/reference-networks/{net_id}/validate")
        assert response.status_code == 200, f"{net_id} validate failed: {response.text}"
        report = response.json()["report"]
        assert report["overall_status"] == "PASS", f"{net_id} validation FAIL: {report}"


def test_pandapower_iec60909_radial_uses_solver_trace_not_expected_copy() -> None:
    from api.main import app

    client = TestClient(app)
    response = client.post(
        "/api/v1/reference-networks/pandapower-iec60909-radial/run"
        "?solver_kind=short_circuit_iec60909"
    )
    assert response.status_code == 200
    body = response.json()
    sc = body["result"]["short_circuit"]["BUS-01__3F"]
    assert sc["ikss_a"] > 28_000.0
    assert sc["white_box_trace"]
    assert any(step.get("key") == "Zk" for step in sc["white_box_trace"])


def test_similarity_match_endpoint() -> None:
    from api.main import app

    client = TestClient(app)
    response = client.post(
        "/api/v1/reference-networks/similarity-match",
        json={
            "bus_count": 4,
            "branch_count": 4,
            "voltage_kv_levels": [132.0],
            "has_der": False,
            "is_unbalanced": False,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert "matches" in body
    # First match should be IEEE 4-bus (closest topology)
    assert body["matches"][0]["network_id"] == "ieee-4bus"
    assert body["matches"][0]["confidence_pct"] > 70.0


def test_nc_rfg_compliance_oze_network() -> None:
    from api.main import app

    client = TestClient(app)
    response = client.get("/api/v1/reference-networks/oze-pv-bess/nc-rfg-compliance")
    assert response.status_code == 200
    body = response.json()
    assert body["applicable"] is True
    assert body["status"] == "compliant"


def test_nc_rfg_compliance_non_oze_network() -> None:
    from api.main import app

    client = TestClient(app)
    response = client.get("/api/v1/reference-networks/ieee-4bus/nc-rfg-compliance")
    assert response.status_code == 200
    body = response.json()
    assert body["applicable"] is False
    assert body["status"] == "not_applicable"
