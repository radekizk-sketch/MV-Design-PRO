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


# ---------------------------------------------------------------------------
# CV-3.2: bramka wskrzeszenia C2 (`StudyCaseEngine`/`SolverProtocol`)
# ---------------------------------------------------------------------------


def test_guard_rejects_resurrected_study_case_engine_module(tmp_path, monkeypatch) -> None:
    engine_dir = tmp_path / "backend" / "src" / "domain"
    engine_dir.mkdir(parents=True)
    engine_path = engine_dir / "study_case_engine.py"
    engine_path.write_text("class StudyCaseEngine:\n    pass\n", encoding="utf-8")
    monkeypatch.setattr(guard, "ROOT", tmp_path)
    monkeypatch.setattr(guard, "STUDY_CASE_ENGINE_MODULE", engine_path)
    monkeypatch.setattr(guard, "BACKEND_SRC_DIR", tmp_path / "backend" / "src")

    violations = guard.check_study_case_engine_resurrection()

    assert any("[resurrected-module]" in v for v in violations)
    assert any("[resurrected-class]" in v and "StudyCaseEngine" in v for v in violations)


def test_guard_rejects_resurrected_engine_class_in_unrelated_file(tmp_path, monkeypatch) -> None:
    """Klasa moze wrocic pod INNA nazwa pliku — guard skanuje CALY `src`,
    nie tylko `domain/study_case_engine.py`."""
    src_dir = tmp_path / "backend" / "src" / "domain"
    src_dir.mkdir(parents=True)
    other = src_dir / "somewhere_else.py"
    other.write_text("class SolverProtocol:\n    def solve(self) -> None: ...\n", encoding="utf-8")
    monkeypatch.setattr(guard, "ROOT", tmp_path)
    monkeypatch.setattr(
        guard, "STUDY_CASE_ENGINE_MODULE", tmp_path / "backend" / "src" / "domain" / "missing.py"
    )
    monkeypatch.setattr(guard, "BACKEND_SRC_DIR", tmp_path / "backend" / "src")

    violations = guard.check_study_case_engine_resurrection()

    assert any("[resurrected-class]" in v and "SolverProtocol" in v for v in violations)


def test_guard_accepts_clean_tree_without_engine(tmp_path, monkeypatch) -> None:
    src_dir = tmp_path / "backend" / "src" / "domain"
    src_dir.mkdir(parents=True)
    (src_dir / "study_case.py").write_text("class StudyCase:\n    pass\n", encoding="utf-8")
    monkeypatch.setattr(guard, "ROOT", tmp_path)
    monkeypatch.setattr(
        guard, "STUDY_CASE_ENGINE_MODULE", tmp_path / "backend" / "src" / "domain" / "missing.py"
    )
    monkeypatch.setattr(guard, "BACKEND_SRC_DIR", tmp_path / "backend" / "src")

    assert guard.check_study_case_engine_resurrection() == []


def test_guard_does_not_fire_on_engine_name_in_comment_text(tmp_path, monkeypatch) -> None:
    """Wzmianka tekstowa (komentarz/dokstring) NIE jest definicja klasy —
    tylko `ast.ClassDef` liczy sie jako wskrzeszenie."""
    src_dir = tmp_path / "backend" / "src" / "domain"
    src_dir.mkdir(parents=True)
    (src_dir / "study_case.py").write_text(
        '"""Patrz historyczny StudyCaseEngine (usuniety CV-3.2) po kontekst."""\n'
        "class StudyCase:\n    pass\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(guard, "ROOT", tmp_path)
    monkeypatch.setattr(
        guard, "STUDY_CASE_ENGINE_MODULE", tmp_path / "backend" / "src" / "domain" / "missing.py"
    )
    monkeypatch.setattr(guard, "BACKEND_SRC_DIR", tmp_path / "backend" / "src")

    assert guard.check_study_case_engine_resurrection() == []


# ---------------------------------------------------------------------------
# CV-3.2: bramka wskrzeszenia C3 (9 operacji domenowych "Study Case" v2)
# ---------------------------------------------------------------------------


def test_guard_rejects_resurrected_c3_op_in_canonical_operations_registry(
    tmp_path, monkeypatch
) -> None:
    registry = tmp_path / "canonical_operations.py"
    registry.write_text(
        "CANONICAL_OPERATIONS = {\n"
        '    "create_study_case": OperationSpec(\n'
        '        canonical_name="create_study_case",\n'
        "    ),\n"
        "}\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(guard, "ROOT", tmp_path)
    monkeypatch.setattr(guard, "CANONICAL_OPS_REGISTRY", registry)
    monkeypatch.setattr(guard, "V2_HANDLERS_MODULE", tmp_path / "missing_v2.py")
    monkeypatch.setattr(guard, "FRONTEND_DOMAIN_OPS", tmp_path / "missing_domainOps.ts")

    violations = guard.check_domain_op_registry_resurrection()

    assert any("[resurrected-registry-entry]" in v and "create_study_case" in v for v in violations)


def test_guard_rejects_resurrected_c3_op_in_v2_handlers(tmp_path, monkeypatch) -> None:
    handlers = tmp_path / "domain_operations_v2.py"
    handlers.write_text(
        "def compare_study_cases(a, b):\n"
        "    return {}\n\n\n"
        "ALL_V2_HANDLERS = {\n"
        '    "compare_study_cases": compare_study_cases,\n'
        "}\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(guard, "ROOT", tmp_path)
    monkeypatch.setattr(guard, "CANONICAL_OPS_REGISTRY", tmp_path / "missing_registry.py")
    monkeypatch.setattr(guard, "V2_HANDLERS_MODULE", handlers)
    monkeypatch.setattr(guard, "FRONTEND_DOMAIN_OPS", tmp_path / "missing_domainOps.ts")

    violations = guard.check_domain_op_registry_resurrection()

    assert any(
        "[resurrected-handler-entry]" in v and "compare_study_cases" in v for v in violations
    )


def test_guard_rejects_resurrected_c3_op_in_frontend_whitelist(tmp_path, monkeypatch) -> None:
    frontend = tmp_path / "domainOps.ts"
    frontend.write_text(
        "export const CANONICAL_OPERATION_NAMES = [\n"
        "  'run_time_series_power_flow',\n"
        "] as const;\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(guard, "ROOT", tmp_path)
    monkeypatch.setattr(guard, "CANONICAL_OPS_REGISTRY", tmp_path / "missing_registry.py")
    monkeypatch.setattr(guard, "V2_HANDLERS_MODULE", tmp_path / "missing_v2.py")
    monkeypatch.setattr(guard, "FRONTEND_DOMAIN_OPS", frontend)

    violations = guard.check_domain_op_registry_resurrection()

    assert any(
        "[resurrected-frontend-whitelist]" in v and "run_time_series_power_flow" in v
        for v in violations
    )


def test_guard_does_not_fire_on_name_collisions_outside_registry(tmp_path, monkeypatch) -> None:
    """Kolizje nazw (C1 `api/study_cases.py`/`domain/study_case.py`, E2
    `api/enm.py`) NIE sa rejestrem — guard sprawdza WYLACZNIE 3 wskazane
    pliki rejestru/whitelisty, wiec zywy kod pod ta sama nazwa gdziekolwiek
    indziej w drzewie nie moze go zapalic."""
    registry = tmp_path / "canonical_operations.py"
    registry.write_text(
        "CANONICAL_OPERATIONS = {\n"
        '    "add_grid_source_sn": OperationSpec(\n'
        '        canonical_name="add_grid_source_sn",\n'
        "    ),\n"
        "}\n",
        encoding="utf-8",
    )
    handlers = tmp_path / "domain_operations_v2.py"
    handlers.write_text(
        "def add_ct(enm, payload):\n"
        "    return enm\n\n\n"
        "ALL_V2_HANDLERS = {\n"
        '    "add_ct": add_ct,\n'
        "}\n",
        encoding="utf-8",
    )
    # Zywa kolizja nazw — inny plik, inna warstwa (C1/E2), gdzie indziej w drzewie.
    collision_dir = tmp_path / "backend" / "src" / "api"
    collision_dir.mkdir(parents=True)
    (collision_dir / "study_cases.py").write_text(
        "def create_study_case(name: str) -> dict:\n"
        '    """Zywy C1 endpoint — ta sama nazwa co skasowany C3, inna warstwa."""\n'
        '    return {"name": name}\n\n\n'
        "def compare_study_cases(a, b):\n"
        '    return {"a": a, "b": b}\n\n\n'
        "def run_short_circuit(case_id: str) -> dict:\n"
        '    return {"case_id": case_id}\n',
        encoding="utf-8",
    )
    frontend = tmp_path / "domainOps.ts"
    frontend.write_text(
        "export const CANONICAL_OPERATION_NAMES = [\n  'add_grid_source_sn',\n] as const;\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(guard, "ROOT", tmp_path)
    monkeypatch.setattr(guard, "CANONICAL_OPS_REGISTRY", registry)
    monkeypatch.setattr(guard, "V2_HANDLERS_MODULE", handlers)
    monkeypatch.setattr(guard, "FRONTEND_DOMAIN_OPS", frontend)

    assert guard.check_domain_op_registry_resurrection() == []


def test_guard_accepts_current_repo_state() -> None:
    """Integracyjny pin: bramka na PRAWDZIWYM drzewie repo (bez monkeypatch)
    musi byc czysta PO kasacji CV-3.2."""
    assert guard.check_study_case_engine_resurrection() == []
    assert guard.check_domain_op_registry_resurrection() == []
