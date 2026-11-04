/**
 * Wspólne ziarno i kroki speców konfiguratora GPZ (karta KATALOG-PRZEJECIE-PR) na REALNYM
 * backendzie: projekt + przypadek, GPZ z równoważnikiem sieci 110 kV i transformatorem z
 * katalogu, odcinek kabla z odbiorem, bieg zwarciowy i otwarcie konfiguratora ścieżką
 * użytkownika (prawy klik w źródło GPZ na kanwie → „Edytuj główny punkt zasilania").
 */
import { expect, type APIRequestContext, type Page } from '@playwright/test';

import { wykonajBiegDoKonca } from './biegi';

export const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const WERSJA_KATALOGU = '2024.1';
const APARAT = 'sw-cb-abb-vd4-17kv-630a';
const KABEL = 'cable-tfk-yakxs-3x120';
export const TR_25 = 'tr-wn-sn-110-15-25mva-yd11';
export const TR_40 = 'tr-wn-sn-110-15-40mva-yd11';

export type EnmGpz = {
  substations?: Array<{
    ref_id: string;
    name?: string;
    station_type?: string | null;
    transformer_refs?: string[];
    bus_refs?: string[];
    gpz_sections?: Array<{ section_id: string; bus_ref: string; name?: string | null }>;
  }>;
  sources?: Array<{
    ref_id: string;
    name?: string;
    substation_ref?: string | null;
    sk3_mva?: number | null;
    sk3_hv_mva?: number | null;
    rx_ratio?: number | null;
    materialized_params?: Record<string, unknown> | null;
  }>;
  transformers?: Array<{ ref_id: string; catalog_ref?: string | null; sn_mva: number; uk_percent: number; lv_bus_ref: string }>;
  bays?: Array<{
    ref_id: string;
    name?: string;
    substation_ref?: string | null;
    bay_role?: string;
    bus_ref?: string;
    terminal_bus_ref?: string | null;
  }>;
  shunt_capacitors?: Array<{ ref_id: string; bus_ref: string }>;
  buses?: Array<{ ref_id: string; name?: string }>;
};

export interface ZiarnoGpz {
  readonly projectId: string;
  readonly projectName: string;
  readonly caseId: string;
  readonly caseName: string;
  readonly zrodloRef: string;
  readonly stacjaRef: string;
  readonly transformatorRef: string;
  readonly szynaSnRef: string;
}

const katalog = (namespace: string, itemId: string) => ({
  catalog_namespace: namespace,
  catalog_item_id: itemId,
  catalog_item_version: WERSJA_KATALOGU,
});

let licznik = 0;

export async function operacja(
  request: APIRequestContext,
  caseId: string,
  name: string,
  payload: Record<string, unknown>,
): Promise<EnmGpz> {
  const response = await request.post(`${BACKEND_BASE}/api/cases/${caseId}/enm/domain-ops`, {
    data: {
      project_id: '',
      snapshot_base_hash: '',
      operation: { name, idempotency_key: `gpz-konfigurator-${String(++licznik).padStart(4, '0')}`, payload },
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const body = (await response.json()) as { error?: string | null; snapshot?: EnmGpz };
  expect(body.error ?? null).toBeNull();
  return body.snapshot ?? {};
}

export async function enm(request: APIRequestContext, caseId: string): Promise<EnmGpz> {
  const odpowiedz = await request.get(`${BACKEND_BASE}/api/cases/${caseId}/enm`);
  expect(odpowiedz.ok()).toBeTruthy();
  return (await odpowiedz.json()) as EnmGpz;
}

/** Ik″ (kA) zwarcia trójfazowego na szynie z realnego biegu backendu. */
export async function ikNaSzynie(request: APIRequestContext, caseId: string, busRef: string): Promise<number> {
  const utworz = await request.post(`${BACKEND_BASE}/api/execution/study-cases/${caseId}/runs`, {
    data: { analysis_type: 'SC_3F' },
    timeout: 60000,
  });
  expect(utworz.ok(), await utworz.text()).toBeTruthy();
  const runId = ((await utworz.json()) as { id: string }).id;
  await wykonajBiegDoKonca(request, BACKEND_BASE, runId);
  const wynik = await request.get(`${BACKEND_BASE}/api/analysis-runs/${runId}/results/short-circuit`);
  expect(wynik.ok(), await wynik.text()).toBeTruthy();
  const wiersze = ((await wynik.json()) as {
    rows: Array<{ target_id: string; element_id?: string; ikss_ka?: number | null }>;
  }).rows;
  const wiersz = wiersze.find((r) => (r.element_id ?? r.target_id) === busRef);
  expect(wiersz?.ikss_ka, `Ik″ na szynie ${busRef}`).toEqual(expect.any(Number));
  return wiersz!.ikss_ka as number;
}

/** GPZ 110/15 kV: sieć 110 kV S″k = 3000 MVA, R/X = 0,1; transformator 25 MVA z katalogu;
 *  `sekcje` sekcji szyn SN; z pierwszego pola liniowego odcinek kabla 1,5 km z odbiorem. */
export async function siecGpz(request: APIRequestContext, sekcje = 1): Promise<ZiarnoGpz> {
  const suffix = Date.now().toString(36);
  const projectName = `GPZ konfigurator ${suffix}`;
  const caseName = `Konfigurator GPZ ${suffix}`;
  const projekt = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: { name: projectName, description: 'Konfigurator GPZ', mode: 'TO-BE', voltage_level_kv: 15.0, frequency_hz: 50.0 },
  });
  expect(projekt.ok()).toBeTruthy();
  const projectId = ((await projekt.json()) as { id: string }).id;
  const przypadek = await request.post(`${BACKEND_BASE}/api/study-cases`, {
    data: { project_id: projectId, name: caseName, description: '', config: {}, set_active: true },
  });
  expect(przypadek.ok()).toBeTruthy();
  const caseId = ((await przypadek.json()) as { id: string }).id;

  let model = await operacja(request, caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    manual_equivalent: { short_circuit_input_side: 'HV_110', hv_voltage_kv: 110.0, sk3_hv_mva: 3000.0, rx_ratio: 0.1 },
    transformer_count: 1,
    transformer_catalog_binding: katalog('TRAFO_SN_NN', TR_25),
    sections_count: sekcje,
    line_fields_per_section: 1,
    gpz_line_field_apparatus: { catalog_binding: katalog('APARAT_SN', APARAT) },
  });
  const gpz = (model.substations ?? []).find((s) => s.station_type === 'gpz');
  expect(gpz, 'GPZ w modelu').toBeTruthy();
  const zrodlo = (model.sources ?? []).find((s) => s.substation_ref === gpz!.ref_id);
  expect(zrodlo, 'źródło GPZ').toBeTruthy();
  const transformatorRef = gpz!.transformer_refs?.[0];
  expect(transformatorRef, 'transformator 110/SN w modelu').toBeTruthy();
  const pole = (model.bays ?? []).find((b) => b.substation_ref === gpz!.ref_id);
  expect(pole, 'pole liniowe GPZ').toBeTruthy();
  model = await operacja(request, caseId, 'continue_trunk_segment_sn', {
    field_ref: pole!.ref_id,
    segment: { rodzaj: 'KABEL', dlugosc_m: 1500, catalog_binding: katalog('KABEL_SN', KABEL), name: 'Odcinek 1' },
  });
  const koniec = (model.buses ?? []).find((b) => b.name === 'Zacisk końcowy Odcinek 1');
  expect(koniec, 'zacisk końcowy odcinka').toBeTruthy();
  model = await operacja(request, caseId, 'add_load_sn', { bus_ref: koniec!.ref_id, p_mw: 1.2, q_mvar: 0.3 });
  const transformator = (model.transformers ?? []).find((t) => t.ref_id === transformatorRef);
  return {
    projectId,
    projectName,
    caseId,
    caseName,
    zrodloRef: zrodlo!.ref_id,
    stacjaRef: gpz!.ref_id,
    transformatorRef: transformatorRef!,
    szynaSnRef: transformator!.lv_bus_ref,
  };
}

export async function otworzSchemat(
  page: Page,
  seed: { projectId: string; projectName: string; caseId: string; caseName: string },
  motyw?: 'dark_scada' | 'light_technical',
): Promise<void> {
  if (motyw) {
    await page.addInitScript((m) => {
      localStorage.setItem('mvd-theme-mode', JSON.stringify({ state: { mode: m }, version: 0 }));
    }, motyw);
  }
  await page.addInitScript((s) => {
    if (localStorage.getItem('mv-design-app-state') !== null) return;
    localStorage.setItem(
      'mv-design-app-state',
      JSON.stringify({
        state: {
          activeProjectId: s.projectId,
          activeProjectName: s.projectName,
          activeCaseId: s.caseId,
          activeCaseName: s.caseName,
          activeCaseKind: 'ShortCircuitCase',
          activeCaseResultStatus: 'NONE',
          activeSnapshotId: null,
          activeMode: 'MODEL_EDIT',
          activeAnalysisType: 'SHORT_CIRCUIT',
          caseManagerOpen: false,
          issuePanelOpen: false,
        },
        version: 1,
      }),
    );
  }, seed);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/#sld', { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 60000 });
  await expect(page.getByTestId('sld-canvas-v3')).toBeVisible({ timeout: 60000 });
}

/** Konfigurator GPZ otwarty ścieżką użytkownika: prawy klik w źródło na kanwie → menu. */
export async function otworzKonfiguratorGpz(page: Page, zrodloRef: string): Promise<void> {
  await page.getByRole('button', { name: 'Dopasuj widok' }).click();
  // Hit-rect warstwy trafień (`data-hit-klasa="zrodlo"`) niesie ref źródła GPZ; `force` pomija
  // wyłącznie sprawdzenie przodków DOM Playwrighta (nadrzędna warstwa trafień), nie współrzędne.
  const zrodlo = page.locator(`[data-hit-klasa="zrodlo"][data-hit-owner-ref="${zrodloRef}"]`).first();
  await expect(zrodlo).toBeAttached({ timeout: 30000 });
  await zrodlo.click({ button: 'right', force: true });
  await page.getByTestId('sld-menu-open-source').click();
  await expect(page.getByTestId('gpz-configurator-surface')).toBeVisible({ timeout: 20000 });
}
