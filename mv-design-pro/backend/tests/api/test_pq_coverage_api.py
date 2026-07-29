"""Testy końcówki API pokrycia P-Q (D4).

GET /api/oze-analysis/pq-coverage?catalog_item_id=&operator_id= — widok pokrycia,
determinizm oraz błędy 404 (nieznany typ / operator) i 422 (typ bez krzywej).
"""

from __future__ import annotations

from network_model.catalog.repository import get_default_mv_catalog

PQ_COVERAGE = "/api/oze-analysis/pq-coverage"
_REF_ID = "conv-pv-card-sungrow-sg3150u-mv"  # rekord z krzywa producenta


def _converter_id_without_curve() -> str:
    for c in get_default_mv_catalog().list_converter_types():
        if c.pq_curve is None:
            return c.id
    raise AssertionError("Brak typu bez krzywej P-Q w katalogu testowym.")


def test_pq_coverage_endpoint_returns_view(app_client) -> None:
    resp = app_client.get(PQ_COVERAGE, params={"catalog_item_id": _REF_ID, "operator_id": "pge"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["typ_katalogowy"]["id"] == _REF_ID
    assert data["operator"]["id"] == "pge"
    assert "werdykt" in data and "pokryty" in data["werdykt"]
    assert data["punkty"] and "margines_mvar" in data["punkty"][0]
    assert data["slad_whitebox"]["wzor"]


def test_pq_coverage_endpoint_is_deterministic(app_client) -> None:
    params = {"catalog_item_id": _REF_ID, "operator_id": "pge"}
    first = app_client.get(PQ_COVERAGE, params=params).json()
    second = app_client.get(PQ_COVERAGE, params=params).json()
    assert first == second


def test_pq_coverage_unknown_type_returns_404(app_client) -> None:
    resp = app_client.get(
        PQ_COVERAGE, params={"catalog_item_id": "nie-ma-takiego", "operator_id": "pge"}
    )
    assert resp.status_code == 404
    assert "nie istnieje" in resp.json()["detail"]


def test_pq_coverage_unknown_operator_returns_404(app_client) -> None:
    resp = app_client.get(
        PQ_COVERAGE, params={"catalog_item_id": _REF_ID, "operator_id": "nieznany"}
    )
    assert resp.status_code == 404
    assert "nie istnieje" in resp.json()["detail"]


def test_pq_coverage_type_without_curve_returns_422(app_client) -> None:
    resp = app_client.get(
        PQ_COVERAGE,
        params={"catalog_item_id": _converter_id_without_curve(), "operator_id": "pge"},
    )
    assert resp.status_code == 422
    assert "nie ma krzywej producenta" in resp.json()["detail"]
