"""Testy końcówki API pokrycia P-Q (D4).

GET /api/oze-analysis/pq-coverage?catalog_item_id=&operator_id= — widok pokrycia z rekordem
``ocena`` (``OcenaKryterium``, odbiór Pakietu C — plan AB O-50), determinizm, błędy 404
(nieznany typ / operator) i rekord ``NIE_OCENIONO`` dla typu bez krzywej producenta.
"""

from __future__ import annotations

from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.types import ConverterKind
from werdykt import OcenaKryterium

PQ_COVERAGE = "/api/oze-analysis/pq-coverage"
_REF_ID = "conv-pv-card-sungrow-sg3150u-mv"  # rekord z krzywa producenta


def _converter_id_without_curve(kind: ConverterKind) -> str:
    for c in get_default_mv_catalog().list_converter_types():
        if c.pq_curve is None and c.kind is kind:
            return c.id
    raise AssertionError(f"Brak typu {kind.value} bez krzywej P-Q w katalogu testowym.")


def test_pq_coverage_endpoint_returns_view(app_client) -> None:
    resp = app_client.get(PQ_COVERAGE, params={"catalog_item_id": _REF_ID, "operator_id": "pge"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["typ_katalogowy"]["id"] == _REF_ID
    assert data["operator"]["id"] == "pge"
    assert "werdykt" not in data
    ocena = OcenaKryterium.model_validate(data["ocena"])
    assert ocena.przedmiot.element_ref == _REF_ID
    assert ocena.wynik is not None and ocena.wynik.wartosc.jednostka == "Mvar"
    assert ocena.wyjasnienie.zdanie_pl
    assert data["punkty"] and "margines_mvar" in data["punkty"][0]
    assert "pokryty" not in data["punkty"][0] and "uwaga" not in data["punkty"][0]
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


def test_pq_coverage_type_without_curve_is_record_nie_oceniono(app_client) -> None:
    """Typ PV bez krzywej producenta: 200 z rekordem NIE_OCENIONO i nazwanym brakiem (pole
    ``pq_curve``) — brak danej nie jest błędem końcówki ani krzywą typową."""
    resp = app_client.get(
        PQ_COVERAGE,
        params={
            "catalog_item_id": _converter_id_without_curve(ConverterKind.PV),
            "operator_id": "pge",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    ocena = OcenaKryterium.model_validate(data["ocena"])
    assert data["punkty"] == []
    assert ocena.wynik is None
    assert ocena.status_maszynowy == "NIE_OCENIONO"
    assert any("pq_curve" in b for b in ocena.wyjasnienie.czego_brakuje)


def test_pq_coverage_magazyn_poza_rozporzadzeniem_nie_dotyczy(app_client) -> None:
    """Magazyn energii: wymaganie zakresu Q z profilu (podstawa z rozporządzenia albo
    nieustalona) nie dotyczy — art. 3 ust. 2 lit. d rozporządzenia 2016/631 (plan AB O-28)."""
    resp = app_client.get(
        PQ_COVERAGE,
        params={
            "catalog_item_id": _converter_id_without_curve(ConverterKind.BESS),
            "operator_id": "pge",
        },
    )
    assert resp.status_code == 200
    ocena = OcenaKryterium.model_validate(resp.json()["ocena"])
    assert ocena.status_maszynowy == "NIE_DOTYCZY"
    assert "art. 3 ust. 2 lit. d" in ocena.stosowalnosc.powod_pl
