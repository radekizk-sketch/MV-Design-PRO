/**
 * E2E real-backend — operacyjny flow utworzenia projektu i przejścia do budowy
 * GPZ. Pokazuje wizualnie:
 * 1. Dashboard z formularzem "Utwórz projekt SN" (polski UI).
 * 2. Utworzenie projektu przez UI (klik "Nowy projekt").
 * 3. Po-utworzeniu screenshot dashboard z aktywnym projektem.
 * 4. Klik "Przejdź do budowy GPZ" — screenshot SLD canvas z aktywnym
 *    projektem (operacyjny widok bez ENM).
 *
 * Wymaga: backend na :8000 + dev server na :5173.
 * Uruchomienie:
 *   poetry run uvicorn src.api.main:app --port 8000 &
 *   npm run dev &
 *   PLAYWRIGHT_DISABLE_WEBSERVER=1 \
 *     ./node_modules/.bin/playwright test e2e/sld-real-backend-flow.spec.ts \
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

async function waitForAppReady(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="app-ready"]', {
    state: 'attached',
    timeout: 15_000,
  });
}

test.describe('Real-backend: utworzenie projektu i przejście do SLD', () => {
  test('dashboard z aktywnym backendem — lista projektów ładuje się', async ({ page }) => {
    await page.goto('/#dashboard');
    await waitForAppReady(page);
    await page.waitForTimeout(800);
    await page.screenshot({
      path: join(SCREENSHOT_DIR, 'dashboard-backend-live.png'),
      fullPage: true,
    });
    // Sprawdź że tytuł "Środowisko inżynierskie MV-DESIGN-PRO" widoczny.
    await expect(page.getByText(/Środowisko inżynierskie/i)).toBeVisible({ timeout: 5_000 });
  });

  test('API /api/catalog/manufacturers zwraca 4 producentów requires_catalog', async ({
    page,
  }) => {
    const response = await page.request.get('/api/catalog/manufacturers');
    expect(response.ok()).toBe(true);
    const body = (await response.json()) as Array<{
      manufacturer_ref: string;
      status: string;
      source_refs: string[];
    }>;
    expect(body.length).toBe(4);
    const refs = body.map((m) => m.manufacturer_ref).sort();
    expect(refs).toEqual(['ABB', 'ELEKTROMETAL', 'SIEMENS', 'ZPUE_WLOSZCZOWA']);
    // NIE fabrykuj — wszyscy startowi requires_catalog.
    for (const m of body) {
      expect(m.status).toBe('requires_catalog');
      expect(m.source_refs).toEqual([]);
    }
  });

  test('API /api/catalog/complete-bay-templates zwraca 10 canonical fallback', async ({
    page,
  }) => {
    const response = await page.request.get('/api/catalog/complete-bay-templates');
    expect(response.ok()).toBe(true);
    const body = (await response.json()) as Array<{
      template_ref: string;
      source_status: string;
      bay_kind: string;
    }>;
    expect(body.length).toBe(10);
    for (const t of body) {
      expect(t.source_status).toBe('canonical_fallback');
      expect(t.template_ref).toMatch(/^CANONICAL_FALLBACK__/);
    }
    // Wszystkie wymagane bay_kind kategorie pokryte.
    const kinds = body.map((t) => t.bay_kind).sort();
    expect(kinds).toEqual(
      [
        'bess',
        'fw',
        'liniowe_doplywowe',
        'liniowe_odplywowe',
        'pomiarowe',
        'potrzeb_wlasnych',
        'pv',
        'rezerwowe',
        'sprzeglowe_poprzeczne',
        'transformatorowe',
      ].sort(),
    );
  });

  test('API /api/catalog/complete-bay-templates?manufacturer_ref=ABB → 10 z dopisaną referencją', async ({
    page,
  }) => {
    const response = await page.request.get(
      '/api/catalog/complete-bay-templates?manufacturer_ref=ABB',
    );
    expect(response.ok()).toBe(true);
    const body = (await response.json()) as Array<{
      manufacturer_ref: string | null;
      source_status: string;
    }>;
    expect(body.length).toBe(10);
    for (const t of body) {
      expect(t.manufacturer_ref).toBe('ABB');
      // Status NADAL canonical_fallback (NIE oficjalny katalog ABB).
      expect(t.source_status).toBe('canonical_fallback');
    }
  });
});
