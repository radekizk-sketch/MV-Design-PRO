/**
 * Karta W5-D (2026-09-16) — model fazowy i rozpływ niesymetryczny jako bieg produktu.
 *
 * Realny backend (`playwright-run-real.mjs`). Sieć: GPZ 110/15 kV (Yd11) → odcinek SN
 * → stacja SN/nN z transformatorem Dyn11 i odbiorem potrzeb własnych na szynie nN,
 * któremu operacja domenowa `update_element_parameters` wskazuje JEDNĄ fazę
 * (`Load.phases = 'A'`, pole modelu z W5-D). Układ uziemienia sieci nN zadeklarowany
 * (`nn_earthing`, bramka E063 — jak w `kreator-oze-max.spec.ts`).
 *
 * Dowodzi END-TO-END klasy D: (1) natywny wybór rodzaju „Rozpływ niesymetryczny"
 * w przestrzeni „Obliczenia" i klik „Uruchom obliczenie" tworzą PRAWDZIWY bieg
 * `PF_UNBALANCED` na backendzie (solver BFS per faza, FROZEN); (2) końcówka
 * `GET /api/analysis-runs/{id}/results/rozplyw-niesymetryczny` zwraca napięcia per
 * faza z asymetrią na szynie nN (faza A obciążona niżej niż B i C) oraz założenia
 * biegu nazwane kodami kanonu (droga I0 odbioru zamknięta w Dyn11 — GPZ Yd11 powyżej
 * nie blokuje); (3) ekran „Stan fazowy SN" (E-31) czyta ten bieg jako DRUGIE źródło:
 * nazywa źródło, pokazuje tabelę szyn per faza z VUF z solvera i listę założeń.
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { otworzZakladkeWynikow } from './nawigacjaWynikow';

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
    transformers?: Array<{ ref_id: string; ulv_kv?: number }>;
    buses?: Array<{ ref_id: string; voltage_kv?: number }>;
    loads?: Array<{ ref_id: string; bus_ref: string; phases?: string | null }>;
  };
};

interface ReadinessResponse {
  ready: boolean;
  issues?: Array<{ code: string; element_ref?: string | null }>;
}

interface FazaSzyny {
  u_pu: number;
  u_kv: number;
  angle_deg: number;
}

interface WynikRozplywuNiesymetrycznego {
  run_id: string;
  converged: boolean | null;
  buses: Array<{
    bus_id: string;
    element_id: string;
    name: string;
    un_kv: number;
    solved: boolean;
    faza_a: FazaSzyny | null;
    faza_b: FazaSzyny | null;
    faza_c: FazaSzyny | null;
    voltage_unbalance_factor_pct: number | null;
  }>;
  branches: Array<{ branch_id: string }>;
  summary: { max_voltage_unbalance_factor_pct: number | null; max_voltage_unbalance_bus_id: string | null } | null;
  zalozenia: Array<{ kod: string; elementy: string[] }>;
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
        idempotency_key: `e2e-w5d-${name}-${String(++opCounter).padStart(4, '0')}`,
        payload,
      },
    },
    timeout: 30000,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const body = (await response.json()) as DomainOpResponse;
  expect(body.error ?? null).toBeNull();
  return body;
}

async function createProjectAndCase(
  request: APIRequestContext,
): Promise<{ projectId: string; projectName: string; caseId: string; caseName: string }> {
  const suffix = nextEntitySuffix();
  const projectName = `E2E Rozplyw niesymetryczny ${suffix}`;
  const caseName = `Przypadek rozplywu niesymetrycznego ${suffix}`;

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'W5-D: odbior jednofazowy nN -> bieg PF_UNBALANCED -> ekran Stan fazowy SN',
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
 * Sieć z odbiorem JEDNOFAZOWYM na szynie nN stacji SN/nN (Dyn11) pod GPZ Yd11.
 * Zwraca `ref_id` odbioru i szyny nN, żeby dowód backendowy wskazał tę szynę.
 */
async function buildNetworkWithSinglePhaseLoad(
  request: APIRequestContext,
  caseId: string,
): Promise<{ loadRef: string; nnBusRef: string }> {
  await executeDomainOp(request, caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: buildCatalogBinding('ZRODLO_SN', SOURCE_ID),
    hv_voltage_kv: 110.0,
    transformer_sn_mva: 25.0,
  });

  let op = await executeDomainOp(request, caseId, 'continue_trunk_segment_sn', {
    segment: {
      rodzaj: 'KABEL',
      dlugosc_m: 300,
      name: 'Odcinek 1',
      catalog_binding: buildCatalogBinding('KABEL_SN', CABLE_ID),
    },
  });
  const segmentRefs = op.snapshot?.corridors?.[0]?.ordered_segment_refs ?? [];
  expect(segmentRefs.length).toBeGreaterThan(0);

  op = await executeDomainOp(request, caseId, 'insert_station_on_segment_sn', {
    field_apparatus_catalog_ref: 'sw-cb-abb-vd4-17kv-630a',
    segment_id: segmentRefs[segmentRefs.length - 1],
    station_type: 'B',
    insert_at: { value: 0.5 },
    station: { sn_voltage_kv: 15.0, nn_voltage_kv: 0.4 },
    sn_fields: ['IN', 'OUT', 'FEEDER', 'TR'],
    transformer: {
      create: true,
      catalog_binding: buildCatalogBinding('TRAFO_SN_NN', TRAFO_ID),
    },
    // Odbiór potrzeb własnych (G-STK-3) = jedyny odbiór sieci; niżej dostaje fazę A.
    station_auxiliary: { active_power_kw: 5.0, cos_phi: 0.95 },
    // Układ uziemienia sieci nN (G-STK-1): bez niego stacja z odbiorem nN jest E063.
    nn_earthing: { lv_system: 'TN-S' },
  });

  const loads = op.snapshot?.loads ?? [];
  expect(loads.length).toBe(1);
  const loadRef = loads[0].ref_id;
  const nnBusRef = loads[0].bus_ref;
  expect(loads[0].phases ?? null).toBeNull();

  // W5-D: JEDNA faza odbioru (`Load.phases`) przez operację domenową modelu — pole
  // czytane przez rozpływ niesymetryczny; migawka przed tą operacją nie miała klucza.
  const zFaza = await executeDomainOp(request, caseId, 'update_element_parameters', {
    element_ref: loadRef,
    parameters: { phases: 'A' },
  });
  expect((zFaza.snapshot?.loads ?? []).find((l) => l.ref_id === loadRef)?.phases).toBe('A');

  const odcinkiLiniowe = (op.snapshot?.branches ?? []).filter(
    (branch) => branch.type === 'cable' || branch.type === 'line_overhead',
  );
  for (const branch of odcinkiLiniowe) {
    await executeDomainOp(request, caseId, 'assign_catalog_to_element', {
      element_ref: branch.ref_id,
      catalog_binding: buildCatalogBinding('KABEL_SN', CABLE_ID),
    });
  }
  for (const transformer of (op.snapshot?.transformers ?? []).filter((t) => (t.ulv_kv ?? 1) < 1.0)) {
    await executeDomainOp(request, caseId, 'assign_catalog_to_element', {
      element_ref: transformer.ref_id,
      catalog_binding: buildCatalogBinding('TRAFO_SN_NN', TRAFO_ID),
    });
  }

  let readiness: ReadinessResponse | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const readinessResponse = await request.get(`${BACKEND_BASE}/api/cases/${caseId}/engineering-readiness`, {
      timeout: 30000,
    });
    expect(readinessResponse.ok()).toBeTruthy();
    readiness = (await readinessResponse.json()) as ReadinessResponse;
    if (readiness.ready) break;
    for (const issue of (readiness?.issues ?? []).filter((i) => i.code.includes('catalog') && i.element_ref)) {
      const isTrafo = issue.code.includes('transformer');
      await executeDomainOp(request, caseId, 'assign_catalog_to_element', {
        element_ref: issue.element_ref,
        catalog_binding: buildCatalogBinding(isTrafo ? 'TRAFO_SN_NN' : 'KABEL_SN', isTrafo ? TRAFO_ID : CABLE_ID),
      });
    }
  }
  expect(readiness?.ready).toBe(true);
  return { loadRef, nnBusRef };
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
          activeCaseResultStatus: 'NONE',
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

test('odbior jednofazowy nN -> bieg PF_UNBALANCED z przestrzeni Obliczenia -> ekran Stan fazowy SN (realny backend)', async ({
  page,
  request,
}) => {
  const seed = await createProjectAndCase(request);
  const { nnBusRef } = await buildNetworkWithSinglePhaseLoad(request, seed.caseId);

  await seedActiveCaseAndOpen(page, seed);

  // Krok 1: przestrzen "Obliczenia" - natywny wybor rodzaju i klik "Uruchom obliczenie".
  await page.evaluate(() => {
    window.location.hash = '#case-config';
  });
  await expect(page.getByTestId('mvd-uruchom-obliczenie')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('mvd-uruchom-obliczenie-rodzaj').selectOption('PF_UNBALANCED');
  // Solver BFS nie zna metody NR/GS/FD - selektor metody rozplywu NIE pojawia sie.
  await expect(page.getByTestId('mvd-uruchom-obliczenie-metoda-blok')).toHaveCount(0);
  await page.getByTestId('mvd-uruchom-obliczenie-przycisk').click();
  await expect(page.getByTestId('notification-toast')).toContainText('Obliczenie zakończone', {
    timeout: 45000,
  });

  // Krok 2: dowod BACKENDOWY - bieg PF_UNBALANCED tego przypadku ma status DONE, a koncowka
  // wynikow niesie napiecia per faza z asymetria na szynie nN i zalozenia nazwane kodami.
  const runsResponse = await request.get(`${BACKEND_BASE}/api/execution/study-cases/${seed.caseId}/runs`);
  expect(runsResponse.ok()).toBeTruthy();
  const runsBody = (await runsResponse.json()) as {
    runs: Array<{ id: string; analysis_type: string; status: string; error_message: string | null }>;
  };
  const run = runsBody.runs.find((r) => r.analysis_type === 'PF_UNBALANCED');
  expect(run, JSON.stringify(runsBody.runs)).toBeTruthy();
  expect(run!.status, run!.error_message ?? '').toBe('DONE');

  const wynikResponse = await request.get(
    `${BACKEND_BASE}/api/analysis-runs/${run!.id}/results/rozplyw-niesymetryczny`,
  );
  expect(wynikResponse.ok()).toBeTruthy();
  const wynik = (await wynikResponse.json()) as WynikRozplywuNiesymetrycznego;
  expect(wynik.converged).toBe(true);
  expect(wynik.buses.length).toBeGreaterThan(3);
  expect(wynik.branches.length).toBeGreaterThan(2);
  const szynaNn = wynik.buses.find((b) => b.element_id === nnBusRef);
  expect(szynaNn, JSON.stringify(wynik.buses.map((b) => b.element_id))).toBeTruthy();
  expect(szynaNn!.solved).toBe(true);
  // Faza A obciazona -> nizsze napiecie niz B i C; VUF > 0 z solvera.
  expect(szynaNn!.faza_a!.u_pu).toBeLessThan(szynaNn!.faza_b!.u_pu);
  expect(szynaNn!.faza_a!.u_pu).toBeLessThan(szynaNn!.faza_c!.u_pu);
  expect(szynaNn!.voltage_unbalance_factor_pct!).toBeGreaterThan(0);
  // Szyna nN stacji i zacisk wylacznika glownego nN (galaz o zerowej impedancji)
  // maja IDENTYCZNY VUF - solver wskazuje pierwsza w porzadku, wiec pin idzie
  // po WARTOSCI, nie po identyfikatorze szyny.
  expect(wynik.summary?.max_voltage_unbalance_factor_pct).toBe(szynaNn!.voltage_unbalance_factor_pct);
  const kody = wynik.zalozenia.map((z) => z.kod);
  expect(kody).toContain('power_flow.unbalanced_transformer_series_model');
  // Droga I0 odbioru nN zamknieta w Dyn11 - GPZ Yd11 powyzej to zalozenie nazwane, nie odmowa.
  expect(kody).toContain('power_flow.unbalanced_zero_sequence_confined');

  // Krok 3: ekran "Stan fazowy SN" (E-31) czyta bieg jako DRUGIE zrodlo - przez realna
  // nawigacje warsztatu Wynikow (obszar -> zakladka), bez mockow.
  await page.evaluate((runId) => {
    window.location.hash = `#analysis?run=${runId}`;
  }, run!.id);
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
  await expect(page.getByTestId('mvd-wyniki-warsztat')).toBeVisible();
  await otworzZakladkeWynikow(page, 'stan-fazowy');
  const blok = page.getByTestId('mvd-fazowy-rozplyw-niesymetryczny');
  await expect(blok).toBeVisible({ timeout: 20000 });
  await expect(blok).toHaveAttribute('data-zrodlo', 'rozplyw_niesymetryczny');
  await expect(page.getByTestId('mvd-stan-fazowy')).toContainText('rozpływ niesymetryczny (solver BFS per faza)');
  const szyny = page.getByTestId('mvd-fazowy-rn-szyny');
  await expect(szyny).toBeVisible();
  await expect(szyny.getByTestId('mvd-fazowy-rn-szyna')).toHaveCount(wynik.buses.length);
  await expect(szyny.locator('[data-max-vuf="true"]')).toHaveCount(1);
  await expect(page.getByTestId('mvd-fazowy-rn-galezie').getByTestId('mvd-fazowy-rn-galaz')).toHaveCount(
    wynik.branches.length,
  );
  await expect(page.getByTestId('mvd-fazowy-rn-zalozenia')).toContainText(
    'prąd powrotny odbioru jednofazowego zamyka się w uziemionym uzwojeniu transformatora',
  );
  await expect(page.getByTestId('mvd-fazowy-stan-fazowy')).toHaveCount(0);
});
