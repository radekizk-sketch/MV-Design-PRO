from __future__ import annotations

from pathlib import Path

import v12xx_canon_guard as guard


def write_doc(tmp_path: Path, name: str, content: str) -> Path:
    path = tmp_path / name
    path.write_text(content, encoding="utf-8")
    return path


def test_api_matrix_requires_v2_projection_endpoint(tmp_path, monkeypatch) -> None:
    matrix_path = write_doc(
        tmp_path,
        "MACIERZ_KOMPATYBILNOSCI_API.md",
        """
| Endpoint | Wersja | Status | Zakres kompatybilnosci | Testy | Wlasciciel |
|---|---|---|---|---|---|
| `/api/cases/{id}/enm` | v1 | adapter | Legacy bridge. | test migracji ENM v1->v2 | Architekt API |
""",
    )
    monkeypatch.setattr(guard, "API_MATRIX_PATH", matrix_path)

    violations = guard.check_api_compatibility_matrix()

    assert any("[api-matrix-endpoint]" in violation for violation in violations)
    assert any("/api/cases/{id}/enm/v2-projection" in violation for violation in violations)


def test_api_matrix_accepts_v2_projection_endpoint(tmp_path, monkeypatch) -> None:
    matrix_path = write_doc(
        tmp_path,
        "MACIERZ_KOMPATYBILNOSCI_API.md",
        """
| Endpoint | Wersja | Status | Zakres kompatybilnosci | Testy | Wlasciciel |
|---|---|---|---|---|---|
| `/api/cases/{id}/enm/v2-projection` | v12xx.m1 | adapter | Read-only projection. | test endpointu projekcji ENM v2 | Architekt migracji |
""",
    )
    monkeypatch.setattr(guard, "API_MATRIX_PATH", matrix_path)

    assert guard.check_api_compatibility_matrix() == []


def test_api_matrix_accepts_method_and_case_id_path(tmp_path, monkeypatch) -> None:
    matrix_path = write_doc(
        tmp_path,
        "MACIERZ_KOMPATYBILNOSCI_API.md",
        """
| Endpoint | Wersja | Status | Data wejscia | Data wylaczenia | Zakres kompatybilnosci | Testy | Wlasciciel |
|---|---|---|---|---|---|---|---|
| `GET /api/cases/{case_id}/enm/v2-projection` | v12xx.m1 | adapter | 2026-04-24 | koniec M3 | Read-only projection. | test endpointu projekcji ENM v2 | Architekt migracji |
""",
    )
    monkeypatch.setattr(guard, "API_MATRIX_PATH", matrix_path)

    assert guard.check_api_compatibility_matrix() == []


def test_decision_register_requires_v12d_013(tmp_path, monkeypatch) -> None:
    register_path = write_doc(
        tmp_path,
        "REJESTR_DECYZJI.md",
        """
| Kod | Status | Obszar | Decyzja | Wplyw | Wlasciciel |
|---|---|---|---|---|---|
| V12D-012 | zatwierdzona | raport | Export uses a light technical theme. | Raporty | Architekt raportow |
""",
    )
    monkeypatch.setattr(guard, "DECISION_REGISTER_PATH", register_path)

    violations = guard.check_decision_register()

    assert any("[decision-register]" in violation for violation in violations)
    assert any("V12D-013" in violation for violation in violations)


def test_decision_register_accepts_required_decisions(tmp_path, monkeypatch) -> None:
    register_path = write_doc(
        tmp_path,
        "REJESTR_DECYZJI.md",
        """
| Kod | Status | Obszar | Decyzja | Wplyw | Wlasciciel |
|---|---|---|---|---|---|
| V12D-013 | zatwierdzona | API / migracja | Projection is read-only at `/api/cases/{id}/enm/v2-projection`. | API migration contract. | Architekt API |
| V12D-014 | zatwierdzona | UI / ENM | Draft separation is governed by `MACIERZ_DRAFT_VS_COMMITTED.md`. | UI and ENM contract. | Architekt UI/UX |
| V12D-016 | zatwierdzona | UI / solver | Solver uses frozen snapshot from `create_run`. | UI cannot send draft ENM. | Architekt ENM |
| V12D-021 | zatwierdzona | solver / raport / uzasadnienie | Asymmetrical faults require `proof_status`. | Reportability. | Architekt wynikow |
| V12D-022 | zatwierdzona | API / governance | Endpoint lifecycle uses `MACIERZ_KOMPATYBILNOSCI_API.md`. | API guard. | Architekt API |
| V12D-023 | zatwierdzona | walidacje / governance | Severity uses `enm.severity`. | Severity guard. | Architekt walidacji |
| V12D-024 | zatwierdzona | testy / E2E | Playwright browser discovery uses `PLAYWRIGHT_CHROMIUM_VERSION_TIMEOUT_MS`. | E2E guard. | Architekt testow |
| V12D-028 | zatwierdzona | SLD / governance | Interaction coverage is enforced by `interaction_matrix_guard.py`. | SLD matrix guard. | Architekt UI/UX |
| V12D-029 | zatwierdzona | testy / governance | Reference scenarios are enforced by `reference_networks_guard.py`. | Reference guard. | Architekt testow |
| V12D-030 | zatwierdzona | ENM / OZE | Projection materializes `FW_PMSG`, FW_DFIG and FW_SCIG profiles. | ENM v2 projection. | Architekt ENM |
| V12D-031 | zatwierdzona | OZE / zgodnosc | Source compliance checks `generator_technology`. | OZE reportability. | Architekt OZE |
| V12D-032 | zatwierdzona | API / migracja | Public API legacy paths are blocked by `legacy_public_path_guard.py`. | API migration closure. | Architekt API |
| V12D-033 | zatwierdzona | UI / SLD / OZE | UI carries `fw_pmsg`, fw_dfig and fw_scig. | UI OZE closure. | Architekt UI/UX |
| V12D-034 | zatwierdzona | API / EAZ | Removed public `protection-engine/v1` routes. | EAZ API closure. | Architekt API |
| V12D-035 | zatwierdzona | governance / testy | Coverage matrix lives in `MACIERZ_POKRYCIA_END_TO_END.md`. | E2E closure. | Architekt testow |
| V12D-036 | zatwierdzona | UI / dark SCADA | Screen theme is enforced by root `mv-dark-scada`. | Dark SCADA closure. | Architekt UI/UX |
""",
    )
    monkeypatch.setattr(guard, "DECISION_REGISTER_PATH", register_path)

    assert guard.check_decision_register() == []


def test_debt_closure_rejects_open_debt_status(tmp_path, monkeypatch) -> None:
    debt_path = write_doc(
        tmp_path,
        "REJESTR_DLUGU.md",
        """
| Kod | Obszar | Status |
|---|---|---|
| V12T-002 | ENM | otwarty |
""",
    )
    backlog_path = write_doc(
        tmp_path,
        "BACKLOG_WDROZENIOWY_V12_XX.md",
        """
| Kod | Zadanie | Status |
|---|---|---|
| V12-BL-001 | Kanon | zamkniete |
""",
    )
    red_team_path = write_doc(tmp_path, "RED_TEAM_FINAL_V12_XX.md", "Brak blokad.")
    monkeypatch.setattr(guard, "DEBT_REGISTER_PATH", debt_path)
    monkeypatch.setattr(guard, "BACKLOG_PATH", backlog_path)
    monkeypatch.setattr(guard, "RED_TEAM_PATH", red_team_path)

    violations = guard.check_v12_debt_closure()

    assert any("[debt-register-open]" in violation for violation in violations)


def test_debt_closure_rejects_open_backlog_status(tmp_path, monkeypatch) -> None:
    debt_path = write_doc(
        tmp_path,
        "REJESTR_DLUGU.md",
        """
| Kod | Obszar | Status |
|---|---|---|
| V12T-002 | ENM | zamkniety |
""",
    )
    backlog_path = write_doc(
        tmp_path,
        "BACKLOG_WDROZENIOWY_V12_XX.md",
        """
| Kod | Zadanie | Status |
|---|---|---|
| V12-BL-001 | Kanon | w trakcie |
""",
    )
    red_team_path = write_doc(tmp_path, "RED_TEAM_FINAL_V12_XX.md", "Brak blokad.")
    monkeypatch.setattr(guard, "DEBT_REGISTER_PATH", debt_path)
    monkeypatch.setattr(guard, "BACKLOG_PATH", backlog_path)
    monkeypatch.setattr(guard, "RED_TEAM_PATH", red_team_path)

    violations = guard.check_v12_debt_closure()

    assert any("[backlog-open]" in violation for violation in violations)


def test_debt_closure_accepts_closed_registers(tmp_path, monkeypatch) -> None:
    debt_path = write_doc(
        tmp_path,
        "REJESTR_DLUGU.md",
        """
| Kod | Obszar | Status |
|---|---|---|
| V12T-002 | ENM | zamkniety |
""",
    )
    backlog_path = write_doc(
        tmp_path,
        "BACKLOG_WDROZENIOWY_V12_XX.md",
        """
| Kod | Zadanie | Status |
|---|---|---|
| V12-BL-001 | Kanon | zamkniete: dowod |
""",
    )
    red_team_path = write_doc(tmp_path, "RED_TEAM_FINAL_V12_XX.md", "Brak blokad.")
    monkeypatch.setattr(guard, "DEBT_REGISTER_PATH", debt_path)
    monkeypatch.setattr(guard, "BACKLOG_PATH", backlog_path)
    monkeypatch.setattr(guard, "RED_TEAM_PATH", red_team_path)

    assert guard.check_v12_debt_closure() == []


def test_removed_legacy_public_endpoints_rejects_active_protection_engine_route(
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        guard.api_lifecycle_guard,
        "discover_active_api_routes",
        lambda: [
            guard.api_lifecycle_guard.RouteContract(
                method="POST",
                path="/api/protection-engine/v1/execute",
                source="backend/src/api/protection_engine_v1.py:90",
            )
        ],
    )

    violations = guard.check_removed_legacy_public_endpoints()

    assert any("[removed-legacy-active-route]" in violation for violation in violations)


def test_removed_legacy_public_endpoints_requires_removed_matrix_status(
    tmp_path,
    monkeypatch,
) -> None:
    matrix_path = write_doc(
        tmp_path,
        "MACIERZ_KOMPATYBILNOSCI_API.md",
        """
| Endpoint | Status |
|---|---|
| `POST /api/protection-engine/v1/execute` | deprecated |
""",
    )
    monkeypatch.setattr(guard, "API_MATRIX_PATH", matrix_path)
    monkeypatch.setattr(guard.api_lifecycle_guard, "discover_active_api_routes", lambda: [])

    violations = guard.check_removed_legacy_public_endpoints()

    assert any("[removed-legacy-api-status]" in violation for violation in violations)


def test_end_to_end_coverage_matrix_rejects_partial_status(tmp_path, monkeypatch) -> None:
    matrix_path = write_doc(
        tmp_path,
        "MACIERZ_POKRYCIA_END_TO_END.md",
        """
| Wymog | Dokument | Model | Backend | API | UI | SLD | Wynik | Uzasadnienie | Raport | Test | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ENM v2 | kanon | model | backend | api | ui | sld | wynik | proof | raport | test | WDROZONE CZESCIOWO |
""",
    )
    monkeypatch.setattr(guard, "COVERAGE_MATRIX_PATH", matrix_path)

    violations = guard.check_end_to_end_coverage_matrix()

    assert any("[coverage-matrix-status]" in violation for violation in violations)


def test_end_to_end_coverage_matrix_accepts_deployed_rows(tmp_path, monkeypatch) -> None:
    matrix_path = write_doc(
        tmp_path,
        "MACIERZ_POKRYCIA_END_TO_END.md",
        """
| Wymog | Dokument | Model | Backend | API | UI | SLD | Wynik | Uzasadnienie | Raport | Test | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ENM v2 | kanon | model | backend | api | ui | sld | wynik | proof | raport | test | WDROZONE |
""",
    )
    monkeypatch.setattr(guard, "COVERAGE_MATRIX_PATH", matrix_path)

    assert guard.check_end_to_end_coverage_matrix() == []


def test_decision_register_requires_v12d_014(tmp_path, monkeypatch) -> None:
    register_path = write_doc(
        tmp_path,
        "REJESTR_DECYZJI.md",
        """
| Kod | Status | Obszar | Decyzja | Wplyw | Wlasciciel |
|---|---|---|---|---|---|
| V12D-013 | zatwierdzona | API / migracja | Projection is read-only at `/api/cases/{id}/enm/v2-projection`. | API migration contract. | Architekt API |
""",
    )
    monkeypatch.setattr(guard, "DECISION_REGISTER_PATH", register_path)

    violations = guard.check_decision_register()

    assert any("[decision-register]" in violation for violation in violations)
    assert any("V12D-014" in violation for violation in violations)


def test_decision_register_requires_v12d_016(tmp_path, monkeypatch) -> None:
    register_path = write_doc(
        tmp_path,
        "REJESTR_DECYZJI.md",
        """
| Kod | Status | Obszar | Decyzja | Wplyw | Wlasciciel |
|---|---|---|---|---|---|
| V12D-013 | zatwierdzona | API / migracja | Projection is read-only at `/api/cases/{id}/enm/v2-projection`. | API migration contract. | Architekt API |
| V12D-014 | zatwierdzona | UI / ENM | Draft separation is governed by `MACIERZ_DRAFT_VS_COMMITTED.md`. | UI and ENM contract. | Architekt UI/UX |
| V12D-021 | zatwierdzona | solver / raport / uzasadnienie | Asymmetrical faults require `proof_status`. | Reportability. | Architekt wynikow |
| V12D-022 | zatwierdzona | API / governance | Endpoint lifecycle uses `MACIERZ_KOMPATYBILNOSCI_API.md`. | API guard. | Architekt API |
| V12D-023 | zatwierdzona | walidacje / governance | Severity uses `enm.severity`. | Severity guard. | Architekt walidacji |
| V12D-024 | zatwierdzona | testy / E2E | Playwright browser discovery uses `PLAYWRIGHT_CHROMIUM_VERSION_TIMEOUT_MS`. | E2E guard. | Architekt testow |
| V12D-028 | zatwierdzona | SLD / governance | Interaction coverage is enforced by `interaction_matrix_guard.py`. | SLD matrix guard. | Architekt UI/UX |
| V12D-029 | zatwierdzona | testy / governance | Reference scenarios are enforced by `reference_networks_guard.py`. | Reference guard. | Architekt testow |
""",
    )
    monkeypatch.setattr(guard, "DECISION_REGISTER_PATH", register_path)

    violations = guard.check_decision_register()

    assert any("[decision-register]" in violation for violation in violations)
    assert any("V12D-016" in violation for violation in violations)


def test_playwright_env_timeout_requires_chromium_probe_timeout(tmp_path, monkeypatch) -> None:
    playwright_env = write_doc(
        tmp_path,
        "playwright-env.mjs",
        """
import { spawnSync } from 'node:child_process';
spawnSync('chrome', ['--version'], { encoding: 'utf-8' });
""",
    )
    monkeypatch.setattr(guard, "PLAYWRIGHT_ENV_PATH", playwright_env)

    violations = guard.check_playwright_env_timeout()

    assert any("[playwright-env-timeout]" in violation for violation in violations)
    assert any("PLAYWRIGHT_CHROMIUM_VERSION_TIMEOUT_MS" in violation for violation in violations)


def test_playwright_env_timeout_accepts_canonical_timeout_contract(tmp_path, monkeypatch) -> None:
    playwright_env = write_doc(
        tmp_path,
        "playwright-env.mjs",
        """
const CHROMIUM_VERSION_TIMEOUT_MS = Number.parseInt(process.env.PLAYWRIGHT_CHROMIUM_VERSION_TIMEOUT_MS ?? '5000', 10);
const require = createRequire(import.meta.url);
const playwright = require('playwright');
playwright.chromium.executablePath();
isExistingExecutable(bundled);
spawnSync('chrome', ['--version'], {
  encoding: 'utf-8',
  timeout: CHROMIUM_VERSION_TIMEOUT_MS,
  windowsHide: true,
});
""",
    )
    monkeypatch.setattr(guard, "PLAYWRIGHT_ENV_PATH", playwright_env)

    assert guard.check_playwright_env_timeout() == []


def test_playwright_webserver_lifecycle_rejects_shell_backend_handoff(
    tmp_path, monkeypatch
) -> None:
    config_path = write_doc(
        tmp_path,
        "playwright.config.ts",
        """
const backendServerCommand = process.platform === 'win32'
  ? 'powershell -NoProfile -Command "Set-Location ..\\\\backend; poetry run uvicorn src.api.main:app --host 0.0.0.0 --port 8000"'
  : 'bash -lc "cd ../backend && poetry run uvicorn src.api.main:app --host 0.0.0.0 --port 8000"';
""",
    )
    monkeypatch.setattr(guard, "PLAYWRIGHT_CONFIG_PATH", config_path)

    violations = guard.check_playwright_webserver_lifecycle()

    assert any("[playwright-webserver-shell]" in violation for violation in violations)


def test_playwright_webserver_lifecycle_accepts_cwd_backend_handoff(tmp_path, monkeypatch) -> None:
    config_path = write_doc(
        tmp_path,
        "playwright.config.ts",
        """
const backendCwd = fileURLToPath(new URL('../backend/', import.meta.url));
const backendServerCommand = 'poetry run python -m uvicorn src.api.main:app --host 127.0.0.1 --port 8000';
export default defineConfig({
  webServer: [{
    command: backendServerCommand,
    cwd: backendCwd,
  }],
});
""",
    )
    monkeypatch.setattr(guard, "PLAYWRIGHT_CONFIG_PATH", config_path)

    assert guard.check_playwright_webserver_lifecycle() == []


def test_playwright_setup_windows_launcher_requires_cmd_launcher(tmp_path, monkeypatch) -> None:
    setup_path = write_doc(
        tmp_path,
        "playwright-setup.mjs",
        """
const localPlaywright = './node_modules/.bin/playwright';
const install = run(localPlaywright, ['install', '--with-deps', 'chromium']);
""",
    )
    monkeypatch.setattr(guard, "PLAYWRIGHT_SETUP_PATH", setup_path)

    violations = guard.check_playwright_setup_windows_launcher()

    assert any("[playwright-setup-windows]" in violation for violation in violations)


def test_playwright_setup_windows_launcher_accepts_cmd_launcher(tmp_path, monkeypatch) -> None:
    setup_path = write_doc(
        tmp_path,
        "playwright-setup.mjs",
        """
const localPlaywright = process.platform === 'win32'
  ? '.\\\\node_modules\\\\.bin\\\\playwright.cmd'
  : './node_modules/.bin/playwright';
return run('cmd', ['/d', '/s', '/c', localPlaywright, 'install', '--with-deps', 'chromium']);
if (process.platform === 'win32') {
  process.exit(install.status ?? 1);
}
""",
    )
    monkeypatch.setattr(guard, "PLAYWRIGHT_SETUP_PATH", setup_path)

    assert guard.check_playwright_setup_windows_launcher() == []
