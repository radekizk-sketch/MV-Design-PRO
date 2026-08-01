/**
 * Gotowość po wejściu na wynik biegu (bramka karty AUD-F, defekt D5).
 *
 * INTENCJA: chrom powłoki pokazuje gotowość BIEŻĄCEGO modelu — także wtedy, gdy
 * w oknie wyników leży migawka STAREGO przebiegu. Dotąd `restoreAnalysisRunSnapshot`
 * wpisywał do jedynej prawdy gotowości (`useSnapshotStore.readiness`) zaszyte
 * `{ready:true, blockers:[], warnings:[]}`, więc po wejściu na `#analysis?run=…`
 * chip deklarował „Model: zwalidowany" i „Gotowość: brak uwag" na modelu z
 * realnymi blokadami. Końcówka `GET /api/analysis-runs/{run}/snapshot` nie niesie
 * gotowości w ogóle — wartość powstawała wyłącznie w przeglądarce.
 *
 * SCENARIUSZ (realny backend, realna droga inżyniera):
 * 1. sieć gotowa do obliczeń → bieg SC_3F (DONE),
 * 2. model PSUJE SIĘ po biegu (łącznik normalnie otwarty odcina ciąg od źródła
 *    ⇒ blokada gotowości u serwera),
 * 3. zimne wejście na link przebiegu `#analysis?run=…&case=…` (świeży kontekst
 *    przeglądarki = przeładowanie strony) — chip MUSI mówić „Model: w budowie"
 *    i liczyć blokady zgodnie z serwerem.
 *
 * Zrzuty ŻYWEJ aplikacji (oba motywy) — dowód dla oceny właściciela (dyrektywa #8).
 *
 * Wzorzec seedu i budowy sieci: e2e/deep-link-wyniki.spec.ts,
 * e2e/gotowosc-jedna-prawda.spec.ts (real backend).
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const KATALOG_ZRZUTOW = path.resolve(_dirname, '../../docs/audit/visual/flow-ekspert');

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const FRONTEND_BASE = process.env.PLAYWRIGHT_FRONTEND_URL ?? 'http://127.0.0.1:5173';
const CABLE_ID = 'cable-tfk-yakxs-3x120';
const TRAFO_ID = 'tr-sn-nn-15-04-630kva-dyn11';
const SOURCE_ID = 'src-gpz-15kv-250mva-rx010';
const CATALOG_VERSION = '2024.1';
let opCounter = 0;
let entityCounter = 0;

type DomainOpResponse = {
  error?: string | null;
  snapshot?: {
    corridors?: Array<{ ordered_segment_refs?: string[] }>;
    branches?: Array<{ ref_id: string; type?: string }>;
    transformers?: Array<{ ref_id: string }>;
  };
};

type ReadinessResponse = {
  ready: boolean;
  by_severity?: Record<string, number>;
  issues?: Array<{ code: string; element_ref?: string | null; severity?: string }>;
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
        idempotency_key: `e2e-gotowosc-po-biegu-${name}-${String(++opCounter).padStart(4, '0')}`,
        payload,
      },
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const body = (await response.json()) as DomainOpResponse;
  expect(body.error ?? null).toBeNull();
  return body;
}

async function pobierzGotowosc(
  request: APIRequestContext,
  caseId: string,
): Promise<ReadinessResponse> {
  const response = await request.get(`${BACKEND_BASE}/api/cases/${caseId}/engineering-readiness`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as ReadinessResponse;
}

function blokadySerwera(gotowosc: ReadinessResponse): number {
  return gotowosc.by_severity?.BLOCKER ?? 0;
}

async function createProjectAndCase(
  request: APIRequestContext,
): Promise<{ projectId: string; caseId: string }> {
  entityCounter += 1;
  const suffix = String(entityCounter).padStart(4, '0');

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: `E2E gotowosc po biegu ${suffix}`,
      description: 'Bramka AUD-F: migawka przebiegu nie fabrykuje gotowości',
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
      name: `Przypadek po biegu ${suffix}`,
      description: '',
      config: {},
      set_active: true,
    },
  });
  expect(caseResponse.ok()).toBeTruthy();
  const studyCase = (await caseResponse.json()) as { id: string };

  return { projectId: project.id, caseId: studyCase.id };
}

/** Buduje przez API sieć gotową do obliczeń (wzorzec deep-link-wyniki). */
async function zbudujSiecGotowaDoObliczen(
  request: APIRequestContext,
  caseId: string,
): Promise<string[]> {
  let op = await executeDomainOp(request, caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: buildCatalogBinding('ZRODLO_SN', SOURCE_ID),
  });

  for (const [idx, length] of [300, 250, 200].entries()) {
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
    transformer: {
      create: true,
      catalog_binding: buildCatalogBinding('TRAFO_SN_NN', TRAFO_ID),
    },
  });

  const odcinkiLiniowe = (op.snapshot?.branches ?? []).filter(
    (branch) => branch.type === 'cable' || branch.type === 'line_overhead',
  );
  for (const branch of odcinkiLiniowe) {
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

  // Domknięcie ewentualnych blokerów gotowości (wzorzec critical-run-flow).
  let readiness: ReadinessResponse | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    readiness = await pobierzGotowosc(request, caseId);
    if (readiness.ready) break;
    for (const issue of (readiness.issues ?? []).filter(
      (i) => i.code.includes('catalog') && i.element_ref,
    )) {
      const isTrafo = issue.code.includes('transformer');
      await executeDomainOp(request, caseId, 'assign_catalog_to_element', {
        element_ref: issue.element_ref as string,
        catalog_binding: buildCatalogBinding(
          isTrafo ? 'TRAFO_SN_NN' : 'KABEL_SN',
          isTrafo ? TRAFO_ID : CABLE_ID,
        ),
      });
    }
    for (const issue of (readiness.issues ?? []).filter((i) => i.code === 'E005' && i.element_ref)) {
      await executeDomainOp(request, caseId, 'update_element_parameters', {
        element_ref: issue.element_ref as string,
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

  return segmentRefs;
}

/** Bieg SC_3F przez API execution — zwraca id przebiegu DONE. */
async function uruchomBiegScPrzezApi(request: APIRequestContext, caseId: string): Promise<string> {
  const createRunResponse = await request.post(
    `${BACKEND_BASE}/api/execution/study-cases/${caseId}/runs`,
    { data: { analysis_type: 'SC_3F' } },
  );
  expect(createRunResponse.ok(), await createRunResponse.text()).toBeTruthy();
  const run = (await createRunResponse.json()) as { id: string };

  const executeResponse = await request.post(`${BACKEND_BASE}/api/execution/runs/${run.id}/execute`, {
    timeout: 90000,
  });
  expect(executeResponse.ok(), await executeResponse.text()).toBeTruthy();

  const deadline = Date.now() + 15000;
  let lastStatus = 0;
  while (Date.now() < deadline) {
    const response = await request.get(`${BACKEND_BASE}/api/analysis-runs/${run.id}/results/index`);
    lastStatus = response.status();
    if (response.ok()) return run.id;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`results/index nie jest gotowy dla runu ${run.id} (status=${lastStatus})`);
}

async function zrzutObuMotywow(page: Page, nazwa: string): Promise<void> {
  fs.mkdirSync(KATALOG_ZRZUTOW, { recursive: true });
  await page.screenshot({ path: path.join(KATALOG_ZRZUTOW, `${nazwa}-dark.png`) });
  await page.getByTestId('mvd-theme-toggle').click();
  await page.screenshot({ path: path.join(KATALOG_ZRZUTOW, `${nazwa}-light.png`) });
  await page.getByTestId('mvd-theme-toggle').click();
}

test('wynik biegu przy modelu z blokadą: chip pokazuje gotowość BIEŻĄCEGO modelu (bramka AUD-F)', async ({
  browser,
  request,
}) => {
  test.setTimeout(300000);

  const { caseId } = await createProjectAndCase(request);
  const segmentRefs = await zbudujSiecGotowaDoObliczen(request, caseId);
  const runId = await uruchomBiegScPrzezApi(request, caseId);

  // Model PSUJE SIĘ PO biegu: łącznik normalnie otwarty odcina ciąg od źródła
  // (realna sytuacja projektowa) ⇒ serwer zgłasza blokadę gotowości.
  await executeDomainOp(request, caseId, 'set_normal_open_point', {
    switch_ref: segmentRefs[0],
  });
  const gotowosc = await pobierzGotowosc(request, caseId);
  expect(gotowosc.ready).toBe(false);
  expect(blokadySerwera(gotowosc)).toBeGreaterThan(0);

  // ZIMNE wejście na link przebiegu — świeży kontekst przeglądarki (zero
  // pamięci poprzedniej karty), czyli sytuacja „przeładowanie strony na wyniku".
  const kontekst = await browser.newContext();
  try {
    const strona = await kontekst.newPage();
    await strona.goto(`${FRONTEND_BASE}/#analysis?run=${runId}&case=${caseId}`, {
      waitUntil: 'commit',
    });
    await strona.waitForSelector('[data-testid="app-ready"]', {
      state: 'attached',
      timeout: 90000,
    });

    // Okno wyników żyje (migawka przebiegu wczytana) …
    await expect(strona.getByTestId('mvd-wyniki-warsztat')).toBeVisible({ timeout: 30000 });

    // … a gotowość opisuje BIEŻĄCY model: chip nie deklaruje zwalidowanego
    // modelu i liczy blokady tak samo jak serwer.
    await expect(strona.getByTestId('mvd-casebar-readiness')).toContainText(
      String(blokadySerwera(gotowosc)),
      { timeout: 30000 },
    );
    await expect(strona.getByTestId('mvd-casebar-model')).toContainText('Model: w budowie');
    await expect(strona.getByTestId('mvd-casebar-model')).not.toContainText('Model: zwalidowany');

    // Zrzut po pełnej hydratacji okna wyników (zakładka wg rodzaju przebiegu +
    // wczytana tabela zwarć) — dowód, że uczciwa gotowość współistnieje z ŻYWYM
    // wynikiem, a nie ze stanem przejściowym ładowania.
    await expect(strona.getByTestId('mvd-wyniki-zakladka-zwarcia')).toHaveAttribute(
      'aria-selected',
      'true',
      { timeout: 30000 },
    );
    await expect(strona.getByTestId('mvd-zwarcia-ekran')).toBeVisible({ timeout: 30000 });

    await zrzutObuMotywow(strona, 'audF-gotowosc');
  } finally {
    await kontekst.close();
  }
});
