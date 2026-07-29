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
  await expect(page.locator('[data-testid="mvd-titlebar"]')).toBeVisible();
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
    await expect(page.locator('[data-testid="mvd-titlebar"]')).toBeVisible();
    await expect(page.locator('[data-testid="mvd-casebar-project"]')).toContainText('Projekt Testowy');
    await expect(page.locator('[data-testid="mvd-casebar-chip"]')).toContainText('Zakres Testowy 3F');
    await expect(page.locator('[data-testid="mvd-calculate"]')).toBeVisible();
  });

  test('opens canonical variants helper surface z active case bar', async ({ page }) => {
    await page.locator('[data-testid="mvd-casebar-chip"]').click();

    await expect(page).toHaveURL(/#variants(\?|$)/);
    const surface = page.locator('[data-testid="workspace-surface-panel"]');
    await expect(surface).toBeVisible();
    await expect(surface.getByTestId('variants-engineering-surface')).toBeVisible();
    await expect(surface.getByTestId('variants-engineering-surface').getByRole('heading', { name: 'Stan obliczeń wariantu' })).toBeVisible();
  });

  test('switches shell mode on canonical analytical routes', async ({ page }) => {
    await page.goto('/#analysis');
    await waitForAppReady(page);
    await expect(page.locator('[data-testid="mvd-titlebar"]')).toBeVisible();
    await expect(page.locator('[data-testid="workflow-context-strip"]')).toHaveCount(0);

    await page.goto('/#proof');
    await waitForAppReady(page);
    await expect(page.locator('[data-testid="mvd-titlebar"]')).toBeVisible();
    await expect(page.locator('[data-testid="workflow-context-strip"]')).toHaveCount(0);

    await page.goto('/');
    await waitForAppReady(page);
    await expect(page.locator('[data-testid="workflow-context-strip"]')).toBeVisible();
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
    const calculateButton = page.locator('[data-testid="mvd-calculate"]');
    await expect(calculateButton).toBeVisible();

    await page.goto('/#analysis');
    await waitForAppReady(page);
    await expect(page.locator('[data-testid="workflow-context-strip"]')).toHaveCount(0);

    await page.goto('/#sld');
    await waitForAppReady(page);
    await expect(page.locator('[data-testid="workflow-context-strip"]')).toBeVisible();
    await expect(calculateButton).toBeVisible();
  });
});
