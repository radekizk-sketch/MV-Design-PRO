"""Testy końcówki uruchomieniowej V12.6 dla analizy ``opf_loss_lcc``.

Karta FAB-D2 (D2). Solver `_opf_loss_lcc`
(`network_model/solvers/v126_academic.py`) sumuje straty jałowe transformatorów
wprost (`p0_kw + pk_kw*0.45**2`), więc nie przeżyje transformatora bez p0_kw —
a taki transformator jest DZIŚ danym stanem legalnym (ENM `Transformer.p0_kw`
jest `float | None`, katalog może go nie nieść — IEC 60909 tego pola nie
wymaga). Solver jest FROZEN (B-01, nie edytujemy go z tej karty), więc konsument
poprawny to warstwa API: odmowa PRZED wejściem do solvera, kodem gotowości
`transformer.loss_data_missing` (reużytym z `equipment_checks/transformer_losses.py`,
Reużycie zamiast duplikacji), a nie cichy crash ani ciche 0.0.

Predykaty parami: brak p0_kw blokuje TYLKO `opf_loss_lcc` (test 1); ten sam brak
NIE blokuje innej analizy V12.6, która p0_kw nie czyta (test 3) — bramka nie jest
szersza niż potrzeba. Dana jawna (nawet 0.0) przechodzi bez zastrzeżeń (test 2).
"""

from __future__ import annotations

from uuid import UUID

from api.main import app
from enm.models import EnergyNetworkModel, ENMHeader
from enm.store import reset_enm_store, set_enm
from fastapi.testclient import TestClient

_SZYNA_A = "BUS_A"
_SZYNA_B = "BUS_B"


def _model(*, p0_kw: float | None) -> EnergyNetworkModel:
    transformator: dict = {
        "ref_id": "TR-1",
        "name": "Transformator",
        "hv_bus_ref": _SZYNA_A,
        "lv_bus_ref": _SZYNA_B,
        "sn_mva": 16.0,
        "uhv_kv": 110.0,
        "ulv_kv": 15.0,
        "uk_percent": 10.5,
        "pk_kw": 90.0,
    }
    if p0_kw is not None:
        transformator["p0_kw"] = p0_kw
    return EnergyNetworkModel.model_validate(
        {
            "header": ENMHeader(name="test-opf-loss-lcc").model_dump(),
            "buses": [
                {"ref_id": _SZYNA_A, "name": "Szyna A", "voltage_kv": 110.0},
                {"ref_id": _SZYNA_B, "name": "Szyna B", "voltage_kv": 15.0},
            ],
            "transformers": [transformator],
        }
    )


def _seed_case(case_id: UUID, model: EnergyNetworkModel) -> None:
    reset_enm_store()
    set_enm(str(case_id), model)


def test_opf_loss_lcc_bez_strat_jalowych_zwraca_422_nie_liczy_po_cichu() -> None:
    """PIN NA DEFEKT: przed naprawą brak p0_kw wchodziłby do solvera jako 0.0."""
    case_id = UUID("33333333-3333-3333-3333-333333333331")
    _seed_case(case_id, _model(p0_kw=None))
    client = TestClient(app)
    resp = client.post(
        f"/api/cases/{case_id}/runs/v126/opf_loss_lcc",
        json={"parameters": {}},
    )
    assert resp.status_code == 422, resp.text
    assert "transformer.loss_data_missing" in resp.text
    assert "TR-1" in resp.text


def test_opf_loss_lcc_ze_stratami_jalowymi_liczy_normalnie() -> None:
    """Kontrola dwustronna: strata jałowa jawna (nawet gdyby była 0.0) przechodzi."""
    case_id = UUID("33333333-3333-3333-3333-333333333332")
    _seed_case(case_id, _model(p0_kw=12.5))
    client = TestClient(app)
    resp = client.post(
        f"/api/cases/{case_id}/runs/v126/opf_loss_lcc",
        json={"parameters": {}},
    )
    assert resp.status_code == 200, resp.text
    result = client.get(resp.json()["result_url"])
    assert result.status_code == 200


def test_inna_analiza_v126_nie_jest_blokowana_brakiem_strat_jalowych() -> None:
    """Bramka jest WĄSKA: `reliability_contingency` nie czyta p0_kw transformatora,
    więc ten sam brak nie może jej zablokować (inaczej byłaby szersza niż trzeba)."""
    case_id = UUID("33333333-3333-3333-3333-333333333333")
    _seed_case(case_id, _model(p0_kw=None))
    client = TestClient(app)
    resp = client.post(
        f"/api/cases/{case_id}/runs/v126/reliability_contingency",
        json={"parameters": {}},
    )
    assert resp.status_code == 200, resp.text
