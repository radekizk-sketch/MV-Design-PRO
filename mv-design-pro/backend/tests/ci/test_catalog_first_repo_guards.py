from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = PROJECT_ROOT / "scripts"


def _load_script(module_name: str):
    script_path = SCRIPTS_DIR / f"{module_name}.py"
    spec = importlib.util.spec_from_file_location(module_name, script_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load script module: {script_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


docs_guard = _load_script("docs_guard")
catalog_enforcement_guard = _load_script("catalog_enforcement_guard")
catalog_gate_guard = _load_script("catalog_gate_guard")
catalog_metadata_guard = _load_script("catalog_metadata_guard")
repo_hygiene_guard = _load_script("repo_hygiene_guard")


def test_docs_guard_required_binding_inventory_exists_in_repo():
    assert docs_guard.check_required_binding_docs(PROJECT_ROOT) == []


def test_root_docs_guard_workflow_runs_docs_guard():
    workflow = (PROJECT_ROOT.parent / ".github" / "workflows" / "docs-guard.yml").read_text(
        encoding="utf-8"
    )
    assert "python mv-design-pro/scripts/docs_guard.py" in workflow


def test_catalog_gate_guard_accepts_helper_based_catalog_gate():
    assert catalog_gate_guard.check_catalog_gates() == []


def test_catalog_enforcement_guard_covers_required_operations():
    assert catalog_enforcement_guard.check_catalog_required_operations() == []


def test_catalog_enforcement_guard_accepts_canonical_extraction_paths():
    assert catalog_enforcement_guard.check_catalog_binding_extraction_paths() == []


def test_catalog_enforcement_guard_blocks_clear_catalog_for_technical_elements():
    assert catalog_enforcement_guard.check_clear_catalog_protection() == []


def test_catalog_metadata_guard_preserves_frozen_metadata_and_widths():
    assert catalog_metadata_guard.main() == 0


def test_root_arch_guard_workflow_runs_repo_hygiene_guard():
    workflow = (PROJECT_ROOT.parent / ".github" / "workflows" / "arch-guard.yml").read_text(
        encoding="utf-8"
    )
    assert "python mv-design-pro/scripts/arch_guard.py" in workflow
    assert "python mv-design-pro/scripts/repo_hygiene_guard.py" in workflow


def test_root_python_workflow_runs_catalog_first_backend_guards():
    workflow = (PROJECT_ROOT.parent / ".github" / "workflows" / "python-tests.yml").read_text(
        encoding="utf-8"
    )
    for command in (
        "python scripts/catalog_binding_guard.py",
        "poetry run python ../scripts/catalog_enforcement_guard.py",
        "python scripts/catalog_gate_guard.py",
        "poetry run python ../scripts/transformer_catalog_voltage_guard.py",
        "poetry run python ../scripts/fix_action_completeness_guard.py",
        "python scripts/audit_contract_guard.py",
        "python scripts/domain_no_guessing_guard.py",
        "python scripts/pcc_zero_guard.py",
        "python scripts/repo_hygiene_guard.py",
        "poetry run python ../scripts/catalog_metadata_guard.py",
    ):
        assert command in workflow


def test_repo_hygiene_guard_detects_legacy_active_route_and_skips_comment(tmp_path: Path):
    app_file = tmp_path / "frontend" / "src" / "App.tsx"
    app_file.parent.mkdir(parents=True, exist_ok=True)
    app_file.write_text(
        "if (route === '#results-workspace') {\n" "  window.location.hash = '#results';\n" "}\n",
        encoding="utf-8",
    )

    issue_panel = tmp_path / "frontend" / "src" / "ui" / "issue-panel" / "IssuePanelContainer.tsx"
    issue_panel.parent.mkdir(parents=True, exist_ok=True)
    issue_panel.write_text(
        "// Legacy /api/issues is disabled and should not count from comments.\n",
        encoding="utf-8",
    )

    violations = repo_hygiene_guard.check_active_legacy_refs(tmp_path)

    assert len(violations) == 1
    assert violations[0].path == "frontend/src/App.tsx"
    assert "#results-workspace" in violations[0].context


def test_repo_hygiene_guard_detects_legacy_backend_mount(tmp_path: Path):
    main_file = tmp_path / "backend" / "src" / "api" / "main.py"
    main_file.parent.mkdir(parents=True, exist_ok=True)
    main_file.write_text(
        "from api import issues\n" "app.include_router(issues.router)\n",
        encoding="utf-8",
    )

    violations = repo_hygiene_guard.check_backend_main_mounts(tmp_path)

    assert len(violations) == 2
    assert all(violation.path == "backend/src/api/main.py" for violation in violations)
    assert any("issues.router" in violation.context for violation in violations)


def test_repo_hygiene_guard_detects_legacy_design_synth_mount(tmp_path: Path):
    main_file = tmp_path / "backend" / "src" / "api" / "main.py"
    main_file.parent.mkdir(parents=True, exist_ok=True)
    main_file.write_text(
        "from api.design_synth import router as design_synth_router\n"
        "app.include_router(design_synth_router)\n",
        encoding="utf-8",
    )

    violations = repo_hygiene_guard.check_backend_main_mounts(tmp_path)

    assert violations
    assert any("design_synth_router" in violation.context for violation in violations)


def test_repo_hygiene_guard_detects_todo_in_critical_path(tmp_path: Path):
    form_file = (
        tmp_path / "frontend" / "src" / "ui" / "network-build" / "forms" / "ContinueTrunkForm.tsx"
    )
    form_file.parent.mkdir(parents=True, exist_ok=True)
    form_file.write_text("// TODO: remove legacy fallback\n", encoding="utf-8")

    violations = repo_hygiene_guard.check_todo_fixme(tmp_path)

    assert len(violations) == 1
    assert violations[0].path.endswith("ContinueTrunkForm.tsx")
    assert violations[0].rule == "TODO marker"


def test_repo_hygiene_guard_detects_fixme_in_analysis_runs(tmp_path: Path):
    api_file = tmp_path / "backend" / "src" / "api" / "analysis_runs.py"
    api_file.parent.mkdir(parents=True, exist_ok=True)
    api_file.write_text("# FIXME: remove temporary branch\n", encoding="utf-8")

    violations = repo_hygiene_guard.check_todo_fixme(tmp_path)

    assert len(violations) == 1
    assert violations[0].path == "backend/src/api/analysis_runs.py"
    assert violations[0].rule == "FIXME marker"


def test_repo_hygiene_guard_detects_catalog_guessing_in_sld(tmp_path: Path):
    sld_file = tmp_path / "frontend" / "src" / "ui" / "sld" / "SldEditorPage.tsx"
    sld_file.parent.mkdir(parents=True, exist_ok=True)
    sld_file.write_text(
        "import { getDefaultBindingForElement } from './catalogDefaults';\n",
        encoding="utf-8",
    )

    violations = repo_hygiene_guard.check_catalog_guessing(tmp_path)

    assert len(violations) == 1
    assert violations[0].path == "frontend/src/ui/sld/SldEditorPage.tsx"
    assert "catalogDefaults" in violations[0].context


def test_repo_hygiene_guard_detects_catalog_guessing_in_active_modal(tmp_path: Path):
    modal_file = (
        tmp_path / "frontend" / "src" / "ui" / "topology" / "modals" / "GridSourceModal.tsx"
    )
    modal_file.parent.mkdir(parents=True, exist_ok=True)
    modal_file.write_text(
        "const binding = inferCatalogNamespaceFromElement(element);\n",
        encoding="utf-8",
    )

    violations = repo_hygiene_guard.check_catalog_guessing(tmp_path)

    assert len(violations) == 1
    assert violations[0].path == "frontend/src/ui/topology/modals/GridSourceModal.tsx"
    assert "inferCatalogNamespaceFromElement" in violations[0].context


def test_repo_hygiene_guard_detects_legacy_catalog_payload_alias_in_types(tmp_path: Path):
    types_file = tmp_path / "frontend" / "src" / "types" / "domainOps.ts"
    types_file.parent.mkdir(parents=True, exist_ok=True)
    types_file.write_text(
        "export interface SegmentSpec {\n" "  catalog_ref: string | null;\n" "}\n",
        encoding="utf-8",
    )

    violations = repo_hygiene_guard.check_legacy_catalog_payloads(tmp_path)

    assert len(violations) == 1
    assert violations[0].path == "frontend/src/types/domainOps.ts"
    assert violations[0].rule == "legacy catalog_ref payload field in active frontend types/e2e"


def test_repo_hygiene_guard_scans_e2e_specs_for_legacy_payload_aliases(tmp_path: Path):
    spec_file = tmp_path / "frontend" / "e2e" / "catalog-enforcement.spec.ts"
    spec_file.parent.mkdir(parents=True, exist_ok=True)
    spec_file.write_text(
        "const payload = {\n"
        "  transformer_catalog_ref: 'TRAFO-001',\n"
        "  from_bus_ref: 'bus_1',\n"
        "};\n",
        encoding="utf-8",
    )

    violations = repo_hygiene_guard.check_legacy_catalog_payloads(tmp_path)

    assert len(violations) == 2
    assert all(
        violation.path == "frontend/e2e/catalog-enforcement.spec.ts" for violation in violations
    )


def test_docs_guard_detects_missing_repo_reference_in_stage_doc(tmp_path: Path):
    docs_dir = tmp_path / "docs"
    for rel_path in docs_guard.REQUIRED_STAGE_DOCS:
        full_path = tmp_path / rel_path
        full_path.parent.mkdir(parents=True, exist_ok=True)
        full_path.write_text("# placeholder\n", encoding="utf-8")

    target_doc = docs_dir / "qa" / "MACIERZ_TESTOW_GLOBALNYCH.md"
    target_doc.write_text(
        "# MACIERZ\n" "- `frontend/src/ui/sld/__tests__/ghost.test.ts`\n",
        encoding="utf-8",
    )

    violations = docs_guard.check_stage_doc_file_references(tmp_path)

    assert len(violations) == 1
    assert "docs/qa/MACIERZ_TESTOW_GLOBALNYCH.md:2: missing repo reference -> frontend/src/ui/sld/__tests__/ghost.test.ts" in violations[
        0
    ].replace(
        "\\", "/"
    )
