from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from enm.canonical_analysis import CanonicalRun


def _build_sc_run() -> CanonicalRun:
    return CanonicalRun(
        id=uuid4(),
        case_id="case-sc",
        project_id="project-doc-1",
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
            "analysis_type": "short_circuit_1f",
            "short_circuit_type": "1F",
            "reporting_status": "reportable",
            "proof_status": "complete",
            "proof_engine_version": "white_box_trace_v1",
            "results": [
                {
                    "fault_node_id": "bus-2",
                    "ikss_a": 4500.0,
                    "ip_a": 9200.0,
                    "ith_a": 4700.0,
                    "ib_a": 4100.0,
                    "ik_total_a": 4500.0,
                    "sk_mva": 125.0,
                    "short_circuit_type": "1F",
                    "analysis_type": "short_circuit_1f",
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
                "reporting_status": "reportable",
                "method_basis": "IEC_60909",
            }
        ],
    )


@pytest.fixture()
def _isolated_store(tmp_path, monkeypatch):
    """Izoluj magazyn dokumentow do wlasnej bazy SQLite (per test)."""
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{tmp_path}/store.db")
    yield


def test_capture_report_json_then_list_and_download(
    app_client, monkeypatch, _isolated_store
) -> None:
    from api import analysis_runs as analysis_runs_api

    run = _build_sc_run()
    monkeypatch.setattr(analysis_runs_api, "_require_canonical_run", lambda _run_id: run)

    # Bez zapisu — magazyn pusty (zero regresu podgladu).
    plain = app_client.get(f"/api/analysis-runs/{run.id}/export/report/json")
    assert plain.status_code == 200
    empty = app_client.get("/api/projects/project-doc-1/documents")
    assert empty.status_code == 200
    assert empty.json()["count"] == 0

    # Opt-in zapis do magazynu.
    saved = app_client.get(
        f"/api/analysis-runs/{run.id}/export/report/json?zapisz_do_magazynu=true"
    )
    assert saved.status_code == 200

    listing = app_client.get("/api/projects/project-doc-1/documents").json()
    assert listing["count"] == 1
    item = listing["items"][0]
    assert item["doc_type"] == "RAPORT"
    assert item["doc_format"] == "JSON"
    assert item["run_ref"] == str(run.id)
    assert len(item["sha256"]) == 64
    assert item["size_bytes"] > 0
    assert item["content_url"] == f"/api/documents/{item['id']}/content"
    # JSON nie ma stron — uczciwy brak (pole pominiete, exclude_none).
    assert "page_count" not in item

    download = app_client.get(item["content_url"])
    assert download.status_code == 200
    assert download.headers["content-type"].startswith("application/json")
    assert download.headers["content-disposition"].startswith("attachment")

    preview = app_client.get(f"{item['content_url']}?inline=true")
    assert preview.status_code == 200
    assert preview.headers["content-disposition"].startswith("inline")


def test_capture_report_pdf_records_page_count(app_client, monkeypatch, _isolated_store) -> None:
    from api import analysis_runs as analysis_runs_api

    run = _build_sc_run()
    monkeypatch.setattr(analysis_runs_api, "_require_canonical_run", lambda _run_id: run)

    app_client.get(f"/api/analysis-runs/{run.id}/export/report/pdf?zapisz_do_magazynu=true")
    listing = app_client.get("/api/projects/project-doc-1/documents").json()
    assert listing["count"] == 1
    item = listing["items"][0]
    assert item["doc_format"] == "PDF"
    assert item["page_count"] >= 1

    download = app_client.get(item["content_url"])
    assert download.headers["content-type"].startswith("application/pdf")
    assert bytes(download.content).startswith(b"%PDF")


def test_capture_is_deterministic_and_idempotent(app_client, monkeypatch, _isolated_store) -> None:
    from api import analysis_runs as analysis_runs_api

    run = _build_sc_run()
    monkeypatch.setattr(analysis_runs_api, "_require_canonical_run", lambda _run_id: run)

    first = app_client.get(
        f"/api/analysis-runs/{run.id}/export/report/json?zapisz_do_magazynu=true"
    )
    second = app_client.get(
        f"/api/analysis-runs/{run.id}/export/report/json?zapisz_do_magazynu=true"
    )
    assert first.status_code == second.status_code == 200

    listing = app_client.get("/api/projects/project-doc-1/documents").json()
    # Idempotentny upsert: jeden rekord, stabilne id/SHA.
    assert listing["count"] == 1


def test_download_missing_document_returns_404(app_client, _isolated_store) -> None:
    response = app_client.get(f"/api/documents/{uuid4()}/content")
    assert response.status_code == 404


def test_list_empty_project_is_honest_zero(app_client, _isolated_store) -> None:
    response = app_client.get("/api/projects/pusty-projekt/documents")
    assert response.status_code == 200
    assert response.json() == {
        "project_id": "pusty-projekt",
        "items": [],
        "count": 0,
    }
