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

  test('API /api/catalog/manufacturers zwraca 5 producentów requires_catalog', async ({
    page,
  }) => {
    // 5. producent SCHNEIDER_ELECTRIC dodany w programie Reference Engine V1
    // (REFERENCE_ENGINE_SPEC_V1.md, rodzina SM6-24). Intencja testu bez
    // zmian: rejestr zawiera DOKŁADNIE znanych producentów, wszyscy
    // requires_catalog (nie fabrykuj danych producenta).
    const response = await page.request.get('/api/catalog/manufacturers');
    expect(response.ok()).toBe(true);
    const body = (await response.json()) as Array<{
      manufacturer_ref: string;
      status: string;
      source_refs: string[];
    }>;
    expect(body.length).toBe(5);
    const refs = body.map((m) => m.manufacturer_ref).sort();
    expect(refs).toEqual(['ABB', 'ELEKTROMETAL', 'SCHNEIDER_ELECTRIC', 'SIEMENS', 'ZPUE_WLOSZCZOWA']);
    // NIE fabrykuj — wszyscy startowi requires_catalog.
    for (const m of body) {
      expect(m.status).toBe('requires_catalog');
      expect(m.source_refs).toEqual([]);
    }
  });

  test('API /api/catalog/complete-bay-templates zwraca zweryfikowane szablony producentów', async ({
    page,
  }) => {
    const response = await page.request.get('/api/catalog/complete-bay-templates');
    expect(response.ok()).toBe(true);
    const body = (await response.json()) as Array<{
      template_ref: string;
      manufacturer_ref: string | null;
      source_status: string;
      bay_kind: string;
      source_refs?: string[];
    }>;
    expect(body.length).toBeGreaterThanOrEqual(30);
    for (const t of body) {
      expect(t.source_status).toBe('repo_verified');
      expect(t.manufacturer_ref).toBeTruthy();
      expect(t.source_refs?.length ?? 0).toBeGreaterThan(0);
    }
    // Wszystkie wymagane bay_kind kategorie pokryte.
    const kinds = new Set(body.map((t) => t.bay_kind));
    for (const required of [
      'liniowe_doplywowe',
      'liniowe_odplywowe',
      'pomiarowe',
      'sprzeglowe_poprzeczne',
      'transformatorowe',
    ]) {
      expect(kinds.has(required)).toBe(true);
    }
  });

  test('API /api/catalog/complete-bay-templates?manufacturer_ref=ABB zwraca tylko szablony ABB ze źródłami', async ({
    page,
  }) => {
    const response = await page.request.get(
      '/api/catalog/complete-bay-templates?manufacturer_ref=ABB',
    );
    expect(response.ok()).toBe(true);
    const body = (await response.json()) as Array<{
      manufacturer_ref: string | null;
      source_status: string;
      source_refs?: string[];
    }>;
    expect(body.length).toBeGreaterThanOrEqual(8);
    for (const t of body) {
      expect(t.manufacturer_ref).toBe('ABB');
      expect(t.source_status).toBe('repo_verified');
      expect(t.source_refs?.length ?? 0).toBeGreaterThan(0);
    }
  });

  test('API /api/catalog/switchgear-families zwraca 7 zweryfikowanych rodzin', async ({
    page,
  }) => {
    // 7. rodzina SCHNEIDER__SM6_24 dodana w programie Reference Engine V1
    // (pakiet schneider_sm6, repo_verified, publiczna strona se.com).
    const response = await page.request.get('/api/catalog/switchgear-families');
    expect(response.ok()).toBe(true);
    const body = (await response.json()) as Array<{
      switchgear_family_ref: string;
      status: string;
      source_refs: string[];
    }>;
    expect(body.length).toBe(7);
    const refs = body.map((f) => f.switchgear_family_ref).sort();
    expect(refs).toEqual([
      'ABB__SAFERING',
      'ABB__UNIGEAR_ZS1',
      'ELEKTROMETAL__E2ALPHA',
      'SCHNEIDER__SM6_24',
      'SIEMENS__8DJH',
      'SIEMENS__NXAIR',
      'ZPUE_WLOSZCZOWA__ROTOBLOK',
    ]);
    for (const f of body) {
      expect(f.status).toBe('repo_verified');
      expect(f.source_refs.length).toBeGreaterThan(0);
      for (const ref of f.source_refs) {
        expect(ref).toMatch(/^https:\/\//);
      }
    }
  });

  test('API ?manufacturer_ref=ABB → 2 rodziny (UniGear ZS1 + SafeRing)', async ({ page }) => {
    const response = await page.request.get(
      '/api/catalog/switchgear-families?manufacturer_ref=ABB',
    );
    expect(response.ok()).toBe(true);
    const body = (await response.json()) as Array<{ family_name: string }>;
    expect(body.length).toBe(2);
    expect(body.map((f) => f.family_name).sort()).toEqual(['SafeRing', 'UniGear ZS1']);
  });

  test('API ?manufacturer_ref=SIEMENS → 2 rodziny (NXAIR + 8DJH)', async ({ page }) => {
    const response = await page.request.get(
      '/api/catalog/switchgear-families?manufacturer_ref=SIEMENS',
    );
    expect(response.ok()).toBe(true);
    const body = (await response.json()) as Array<{ family_name: string }>;
    expect(body.length).toBe(2);
    expect(body.map((f) => f.family_name).sort()).toEqual(['8DJH', 'NXAIR']);
  });
});
