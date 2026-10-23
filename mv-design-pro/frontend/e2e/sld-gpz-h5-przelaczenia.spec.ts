/**
 * GPZ H5 — PRZEŁĄCZENIA NA ŻYWEJ APLIKACJI I SCALONYM BACKENDZIE (karta GPZ-H5-SLD etap 3 (d)).
 *
 * Tok pracy projektanta na REALNYM backendzie, klikami NATYWNYMI (zero syntetycznych
 * `dispatchEvent` — CLAUDE.md Zero-Debt pkt 5). W każdym kroku trzy prawdy muszą się zgadzać:
 * stan łącznika w modelu ENM (API) ↔ glif na schemacie (`data-switch-state`, ramka odstępstwa
 * od pozycji normalnej) ↔ stan łączników biegu (migawka biegu i `scenario_ref`).
 *
 * Test A — rezerwa transformatorowa JAWNA (TR2 rezerwowy; ENEA Zeszyt 1 §26.10.5):
 *  1. STAN NORMALNY: ŁS SN zamknięty, wyłącznik pola SN TR2 otwarty, ŁS 110 kV otwarty;
 *  2. ZMIANA ŁĄCZNIKA: prawy klik w ŁS SN → „Otwórz łącznik” → model bazowy `open`, glif
 *     otwarty z ramką odstępstwa; bieg rozpływu i zwarć: sekcja SN 2 jest wyspą bez źródła —
 *     na schemacie „bez napięcia” z przyczyną zamiast liczby (rozpływ), w wierszach wyniku
 *     zwarć znacznik `BEZ_NAPIECIA`;
 *  3. WARIANT AWARYJNY: scenariusz łączeniowy „wyłącznik pola SN TR2 zamknięty” (model bazowy
 *     bez zmian) — bieg rozpływu i zwarć 3F z `scenario_id`, `scenario_ref` biegu zgodny,
 *     widok biegu pokazuje stan łączników WARIANTU;
 *  4. WYNIK: prądy zwarciowe 3F na schemacie = liczby wyniku backendu (WN 1 13,12, WN 2 9,45,
 *     SN 1 8,91 z TR1, SN 2 8,60 kA z TR2) w prezentacji schematu (jedno miejsce po przecinku);
 *  5. POWRÓT: prawy klik w ŁS SN → „Zamknij łącznik” → stan normalny bez ramek odstępstwa.
 *
 * Test B — rezerwa transformatorowa UKRYTA (ŁS SN normalnie otwarty):
 *  1. zwarcia 3F stanu normalnego na schemacie (WN 13,12 / 9,45 kA, SN 8,91 / 8,60 kA);
 *  2. zwarcie 1F: WN 12,30 / 8,86 kA; na szynach SN — punkt neutralny SN nie ma drogi prądu
 *     zerowego (uzwojenie SN transformatora Yd11 w trójkącie, brak uziemienia) — na schemacie
 *     BEZ liczby; przyczyny maszynowej backend nie wystawia (meldunek: luka kontraktu);
 *  3. prawy klik w ŁS 110 kV → „Zamknij łącznik” → bieg odmówiony (409) z blokadą E067
 *     i akcją „model B”; ta sama blokada w panelu gotowości.
 *
 * Sieć powstaje operacją domenową `add_grid_source_sn` z ładunkiem H5 (ten sam kontrakt co
 * backendowy budowniczy `tests/reference_networks/gpz_h5.py`; dane L1/L2 to przykładowe
 * dane przypadku testowego, nie dane OSD), odbiory operacją `add_load_sn` (rozpływ bez
 * odbioru jest odmową gotowości).
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { wykonajBiegDoKonca } from './biegi';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const TRAFO_110_15 = 'tr-wn-sn-110-15-25mva-yd11';
const APARAT_SN_15 = 'sw-cb-abb-vd4-17kv-630a';
const OPIS_DANYCH = 'przykładowe dane przypadku testowego';
const WERSJA_KATALOGU = '2024.1';
/** Wiązanie katalogowe ładunku operacji — ta sama postać, którą wysyła kreator (catalog-first). */
const katalog = (namespace: string, itemId: string) => ({
  catalog_namespace: namespace,
  catalog_item_id: itemId,
  catalog_item_version: WERSJA_KATALOGU,
});
let opCounter = 0;

type Galaz = {
  ref_id: string;
  type?: string;
  name?: string;
  status?: string;
  normal_state?: string;
  from_bus_ref?: string;
  to_bus_ref?: string;
};
type Snapshot = {
  buses?: Array<{ ref_id: string; voltage_kv?: number }>;
  branches?: Galaz[];
  transformers?: Array<{ ref_id: string; name?: string; lv_bus_ref?: string; hv_bus_ref?: string }>;
  substations?: Array<{
    gpz_sections?: Array<{ bus_ref: string; order: number }>;
    gpz_hv_sections?: Array<{ bus_ref: string; order: number }>;
  }>;
};
type DomainOpResponse = { error?: string | null; snapshot?: Snapshot };

function torZasilania(linia: string, stacja: string, skMax: number, skMin: number) {
  return {
    supply: {
      line_name: linia,
      supplying_station_name: stacja,
      manual_equivalent: {
        hv_voltage_kv: 110.0,
        sk3_hv_mva: skMax,
        sk3_min_mva: skMin,
        rx_ratio: 0.1,
        rx_ratio_min: 0.1,
        z0_z1_ratio: 1.2,
      },
    },
  };
}

/**
 * Ładunek H5 110/15 kV, ŁS 110 kV normalnie otwarty. Rezerwa transformatorowa:
 *  - `hidden` — ŁS SN normalnie otwarty, każda sekcja SN z własnego transformatora;
 *  - `explicit` — TR2 rezerwowy: ŁS SN normalnie zamknięty, wyłącznik pola SN TR2
 *    normalnie otwarty (obie sekcje SN z TR1).
 */
function ladunekH5(rezerwa: 'hidden' | 'explicit') {
  return {
    voltage_kv: 15.0,
    source_name: 'GPZ H5 110/15 kV',
    sections_count: 2,
    gpz_sections: [
      { name: 'Sekcja SN A', line_fields_count: 1, function_bays: ['EARTHING', 'CAPACITOR', 'MEASUREMENT'] },
      { name: 'Sekcja SN B', line_fields_count: 1, function_bays: ['EARTHING', 'CAPACITOR', 'MEASUREMENT'] },
    ],
    hv_sections: [
      torZasilania('L1', `Stacja zasilająca A — ${OPIS_DANYCH}`, 2500, 1800),
      torZasilania('L2', `Stacja zasilająca B — ${OPIS_DANYCH}`, 1800, 1200),
    ],
    hv_coupler: { normal_state: 'open' },
    transformers: [
      { hv_section: 1, sn_section: 1, transformer_catalog_binding: katalog('TRAFO_SN_NN', TRAFO_110_15) },
      { hv_section: 2, sn_section: 2, transformer_catalog_binding: katalog('TRAFO_SN_NN', TRAFO_110_15) },
    ],
    sn_coupler: { cells: 2 },
    reserve_mode: rezerwa,
    ...(rezerwa === 'explicit'
      ? { reserve_transformer: 2, reserve_transformer_apparatus: { catalog_binding: katalog('APARAT_SN', APARAT_SN_15) } }
      : {}),
    gpz_line_field_apparatus: { catalog_binding: katalog('APARAT_SN', APARAT_SN_15) },
    hv_bay_apparatus_proposal: {
      basis: 'ENEA Operator, Zeszyt 1 „Stacje 110 kV” §11.1 (układ H5)',
      line: ['OSZ(U)', 'W', 'PIU', 'OL(U)', 'OGR'],
      transformer: ['OSZ(U)', 'W', 'PIU', 'OGR'],
      coupler: ['OS(U)', 'W', 'PIU', '(U)OS'],
    },
  };
}

async function operacja(
  request: APIRequestContext,
  caseId: string,
  name: string,
  payload: Record<string, unknown>,
): Promise<DomainOpResponse> {
  const response = await request.post(`${BACKEND_BASE}/api/cases/${caseId}/enm/domain-ops`, {
    data: {
      project_id: '',
      snapshot_base_hash: '',
      operation: { name, idempotency_key: `gpz-h5-przel-${name}-${String(++opCounter).padStart(4, '0')}`, payload },
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const body = (await response.json()) as DomainOpResponse;
  expect(body.error ?? null, `operacja ${name}`).toBeNull();
  return body;
}

async function pobierzEnm(request: APIRequestContext, caseId: string): Promise<Snapshot> {
  const response = await request.get(`${BACKEND_BASE}/api/cases/${caseId}/enm`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as Snapshot;
}

async function zalozMiejscePracy(request: APIRequestContext) {
  const suffix = Date.now().toString(36);
  const projectName = `GPZ H5 przełączenia ${suffix}`;
  const caseName = `Przypadek H5 ${suffix}`;
  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: { name: projectName, description: 'GPZ H5: przełączenia na schemacie', mode: 'TO-BE', voltage_level_kv: 15.0, frequency_hz: 50.0 },
  });
  expect(projectResponse.ok()).toBeTruthy();
  const project = (await projectResponse.json()) as { id: string };
  const caseResponse = await request.post(`${BACKEND_BASE}/api/study-cases`, {
    data: { project_id: project.id, name: caseName, description: '', config: {}, set_active: true },
  });
  expect(caseResponse.ok()).toBeTruthy();
  const studyCase = (await caseResponse.json()) as { id: string };
  return { projectId: project.id, projectName, caseId: studyCase.id, caseName };
}

/** Łączniki szyn GPZ z modelu: SN i 110 kV rozpoznane po napięciu szyn końców. */
function lacznikiSzyn(enm: Snapshot): { sn: Galaz; wn: Galaz } {
  const napiecie = new Map((enm.buses ?? []).map((b) => [b.ref_id, b.voltage_kv ?? 0]));
  const laczniki = (enm.branches ?? []).filter((b) => b.type === 'bus_coupler');
  const sn = laczniki.find((b) => (napiecie.get(b.from_bus_ref ?? '') ?? 0) < 60);
  const wn = laczniki.find((b) => (napiecie.get(b.from_bus_ref ?? '') ?? 0) >= 60);
  expect(sn, 'łącznik szyn SN w modelu').toBeDefined();
  expect(wn, 'łącznik szyn 110 kV w modelu').toBeDefined();
  return { sn: sn!, wn: wn! };
}

async function otworzSchemat(
  page: Page,
  seed: { projectId: string; projectName: string; caseId: string; caseName: string },
  hash: string,
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
          activeAnalysisType: 'LOAD_FLOW',
          caseManagerOpen: false,
          issuePanelOpen: false,
        },
        version: 1,
      }),
    );
  }, seed);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(`/${hash}`, { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
  await expect(page.getByTestId('sld-canvas-v3')).toBeVisible({ timeout: 60000 });
  await expect.poll(async () => page.locator('[data-hit-klasa]').count(), { timeout: 60000 }).toBeGreaterThan(0);
}

/** Glif łącznika na kanwie: węzeł z `data-owner-ref` (łącznik szyn) albo `data-device-ref`
 *  (aparat pola rysowany z gałęzi łączeniowej — właścicielem symbolu jest pole). */
function glifLacznika(page: Page, ref: string) {
  return page.locator(`g[data-owner-ref="${ref}"] [data-symbol-canon], g[data-device-ref="${ref}"] [data-symbol-canon]`).first();
}

async function oczekujStanu(page: Page, ref: string, stan: 'open' | 'closed', odstepstwo: boolean): Promise<void> {
  const glif = glifLacznika(page, ref);
  await expect(glif).toHaveAttribute('data-switch-state', stan, { timeout: 30000 });
  await expect(glif).toHaveAttribute('data-odstepstwo', String(odstepstwo));
  await expect(glif.locator('[data-ramka-odstepstwa="true"]')).toHaveCount(odstepstwo ? 1 : 0);
}

/** Natywny prawy klik w uchwyt trafienia łącznika → pozycja menu. */
async function przelaczZMenu(page: Page, ref: string, pozycja: 'Zamknij łącznik' | 'Otwórz łącznik'): Promise<void> {
  const uchwyt = page.locator(`[data-hit-owner-ref="${ref}"][data-hit-role="obrys"]`).first();
  await expect
    .poll(async () => ((await uchwyt.boundingBox().catch(() => null))?.width ?? 0), { timeout: 30000 })
    .toBeGreaterThan(0);
  const r = (await uchwyt.boundingBox())!;
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2, { button: 'right' });
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible({ timeout: 15000 });
  await menu.getByRole('menuitem', { name: pozycja }).click();
}

type WierszZwarcia = { element_id: string; ikss_ka: number | null; flags?: string[] };

/** Zasiew: projekt, przypadek, GPZ H5 i odbiór na każdej sekcji SN. */
async function zasiejGpz(request: APIRequestContext, rezerwa: 'hidden' | 'explicit') {
  const seed = await zalozMiejscePracy(request);
  await operacja(request, seed.caseId, 'add_grid_source_sn', ladunekH5(rezerwa) as unknown as Record<string, unknown>);
  const przed = await pobierzEnm(request, seed.caseId);
  const gpz = (przed.substations ?? []).find((s) => (s.gpz_hv_sections ?? []).length === 2);
  expect(gpz, 'stacja GPZ H5 w modelu').toBeDefined();
  const sn = [...(gpz!.gpz_sections ?? [])].sort((a, b) => a.order - b.order).map((s) => s.bus_ref);
  const wn = [...(gpz!.gpz_hv_sections ?? [])].sort((a, b) => a.order - b.order).map((s) => s.bus_ref);
  expect(sn).toHaveLength(2);
  expect(wn).toHaveLength(2);
  const odbiory: Array<[string, number, number]> = [
    [sn[0], 6.0, 2.0],
    [sn[1], 4.0, 1.5],
  ];
  for (const [i, [bus, p, q]] of odbiory.entries()) {
    await operacja(request, seed.caseId, 'add_load_sn', { bus_ref: bus, p_mw: p, q_mvar: q, load_name: `Odbiór sekcji SN ${i + 1}` });
  }
  const enm = await pobierzEnm(request, seed.caseId);
  return { seed, enm, szynySn: sn, szynyWn: wn, ...lacznikiSzyn(enm) };
}

/** Bieg (opcjonalnie ze scenariuszem) do DONE; zwraca identyfikator. */
async function biegDoKonca(request: APIRequestContext, caseId: string, analiza: 'LOAD_FLOW' | 'SC_3F' | 'SC_1F', scenarioId?: string) {
  const bieg = await request.post(`${BACKEND_BASE}/api/execution/study-cases/${caseId}/runs`, {
    data: { analysis_type: analiza, ...(scenarioId ? { scenario_id: scenarioId } : {}) },
  });
  expect(bieg.ok(), await bieg.text()).toBeTruthy();
  const { id } = (await bieg.json()) as { id: string };
  await wykonajBiegDoKonca(request, BACKEND_BASE, id);
  return id;
}

async function wierszeZwarcia(request: APIRequestContext, runId: string): Promise<WierszZwarcia[]> {
  const odp = await request.get(`${BACKEND_BASE}/api/analysis-runs/${runId}/results/short-circuit`);
  expect(odp.ok(), await odp.text()).toBeTruthy();
  return ((await odp.json()) as { rows: WierszZwarcia[] }).rows;
}

/** Stan łącznika w migawce biegu (model z zastosowanym scenariuszem). */
async function stanWBiegu(request: APIRequestContext, runId: string, ref: string): Promise<string | undefined> {
  const odp = await request.get(`${BACKEND_BASE}/api/analysis-runs/${runId}/snapshot`);
  expect(odp.ok(), await odp.text()).toBeTruthy();
  const { snapshot } = (await odp.json()) as { snapshot: Snapshot };
  return snapshot.branches?.find((b) => b.ref_id === ref)?.status;
}

/** Linie etykiety wyniku przypiętej do punktu `ref` (pusta lista = punkt bez etykiety). */
async function linieWyniku(page: Page, ref: string): Promise<string[]> {
  return page
    .locator(`g[data-testid^="sld-v3-result-label-"][data-result-ref="${ref}"] text`)
    .evaluateAll((els) => els.map((e) => e.textContent ?? ''));
}

async function oczekujPierwszejLinii(page: Page, ref: string, tekst: string | RegExp): Promise<void> {
  await expect.poll(async () => (await linieWyniku(page, ref))[0] ?? '', { timeout: 60000 }).toMatch(tekst);
}

/** Prezentacja prądu zwarciowego na schemacie (`formatMagnitudeKa`: jedno miejsce po przecinku). */
function naSchemacie(ka: number): string {
  return `Ik″ ${ka.toFixed(1).replace('.', ',')} kA`;
}

/** Liczba z wiersza wyniku zwarć backendu dla szyny (wartość referencyjna pomiaru SC-01). */
function ikss(wiersze: WierszZwarcia[], bus: string): number | null {
  const w = wiersze.find((r) => r.element_id === bus);
  expect(w, `wiersz zwarcia ${bus}`).toBeDefined();
  return w!.ikss_ka;
}

test.describe('GPZ H5 — przełączenia, wariant awaryjny i wyniki na schemacie (scalony backend)', () => {
  test('rezerwa jawna: normalny → ŁS SN otwarty (sekcja bez napięcia) → wariant awaryjny TR2 → wynik → powrót', async ({ page, request }) => {
    test.setTimeout(420000);
    const { seed, enm, szynySn, szynyWn, sn, wn } = await zasiejGpz(request, 'explicit');
    const wylTr2 = (enm.branches ?? []).find((b) => b.ref_id.endsWith('/transformer/002/breaker_sn'));
    expect(wylTr2, 'wyłącznik pola SN transformatora rezerwowego').toBeDefined();
    const tr2 = wylTr2!.ref_id;
    // (1) Stan normalny w modelu i na schemacie.
    expect([sn.normal_state, sn.status]).toEqual(['closed', 'closed']);
    expect([wylTr2!.normal_state, wylTr2!.status]).toEqual(['open', 'open']);
    expect([wn.normal_state, wn.status]).toEqual(['open', 'open']);
    await otworzSchemat(page, seed, '#sld');
    await page.getByTestId('sld-v3-fit-view').click();
    await oczekujStanu(page, sn.ref_id, 'closed', false);
    await oczekujStanu(page, tr2, 'open', false);
    await oczekujStanu(page, wn.ref_id, 'open', false);

    // (2) Zmiana łącznika z menu kanwy: ŁS SN otwarty w modelu bazowym.
    await przelaczZMenu(page, sn.ref_id, 'Otwórz łącznik');
    await expect
      .poll(async () => (await pobierzEnm(request, seed.caseId)).branches?.find((b) => b.ref_id === sn.ref_id)?.status, { timeout: 30000 })
      .toBe('open');
    await oczekujStanu(page, sn.ref_id, 'open', true);
    await oczekujStanu(page, tr2, 'open', false);
    const rozplywOdciety = await biegDoKonca(request, seed.caseId, 'LOAD_FLOW');
    const zwarcieOdciete = await biegDoKonca(request, seed.caseId, 'SC_3F');
    const wierszeOdciete = await wierszeZwarcia(request, zwarcieOdciete);
    expect(ikss(wierszeOdciete, szynySn[1])).toBeNull();
    expect(wierszeOdciete.find((r) => r.element_id === szynySn[1])?.flags).toContain('BEZ_NAPIECIA');
    await otworzSchemat(page, seed, `#sld?run=${rozplywOdciety}`);
    await page.getByTestId('sld-v3-fit-view').click();
    await oczekujPierwszejLinii(page, szynySn[1], /^bez napięcia$/);
    await oczekujPierwszejLinii(page, szynySn[0], /^U /);
    await oczekujStanu(page, sn.ref_id, 'open', true);

    // (3) Wariant awaryjny: scenariusz zamyka wyłącznik pola SN TR2 (model bazowy bez zmian).
    const zapis = await request.post(`${BACKEND_BASE}/api/scenariusze-laczeniowe/study-cases/${seed.caseId}`, {
      data: { name: 'Wariant awaryjny — sekcja SN 2 z TR2', switch_states: { [tr2]: 'closed' } },
    });
    expect(zapis.ok(), await zapis.text()).toBeTruthy();
    const { scenario_id: scenarioId } = (await zapis.json()) as { scenario_id: string };
    const rozplywAw = await biegDoKonca(request, seed.caseId, 'LOAD_FLOW', scenarioId);
    const zwarcieAw = await biegDoKonca(request, seed.caseId, 'SC_3F', scenarioId);
    for (const runId of [rozplywAw, zwarcieAw]) {
      const stan = await request.get(`${BACKEND_BASE}/api/execution/runs/${runId}`);
      expect(((await stan.json()) as { scenario_ref?: { scenario_id?: string } }).scenario_ref?.scenario_id).toBe(scenarioId);
      expect(await stanWBiegu(request, runId, tr2)).toBe('closed');
      expect(await stanWBiegu(request, runId, sn.ref_id)).toBe('open');
    }
    expect((await pobierzEnm(request, seed.caseId)).branches?.find((b) => b.ref_id === tr2)?.status).toBe('open');

    // (4) Wynik wariantu na schemacie: stan łączników wariantu i liczby backendu.
    const wierszeAw = await wierszeZwarcia(request, zwarcieAw);
    const oczekiwane: Array<[string, number]> = [
      [szynyWn[0], 13.1216],
      [szynyWn[1], 9.4475],
      [szynySn[0], 8.9079],
      [szynySn[1], 8.5988],
    ];
    for (const [bus, ref] of oczekiwane) expect(ikss(wierszeAw, bus)).toBeCloseTo(ref, 3);
    await otworzSchemat(page, seed, `#sld?run=${zwarcieAw}`);
    await page.getByTestId('sld-v3-fit-view').click();
    await expect(page.getByTestId('sld-v3-tabliczka-wyniku')).toContainText(zwarcieAw);
    await oczekujStanu(page, tr2, 'closed', true);
    await oczekujStanu(page, sn.ref_id, 'open', true);
    for (const [bus] of oczekiwane) await oczekujPierwszejLinii(page, bus, naSchemacie(ikss(wierszeAw, bus)!));
    await otworzSchemat(page, seed, `#sld?run=${rozplywAw}`);
    await page.getByTestId('sld-v3-fit-view').click();
    await oczekujPierwszejLinii(page, szynySn[1], /^U /);

    // (5) Powrót do stanu normalnego z menu kanwy (widok modelu).
    await otworzSchemat(page, seed, '#sld');
    await page.getByTestId('sld-v3-fit-view').click();
    await przelaczZMenu(page, sn.ref_id, 'Zamknij łącznik');
    await expect
      .poll(async () => (await pobierzEnm(request, seed.caseId)).branches?.find((b) => b.ref_id === sn.ref_id)?.status, { timeout: 30000 })
      .toBe('closed');
    await oczekujStanu(page, sn.ref_id, 'closed', false);
    await oczekujStanu(page, tr2, 'open', false);
    await oczekujStanu(page, wn.ref_id, 'open', false);
  });

  test('rezerwa ukryta: zwarcia 3F i 1F na schemacie; zamknięty ŁS 110 kV → odmowa E067 z akcją „model B”', async ({ page, request }) => {
    test.setTimeout(420000);
    const { seed, szynySn, szynyWn, sn, wn } = await zasiejGpz(request, 'hidden');
    expect([sn.normal_state, sn.status, wn.normal_state, wn.status]).toEqual(['open', 'open', 'open', 'open']);

    // (1) Zwarcia 3F stanu normalnego (SC-01).
    const zw3 = await biegDoKonca(request, seed.caseId, 'SC_3F');
    const w3 = await wierszeZwarcia(request, zw3);
    const oczekiwane3: Array<[string, number]> = [
      [szynyWn[0], 13.1216],
      [szynyWn[1], 9.4475],
      [szynySn[0], 8.9079],
      [szynySn[1], 8.5988],
    ];
    for (const [bus, ref] of oczekiwane3) expect(ikss(w3, bus)).toBeCloseTo(ref, 3);
    await otworzSchemat(page, seed, `#sld?run=${zw3}`);
    await page.getByTestId('sld-v3-fit-view').click();
    await oczekujStanu(page, sn.ref_id, 'open', false);
    for (const [bus] of oczekiwane3) await oczekujPierwszejLinii(page, bus, naSchemacie(ikss(w3, bus)!));

    // (2) Zwarcie 1F: WN z liczbą, SN bez drogi prądu zerowego — bez liczby na schemacie.
    const zw1 = await biegDoKonca(request, seed.caseId, 'SC_1F');
    const w1 = await wierszeZwarcia(request, zw1);
    expect(ikss(w1, szynyWn[0])).toBeCloseTo(12.3015, 3);
    expect(ikss(w1, szynyWn[1])).toBeCloseTo(8.8571, 3);
    for (const bus of szynySn) expect(ikss(w1, bus)).toBeNull();
    await otworzSchemat(page, seed, `#sld?run=${zw1}`);
    await page.getByTestId('sld-v3-fit-view').click();
    await oczekujPierwszejLinii(page, szynyWn[0], /12,3 kA$/);
    await oczekujPierwszejLinii(page, szynyWn[1], /8,9 kA$/);
    for (const bus of szynySn) {
      expect((await linieWyniku(page, bus)).join(' '), `szyna SN ${bus} bez liczby 1F`).not.toMatch(/\d kA/);
    }

    // (3) ŁS 110 kV zamknięty z menu kanwy → blokada E067 i odmowa biegu.
    await otworzSchemat(page, seed, '#sld');
    await page.getByTestId('sld-v3-fit-view').click();
    await przelaczZMenu(page, wn.ref_id, 'Zamknij łącznik');
    await expect
      .poll(async () => (await pobierzEnm(request, seed.caseId)).branches?.find((b) => b.ref_id === wn.ref_id)?.status, { timeout: 30000 })
      .toBe('closed');
    await oczekujStanu(page, wn.ref_id, 'closed', true);
    const odmowa = await request.post(`${BACKEND_BASE}/api/execution/study-cases/${seed.caseId}/runs`, {
      data: { analysis_type: 'LOAD_FLOW' },
    });
    expect(odmowa.status()).toBe(409);
    const tresc = ((await odmowa.json()) as { detail: string }).detail;
    expect(tresc).toContain('łącznik szyn 110 kV');
    expect(tresc).toContain('model B');
    await page.getByRole('button', { name: /^Gotowość \d$/ }).click();
    await expect(page.getByTestId('mvd-gotowosc-panel')).toBeVisible({ timeout: 20000 });
    // Wiersz blokady: kod gotowości w dymku (`title`), opis z akcją „model B”, element z modelu.
    const wiersz = page.getByTestId('mvd-gotowosc-panel').getByTitle('E067', { exact: true });
    await expect(wiersz).toBeVisible({ timeout: 20000 });
    await expect(wiersz).toContainText('model B');
    await expect(wiersz).toContainText('Łącznik szyn 110 kV');
  });
});
