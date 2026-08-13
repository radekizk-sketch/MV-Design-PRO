/**
 * Stany zerowe z AKCJĄ + jedna prawda wskaźników chromu (bramka karty K6, H-5/H-6).
 *
 * INTENCJA (H-5): pusty ekran wyników nie może być ślepym zaułkiem. Świeży
 * projekt → zakładka „Zwarcia" pokazuje uczciwy stan zerowy Z PRZYCISKIEM
 * „Uruchom obliczenie zwarciowe"; natywny klik uruchamia REALNY bieg (ten sam
 * tor co „Oblicz"), a ekran wypełnia się wynikami.
 *
 * INTENCJA (H-6): wskaźniki chromu mają JEDNO źródło — serwerowe. Chip
 * gotowości musi zgadzać się z odpowiedzią `/api/cases/{id}/engineering-readiness`
 * (przed budową sieci: BLOKADY ⇒ „Model: w budowie"; po budowie: brak uwag),
 * a znacznik wyników — ze stanem przypadku na serwerze (`/api/study-cases/
 * project/{id}/active` → `result_status`). Asercje idą PRZECIWKO OBU ŹRÓDŁOM
 * (UI ↔ serwer) w obu stanach, więc przepięcie chipu z powrotem na martwy
 * `readinessLiveStore` (domyślnie `ready: true`, zerowe liczniki) natychmiast
 * czerwieni ten spec.
 *
 * Wzorzec seedu i budowy sieci: e2e/restart-po-biegu.spec.ts (real backend,
 * sieć budowana przez API domain-ops, obliczenie uruchamiane REALNYM klikiem).
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
/** Zrzuty do oceny właściciela (dyrektywa #8) — ŻYWA aplikacja, oba motywy. */
const KATALOG_ZRZUTOW = path.resolve(_dirname, '../../docs/audit/visual/flow-ekspert');

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
  };
};

type ReadinessResponse = {
  ready: boolean;
  by_severity?: Record<string, number>;
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
        idempotency_key: `e2e-stany-zerowe-${name}-${String(++opCounter).padStart(4, '0')}`,
        payload,
      },
    },
  });

  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as DomainOpResponse;
  expect(body.error ?? null).toBeNull();
  return body;
}

async function pobierzGotowosc(request: APIRequestContext, caseId: string): Promise<ReadinessResponse> {
  const response = await request.get(`${BACKEND_BASE}/api/cases/${caseId}/engineering-readiness`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as ReadinessResponse;
}

/**
 * Etykieta chipu gotowości WYPROWADZONA Z ODPOWIEDZI SERWERA — ta sama reguła
 * co `shell/strings.readinessLabel` (blokady przed ostrzeżeniami). Dzięki temu
 * asercja porównuje UI z serwerem, a nie z zapisaną na sztywno stałą.
 */
function oczekiwanaEtykietaGotowosci(gotowosc: ReadinessResponse): string {
  const blokady = gotowosc.by_severity?.BLOCKER ?? 0;
  const ostrzezenia = gotowosc.by_severity?.IMPORTANT ?? 0;
  const odmiana = (n: number, jeden: string, kilka: string, wiele: string): string => {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (n === 1) return jeden;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return kilka;
    return wiele;
  };
  if (blokady > 0) return `Gotowość: ${blokady} ${odmiana(blokady, 'blokada', 'blokady', 'blokad')}`;
  if (ostrzezenia > 0) {
    return `Gotowość: ${ostrzezenia} ${odmiana(ostrzezenia, 'ostrzeżenie', 'ostrzeżenia', 'ostrzeżeń')}`;
  }
  return 'Gotowość: brak uwag';
}

async function pobierzAktywnyPrzypadek(
  request: APIRequestContext,
  projectId: string,
): Promise<{ result_status?: string } | null> {
  const response = await request.get(`${BACKEND_BASE}/api/study-cases/project/${projectId}/active`);
  if (response.status() === 204 || response.status() === 404) return null;
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as { result_status?: string };
}

async function createProjectAndCase(
  request: APIRequestContext,
): Promise<{ projectId: string; projectName: string; caseId: string; caseName: string }> {
  const suffix = nextEntitySuffix();
  const projectName = `E2E stany zerowe ${suffix}`;
  const caseName = `Przypadek stany zerowe ${suffix}`;

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Bramka K6: stany zerowe z akcją + jedna prawda chromu',
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

async function otworzPowlokeZKontekstem(
  page: Page,
  seed: { projectId: string; projectName: string; caseId: string; caseName: string },
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

  let readiness: ReadinessResponse | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    readiness = await pobierzGotowosc(request, caseId);
    if (readiness.ready) break;

    for (const issue of (readiness.issues ?? []).filter((i) => i.code.includes('catalog') && i.element_ref)) {
      const isTrafo = issue.code.includes('transformer');
      await executeDomainOp(request, caseId, 'assign_catalog_to_element', {
        element_ref: issue.element_ref,
        catalog_binding: buildCatalogBinding(isTrafo ? 'TRAFO_SN_NN' : 'KABEL_SN', isTrafo ? TRAFO_ID : CABLE_ID),
      });
    }
    for (const issue of (readiness.issues ?? []).filter((i) => i.code === 'E005' && i.element_ref)) {
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

/**
 * Zrzut viewportu ŻYWEJ aplikacji w OBU motywach (przełącznik motywu powłoki —
 * ta sama kontrolka, której używa inżynier). Po zrzutach wraca do motywu
 * wyjściowego, żeby nie zmieniać kontekstu dalszych asercji.
 */
async function zrzutObuMotywow(page: Page, nazwa: string): Promise<void> {
  fs.mkdirSync(KATALOG_ZRZUTOW, { recursive: true });
  await page.screenshot({ path: path.join(KATALOG_ZRZUTOW, `${nazwa}-dark.png`) });
  await page.getByTestId('mvd-theme-toggle').click();
  await page.screenshot({ path: path.join(KATALOG_ZRZUTOW, `${nazwa}-light.png`) });
  await page.getByTestId('mvd-theme-toggle').click();
}

/**
 * Realna ścieżka projektanta do tabeli zwarć: przestrzeń „Wyniki i dowody" →
 * zakładka „Zwarcia". Selektor celuje w przycisk NAWIGACJI (etykieta + skrót,
 * np. „Wyniki i dowody 6") — po S9-11/W-4 bieg zostawia projektanta na
 * schemacie, więc w DOM współistnieje drugi legalny przycisk „Otwórz wyniki
 * i dowody" (pas „następny krok"), a niedookreślona nazwa łamie strict mode.
 */
async function otworzZakladkeZwarc(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Wyniki i dowody \d$/ }).click();
  await expect(page.getByTestId('mvd-wyniki-warsztat')).toBeVisible();
  await page.getByTestId('mvd-wyniki-zakladka-zwarcia').click();
}

test('stan zerowy zwarć ma akcję, która realnie uruchamia bieg i wypełnia ekran (H-5)', async ({ page, request }) => {
  test.setTimeout(240000);

  const seed = await createProjectAndCase(request);
  await otworzPowlokeZKontekstem(page, seed);
  await zbudujSiecGotowaDoObliczen(request, seed.caseId);
  // Powłoka musi zobaczyć zbudowany model (gotowość liczona z migawki serwera).
  await przeladujPowloke(page);

  // Pusty ekran zwarć POKAZUJE akcję (a nie tylko informację o braku wyniku).
  await otworzZakladkeZwarc(page);
  await expect(page.getByTestId('mvd-zwarcia-ekran-pusty')).toBeVisible();
  const akcja = page.getByTestId('mvd-zwarcia-pusty-akcja');
  await expect(akcja).toBeVisible();
  await expect(akcja).toHaveText('Uruchom obliczenie zwarciowe');
  await zrzutObuMotywow(page, 'stany-zerowe');

  // NATYWNY klik akcji stanu zerowego = pełny bieg SC przez ten sam tor co „Oblicz".
  await akcja.click();
  await expect(
    page.getByTestId('notification-toast').filter({ hasText: 'Obliczenie zakończone' }).first(),
  ).toBeVisible({ timeout: 90000 });

  // Ekran wypełnia się WYNIKAMI (stan zerowy znika).
  await otworzZakladkeZwarc(page);
  await expect(page.getByTestId('mvd-zwarcia-ekran')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('mvd-zwarcia-ekran-pusty')).toHaveCount(0);
  await expect(page.getByTestId('mvd-zwarcia-bilans')).toBeVisible();
});

test('chrom pokazuje stan zgodny z serwerem: gotowość i znacznik wyników (H-6)', async ({ page, request }) => {
  test.setTimeout(240000);

  const seed = await createProjectAndCase(request);
  await otworzPowlokeZKontekstem(page, seed);

  // ŹRÓDŁO 1 (serwer) — świeży przypadek bez modelu: gotowość ma BLOKADY.
  const gotowoscPrzed = await pobierzGotowosc(request, seed.caseId);
  expect(gotowoscPrzed.ready).toBe(false);
  const blokadyPrzed = gotowoscPrzed.by_severity?.BLOCKER ?? 0;
  expect(blokadyPrzed).toBeGreaterThan(0);

  // ŹRÓDŁO 2 (chrom powłoki) — MUSI mówić to samo: model w budowie, nie „zwalidowany".
  await przeladujPowloke(page);
  await expect(page.getByTestId('mvd-casebar-model')).toHaveText('Model: w budowie');
  await expect(page.getByTestId('mvd-casebar-readiness')).toHaveText(
    oczekiwanaEtykietaGotowosci(gotowoscPrzed),
  );
  // Znacznik wyników bez biegu = „brak" (serwer: result_status NONE).
  const przypadekPrzed = await pobierzAktywnyPrzypadek(request, seed.projectId);
  expect(przypadekPrzed?.result_status).toBe('NONE');
  await expect(page.getByTestId('mvd-casebar-results')).toHaveText('Wyniki: brak');

  // Budowa sieci do stanu gotowego + bieg REALNYM klikiem „Oblicz".
  await zbudujSiecGotowaDoObliczen(request, seed.caseId);
  await przeladujPowloke(page);

  const gotowoscPo = await pobierzGotowosc(request, seed.caseId);
  expect(gotowoscPo.ready).toBe(true);
  await expect(page.getByTestId('mvd-casebar-model')).toHaveText('Model: zwalidowany');
  // Uwaga inżynierska: `ready: true` NIE znaczy „brak uwag" — model gotowy do
  // obliczeń może nieść ostrzeżenia. Chip ma pokazywać liczby SERWERA, nie
  // wygodną stałą (dawne, martwe źródło zawsze mówiło „brak uwag").
  await expect(page.getByTestId('mvd-casebar-readiness')).toHaveText(
    oczekiwanaEtykietaGotowosci(gotowoscPo),
  );

  await page.getByRole('button', { name: 'Oblicz', exact: true }).click();
  await expect(
    page.getByTestId('notification-toast').filter({ hasText: 'Obliczenie zakończone' }).first(),
  ).toBeVisible({ timeout: 90000 });

  // ŹRÓDŁO 1 (serwer) po biegu: przypadek ma wyniki aktualne…
  const przypadekPo = await pobierzAktywnyPrzypadek(request, seed.projectId);
  expect(przypadekPo?.result_status).toBe('FRESH');
  // …ŹRÓDŁO 2 (chrom) musi to odzwierciedlić BEZ przeładowania strony
  // (odświeżenie przypadku po zdarzeniu „wyniki-gotowe" — H-6 R2).
  await expect(page.getByTestId('mvd-casebar-results')).toHaveText('Wyniki: aktualne', { timeout: 30000 });

  // Pasek stanu: etykieta ostatniego przebiegu (H-6 R3) i wersja modelu (R4)
  // mają realnych dostawców — nie „—".
  await expect(page.getByTestId('mvd-status-run')).not.toHaveText('Przebieg: —');
  await expect(page.getByTestId('mvd-status-fingerprint')).not.toHaveText('Wersja modelu: —');

  await zrzutObuMotywow(page, 'chrom-po-biegu');
});
