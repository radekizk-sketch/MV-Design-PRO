/**
 * K9-B — zrzuty dokumentacyjne kreatora stacji SN/nN (bramka 6 karty).
 *
 * Trzy kadry per motyw (viewport, NIE fullPage — dyrektywa zrzutów): krok
 * szablonu, krok pól rozdzielnicy i krok podglądu skutków. Zrzuty pochodzą
 * z ŻYWEJ aplikacji (real backend), nie z mocków.
 *
 * Wzorzec: e2e/legenda-zrzuty-screenshot.spec.ts (motyw z localStorage
 * `mvd-theme-mode`, katalog docs/audit/visual/flow-ekspert).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(_dirname, '../../docs/audit/visual/flow-ekspert');
const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const CABLE_ID = 'cable-tfk-yakxs-3x120';
const SOURCE_ID = 'src-gpz-15kv-250mva-rx010';
const CATALOG_VERSION = '2024.1';

const THEMES = [
  { plik: 'dark', tryb: 'dark' },
  { plik: 'light', tryb: 'light' },
] as const;

let opCounter = 0;
let entityCounter = 0;

function buildCatalogBinding(catalogNamespace: string, catalogItemId: string) {
  return {
    catalog_namespace: catalogNamespace,
    catalog_item_id: catalogItemId,
    catalog_item_version: CATALOG_VERSION,
  };
}

async function executeDomainOp(
  request: APIRequestContext,
  caseId: string,
  name: string,
  payload: Record<string, unknown>,
): Promise<{ error?: string | null; snapshot?: { corridors?: Array<{ ordered_segment_refs?: string[] }> } }> {
  const response = await request.post(`${BACKEND_BASE}/api/cases/${caseId}/enm/domain-ops`, {
    data: {
      project_id: '',
      snapshot_base_hash: '',
      operation: {
        name,
        idempotency_key: `e2e-stacja-zrzut-${name}-${String(++opCounter).padStart(4, '0')}`,
        payload,
      },
    },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.error ?? null).toBeNull();
  return body;
}

async function zbudujSiec(request: APIRequestContext) {
  entityCounter += 1;
  const suffix = String(entityCounter).padStart(4, '0');
  const projectName = `Zrzuty kreator stacji ${suffix}`;
  const caseName = `Przypadek zrzutów ${suffix}`;

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Zrzuty kroków kreatora stacji (K9-B)',
      mode: 'TO-BE',
      voltage_level_kv: 15.0,
      frequency_hz: 50.0,
    },
  });
  expect(projectResponse.ok()).toBeTruthy();
  const project = (await projectResponse.json()) as { id: string };

  const caseResponse = await request.post(`${BACKEND_BASE}/api/study-cases`, {
    data: { project_id: project.id, name: caseName, description: '', config: {}, set_active: true },
  });
  expect(caseResponse.ok()).toBeTruthy();
  const studyCase = (await caseResponse.json()) as { id: string };

  await executeDomainOp(request, studyCase.id, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: buildCatalogBinding('ZRODLO_SN', SOURCE_ID),
  });
  let op: Awaited<ReturnType<typeof executeDomainOp>> | null = null;
  for (const [idx, length] of [300, 250].entries()) {
    op = await executeDomainOp(request, studyCase.id, 'continue_trunk_segment_sn', {
      segment: {
        rodzaj: 'KABEL',
        dlugosc_m: length,
        name: `Odcinek ${idx + 1}`,
        catalog_binding: buildCatalogBinding('KABEL_SN', CABLE_ID),
      },
    });
  }
  const segmentRefs = op?.snapshot?.corridors?.[0]?.ordered_segment_refs ?? [];
  expect(segmentRefs.length).toBeGreaterThan(0);

  return {
    projectId: project.id,
    projectName,
    caseId: studyCase.id,
    caseName,
    segmentId: segmentRefs[segmentRefs.length - 1],
  };
}

async function otworzKreator(
  page: Page,
  seed: Awaited<ReturnType<typeof zbudujSiec>>,
  tryb: string,
): Promise<void> {
  await page.addInitScript(
    (s) => {
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
      localStorage.setItem('mvd-theme-mode', JSON.stringify({ state: { mode: s.tryb }, version: 0 }));
    },
    { ...seed, tryb },
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 60000 });
  await page.waitForFunction(() => Boolean((window as any).__mvdpOpenOperationForm), null, {
    timeout: 30000,
  });
  await page.evaluate((seg) => {
    (window as any).__mvdpOpenOperationForm('insert_station_on_segment_sn', {
      segment_id: seg,
      segment_ref: seg,
      position_on_segment: 0.5,
      element_ref: seg,
      element_type: 'LineBranch',
    });
  }, seed.segmentId);
  await expect(page.getByTestId('mvd-kreator-stacja')).toBeVisible({ timeout: 30000 });
}

test.describe('kreator stacji: zrzuty dokumentacyjne', () => {
  test.setTimeout(240000);
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const { plik, tryb } of THEMES) {
    test(`kroki kreatora stacji — ${plik}`, async ({ page, request }) => {
      const seed = await zbudujSiec(request);
      await otworzKreator(page, seed, tryb);

      // Kadr 1: krok szablonu startowego (biblioteka szablonów stacji).
      await expect(page.getByTestId('mvd-kreator-stacja-szablon')).toBeVisible();
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUTPUT_DIR, `kreator-stacji-szablon-${plik}.png`) });

      // Kadr 2: krok pól rozdzielnicy (lista pól z aparatem z katalogu).
      await page.getByTestId('mvd-kreator-krok-pola').click();
      await expect(page.getByTestId('mvd-kreator-stacja-pole-wiersz-1')).toBeVisible({
        timeout: 30000,
      });
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUTPUT_DIR, `kreator-stacji-pola-${plik}.png`) });

      // Kadr 3: krok podglądu skutków (readout z dry_run backendu).
      await page.getByTestId('mvd-kreator-krok-podglad').click();
      await expect(page.getByTestId('mvd-kreator-stacja-podglad-skutkow')).toBeVisible();
      await page.getByTestId('mvd-kreator-stacja-podglad-przelicz').click();
      await expect(page.getByTestId('mvd-kreator-stacja-podglad-ladowanie')).toHaveCount(0, {
        timeout: 60000,
      });
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUTPUT_DIR, `kreator-stacji-podglad-${plik}.png`) });
    });
  }
});
