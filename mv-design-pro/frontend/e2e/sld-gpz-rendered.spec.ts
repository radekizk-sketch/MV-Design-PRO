/**
 * E2E real-backend — SLD z aktywnym GPZ.
 *
 * Wymaga:
 *  - backend na :8000 (poetry run uvicorn src.api.main:app --port 8000),
 *  - dev server na :5173 (npm run dev),
 *  - istniejący projekt "Demo SLD" z aktywnym case'em "Demo case" zawierającym
 *    GPZ-Demo (15 kV, sk3=250 MVA, 2 sekcje × 3 pola liniowe) — utworzone
 *    przez API w skrypcie smoke.
 *
 * Pokazuje wizualnie:
 *  1. Dashboard z istniejącym projektem.
 *  2. SLD canvas po otwarciu projektu — z GPZ rozdzielnią narysowaną przez
 *     GpzSwitchgearRenderer/GpzCanonicalRenderer (sekcje szyn, pola liniowe).
 *
 * Uruchomienie:
 *   PLAYWRIGHT_REAL_BACKEND=1 PLAYWRIGHT_DISABLE_WEBSERVER=1 \
 *     ./node_modules/.bin/playwright test e2e/sld-gpz-rendered.spec.ts \
 *     --project=chromium
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

const SCREENSHOT_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'docs',
  'audits',
  'screenshots',
);

const PROJECT_ID = '70a99b32-abb8-4249-bf17-96f6d85183b9';
const CASE_ID = 'f5117ef9-45a4-484a-ba78-2f3ba1b91a11';

async function waitForAppReady(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="app-ready"]', {
    state: 'attached',
    timeout: 15_000,
  });
}

test.describe('SLD z aktywnym GPZ (real-backend)', () => {
  test('aktywacja projektu + case przez API zustand, screenshot SLD', async ({ page }) => {
    // Włącz projekt + case w zustand store przed nawigacją.
    await page.addInitScript(
      ({ projectId, caseId }) => {
        try {
          localStorage.setItem('mv-design-active-project-id', projectId);
          localStorage.setItem('mv-design-active-case-id', caseId);
        } catch {
          // ignore
        }
      },
      { projectId: PROJECT_ID, caseId: CASE_ID },
    );

    await page.goto(`/#sld?project=${PROJECT_ID}&case=${CASE_ID}`);
    await waitForAppReady(page);
    // Daj czas na fetch ENM + renderer.
    await page.waitForTimeout(1_500);

    const canvas = page.getByTestId('sld-canvas-v2');
    await expect(canvas).toBeVisible();

    await page.screenshot({
      path: join(SCREENSHOT_DIR, 'sld-with-gpz-loaded.png'),
      fullPage: true,
    });
  });
});
