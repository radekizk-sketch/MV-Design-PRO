/**
 * KARTA S9-13 — PORÓWNANIE A/B Z KANWY (audyt W-8) — ŻYWY BACKEND.
 *
 * DOWODZONA ŚCIEŻKA (dotąd niemożliwa — sonda W-8: elementy porównawcze panelu
 * puste po biegu, wejście w różnice wyłącznie przez ekran porównań):
 *  1. dwa realne biegi SC_3F na modelach różniących się długością odcinka
 *     (żeby delty nie były zerowe),
 *  2. schemat z wynikiem biegu B → dok „Warstwy" → sekcja „Porównanie A/B" →
 *     wybór przebiegu A z listy UKOŃCZONYCH biegów tego samego rodzaju
 *     i przypadku → „Pokaż różnice",
 *  3. nakładka delta NA RYSUNKU (etykiety „Δ Ik″" + wartość B z kontraktu
 *     1.3.0) + podsumowanie pary w panelu,
 *  4. stan ZABLOKOWANY z uczciwym powodem, gdy drugiego biegu jeszcze nie ma
 *     (mierzony PRZED drugim biegiem — dokładnie scenariusz sondy W-8).
 *
 * Ten spec jest zarazem SKRYPTEM RENDERUJĄCYM zrzuty dowodowe karty:
 * `docs/sld/audyt-2026-08/s9-13-*.png` (nakładka delta w OBU motywach na L2 +
 * stan zablokowany). Motyw przełączany REALNYM przyciskiem powłoki (metoda
 * audytu §1 — zasiew localStorage nie przechodzi rehydracji persist), LOD
 * podnoszony NATYWNYM kółkiem myszy (bez wymuszania stanu).
 *
 * Uruchomienie (cwd: mv-design-pro/frontend, backend na :8000):
 *   node ./scripts/playwright-run-real.mjs e2e/s913-porownanie-z-kanwy.spec.ts
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';


/** Odczyt gotowosci inzynierskiej przypadku (`GET /api/cases/{id}/engineering-readiness`).
 *  POPRAWKA 2026-08-08 (karta TYPY-POZA-BRAMKA): rzutowanie `as typeof readiness`
 *  celowalo w typ ZAWEZONY do `null` (zmienna byla dopiero co zainicjowana `null`),
 *  wiec odpowiedz backendu wchodzila do testu jako `null`, a caly ponizszy blok
 *  domykania blokerow byl NIETYPOWANY (`issues` na `never`, argumenty `filter` na
 *  implicit any). Typ nazwany jednym bytem usuwa i rzutowanie w ciemno, i 6 bledow. */
type OdczytGotowosci = {
  ready: boolean;
  issues?: Array<{ code: string; element_ref?: string | null }>;
};

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const CABLE_ID = 'cable-tfk-yakxs-3x120';
const TRAFO_ID = 'tr-sn-nn-15-04-630kva-dyn11';
const SOURCE_ID = 'src-gpz-15kv-250mva-rx010';
const CATALOG_VERSION = '2024.1';
const HERE = dirname(fileURLToPath(import.meta.url));
const KATALOG_ZRZUTOW = resolve(HERE, '..', '..', 'docs', 'sld', 'audyt-2026-08');

let opCounter = 0;

type Snapshot = {
  corridors?: Array<{ ordered_segment_refs?: string[] }>;
  branches?: Array<{ ref_id: string; type?: string }>;
  transformers?: Array<{ ref_id: string }>;
};
type DomainOpResponse = { error?: string | null; snapshot?: Snapshot };

function katalogBinding(namespace: string, itemId: string) {
  return { catalog_namespace: namespace, catalog_item_id: itemId, catalog_item_version: CATALOG_VERSION };
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
      operation: { name, idempotency_key: `s913-${name}-${String(++opCounter).padStart(4, '0')}`, payload },
    },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as DomainOpResponse;
  expect(body.error ?? null).toBeNull();
  return body;
}

async function utworzProjektIPrzypadek(request: APIRequestContext) {
  const suffix = Date.now().toString(36);
  const projectName = `S9-13 porownanie z kanwy ${suffix}`;
  const caseName = `Przypadek A/B ${suffix}`;
  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'S9-13: porownanie A/B z kanwy (audyt W-8)',
      mode: 'TO-BE',
      voltage_level_kv: 15.0,
      frequency_hz: 50.0,
    },
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

/** Sieć gotowa do obliczeń (wzorzec porownanie-zwarc-delty). Zwraca ref odcinka. */
async function zbudujSiec(request: APIRequestContext, caseId: string): Promise<string> {
  await operacja(request, caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: katalogBinding('ZRODLO_SN', SOURCE_ID),
    hv_voltage_kv: 110.0,
    transformer_sn_mva: 25.0,
  });

  let op: DomainOpResponse = {};
  for (const [idx, length] of [300, 250].entries()) {
    op = await operacja(request, caseId, 'continue_trunk_segment_sn', {
      segment: {
        rodzaj: 'KABEL',
        dlugosc_m: length,
        name: `Odcinek ${idx + 1}`,
        catalog_binding: katalogBinding('KABEL_SN', CABLE_ID),
      },
    });
  }

  const segmentRefs = op.snapshot?.corridors?.[0]?.ordered_segment_refs ?? [];
  expect(segmentRefs.length).toBeGreaterThan(0);

  op = await operacja(request, caseId, 'insert_station_on_segment_sn', {
    field_apparatus_catalog_ref: 'sw-cb-abb-vd4-17kv-630a',
    segment_id: segmentRefs[segmentRefs.length - 1],
    station_type: 'B',
    insert_at: { value: 0.5 },
    station: { sn_voltage_kv: 15.0, nn_voltage_kv: 0.4 },
    // KOMPLETNOSC-POLA-TR (klasa A): stacja SN/nN Z transformatorem — pole roli
    // 'TR' dopisane, bo realna rozdzielnia realizuje odejscie do transformatora
    // polem transformatorowym. Kreator stacji tworzy je domyslnie, wiec fixture
    // bez niego opisywal siec, ktorej kreator by nie zbudowal.
    sn_fields: ['IN', 'OUT', 'FEEDER', 'TR'],
    transformer: { create: true, catalog_binding: katalogBinding('TRAFO_SN_NN', TRAFO_ID) },
  });

  const odcinkiLiniowe = (op.snapshot?.branches ?? []).filter(
    (branch) => branch.type === 'cable' || branch.type === 'line_overhead',
  );
  for (const branch of odcinkiLiniowe) {
    await operacja(request, caseId, 'assign_catalog_to_element', {
      element_ref: branch.ref_id,
      catalog_binding: katalogBinding('KABEL_SN', CABLE_ID),
    });
  }
  for (const transformer of op.snapshot?.transformers ?? []) {
    await operacja(request, caseId, 'assign_catalog_to_element', {
      element_ref: transformer.ref_id,
      catalog_binding: katalogBinding('TRAFO_SN_NN', TRAFO_ID),
    });
    await operacja(request, caseId, 'update_element_parameters', {
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
      await operacja(request, caseId, 'assign_catalog_to_element', {
        element_ref: issue.element_ref,
        catalog_binding: katalogBinding(isTrafo ? 'TRAFO_SN_NN' : 'KABEL_SN', isTrafo ? TRAFO_ID : CABLE_ID),
      });
    }
    for (const issue of (readiness?.issues ?? []).filter((i) => i.code === 'E005' && i.element_ref)) {
      await operacja(request, caseId, 'update_element_parameters', {
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

  const enm = await request.get(`${BACKEND_BASE}/api/cases/${caseId}/enm`);
  const snapshot = (await enm.json()) as Snapshot;
  const pierwszyOdcinek = (snapshot.branches ?? []).find((b) => b.ref_id.includes('seg'))?.ref_id ?? '';
  expect(pierwszyOdcinek).toBeTruthy();
  return pierwszyOdcinek;
}

/** Bieg SC_3F przez API execution; zwraca id przebiegu z gotowym indeksem. */
async function uruchomBiegSc(request: APIRequestContext, caseId: string): Promise<string> {
  const createRunResponse = await request.post(`${BACKEND_BASE}/api/execution/study-cases/${caseId}/runs`, {
    data: { analysis_type: 'SC_3F' },
  });
  expect(createRunResponse.ok(), await createRunResponse.text()).toBeTruthy();
  const run = (await createRunResponse.json()) as { id: string };
  const executeResponse = await request.post(`${BACKEND_BASE}/api/execution/runs/${run.id}/execute`, {
    timeout: 90000,
  });
  expect(executeResponse.ok(), await executeResponse.text()).toBeTruthy();
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const response = await request.get(`${BACKEND_BASE}/api/analysis-runs/${run.id}/results/index`);
    if (response.ok()) return run.id;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`results/index nie jest gotowy dla przebiegu ${run.id}`);
}

async function otworzSchematZBiegiem(
  page: Page,
  seed: { projectId: string; projectName: string; caseId: string; caseName: string },
  runId: string,
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
          activeAnalysisType: 'SHORT_CIRCUIT',
          caseManagerOpen: false,
          issuePanelOpen: false,
        },
        version: 1,
      }),
    );
  }, seed);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(`/#sld?run=${runId}`, { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 60000 });
  await expect(page.getByTestId('sld-canvas-v3')).toBeVisible({ timeout: 60000 });
}

/** Otwiera dok „Warstwy" i czeka na sekcję „Porównanie A/B" panelu filtrów. */
async function otworzPanelWarstw(page: Page): Promise<void> {
  await page.getByTestId('sld-v3-layer-panel-toggle').click();
  await expect(page.getByTestId('sld-v3-result-filter-panel')).toBeVisible({ timeout: 15000 });
}

/** Motyw przełączany REALNYM przyciskiem powłoki, z asercją na `data-theme`. */
async function ustawMotyw(page: Page, docelowy: 'dark_scada' | 'light_technical'): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    const biezacy = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    if (biezacy === docelowy) return;
    await page.getByTestId('mvd-theme-toggle').click();
    await page.waitForTimeout(300);
  }
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.getAttribute('data-theme')), { timeout: 10000 })
    .toBe(docelowy);
}

/** Podnosi LOD kanwy do L2 NATYWNYM kółkiem (bez wymuszania stanu). */
async function przyblizDoL2(page: Page): Promise<void> {
  const kanwa = page.getByTestId('sld-canvas-v3');
  const box = await kanwa.boundingBox();
  expect(box).toBeTruthy();
  const cx = box!.x + box!.width / 2;
  const cy = box!.y + box!.height / 2;
  await page.mouse.move(cx, cy);
  for (let i = 0; i < 40; i += 1) {
    const lod = await kanwa.getAttribute('data-scene-lod');
    if (lod === '2') return;
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(80);
  }
  await expect.poll(async () => kanwa.getAttribute('data-scene-lod'), { timeout: 5000 }).toBe('2');
}

test('S9-13: porównanie A/B osiągalne z kanwy — blokada bez drugiego biegu, różnice po wyborze pary, zrzuty L2', async ({
  page,
  request,
}) => {
  test.setTimeout(600000);
  mkdirSync(KATALOG_ZRZUTOW, { recursive: true });

  const seed = await utworzProjektIPrzypadek(request);
  const odcinek = await zbudujSiec(request, seed.caseId);

  // ---------------------------------------------------------------- bieg A
  const runA = await uruchomBiegSc(request, seed.caseId);

  // STAN ZABLOKOWANY (scenariusz sondy W-8: pojedynczy bieg): sekcja
  // „Porównanie A/B" ISTNIEJE i mówi uczciwie, czego brakuje — z akcją.
  await otworzSchematZBiegiem(page, seed, runA);
  await otworzPanelWarstw(page);
  await expect(page.getByTestId('sld-v3-result-ab')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('sld-v3-result-ab-blocked')).toContainText(
    'Brak drugiego ukończonego biegu tego samego rodzaju',
  );
  await expect(page.getByTestId('sld-v3-result-ab-akcja')).toBeVisible();
  await page.screenshot({ path: resolve(KATALOG_ZRZUTOW, 's9-13-blokada-brak-drugiego-biegu.png') });

  // ---------------------------------------------- zmiana modelu + bieg B
  // Dłuższy odcinek ⇒ większa impedancja ⇒ inny prąd zwarciowy (delty ≠ 0).
  await operacja(request, seed.caseId, 'update_element_parameters', {
    element_ref: odcinek,
    parameters: { length_km: 1.5, parameter_source: 'CATALOG' },
  });
  const runB = await uruchomBiegSc(request, seed.caseId);
  expect(runA).not.toBe(runB);

  // -------------------------------------------- wejście w różnice Z KANWY
  await page.reload({ waitUntil: 'commit' });
  await page.goto(`/#sld?run=${runB}`, { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 60000 });
  await expect(page.getByTestId('sld-canvas-v3')).toBeVisible({ timeout: 60000 });
  await otworzPanelWarstw(page);

  // Sekcja GOTOWA: kandydat = bieg A (DONE, ten sam rodzaj i przypadek).
  await expect
    .poll(async () => page.getByTestId('sld-v3-result-ab').getAttribute('data-ab-stan'), { timeout: 30000 })
    .toBe('gotowe');
  await page.getByTestId('sld-v3-result-ab-select').selectOption(runA);

  const odpowiedzNakladki = page.waitForResponse(
    (response) =>
      response.url().includes('/api/short-circuit-comparisons/sld-overlay')
      && response.request().method() === 'POST',
    { timeout: 60000 },
  );
  await page.getByTestId('sld-v3-result-ab-pokaz').click();
  const surowa = await odpowiedzNakladki;
  expect(surowa.ok()).toBeTruthy();
  const nakladka = (await surowa.json()) as {
    run_id_a: string;
    run_id_b: string;
    report_version: string;
    liczba_punktow_zmienionych: number;
    elements: Record<string, { metrics: Record<string, unknown> }>;
  };
  // KIERUNEK PARY: A = wybrane odniesienie, B = bieg pokazywany na schemacie.
  expect(nakladka.run_id_a).toBe(runA);
  expect(nakladka.run_id_b).toBe(runB);
  expect(nakladka.report_version).toBe('1.3.0');
  // Zmiana długości odcinka MUSI dać niezerowe różnice.
  expect(nakladka.liczba_punktow_zmienionych).toBeGreaterThan(0);
  // Kontrakt 1.3.0: wartości B obok delt (etykieta niesie „wartość B i różnicę").
  const zWartosciaB = Object.values(nakladka.elements).some((el) => 'B_IK_3F_KA' in el.metrics);
  expect(zWartosciaB).toBe(true);

  // Panel: podsumowanie pary + wyjście; warstwa etykiet: różnice na rysunku.
  await expect(page.getByTestId('sld-v3-result-roznice')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('sld-v3-result-roznice-para')).toContainText(runA);
  await expect(page.getByTestId('sld-v3-result-roznice-para')).toContainText(runB);
  const warstwa = page.locator('[data-testid="sld-v3-result-labels"]');
  await expect(warstwa).toContainText('Δ Ik″', { timeout: 20000 });

  // ------------------------------------------------- zrzuty L2, oba motywy
  await przyblizDoL2(page);
  await ustawMotyw(page, 'dark_scada');
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(KATALOG_ZRZUTOW, 's9-13-roznice-L2-ciemny.png') });
  await ustawMotyw(page, 'light_technical');
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(KATALOG_ZRZUTOW, 's9-13-roznice-L2-jasny.png') });

  for (const plik of [
    's9-13-blokada-brak-drugiego-biegu.png',
    's9-13-roznice-L2-ciemny.png',
    's9-13-roznice-L2-jasny.png',
  ]) {
    expect(existsSync(resolve(KATALOG_ZRZUTOW, plik)), `zrzut ${plik}`).toBe(true);
  }

  // Wyjście z trybu różnic przywraca wynik pojedynczego przebiegu (kontrola
  // dodatnia pętli: wejście i wyjście z kanwy, bez ekranu porównań).
  await page.getByTestId('sld-v3-result-roznice-wylacz').click();
  await expect(page.getByTestId('sld-v3-result-roznice')).toBeHidden({ timeout: 10000 });
  await expect
    .poll(async () => page.getByTestId('sld-v3-result-ab').getAttribute('data-ab-stan'), { timeout: 10000 })
    .toBe('gotowe');
});
