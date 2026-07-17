import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
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
    substations?: Array<{ ref_id: string; station_type?: string; transformer_refs?: string[] }>;
    generators?: Array<{ ref_id: string; station_ref?: string; catalog_ref?: string; p_mw?: number }>;
  };
};

function nextEntitySuffix(): string {
  entityCounter += 1;
  return String(entityCounter).padStart(4, '0');
}

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
        idempotency_key: `e2e-der-${name}-${String(++opCounter).padStart(4, '0')}`,
        payload,
      },
    },
  });

  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as DomainOpResponse;
  expect(body.error ?? null).toBeNull();
  return body;
}

async function createProjectAndCase(
  request: APIRequestContext,
): Promise<{ projectId: string; projectName: string; caseId: string; caseName: string }> {
  const suffix = nextEntitySuffix();
  const projectName = `E2E DER ${suffix}`;
  const caseName = `Przypadek DER ${suffix}`;

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Test krytycznego zapisu DER',
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

  return {
    projectId: project.id,
    projectName,
    caseId: studyCase.id,
    caseName,
  };
}

async function openCaseInUi(
  page: Page,
  seed: { projectId: string; projectName: string; caseId: string; caseName: string },
): Promise<void> {
  await page.addInitScript((initialState) => {
    localStorage.setItem(
      'mv-design-app-state',
      JSON.stringify({
        state: {
          activeProjectId: initialState.projectId,
          activeProjectName: initialState.projectName,
          activeCaseId: initialState.caseId,
          activeCaseName: initialState.caseName,
          activeCaseKind: 'ShortCircuitCase',
          activeCaseResultStatus: 'NONE',
          activeSnapshotId: null,
          activeMode: 'MODEL_EDIT',
          activeRunId: null,
          activeAnalysisType: 'SHORT_CIRCUIT',
          issuePanelOpen: false,
        },
        version: 1,
      }),
    );
  }, seed);

  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 30000 });
  await expect(page.getByTestId('active-case-bar')).toContainText(/Zakres|Bieżący zestaw/);
}

async function reloadEditorPage(page: Page): Promise<void> {
  const refreshResponsePromise = page
    .waitForResponse(
      (response) =>
        response.url().includes('/enm/domain-ops')
        && response.request().method() === 'POST'
        && (response.request().postData() ?? '').includes('"name":"refresh_snapshot"'),
      { timeout: 15000 },
    )
    .catch(() => null);

  await page.reload({ waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 30000 });
  await refreshResponsePromise;
  await expect(page.getByTestId('sld-canvas-v3')).toBeAttached();
}

test('krytyczny DER flow: paleta PV -> stacja -> drawer -> zapis -> generator w ENM', async ({ page, request }) => {
  const seed = await createProjectAndCase(request);
  await openCaseInUi(page, seed);

  await executeDomainOp(request, seed.caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: buildCatalogBinding('ZRODLO_SN', SOURCE_ID),
  });

  const trunk = await executeDomainOp(request, seed.caseId, 'continue_trunk_segment_sn', {
    segment: {
      rodzaj: 'KABEL',
      dlugosc_m: 220,
      name: 'DER-1',
      catalog_binding: buildCatalogBinding('KABEL_SN', CABLE_ID),
    },
  });
  const segmentRef = trunk.snapshot?.corridors?.[0]?.ordered_segment_refs?.[0];
  expect(segmentRef).toBeTruthy();

  const stationOp = await executeDomainOp(request, seed.caseId, 'insert_station_on_segment_sn', {
    segment_id: segmentRef,
    station_type: 'B',
    insert_at: { value: 0.5 },
    station: { sn_voltage_kv: 15.0, nn_voltage_kv: 0.4 },
    transformer: {
      create: true,
      catalog_binding: buildCatalogBinding('TRAFO_SN_NN', TRAFO_ID),
    },
  });
  const stationRef = stationOp.snapshot?.substations?.find(
    (station) => station.station_type !== 'gpz' && (station.transformer_refs?.length ?? 0) > 0,
  )?.ref_id;
  expect(stationRef).toBeTruthy();

  await reloadEditorPage(page);

  // Adaptacja v3 (F12-C): drop DER na stację przyjmuje klik w element o
  // elementKind 'station' — w v3 to WYŁĄCZNIE symbol zbiorczy L0
  // (`sld-v3-l0-<stationRef>`, plan sieci); na L1/L2 stacja jest rozwinięta
  // w pola bez pojedynczego elementu-stacji. Ścieżka użytkownika: oddal
  // widok do planu (zoom kółkiem), uzbrój paletę, kliknij blok stacji —
  // dawne data-element-kind/data-element-id były kontraktem kanwy v2.
  const canvas = page.getByTestId('sld-canvas-v3');
  await expect(canvas).toBeVisible();
  const stationL0 = page.locator(`[data-testid="sld-v3-l0-${stationRef!}"]`);
  for (let i = 0; i < 24 && (await stationL0.count()) === 0; i += 1) {
    await canvas.dispatchEvent('wheel', { deltaY: 240, clientX: 400, clientY: 300, bubbles: true });
    await page.waitForTimeout(120);
  }
  await expect(stationL0).toBeAttached({ timeout: 5000 });

  await page.getByTestId('der-palette-btn-PV').click();
  // REALNY klik Playwright (pełna sekwencja pointer/mouse), NIE syntetyczny
  // `dispatchEvent` — syntetyczny klik MASKOWAŁ defekt martwego lewego
  // klika (capture-on-pointerdown, naprawa w `SldCanvasV3.handlePointerDown`
  // 2026-07-17); test musi ćwiczyć ścieżkę użytkownika, żeby regresja
  // naprawy była wykrywalna.
  await stationL0.click({ force: true });

  await expect(page.getByTestId('sld-v2-detail-drawer')).toBeVisible();
  await expect(page.getByTestId('drawer-der-type-select')).toHaveValue('PV');
  await page.getByTestId('sld-v2-detail-drawer-tab-moc').click();
  await page.getByTestId('drawer-der-power-input').fill('0.5');

  const saveResponse = page.waitForResponse(
    (response) => response.url().includes(`/api/projects/${seed.projectId}/cases/${seed.caseId}/generators`)
      && response.request().method() === 'POST',
    { timeout: 15000 },
  );
  await page.getByTestId('sld-v2-detail-drawer-save').click();
  const response = await saveResponse;
  expect(response.status()).toBe(201);
  await expect(page.getByTestId('sld-v2-detail-drawer')).toHaveCount(0);

  const persistedResponse = await request.get(`${BACKEND_BASE}/api/cases/${seed.caseId}/enm`);
  expect(persistedResponse.ok()).toBeTruthy();
  const persisted = (await persistedResponse.json()) as DomainOpResponse['snapshot'];
  const generator = persisted?.generators?.find((entry) => entry.station_ref === stationRef);
  expect(generator?.catalog_ref).toBe('conv-pv-nn-0p5mw-0p4kv');
  expect(generator?.p_mw).toBe(0.5);
});
