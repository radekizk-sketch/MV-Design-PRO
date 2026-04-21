from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]

REQUIRED_STAGE_DOCS = [
    "docs/system/SPEC_KATALOGI_I_MATERIALIZACJA_PARAMETROW.md",
    "docs/system/SPEC_MODEL_SYSTEMOWY_SN.md",
    "docs/system/SPEC_OPERACJE_DOMENOWE_I_SNAPSHOT.md",
    "docs/system/SPEC_GOTOWOSC_I_DZIALANIA_NAPRAWCZE.md",
    "docs/system/SPEC_ANALIZY_WYNIKI_WHITE_BOX_RAPORTY.md",
    "docs/system/SPEC_TYPOSZEREGI_I_KLASY_ELEMENTOW_TECHNICZNYCH.md",
    "docs/ui/UX_KATALOG_FIRST_DLA_INZYNIERA_SIECI_SN.md",
    "docs/ui/UX_KREATOR_SIECI_SN_OD_GPZ.md",
    "docs/ui/UX_INSPEKTOR_ANALIZA_WHITE_BOX_RAPORT.md",
    "docs/ui/UX_ZESTAWIENIA_MATERIALOWE_I_KOMPLETNOSC_TECHNICZNA.md",
    "docs/sld/SLD_SYSTEM_SPEC_CANONICAL.md",
    "docs/sld/SLD_MODEL_SEMANTYCZNY.md",
    "docs/sld/SLD_GEOMETRIA_KANONICZNA.md",
    "docs/sld/SLD_TYPY_STACJI_KANONICZNE.md",
    "docs/qa/MACIERZ_TESTOW_GLOBALNYCH.md",
    "docs/audit/AUDYT_KATALOG_FIRST_END_TO_END.md",
    "docs/audit/REPO_HYGIENE_PO_ETAPIE_KATALOG_FIRST.md",
]

ACTIVE_CODE_ROOTS = [
    REPO_ROOT / "backend" / "src" / "enm",
    REPO_ROOT / "backend" / "src" / "api" / "enm.py",
    REPO_ROOT / "backend" / "src" / "api" / "analysis_runs.py",
    REPO_ROOT / "backend" / "src" / "api" / "catalog.py",
    REPO_ROOT / "backend" / "src" / "api" / "domain_ops_policy.py",
    REPO_ROOT / "frontend" / "src" / "App.tsx",
    REPO_ROOT / "frontend" / "src" / "ui" / "network-build",
    REPO_ROOT / "frontend" / "src" / "ui" / "results-inspector",
    REPO_ROOT / "frontend" / "src" / "ui" / "proof",
    REPO_ROOT / "frontend" / "src" / "ui" / "sld",
]


def _iter_source_files(root: Path) -> list[Path]:
    if root.is_file():
        return [root]
    if not root.exists():
        return []
    extensions = {".py", ".ts", ".tsx", ".md"}
    return sorted(path for path in root.rglob("*") if path.is_file() and path.suffix in extensions)


def test_required_stage_docs_exist() -> None:
    missing = [rel for rel in REQUIRED_STAGE_DOCS if not (REPO_ROOT / rel).exists()]
    assert not missing, f"Brak wymaganych dokumentów etapu: {missing}"


def test_results_workspace_path_is_removed_from_active_code() -> None:
    violations: list[str] = []
    for root in ACTIVE_CODE_ROOTS:
        for path in _iter_source_files(root):
            text = path.read_text(encoding="utf-8", errors="ignore")
            if "results-workspace" in text or "/api/results-workspace" in text:
                violations.append(str(path.relative_to(REPO_ROOT)))
    assert not violations, f"Aktywny kod nadal odwołuje się do results-workspace: {violations}"


def test_legacy_issue_api_is_removed_from_active_code() -> None:
    violations: list[str] = []
    for root in ACTIVE_CODE_ROOTS:
        for path in _iter_source_files(root):
            text = path.read_text(encoding="utf-8", errors="ignore")
            if "/api/issues" in text:
                violations.append(str(path.relative_to(REPO_ROOT)))
    assert not violations, f"Aktywny kod nadal odwołuje się do /api/issues: {violations}"


def test_no_todo_fixme_in_catalog_first_critical_paths() -> None:
    violations: list[str] = []
    critical_roots = [
        REPO_ROOT / "backend" / "src" / "enm",
        REPO_ROOT / "backend" / "src" / "api" / "enm.py",
        REPO_ROOT / "backend" / "src" / "api" / "analysis_runs.py",
        REPO_ROOT / "backend" / "src" / "api" / "catalog.py",
        REPO_ROOT / "backend" / "src" / "api" / "domain_ops_policy.py",
        REPO_ROOT / "frontend" / "src" / "ui" / "network-build",
        REPO_ROOT / "frontend" / "src" / "ui" / "sld",
        REPO_ROOT / "frontend" / "src" / "ui" / "results-inspector",
        REPO_ROOT / "frontend" / "src" / "ui" / "proof",
        REPO_ROOT / "frontend" / "src" / "ui" / "topology",
    ]
    for root in critical_roots:
        for path in _iter_source_files(root):
            for line_no, line in enumerate(
                path.read_text(encoding="utf-8", errors="ignore").splitlines(), start=1
            ):
                stripped = line.strip()
                if "TODO" in stripped or "FIXME" in stripped:
                    violations.append(f"{path.relative_to(REPO_ROOT)}:{line_no}: {stripped}")
    assert not violations, "Wykryto TODO/FIXME w krytycznych ścieżkach:\n" + "\n".join(
        violations[:20]
    )


def test_catalog_optional_language_is_absent_in_active_modals() -> None:
    targets = [
        REPO_ROOT / "frontend" / "src" / "ui" / "topology" / "modals" / "GridSourceModal.tsx",
        REPO_ROOT / "frontend" / "src" / "ui" / "topology" / "modals" / "TrunkContinueModal.tsx",
        REPO_ROOT / "frontend" / "src" / "ui" / "topology" / "modals" / "SectionSwitchModal.tsx",
        REPO_ROOT / "frontend" / "src" / "ui" / "topology" / "modals" / "RingCloseModal.tsx",
    ]
    violations: list[str] = []
    forbidden_fragments = ['placeholder="opcjonalnie"', "Brak katalogu nie blokuje"]
    for path in targets:
        text = path.read_text(encoding="utf-8", errors="ignore")
        for fragment in forbidden_fragments:
            if fragment in text:
                violations.append(f"{path.relative_to(REPO_ROOT)}: {fragment}")
    assert (
        not violations
    ), f"W aktywnych modalach pozostał język niezgodny z katalog-first: {violations}"


def test_legacy_catalog_first_routers_are_not_mounted_in_api_main() -> None:
    main_path = REPO_ROOT / "backend" / "src" / "api" / "main.py"
    text = main_path.read_text(encoding="utf-8", errors="ignore")
    forbidden_fragments = [
        "design_synth_router",
        "protection_runs_router",
        "domain_operations_router",
        "issues_router",
        "results_workspace_router",
    ]
    violations = [fragment for fragment in forbidden_fragments if fragment in text]
    assert not violations, f"api.main nadal zawiera legacy routery: {violations}"


def test_no_default_catalog_guessing_helpers_in_active_modals_and_sld() -> None:
    targets = [
        REPO_ROOT / "frontend" / "src" / "ui" / "topology" / "modals",
        REPO_ROOT / "frontend" / "src" / "ui" / "sld",
    ]
    forbidden_fragments = [
        "catalogDefaults",
        "inferCatalogNamespaceFromElement",
        "getDefaultBindingForElement",
        "DEFAULT_CATALOG_VERSION",
    ]
    violations: list[str] = []
    for root in targets:
        for path in _iter_source_files(root):
            text = path.read_text(encoding="utf-8", errors="ignore")
            for fragment in forbidden_fragments:
                if fragment in text:
                    violations.append(f"{path.relative_to(REPO_ROOT)}: {fragment}")
    assert not violations, f"Aktywne modale/SLD nadal zgadujÄ… katalog: {violations}"


def test_dead_legacy_modules_are_deleted() -> None:
    forbidden_paths = [
        REPO_ROOT / "backend" / "src" / "api" / "issues.py",
        REPO_ROOT / "backend" / "src" / "api" / "results_workspace.py",
        REPO_ROOT / "frontend" / "src" / "ui" / "results-workspace",
        REPO_ROOT / "scripts" / "results_workspace_determinism_guard.py",
    ]
    existing = [str(path.relative_to(REPO_ROOT)) for path in forbidden_paths if path.exists()]
    assert not existing, f"Pozostały martwe moduły legacy: {existing}"
