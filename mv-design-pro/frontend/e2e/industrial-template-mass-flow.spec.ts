import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const CABLE_ID = 'cable-tfk-yakxs-3x120';
const OVERHEAD_LINE_ID = 'line-base-al-st-70';
const SOURCE_ID = 'src-gpz-15kv-250mva-rx010';
const CATALOG_VERSION = '2024.1';
let opCounter = 0;

type TemplateSummary = {
  id: string;
  name_pl: string;
  category: string;
};

type DomainOpResponse = {
  error?: string | null;
  snapshot?: {
    header?: { hash_sha256?: string };
    buses?: Array<{ ref_id: string; voltage_kv?: number }>;
    branches?: Array<{ ref_id: string }>;
    corridors?: Array<{ ordered_segment_refs?: string[] }>;
    generators?: Array<{ ref_id: string; gen_type?: string | null; station_ref?: string | null }>;
    substations?: Array<{ ref_id: string; station_type?: string | null }>;
    transformers?: Array<{ ref_id: string }>;
  };
};

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
  const suffix = Date.now().toString(36);
  const projectName = `E2E przemysłowy ${suffix}`;
  const caseName = `Przypadek 50 szablonów ${suffix}`;

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Pełna ścieżka E2E: 50 szablonów, analizy, dowody, raporty',
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
        idempotency_key: `industrial-e2e-${name}-${String(++opCounter).padStart(4, '0')}`,
        payload,
      },
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const body = (await response.json()) as DomainOpResponse;
  expect(body.error ?? null).toBeNull();
  return body;
}

async function appendSegment(
  request: APIRequestContext,
  caseId: string,
  index: number,
): Promise<string> {
  const isOverhead = index % 7 === 0;
  const result = await executeDomainOp(request, caseId, 'continue_trunk_segment_sn', {
    segment: {
      rodzaj: isOverhead ? 'LINIA_NAPOWIETRZNA' : 'KABEL',
      dlugosc_m: 90 + index,
      name: `Odcinek szablonu ${String(index).padStart(2, '0')}`,
      catalog_binding: buildCatalogBinding(
        isOverhead ? 'LINIA_SN' : 'KABEL_SN',
        isOverhead ? OVERHEAD_LINE_ID : CABLE_ID,
      ),
    },
  });
  const refs = result.snapshot?.corridors?.[0]?.ordered_segment_refs ?? [];
  expect(refs.length).toBeGreaterThan(0);
  return refs[refs.length - 1];
}

function selectTemplatesForIndustrialRun(templates: TemplateSummary[]): TemplateSummary[] {
  const requiredCategories = [
    'typowa_sn_nn',
    'slupowa',
    'zksn_wnetrzowa',
    'prosument_pv',
    'farma_pv',
    'bess',
    'hybrydowa',
    'przemyslowa',
    'wiatrowa',
    'sekcyjna',
  ];
  const selected = new Map<string, TemplateSummary>();
  for (const category of requiredCategories) {
    const found = templates.find((template) => template.category === category);
    if (found) {
      selected.set(found.id, found);
    }
  }
  for (const template of templates) {
    if (selected.size >= 50) {
      break;
    }
    selected.set(template.id, template);
  }
  return [...selected.values()];
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
  await expect(page.getByTestId('active-case-bar')).toContainText('Przypadek');
  await expect(page.getByTestId('canonical-layout')).toBeVisible();
}

async function waitForAnalysisRunIndex(
  request: APIRequestContext,
  runId: string,
  timeoutMs = 30000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = 0;
  let lastBody = '';
  while (Date.now() < deadline) {
    const response = await request.get(`${BACKEND_BASE}/api/analysis-runs/${runId}/results/index`);
    lastStatus = response.status();
    if (response.ok()) {
      return;
    }
    lastBody = await response.text();
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`results/index niedostępny dla runu ${runId}: ${lastStatus} ${lastBody}`);
}

test('pełny przepływ przemysłowy: 50 szablonów stacji, OZE, analizy, dowody i eksporty', async ({
  page,
  request,
}) => {
  test.setTimeout(180000);

  const seed = await createProjectAndCase(request);
  const templatesResponse = await request.get(`${BACKEND_BASE}/api/station-templates`);
  expect(templatesResponse.ok()).toBeTruthy();
  const templatesPayload = (await templatesResponse.json()) as {
    templates: TemplateSummary[];
    total: number;
  };
  expect(templatesPayload.total).toBeGreaterThanOrEqual(50);
  const selectedTemplates = selectTemplatesForIndustrialRun(templatesPayload.templates);
  expect(selectedTemplates.length).toBe(50);

  await executeDomainOp(request, seed.caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: buildCatalogBinding('ZRODLO_SN', SOURCE_ID),
  });

  const appliedTemplateIds: string[] = [];
  for (const [index, template] of selectedTemplates.entries()) {
    const segmentRef = await appendSegment(request, seed.caseId, index + 1);
    const applyResponse = await request.post(
      `${BACKEND_BASE}/api/station-templates/${template.id}/apply`,
      {
        data: {
          case_id: seed.caseId,
          target_segment_id: segmentRef,
          insert_at_ratio: 0.5,
          params_override: {},
          catalog_profile: null,
        },
      },
    );
    expect(applyResponse.ok(), `${template.id}: ${await applyResponse.text()}`).toBeTruthy();
    const applied = (await applyResponse.json()) as { station_ref?: string; template_id?: string };
    expect(applied.station_ref, template.id).toBeTruthy();
    appliedTemplateIds.push(applied.template_id ?? template.id);

    if ((index + 1) % 10 === 0) {
      const checkpoint = await request.get(`${BACKEND_BASE}/api/cases/${seed.caseId}/enm`);
      expect(checkpoint.ok()).toBeTruthy();
      const snapshot = (await checkpoint.json()) as NonNullable<DomainOpResponse['snapshot']>;
      expect(snapshot.substations?.length ?? 0).toBeGreaterThanOrEqual(index + 2);
      expect(snapshot.header?.hash_sha256).toBeTruthy();
    }
  }
  expect(new Set(appliedTemplateIds).size).toBe(50);

  const enmResponse = await request.get(`${BACKEND_BASE}/api/cases/${seed.caseId}/enm`);
  expect(enmResponse.ok()).toBeTruthy();
  const enm = (await enmResponse.json()) as NonNullable<DomainOpResponse['snapshot']>;
  expect(enm.substations?.length ?? 0).toBeGreaterThanOrEqual(51);
  expect(enm.transformers?.length ?? 0).toBeGreaterThan(0);
  expect(enm.branches?.length ?? 0).toBeGreaterThan(0);
  expect(enm.generators?.length ?? 0).toBeGreaterThan(0);
  expect(new Set((enm.generators ?? []).map((generator) => generator.gen_type)).size).toBeGreaterThan(0);
  const generatorRefs = (enm.generators ?? []).map((generator) => generator.ref_id);
  expect(new Set(generatorRefs).size).toBe(generatorRefs.length);

  const branchBus = (enm.buses ?? []).find(
    (bus) => bus.ref_id.includes('/sn_bus') && !bus.ref_id.includes('/section/001/bus_sn'),
  );
  expect(branchBus?.ref_id).toBeTruthy();
  await executeDomainOp(request, seed.caseId, 'start_branch_segment_sn', {
    from_ref: `${branchBus!.ref_id}.BRANCH`,
    segment: {
      rodzaj: 'KABEL',
      dlugosc_m: 180,
      name: 'Odgałęzienie kontrolne 50 szablonów',
      catalog_binding: buildCatalogBinding('KABEL_SN', CABLE_ID),
    },
  });

  const readinessResponse = await request.get(
    `${BACKEND_BASE}/api/cases/${seed.caseId}/engineering-readiness`,
  );
  expect(readinessResponse.ok()).toBeTruthy();
  const readiness = (await readinessResponse.json()) as {
    ready: boolean;
    issues?: Array<{ code: string; severity?: string }>;
  };
  expect(readiness.ready, JSON.stringify(readiness.issues ?? [])).toBe(true);

  const scRunResponse = await request.post(
    `${BACKEND_BASE}/api/execution/study-cases/${seed.caseId}/runs`,
    { data: { analysis_type: 'SC_3F' } },
  );
  expect(scRunResponse.ok(), await scRunResponse.text()).toBeTruthy();
  const scRun = (await scRunResponse.json()) as { id: string };

  const executeRunResponse = await request.post(
    `${BACKEND_BASE}/api/execution/runs/${scRun.id}/execute`,
  );
  expect(executeRunResponse.ok(), await executeRunResponse.text()).toBeTruthy();
  await waitForAnalysisRunIndex(request, scRun.id);

  for (const endpoint of [
    `/api/analysis-runs/${scRun.id}/results/index`,
    `/api/analysis-runs/${scRun.id}/trace`,
    `/api/analysis-runs/${scRun.id}/export/report/json`,
    `/api/analysis-runs/${scRun.id}/export/proof/json`,
    `/api/analysis-runs/${scRun.id}/export/proof/latex`,
  ]) {
    const response = await request.get(`${BACKEND_BASE}${endpoint}`);
    expect(response.ok(), `${endpoint}: ${await response.text()}`).toBeTruthy();
  }
  const proofJsonResponse = await request.get(
    `${BACKEND_BASE}/api/analysis-runs/${scRun.id}/export/proof/json`,
  );
  const proofJsonText = await proofJsonResponse.text();
  expect(proofJsonText).toContain('"I_dyn"');
  expect(proofJsonText).toContain('"I_th"');
  const proofLatexResponse = await request.get(
    `${BACKEND_BASE}/api/analysis-runs/${scRun.id}/export/proof/latex`,
  );
  const proofLatexText = await proofLatexResponse.text();
  expect(proofLatexText).toContain('I_dyn');
  expect(proofLatexText).toContain('I_th');

  const powerFlowResponse = await request.post(
    `${BACKEND_BASE}/api/cases/${seed.caseId}/runs/power-flow`,
    { data: {}, timeout: 60000 },
  );
  expect(powerFlowResponse.ok(), await powerFlowResponse.text()).toBeTruthy();
  const powerFlow = (await powerFlowResponse.json()) as {
    run_id?: string;
    result?: Record<string, unknown>;
    trace?: Record<string, unknown>;
  };
  expect(powerFlow.run_id).toBeTruthy();
  expect(powerFlow.result).toBeTruthy();
  expect(powerFlow.trace).toBeTruthy();

  const protectionViewResponse = await request.get(
    `${BACKEND_BASE}/api/cases/${seed.caseId}/enm/protection-view`,
    { timeout: 60000 },
  );
  expect(protectionViewResponse.ok(), await protectionViewResponse.text()).toBeTruthy();
  const protectionView = (await protectionViewResponse.json()) as {
    view_status?: { data_source?: string; has_protection_data?: boolean };
    summary?: { total_assignments?: number };
  };
  expect(protectionView.view_status?.data_source).toBe('ENM_PROTECTION_READ_MODEL');
  expect(protectionView.summary?.total_assignments).toBeGreaterThanOrEqual(0);

  await openCaseInUi(page, seed);
  await expect(page.getByRole('button', { name: /Wykonaj analizę|Oblicz/ })).toBeVisible();
  await expect(page.locator('body')).toContainText('Stacje SN/nN:');
  await expect(page.locator('body')).toContainText('51');
  await expect(page.locator('body')).toContainText('Dowody inżynierskie (8)');
});
