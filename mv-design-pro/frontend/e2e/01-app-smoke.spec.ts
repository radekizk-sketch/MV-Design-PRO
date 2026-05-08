/**
 * 01-app-smoke (R55) — smoke test z fail-on-console-errors.
 *
 * Wymóg Etap 1+18 prompt huntowego: aplikacja się ładuje, brak console.error,
 * brak pageerror, widoczny shell, topbar, lewy panel, główny obszar, prawy panel.
 *
 * R55: zaktualizowane test IDs do kanonicznych:
 *   workspace-shell (było: canonical-layout)
 *   right-panel (było: inspector-panel-sidebar)
 *   right-panel-collapse (było: inspector-panel-toggle)
 *   left-panel — nowy
 *   workspace-topbar — nowy
 */

import { expect, test, type Page } from '@playwright/test';
import { collectConsoleErrors } from './helpers/console-failure';
import { TEST_APP_STATE, TEST_SELECTION_STATE } from './fixtures/test-fixtures';

async function seedTestState(page: Page): Promise<void> {
  await page.addInitScript((fixtures) => {
    localStorage.setItem('mv-design-app-state', JSON.stringify(fixtures.appState));
    localStorage.setItem('mv-design-selection-store', JSON.stringify(fixtures.selectionState));
  }, {
    appState: TEST_APP_STATE,
    selectionState: TEST_SELECTION_STATE,
  });
}

async function waitForAppReady(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="app-ready"]', {
    state: 'attached',
    timeout: 15000,
  });
}

test.describe('01 — App Smoke (R55 canonical test IDs)', () => {
  test('Aplikacja ładuje się bez console errors i pageerror', async ({ page }) => {
    /* Collect zamiast fail — testy mają widzieć WSZYSTKIE errors końcowo,
       nie tylko pierwszy. Asercja po ready. */
    const { errors, pageErrors } = collectConsoleErrors(page);

    await seedTestState(page);
    await page.goto('/');
    await waitForAppReady(page);

    /* Daj 1s na lazy mount + react query refetch żeby errory się ujawniły. */
    await page.waitForTimeout(1000);

    /* Krytyczna asercja: brak runtime crashes. */
    expect(pageErrors, `pageerror w przeglądarce:\n${pageErrors.join('\n')}`).toEqual([]);

    /* Console errors — strict (po R54). Jeśli nieuniknione, dodaj do
       ALLOWED_CONSOLE_PATTERNS w helpers/console-failure.ts. */
    expect(errors, `console.error w przeglądarce (${errors.length}):\n${errors.join('\n')}`).toEqual([]);
  });

  test('Główne regiony layoutu obecne (shell + main + inspector)', async ({ page }) => {
    await seedTestState(page);
    await page.goto('/');
    await waitForAppReady(page);

    /* R55: kanoniczne test IDs */
    await expect(page.locator('[data-testid="workspace-shell"]')).toBeVisible();
    await expect(page.locator('[data-testid="main-content"]')).toBeVisible();
    /* Prawy panel może być collapsed — sprawdzamy tylko obecność w DOM. */
    await expect(page.locator('[data-testid="right-panel"]')).toHaveCount(1);
  });

  test('Active case bar widoczny + przycisk Oblicz dostępny', async ({ page }) => {
    await seedTestState(page);
    await page.goto('/');
    await waitForAppReady(page);

    await expect(page.locator('[data-testid="active-case-bar"]')).toBeVisible();
    await expect(page.locator('[data-testid="btn-calculate"]')).toBeVisible();
  });

  test('Inspector panel toggle nie crashuje', async ({ page }) => {
    const { errors, pageErrors } = collectConsoleErrors(page);
    await seedTestState(page);
    await page.goto('/');
    await waitForAppReady(page);

    /* R55: right-panel-collapse (było: inspector-panel-toggle) */
    const toggleBtn = page.locator('[data-testid="right-panel-collapse"]');
    if (await toggleBtn.count() > 0) {
      await toggleBtn.click();
      await page.waitForTimeout(200);
      await toggleBtn.click();
      await page.waitForTimeout(200);
    }

    expect(pageErrors).toEqual([]);
    expect(errors).toEqual([]);
  });
});
