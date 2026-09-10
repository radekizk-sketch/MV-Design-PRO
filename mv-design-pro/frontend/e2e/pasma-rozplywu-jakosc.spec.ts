/**
 * Karta W3-G2 — pasma zdrowego rozsądku rozpływu, e2e na REALNYM backendzie.
 *
 * DoD karty: „bieg rozpływu → sekcja pokazuje pasma i proweniencję". Buduje
 * sieć SN/nN przez REALNE operacje domenowe backendu (ta sama sprawdzona
 * receptura co `critical-run-flow.spec.ts`: GPZ → magistrala → stacja z
 * transformatorem → odgałęzienie → katalogi → gotowość), uruchamia PRAWDZIWY
 * bieg rozpływu mocy (`LOAD_FLOW`) i prowadzi UI NATYWNIE (klik zakładki
 * „Jakość") do sekcji „Pasma zdrowego rozsądku rozpływu" — bez mockowania
 * fetch, bez harnessu.
 *
 * Samodzielny plik (nie import ze `critical-run-flow.spec.ts`): karta nie
 * dotyka ścieżki krytycznej bramkującej CI dla wszystkich (`frontend-e2e-
 * smoke.yml`) — receptura sieci jest SKOPIOWANA z tego samego, sprawdzonego
 * źródła (helpery `executeDomainOp`/`buildCatalogBinding` identyczne co do
 * treści), nie wymyślona od nowa.
 *
 * JEDNA wizyta na stronie (receptura `ogniwo-zwarcie-aparatura.spec.ts`:
 * `zbudujProjektZeStacja` + `ustawKontekst` — sieć i bieg CAŁKOWICIE przez
 * `request`, kontekst do `localStorage` PRZED jedynym `page.goto`). Nawigacja
 * `/#analysis?run=...` różni się od poprzedniego URL wyłącznie fragmentem —
 * to nawigacja W TYM SAMYM dokumencie (bez przeładowania), więc DRUGA wizyta
 * na stronie (jak w `critical-run-flow.spec.ts`) zostawiłaby rejestr przebiegów
 * (`useExecutionRunsStore.runs`) i gotowość (`useSnapshotStore.readiness`)
 * zamrożone na stanie sprzed zbudowania sieci — poprawne dla asercji ogólnych
 * (`mvd-wyniki-warsztat`), fałszywie puste dla sekcji czytającej KONKRETNY
 * zakończony bieg rozpływu.
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
    buses?: Array<{ ref_id: string }>;
    branches?: Array<{ ref_id: string; type?: string }>;
    transformers?: Array<{ ref_id: string }>;
    substations?: Array<{
      ref_id: string;
      meta?: {
        field_specs?: Array<{
          field_ref?: string;
          field_role?: string | null;
          bay_role?: string | null;
        }>;
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
        idempotency_key: `e2e-pasma-${name}-${String(++opCounter).padStart(4, '0')}`,
        payload,
      },
    },
  });

  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as DomainOpResponse;
  expect(body.error ?? null).toBeNull();
  return body;
}

async function waitForAnalysisRunIndex(
  request: APIRequestContext,
  runId: string,
  timeoutMs = 15000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = 0;
  let lastBody = '';

  while (Date.now() < deadline) {
    const response = await request.get(`${BACKEND_BASE}/api/analysis-runs/${runId}/results/index`);
    lastStatus = response.status();
    if (response.ok()) {
      return;
    }
    lastBody = await response.text();
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    `Publiczny results/index nie jest gotowy dla runu ${runId}. status=${lastStatus} body=${lastBody}`,
  );
}

interface KontekstPrzypadku {
  projectId: string;
  projectName: string;
  caseId: string;
  caseName: string;
}

/**
 * Tworzy projekt i przypadek WYŁĄCZNIE przez API (bez wizyty na stronie) —
 * wizyta następuje raz, później, PO zbudowaniu sieci i biegu (patrz
 * `ustawKontekst` i komentarz nagłówka pliku).
 */
async function utworzProjektIPrzypadek(request: APIRequestContext): Promise<KontekstPrzypadku> {
  const suffix = nextEntitySuffix();
  const projectName = `E2E Pasma rozpływu ${suffix}`;
  const caseName = `Przypadek pasma ${suffix}`;

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Test e2e W3-G2 — pasma zdrowego rozsądku rozpływu',
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

  return { projectId: project.id, projectName, caseId: studyCase.id as string, caseName };
}

/**
 * Wpisuje KOMPLETNY kontekst (projekt/przypadek/bieg) do `localStorage` przed
 * jedyną wizytą na stronie — rodzaj przypadku i typ analizy zgodne z REALNYM
 * biegiem (`PowerFlowCase`/`LOAD_FLOW`, w odróżnieniu od `ShortCircuitCase`/
 * `SHORT_CIRCUIT` w `critical-run-flow.spec.ts`/`ogniwo-zwarcie-aparatura.
 * spec.ts`, gdzie bieg rzeczywiście jest zwarciowy), status wyników `FRESH`
 * (bieg już zakończony w chwili jedynej wizyty). Ten sam mechanizm co
 * `ustawKontekst` w `ogniwo-zwarcie-aparatura.spec.ts`.
 */
async function ustawKontekst(
  page: Page,
  seed: KontekstPrzypadku & { runId: string },
): Promise<void> {
  await page.addInitScript((dane) => {
    localStorage.setItem(
      'mv-design-app-state',
      JSON.stringify({
        state: {
          activeProjectId: dane.projectId,
          activeProjectName: dane.projectName,
          activeCaseId: dane.caseId,
          activeCaseName: dane.caseName,
          activeCaseKind: 'PowerFlowCase',
          activeCaseResultStatus: 'FRESH',
          activeSnapshotId: null,
          activeMode: 'MODEL_EDIT',
          activeRunId: dane.runId,
          activeAnalysisType: 'LOAD_FLOW',
          caseManagerOpen: false,
          issuePanelOpen: false,
        },
        version: 1,
      }),
    );
  }, seed);
}

/** Sieć minimalna gotowa do rozpływu — ta sama receptura co `critical-run-flow.spec.ts`
 * (GPZ → magistrala 3 odcinki → stacja SN/nN z transformatorem → odgałęzienie →
 * katalogi → domknięcie blokerów gotowości), zweryfikowana jako dająca `engineering-
 * readiness.ready === true`. */
async function zbudujGotowaSiec(request: APIRequestContext, caseId: string): Promise<void> {
  await executeDomainOp(request, caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: buildCatalogBinding('ZRODLO_SN', SOURCE_ID),
    hv_voltage_kv: 110.0,
    transformer_sn_mva: 25.0,
  });

  let op: DomainOpResponse = {};
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
    sn_fields: ['IN', 'OUT', 'FEEDER', 'TR'],
    transformer: {
      create: true,
      catalog_binding: buildCatalogBinding('TRAFO_SN_NN', TRAFO_ID),
    },
  });

  const station = (op.snapshot?.substations ?? []).find((item) => item.ref_id.includes('/station'));
  const branchField = station?.meta?.field_specs?.find((field) => (
    String(field.field_role ?? field.bay_role ?? '').toUpperCase().includes('ODG')
    || String(field.bay_role ?? '').toUpperCase() === 'FEEDER'
  ));
  expect(branchField?.field_ref).toBeTruthy();

  op = await executeDomainOp(request, caseId, 'start_branch_segment_sn', {
    from_ref: `${branchField!.field_ref}.BRANCH`,
    segment: {
      rodzaj: 'KABEL',
      dlugosc_m: 180,
      catalog_binding: buildCatalogBinding('KABEL_SN', CABLE_ID),
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

  // Rozpływ mocy (w odróżnieniu od zwarcia) wymaga co najmniej JEDNEGO odbioru
  // w sieci (`ENMValidator`: `load_flow = has_loads`) — bez tego kroku
  // `POST /runs {analysis_type: LOAD_FLOW}` kończy się 409 „Analiza rozpływu
  // mocy nie jest dostepna dla biezacego snapshotu ENM". Odbiór wprost na
  // ostatniej (najdalszej) szynie magistrali daje policzalny spadek napięcia.
  const buses = op.snapshot?.buses ?? [];
  expect(buses.length).toBeGreaterThan(0);
  const odbiorczaSzyna = buses[buses.length - 1].ref_id;
  await executeDomainOp(request, caseId, 'add_load_sn', {
    bus_ref: odbiorczaSzyna,
    active_power_kw: 500.0,
    cos_phi: 0.95,
  });

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

  let readiness: { ready: boolean; issues?: Array<{ code: string; element_ref?: string | null }> } | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const readinessResponse = await request.get(`${BACKEND_BASE}/api/cases/${caseId}/engineering-readiness`);
    expect(readinessResponse.ok()).toBeTruthy();
    readiness = (await readinessResponse.json()) as {
      ready: boolean;
      issues?: Array<{ code: string; element_ref?: string | null }>;
    };
    if (readiness.ready) break;

    const catalogIssues = (readiness.issues ?? []).filter(
      (issue) => issue.code.includes('catalog') && issue.element_ref,
    );
    const impedanceIssues = (readiness.issues ?? []).filter(
      (issue) => issue.code === 'E005' && issue.element_ref,
    );
    for (const issue of catalogIssues) {
      const catalogNamespace = issue.code.includes('transformer') ? 'TRAFO_SN_NN' : 'KABEL_SN';
      const catalogId = issue.code.includes('transformer') ? TRAFO_ID : CABLE_ID;
      await executeDomainOp(request, caseId, 'assign_catalog_to_element', {
        element_ref: issue.element_ref,
        catalog_binding: buildCatalogBinding(catalogNamespace, catalogId),
      });
    }
    for (const issue of impedanceIssues) {
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

test(
  'karta W3-G2: bieg rozpływu na realnym backendzie -> sekcja „Pasma zdrowego rozsądku rozpływu" pokazuje pasma i proweniencję',
  async ({ page, request }) => {
    const kontekst = await utworzProjektIPrzypadek(request);
    const { caseId } = kontekst;
    await zbudujGotowaSiec(request, caseId);

    // Realny bieg LOAD_FLOW (rozpływ) — kanoniczny tor wykonania.
    const createRunResponse = await request.post(
      `${BACKEND_BASE}/api/execution/study-cases/${caseId}/runs`,
      { data: { analysis_type: 'LOAD_FLOW' } },
    );
    expect(createRunResponse.ok()).toBeTruthy();
    const createRunPayload = (await createRunResponse.json()) as { id: string };
    const runId = createRunPayload.id;

    const executeRunResponse = await request.post(
      `${BACKEND_BASE}/api/execution/runs/${runId}/execute`,
    );
    expect(executeRunResponse.ok()).toBeTruthy();
    await waitForAnalysisRunIndex(request, runId);

    // JEDYNA wizyta na stronie — kontekst (włącznie z biegiem) wpisany z góry
    // do `localStorage`, więc rejestr przebiegów i gotowość ładują się od
    // razu ze stanem PO biegu (patrz komentarz nagłówka pliku/`ustawKontekst`).
    await ustawKontekst(page, { ...kontekst, runId });
    await page.goto(`/#analysis?run=${runId}`, { waitUntil: 'commit' });
    await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
    await expect(page.getByTestId('mvd-wyniki-warsztat')).toBeVisible();

    // Ścieżka NATYWNA: klik zakładki „Jakość" (nie wymuszony stan store'u).
    await page.getByTestId('mvd-wyniki-zakladka-jakosc').click();
    await expect(page.getByTestId('mvd-jakosc-ekran')).toBeVisible();

    // Sekcja karty W3-G2 pobiera dane z realnego backendu i renderuje pasma.
    const sekcja = page.getByTestId('mvd-jakosc-pasma-rozplywu');
    await expect(sekcja).toBeVisible({ timeout: 20000 });

    // PASMA: obie tabele (napięcia szyn + obciążenia gałęzi) i blok strat —
    // dowód, że backend policzył rozpływ i sanity-bounds go ocenił.
    await expect(page.getByTestId('mvd-jakosc-pasma-napiecia-podsumowanie')).toBeVisible();
    await expect(page.getByTestId('mvd-jakosc-pasma-obciazenia-podsumowanie')).toBeVisible();
    await expect(page.getByTestId('mvd-jakosc-pasma-straty')).toBeVisible();

    // PROWENIENCJA: cytat normy PN-EN 50160 i uzasadnienie progu strat — oba
    // WPROST z odpowiedzi backendu (żadna liczba fabrykowana w UI). Cytat
    // normy żyje w dymku (`title`) wiersza założenia — kontrakt wspólnego
    // wzorca (`wzorzec/SekcjaZalozen.tsx`: „pochodzenie/uwaga w dymku title"),
    // nie w widocznym tekście węzła.
    const wierszNormyNapiecia = sekcja
      .getByTestId('mvd-wyn-zalozenie')
      .filter({ hasText: 'Norma napięciowa' });
    await expect(wierszNormyNapiecia).toHaveAttribute('title', /PN-EN 50160/);
    await expect(sekcja).toContainText('Un ± 10');
    const blokStrat = page.getByTestId('mvd-jakosc-pasma-straty-uzasadnienie');
    await expect(blokStrat).toContainText('WIARYGODNOŚCI');

    // Bieg sieci wzorcowej jest zbieżny -> brak banera niezbieżności, statusy
    // trójstanowe widoczne wprost (dowód, że werdykt nie jest fabrykowany
    // placeholderem — pochodzi z realnej oceny backendu).
    await expect(page.getByTestId('mvd-jakosc-pasma-rozplywu-niezbiezny')).toHaveCount(0);
    await expect(sekcja).toContainText('zweryfikowany');

    // Pętla interakcji: wybór wiersza szyny pokazuje uzasadnienie w szczególe
    // (klik natywny na wierszu tabeli, jak w pozostałych sekcjach ekranu).
    const pierwszyWierszNapiec = sekcja.locator('table tbody tr').first();
    await pierwszyWierszNapiec.click();
    await expect(page.getByTestId('mvd-jakosc-pasma-napiecia-szczegol')).toBeVisible();
  },
);
