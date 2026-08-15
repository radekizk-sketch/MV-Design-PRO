"""
Kompozycja raportu wystawiona po HTTP (KD-4, luka L-15).

DLACZEGO TEN TEST ISTNIEJE. `build_analysis_run_report_payload` przyjmowal
`report_options` (profil, poziom szczegolowosci, zakres, sekcje, tabela wiodaca)
od dawna, ale zaden endpoint eksportu ich NIE WYSTAWIAL. Generator raportu w
powloce mial wiec do wyboru: kontrolki bez pokrycia w backendzie (phantom) albo
brak kompozycji. Te testy pilnuja, ze parametry sa realnie honorowane ORAZ ze
brak parametrow daje bajtowo dzisiejsza odpowiedz (zero regresu, determinizm).
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from enm.canonical_analysis import CanonicalRun


def _build_sc_run() -> CanonicalRun:
    return CanonicalRun(
        id=uuid4(),
        case_id="case-sc-opts",
        project_id="project-opts-1",
        analysis_type="short_circuit_sn",
        status="FINISHED",
        created_at=datetime.now(UTC),
        snapshot_hash="snapshot-sc",
        input_hash="hash-sc",
        snapshot={"buses": [{"ref_id": "bus-2"}]},
        validation={},
        readiness={},
        result_status="VALID",
        raw_result={
            "analysis_type": "short_circuit_3f",
            "short_circuit_type": "3F",
            "reporting_status": "reportable",
            "proof_status": "complete",
            "proof_engine_version": "white_box_trace_v1",
            "results": [
                {
                    "fault_node_id": "bus-2",
                    "ikss_a": 4500.0,
                    "ip_a": 9200.0,
                    "ith_a": 4700.0,
                    "sk_mva": 125.0,
                    "short_circuit_type": "3F",
                    "analysis_type": "short_circuit_3f",
                    "reporting_status": "reportable",
                    "proof_status": "complete",
                    "proof_ref": "proof:short-circuit:bus-2",
                    "reporting_limitations": [],
                }
            ],
            "graph": {"nodes": {"bus-2": {"name": "Szyna 2", "element_id": "bus-2"}}},
        },
        white_box_trace=[
            {
                "step": 1,
                "title": "Krok SC",
                "result": {"ikss_a": {"value": 4500.0, "unit": "A"}},
                "proof_ref": "proof:short-circuit:bus-2",
                "proof_status": "complete",
            }
        ],
    )


@pytest.fixture()
def _run(monkeypatch) -> CanonicalRun:
    from api import analysis_runs as analysis_runs_api

    run = _build_sc_run()
    monkeypatch.setattr(analysis_runs_api, "_require_canonical_run", lambda _run_id: run)
    return run


def test_report_json_bez_parametrow_zachowuje_dzisiejsze_domyslne(app_client, _run) -> None:
    """Brak parametrow = `normalize_report_options()` bez argumentow (zero regresu)."""
    response = app_client.get(f"/api/analysis-runs/{_run.id}/export/report/json")

    assert response.status_code == 200
    payload = json.loads(response.content)
    assert payload["report_options"]["profile"] == "osd"
    assert payload["report_options"]["detail_level"] == "standardowy"
    assert payload["report_options"]["scope"] == "whole_run"
    assert payload["report_options"]["sections"] == ["summary", "results", "catalog"]
    assert payload["report_options"]["focus_table"] is None
    # Poziom standardowy NIE zawiera wywodu szczegolowego.
    assert "trace" not in payload


def test_report_json_honoruje_profil_poziom_i_sekcje(app_client, _run) -> None:
    response = app_client.get(
        f"/api/analysis-runs/{_run.id}/export/report/json"
        "?profile=audytowy&detail_level=pelny&scope=active_table"
        "&focus_table=short_circuit&sections=summary&sections=trace"
    )

    assert response.status_code == 200
    payload = json.loads(response.content)
    options = payload["report_options"]
    assert options["profile"] == "audytowy"
    assert options["profile_label"] == "Audytowy"
    assert options["detail_level"] == "pelny"
    assert options["scope"] == "active_table"
    assert options["focus_table"] == "short_circuit"
    # Jawnie wybrane sekcje wygrywaja z domyslnymi poziomu.
    assert options["sections"] == ["summary", "trace"]
    # Sekcja wybrana => obecna; sekcja niewybrana => NIEOBECNA (realny wplyw).
    assert "trace" in payload
    assert "catalog_context" not in payload


def test_report_json_odrzuca_wartosci_spoza_kontraktu_do_domyslnych(app_client, _run) -> None:
    """Literowka w linku nie wywraca eksportu — normalizator sprowadza do domyslnych."""
    response = app_client.get(
        f"/api/analysis-runs/{_run.id}/export/report/json?profile=nieistniejacy&detail_level=xx"
    )

    assert response.status_code == 200
    payload = json.loads(response.content)
    assert payload["report_options"]["profile"] == "osd"
    assert payload["report_options"]["detail_level"] == "standardowy"


def test_report_pdf_i_docx_przyjmuja_te_same_parametry(app_client, _run) -> None:
    pdf = app_client.get(
        f"/api/analysis-runs/{_run.id}/export/report/pdf?detail_level=pelny&profile=wykonawczy"
    )
    assert pdf.status_code == 200
    assert bytes(pdf.content).startswith(b"%PDF")

    docx = app_client.get(f"/api/analysis-runs/{_run.id}/export/report/docx?detail_level=minimalny")
    assert docx.status_code == 200
    assert len(docx.content) > 0
