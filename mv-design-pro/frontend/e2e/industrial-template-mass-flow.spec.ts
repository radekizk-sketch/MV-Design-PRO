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
  // DWA zmierzone konteksty (2026-07-30, po naprawie V12K-281): w IZOLACJI
  // pierwszy GET = 4,0 s (jednorazowa budowa kontekstu biegu + deserializacja
  // artefaktu; było 49 s). W PEŁNEJ suicie e2e (318 testów, współdzielone CPU,
  // baza urośnięta o sieci setek testów) ten sam GET przekroczył 60 s —
  // pozostały koszt (deserializacja pełnego artefaktu przy KAŻDYM odczycie
  // biegu, rosnący z bazą) = karta wydajności persystencji (rejestr, dług
  // nazwany). 240 s budżetu pętli pokrywa oba konteksty.
  timeoutMs = 240000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = 0;
  let lastBody = '';
  while (Date.now() < deadline) {
    // Jawny timeout żądania (fixture `request` dziedziczy actionTimeout 10 s
    // z playwright.config.ts). Timeout POJEDYNCZEGO żądania to w tej pętli
    // stan „jeszcze nie gotowe", nie porażka specu — łapiemy i ponawiamy do
    // zewnętrznego budżetu (bez tego jeden przeciążony GET wywala cały spec).
    let response;
    try {
      response = await request.get(
        `${BACKEND_BASE}/api/analysis-runs/${runId}/results/index`,
        { timeout: 120000 },
      );
    } catch {
      lastStatus = 0;
      lastBody = 'timeout żądania (backend pod obciążeniem)';
      continue;
    }
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
  // Pomiar 2026-07-30 PO naprawie V12K-281 (K13) na bezczynnej maszynie
  // 4-rdzeniowej: cały przepływ 3,2 min (było 9,8 min), w tym indeks 4,0 s
  // (było 49 s), raport JSON 0,9 MiB / 4,6 s (było 729,8 MB / 254 s),
  // proof/json 5,0 s (było 28 s), proof/latex 4,7 s (było 38 s).
  // 900 s ≈ 4,5× zmierzonego czasu — zapas na wolniejszy przebieg CI.
  test.setTimeout(900000);

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
    hv_voltage_kv: 110.0,
    transformer_sn_mva: 25.0,
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
  // 240 s = ~7× pomiaru — zapas na współbieżne obciążenie własne specu
  // i wolniejszy przebieg CI (obliczenie solvera, nie tor eksportu K13).
  const executeRunResponse = await request.post(
    `${BACKEND_BASE}/api/execution/runs/${scRun.id}/execute`,
    { timeout: 240000 },
  );
  expect(executeRunResponse.ok(), await executeRunResponse.text()).toBeTruthy();
  await waitForAnalysisRunIndex(request, scRun.id);

  // Pomiary 2026-07-30 PO naprawie V12K-281 (K13, sieć 50 stacji, bezczynna
  // maszyna): report/json 0,9 MiB / 4,6 s (przed naprawą 729,8 MB / 254 s —
  // każdy wiersz zbiorczy niósł pełny iloczyn źródło×gałąź rozpływu),
  // proof/json 12,6 MiB / 5,0 s, proof/latex 4,8 MiB / 4,7 s, trace 8,7 MiB /
  // 4,7 s. Limit 120 s ≈ 25× najdłuższego pomiaru. Treść czytamy jako Buffer
  // (odporność na duże eksporty niezależnie od limitu stringa Node); treść
  // dowodów bierzemy z TEGO SAMEGO pobrania.
  const exportBodies = new Map<string, Buffer>();
  for (const endpoint of [
    `/api/analysis-runs/${scRun.id}/results/index`,
    `/api/analysis-runs/${scRun.id}/trace`,
    `/api/analysis-runs/${scRun.id}/export/report/json`,
    `/api/analysis-runs/${scRun.id}/export/proof/json`,
    `/api/analysis-runs/${scRun.id}/export/proof/latex`,
  ]) {
    const startMs = Date.now();
    const response = await request.get(`${BACKEND_BASE}${endpoint}`, { timeout: 120000 });
    const body = await response.body();
    // Pomiar diagnostyczny (V12K-281, K13): rozmiar i czas KAŻDEGO eksportu w
    // logu biegu — kalibracja limitów specu ma się opierać na liczbach z logu,
    // nie na wrażeniu.
    console.log(
      `[pomiar] ${endpoint}: ${(body.byteLength / 1048576).toFixed(1)} MiB w ${Date.now() - startMs} ms`,
    );
    expect(
      response.ok(),
      `${endpoint}: ${response.ok() ? '' : body.subarray(0, 2048).toString('utf-8')}`,
    ).toBeTruthy();
    // V12K-281 (K13): bramka regresji rozmiaru raportu — wiersze zwarciowe
    // raportu NIE niosą rozpływu gałęziowego per wiersz (iloczyn źródło×gałąź
    // dawał tu 729,8 MB); powrót rozpływu do wierszy zbiorczych ma być
    // CZERWONY. Limit 100 MB = wielokrotność zmierzonego rozmiaru po naprawie
    // (rząd MB) i ~1/7 rozmiaru defektu.
    if (endpoint.includes('/export/report/json')) {
      expect(body.byteLength).toBeLessThan(100 * 1024 * 1024);
    }
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

  // V12K-284 (KD-2): bramka rozmiaru odpowiedzi ŚWIEŻEGO biegu zwarciowego.
  // Odpowiedź POST niosła pełny rozpływ gałęziowy każdego punktu (iloczyn
  // źródło×gałąź) — na tej sieci setki MB. Po odchudzeniu wiersz niesie FLAGĘ
  // dostępności, a treść rozpływu pobiera się dla WSKAZANEGO punktu.
  //
  // LIMIT SKALIBROWANY DO POMIARU (2026-07-31, ta sieć 50 stacji): odpowiedź po
  // odchudzeniu ma 22,9 MiB — resztę stanowi ślad WHITE BOX każdego punktu
  // zwarcia (pole `white_box_trace`), który MUSI zostać (jawność obliczeń).
  // Z rozpływem inline ta sama odpowiedź miała 339,3 MiB (pomiar regresją
  // wstrzykniętą na tej samej sieci), więc 60 MB odróżnia stan poprawny od
  // defektu z zapasem w obie strony: powrót rozpływu do odpowiedzi POST jest
  // CZERWONY (zweryfikowane — 355 787 873 B > limitu).
  //
  // KLASA, NIE INSTANCJA (2026-09-05): po odchudzeniu z samego
  // `branch_contributions` odpowiedź urosła do 105 289 825 B (E2E full czerwony
  // na 930f1ada), bo ślad WHITE BOX podziału prądu `branch_flow_trace` (TH-1) —
  // ten sam ładunek per gałąź, ~5× większy od wkładów — został w wierszu. Odtąd
  // z wiersza wycinana jest CAŁA klasa `KLUCZE_ROZPLYWU` (backend
  // `canonical_run_repository.py`), a ślad punktu oddaje ta sama końcówka
  // rozpływu co wkłady.
  const swiezyBiegStart = Date.now();
  const swiezyBiegResponse = await request.post(
    `${BACKEND_BASE}/api/cases/${seed.caseId}/runs/short-circuit`,
    { data: {}, timeout: 240000 },
  );
  const swiezyBiegBody = await swiezyBiegResponse.body();
  console.log(
    `[pomiar] POST /api/cases/{case}/runs/short-circuit: `
      + `${(swiezyBiegBody.byteLength / 1048576).toFixed(1)} MiB w ${Date.now() - swiezyBiegStart} ms`,
  );
  expect(
    swiezyBiegResponse.ok(),
    swiezyBiegBody.subarray(0, 2048).toString('utf-8'),
  ).toBeTruthy();
  expect(swiezyBiegBody.byteLength).toBeLessThan(60 * 1024 * 1024);
  const swiezyBieg = JSON.parse(swiezyBiegBody.toString('utf-8')) as {
    run_id: string;
    results: Array<{
      fault_node_id?: string;
      branch_contributions?: unknown;
      branch_contributions_available?: boolean;
    }>;
  };
  expect(swiezyBieg.results.length).toBeGreaterThan(0);
  for (const wiersz of swiezyBieg.results) {
    expect(wiersz.branch_contributions).toBeUndefined();
  }
  const punktZRozplywem = swiezyBieg.results.find((w) => w.branch_contributions_available === true);
  expect(punktZRozplywem?.fault_node_id).toBeTruthy();
  // Parytet treści: to, czego POST już nie niesie, jest osiągalne na żądanie.
  const rozplywResponse = await request.get(
    `${BACKEND_BASE}/api/analysis-runs/${swiezyBieg.run_id}/results/short-circuit/rozplyw`,
    { params: { target_id: String(punktZRozplywem?.fault_node_id) }, timeout: 120000 },
  );
  expect(rozplywResponse.ok(), await rozplywResponse.text()).toBeTruthy();
  const rozplyw = (await rozplywResponse.json()) as { branch_contributions?: unknown[] | null };
  expect(Array.isArray(rozplyw.branch_contributions)).toBe(true);
  expect((rozplyw.branch_contributions ?? []).length).toBeGreaterThan(0);

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
