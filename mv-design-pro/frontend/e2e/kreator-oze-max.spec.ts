/**
 * K9-A — kreator źródła OZE, opcja MAX: pełne przejście z krokami APARATURA
 * i ZGODNOŚĆ oraz sekwencją zapisu (element → wiązania+profile → tryb pracy
 * → limity Q).
 *
 * Bramka 1 karty K9-A: przejście kreatora od kroku technologii do zapisu na
 * ŻYWEJ aplikacji (real backend, kliki NATYWNE — zero dispatchEvent); po
 * zapisie asercja PRZEZ API, że wytwórca MA w modelu wiązania aparaturowe
 * (CT/VT/zabezpieczenie), profile NC RfG, tryb pracy i limity mocy biernej;
 * readout osi gotowości wytwórcy widoczny w kreatorze.
 *
 * Wzorzec seedu sieci i wejścia do kreatora: e2e/nastawy-i-akcje-oze.spec.ts
 * (bramka K5-B b — akcja „Przyłącz źródło w tym węźle" ekranu zdolności).
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
// Falownik nN 0,4 kV (185 kW) — mieści się w TR blokowym 630 kVA i zgadza się
// napięciowo ze stroną nN transformatora stacji (walidacje wariantu blokowego).
const CONVERTER_ID = 'pv_inv_huawei_185';
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
    generators?: Array<{
      ref_id: string;
      meta?: Record<string, unknown>;
      limits?: Record<string, unknown> | null;
      materialized_params?: Record<string, unknown>;
    }>;
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
        idempotency_key: `e2e-oze-max-${name}-${String(++opCounter).padStart(4, '0')}`,
        payload,
      },
    },
    // Jawny limit: domyślne 10 s actionTimeout bywa za krótkie pod obciążeniem
    // pełnej suity (równolegli workerzy dzielą backend) — ten sam wzorzec i
    // powód co w e2e/legenda-na-zadanie.spec.ts (zmierzone: POST /api/projects
    // przekroczył 10 s w pełnym biegu 318 testów).
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
  const projectName = `E2E kreator OZE MAX ${suffix}`;
  const caseName = `Przypadek OZE MAX ${suffix}`;

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Bramka K9-A: kreator OZE z aparaturą i zgodnością',
      mode: 'TO-BE',
      voltage_level_kv: 15.0,
      frequency_hz: 50.0,
    },
    // Jawny limit — patrz komentarz w `executeDomainOp`.
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
    // Jawny limit — patrz komentarz w `executeDomainOp`.
    timeout: 30000,
  });
  expect(caseResponse.ok()).toBeTruthy();
  const studyCase = (await caseResponse.json()) as { id: string };

  return { projectId: project.id, projectName, caseId: studyCase.id, caseName };
}

async function createCaseFromUi(
  page: Page,
  request: APIRequestContext,
): Promise<{ projectId: string; caseId: string }> {
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
  return { projectId, caseId };
}

/** Sieć gotowa do obliczeń (wzorzec nastawy-i-akcje-oze): GPZ → magistrala → stacja z TR. */
async function zbudujSiecGotowaDoObliczen(
  request: APIRequestContext,
  caseId: string,
): Promise<{ stationSnBusRefs: string[] }> {
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
    // — JAWNY. Ten test woła `LOAD_FLOW` (`uruchomBiegPrzezApi`) ZANIM kreator
    // OZE zdąży dodać generator — bez tego bloku sieć nie ma ŻADNEGO
    // odbioru/generatora i `POST .../runs {analysis_type:'LOAD_FLOW'}` odrzuca
    // zgłoszenie 409 (`analysis_available.load_flow`, `enm/canonical_analysis.py`
    // — naprawa regresji CI-D, ten sam wzorzec co `nastawy-i-akcje-oze.spec.ts`
    // i `legenda-na-zadanie.spec.ts`).
    station_auxiliary: { active_power_kw: 5.0, cos_phi: 0.95 },
    // Układ uziemienia sieci nN (G-STK-1) — WYMAGANY konsekwencją powyższego:
    // stacja z odbiorem nN bez `meta.nn_earthing_system` jest E063 (BLOKER,
    // `enm/validator.py` — IEC 60364-4-41), a pętla domykania blokerów niżej
    // nie zna kodu E063, więc `readiness.ready` zostałby `false` na stałe.
    nn_earthing: { lv_system: 'TN-S' },
  });

  const napiecia = new Map(
    (op.snapshot?.buses ?? []).map((bus) => [bus.ref_id, bus.voltage_kv]),
  );
  // Szyna SN STACJI SN/nN (nie GPZ): stacja z częścią nN (szyna < 1 kV) ma
  // transformator blokowy 15/0,4 kV zgodny napięciowo z falownikiem nN.
  const stationSnBusRefs = (op.snapshot?.substations ?? [])
    .filter((substation) =>
      (substation.bus_refs ?? []).some((ref) => {
        const kv = napiecia.get(ref) ?? 0;
        return kv > 0 && kv < 1.0;
      }),
    )
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

  let readiness: OdczytGotowosci | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const readinessResponse = await request.get(
      `${BACKEND_BASE}/api/cases/${caseId}/engineering-readiness`,
      // Jawny limit — patrz komentarz w `executeDomainOp`.
      { timeout: 30000 },
    );
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

async function uruchomBiegPrzezApi(
  request: APIRequestContext,
  caseId: string,
  analysisType: 'SC_3F' | 'LOAD_FLOW',
): Promise<string> {
  const createRunResponse = await request.post(
    `${BACKEND_BASE}/api/execution/study-cases/${caseId}/runs`,
    // Jawny limit — patrz komentarz w `executeDomainOp`.
    { data: { analysis_type: analysisType }, timeout: 30000 },
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

/** Realna droga do kreatora OZE (bramka K5-B b): Wyniki → Zdolność → „Przyłącz źródło". */
async function otworzKreatorOzeZeZdolnosci(page: Page, busRef: string): Promise<void> {
  await page.getByRole('button', { name: /^Wyniki i dowody \d$/ }).click();
  await expect(page.getByTestId('mvd-wyniki-warsztat')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('mvd-wyniki-zakladka-zdolnosc').click();
  await expect(page.getByTestId('mvd-zdol-parametry')).toBeVisible({ timeout: 20000 });

  await page.getByTestId('mvd-zdol-krok').fill('1');
  await page.getByTestId('mvd-zdol-max').fill('2');
  await page.getByTestId(`mvd-zdol-wybor-${busRef}`).check();
  await page.getByTestId('mvd-zdol-oblicz').click();
  await expect(page.getByTestId('mvd-zdol-wynik')).toBeVisible({ timeout: 60000 });

  await page.getByTestId(`mvd-zdol-przylacz-${busRef}`).click();
  await expect(page.getByTestId('mvd-kreator-oze')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('mvd-kreator-oze-brak')).toHaveCount(0);
}

test('K9-A: kreator OZE MAX — aparatura i zgodność w jednym przepływie, wiązania i profile w modelu, readout gotowości (bramka 1)', async ({ page, request }) => {
  test.setTimeout(300000);

  const { caseId } = await createCaseFromUi(page, request);
  const { stationSnBusRefs } = await zbudujSiecGotowaDoObliczen(request, caseId);
  await uruchomBiegPrzezApi(request, caseId, 'LOAD_FLOW');

  await przeladujPowloke(page);
  await otworzKreatorOzeZeZdolnosci(page, stationSnBusRefs[0]);

  // ------------------------------------------------------------------
  // Krok 1 (tech): wariant blokowy + transformator stacji; panel konsekwencji
  // wariantu widoczny (opis strukturalny operacji).
  // ------------------------------------------------------------------
  await expect(page.getByTestId('mvd-kreator-oze-konsekwencje')).toBeVisible();
  await page.getByTestId('mvd-kreator-oze-wariant').selectOption('block_transformer');
  const transformatorSelect = page.getByTestId('mvd-kreator-oze-transformator');
  await expect(transformatorSelect).toBeVisible();
  await transformatorSelect.selectOption({ index: 1 });
  expect((await transformatorSelect.inputValue()).length).toBeGreaterThan(0);

  // ------------------------------------------------------------------
  // Krok 2 (katalog): falownik PV 0,4 kV mieszczący się w TR blokowym.
  // ------------------------------------------------------------------
  await page.getByTestId('mvd-kreator-oze-dalej').click();
  const konwerterSelect = page.getByTestId('mvd-kreator-oze-konwerter');
  await expect(konwerterSelect).toBeVisible({ timeout: 20000 });
  await konwerterSelect.selectOption(CONVERTER_ID);

  // ------------------------------------------------------------------
  // Krok 3 (dobór toru SN): parametry progu doboru obecne (jednoczesność,
  // obciążalność TR, rezerwa pola) — przechodzimy dalej bez materializacji toru
  // (transformator blokowy stacji wybrany w kroku 1).
  // ------------------------------------------------------------------
  await page.getByTestId('mvd-kreator-oze-dalej').click();
  await expect(page.getByTestId('mvd-kreator-oze-dobor-sekcja')).toBeVisible();
  await expect(page.getByTestId('mvd-kreator-oze-dobor-jednoczesnosc')).toBeVisible();
  await expect(page.getByTestId('mvd-kreator-oze-dobor-obciazalnosc-tr')).toBeVisible();
  await expect(page.getByTestId('mvd-kreator-oze-dobor-rezerwa-pole')).toBeVisible();

  // ------------------------------------------------------------------
  // Krok 4 (APARATURA — NOWY): CT, VT, zabezpieczenie z realnych katalogów
  // + referencja danych zwarciowych (pole jawnie bez walidacji katalogowej).
  // ------------------------------------------------------------------
  await page.getByTestId('mvd-kreator-oze-dalej').click();
  await expect(page.getByTestId('mvd-kreator-oze-aparatura')).toBeVisible();

  const ctSelect = page.getByTestId('mvd-kreator-oze-aparatura-ct');
  await expect(ctSelect.locator('option').nth(1)).toBeAttached({ timeout: 20000 });
  await ctSelect.selectOption({ index: 1 });
  const ctRef = await ctSelect.inputValue();
  expect(ctRef.length).toBeGreaterThan(0);

  const vtSelect = page.getByTestId('mvd-kreator-oze-aparatura-vt');
  await vtSelect.selectOption({ index: 1 });
  const vtRef = await vtSelect.inputValue();
  expect(vtRef.length).toBeGreaterThan(0);

  const zabSelect = page.getByTestId('mvd-kreator-oze-aparatura-zabezpieczenie');
  await zabSelect.selectOption({ index: 1 });
  const zabRef = await zabSelect.inputValue();
  expect(zabRef.length).toBeGreaterThan(0);

  await page.getByTestId('mvd-kreator-oze-aparatura-dane-zwarciowe').fill('KARTA-ZW-2026-01');

  // ------------------------------------------------------------------
  // Krok 5 (ZGODNOŚĆ — NOWY): profil operatora + krzywe LVRT/HVRT/P(f).
  // ------------------------------------------------------------------
  await page.getByTestId('mvd-kreator-oze-dalej').click();
  await expect(page.getByTestId('mvd-kreator-oze-zgodnosc')).toBeVisible();
  await page.getByTestId('mvd-kreator-oze-zgodnosc-profil').selectOption('ncrfg_pse');
  // LVRT/HVRT pozostają krzywymi OPERATORA (obwiednia FRT jest cechą profilu
  // przyłączeniowego), więc referencje są tu realnym kontraktem katalogu.
  await page.getByTestId('mvd-kreator-oze-zgodnosc-lvrt').selectOption('lvrt_pse_b');
  await page.getByTestId('mvd-kreator-oze-zgodnosc-hvrt').selectOption('hvrt_pse_b');
  // NASTAWA P(f) — kanon po karcie K-Q (2026-08-14): katalog NIE dzieli już
  // krzywych po operatorze i typie modułu (`pf_pse_b`), bo statyzm per typ
  // modułu był zgadnięty — rozporządzenie (UE) 2016/631 art. 13 ust. 2 podaje
  // statyzm jako NASTAWIALNY w przedziale 2-12 %. Identyfikator niesie dziś sam
  // nastaw (`pf_droop_5`, `pf_droop_3`, …), a lista NIE jest zawężana profilem.
  // Bierzemy pierwszą realną pozycję i PROWADZIMY jej wartość aż do asercji
  // modelu — wiązanie „co wybrano w kreatorze = co utrwalono w modelu" jest
  // mocniejsze niż zaszyty literał, który zgnije przy kolejnej transzy katalogu.
  const pfSelect = page.getByTestId('mvd-kreator-oze-zgodnosc-pf');
  await expect(pfSelect.locator('option').nth(1)).toBeAttached({ timeout: 20000 });
  await pfSelect.selectOption({ index: 1 });
  const pfCurveRef = await pfSelect.inputValue();
  expect(pfCurveRef, 'katalog musi oferować nastawę P(f)').toMatch(/^pf_droop_/);

  // ------------------------------------------------------------------
  // Krok 6 (regulacja): tryb pracy źródła + limity mocy biernej.
  // ------------------------------------------------------------------
  await page.getByTestId('mvd-kreator-oze-dalej').click();
  await expect(page.getByTestId('mvd-kreator-oze-tryb-pracy')).toBeVisible();
  await page.getByTestId('mvd-kreator-oze-tryb-pracy').selectOption('praca_sieciowa');
  await page.getByTestId('mvd-kreator-oze-qmin').fill('-0.05');
  await page.getByTestId('mvd-kreator-oze-qmax').fill('0.05');

  // ------------------------------------------------------------------
  // Krok 7 (zapis): bez auto-biegu (sekwencja mierzalna szybko) → Zapisz.
  // ------------------------------------------------------------------
  await page.getByTestId('mvd-kreator-oze-dalej').click();
  await expect(page.getByTestId('mvd-kreator-oze-autobieg-toggle')).toBeVisible();
  await page.getByTestId('mvd-kreator-oze-autobieg-toggle').selectOption('nie');
  await page.getByTestId('mvd-kreator-oze-zapisz').click();

  // Przebieg sekwencji: wszystkie etapy zapisane (uczciwy raport przebiegu).
  await expect(page.getByTestId('mvd-kreator-oze-sekwencja')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('mvd-kreator-oze-sekwencja-zrodlo')).toHaveAttribute('data-stan', 'zapisane');
  await expect(page.getByTestId('mvd-kreator-oze-sekwencja-wiazania')).toHaveAttribute('data-stan', 'zapisane');
  await expect(page.getByTestId('mvd-kreator-oze-sekwencja-tryb')).toHaveAttribute('data-stan', 'zapisane');
  await expect(page.getByTestId('mvd-kreator-oze-sekwencja-limity')).toHaveAttribute('data-stan', 'zapisane');

  // Readout osi gotowości wytwórcy — z modelu (końcówka gotowości), widoczny po zapisie.
  await expect(page.getByTestId('mvd-kreator-oze-gotowosc-der')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('mvd-kreator-oze-gotowosc-der-osie')).toBeAttached();
  // Oś zabezpieczeń niesie status i NAZWANY powód z modelu (nie lokalną regułę).
  await expect(page.getByTestId('mvd-kreator-oze-gotowosc-der-os-protection')).toContainText(
    'Zabezpieczenia',
  );

  // ------------------------------------------------------------------
  // Asercja PRZEZ API: wytwórca w ENM MA wiązania aparaturowe, profile,
  // tryb pracy i limity mocy biernej (bramka 1 karty K9-A).
  // ------------------------------------------------------------------
  const stanModelu = await executeDomainOp(request, caseId, 'refresh_snapshot', {});
  const generatory = stanModelu.snapshot?.generators ?? [];
  const wytworca = generatory.find(
    (g) => (g.materialized_params ?? {})['ct_catalog_ref'] !== undefined,
  );
  expect(wytworca, 'W modelu brak wytwórcy z wiązaniem CT — sekwencja zapisu nie utrwaliła wiązań').toBeTruthy();
  const zmaterializowane = wytworca!.materialized_params ?? {};
  expect(zmaterializowane['ct_catalog_ref']).toBe(ctRef);
  expect(zmaterializowane['vt_catalog_ref']).toBe(vtRef);
  expect(zmaterializowane['protection_catalog_ref']).toBe(zabRef);
  expect(zmaterializowane['fault_current_data_ref']).toBe('KARTA-ZW-2026-01');
  const profile = (zmaterializowane['profiles'] ?? {}) as Record<string, unknown>;
  expect(profile['nc_rfg_profile_ref']).toBe('ncrfg_pse');
  expect(profile['lvrt_curve_ref']).toBe('lvrt_pse_b');
  expect(profile['hvrt_curve_ref']).toBe('hvrt_pse_b');
  expect(profile['pf_curve_ref']).toBe(pfCurveRef);
  expect((wytworca!.meta ?? {})['operating_mode']).toBe('praca_sieciowa');
  const limity = (wytworca!.limits ?? {}) as Record<string, unknown>;
  expect(limity['q_min_mvar']).toBe(-0.05);
  expect(limity['q_max_mvar']).toBe(0.05);
});
