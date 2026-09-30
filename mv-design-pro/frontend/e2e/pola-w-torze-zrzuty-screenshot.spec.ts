/**
 * KARTA POLA-W-TORZE — KADRY STACJI z ŻYWEJ aplikacji (materiał oceny wizualnej właściciela,
 * bramka B-02; spec NIE wystawia werdyktu wizualnego).
 *
 * Po karcie kabel i transformator stacji są przyłączone do ZACISKU pola, które im służy,
 * a aparat pola leży w ich torze prądowym. Kadry pokazują cztery drogi budowy stacji:
 * przelotową (wcięcie w odcinek, dwa pola odgałęźne), sekcyjną (pole wyjściowe na sekcji B),
 * końcową (stacja na końcu ciągu) i odgałęźną (stacja na końcu odgałęzienia wyprowadzonego
 * z pola odgałęźnego stacji przelotowej) — w obu motywach.
 *
 * Sieć budowana operacjami API (kadry pokazują RYSUNEK, a nie proces budowy — ten dowodzi
 * spec `s95-budowa-z-kanwy.spec.ts`). Motyw przełączany REALNYM przyciskiem powłoki
 * z asercją na `data-theme`; przybliżenie kółkiem myszy nad uchwytem nazwy stacji.
 *
 * Zrzuty: `docs/sld/audyt-2026-09/pola-w-torze-<stacja>-<motyw>.png`.
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const WERSJA_KATALOGU = '2024.1';
const APARAT = 'sw-cb-abb-vd4-17kv-630a';
const KABEL = 'cable-tfk-yakxs-3x120';
const TRAFO = 'tr-sn-nn-15-04-630kva-dyn11';
const ZRODLO = 'src-gpz-15kv-250mva-rx010';

/** Wiązanie katalogowe (kanał katalog-first: przestrzeń + pozycja + wersja). */
function katalog(namespace: string, itemId: string) {
  return { catalog_namespace: namespace, catalog_item_id: itemId, catalog_item_version: WERSJA_KATALOGU };
}
const HERE = dirname(fileURLToPath(import.meta.url));
const KATALOG_ZRZUTOW = resolve(HERE, '..', '..', 'docs', 'sld', 'audyt-2026-09');

type Enm = {
  substations?: Array<{ ref_id: string; name?: string; station_type?: string | null; meta?: Record<string, unknown> }>;
  branches?: Array<{ ref_id: string; name?: string; type?: string; from_bus_ref?: string; to_bus_ref?: string }>;
};

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
      operation: { name, idempotency_key: `pola-w-torze-${String(++licznik).padStart(4, '0')}`, payload },
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

const kable = (enm: Enm) => (enm.branches ?? []).filter((b) => b.type === 'cable');

async function siecKadrow(request: APIRequestContext) {
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
  const poleGpz = ((gpz?.meta?.field_specs as Array<{ field_ref: string }> | undefined) ?? [])[0]?.field_ref;
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
  const polaOdgalezne = ((przelotowa?.meta?.field_specs as Array<{ field_ref: string; bay_role: string }> | undefined) ?? [])
    .filter((f) => f.bay_role === 'FEEDER')
    .map((f) => f.field_ref);
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

async function otworzAplikacje(
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
async function ustawMotyw(page: Page, docelowy: 'dark_scada' | 'light_technical'): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    const biezacy = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    if (biezacy === docelowy) return;
    await page.getByTestId('mvd-theme-toggle').click();
    await page.waitForTimeout(300);
  }
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.getAttribute('data-theme')), { timeout: 10000 })
    .toBe(docelowy);
}

const STACJE: readonly { readonly nazwa: string; readonly plik: string }[] = [
  { nazwa: 'Stacja Przelotowa', plik: 'przelotowa' },
  { nazwa: 'Stacja Sekcyjna', plik: 'sekcyjna' },
  { nazwa: 'Stacja Końcowa', plik: 'koncowa' },
  { nazwa: 'Stacja Odgałęźna', plik: 'odgalezna' },
];

test('POLA-W-TORZE — kadry stacji przelotowej, sekcyjnej, końcowej i odgałęźnej (oba motywy)', async ({
  page,
  request,
}) => {
  test.setTimeout(900000);
  mkdirSync(KATALOG_ZRZUTOW, { recursive: true });
  const seed = await siecKadrow(request);
  const refStacji = new Map(
    (seed.enm.substations ?? []).map((s) => [String(s.name), s.ref_id] as const),
  );
  await otworzAplikacje(page, seed);
  const kanwa = page.getByTestId('sld-canvas-v3');

  for (const motyw of [
    { klucz: 'ciemny', theme: 'dark_scada' as const },
    { klucz: 'jasny', theme: 'light_technical' as const },
  ]) {
    await ustawMotyw(page, motyw.theme);
    const dopasuj = page.getByRole('button', { name: 'Dopasuj widok' });
    await dopasuj.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: resolve(KATALOG_ZRZUTOW, `pola-w-torze-siec-${motyw.klucz}.png`) });

    for (const stacja of STACJE) {
      const ref = refStacji.get(stacja.nazwa);
      expect(ref, `stacja ${stacja.nazwa} w modelu`).toBeTruthy();
      // Powrót do pełnego widoku REALNYM przyciskiem, potem przybliżenie kółkiem myszy nad
      // rozdzielnicą stacji (nad etykietą nazwy — pola rysowane są powyżej opisu stacji).
      await dopasuj.click();
      await page.waitForTimeout(500);
      const uchwyt = page.locator(`[data-hit-role="obrys"][data-hit-owner-ref^="${ref}#name-row"]`).first();
      await expect(uchwyt).toHaveCount(1, { timeout: 30000 });
      for (let i = 0; i < 12; i += 1) {
        // Poziom szczegółu 1: rozdzielnica stacji z polami i aparatami w jednym kadrze.
        if ((await kanwa.getAttribute('data-scene-lod')) !== '0') break;
        const box = await uchwyt.boundingBox();
        if (!box) break;
        await page.mouse.move(box.x + box.width / 2, box.y - 6 * box.height);
        await page.mouse.wheel(0, -240);
        await page.waitForTimeout(200);
      }
      await page.waitForTimeout(400);
      await page.screenshot({ path: resolve(KATALOG_ZRZUTOW, `pola-w-torze-${stacja.plik}-${motyw.klucz}.png`) });
    }
  }
});
