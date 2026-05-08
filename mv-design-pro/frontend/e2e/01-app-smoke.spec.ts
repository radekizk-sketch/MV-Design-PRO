/**
 * 01-app-smoke (R54) — smoke test z fail-on-console-errors.
 *
 * Wymóg Etap 1+18 prompt huntowego: aplikacja się ładuje, brak console.error,
 * brak pageerror, widoczny shell, topbar, lewy panel, główny obszar, prawy panel.
 *
 * Zakres:
 *   1. App shell się montuje
 *   2. Brak runtime crashes
 *   3. Brak console errors (z whitelist React DevTools / HMR)
 *   4. Brak pageerror
 *   5. Główne regiony layoutu obecne (canonical-layout, main-content, inspector-panel-sidebar)
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

test.describe('01 — App Smoke (R54 fail-on-console-errors)', () => {
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

    await expect(page.locator('[data-testid="canonical-layout"]')).toBeVisible();
    await expect(page.locator('[data-testid="main-content"]')).toBeVisible();
    /* Inspector panel może być collapsed — sprawdzamy tylko obecność w DOM. */
    await expect(page.locator('[data-testid="inspector-panel-sidebar"]')).toHaveCount(1);
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

    const toggleBtn = page.locator('[data-testid="inspector-panel-toggle"]');
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
