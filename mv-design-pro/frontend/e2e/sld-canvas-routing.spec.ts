/**
 * E2E — Etap 1 wiring kanwy SLD.
 *
 * Sprawdza, że po starcie aplikacji:
 * 1. Domyślna trasa renderuje data-testid="sld-canvas-v2" (kanwa widoczna).
 * 2. Pusty model pokazuje polski komunikat empty state.
 * 3. Right-click na tle kanwy otwiera menu kontekstowe z trzema akcjami
 *    `background` (Wstaw główny punkt zasilania, Otwórz katalogi techniczne,
 *    Pokaż gotowość modelu).
 * 4. Trasa #sld-view renderuje kanwę w trybie tylko-do-odczytu.
 *
 * Uwaga: test nie wymaga backendu (mock-free, bez real-backend). Sprawdza
 * wyłącznie wiring shellu V12 ↔ SldWorkspaceContainer.
 */

import { expect, test, type Page } from '@playwright/test';

async function waitForAppReady(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="app-ready"]', {
    state: 'attached',
    timeout: 15_000,
  });
}

test.describe('Etap 1 — wiring kanwy SLD', () => {
  test('domyślna trasa renderuje SldCanvasV2 z polskim empty state', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    await expect(page.getByTestId('sld-canvas-v2')).toBeVisible();
    const emptyState = page.getByTestId('sld-empty-state');
    await expect(emptyState).toBeVisible();
    await expect(emptyState).toContainText('Schemat oczekuje na dane modelu sieci');
    await expect(emptyState).toContainText('Głównego Punktu Zasilającego');
  });

  test('right-click na kanwie otwiera menu kontekstowe tła', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    const canvas = page.getByTestId('sld-canvas-v2');
    await expect(canvas).toBeVisible();

    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    // Right-click w środek kanwy (poza elementami → kind=background).
    await canvas.click({
      button: 'right',
      position: { x: box!.width / 2, y: box!.height / 2 },
    });

    // Menu kontekstowe z trzema akcjami `background`.
    await expect(page.getByText('Wstaw główny punkt zasilania')).toBeVisible();
    await expect(page.getByText('Otwórz katalogi techniczne')).toBeVisible();
    await expect(page.getByText('Pokaż gotowość modelu')).toBeVisible();
  });

  test('trasa #sld-view renderuje kanwę w trybie tylko-do-odczytu', async ({ page }) => {
    await page.goto('/#sld-view');
    await waitForAppReady(page);

    await expect(page.getByTestId('sld-canvas-v2')).toBeVisible();
    const container = page.getByTestId('sld-workspace-container');
    await expect(container).toBeVisible();
    await expect(container).toHaveAttribute('data-readonly', 'true');
  });
});
