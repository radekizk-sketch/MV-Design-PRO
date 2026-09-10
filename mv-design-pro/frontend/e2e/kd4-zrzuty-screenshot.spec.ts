/**
 * Zrzuty ŻYWEJ aplikacji dla karty KD-4 (bramka 5, dyrektywa właściciela #8):
 *  - ogniwo: werdykty wytrzymałości aparatury przy wybranym punkcie zwarcia,
 *  - parytet L-15: generator raportu w powłoce (skład dokumentu).
 * Oba motywy. Zrzut = jedyny dowód wyglądu na stronie oceny.
 *
 * Scena jest REALNA: projekt + przypadek + sieć ze stacją + zapisana aparatura
 * pól + policzony bieg zwarciowy na backendzie (te same operacje, co spec
 * bramki 1) — żadnego harnessu i żadnych zaszczepionych wyników.
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
const CATALOG_VERSION = '2024.1';
const APARAT_ID = 'wstd_breaker_vacuum_15_25';
const POLE = 'P-01';

const THEMES = [
  { id: 'light', mode: 'light_technical' },
  { id: 'dark', mode: 'dark_scada' },
] as const;

let opCounter = 0;

type DomainOpResponse = {
  error?: string | null;
  snapshot?: {
    corridors?: Array<{ ordered_segment_refs?: string[] }>;
    branches?: Array<{ ref_id: string; type?: string }>;
    transformers?: Array<{ ref_id: string }>;
    substations?: Array<{ ref_id: string; bus_refs?: string[] }>;
  };
};

interface Scena {
  projectId: string;
  projectName: string;
  caseId: string;
  caseName: string;
  runId: string;
  punktNazwa: string;
}

function catalogBinding(namespace: string, itemId: string) {
  return {
    catalog_namespace: namespace,
    catalog_item_id: itemId,
    catalog_item_version: CATALOG_VERSION,
  };
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
        idempotency_key: `e2e-zrzut-${name}-${String(++opCounter).padStart(4, '0')}`,
        payload,
      },
    },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as DomainOpResponse;
  expect(body.error ?? null).toBeNull();
  return body;
}

async function czekajNaWynik(request: APIRequestContext, runId: string): Promise<void> {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const response = await request.get(`${BACKEND_BASE}/api/analysis-runs/${runId}/results/index`);
    if (response.ok()) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Wynik biegu ${runId} nie pojawił się w czasie budżetu.`);
}

async function zbudujScene(request: APIRequestContext): Promise<Scena> {
  const znacznik = String(Date.now());
  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: `Zrzuty KD-4 ${znacznik}`,
      description: 'Scena zrzutów: ogniwo aparatury + generator raportu',
      mode: 'TO-BE',
      voltage_level_kv: 15.0,
      frequency_hz: 50.0,
    },
  });
  expect(projectResponse.ok()).toBeTruthy();
  const project = (await projectResponse.json()) as { id: string; name: string };

  const caseResponse = await request.post(`${BACKEND_BASE}/api/study-cases`, {
    data: {
      project_id: project.id,
      name: `Przypadek zrzutów ${znacznik}`,
      description: '',
      config: {},
      set_active: true,
    },
  });
  expect(caseResponse.ok()).toBeTruthy();
  const studyCase = (await caseResponse.json()) as { id: string; name: string };

  await domainOp(request, studyCase.id, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: catalogBinding('ZRODLO_SN', SOURCE_ID),
    hv_voltage_kv: 110.0,
    transformer_sn_mva: 25.0,
  });
  let op: DomainOpResponse = {};
  for (const [idx, length] of [300, 250].entries()) {
    op = await domainOp(request, studyCase.id, 'continue_trunk_segment_sn', {
      segment: {
        rodzaj: 'KABEL',
        dlugosc_m: length,
        name: `Odcinek ${idx + 1}`,
        catalog_binding: catalogBinding('KABEL_SN', CABLE_ID),
      },
    });
  }
  const segmentRefs = op.snapshot?.corridors?.[0]?.ordered_segment_refs ?? [];
  op = await domainOp(request, studyCase.id, 'insert_station_on_segment_sn', {
    field_apparatus_catalog_ref: 'sw-cb-abb-vd4-17kv-630a',
    segment_id: segmentRefs[segmentRefs.length - 1],
    station_type: 'B',
    insert_at: { value: 0.5 },
    station: { sn_voltage_kv: 15.0, nn_voltage_kv: 0.4 },
    // KOMPLETNOSC-POLA-TR (klasa A): stacja SN/nN Z transformatorem — pole roli
    // 'TR' dopisane, bo realna rozdzielnia realizuje odejscie do transformatora
    // polem transformatorowym. Kreator stacji tworzy je domyslnie, wiec fixture
    // bez niego opisywal siec, ktorej kreator by nie zbudowal.
    sn_fields: ['IN', 'OUT', 'TR'],
    transformer: { create: true, catalog_binding: catalogBinding('TRAFO_SN_NN', TRAFO_ID) },
  });
  const stacja = (op.snapshot?.substations ?? []).find((s) => s.ref_id.includes('/station'));
  const stationRef = stacja!.ref_id;
  const busRefy = stacja!.bus_refs ?? [];

  // Kategoria katalogu MUSI pasować do rodzaju gałęzi: KABEL_SN dostają
  // WYŁĄCZNIE odcinki liniowe (aparat pola ma wiązanie APARAT_SN, którego nie
  // wolno nadpisać — `catalog.namespace_mismatch`, KD-6).
  const odcinkiLiniowe = (op.snapshot?.branches ?? []).filter(
    (branch) => branch.type === 'cable' || branch.type === 'line_overhead',
  );
  for (const branch of odcinkiLiniowe) {
    await domainOp(request, studyCase.id, 'assign_catalog_to_element', {
      element_ref: branch.ref_id,
      catalog_binding: catalogBinding('KABEL_SN', CABLE_ID),
    });
  }
  for (const transformer of op.snapshot?.transformers ?? []) {
    await domainOp(request, studyCase.id, 'assign_catalog_to_element', {
      element_ref: transformer.ref_id,
      catalog_binding: catalogBinding('TRAFO_SN_NN', TRAFO_ID),
    });
    await domainOp(request, studyCase.id, 'update_element_parameters', {
      element_ref: transformer.ref_id,
      parameters: {
        sn_mva: 0.63,
        uhv_kv: 15.0,
        ulv_kv: 0.4,
        uk_percent: 4.0,
        pk_kw: 6.5,
        vector_group: 'Dyn5',
        parameter_source: 'CATALOG',
      },
    });
  }

  const configResponse = await request.put(
    `${BACKEND_BASE}/api/v1/projects/${project.id}/audit2-station-config/${encodeURIComponent(stationRef)}`,
    {
      data: {
        mv_neutral_grounding_ref: null,
        tap_changer_refs: [],
        der_specs: [],
        bay_device_withstand: {
          [POLE]: {
            device_id: APARAT_ID,
            i_peak_calculated_ka: 1.0,
            i_thermal_calculated_ka: 1.0,
            t_clearing_s: 0.5,
          },
        },
      },
    },
  );
  expect(configResponse.ok()).toBeTruthy();

  const createRun = await request.post(
    `${BACKEND_BASE}/api/execution/study-cases/${studyCase.id}/runs`,
    { data: { analysis_type: 'SC_3F' } },
  );
  expect(createRun.ok()).toBeTruthy();
  const run = (await createRun.json()) as { id: string };
  const executeRun = await request.post(`${BACKEND_BASE}/api/execution/runs/${run.id}/execute`);
  expect(executeRun.ok()).toBeTruthy();
  await czekajNaWynik(request, run.id);

  const wynikResponse = await request.get(
    `${BACKEND_BASE}/api/analysis-runs/${run.id}/results/short-circuit`,
  );
  const wynik = (await wynikResponse.json()) as {
    rows: Array<{ target_id: string; element_id?: string; target_name?: string | null; ip_ka: number | null }>;
  };
  const punkt = wynik.rows.find(
    (r) => r.ip_ka !== null && busRefy.includes(r.element_id ?? r.target_id),
  );
  expect(punkt, 'Scena zrzutu wymaga punktu zwarcia na szynie stacji.').toBeTruthy();

  return {
    projectId: project.id,
    projectName: project.name,
    caseId: studyCase.id,
    caseName: studyCase.name,
    runId: run.id,
    punktNazwa: punkt!.target_name ?? punkt!.target_id,
  };
}

async function otworz(page: Page, scena: Scena, motyw: string, hash: string): Promise<void> {
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
            activeCaseResultStatus: 'FRESH',
            activeSnapshotId: null,
            activeMode: 'MODEL_EDIT',
            activeRunId: dane.runId,
            activeAnalysisType: 'SHORT_CIRCUIT',
            caseManagerOpen: false,
            issuePanelOpen: false,
          },
          version: 1,
        }),
      );
      localStorage.setItem(
        'mvd-theme-mode',
        JSON.stringify({ state: { mode: dane.motyw }, version: 0 }),
      );
    },
    { ...scena, motyw },
  );
  await page.goto(hash, { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test.describe('kd4:zrzuty', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const { id, mode } of THEMES) {
    test(`ogniwo aparatura — ${id}`, async ({ page, request }) => {
      test.setTimeout(240000);
      const scena = await zbudujScene(request);

      await page.setViewportSize({ width: 1360, height: 980 });
      await otworz(page, scena, mode, `/#analysis?run=${scena.runId}`);
      await page.getByRole('tab', { name: /Zwarcia/ }).click();
      await expect(page.getByTestId('mvd-zwarcia-ekran')).toBeVisible({ timeout: 30000 });
      await page
        .getByRole('row', { name: new RegExp(escapeRegExp(scena.punktNazwa)) })
        .first()
        .click();

      const sekcja = page.getByTestId('mvd-zwarcia-aparatura');
      await sekcja.scrollIntoViewIfNeeded();
      await page.getByTestId('mvd-zwarcia-aparatura-sprawdz').click();
      await expect(page.getByTestId(`mvd-zwarcia-aparatura-pole-${POLE}`)).toBeVisible({
        timeout: 30000,
      });

      await sekcja.screenshot({ path: path.join(OUTPUT_DIR, `ogniwo-aparatura-${id}.png`) });
    });

    test(`parytet generator raportu — ${id}`, async ({ page, request }) => {
      test.setTimeout(240000);
      const scena = await zbudujScene(request);

      await page.setViewportSize({ width: 1360, height: 980 });
      await otworz(page, scena, mode, '/');
      await page.getByRole('button', { name: /^Dokumentacja/ }).click();
      await page
        .getByTestId('mvd-dok-karta-raport')
        .getByRole('button', { name: 'Otwórz generator' })
        .click();
      const okno = page.getByTestId('mvd-generator-raportu');
      await expect(okno).toBeVisible({ timeout: 30000 });
      await page.getByTestId('mvd-generator-profil').selectOption('audytowy');
      await page.getByTestId('mvd-generator-poziom').selectOption('pelny');
      await page.getByTestId('mvd-generator-sekcja-summary').check();
      await page.getByTestId('mvd-generator-sekcja-results').check();

      await okno.screenshot({ path: path.join(OUTPUT_DIR, `parytet-raport-${id}.png`) });
    });
  }
});
