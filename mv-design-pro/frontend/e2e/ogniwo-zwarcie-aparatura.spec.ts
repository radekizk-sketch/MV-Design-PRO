/**
 * OGNIWO ŁAŃCUCHA: wynik zwarciowy → weryfikacja wytrzymałości aparatury
 * (bramka karty KD-4; dług nazwany imiennie w odbiorze V12K-287).
 *
 * INTENCJA: inżynier, który patrzy na prądy zwarciowe w punkcie, ma DOSTAĆ
 * w tym samym miejscu odpowiedź „czy aparatura pól tej stacji to wytrzyma" —
 * bez przechodzenia do konfiguratora stacji i zestawiania liczb w głowie.
 *
 * Spec idzie REALNĄ ścieżką: sieć ze stacją (operacje domenowe) → zapis
 * aparatury pól w konfiguracji stacji → bieg zwarciowy SC_3F → ekran zwarć →
 * wybór punktu → NATYWNY klik akcji weryfikacji → werdykty.
 *
 * ASERCJA NIE JEST LITERAŁEM UI: werdykt pokazany na ekranie porównujemy
 * z odpowiedzią TEJ SAMEJ końcówki backendu wywołanej niezależnie, dla prądów
 * pobranych z wyniku biegu (`/api/analysis-runs/{id}/results/short-circuit`).
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const CABLE_ID = 'cable-tfk-yakxs-3x120';
const TRAFO_ID = 'tr-sn-nn-15-04-630kva-dyn11';
const SOURCE_ID = 'src-gpz-15kv-250mva-rx010';
const CATALOG_VERSION = '2024.1';
/** Aparat z katalogu wytrzymałości backendu (`DEVICE_WITHSTAND_CATALOG`). */
const APARAT_ID = 'wstd_breaker_vacuum_15_25';
const POLE = 'P-01';
const CZAS_WYLACZENIA_S = 0.5;

let opCounter = 0;

type DomainOpResponse = {
  error?: string | null;
  snapshot?: {
    corridors?: Array<{ ordered_segment_refs?: string[] }>;
    branches?: Array<{ ref_id: string; type?: string }>;
    transformers?: Array<{ ref_id: string }>;
    substations?: Array<{ ref_id: string; bus_refs?: string[] }>;
  };
};

type WidokWytrzymalosci = {
  status: string;
  pola: Array<{
    pole: string;
    zrodlo: 'model' | 'konfiguracja';
    komunikat_pl: string;
    czas_wylaczenia: { zrodlo: string | null };
  }>;
};

type WierszZwarcia = {
  target_id: string;
  element_id?: string;
  target_name?: string | null;
  ikss_ka?: number | null;
  ip_ka: number | null;
  ith_ka: number | null;
};

function catalogBinding(namespace: string, itemId: string) {
  return {
    catalog_namespace: namespace,
    catalog_item_id: itemId,
    catalog_item_version: CATALOG_VERSION,
  };
}

async function domainOp(
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
        idempotency_key: `e2e-ogniwo-${name}-${String(++opCounter).padStart(4, '0')}`,
        payload,
      },
    },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as DomainOpResponse;
  expect(body.error ?? null).toBeNull();
  return body;
}

async function czekajNaWynik(request: APIRequestContext, runId: string): Promise<void> {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const response = await request.get(`${BACKEND_BASE}/api/analysis-runs/${runId}/results/index`);
    if (response.ok()) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Wynik biegu ${runId} nie pojawił się w czasie budżetu.`);
}

type Kontekst = {
  project: { id: string; name: string };
  studyCase: { id: string; name: string };
  stationRef: string;
  busRefy: string[];
};

/** Projekt + przypadek + sieć ze stacją (aparat pola WSKAZANY z katalogu APARAT_SN). */
async function zbudujProjektZeStacja(
  request: APIRequestContext,
  opis: string,
): Promise<Kontekst> {
  const znacznik = String(Date.now());
  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: `Ogniwo aparatura ${znacznik}`,
      description: opis,
      mode: 'TO-BE',
      voltage_level_kv: 15.0,
      frequency_hz: 50.0,
    },
  });
  expect(projectResponse.ok()).toBeTruthy();
  const project = (await projectResponse.json()) as { id: string; name: string };

  const caseResponse = await request.post(`${BACKEND_BASE}/api/study-cases`, {
    data: {
      project_id: project.id,
      name: `Przypadek ogniwa ${znacznik}`,
      description: '',
      config: {},
      set_active: true,
    },
  });
  expect(caseResponse.ok()).toBeTruthy();
  const studyCase = (await caseResponse.json()) as { id: string; name: string };

  await domainOp(request, studyCase.id, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: catalogBinding('ZRODLO_SN', SOURCE_ID),
    hv_voltage_kv: 110.0,
    transformer_sn_mva: 25.0,
  });

  let op: DomainOpResponse = {};
  for (const [idx, length] of [300, 250].entries()) {
    op = await domainOp(request, studyCase.id, 'continue_trunk_segment_sn', {
      segment: {
        rodzaj: 'KABEL',
        dlugosc_m: length,
        name: `Odcinek ${idx + 1}`,
        catalog_binding: catalogBinding('KABEL_SN', CABLE_ID),
      },
    });
  }
  const segmentRefs = op.snapshot?.corridors?.[0]?.ordered_segment_refs ?? [];
  expect(segmentRefs.length).toBeGreaterThan(0);

  op = await domainOp(request, studyCase.id, 'insert_station_on_segment_sn', {
    field_apparatus_catalog_ref: 'sw-cb-abb-vd4-17kv-630a',
    segment_id: segmentRefs[segmentRefs.length - 1],
    station_type: 'B',
    insert_at: { value: 0.5 },
    station: { sn_voltage_kv: 15.0, nn_voltage_kv: 0.4 },
    // KOMPLETNOSC-POLA-TR (klasa A): stacja SN/nN Z transformatorem — pole roli
    // 'TR' dopisane, bo realna rozdzielnia realizuje odejscie do transformatora
    // polem transformatorowym. Kreator stacji tworzy je domyslnie, wiec fixture
    // bez niego opisywal siec, ktorej kreator by nie zbudowal.
    sn_fields: ['IN', 'OUT', 'TR'],
    transformer: { create: true, catalog_binding: catalogBinding('TRAFO_SN_NN', TRAFO_ID) },
  });

  const stacja = (op.snapshot?.substations ?? []).find((s) => s.ref_id.includes('/station'));
  expect(stacja?.ref_id).toBeTruthy();
  const stationRef = stacja!.ref_id;
  const busRefy = stacja!.bus_refs ?? [];
  expect(busRefy.length).toBeGreaterThan(0);

  // Katalogi gałęzi/transformatorów (żeby bieg był policzalny). Kategoria
  // katalogu MUSI pasować do rodzaju gałęzi — pozycję KABEL_SN dostają
  // wyłącznie odcinki liniowe. Wcześniej ta pętla przypisywała kabel TAKŻE
  // aparatom pól, kasując po cichu ich wiązanie APARAT_SN (defekt zastany
  // naprawiony u źródła w karcie KD-6: `catalog.namespace_mismatch`).
  const odcinki = (op.snapshot?.branches ?? []).filter(
    (branch) => branch.type === 'cable' || branch.type === 'line_overhead',
  );
  expect(odcinki.length, 'Sieć musi mieć odcinki liniowe do policzenia biegu').toBeGreaterThan(0);
  for (const branch of odcinki) {
    await domainOp(request, studyCase.id, 'assign_catalog_to_element', {
      element_ref: branch.ref_id,
      catalog_binding: catalogBinding('KABEL_SN', CABLE_ID),
    });
  }
  for (const transformer of op.snapshot?.transformers ?? []) {
    await domainOp(request, studyCase.id, 'assign_catalog_to_element', {
      element_ref: transformer.ref_id,
      catalog_binding: catalogBinding('TRAFO_SN_NN', TRAFO_ID),
    });
    await domainOp(request, studyCase.id, 'update_element_parameters', {
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

  return { project, studyCase, stationRef, busRefy };
}

/** Bieg zwarciowy przypadku + wiersz punktu leżącego na szynie stacji. */
async function policzZwarcie(
  request: APIRequestContext,
  kontekst: Kontekst,
): Promise<{ runId: string; punkt: WierszZwarcia }> {
  const createRun = await request.post(
    `${BACKEND_BASE}/api/execution/study-cases/${kontekst.studyCase.id}/runs`,
    { data: { analysis_type: 'SC_3F' } },
  );
  expect(createRun.ok()).toBeTruthy();
  const run = (await createRun.json()) as { id: string };
  const executeRun = await request.post(`${BACKEND_BASE}/api/execution/runs/${run.id}/execute`);
  expect(executeRun.ok()).toBeTruthy();
  await czekajNaWynik(request, run.id);

  const wynikResponse = await request.get(
    `${BACKEND_BASE}/api/analysis-runs/${run.id}/results/short-circuit`,
  );
  expect(wynikResponse.ok()).toBeTruthy();
  const wynik = (await wynikResponse.json()) as { rows: WierszZwarcia[] };
  const wiersze = wynik.rows.filter((r) => r.ip_ka !== null && r.ith_ka !== null);
  expect(wiersze.length).toBeGreaterThan(0);

  const punkt = wiersze.find((r) => kontekst.busRefy.includes(r.element_id ?? r.target_id));
  expect(
    punkt,
    'Wynik biegu musi zawierać punkt zwarcia leżący na szynie badanej stacji.',
  ).toBeTruthy();
  return { runId: run.id, punkt: punkt! };
}

test('ogniwo: z wyniku zwarciowego wprost do werdyktu wytrzymałości aparatury pola', async ({
  page,
  request,
}) => {
  test.setTimeout(240000);

  const kontekst = await zbudujProjektZeStacja(
    request,
    'Bramka KD-4: wynik zwarciowy → wytrzymałość aparatury',
  );
  const { project, studyCase, stationRef } = kontekst;

  // --- Aparatura pola w konfiguracji stacji (źródło aparatu i czasu) ---------
  const configResponse = await request.put(
    `${BACKEND_BASE}/api/v1/projects/${project.id}/audit2-station-config/${encodeURIComponent(stationRef)}`,
    {
      data: {
        mv_neutral_grounding_ref: null,
        tap_changer_refs: [],
        der_specs: [],
        bay_device_withstand: {
          [POLE]: {
            device_id: APARAT_ID,
            // Liczby z DOBORU aparatu — ekran ma ich NIE użyć do sprawdzenia.
            i_peak_calculated_ka: 1.0,
            i_thermal_calculated_ka: 1.0,
            t_clearing_s: CZAS_WYLACZENIA_S,
          },
        },
      },
    },
  );
  expect(configResponse.ok()).toBeTruthy();

  // --- Bieg zwarciowy (prądy punktu = ŹRÓDŁO asercji, nie ekran) -------------
  const { runId, punkt: punktStacji } = await policzZwarcie(request, kontekst);

  // Werdykt referencyjny: TA SAMA końcówka, prądy z wyniku, czas z konfiguracji.
  const werdyktResponse = await request.post(
    `${BACKEND_BASE}/api/v1/catalog/audit2/validate-device-withstand`,
    {
      data: {
        device_id: APARAT_ID,
        i_peak_calculated_ka: punktStacji.ip_ka,
        i_thermal_calculated_ka: punktStacji.ith_ka,
        t_clearing_s: CZAS_WYLACZENIA_S,
      },
    },
  );
  expect(werdyktResponse.ok()).toBeTruthy();
  const werdykt = (await werdyktResponse.json()) as { ok: boolean; message_pl: string };

  // --- Aplikacja: ekran zwarć → wybór punktu → weryfikacja aparatury ---------
  await ustawKontekst(page, {
    projectId: project.id,
    projectName: project.name,
    caseId: studyCase.id,
    caseName: studyCase.name,
    runId,
  });

  await page.goto(`/#analysis?run=${runId}`, { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
  await page.getByRole('tab', { name: /Zwarcia/ }).click();
  await expect(page.getByTestId('mvd-zwarcia-ekran')).toBeVisible({ timeout: 30000 });

  // Wybór punktu zwarcia = NATYWNY klik wiersza tabeli punktów.
  const nazwaPunktu = punktStacji.target_name ?? punktStacji.target_id;
  await page.getByRole('row', { name: new RegExp(escapeRegExp(nazwaPunktu)) }).first().click();

  // Sekcja ogniwa pokazuje prądy TEGO punktu jako wejścia.
  const sekcja = page.getByTestId('mvd-zwarcia-aparatura');
  await expect(sekcja).toBeVisible();
  // Strefa pierwszoplanowa pokazuje NAZWĘ stacji; ref modelu jest atrybutem
  // maszynowym — asercja idzie po nim (nazwa może się zmienić, ref nie).
  await expect(page.getByTestId('mvd-zwarcia-aparatura-stacje')).toHaveAttribute(
    'data-stacje-ref',
    stationRef,
  );

  // AKCJA: jawne przejście do weryfikacji wytrzymałości.
  await page.getByTestId('mvd-zwarcia-aparatura-sprawdz').click();

  const wierszWerdyktu = page.getByTestId(`mvd-zwarcia-aparatura-pole-${POLE}`);
  await expect(wierszWerdyktu).toBeVisible({ timeout: 30000 });
  // Werdykt na ekranie = werdykt backendu dla prądów z biegu (nie literał UI).
  await expect(wierszWerdyktu).toHaveAttribute('data-withstand-ok', String(werdykt.ok));
  await expect(wierszWerdyktu).toContainText(werdykt.message_pl);
});

test('ogniwo: stacja BEZ ręcznej konfiguracji — werdykty z MODELU (KD-6)', async ({
  page,
  request,
}) => {
  test.setTimeout(240000);

  // SEDNO KARTY KD-6: żadnego zapisu `bay_device_withstand`. Aparat pola
  // pochodzi z pozycji katalogu APARAT_SN wskazanej przy wstawianiu stacji,
  // więc werdykt MUSI powstać bez ręcznego konfigurowania czegokolwiek.
  const kontekst = await zbudujProjektZeStacja(
    request,
    'Bramka KD-6: werdykty wytrzymałości z modelu, bez konfiguracji stacji',
  );
  const { project, studyCase, stationRef } = kontekst;

  // Kontrola: konfiguracja stacji NIE ISTNIEJE (404 = brak zapisu).
  const konfiguracja = await request.get(
    `${BACKEND_BASE}/api/v1/projects/${project.id}/audit2-station-config/${encodeURIComponent(stationRef)}`,
  );
  expect(
    konfiguracja.status(),
    'Ten scenariusz sprawdza tor MODELOWY — konfiguracji stacji nie może być.',
  ).toBe(404);

  const { runId, punkt: punktStacji } = await policzZwarcie(request, kontekst);

  // ODPOWIEDŹ REFERENCYJNA: ta sama końcówka, prądy z wyniku biegu. Asercje
  // ekranu idą PRZECIW NIEJ, nie przeciw literałom UI.
  const widokResponse = await request.post(
    `${BACKEND_BASE}/api/cases/${studyCase.id}/enm/wytrzymalosc-aparatury`,
    {
      data: {
        station_ref: stationRef,
        i_peak_ka: punktStacji.ip_ka,
        i_thermal_ka: punktStacji.ith_ka,
        ik_ka: punktStacji.ikss_ka ?? null,
      },
    },
  );
  expect(widokResponse.ok()).toBeTruthy();
  const widok = (await widokResponse.json()) as WidokWytrzymalosci;
  expect(widok.status).toBe('OK');
  expect(widok.pola.length, 'Stacja z aparatami w modelu musi dać wiersze werdyktu').toBeGreaterThan(
    0,
  );
  expect(widok.pola.every((p) => p.zrodlo === 'model')).toBeTruthy();

  // --- Aplikacja: ekran zwarć → wybór punktu → weryfikacja aparatury ---------
  await ustawKontekst(page, {
    projectId: project.id,
    projectName: project.name,
    caseId: studyCase.id,
    caseName: studyCase.name,
    runId,
  });

  await page.goto(`/#analysis?run=${runId}`, { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
  await page.getByRole('tab', { name: /Zwarcia/ }).click();
  await expect(page.getByTestId('mvd-zwarcia-ekran')).toBeVisible({ timeout: 30000 });

  const nazwaPunktu = punktStacji.target_name ?? punktStacji.target_id;
  await page.getByRole('row', { name: new RegExp(escapeRegExp(nazwaPunktu)) }).first().click();
  await page.getByTestId('mvd-zwarcia-aparatura-sprawdz').click();

  const werdykty = page.getByTestId('mvd-zwarcia-aparatura-werdykty');
  await expect(werdykty).toBeVisible({ timeout: 30000 });

  for (const pole of widok.pola) {
    const wiersz = page.getByTestId(`mvd-zwarcia-aparatura-pole-${pole.pole}`);
    await expect(wiersz).toBeVisible();
    // ŹRÓDŁO aparatu widoczne jako dana maszynowa — inżynier musi wiedzieć,
    // że ocenia aparat z modelu, a nie z własnego wpisu.
    await expect(wiersz).toHaveAttribute('data-zrodlo', 'model');
    // Werdykt na ekranie = werdykt backendu (cytat, nie własne słowa ekranu).
    await expect(wiersz).toContainText(pole.komunikat_pl);
    // Rozbicie czasu wyłączenia: oba człony przy werdykcie (WHITE BOX).
    const czas = page.getByTestId(`mvd-zwarcia-aparatura-czas-${pole.pole}`);
    await expect(czas).toHaveAttribute(
      'data-zrodlo-czasu',
      pole.czas_wylaczenia.zrodlo ?? 'nieustalony',
    );
  }
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function ustawKontekst(
  page: Page,
  seed: {
    projectId: string;
    projectName: string;
    caseId: string;
    caseName: string;
    runId: string;
  },
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
          activeCaseResultStatus: 'FRESH',
          activeSnapshotId: null,
          activeMode: 'MODEL_EDIT',
          activeRunId: dane.runId,
          activeAnalysisType: 'SHORT_CIRCUIT',
          caseManagerOpen: false,
          issuePanelOpen: false,
        },
        version: 1,
      }),
    );
  }, seed);
}
