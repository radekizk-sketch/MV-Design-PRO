/**
 * Karta W3-G1 (2026-09-10) — metoda rozpływu NR/GS/FD jako jawna opcja biegu
 * w `ui2/spaces/obliczenia/UruchomObliczenie.tsx` + walidacja krzyżowa NR↔FD
 * w ekranie „Jakość" (`ui2/wyniki/jakosc/SekcjaPorownaniaMetod.tsx`).
 *
 * Realny backend (`playwright-run-real.mjs`). Sieć: GPZ + jeden odcinek SN +
 * odbiór wprost na szynie końcowej (minimalna sieć gotowa do ROZPŁYWU —
 * wzorzec sieci `critical-run-flow.spec.ts`, bez stacji SN/nN/transformatora:
 * LOAD_FLOW wymaga wyłącznie `has_loads=True`, patrz komentarz przy
 * `buildMinimalReadyNetwork`).
 *
 * Dowodzi END-TO-END: (1) bieg NR bez wyboru (domyślny) jest widoczny w
 * ekranie „Jakość" jako referencja ze stanem zerowym „brak FD" + akcją
 * „Uruchom FD"; (2) natywny klik operatora — rodzaj „Rozpływ mocy" → metoda
 * „szybka rozprzężona (FD)" → „Uruchom obliczenie" — tworzy PRAWDZIWY bieg
 * FD na backendzie (potwierdzone GET śladu, nie tylko UI); (3) ekran „Jakość"
 * automatycznie odnajduje oba biegi i renderuje tabelę delty per szyna z
 * DANYCH backendu (tor P20c).
 */
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
    corridors?: Array<{ ordered_segment_refs?: string[] }>;
    branches?: Array<{ ref_id: string; type?: string }>;
    transformers?: Array<{ ref_id: string }>;
    buses?: Array<{ ref_id: string }>;
  };
};

interface ReadinessResponse {
  ready: boolean;
  issues?: Array<{ code: string; element_ref?: string | null }>;
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
        idempotency_key: `e2e-metoda-${name}-${String(++opCounter).padStart(4, '0')}`,
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
  const projectName = `E2E Metoda rozplywu ${suffix}`;
  const caseName = `Przypadek metody rozplywu ${suffix}`;

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'W3-G1: metoda rozplywu jako opcja biegu',
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

/**
 * Sieć minimalna: GPZ -> odcinek SN -> odbiór WPROST na szynie końcowej.
 *
 * BEZ stacji SN/nN (rozstrzygnięcie po pomiarze na tym drzewie, 2026-09-10):
 * `insert_station_on_segment_sn` z `transformer.create=true` automigruje pola
 * nN (`W061`) i wymaga zadeklarowania układu uziemienia sieci nN (`E063`) —
 * blokery spoza zakresu tej karty (dobór aparatu/uziemienia, nie metoda
 * rozpływu). LOAD_FLOW potrzebuje WYŁĄCZNIE `has_loads=True`
 * (`enm/validator.py`) — odbiór wprost na szynie SN (`add_load_sn`) domyka to
 * bez wchodzenia w model stacji nN.
 */
async function buildMinimalReadyNetwork(request: APIRequestContext, caseId: string): Promise<void> {
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
      dlugosc_m: 300,
      name: 'Odcinek 1',
      catalog_binding: buildCatalogBinding('KABEL_SN', CABLE_ID),
    },
  });
  const segmentRefs = op.snapshot?.corridors?.[0]?.ordered_segment_refs ?? [];
  expect(segmentRefs.length).toBeGreaterThan(0);

  // LOAD_FLOW (w odroznieniu od SC_3F) wymaga co najmniej jednego odbioru w
  // sieci (`enm/validator.py::load_flow=has_loads`) — bez tego backend
  // odmawia utworzenia biegu 409-ka ("Analiza rozplywu mocy nie jest
  // dostepna dla biezacego snapshotu ENM"). Odbior WPROST na szynie koncowej
  // odcinka SN (`add_load_sn`, katalog opcjonalny) — najnowsza szyna w
  // migawce po dobudowaniu odcinka jest jego szyna koncowa.
  const busRef = (op.snapshot?.buses ?? [])[(op.snapshot?.buses ?? []).length - 1]?.ref_id;
  expect(busRef).toBeTruthy();
  await executeDomainOp(request, caseId, 'add_load_sn', {
    bus_ref: busRef,
    p_mw: 0.1,
    cos_phi: 0.95,
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

  let readiness: ReadinessResponse | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const readinessResponse = await request.get(`${BACKEND_BASE}/api/cases/${caseId}/engineering-readiness`);
    expect(readinessResponse.ok()).toBeTruthy();
    readiness = (await readinessResponse.json()) as ReadinessResponse;
    if (readiness.ready) break;
    const catalogIssues = (readiness?.issues ?? []).filter(
      (issue) => issue.code.includes('catalog') && issue.element_ref,
    );
    const impedanceIssues = (readiness?.issues ?? []).filter(
      (issue) => issue.code === 'E005' && issue.element_ref,
    );
    for (const issue of catalogIssues) {
      const namespace = issue.code.includes('transformer') ? 'TRAFO_SN_NN' : 'KABEL_SN';
      const id = issue.code.includes('transformer') ? TRAFO_ID : CABLE_ID;
      await executeDomainOp(request, caseId, 'assign_catalog_to_element', {
        element_ref: issue.element_ref,
        catalog_binding: buildCatalogBinding(namespace, id),
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
}

async function createAndExecuteLoadFlowRun(
  request: APIRequestContext,
  caseId: string,
  solverInput: Record<string, unknown> = {},
): Promise<string> {
  const createResponse = await request.post(`${BACKEND_BASE}/api/execution/study-cases/${caseId}/runs`, {
    data: { analysis_type: 'LOAD_FLOW', solver_input: solverInput },
  });
  expect(createResponse.ok()).toBeTruthy();
  const { id: runId } = (await createResponse.json()) as { id: string };
  const executeResponse = await request.post(`${BACKEND_BASE}/api/execution/runs/${runId}/execute`);
  expect(executeResponse.ok()).toBeTruthy();
  return runId;
}

async function seedActiveCaseAndOpen(
  page: Page,
  seed: { projectId: string; projectName: string; caseId: string; caseName: string },
): Promise<void> {
  await page.addInitScript((s) => {
    localStorage.setItem(
      'mv-design-app-state',
      JSON.stringify({
        state: {
          activeProjectId: s.projectId,
          activeProjectName: s.projectName,
          activeCaseId: s.caseId,
          activeCaseName: s.caseName,
          activeCaseKind: 'ShortCircuitCase',
          activeCaseResultStatus: 'FRESH',
          activeSnapshotId: null,
          activeMode: 'MODEL_EDIT',
          activeRunId: null,
          activeAnalysisType: 'LOAD_FLOW',
          caseManagerOpen: false,
          issuePanelOpen: false,
        },
        version: 1,
      }),
    );
  }, seed);
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
}

test('metoda rozplywu jako opcja biegu + walidacja krzyzowa NR<->FD w ekranie Jakosc (realny backend)', async ({
  page,
  request,
}) => {
  const seed = await createProjectAndCase(request);
  await buildMinimalReadyNetwork(request, seed.caseId);

  // Bieg referencyjny NR — API (stan wyjsciowy realistyczny: operator juz mial
  // bieg rozplywu domyslna metoda, zanim otworzyl walidacje krzyzowa).
  const nrRunId = await createAndExecuteLoadFlowRun(request, seed.caseId);
  const nrTraceResponse = await request.get(`${BACKEND_BASE}/api/power-flow-runs/${nrRunId}/trace`);
  expect(nrTraceResponse.ok()).toBeTruthy();
  const nrTrace = (await nrTraceResponse.json()) as { solver_method?: string; converged?: boolean };
  expect(nrTrace.solver_method).toBe('newton-raphson');
  expect(nrTrace.converged).toBe(true);

  await seedActiveCaseAndOpen(page, seed);

  // Krok 1: ekran "Jakosc" z JEDNYM biegiem (NR) -> stan zerowy "brak FD" +
  // akcja "Uruchom FD" (doslowne brzmienie DoD karty).
  await page.evaluate((runId) => {
    window.location.hash = `#analysis?run=${runId}`;
  }, nrRunId);
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
  await expect(page.getByTestId('mvd-wyniki-warsztat')).toBeVisible();
  await page.getByTestId('mvd-wyniki-zakladka-jakosc').click();
  await expect(page.getByTestId('mvd-jakosc-ekran')).toBeVisible();
  await expect(page.getByTestId('mvd-jakosc-metody-brak-fd')).toBeVisible({ timeout: 15000 });

  // Krok 2: przestrzen "Obliczenia" - wybor SWIADOMY metody FD, natywny klik.
  await page.evaluate(() => {
    window.location.hash = '#case-config';
  });
  await expect(page.getByTestId('mvd-uruchom-obliczenie')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('mvd-uruchom-obliczenie-rodzaj').selectOption('LOAD_FLOW');
  await expect(page.getByTestId('mvd-uruchom-obliczenie-metoda-blok')).toBeVisible();
  await page.getByTestId('mvd-uruchom-obliczenie-metoda').selectOption('fast-decoupled');
  await expect(page.getByTestId('mvd-uruchom-obliczenie-metoda-opis')).not.toHaveText('');
  await page.getByTestId('mvd-uruchom-obliczenie-przycisk').click();
  await expect(page.getByTestId('notification-toast')).toContainText('Obliczenie zakończone', {
    timeout: 30000,
  });

  // Krok 3: dowod BACKENDOWY (nie tylko UI) - nowy bieg LOAD_FLOW tego przypadku
  // ma solver_method="fast-decoupled" w sladzie.
  const runsResponse = await request.get(`${BACKEND_BASE}/api/execution/study-cases/${seed.caseId}/runs`);
  expect(runsResponse.ok()).toBeTruthy();
  const runsBody = (await runsResponse.json()) as {
    runs: Array<{ id: string; analysis_type: string; status: string }>;
  };
  const fdRun = runsBody.runs.find(
    (r) => r.analysis_type === 'LOAD_FLOW' && r.status === 'DONE' && r.id !== nrRunId,
  );
  expect(fdRun).toBeTruthy();
  const fdTraceResponse = await request.get(`${BACKEND_BASE}/api/power-flow-runs/${fdRun!.id}/trace`);
  expect(fdTraceResponse.ok()).toBeTruthy();
  const fdTrace = (await fdTraceResponse.json()) as { solver_method?: string };
  expect(fdTrace.solver_method).toBe('fast-decoupled');

  // Krok 4: ekran "Jakosc" znajduje OBA biegi sam i pokazuje tabele delty
  // per szyna z danych backendu (tor P20c) - zero fizyki w UI.
  await page.evaluate((runId) => {
    window.location.hash = `#analysis?run=${runId}`;
  }, nrRunId);
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
  await page.getByTestId('mvd-wyniki-zakladka-jakosc').click();
  const sekcjaMetod = page.getByTestId('mvd-jakosc-metody');
  await expect(sekcjaMetod.getByTestId('mvd-wyn-tabela')).toBeVisible({ timeout: 20000 });
  await expect(sekcjaMetod.getByText('Newtona–Raphsona')).toBeVisible();
  await expect(sekcjaMetod.getByText('szybka rozprzężona')).toBeVisible();
  await expect(sekcjaMetod.getByTestId('mvd-wyn-wiersz').first()).toBeVisible();
});
