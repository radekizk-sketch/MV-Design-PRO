/**
 * K5-B — pętle decyzji: wykonawca nastaw E-28 + akcje wyjściowe strumienia OZE.
 *
 * Bramka (a): E-28 „Koordynacja zabezpieczeń" — zmiana nastawy urządzenia
 * zapisuje się do KONFIGURACJI PRZYPADKU (PUT /api/study-cases/{id}/
 * protection-config, overrides per urządzenie), a po pełnym przeładowaniu
 * przeglądarki (stan React wyzerowany) nastawa WRACA Z SERWERA. Przed K5-B
 * urządzenia żyły w `useState` i ginęły przy wyjściu ze strony.
 *
 * Bramka (b): akcja wyjściowa OZE — „Przyłącz źródło w tym węźle" na oknie
 * „Zdolność przyłączeniowa" otwiera formularz operacji `add_converter_source`
 * z preselekcją węzła (bus_ref → stacja przez FK modelu) na kanwie schematu.
 *
 * Wzorzec seedu sieci: e2e/deep-link-wyniki.spec.ts (real backend; sieć
 * budowana przez API domain-ops; interakcje NATYWNE — zero dispatchEvent).
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';


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
  snapshot?: {
    corridors?: Array<{ ordered_segment_refs?: string[] }>;
    branches?: Array<{ ref_id: string; type?: string }>;
    transformers?: Array<{ ref_id: string }>;
    buses?: Array<{ ref_id: string; voltage_kv: number }>;
    substations?: Array<{ ref_id: string; bus_refs?: string[] }>;
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
        idempotency_key: `e2e-nastawy-${name}-${String(++opCounter).padStart(4, '0')}`,
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
  const projectName = `E2E nastawy ${suffix}`;
  const caseName = `Przypadek nastawy ${suffix}`;

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Bramka K5-B: wykonawca nastaw E-28 + akcje wyjściowe OZE',
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
async function zbudujSiecGotowaDoObliczen(
  request: APIRequestContext,
  caseId: string,
): Promise<{ stationSnBusRefs: string[] }> {
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
    // B-12: aparat pól SN wskazany JAWNIE (operacja nie dobiera go sama).
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
    // stacja z odbiorem nN bez `meta.nn_earthing_system` jest E063 (BLOKER,
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
  return { stationSnBusRefs };
}

/** Bieg przez API execution — zwraca id przebiegu DONE (wzorzec deep-link). */
async function uruchomBiegPrzezApi(
  request: APIRequestContext,
  caseId: string,
  analysisType: 'SC_3F' | 'LOAD_FLOW',
): Promise<string> {
  const createRunResponse = await request.post(
    `${BACKEND_BASE}/api/execution/study-cases/${caseId}/runs`,
    { data: { analysis_type: analysisType } },
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
  await page.getByTestId('mvd-wyniki-zakladka-pozostale').click();
  const karta = page.getByTestId('mvd-analizy-karta-koordynacja');
  await expect(karta).toBeVisible({ timeout: 20000 });
  await karta.getByRole('button', { name: 'Otwórz' }).click();
  await expect(page.getByTestId('protection-coordination-page')).toBeVisible({ timeout: 20000 });
}

test('E-28: nastawa urządzenia zapisana do konfiguracji przypadku TRWA po pełnym przeładowaniu (bramka K5-B a)', async ({ page, request }) => {
  test.setTimeout(240000);

  const caseId = await createCaseFromUi(page, request);
  await zbudujSiecGotowaDoObliczen(request, caseId);
  await uruchomBiegPrzezApi(request, caseId, 'SC_3F');

  await przeladujPowloke(page);
  await otworzKoordynacje(page);

  // Realna ścieżka projektanta: dodaj urządzenie → wskaż element modelu →
  // zmień nastawę I> → zapisz.
  await page.getByRole('button', { name: 'Dodaj urządzenie' }).click();
  const lokalizacja = page.getByTestId('device-location-select');
  await expect(lokalizacja).toBeVisible({ timeout: 20000 });
  // Pierwszy REALNY element modelu z listy (opcja 0 = „wskaż element…").
  await lokalizacja.selectOption({ index: 1 });
  const wybranaLokalizacja = await lokalizacja.inputValue();
  expect(wybranaLokalizacja.length).toBeGreaterThan(0);

  const stopien51 = page.locator('[data-testid="stage-editor-Stopień I> (51)"]');
  const pradRozruchowy = stopien51.locator('input[type="number"]').first();
  await pradRozruchowy.fill('175');
  await page.getByRole('button', { name: 'Zapisz konfigurację' }).click();

  // Komunikat o zapisie (istniejący system notyfikacji) z CTA przeliczenia.
  await expect(
    page
      .getByTestId('notification-toast')
      .filter({ hasText: 'Nastawy zabezpieczeń zapisane w konfiguracji przypadku' })
      .first(),
  ).toBeVisible({ timeout: 20000 });

  // Nastawa trafiła do konfiguracji przypadku (kontrakt overrides per urządzenie).
  const konfiguracja = await request.get(
    `${BACKEND_BASE}/api/study-cases/${caseId}/protection-config`,
  );
  expect(konfiguracja.ok()).toBeTruthy();
  const overrides = ((await konfiguracja.json()) as {
    overrides: Record<string, { settings?: { stage_51?: { pickup_current_a?: number } } }>;
  }).overrides;
  const kluczeUrzadzen = Object.keys(overrides).filter((k) => k.startsWith('coordination_device:'));
  expect(kluczeUrzadzen).toHaveLength(1);
  expect(overrides[kluczeUrzadzen[0]].settings?.stage_51?.pickup_current_a).toBe(175);

  // WYJŚCIE I POWRÓT z pełnym przeładowaniem: stan React wyzerowany, więc
  // jedynym źródłem urządzenia jest serwer (hydratacja z GET protection-config).
  await przeladujPowloke(page);
  await otworzKoordynacje(page);

  // Wiersz urządzenia na liście (nazwa może też paść w panelu braków prądów —
  // celujemy w PRZYCISK wyboru urządzenia).
  const wierszUrzadzenia = page.getByRole('button', { name: /^Zabezpieczenie 1/ });
  await expect(wierszUrzadzenia).toBeVisible({ timeout: 20000 });
  // Lokalizacja z serwera — wiersz urządzenia nie mówi „lokalizacja niewskazana".
  await expect(page.getByText('lokalizacja niewskazana')).toHaveCount(0);

  // Nastawa wraca w edytorze (realny klik w urządzenie na liście).
  await wierszUrzadzenia.click();
  const pradPoPowrocie = page
    .locator('[data-testid="stage-editor-Stopień I> (51)"]')
    .locator('input[type="number"]')
    .first();
  await expect(pradPoPowrocie).toHaveValue('175', { timeout: 20000 });
});

test('OZE: „Przyłącz źródło w tym węźle" otwiera formularz źródła z preselekcją węzła (bramka K5-B b)', async ({ page, request }) => {
  test.setTimeout(240000);

  const caseId = await createCaseFromUi(page, request);
  const { stationSnBusRefs } = await zbudujSiecGotowaDoObliczen(request, caseId);
  await uruchomBiegPrzezApi(request, caseId, 'LOAD_FLOW');

  await przeladujPowloke(page);

  // Wyniki → zakładka „Zdolność przyłączeniowa" (grupa OZE).
  await page.getByRole('button', { name: /^Wyniki i dowody \d$/ }).click();
  await expect(page.getByTestId('mvd-wyniki-warsztat')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('mvd-wyniki-zakladka-zdolnosc').click();
  await expect(page.getByTestId('mvd-zdol-parametry')).toBeVisible({ timeout: 20000 });

  // Węzeł-kandydat = szyna SN STACJI (bus_ref rozwiązywalny na stację przez FK
  // modelu — formularz źródła OZE potrzebuje kontekstu stacji). Mała siatka
  // scenariuszy, żeby bieg hostingu był krótki.
  const busRef = stationSnBusRefs[0];
  await page.getByTestId('mvd-zdol-krok').fill('1');
  await page.getByTestId('mvd-zdol-max').fill('2');
  await page.getByTestId(`mvd-zdol-wybor-${busRef}`).check();
  await page.getByTestId('mvd-zdol-oblicz').click();
  await expect(page.getByTestId('mvd-zdol-wynik')).toBeVisible({ timeout: 60000 });

  // Akcja wyjściowa w wierszu węzła — realny klik.
  await page.getByTestId(`mvd-zdol-przylacz-${busRef}`).click();

  // Formularz źródła OZE otwarty na kanwie schematu Z KONTEKSTEM: sekcja
  // „brak stacji" NIE istnieje (bus_ref rozwiązany na stację przez FK modelu).
  await expect(page.getByTestId('mvd-kreator-oze')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('mvd-kreator-oze-brak')).toHaveCount(0);
  await page.getByTestId('mvd-kreator-oze-anuluj').click();
  await expect(page.getByTestId('mvd-kreator-oze')).toHaveCount(0);
});
