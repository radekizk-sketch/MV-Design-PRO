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
const frontendServerCommand = process.env.PLAYWRIGHT_DISABLE_WEBSERVER
  ? 'echo "skip webserver"'
  : 'npm run dev:e2e';
const backendServerCommand = 'poetry run python -m uvicorn src.api.main:app --host 127.0.0.1 --port 8000';

export default defineConfig({
  testDir: './e2e',

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

    // Action timeout (clicks, fills, etc.)
    actionTimeout: 10000,

    // Navigation timeout
    navigationTimeout: 15000,

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
        reuseExistingServer: true,
        timeout: 120000,
        stdout: 'pipe',
        stderr: 'pipe',
      },
      {
        command: frontendServerCommand,
        cwd: frontendCwd,
        url: frontendUrl,
        reuseExistingServer: true,
        timeout: 120000,
        stdout: 'pipe',
        stderr: 'pipe',
      },
    ]
    : {
      command: frontendServerCommand,
      cwd: frontendCwd,
      url: frontendUrl,
      reuseExistingServer: true,
      timeout: 120000,
      // Capture server output for debugging
      stdout: 'pipe',
      stderr: 'pipe',
    },
});
