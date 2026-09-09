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


def test_guard_rejects_public_router_importing_deleted_e3_engine(
    tmp_path,
    monkeypatch,
) -> None:
    """Karta CV-3.3-A (2026-09-05): E3 (`ExecutionEngineService`, zero
    konsumenta produkcyjnego) skasowany — zadna aktywna trasa nie moze go
    wskrzesic, ani przez import modulu, ani przez sama nazwe klasy."""
    module_path = write_module(
        tmp_path,
        "resurrected_e3_router.py",
        """
from application.execution_engine.service import ExecutionEngineService
from fastapi import APIRouter

router = APIRouter(prefix="/api/legacy-e3")

@router.get("/{run_id}")
def read_run(run_id: str):
    engine = ExecutionEngineService()
    return {"run_id": run_id, "engine": engine}
""",
    )
    monkeypatch.setattr(guard, "active_api_module_paths", lambda: [module_path])
    monkeypatch.setattr(guard, "ROOT", tmp_path)

    violations = guard.check_legacy_public_paths()

    assert any("[legacy-public-import]" in v and "execution_engine" in v for v in violations)
    assert any("[legacy-public-name]" in v and "ExecutionEngineService" in v for v in violations)


def test_guard_rejects_public_router_importing_deleted_unified_runs_and_r2(
    tmp_path,
    monkeypatch,
) -> None:
    """Karta CV-3.3-A: E2-widmo (`unified_runs`/`unified_run_dispatch`) i
    podmoduly martwe R2 (`AnalysisRunExportService`, `ResultsInspectorService`,
    `AnalysisOrchestrator`) skasowane — ta sama zapadka pilnuje calego
    klastra, nie jednej nazwy z karty."""
    module_path = write_module(
        tmp_path,
        "resurrected_e2_r2_router.py",
        """
from application.analysis_run.orchestrator import AnalysisOrchestrator
from application.unified_run_dispatch import UnifiedRunDispatchService
from fastapi import APIRouter

router = APIRouter(prefix="/api/legacy-e2")

@router.get("/{run_id}")
def read_run(run_id: str):
    orch = AnalysisOrchestrator()
    return {"run_id": run_id, "orch": orch, "dispatch": UnifiedRunDispatchService}
""",
    )
    monkeypatch.setattr(guard, "active_api_module_paths", lambda: [module_path])
    monkeypatch.setattr(guard, "ROOT", tmp_path)

    violations = guard.check_legacy_public_paths()

    assert any("orchestrator" in v for v in violations)
    assert any("unified_run_dispatch" in v for v in violations)
    assert any("AnalysisOrchestrator" in v for v in violations)


def test_guard_rejects_public_router_importing_orphaned_result_mapping_cluster(
    tmp_path,
    monkeypatch,
) -> None:
    """Karta CV-3.3-A2 (2026-09-05): `load_flow_to_resultset_v1.py`,
    `protection_to_overlay_v1.py` i `domain/analysis_kind.py` skasowane —
    jedyny wolajacy w `src/` byl E3/E2-widmo, oba skasowane karta CV-3.3-A.
    `sc_binding_meta.py` i `short_circuit_to_resultset_v1.py`/
    `protection_to_resultset_v1.py` NIE sa w tej liscie — zostaja, zamrozone
    przez `resultset_v1_schema_guard.py` (decyzja wlasciciela, B-01)."""
    module_path = write_module(
        tmp_path,
        "resurrected_result_mapping_router.py",
        """
from application.result_mapping.load_flow_to_resultset_v1 import map_power_flow_to_resultset_v1
from application.result_mapping.protection_to_overlay_v1 import map_protection_to_overlay_v1
from domain.analysis_kind import AnalysisKind
from fastapi import APIRouter

router = APIRouter(prefix="/api/legacy-result-mapping")

@router.get("/{run_id}")
def read_run(run_id: str):
    kind = AnalysisKind.SHORT_CIRCUIT
    return {"run_id": run_id, "kind": kind, "pf": map_power_flow_to_resultset_v1, "ov": map_protection_to_overlay_v1}
""",
    )
    monkeypatch.setattr(guard, "active_api_module_paths", lambda: [module_path])
    monkeypatch.setattr(guard, "ROOT", tmp_path)

    violations = guard.check_legacy_public_paths()

    assert any("load_flow_to_resultset_v1" in v for v in violations)
    assert any("protection_to_overlay_v1" in v for v in violations)
    assert any("analysis_kind" in v for v in violations)
    assert any("AnalysisKind" in v for v in violations)


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
        guard,
        "STUDY_CASE_ENGINE_MODULE",
        tmp_path / "backend" / "src" / "domain" / "missing.py",
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
        guard,
        "STUDY_CASE_ENGINE_MODULE",
        tmp_path / "backend" / "src" / "domain" / "missing.py",
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
        guard,
        "STUDY_CASE_ENGINE_MODULE",
        tmp_path / "backend" / "src" / "domain" / "missing.py",
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
    assert guard.check_c4_and_p24_plus_resurrection() == []


# ---------------------------------------------------------------------------
# CV-3.2 (drugi commit): bramka wskrzeszenia C4 (`ScenarioComparisonBuilder`,
# `application.study_scenario`, `analysis.scenario_comparison`) + P24+
# (`p24_plus_report`, `export_p24_plus_report_pdf`)
# ---------------------------------------------------------------------------


def _patch_c4_dirs(
    monkeypatch, tmp_path, *, study_scenario=None, scenario_comparison=None, pdf=None
):
    """Podmien wszystkie trzy katalogi C4/P24+ na podane sciezki (domyslnie:
    nieistniejace w tmp_path — czysty stan)."""
    dirs = {
        (
            study_scenario or (tmp_path / "missing_study_scenario")
        ): "application/study_scenario (C4)",
        (scenario_comparison or (tmp_path / "missing_scenario_comparison")): (
            "analysis/scenario_comparison (C4)"
        ),
        (pdf or (tmp_path / "missing_pdf")): "analysis/reporting/pdf (P24+)",
    }
    monkeypatch.setattr(guard, "FORBIDDEN_C4_DIRECTORIES", dirs)


def test_guard_rejects_resurrected_study_scenario_directory(tmp_path, monkeypatch) -> None:
    resurrected = tmp_path / "backend" / "src" / "application" / "study_scenario"
    resurrected.mkdir(parents=True)
    (resurrected / "models.py").write_text("class Study:\n    pass\n", encoding="utf-8")
    monkeypatch.setattr(guard, "ROOT", tmp_path)
    monkeypatch.setattr(guard, "BACKEND_SRC_DIR", tmp_path / "backend" / "src")
    _patch_c4_dirs(monkeypatch, tmp_path, study_scenario=resurrected)

    violations = guard.check_c4_and_p24_plus_resurrection()

    assert any(
        "[resurrected-module]" in v and "application/study_scenario" in v for v in violations
    )


def test_guard_rejects_resurrected_scenario_comparison_directory(tmp_path, monkeypatch) -> None:
    resurrected = tmp_path / "backend" / "src" / "analysis" / "scenario_comparison"
    resurrected.mkdir(parents=True)
    (resurrected / "builder.py").write_text(
        "class ScenarioComparisonBuilder:\n    pass\n", encoding="utf-8"
    )
    monkeypatch.setattr(guard, "ROOT", tmp_path)
    monkeypatch.setattr(guard, "BACKEND_SRC_DIR", tmp_path / "backend" / "src")
    _patch_c4_dirs(monkeypatch, tmp_path, scenario_comparison=resurrected)

    violations = guard.check_c4_and_p24_plus_resurrection()

    assert any(
        "[resurrected-module]" in v and "analysis/scenario_comparison" in v for v in violations
    )
    assert any("[resurrected-class]" in v and "ScenarioComparisonBuilder" in v for v in violations)


def test_guard_rejects_resurrected_p24_plus_directory(tmp_path, monkeypatch) -> None:
    resurrected = tmp_path / "backend" / "src" / "analysis" / "reporting" / "pdf"
    resurrected.mkdir(parents=True)
    (resurrected / "p24_plus_report.py").write_text(
        "def export_p24_plus_report_pdf():\n    pass\n", encoding="utf-8"
    )
    monkeypatch.setattr(guard, "ROOT", tmp_path)
    monkeypatch.setattr(guard, "BACKEND_SRC_DIR", tmp_path / "backend" / "src")
    _patch_c4_dirs(monkeypatch, tmp_path, pdf=resurrected)

    violations = guard.check_c4_and_p24_plus_resurrection()

    assert any("[resurrected-module]" in v and "analysis/reporting/pdf" in v for v in violations)
    assert any(
        "[resurrected-function]" in v and "export_p24_plus_report_pdf" in v for v in violations
    )


def test_guard_rejects_resurrected_class_or_function_under_other_path(
    tmp_path, monkeypatch
) -> None:
    """Klasa/funkcja moze wrocic pod INNYM plikiem/katalogiem — guard skanuje
    caly `src`, nie tylko trzy nazwane katalogi."""
    src_dir = tmp_path / "backend" / "src" / "somewhere"
    src_dir.mkdir(parents=True)
    (src_dir / "sneaky.py").write_text(
        "class ScenarioComparisonBuilder:\n    pass\n\n\n"
        "def export_p24_plus_report_pdf():\n    pass\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(guard, "ROOT", tmp_path)
    monkeypatch.setattr(guard, "BACKEND_SRC_DIR", tmp_path / "backend" / "src")
    _patch_c4_dirs(monkeypatch, tmp_path)

    violations = guard.check_c4_and_p24_plus_resurrection()

    assert any("[resurrected-class]" in v and "ScenarioComparisonBuilder" in v for v in violations)
    assert any(
        "[resurrected-function]" in v and "export_p24_plus_report_pdf" in v for v in violations
    )


def test_guard_does_not_fire_on_orphaned_pycache_directory(tmp_path, monkeypatch) -> None:
    """Katalog istnieje na dysku (osierocony __pycache__ z sesji SPRZED
    kasacji), ale nie zawiera ANI JEDNEGO .py — to NIE jest wskrzeszenie."""
    stale = tmp_path / "backend" / "src" / "application" / "study_scenario"
    (stale / "__pycache__").mkdir(parents=True)
    (stale / "__pycache__" / "models.cpython-311.pyc").write_bytes(b"\x00")
    src_dir = tmp_path / "backend" / "src"
    monkeypatch.setattr(guard, "ROOT", tmp_path)
    monkeypatch.setattr(guard, "BACKEND_SRC_DIR", src_dir)
    _patch_c4_dirs(monkeypatch, tmp_path, study_scenario=stale)

    assert guard.check_c4_and_p24_plus_resurrection() == []


def test_guard_accepts_clean_tree_without_c4_or_p24_plus(tmp_path, monkeypatch) -> None:
    src_dir = tmp_path / "backend" / "src" / "analysis"
    src_dir.mkdir(parents=True)
    (src_dir / "koperta_kontekstu.py").write_text(
        "def pola_koperty(x):\n    return {}\n", encoding="utf-8"
    )
    monkeypatch.setattr(guard, "ROOT", tmp_path)
    monkeypatch.setattr(guard, "BACKEND_SRC_DIR", tmp_path / "backend" / "src")
    _patch_c4_dirs(monkeypatch, tmp_path)

    assert guard.check_c4_and_p24_plus_resurrection() == []


# ---------------------------------------------------------------------------
# CV-4.2 (2026-09-05) — kasacja kreatora P2/S4, P5, P13.
# ---------------------------------------------------------------------------


def _patch_cv42_files(monkeypatch, tmp_path, **files) -> None:
    """Podmien wszystkie trzy pliki CV-4.2 na podane sciezki (domyslnie:
    nieistniejace w tmp_path — czysty stan)."""
    mapping = {
        (files.get("power_flow_input_builder") or (tmp_path / "missing_pfib.py")): (
            "application/power_flow_input_builder.py (P5) usunięty procedurą w CV-4.2"
        ),
        (files.get("load_flow_input") or (tmp_path / "missing_lfi.py")): (
            "domain/load_flow_input.py (P13) usunięty procedurą w CV-4.2"
        ),
        (files.get("load_flow_validation") or (tmp_path / "missing_lfv.py")): (
            "domain/load_flow_validation.py (P13) usunięty procedurą w CV-4.2"
        ),
    }
    monkeypatch.setattr(guard, "FORBIDDEN_CV42_FILES", mapping)


def test_guard_rejects_resurrected_power_flow_input_builder_module(tmp_path, monkeypatch) -> None:
    resurrected = tmp_path / "backend" / "src" / "application" / "power_flow_input_builder.py"
    resurrected.parent.mkdir(parents=True)
    resurrected.write_text("def build_power_flow_input():\n    pass\n", encoding="utf-8")
    monkeypatch.setattr(guard, "ROOT", tmp_path)
    monkeypatch.setattr(guard, "BACKEND_SRC_DIR", tmp_path / "backend" / "src")
    _patch_cv42_files(monkeypatch, tmp_path, power_flow_input_builder=resurrected)

    violations = guard.check_cv42_resurrection()

    assert any(
        "[resurrected-module]" in v and "application/power_flow_input_builder.py" in v
        for v in violations
    )
    assert any("[resurrected-function]" in v and "build_power_flow_input" in v for v in violations)


def test_guard_rejects_resurrected_load_flow_input_module(tmp_path, monkeypatch) -> None:
    resurrected = tmp_path / "backend" / "src" / "domain" / "load_flow_input.py"
    resurrected.parent.mkdir(parents=True)
    resurrected.write_text("class LoadFlowRunInput:\n    pass\n", encoding="utf-8")
    monkeypatch.setattr(guard, "ROOT", tmp_path)
    monkeypatch.setattr(guard, "BACKEND_SRC_DIR", tmp_path / "backend" / "src")
    _patch_cv42_files(monkeypatch, tmp_path, load_flow_input=resurrected)

    violations = guard.check_cv42_resurrection()

    assert any("[resurrected-module]" in v and "domain/load_flow_input.py" in v for v in violations)
    assert any("[resurrected-class]" in v and "LoadFlowRunInput" in v for v in violations)


def test_guard_rejects_resurrected_cv42_class_or_function_under_other_path(
    tmp_path, monkeypatch
) -> None:
    """Klasa/funkcja moze wrocic pod INNYM plikiem — guard skanuje caly `src`,
    nie tylko trzy nazwane pliki."""
    src_dir = tmp_path / "backend" / "src" / "somewhere"
    src_dir.mkdir(parents=True)
    (src_dir / "sneaky.py").write_text(
        "class ShortCircuitInput:\n    pass\n\n\n"
        "def build_short_circuit_input():\n    pass\n\n\n"
        "def merge_bus_components():\n    pass\n\n\n"
        "def validate_load_flow_input():\n    pass\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(guard, "ROOT", tmp_path)
    monkeypatch.setattr(guard, "BACKEND_SRC_DIR", tmp_path / "backend" / "src")
    _patch_cv42_files(monkeypatch, tmp_path)

    violations = guard.check_cv42_resurrection()

    assert any("[resurrected-class]" in v and "ShortCircuitInput" in v for v in violations)
    assert any(
        "[resurrected-function]" in v and "build_short_circuit_input" in v for v in violations
    )
    assert any("[resurrected-function]" in v and "merge_bus_components" in v for v in violations)
    assert any(
        "[resurrected-function]" in v and "validate_load_flow_input" in v for v in violations
    )


def test_guard_accepts_clean_tree_without_cv42_resurrection(tmp_path, monkeypatch) -> None:
    src_dir = tmp_path / "backend" / "src" / "application" / "network_wizard"
    src_dir.mkdir(parents=True)
    (src_dir / "service.py").write_text(
        "class NetworkWizardService:\n    def add_node(self, *a, **kw):\n        pass\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(guard, "ROOT", tmp_path)
    monkeypatch.setattr(guard, "BACKEND_SRC_DIR", tmp_path / "backend" / "src")
    _patch_cv42_files(monkeypatch, tmp_path)

    assert guard.check_cv42_resurrection() == []


def test_guard_accepts_current_repo_state_cv42() -> None:
    """Stan repozytorium PO karcie CV-4.2 jest zielony na tej bramce —
    prawdziwe drzewo `backend/src`, nie sztuczne `tmp_path`."""
    assert guard.check_cv42_resurrection() == []


def test_guard_rejects_resurrected_own_db_engine_helpers_cv42b(tmp_path, monkeypatch) -> None:
    """CV-4.2b: `_uow_factory_biezacy`/`_maybe_load_audit2_extensions` (wlasny silnik
    z DATABASE_URL w torze biegow) nie moga wrocic pod ZADNYM plikiem `src`."""
    src_dir = tmp_path / "backend" / "src" / "enm"
    src_dir.mkdir(parents=True)
    (src_dir / "assembler.py").write_text(
        "def _uow_factory_biezacy():\n    pass\n\n\n"
        "def _maybe_load_audit2_extensions(*, project_id_str, station_id):\n    pass\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(guard, "ROOT", tmp_path)
    monkeypatch.setattr(guard, "BACKEND_SRC_DIR", tmp_path / "backend" / "src")
    _patch_cv42_files(monkeypatch, tmp_path)

    violations = guard.check_cv42_resurrection()

    assert any(
        "[resurrected-function]" in v and "_uow_factory_biezacy" in v and "CV-4.2b" in v
        for v in violations
    )
    assert any(
        "[resurrected-function]" in v and "_maybe_load_audit2_extensions" in v for v in violations
    )


def test_guard_does_not_fire_on_cv42b_names_in_comments_or_strings(tmp_path, monkeypatch) -> None:
    """Nazwa w komentarzu/dokstringu (np. opis kasacji) to nie definicja."""
    src_dir = tmp_path / "backend" / "src" / "enm"
    src_dir.mkdir(parents=True)
    (src_dir / "assembler.py").write_text(
        '"""Wlasny silnik (`_uow_factory_biezacy`/`_maybe_load_audit2_extensions`) skasowany."""\n'
        "# _uow_factory_biezacy nie wraca\n"
        "def zloz_wejscie_rozplywu():\n    pass\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(guard, "ROOT", tmp_path)
    monkeypatch.setattr(guard, "BACKEND_SRC_DIR", tmp_path / "backend" / "src")
    _patch_cv42_files(monkeypatch, tmp_path)

    assert guard.check_cv42_resurrection() == []


# ---------------------------------------------------------------------------
# Karta KASACJA-DATA-MANAGER (2026-09-09) — bramka wskrzeszenia frontendowa
# (`ui/data-manager/**`, komponent `DataManager`, typ `DataManagerRow`).
# ---------------------------------------------------------------------------


def _patch_data_manager_dirs(monkeypatch, tmp_path, *, data_manager_dir=None) -> None:
    """Podmien katalog danych/frontend na sciezki pod `tmp_path` (domyslnie:
    nieistniejacy `data-manager/` i pusty `frontend/src` — czysty stan)."""
    frontend_src = tmp_path / "frontend" / "src"
    frontend_src.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(guard, "ROOT", tmp_path)
    monkeypatch.setattr(guard, "FRONTEND_SRC_DIR", frontend_src)
    monkeypatch.setattr(
        guard, "DATA_MANAGER_DIR", data_manager_dir or (frontend_src / "ui" / "data-manager")
    )


def test_guard_rejects_resurrected_data_manager_directory(tmp_path, monkeypatch) -> None:
    dm_dir = tmp_path / "frontend" / "src" / "ui" / "data-manager"
    dm_dir.mkdir(parents=True)
    (dm_dir / "DataManager.tsx").write_text(
        "export function DataManager() { return null; }\n", encoding="utf-8"
    )
    _patch_data_manager_dirs(monkeypatch, tmp_path, data_manager_dir=dm_dir)

    violations = guard.check_data_manager_resurrection()

    assert any(
        "[resurrected-module]" in v and "ui/data-manager" in v and "DataManager.tsx" in v
        for v in violations
    )
    assert any("[resurrected-component]" in v and "DataManager.tsx" in v for v in violations)


def test_guard_rejects_resurrected_component_under_other_path(tmp_path, monkeypatch) -> None:
    """Komponent moze wrocic pod INNYM plikiem/katalogiem — guard skanuje CALY
    `frontend/src`, nie tylko stary katalog `ui/data-manager`."""
    sneaky_dir = tmp_path / "frontend" / "src" / "ui" / "elsewhere"
    sneaky_dir.mkdir(parents=True)
    (sneaky_dir / "sneaky.tsx").write_text(
        "export const DataManager = () => null;\n", encoding="utf-8"
    )
    _patch_data_manager_dirs(monkeypatch, tmp_path)

    violations = guard.check_data_manager_resurrection()

    assert any("[resurrected-component]" in v and "sneaky.tsx" in v for v in violations)
    # Katalog stary nie istnieje w tym scenariuszu — [resurrected-module] nie pada.
    assert not any("[resurrected-module]" in v for v in violations)


def test_guard_rejects_resurrected_data_manager_row_type_under_other_path(
    tmp_path, monkeypatch
) -> None:
    sneaky_dir = tmp_path / "frontend" / "src" / "ui"
    sneaky_dir.mkdir(parents=True)
    (sneaky_dir / "types.ts").write_text(
        "export interface DataManagerRow {\n  id: string;\n}\n", encoding="utf-8"
    )
    _patch_data_manager_dirs(monkeypatch, tmp_path)

    violations = guard.check_data_manager_resurrection()

    assert any("[resurrected-type]" in v and "types.ts" in v for v in violations)


def test_guard_does_not_fire_on_data_manager_name_in_comment_text(tmp_path, monkeypatch) -> None:
    """Naglowek testu cytujacy nazwe kasacji (jak `ui/__tests__/project-tree.test.ts`
    po karcie KASACJA-DATA-MANAGER) to komentarz, nie definicja — guard milczy."""
    ui_dir = tmp_path / "frontend" / "src" / "ui" / "__tests__"
    ui_dir.mkdir(parents=True)
    (ui_dir / "project-tree.test.ts").write_text(
        "/**\n"
        " * Kasacja 2026-09-09 (karta KASACJA-DATA-MANAGER): `ui/data-manager/**`\n"
        " * (DataManager, DataManagerRow) usuniete razem z martwym modulem.\n"
        " */\n"
        "// DataManager nie wraca\n"
        "export const cos_innego = 1;\n",
        encoding="utf-8",
    )
    _patch_data_manager_dirs(monkeypatch, tmp_path)

    assert guard.check_data_manager_resurrection() == []


def test_guard_accepts_clean_tree_without_data_manager(tmp_path, monkeypatch) -> None:
    src_dir = tmp_path / "frontend" / "src" / "ui" / "topology"
    src_dir.mkdir(parents=True)
    (src_dir / "ProjectTree.tsx").write_text(
        "export function ProjectTree() { return null; }\n", encoding="utf-8"
    )
    _patch_data_manager_dirs(monkeypatch, tmp_path)

    assert guard.check_data_manager_resurrection() == []


def test_guard_accepts_current_repo_state_data_manager() -> None:
    """Integracyjny pin: bramka na PRAWDZIWYM drzewie repo (bez monkeypatch)
    musi byc czysta PO kasacji KASACJA-DATA-MANAGER."""
    assert guard.check_data_manager_resurrection() == []


# ---------------------------------------------------------------------------
# CV-4.3-A4/K5 (2026-09-06) — bramka wskrzeszenia sierot E2 (`api/enm.py`
# POST runs/{short-circuit,power-flow}) i słownika biegów V12.6 w pamięci
# (`api/v126_academic.py::_runs`). Self-testy dopisane 2026-09-09 (odbiór karty
# KASACJA-DATA-MANAGER: deklaracja bez testu = fałszywa pewność).
# ---------------------------------------------------------------------------


def _patch_cv43_a4_modules(monkeypatch, tmp_path, *, enm_src: str | None, v126_src: str | None):
    api_dir = tmp_path / "backend" / "src" / "api"
    api_dir.mkdir(parents=True, exist_ok=True)
    enm_module = api_dir / "enm.py"
    v126_module = api_dir / "v126_academic.py"
    if enm_src is not None:
        enm_module.write_text(enm_src, encoding="utf-8")
    if v126_src is not None:
        v126_module.write_text(v126_src, encoding="utf-8")
    monkeypatch.setattr(guard, "ROOT", tmp_path)
    monkeypatch.setattr(guard, "CV43_A4_ENM_MODULE", enm_module)
    monkeypatch.setattr(guard, "CV43_A4_V126_MODULE", v126_module)


def test_guard_rejects_resurrected_e2_route_functions(tmp_path, monkeypatch) -> None:
    _patch_cv43_a4_modules(
        monkeypatch,
        tmp_path,
        enm_src=(
            "from fastapi import APIRouter\n"
            "router = APIRouter()\n"
            "@router.post('/api/enm/{case_id}/runs/short-circuit')\n"
            "def run_short_circuit(case_id: str):\n"
            "    return {}\n"
            "@router.post('/api/enm/{case_id}/runs/power-flow')\n"
            "async def run_power_flow(case_id: str):\n"
            "    return {}\n"
        ),
        v126_src=None,
    )

    violations = guard.check_cv43_a4_resurrection()

    assert [v for v in violations if "[resurrected-route]" in v and "run_short_circuit" in v]
    assert [v for v in violations if "[resurrected-route]" in v and "run_power_flow" in v]
    assert len(violations) == 2


def test_guard_rejects_resurrected_v126_inmemory_registry(tmp_path, monkeypatch) -> None:
    _patch_cv43_a4_modules(
        monkeypatch,
        tmp_path,
        enm_src=None,
        v126_src="from typing import Any\n_runs: dict[str, Any] = {}\n",
    )

    violations = guard.check_cv43_a4_resurrection()

    assert len(violations) == 1
    assert "[resurrected-inmemory-registry]" in violations[0]
    assert "_runs" in violations[0] and "v126_academic.py:2" in violations[0]


def test_guard_ignores_local_variable_named_like_registry(tmp_path, monkeypatch) -> None:
    """Zmienna lokalna `_runs` w funkcji pomocniczej nie jest rejestrem w pamięci
    procesu — guard patrzy wyłącznie na przypisania najwyższego poziomu."""
    _patch_cv43_a4_modules(
        monkeypatch,
        tmp_path,
        enm_src="def zdrowy_endpoint():\n    return {}\n",
        v126_src=(
            "def _zbierz(biegi):\n" "    _runs = {b.id: b for b in biegi}\n" "    return _runs\n"
        ),
    )

    assert guard.check_cv43_a4_resurrection() == []


def test_guard_accepts_missing_cv43_a4_modules(tmp_path, monkeypatch) -> None:
    _patch_cv43_a4_modules(monkeypatch, tmp_path, enm_src=None, v126_src=None)

    assert guard.check_cv43_a4_resurrection() == []


def test_real_repo_has_no_cv43_a4_resurrection() -> None:
    """Pin na prawdziwym repo: sieroty E2 i słownik `_runs` nie wróciły."""
    assert guard.check_cv43_a4_resurrection() == []


# ---------------------------------------------------------------------------
# W1 (2026-09-09): legacy persystencja sieci nie wraca
# ---------------------------------------------------------------------------


def _patch_w1_tree(monkeypatch, tmp_path) -> Path:
    src = tmp_path / "backend" / "src"
    src.mkdir(parents=True)
    monkeypatch.setattr(guard, "ROOT", tmp_path)
    monkeypatch.setattr(guard, "BACKEND_SRC_DIR", src)
    return src


def _models_z_tabelami(nazwy: list[str]) -> str:
    return "".join(f'class T{i}(Base):\n    __tablename__ = "{n}"\n\n' for i, n in enumerate(nazwy))


def test_guard_rejects_resurrected_w1_legacy_module(tmp_path, monkeypatch) -> None:
    src = _patch_w1_tree(monkeypatch, tmp_path)
    (src / "network_model").mkdir()
    (src / "network_model" / "sld_projection.py").write_text("x = 1\n", encoding="utf-8")
    (src / "application" / "sld").mkdir(parents=True)

    violations = guard.check_w1_legacy_persistence_resurrection()

    assert any("[resurrected-module]" in v and "sld_projection.py" in v for v in violations)
    assert any("[resurrected-module]" in v and "application/sld" in v for v in violations)


def test_guard_rejects_resurrected_w1_orm_class_and_table_under_other_path(
    tmp_path, monkeypatch
) -> None:
    src = _patch_w1_tree(monkeypatch, tmp_path)
    (src / "enm").mkdir()
    (src / "enm" / "cokolwiek.py").write_text(
        "class NetworkSnapshotORM(Base):\n"
        '    __tablename__ = "network_snapshots"\n'
        "\n\nclass Inna(Base):\n"
        '    __tablename__ = "sld_diagrams"\n'
        "\n\nclass NetworkWizardService:\n    pass\n",
        encoding="utf-8",
    )

    violations = guard.check_w1_legacy_persistence_resurrection()

    assert any("[resurrected-class]" in v and "NetworkSnapshotORM" in v for v in violations)
    assert any("[resurrected-class]" in v and "NetworkWizardService" in v for v in violations)
    assert any("[resurrected-table]" in v and "network_snapshots" in v for v in violations)
    assert any("[resurrected-table]" in v and "sld_diagrams" in v for v in violations)


def test_guard_pins_tablename_count_in_models(tmp_path, monkeypatch) -> None:
    """Nowa tabela w `models.py` bez zmiany pinu = naruszenie; dokladnie pin = zielono."""
    src = _patch_w1_tree(monkeypatch, tmp_path)
    models = src / "infrastructure" / "persistence" / "models.py"
    models.parent.mkdir(parents=True)
    nazwy = [f"tabela_{i}" for i in range(guard.W1_TABLENAME_PIN)]
    models.write_text(_models_z_tabelami(nazwy), encoding="utf-8")
    assert guard.check_w1_legacy_persistence_resurrection() == []

    models.write_text(_models_z_tabelami([*nazwy, "tabela_nowa"]), encoding="utf-8")
    violations = guard.check_w1_legacy_persistence_resurrection()
    assert any("[tablename-pin]" in v and str(guard.W1_TABLENAME_PIN) in v for v in violations)


def test_guard_does_not_fire_on_w1_names_in_comments_or_strings(tmp_path, monkeypatch) -> None:
    src = _patch_w1_tree(monkeypatch, tmp_path)
    (src / "enm").mkdir()
    (src / "enm" / "notatka.py").write_text(
        "# dawniej: class NetworkSnapshotORM, tabela network_snapshots\n"
        'OPIS = "NetworkWizardService i sld_diagrams skasowane w W1"\n',
        encoding="utf-8",
    )
    assert guard.check_w1_legacy_persistence_resurrection() == []


def test_guard_accepts_clean_tree_without_w1_resurrection(tmp_path, monkeypatch) -> None:
    _patch_w1_tree(monkeypatch, tmp_path)
    assert guard.check_w1_legacy_persistence_resurrection() == []


def test_guard_accepts_current_repo_state_w1() -> None:
    """Stan repozytorium PO W1 jest zielony na tej bramce — prawdziwe drzewo
    `backend/src` (w tym pin liczby tabel w `models.py`), nie sztuczne `tmp_path`."""
    assert guard.check_w1_legacy_persistence_resurrection() == []
