/**
 * Zrzuty ŻYWEJ aplikacji dla karty KD-6 (bramka 5, dyrektywa właściciela #8):
 *  - ogniwo z werdyktami wytrzymałości aparatury pochodzącymi z MODELU
 *    (żadnej ręcznej konfiguracji stacji — aparat z pozycji katalogu APARAT_SN),
 *  - rozbicie czasu wyłączenia wyprowadzonego z NASTAW zabezpieczeń pola.
 * Oba motywy. Zrzut = jedyny dowód wyglądu na stronie oceny.
 *
 * Scena jest REALNA: projekt + przypadek + sieć ze stacją, której pole liniowe
 * dostaje CT i przekaźnik z nastawami W TEJ SAMEJ operacji stacyjnej (B-3),
 * plus policzony bieg zwarciowy — żadnego harnessu i żadnych zaszczepionych
 * wyników.
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(_dirname, '../../docs/audit/visual/flow-ekspert');

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const CABLE_ID = 'cable-tfk-yakxs-3x120';
const TRAFO_ID = 'tr-sn-nn-15-04-630kva-dyn11';
const SOURCE_ID = 'src-gpz-15kv-250mva-rx010';
const APARAT_POLA_ID = 'sw-cb-abb-vd4-17kv-630a';
const CT_ID = 'ct_400_5_5p20_15va_abb';
const PRZEKAZNIK_ID = 'ACME_REX100_v1';
const CATALOG_VERSION = '2024.1';

const THEMES = [
  { id: 'light', mode: 'light_technical' },
  { id: 'dark', mode: 'dark_scada' },
] as const;

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

interface Scena {
  projectId: string;
  projectName: string;
  caseId: string;
  caseName: string;
  runId: string;
  punktNazwa: string;
  polaZWerdyktem: string[];
}

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
        idempotency_key: `e2e-kd6-${name}-${String(++opCounter).padStart(4, '0')}`,
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

async function zbudujScene(request: APIRequestContext): Promise<Scena> {
  const znacznik = String(Date.now());
  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: `Zrzuty KD-6 ${znacznik}`,
      description: 'Bramka KD-6: werdykty z modelu + rozbicie czasu wyłączenia',
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
      name: `Przypadek KD-6 ${znacznik}`,
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

  // Stacja z aparatem pola z katalogu APARAT_SN ORAZ z wyposażeniem pola
  // (CT + przekaźnik z NASTAWAMI) — czas wyłączenia ma się wziąć z nastaw.
  op = await domainOp(request, studyCase.id, 'insert_station_on_segment_sn', {
    field_apparatus_catalog_ref: APARAT_POLA_ID,
    segment_id: segmentRefs[segmentRefs.length - 1],
    station_type: 'B',
    insert_at: { value: 0.5 },
    station: { sn_voltage_kv: 15.0, nn_voltage_kv: 0.4 },
    sn_fields: [
      {
        field_role: 'LINIA_IN',
        equipment: {
          ct: {
            catalog_binding: catalogBinding('CT', CT_ID),
            ratio_primary_a: 400.0,
            ratio_secondary_a: 5.0,
          },
          relay: {
            catalog_binding: catalogBinding('ZABEZPIECZENIE', PRZEKAZNIK_ID),
            relay_type: 'NADPRADOWY',
            settings: [
              {
                function_type: 'overcurrent_51',
                threshold_a: 400.0,
                curve_type: 'DT',
                time_delay_s: 0.3,
              },
            ],
          },
        },
      },
      'OUT',
    ],
    transformer: { create: true, catalog_binding: catalogBinding('TRAFO_SN_NN', TRAFO_ID) },
  });

  const stacja = (op.snapshot?.substations ?? []).find((s) => s.ref_id.includes('/station'));
  expect(stacja?.ref_id).toBeTruthy();
  const stationRef = stacja!.ref_id;
  const busRefy = stacja!.bus_refs ?? [];

  // Kategoria katalogu MUSI pasować do rodzaju gałęzi — KABEL_SN wyłącznie dla
  // odcinków liniowych (aparat pola zachowuje wiązanie APARAT_SN).
  for (const branch of (op.snapshot?.branches ?? []).filter(
    (b) => b.type === 'cable' || b.type === 'line_overhead',
  )) {
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

  const createRun = await request.post(
    `${BACKEND_BASE}/api/execution/study-cases/${studyCase.id}/runs`,
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
  const wynik = (await wynikResponse.json()) as {
    rows: Array<{
      target_id: string;
      element_id?: string;
      target_name?: string | null;
      ikss_ka?: number | null;
      ip_ka: number | null;
      ith_ka: number | null;
    }>;
  };
  const punkt = wynik.rows.find(
    (r) => r.ip_ka !== null && busRefy.includes(r.element_id ?? r.target_id),
  );
  expect(punkt, 'Scena zrzutu wymaga punktu zwarcia na szynie stacji.').toBeTruthy();

  // Oznaczenia pól z odpowiedzi końcówki — zrzut ma pokazać TO, co widzi ekran.
  const widokResponse = await request.post(
    `${BACKEND_BASE}/api/cases/${studyCase.id}/enm/wytrzymalosc-aparatury`,
    {
      data: {
        station_ref: stationRef,
        i_peak_ka: punkt!.ip_ka,
        i_thermal_ka: punkt!.ith_ka,
        ik_ka: punkt!.ikss_ka ?? null,
      },
    },
  );
  expect(widokResponse.ok()).toBeTruthy();
  const widok = (await widokResponse.json()) as { pola: Array<{ pole: string }> };
  expect(widok.pola.length).toBeGreaterThan(0);

  return {
    projectId: project.id,
    projectName: project.name,
    caseId: studyCase.id,
    caseName: studyCase.name,
    runId: run.id,
    punktNazwa: punkt!.target_name ?? punkt!.target_id,
    polaZWerdyktem: widok.pola.map((p) => p.pole),
  };
}

async function otworz(page: Page, scena: Scena, motyw: string, hash: string): Promise<void> {
  await page.addInitScript(
    (dane) => {
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
      localStorage.setItem(
        'mvd-theme-mode',
        JSON.stringify({ state: { mode: dane.motyw }, version: 0 }),
      );
    },
    { ...scena, motyw },
  );
  await page.goto(hash, { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test.describe('kd6:zrzuty', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const { id, mode } of THEMES) {
    test(`ogniwo z modelu + rozbicie czasu wyłączenia — ${id}`, async ({ page, request }) => {
      test.setTimeout(240000);
      const scena = await zbudujScene(request);

      await page.setViewportSize({ width: 1360, height: 1040 });
      await otworz(page, scena, mode, `/#analysis?run=${scena.runId}`);
      await page.getByRole('tab', { name: /Zwarcia/ }).click();
      await expect(page.getByTestId('mvd-zwarcia-ekran')).toBeVisible({ timeout: 30000 });
      await page
        .getByRole('row', { name: new RegExp(escapeRegExp(scena.punktNazwa)) })
        .first()
        .click();

      const sekcja = page.getByTestId('mvd-zwarcia-aparatura');
      await sekcja.scrollIntoViewIfNeeded();
      await page.getByTestId('mvd-zwarcia-aparatura-sprawdz').click();

      const pierwszePole = scena.polaZWerdyktem[0];
      const wiersz = page.getByTestId(`mvd-zwarcia-aparatura-pole-${pierwszePole}`);
      await expect(wiersz).toBeVisible({ timeout: 30000 });
      // Werdykt MUSI pochodzić z modelu — inaczej zrzut dokumentowałby co innego.
      await expect(wiersz).toHaveAttribute('data-zrodlo', 'model');

      await sekcja.screenshot({ path: path.join(OUTPUT_DIR, `kd6-ogniwo-model-${id}.png`) });

      const czas = page.getByTestId(`mvd-zwarcia-aparatura-czas-${pierwszePole}`);
      await expect(czas).toBeVisible();
      await czas.screenshot({ path: path.join(OUTPUT_DIR, `kd6-tclearing-${id}.png`) });
    });
  }
});
