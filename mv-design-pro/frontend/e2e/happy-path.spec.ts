import { expect, test, type Page } from '@playwright/test';
import {
  TEST_APP_STATE,
  TEST_SELECTION_STATE,
} from './fixtures/test-fixtures';

async function waitForAppReady(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="app-ready"]', {
    state: 'attached',
    timeout: 15000,
  });
  await expect(page.locator('[data-testid="active-case-bar"]')).toBeVisible();
}

async function seedTestState(page: Page): Promise<void> {
  await page.addInitScript((fixtures) => {
    localStorage.setItem('mv-design-app-state', JSON.stringify(fixtures.appState));
    localStorage.setItem('mv-design-selection-store', JSON.stringify(fixtures.selectionState));
  }, {
    appState: TEST_APP_STATE,
    selectionState: TEST_SELECTION_STATE,
  });
}

test.describe('UI Integration E2E Happy Path', () => {
  test.beforeEach(async ({ page }) => {
    await seedTestState(page);
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('renders canonical active case bar and mode indicator', async ({ page }) => {
    await expect(page.locator('[data-testid="active-case-bar"]')).toBeVisible();
    await expect(page.locator('[data-testid="mode-indicator"]')).toHaveAttribute('data-mode', 'MODEL_EDIT');
    await expect(page.locator('[data-testid="btn-change-case"]')).toBeVisible();
    await expect(page.locator('[data-testid="btn-calculate"]')).toBeVisible();
  });

  test('opens canonical variants helper surface z active case bar', async ({ page }) => {
    await page.locator('[data-testid="btn-change-case"]').click();

    await expect(page).toHaveURL(/#variants$/);
    await expect(page.locator('[data-testid="workspace-surface-main"]')).toBeVisible();
    await expect(page.getByText('Warianty pracy i obliczenia')).toBeVisible();
  });

  test('switches shell mode on canonical analytical routes', async ({ page }) => {
    await page.goto('/#analysis');
    await waitForAppReady(page);
    await expect(page.locator('[data-testid="mode-indicator"]')).toHaveAttribute('data-mode', 'RESULT_VIEW');

    await page.goto('/#proof');
    await waitForAppReady(page);
    await expect(page.locator('[data-testid="mode-indicator"]')).toHaveAttribute('data-mode', 'RESULT_VIEW');

    await page.goto('/');
    await waitForAppReady(page);
    await expect(page.locator('[data-testid="mode-indicator"]')).toHaveAttribute('data-mode', 'MODEL_EDIT');
  });

  test('persists seeded UI state in localStorage', async ({ page }) => {
    const persisted = await page.evaluate(() => {
      const appState = localStorage.getItem('mv-design-app-state');
      const selectionState = localStorage.getItem('mv-design-selection-store');
      return {
        appState: appState ? JSON.parse(appState) : null,
        selectionState: selectionState ? JSON.parse(selectionState) : null,
      };
    });

    expect(persisted.appState).not.toBeNull();
    expect(persisted.selectionState).not.toBeNull();
  });
});

test.describe('Context Bar Synchronization', () => {
  test.beforeEach(async ({ page }) => {
    await seedTestState(page);
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('keeps calculate action visible and mode consistent while navigating', async ({ page }) => {
    const calculateButton = page.locator('[data-testid="btn-calculate"]');
    await expect(calculateButton).toBeVisible();

    await page.goto('/#analysis');
    await waitForAppReady(page);
    await expect(page.locator('[data-testid="mode-indicator"]')).toHaveAttribute('data-mode', 'RESULT_VIEW');

    await page.goto('/#sld');
    await waitForAppReady(page);
    await expect(page.locator('[data-testid="mode-indicator"]')).toHaveAttribute('data-mode', 'MODEL_EDIT');
    await expect(calculateButton).toBeVisible();
  });
});
