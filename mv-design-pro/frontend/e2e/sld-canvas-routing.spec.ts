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

import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

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
 * NAPRAWA (karta TESTY-DRYF-E2E poz. 5, 2026-08-12; ta sama KLASA co poz. 1
 * — `sld-supply-path-visibility.spec.ts`): `/#sld` bez ŻADNEGO aktywnego
 * projektu/case'a pokazuje dziś bramkę „Start projektu" zamiast montować
 * workspace (świadoma zmiana kanonu, karty K2-hydratacja/K5 — bramkowanie
 * `WorkflowContextStrip` aktywnym case'em). Case zakłada się i aktywuje
 * realną ścieżką, BEZ żadnej operacji domenowej — model pozostaje realnie
 * pusty, więc kontrakt v3 F12-C jest dalej dokładnie tym, co te testy
 * sprawdzały przed zmianą bramki.
 */
async function createEmptyCaseFromUi(page: Page, request: APIRequestContext): Promise<void> {
  const suffix = nextEntitySuffix();
  const projectName = `E2E routing SLD ${suffix}`;
  const caseName = `Przypadek routing ${suffix}`;

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Bramka TESTY-DRYF-E2E poz. 5: wiring kanwy SLD na pustym modelu',
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
}

test.describe('Wiring kanwy SLD (v3)', () => {
  test('trasa #sld renderuje workspace v3 z polskim pustym stanem', async ({ page, request }) => {
    await createEmptyCaseFromUi(page, request);
    await page.goto('/#sld');
    await waitForAppReady(page);

    await expect(page.getByTestId('sld-canvas-v3-workspace')).toBeVisible();
    const emptyState = page.getByTestId('sld-empty-state');
    await expect(emptyState).toBeVisible();
    await expect(emptyState).toContainText('Wybierz wariant GPZ i rozpocznij ciąg SN');
    await expect(emptyState).toContainText('Główny Punkt Zasilający');
    // NAPRAWA (ta sama klasa co poz. 1): kontrakt F12-C obecny
    // (`SldCanvasV3Workspace.tsx`, komentarz „S9-11/P-8") montuje `<SldCanvasV3>`
    // (testid `sld-canvas-v3`) na podstawie `Boolean(snapshot)`, NIE na
    // podstawie liczby elementów — migawka ENM przychodzi (nawet pusta) i
    // kanwa się montuje POD nakładką pustego stanu (`z-20`,
    // `pointer-events-none`). Dawna asercja `toHaveCount(0)` zakładała, że
    // pusty model wyklucza istnienie kanwy; intencja („nie wybucha, empty
    // state aktywny") zachowana pod obecnym kontraktem.
    await expect(page.getByTestId('sld-canvas-v3')).toHaveCount(1);
  });

  test('pusty stan wystawia trzy akcje projektowe (GPZ / katalogi / kreator)', async ({ page, request }) => {
    await createEmptyCaseFromUi(page, request);
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
    // KD-1: trzecia akcja („Otwórz konfigurację stacji (17 kroków)" → trasa
    // `#kreator-stacji-v2`) USUNIĘTA razem z martwym podzespołem kreatora v2
    // (inwentarz parytetu mostów L-6). Intencja testu bez zmian: pusty stan ma
    // WYŁĄCZNIE akcje o realnym dostawcy — żadnego martwego odnośnika.
    await expect(page.getByTestId('sld-empty-state-open-station-wizard')).toHaveCount(0);
  });

  test('trasa #sld-view renderuje workspace w trybie tylko-do-odczytu', async ({ page }) => {
    await page.goto('/#sld-view');
    await waitForAppReady(page);

    const container = page.getByTestId('sld-canvas-v3-workspace');
    await expect(container).toBeVisible();
    await expect(container).toHaveAttribute('data-readonly', 'true');
  });
});
