/**
 * Świeżość wyników po edycji modelu (bramka karty U5, dług V12K-309 poz. 2).
 *
 * INTENCJA: kanon mówi wprost — zmiana modelu unieważnia wyniki przypadku
 * (Case Immutability Rule). Chrom temu przeczył: znacznik „Wyniki: aktualne"
 * trwał po edycji modelu następującej PO biegu, bo brał się WYŁĄCZNIE z
 * serwerowego `result_status`, a ten zmienia się dopiero, gdy ktoś jawnie
 * unieważni przypadek. Pomiar audytu: model rew. 9, wynik z rew. 8, chip
 * „aktualne". Po naprawie świeżość liczy się porównaniem rewizji: rewizji
 * modelu, na której policzono bieg (`analysis_case_context.rewizja_modelu`),
 * z bieżącą rewizją migawki.
 *
 * SCENARIUSZ (realny backend, realna droga inżyniera):
 * 1. sieć gotowa do obliczeń → bieg SC_3F (DONE),
 * 2. wejście na wynik: rewizje zgodne ⇒ chip „Wyniki: aktualne",
 * 3. projektant DOBUDOWUJE odcinek (realna edycja modelu, rewizja rośnie),
 * 4. wejście na ten sam wynik ⇒ chip „Wyniki: nieaktualne" i jest klikalny.
 *
 * Wzorzec seedu i budowy sieci: e2e/gotowosc-po-biegu.spec.ts (real backend).
 */
import { test, expect, type APIRequestContext } from '@playwright/test';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const FRONTEND_BASE = process.env.PLAYWRIGHT_FRONTEND_URL ?? 'http://127.0.0.1:5173';
const CABLE_ID = 'cable-tfk-yakxs-3x120';
const TRAFO_ID = 'tr-sn-nn-15-04-630kva-dyn11';
const SOURCE_ID = 'src-gpz-15kv-250mva-rx010';
const CATALOG_VERSION = '2024.1';
let opCounter = 0;
let entityCounter = 0;

type DomainOpResponse = {
  error?: string | null;
  snapshot?: {
    header?: { revision?: number };
    corridors?: Array<{ ordered_segment_refs?: string[] }>;
    branches?: Array<{ ref_id: string; type?: string }>;
    transformers?: Array<{ ref_id: string }>;
  };
};

type ReadinessResponse = {
  ready: boolean;
  issues?: Array<{ code: string; element_ref?: string | null }>;
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
        idempotency_key: `e2e-swiezosc-${name}-${String(++opCounter).padStart(4, '0')}`,
        payload,
      },
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const body = (await response.json()) as DomainOpResponse;
  expect(body.error ?? null).toBeNull();
  return body;
}

async function pobierzGotowosc(
  request: APIRequestContext,
  caseId: string,
): Promise<ReadinessResponse> {
  const response = await request.get(`${BACKEND_BASE}/api/cases/${caseId}/engineering-readiness`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as ReadinessResponse;
}

/** Bieżąca rewizja modelu — prosto z nagłówka migawki (bez zgadywania). */
async function rewizjaModelu(request: APIRequestContext, caseId: string): Promise<number> {
  const response = await request.get(`${BACKEND_BASE}/api/cases/${caseId}/enm`);
  expect(response.ok(), await response.text()).toBeTruthy();
  const body = (await response.json()) as { header?: { revision?: number } };
  const revision = body.header?.revision;
  expect(typeof revision).toBe('number');
  return revision as number;
}

/** Rewizja modelu, na której policzono bieg — z kontraktu przebiegu (V12K-264). */
async function rewizjaWyniku(request: APIRequestContext, runId: string): Promise<number> {
  const response = await request.get(`${BACKEND_BASE}/api/analysis-runs/${runId}`);
  expect(response.ok(), await response.text()).toBeTruthy();
  const body = (await response.json()) as {
    analysis_case_context?: { rewizja_modelu?: number | null };
    input_metadata?: { analysis_case_context?: { rewizja_modelu?: number | null } };
  };
  const revision =
    body.analysis_case_context?.rewizja_modelu
    ?? body.input_metadata?.analysis_case_context?.rewizja_modelu;
  expect(typeof revision).toBe('number');
  return revision as number;
}

async function createProjectAndCase(
  request: APIRequestContext,
): Promise<{ projectId: string; caseId: string }> {
  entityCounter += 1;
  const suffix = String(entityCounter).padStart(4, '0');

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: `E2E swiezosc po edycji ${suffix}`,
      description: 'Bramka U5: zmiana modelu unieważnia wyniki przypadku',
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
      name: `Przypadek swiezosci ${suffix}`,
      description: '',
      config: {},
      set_active: true,
    },
  });
  expect(caseResponse.ok()).toBeTruthy();
  const studyCase = (await caseResponse.json()) as { id: string };

  return { projectId: project.id, caseId: studyCase.id };
}

/** Buduje przez API sieć gotową do obliczeń (wzorzec gotowosc-po-biegu). */
async function zbudujSiecGotowaDoObliczen(
  request: APIRequestContext,
  caseId: string,
): Promise<void> {
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

  let readiness: ReadinessResponse | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    readiness = await pobierzGotowosc(request, caseId);
    if (readiness.ready) break;
    for (const issue of (readiness.issues ?? []).filter(
      (i) => i.code.includes('catalog') && i.element_ref,
    )) {
      const isTrafo = issue.code.includes('transformer');
      await executeDomainOp(request, caseId, 'assign_catalog_to_element', {
        element_ref: issue.element_ref as string,
        catalog_binding: buildCatalogBinding(
          isTrafo ? 'TRAFO_SN_NN' : 'KABEL_SN',
          isTrafo ? TRAFO_ID : CABLE_ID,
        ),
      });
    }
    for (const issue of (readiness.issues ?? []).filter((i) => i.code === 'E005' && i.element_ref)) {
      await executeDomainOp(request, caseId, 'update_element_parameters', {
        element_ref: issue.element_ref as string,
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

/** Bieg SC_3F przez API execution — zwraca id przebiegu z gotowym wynikiem. */
async function uruchomBiegScPrzezApi(request: APIRequestContext, caseId: string): Promise<string> {
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
  let lastStatus = 0;
  while (Date.now() < deadline) {
    const response = await request.get(`${BACKEND_BASE}/api/analysis-runs/${run.id}/results/index`);
    lastStatus = response.status();
    if (response.ok()) return run.id;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`results/index nie jest gotowy dla runu ${run.id} (status=${lastStatus})`);
}

test('edycja modelu PO biegu: chip świeżości przestaje mówić „aktualne" (bramka U5)', async ({
  browser,
  request,
}) => {
  test.setTimeout(300000);

  const { caseId } = await createProjectAndCase(request);
  await zbudujSiecGotowaDoObliczen(request, caseId);
  const runId = await uruchomBiegScPrzezApi(request, caseId);

  // PRZED edycją: rewizja modelu = rewizja, na której policzono wynik.
  const rewPrzed = await rewizjaModelu(request, caseId);
  const rewBiegu = await rewizjaWyniku(request, runId);
  expect(rewBiegu).toBe(rewPrzed);

  // Widok MODELU (żywa migawka w store'ie): rewizje zgodne ⇒ uczciwe „aktualne".
  const kontekstPrzed = await browser.newContext();
  try {
    const strona = await kontekstPrzed.newPage();
    await strona.goto(`${FRONTEND_BASE}/#sld?case=${caseId}`, { waitUntil: 'commit' });
    await strona.waitForSelector('[data-testid="app-ready"]', {
      state: 'attached',
      timeout: 90000,
    });
    await expect(strona.getByTestId('mvd-casebar-results')).toContainText('Wyniki: aktualne', {
      timeout: 30000,
    });
  } finally {
    await kontekstPrzed.close();
  }

  // EDYCJA MODELU PO BIEGU: projektant dobudowuje odcinek magistrali.
  await executeDomainOp(request, caseId, 'continue_trunk_segment_sn', {
    segment: {
      rodzaj: 'KABEL',
      dlugosc_m: 180,
      name: 'Odcinek dobudowany po biegu',
      catalog_binding: buildCatalogBinding('KABEL_SN', CABLE_ID),
    },
  });

  const rewPo = await rewizjaModelu(request, caseId);
  expect(rewPo).toBeGreaterThan(rewBiegu);
  // Rewizja WYNIKU się nie zmienia — wynik pochodzi ze starego modelu.
  expect(await rewizjaWyniku(request, runId)).toBe(rewBiegu);

  const kontekstPo = await browser.newContext();
  try {
    const strona = await kontekstPo.newPage();
    await strona.goto(`${FRONTEND_BASE}/#sld?case=${caseId}`, { waitUntil: 'commit' });
    await strona.waitForSelector('[data-testid="app-ready"]', {
      state: 'attached',
      timeout: 90000,
    });

    const chip = strona.getByTestId('mvd-casebar-results');
    await expect(chip).toContainText('Wyniki: nieaktualne', { timeout: 30000 });
    // Nieaktualność ma wyjście: znacznik jest przyciskiem do przestrzeni obliczeń.
    await expect(chip).toHaveAttribute('title', /Obliczenia/);
  } finally {
    await kontekstPo.close();
  }

  // OKNO WYNIKÓW (podgląd przebiegu w store'ie), ZIMNE WEJŚCIE na link biegu.
  //
  // NAPRAWA (karta TESTY-DRYF-E2E poz. 5, 2026-08-12; przepisanie wg zmiany
  // kanonu — CLAUDE.md Zero-Debt): dawny komentarz zakładał, że rewizja
  // migawki na tej trasie jest TRWALE nierozstrzygalna („MUSI powiedzieć
  // nie wiadomo"), więc test czekał (do 30 s) na DOSŁOWNY tekst „nieustalone".
  // To założenie jest dziś nieaktualne — `useRewizjeSwiezosci`
  // (`ui2/shell/shellStatus.ts`, komentarz przy `rewizjaBiezacegoModelu`)
  // wprost dokumentuje, że rewizja bieżącego modelu jest zasilana też
  // „odczytem gotowości PRZY ZIMNYM WEJŚCIU NA LINK PRZEBIEGU" — dokładnie
  // tą ścieżką, którą ćwiczy ten test (`browser.newContext()` + świeża
  // nawigacja na `#analysis?run=`). „Nieustalone" jest więc dziś WYŁĄCZNIE
  // krótkotrwałym stanem ładowania PRZED tym odczytem gotowości — zmierzone
  // asercją na dosłowny tekst ściga się z tym odczytem (zależnie od
  // timingu sieci albo łapie stan przejściowy, albo już rozstrzygnięty,
  // stąd migotanie testu między dwoma uruchomieniami). Intencja bez zmian
  // (chip NIGDY nie ma mówić „aktualne" — to była treść pomiaru audytu):
  // sprawdzamy OSTATECZNY, ROZSTRZYGNIĘTY werdykt („nieaktualne" — model
  // faktycznie zmienił się po biegu), nie migawkę stanu ładowania.
  const kontekstWynik = await browser.newContext();
  try {
    const strona = await kontekstWynik.newPage();
    await strona.goto(`${FRONTEND_BASE}/#analysis?run=${runId}&case=${caseId}`, {
      waitUntil: 'commit',
    });
    await strona.waitForSelector('[data-testid="app-ready"]', {
      state: 'attached',
      timeout: 90000,
    });
    await expect(strona.getByTestId('mvd-wyniki-warsztat')).toBeVisible({ timeout: 30000 });

    const chip = strona.getByTestId('mvd-casebar-results');
    await expect(chip).toContainText('Wyniki: nieaktualne', { timeout: 30000 });
    await expect(chip).not.toHaveText('Wyniki: aktualne');
  } finally {
    await kontekstWynik.close();
  }
});
