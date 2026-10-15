/**
 * KD-3 poz. 11 — delty porównania zwarciowego pochodzą z BACKENDU.
 *
 * INTENCJA (dług V12K-290). Tryb zwarciowy ekranu porównań liczył różnice sam:
 * odejmował dwie wartości z dwóch przebiegów i dzielił je przez siebie, żeby
 * pokazać procent — arytmetyka na wynikach solvera w warstwie prezentacji.
 * Ta sama klasa, którą dla porównań ROZPŁYWU zamknęła luka L-13 (karta KD-2).
 *
 * BRAMKA. Na ŻYWEJ aplikacji (real backend, kliki NATYWNE): dwa realne biegi
 * zwarciowe na modelach RÓŻNIĄCYCH SIĘ długością odcinka (żeby delty nie były
 * zerowe), porównanie z ekranu, a następnie porównanie tego, CO WIDAĆ, z tym,
 * CO ZWRÓCIŁA końcówka `POST /api/short-circuit-comparisons`. Gdyby ekran wrócił
 * do własnego rachunku, wartość na ekranie mogłaby się różnić od pola backendu.
 *
 * Wzorzec seedu i biegów: e2e/deep-link-wyniki.spec.ts.
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { otworzZakladkeWynikow } from './nawigacjaWynikow';
import fs from 'node:fs';
import path from 'node:path';


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
const OUTPUT_DIR = path.resolve(process.cwd(), '../docs/audit/visual/flow-ekspert');

let opCounter = 0;
let entityCounter = 0;

function nextEntitySuffix(): string {
  entityCounter += 1;
  return String(entityCounter).padStart(4, '0');
}

type Snapshot = {
  corridors?: Array<{ ordered_segment_refs?: string[] }>;
  branches?: Array<{ ref_id: string; type?: string }>;
  transformers?: Array<{ ref_id: string }>;
};
type DomainOpResponse = { error?: string | null; snapshot?: Snapshot };

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
        idempotency_key: `e2e-porz-${name}-${String(++opCounter).padStart(4, '0')}`,
        payload,
      },
    },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as DomainOpResponse;
  expect(body.error ?? null).toBeNull();
  return body;
}

async function utworzProjektIPrzypadek(request: APIRequestContext) {
  const suffix = nextEntitySuffix();
  const projectName = `E2E porownanie zwarc ${suffix}`;
  const caseName = `Przypadek porownania ${suffix}`;

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Delty porownania zwarciowego liczone w backendzie (KD-3)',
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

async function otworzAplikacje(page: Page, request: APIRequestContext) {
  const seed = await utworzProjektIPrzypadek(request);
  await page.addInitScript((dane) => {
    localStorage.setItem(
      'mv-design-app-state',
      JSON.stringify({
        state: {
          activeProjectId: dane.projectId,
          activeProjectName: dane.projectName,
          activeCaseId: dane.caseId,
          activeCaseName: dane.caseName,
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

  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 30000 });
  return seed;
}

/** Sieć gotowa do obliczeń (wzorzec deep-link-wyniki). Zwraca ref odcinka. */
async function zbudujSiec(request: APIRequestContext, caseId: string): Promise<string> {
  await executeDomainOp(request, caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: buildCatalogBinding('ZRODLO_SN', SOURCE_ID),
    hv_voltage_kv: 110.0,
    transformer_sn_mva: 25.0,
  });

  let op: DomainOpResponse = {};
  for (const [idx, length] of [300, 250].entries()) {
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
    // KOMPLETNOSC-POLA-TR (klasa A): stacja SN/nN Z transformatorem — pole roli
    // 'TR' dopisane, bo realna rozdzielnia realizuje odejscie do transformatora
    // polem transformatorowym. Kreator stacji tworzy je domyslnie, wiec fixture
    // bez niego opisywal siec, ktorej kreator by nie zbudowal.
    sn_fields: ['IN', 'OUT', 'FEEDER', 'TR'],
    transformer: { create: true, catalog_binding: buildCatalogBinding('TRAFO_SN_NN', TRAFO_ID) },
  });

  // Kategoria katalogu MUSI pasować do rodzaju gałęzi: KABEL_SN dostają
  // WYŁĄCZNIE odcinki liniowe (aparat pola ma wiązanie APARAT_SN, którego nie
  // wolno nadpisać — `catalog.namespace_mismatch`, KD-6).
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
  let pierwszyOdcinek = '';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const readinessResponse = await request.get(
      `${BACKEND_BASE}/api/cases/${caseId}/engineering-readiness`,
    );
    expect(readinessResponse.ok()).toBeTruthy();
    readiness = (await readinessResponse.json()) as OdczytGotowosci;
    if (readiness?.ready) break;
    for (const issue of (readiness?.issues ?? []).filter(
      (i) => i.code.includes('catalog') && i.element_ref,
    )) {
      const isTrafo = issue.code.includes('transformer');
      await executeDomainOp(request, caseId, 'assign_catalog_to_element', {
        element_ref: issue.element_ref,
        catalog_binding: buildCatalogBinding(
          isTrafo ? 'TRAFO_SN_NN' : 'KABEL_SN',
          isTrafo ? TRAFO_ID : CABLE_ID,
        ),
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

  const enm = await request.get(`${BACKEND_BASE}/api/cases/${caseId}/enm`);
  const snapshot = (await enm.json()) as Snapshot;
  pierwszyOdcinek = (snapshot.branches ?? []).find((b) => b.ref_id.includes('seg'))?.ref_id ?? '';
  expect(pierwszyOdcinek).toBeTruthy();
  return pierwszyOdcinek;
}

/** Bieg SC_3F przez API execution; zwraca id przebiegu z gotowym indeksem. */
async function uruchomBiegSc(request: APIRequestContext, caseId: string): Promise<string> {
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

  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const response = await request.get(`${BACKEND_BASE}/api/analysis-runs/${run.id}/results/index`);
    if (response.ok()) return run.id;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`results/index nie jest gotowy dla przebiegu ${run.id}`);
}

test('KD-3 poz. 11: delta na ekranie porównania zwarć = pole z końcówki backendu', async ({
  page,
  request,
}) => {
  test.setTimeout(300000);

  const { caseId } = await otworzAplikacje(page, request);
  const odcinek = await zbudujSiec(request, caseId);

  // Przebieg A na modelu wyjściowym.
  const runA = await uruchomBiegSc(request, caseId);

  // ZMIANA MODELU między biegami: dłuższy odcinek ⇒ większa impedancja ⇒ inny
  // prąd zwarciowy. Bez tego delty byłyby zerowe i test nie odróżniłby pola
  // backendu od rachunku UI.
  await executeDomainOp(request, caseId, 'update_element_parameters', {
    element_ref: odcinek,
    parameters: { length_km: 1.5, parameter_source: 'CATALOG' },
  });
  const runB = await uruchomBiegSc(request, caseId);
  expect(runA).not.toBe(runB);

  // Ekran porównań: przestrzeń wyników → zakładka „Porównanie A/B" → tryb zwarć.
  await page.reload({ waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 30000 });
  await page.getByRole('button', { name: /^Wyniki i dowody \d$/ }).click();
  await otworzZakladkeWynikow(page, 'porownanie');
  await expect(page.getByTestId('mvd-por-host')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('mvd-por-tryb-zwarcia').click();
  await expect(page.getByTestId('mvd-porz-ekran')).toBeVisible({ timeout: 20000 });

  // Wybór pary A/B i JAWNE uruchomienie porównania (zero automatyzmu).
  await page.getByTestId('mvd-porz-select-a').selectOption(runA);
  await page.getByTestId('mvd-porz-select-b').selectOption(runB);

  const odpowiedzPorownania = page.waitForResponse(
    (response) =>
      response.url().includes('/api/short-circuit-comparisons')
      && response.request().method() === 'POST',
    { timeout: 60000 },
  );
  await page.getByTestId('mvd-porz-przycisk').click();
  const surowa = await odpowiedzPorownania;
  expect(surowa.ok()).toBeTruthy();

  const porownanie = (await surowa.json()) as {
    report_version: string;
    punkty: Array<{
      target_name: string;
      obecny_w: string;
      delta_ikss_ka?: number;
      delta_ikss_percent?: number;
    }>;
  };
  // Kontrakt: wersja raportu — podbicia MINOR addytywne (1.1.0 pola procentowe
  // KD-3; 1.2.0 element_id nakładki; 1.3.0 wartości B nakładki, S9-13).
  // Asercja trzyma DOKŁADNĄ bieżącą wersję, żeby cicha zmiana kontraktu nie
  // przeszła bez podbicia (poprzednio asercja została na 1.1.0 przy backendzie
  // 1.2.0 — test był czerwony na HEAD; naprawa u źródła: wersja z kontraktu).
  expect(porownanie.report_version).toBe('1.3.0');
  expect(porownanie.punkty.length).toBeGreaterThan(0);

  await expect(page.getByTestId('mvd-porz-wynik')).toBeVisible({ timeout: 20000 });

  // Punkt ze ZMIENIONĄ deltą — dowód, że zmiana modelu przełożyła się na wynik.
  const zeZmiana = porownanie.punkty.find(
    (p) => typeof p.delta_ikss_ka === 'number' && Math.abs(p.delta_ikss_ka) > 1e-9,
  );
  expect(zeZmiana, 'zmiana długości odcinka musi dać niezerową deltę').toBeTruthy();

  // TO, CO WIDAĆ, = TO, CO ZWRÓCIŁ BACKEND (format PL: przecinek dziesiętny).
  const oczekiwanaDelta = `${zeZmiana!.delta_ikss_ka! >= 0 ? '+' : '-'}${Math.abs(
    zeZmiana!.delta_ikss_ka!,
  )
    .toFixed(3)
    .replace('.', ',')}`;
  const tabela = page.getByTestId('mvd-porz-wynik');
  await expect(tabela).toContainText(zeZmiana!.target_name);
  await expect(tabela).toContainText(oczekiwanaDelta);

  // ------------------------------------------- zrzuty do oceny (bramka 6)
  // Ten sam ekran w OBU motywach — seed jest kosztowny, wiec robimy go raz, a
  // motyw przelaczamy i powtarzamy samo porownanie (klik, nie stan wymuszony).
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'kd3-porownanie-zwarc-dark.png') });

  await page.evaluate(() => {
    localStorage.setItem(
      'mvd-theme-mode',
      JSON.stringify({ state: { mode: 'light_technical' }, version: 0 }),
    );
  });
  await page.reload({ waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 30000 });
  await page.getByRole('button', { name: /^Wyniki i dowody \d$/ }).click();
  await otworzZakladkeWynikow(page, 'porownanie');
  await page.getByTestId('mvd-por-tryb-zwarcia').click();
  await page.getByTestId('mvd-porz-select-a').selectOption(runA);
  await page.getByTestId('mvd-porz-select-b').selectOption(runB);
  await page.getByTestId('mvd-porz-przycisk').click();
  await expect(page.getByTestId('mvd-porz-wynik')).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'kd3-porownanie-zwarc-light.png') });

  for (const plik of ['kd3-porownanie-zwarc-dark.png', 'kd3-porownanie-zwarc-light.png']) {
    expect(fs.existsSync(path.join(OUTPUT_DIR, plik)), `zrzut ${plik}`).toBe(true);
  }
});

/**
 * Karta BIEG-ZABEZPIECZEN-Z-MODELU — natywna ścieżka projektanta od aparatu w torze do porównania
 * dwóch biegów oceny zabezpieczeń (zastępuje dawny krok CV-3.3-B2, który konfigurował
 * zabezpieczenia SZABLONEM przypadku `PUT .../protection-config` — zabezpieczenie syntetyczne na
 * każdej gałęzi, skasowane: urządzenia i nastawy żyją WYŁĄCZNIE w modelu, D-21).
 *
 * Droga (kliki NATYWNE na realnym backendzie; przez API tylko szkielet sieci, jak w KD-3 wyżej):
 * odcinek w drzewie projektu → inspektor „Wstaw łącznik" → kreator łącznika (wyłącznik z katalogu)
 * → „Zabezpieczenia i automatyka" (paleta poleceń) → „Dodaj przekładnik" (kreator pomiaru, katalog)
 * → „Dodaj zabezpieczenie" (kreator przekaźnika, katalog) → edytor nastaw (I> 51, IEC SI, TMS)
 * → „Oblicz" (bieg zwarciowy) → E-28 „Oceń zabezpieczenia" (bieg A) → zmiana TMS w edytorze →
 * wynik A nieaktualny → ponowna ocena (bieg B) → „Porównanie A/B" w trybie zabezpieczeń.
 *
 * WYROCZNIA. Charakterystyka IEC 60255-151 normalnie odwrotna: t = TMS·0,14/(M^0,02 − 1). Między
 * biegami zmienia się WYŁĄCZNIE TMS (0,1 → 0,3), sieć i bieg zwarciowy są te same, więc krotność M
 * jest ta sama, a czas zadziałania MUSI wzrosnąć dokładnie trzykrotnie w każdym wierszu, w którym
 * zabezpieczenie działa w obu biegach. Porównanie, które nie brałoby nastaw z modelu (szablon,
 * wartość domyślna), dałoby iloraz 1 albo brak wiersza.
 */

const KATALOG_WYLACZNIKA = 'sw-cb-abb-vd4-17kv-630a';
const KATALOG_PRZEKLADNIKA = 'ct_600_5_5p20_15va_schneider';
const KATALOG_PRZEKAZNIKA = 'REF-OC-200';
const NAZWA_ZABEZPIECZENIA = 'Zabezpieczenie odcinka 1';

/** Otwiera ekran „Zabezpieczenia i automatyka" paletą poleceń (Ctrl+K) — droga użytkownika. */
async function otworzZabezpieczeniaIAutomatyke(page: Page): Promise<void> {
  await page.keyboard.press('Control+k');
  await expect(page.getByTestId('mvd-cmdk-dialog')).toBeVisible();
  await page.getByTestId('mvd-cmdk-input').fill('Zabezpieczenia i automatyka');
  await page.getByTestId('mvd-cmdk-opcja-ekran:E-27').click();
  await expect(page.getByTestId('mvd-za-nastawy')).toBeVisible({ timeout: 20000 });
}

/** Realna droga do E-28: Wyniki → „Pozostałe analizy" → karta koordynacji → Otwórz. */
async function otworzKoordynacje(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Wyniki i dowody \d$/ }).click();
  await expect(page.getByTestId('mvd-wyniki-warsztat')).toBeVisible({ timeout: 20000 });
  // Ekran „Koordynacja zabezpieczeń" (zakładka `koordynacja` — ta sama droga co spek doboru
  // nastaw metodą Hoppela); sekcja oceny zabezpieczeń z modelu stoi na jego górze.
  await otworzZakladkeWynikow(page, 'koordynacja');
  await expect(page.getByTestId('mvd-ocena-zabezpieczen')).toBeVisible({ timeout: 20000 });
}

/** Klik „Oceń zabezpieczenia" — zwraca identyfikator biegu oceny z odpowiedzi backendu. */
async function ocenZabezpieczenia(page: Page): Promise<string> {
  const uruchom = page.getByTestId('mvd-ocena-zabezpieczen-uruchom');
  await expect(uruchom).toBeEnabled({ timeout: 20000 });
  const utworzenie = page.waitForResponse(
    (r) => /\/api\/projects\/[^/]+\/protection-runs$/.test(r.url()) && r.request().method() === 'POST',
    { timeout: 60000 },
  );
  await uruchom.click();
  const odpowiedz = await utworzenie;
  expect(odpowiedz.ok(), await odpowiedz.text()).toBeTruthy();
  const { id } = (await odpowiedz.json()) as { id: string };
  await expect(page.getByTestId('mvd-ocena-zabezpieczen-wynik')).toBeVisible({ timeout: 60000 });
  await expect(page.getByTestId('mvd-ocena-zabezpieczen-blad')).toHaveCount(0);
  return id;
}

/** Porównanie A/B w trybie zabezpieczeń — zwraca surową odpowiedź końcówki. */
async function porownajBiegi(page: Page, runA: string, runB: string) {
  await page.getByRole('button', { name: /^Wyniki i dowody \d$/ }).click();
  await otworzZakladkeWynikow(page, 'porownanie');
  await expect(page.getByTestId('mvd-por-host')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('mvd-por-tryb-zabezpieczenia').click();
  await expect(page.getByTestId('mvd-porzab-ekran')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('mvd-porzab-select-a').selectOption(runA);
  await page.getByTestId('mvd-porzab-select-b').selectOption(runB);
  const odpowiedzPorownania = page.waitForResponse(
    (response) =>
      response.url().includes('/api/protection-comparisons')
      && response.request().method() === 'POST',
    { timeout: 60000 },
  );
  await page.getByTestId('mvd-porzab-przycisk').click();
  const surowa = await odpowiedzPorownania;
  expect(surowa.ok(), await surowa.text()).toBeTruthy();
  await expect(page.getByTestId('mvd-porzab-wynik')).toBeVisible({ timeout: 20000 });
  return (await surowa.json()) as {
    rows: Array<{
      device_id_a: string;
      device_id_b: string;
      fault_target_id: string;
      t_trip_s_a: number | null;
      t_trip_s_b: number | null;
      nazwa_urzadzenia_pl: string;
      wiarygodnosc_a: string;
      wiarygodnosc_b: string;
    }>;
  };
}

test('BIEG-ZABEZPIECZEN-Z-MODELU: wyłącznik w torze → przekładnik → przekaźnik → nastawy → ocena → porównanie', async ({
  page,
  request,
}) => {
  test.setTimeout(420000);

  const { caseId } = await otworzAplikacje(page, request);
  await zbudujSiec(request, caseId);
  await page.reload({ waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 30000 });

  // (1) Wyłącznik w torze odcinka — karta odcinka w inspektorze → „Wstaw łącznik sekcyjny" →
  // kreator z katalogu.
  const drzewo = page.getByTestId('project-tree');
  await expect(drzewo).toBeVisible({ timeout: 20000 });
  await page.getByTestId('project-tree-search-input').fill('Odcinek 1');
  await drzewo.getByText('Odcinek 1', { exact: true }).first().click();
  const inspektor = page.getByTestId('inspector-engineering');
  await expect(inspektor).toContainText('Odcinek 1');
  await inspektor.getByRole('button', { name: 'Wstaw łącznik sekcyjny' }).click();
  await expect(page.getByTestId('mvd-kreator-lacznik')).toBeVisible();
  await page.getByTestId('mvd-kreator-lacznik-katalog').selectOption(KATALOG_WYLACZNIKA);
  await page.getByTestId('mvd-kreator-lacznik-rodzaj').selectOption('WYLACZNIK');
  await page.getByTestId('mvd-kreator-lacznik-nazwa').fill('Wyłącznik odcinka 1');
  await page.getByTestId('mvd-kreator-lacznik-zapisz').click();
  await expect(page.getByTestId('mvd-kreator-lacznik')).toHaveCount(0, { timeout: 20000 });

  // (2) Przekładnik i przekaźnik przy wyłączniku — ekran „Zabezpieczenia i automatyka".
  // Wiersz TEGO wyłącznika (lista wyłączników liniowych SN — backend `wylaczniki_liniowe`;
  // aparaty strony nN stacji do niej nie należą) — akcja wiersza zależy od stanu: brak
  // przekładnika → „Dodaj przekładnik".
  await otworzZabezpieczeniaIAutomatyke(page);
  const wierszWylacznika = page
    .locator('[data-testid^="mvd-za-wylacznik-"]')
    .filter({ hasText: 'Wyłącznik odcinka 1' });
  await expect(wierszWylacznika).toHaveCount(1, { timeout: 20000 });
  const dodajCt = wierszWylacznika.locator('[data-testid^="mvd-za-dodaj-ct-"]');
  await expect(dodajCt).toBeVisible();
  await dodajCt.click();
  await expect(page.getByTestId('mvd-kreator-pomiar')).toBeVisible();
  await page.getByTestId('mvd-kreator-pomiar-katalog').selectOption(KATALOG_PRZEKLADNIKA);
  await page.getByTestId('mvd-kreator-pomiar-zapisz').click();
  await expect(page.getByTestId('mvd-kreator-pomiar')).toHaveCount(0, { timeout: 20000 });

  await otworzZabezpieczeniaIAutomatyke(page);
  const dodajZab = wierszWylacznika.locator('[data-testid^="mvd-za-dodaj-zabezpieczenie-"]');
  await expect(dodajZab).toBeVisible({ timeout: 20000 });
  await dodajZab.click();
  await expect(page.getByTestId('mvd-kreator-przekaznik')).toBeVisible();
  await page.getByTestId('mvd-kreator-przekaznik-katalog').selectOption(KATALOG_PRZEKAZNIKA);
  await page.getByTestId('mvd-kreator-przekaznik-nazwa').fill(NAZWA_ZABEZPIECZENIA);
  await page.getByTestId('mvd-kreator-przekaznik-zapisz').click();
  await expect(page.getByTestId('mvd-kreator-przekaznik')).toHaveCount(0, { timeout: 20000 });

  // (3) Nastawy w edytorze — przypisanie bez nastaw jest nazwanym brakiem, nie wartością domyślną.
  await otworzZabezpieczeniaIAutomatyke(page);
  // Korzeń edytora (`section`) — elementy potomne mają testid z tym samym przedrostkiem, a
  // lista braków też nazywa zabezpieczenie.
  const edytor = page
    .locator('section[data-testid^="mvd-za-edytor-"]')
    .filter({ hasText: NAZWA_ZABEZPIECZENIA });
  await expect(edytor).toHaveCount(1, { timeout: 20000 });
  const prefiks = (await edytor.getAttribute('data-testid'))!;
  await expect(page.getByTestId(`${prefiks}-braki`)).toBeVisible();
  await expect(page.getByTestId(`${prefiks}-przekladnia`)).toContainText('600/5 A');
  // `add_relay` bez nastaw tworzy stopnie rodziny z pustymi polami (nazwany brak) — stopień
  // I>> (50) wyłączony świadomie, I> (51) z nastawą. Pusty aktywny stopień byłby brakiem
  // blokującym ocenę urządzenia (jedna ścieżka oceny nie zgaduje nastaw).
  const aktywny50 = page.getByTestId(`${prefiks}-overcurrent_50-aktywny`);
  if (await aktywny50.isChecked()) await aktywny50.click();
  await expect(aktywny50).not.toBeChecked();
  const aktywny51 = page.getByTestId(`${prefiks}-overcurrent_51-aktywny`);
  if (!(await aktywny51.isChecked())) await aktywny51.click();
  await page.getByTestId(`${prefiks}-overcurrent_51-prog`).fill('1.5');
  await page.getByTestId(`${prefiks}-overcurrent_51-jednostka`).selectOption('A_WTORNY');
  await page.getByTestId(`${prefiks}-overcurrent_51-krzywa`).selectOption('IEC_SI');
  await page.getByTestId(`${prefiks}-overcurrent_51-tms`).fill('0.1');
  await page.getByTestId(`${prefiks}-zapisz`).click();
  await expect(page.getByTestId(`${prefiks}-gotowe`)).toBeVisible({ timeout: 20000 });
  // Próg pierwotny z backendu (1,5 A wtórnie × 600/5 = 180 A) — front niczego nie przelicza.
  await expect(page.getByTestId(`${prefiks}-overcurrent_51-pierwotny`)).toContainText('180');

  // Nastawa żyje w MODELU: po pełnym przeładowaniu wraca z serwera.
  await page.reload({ waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 30000 });
  await otworzZabezpieczeniaIAutomatyke(page);
  await expect(page.getByTestId(`${prefiks}-overcurrent_51-tms`)).toHaveValue('0.1', { timeout: 20000 });

  // (4) Bieg zwarciowy realnym klikiem „Oblicz".
  await page.getByRole('button', { name: 'Oblicz', exact: true }).click();
  await expect(
    page.getByTestId('notification-toast').filter({ hasText: 'Obliczenie zakończone' }).first(),
  ).toBeVisible({ timeout: 90000 });

  // (5) Ocena zabezpieczeń na biegu zwarciowym (bieg A).
  await otworzKoordynacje(page);
  const runA = await ocenZabezpieczenia(page);
  const wierszeA = page.locator('[data-testid^="mvd-ocena-zabezpieczen-wiersz-"]');
  expect(await wierszeA.count()).toBeGreaterThan(0);
  await expect(page.getByTestId('mvd-ocena-zabezpieczen-wynik')).toContainText(NAZWA_ZABEZPIECZENIA);

  // (6) Zmiana nastawy w modelu → wynik A nieaktualny → ocena ponownie (bieg B, ten sam bieg SC).
  await otworzZabezpieczeniaIAutomatyke(page);
  await page.getByTestId(`${prefiks}-overcurrent_51-tms`).fill('0.3');
  await page.getByTestId(`${prefiks}-zapisz`).click();
  await expect(page.getByTestId(`${prefiks}-overcurrent_51-tms`)).toHaveValue('0.3');
  await expect(page.getByTestId(`${prefiks}-blad`)).toHaveCount(0);
  await otworzKoordynacje(page);
  await expect(page.getByTestId('mvd-ocena-zabezpieczen-nieaktualny')).toBeVisible({ timeout: 20000 });
  const runB = await ocenZabezpieczenia(page);
  expect(runB).not.toBe(runA);
  await expect(page.getByTestId('mvd-ocena-zabezpieczen-nieaktualny')).toHaveCount(0);

  // (7) Porównanie A/B — wiersze policzone z urządzenia modelu, czas ×3 (wyrocznia IEC 60255).
  const porownanie = await porownajBiegi(page, runA, runB);
  expect(porownanie.rows.length, 'porównanie ocen z urządzenia modelu nie może być puste').toBeGreaterThan(0);
  const dzialajace = porownanie.rows.filter(
    (r) => typeof r.t_trip_s_a === 'number' && typeof r.t_trip_s_b === 'number',
  );
  expect(dzialajace.length, 'zabezpieczenie musi zadziałać w co najmniej jednym punkcie').toBeGreaterThan(0);
  for (const r of dzialajace) {
    expect(r.nazwa_urzadzenia_pl).toBe(NAZWA_ZABEZPIECZENIA);
    expect(r.device_id_a).toBe(r.device_id_b);
    expect(r.t_trip_s_b! / r.t_trip_s_a!).toBeCloseTo(3, 6);
    expect(r.wiarygodnosc_a).toBe('WIARYGODNY');
  }
  const tabela = page.getByTestId('mvd-porzab-wynik');
  await expect(tabela).toContainText(NAZWA_ZABEZPIECZENIA);
  await expect(tabela).not.toContainText(dzialajace[0].device_id_a);

  // ------------------------------------------- kadry do oceny B-02 (oba motywy)
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const kadry: string[] = [];
  const kadruj = async (motyw: 'dark' | 'light') => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUTPUT_DIR, `cv33b2-porownanie-zabezpieczen-${motyw}.png`) });
    await otworzKoordynacje(page);
    await expect(page.getByTestId('mvd-ocena-zabezpieczen-wynik')).toBeVisible({ timeout: 20000 });
    await page.getByTestId('mvd-ocena-zabezpieczen').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(OUTPUT_DIR, `ocena-zabezpieczen-z-modelu-${motyw}.png`) });
    await otworzZabezpieczeniaIAutomatyke(page);
    await page.getByTestId(prefiks).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(OUTPUT_DIR, `edytor-nastaw-zabezpieczenia-${motyw}.png`) });
    kadry.push(
      `cv33b2-porownanie-zabezpieczen-${motyw}.png`,
      `ocena-zabezpieczen-z-modelu-${motyw}.png`,
      `edytor-nastaw-zabezpieczenia-${motyw}.png`,
    );
  };
  await kadruj('dark');

  await page.evaluate(() => {
    localStorage.setItem(
      'mvd-theme-mode',
      JSON.stringify({ state: { mode: 'light_technical' }, version: 0 }),
    );
  });
  await page.reload({ waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 30000 });
  await porownajBiegi(page, runA, runB);
  await kadruj('light');

  for (const plik of kadry) {
    expect(fs.existsSync(path.join(OUTPUT_DIR, plik)), `kadr ${plik}`).toBe(true);
  }
});
