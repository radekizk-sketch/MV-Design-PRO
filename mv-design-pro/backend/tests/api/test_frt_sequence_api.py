"""Testy końcówki API sekwencji zapadów FRT (D9).

GET /api/oze-analysis/frt-sequence?der_ref=&operator_id=&sekwencja= (+ opcjonalne
run_id, bus_ref) — widok sekwencji zapadów LVRT z werdyktem koniunkcji oraz kontekstem
siły sieci; determinizm i błędy 404/422 w konwencji rodziny.
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from enm.canonical_analysis import create_run, execute_run, reset_canonical_runs
from enm.models import GenLimits
from enm.store import reset_enm_store, set_enm

from tests.cgmes.golden_enm import build_golden_enm

SEQ = "/api/oze-analysis/frt-sequence"
_DER_REF = "conv-pv-card-sungrow-sg3150u-mv"  # istniejący typ katalogowy przekształtnika
_SEKWENCJA_OK = "0.30:0.15,0.40:0.20"


@pytest.fixture(autouse=True)
def _reset() -> None:
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _augmented_enm():
    enm = build_golden_enm()
    gens = list(enm.generators)
    gens[1] = gens[1].model_copy(
        update={
            "limits": GenLimits(q_min_mvar=-0.9, q_max_mvar=0.9),
            "materialized_params": {"sn_mva": 2.75},
        }
    )
    return enm.model_copy(update={"generators": gens})


def _sc_run_id():
    set_enm("c-sc", _augmented_enm())
    return execute_run(
        create_run(case_id="c-sc", klucz_twin="c-sc", analysis_type="short_circuit_sn").id
    ).id


# --------------------------------------------------------------------------
# Widok i determinizm
# --------------------------------------------------------------------------


def test_sequence_endpoint_returns_view(app_client) -> None:
    resp = app_client.get(
        SEQ, params={"der_ref": _DER_REF, "operator_id": "pse", "sekwencja": _SEKWENCJA_OK}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["modul_der"]["id"] == _DER_REF
    assert data["liczba_zapadow"] == 2
    assert len(data["zapady"]) == 2
    assert data["werdykt_sekwencji_pl"]
    assert data["input_hash"]
    assert data["kontekst_sily_sieci"] is None


def test_sequence_endpoint_is_deterministic(app_client) -> None:
    params = {"der_ref": _DER_REF, "operator_id": "pse", "sekwencja": _SEKWENCJA_OK}
    first = app_client.get(SEQ, params=params).json()
    second = app_client.get(SEQ, params=params).json()
    assert first == second


def test_sequence_endpoint_conjunction_failing_dip(app_client) -> None:
    resp = app_client.get(
        SEQ,
        params={"der_ref": _DER_REF, "operator_id": "pse", "sekwencja": "0.30:0.15,0.02:0.20"},
    )
    assert resp.status_code == 200
    assert resp.json()["werdykt_sekwencji_pl"] == "sekwencja niezaliczona — zapad 2"


# --------------------------------------------------------------------------
# Błędy 404 / 422
# --------------------------------------------------------------------------


def test_sequence_unknown_der_returns_404(app_client) -> None:
    resp = app_client.get(
        SEQ, params={"der_ref": "nie-ma-takiego", "operator_id": "pse", "sekwencja": _SEKWENCJA_OK}
    )
    assert resp.status_code == 404
    assert "nie istnieje" in resp.json()["detail"]


def test_sequence_unknown_operator_returns_404(app_client) -> None:
    resp = app_client.get(
        SEQ, params={"der_ref": _DER_REF, "operator_id": "nieznany", "sekwencja": _SEKWENCJA_OK}
    )
    assert resp.status_code == 404
    assert "nie istnieje" in resp.json()["detail"]


def test_sequence_bad_format_returns_422(app_client) -> None:
    resp = app_client.get(
        SEQ, params={"der_ref": _DER_REF, "operator_id": "pse", "sekwencja": "abc"}
    )
    assert resp.status_code == 422
    assert "Zły format sekwencji" in resp.json()["detail"]


def test_sequence_depth_out_of_range_returns_422(app_client) -> None:
    resp = app_client.get(
        SEQ, params={"der_ref": _DER_REF, "operator_id": "pse", "sekwencja": "1.5:0.15"}
    )
    assert resp.status_code == 422
    assert "poza zakresem 0..1" in resp.json()["detail"]


def test_sequence_empty_returns_422(app_client) -> None:
    resp = app_client.get(SEQ, params={"der_ref": _DER_REF, "operator_id": "pse", "sekwencja": ""})
    assert resp.status_code == 422
    assert "pusta" in resp.json()["detail"]


# --------------------------------------------------------------------------
# Kontekst siły sieci (SCR/WSCR)
# --------------------------------------------------------------------------


def test_sequence_grid_strength_context_attached(app_client) -> None:
    run_id = _sc_run_id()
    resp = app_client.get(
        SEQ,
        params={
            "der_ref": _DER_REF,
            "operator_id": "pse",
            "sekwencja": _SEKWENCJA_OK,
            "run_id": str(run_id),
            "bus_ref": "bus_nn",
        },
    )
    assert resp.status_code == 200
    kontekst = resp.json()["kontekst_sily_sieci"]
    assert kontekst is not None
    assert kontekst["bus_ref"] == "bus_nn"
    assert kontekst["scr"] is not None


def test_sequence_context_requires_both_params_returns_422(app_client) -> None:
    run_id = _sc_run_id()
    resp = app_client.get(
        SEQ,
        params={
            "der_ref": _DER_REF,
            "operator_id": "pse",
            "sekwencja": _SEKWENCJA_OK,
            "run_id": str(run_id),
        },
    )
    assert resp.status_code == 422
    assert "run_id oraz bus_ref" in resp.json()["detail"]


def test_sequence_unknown_bus_ref_returns_422(app_client) -> None:
    run_id = _sc_run_id()
    resp = app_client.get(
        SEQ,
        params={
            "der_ref": _DER_REF,
            "operator_id": "pse",
            "sekwencja": _SEKWENCJA_OK,
            "run_id": str(run_id),
            "bus_ref": "nie-ma-takiego-wezla",
        },
    )
    assert resp.status_code == 422
    assert "nie występuje" in resp.json()["detail"]


def test_sequence_unknown_run_returns_404(app_client) -> None:
    resp = app_client.get(
        SEQ,
        params={
            "der_ref": _DER_REF,
            "operator_id": "pse",
            "sekwencja": _SEKWENCJA_OK,
            "run_id": str(uuid4()),
            "bus_ref": "bus_nn",
        },
    )
    assert resp.status_code == 404
    assert "nie istnieje" in resp.json()["detail"]
