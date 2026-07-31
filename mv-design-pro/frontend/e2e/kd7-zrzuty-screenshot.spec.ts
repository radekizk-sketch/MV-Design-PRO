/**
 * Zrzuty ŻYWEJ aplikacji dla karty KD-7 (bramka 5, dyrektywa właściciela #8):
 * `kd7-kadr-{dark,light}.png` — przestrzeń Schemat PO naprawie kadru: cała
 * rysowana treść (symbole, tory i PODPISY) mieści się w kanwie, a kadr jest
 * ciasny wokół treści.
 *
 * Scena REALNA: projekt + przypadek + GPZ + magistrala ze stacją zbudowane
 * operacjami domenowymi backendu — ta sama droga danych co spec bramki 1
 * `sld-first-uklad.spec.ts`, którego asercja „treść wewnątrz kanwy" łapała
 * wadę. Zrzut robiony PO natywnym „Dopasuj widok", żeby dokumentował kadr
 * z toru użytkownika, nie stan przejściowy pomiaru kontenera.
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
        idempotency_key: `e2e-kd7-zrzut-${name}-${String(++opCounter).padStart(4, '0')}`,
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
  const projectName = `Zrzut kadru ${suffix}`;
  const caseName = `Przeglad kadru ${suffix}`;

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Zrzuty kadru: cala tresc rysunku w kanwie',
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
  for (const [idx, length] of [300, 250, 200].entries()) {
    op = await domainOp(request, caseId, 'continue_trunk_segment_sn', {
      segment: {
        rodzaj: 'KABEL',
        dlugosc_m: length,
        name: `Odcinek ${idx + 1}`,
        catalog_binding: catalogBinding('KABEL_SN', CABLE_ID),
      },
    });
  }
  const segmentRefs = op.snapshot?.corridors?.[0]?.ordered_segment_refs ?? [];
  expect(segmentRefs.length).toBeGreaterThan(0);
  await domainOp(request, caseId, 'insert_station_on_segment_sn', {
    field_apparatus_catalog_ref: FIELD_APPARATUS_ID,
    segment_id: segmentRefs[segmentRefs.length - 1],
    station_type: 'B',
    insert_at: { value: 0.5 },
    station: { sn_voltage_kv: 15.0, nn_voltage_kv: 0.4 },
    sn_fields: ['IN', 'OUT', 'FEEDER'],
    transformer: { create: true, catalog_binding: catalogBinding('TRAFO_SN_NN', TRAFO_ID) },
  });

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

test.describe('kd7:zrzuty', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const { id, mode } of THEMES) {
    test(`kadr obejmuje cala tresc rysunku — ${id}`, async ({ page, request }) => {
      test.setTimeout(300000);
      const scena = await zbudujScene(request);
      await otworzSchemat(page, scena, mode);

      // Kadr z toru użytkownika: natywne „Dopasuj widok".
      await page.getByTestId('sld-v3-fit-view').click();
      await page.waitForTimeout(600);

      // Zrzut ma DOKUMENTOWAĆ naprawę, więc wpierw ją potwierdzamy tą samą
      // miarą co bramka 1: żaden element rysunku nie wychodzi poza kanwę.
      const pozaKanwa = await page.evaluate(() => {
        const svg = document.querySelector('svg[data-testid="sld-canvas-v3"]')!;
        const sr = svg.getBoundingClientRect();
        return Array.from(document.querySelectorAll('[data-element-kind], [data-owner-ref]'))
          .filter((el) => {
            const r = el.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) return false;
            return r.left < sr.left - 2 || r.right > sr.right + 2 || r.top < sr.top - 2 || r.bottom > sr.bottom + 2;
          })
          .map((el) => el.getAttribute('data-owner-ref') ?? el.getAttribute('data-element-kind'));
      });
      expect(pozaKanwa).toEqual([]);

      await page.screenshot({ path: path.join(OUTPUT_DIR, `kd7-kadr-${id}.png`) });
    });
  }
});
