/**
 * Sieć kadrów stacji (karta POLA-W-TORZE, reużyta przez kartę K2 KADROWANIE-NAWIGACJA):
 * GPZ z dwoma polami liniowymi, magistrala trzech odcinków, cztery drogi budowy stacji
 * SN/nN — przelotowa (wcięcie w odcinek, dwa pola odgałęźne), sekcyjna (wcięcie, stacja
 * typu D), końcowa (stacja na końcu ciągu) i odgałęźna (koniec odgałęzienia z pola
 * odgałęźnego stacji przelotowej). Budowana operacjami API na REALNYM backendzie.
 *
 * Moduł pomocniczy (nie spec): jedna definicja sieci dla obu speców — druga kopia byłaby
 * dwiema prawdami o tym samym materiale oceny.
 */
import { expect, type APIRequestContext, type Page } from '@playwright/test';

import { przelaczMotyw } from './powloka';

export const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const WERSJA_KATALOGU = '2024.1';
const APARAT = 'sw-cb-abb-vd4-17kv-630a';
const KABEL = 'cable-tfk-yakxs-3x120';
const TRAFO = 'tr-sn-nn-15-04-630kva-dyn11';
const ZRODLO = 'src-gpz-15kv-250mva-rx010';

/** Wiązanie katalogowe (kanał katalog-first: przestrzeń + pozycja + wersja). */
function katalog(namespace: string, itemId: string) {
  return { catalog_namespace: namespace, catalog_item_id: itemId, catalog_item_version: WERSJA_KATALOGU };
}
export type Enm = {
  substations?: Array<{ ref_id: string; name?: string; station_type?: string | null; meta?: Record<string, unknown> }>;
  branches?: Array<{ ref_id: string; name?: string; type?: string; from_bus_ref?: string; to_bus_ref?: string }>;
  // Karta W5-B: pola stacji to rekordy `bays`.
  bays?: Array<{ ref_id: string; substation_ref?: string | null; bay_role?: string }>;
};

export const polaStacjiEnm = (enm: Enm, stacjaRef: string | undefined) =>
  (enm.bays ?? []).filter((b) => stacjaRef !== undefined && b.substation_ref === stacjaRef);

let licznik = 0;

async function operacja(
  request: APIRequestContext,
  caseId: string,
  name: string,
  payload: Record<string, unknown>,
): Promise<Enm> {
  const response = await request.post(`${BACKEND_BASE}/api/cases/${caseId}/enm/domain-ops`, {
    data: {
      project_id: '',
      snapshot_base_hash: '',
      // Klucz idempotencji z identyfikatorem przypadku: kilka speców (i kilka testów jednego
      // speku) buduje tę sieć w osobnych przypadkach, także równolegle w innych procesach.
      operation: { name, idempotency_key: `kadry-stacji-${caseId}-${String(++licznik).padStart(4, '0')}`, payload },
    },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { error?: string | null; snapshot?: Enm };
  expect(body.error ?? null).toBeNull();
  return body.snapshot ?? {};
}

function odcinek(dlugoscM: number, nazwa: string): Record<string, unknown> {
  return { rodzaj: 'KABEL', dlugosc_m: dlugoscM, catalog_binding: katalog('KABEL_SN', KABEL), name: nazwa };
}

export const kable = (enm: Enm) => (enm.branches ?? []).filter((b) => b.type === 'cable');

export async function siecKadrow(request: APIRequestContext) {
  const suffix = Date.now().toString(36);
  const projectName = `Pola w torze ${suffix}`;
  const caseName = `Kadry stacji ${suffix}`;
  const projekt = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: { name: projectName, description: 'Kadry stacji — zasada toru pola', mode: 'TO-BE', voltage_level_kv: 15.0, frequency_hz: 50.0 },
  });
  expect(projekt.ok()).toBeTruthy();
  const project = (await projekt.json()) as { id: string };
  const przypadek = await request.post(`${BACKEND_BASE}/api/study-cases`, {
    data: { project_id: project.id, name: caseName, description: '', config: {}, set_active: true },
  });
  expect(przypadek.ok()).toBeTruthy();
  const caseId = ((await przypadek.json()) as { id: string }).id;

  let enm = await operacja(request, caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    catalog_binding: katalog('ZRODLO_SN', ZRODLO),
    hv_voltage_kv: 110.0,
    transformer_sn_mva: 25.0,
    sections_count: 1,
    line_fields_per_section: 2,
    gpz_line_field_apparatus: { catalog_binding: katalog('APARAT_SN', APARAT) },
  });
  const gpz = (enm.substations ?? []).find((s) => s.station_type === 'gpz');
  const poleGpz = polaStacjiEnm(enm, gpz?.ref_id)[0]?.ref_id;
  expect(poleGpz).toBeTruthy();
  enm = await operacja(request, caseId, 'continue_trunk_segment_sn', { field_ref: poleGpz, segment: odcinek(500, 'Odcinek 1') });
  for (const n of [2, 3]) {
    enm = await operacja(request, caseId, 'continue_trunk_segment_sn', { segment: odcinek(500, `Odcinek ${n}`) });
  }
  const wspolne = {
    field_apparatus_catalog_ref: APARAT,
    insert_at: { value: 0.5 },
    transformer: { create: true, catalog_binding: katalog('TRAFO_SN_NN', TRAFO) },
  };
  const odcinek1 = kable(enm).find((b) => b.name === 'Odcinek 1');
  enm = await operacja(request, caseId, 'insert_station_on_segment_sn', {
    ...wspolne,
    segment_ref: odcinek1?.ref_id,
    station_type: 'B',
    station: { name: 'Stacja Przelotowa', sn_voltage_kv: 15.0, nn_voltage_kv: 0.4 },
    sn_fields: ['IN', 'OUT', 'FEEDER', 'FEEDER'],
  });
  const odcinek3 = kable(enm).find((b) => b.name === 'Odcinek 3');
  enm = await operacja(request, caseId, 'insert_station_on_segment_sn', {
    ...wspolne,
    segment_ref: odcinek3?.ref_id,
    station_type: 'D',
    station: { name: 'Stacja Sekcyjna', sn_voltage_kv: 15.0, nn_voltage_kv: 0.4 },
  });
  // Koniec ciągu: koniec ostatniej połówki Odcinka 3 (za stacją sekcyjną).
  const koniecCiagu = kable(enm).find((b) => b.name === 'Odcinek 3 (2)')?.to_bus_ref;
  expect(koniecCiagu, 'koniec ciągu za stacją sekcyjną').toBeTruthy();
  enm = await operacja(request, caseId, 'append_station_on_endpoint', {
    endpoint_bus_ref: koniecCiagu,
    station: { name: 'Stacja Końcowa', station_type: 'terminal' },
    field_apparatus_catalog_ref: APARAT,
    transformer: { catalog_binding: katalog('TRAFO_SN_NN', TRAFO) },
    nn_voltage_kv: 0.4,
    sn_fields: [{ field_role: 'LINIA_IN' }, { field_role: 'LINIA_OUT' }],
  });
  const przelotowa = (enm.substations ?? []).find((s) => s.name === 'Stacja Przelotowa');
  const polaOdgalezne = polaStacjiEnm(enm, przelotowa?.ref_id)
    .filter((f) => f.bay_role === 'FEEDER')
    .map((f) => f.ref_id);
  expect(polaOdgalezne.length).toBe(2);
  enm = await operacja(request, caseId, 'start_branch_segment_sn', {
    from_ref: `${polaOdgalezne[1]}.BRANCH`,
    segment: odcinek(400, 'Odgałęzienie 1'),
  });
  const koniecOdgalezienia = kable(enm).find((b) => b.name === 'Odgałęzienie 1')?.to_bus_ref;
  enm = await operacja(request, caseId, 'append_station_on_endpoint', {
    endpoint_bus_ref: koniecOdgalezienia,
    station: { name: 'Stacja Odgałęźna', station_type: 'branch' },
    field_apparatus_catalog_ref: APARAT,
    transformer: { catalog_binding: katalog('TRAFO_SN_NN', TRAFO) },
    nn_voltage_kv: 0.4,
    sn_fields: [{ field_role: 'LINIA_IN' }],
  });
  // Każda z czterech stacji ma transformator na zacisku pola TR (wiązanie katalogowe
  // transformatora przyjęte przez obie drogi budowy stacji).
  const stacjeSnNn = (enm.substations ?? []).filter((s) => s.station_type !== 'gpz');
  expect(stacjeSnNn).toHaveLength(4);
  for (const s of stacjeSnNn) {
    expect((s as { transformer_refs?: string[] }).transformer_refs ?? [], s.name).toHaveLength(1);
  }
  return { caseId, projectId: project.id, projectName, caseName, enm };
}

export async function otworzAplikacje(
  page: Page,
  seed: { projectId: string; projectName: string; caseId: string; caseName: string },
): Promise<void> {
  await page.addInitScript((s) => {
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
          activeRunId: null,
          activeAnalysisType: 'SHORT_CIRCUIT',
          caseManagerOpen: false,
          issuePanelOpen: false,
        },
        version: 1,
      }),
    );
  }, seed);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 60000 });
  await expect(page.getByTestId('sld-canvas-v3')).toBeVisible({ timeout: 60000 });
}

/** Motyw przełączany REALNYM przyciskiem powłoki, z asercją na `data-theme`. */
export async function ustawMotyw(page: Page, docelowy: 'dark_scada' | 'light_technical'): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    const biezacy = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    if (biezacy === docelowy) return;
    await przelaczMotyw(page);
    await page.waitForTimeout(300);
  }
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.getAttribute('data-theme')), { timeout: 10000 })
    .toBe(docelowy);
}

export const STACJE: readonly { readonly nazwa: string; readonly plik: string }[] = [
  { nazwa: 'Stacja Przelotowa', plik: 'przelotowa' },
  { nazwa: 'Stacja Sekcyjna', plik: 'sekcyjna' },
  { nazwa: 'Stacja Końcowa', plik: 'koncowa' },
  { nazwa: 'Stacja Odgałęźna', plik: 'odgalezna' },
];
