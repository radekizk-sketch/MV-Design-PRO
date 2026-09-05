/**
 * Playwright Configuration — E2E_STABILIZATION
 *
 * CANONICAL ALIGNMENT:
 * - UI_CORE_ARCHITECTURE.md § 12: E2E Testing
 *
 * Configuration for E2E tests covering:
 * - Happy path: Projekt → Case → Snapshot → Run → SLD/Results → Inspector → Proof
 * - Selection synchronization
 * - Navigation with Polish labels
 *
 * STABILIZATION:
 * - Explicit timeouts for expect/action/navigation
 * - Disabled animations via CSS injection
 * - Fixed viewport for consistent rendering
 * - Reduced retries (1 in CI to catch flaky tests)
 * - Trace/video only on failure (saves CI resources)
 */

import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveChromiumExecutable } from './scripts/playwright-env.mjs';

function withTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

const resolvedExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? resolveChromiumExecutable() ?? undefined;

const useRealBackend = process.env.PLAYWRIGHT_REAL_BACKEND === '1';
const backendUrl = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const backendHealthUrl = process.env.PLAYWRIGHT_BACKEND_HEALTH_URL
  ?? new URL('/ready', withTrailingSlash(backendUrl)).toString();
const frontendUrl = process.env.PLAYWRIGHT_FRONTEND_URL ?? 'http://127.0.0.1:5173';
const frontendCwd = fileURLToPath(new URL('.', import.meta.url));
const backendCwd = fileURLToPath(new URL('../backend/', import.meta.url));

// WŁASNOŚĆ SERWERÓW I IZOLACJA STANU (2026-09-05, karta FE-HIGIENA — odbiór).
// Porty są WYPROWADZANE z adresów (PLAYWRIGHT_BACKEND_URL / PLAYWRIGHT_FRONTEND_URL),
// więc bieg na innych portach nie wymaga żadnej innej zmiany — do tej pory komenda
// backendu miała zaszyte `--port 8000` niezależnie od adresu, a serwer frontendu
// zaszyte 5173 w `dev:e2e`; dwa równoległe biegi na jednej maszynie były niemożliwe.
// `reuseExistingServer` domyślnie WYŁĄCZONE: przy `true` Playwright adoptował KAŻDY
// serwer zastany na porcie — cudzy worktree, stary kod, cudza baza z projektami — a
// gdy właściciel tamtego serwera go ubijał w trakcie biegu, specy padały na
// `ERR_CONNECTION_REFUSED` (pomiar 2026-09-05: 9/17 czerwonych w jednym biegu z tej
// przyczyny; wcześniejszy precedens w CONVERGENCE_EVIDENCE §E E2E-FIX). Teraz zajęty
// port to JAWNY błąd startu serwera, nie cichy bieg na cudzym kodzie; świadome
// współdzielenie serwera wymaga `PLAYWRIGHT_REUSE_SERVER=1`. Backend realny dostaje
// ŚWIEŻĄ bazę i ŚWIEŻY magazyn ENM w katalogu tymczasowym biegu (spec „SLD render bez
// ENM — empty state" zakłada pustą bazę; stan z poprzednich biegów w `./mv_design_pro.db`
// łamał to założenie), chyba że wołający poda własne `PLAYWRIGHT_BACKEND_DATABASE_URL`
// / `PLAYWRIGHT_ENM_STORE_DIR`. W CI (świeży runner, wolne porty) zachowanie jest
// identyczne jak dotąd.
const backendPort = new URL(withTrailingSlash(backendUrl)).port || '8000';
const frontendPort = new URL(withTrailingSlash(frontendUrl)).port || '5173';
const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_SERVER === '1';
function e2eTempDir(): string {
  // Ustalany raz w procesie uruchamiającym; workery Playwrighta dziedziczą env,
  // więc widzą TEN SAM katalog zamiast tworzyć własne.
  if (!process.env.PLAYWRIGHT_E2E_TMP) {
    process.env.PLAYWRIGHT_E2E_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mvd-e2e-'));
  }
  return process.env.PLAYWRIGHT_E2E_TMP;
}
const backendServerEnv: Record<string, string> = useRealBackend
  ? {
    ...(process.env as Record<string, string>),
    // Kod backendu importuje pakiety absolutnie (`api.*`, `enm.*`), więc `src/`
    // musi być na PYTHONPATH — w CI zapewniał to `poetry run` z instalacją
    // edytowalną, przy jawnym interpreterze (worktree) trzeba to podać wprost.
    PYTHONPATH: [path.join(backendCwd, 'src'), process.env.PYTHONPATH]
      .filter((segment): segment is string => Boolean(segment))
      .join(path.delimiter),
    DATABASE_URL: process.env.PLAYWRIGHT_BACKEND_DATABASE_URL
      ?? `sqlite+pysqlite:///${path.join(e2eTempDir(), 'mv_design_pro_e2e.db')}`,
    ENM_STORE_DIR: process.env.PLAYWRIGHT_ENM_STORE_DIR ?? path.join(e2eTempDir(), 'enm_store'),
  }
  : {};
const frontendServerCommand = process.env.PLAYWRIGHT_DISABLE_WEBSERVER
  ? 'echo "skip webserver"'
  : `npx vite --host 127.0.0.1 --port ${frontendPort} --strictPort`;
// Interpreter backendu: domyślnie `poetry run python` (CI, pojedynczy checkout). W git
// worktree Poetry wyprowadza NAZWĘ venv ze ścieżki projektu, więc `poetry run` trafia
// w pusty venv bez uvicorna i serwer pada na starcie („No module named uvicorn") —
// dotąd niewidoczne, bo Playwright adoptował cudzy serwer z portu 8000. Ten sam
// mechanizm i to samo lekarstwo co w `scripts/mypy_ratchet_guard.py` (interpreter
// podany jawnie): `PLAYWRIGHT_BACKEND_PYTHON=/sciezka/do/venv/bin/python`.
const backendPython = process.env.PLAYWRIGHT_BACKEND_PYTHON ?? 'poetry run python';
const backendServerCommand =
  `${backendPython} -m uvicorn src.api.main:app --host 127.0.0.1 --port ${backendPort}`;

export default defineConfig({
  testDir: './e2e',

  // Rozgrzewka aplikacji po starcie serwerów (koszt zimnego startu Vite poza testami).
  globalSetup: './e2e/global-setup.ts',

  // Run tests sequentially for determinism
  fullyParallel: false,

  // Fail CI on test.only (prevent accidental focused tests)
  forbidOnly: !!process.env.CI,

  // Reduced retries in CI (1 retry catches transient issues, but 2+ masks flaky)
  retries: process.env.CI ? 1 : 0,

  // Single worker for determinism on canonical catalog-first flows.
  workers: 1,

  // HTML reporter with failure details
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['github']]
    : 'html',

  // Global timeout for each test (60s max per test)
  timeout: 60000,

  // Expect timeout (for assertions). 20 s: zimny rozruch aplikacji w vite dev
  // na wolniejszych kontenerach mierzy ~12 s (app-ready), a część speców
  // asertuje bezpośrednio po goto bez czekania na app-ready.
  expect: {
    timeout: 20000,
    // Visual regression tolerance (V12K-013 SLD F5 — PLAN_SLD_REWORK § 7.4)
    // Threshold 0.5% per snapshot to allow minor antialiasing differences
    // across CI environments while catching real visual regressions.
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.005, // 0.5%
      threshold: 0.2, // per-pixel color tolerance
      animations: 'disabled',
      caret: 'hide',
    },
  },

  use: {
    // Base URL for the app (deterministic loopback for Playwright webServer)
    baseURL: frontendUrl,

    // Action timeout (clicks, fills, etc.) — dziedziczy go TAKŻE fixture
    // `request` (wywołania API w specach real-backend). Kalibracja do
    // ZMIERZONEJ rzeczywistości pełnej suity (2026-07-30, 318 testów,
    // 4 rdzenie współdzielone przez równoległych workerów): pojedyncze
    // POST /api/projects przekraczało 10 s pod obciążeniem i wywalało spec,
    // choć backend odpowiadał poprawnie. 30 s obejmuje ogon obciążeniowy;
    // asercje (expect) mają własny, krótszy limit — realne zwisy UI nadal
    // są łapane.
    actionTimeout: 30000,

    // Navigation timeout
    navigationTimeout: 30000,

    // Trace only on first retry (saves CI storage)
    trace: 'on-first-retry',

    // Screenshot only on failure
    screenshot: 'only-on-failure',

    // Video only on failure (saves CI storage)
    video: 'off',

    // Fixed viewport for consistent rendering
    viewport: { width: 1280, height: 720 },

    // Disable animations for deterministic screenshots
    // This is injected into every page
    launchOptions: {
      slowMo: process.env.CI ? 0 : undefined,
      executablePath: resolvedExecutablePath,
    },
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Inject CSS to disable animations
        contextOptions: {
          reducedMotion: 'reduce',
        },
      },
    },
  ],

  // Web server configuration
  webServer: useRealBackend
    ? [
      {
        command: backendServerCommand,
        cwd: backendCwd,
        url: backendHealthUrl,
        reuseExistingServer,
        env: backendServerEnv,
        timeout: 120000,
        stdout: 'pipe',
        stderr: 'pipe',
      },
      {
        command: frontendServerCommand,
        cwd: frontendCwd,
        url: frontendUrl,
        reuseExistingServer,
        timeout: 120000,
        stdout: 'pipe',
        stderr: 'pipe',
      },
    ]
    : {
      command: frontendServerCommand,
      cwd: frontendCwd,
      url: frontendUrl,
      reuseExistingServer,
      timeout: 120000,
      // Capture server output for debugging
      stdout: 'pipe',
      stderr: 'pipe',
    },
});
