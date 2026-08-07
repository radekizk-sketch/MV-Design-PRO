/**
 * Restart przeglądarki po zakończonym biegu (bramka karty K2, defekt H-0).
 *
 * INTENCJA: wynik zakończonego przebiegu jest własnością SERWERA, nie pamięci
 * karty przeglądarki. Po pełnym flow (model → gotowość → „Oblicz" → wyniki na
 * ekranie) restart przeglądarki (`page.reload()`) NIE może cofnąć projektanta
 * do stanu zerowego: przestrzeń „Wyniki i dowody" ma nadal pokazywać wynik
 * przebiegu, a pasek przypadku — rewizję modelu.
 *
 * Wzorzec flow: e2e/critical-run-flow.spec.ts (real backend; sieć budowana
 * przez API domain-ops, obliczenie uruchamiane REALNYM klikiem „Oblicz").
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

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
    substations?: Array<{
      ref_id: string;
      meta?: {
        field_specs?: Array<{ field_ref?: string; field_role?: string; bay_role?: string }>;
      };
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
        idempotency_key: `e2e-restart-${name}-${String(++opCounter).padStart(4, '0')}`,
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
  const projectName = `E2E restart ${suffix}`;
  const caseName = `Przypadek restart ${suffix}`;

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Test hydratacji po restarcie przeglądarki (bramka K2)',
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

/** Buduje przez API kompletną, gotową do obliczeń sieć (wzorzec critical-run-flow). */
async function zbudujSiecGotowaDoObliczen(request: APIRequestContext, caseId: string): Promise<void> {
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
    sn_fields: ['IN', 'OUT', 'FEEDER'],
    transformer: {
      create: true,
      catalog_binding: buildCatalogBinding('TRAFO_SN_NN', TRAFO_ID),
    },
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

  // Domknięcie ewentualnych blokerów gotowości (katalogi / impedancje) —
  // ta sama pętla co w critical-run-flow.spec.ts.
  let readiness: { ready: boolean; issues?: Array<{ code: string; element_ref?: string | null }> } | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const readinessResponse = await request.get(`${BACKEND_BASE}/api/cases/${caseId}/engineering-readiness`);
    expect(readinessResponse.ok()).toBeTruthy();
    readiness = (await readinessResponse.json()) as typeof readiness;
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

/**
 * Realna ścieżka projektanta do tabeli zwarć: przestrzeń „Wyniki i dowody" →
 * zakładka „Zwarcia". Selektor celuje w przycisk NAWIGACJI (etykieta + skrót,
 * np. „Wyniki i dowody 6") — po S9-11/W-4 bieg zostawia projektanta na
 * schemacie, więc w DOM współistnieje drugi legalny przycisk „Otwórz wyniki
 * i dowody" (pas „następny krok"), a niedookreślona nazwa łamała strict mode.
 */
async function otworzZakladkeZwarc(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Wyniki i dowody \d$/ }).click();
  await expect(page.getByTestId('mvd-wyniki-warsztat')).toBeVisible();
  await page.getByTestId('mvd-wyniki-zakladka-zwarcia').click();
}

// DEFEKT H-0 (hydratacja) NAPRAWIONY w K2: powłoka hydratuje stan zależny
// z serwera po restarcie przeglądarki — `useHydratacjaPowloki`
// (src/ui2/shell/useHydratacjaPowloki.ts, wpięty w AppRoot) odtwarza rejestr
// zakresów (`loadCases`/`loadActiveCase`) i rejestr przebiegów
// (`setActiveStudyCaseId` → `loadRuns`), a `useWpiecieWynikow` ponawia
// ładowanie wyniku, gdy rejestr przebiegów doładuje się PO montażu
// (deps: `aktywnyRodzaj`). Ten spec jest bramką regresji tej naprawy.
test('po restarcie przeglądarki przestrzeń wyników nadal pokazuje wynik przebiegu (bramka K2)', async ({ page, request }) => {
  test.setTimeout(240000);

  const caseId = await createCaseFromUi(page, request);
  await zbudujSiecGotowaDoObliczen(request, caseId);

  // Powłoka musi zobaczyć zbudowany model (gotowość liczona z migawki serwera).
  await przeladujPowloke(page);

  // REALNY klik „Oblicz" (pasek tytułowy) — pełny bieg SC_3F przez UI.
  await page.getByRole('button', { name: 'Oblicz', exact: true }).click();
  const toastSukcesu = page
    .getByTestId('notification-toast')
    .filter({ hasText: 'Obliczenie zakończone' })
    .first();
  await expect(toastSukcesu).toBeVisible({ timeout: 90000 });

  // Wyniki WIDOCZNE przed restartem: tabela zwarć z bilansem (nie stan zerowy).
  await otworzZakladkeZwarc(page);
  await expect(page.getByTestId('mvd-zwarcia-ekran')).toBeVisible();
  await expect(page.getByTestId('mvd-zwarcia-ekran-pusty')).toHaveCount(0);
  await expect(page.getByTestId('mvd-zwarcia-bilans')).toBeVisible();
  // Pasek stanu pokazuje LICZBOWĄ rewizję modelu („Model: rew. N", nie „—").
  await expect(page.getByTestId('mvd-status-model')).toHaveText(/Model: rew\. \d+/);

  // RESTART przeglądarki (pełne przeładowanie karty = utrata stanu pamięci).
  await przeladujPowloke(page);

  // Pasek stanu nadal pokazuje rewizję modelu (migawka odtworzona z serwera).
  await expect(page.getByTestId('mvd-status-model')).toHaveText(/Model: rew\. \d+/);

  // Przestrzeń wyników nadal pokazuje wynik ZAKOŃCZONEGO przebiegu — nie stan
  // zerowy. To jest właściwa bramka K2: rejestr przebiegów + aktywny przebieg
  // + wynik muszą hydratować z serwera, nie z pamięci poprzedniej karty.
  await otworzZakladkeZwarc(page);
  await expect(page.getByTestId('mvd-zwarcia-ekran')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('mvd-zwarcia-ekran-pusty')).toHaveCount(0);
  await expect(page.getByTestId('mvd-zwarcia-bilans')).toBeVisible();
});
