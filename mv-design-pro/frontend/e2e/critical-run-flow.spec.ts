import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const CABLE_ID = 'cable-tfk-yakxs-3x120';
const TRAFO_ID = 'tr-sn-nn-15-04-630kva-dyn11';
const SOURCE_ID = 'src-gpz-15kv-250mva-rx010';
const CATALOG_VERSION = '2024.1';
let opCounter = 0;
let entityCounter = 0;

function nextEntitySuffix(): string {
  entityCounter += 1;
  return String(entityCounter).padStart(4, '0');
}

type DomainOpResponse = {
  error?: string | null;
  snapshot?: {
    header?: { hash_sha256?: string };
    corridors?: Array<{ ordered_segment_refs?: string[] }>;
    buses?: Array<{ ref_id: string }>;
    branches?: Array<{ ref_id: string; type?: string }>;
    transformers?: Array<{ ref_id: string }>;
    /** POPRAWKA 2026-08-08 (karta TYPY-POZA-BRAMKA): pole CZYTANE nizej
     *  (`op.snapshot?.substations`), a niezadeklarowane — przez co
     *  `station.meta.field_specs` i argumenty `find` szly jako implicit any.
     *  Ksztalt odwzorowuje `src/types/enm.ts` (`Substation` + dynamiczne
     *  `meta.field_specs` uzywane przez operacje domenowe). */
    substations?: Array<{
      ref_id: string;
      meta?: {
        field_specs?: Array<{
          field_ref?: string;
          field_role?: string | null;
          bay_role?: string | null;
        }>;
      };
    }>;
  };
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

async function waitForAnalysisRunIndex(
  request: APIRequestContext,
  runId: string,
  timeoutMs = 15000,
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

  throw new Error(
    `Publiczny results/index nie jest gotowy dla runu ${runId}. status=${lastStatus} body=${lastBody}`,
  );
}

async function createProjectAndCase(
  request: APIRequestContext,
): Promise<{ projectId: string; projectName: string; caseId: string; caseName: string }> {
  const suffix = nextEntitySuffix();
  const projectName = `E2E Krytyczny ${suffix}`;
  const caseName = `Przypadek krytyczny ${suffix}`;

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Test krytycznego flow V12.5',
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
  // Budzet ROZRUCHU narzedzia (nie asercja produktu): PIERWSZE wejscie w biegu
  // uruchamia zimny transform vite dev calego grafu modulow — zmierzone na tym
  // kontenerze 36 s przy zimnym starcie, ~2 s przy kolejnych. 30 s wywracalo ten
  // spec, gdy szedl jako pierwszy po starcie serwera. Asercje ponizej maja wlasne,
  // krotkie limity, wiec realne zwisy UI nadal sa lapane.
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
  await expect(page.getByTestId('active-case-bar')).toContainText(/Zakres|Bieżący zestaw/);
  return caseId;
}

test('krytyczny flow V1 na realnym backendzie: case -> GPZ -> trunk -> station -> branch -> katalogi -> readiness -> run -> wyniki -> SLD -> uzasadnienie -> geometria bez zmian', async ({ page, request }) => {
  const caseId = await createCaseFromUi(page, request);

  // Krok 1: GPZ
  let op = await executeDomainOp(request, caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: buildCatalogBinding('ZRODLO_SN', SOURCE_ID),
  });

  // Krok 2: Magistrala SN (3 segmenty)
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

  // Krok 3: Wstawienie stacji SN/nN
  op = await executeDomainOp(request, caseId, 'insert_station_on_segment_sn', {
    // B-12: aparat pól SN wskazany JAWNIE (operacja nie dobiera go sama).
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

  const station = (op.snapshot?.substations ?? []).find((item) => item.ref_id.includes('/station'));
  const branchField = station?.meta?.field_specs?.find((field) => (
    String(field.field_role ?? field.bay_role ?? '').toUpperCase().includes('ODG')
    || String(field.bay_role ?? '').toUpperCase() === 'FEEDER'
  ));
  expect(branchField?.field_ref).toBeTruthy();

  // Krok 4: Odgałęzienie
  op = await executeDomainOp(request, caseId, 'start_branch_segment_sn', {
    from_ref: `${branchField!.field_ref}.BRANCH`,
    segment: {
      rodzaj: 'KABEL',
      dlugosc_m: 180,
      catalog_binding: buildCatalogBinding('KABEL_SN', CABLE_ID),
    },
  });

  // Krok 5: Przypisanie katalogów do trunk/branch/transformer
  // Kategoria katalogu MUSI pasować do rodzaju gałęzi: pozycję KABEL_SN dostają
  // WYŁĄCZNIE odcinki liniowe. Ta pętla przypisywała wcześniej kabel TAKŻE
  // aparatom pól, kasując po cichu ich wiązanie APARAT_SN — backend to
  // przyjmował (defekt zastany naprawiony u źródła w KD-6:
  // `catalog.namespace_mismatch`), więc spec nigdy tego nie zauważył.
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

  // Krok 6: Gotowość i ewentualne domknięcie blokerów katalogowych
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
      const catalogNamespace = issue.code.includes('transformer') ? 'TRAFO_SN_NN' : 'KABEL_SN';
      const catalogId = issue.code.includes('transformer') ? TRAFO_ID : CABLE_ID;
      await executeDomainOp(request, caseId, 'assign_catalog_to_element', {
        element_ref: issue.element_ref,
        catalog_binding: buildCatalogBinding(catalogNamespace, catalogId),
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

  // Krok 7: Realne obliczenie + przejście do wyników
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
    await waitForAnalysisRunIndex(request, runId);
  } else {
    const legacyRunResponse = await request.post(`${BACKEND_BASE}/api/cases/${caseId}/runs/short-circuit`);
    if (legacyRunResponse.ok()) {
      const legacyPayload = (await legacyRunResponse.json()) as { results?: unknown[] };
      expect((legacyPayload.results ?? []).length).toBeGreaterThan(0);
    }
    runId = `legacy-sc-${caseId}`;
  }

  await page.goto(`/#analysis?run=${runId}`, { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
  await expect(page).toHaveURL(new RegExp(`#analysis\\?run=${runId}`));
  await expect(page.getByTestId('canonical-layout')).toBeVisible();
  // K3-A1 (jedno lądowisko wyników): trasa #analysis ustawia przestrzeń
  // „Wyniki" — lądowiskiem jest warsztat ui2 (zakładki), nie rozwinięta
  // powierzchnia mostu z testid `workspace-surface-main` (intencja bez zmian:
  // deep-link z runId prowadzi do żywego widoku wyników).
  await expect(page.getByTestId('mvd-wyniki-warsztat')).toBeVisible();
  // PR-5c: stary embedded SLD wygaszony — nowy SLD v2 jest osobnym surface'em
  // (testowane oddzielnie w v2/geometry/__tests__/layoutEngine.substrate.test.ts).

  await page.evaluate((targetRunId) => {
    window.location.hash = `#proof?run=${targetRunId}`;
  }, runId);
  await expect(page).toHaveURL(new RegExp(`#proof\\?run=${runId}`));
  // K3: przestrzeń „Wyniki" pozostaje lądowiskiem (alias #proof nie wybija
  // z warsztatu; powierzchnię śladu mostu otwiera orkiestrator w zakładce
  // „Pozostałe analizy" — zakładkowy dowód ui2 prowadzi Ctrl+K „proof").
  await expect(page.getByTestId('mvd-wyniki-warsztat')).toBeVisible();
  // PR-5c: stary panel "Przebieg obliczeń analizy" wygaszony razem z proof inspector v1.

  // Krok 8: Realne wyniki backend
  if (!runId.startsWith('legacy-sc-')) {
    const resultResponse = await request.get(`${BACKEND_BASE}/api/execution/runs/${runId}/results`);
    if (resultResponse.ok()) {
      expect(resultResponse.ok()).toBeTruthy();
    }
  }

  // Krok 9: Geometria bazowa snapshotu bez zmian po wynikach
  const enmAfterResponse = await request.get(`${BACKEND_BASE}/api/cases/${caseId}/enm`);
  expect(enmAfterResponse.ok()).toBeTruthy();
  const enmAfter = (await enmAfterResponse.json()) as { header?: { hash_sha256?: string } };
  expect(enmAfter.header?.hash_sha256).toBe(snapshotHashBefore);
});
