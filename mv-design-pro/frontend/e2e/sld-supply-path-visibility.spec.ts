/**
 * E2E — Tor mocy SLD (SupplyPathHighlighter + SupplyPathLegend).
 *
 * Sprawdza po stronie przeglądarki:
 * 1. Aplikacja na trasie #sld ładuje się i pokazuje SldCanvasV2.
 * 2. Empty state nie wybucha gdy brak ENM (mock-free, bez real-backend).
 * 3. Komponenty SupplyPathLegend + 3 Pickery + DerPccVariantInfo są dostępne
 *    w bundle (nie crashują przy lazy load).
 *
 * Test smoke — wymaga `npm run test:e2e` z uruchomionym dev serverem. Bez
 * real backend (page.route mocks API).
 *
 * Uruchomienie:
 *   cd mv-design-pro/frontend && npm run test:e2e -- sld-supply-path-visibility
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const SCREENSHOT_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'docs',
  'audits',
  'screenshots',
);

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
let entityCounter = 0;

function nextEntitySuffix(): string {
  entityCounter += 1;
  return String(entityCounter).padStart(4, '0');
}

async function waitForAppReady(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="app-ready"]', {
    state: 'attached',
    timeout: 15_000,
  });
}

/**
 * NAPRAWA (karta TESTY-DRYF-E2E poz. 1, 2026-08-12): `/#sld` bez ŻADNEGO
 * aktywnego projektu/case'a pokazuje dziś bramkę „Start projektu: zakres
 * obliczeń i GPZ" zamiast montować workspace (świadoma zmiana kanonu —
 * karty K2-hydratacja i K5 wprowadziły bramkowanie aktywnym case'em na
 * poziomie `WorkflowContextStrip`: `!hasModel` zastępuje CAŁY warsztat
 * bramką, workspace SLD nigdy się nie montuje). Test przepisany do
 * obecnego kanonu Z ZACHOWANIEM INTENCJI (widoczność toru zasilania /
 * pustego stanu na kanwie v3): case zakłada się i aktywuje realną ścieżką
 * (POST /api/projects + /api/study-cases, seed `mv-design-app-state" —
 * ten sam wzorzec co inne zielone specy real-backend, np.
 * critical-run-flow.spec.ts, wyspy-menu-sld.spec.ts), BEZ żadnej operacji
 * domenowej — model pozostaje realnie pusty, więc kontrakt v3 F12-C
 * ("pusty model ⇒ kanwa SVG nie istnieje, sld-empty-state aktywny") jest
 * dalej dokładnie tym, co sprawdzały te testy przed zmianą bramki.
 */
async function createEmptyCaseFromUi(page: Page, request: APIRequestContext): Promise<string> {
  const suffix = nextEntitySuffix();
  const projectName = `E2E tor mocy widocznosc ${suffix}`;
  const caseName = `Przypadek tor mocy ${suffix}`;

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Bramka TESTY-DRYF-E2E poz. 1: widocznosc toru mocy na pustym modelu',
      mode: 'TO-BE',
      voltage_level_kv: 15.0,
      frequency_hz: 50.0,
    },
  });
  expect(projectResponse.ok()).toBeTruthy();
  const project = (await projectResponse.json()) as { id: string };

  const caseResponse = await request.post(`${BACKEND_BASE}/api/study-cases`, {
    data: {
      project_id: project.id,
      name: caseName,
      description: '',
      config: {},
      set_active: true,
    },
  });
  expect(caseResponse.ok()).toBeTruthy();
  const studyCase = (await caseResponse.json()) as { id: string };

  await page.addInitScript((seed) => {
    localStorage.setItem(
      'mv-design-app-state',
      JSON.stringify({
        state: {
          activeProjectId: seed.projectId,
          activeProjectName: seed.projectName,
          activeCaseId: seed.caseId,
          activeCaseName: seed.caseName,
          activeCaseKind: 'ShortCircuitCase',
          activeCaseResultStatus: 'NONE',
          activeSnapshotId: null,
          activeMode: 'MODEL_EDIT',
          activeRunId: null,
          activeAnalysisType: 'SHORT_CIRCUIT',
          caseManagerOpen: false,
          issuePanelOpen: false,
        },
        version: 1,
      }),
    );
  }, { projectId: project.id, projectName, caseId: studyCase.id, caseName });

  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 30000 });
  await expect(page.getByTestId('active-case-bar')).toContainText(/Zakres|Bieżący zestaw/);
  return studyCase.id;
}

test.describe('Tor mocy — SupplyPathHighlighter w UI', () => {
  test('aplikacja na #sld renderuje workspace v3 (smoke)', async ({ page, request }) => {
    await createEmptyCaseFromUi(page, request);
    await page.goto('/#sld');
    await waitForAppReady(page);

    // Pusty model ⇒ workspace montuje kanwę SVG (pustą) pod nakładką pustego
    // stanu (kontrakt v3, F12-C — patrz uzasadnienie w teście poniżej) —
    // smoke potwierdza workspace + pusty stan.
    await expect(page.getByTestId('sld-canvas-v3-workspace')).toBeVisible();
    await expect(page.getByTestId('sld-empty-state')).toBeVisible();
  });

  test('SLD render bez ENM nie wybucha — empty state aktywny', async ({ page, request }) => {
    await createEmptyCaseFromUi(page, request);
    await page.goto('/#sld');
    await waitForAppReady(page);

    // v3 renderuje pusty stan gdy case jest aktywny, ale model nie ma
    // jeszcze żadnych elementów (świeżo założony przypadek). Tor mocy w
    // takim stanie nie jest pokazany (brak źródeł).
    //
    // NAPRAWA (karta TESTY-DRYF-E2E poz. 1, 2026-08-12; przepisanie wg
    // zmiany kanonu): dawna asercja `sld-canvas-v3` → count 0 zakładała, że
    // pusty model wyklucza istnienie kanwy SVG. Obecny kontrakt F12-C
    // (`SldCanvasV3Workspace.tsx`, komentarz „S9-11/P-8") renderuje `<SldCanvasV3>`
    // (testid `sld-canvas-v3`) WYŁĄCZNIE na podstawie `Boolean(snapshot)` —
    // migawka ENM przychodzi (nawet z zerem elementów) i kanwa się montuje;
    // `sld-empty-state` jest NIEZALEŻNĄ nakładką (`z-20`, `pointer-events-none`)
    // pokazywaną na podstawie osobnego werdyktu pustości. Intencja bez zmian
    // (empty state aktywny, brak crasha) — sprawdzamy oba fakty pod obecnym
    // kontraktem: kanwa istnieje (pusta, pod spodem), a nakładka pustego stanu
    // jest widoczna.
    await expect(page.getByTestId('sld-empty-state')).toBeVisible();
    await expect(page.getByTestId('sld-canvas-v3')).toHaveCount(1);
  });

  test('screenshot SLD pustego widoku — dowód browser pass', async ({ page, request }) => {
    await createEmptyCaseFromUi(page, request);
    await page.goto('/#sld');
    await waitForAppReady(page);
    await expect(page.getByTestId('sld-empty-state')).toBeVisible();
    await page.screenshot({
      path: join(SCREENSHOT_DIR, 'sld-empty-state.png'),
      fullPage: true,
    });
  });

  test('screenshot dashboard (E-00)', async ({ page }) => {
    await page.goto('/#dashboard');
    await waitForAppReady(page);
    await page.waitForTimeout(300);
    await page.screenshot({
      path: join(SCREENSHOT_DIR, 'dashboard.png'),
      fullPage: true,
    });
  });

  test('screenshot SLD viewer (read-only)', async ({ page }) => {
    await page.goto('/#sld-view');
    await waitForAppReady(page);
    await page.waitForTimeout(300);
    await page.screenshot({
      path: join(SCREENSHOT_DIR, 'sld-view-readonly.png'),
      fullPage: true,
    });
  });

  test('screenshot katalogu typów (E-06)', async ({ page }) => {
    await page.goto('/#catalog');
    await waitForAppReady(page);
    await page.waitForTimeout(300);
    await page.screenshot({
      path: join(SCREENSHOT_DIR, 'catalog-types.png'),
      fullPage: true,
    });
  });

  test('screenshot widoku analiz (E-24)', async ({ page }) => {
    await page.goto('/#analysis');
    await waitForAppReady(page);
    await page.waitForTimeout(300);
    await page.screenshot({
      path: join(SCREENSHOT_DIR, 'analysis-view.png'),
      fullPage: true,
    });
  });
});

test.describe('Manufacturer flow widoczność (smoke)', () => {
  /**
   * Test smoke że route /api/catalog/manufacturers zwraca 4 producentów ze
   * statusem `requires_catalog` (po stronie backend). Wymaga real-backend
   * `npm run test:e2e:real` — pomijany w mock mode.
   */
  test.skip('GET /api/catalog/manufacturers zwraca 4 producentów (wymaga real-backend)', async ({
    page,
  }) => {
    const response = await page.request.get('/api/catalog/manufacturers');
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(4);
    const refs = body.map((m: { manufacturer_ref: string }) => m.manufacturer_ref);
    expect(refs).toContain('ZPUE_WLOSZCZOWA');
    expect(refs).toContain('ELEKTROMETAL');
    expect(refs).toContain('ABB');
    expect(refs).toContain('SIEMENS');
    // Wszyscy startują z status='requires_catalog'.
    for (const m of body) {
      expect(m.status).toBe('requires_catalog');
      expect(m.source_refs).toEqual([]);
    }
  });

  test.skip('GET /api/catalog/complete-bay-templates zwraca 10 fallbacków (wymaga real-backend)', async ({
    page,
  }) => {
    const response = await page.request.get('/api/catalog/complete-bay-templates');
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body.length).toBe(10);
    for (const t of body) {
      expect(t.source_status).toBe('canonical_fallback');
    }
  });
});
