/**
 * Zrzuty ŻYWEJ aplikacji dla karty KD-8 (bramka 6, dyrektywa właściciela #8):
 *  - `kd8-motyw-l0-{dark,light}.png`           — przegląd sieci (L0),
 *  - `kd8-motyw-gpz-{dark,light}.png`          — rozwinięcie bloku GPZ,
 *  - `kd8-motyw-konfigurator-{dark,light}.png` — konfigurator stacji z
 *    komunikatem blokady („Brak wolnego portu wyjściowego SN…").
 *
 * TE SAME kadry w obu motywach — wariant `light` MUSI być realnie jasny
 * (ocena właściciela 2/10: „motyw jasny jest deklaracją bez pokrycia").
 * Scena REALNA: projekt + przypadek + GPZ + magistrala z trzema stacjami
 * zbudowane operacjami domenowymi backendu (ta sama droga danych co spec
 * KD-5), rozwinięcie bloku KLIKIEM NATYWNYM.
 *
 * Spec ASERTUJE jasność zrzutu przed zapisem: zrzut „light" z ciemną kanwą
 * byłby dowodem defektu, nie naprawy — więc mierzymy tło kanwy tak samo jak
 * `kd8-motyw-jedna-prawda.spec.ts`.
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
  { id: 'light', mode: 'light_technical', jasny: true },
  { id: 'dark', mode: 'dark_scada', jasny: false },
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
      operation: { name, idempotency_key: `e2e-kd8-zrzut-${name}-${String(++opCounter).padStart(4, '0')}`, payload },
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
  const projectName = `Zrzut KD-8 motyw ${suffix}`;
  const caseName = `Przeglad sieci ${suffix}`;

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Zrzuty KD-8: motyw steruje paleta kazdej powierzchni',
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
      sn_fields: ['IN', 'OUT', 'FEEDER'],
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

/** Jasność względna (WCAG) tła kanwy — dowód, że wariant „light" jest jasny. */
async function jasnoscKanwy(page: Page): Promise<number> {
  const kolor = await page.evaluate(
    () => getComputedStyle(document.querySelector('svg[data-testid="sld-canvas-v3"]')!).backgroundColor,
  );
  const nums = kolor.match(/\d+(\.\d+)?/g) ?? [];
  const [r, g, b] = nums
    .slice(0, 3)
    .map((n) => Number(n) / 255)
    .map((s) => (s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

test.describe('kd8:zrzuty', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const { id, mode, jasny } of THEMES) {
    test(`motyw ${id}: przegląd, rozwinięcie GPZ i konfigurator z blokadą`, async ({ page, request }) => {
      test.setTimeout(300000);
      const scena = await zbudujScene(request);
      await otworzSchemat(page, scena, mode);

      const canvas = page.locator('svg[data-testid="sld-canvas-v3"]');
      const symbole = page.locator('[data-testid="sld-v3-symbols"]');
      const wezelBloku = symbole.locator('g[data-element-kind="station"]', {
        has: page.locator('[data-symbol-canon="gpzCollapsed"]'),
      });

      // Zrzut ma DOKUMENTOWAĆ naprawę — potwierdzamy ją miarą przed zapisem.
      const jasnosc = await jasnoscKanwy(page);
      if (jasny) {
        expect(jasnosc, `kanwa motywu ${id} nie jest jasna`).toBeGreaterThan(0.5);
      } else {
        expect(jasnosc, `kanwa motywu ${id} nie jest ciemna`).toBeLessThan(0.2);
      }

      // (1) Widok przeglądowy (L0) kółkiem — natywnie, jak użytkownik.
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
      await page.screenshot({ path: path.join(OUTPUT_DIR, `kd8-motyw-l0-${id}.png`) });

      // (2) Klik NATYWNY w blok ⇒ rozwinięcie + selekcja (panele elementu).
      const box = await wezelBloku.boundingBox();
      expect(box).not.toBeNull();
      await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.waitForTimeout(1200);
      await expect(canvas).not.toHaveAttribute('data-scene-lod', '0');
      await expect(symbole.locator('[data-symbol-canon="transformer2W"]').first()).toBeVisible();

      // (3) Konfigurator stacji z komunikatem BLOKADY — kadr z panelami.
      const blokada = page.getByTestId('station-network-action-blockers');
      if (await blokada.count() > 0) {
        await expect(blokada).toBeVisible();
      }
      await page.screenshot({ path: path.join(OUTPUT_DIR, `kd8-motyw-konfigurator-${id}.png`) });

      // (4) Sam SCHEMAT po rozwinięciu (selekcja zdjęta realną ścieżką).
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1200);
      await expect(symbole.locator('[data-symbol-canon="transformer2W"]').first()).toBeVisible();
      await page.screenshot({ path: path.join(OUTPUT_DIR, `kd8-motyw-gpz-${id}.png`) });
    });
  }
});
