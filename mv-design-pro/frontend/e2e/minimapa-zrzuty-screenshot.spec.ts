/**
 * Zrzuty dokumentacyjne ŻYWEJ aplikacji — nawigator kanwy (minimapa), K11-B.
 *
 * Dwa kadry per motyw (viewport, NIE fullPage — dyrektywa zrzutów):
 *  1. sld-minimapa-{motyw} — nawigator rozwinięty z doku widoku: podgląd
 *     CAŁEJ sieci z prostokątem bieżącego kadru kamery,
 *  2. sld-minimapa-kadr-{motyw} — TEN SAM widok po kliknięciu w nawigatorze:
 *     kadr przeniesiony na wskazany fragment sieci (skala bez zmian).
 *
 * Sieć: 3 stacje SN/nN na magistrali (ta sama sekwencja domain-ops co
 * e2e/sld-minimapa.spec.ts).
 *
 * Uruchomienie (WYŁĄCZNIE tak):
 *   cd mv-design-pro/frontend && node ./scripts/playwright-run.mjs \
 *     e2e/minimapa-zrzuty-screenshot.spec.ts
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
const FIELD_APPARATUS_ID = 'sw-cb-abb-vd4-17kv-630a';
const CATALOG_VERSION = '2024.1';
const THEMES = [
  { plik: 'dark', tryb: 'dark_scada' },
  { plik: 'light', tryb: 'light_technical' },
] as const;
let opCounter = 0;
let entityCounter = 0;

type DomainOpResponse = {
  error?: string | null;
  snapshot?: { corridors?: Array<{ ordered_segment_refs?: string[] }> };
};

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
): Promise<DomainOpResponse> {
  const response = await request.post(`${BACKEND_BASE}/api/cases/${caseId}/enm/domain-ops`, {
    data: {
      project_id: '',
      snapshot_base_hash: '',
      operation: {
        name,
        idempotency_key: `e2e-minimapa-zrzut-${name}-${String(++opCounter).padStart(4, '0')}`,
        payload,
      },
    },
    timeout: 30000,
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as DomainOpResponse;
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
  const projectName = `E2E Nawigator zrzut ${suffix}`;
  const caseName = `Zakres nawigatora zrzut ${suffix}`;

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Zrzuty dokumentacyjne K11-B: nawigator kanwy',
      mode: 'TO-BE',
      voltage_level_kv: 15.0,
      frequency_hz: 50.0,
    },
    timeout: 30000,
  });
  expect(projectResponse.ok()).toBeTruthy();
  const project = (await projectResponse.json()) as { id: string };

  const caseResponse = await request.post(`${BACKEND_BASE}/api/study-cases`, {
    data: { project_id: project.id, name: caseName, description: '', config: {}, set_active: true },
    timeout: 30000,
  });
  expect(caseResponse.ok()).toBeTruthy();
  const caseId = ((await caseResponse.json()) as { id: string }).id;

  await executeDomainOp(request, caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: buildCatalogBinding('ZRODLO_SN', SOURCE_ID),
  });
  let op: DomainOpResponse = {};
  for (const [idx, length] of [400, 350, 300, 250].entries()) {
    op = await executeDomainOp(request, caseId, 'continue_trunk_segment_sn', {
      segment: {
        rodzaj: 'KABEL',
        dlugosc_m: length,
        name: `Odcinek ${idx + 1}`,
        catalog_binding: buildCatalogBinding('KABEL_SN', CABLE_ID),
      },
    });
  }
  for (let i = 0; i < 3; i++) {
    const segmentRefs = op.snapshot?.corridors?.[0]?.ordered_segment_refs ?? [];
    expect(segmentRefs.length).toBeGreaterThan(0);
    op = await executeDomainOp(request, caseId, 'insert_station_on_segment_sn', {
      // B-12: aparat pól SN wskazany JAWNIE (operacja nie dobiera go sama).
      field_apparatus_catalog_ref: FIELD_APPARATUS_ID,
      segment_id: segmentRefs[segmentRefs.length - 1],
      station_type: 'B',
      insert_at: { value: 0.5 },
      station: { sn_voltage_kv: 15.0, nn_voltage_kv: 0.4 },
      // KOMPLETNOSC-POLA-TR (klasa A): stacja SN/nN Z transformatorem — pole roli
    // 'TR' dopisane, bo realna rozdzielnia realizuje odejscie do transformatora
    // polem transformatorowym. Kreator stacji tworzy je domyslnie, wiec fixture
    // bez niego opisywal siec, ktorej kreator by nie zbudowal.
    sn_fields: ['IN', 'OUT', 'FEEDER', 'TR'],
      transformer: { create: true, catalog_binding: buildCatalogBinding('TRAFO_SN_NN', TRAFO_ID) },
    });
  }

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
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 60000 });
  await expect(page.getByTestId('sld-canvas-v3')).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(800);
}

test.describe('minimapa:zrzuty dokumentacyjne', () => {
  test.setTimeout(180000);
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const { plik, tryb } of THEMES) {
    test(`nawigator rozwinięty + kadr po kliknięciu — ${plik}`, async ({ page, request }) => {
      const seed = await zbudujSiec(request);
      await otworzSld(page, seed, tryb);

      // Kadr 1: nawigator rozwinięty z doku widoku (klik natywny).
      await page.getByTestId('sld-v3-minimap-toggle').click();
      await expect(page.getByTestId('sld-v3-minimap-panel')).toBeVisible();
      await expect(page.getByTestId('sld-v3-minimap-frame')).toBeVisible();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(OUTPUT_DIR, `sld-minimapa-${plik}.png`) });

      // Kadr 2: przybliżenie kamery + wskazanie w nawigatorze — kadr przenosi
      // się na wskazany fragment sieci (prostokąt kadru widoczny na podglądzie).
      const kanwa = page.locator('svg[data-testid="sld-canvas-v3"]');
      const kanwaBox = await kanwa.boundingBox();
      expect(kanwaBox).not.toBeNull();
      await page.mouse.move(kanwaBox!.x + kanwaBox!.width / 2, kanwaBox!.y + kanwaBox!.height / 2);
      await page.mouse.wheel(0, -400);
      await page.waitForTimeout(300);

      const panel = page.getByTestId('sld-v3-minimap-svg');
      const panelBox = await panel.boundingBox();
      expect(panelBox).not.toBeNull();
      await page.mouse.click(panelBox!.x + panelBox!.width * 0.75, panelBox!.y + panelBox!.height * 0.5);
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUTPUT_DIR, `sld-minimapa-kadr-${plik}.png`) });
    });
  }
});
