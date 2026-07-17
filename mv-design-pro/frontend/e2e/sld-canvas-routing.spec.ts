/**
 * E2E — wiring kanwy SLD (adaptacja do v3 po F12-C, 2026-07-17).
 *
 * Sprawdza, że po starcie aplikacji:
 * 1. Trasa #sld renderuje workspace v3 z polskim pustym stanem — na PUSTYM
 *    modelu kanwa SVG celowo NIE istnieje (kontrakt v3: `{hasNetworkModel &&
 *    <svg data-testid="sld-canvas-v3">}` w `SldCanvasV3Workspace`), a pusty
 *    stan jest pierwszym krokiem projektowym z CTA.
 * 2. Pusty stan niesie trzy jawne akcje (GPZ / katalogi / kreator stacji) —
 *    dawny kontrakt "right-click na tle → menu background" dotyczył kanwy,
 *    która na pustym modelu nie renderuje się; akcje tła są wystawione
 *    wprost jako przyciski pustego stanu (ten sam wykonawca akcji
 *    `useSldActionExecutor`, ARCH-4).
 * 3. Trasa #sld-view renderuje workspace w trybie tylko-do-odczytu.
 *
 * Uwaga: test nie wymaga backendu (mock-free, bez real-backend). Sprawdza
 * wyłącznie wiring shellu V12 ↔ SldCanvasV3Workspace.
 */

import { expect, test, type Page } from '@playwright/test';

async function waitForAppReady(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="app-ready"]', {
    state: 'attached',
    timeout: 15_000,
  });
}

test.describe('Wiring kanwy SLD (v3)', () => {
  test('trasa #sld renderuje workspace v3 z polskim pustym stanem', async ({ page }) => {
    await page.goto('/#sld');
    await waitForAppReady(page);

    await expect(page.getByTestId('sld-canvas-v3-workspace')).toBeVisible();
    const emptyState = page.getByTestId('sld-empty-state');
    await expect(emptyState).toBeVisible();
    await expect(emptyState).toContainText('Wybierz wariant GPZ i rozpocznij ciąg SN');
    await expect(emptyState).toContainText('Główny Punkt Zasilający');
    // Pusty model ⇒ brak kanwy SVG (kontrakt v3) — jawna asercja negatywna,
    // żeby regres „kanwa renderuje się bez modelu" nie przeszedł cicho.
    await expect(page.getByTestId('sld-canvas-v3')).toHaveCount(0);
  });

  test('pusty stan wystawia trzy akcje projektowe (GPZ / katalogi / kreator)', async ({ page }) => {
    await page.goto('/#sld');
    await waitForAppReady(page);

    await expect(page.getByTestId('sld-empty-state-insert-gpz')).toBeVisible();
    await expect(page.getByTestId('sld-empty-state-insert-gpz')).toContainText(
      'Wstaw Główny Punkt Zasilający',
    );
    await expect(page.getByTestId('sld-empty-state-open-catalogs')).toBeVisible();
    await expect(page.getByTestId('sld-empty-state-open-catalogs')).toContainText(
      'Przeglądaj katalogi techniczne',
    );
    await expect(page.getByTestId('sld-empty-state-open-station-wizard')).toBeVisible();
  });

  test('trasa #sld-view renderuje workspace w trybie tylko-do-odczytu', async ({ page }) => {
    await page.goto('/#sld-view');
    await waitForAppReady(page);

    const container = page.getByTestId('sld-canvas-v3-workspace');
    await expect(container).toBeVisible();
    await expect(container).toHaveAttribute('data-readonly', 'true');
  });
});
