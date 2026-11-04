/**
 * Jedna ścieżka edycji — odcinek SN (karta JEDNA-SCIEZKA-EDYCJI), realny backend.
 *
 * Ścieżka natywna: wpis w komórce tabeli zbiorczej „Odcinki SN" (przestrzeń „Model sieci")
 * → operacja `update_element_parameters` przez definicję rejestru pól → MODEL. Dowód, że
 * zmiana nie żyje w kopii ekranu: po pełnym przeładowaniu strony wartość wraca z serwera
 * w tabeli i w karcie odcinka (E-12), a migawka ENM z API niesie `length_km` i warunki
 * ułożenia. Dawna karta odcinka trzymała osiem pól w stanie lokalnym — zmiana znikała.
 * Zrzuty obu motywów trafiają do katalogu zrzutów biegu (`katalogZrzutow`).
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

import { katalogZrzutow } from './katalogZrzutow';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const OUTPUT_DIR = katalogZrzutow(path.resolve(process.cwd(), '../docs/audit/visual/jedna-sciezka-edycji'));
const CABLE_ID = 'cable-tfk-yakxs-3x120';
const SOURCE_ID = 'src-gpz-15kv-250mva-rx010';
const CATALOG_VERSION = '2024.1';

const MOTYWY = [
  { nazwa: 'dark', tryb: 'dark_scada' },
  { nazwa: 'light', tryb: 'light_technical' },
] as const;

let opCounter = 0;
let entityCounter = 0;

type Odcinek = {
  ref_id: string;
  length_km?: number;
  meta?: { cable_laying_conditions?: { set_name?: string } };
};
type Snapshot = { corridors?: Array<{ ordered_segment_refs?: string[] }>; branches?: Odcinek[] };

function binding(namespace: string, id: string) {
  return { catalog_namespace: namespace, catalog_item_id: id, catalog_item_version: CATALOG_VERSION };
}

async function operacja(
  request: APIRequestContext,
  caseId: string,
  name: string,
  payload: Record<string, unknown>,
): Promise<Snapshot> {
  const response = await request.post(`${BACKEND_BASE}/api/cases/${caseId}/enm/domain-ops`, {
    data: {
      project_id: '',
      snapshot_base_hash: '',
      operation: { name, idempotency_key: `e2e-jse-${name}-${String(++opCounter).padStart(4, '0')}`, payload },
    },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { error?: string | null; snapshot?: Snapshot };
  expect(body.error ?? null).toBeNull();
  return body.snapshot ?? {};
}

async function odcinekZModelu(request: APIRequestContext, caseId: string, ref: string): Promise<Odcinek | undefined> {
  const response = await request.get(`${BACKEND_BASE}/api/cases/${caseId}/enm`);
  expect(response.ok()).toBeTruthy();
  const model = (await response.json()) as Snapshot;
  return model.branches?.find((b) => b.ref_id === ref);
}

async function otworzAplikacje(page: Page, request: APIRequestContext, tryb: string): Promise<string> {
  entityCounter += 1;
  const suffix = String(entityCounter).padStart(4, '0');
  const project = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: { name: `E2E jedna ścieżka ${suffix}`, description: '', mode: 'TO-BE', voltage_level_kv: 15.0, frequency_hz: 50.0 },
  });
  expect(project.ok()).toBeTruthy();
  const { id: projectId } = (await project.json()) as { id: string };
  const studyCase = await request.post(`${BACKEND_BASE}/api/study-cases`, {
    data: { project_id: projectId, name: `Przypadek ${suffix}`, description: '', config: {}, set_active: true },
  });
  expect(studyCase.ok()).toBeTruthy();
  const { id: caseId } = (await studyCase.json()) as { id: string };

  await page.addInitScript(
    (dane) => {
      localStorage.setItem(
        'mv-design-app-state',
        JSON.stringify({
          state: {
            activeProjectId: dane.projectId,
            activeProjectName: dane.nazwa,
            activeCaseId: dane.caseId,
            activeCaseName: dane.nazwa,
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
      localStorage.setItem('mvd-theme-mode', JSON.stringify({ state: { mode: dane.tryb }, version: 0 }));
    },
    { projectId, caseId, nazwa: `E2E jedna ścieżka ${suffix}`, tryb },
  );
  return caseId;
}

async function zbudujMagistrale(request: APIRequestContext, caseId: string): Promise<string> {
  await operacja(request, caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: binding('ZRODLO_SN', SOURCE_ID),
  });
  const migawka = await operacja(request, caseId, 'continue_trunk_segment_sn', {
    segment: { rodzaj: 'KABEL', dlugosc_m: 400, name: 'Odcinek 1', catalog_binding: binding('KABEL_SN', CABLE_ID) },
  });
  const segmenty = migawka.corridors?.[0]?.ordered_segment_refs ?? [];
  expect(segmenty.length).toBeGreaterThan(0);
  return segmenty[segmenty.length - 1];
}

async function otworzTabeleOdcinkow(page: Page) {
  await page.getByRole('button', { name: /^Model sieci \d$/ }).click();
  await page.getByTestId('mvd-model-zakladka-odcinki').click();
  await expect(page.getByTestId('mvd-model-odcinki-tabela')).toBeVisible({ timeout: 20000 });
}

test.beforeAll(() => {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
});

for (const motyw of MOTYWY) {
  test(`odcinek SN: długość i ułożenie z tabeli zbiorczej trafiają do modelu — ${motyw.nazwa}`, async ({ page, request }) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width: 1440, height: 900 });
    const caseId = await otworzAplikacje(page, request, motyw.tryb);
    const segment = await zbudujMagistrale(request, caseId);
    await page.goto('/', { waitUntil: 'commit' });
    await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 30000 });

    await otworzTabeleOdcinkow(page);
    const dlugosc = page.getByTestId(`mvd-model-odcinki-tabela-komorka-dlugosc-${segment}-input`);
    await expect(dlugosc).toHaveValue('400', { timeout: 20000 });
    await page.screenshot({ path: path.join(OUTPUT_DIR, `odcinki-sn-przed-${motyw.nazwa}.png`), fullPage: false });

    // Natywny wpis i zatwierdzenie klawiszem (blur) — zapis przez rejestr pól.
    await dlugosc.click();
    await dlugosc.fill('650');
    await dlugosc.press('Enter');
    await expect.poll(async () => (await odcinekZModelu(request, caseId, segment))?.length_km, { timeout: 20000 }).toBe(0.65);

    // Wartość odrzucona walidacją rejestru nie wychodzi do modelu.
    await dlugosc.click();
    await dlugosc.fill('0');
    await dlugosc.press('Enter');
    await expect(page.getByTestId('mvd-model-odcinki-komunikat')).toBeVisible();
    expect((await odcinekZModelu(request, caseId, segment))?.length_km).toBe(0.65);

    const ulozenie = page.getByTestId(`mvd-model-odcinki-tabela-komorka-ulozenie-${segment}-select`);
    await expect(ulozenie).toBeVisible({ timeout: 20000 });
    const opcje = await ulozenie.locator('option').evaluateAll((el) =>
      (el as HTMLOptionElement[]).map((o) => o.value).filter((v) => v !== '' && v !== 'wlasne'),
    );
    expect(opcje.length).toBeGreaterThan(1);
    const docelowy = opcje[opcje.length - 1];
    await ulozenie.selectOption(docelowy);
    await expect
      .poll(async () => (await odcinekZModelu(request, caseId, segment))?.meta?.cable_laying_conditions?.set_name, { timeout: 20000 })
      .toBe(docelowy);

    // Pełne przeładowanie: wartości wracają z serwera — w tabeli i w karcie odcinka.
    await page.reload({ waitUntil: 'commit' });
    await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 30000 });
    await otworzTabeleOdcinkow(page);
    await expect(page.getByTestId(`mvd-model-odcinki-tabela-komorka-dlugosc-${segment}-input`)).toHaveValue('650', { timeout: 20000 });
    await expect(page.getByTestId(`mvd-model-odcinki-tabela-komorka-ulozenie-${segment}-select`)).toHaveValue(docelowy);
    await page.screenshot({ path: path.join(OUTPUT_DIR, `odcinki-sn-po-${motyw.nazwa}.png`), fullPage: false });

    // Dwuklik wiersza otwiera kartę odcinka (E-12) — ta sama wartość z modelu.
    await page.getByTestId('mvd-model-odcinki-tabela-wiersz').first().dblclick();
    await expect(page.getByTestId('sn-segment-surface')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('segment-field-length')).toHaveValue('650', { timeout: 20000 });
    await page.screenshot({ path: path.join(OUTPUT_DIR, `karta-odcinka-po-${motyw.nazwa}.png`), fullPage: false });
  });
}
