from __future__ import annotations

from pathlib import Path

import legacy_public_path_guard as guard


def write_module(tmp_path: Path, name: str, content: str) -> Path:
    path = tmp_path / name
    path.write_text(content, encoding="utf-8")
    return path


def test_guard_rejects_public_router_importing_legacy_analysis_run(
    tmp_path,
    monkeypatch,
) -> None:
    module_path = write_module(
        tmp_path,
        "legacy_router.py",
        """
from application.analysis_run.service import AnalysisRunService
from fastapi import APIRouter

router = APIRouter(prefix="/api/legacy")

@router.get("/{run_id}")
def read_run(run_id: str):
    return {"run_id": run_id}
""",
    )
    monkeypatch.setattr(guard, "active_api_module_paths", lambda: [module_path])
    monkeypatch.setattr(guard, "ROOT", tmp_path)

    violations = guard.check_legacy_public_paths()

    assert any("[legacy-public-import]" in violation for violation in violations)


def test_guard_rejects_public_router_using_operating_case_id_string(
    tmp_path,
    monkeypatch,
) -> None:
    module_path = write_module(
        tmp_path,
        "legacy_payload.py",
        """
from fastapi import APIRouter

router = APIRouter(prefix="/api/runs")

@router.get("/{run_id}")
def read_run(run_id: str):
    return {"operating_case_id": run_id}
""",
    )
    monkeypatch.setattr(guard, "active_api_module_paths", lambda: [module_path])
    monkeypatch.setattr(guard, "ROOT", tmp_path)

    violations = guard.check_legacy_public_paths()

    assert any("[legacy-public-string]" in violation for violation in violations)


def test_guard_accepts_canonical_public_router(tmp_path, monkeypatch) -> None:
    module_path = write_module(
        tmp_path,
        "canonical_router.py",
        """
from fastapi import APIRouter

router = APIRouter(prefix="/api/analysis-runs")

@router.get("/{run_id}/results")
def read_run(run_id: str):
    return {"study_case_id": run_id, "result_set_id": "rs-1"}
""",
    )
    monkeypatch.setattr(guard, "active_api_module_paths", lambda: [module_path])
    monkeypatch.setattr(guard, "ROOT", tmp_path)

    assert guard.check_legacy_public_paths() == []
