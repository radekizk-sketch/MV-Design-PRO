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
    branches?: Array<{ ref_id: string }>;
    transformers?: Array<{ ref_id: string }>;
    substations?: Array<{ ref_id: string; bus_refs?: string[] }>;
  };
};

type WierszZwarcia = {
  target_id: string;
  element_id?: string;
  target_name?: string | null;
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

test('ogniwo: z wyniku zwarciowego wprost do werdyktu wytrzymałości aparatury pola', async ({
  page,
  request,
}) => {
  test.setTimeout(240000);

  // --- Projekt + przypadek ---------------------------------------------------
  const znacznik = String(Date.now());
  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: `Ogniwo aparatura ${znacznik}`,
      description: 'Bramka KD-4: wynik zwarciowy → wytrzymałość aparatury',
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

  // --- Sieć ze stacją --------------------------------------------------------
  await domainOp(request, studyCase.id, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: catalogBinding('ZRODLO_SN', SOURCE_ID),
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
    sn_fields: ['IN', 'OUT'],
    transformer: { create: true, catalog_binding: catalogBinding('TRAFO_SN_NN', TRAFO_ID) },
  });

  const stacja = (op.snapshot?.substations ?? []).find((s) => s.ref_id.includes('/station'));
  expect(stacja?.ref_id).toBeTruthy();
  const stationRef = stacja!.ref_id;
  const busRefy = stacja!.bus_refs ?? [];
  expect(busRefy.length).toBeGreaterThan(0);

  // Katalogi gałęzi/transformatorów (żeby bieg był policzalny).
  for (const branch of op.snapshot?.branches ?? []) {
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

  // --- Bieg zwarciowy --------------------------------------------------------
  const createRun = await request.post(
    `${BACKEND_BASE}/api/execution/study-cases/${studyCase.id}/runs`,
    { data: { analysis_type: 'SC_3F' } },
  );
  expect(createRun.ok()).toBeTruthy();
  const run = (await createRun.json()) as { id: string };
  const executeRun = await request.post(`${BACKEND_BASE}/api/execution/runs/${run.id}/execute`);
  expect(executeRun.ok()).toBeTruthy();
  await czekajNaWynik(request, run.id);

  // Prądy punktu zwarcia — PROSTO Z WYNIKU (źródło asercji, nie ekran).
  const wynikResponse = await request.get(
    `${BACKEND_BASE}/api/analysis-runs/${run.id}/results/short-circuit`,
  );
  expect(wynikResponse.ok()).toBeTruthy();
  const wynik = (await wynikResponse.json()) as { rows: WierszZwarcia[] };
  const wiersze = wynik.rows.filter((r) => r.ip_ka !== null && r.ith_ka !== null);
  expect(wiersze.length).toBeGreaterThan(0);

  const punktStacji = wiersze.find((r) => busRefy.includes(r.element_id ?? r.target_id));
  expect(
    punktStacji,
    'Wynik biegu musi zawierać punkt zwarcia leżący na szynie badanej stacji.',
  ).toBeTruthy();

  // Werdykt referencyjny: TA SAMA końcówka, prądy z wyniku, czas z konfiguracji.
  const werdyktResponse = await request.post(
    `${BACKEND_BASE}/api/v1/catalog/audit2/validate-device-withstand`,
    {
      data: {
        device_id: APARAT_ID,
        i_peak_calculated_ka: punktStacji!.ip_ka,
        i_thermal_calculated_ka: punktStacji!.ith_ka,
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
    runId: run.id,
  });

  await page.goto(`/#analysis?run=${run.id}`, { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
  await page.getByRole('tab', { name: /Zwarcia/ }).click();
  await expect(page.getByTestId('mvd-zwarcia-ekran')).toBeVisible({ timeout: 30000 });

  // Wybór punktu zwarcia = NATYWNY klik wiersza tabeli punktów.
  const nazwaPunktu = punktStacji!.target_name ?? punktStacji!.target_id;
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
