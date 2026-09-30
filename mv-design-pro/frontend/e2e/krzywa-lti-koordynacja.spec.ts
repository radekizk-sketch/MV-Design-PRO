/**
 * Karta PROT-LTI — krzywa zależna długoczasowa (K = 120, α = 1) pod JEDNĄ nazwą
 * „LTI" od formularza nastaw po wykres TCC i czasy zadziałania.
 *
 * INTENCJA: projektant wybiera w formularzu nastaw E-28 (Koordynacja
 * zabezpieczeń) krzywą „Odwrotna długoczasowa (LTI, 120)", uruchamia analizę
 * i dostaje z backendu krzywą TCC tej charakterystyki oraz czasy zadziałania
 * w tabeli selektywności. Przed kartą ta sama krzywa miała w produkcie cztery
 * nazwy (RI / IEC_LI / LTI / IEC_LTI) i etykietę „Długoczasowa odwrotna (LTI)"
 * albo „Odwrotna RI (120)" zależnie od miejsca.
 *
 * Interakcje NATYWNE (klik, selectOption, fill) — zero dispatchEvent. Sieć i
 * bieg zwarciowy przez API (wzorzec e2e/nastawy-i-akcje-oze.spec.ts, z którego
 * pochodzą funkcje pomocnicze budowy sieci).
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { otworzZakladkeWynikow } from './nawigacjaWynikow';


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
let opCounter = 0;
let entityCounter = 0;

function nextEntitySuffix(): string {
  entityCounter += 1;
  return String(entityCounter).padStart(4, '0');
}

type DomainOpResponse = {
  error?: string | null;
  changes?: { created_element_ids?: string[] };
  snapshot?: {
    corridors?: Array<{ ordered_segment_refs?: string[] }>;
    branches?: Array<{ ref_id: string; type?: string }>;
    transformers?: Array<{ ref_id: string }>;
    buses?: Array<{ ref_id: string; voltage_kv: number }>;
    substations?: Array<{ ref_id: string; bus_refs?: string[]; station_type?: string }>;
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
        idempotency_key: `e2e-krzywa-lti-${name}-${String(++opCounter).padStart(4, '0')}`,
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
  const projectName = `E2E krzywa LTI ${suffix}`;
  const caseName = `Przypadek krzywej LTI ${suffix}`;

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Karta PROT-LTI: krzywa długoczasowa w koordynacji E-28',
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

/** Buduje przez API kompletną, gotową do obliczeń sieć (wzorzec deep-link-wyniki).
 *  Zwraca refy szyn SN należących do stacji (kontekst formularza źródła OZE). */
/**
 * Realny odbiór nN kanonicznymi operacjami (pole odpływowe + odbiór) — bez niego
 * rozpływ mocy jest słusznie niedostępny (W003: brak odbiorów i generatorów).
 * Spec dawniej przechodził tylko dzięki FANTOMOWEMU odbiorowi 30 kW, który odczyt
 * modelu materializował z pól nN; ta fabrykacja została usunięta (zero danych
 * spoza modelu), więc fixture opisuje teraz sieć, którą projektant naprawdę
 * buduje: stacja z zadeklarowanym układem TN-C-S (IEC 60364, E063) i jeden
 * odbiór na szynie nN.
 */
async function dolozOdbiorNn(
  request: APIRequestContext,
  caseId: string,
  snapshot: DomainOpResponse['snapshot'],
): Promise<void> {
  const napiecia = new Map((snapshot?.buses ?? []).map((bus) => [bus.ref_id, bus.voltage_kv]));
  const stacja = (snapshot?.substations ?? []).find(
    (substation) =>
      substation.station_type !== 'gpz'
      && (substation.bus_refs ?? []).some((ref) => (napiecia.get(ref) ?? Infinity) < 1.0),
  );
  expect(stacja, 'stacja SN/nN z szyną nN').toBeTruthy();
  const szynaNn = (stacja?.bus_refs ?? []).find((ref) => (napiecia.get(ref) ?? Infinity) < 1.0);
  const pole = await executeDomainOp(request, caseId, 'add_nn_outgoing_field', {
    station_ref: stacja?.ref_id,
    bus_nn_ref: szynaNn,
    field_name: 'Odpływ nN 1',
    catalog_binding: buildCatalogBinding('APARAT_NN', 'cb_nn_630a'),
  });
  const feederRef = pole.changes?.created_element_ids?.[0];
  expect(feederRef, 'pole odpływowe nN utworzone').toBeTruthy();
  await executeDomainOp(request, caseId, 'add_nn_load', {
    feeder_ref: feederRef,
    active_power_kw: 150.0,
    cos_phi: 0.95,
    load_name: 'Odbiór nN 1',
    catalog_binding: buildCatalogBinding('OBCIAZENIE', 'load_przem_75kw'),
  });
}

async function zbudujSiecGotowaDoObliczen(
  request: APIRequestContext,
  caseId: string,
): Promise<{ stationSnBusRefs: string[]; kabelRefs: string[] }> {
  let op = await executeDomainOp(request, caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: buildCatalogBinding('ZRODLO_SN', SOURCE_ID),
    hv_voltage_kv: 110.0,
    transformer_sn_mva: 25.0,
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
    // B-12: aparat pól SN wskazany JAWNIE (operacja nie dobiera go sama).
    field_apparatus_catalog_ref: 'sw-cb-abb-vd4-17kv-630a',
    segment_id: segmentRefs[segmentRefs.length - 1],
    station_type: 'B',
    insert_at: { value: 0.5 },
    station: { sn_voltage_kv: 15.0, nn_voltage_kv: 0.4, nn_earthing: { lv_system: 'TN-C-S' } },
    // KOMPLETNOSC-POLA-TR (klasa A): stacja SN/nN Z transformatorem — pole roli
    // 'TR' dopisane, bo realna rozdzielnia realizuje odejscie do transformatora
    // polem transformatorowym. Kreator stacji tworzy je domyslnie, wiec fixture
    // bez niego opisywal siec, ktorej kreator by nie zbudowal.
    sn_fields: ['IN', 'OUT', 'FEEDER', 'TR'],
    transformer: {
      create: true,
      catalog_binding: buildCatalogBinding('TRAFO_SN_NN', TRAFO_ID),
    },
    // Odbiór „potrzeby własne" (G-STK-3, `_materialize_station_auxiliary_load`)
    // — JAWNY, bo bez niego sieć nie ma ŻADNEGO odbioru/generatora, a
    // `POST .../runs {analysis_type:'LOAD_FLOW'}` (test K5-B b niżej) odrzuca
    // wtedy zgłoszenie: `analysis_available.load_flow = bool(enm.loads) or
    // bool(enm.generators)` (`enm/canonical_analysis.py`), oba puste bez tego
    // bloku (naprawa regresji CI-D — 30 s+ nigdy nie pomoże, gdy backend
    // odpowiada 409 od razu). Wartości jak w `legenda-na-zadanie.spec.ts`
    // (ten sam wzorzec fixture'u).
    station_auxiliary: { active_power_kw: 5.0, cos_phi: 0.95 },
    // Układ uziemienia sieci nN (G-STK-1) — WYMAGANY konsekwencją powyższego:
    // stacja z odbiorem nN bez układu sieci nN na transformatorze (`Transformer.lv_earthing_system`, W5-A) jest E063 (BLOKER,
    // `enm/validator.py` — IEC 60364-4-41, ochrona przeciwporażeniowa), więc
    // pętla domykania blokerów niżej (bez obsługi kodu E063) nigdy by go nie
    // zamknęła i `readiness.ready` zostałby `false` na stałe (naprawa CI-D).
    nn_earthing: { lv_system: 'TN-S' },
  });

  // Szyny SN stacji — bus_ref rozwiązywalny na stację (resolveStationRef →
  // findStationRefByBus po FK substation.bus_refs); napięcie z listy szyn.
  const napiecia = new Map(
    (op.snapshot?.buses ?? []).map((bus) => [bus.ref_id, bus.voltage_kv]),
  );
  const stationSnBusRefs = (op.snapshot?.substations ?? [])
    .flatMap((substation) => substation.bus_refs ?? [])
    .filter((ref) => (napiecia.get(ref) ?? 0) >= 1.0);
  expect(stationSnBusRefs.length).toBeGreaterThan(0);

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
  await dolozOdbiorNn(request, caseId, op.snapshot);

  // Domknięcie ewentualnych blokerów gotowości (katalogi / impedancje).
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
  return { stationSnBusRefs, kabelRefs: odcinkiLiniowe.map((branch) => branch.ref_id) };
}

/** Bieg przez API execution — zwraca id przebiegu DONE (wzorzec deep-link). */
async function uruchomBiegPrzezApi(
  request: APIRequestContext,
  caseId: string,
  analysisType: 'SC_3F' | 'LOAD_FLOW',
  solverInput: Record<string, unknown> = {},
): Promise<string> {
  const createRunResponse = await request.post(
    `${BACKEND_BASE}/api/execution/study-cases/${caseId}/runs`,
    { data: { analysis_type: analysisType, solver_input: solverInput } },
  );
  expect(createRunResponse.ok(), await createRunResponse.text()).toBeTruthy();
  const run = (await createRunResponse.json()) as { id: string };

  const executeResponse = await request.post(
    `${BACKEND_BASE}/api/execution/runs/${run.id}/execute`,
    { timeout: 90000 },
  );
  expect(executeResponse.ok(), await executeResponse.text()).toBeTruthy();
  return run.id;
}

/** Przeładowanie powłoki z czekaniem na odświeżenie migawki modelu z serwera. */
async function przeladujPowloke(page: Page): Promise<void> {
  const refreshResponsePromise = page
    .waitForResponse(
      (response) =>
        response.url().includes('/enm/domain-ops')
        && response.request().method() === 'POST'
        && (response.request().postData() ?? '').includes('"name":"refresh_snapshot"'),
      { timeout: 15000 },
    )
    .catch(() => null);
  await page.reload({ waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 30000 });
  await refreshResponsePromise;
}

/** Realna droga do E-28: Wyniki → „Pozostałe analizy" → karta koordynacji → Otwórz. */
async function otworzKoordynacje(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Wyniki i dowody \d$/ }).click();
  await expect(page.getByTestId('mvd-wyniki-warsztat')).toBeVisible({ timeout: 20000 });
  await otworzZakladkeWynikow(page, 'pozostale');
  const karta = page.getByTestId('mvd-analizy-karta-koordynacja');
  await expect(karta).toBeVisible({ timeout: 20000 });
  await karta.getByRole('button', { name: 'Otwórz' }).click();
  await expect(page.getByTestId('protection-coordination-page')).toBeVisible({ timeout: 20000 });
}


const ETYKIETA_LTI = 'Odwrotna długoczasowa (LTI, 120)';

/** Dodaje urządzenie w realnym formularzu: lokalizacja z modelu, zacisk, stopień 51. */
async function dodajUrzadzenie(
  page: Page,
  kabelRef: string,
  krzywa: 'LTI' | 'SI',
  pradRozruchowyA: string,
  tms: string,
): Promise<void> {
  await page.getByRole('button', { name: 'Dodaj urządzenie' }).click();
  const lokalizacja = page.getByTestId('device-location-select');
  await expect(lokalizacja).toBeVisible({ timeout: 20000 });
  await lokalizacja.selectOption(kabelRef);
  const zaciskOd = page.getByTestId('device-terminal-od');
  await expect(zaciskOd).toBeVisible({ timeout: 20000 });
  await zaciskOd.click();
  await expect(zaciskOd).toBeChecked();

  const stopien51 = page.locator('[data-testid="stage-editor-Stopień I> (51)"]');
  const selekty = stopien51.locator('select');
  await selekty.nth(0).selectOption('IEC');
  await selekty.nth(1).selectOption(krzywa);
  if (krzywa === 'LTI') {
    // Jedna etykieta w formularzu — ta sama, którą niesie jądro i adapter backendu.
    await expect(selekty.nth(1).locator('option:checked')).toHaveText(ETYKIETA_LTI);
    await expect(selekty.nth(1).locator('option', { hasText: /RI\b(?!.*LTI)/ })).toHaveCount(0);
  }
  const liczby = stopien51.locator('input[type="number"]');
  await liczby.nth(0).fill(pradRozruchowyA);
  await liczby.nth(1).fill(tms);
}

test('PROT-LTI: wybór krzywej LTI w formularzu nastaw → analiza → krzywa TCC i czasy zadziałania', async ({ page, request }) => {
  test.setTimeout(300000);

  const caseId = await createCaseFromUi(page, request);
  const { kabelRefs } = await zbudujSiecGotowaDoObliczen(request, caseId);
  expect(kabelRefs.length).toBeGreaterThan(1);
  // Koordynacja wiąże prąd zwarciowy MAX i MIN oraz prąd roboczy zacisku (decyzja O-51
  // pkt 7) — trzy realne biegi przypadku, ten sam tor API co klik „Oblicz".
  await uruchomBiegPrzezApi(request, caseId, 'SC_3F', { scenario: 'MAX' });
  await uruchomBiegPrzezApi(request, caseId, 'SC_3F', { scenario: 'MIN' });
  await uruchomBiegPrzezApi(request, caseId, 'LOAD_FLOW');

  await przeladujPowloke(page);
  await otworzKoordynacje(page);

  // Dwa urządzenia na dwóch odcinkach kabla modelu: LTI i SI (para selektywności).
  await dodajUrzadzenie(page, kabelRefs[kabelRefs.length - 1], 'LTI', '100', '0.1');
  await page.getByRole('button', { name: 'Zapisz konfigurację' }).click();
  await dodajUrzadzenie(page, kabelRefs[0], 'SI', '200', '0.3');
  await page.getByRole('button', { name: 'Zapisz konfigurację' }).click();

  // Nastawa krzywej trafiła do konfiguracji przypadku pod nazwą „LTI".
  const konfiguracja = await request.get(`${BACKEND_BASE}/api/study-cases/${caseId}/protection-config`);
  expect(konfiguracja.ok()).toBeTruthy();
  const tekstKonfiguracji = JSON.stringify(await konfiguracja.json());
  expect(tekstKonfiguracji).toContain('"variant":"LTI"');
  expect(tekstKonfiguracji).not.toMatch(/"variant":"RI"|IEC_LI"/);

  await expect(page.getByTestId('coordination-missing-currents')).toHaveCount(0, { timeout: 20000 });
  // Bieg analizy — odpowiedź backendu przechwycona z realnego kliku.
  const odpowiedzAnalizy = page.waitForResponse(
    (r) => r.request().method() === 'POST' && /protection-coordination/.test(r.url()),
    { timeout: 60000 },
  );
  await page.getByTestId('run-analysis-button').click();
  const odpowiedz = await odpowiedzAnalizy;
  expect(odpowiedz.ok(), await odpowiedz.text()).toBeTruthy();
  const { run_id: runId } = (await odpowiedz.json()) as { run_id: string };
  // Pełny wynik biegu — ten sam GET, którym ekran pobiera tabele i krzywe.
  const pelny = await request.get(`${BACKEND_BASE}/api/protection-coordination/${runId}`);
  expect(pelny.ok()).toBeTruthy();
  const wynik = (await pelny.json()) as {
    tcc_curves?: Array<{ curve_type: string; points?: Array<{ current_a: number; time_s: number }> }>;
    selectivity_checks?: Array<{ t_downstream_s: number | null; t_upstream_s: number | null }>;
  };
  const krzywaLti = (wynik.tcc_curves ?? []).find((c) => c.curve_type === 'IEC_LTI' || c.curve_type === 'LTI');
  expect(krzywaLti, JSON.stringify(wynik.tcc_curves?.map((c) => c.curve_type))).toBeTruthy();
  expect((krzywaLti?.points ?? []).length).toBeGreaterThan(1);
  expect(JSON.stringify(wynik)).not.toMatch(/"RI"|IEC_LI"|Odwrotna RI/);

  // Wykres TCC: legenda nazywa krzywą jedną etykietą.
  await page.getByTestId('tab-tcc').click();
  const wykres = page.getByTestId('tcc-chart');
  await expect(wykres).toBeVisible({ timeout: 20000 });
  await expect(wykres).toContainText(ETYKIETA_LTI);

  // Czasy zadziałania: tabela selektywności pokazuje liczby z backendu.
  await page.getByTestId('tab-selectivity').click();
  const tabela = page.getByTestId('selectivity-table');
  await expect(tabela).toBeVisible({ timeout: 20000 });
  const czasy = (wynik.selectivity_checks ?? []).flatMap((c) => [c.t_downstream_s, c.t_upstream_s]);
  const czasySkonczone = czasy.filter((t): t is number => typeof t === 'number' && Number.isFinite(t));
  expect(czasySkonczone.length).toBeGreaterThan(0);
  await expect(tabela).toContainText(czasySkonczone[0].toFixed(3));
});
