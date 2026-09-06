import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const SOURCE_ID = 'src-gpz-15kv-250mva-rx010';
const CATALOG_VERSION = '2024.1';
const OVERHEAD_SEGMENT_NAME = 'Linia testowa napowietrzna';
const CABLE_SEGMENT_NAME = 'Kabel testowy SN';

let opCounter = 0;
let entityCounter = 0;

type DomainOpResponse = {
  error?: string | null;
  snapshot?: {
    corridors?: Array<{ ordered_segment_refs?: string[] }>;
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

async function fetchFirstCatalogTypeId(
  request: APIRequestContext,
  endpoint: string,
): Promise<string> {
  const response = await request.get(`${BACKEND_BASE}${endpoint}`);
  expect(response.ok()).toBeTruthy();

  const items = (await response.json()) as Array<{ id?: string }>;
  const firstItemId = items.find((item) => typeof item.id === 'string' && item.id.length > 0)?.id;
  expect(firstItemId).toBeTruthy();
  return firstItemId!;
}

async function executeDomainOp(
  request: APIRequestContext,
  caseId: string,
  name: string,
  payload: Record<string, unknown>,
): Promise<DomainOpResponse> {
  opCounter += 1;

  const response = await request.post(`${BACKEND_BASE}/api/cases/${caseId}/enm/domain-ops`, {
    data: {
        project_id: caseId,
        snapshot_base_hash: '',
        operation: {
          name,
          idempotency_key: `e2e-branch-points-${caseId}-${String(opCounter).padStart(4, '0')}`,
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
  const projectName = `E2E branch points ${suffix}`;
  const caseName = `Branch points case ${suffix}`;

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Branch points Playwright V12.5',
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

async function bootstrapActiveCase(page: Page, request: APIRequestContext): Promise<string> {
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
  await expect(page.getByTestId('project-tree')).toBeVisible();
  await refreshResponsePromise;
}

async function selectSegmentInInspector(page: Page, segmentName: string): Promise<void> {
  const projectTree = page.getByTestId('project-tree');
  const searchInput = page.getByTestId('project-tree-search-input');
  await searchInput.fill(segmentName);

  const node = projectTree.getByText(segmentName, { exact: true }).first();
  await expect(node).toBeVisible({ timeout: 15000 });
  await node.click();

  const inspector = page.getByTestId('inspector-engineering');
  await expect(inspector).toBeVisible();
  await expect(inspector).toContainText(segmentName);
}

test.describe('Branch points workflow', () => {
  test('opens branch pole form from canonical overhead-line surface', async ({ page, request }) => {
    const caseId = await bootstrapActiveCase(page, request);
    const lineTypeId = await fetchFirstCatalogTypeId(request, '/api/catalog/line-types');

    await executeDomainOp(request, caseId, 'add_grid_source_sn', {
      voltage_kv: 15.0,
      sk3_mva: 250.0,
      rx_ratio: 0.1,
      catalog_binding: buildCatalogBinding('ZRODLO_SN', SOURCE_ID),
      hv_voltage_kv: 110.0,
      transformer_sn_mva: 25.0,
    });

    const op = await executeDomainOp(request, caseId, 'continue_trunk_segment_sn', {
      segment: {
        rodzaj: 'LINIA_NAPOWIETRZNA',
        dlugosc_m: 420,
        name: OVERHEAD_SEGMENT_NAME,
        catalog_binding: buildCatalogBinding('LINIA_SN', lineTypeId),
      },
    });

    const segmentRef = op.snapshot?.corridors?.[0]?.ordered_segment_refs?.[0];
    expect(segmentRef).toBeTruthy();

    await reloadEditorPage(page);
    await selectSegmentInInspector(page, OVERHEAD_SEGMENT_NAME);

    const inspector = page.getByTestId('inspector-engineering');
    await expect(inspector.getByRole('button', { name: /rozga/i })).toBeVisible();
    await expect(inspector.getByRole('button', { name: /Wstaw ZKSN/i })).toHaveCount(0);

    await inspector.getByRole('button', { name: /rozga/i }).click();

    // Przepisane na bieżący flow (karta K1/C, 2026-07-29): akcja otwiera dziś
    // kreator ui2 `KreatorSlupaOdgaleznego` (operationFormRegistry:
    // insert_branch_pole_on_segment_sn → mvd-kreator-slup), nie dawny
    // `insert-branch-pole-form`. INTENCJA BEZ ZMIAN: (1) formularz jest
    // powiązany z TYM odcinkiem — kreator rozwiązuje segment_ref przez snapshot
    // i pokazuje jego NAZWĘ w kontroli gotowości (dawne asercje
    // data-segment-ref + textbox „Odcinek SN"); (2) konfiguracja jest
    // katalog-first (pole wyboru typu słupa z katalogu), nie ślepe wstawienie.
    const kreator = page.getByTestId('mvd-kreator-slup');
    await expect(kreator).toBeVisible();
    await expect(page.getByTestId('mvd-kreator-slup-gotowosc')).toContainText(OVERHEAD_SEGMENT_NAME);
    await expect(page.getByTestId('mvd-kreator-slup-katalog')).toBeVisible();
  });

  test('opens ZKSN form from canonical cable surface', async ({ page, request }) => {
    const caseId = await bootstrapActiveCase(page, request);
    const cableTypeId = await fetchFirstCatalogTypeId(request, '/api/catalog/cable-types');

    await executeDomainOp(request, caseId, 'add_grid_source_sn', {
      voltage_kv: 15.0,
      sk3_mva: 250.0,
      rx_ratio: 0.1,
      catalog_binding: buildCatalogBinding('ZRODLO_SN', SOURCE_ID),
      hv_voltage_kv: 110.0,
      transformer_sn_mva: 25.0,
    });

    const op = await executeDomainOp(request, caseId, 'continue_trunk_segment_sn', {
      segment: {
        rodzaj: 'KABEL',
        dlugosc_m: 180,
        name: CABLE_SEGMENT_NAME,
        catalog_binding: buildCatalogBinding('KABEL_SN', cableTypeId),
      },
    });

    const segmentRef = op.snapshot?.corridors?.[0]?.ordered_segment_refs?.[0];
    expect(segmentRef).toBeTruthy();

    await reloadEditorPage(page);
    await selectSegmentInInspector(page, CABLE_SEGMENT_NAME);

    const inspector = page.getByTestId('inspector-engineering');
    await expect(inspector.getByRole('button', { name: /Wstaw ZKSN/i })).toBeVisible();
    await expect(inspector.getByRole('button', { name: /rozga/i })).toHaveCount(0);

    await inspector.getByRole('button', { name: /Wstaw ZKSN/i }).click();

    // Przepisane na bieżący flow (karta K1/C, 2026-07-29): akcja otwiera dziś
    // kreator ui2 `KreatorZksn` (operationFormRegistry:
    // insert_zksn_on_segment_sn → mvd-kreator-zksn), nie dawny
    // `insert-zksn-form`. INTENCJA BEZ ZMIAN: powiązanie z TYM odcinkiem
    // (nazwa odcinka w kontroli gotowości — kreator rozwiązuje segment_ref
    // przez snapshot) + konfiguracja katalog-first (wybór typu ZKSN z katalogu).
    const kreator = page.getByTestId('mvd-kreator-zksn');
    await expect(kreator).toBeVisible();
    await expect(page.getByTestId('mvd-kreator-zksn-gotowosc')).toContainText(CABLE_SEGMENT_NAME);
    await expect(page.getByTestId('mvd-kreator-zksn-katalog')).toBeVisible();
  });
});
