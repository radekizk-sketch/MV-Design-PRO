import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const SOURCE_ID = 'src-gpz-15kv-250mva-rx010';
const CABLE_ID = 'cable-tfk-yakxs-3x120';
const LINE_ID = 'line-base-al-st-50';
const CATALOG_VERSION = '2024.1';

type DomainOpEnvelope = {
  error?: string | null;
  snapshot?: {
    buses?: Array<{ ref_id: string }>;
    corridors?: Array<{ ordered_segment_refs?: string[] }>;
  };
};

let entityCounter = 0;
let opCounter = 0;

function nextEntitySuffix(): string {
  entityCounter += 1;
  return String(entityCounter).padStart(4, '0');
}

function nextIdempotencyKey(name: string): string {
  opCounter += 1;
  return `catalog-enforcement-${name}-${String(opCounter).padStart(4, '0')}`;
}

function buildCatalogBinding(catalogNamespace: string, catalogItemId: string) {
  return {
    catalog_namespace: catalogNamespace,
    catalog_item_id: catalogItemId,
    catalog_item_version: CATALOG_VERSION,
  };
}

async function createProjectAndCase(
  request: APIRequestContext,
): Promise<{ projectId: string; projectName: string; caseId: string; caseName: string }> {
  const suffix = nextEntitySuffix();
  const projectName = `E2E Katalog ${suffix}`;
  const caseName = `Przypadek katalog ${suffix}`;

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Test katalog-first',
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

async function createCaseFromUi(page: Page, request: APIRequestContext): Promise<string> {
  const { projectId, projectName, caseId, caseName } = await createProjectAndCase(request);

  await page.addInitScript((seed) => {
    localStorage.setItem(
      'mv-design-app-state',
      JSON.stringify({
        state: {
          activeProjectId: seed.projectId,
          activeProjectName: seed.projectName,
          activeCaseId: seed.caseId,
          activeCaseName: seed.caseName,
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
  }, {
    projectId,
    projectName,
    caseId,
    caseName,
  });

  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 30000 });
  await expect(page.getByTestId('active-case-bar')).toContainText(/Zakres|Bieżący zestaw/);
  return caseId;
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
  await expect(page.getByTestId('active-case-bar')).toContainText(/Zakres|Bieżący zestaw/);
  await refreshResponsePromise;
}

async function executeDomainOp(
  request: APIRequestContext,
  caseId: string,
  name: string,
  payload: Record<string, unknown>,
) {
  return request.post(`${BACKEND_BASE}/api/cases/${caseId}/enm/domain-ops`, {
    data: {
      project_id: '',
      snapshot_base_hash: '',
      operation: {
        name,
        idempotency_key: nextIdempotencyKey(name),
        payload,
      },
    },
  });
}

async function executeDomainOpOk(
  request: APIRequestContext,
  caseId: string,
  name: string,
  payload: Record<string, unknown>,
): Promise<DomainOpEnvelope> {
  const response = await executeDomainOp(request, caseId, name, payload);
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as DomainOpEnvelope;
  expect(body.error ?? null).toBeNull();
  return body;
}

async function expectCatalogRequired(response: Awaited<ReturnType<typeof executeDomainOp>>): Promise<void> {
  expect(response.status()).toBe(422);
  const body = (await response.json()) as { detail?: { code?: string; message_pl?: string } };
  expect(body.detail?.code).toBe('catalog.ref_required');
  expect(body.detail?.message_pl ?? '').toMatch(/katalog/i);
}

async function addGridSource(request: APIRequestContext, caseId: string): Promise<void> {
  await executeDomainOpOk(request, caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: buildCatalogBinding('ZRODLO_SN', SOURCE_ID),
  });
}

async function addCableSegment(request: APIRequestContext, caseId: string, lengthM = 200): Promise<string> {
  const op = await executeDomainOpOk(request, caseId, 'continue_trunk_segment_sn', {
    segment: {
      rodzaj: 'KABEL',
      dlugosc_m: lengthM,
      name: `Kabel ${lengthM}`,
      catalog_binding: buildCatalogBinding('KABEL_SN', CABLE_ID),
    },
  });
  // `Array.prototype.at` pochodzi z ES2022, a projekt deklaruje `lib: ES2020`.
  // Indeksowanie daje DOKLADNIE ten sam wynik bez podnoszenia `lib` calemu
  // projektowi (co poszerzyloby zbior dozwolonych API takze w kodzie produkcyjnym).
  const segmentRefs = op.snapshot?.corridors?.[0]?.ordered_segment_refs;
  const segmentRef = segmentRefs?.[segmentRefs.length - 1];
  expect(segmentRef).toBeTruthy();
  return segmentRef!;
}

async function addOverheadSegment(request: APIRequestContext, caseId: string, lengthM = 800): Promise<string> {
  const op = await executeDomainOpOk(request, caseId, 'continue_trunk_segment_sn', {
    segment: {
      rodzaj: 'LINIA',
      dlugosc_m: lengthM,
      name: `Linia ${lengthM}`,
      catalog_binding: buildCatalogBinding('LINIA_SN', LINE_ID),
    },
  });
  // `Array.prototype.at` pochodzi z ES2022, a projekt deklaruje `lib: ES2020`.
  // Indeksowanie daje DOKLADNIE ten sam wynik bez podnoszenia `lib` calemu
  // projektowi (co poszerzyloby zbior dozwolonych API takze w kodzie produkcyjnym).
  const segmentRefs = op.snapshot?.corridors?.[0]?.ordered_segment_refs;
  const segmentRef = segmentRefs?.[segmentRefs.length - 1];
  expect(segmentRef).toBeTruthy();
  return segmentRef!;
}

async function getBusRefs(request: APIRequestContext, caseId: string): Promise<string[]> {
  const enmResponse = await request.get(`${BACKEND_BASE}/api/cases/${caseId}/enm`);
  expect(enmResponse.ok()).toBeTruthy();
  const enm = (await enmResponse.json()) as { buses?: Array<{ ref_id: string }> };
  return (enm.buses ?? []).map((bus) => bus.ref_id);
}

test.describe('Catalog-First Enforcement - realny backend', () => {
  test.skip(process.env.PLAYWRIGHT_REAL_BACKEND !== '1', 'Ten pakiet wymaga realnego backendu.');

  test('frontend nie wystawia bezposrednich przyciskow branch point i ZKSN bez kontekstu segmentu', async ({ page, request }) => {
    await createCaseFromUi(page, request);
    await page.getByTestId('left-panel-mode-readiness').click();
    const processPanel = page.getByTestId('process-panel');
    await expect(processPanel).toBeVisible();
    await expect(page.getByTestId('btn-insert-object-branch-pole')).toHaveCount(0);
    await expect(page.getByTestId('btn-insert-object-zksn')).toHaveCount(0);
    await expect(processPanel.getByText(/nigdy bez wskazania segmentu/i)).toBeVisible();
  });

  test('formularz lacznika sekcyjnego blokuje wstawienie bez katalogu', async ({ page, request }) => {
    // Przepisane na bieżący flow (karta K1/C, 2026-07-29): przycisk
    // `btn-insert-switch` otwiera dziś kreator ui2 `KreatorLacznikaSekcyjnego`
    // (operationFormRegistry: insert_section_switch_sn → mvd-kreator-lacznik),
    // nie dawny `insert-section-switch-form` z przyciskiem „Zastosuj".
    // INTENCJA BEZ ZMIAN: ślepe wstawienie łącznika jest niemożliwe — kreator
    // wymaga aparatu z katalogu (pole katalogowe + kontrola gotowości
    // „Do konfiguracji"), a zapis bez kompletnego kontekstu jest twardo
    // ZABLOKOWANY (przycisk zapisu wyłączony; wejście z panelu procesu nie
    // niesie odcinka). Bramkę katalogową samego backendu pokrywa w tym pliku
    // test „backend odrzuca insert_section_switch_sn bez katalogu".
    await createCaseFromUi(page, request);
    await page.getByTestId('left-panel-mode-readiness').click();
    await expect(page.getByTestId('process-panel')).toBeVisible();

    await page.getByTestId('btn-insert-switch').click();
    const kreator = page.getByTestId('mvd-kreator-lacznik');
    await expect(kreator).toBeVisible();

    // Konfiguracja jest katalog-first: pole wyboru aparatu z katalogu SN
    // widoczne, a kontrola gotowości uczciwie raportuje brak aparatu.
    await expect(page.getByTestId('mvd-kreator-lacznik-katalog')).toBeVisible();
    await expect(page.getByTestId('mvd-kreator-lacznik-gotowosc')).toContainText('Do konfiguracji');

    // Realna ścieżka projektanta: nazwa uzupełniona, katalog celowo pominięty —
    // zapis pozostaje zablokowany (disabled), więc ślepe wstawienie nie ma drogi.
    await page.getByTestId('mvd-kreator-lacznik-nazwa').fill('Lacznik testowy');
    await expect(page.getByTestId('mvd-kreator-lacznik-zapisz')).toBeDisabled();
    // Stopka kreatora nazywa powód blokady (brak wskazanego odcinka SN).
    await expect(page.getByTestId('mvd-kreator-walidacja')).toBeVisible();
  });

  test('przycisk domkniecia pierscienia jest nieaktywny bez kandydatow ringu', async ({ page, request }) => {
    const caseId = await createCaseFromUi(page, request);
    await addGridSource(request, caseId);
    await addCableSegment(request, caseId, 240);
    await reloadEditorPage(page);
    await page.getByTestId('left-panel-mode-readiness').click();

    await expect(page.getByTestId('btn-connect-ring')).toBeDisabled();
  });

  test('backend odrzuca insert_branch_pole_on_segment_sn bez katalogu', async ({ request }) => {
    const { caseId } = await createProjectAndCase(request);
    await addGridSource(request, caseId);
    const segmentRef = await addOverheadSegment(request, caseId);

    const response = await executeDomainOp(request, caseId, 'insert_branch_pole_on_segment_sn', {
      segment_id: segmentRef,
      name: 'Slup testowy',
      insert_at: { mode: 'RATIO', value: 0.5 },
    });

    await expectCatalogRequired(response);
  });

  test('backend odrzuca insert_zksn_on_segment_sn bez katalogu', async ({ request }) => {
    const { caseId } = await createProjectAndCase(request);
    await addGridSource(request, caseId);
    const segmentRef = await addCableSegment(request, caseId);

    const response = await executeDomainOp(request, caseId, 'insert_zksn_on_segment_sn', {
      segment_id: segmentRef,
      name: 'ZKSN testowy',
      branch_ports_count: 2,
      switch_state: 'closed',
      insert_at: { mode: 'RATIO', value: 0.5 },
    });

    await expectCatalogRequired(response);
  });

  test('backend odrzuca insert_section_switch_sn bez katalogu', async ({ request }) => {
    const { caseId } = await createProjectAndCase(request);
    await addGridSource(request, caseId);
    const segmentRef = await addCableSegment(request, caseId);

    const response = await executeDomainOp(request, caseId, 'insert_section_switch_sn', {
      segment_id: segmentRef,
      switch_name: 'Lacznik testowy',
      switch_type: 'ROZLACZNIK',
      normal_state: 'closed',
      insert_at: { mode: 'RATIO', value: 0.5 },
    });

    await expectCatalogRequired(response);
  });

  test('backend odrzuca connect_secondary_ring_sn bez katalogu', async ({ request }) => {
    const { caseId } = await createProjectAndCase(request);
    await addGridSource(request, caseId);
    await addCableSegment(request, caseId, 200);
    await addCableSegment(request, caseId, 230);

    const buses = await getBusRefs(request, caseId);
    expect(buses.length).toBeGreaterThanOrEqual(3);

    const response = await executeDomainOp(request, caseId, 'connect_secondary_ring_sn', {
      from_bus_ref: buses[1],
      to_bus_ref: buses[buses.length - 1],
      segment: {
        rodzaj: 'KABEL',
        dlugosc_m: 120,
      },
    });

    await expectCatalogRequired(response);
  });
});
