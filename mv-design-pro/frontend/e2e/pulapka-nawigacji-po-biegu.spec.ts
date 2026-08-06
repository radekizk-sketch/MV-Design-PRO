/**
 * Pułapka nawigacji po biegu — bramka karty S9-3 (audyt `docs/sld/AUDYT_JAKOSCI_SLD_2026-08.md`,
 * znalezisko W-3 wagi 3).
 *
 * OBJAW ZMIERZONY W AUDYCIE: po biegu klik „Schemat (SLD)" przechodzi na `#sld`,
 * kanwa montuje się (96 elementów `sld-v3-*` w 303 ms), a po ~2,3 s aplikacja
 * SAMA wraca na `#analysis?run=…` i odmontowuje kanwę — dopiero DRUGI klik zostaje.
 *
 * INTENCJA BRAMKI (kontrakt „nawigacja użytkownika wygrywa z automatyczną"):
 * przekierowanie po zakończonym biegu wolno wykonać NAJWYŻEJ RAZ i wyłącznie
 * wtedy, gdy projektant nie zmienił miejsca pracy od startu biegu. Gdy zmienił —
 * automatyczna nawigacja MUSI ustąpić, a kanwa zostać zamontowana.
 *
 * Spec ćwiczy REALNĄ ścieżkę użytkownika (natywne kliki w przycisk „Oblicz"
 * powłoki i pozycję „Schemat (SLD)" nawigacji przestrzeni) na ŻYWEJ aplikacji
 * z REALNYM backendem — zero syntetycznych zdarzeń, zero wymuszania stanu store'ów.
 *
 * Wzorzec budowy sieci i kontekstu: e2e/restart-po-biegu.spec.ts (K2).
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const CABLE_ID = 'cable-tfk-yakxs-3x120';
const TRAFO_ID = 'tr-sn-nn-15-04-630kva-dyn11';
const SOURCE_ID = 'src-gpz-15kv-250mva-rx010';
const CATALOG_VERSION = '2024.1';

/** Okno obserwacji trwałości kanwy po kliku użytkownika (kryterium karty: ≥ 8 s). */
const OKNO_OBSERWACJI_MS = 8000;
/** Odstęp próbkowania śladu (audyt próbkował co 1 s; tu gęściej — mierzymy moment cofnięcia). */
const KROK_PROBKI_MS = 250;

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
        idempotency_key: `e2e-pulapka-${name}-${String(++opCounter).padStart(4, '0')}`,
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
  const projectName = `E2E pulapka nawigacji ${suffix}`;
  const caseName = `Przypadek pulapka ${suffix}`;

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Bramka S9-3: nawigacja uzytkownika wygrywa z automatyczna',
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

async function otworzPowlokeZKontekstem(page: Page, request: APIRequestContext): Promise<string> {
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

  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 30000 });
  return caseId;
}

/** Buduje przez API kompletną, gotową do obliczeń sieć (wzorzec restart-po-biegu). */
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

  let readiness: { ready: boolean; issues?: Array<{ code: string; element_ref?: string | null }> } | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const readinessResponse = await request.get(`${BACKEND_BASE}/api/cases/${caseId}/engineering-readiness`);
    expect(readinessResponse.ok()).toBeTruthy();
    readiness = (await readinessResponse.json()) as typeof readiness;
    if (readiness?.ready) break;

    for (const issue of (readiness?.issues ?? []).filter((i) => i.code.includes('catalog') && i.element_ref)) {
      const isTrafo = issue.code.includes('transformer');
      await executeDomainOp(request, caseId, 'assign_catalog_to_element', {
        element_ref: issue.element_ref!,
        catalog_binding: buildCatalogBinding(isTrafo ? 'TRAFO_SN_NN' : 'KABEL_SN', isTrafo ? TRAFO_ID : CABLE_ID),
      });
    }
    for (const issue of (readiness?.issues ?? []).filter((i) => i.code === 'E005' && i.element_ref)) {
      await executeDomainOp(request, caseId, 'update_element_parameters', {
        element_ref: issue.element_ref!,
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

async function przeladujPowloke(page: Page): Promise<void> {
  await page.reload({ waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 30000 });
}

type Probka = { tMs: number; kanwa: boolean; hash: string };

/**
 * Ślad trwałości kanwy po kliku użytkownika: próbkuje obecność kanwy i adres
 * przez zadane okno. Zwraca PEŁNY ślad (nie tylko werdykt), żeby komunikat
 * błędu niósł ZMIERZONY moment cofnięcia — jak ślad audytu.
 */
async function sledzTrwaloscKanwy(page: Page, oknoMs: number): Promise<Probka[]> {
  const slad: Probka[] = [];
  const start = Date.now();
  while (Date.now() - start < oknoMs) {
    const stan = await page.evaluate(() => ({
      kanwa: document.querySelector('svg[data-testid="sld-canvas-v3"]') != null,
      hash: window.location.hash,
    }));
    slad.push({ tMs: Date.now() - start, ...stan });
    await page.waitForTimeout(KROK_PROBKI_MS);
  }
  return slad;
}

function pierwszeCofniecie(slad: Probka[]): Probka | null {
  return slad.find((p) => !p.kanwa || !p.hash.startsWith('#sld')) ?? null;
}

function opisSladu(slad: Probka[]): string {
  return slad
    .map((p) => `${p.tMs} ms: kanwa=${p.kanwa ? 'jest' : 'BRAK'} hash=${p.hash || '(pusty)'}`)
    .join('\n');
}

/** Realna ścieżka wejścia na schemat: pozycja „Schemat (SLD)" nawigacji przestrzeni. */
async function klikSchemat(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Schemat (SLD)' }).first().click();
}

test.describe('W-3 · pierwszy powrót na schemat po biegu', () => {
  test('bieg kończący się PO wejściu na schemat nie cofa projektanta z kanwy (bramka S9-3)', async ({ page, request }) => {
    test.setTimeout(300000);

    const caseId = await otworzPowlokeZKontekstem(page, request);
    await zbudujSiecGotowaDoObliczen(request, caseId);
    await przeladujPowloke(page);

    // REALNY klik „Oblicz" (pasek tytułowy powłoki) — start biegu SC_3F.
    await page.getByRole('button', { name: 'Oblicz', exact: true }).click();

    // REALNY klik „Schemat (SLD)" W TRAKCIE biegu: projektant świadomie wraca na
    // rysunek, zanim solver skończy. Od tej chwili jego nawigacja jest ostatnia.
    await klikSchemat(page);
    await expect(page.locator('svg[data-testid="sld-canvas-v3"]')).toBeVisible({ timeout: 20000 });

    // Bieg kończy się PO wejściu użytkownika ⇒ ZERO automatycznej nawigacji.
    const slad = await sledzTrwaloscKanwy(page, OKNO_OBSERWACJI_MS);
    const cofniecie = pierwszeCofniecie(slad);
    expect(
      cofniecie,
      `Aplikacja cofnęła projektanta ze schematu po ${cofniecie?.tMs} ms (hash=${cofniecie?.hash}).\nŚlad:\n${opisSladu(slad)}`,
    ).toBeNull();

    // Kontrola dodatnia: bieg NAPRAWDĘ się zakończył w oknie obserwacji —
    // spec nie może „zzielenieć" dlatego, że solver jeszcze nie odpowiedział.
    // Rejestr przebiegów zakresu: ta sama końcówka, z której czyta powłoka
    // (`ui/study-cases/api.listRuns` → GET /api/execution/study-cases/{id}/runs).
    const przebiegi = await request.get(`${BACKEND_BASE}/api/execution/study-cases/${caseId}/runs`);
    expect(przebiegi.ok()).toBeTruthy();
    const lista = (await przebiegi.json()) as { runs?: Array<{ status?: string }> };
    expect((lista.runs ?? []).some((r) => (r.status ?? '').toUpperCase() === 'DONE')).toBe(true);
  });

  test('po wylądowaniu na wynikach pierwszy klik „Schemat (SLD)" zostaje (bramka S9-3)', async ({ page, request }) => {
    test.setTimeout(300000);

    const caseId = await otworzPowlokeZKontekstem(page, request);
    await zbudujSiecGotowaDoObliczen(request, caseId);
    await przeladujPowloke(page);

    await page.getByRole('button', { name: 'Oblicz', exact: true }).click();

    // Kontrola dodatnia lądowiska wyników (V12K-273): bieg bez interakcji
    // użytkownika NADAL przenosi na wyniki — jednorazowo.
    await expect
      .poll(async () => page.evaluate(() => window.location.hash), { timeout: 120000 })
      .toMatch(/^#analysis\?.*run=/);

    // PIERWSZY klik „Schemat (SLD)" po biegu ma zostać.
    await klikSchemat(page);
    await expect(page.locator('svg[data-testid="sld-canvas-v3"]')).toBeVisible({ timeout: 20000 });

    const slad = await sledzTrwaloscKanwy(page, OKNO_OBSERWACJI_MS);
    const cofniecie = pierwszeCofniecie(slad);
    expect(
      cofniecie,
      `Pierwszy powrót na schemat został cofnięty po ${cofniecie?.tMs} ms (hash=${cofniecie?.hash}).\nŚlad:\n${opisSladu(slad)}`,
    ).toBeNull();
  });
});
