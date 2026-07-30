/**
 * Zrzuty dokumentacyjne ŻYWEJ aplikacji — legenda symboli „na żądanie" (K12,
 * dyrektywa właściciela 2026-07-30) po scaleniu z układem SLD-first (K11-A).
 *
 * Dwa kadry per motyw (viewport, NIE fullPage — dyrektywa zrzutów):
 *  1. kanwa-bez-legendy — schemat po otwarciu: legenda NIE jest treścią
 *     kanwy, dok widoku (Dopasuj widok / Cały arkusz / Legenda) widoczny.
 *  2. legenda-panel — panel legendy otwarty z doku; wpisy WYŁĄCZNIE dla
 *     symboli obecnych w projekcie.
 *
 * Sieć: ta sama sekwencja domain-ops co e2e/legenda-na-zadanie.spec.ts
 * (źródło SN → magistrala → stacja SN/nN, bez agregatu).
 *
 * Uruchomienie (WYŁĄCZNIE tak):
 *   cd mv-design-pro/frontend && node ./scripts/playwright-run.mjs \
 *     e2e/legenda-zrzuty-screenshot.spec.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(_dirname, '../../docs/audit/visual/flow-ekspert');
const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const CABLE_ID = 'cable-tfk-yakxs-3x120';
const TRAFO_ID = 'tr-sn-nn-15-04-630kva-dyn11';
const SOURCE_ID = 'src-gpz-15kv-250mva-rx010';
const CATALOG_VERSION = '2024.1';
const THEMES = [
  { plik: 'dark', tryb: 'dark_scada' },
  { plik: 'light', tryb: 'light_technical' },
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
        idempotency_key: `e2e-legenda-zrzut-${name}-${String(++opCounter).padStart(4, '0')}`,
        payload,
      },
    },
    timeout: 30000,
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as {
    error?: string | null;
    snapshot?: { corridors?: Array<{ ordered_segment_refs?: string[] }> };
  };
  expect(body.error ?? null).toBeNull();
  return body;
}

async function zbudujSiec(request: APIRequestContext): Promise<{
  projectId: string;
  projectName: string;
  caseId: string;
  caseName: string;
}> {
  entityCounter += 1;
  const suffix = String(entityCounter).padStart(4, '0');
  const projectName = `Zrzuty legendy ${suffix}`;
  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Zrzuty dokumentacyjne legendy na żądanie',
      mode: 'TO-BE',
      voltage_level_kv: 15.0,
      frequency_hz: 50.0,
    },
    timeout: 30000,
  });
  expect(projectResponse.ok()).toBeTruthy();
  const project = (await projectResponse.json()) as { id: string };

  const caseName = `Przypadek zrzutów ${suffix}`;
  const caseResponse = await request.post(`${BACKEND_BASE}/api/study-cases`, {
    data: { project_id: project.id, name: caseName, description: '', config: {}, set_active: true },
    timeout: 30000,
  });
  expect(caseResponse.ok()).toBeTruthy();
  const studyCase = (await caseResponse.json()) as { id: string };
  const caseId = studyCase.id;

  await executeDomainOp(request, caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: buildCatalogBinding('ZRODLO_SN', SOURCE_ID),
  });
  const op = await executeDomainOp(request, caseId, 'continue_trunk_segment_sn', {
    segment: {
      rodzaj: 'KABEL',
      dlugosc_m: 250,
      name: 'Odcinek 1',
      catalog_binding: buildCatalogBinding('KABEL_SN', CABLE_ID),
    },
  });
  const segmentRefs = op.snapshot?.corridors?.[0]?.ordered_segment_refs ?? [];
  expect(segmentRefs.length).toBeGreaterThan(0);
  await executeDomainOp(request, caseId, 'insert_station_on_segment_sn', {
    // B-12: aparat pól SN wskazany JAWNIE (operacja nie dobiera go sama).
    field_apparatus_catalog_ref: 'sw-cb-abb-vd4-17kv-630a',
    segment_id: segmentRefs[segmentRefs.length - 1],
    station_type: 'B',
    insert_at: { value: 0.5 },
    station: { sn_voltage_kv: 15.0, nn_voltage_kv: 0.4 },
    sn_fields: ['IN', 'OUT', 'FEEDER'],
    transformer: { create: true, catalog_binding: buildCatalogBinding('TRAFO_SN_NN', TRAFO_ID) },
  });

  return { projectId: project.id, projectName, caseId, caseName };
}

async function otworzSld(
  page: Page,
  seed: { projectId: string; projectName: string; caseId: string; caseName: string },
  trybMotywu: string,
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
      localStorage.setItem(
        'mvd-theme-mode',
        JSON.stringify({ state: { mode: s.tryb }, version: 0 }),
      );
    },
    { ...seed, tryb: trybMotywu },
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#sld', { waitUntil: 'commit' });
  // Zimna kompilacja Vite pierwszej nawigacji — patrz komentarz w
  // e2e/legenda-na-zadanie.spec.ts.
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 60000 });
  await expect(page.getByTestId('sld-canvas-v3')).toBeVisible({ timeout: 30000 });
}

test.describe('legenda:zrzuty dokumentacyjne', () => {
  test.setTimeout(180000);
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const { plik, tryb } of THEMES) {
    test(`kanwa bez legendy + panel legendy — ${plik}`, async ({ page, request }) => {
      const seed = await zbudujSiec(request);
      await otworzSld(page, seed, tryb);

      // Kadr 1: schemat BEZ legendy na kanwie, dok widoku widoczny.
      await expect(page.getByTestId('sld-sheet-legend')).toHaveCount(0);
      await expect(page.getByTestId('sld-v3-view-dock')).toBeVisible();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(OUTPUT_DIR, `kanwa-bez-legendy-${plik}.png`) });

      // Kadr 2: panel legendy otwarty z doku (klik natywny).
      await page.getByTestId('sld-v3-legend-toggle').click();
      await expect(page.getByTestId('sld-v3-legend-panel')).toBeVisible();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(OUTPUT_DIR, `legenda-panel-${plik}.png`) });
    });
  }
});
