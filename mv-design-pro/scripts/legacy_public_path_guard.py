from __future__ import annotations

import ast
import sys
from pathlib import Path

# Sasiednie strazniki sa importowane po nazwie modulu: przy uruchomieniu skryptu
# katalog `scripts/` jest na sys.path automatycznie, ale konsument kontraktu
# (`tests/ci/test_kontrakt_routerow_miedzy_straznikami.py`) laduje ten plik przez
# `spec_from_file_location` - bez tego wpisu import sasiada konczy sie
# ModuleNotFoundError (ta sama konwencja: route_prefix_guard, router_mount_guard).
sys.path.insert(0, str(Path(__file__).resolve().parent))

import api_lifecycle_guard  # noqa: E402
import canonical_ops_guard  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
API_DIR = ROOT / "backend" / "src" / "api"
BACKEND_SRC_DIR = ROOT / "backend" / "src"

FORBIDDEN_IMPORTS = {
    "application.analysis_dispatch",
    "application.analysis_run.service",
    "domain.analysis_run",
    # Karta CV-3.3-A (2026-09-05): E3 (drugi tor wykonania biegow, zero
    # konsumenta produkcyjnego), E2-widmo (unified_runs + jego dyspozytor) i
    # martwe podmoduly R2 skasowane. Zadna aktywna trasa /api nie moze ich
    # wskrzesic.
    "application.execution_engine",
    "application.execution_engine.service",
    "application.execution_engine.errors",
    "application.execution_engine.load_flow_run_input",
    "api.unified_runs",
    "application.unified_run_dispatch",
    "application.analysis_run.export_service",
    "application.analysis_run.results_inspector",
    "application.analysis_run.orchestrator",
    "application.analysis_run.catalog_context",
    "application.analysis_run.dtos",
    # Karta CV-3.3-A2 (2026-09-05): klaster osierocony kasacja E3/E2-widmo
    # (jedyny wolajacy w src/) domkniety osobno. sc_binding_meta.py i
    # short_circuit_to_resultset_v1.py / protection_to_resultset_v1.py
    # ZOSTAJA — zamrozone przez resultset_v1_schema_guard.py, decyzja
    # wlasciciela (B-01), NIE kasowane.
    "application.result_mapping.load_flow_to_resultset_v1",
    "application.result_mapping.protection_to_overlay_v1",
    "domain.analysis_kind",
    # Karta CV-3.3-C (2026-09-05): E4 (serie biegow) przeszlo z trzech
    # slownikow w pamieci (`domain/batch_job.py`) na trwaly rejestr
    # `run_batches` (`domain/run_batch.py`). Zadna aktywna trasa /api nie moze
    # wskrzesic dawnego modulu.
    "domain.batch_job",
}
FORBIDDEN_NAMES = {
    "AnalysisRun",
    "OperatingCase",
    "get_operating_case",
    "operating_case_id",
    # Karta CV-3.3-A (2026-09-05).
    "ExecutionEngineService",
    "AnalysisRunExportService",
    "ResultsInspectorService",
    "AnalysisOrchestrator",
    "AnalysisDispatchService",
    # Karta CV-3.3-A2 (2026-09-05).
    "LoadFlowResultSetV1",
    "map_power_flow_to_resultset_v1",
    "map_protection_to_overlay_v1",
    "AnalysisKind",
    # Karta CV-3.3-C (2026-09-05) — patrz FORBIDDEN_IMPORTS.
    "BatchJob",
    "BatchJobStatus",
    "new_batch_job",
    # Karta CV-4.2 (2026-09-05): P12 (`run_audit2_power_flow`/`Audit2PowerFlowRequest`/
    # `Audit2PowerFlowResponse`, fabrykacja wejscia — `pq=[]`, `slack_node_id or
    # "slack-stub"`, zawsze pusty graf) usuniete z `api/solver_input.py` — zadna
    # aktywna trasa /api nie moze ich wskrzesic. Konsument FE przepiety na bieg
    # kanoniczny (`ui/study-cases/api.ts::createRun` + opcje `audit2_project_id`/
    # `audit2_station_id` czytane przez `enm.assembler.zloz_wejscie_rozplywu`).
    "run_audit2_power_flow",
    "Audit2PowerFlowRequest",
    "Audit2PowerFlowResponse",
}

# CV-3.2 (kasacja C2/C3, karta CV-3.2) — bramka wskrzeszenia. C2
# (`domain/study_case_engine.py`) i 9 operacji domenowych C3 zostały usunięte
# procedurą jako martwy kod (0 konsumentów produkcyjnych; semantyka żyje
# WYŁĄCZNIE w `enm/scenariusze.py::OperatingScenario`, CV-3.1). Poniższe
# sprawdza, że NIE wracają.
STUDY_CASE_ENGINE_MODULE = BACKEND_SRC_DIR / "domain" / "study_case_engine.py"
#: Klasy C2 — sprawdzane jako DEFINICJE (ast.ClassDef) gdziekolwiek w `src`,
#: nie jako dowolne wystąpienie identyfikatora (np. w komentarzu/dokstringu).
FORBIDDEN_ENGINE_CLASS_NAMES = {"StudyCaseEngine", "SolverProtocol"}

#: Rejestry, w których 9 operacji C3 istniało jako klucz (nie: dowolne miejsce
#: kodu — `create_study_case`/`compare_study_cases` żyją legalnie w
#: `api/study_cases.py`/`domain/study_case.py`, `run_short_circuit`/
#: `run_power_flow` w `api/enm.py` (E2); guard NIE ma prawa się tam zapalić).
CANONICAL_OPS_REGISTRY = ROOT / "backend" / "src" / "domain" / "canonical_operations.py"
V2_HANDLERS_MODULE = ROOT / "backend" / "src" / "enm" / "domain_operations_v2.py"
FRONTEND_DOMAIN_OPS = ROOT / "frontend" / "src" / "types" / "domainOps.ts"
FORBIDDEN_DOMAIN_OP_NAMES = {
    "create_study_case",
    "set_case_switch_state",
    "set_case_normal_state",
    "set_case_source_mode",
    "set_case_time_profile",
    "run_short_circuit",
    "run_power_flow",
    "run_time_series_power_flow",
    "compare_study_cases",
}

# CV-3.2 (kasacja C4 + P24+, drugi commit karty) — bramka wskrzeszenia. C4
# (`application/study_scenario/**`, `analysis/scenario_comparison/**`) usunięty
# po decyzji architektonicznej: P24+ (`analysis/reporting/pdf/**`), jedyny
# produkcyjny konsument `ScenarioComparisonEntry`/`View`, sam miał 0 wołających
# w `backend/src` poza własnym re-eksportem i 0 tras HTTP — ten sam byt co C4
# ("raport bez trasy"), więc skasowany razem z nim.
STUDY_SCENARIO_DIR = BACKEND_SRC_DIR / "application" / "study_scenario"
SCENARIO_COMPARISON_DIR = BACKEND_SRC_DIR / "analysis" / "scenario_comparison"
REPORTING_PDF_DIR = BACKEND_SRC_DIR / "analysis" / "reporting" / "pdf"
#: Katalog -> etykieta bytu w komunikacie naruszenia.
FORBIDDEN_C4_DIRECTORIES = {
    STUDY_SCENARIO_DIR: "application/study_scenario (C4)",
    SCENARIO_COMPARISON_DIR: "analysis/scenario_comparison (C4)",
    REPORTING_PDF_DIR: "analysis/reporting/pdf (P24+)",
}
#: Klasy/funkcje C4+P24+ — sprawdzane jako DEFINICJE (ast.ClassDef/FunctionDef)
#: gdziekolwiek w `src`, nie jako dowolne wystąpienie identyfikatora.
FORBIDDEN_C4_CLASS_NAMES = {"ScenarioComparisonBuilder"}
FORBIDDEN_C4_FUNCTION_NAMES = {"export_p24_plus_report_pdf"}

# Karta CV-4.2 (2026-09-05) — bramka wskrzeszenia. Kasacja procedurą 7 kroków:
# P2/S4 kreator (`NetworkWizardService.build_power_flow_input`/
# `build_short_circuit_input` + wyłączni pomocnicy — 0 wywołań produkcyjnych,
# DTO `ShortCircuitInput` z `network_wizard/dtos.py`), P5 (`application/
# power_flow_input_builder.py`, cały plik — konsument P2 skasowany razem z nim),
# P13 (`domain/load_flow_input.py` + `domain/load_flow_validation.py`, tylko
# testy — 0 konsumentów produkcyjnych). Sprawdza WYŁĄCZNIE DEFINICJE
# (ast.ClassDef/FunctionDef) gdziekolwiek w `backend/src`, nie dowolne
# wystąpienie identyfikatora — `network_wizard/dtos.py::InverterSetpoint`/
# `ConverterSetpoint` i edycyjne operacje kreatora ZOSTAJĄ (poza mandatem karty).
FORBIDDEN_CV42_FILES = {
    BACKEND_SRC_DIR
    / "application"
    / "power_flow_input_builder.py": (
        "application/power_flow_input_builder.py (P5) usunięty procedurą w CV-4.2"
    ),
    BACKEND_SRC_DIR
    / "domain"
    / "load_flow_input.py": ("domain/load_flow_input.py (P13) usunięty procedurą w CV-4.2"),
    BACKEND_SRC_DIR
    / "domain"
    / "load_flow_validation.py": (
        "domain/load_flow_validation.py (P13) usunięty procedurą w CV-4.2"
    ),
}
FORBIDDEN_CV42_CLASS_NAMES = {"ShortCircuitInput", "LoadFlowRunInput"}
FORBIDDEN_CV42_FUNCTION_NAMES = {
    "build_power_flow_input",
    "build_short_circuit_input",
    "merge_bus_components",
    "validate_load_flow_input",
}

# Karta CV-4.2b (2026-09-05) — bramka wskrzeszenia WLASNEGO silnika/sesji z
# `DATABASE_URL` w torze biegow. `enm/assembler.py::_uow_factory_biezacy` budowal
# druga, niezalezna baze w tym samym procesie (inna niz `app.state.uow_factory`),
# a `_maybe_load_audit2_extensions` czytal nia konfiguracje audytu 2 — zapisana
# przez API bywala dla biegu niewidoczna. Po karcie: stan bazy czyta wykonawca
# fabryka `UnitOfWork` WOLAJACEGO (`canonical_analysis.rozszerzenia_audit2_dla_opcji`
# + repozytorium `UnitOfWork.audit2_station_configs`), assembler dostaje dane.
# Sprawdzane jako DEFINICJE (ast.FunctionDef) gdziekolwiek w `backend/src`.
FORBIDDEN_CV42B_FUNCTION_NAMES = {
    "_uow_factory_biezacy",
    "_maybe_load_audit2_extensions",
}


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def active_api_module_paths() -> list[Path]:
    module_paths: list[Path] = []
    seen: set[Path] = set()
    for (
        module_name,
        _symbol,
        _include_prefix,
    ) in api_lifecycle_guard._main_included_routers():
        module_path = API_DIR / f"{module_name}.py"
        if module_path.exists() and module_path not in seen:
            seen.add(module_path)
            module_paths.append(module_path)
    return sorted(module_paths)


def check_legacy_public_paths() -> list[str]:
    violations: list[str] = []
    for module_path in active_api_module_paths():
        tree = ast.parse(read_text(module_path), filename=str(module_path))
        rel_path = module_path.relative_to(ROOT).as_posix()
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module in FORBIDDEN_IMPORTS:
                violations.append(f"[legacy-public-import] {rel_path}:{node.lineno}: {node.module}")
            if isinstance(node, ast.Name) and node.id in FORBIDDEN_NAMES:
                violations.append(f"[legacy-public-name] {rel_path}:{node.lineno}: {node.id}")
            if isinstance(node, ast.Attribute) and node.attr in FORBIDDEN_NAMES:
                violations.append(f"[legacy-public-attr] {rel_path}:{node.lineno}: {node.attr}")
            if isinstance(node, ast.Constant) and isinstance(node.value, str):
                if "operating_case_id" in node.value:
                    violations.append(
                        f"[legacy-public-string] {rel_path}:{node.lineno}: operating_case_id"
                    )
    return violations


def check_study_case_engine_resurrection() -> list[str]:
    """C2 (CV-3.2): `study_case_engine.py`/`StudyCaseEngine`/`SolverProtocol`
    nie mogą wrócić — 0 konsumentów w `src` w chwili kasacji, semantyka
    `OperatingMode.N_1/MAINTENANCE` żyje w `RodzajScenariusza` (CV-3.1)."""
    violations: list[str] = []
    if STUDY_CASE_ENGINE_MODULE.exists():
        rel_path = STUDY_CASE_ENGINE_MODULE.relative_to(ROOT).as_posix()
        violations.append(
            f"[resurrected-module] {rel_path}: domain/study_case_engine.py (C2) "
            "usunięty procedurą w CV-3.2 — nie odtwarzaj tego pliku"
        )
    if not BACKEND_SRC_DIR.exists():
        return violations
    for py_file in sorted(BACKEND_SRC_DIR.rglob("*.py")):
        tree = ast.parse(read_text(py_file), filename=str(py_file))
        rel_path = py_file.relative_to(ROOT).as_posix()
        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef) and node.name in FORBIDDEN_ENGINE_CLASS_NAMES:
                violations.append(
                    f"[resurrected-class] {rel_path}:{node.lineno}: class {node.name} "
                    "(C2, usunięty CV-3.2) nie może wrócić"
                )
    return violations


def check_domain_op_registry_resurrection() -> list[str]:
    """C3 (CV-3.2): 9 nazw operacji domenowych nie mogą wrócić do REJESTRU
    (`CANONICAL_OPERATIONS`, `ALL_V2_HANDLERS`, `domainOps.ts`) — sprawdza
    WYŁĄCZNIE obecność jako klucz/wpis rejestru, nigdy dowolne wystąpienie
    identyfikatora w kodzie, żeby nie zapalać się na kolizjach nazw z żywymi
    warstwami C1 (`api/study_cases.py`, `domain/study_case.py`) i E2
    (`api/enm.py`)."""
    violations: list[str] = []
    if CANONICAL_OPS_REGISTRY.exists():
        registered = canonical_ops_guard.extract_canonical_names(CANONICAL_OPS_REGISTRY)
        rel_path = CANONICAL_OPS_REGISTRY.relative_to(ROOT).as_posix()
        for name in sorted(FORBIDDEN_DOMAIN_OP_NAMES & registered):
            violations.append(
                f"[resurrected-registry-entry] {rel_path}: '{name}' (C3, usunięty "
                "CV-3.2) wrócił jako OperationSpec w CANONICAL_OPERATIONS"
            )
    if V2_HANDLERS_MODULE.exists():
        handlers = canonical_ops_guard.extract_handler_keys(V2_HANDLERS_MODULE, {"ALL_V2_HANDLERS"})
        rel_path = V2_HANDLERS_MODULE.relative_to(ROOT).as_posix()
        for name in sorted(FORBIDDEN_DOMAIN_OP_NAMES & handlers):
            violations.append(
                f"[resurrected-handler-entry] {rel_path}: '{name}' (C3, usunięty "
                "CV-3.2) wrócił jako klucz ALL_V2_HANDLERS"
            )
    if FRONTEND_DOMAIN_OPS.exists():
        text = read_text(FRONTEND_DOMAIN_OPS)
        rel_path = FRONTEND_DOMAIN_OPS.relative_to(ROOT).as_posix()
        for name in sorted(FORBIDDEN_DOMAIN_OP_NAMES):
            if f"'{name}'" in text or f'"{name}"' in text:
                violations.append(
                    f"[resurrected-frontend-whitelist] {rel_path}: '{name}' (C3, "
                    "usunięty CV-3.2) wrócił do CANONICAL_OPERATION_NAMES"
                )
    return violations


def check_c4_and_p24_plus_resurrection() -> list[str]:
    """C4 + P24+ (CV-3.2, drugi commit karty): `application/study_scenario/**`,
    `analysis/scenario_comparison/**`, `analysis/reporting/pdf/**` nie mogą
    wrócić. Decyzja architektoniczna: P24+ (jedyny konsument
    `ScenarioComparisonEntry`/`View`) miał 0 wołających w `backend/src` poza
    własnym re-eksportem i 0 tras HTTP — ten sam byt co C4 ("raport bez
    trasy"), skasowany razem z nim."""
    violations: list[str] = []
    for directory, label in FORBIDDEN_C4_DIRECTORIES.items():
        # `directory.exists()` fałszywie zapaliłby się na osieroconym,
        # niegitowanym `__pycache__/` (bytecode z sesji SPRZED kasacji) — guard
        # ma wykryć wskrzeszone ŹRÓDŁO, nie zapomniany artefakt kompilacji.
        if any(directory.glob("*.py")):
            rel_path = directory.relative_to(ROOT).as_posix()
            violations.append(
                f"[resurrected-module] {rel_path}: {label} usunięty procedurą "
                "w CV-3.2 — nie odtwarzaj tego pakietu"
            )
    if not BACKEND_SRC_DIR.exists():
        return violations
    for py_file in sorted(BACKEND_SRC_DIR.rglob("*.py")):
        tree = ast.parse(read_text(py_file), filename=str(py_file))
        rel_path = py_file.relative_to(ROOT).as_posix()
        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef) and node.name in FORBIDDEN_C4_CLASS_NAMES:
                violations.append(
                    f"[resurrected-class] {rel_path}:{node.lineno}: class {node.name} "
                    "(C4, usunięty CV-3.2) nie może wrócić"
                )
            if isinstance(node, ast.FunctionDef) and node.name in FORBIDDEN_C4_FUNCTION_NAMES:
                violations.append(
                    f"[resurrected-function] {rel_path}:{node.lineno}: def {node.name} "
                    "(P24+, usunięty CV-3.2) nie może wrócić"
                )
    return violations


def check_cv42_resurrection() -> list[str]:
    """CV-4.2 (2026-09-05): kreator P2/S4, P5, P13 nie mogą wrócić — żaden miał
    konsumenta produkcyjnego w chwili kasacji (pomiar w meldunku karty), a fizyka
    „szyny złożonej" i wejścia rozpływu/zwarcia żyje wyłącznie w torze kanonicznym
    (`enm/assembler.py::zloz_wejscie_rozplywu`/`zloz_wejscie_zwarcia`)."""
    violations: list[str] = []
    for path, label in FORBIDDEN_CV42_FILES.items():
        if path.exists():
            rel_path = path.relative_to(ROOT).as_posix()
            violations.append(f"[resurrected-module] {rel_path}: {label}")
    if not BACKEND_SRC_DIR.exists():
        return violations
    for py_file in sorted(BACKEND_SRC_DIR.rglob("*.py")):
        tree = ast.parse(read_text(py_file), filename=str(py_file))
        rel_path = py_file.relative_to(ROOT).as_posix()
        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef) and node.name in FORBIDDEN_CV42_CLASS_NAMES:
                violations.append(
                    f"[resurrected-class] {rel_path}:{node.lineno}: class {node.name} "
                    "(usunięty procedurą w CV-4.2) nie może wrócić"
                )
            if isinstance(node, ast.FunctionDef) and node.name in FORBIDDEN_CV42_FUNCTION_NAMES:
                violations.append(
                    f"[resurrected-function] {rel_path}:{node.lineno}: def {node.name} "
                    "(usunięty procedurą w CV-4.2) nie może wrócić"
                )
            if isinstance(node, ast.FunctionDef) and node.name in FORBIDDEN_CV42B_FUNCTION_NAMES:
                violations.append(
                    f"[resurrected-function] {rel_path}:{node.lineno}: def {node.name} "
                    "(własny silnik/sesja z DATABASE_URL w torze biegów, usunięty w CV-4.2b) "
                    "nie może wrócić"
                )
    return violations


def main() -> int:
    violations = (
        check_legacy_public_paths()
        + check_study_case_engine_resurrection()
        + check_domain_op_registry_resurrection()
        + check_c4_and_p24_plus_resurrection()
        + check_cv42_resurrection()
    )
    if violations:
        print("legacy-public-path-guard: FAILED")
        for violation in violations:
            print(f" - {violation}")
        return 1
    print("legacy-public-path-guard: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
