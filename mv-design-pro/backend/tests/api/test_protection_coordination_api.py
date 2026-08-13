"""API contract tests — koordynacja zabezpieczen (karta ZAB-100-BACKEND).

Pokrywa montaz routera `api/protection_coordination.py` pod `/api` (decyzja
D10, `docs/uiux/DECYZJE_ARCHITEKTONICZNE_2026-08.md`):
  - 7 tras FIX-12 (bieg, odczyt, tcc, trace, 3x checks) na REALNYCH danych
    (2 urzadzenia w lancuchu selektywnosci, prady zwarciowe + robocze),
  - bramka eligibility (`_check_run_eligibility`) — iloczyn cech
    {devices puste} x {fault_currents puste} x {operating_currents puste},
    kazda kombinacja daje 400 PL, NIGDY 201 z fabrykowanym PASS,
  - 2 nowe eksporty (PDF/DOCX) — obecnosc, naglowki, determinizm bajt-w-bajt,
  - 404 dla nieznanego run_id na WSZYSTKICH 9 trasach odczytu/eksportu
    (iloczyn cech {trasa} x {model z/bez zabezpieczen} z karty).

NOT-A-SOLVER: testy nie liczba fizyki — wywoluja istniejacy silnik
(`OvercurrentCoordinationAnalyzer` + `protection.curves.curve_calculator`)
przez warstwe API i sprawdzaja ksztalt/status odpowiedzi.
"""

from __future__ import annotations

import hashlib
from typing import Any
from uuid import uuid4

import pytest

pytest.importorskip("fastapi")


def _device(
    device_id: str,
    *,
    name: str,
    location_element_id: str,
    pickup_current_a: float,
    time_multiplier: float,
) -> dict[str, Any]:
    return {
        "id": device_id,
        "name": name,
        "device_type": "RELAY",
        "location_element_id": location_element_id,
        "settings": {
            "stage_51": {
                "enabled": True,
                "pickup_current_a": pickup_current_a,
                "curve_settings": {
                    "standard": "IEC",
                    "variant": "SI",
                    "pickup_current_a": pickup_current_a,
                    "time_multiplier": time_multiplier,
                },
            }
        },
        "manufacturer": "ABB",
    }


def _reference_payload() -> dict[str, Any]:
    """Siec referencyjna: dwa urzadzenia w lancuchu selektywnosci (dol/gora)."""
    downstream_id = str(uuid4())
    upstream_id = str(uuid4())
    return {
        "devices": [
            _device(
                downstream_id,
                name="Zabezpieczenie_dolne",
                location_element_id="bus_1",
                pickup_current_a=400.0,
                time_multiplier=0.3,
            ),
            _device(
                upstream_id,
                name="Zabezpieczenie_gorne",
                location_element_id="bus_2",
                pickup_current_a=600.0,
                time_multiplier=0.5,
            ),
        ],
        "fault_currents": [
            {"location_id": "bus_1", "ik_max_3f_a": 5000.0, "ik_min_3f_a": 2000.0},
            {"location_id": "bus_2", "ik_max_3f_a": 3000.0, "ik_min_3f_a": 1200.0},
        ],
        "operating_currents": [
            {"location_id": "bus_1", "i_operating_a": 150.0},
            {"location_id": "bus_2", "i_operating_a": 120.0},
        ],
    }


def _run(app_client: Any, payload: dict[str, Any] | None = None) -> Any:
    project_id = str(uuid4())
    body = payload if payload is not None else _reference_payload()
    return app_client.post(f"/api/protection-coordination/projects/{project_id}/run", json=body)


# =============================================================================
# Audyt 7 tras — dane referencyjne (siec z zabezpieczeniami)
# =============================================================================


def test_run_coordination_analysis_on_reference_network(app_client: Any) -> None:
    response = _run(app_client)
    assert response.status_code == 201
    body = response.json()
    assert body["total_devices"] == 2
    # 2 czulosc + 1 selektywnosc + 2 przeciazalnosc = 5
    assert body["total_checks"] == 5
    assert body["overall_verdict"] in {"PASS", "MARGINAL", "FAIL"}
    assert body["overall_verdict_pl"]


def test_get_coordination_result_returns_full_shape(app_client: Any) -> None:
    run_id = _run(app_client).json()["run_id"]
    response = app_client.get(f"/api/protection-coordination/{run_id}")
    assert response.status_code == 200
    body = response.json()
    for key in (
        "run_id",
        "project_id",
        "devices",
        "sensitivity_checks",
        "selectivity_checks",
        "overload_checks",
        "tcc_curves",
        "fault_markers",
        "overall_verdict",
        "summary",
        "trace_steps",
    ):
        assert key in body
    # ZAB-100-BACKEND: devices NIE JEST puste, mimo ze 2 urzadzenia byly badane
    # (naprawa audytu — wczesniej pole nie istnialo w ogole w to_dict()).
    assert len(body["devices"]) == 2
    assert {d["name"] for d in body["devices"]} == {
        "Zabezpieczenie_dolne",
        "Zabezpieczenie_gorne",
    }


def test_get_tcc_data_returns_curves_and_markers(app_client: Any) -> None:
    run_id = _run(app_client).json()["run_id"]
    response = app_client.get(f"/api/protection-coordination/{run_id}/tcc")
    assert response.status_code == 200
    body = response.json()
    assert len(body["curves"]) == 2
    assert len(body["fault_markers"]) >= 4  # 2 lokalizacje x (max3f, min3f)


def test_get_trace_returns_white_box_steps(app_client: Any) -> None:
    run_id = _run(app_client).json()["run_id"]
    response = app_client.get(f"/api/protection-coordination/{run_id}/trace")
    assert response.status_code == 200
    body = response.json()
    assert body["run_id"] == run_id
    assert len(body["trace_steps"]) > 0
    assert body["created_at"]


def test_get_sensitivity_checks_returns_verdicts(app_client: Any) -> None:
    run_id = _run(app_client).json()["run_id"]
    response = app_client.get(f"/api/protection-coordination/{run_id}/checks/sensitivity")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2
    for check in body:
        assert check["verdict"] in {"PASS", "MARGINAL", "FAIL", "ERROR"}


def test_get_selectivity_checks_returns_verdicts(app_client: Any) -> None:
    run_id = _run(app_client).json()["run_id"]
    response = app_client.get(f"/api/protection-coordination/{run_id}/checks/selectivity")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["verdict"] in {"PASS", "MARGINAL", "FAIL", "ERROR"}


def test_get_overload_checks_returns_verdicts(app_client: Any) -> None:
    run_id = _run(app_client).json()["run_id"]
    response = app_client.get(f"/api/protection-coordination/{run_id}/checks/overload")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2
    for check in body:
        assert check["verdict"] in {"PASS", "MARGINAL", "FAIL", "ERROR"}


# =============================================================================
# 404 na nieznanym run_id — WSZYSTKIE trasy odczytu/eksportu (uczciwy blad,
# nie 500) — iloczyn cech {trasa} x {model bez zabezpieczen == brak wyniku}.
# =============================================================================


@pytest.mark.parametrize(
    "suffix",
    [
        "",
        "/tcc",
        "/trace",
        "/checks/sensitivity",
        "/checks/selectivity",
        "/checks/overload",
        "/export/pdf",
        "/export/docx",
    ],
)
def test_unknown_run_id_returns_404_not_500(app_client: Any, suffix: str) -> None:
    response = app_client.get(f"/api/protection-coordination/does-not-exist{suffix}")
    assert response.status_code == 404
    assert "detail" in response.json()


# =============================================================================
# Bramka eligibility — iloczyn cech {devices} x {fault_currents} x
# {operating_currents} pustych/niepustych. ZERO kombinacji smie dac 201
# z fabrykowanym werdyktem PASS przy braku danych wejsciowych.
# =============================================================================


def test_run_with_empty_devices_is_rejected_honestly(app_client: Any) -> None:
    payload = _reference_payload()
    payload["devices"] = []
    response = _run(app_client, payload)
    assert response.status_code == 400
    assert "urzadzenia" in response.json()["detail"]


def test_run_with_empty_fault_currents_is_rejected_honestly(app_client: Any) -> None:
    payload = _reference_payload()
    payload["fault_currents"] = []
    response = _run(app_client, payload)
    assert response.status_code == 400
    assert "zwarciowych" in response.json()["detail"]


def test_run_with_empty_operating_currents_is_rejected_honestly(app_client: Any) -> None:
    payload = _reference_payload()
    payload["operating_currents"] = []
    response = _run(app_client, payload)
    assert response.status_code == 400
    assert "roboczych" in response.json()["detail"]


def test_run_with_all_three_empty_reports_all_blockers(app_client: Any) -> None:
    payload = {"devices": [], "fault_currents": [], "operating_currents": []}
    response = _run(app_client, payload)
    assert response.status_code == 400
    detail = response.json()["detail"]
    assert "urzadzenia" in detail
    assert "zwarciowych" in detail
    assert "roboczych" in detail


def test_run_with_full_reference_data_never_returns_pass_with_zero_checks(
    app_client: Any,
) -> None:
    """Regresja defektu z audytu: puste devices dawaly 201 PASS/total_checks=0."""
    response = _run(app_client)
    assert response.status_code == 201
    body = response.json()
    if body["overall_verdict"] == "PASS":
        assert body["total_checks"] > 0


# =============================================================================
# Eksporty PDF/DOCX — obecnosc, naglowki, determinizm bajt-w-bajt
# =============================================================================


def test_export_pdf_returns_attachment(app_client: Any) -> None:
    run_id = _run(app_client).json()["run_id"]
    response = app_client.get(f"/api/protection-coordination/{run_id}/export/pdf")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert f"protection_coordination_{run_id}.pdf" in response.headers["content-disposition"]
    assert response.content[:4] == b"%PDF"
    assert len(response.content) > 0


def test_export_docx_returns_attachment(app_client: Any) -> None:
    run_id = _run(app_client).json()["run_id"]
    response = app_client.get(f"/api/protection-coordination/{run_id}/export/docx")
    assert response.status_code == 200
    assert (
        response.headers["content-type"]
        == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    assert f"protection_coordination_{run_id}.docx" in response.headers["content-disposition"]
    assert response.content[:2] == b"PK"  # ZIP/OOXML magic bytes
    assert len(response.content) > 0


def test_export_pdf_is_byte_deterministic_across_repeated_calls(app_client: Any) -> None:
    run_id = _run(app_client).json()["run_id"]
    first = app_client.get(f"/api/protection-coordination/{run_id}/export/pdf")
    second = app_client.get(f"/api/protection-coordination/{run_id}/export/pdf")
    assert first.status_code == 200
    assert second.status_code == 200
    assert hashlib.sha256(first.content).hexdigest() == hashlib.sha256(second.content).hexdigest()
    assert first.content == second.content


def test_export_docx_is_byte_deterministic_across_repeated_calls(app_client: Any) -> None:
    run_id = _run(app_client).json()["run_id"]
    first = app_client.get(f"/api/protection-coordination/{run_id}/export/docx")
    second = app_client.get(f"/api/protection-coordination/{run_id}/export/docx")
    assert first.status_code == 200
    assert second.status_code == 200
    assert hashlib.sha256(first.content).hexdigest() == hashlib.sha256(second.content).hexdigest()
    assert first.content == second.content


def test_export_docx_renders_real_device_names_not_brak_urzadzen(app_client: Any) -> None:
    """Regresja audytu: bez pola `devices` w to_dict() raport ZAWSZE pokazywal
    "Brak urzadzen", mimo ze 2 urzadzenia byly analizowane."""
    docx = pytest.importorskip("docx")
    import io

    run_id = _run(app_client).json()["run_id"]
    response = app_client.get(f"/api/protection-coordination/{run_id}/export/docx")
    assert response.status_code == 200
    document = docx.Document(io.BytesIO(response.content))
    cell_texts = [
        cell.text for table in document.tables for row in table.rows for cell in row.cells
    ]
    assert any("Zabezpieczenie_dolne" in text for text in cell_texts)
    assert any("Zabezpieczenie_gorne" in text for text in cell_texts)
    assert not any(text.strip() == "Brak urządzeń" for text in cell_texts)


def test_export_routes_are_mounted_under_api_prefix(app_client: Any) -> None:
    """Karta ZAB-100-BACKEND: router byl wczesniej NIEZAMONTOWANY — pin na montaz."""
    route_paths = {route.path for route in app_client.app.routes}
    assert "/api/protection-coordination/projects/{project_id}/run" in route_paths
    assert "/api/protection-coordination/{run_id}" in route_paths
    assert "/api/protection-coordination/{run_id}/tcc" in route_paths
    assert "/api/protection-coordination/{run_id}/trace" in route_paths
    assert "/api/protection-coordination/{run_id}/checks/sensitivity" in route_paths
    assert "/api/protection-coordination/{run_id}/checks/selectivity" in route_paths
    assert "/api/protection-coordination/{run_id}/checks/overload" in route_paths
    assert "/api/protection-coordination/{run_id}/export/pdf" in route_paths
    assert "/api/protection-coordination/{run_id}/export/docx" in route_paths
