"""Testy końcówki API trajektorii FRT/HVRT (D6).

GET /api/oze-analysis/frt-trajectories?der_ref=&operator_id=&test_kind= —
widok trajektorii + obwiednia profilu operatora, determinizm oraz błędy 404
(nieznany DER / operator) i 422 (zły test_kind).
"""

from __future__ import annotations

FRT = "/api/oze-analysis/frt-trajectories"
_DER_REF = "conv-pv-card-sungrow-sg3150u-mv"  # istniejący typ katalogowy przekształtnika


def test_frt_endpoint_returns_view(app_client) -> None:
    resp = app_client.get(
        FRT, params={"der_ref": _DER_REF, "operator_id": "pse", "test_kind": "lvrt"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["modul_der"]["id"] == _DER_REF
    assert data["operator"]["id"] == "pse"
    assert data["test_kind"] == "lvrt"
    assert data["obwiednia_profilu"]["punkty"]
    assert data["scenariusze"]
    sc = data["scenariusze"][0]
    assert sc["trajektoria"]
    assert sc["werdykt_pl"]


def test_frt_endpoint_hvrt_variant(app_client) -> None:
    resp = app_client.get(
        FRT, params={"der_ref": _DER_REF, "operator_id": "pse", "test_kind": "hvrt"}
    )
    assert resp.status_code == 200
    assert resp.json()["obwiednia_profilu"]["rodzaj"] == "hvrt"


def test_frt_endpoint_is_deterministic(app_client) -> None:
    params = {"der_ref": _DER_REF, "operator_id": "pse", "test_kind": "lvrt"}
    first = app_client.get(FRT, params=params).json()
    second = app_client.get(FRT, params=params).json()
    assert first == second


def test_frt_unknown_der_returns_404(app_client) -> None:
    resp = app_client.get(
        FRT, params={"der_ref": "nie-ma-takiego", "operator_id": "pse", "test_kind": "lvrt"}
    )
    assert resp.status_code == 404
    assert "nie istnieje" in resp.json()["detail"]


def test_frt_unknown_operator_returns_404(app_client) -> None:
    resp = app_client.get(
        FRT, params={"der_ref": _DER_REF, "operator_id": "nieznany", "test_kind": "lvrt"}
    )
    assert resp.status_code == 404
    assert "nie istnieje" in resp.json()["detail"]


def test_frt_bad_test_kind_returns_422(app_client) -> None:
    resp = app_client.get(
        FRT, params={"der_ref": _DER_REF, "operator_id": "pse", "test_kind": "xyz"}
    )
    assert resp.status_code == 422
    assert "Nieznany rodzaj testu" in resp.json()["detail"]
