/**
 * E2E real-backend — legenda symboli „na żądanie" (K12, KARTA_K12, dyrektywa
 * właściciela 2026-07-30).
 *
 * Legenda symboli NIE może być stałą treścią schematu — zabiera miejsce,
 * jest cięższa wizualnie niż sama sieć, pokazuje symbole nieobecne w
 * projekcie. Wywoływana z przycisku w doku widoku kanwy (`sld-v3-view-dock`),
 * treść panelu liczona z FAKTYCZNIE narysowanej sceny (zero fabrykacji).
 *
 * Bramka 1 karty:
 *  (a) po otwarciu schematu legenda NIE jest widoczna na kanwie,
 *  (b) przycisk legendy otwiera panel; panel zawiera WYŁĄCZNIE symbole
 *      obecne w projekcie (asercja: brak wpisu dla symbolu nieobecnego —
 *      sieć TEGO testu nie ma agregatu 0,4 kV, więc „Odbiór (zagregowany)"
 *      nie może się pojawić),
 *  (c) zamknięcie panelu przywraca kanwę (legenda znika z DOM).
 *
 * Sieć testowa: TA SAMA sekwencja domain-ops co `critical-run-flow.spec.ts`
 * (źródło SN → magistrala → stacja SN/nN z transformatorem, BEZ kroku
 * dodania odbioru/Load) — celowo BEZ agregatu, żeby bramka (b) miała realny
 * negatyw do sprawdzenia (nie tylko pozytyw „to, co dodaliśmy, się pokazuje").
 *
 * Uruchomienie (WYŁĄCZNIE tak — patrz CLAUDE.md/karta):
 *   cd mv-design-pro/frontend && node ./scripts/playwright-run.mjs \
 *     e2e/legenda-na-zadanie.spec.ts
 */

import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

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

function buildCatalogBinding(catalogNamespace: string, catalogItemId: string) {
  return {
    catalog_namespace: catalogNamespace,
    catalog_item_id: catalogItemId,
    catalog_item_version: CATALOG_VERSION,
  };
}

type DomainOpResponse = {
  error?: string | null;
  snapshot?: {
    corridors?: Array<{ ordered_segment_refs?: string[] }>;
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
        idempotency_key: `e2e-legenda-${name}-${String(++opCounter).padStart(4, '0')}`,
        payload,
      },
    },
    // Domyślne 10 s Playwrighta bywa za krótkie pod obciążeniem współdzielonej
    // maszyny (wiele równoległych sesji agentów) — `insert_station_on_segment_sn`
    // (tworzenie transformatora + rozwiązanie katalogu) bywa cięższe niż
    // `add_grid_source_sn`/`continue_trunk_segment_sn`, zmierzone w tej sesji.
    timeout: 30000,
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
  const projectName = `E2E Legenda ${suffix}`;
  const caseName = `Przypadek legenda ${suffix}`;

  // Timeout hojny (nie domyślne 10 s Playwrighta) — patrz komentarz w
  // `executeDomainOp`: maszyna współdzielona z innymi sesjami/testami bywa
  // obciążona, backend odpowiada wolniej niż w izolowanym CI.
  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Test legendy na zadanie (K12)',
      mode: 'TO-BE',
      voltage_level_kv: 15.0,
      frequency_hz: 50.0,
    },
    timeout: 30000,
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
    timeout: 30000,
  });
  expect(caseResponse.ok()).toBeTruthy();
  const studyCase = (await caseResponse.json()) as { id: string };

  return { projectId: project.id, projectName, caseId: studyCase.id, caseName };
}

/** Sieć BEZ agregatu 0,4 kV: źródło SN → magistrala (1 odcinek) → stacja
 *  SN/nN z transformatorem. Żaden krok NIE dodaje `Load` — `loadArrow`
 *  ("Odbiór (zagregowany)") nie ma prawa pojawić się na scenie ani w legendzie. */
async function buildNetworkWithoutAggregateLoad(request: APIRequestContext, caseId: string): Promise<void> {
  await executeDomainOp(request, caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: buildCatalogBinding('ZRODLO_SN', SOURCE_ID),
  });

  const op = await executeDomainOp(request, caseId, 'continue_trunk_segment_sn', {
    segment: {
      rodzaj: 'KABEL',
      dlugosc_m: 250,
      name: 'Odcinek 1',
      catalog_binding: buildCatalogBinding('KABEL_SN', CABLE_ID),
    },
  });
  const segmentRefs = op.snapshot?.corridors?.[0]?.ordered_segment_refs ?? [];
  expect(segmentRefs.length).toBeGreaterThan(0);

  await executeDomainOp(request, caseId, 'insert_station_on_segment_sn', {
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
}

async function openSldWithActiveCase(
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
          activeAnalysisType: 'SHORT_CIRCUIT',
          caseManagerOpen: false,
          issuePanelOpen: false,
        },
        version: 1,
      }),
    );
  }, seed);

  await page.goto('/#sld', { waitUntil: 'commit' });
  // Timeout hojny (nie 30000 jak w innych specach): PIERWSZA nawigacja po
  // starcie webServera (`reuseExistingServer` startuje serwer OD ZERA, gdy
  // porty 8000/5173 są wolne) trafia na zimną kompilację Vite ogromnego
  // drzewa modułów aplikacji — zmierzone w tej sesji: pierwsza nawigacja w
  // pliku potrafi przekroczyć 30 s mimo w pełni poprawnego renderu (dowód:
  // zrzut DOM z nieudanego biegu pokazywał kompletnie zrenderowaną aplikację
  // z kanwą SLD). Kolejne nawigacje w TYM SAMYM biegu korzystają z ciepłego
  // cache transformacji Vite.
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 60000 });
  await expect(page.getByTestId('sld-canvas-v3')).toBeVisible({ timeout: 30000 });
}

test.describe('Legenda symboli na żądanie (K12)', () => {
  test.setTimeout(120000);

  test('(a) po otwarciu schematu legenda NIE jest widoczna na kanwie', async ({ page, request }) => {
    const seed = await createProjectAndCase(request);
    await buildNetworkWithoutAggregateLoad(request, seed.caseId);
    await openSldWithActiveCase(page, seed);

    await expect(page.getByTestId('sld-sheet-legend')).toHaveCount(0);
    // Dok istnieje (przycisk „na żądanie" jest jawnym, widocznym wejściem,
    // nie ukrytym skrótem) — panel jeszcze zamknięty.
    await expect(page.getByTestId('sld-v3-view-dock')).toBeVisible();
    await expect(page.getByTestId('sld-v3-legend-toggle')).toBeVisible();
    await expect(page.getByTestId('sld-v3-legend-panel')).toHaveCount(0);
  });

  test('(b) przycisk legendy otwiera panel z WYŁĄCZNIE symbolami obecnymi w projekcie (brak agregatu ⇒ brak wpisu)', async ({
    page,
    request,
  }) => {
    const seed = await createProjectAndCase(request);
    await buildNetworkWithoutAggregateLoad(request, seed.caseId);
    await openSldWithActiveCase(page, seed);

    // Klik NATYWNY Playwright (nie syntetyczny dispatchEvent) — dyrektywa
    // Zero-Debt pkt 5: nowy test interakcji zaczyna od ścieżki natywnej.
    await page.getByTestId('sld-v3-legend-toggle').click();

    const panel = page.getByTestId('sld-v3-legend-panel');
    await expect(panel).toBeVisible();

    // Pozytyw: transformator ISTNIEJE w sieci (krok `insert_station_on_segment_sn`
    // z `transformer.create=true`) — legenda MUSI go objaśnić.
    await expect(panel.getByTestId('sld-v3-legend-panel-item-transformer2W')).toBeVisible();
    await expect(panel.getByTestId('sld-v3-legend-panel-item-gridSource')).toBeVisible();

    // Negatyw (zero fabrykacji, §0.3 karty): sieć NIE ma agregatu 0,4 kV —
    // "Odbiór (zagregowany)" nie może być wpisem legendy tego projektu.
    await expect(panel.getByTestId('sld-v3-legend-panel-item-loadArrow')).toHaveCount(0);
    await expect(panel).not.toContainText('zagregowany');

    // "Linia napowietrzna" nigdy nie jest wpisem (v3 nie renderuje tego stylu
    // linii — zero fabrykacji rozciągnięte na linie, patrz `projectLegend.ts`).
    await expect(panel.getByTestId('sld-v3-legend-panel-item-overhead')).toHaveCount(0);
  });

  test('(c) zamknięcie panelu przywraca kanwę bez legendy', async ({ page, request }) => {
    const seed = await createProjectAndCase(request);
    await buildNetworkWithoutAggregateLoad(request, seed.caseId);
    await openSldWithActiveCase(page, seed);

    const toggle = page.getByTestId('sld-v3-legend-toggle');
    await toggle.click();
    await expect(page.getByTestId('sld-v3-legend-panel')).toBeVisible();

    await toggle.click();
    await expect(page.getByTestId('sld-v3-legend-panel')).toHaveCount(0);
    await expect(page.getByTestId('sld-sheet-legend')).toHaveCount(0);
  });
});
