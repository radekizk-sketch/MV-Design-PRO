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
    substations?: Array<{
      ref_id: string;
      station_type?: string | null;
      meta?: {
        field_specs?: Array<{
          field_ref?: string;
          bay_role?: string;
          field_role?: string;
          bus_ref?: string;
        }>;
      };
    }>;
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

function findBranchCapableFieldPort(
  enm: NonNullable<DomainOpResponse['snapshot']>,
): string | null {
  const branchRoles = new Set(['OUT', 'FEEDER', 'LINE_OUT']);
  for (const substation of enm.substations ?? []) {
    for (const spec of substation.meta?.field_specs ?? []) {
      const bayRole = String(spec.bay_role ?? '').toUpperCase();
      if (spec.field_ref && branchRoles.has(bayRole)) {
        return `${spec.field_ref}.BRANCH`;
      }
    }
  }
  return null;
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
  await expect(page.getByTestId('canonical-layout')).toBeVisible();
}

async function waitForAnalysisRunIndex(
  request: APIRequestContext,
  runId: string,
  // Pomiar 2026-07-29 (karta K1/D): budowa results/index dla sieci 50 stacji
  // trwa po stronie backendu 39,9–45,4 s (log uvicorn) — 120 s daje ~2,5×
  // zapasu na wolniejszy przebieg CI.
  timeoutMs = 120000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = 0;
  let lastBody = '';
  while (Date.now() < deadline) {
    // Jawny timeout żądania: fixture `request` dziedziczy actionTimeout 10 s
    // z playwright.config.ts, a pierwszy GET blokuje się na synchronicznej
    // budowie indeksu (zmierzone 2026-07-30: 49 s na BEZCZYNNEJ maszynie
    // 4-rdzeniowej; pod własnym obciążeniem specu >90 s) — bez zapasu klient
    // ucina żądanie w połowie pracy, a osierocona budowa głodzi kolejne specy.
    // DŁUG PRODUKTOWY (nazwany, rejestr): indeks liczony przy KAŻDYM GET
    // zamiast utrwalany przy zakończeniu biegu.
    const response = await request.get(
      `${BACKEND_BASE}/api/analysis-runs/${runId}/results/index`,
      { timeout: 240000 },
    );
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
  // Pomiar 2026-07-29 (karta K1/D): 50× apply (do 10,8 s/szt. pod obciążeniem)
  // + wykonanie SC_3F (~30 s) + budowa results/index (~45 s) + eksporty
  // (report/json 223–236 s, proof/json 58 s, proof/latex 44 s) + rozpływ + UI
  // ≈ 10–11 min realnego czasu — 900 s daje zapas na wolniejszy przebieg CI.
  // Koszt eksportów to własność backendu (kandydat na kartę wydajnościową),
  // nie do zamaskowania krótszym limitem testu.
  // Budzet calego przeplywu: zmierzone 2026-07-30 na 4-rdzeniowej maszynie —
  // sam eksport raportu JSON dla 50 stacji to 298 s na BEZCZYNNYM backendzie.
  test.setTimeout(1800000);

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
        // Pomiar 2026-07-29 (karta K1/D): apply na rosnącej sieci sięga 10,8 s
        // (log uvicorn) — dziedziczony actionTimeout 10 s ucinał żądanie.
        timeout: 30000,
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

  const branchFromRef = findBranchCapableFieldPort(enm);
  expect(branchFromRef).toBeTruthy();
  await executeDomainOp(request, seed.caseId, 'start_branch_segment_sn', {
    from_ref: branchFromRef!,
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

  // Pomiar 2026-07-29 (karta K1/D): synchroniczny POST /execute dla sieci
  // 50 stacji + OZE trwa realnie ~32 s na tym kontenerze — domyślny limit
  // żądania API (30 s) ucinał odpowiedź tuż przed końcem obliczeń.
  // 240 s = ~5× czasu zmierzonego na bezczynnej maszynie (49 s) — zapas na
  // wspolbiezne obciazenie wlasne specu i wolniejszy przebieg CI.
  const executeRunResponse = await request.post(
    `${BACKEND_BASE}/api/execution/runs/${scRun.id}/execute`,
    { timeout: 240000 },
  );
  expect(executeRunResponse.ok(), await executeRunResponse.text()).toBeTruthy();
  await waitForAnalysisRunIndex(request, scRun.id);

  // Pomiary 2026-07-29 (karta K1/D, log uvicorn + curl, sieć 50 stacji):
  // report/json 172–236 s i **729,8 MB** treści, proof/json 58 s / 13,2 MB,
  // proof/latex 44 s / 5,1 MB, trace 3–4 s — eksporty liczone synchronicznie
  // bez cache (druga próba trwa tyle samo). 360 s = ~1,5× najdłuższego pomiaru.
  // Treść czytamy jako Buffer: report/json przekracza limit stringa Node
  // (0x1fffffe8 ≈ 512 MiB), więc `response.text()` wywala się zanim dojdzie do
  // asercji. Rozmiar raportu to własność backendu (kandydat na kartę
  // wydajnościową eksportu), nie do zamaskowania pominięciem endpointu.
  // Treść dowodów bierzemy z TEGO SAMEGO pobrania (bez drugiego GET po
  // ~1 min/eksport — asercje bez zmian).
  const exportBodies = new Map<string, Buffer>();
  for (const endpoint of [
    `/api/analysis-runs/${scRun.id}/results/index`,
    `/api/analysis-runs/${scRun.id}/trace`,
    `/api/analysis-runs/${scRun.id}/export/report/json`,
    `/api/analysis-runs/${scRun.id}/export/proof/json`,
    `/api/analysis-runs/${scRun.id}/export/proof/latex`,
  ]) {
    const response = await request.get(`${BACKEND_BASE}${endpoint}`, { timeout: 600000 });
    const body = await response.body();
    expect(
      response.ok(),
      `${endpoint}: ${response.ok() ? '' : body.subarray(0, 2048).toString('utf-8')}`,
    ).toBeTruthy();
    // Do dalszych asercji trzymamy wyłącznie dowody (MB), nie raport (setki MB).
    if (endpoint.includes('/export/proof/')) exportBodies.set(endpoint, body);
  }
  const proofJsonText =
    exportBodies.get(`/api/analysis-runs/${scRun.id}/export/proof/json`)?.toString('utf-8') ?? '';
  expect(proofJsonText).toContain('"I_dyn"');
  expect(proofJsonText).toContain('"I_th"');
  const proofLatexText =
    exportBodies.get(`/api/analysis-runs/${scRun.id}/export/proof/latex`)?.toString('utf-8') ?? '';
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
  await expect(page.getByRole('button', { name: /^(Wykonaj analizę|Oblicz)$/ })).toBeVisible();
  await expect(page.locator('body')).toContainText('Stacje SN/nN');
  await expect(page.locator('body')).toContainText(/Stacje:\s*50/);
  await expect(page.locator('body')).toContainText('Dowody (8)');
});
