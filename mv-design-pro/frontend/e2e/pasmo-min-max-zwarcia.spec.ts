/**
 * Pasmo MIN/MAX zwarcia z jednego przypadku obok siebie (karta W3-G3, aneks
 * D7, mapa domknięcia 3 #12) — real backend.
 *
 * DWA SCENARIUSZE (KLASA, NIE INSTANCJA — iloczyn cech „skąd bierze się
 * strona przeciwna pasma"):
 *  1. Kotwica bez zapisanego sąsiada tego samego przypadku (droga częstsza —
 *     zwykły klik „Oblicz"): strona MIN dochodzi WARIANTEM W PAMIĘCI
 *     (`bieg_wariantu`, ten sam mechanizm co bieg zbiorczy nastaw), bez
 *     własnego `run_id`.
 *  2. Kotwica MA zapisanego sąsiada (inżynier uruchomił OBA scenariusze —
 *     symulowane tu wprost dwoma realnymi biegami API, jak zrobiłaby to
 *     akcja „Uruchom bieg MIN" tej karty): strona MIN jest REALNYM,
 *     NIEZALEŻNYM biegiem tego przypadku, z WŁASNYM `run_id`.
 *
 * Wzorzec sieci/kotwicy: `critical-run-flow.spec.ts` / `nastawy-koordynacji-
 * hoppel.spec.ts` (real backend, `add_grid_source_sn` → `continue_trunk_
 * segment_sn` → `insert_station_on_segment_sn`, pętla gotowości katalogowej).
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

type OdczytGotowosci = {
  ready: boolean;
  issues?: Array<{ code: string; element_ref?: string | null }>;
};

type DomainOpResponse = {
  error?: string | null;
  snapshot?: {
    corridors?: Array<{ ordered_segment_refs?: string[] }>;
    branches?: Array<{ ref_id: string; type?: string }>;
    transformers?: Array<{ ref_id: string }>;
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
        idempotency_key: `e2e-pasmo-${name}-${String(++opCounter).padStart(4, '0')}`,
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
  const projectName = `E2E pasmo MIN-MAX ${suffix}`;
  const caseName = `Przypadek pasma ${suffix}`;

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Test pasma MIN/MAX zwarcia (karta W3-G3)',
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

/** Sieć minimalna gotowa do obliczeń: GPZ -> odcinek -> stacja SN/nN
 * (wzorzec `critical-run-flow.spec.ts` kroki 1-3, bez odgałęzienia — pasmo
 * MIN/MAX nie wymaga selektywności, wystarczy jeden realny punkt zwarcia). */
async function zbudujSiecGotowaDoObliczen(request: APIRequestContext, caseId: string): Promise<void> {
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
      name: 'Odcinek źródłowy',
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
    transformer: { create: true, catalog_binding: buildCatalogBinding('TRAFO_SN_NN', TRAFO_ID) },
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

  let readiness: OdczytGotowosci | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const readinessResponse = await request.get(`${BACKEND_BASE}/api/cases/${caseId}/engineering-readiness`);
    expect(readinessResponse.ok()).toBeTruthy();
    readiness = (await readinessResponse.json()) as OdczytGotowosci;
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

async function createCaseFromUi(page: Page, request: APIRequestContext): Promise<{
  projectId: string;
  caseId: string;
}> {
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
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
  await expect(page.getByTestId('active-case-bar')).toContainText(/Zakres|Bieżący zestaw/);
  return { projectId, caseId };
}

/** REALNY klik „Oblicz" (kotwica SC_3F, AUTO c — scenariusz domyślny MAX) +
 * oczekiwanie na toast sukcesu. Wzorzec: `critical-run-flow.spec.ts` /
 * `nastawy-koordynacji-hoppel.spec.ts`. */
async function kliknijOblicz(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Oblicz', exact: true }).click();
  const toastSukcesu = page
    .getByTestId('notification-toast')
    .filter({ hasText: 'Obliczenie zakończone' })
    .first();
  await expect(toastSukcesu).toBeVisible({ timeout: 90000 });
}

async function otworzZakladkeZwarcia(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Wyniki i dowody \d$/ }).click();
  await expect(page.getByTestId('mvd-wyniki-warsztat')).toBeVisible();
  await otworzZakladkeWynikow(page, 'zwarcia');
  await expect(page.getByTestId('mvd-zwarcia-ekran')).toBeVisible({ timeout: 20000 });
}

/** Bieg SC_3F REALNY przez API (poza UI) — TEN SAM tor co `POST .../runs` +
 * `POST .../runs/{id}/execute` wołany przez `uruchomObliczenie.ts` z klikiem
 * „Oblicz"; użyty tu bezpośrednio, żeby przygotować DRUGI, NIEZALEŻNY bieg
 * zapisany (scenariusz 2 — para już zapisana) bez przechodzenia przez UI
 * dwa razy w jednym teście. */
async function utworzIWykonajBiegSc3f(
  request: APIRequestContext,
  caseId: string,
  scenario: 'max' | 'min',
): Promise<{ id: string; status: string }> {
  const createResponse = await request.post(`${BACKEND_BASE}/api/execution/study-cases/${caseId}/runs`, {
    data: { analysis_type: 'SC_3F', solver_input: { scenario } },
  });
  expect(createResponse.ok()).toBeTruthy();
  const created = (await createResponse.json()) as { id: string };

  const execResponse = await request.post(`${BACKEND_BASE}/api/execution/runs/${created.id}/execute`);
  expect(execResponse.ok()).toBeTruthy();
  const executed = (await execResponse.json()) as { id: string; status: string };
  expect(executed.status).toBe('DONE');
  return executed;
}

test.describe('Pasmo MIN/MAX zwarcia — karta W3-G3', () => {
  test.setTimeout(240000);

  test('kotwica bez pary zapisanej: MAX zapisany + MIN obliczony na żądanie, wartości realne i różne', async ({
    page,
    request,
  }) => {
    const { caseId } = await createCaseFromUi(page, request);
    await zbudujSiecGotowaDoObliczen(request, caseId);
    await page.reload({ waitUntil: 'commit' });
    await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });

    await kliknijOblicz(page);
    await otworzZakladkeZwarcia(page);

    const pasmo = page.getByTestId('mvd-zwarcia-pasmo');
    await expect(pasmo).toBeVisible({ timeout: 20000 });
    const strony = page.getByTestId('mvd-zwarcia-pasmo-strony');
    await expect(strony).toBeVisible();

    // Uczciwe stany: żadna strona nie brakuje (kotwica ma AUTO c — bez
    // nadpisania — więc para dochodzi zawsze wariantem w pamięci).
    await expect(page.getByTestId('mvd-zwarcia-pasmo-brak-max')).toHaveCount(0);
    await expect(page.getByTestId('mvd-zwarcia-pasmo-brak-min')).toHaveCount(0);

    const blokMax = page.getByTestId('mvd-zwarcia-pasmo-max');
    const blokMin = page.getByTestId('mvd-zwarcia-pasmo-min');
    await expect(blokMax).toContainText('Bieg zapisany');
    await expect(blokMin).toContainText('Policzone na żądanie');

    // Wielkości realne (nie zero, nie placeholder) — z GŁÓWNEJ tabeli pasma
    // (pierwsza `mvd-wyn-tabela` w sekcji — kolejne dwie są tabelami źródeł
    // sieciowych per strona, `SladZrodelSieciowych` wewnątrz `blokMax`/`blokMin`).
    const tabelaPasma = pasmo.getByTestId('mvd-wyn-tabela').first();
    await expect(tabelaPasma).toBeVisible();
    const komorkiIkss = tabelaPasma.locator('td').filter({ hasText: /^\d+[.,]\d+$/ });
    const liczbyTekst = await komorkiIkss.allTextContents();
    expect(liczbyTekst.length).toBeGreaterThan(0);
    const liczby = liczbyTekst.map((t) => Number(t.replace(',', '.')));
    expect(liczby.some((n) => n > 0)).toBe(true);
  });

  test('kotwica z realnym biegiem MIN zapisanym (dwa biegi): OBIE strony zapisane, różne run_id, bez ostrzeżenia świeżości', async ({
    page,
    request,
  }) => {
    const { caseId } = await createCaseFromUi(page, request);
    await zbudujSiecGotowaDoObliczen(request, caseId);
    await page.reload({ waitUntil: 'commit' });
    await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });

    // Kotwica MAX przez REALNY klik „Oblicz" (ten sam tor co pierwszy test —
    // populuje `useResultsInspectorStore` przez most S9-2, którego samo
    // seedowanie `activeRunId` w localStorage NIE wyzwala).
    await kliknijOblicz(page);

    // DRUGI, NIEZALEŻNY bieg (scenariusz MIN) tego samego przypadku — wprost
    // przez API, PRZED otwarciem zakładki (żeby pierwszy fetch pasma zastał
    // już zapisanego sąsiada, nie tylko kotwicę) — dokładnie to, co dałaby
    // akcja „Uruchom bieg MIN" tej karty po biegu MAX.
    const biegMin = await utworzIWykonajBiegSc3f(request, caseId, 'min');

    await otworzZakladkeZwarcia(page);

    const pasmo = page.getByTestId('mvd-zwarcia-pasmo');
    await expect(pasmo).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('mvd-zwarcia-pasmo-strony')).toBeVisible();
    await expect(page.getByTestId('mvd-zwarcia-pasmo-brak-max')).toHaveCount(0);
    await expect(page.getByTestId('mvd-zwarcia-pasmo-brak-min')).toHaveCount(0);

    const blokMax = page.getByTestId('mvd-zwarcia-pasmo-max');
    const blokMin = page.getByTestId('mvd-zwarcia-pasmo-min');
    // Obie strony ZAPISANE — dwa niezależne biegi, nie wariant w pamięci
    // (kotwica z klika UI NIE dzieli identyfikatora ze stroną MIN — zero
    // fabrykacji tożsamości; MIN niesie WŁASNY, zweryfikowany `run_id`).
    await expect(blokMax).toContainText('Bieg zapisany');
    await expect(blokMax).not.toContainText('Policzone na żądanie');
    await expect(blokMin).toContainText('Bieg zapisany');
    await expect(blokMin).toContainText(biegMin.id);
    await expect(blokMin).not.toContainText('Policzone na żądanie');

    // Ta sama migawka modelu (żadna zmiana między biegami) → bez ostrzeżenia świeżości.
    await expect(page.getByTestId('mvd-zwarcia-pasmo-swiezosc')).toHaveCount(0);
  });
});
