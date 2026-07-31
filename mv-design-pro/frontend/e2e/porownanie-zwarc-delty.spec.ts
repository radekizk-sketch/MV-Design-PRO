/**
 * KD-3 poz. 11 — delty porównania zwarciowego pochodzą z BACKENDU.
 *
 * INTENCJA (dług V12K-290). Tryb zwarciowy ekranu porównań liczył różnice sam:
 * odejmował dwie wartości z dwóch przebiegów i dzielił je przez siebie, żeby
 * pokazać procent — arytmetyka na wynikach solvera w warstwie prezentacji.
 * Ta sama klasa, którą dla porównań ROZPŁYWU zamknęła luka L-13 (karta KD-2).
 *
 * BRAMKA. Na ŻYWEJ aplikacji (real backend, kliki NATYWNE): dwa realne biegi
 * zwarciowe na modelach RÓŻNIĄCYCH SIĘ długością odcinka (żeby delty nie były
 * zerowe), porównanie z ekranu, a następnie porównanie tego, CO WIDAĆ, z tym,
 * CO ZWRÓCIŁA końcówka `POST /api/short-circuit-comparisons`. Gdyby ekran wrócił
 * do własnego rachunku, wartość na ekranie mogłaby się różnić od pola backendu.
 *
 * Wzorzec seedu i biegów: e2e/deep-link-wyniki.spec.ts.
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const CABLE_ID = 'cable-tfk-yakxs-3x120';
const TRAFO_ID = 'tr-sn-nn-15-04-630kva-dyn11';
const SOURCE_ID = 'src-gpz-15kv-250mva-rx010';
const CATALOG_VERSION = '2024.1';
const OUTPUT_DIR = path.resolve(process.cwd(), '../docs/audit/visual/flow-ekspert');

let opCounter = 0;
let entityCounter = 0;

function nextEntitySuffix(): string {
  entityCounter += 1;
  return String(entityCounter).padStart(4, '0');
}

type Snapshot = {
  corridors?: Array<{ ordered_segment_refs?: string[] }>;
  branches?: Array<{ ref_id: string }>;
  transformers?: Array<{ ref_id: string }>;
};
type DomainOpResponse = { error?: string | null; snapshot?: Snapshot };

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
        idempotency_key: `e2e-porz-${name}-${String(++opCounter).padStart(4, '0')}`,
        payload,
      },
    },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as DomainOpResponse;
  expect(body.error ?? null).toBeNull();
  return body;
}

async function utworzProjektIPrzypadek(request: APIRequestContext) {
  const suffix = nextEntitySuffix();
  const projectName = `E2E porownanie zwarc ${suffix}`;
  const caseName = `Przypadek porownania ${suffix}`;

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Delty porownania zwarciowego liczone w backendzie (KD-3)',
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

async function otworzAplikacje(page: Page, request: APIRequestContext) {
  const seed = await utworzProjektIPrzypadek(request);
  await page.addInitScript((dane) => {
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
  }, seed);

  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 30000 });
  return seed;
}

/** Sieć gotowa do obliczeń (wzorzec deep-link-wyniki). Zwraca ref odcinka. */
async function zbudujSiec(request: APIRequestContext, caseId: string): Promise<string> {
  await executeDomainOp(request, caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: buildCatalogBinding('ZRODLO_SN', SOURCE_ID),
  });

  let op: DomainOpResponse = {};
  for (const [idx, length] of [300, 250].entries()) {
    op = await executeDomainOp(request, caseId, 'continue_trunk_segment_sn', {
      segment: {
        rodzaj: 'KABEL',
        dlugosc_m: length,
        name: `Odcinek ${idx + 1}`,
        catalog_binding: buildCatalogBinding('KABEL_SN', CABLE_ID),
      },
    });
  }

  const segmentRefs = op.snapshot?.corridors?.[0]?.ordered_segment_refs ?? [];
  expect(segmentRefs.length).toBeGreaterThan(0);

  op = await executeDomainOp(request, caseId, 'insert_station_on_segment_sn', {
    field_apparatus_catalog_ref: 'sw-cb-abb-vd4-17kv-630a',
    segment_id: segmentRefs[segmentRefs.length - 1],
    station_type: 'B',
    insert_at: { value: 0.5 },
    station: { sn_voltage_kv: 15.0, nn_voltage_kv: 0.4 },
    sn_fields: ['IN', 'OUT', 'FEEDER'],
    transformer: { create: true, catalog_binding: buildCatalogBinding('TRAFO_SN_NN', TRAFO_ID) },
  });

  for (const branch of op.snapshot?.branches ?? []) {
    await executeDomainOp(request, caseId, 'assign_catalog_to_element', {
      element_ref: branch.ref_id,
      catalog_binding: buildCatalogBinding('KABEL_SN', CABLE_ID),
    });
  }
  for (const transformer of op.snapshot?.transformers ?? []) {
    await executeDomainOp(request, caseId, 'assign_catalog_to_element', {
      element_ref: transformer.ref_id,
      catalog_binding: buildCatalogBinding('TRAFO_SN_NN', TRAFO_ID),
    });
    await executeDomainOp(request, caseId, 'update_element_parameters', {
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

  let readiness: { ready: boolean; issues?: Array<{ code: string; element_ref?: string | null }> } | null =
    null;
  let pierwszyOdcinek = '';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const readinessResponse = await request.get(
      `${BACKEND_BASE}/api/cases/${caseId}/engineering-readiness`,
    );
    expect(readinessResponse.ok()).toBeTruthy();
    readiness = (await readinessResponse.json()) as typeof readiness;
    if (readiness?.ready) break;
    for (const issue of (readiness?.issues ?? []).filter(
      (i) => i.code.includes('catalog') && i.element_ref,
    )) {
      const isTrafo = issue.code.includes('transformer');
      await executeDomainOp(request, caseId, 'assign_catalog_to_element', {
        element_ref: issue.element_ref,
        catalog_binding: buildCatalogBinding(
          isTrafo ? 'TRAFO_SN_NN' : 'KABEL_SN',
          isTrafo ? TRAFO_ID : CABLE_ID,
        ),
      });
    }
    for (const issue of (readiness?.issues ?? []).filter((i) => i.code === 'E005' && i.element_ref)) {
      await executeDomainOp(request, caseId, 'update_element_parameters', {
        element_ref: issue.element_ref,
        parameters: {
          r_ohm_per_km: 0.253,
          x_ohm_per_km: 0.073,
          b_siemens_per_km: 0.26e-6,
          parameter_source: 'CATALOG',
        },
      });
    }
  }
  expect(readiness?.ready).toBe(true);

  const enm = await request.get(`${BACKEND_BASE}/api/cases/${caseId}/enm`);
  const snapshot = (await enm.json()) as Snapshot;
  pierwszyOdcinek = (snapshot.branches ?? []).find((b) => b.ref_id.includes('seg'))?.ref_id ?? '';
  expect(pierwszyOdcinek).toBeTruthy();
  return pierwszyOdcinek;
}

/** Bieg SC_3F przez API execution; zwraca id przebiegu z gotowym indeksem. */
async function uruchomBiegSc(request: APIRequestContext, caseId: string): Promise<string> {
  const createRunResponse = await request.post(
    `${BACKEND_BASE}/api/execution/study-cases/${caseId}/runs`,
    { data: { analysis_type: 'SC_3F' } },
  );
  expect(createRunResponse.ok(), await createRunResponse.text()).toBeTruthy();
  const run = (await createRunResponse.json()) as { id: string };

  const executeResponse = await request.post(
    `${BACKEND_BASE}/api/execution/runs/${run.id}/execute`,
    { timeout: 90000 },
  );
  expect(executeResponse.ok(), await executeResponse.text()).toBeTruthy();

  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const response = await request.get(`${BACKEND_BASE}/api/analysis-runs/${run.id}/results/index`);
    if (response.ok()) return run.id;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`results/index nie jest gotowy dla przebiegu ${run.id}`);
}

test('KD-3 poz. 11: delta na ekranie porównania zwarć = pole z końcówki backendu', async ({
  page,
  request,
}) => {
  test.setTimeout(300000);

  const { caseId } = await otworzAplikacje(page, request);
  const odcinek = await zbudujSiec(request, caseId);

  // Przebieg A na modelu wyjściowym.
  const runA = await uruchomBiegSc(request, caseId);

  // ZMIANA MODELU między biegami: dłuższy odcinek ⇒ większa impedancja ⇒ inny
  // prąd zwarciowy. Bez tego delty byłyby zerowe i test nie odróżniłby pola
  // backendu od rachunku UI.
  await executeDomainOp(request, caseId, 'update_element_parameters', {
    element_ref: odcinek,
    parameters: { length_km: 1.5, parameter_source: 'CATALOG' },
  });
  const runB = await uruchomBiegSc(request, caseId);
  expect(runA).not.toBe(runB);

  // Ekran porównań: przestrzeń wyników → zakładka „Porównanie A/B" → tryb zwarć.
  await page.reload({ waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 30000 });
  await page.getByRole('button', { name: /^Wyniki i dowody \d$/ }).click();
  await page.getByTestId('mvd-wyniki-zakladka-porownanie').click();
  await expect(page.getByTestId('mvd-por-host')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('mvd-por-tryb-zwarcia').click();
  await expect(page.getByTestId('mvd-porz-ekran')).toBeVisible({ timeout: 20000 });

  // Wybór pary A/B i JAWNE uruchomienie porównania (zero automatyzmu).
  await page.getByTestId('mvd-porz-select-a').selectOption(runA);
  await page.getByTestId('mvd-porz-select-b').selectOption(runB);

  const odpowiedzPorownania = page.waitForResponse(
    (response) =>
      response.url().includes('/api/short-circuit-comparisons')
      && response.request().method() === 'POST',
    { timeout: 60000 },
  );
  await page.getByTestId('mvd-porz-przycisk').click();
  const surowa = await odpowiedzPorownania;
  expect(surowa.ok()).toBeTruthy();

  const porownanie = (await surowa.json()) as {
    report_version: string;
    punkty: Array<{
      target_name: string;
      obecny_w: string;
      delta_ikss_ka?: number;
      delta_ikss_percent?: number;
    }>;
  };
  // Kontrakt: wersja raportu podbita MINOR za pola procentowe (KD-3).
  expect(porownanie.report_version).toBe('1.1.0');
  expect(porownanie.punkty.length).toBeGreaterThan(0);

  await expect(page.getByTestId('mvd-porz-wynik')).toBeVisible({ timeout: 20000 });

  // Punkt ze ZMIENIONĄ deltą — dowód, że zmiana modelu przełożyła się na wynik.
  const zeZmiana = porownanie.punkty.find(
    (p) => typeof p.delta_ikss_ka === 'number' && Math.abs(p.delta_ikss_ka) > 1e-9,
  );
  expect(zeZmiana, 'zmiana długości odcinka musi dać niezerową deltę').toBeTruthy();

  // TO, CO WIDAĆ, = TO, CO ZWRÓCIŁ BACKEND (format PL: przecinek dziesiętny).
  const oczekiwanaDelta = `${zeZmiana!.delta_ikss_ka! >= 0 ? '+' : '-'}${Math.abs(
    zeZmiana!.delta_ikss_ka!,
  )
    .toFixed(3)
    .replace('.', ',')}`;
  const tabela = page.getByTestId('mvd-porz-wynik');
  await expect(tabela).toContainText(zeZmiana!.target_name);
  await expect(tabela).toContainText(oczekiwanaDelta);

  // ------------------------------------------- zrzuty do oceny (bramka 6)
  // Ten sam ekran w OBU motywach — seed jest kosztowny, wiec robimy go raz, a
  // motyw przelaczamy i powtarzamy samo porownanie (klik, nie stan wymuszony).
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'kd3-porownanie-zwarc-dark.png') });

  await page.evaluate(() => {
    localStorage.setItem(
      'mvd-theme-mode',
      JSON.stringify({ state: { mode: 'light_technical' }, version: 0 }),
    );
  });
  await page.reload({ waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 30000 });
  await page.getByRole('button', { name: /^Wyniki i dowody \d$/ }).click();
  await page.getByTestId('mvd-wyniki-zakladka-porownanie').click();
  await page.getByTestId('mvd-por-tryb-zwarcia').click();
  await page.getByTestId('mvd-porz-select-a').selectOption(runA);
  await page.getByTestId('mvd-porz-select-b').selectOption(runB);
  await page.getByTestId('mvd-porz-przycisk').click();
  await expect(page.getByTestId('mvd-porz-wynik')).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'kd3-porownanie-zwarc-light.png') });

  for (const plik of ['kd3-porownanie-zwarc-dark.png', 'kd3-porownanie-zwarc-light.png']) {
    expect(fs.existsSync(path.join(OUTPUT_DIR, plik)), `zrzut ${plik}`).toBe(true);
  }
});
