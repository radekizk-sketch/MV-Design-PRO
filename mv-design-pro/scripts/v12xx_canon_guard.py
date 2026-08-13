from __future__ import annotations

import re
import sys
from pathlib import Path

import api_lifecycle_guard
import interaction_matrix_guard
import legacy_public_path_guard
import reference_networks_guard
import severity_contract_guard

ROOT = Path(__file__).resolve().parents[1]
DOCS_DIR = ROOT / "docs"
V12XX_DIR = DOCS_DIR / "v12xx"
CANON_PATH = V12XX_DIR / "KANON_V12_XX.md"
INDEX_CANONICAL = DOCS_DIR / "INDEX_KANONICZNY.md"
INDEX = DOCS_DIR / "INDEX.md"
API_MATRIX_PATH = V12XX_DIR / "MACIERZ_KOMPATYBILNOSCI_API.md"
DECISION_REGISTER_PATH = V12XX_DIR / "REJESTR_DECYZJI.md"
DEBT_REGISTER_PATH = V12XX_DIR / "REJESTR_DLUGU.md"
BACKLOG_PATH = V12XX_DIR / "BACKLOG_WDROZENIOWY_V12_XX.md"
RED_TEAM_PATH = V12XX_DIR / "RED_TEAM_FINAL_V12_XX.md"
COVERAGE_MATRIX_PATH = V12XX_DIR / "MACIERZ_POKRYCIA_END_TO_END.md"
PLAYWRIGHT_ENV_PATH = ROOT / "frontend" / "scripts" / "playwright-env.mjs"
PLAYWRIGHT_SETUP_PATH = ROOT / "frontend" / "scripts" / "playwright-setup.mjs"
PLAYWRIGHT_CONFIG_PATH = ROOT / "frontend" / "playwright.config.ts"

REQUIRED_FILES = {
    "KANON_V12_XX.md",
    "REJESTR_DECYZJI.md",
    "REJESTR_KONFLIKTOW.md",
    "REJESTR_DLUGU.md",
    "MIGRACJA_ENM_V1_V2.md",
    "MACIERZ_INVALIDACJI.md",
    "MACIERZ_INTERAKCJI.md",
    "MACIERZ_TESTOW_V12_XX.md",
    "MACIERZ_UPRAWNIEN.md",
    "MACIERZ_KOMPATYBILNOSCI_API.md",
    "MACIERZ_RAPORTOWALNOSCI.md",
    "MACIERZ_ID_I_REFERENCJI.md",
    "MACIERZ_POKRYCIA_END_TO_END.md",
    "MACIERZ_DRAFT_VS_COMMITTED.md",
    "RAPORT_M0_INWENTARYZACJA.md",
    "BACKLOG_WDROZENIOWY_V12_XX.md",
    "RED_TEAM_FINAL_V12_XX.md",
}

REQUIRED_CANON_MARKERS = (
    "ENM v2.0 jest jedynym zrodlem prawdy domenowej",
    "Draft formularza nie jest prawda domenowa",
    "Przypadek obliczeniowy okresla rodzaj analizy",
    "Newton-Raphson jest solverem podstawowym i kanonicznym",
    "Automatyka prewencyjna, eliminacyjna i restytucyjna jest bytem pierwszej klasy",
)

SPEC_LINK_RE = re.compile(r"\]\((?:\./|\.\./)?spec(?:/[^)]*)?\)")

REQUIRED_API_ENDPOINTS = {
    "/api/cases/{id}/enm/v2-projection": {
        "Wersja": "v12xx.m1",
        "Status": "adapter",
        "Testy": "test endpointu projekcji ENM v2",
    },
}

REQUIRED_DECISIONS = {
    "V12D-013": {
        "Status": "zatwierdzona",
        "Obszar": "API / migracja",
        "Decyzja": "/api/cases/{id}/enm/v2-projection",
    },
    "V12D-014": {
        "Status": "zatwierdzona",
        "Obszar": "UI / ENM",
        "Decyzja": "MACIERZ_DRAFT_VS_COMMITTED.md",
    },
    "V12D-016": {
        "Status": "zatwierdzona",
        "Obszar": "UI / solver",
        "Decyzja": "create_run",
    },
    "V12D-021": {
        "Status": "zatwierdzona",
        "Obszar": "solver / raport / uzasadnienie",
        "Decyzja": "proof_status",
    },
    "V12D-022": {
        "Status": "zatwierdzona",
        "Obszar": "API / governance",
        "Decyzja": "MACIERZ_KOMPATYBILNOSCI_API.md",
    },
    "V12D-023": {
        "Status": "zatwierdzona",
        "Obszar": "walidacje / governance",
        "Decyzja": "enm.severity",
    },
    "V12D-024": {
        "Status": "zatwierdzona",
        "Obszar": "testy / E2E",
        "Decyzja": "PLAYWRIGHT_CHROMIUM_VERSION_TIMEOUT_MS",
    },
    "V12D-028": {
        "Status": "zatwierdzona",
        "Obszar": "SLD / governance",
        "Decyzja": "interaction_matrix_guard.py",
    },
    "V12D-029": {
        "Status": "zatwierdzona",
        "Obszar": "testy / governance",
        "Decyzja": "reference_networks_guard.py",
    },
    "V12D-030": {
        "Status": "zatwierdzona",
        "Obszar": "ENM / OZE",
        "Decyzja": "FW_PMSG",
    },
    "V12D-031": {
        "Status": "zatwierdzona",
        "Obszar": "OZE / zgodnosc",
        "Decyzja": "generator_technology",
    },
    "V12D-032": {
        "Status": "zatwierdzona",
        "Obszar": "API / migracja",
        "Decyzja": "legacy_public_path_guard.py",
    },
    "V12D-033": {
        "Status": "zatwierdzona",
        "Obszar": "UI / SLD / OZE",
        "Decyzja": "fw_pmsg",
    },
    "V12D-034": {
        "Status": "zatwierdzona",
        "Obszar": "API / EAZ",
        "Decyzja": "protection-engine/v1",
    },
    "V12D-035": {
        "Status": "zatwierdzona",
        "Obszar": "governance / testy",
        "Decyzja": "MACIERZ_POKRYCIA_END_TO_END.md",
    },
    "V12D-036": {
        "Status": "zatwierdzona",
        "Obszar": "UI / dark SCADA",
        "Decyzja": "mv-dark-scada",
    },
}


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def normalize_endpoint(endpoint: str) -> str:
    cleaned = endpoint.strip().strip("`")
    parts = cleaned.split(maxsplit=1)
    if len(parts) == 2 and parts[0].isupper():
        cleaned = parts[1]
    return cleaned.replace("{case_id}", "{id}")


def markdown_table_rows(text: str) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    current_headers: list[str] | None = None
    expecting_separator = False

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line.startswith("|") or not line.endswith("|"):
            current_headers = None
            expecting_separator = False
            continue

        cells = [cell.strip() for cell in line.strip("|").split("|")]
        if expecting_separator:
            if all(re.fullmatch(r":?-{3,}:?", cell) for cell in cells):
                expecting_separator = False
                continue
            current_headers = None
            expecting_separator = False

        if current_headers is None:
            current_headers = cells
            expecting_separator = True
            continue

        if len(cells) != len(current_headers):
            continue
        rows.append(dict(zip(current_headers, cells, strict=True)))

    return rows


def check_required_files() -> list[str]:
    violations: list[str] = []
    if not V12XX_DIR.exists():
        return [f"[missing-dir] {V12XX_DIR.relative_to(ROOT).as_posix()}"]
    for file_name in sorted(REQUIRED_FILES):
        path = V12XX_DIR / file_name
        if not path.exists():
            violations.append(f"[missing-file] {path.relative_to(ROOT).as_posix()}")
    return violations


def check_indexes() -> list[str]:
    violations: list[str] = []
    expected = "v12xx/KANON_V12_XX.md"
    for path in (INDEX, INDEX_CANONICAL):
        if not path.exists():
            violations.append(f"[missing-index] {path.relative_to(ROOT).as_posix()}")
            continue
        if expected not in read_text(path):
            violations.append(
                f"[index-link] {path.relative_to(ROOT).as_posix()} must link to {expected}"
            )
    return violations


def check_canon_markers() -> list[str]:
    if not CANON_PATH.exists():
        return []
    text = read_text(CANON_PATH)
    violations: list[str] = []
    for marker in REQUIRED_CANON_MARKERS:
        if marker not in text:
            violations.append(f"[canon-marker] missing marker: {marker}")
    return violations


def check_no_active_spec_links() -> list[str]:
    violations: list[str] = []
    for path in sorted(V12XX_DIR.glob("*.md")):
        for line_no, line in enumerate(read_text(path).splitlines(), start=1):
            if SPEC_LINK_RE.search(line):
                rel_path = path.relative_to(ROOT).as_posix()
                violations.append(
                    f"[historical-spec-link] {rel_path}:{line_no}: active V12.xx docs must not link canon through docs/spec/"
                )
    return violations


def check_api_compatibility_matrix() -> list[str]:
    if not API_MATRIX_PATH.exists():
        return []

    rows = markdown_table_rows(read_text(API_MATRIX_PATH))
    rows_by_endpoint: dict[str, dict[str, str]] = {}
    for row in rows:
        endpoint = row.get("Endpoint", "")
        if not endpoint:
            continue
        rows_by_endpoint[endpoint] = row
        rows_by_endpoint[endpoint.strip().strip("`")] = row
        rows_by_endpoint[normalize_endpoint(endpoint)] = row
    violations: list[str] = []

    for endpoint, required_fields in REQUIRED_API_ENDPOINTS.items():
        row = (
            rows_by_endpoint.get(f"`{endpoint}`")
            or rows_by_endpoint.get(endpoint)
            or rows_by_endpoint.get(normalize_endpoint(endpoint))
        )
        if row is None:
            violations.append(f"[api-matrix-endpoint] missing required endpoint: {endpoint}")
            continue

        for field, expected_fragment in required_fields.items():
            actual = row.get(field, "")
            if expected_fragment not in actual:
                violations.append(
                    f"[api-matrix-field] {endpoint} field {field} must include {expected_fragment!r}"
                )

    return violations


def check_decision_register() -> list[str]:
    if not DECISION_REGISTER_PATH.exists():
        return []

    rows = markdown_table_rows(read_text(DECISION_REGISTER_PATH))
    rows_by_code = {row.get("Kod", ""): row for row in rows if "Kod" in row}
    violations: list[str] = []

    for code, required_fields in REQUIRED_DECISIONS.items():
        row = rows_by_code.get(code)
        if row is None:
            violations.append(f"[decision-register] missing required decision: {code}")
            continue

        for field, expected_fragment in required_fields.items():
            actual = row.get(field, "")
            if expected_fragment not in actual:
                violations.append(
                    f"[decision-register-field] {code} field {field} must include {expected_fragment!r}"
                )

    return violations


def check_v12_debt_closure() -> list[str]:
    violations: list[str] = []

    if DEBT_REGISTER_PATH.exists():
        for row in markdown_table_rows(read_text(DEBT_REGISTER_PATH)):
            code = row.get("Kod", "")
            if not code.startswith("V12T-"):
                continue
            status = row.get("Status", "")
            if "zamkniety" not in status:
                violations.append(f"[debt-register-open] {code} has non-closed status {status!r}")

    if BACKLOG_PATH.exists():
        for row in markdown_table_rows(read_text(BACKLOG_PATH)):
            code = row.get("Kod", "")
            if not code.startswith("V12-BL-"):
                continue
            status = row.get("Status", "")
            if not status.startswith("zamkniete"):
                violations.append(f"[backlog-open] {code} has non-closed status {status!r}")

    if RED_TEAM_PATH.exists():
        text = read_text(RED_TEAM_PATH)
        forbidden_fragments = (
            "Otwarte pozycje",
            "Ryzyka niekrytyczne pozostajace w sledzeniu",
        )
        for fragment in forbidden_fragments:
            if fragment in text:
                violations.append(f"[red-team-open-debt] forbidden fragment remains: {fragment}")

    return violations


def check_removed_legacy_public_endpoints() -> list[str]:
    violations: list[str] = []
    forbidden_prefix = "/api/protection-engine/v1"

    active_routes = api_lifecycle_guard.discover_active_api_routes()
    for route in active_routes:
        if route.path.startswith(forbidden_prefix):
            violations.append(f"[removed-legacy-active-route] {route.key} from {route.source}")

    if API_MATRIX_PATH.exists():
        rows = markdown_table_rows(read_text(API_MATRIX_PATH))
        for row in rows:
            endpoint = normalize_endpoint(row.get("Endpoint", ""))
            if forbidden_prefix not in endpoint:
                continue
            if row.get("Status") != "usuniety":
                violations.append(
                    f"[removed-legacy-api-status] {endpoint} must have status usuniety"
                )

    return violations


def check_end_to_end_coverage_matrix() -> list[str]:
    if not COVERAGE_MATRIX_PATH.exists():
        return [f"[coverage-matrix-missing] {COVERAGE_MATRIX_PATH.relative_to(ROOT).as_posix()}"]

    rows = [row for row in markdown_table_rows(read_text(COVERAGE_MATRIX_PATH)) if row.get("Wymog")]
    violations: list[str] = []
    if not rows:
        violations.append("[coverage-matrix-empty] no requirement rows found")
        return violations

    required_columns = {
        "Wymog",
        "Dokument",
        "Model",
        "Backend",
        "API",
        "UI",
        "SLD",
        "Wynik",
        "Uzasadnienie",
        "Raport",
        "Test",
        "Status",
    }
    for index, row in enumerate(rows, start=1):
        missing = sorted(column for column in required_columns if column not in row)
        if missing:
            violations.append(
                f"[coverage-matrix-columns] row {index} missing columns: {', '.join(missing)}"
            )
            continue
        if row.get("Status") != "WDROZONE":
            violations.append(
                f"[coverage-matrix-status] {row.get('Wymog')} has status {row.get('Status')!r}"
            )
        for column in required_columns - {"Status"}:
            value = row.get(column, "").strip()
            if not value:
                violations.append(
                    f"[coverage-matrix-empty-cell] {row.get('Wymog')} column {column}"
                )

    return violations


def check_playwright_env_timeout() -> list[str]:
    if not PLAYWRIGHT_ENV_PATH.exists():
        return [f"[playwright-env-missing] {PLAYWRIGHT_ENV_PATH.relative_to(ROOT).as_posix()}"]

    text = read_text(PLAYWRIGHT_ENV_PATH)
    required_fragments = (
        "PLAYWRIGHT_CHROMIUM_VERSION_TIMEOUT_MS",
        "createRequire(import.meta.url)",
        "playwright.chromium",
        "isExistingExecutable(bundled)",
        "timeout: CHROMIUM_VERSION_TIMEOUT_MS",
        "windowsHide: true",
    )
    violations: list[str] = []
    for fragment in required_fragments:
        if fragment not in text:
            violations.append(
                f"[playwright-env-timeout] frontend/scripts/playwright-env.mjs must include {fragment!r}"
            )
    return violations


def check_playwright_webserver_lifecycle() -> list[str]:
    if not PLAYWRIGHT_CONFIG_PATH.exists():
        return [
            f"[playwright-config-missing] {PLAYWRIGHT_CONFIG_PATH.relative_to(ROOT).as_posix()}"
        ]

    text = read_text(PLAYWRIGHT_CONFIG_PATH)
    violations: list[str] = []
    forbidden_fragments = (
        "Set-Location ..\\backend",
        "cd ../backend",
        "uvicorn src.api.main:app --host 0.0.0.0",
    )
    for fragment in forbidden_fragments:
        if fragment in text:
            violations.append(
                f"[playwright-webserver-shell] frontend/playwright.config.ts must not use shell backend handoff {fragment!r}"
            )

    required_fragments = (
        "backendCwd",
        "cwd: backendCwd",
        "poetry run python -m uvicorn src.api.main:app --host 127.0.0.1 --port 8000",
    )
    for fragment in required_fragments:
        if fragment not in text:
            violations.append(
                f"[playwright-webserver-cwd] frontend/playwright.config.ts must include {fragment!r}"
            )
    return violations


def check_playwright_setup_windows_launcher() -> list[str]:
    if not PLAYWRIGHT_SETUP_PATH.exists():
        return [f"[playwright-setup-missing] {PLAYWRIGHT_SETUP_PATH.relative_to(ROOT).as_posix()}"]

    text = read_text(PLAYWRIGHT_SETUP_PATH)
    required_fragments = (
        "process.platform === 'win32'",
        "playwright.cmd",
        "return run('cmd', ['/d', '/s', '/c', localPlaywright",
        "process.exit(install.status ?? 1)",
    )
    violations: list[str] = []
    for fragment in required_fragments:
        if fragment not in text:
            violations.append(
                f"[playwright-setup-windows] frontend/scripts/playwright-setup.mjs must include {fragment!r}"
            )
    return violations


def check_dark_scada_screen_theme() -> list[str]:
    app_path = ROOT / "frontend" / "src" / "App.tsx"
    css_path = ROOT / "frontend" / "src" / "index.css"
    export_theme_path = ROOT / "frontend" / "src" / "ui" / "sld" / "export" / "exportTheme.ts"
    bay_renderer_path = (
        ROOT / "frontend" / "src" / "ui" / "power-distribution" / "BaySvgRenderer.tsx"
    )
    field_renderer_path = ROOT / "frontend" / "src" / "ui" / "field" / "CanonicalFieldRenderer.tsx"
    legacy_sld_renderer_path = (
        ROOT / "frontend" / "src" / "ui" / "power-distribution" / "engine" / "rendererSld.tsx"
    )

    paths = (
        app_path,
        css_path,
        export_theme_path,
        bay_renderer_path,
        field_renderer_path,
        legacy_sld_renderer_path,
    )
    violations: list[str] = []
    for path in paths:
        if not path.exists():
            violations.append(f"[dark-scada-missing-file] {path.relative_to(ROOT).as_posix()}")
            return violations

    app_text = read_text(app_path)
    css_text = read_text(css_path)
    export_text = read_text(export_theme_path)
    bay_text = read_text(bay_renderer_path)
    field_text = read_text(field_renderer_path)
    legacy_sld_text = read_text(legacy_sld_renderer_path)

    for fragment in ('className="mv-dark-scada', 'data-ui-theme="dark-scada"'):
        if fragment not in app_text:
            violations.append(f"[dark-scada-app-root] App.tsx must include {fragment!r}")

    for fragment in (
        ".mv-dark-scada",
        ".bg-white",
        ".bg-gray-50",
        ".bg-slate-50",
        ".text-slate-900",
        '[data-sld-export-theme="light_technical"]',
        "color-scheme: dark",
    ):
        if fragment not in css_text:
            violations.append(f"[dark-scada-css] index.css must include {fragment!r}")

    if "DEFAULT_EXPORT_THEME: ExportThemeId = 'light_technical'" not in export_text:
        violations.append(
            "[dark-scada-export-theme] default SLD export theme must remain light_technical"
        )
    if '[data-sld-export-theme="light_technical"]' not in export_text:
        violations.append(
            "[dark-scada-export-theme] export theme must keep light_technical CSS override"
        )

    if "theme = 'canonical-dark'" not in bay_text:
        violations.append(
            "[dark-scada-bay-renderer] BaySvgRenderer default theme must be canonical-dark"
        )
    if "theme = 'light'" in bay_text:
        violations.append("[dark-scada-bay-renderer] BaySvgRenderer must not default to light")

    if re.search(
        r"podglad_formularza:\s*\{[^}]*theme:\s*'light'",
        field_text,
        flags=re.DOTALL,
    ):
        violations.append(
            "[dark-scada-field-preview] form preview renderer must not use light screen theme"
        )

    if "style={{ background: '#FFFFFF' }}" in legacy_sld_text:
        violations.append(
            "[dark-scada-legacy-sld] RendererSld must not use white screen background"
        )
    if "const KOLOR_TLA_OBIEKTU = '#F8FAFC'" in legacy_sld_text:
        violations.append("[dark-scada-legacy-sld] RendererSld object background must not be light")

    return violations


def main() -> int:
    violations: list[str] = []
    violations.extend(check_required_files())
    violations.extend(check_indexes())
    violations.extend(check_canon_markers())
    violations.extend(check_no_active_spec_links())
    violations.extend(check_api_compatibility_matrix())
    violations.extend(api_lifecycle_guard.check_api_lifecycle_matrix())
    violations.extend(interaction_matrix_guard.check_interaction_matrix())
    violations.extend(legacy_public_path_guard.check_legacy_public_paths())
    violations.extend(reference_networks_guard.check_reference_networks_matrix())
    violations.extend(severity_contract_guard.check_severity_contract())
    violations.extend(check_decision_register())
    violations.extend(check_v12_debt_closure())
    violations.extend(check_removed_legacy_public_endpoints())
    violations.extend(check_end_to_end_coverage_matrix())
    violations.extend(check_dark_scada_screen_theme())
    violations.extend(check_playwright_env_timeout())
    violations.extend(check_playwright_webserver_lifecycle())
    violations.extend(check_playwright_setup_windows_launcher())

    if violations:
        print("v12xx-canon-guard: FAILED")
        for violation in violations:
            print(f" - {violation}")
        return 1

    print("v12xx-canon-guard: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
