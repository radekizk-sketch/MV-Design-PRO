/**
 * Zrzuty ŻYWEJ aplikacji dla karty KD-5 (bramka 6, dyrektywa właściciela #8):
 *  - `kd5-gpz-l0-{dark,light}.png`  — widok przeglądowy ze ZWINIĘTYM blokiem GPZ,
 *  - `kd5-gpz-rozwiniety-{dark,light}.png` — ten sam schemat PO kliknięciu w blok
 *    (kamera na progu szczegółu, pełny układ GPZ).
 *
 * Scena jest REALNA: projekt + przypadek + GPZ + magistrala z trzema stacjami
 * zbudowane operacjami domenowymi na backendzie (ta sama droga danych, co spec
 * bramki 4 `sld-gpz-zwiniety.spec.ts`) — żadnego harnessu, żadnych
 * zaszczepionych scen. Rozwinięcie wywołane KLIKIEM NATYWNYM, nie propem.
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(_dirname, '../../docs/audit/visual/flow-ekspert');

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const CABLE_ID = 'cable-tfk-yakxs-3x120';
const TRAFO_ID = 'tr-sn-nn-15-04-630kva-dyn11';
const SOURCE_ID = 'src-gpz-15kv-250mva-rx010';
const FIELD_APPARATUS_ID = 'sw-cb-abb-vd4-17kv-630a';
const CATALOG_VERSION = '2024.1';

const THEMES = [
  { id: 'light', mode: 'light_technical' },
  { id: 'dark', mode: 'dark_scada' },
] as const;

let opCounter = 0;
let entityCounter = 0;

type DomainOpResponse = {
  error?: string | null;
  snapshot?: { corridors?: Array<{ ordered_segment_refs?: string[] }> };
};

interface Scena {
  projectId: string;
  projectName: string;
  caseId: string;
  caseName: string;
}

function catalogBinding(namespace: string, itemId: string) {
  return { catalog_namespace: namespace, catalog_item_id: itemId, catalog_item_version: CATALOG_VERSION };
}

async function domainOp(
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
        idempotency_key: `e2e-kd5-zrzut-${name}-${String(++opCounter).padStart(4, '0')}`,
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

async function zbudujScene(request: APIRequestContext): Promise<Scena> {
  entityCounter += 1;
  const suffix = String(entityCounter).padStart(4, '0');
  const projectName = `Zrzut KD-5 blok GPZ ${suffix}`;
  const caseName = `Przeglad sieci ${suffix}`;

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Zrzuty KD-5: blok GPZ zwiniety i rozwiniety',
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

  await domainOp(request, caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: catalogBinding('ZRODLO_SN', SOURCE_ID),
  });
  let op: DomainOpResponse = {};
  for (const [idx, length] of [400, 350, 300, 250].entries()) {
    op = await domainOp(request, caseId, 'continue_trunk_segment_sn', {
      segment: {
        rodzaj: 'KABEL',
        dlugosc_m: length,
        name: `Odcinek ${idx + 1}`,
        catalog_binding: catalogBinding('KABEL_SN', CABLE_ID),
      },
    });
  }
  for (let i = 0; i < 3; i++) {
    const segmentRefs = op.snapshot?.corridors?.[0]?.ordered_segment_refs ?? [];
    expect(segmentRefs.length).toBeGreaterThan(0);
    op = await domainOp(request, caseId, 'insert_station_on_segment_sn', {
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
      transformer: { create: true, catalog_binding: catalogBinding('TRAFO_SN_NN', TRAFO_ID) },
    });
  }

  return { projectId: project.id, projectName, caseId, caseName };
}

async function otworzSchemat(page: Page, scena: Scena, motyw: string): Promise<void> {
  await page.addInitScript(
    (dane) => {
      localStorage.setItem(
        'mv-design-app-state',
        JSON.stringify({
          state: {
            activeProjectId: dane.projectId,
            activeProjectName: dane.projectName,
            activeCaseId: dane.caseId,
            activeCaseName: dane.caseName,
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
      localStorage.setItem('mvd-theme-mode', JSON.stringify({ state: { mode: dane.motyw }, version: 0 }));
    },
    { ...scena, motyw },
  );
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
  await page.getByRole('button', { name: 'Schemat (SLD)' }).first().click();
  await expect(page.locator('svg[data-testid="sld-canvas-v3"]')).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(1000);
}

test.describe('kd5:zrzuty', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const { id, mode } of THEMES) {
    test(`blok GPZ: przeglad (zwiniety) i rozwiniecie — ${id}`, async ({ page, request }) => {
      test.setTimeout(300000);
      const scena = await zbudujScene(request);
      await otworzSchemat(page, scena, mode);

      const canvas = page.locator('svg[data-testid="sld-canvas-v3"]');
      const symbole = page.locator('[data-testid="sld-v3-symbols"]');
      const wezelBloku = symbole.locator('g[data-element-kind="station"]', {
        has: page.locator('[data-symbol-canon="gpzCollapsed"]'),
      });

      // (1) Zejscie na WIDOK PRZEGLADOWY kolkiem (natywnie — mala siec fituje
      // sie w skali szczegolu), a tam blok GPZ ZWINIETY.
      const canvasBox = await canvas.boundingBox();
      expect(canvasBox).not.toBeNull();
      await page.mouse.move(canvasBox!.x + canvasBox!.width / 2, canvasBox!.y + canvasBox!.height / 2);
      let poziom = await canvas.getAttribute('data-scene-lod');
      for (let krok = 0; krok < 16 && poziom !== '0'; krok++) {
        await page.mouse.wheel(0, 200);
        await page.waitForTimeout(150);
        poziom = await canvas.getAttribute('data-scene-lod');
      }
      await expect(canvas).toHaveAttribute('data-scene-lod', '0');
      await expect(wezelBloku).toHaveCount(1);
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(OUTPUT_DIR, `kd5-gpz-l0-${id}.png`) });

      // (2) Klik NATYWNY w blok ⇒ rozwiniecie (kamera na progu szczegolu).
      const box = await wezelBloku.boundingBox();
      expect(box).not.toBeNull();
      await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.waitForTimeout(800);
      await expect(canvas).not.toHaveAttribute('data-scene-lod', '0');
      await expect(symbole.locator('[data-symbol-canon="transformer2W"]').first()).toBeVisible();
      // Klik w blok to TAKZE selekcja (element GPZ), wiec otwiera panele
      // elementu — na zrzucie „po rozwinieciu" chcemy zobaczyc SCHEMAT, nie
      // panele. Zdejmujemy selekcje realna sciezka uzytkownika (Escape).
      await page.keyboard.press('Escape');
      // Panele elementu gasna z animacja — czekamy, zeby zrzut pokazal SCHEMAT,
      // a nie klatke posrednia zanikania.
      await page.waitForTimeout(1200);
      await expect(symbole.locator('[data-symbol-canon="transformer2W"]').first()).toBeVisible();
      await page.screenshot({ path: path.join(OUTPUT_DIR, `kd5-gpz-rozwiniety-${id}.png`) });
    });
  }
});
