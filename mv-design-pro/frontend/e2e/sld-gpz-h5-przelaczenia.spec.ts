/**
 * GPZ H5 — PRZEŁĄCZENIA NA ŻYWEJ APLIKACJI (karta GPZ-H5-SLD etap 2, wymaganie 4 i 6).
 *
 * Tok pracy dyspozytora/projektanta na REALNYM backendzie, klikami NATYWNYMI (zero
 * syntetycznych `dispatchEvent` — CLAUDE.md Zero-Debt pkt 5):
 *  1. STAN NORMALNY: GPZ H5 (L1/L2 → sekcje 110 kV z ŁS 110 kV → TR1/TR2 → sekcje SN A|B
 *     z ŁS SN) — oba łączniki szyn otwarte geometrią noża (przerwa w osi toru), bez ramki
 *     odstępstwa, bez znacznika punktu podziału (łącznik szyn nie jest punktem podziału);
 *  2. ZMIANA ŁĄCZNIKA: prawy klik w ŁS SN → „Zamknij łącznik" → model bazowy (API) ma
 *     `status = closed`, glif zamknięty, ramka odstępstwa od pozycji normalnej;
 *  3. WARIANT AWARYJNY: scenariusz łączeniowy (rezerwa ukryta, ENEA §26.10.5 — sekcja A
 *     zasilana przez ŁS SN; łącznik pola TR1 po stronie SN otwarty, gdy model go niesie)
 *     zapisany końcówką scenariuszy łączeniowych, bieg rozpływu z `scenario_id`;
 *  4. WYNIK: schemat z biegiem — tabliczka pochodzenia w widoku, rozłączna z etykietami
 *     schematu, liczby wyników na rysunku;
 *  5. POWRÓT: prawy klik w ŁS SN → „Otwórz łącznik" → stan normalny (bez ramki).
 *
 * Sieć powstaje operacją domenową `add_grid_source_sn` z ładunkiem H5 (ten sam kontrakt co
 * backendowy budowniczy `tests/reference_networks/gpz_h5.py`; dane L1/L2 to przykładowe
 * dane przypadku testowego, nie dane OSD).
 *
 * Spec czeka na scalenie backendu karty GPZ-H5 (kontrakt `hv_sections`/`hv_coupler`/
 * `transformers`/`sn_coupler`/`reserve_mode`) — na bazie bez tego kontraktu operacja
 * zasiewu jest odmową i spec czerwienieje na pierwszym kroku (jawnie, bez pominięcia).
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { wykonajBiegDoKonca } from './biegi';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const TRAFO_110_15 = 'tr-wn-sn-110-15-25mva-yd11';
const APARAT_SN_15 = 'sw-cb-abb-vd4-17kv-630a';
const OPIS_DANYCH = 'przykładowe dane przypadku testowego';
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

/** Ładunek H5 110/15 kV, rezerwa ukryta (ŁS SN normalnie otwarty), ŁS 110 kV otwarty. */
const LADUNEK_H5 = {
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
    { hv_section: 1, sn_section: 1, transformer_catalog_ref: TRAFO_110_15 },
    { hv_section: 2, sn_section: 2, transformer_catalog_ref: TRAFO_110_15 },
  ],
  sn_coupler: { cells: 2 },
  reserve_mode: 'hidden',
  gpz_line_field_apparatus: { catalog_ref: APARAT_SN_15 },
  hv_bay_apparatus_proposal: {
    basis: 'ENEA Operator, Zeszyt 1 „Stacje 110 kV” §11.1 (układ H5)',
    line: ['OSZ(U)', 'W', 'PIU', 'OL(U)', 'OGR'],
    transformer: ['OSZ(U)', 'W', 'PIU', 'OGR'],
    coupler: ['OS(U)', 'W', 'PIU', '(U)OS'],
  },
};

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

/** Glif łącznika na kanwie (węzeł z `data-owner-ref` i kanonem symbolu). */
function glifLacznika(page: Page, ref: string) {
  return page.locator(`g[data-owner-ref="${ref}"] [data-symbol-canon]`).first();
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

test.describe('GPZ H5 — stan normalny → zmiana łącznika → wariant awaryjny → wynik → powrót', () => {
  test('przełączenia ŁS SN na schemacie i bieg wariantu awaryjnego', async ({ page, request }) => {
    test.setTimeout(300000);
    const seed = await zalozMiejscePracy(request);
    await operacja(request, seed.caseId, 'add_grid_source_sn', LADUNEK_H5 as unknown as Record<string, unknown>);
    const enm = await pobierzEnm(request, seed.caseId);
    const { sn, wn } = lacznikiSzyn(enm);
    expect([sn.normal_state, sn.status, wn.normal_state, wn.status]).toEqual(['open', 'open', 'open', 'open']);

    // (1) Stan normalny.
    await otworzSchemat(page, seed, '#sld');
    await page.getByTestId('sld-v3-fit-view').click();
    await oczekujStanu(page, sn.ref_id, 'open', false);
    await oczekujStanu(page, wn.ref_id, 'open', false);
    await expect(page.locator('[data-symbol-canon="noPoint"]')).toHaveCount(0);

    // (2) Zmiana łącznika z menu kanwy — model bazowy i rysunek.
    await przelaczZMenu(page, sn.ref_id, 'Zamknij łącznik');
    await expect
      .poll(async () => (await pobierzEnm(request, seed.caseId)).branches?.find((b) => b.ref_id === sn.ref_id)?.status, { timeout: 30000 })
      .toBe('closed');
    await oczekujStanu(page, sn.ref_id, 'closed', true);
    await oczekujStanu(page, wn.ref_id, 'open', false);

    // (3) Wariant awaryjny: scenariusz łączeniowy (model bazowy bez zmian).
    const tr1 = (enm.transformers ?? [])[0];
    const typyLacznikow = new Set(['switch', 'breaker', 'disconnector', 'load_switch']);
    const lacznikPolaTr1 = (enm.branches ?? []).find(
      (b) => typyLacznikow.has(b.type ?? '') && tr1 && (b.from_bus_ref === tr1.lv_bus_ref || b.to_bus_ref === tr1.lv_bus_ref),
    );
    const stany: Record<string, 'open' | 'closed'> = { [sn.ref_id]: 'closed' };
    if (lacznikPolaTr1) stany[lacznikPolaTr1.ref_id] = 'open';
    const zapis = await request.post(`${BACKEND_BASE}/api/scenariusze-laczeniowe/study-cases/${seed.caseId}`, {
      data: { name: 'Wariant awaryjny — sekcja A przez ŁS SN', switch_states: stany },
    });
    expect(zapis.ok(), await zapis.text()).toBeTruthy();
    const { scenario_id: scenarioId } = (await zapis.json()) as { scenario_id: string };
    const bieg = await request.post(`${BACKEND_BASE}/api/execution/study-cases/${seed.caseId}/runs`, {
      data: { analysis_type: 'LOAD_FLOW', scenario_id: scenarioId },
    });
    expect(bieg.ok(), await bieg.text()).toBeTruthy();
    const { id: runId } = (await bieg.json()) as { id: string };
    await wykonajBiegDoKonca(request, BACKEND_BASE, runId);

    // (4) Wynik na schemacie: tabliczka pochodzenia w widoku, rozłączna z etykietami.
    await otworzSchemat(page, seed, `#sld?run=${runId}`);
    await page.getByTestId('sld-v3-fit-view').click();
    const plyta = page.getByTestId('sld-v3-tabliczka-wyniku-plyta');
    await expect(plyta).toBeVisible({ timeout: 60000 });
    await expect(page.getByTestId('sld-v3-tabliczka-wyniku')).toContainText(runId);
    await expect
      .poll(async () => page.locator('[data-testid^="sld-v3-result-label-"]').count(), { timeout: 30000 })
      .toBeGreaterThan(0);
    const rPlyty = (await plyta.boundingBox())!;
    const kanwa = (await page.getByTestId('sld-canvas-v3').boundingBox())!;
    expect(rPlyty.x).toBeGreaterThanOrEqual(kanwa.x - 0.5);
    expect(rPlyty.y + rPlyty.height).toBeLessThanOrEqual(kanwa.y + kanwa.height + 0.5);
    const etykiety = await page.locator('g[data-testid^="sld-v3-label-"] text').evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return { t: e.textContent ?? '', x: r.x, y: r.y, w: r.width, h: r.height };
      }),
    );
    const naPlycie = etykiety.filter(
      (e) => e.x < rPlyty.x + rPlyty.width && e.x + e.w > rPlyty.x && e.y < rPlyty.y + rPlyty.height && e.y + e.h > rPlyty.y,
    );
    expect(naPlycie.map((e) => e.t), 'tabliczka nie przykrywa etykiet schematu').toEqual([]);

    // (5) Powrót do stanu normalnego z menu kanwy.
    await przelaczZMenu(page, sn.ref_id, 'Otwórz łącznik');
    await expect
      .poll(async () => (await pobierzEnm(request, seed.caseId)).branches?.find((b) => b.ref_id === sn.ref_id)?.status, { timeout: 30000 })
      .toBe('open');
    await oczekujStanu(page, sn.ref_id, 'open', false);
    await oczekujStanu(page, wn.ref_id, 'open', false);
  });
});
