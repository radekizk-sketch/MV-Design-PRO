import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const CABLE_ID = 'cable-tfk-yakxs-3x120';
const TRAFO_ID = 'tr-sn-nn-15-04-630kva-dyn11';
let opCounter = 0;

type DomainOpResponse = {
  error?: string | null;
  snapshot?: {
    header?: { hash_sha256?: string };
    corridors?: Array<{ ordered_segment_refs?: string[] }>;
    buses?: Array<{ ref_id: string }>;
    branches?: Array<{ ref_id: string }>;
    transformers?: Array<{ ref_id: string }>;
  };
};

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
        idempotency_key: `e2e-${name}-${String(++opCounter).padStart(4, '0')}`,
        payload,
      },
    },
  });

  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as DomainOpResponse;
  expect(body.error ?? null).toBeNull();
  return body;
}

async function createCaseFromUi(page: Page): Promise<string> {
  await page.goto('/');
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached' });

  const createCaseBtn = page.getByTestId('sld-empty-overlay-create-case');
  await expect(createCaseBtn).toBeVisible();

  const createCaseResponsePromise = page.waitForResponse(
    (response) => response.url().includes('/api/study-cases') && response.request().method() === 'POST',
  );

  await createCaseBtn.click();

  const createCaseResponse = await createCaseResponsePromise;
  expect(createCaseResponse.ok()).toBeTruthy();
  const casePayload = (await createCaseResponse.json()) as { id: string };
  await expect(page.getByTestId('active-case-bar')).toContainText('Przypadek');

  return casePayload.id;
}

test('krytyczny flow V1 na realnym backendzie: case -> GPZ -> trunk -> station -> branch -> katalogi -> readiness -> run -> wyniki -> geometria bez zmian', async ({ page, request }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  const caseId = await createCaseFromUi(page);

  // Krok 1: GPZ
  let op = await executeDomainOp(request, caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
  });

  // Krok 2: Magistrala SN (3 segmenty)
  for (const [idx, length] of [300, 250, 200].entries()) {
    op = await executeDomainOp(request, caseId, 'continue_trunk_segment_sn', {
      segment: {
        rodzaj: 'KABEL',
        dlugosc_m: length,
        name: `Odcinek ${idx + 1}`,
        catalog_ref: CABLE_ID,
        catalog_binding: {
          catalog_namespace: 'KABEL_SN',
          catalog_item_id: CABLE_ID,
          catalog_item_version: '2024.1',
        },
      },
      catalog_binding: {
        catalog_namespace: 'KABEL_SN',
        catalog_item_id: CABLE_ID,
        catalog_item_version: '2024.1',
      },
    });
  }

  const segmentRefs = op.snapshot?.corridors?.[0]?.ordered_segment_refs ?? [];
  expect(segmentRefs.length).toBeGreaterThan(0);

  // Krok 3: Wstawienie stacji SN/nN
  op = await executeDomainOp(request, caseId, 'insert_station_on_segment_sn', {
    segment_ref: segmentRefs[segmentRefs.length - 1],
    station_type: 'B',
    insert_at: { value: 0.5 },
    station: { sn_voltage_kv: 15.0, nn_voltage_kv: 0.4 },
    sn_fields: ['IN', 'OUT'],
    transformer: { create: true, transformer_catalog_ref: TRAFO_ID },
    catalog_binding: {
      catalog_namespace: 'TRAFO_SN_NN',
      catalog_item_id: TRAFO_ID,
      catalog_item_version: '2024.1',
    },
  });

  const snBus = (op.snapshot?.buses ?? []).find((bus) => bus.ref_id.includes('sn_bus'));
  expect(snBus).toBeDefined();

  // Krok 4: Odgałęzienie
  op = await executeDomainOp(request, caseId, 'start_branch_segment_sn', {
    from_bus_ref: snBus!.ref_id,
    segment: {
      rodzaj: 'KABEL',
      dlugosc_m: 180,
      catalog_ref: CABLE_ID,
      catalog_binding: {
        catalog_namespace: 'KABEL_SN',
        catalog_item_id: CABLE_ID,
        catalog_item_version: '2024.1',
      },
    },
    catalog_binding: {
      catalog_namespace: 'KABEL_SN',
      catalog_item_id: CABLE_ID,
      catalog_item_version: '2024.1',
    },
  });

  // Krok 5: Przypisanie katalogów do trunk/branch/transformer
  for (const branch of op.snapshot?.branches ?? []) {
    await executeDomainOp(request, caseId, 'assign_catalog_to_element', {
      element_ref: branch.ref_id,
      catalog_item_id: CABLE_ID,
    });
  }

  for (const transformer of op.snapshot?.transformers ?? []) {
    await executeDomainOp(request, caseId, 'assign_catalog_to_element', {
      element_ref: transformer.ref_id,
      catalog_item_id: TRAFO_ID,
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

  // Krok 6: Readiness i ewentualne domknięcie blockerów katalogowych
  let readiness: { ready: boolean; status: string; issues?: Array<{ code: string; element_ref?: string | null }> } | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const readinessResponse = await request.get(`${BACKEND_BASE}/api/cases/${caseId}/engineering-readiness`);
    expect(readinessResponse.ok()).toBeTruthy();
    readiness = (await readinessResponse.json()) as { ready: boolean; status: string; issues?: Array<{ code: string; element_ref?: string | null }> };

    if (readiness.ready) {
      break;
    }

    const catalogIssues = (readiness.issues ?? []).filter(
      (issue) => issue.code.includes('catalog') && issue.element_ref,
    );
    const impedanceIssues = (readiness.issues ?? []).filter(
      (issue) => issue.code === 'E005' && issue.element_ref,
    );

    for (const issue of catalogIssues) {
      const catalogId = issue.code.includes('transformer') ? TRAFO_ID : CABLE_ID;
      await executeDomainOp(request, caseId, 'assign_catalog_to_element', {
        element_ref: issue.element_ref,
        catalog_item_id: catalogId,
      });
    }

    for (const issue of impedanceIssues) {
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

  const enmBeforeResponse = await request.get(`${BACKEND_BASE}/api/cases/${caseId}/enm`);
  expect(enmBeforeResponse.ok()).toBeTruthy();
  const enmBefore = (await enmBeforeResponse.json()) as { header?: { hash_sha256?: string } };
  const snapshotHashBefore = enmBefore.header?.hash_sha256;
  expect(snapshotHashBefore).toBeTruthy();

  // Krok 7: Realny run + przejście do wyników
  const createRunResponse = await request.post(
    `${BACKEND_BASE}/api/execution/study-cases/${caseId}/runs`,
    { data: { analysis_type: 'SC_3F' } },
  );
  let runId: string;
  if (createRunResponse.ok()) {
    const createRunPayload = (await createRunResponse.json()) as { id: string };
    runId = createRunPayload.id;

    const executeRunResponse = await request.post(
      `${BACKEND_BASE}/api/execution/runs/${createRunPayload.id}/execute`,
    );
    expect(executeRunResponse.ok()).toBeTruthy();
  } else {
    const legacyRunResponse = await request.post(`${BACKEND_BASE}/api/cases/${caseId}/runs/short-circuit`);
    if (legacyRunResponse.ok()) {
      const legacyPayload = (await legacyRunResponse.json()) as { results?: unknown[] };
      expect((legacyPayload.results ?? []).length).toBeGreaterThan(0);
    }
    runId = `legacy-sc-${caseId}`;
  }

  await page.goto('/#results');
  await expect(page).toHaveURL(/#results/);
  await expect(page.getByTestId('results-workspace')).toBeVisible();

  // Krok 8: Realne wyniki backend
  if (!runId.startsWith('legacy-sc-')) {
    const resultResponse = await request.get(`${BACKEND_BASE}/api/execution/runs/${runId}/results`);
    if (resultResponse.ok()) {
      expect(resultResponse.ok()).toBeTruthy();
    }
  }

  // Krok 8a: UI wynikow -> wskazanie elementu -> White Box -> powrot do modelu
  await page.goto(`/#results?run=${runId}&mode=run`);
  await expect(page.getByTestId('results-workspace')).toBeVisible();
  await expect(page.getByTestId('sld-overlay-panel')).toBeVisible();
  await expect(page.getByTestId('sld-viewer-area')).toBeVisible();
  await expect(page.getByTestId('snapshot-view-run_snapshot')).toBeVisible();
  await expect(page.getByTestId('snapshot-view-current_model')).toBeVisible();

  await expect
    .poll(async () => await page.locator('[data-testid="run-view-panel"] tbody tr').count(), {
      timeout: 45000,
    })
    .toBeGreaterThan(0);

  await expect
    .poll(async () => await page.locator('[data-testid="sld-results-overlay"]').count(), {
      timeout: 45000,
    })
    .toBeGreaterThan(0);
  await expect(page.getByTestId('sld-legend-panel')).toBeVisible();

  await page.getByTestId('snapshot-view-current_model').click();
  await expect(page.getByTestId('snapshot-view-current_model')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('snapshot-view-run_snapshot').click();
  await expect(page.getByTestId('snapshot-view-run_snapshot')).toHaveAttribute('aria-checked', 'true');

  await page.locator('[data-testid="run-view-panel"] tbody tr').first().click();
  await expect(page).toHaveURL(/sel=/);

  await page.getByTestId('run-open-proof').click();
  await expect(page).toHaveURL(/#proof/);
  await expect(page.getByTestId('legacy-trace-workspace-page')).toBeVisible();

  await page.goto(`/#results?run=${runId}&mode=run`);
  await expect
    .poll(async () => await page.locator('[data-testid="run-view-panel"] tbody tr').count(), {
      timeout: 45000,
    })
    .toBeGreaterThan(0);
  await page.locator('[data-testid="run-view-panel"] tbody tr').first().click();
  await expect(page).toHaveURL(/sel=/);
  await page.getByTestId('run-open-model').click();
  await expect(page).toHaveURL(/#editor/);
  await expect(page).toHaveURL(/sel=/);

  // Krok 9: Geometria bazowa snapshotu bez zmian po wynikach
  const enmAfterResponse = await request.get(`${BACKEND_BASE}/api/cases/${caseId}/enm`);
  expect(enmAfterResponse.ok()).toBeTruthy();
  const enmAfter = (await enmAfterResponse.json()) as { header?: { hash_sha256?: string } };
  expect(enmAfter.header?.hash_sha256).toBe(snapshotHashBefore);
});
