/**
 * Jedno lądowisko wyników (bramka karty K3, defekty A1/A4).
 *
 * INTENCJA: trasa wyników (`#analysis?run=…`) MUSI prowadzić do warsztatu ui2
 * przestrzeni „Wyniki i dowody" — nie do mostu legacy (hub E-35). Dotąd hash
 * nie ustawiał `activeSpace`, więc:
 *  - zimny deep-link (nowa karta przeglądarki) lądował w moście,
 *  - DONE-owe `navigateToResults` po kliku „Oblicz" prowadziło komunikatem
 *    „Otwieram wyniki" również do mostu.
 * Po K3-A1 hash `#analysis` (i aliasy wyników) ustawia przestrzeń 'wyniki';
 * po K3-A4 zakładka startowa dochodzi do rodzaju przebiegu po hydratacji K2.
 *
 * Wzorzec seedu: e2e/restart-po-biegu.spec.ts (real backend; sieć budowana
 * przez API domain-ops). Test 1 uruchamia bieg przez API execution (wzorzec
 * industrial) — bada NAWIGACJĘ deep-linku w czystym kontekście; test 2 klika
 * „Oblicz" REALNIE i sprawdza lądowanie bez żadnego dodatkowego kliku.
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const FRONTEND_BASE = process.env.PLAYWRIGHT_FRONTEND_URL ?? 'http://127.0.0.1:5173';
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
    corridors?: Array<{ ordered_segment_refs?: string[] }>;
    branches?: Array<{ ref_id: string }>;
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
        idempotency_key: `e2e-deeplink-${name}-${String(++opCounter).padStart(4, '0')}`,
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
  const projectName = `E2E deeplink ${suffix}`;
  const caseName = `Przypadek deeplink ${suffix}`;

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Test jednego lądowiska wyników (bramka K3)',
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
  }, { projectId, projectName, caseId, caseName });

  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 30000 });
  await expect(page.getByTestId('active-case-bar')).toContainText(/Zakres|Bieżący zestaw/);
  return caseId;
}

/** Buduje przez API kompletną, gotową do obliczeń sieć (wzorzec critical-run-flow). */
async function zbudujSiecGotowaDoObliczen(request: APIRequestContext, caseId: string): Promise<void> {
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

  // Domknięcie ewentualnych blokerów gotowości (katalogi / impedancje) —
  // ta sama pętla co w critical-run-flow.spec.ts.
  let readiness: { ready: boolean; issues?: Array<{ code: string; element_ref?: string | null }> } | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const readinessResponse = await request.get(`${BACKEND_BASE}/api/cases/${caseId}/engineering-readiness`);
    expect(readinessResponse.ok()).toBeTruthy();
    readiness = (await readinessResponse.json()) as typeof readiness;
    if (readiness?.ready) break;

    for (const issue of (readiness?.issues ?? []).filter((i) => i.code.includes('catalog') && i.element_ref)) {
      const isTrafo = issue.code.includes('transformer');
      await executeDomainOp(request, caseId, 'assign_catalog_to_element', {
        element_ref: issue.element_ref,
        catalog_binding: buildCatalogBinding(isTrafo ? 'TRAFO_SN_NN' : 'KABEL_SN', isTrafo ? TRAFO_ID : CABLE_ID),
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
}

/** Bieg SC_3F przez API execution (wzorzec industrial) — zwraca id przebiegu DONE. */
async function uruchomBiegScPrzezApi(request: APIRequestContext, caseId: string): Promise<string> {
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

  // Publiczny indeks wyników gotowy = frontend ma skąd czytać tabelę zwarć.
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

test('zimny deep-link #analysis?run= ląduje w warsztacie ui2, nie w moście legacy (bramka K3-A1)', async ({ browser, request }) => {
  test.setTimeout(240000);

  const { caseId } = await createProjectAndCase(request);
  await zbudujSiecGotowaDoObliczen(request, caseId);
  const runId = await uruchomBiegScPrzezApi(request, caseId);

  // NOWY kontekst przeglądarki = czysty persist (zero pamięci poprzedniej
  // karty) — dokładnie sytuacja „kolega wkleja mi link do wyników".
  // Parametr `case` w linku to jedyne uczciwe źródło kontekstu rejestru
  // przebiegów w świeżej przeglądarce (hydratacja K2 idzie od przypadku).
  const kontekst = await browser.newContext();
  try {
    const strona = await kontekst.newPage();
    await strona.goto(`${FRONTEND_BASE}/#analysis?run=${runId}&case=${caseId}`, {
      waitUntil: 'commit',
    });
    await strona.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 30000 });

    // Lądowisko = warsztat ui2 przestrzeni „Wyniki" (K3-A1). Bez naprawy hash
    // nie ustawiał przestrzeni i renderował się most legacy (E-35) — wtedy
    // warsztatu nie ma w DOM i ta asercja jest CZERWONA.
    await expect(strona.getByTestId('mvd-wyniki-warsztat')).toBeVisible({ timeout: 20000 });

    // K2 + K3-A4: rejestr przebiegów hydratuje z serwera po montażu, a zakładka
    // startowa dochodzi do rodzaju przebiegu (SC_3F → „Zwarcia").
    await expect(strona.getByTestId('mvd-wyniki-zakladka-zwarcia')).toHaveAttribute(
      'aria-selected',
      'true',
      { timeout: 20000 },
    );

    // Wynik ŻYWY: tabela zwarć wspólnego wzorca (nie stan pusty okna E8.2).
    await expect(strona.getByTestId('mvd-zwarcia-ekran')).toBeVisible({ timeout: 20000 });
    await expect(strona.getByTestId('mvd-zwarcia-ekran-pusty')).toHaveCount(0);
    await expect(strona.locator('[data-testid="mvd-wyn-ekran"]').first()).toBeVisible();

    // Hub mostu („Analizy techniczne") nie jest lądowiskiem deep-linku.
    await expect(strona.getByTestId('mvd-analizy-techniczne')).toHaveCount(0);
  } finally {
    await kontekst.close();
  }
});

test('po DONE klik „Oblicz" z przestrzeni obliczeń ląduje w ui2 z zakładką wg rodzaju (bramka K3-A1/A4)', async ({ page, request }) => {
  test.setTimeout(240000);

  const caseId = await createCaseFromUi(page, request);
  await zbudujSiecGotowaDoObliczen(request, caseId);

  // Powłoka musi zobaczyć zbudowany model (gotowość liczona z migawki serwera).
  await page.reload({ waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 30000 });

  // Przestrzeń „Obliczenia" (realna droga projektanta) → REALNY klik „Oblicz".
  // Nazwa dostępna przycisku nawigacji = etykieta + skrót („Obliczenia 5").
  await page.getByRole('button', { name: /^Obliczenia \d$/ }).click();
  await page.getByRole('button', { name: 'Oblicz', exact: true }).click();
  const toastSukcesu = page
    .getByTestId('notification-toast')
    .filter({ hasText: 'Obliczenie zakończone' })
    .first();
  await expect(toastSukcesu).toBeVisible({ timeout: 90000 });

  // BEZ żadnego dodatkowego kliku: DONE-owe `navigateToResults` („Otwieram
  // wyniki") ma wylądować w warsztacie ui2 z zakładką rodzaju przebiegu.
  await expect(page).toHaveURL(/#analysis\?/);
  await expect(page.getByTestId('mvd-wyniki-warsztat')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('mvd-wyniki-zakladka-zwarcia')).toHaveAttribute(
    'aria-selected',
    'true',
    { timeout: 20000 },
  );
  await expect(page.getByTestId('mvd-zwarcia-ekran')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('mvd-zwarcia-ekran-pusty')).toHaveCount(0);
  await expect(page.getByTestId('mvd-zwarcia-bilans')).toBeVisible();

  // V12K-281 (K13): wiersze zbiorcze wyniku NIE niosą już rozpływu gałęziowego
  // (iloczyn źródło×gałąź per wiersz dawał odpowiedź 730 MB dla 50 stacji) —
  // sekcja rozpływu pobiera dane wybranego punktu ENDPOINTEM NA ŻĄDANIE.
  // Bramka: realny bieg → sekcja pokazuje wpisy (tabela), NIE stan
  // „niedostępny" (regresja dostawcy) ani „pusty" (sieć MA źródło zastępcze,
  // więc rozpływ od sieci nadrzędnej istnieje).
  await expect(page.getByTestId('mvd-zwarcia-rozplyw')).toBeVisible();
  await expect(page.getByTestId('mvd-zwarcia-rozplyw').locator('table')).toBeVisible({
    timeout: 20000,
  });
  await expect(page.getByTestId('mvd-zwarcia-rozplyw-brak')).toHaveCount(0);
  await expect(page.getByTestId('mvd-zwarcia-rozplyw-pusty')).toHaveCount(0);
});
