/**
 * E2E real-backend — SLD z aktywnym GPZ.
 *
 * PRZEPISANY PRZY ODBIORZE KARTY K2 (Zero-Debt pkt 5). Poprzednia wersja
 * podkładała ZMYŚLONE UUID projektu/przypadku pod niewłaściwymi kluczami
 * localStorage — zasiew nigdy nie działał, a „zielony" wynik był zrzutem
 * kanwy na domyślnym, PUSTYM modelu (test maskował brak danych). Hydratacja
 * powłoki z K2 uczciwie zwalidowała fantomowe ID na serwerze (404 → czyszczenie
 * stanu) i spec spadł — czyli produkt zadziałał poprawnie, defekt był w teście.
 *
 * INTENCJA (zachowana): kanwa SLD v3 po otwarciu projektu z GPZ pokazuje
 * rozdzielnię GPZ, nie stan pusty; zrzut dokumentacyjny do docs/audits.
 * Teraz: projekt + przypadek + GPZ powstają REALNIE przez API (wzorzec
 * restart-po-biegu/critical-run-flow), a persist dostaje PRAWDZIWE ID.
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const SCREENSHOT_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'docs',
  'audits',
  'screenshots',
);

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const SOURCE_ID = 'src-gpz-15kv-250mva-rx010';
const CATALOG_VERSION = '2024.1';

async function createProjectCaseWithGpz(
  request: APIRequestContext,
): Promise<{ projectId: string; projectName: string; caseId: string; caseName: string }> {
  const suffix = String(Date.now() % 100000);
  const projectName = `E2E SLD GPZ ${suffix}`;
  const caseName = `Przypadek SLD ${suffix}`;

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Zrzut SLD z GPZ (spec sld-gpz-rendered)',
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

  const opResponse = await request.post(
    `${BACKEND_BASE}/api/cases/${studyCase.id}/enm/domain-ops`,
    {
      data: {
        project_id: '',
        snapshot_base_hash: '',
        operation: {
          name: 'add_grid_source_sn',
          idempotency_key: `e2e-sld-gpz-${suffix}`,
          payload: {
            voltage_kv: 15.0,
            sk3_mva: 250.0,
            rx_ratio: 0.1,
            catalog_binding: {
              catalog_namespace: 'ZRODLO_SN',
              catalog_item_id: SOURCE_ID,
              catalog_item_version: CATALOG_VERSION,
            },
          },
        },
      },
    },
  );
  expect(opResponse.ok()).toBeTruthy();
  const op = (await opResponse.json()) as { error?: string | null };
  expect(op.error ?? null).toBeNull();

  return { projectId: project.id, projectName, caseId: studyCase.id, caseName };
}

async function waitForAppReady(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="app-ready"]', {
    state: 'attached',
    timeout: 15_000,
  });
}

test.describe('SLD z aktywnym GPZ (real-backend)', () => {
  test('aktywacja realnego projektu + case, kanwa pokazuje GPZ, screenshot SLD', async ({
    page,
    request,
  }) => {
    const seed = await createProjectCaseWithGpz(request);

    // Persist powłoki dostaje PRAWDZIWE identyfikatory (klucz i kształt 1:1
    // z zustand persist `mv-design-app-state` — jak w restart-po-biegu).
    await page.addInitScript((s) => {
      localStorage.setItem(
        'mv-design-app-state',
        JSON.stringify({
          state: {
            activeProjectId: s.projectId,
            activeProjectName: s.projectName,
            activeCaseId: s.caseId,
            activeCaseName: s.caseName,
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
    }, seed);

    await page.goto(`/#sld?project=${seed.projectId}&case=${seed.caseId}`);
    await waitForAppReady(page);

    const canvas = page.getByTestId('sld-canvas-v3');
    await expect(canvas).toBeVisible({ timeout: 15_000 });
    // GPZ istnieje w modelu ⇒ kanwa NIE może pokazywać stanu pustego — to jest
    // właściwa treść tego testu (poprzednio zrzut pustki uchodził za sukces).
    await expect(page.getByTestId('sld-empty-state')).toHaveCount(0);

    await page.screenshot({
      path: join(SCREENSHOT_DIR, 'sld-with-gpz-loaded.png'),
      fullPage: true,
    });
  });
});
