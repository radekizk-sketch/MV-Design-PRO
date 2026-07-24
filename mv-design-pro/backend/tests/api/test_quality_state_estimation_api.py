"""Testy końcówek API estymacji stanu WLS (faza 1 — ekspozycja backendowa).

Kontrakt: gotowy przebieg rozpływu → widok estymacji (|V|/kąt/χ²), determinizm,
404 (brak przebiegu), 422 (zły rodzaj analizy / brak pomiarów), uczciwa detekcja
złych danych (gross error). Pomiary budowane są z Y-bus golden sieci na płaskim,
samospójnym stanie — realna ścieżka endpointu (bez fabrykacji po stronie produktu).
"""

from __future__ import annotations

from typing import Any
from uuid import uuid4

import numpy as np
import pytest
from enm.canonical_analysis import create_run, execute_run, get_run, reset_canonical_runs
from enm.mapping import map_enm_to_network_graph
from enm.models import EnergyNetworkModel
from enm.store import reset_enm_store, set_enm
from network_model.core.node import NodeType
from network_model.solvers.state_estimation_wls import (
    _h_injection_p,
    _h_injection_q,
    ybus_from_network_graph,
)

from tests.cgmes.golden_enm import build_golden_enm

STATE_ESTIMATION = "/api/quality/state-estimation"
REQUIREMENTS = "/api/quality/state-estimation/requirements"


@pytest.fixture(autouse=True)
def _reset() -> None:
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _pf_run_id():
    set_enm("c-pf", build_golden_enm())
    return execute_run(create_run(case_id="c-pf", analysis_type="PF").id).id


def _sc_run_id():
    set_enm("c-sc", build_golden_enm())
    return execute_run(create_run(case_id="c-sc", analysis_type="short_circuit_sn").id).id


def _flat_measurements(run_id) -> list[dict[str, Any]]:
    """Zestaw pomiarów samospójny z płaskim stanem (V=1.0 pu, θ=0) dla Y-bus przebiegu.

    |V| na wszystkich węzłach + P,Q iniekcji na węzłach nie-slack ⇒ obserwowalny.
    Wartości P/Q liczone funkcjami pomiarowymi solvera przy płaskim stanie, więc
    estymator odtwarza płaski stan dokładnie (rezydua ≈ 0).
    """
    run = get_run(run_id)
    graph = map_enm_to_network_graph(EnergyNetworkModel.model_validate(run.snapshot))
    slack = sorted(nid for nid, n in graph.nodes.items() if n.node_type == NodeType.SLACK)[0]
    ybus, idx = ybus_from_network_graph(graph, 100.0, slack)
    n = ybus.shape[0]
    theta = np.zeros(n)
    v = np.ones(n)
    g = ybus.real
    b = ybus.imag
    slack_index = idx[slack]
    out: list[dict[str, Any]] = []
    for node_id in idx:
        out.append({"meas_type": "V_MAGNITUDE", "bus_ref": node_id, "value": 1.0, "sigma": 0.004})
    for node_id, i in idx.items():
        if i == slack_index:
            continue
        out.append(
            {
                "meas_type": "P_INJECTION",
                "bus_ref": node_id,
                "value": _h_injection_p(g, b, v, theta, i),
                "sigma": 0.008,
            }
        )
        out.append(
            {
                "meas_type": "Q_INJECTION",
                "bus_ref": node_id,
                "value": _h_injection_q(g, b, v, theta, i),
                "sigma": 0.008,
            }
        )
    return out


# --------------------------------------------------------------------------
# Wymagane wejścia (mapa węzeł→indeks)
# --------------------------------------------------------------------------


def test_requirements_endpoint_returns_node_index_map(app_client) -> None:
    run_id = _pf_run_id()
    resp = app_client.get(REQUIREMENTS, params={"run_id": str(run_id)})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["analysis_id"] == str(run_id)
    assert data["n_buses"] == len(data["buses"])
    assert data["n_states"] == (data["n_buses"] - 1) + data["n_buses"]
    assert data["min_measurements"] == data["n_states"]
    slack_rows = [b for b in data["buses"] if b["is_slack"]]
    assert len(slack_rows) == 1
    assert slack_rows[0]["bus_ref"] == data["slack_bus_ref"]
    assert {"V_MAGNITUDE", "P_INJECTION", "P_FLOW"} <= {
        t["code"] for t in data["measurement_types"]
    }


def test_requirements_wrong_analysis_type_returns_422(app_client) -> None:
    run_id = _sc_run_id()
    resp = app_client.get(REQUIREMENTS, params={"run_id": str(run_id)})
    assert resp.status_code == 422
    assert "rozpływu mocy" in resp.json()["detail"]


def test_requirements_unknown_run_returns_404(app_client) -> None:
    resp = app_client.get(REQUIREMENTS, params={"run_id": str(uuid4())})
    assert resp.status_code == 404


# --------------------------------------------------------------------------
# Estymacja stanu WLS
# --------------------------------------------------------------------------


def test_state_estimation_returns_view(app_client) -> None:
    run_id = _pf_run_id()
    body = {"run_id": str(run_id), "pomiary": _flat_measurements(run_id)}
    resp = app_client.post(STATE_ESTIMATION, json=body)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["analysis_id"] == str(run_id)
    assert data["converged"] is True
    assert data["status"] == "OK"
    # Estymowany stan per węzeł: |V|/kąt.
    assert len(data["buses"]) == 6
    for bus in data["buses"]:
        assert 0.99 <= bus["v_magnitude_pu"] <= 1.01
        assert "v_angle_deg" in bus and "v_angle_rad" in bus
    # χ² i stopnie swobody obecne (audytowalność).
    assert data["objective_j"] < 1e-6
    assert data["degrees_of_freedom"] == data["m_measurements"] - data["n_states"]
    assert data["bad_data"]["chi_square_flag"] is False
    # WHITE BOX: ślad iteracji z Jacobianem H i macierzą zysku G.
    assert data["white_box"]
    assert "h_jacobian" in data["white_box"][0]
    assert "gain_matrix_g" in data["white_box"][0]
    # Jawny znacznik SYNTETYCZNEJ walidacji (nie mylić z SCADA/PMU).
    assert "SYNTETYCZNY" in data["validation_status"]


def test_state_estimation_residual_present_without_trace(app_client) -> None:
    """Rezyduum r per pomiar obecne BEZ śladu WHITE BOX (WLS-S1/S2).

    Kolumna „Rezyduum r" nie może zależeć od włączenia śladu — pochodzi z pola
    wyniku ``final_residuals`` (ten sam wektor co znormalizowane rezydua bad_data).
    """
    run_id = _pf_run_id()
    body = {
        "run_id": str(run_id),
        "pomiary": _flat_measurements(run_id),
        "include_trace": False,
    }
    resp = app_client.post(STATE_ESTIMATION, json=body)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert not data.get("white_box"), "Ślad wyłączony (include_trace=False)"
    # Mimo braku śladu każdy pomiar ma liczbowe rezyduum r (nie None).
    assert data["measurements"]
    for m in data["measurements"]:
        assert m["residual"] is not None
        assert isinstance(m["residual"], int | float)
        assert m["normalized_residual"] is not None


def test_state_estimation_is_deterministic(app_client) -> None:
    run_id = _pf_run_id()
    body = {"run_id": str(run_id), "pomiary": _flat_measurements(run_id)}
    first = app_client.post(STATE_ESTIMATION, json=body).json()
    second = app_client.post(STATE_ESTIMATION, json=body).json()
    assert first == second
    assert first["estimate_id"] == second["estimate_id"]


def test_state_estimation_detects_gross_error(app_client) -> None:
    run_id = _pf_run_id()
    pomiary = _flat_measurements(run_id)
    # Wstrzyknij gross error do pierwszego pomiaru |V| (1.0 → 1.05, ~12.5σ).
    # Uwaga: znormalizowana rezydua "rozmywa się" na pomiary dźwigniowe (efekt
    # smearing WLS), więc nie zakładamy, że podejrzany = wstrzyknięty pomiar.
    pomiary[0] = {**pomiary[0], "value": 1.05}
    resp = app_client.post(STATE_ESTIMATION, json={"run_id": str(run_id), "pomiary": pomiary})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    bad = data["bad_data"]
    assert bad["chi_square_flag"] is True
    assert bad["lnr_flag"] is True
    assert bad["lnr_measurement"] is not None
    # Podejrzany pomiar oznaczony w tabeli pomiarów.
    suspects = [m for m in data["measurements"] if m["suspect"]]
    assert len(suspects) == 1


def test_state_estimation_no_measurements_returns_422(app_client) -> None:
    run_id = _pf_run_id()
    resp = app_client.post(STATE_ESTIMATION, json={"run_id": str(run_id), "pomiary": []})
    assert resp.status_code == 422
    assert "Brak pomiarów" in resp.json()["detail"]


def test_state_estimation_underdetermined_returns_422(app_client) -> None:
    run_id = _pf_run_id()
    # Tylko jeden pomiar |V| — m < n ⇒ nieobserwowalny.
    pomiary = _flat_measurements(run_id)[:1]
    resp = app_client.post(STATE_ESTIMATION, json={"run_id": str(run_id), "pomiary": pomiary})
    assert resp.status_code == 422
    assert "niedookreślony" in resp.json()["detail"] or "obserwowaln" in resp.json()["detail"]


def test_state_estimation_unknown_bus_ref_returns_422(app_client) -> None:
    run_id = _pf_run_id()
    pomiary = [
        {"meas_type": "V_MAGNITUDE", "bus_ref": "nieistniejacy", "value": 1.0, "sigma": 0.01}
    ]
    resp = app_client.post(STATE_ESTIMATION, json={"run_id": str(run_id), "pomiary": pomiary})
    assert resp.status_code == 422
    assert "nieistniejącego węzła" in resp.json()["detail"]


def test_state_estimation_wrong_analysis_type_returns_422(app_client) -> None:
    run_id = _sc_run_id()
    resp = app_client.post(STATE_ESTIMATION, json={"run_id": str(run_id), "pomiary": []})
    assert resp.status_code == 422
    assert "rozpływu mocy" in resp.json()["detail"]


def test_state_estimation_unknown_run_returns_404(app_client) -> None:
    resp = app_client.post(STATE_ESTIMATION, json={"run_id": str(uuid4()), "pomiary": []})
    assert resp.status_code == 404
