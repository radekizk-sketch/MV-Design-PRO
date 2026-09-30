/**
 * Krytyczny flow serii przebiegów (karta CV-3.3-C, rejestr trwały `run_batches`).
 *
 * Dowodzi na REALNYM backendzie: seria 2 pozycji utworzona i wykonana przez
 * panel „Serie przebiegów" (`ui2/spaces/obliczenia/serie/SeriePanel.tsx`)
 * przetrwa ODŚWIEŻENIE STRONY — seria i statusy pozycji są widoczne po
 * ponownym wczytaniu (dowód, że rejestr żyje w bazie, nie w pamięci karty
 * przeglądarki ani procesu backendu).
 */

import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const SOURCE_ID = 'src-gpz-15kv-250mva-rx010';
const CATALOG_VERSION = '2024.1';
let entityCounter = 0;

function nextEntitySuffix(): string {
  entityCounter += 1;
  return String(entityCounter).padStart(4, '0');
}

async function createProjectAndCase(
  request: APIRequestContext,
): Promise<{ projectId: string; projectName: string; caseId: string; caseName: string }> {
  const suffix = nextEntitySuffix();
  const projectName = `E2E Serie ${suffix}`;
  const caseName = `Przypadek serii ${suffix}`;

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Test krytycznego flow serii (CV-3.3-C)',
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

  return { projectId: project.id, projectName, caseId: studyCase.id, caseName };
}

async function executeDomainOp(
  request: APIRequestContext,
  caseId: string,
  name: string,
  payload: Record<string, unknown>,
): Promise<{ error?: string | null; snapshot?: { buses?: Array<{ ref_id: string }> } }> {
  const response = await request.post(`${BACKEND_BASE}/api/cases/${caseId}/enm/domain-ops`, {
    data: {
      project_id: '',
      snapshot_base_hash: '',
      operation: {
        name,
        idempotency_key: `e2e-batch-${name}-${String(Math.random()).slice(2, 10)}`,
        payload,
      },
    },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as {
    error?: string | null;
    snapshot?: { buses?: Array<{ ref_id: string }> };
  };
  expect(body.error ?? null).toBeNull();
  return body;
}

async function createScenario(
  request: APIRequestContext,
  caseId: string,
  name: string,
  elementRef: string,
): Promise<string> {
  const response = await request.post(
    `${BACKEND_BASE}/api/execution/study-cases/${caseId}/fault-scenarios`,
    {
      data: {
        name,
        fault_type: 'SC_3F',
        location: { element_ref: elementRef, location_type: 'BUS', position: null },
        config: { c_factor: 1.1, thermal_time_seconds: 1, include_branch_contributions: false },
      },
    },
  );
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { scenario_id: string };
  return body.scenario_id;
}

async function seedCaseAndActivate(
  page: Page,
  request: APIRequestContext,
): Promise<{ caseId: string; scenarioIds: string[] }> {
  const { projectId, projectName, caseId, caseName } = await createProjectAndCase(request);

  // Sieć minimalna: GPZ SN (źródło + szyna) — wystarczająca dla zwarcia 3F na
  // szynie źródła (ten sam krok 1, co `critical-run-flow.spec.ts`).
  const op = await executeDomainOp(request, caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: {
      catalog_namespace: 'ZRODLO_SN',
      catalog_item_id: SOURCE_ID,
      catalog_item_version: CATALOG_VERSION,
    },
    hv_voltage_kv: 110.0,
    transformer_sn_mva: 25.0,
  });
  const busRef = op.snapshot?.buses?.[0]?.ref_id;
  expect(busRef).toBeTruthy();

  const s1 = await createScenario(request, caseId, 'Zwarcie A (E2E serii)', busRef!);
  const s2 = await createScenario(request, caseId, 'Zwarcie B (E2E serii)', busRef!);

  await page.addInitScript(
    (seed) => {
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
    },
    { projectId, projectName, caseId, caseName },
  );

  return { caseId, scenarioIds: [s1, s2] };
}

test('krytyczny flow serii (CV-3.3-C): utwórz serię 2 pozycje -> odśwież stronę -> seria i statusy widoczne', async ({
  page,
  request,
}) => {
  const { caseId } = await seedCaseAndActivate(page, request);

  await page.goto(`/#case-config?case=${caseId}`, { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
  await expect(page.getByTestId('mvd-serie')).toBeVisible();

  // Zaznacz oba scenariusze i uruchom serię.
  const scenariuszeGotowe = page.getByTestId('mvd-serie-nowa');
  await expect(scenariuszeGotowe).toBeVisible();
  const checkboxy = page.locator('[data-testid^="mvd-serie-scenariusz-"]');
  await expect(checkboxy).toHaveCount(2);
  await checkboxy.nth(0).click();
  await checkboxy.nth(1).click();
  // Nazwa serii (karta C1): realne pole -> POST `name` -> rekord `run_batches` -> karta serii.
  await page.getByTestId('mvd-serie-nazwa').fill('Seria e2e — zwarcia GPZ');
  await page.getByTestId('mvd-serie-uruchom').click();

  // Seria wykonana: wiersz widoczny, status „Zakończona" (FINISHED), oba
  // przebiegi z przyciskiem „Pokaż wyniki" aktywnym (bieg DONE).
  const wiersz = page.locator('[data-testid^="mvd-serie-wiersz-"]').first();
  await expect(wiersz).toBeVisible({ timeout: 30000 });
  await expect(wiersz).toContainText('Zakończona');
  await expect(wiersz.locator('[data-testid^="mvd-serie-nazwa-"]')).toHaveText('Seria e2e — zwarcia GPZ');
  const przyciskiWynikow = wiersz.locator('[data-testid^="mvd-serie-wyniki-"]');
  await expect(przyciskiWynikow).toHaveCount(2);
  await expect(przyciskiWynikow.nth(0)).toBeEnabled();
  await expect(przyciskiWynikow.nth(1)).toBeEnabled();

  const idSerii = await wiersz.getAttribute('data-testid');

  // DOWÓD KARTY: odśwież stronę (nowe wczytanie SPA — symulacja utraty stanu
  // przeglądarki) — seria i jej status NIE giną: `GET /batches` z backendu
  // (rejestr `run_batches`, R2) oddaje TĘ SAMĄ serię.
  await page.reload({ waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
  await expect(page.getByTestId('mvd-serie')).toBeVisible();

  const wierszPoOdswiezeniu = page.locator(`[data-testid="${idSerii}"]`);
  await expect(wierszPoOdswiezeniu).toBeVisible({ timeout: 30000 });
  await expect(wierszPoOdswiezeniu).toContainText('Zakończona');
  await expect(wierszPoOdswiezeniu.locator('[data-testid^="mvd-serie-nazwa-"]')).toHaveText(
    'Seria e2e — zwarcia GPZ',
  );
  const przyciskiPoOdswiezeniu = wierszPoOdswiezeniu.locator(
    '[data-testid^="mvd-serie-wyniki-"]',
  );
  await expect(przyciskiPoOdswiezeniu).toHaveCount(2);
  await expect(przyciskiPoOdswiezeniu.nth(0)).toBeEnabled();
});
