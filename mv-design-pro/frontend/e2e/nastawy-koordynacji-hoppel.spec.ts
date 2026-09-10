/**
 * Smoke koordynacji zabezpieczeń — nastawy metodą Hoppela (karta W3-C1).
 *
 * INTENCJA: ekran „Koordynacja zabezpieczeń" (E-28) pokazuje nastawy I>/I>>
 * policzone z REALNEGO zwarcia trójfazowego (gałąź maksymalna c_max) tego
 * przypadku — kasacja V12K-189 (druga metodyka, 0 konsumentów) oznacza, że
 * `SekcjaNastaw.tsx` idzie odtąd WYŁĄCZNIE przez `/analysis-runs/{id}/nastawy`
 * (metoda Hoppela). Droga: kotwica (bieg SC_3F przez realny klik „Oblicz") →
 * wybór chronionego odcinka i kolejnej szyny → tabela nastaw → dobór aparatu.
 *
 * Wzorzec URUCHOMIENIA BIEGU (klik „Oblicz", toast, zakładka koordynacji):
 * e2e/restart-po-biegu.spec.ts / e2e/critical-run-flow.spec.ts (real backend).
 * Wzorzec SIECI CELOWO INNY niż tamte specy — patrz `zbudujSiecGotowaDoObliczen`
 * niżej: magistrala trzech odcinków `continue_trunk_segment_sn` (wzorzec
 * critical-run-flow) ma końce `bus/.../downstream` otagowane `helper_bus`
 * (`enm/assembler.py::skip_short_circuit_target`), więc bieg 3F świadomie
 * pomija je jako punkty raportowalne — nastawy wymagają prądu zwarciowego na
 * POCZĄTKU, KOŃCU chronionego odcinka I kolejnej szynie, więc magistrala z tego
 * wzorca nigdy nie da kompletu trzech realnych punktów. Ta sieć ma zamiast tego
 * DWIE stacje SN wprost połączone jednym odcinkiem (obie szyny SN stacji są
 * realnymi punktami raportowalnymi) — dokładnie kontrakt, którego ten ekran
 * wymaga.
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

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
    branches?: Array<{ ref_id: string; type?: string; to_bus_ref?: string }>;
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
  const projectName = `E2E nastawy Hoppela ${suffix}`;
  const caseName = `Przypadek nastaw ${suffix}`;

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Test ekranu koordynacji — nastawy metoda Hoppela (karta W3-C1)',
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

/**
 * Dwie stacje w SZEREGU na JEDNYM odcinku źródłowym (nie magistrala trzech
 * odcinków wzorca restart-po-biegu/critical-run-flow — patrz uzasadnienie
 * niżej). Topologia: GPZ →(segment_L)→ Stacja 1 →(segment_R_L)→ Stacja 2
 * →(segment_R_R)→ kikut magistrali.
 *
 * DLACZEGO NIE trzy odcinki `continue_trunk_segment_sn` + JEDNA stacja na
 * końcu (wzorzec innych e2e): końce zwykłych odcinków magistrali
 * (`bus/.../downstream`) niosą tag `helper_bus`
 * (`enm/assembler.py::skip_short_circuit_target`) — bieg zwarciowy 3F ŚWIADOMIE
 * pomija je jako punkty raportowalne (to punkty prowizoryczne „w trakcie
 * budowy", nie realne miejsca pomiaru). Chroniony odcinek nastaw wymaga
 * prądu zwarciowego na POCZĄTKU, KOŃCU i KOLEJNEJ SZYNIE — wszystkie trzy
 * muszą być realnymi (nie-`helper`) punktami. Jedyne realne punkty w tej
 * rodzinie operacji budowy sieci to szyny SN stacji (`sn_bus`) i szyna
 * źródła — więc chroniony odcinek musi łączyć DWIE stacje wprost, bez
 * kikuta magistrali pomiędzy nimi. Osiąga się to WSTAWIAJĄC DRUGĄ stację na
 * odcinku `_R` pozostałym po wstawieniu pierwszej (nie przez kolejne
 * `continue_trunk_segment_sn`, które zawsze wraca do STAREGO kikuta
 * magistrali, nie do nowo wstawionej stacji — zmierzone bezpośrednim
 * odtworzeniem sekwencji operacji przy diagnozie tej karty).
 */
async function zbudujSiecGotowaDoObliczen(
  request: APIRequestContext,
  caseId: string,
): Promise<{ chronionyOdcinek: string; kolejnaSzyna: string }> {
  let op = await executeDomainOp(request, caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: buildCatalogBinding('ZRODLO_SN', SOURCE_ID),
    hv_voltage_kv: 110.0,
    transformer_sn_mva: 25.0,
  });

  op = await executeDomainOp(request, caseId, 'continue_trunk_segment_sn', {
    segment: {
      rodzaj: 'KABEL',
      dlugosc_m: 300,
      name: 'Odcinek źródłowy',
      catalog_binding: buildCatalogBinding('KABEL_SN', CABLE_ID),
    },
  });
  const segmentRefs = op.snapshot?.corridors?.[0]?.ordered_segment_refs ?? [];
  expect(segmentRefs.length).toBeGreaterThan(0);
  const segmentZrodlowy = segmentRefs[segmentRefs.length - 1];

  const stacja = {
    field_apparatus_catalog_ref: 'sw-cb-abb-vd4-17kv-630a',
    station_type: 'B',
    insert_at: { value: 0.5 },
    station: { sn_voltage_kv: 15.0, nn_voltage_kv: 0.4 },
    sn_fields: ['IN', 'OUT', 'FEEDER', 'TR'],
    transformer: { create: true, catalog_binding: buildCatalogBinding('TRAFO_SN_NN', TRAFO_ID) },
  };

  // Stacja 1: dzieli odcinek źródłowy na `segment_L` (GPZ -> Stacja 1) i
  // `segment_R` (Stacja 1 -> stary kikut magistrali).
  op = await executeDomainOp(request, caseId, 'insert_station_on_segment_sn', {
    ...stacja,
    segment_id: segmentZrodlowy,
  });
  const chronionyOdcinek = (op.snapshot?.branches ?? []).find(
    (b) => b.ref_id === `${segmentZrodlowy}_L`,
  )?.ref_id;
  expect(chronionyOdcinek).toBeTruthy();
  const segmentR = (op.snapshot?.branches ?? []).find((b) => b.ref_id === `${segmentZrodlowy}_R`)
    ?.ref_id;
  expect(segmentR).toBeTruthy();

  // Stacja 2: dzieli `segment_R` na `segment_R_L` (Stacja 1 -> Stacja 2,
  // ODCINEK REALNY MIĘDZY DWIEMA SZYNAMI STACYJNYMI — kandydat kolejnej
  // strefy selektywności chronionego odcinka) i `segment_R_R` (Stacja 2 ->
  // stary kikut magistrali, poza zakresem tego testu).
  op = await executeDomainOp(request, caseId, 'insert_station_on_segment_sn', {
    ...stacja,
    segment_id: segmentR,
  });
  const kolejnaSzyna = (op.snapshot?.branches ?? []).find((b) => b.ref_id === `${segmentR}_L`)
    ?.to_bus_ref;
  expect(kolejnaSzyna).toBeTruthy();

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

  return { chronionyOdcinek: chronionyOdcinek as string, kolejnaSzyna: kolejnaSzyna as string };
}

async function otworzZakladkeKoordynacji(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Wyniki i dowody \d$/ }).click();
  await expect(page.getByTestId('mvd-wyniki-warsztat')).toBeVisible();
  await page.getByTestId('mvd-wyniki-zakladka-koordynacja').click();
}

test('kotwica → wybór odcinka → tabela nastaw I>/I>> widoczna (real backend, metoda Hoppela)', async ({
  page,
  request,
}) => {
  test.setTimeout(240000);

  const caseId = await createCaseFromUi(page, request);
  const { chronionyOdcinek, kolejnaSzyna } = await zbudujSiecGotowaDoObliczen(request, caseId);
  await page.reload({ waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 30000 });

  // REALNY klik „Oblicz" — pełny bieg SC_3F (kotwica c_max) przez UI.
  await page.getByRole('button', { name: 'Oblicz', exact: true }).click();
  const toastSukcesu = page
    .getByTestId('notification-toast')
    .filter({ hasText: 'Obliczenie zakończone' })
    .first();
  await expect(toastSukcesu).toBeVisible({ timeout: 90000 });

  await otworzZakladkeKoordynacji(page);

  // Kotwica znaleziona (nie stan zerowy „brak kotwicy") — sekcja z wyborem odcinka.
  await expect(page.getByTestId('mvd-koordynacja-nastawy')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('mvd-koordynacja-nastawy-brak')).toHaveCount(0);

  // Chroniony odcinek i kolejna szyna są jednoznaczne — topologia z
  // `zbudujSiecGotowaDoObliczen` ma DOKŁADNIE jedną parę (Stacja 1 -> Stacja
  // 2) z realnymi (nie-`helper`) prądami zwarciowymi na obu końcach.
  const selectLinia = page.getByTestId('mvd-koordynacja-nastawy-select-linia');
  await expect(selectLinia).toBeVisible();
  await selectLinia.selectOption(chronionyOdcinek);

  const selectSzyna = page.getByTestId('mvd-koordynacja-nastawy-select-szyna');
  await expect(selectSzyna).toBeVisible();
  await selectSzyna.selectOption(kolejnaSzyna);

  await page.getByTestId('mvd-koordynacja-nastawy-policz').click();

  const wynik = page.getByTestId('mvd-koordynacja-nastawy-wynik');
  await expect(wynik).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('mvd-koordynacja-nastawy-wynik-blad')).toHaveCount(0);
  // Nastawa I> jest liczbą realną (nie zero, nie placeholder) — z odpowiedzi backendu.
  await expect(wynik).toContainText(/\d+[.,]\d+ A/);
  await expect(page.getByTestId('mvd-koordynacja-nastawy-werdykt')).toBeVisible();

  // Pakiet dowodowy — link do TEJ SAMEJ fizyki w postaci ZIP.
  await expect(page.getByTestId('mvd-koordynacja-nastawy-pobierz-zip')).toHaveAttribute(
    'href',
    /\/api\/analysis-runs\/.+\/pakiet-dowodowy-nastaw\?/,
  );

  // Dobór aparatu (karta W3-C1 §0.4): lista aparatów z katalogu analitycznego
  // realnego backendu (nie atrapa) — wybór pierwszego renderuje werdykt.
  const selectAparat = page.getByTestId('mvd-koordynacja-dopasowanie-select-aparat');
  await expect(selectAparat).toBeVisible();
  const wartosciAparatow = await selectAparat.locator('option').evaluateAll((opcje) =>
    opcje.map((o) => (o as HTMLOptionElement).value).filter((v) => v.length > 0),
  );
  expect(wartosciAparatow.length).toBeGreaterThan(0);
  await selectAparat.selectOption(wartosciAparatow[0]);
  await expect(page.getByTestId('mvd-koordynacja-dopasowanie-wynik')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('mvd-koordynacja-dopasowanie-werdykt')).toBeVisible();
});
