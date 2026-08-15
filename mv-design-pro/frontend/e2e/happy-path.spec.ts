import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  TEST_PROJECT,
  TEST_CASE,
  TEST_SELECTION_STATE,
} from './fixtures/test-fixtures';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';

async function waitForAppReady(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="app-ready"]', {
    state: 'attached',
    timeout: 15000,
  });
  await expect(page.locator('[data-testid="mvd-titlebar"]')).toBeVisible();
}

/**
 * NAPRAWA (karta TESTY-DRYF-E2E poz. 7, 2026-08-12): `TEST_APP_STATE` siał
 * nie-UUID id (`test-project-001`/`test-case-001`) do localStorage przeciw
 * ŻYWEMU backendowi (`PLAYWRIGHT_REAL_BACKEND=1` wymuszony bezwarunkowo w
 * `playwright-run.mjs` dla CAŁEJ suity — ten plik nigdy nie mockował API).
 * Dzisiejsza walidacja API odrzuca takie id 422/404 („case_id musi być
 * poprawnym UUID"). Fixture naprawiona u źródła: projekt i przypadek
 * zakładane realną ścieżką (POST /api/projects, POST /api/study-cases —
 * ten sam wzorzec co `createProjectAndCase` w critical-run-flow.spec.ts),
 * a do localStorage trafiają PRAWDZIWE id. Nazwy wyświetlane (`TEST_PROJECT.name`,
 * `TEST_CASE.name`) bez zmian — inne asercje w tym pliku sprawdzają je tekstowo.
 */
async function createRealProjectAndCase(
  request: APIRequestContext,
): Promise<{ projectId: string; caseId: string }> {
  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: TEST_PROJECT.name,
      description: 'E2E happy-path fixture',
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
      name: TEST_CASE.name,
      description: '',
      config: {},
      set_active: true,
    },
  });
  expect(caseResponse.ok()).toBeTruthy();
  const studyCase = (await caseResponse.json()) as { id: string };

  return { projectId: project.id, caseId: studyCase.id };
}

function buildAppState(projectId: string, caseId: string) {
  return {
    state: {
      activeProjectId: projectId,
      activeProjectName: TEST_PROJECT.name,
      activeCaseId: caseId,
      activeCaseName: TEST_CASE.name,
      activeCaseKind: TEST_CASE.kind,
      activeCaseResultStatus: TEST_CASE.resultStatus,
      activeMode: 'MODEL_EDIT',
      // Świeżo założony przypadek nie ma jeszcze przebiegu/snapshotu —
      // `null` jest uczciwym stanem (dawne fixture id 'test-run-001' /
      // 'test-snapshot-001' też nie wskazywały na nic realnego).
      activeRunId: null,
      activeSnapshotId: null,
      caseManagerOpen: false,
      issuePanelOpen: false,
      activeAnalysisType: 'SHORT_CIRCUIT',
    },
    version: 1,
  };
}

async function seedTestState(page: Page, request: APIRequestContext): Promise<void> {
  const { projectId, caseId } = await createRealProjectAndCase(request);
  const appState = buildAppState(projectId, caseId);
  await page.addInitScript((fixtures) => {
    localStorage.setItem('mv-design-app-state', JSON.stringify(fixtures.appState));
    localStorage.setItem('mv-design-selection-store', JSON.stringify(fixtures.selectionState));
  }, {
    appState,
    selectionState: TEST_SELECTION_STATE,
  });
}

test.describe('UI Integration E2E Happy Path', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedTestState(page, request);
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
    // NAPRAWA (karta TESTY-DRYF-E2E poz. 7, 2026-08-12; przepisanie testu wg
    // zmiany kanonu — CLAUDE.md Zero-Debt): kanon K8 wygasil most
    // `VariantsSurface`/`workspace-surface-panel` na trasie `#variants` —
    // testidy `workspace-surface-panel` i `variants-engineering-surface`
    // nie istnieja juz NIGDZIE w src (potwierdzone grepem). Ladowiskiem
    // akcji „otworz warianty" jest dzis przestrzen „Obliczenia" ui2
    // (`ui2/AppRoot.tsx`: `wykonajAkcjeMenu('variants')` ->
    // `navigateToVariants`), ktora renderuje `MenedzerPrzypadkow` wewnatrz
    // `workspace-surface-main` (`LegacyWarsztat.tsx` space==='obliczenia').
    // INTENCJA BEZ ZMIAN: klik w casebar-chip ma otworzyc kanoniczny widok
    // wariantow/przebiegow zakresu obliczen — sprawdzamy dokladnie to, tylko
    // pod obecnymi testidami/naglowkiem ("Przypadki obliczeniowe").
    const surface = page.locator('[data-testid="workspace-surface-main"]');
    await expect(surface).toBeVisible();
    const menedzerPrzypadkow = surface.getByTestId('mvd-przypadki');
    await expect(menedzerPrzypadkow).toBeVisible();
    await expect(menedzerPrzypadkow.getByRole('heading', { name: 'Przypadki obliczeniowe' })).toBeVisible();
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
  test.beforeEach(async ({ page, request }) => {
    await seedTestState(page, request);
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
