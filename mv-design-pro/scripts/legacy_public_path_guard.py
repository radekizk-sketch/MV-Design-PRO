from __future__ import annotations

import ast
import re
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
FRONTEND_SRC_DIR = ROOT / "frontend" / "src"

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
# `ConverterSetpoint` i edycyjne operacje kreatora ZOSTAŁY wtedy poza mandatem
# karty (skasowane później w W1, 2026-09-09 — bramka W1 niżej).
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

# Karta CV-4.3-A4 (K5, 2026-09-06) — bramka wskrzeszenia. (1) E2 sieroty
# `POST /api/cases/{id}/runs/{short-circuit,power-flow}` (`api/enm.py`)
# skasowane procedura siedmiu krokow (0 konsumentow produkcyjnych — jedyny byl
# e2e nazywajacy je wprost "legacy" we wlasnym kodzie); kanon:
# `POST /api/execution/study-cases/{id}/runs` -> `.../execute`. Sprawdzane
# jako DEFINICJE (ast.FunctionDef/AsyncFunctionDef) W TYM JEDNYM pliku — nazwy
# `run_short_circuit_now`/`run_power_flow_now` (inne funkcje, INNY plik,
# `enm/canonical_analysis.py`) MAJA innych wolajacych bezposrednich i ZOSTAJA,
# guard nie ma prawa sie na nie zapalic. (2) R4 `_runs` w pamieci procesu
# (`api/v126_academic.py`) skasowany na rzecz rejestru `CanonicalRun` (R1) —
# bieg V12.6 musi przezyc restart procesu i wielu workerow, czego slownik w
# pamieci nigdy nie gwarantowal. Sprawdzane jako PRZYPISANIE NAJWYZSZEGO
# POZIOMU (nie dowolna zmienna lokalna) W TYM JEDNYM pliku.
CV43_A4_ENM_MODULE = API_DIR / "enm.py"
FORBIDDEN_CV43_A4_ROUTE_FUNCTION_NAMES = {"run_short_circuit", "run_power_flow"}
CV43_A4_V126_MODULE = API_DIR / "v126_academic.py"
FORBIDDEN_CV43_A4_V126_INMEMORY_NAMES = {"_runs"}


# Karta W1 (2026-09-09) — bramka wskrzeszenia LEGACY PERSYSTENCJI SIECI. Jedyna
# prawda sieci to ENM w magazynie projektu (`enm/store.py`). Rownolegly model ORM
# (`network_snapshots`/`network_nodes`/`network_branches`/`network_sources`/
# `network_loads`/`switching_states`), biblioteka typow w bazie (`line_types`,
# `cable_types`, `transformer_types`, `switch_equipment_types`, `inverter_types`,
# `switch_equipment_assignments`), diagramy SLD w bazie (`sld_diagrams`,
# `sld_node_symbols`, `sld_branch_symbols`, `sld_annotations`) i syntezator
# projektowy (`design_specs`, `design_proposals`, `design_evidence`) — 19 tabel,
# w bazie deweloperskiej 0 wierszy w KAZDEJ (pomiar 2026-09-09) — skasowane
# procedura: `infrastructure/persistence/migracja_legacy_db.py` zrzuca kazda
# tabele do JSON, kompiluje pozostalosci do ENM (`application/migracja_legacy.py`)
# i dopiero potem DROP TABLE. Razem z tabelami zeszly ich jedyni konsumenci oraz
# eksportery wynikow tej samej klasy „0 importerow w src, tylko wlasne testy"
# (lista `W1_LEGACY_RELATIVE_PATHS`). Sprawdzane: (1) zaden z plikow/katalogow
# nie istnieje, (2) zadna klasa z `FORBIDDEN_W1_CLASS_NAMES` nie wraca jako
# DEFINICJA (ast.ClassDef) gdziekolwiek w `backend/src`, (3) zadna nazwa tabeli z
# `FORBIDDEN_W1_TABLE_NAMES` nie wraca jako `__tablename__` (przypisanie w ciele
# klasy) gdziekolwiek w `backend/src`, (4) liczba `__tablename__` w `models.py`
# jest PRZYPIETA (`W1_TABLENAME_PIN`, pomiar po W1) — nowa tabela wymaga swiadomej
# zmiany pinu razem z uzasadnieniem w commicie, nie cichego dopisania.
W1_LEGACY_RELATIVE_PATHS: dict[str, str] = {
    "application/network_wizard/service.py": "kreator sieci legacy (NetworkWizardService)",
    "application/network_wizard/dtos.py": "DTO kreatora sieci legacy",
    "application/network_wizard/errors.py": "wyjątki kreatora sieci legacy",
    "application/network_wizard/exporters": "eksportery kreatora sieci legacy",
    "application/network_wizard/importers": "importery XLSX/JSON kreatora sieci legacy",
    "application/sld": "projekcja/geometria/cross-reference SLD z migawki legacy",
    "application/designer": "silnik projektanta na migawce legacy",
    "application/wizard_runtime": "runtime kreatora na migawce legacy",
    "application/analyses/design_synth": "syntezator projektowy (design_specs/proposals/evidence)",
    "network_model/sld_projection.py": "projekcja SLD z migawki legacy",
    "domain/sld.py": "model diagramu SLD w bazie",
    "api/sld.py": "router diagramów SLD w bazie",
    "diagnostics/diff.py": "porównanie rewizji z tabel network_*",
    "enm/migrations/v_ports_001.py": "automigracja portów bez konsumenta",
    "domain/protection_report_model.py": "model raportu zabezpieczeń bez konsumenta",
    "domain/protection_coordination_v1.py": "koordynacja zabezpieczeń v1 bez konsumenta",
    "network_model/reporting/short_circuit_report_docx.py": "raport DOCX zwarć z migawki legacy",
    "network_model/reporting/short_circuit_report_pdf.py": "raport PDF zwarć z migawki legacy",
    "network_model/reporting/power_flow_report_docx.py": "raport DOCX rozpływu z migawki legacy",
    "network_model/reporting/power_flow_report_pdf.py": "raport PDF rozpływu z migawki legacy",
    "network_model/reporting/analysis_run_report_docx.py": "raport DOCX biegu bez konsumenta (żywy raport: api/analysis_run_exports.py)",
    "network_model/reporting/analysis_run_report_pdf.py": "raport PDF biegu bez konsumenta (żywy raport: api/analysis_run_exports.py)",
    "network_model/reporting/export_docx.py": "generator raportów DOCX SC/PF bez konsumenta",
    "network_model/reporting/export_pdf.py": "generator raportów PDF SC/PF bez konsumenta",
    "network_model/reporting/export_jsonl.py": "eksport JSONL migawki/śladu bez konsumenta",
    "network_model/reporting/export_manifest.py": "manifest eksportu bez konsumenta (żywy: domain/export_manifest.py)",
    "network_model/reporting/power_flow_export.py": "eksport JSON/JSONL rozpływu bez konsumenta",
    "network_model/reporting/short_circuit_export.py": "eksport JSON/JSONL zwarć bez konsumenta",
    "infrastructure/persistence/repositories/network_repository.py": "repozytorium tabel network_*",
    "infrastructure/persistence/repositories/network_wizard_repository.py": "repozytorium kreatora legacy",
    "infrastructure/persistence/repositories/snapshot_repository.py": "repozytorium migawek legacy",
    "infrastructure/persistence/repositories/sld_repository.py": "repozytorium diagramów SLD w bazie",
    "infrastructure/persistence/repositories/design_spec_repository.py": "repozytorium design_specs",
    "infrastructure/persistence/repositories/design_proposal_repository.py": "repozytorium design_proposals",
    "infrastructure/persistence/repositories/design_evidence_repository.py": "repozytorium design_evidence",
}
FORBIDDEN_W1_CLASS_NAMES = {
    "CableTypeORM",
    "DesignEvidenceORM",
    "DesignProposalORM",
    "DesignSpecORM",
    "InverterTypeORM",
    "LineTypeORM",
    "NetworkBranchORM",
    "NetworkLoadORM",
    "NetworkNodeORM",
    "NetworkSnapshotORM",
    "NetworkSourceORM",
    "SldAnnotationORM",
    "SldBranchSymbolORM",
    "SldDiagramORM",
    "SldNodeSymbolORM",
    "SwitchEquipmentAssignmentORM",
    "SwitchEquipmentTypeORM",
    "SwitchingStateORM",
    "TransformerTypeORM",
    "NetworkWizardService",
    "NetworkRepository",
    "NetworkWizardRepository",
    "SnapshotRepository",
    "SldRepository",
    "DesignSpecRepository",
    "DesignProposalRepository",
    "DesignEvidenceRepository",
}
FORBIDDEN_W1_TABLE_NAMES = {
    "cable_types",
    "design_evidence",
    "design_proposals",
    "design_specs",
    "inverter_types",
    "line_types",
    "network_branches",
    "network_loads",
    "network_nodes",
    "network_snapshots",
    "network_sources",
    "network_switching_states",
    "sld_annotations",
    "sld_branch_symbols",
    "sld_diagrams",
    "sld_node_symbols",
    "switch_equipment_assignments",
    "switch_equipment_types",
    "transformer_types",
}
W1_TABLENAME_PIN = 15
W1_MODELS_RELATIVE_PATH = "infrastructure/persistence/models.py"

# Karta KASACJA-DATA-MANAGER (2026-09-09) — bramka wskrzeszenia FRONTENDOWA (jedyna
# w tym pliku poza AST-em backendu: `frontend/src` to TypeScript, ktorego `ast`
# Pythona nie parsuje, wiec sprawdzenie jest tekstowe na definicjach, nie AST).
# `frontend/src/ui/data-manager/**` (DataManager.tsx, BatchEditPreviewDialog.tsx,
# store.ts) skasowany jako martwy kod — pomiar w chwili kasacji: 0 konsumentow
# produkcyjnych (eksportowany WYLACZNIE przez wlasny `index.ts`, zero `<DataManager`
# w App.tsx/powloce/nawigacji), a niesiona rownolegla definicja kolumn elementow
# (klucze-fantomy `bus_id`/`sk_mva` wobec modelu ENM) byla ta sama klasa dlugu, ktora
# K7/K7c-FE naprawily w property-grid. Sprawdzane: (1) katalog nie zawiera ZADNEGO
# `.ts`/`.tsx`, (2) nazwy `DataManager`/`DataManagerRow` nie wracaja jako DEFINICJA
# (nie dowolne wystapienie — komentarz/dokstring nazywajacy kasacje, jak w naglowku
# `ui/__tests__/project-tree.test.ts`, NIE jest definicja) GDZIEKOLWIEK w
# `frontend/src`, nie tylko pod starym katalogiem.
DATA_MANAGER_DIR = FRONTEND_SRC_DIR / "ui" / "data-manager"
FORBIDDEN_DATA_MANAGER_TS_EXTENSIONS = (".ts", ".tsx")
#: Blok `/* ... */` i linia `// ...` — komentarz cytujacy nazwe (np. ten wlasnie
#: naglowek) nie jest definicja. Ta sama technika co `nawigacja_jeden_kanon_guard.py`.
_TS_BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.DOTALL)
_TS_LINE_COMMENT = re.compile(r"//[^\n]*")
_TS_DATA_MANAGER_COMPONENT_DEF = re.compile(
    r"^[ \t]*export\s+(?:default\s+)?(?:function|const|class)\s+DataManager\b",
    re.MULTILINE,
)
_TS_DATA_MANAGER_ROW_DEF = re.compile(
    r"^[ \t]*export\s+(?:interface|type)\s+DataManagerRow\b",
    re.MULTILINE,
)


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


def check_cv43_a4_resurrection() -> list[str]:
    """CV-4.3-A4/K5 (2026-09-06): dwie sieroty E2 (`api/enm.py` POST runs/{short-
    circuit,power-flow}) usunięte procedurą siedmiu kroków (0 konsumentów
    produkcyjnych), V12.6 (`api/v126_academic.py`) przeszło z własnego słownika
    `_runs` w pamięci procesu (R4) na rejestr R1 (`CanonicalRun` przez
    `enm.canonical_analysis.create_run`/`execute_run`) — bieg V12.6 musi
    przeżyć restart procesu i wielu workerów, czego słownik w pamięci nigdy nie
    gwarantował. Guard pilnuje, żeby żaden z trzech bytów nie wrócił."""
    violations: list[str] = []
    if CV43_A4_ENM_MODULE.exists():
        tree = ast.parse(read_text(CV43_A4_ENM_MODULE), filename=str(CV43_A4_ENM_MODULE))
        rel_path = CV43_A4_ENM_MODULE.relative_to(ROOT).as_posix()
        for node in ast.walk(tree):
            if (
                isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef)
                and node.name in FORBIDDEN_CV43_A4_ROUTE_FUNCTION_NAMES
            ):
                violations.append(
                    f"[resurrected-route] {rel_path}:{node.lineno}: def {node.name} "
                    "(E2, usunięty procedurą siedmiu kroków w CV-4.3-A4/K5.1 — 0 "
                    "konsumentów produkcyjnych, tor kanoniczny /api/execution/...) "
                    "nie może wrócić"
                )
    if CV43_A4_V126_MODULE.exists():
        tree = ast.parse(read_text(CV43_A4_V126_MODULE), filename=str(CV43_A4_V126_MODULE))
        rel_path = CV43_A4_V126_MODULE.relative_to(ROOT).as_posix()
        # Przypisanie NAJWYŻSZEGO POZIOMU (`tree.body`, nie `ast.walk`) — zmienna
        # lokalna o tej samej nazwie wewnątrz funkcji pomocniczej nie jest tym
        # bytem, którego kasacja pilnuje (rejestr w pamięci procesu, nie zmienna
        # robocza).
        for node in tree.body:
            targets: list[ast.expr] = []
            if isinstance(node, ast.Assign):
                targets = node.targets
            elif isinstance(node, ast.AnnAssign):
                targets = [node.target]
            for target in targets:
                if (
                    isinstance(target, ast.Name)
                    and target.id in FORBIDDEN_CV43_A4_V126_INMEMORY_NAMES
                ):
                    violations.append(
                        f"[resurrected-inmemory-registry] {rel_path}:{node.lineno}: "
                        f"'{target.id}' (słownik biegów V12.6 w pamięci procesu, "
                        "usunięty w CV-4.3-A4/K5.2 na rzecz CanonicalRun/R1) nie może "
                        "wrócić"
                    )
    return violations


def _tablename_w_klasie(node: ast.ClassDef) -> str | None:
    """Wartosc `__tablename__ = "..."` przypisana wprost w ciele klasy (None, gdy brak)."""
    for stmt in node.body:
        targets: list[ast.expr] = []
        if isinstance(stmt, ast.Assign):
            targets = stmt.targets
        elif isinstance(stmt, ast.AnnAssign):
            targets = [stmt.target]
        else:
            continue
        for target in targets:
            if isinstance(target, ast.Name) and target.id == "__tablename__":
                value = stmt.value
                if isinstance(value, ast.Constant) and isinstance(value.value, str):
                    return value.value
    return None


def check_w1_legacy_persistence_resurrection() -> list[str]:
    """W1 (2026-09-09): legacy persystencja sieci (19 tabel, ich ORM, repozytoria,
    kreator, projekcja SLD, syntezator projektowy, raporty z migawki) nie moze
    wrocic — jedyna prawda sieci to ENM w magazynie projektu. Pin liczby tabel w
    `models.py` zamienia ciche dopisanie tabeli w swiadoma decyzje."""
    violations: list[str] = []
    for rel, label in W1_LEGACY_RELATIVE_PATHS.items():
        path = BACKEND_SRC_DIR / rel
        if path.exists():
            violations.append(f"[resurrected-module] backend/src/{rel}: {label} (usuniety w W1)")
    if not BACKEND_SRC_DIR.exists():
        return violations
    models_path = BACKEND_SRC_DIR / W1_MODELS_RELATIVE_PATH
    for py_file in sorted(BACKEND_SRC_DIR.rglob("*.py")):
        tree = ast.parse(read_text(py_file), filename=str(py_file))
        rel_path = (
            py_file.relative_to(ROOT).as_posix() if py_file.is_relative_to(ROOT) else str(py_file)
        )
        tablenames = 0
        for node in ast.walk(tree):
            if not isinstance(node, ast.ClassDef):
                continue
            if node.name in FORBIDDEN_W1_CLASS_NAMES:
                violations.append(
                    f"[resurrected-class] {rel_path}:{node.lineno}: class {node.name} "
                    "(legacy persystencja sieci, usunieta w W1) nie moze wrocic"
                )
            tablename = _tablename_w_klasie(node)
            if tablename is None:
                continue
            tablenames += 1
            if tablename in FORBIDDEN_W1_TABLE_NAMES:
                violations.append(
                    f"[resurrected-table] {rel_path}:{node.lineno}: __tablename__ = "
                    f"'{tablename}' (tabela legacy usunieta w W1) nie moze wrocic"
                )
        if py_file == models_path and tablenames != W1_TABLENAME_PIN:
            violations.append(
                f"[tablename-pin] {rel_path}: {tablenames} tabel ORM, pin W1_TABLENAME_PIN = "
                f"{W1_TABLENAME_PIN} — nowa/usunieta tabela wymaga swiadomej zmiany pinu "
                "z uzasadnieniem w commicie"
            )
    return violations


def _bez_komentarzy_ts(tekst: str) -> str:
    """Tresc pliku TS/TSX bez komentarzy — cytat nazwy w komentarzu to nie definicja."""
    return _TS_LINE_COMMENT.sub("", _TS_BLOCK_COMMENT.sub("", tekst))


def check_data_manager_resurrection() -> list[str]:
    """Karta KASACJA-DATA-MANAGER (2026-09-09): `ui/data-manager/**` (komponent
    `DataManager`, typ `DataManagerRow`) nie moze wrocic — 0 konsumentow
    produkcyjnych w chwili kasacji (pomiar w meldunku karty). Katalog byl jedynym
    nosicielem rownoleglej, martwej kopii definicji kolumn elementow z kluczami-
    fantomami (`bus_id`/`sk_mva`) wobec modelu ENM."""
    violations: list[str] = []
    if DATA_MANAGER_DIR.exists():
        for suffix in FORBIDDEN_DATA_MANAGER_TS_EXTENSIONS:
            for ts_file in sorted(DATA_MANAGER_DIR.rglob(f"*{suffix}")):
                rel_path = ts_file.relative_to(ROOT).as_posix()
                violations.append(
                    f"[resurrected-module] {rel_path}: frontend/src/ui/data-manager "
                    "usunięty procedurą w karcie KASACJA-DATA-MANAGER (2026-09-09) — "
                    "nie odtwarzaj tego katalogu"
                )
    if not FRONTEND_SRC_DIR.exists():
        return violations
    for suffix in FORBIDDEN_DATA_MANAGER_TS_EXTENSIONS:
        for ts_file in sorted(FRONTEND_SRC_DIR.rglob(f"*{suffix}")):
            tekst = _bez_komentarzy_ts(read_text(ts_file))
            rel_path = ts_file.relative_to(ROOT).as_posix()
            if _TS_DATA_MANAGER_COMPONENT_DEF.search(tekst):
                violations.append(
                    f"[resurrected-component] {rel_path}: export DataManager "
                    "(komponent, usunięty w karcie KASACJA-DATA-MANAGER) nie może wrócić"
                )
            if _TS_DATA_MANAGER_ROW_DEF.search(tekst):
                violations.append(
                    f"[resurrected-type] {rel_path}: export DataManagerRow "
                    "(typ, usunięty w karcie KASACJA-DATA-MANAGER) nie może wrócić"
                )
    return violations


#: Karta K2 (2026-09-09) — bramka wskrzeszenia: `application/reference_networks/**`
#: (dawny dialekt benchmarków — builders/, computation.py, library.py,
#: frozen_solver_input.py, pandapower_bridge.py, report_export.py,
#: similarity_matcher.py, benchmark_wiring.py — DRUGA ścieżka budowy wejścia
#: solwerów, równoległa do kanonicznej ENM → enm/assembler.py → solver) +
#: `api/reference_networks.py` (9 tras `/api/v1/reference-networks/*`) +
#: frontend `ui/reference-networks/**` + `ReferenceNetworkSurface` (ekran
#: zastany, rejestr kanonu) skasowane w całości. Zastępstwo (walidacja solverów
#: vs publikowane benchmarki jako zdolność WERYFIKACYJNA, nie tok pracy
#: inżyniera): `backend/tests/golden/enm_builders/**` + `tests/golden/registry.py`.
K2_REFERENCE_NETWORKS_BACKEND_DIR = "application/reference_networks"
K2_REFERENCE_NETWORKS_API_MODULE = "api/reference_networks.py"
FORBIDDEN_K2_MODULE_PREFIXES = ("application.reference_networks", "api.reference_networks")
FORBIDDEN_K2_CLASS_NAMES = {"ReferenceNetwork"}
K2_REFERENCE_NETWORKS_FRONTEND_DIR = FRONTEND_SRC_DIR / "ui" / "reference-networks"
_TS_REFERENCE_NETWORK_SURFACE_DEF = re.compile(
    r"^[ \t]*export\s+(?:default\s+)?(?:function|const|class)\s+ReferenceNetworkSurface\b",
    re.MULTILINE,
)


def check_k2_reference_networks_resurrection() -> list[str]:
    """Karta K2 (2026-09-09): druga ścieżka budowy wejścia solwerów
    (`application/reference_networks/**`) i jej API (`api/reference_networks.py`)
    i ekran zastany (`ui/reference-networks/**` + `ReferenceNetworkSurface`)
    nie mogą wrócić — 0 konsumentów produktowych poza sobą nawzajem (jedyny
    produkcyjny konsument pakietu było samo API + ten ekran; benchmarki jako
    ENM żyją w `tests/golden/enm_builders/**`, wyrocznia (a) w
    `tests/golden/parytet_benchmarkow/test_wyrocznia_a_expected_json.py`)."""
    violations: list[str] = []
    backend_dir = BACKEND_SRC_DIR / K2_REFERENCE_NETWORKS_BACKEND_DIR
    if backend_dir.exists():
        violations.append(
            f"[resurrected-module] backend/src/{K2_REFERENCE_NETWORKS_BACKEND_DIR}: "
            "dawny dialekt benchmarków (usunięty kartą K2, 2026-09-09) — nie odtwarzaj"
        )
    api_module = BACKEND_SRC_DIR / K2_REFERENCE_NETWORKS_API_MODULE
    if api_module.exists():
        violations.append(
            f"[resurrected-module] backend/src/{K2_REFERENCE_NETWORKS_API_MODULE}: "
            "9 tras /api/v1/reference-networks/* (usunięte kartą K2) — nie odtwarzaj"
        )
    if BACKEND_SRC_DIR.exists():
        for py_file in sorted(BACKEND_SRC_DIR.rglob("*.py")):
            tree = ast.parse(read_text(py_file), filename=str(py_file))
            rel_path = py_file.relative_to(ROOT).as_posix()
            for node in ast.walk(tree):
                if (
                    isinstance(node, ast.ImportFrom)
                    and node.module is not None
                    and any(
                        node.module == prefix or node.module.startswith(prefix + ".")
                        for prefix in FORBIDDEN_K2_MODULE_PREFIXES
                    )
                ):
                    violations.append(
                        f"[legacy-public-import] {rel_path}:{node.lineno}: {node.module} "
                        "(dawny dialekt benchmarków, usunięty kartą K2)"
                    )
                if isinstance(node, ast.ClassDef) and node.name in FORBIDDEN_K2_CLASS_NAMES:
                    violations.append(
                        f"[resurrected-class] {rel_path}:{node.lineno}: class {node.name} "
                        "(dialekt benchmarków, usunięty kartą K2) nie może wrócić"
                    )
    if K2_REFERENCE_NETWORKS_FRONTEND_DIR.exists():
        violations.append(
            "[resurrected-module] frontend/src/ui/reference-networks: ekran zastany "
            "(usunięty kartą K2, 2026-09-09) — nie odtwarzaj tego katalogu"
        )
    if FRONTEND_SRC_DIR.exists():
        for suffix in FORBIDDEN_DATA_MANAGER_TS_EXTENSIONS:
            for ts_file in sorted(FRONTEND_SRC_DIR.rglob(f"*{suffix}")):
                tekst = _bez_komentarzy_ts(read_text(ts_file))
                rel_path = ts_file.relative_to(ROOT).as_posix()
                if _TS_REFERENCE_NETWORK_SURFACE_DEF.search(tekst):
                    violations.append(
                        f"[resurrected-component] {rel_path}: export ReferenceNetworkSurface "
                        "(usunięty kartą K2) nie może wrócić"
                    )
    return violations


def main() -> int:
    violations = (
        check_legacy_public_paths()
        + check_study_case_engine_resurrection()
        + check_domain_op_registry_resurrection()
        + check_c4_and_p24_plus_resurrection()
        + check_cv42_resurrection()
        + check_cv43_a4_resurrection()
        + check_w1_legacy_persistence_resurrection()
        + check_data_manager_resurrection()
        + check_k2_reference_networks_resurrection()
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
