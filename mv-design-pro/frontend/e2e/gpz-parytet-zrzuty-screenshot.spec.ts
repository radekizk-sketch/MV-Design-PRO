/**
 * KARTA GPZ-PARYTET — KADRY BLOKU GPZ z ŻYWEJ aplikacji i REALNEGO backendu (materiał oceny
 * wizualnej właściciela, bramka B-02; spec NIE wystawia werdyktu wizualnego).
 *
 * Kadry pokazują ramę i nagłówek GPZ (nazwa z modelu, bilans zasilania i odpływów, liczba
 * przeciążeń), tabelę „Pola GPZ" (karty pól z rolą, plakietką SPZ z kodu 79 pola i pomiarami
 * P/Q/I/U), tła pól wg roli z legendą oraz oznaczenie uzwojeń transformatora z grupy połączeń —
 * PRZED biegiem (jawne „brak wyniku rozpływu mocy") i PO biegu rozpływu mocy (wartości z wierszy
 * `Bay`/`Substation` wyniku backendu), w obu motywach.
 *
 * Sieć budowana operacjami domenowymi API, bieg rozpływu przez kanoniczne
 * `POST /api/execution/study-cases/{case}/runs` + `execute`, wynik ładowany trasą schematu
 * `#sld?run=<id>` (ta sama droga co produkcja: orkiestrator pobiera `results/v1`). Motyw
 * przełączany REALNYM przyciskiem powłoki; przybliżenie kółkiem myszy nad belką GPZ.
 *
 * Drugi kadr: GPZ z dwiema sekcjami SN i trzema transformatorami 110/SN (operacja
 * `add_grid_source_sn` rozdziela je na sekcje po kolei — dwa na sekcji 1): wieże
 * transformatorów jednej sekcji stoją obok siebie, nie jedna na drugiej.
 *
 * Zrzuty: `docs/uiux/zrzuty/gpz-parytet/gpz-<stan>-<motyw>.png` (do drzewa repo wyłącznie
 * z `ZRZUTY_DO_DOKUMENTACJI=1`, inaczej `test-results/zrzuty-dokumentacji/…`).
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { wykonajBiegDoKonca } from './biegi';
import { katalogZrzutow } from './katalogZrzutow';
import { przelaczMotyw } from './powloka';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const WERSJA_KATALOGU = '2024.1';
const APARAT = 'sw-cb-abb-vd4-17kv-630a';
const KABEL = 'cable-tfk-yakxs-3x120';
const ZRODLO = 'src-gpz-15kv-250mva-rx010';
const HERE = dirname(fileURLToPath(import.meta.url));
const KATALOG_ZRZUTOW = katalogZrzutow(resolve(HERE, '..', '..', 'docs', 'uiux', 'zrzuty', 'gpz-parytet'));

type Enm = {
  substations?: Array<{ ref_id: string; name?: string; station_type?: string | null }>;
  bays?: Array<{ ref_id: string; substation_ref?: string | null; bay_role?: string }>;
  buses?: Array<{ ref_id: string; name?: string }>;
};

const katalog = (namespace: string, itemId: string) => ({
  catalog_namespace: namespace,
  catalog_item_id: itemId,
  catalog_item_version: WERSJA_KATALOGU,
});

let licznik = 0;

async function operacja(request: APIRequestContext, caseId: string, name: string, payload: Record<string, unknown>): Promise<Enm> {
  const response = await request.post(`${BACKEND_BASE}/api/cases/${caseId}/enm/domain-ops`, {
    data: {
      project_id: '',
      snapshot_base_hash: '',
      operation: { name, idempotency_key: `gpz-parytet-${String(++licznik).padStart(4, '0')}`, payload },
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const body = (await response.json()) as { error?: string | null; snapshot?: Enm };
  expect(body.error ?? null).toBeNull();
  return body.snapshot ?? {};
}

async function siecGpz(
  request: APIRequestContext,
  uklad: { readonly sekcje: number; readonly transformatory?: number } = { sekcje: 1 },
) {
  const suffix = Date.now().toString(36);
  const projectName = `GPZ parytet ${suffix}`;
  const caseName = `Kadry GPZ ${suffix}`;
  const projekt = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: { name: projectName, description: 'Kadry bloku GPZ', mode: 'TO-BE', voltage_level_kv: 15.0, frequency_hz: 50.0 },
  });
  expect(projekt.ok()).toBeTruthy();
  const projectId = ((await projekt.json()) as { id: string }).id;
  const przypadek = await request.post(`${BACKEND_BASE}/api/study-cases`, {
    data: { project_id: projectId, name: caseName, description: '', config: {}, set_active: true },
  });
  expect(przypadek.ok()).toBeTruthy();
  const caseId = ((await przypadek.json()) as { id: string }).id;

  let enm = await operacja(request, caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    catalog_binding: katalog('ZRODLO_SN', ZRODLO),
    hv_voltage_kv: 110.0,
    transformer_sn_mva: 25.0,
    sections_count: uklad.sekcje,
    ...(uklad.transformatory != null ? { transformer_count: uklad.transformatory } : {}),
    line_fields_per_section: 2,
    gpz_line_field_apparatus: { catalog_binding: katalog('APARAT_SN', APARAT) },
  });
  const gpz = (enm.substations ?? []).find((s) => s.station_type === 'gpz');
  expect(gpz, 'GPZ w modelu').toBeTruthy();
  const polaGpz = (enm.bays ?? []).filter((b) => b.substation_ref === gpz!.ref_id);
  const poleLiniowe = polaGpz.find((b) => b.bay_role === 'OUT' || b.bay_role === 'FEEDER') ?? polaGpz[0];
  expect(poleLiniowe, 'pole liniowe GPZ').toBeTruthy();
  // Funkcja SPZ (ANSI 79) w danych EAZ pola — źródło plakietki „SPZ" (dane aktywów, nie domysł).
  await operacja(request, caseId, 'update_element_parameters', {
    element_ref: poleLiniowe!.ref_id,
    parameters: { protection_codes: ['50', '51', '79'] },
  });
  enm = await operacja(request, caseId, 'continue_trunk_segment_sn', {
    field_ref: poleLiniowe!.ref_id,
    segment: { rodzaj: 'KABEL', dlugosc_m: 1500, catalog_binding: katalog('KABEL_SN', KABEL), name: 'Odcinek 1' },
  });
  const koniec = (enm.buses ?? []).find((b) => b.name === 'Zacisk końcowy Odcinek 1');
  expect(koniec, 'zacisk końcowy odcinka').toBeTruthy();
  await operacja(request, caseId, 'add_load_sn', { bus_ref: koniec!.ref_id, p_mw: 1.2, q_mvar: 0.3 });
  return { projectId, projectName, caseId, caseName };
}

async function otworzSchemat(
  page: Page,
  seed: { projectId: string; projectName: string; caseId: string; caseName: string },
  trasa: string,
): Promise<void> {
  await page.addInitScript((s) => {
    // Stan startowy sesji wyłącznie przy PIERWSZYM wejściu: init script działa przy każdej
    // nawigacji, a nadpisanie przy przejściu na `#sld?run=` cofałoby stan aplikacji po biegu.
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
  await page.goto(trasa, { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 60000 });
  await expect(page.getByTestId('sld-canvas-v3')).toBeVisible({ timeout: 60000 });
}

async function ustawMotyw(page: Page, docelowy: 'dark_scada' | 'light_technical'): Promise<void> {
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

/** Dopasuj widok realnym przyciskiem, potem przybliżaj kółkiem nad belką GPZ, aż pismo
 *  adnotacji przekroczy próg czytelności. */
async function przyblizGpz(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Dopasuj widok' }).click();
  await page.waitForTimeout(500);
  const warstwa = page.getByTestId('sld-v3-gpz-adnotacje');
  const strefa = page.getByTestId('sld-v3-gpz-zone');
  await expect(strefa).toHaveCount(1, { timeout: 30000 });
  for (let i = 0; i < 30; i += 1) {
    if ((await warstwa.count()) === 1 && (await warstwa.getAttribute('data-gpz-teksty')) === 'widoczne') break;
    const box = await strefa.boundingBox();
    if (!box) break;
    await page.mouse.move(box.x + Math.min(box.width / 2, 200), box.y + Math.min(box.height / 4, 120));
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(150);
  }
  await expect(warstwa).toHaveAttribute('data-gpz-teksty', 'widoczne', { timeout: 10000 });
  await page.waitForTimeout(400);
}

test('GPZ-PARYTET — kadry bloku GPZ przed biegiem i po biegu rozpływu mocy (oba motywy)', async ({ page, request }) => {
  test.setTimeout(600000);
  mkdirSync(KATALOG_ZRZUTOW, { recursive: true });
  const seed = await siecGpz(request);

  // PRZED biegiem: jawny brak wyniku w belce i w tabeli.
  await otworzSchemat(page, seed, '/#sld');
  for (const motyw of [
    { klucz: 'ciemny', theme: 'dark_scada' as const },
    { klucz: 'jasny', theme: 'light_technical' as const },
  ]) {
    await ustawMotyw(page, motyw.theme);
    await przyblizGpz(page);
    await expect(page.getByTestId('sld-v3-gpz-adnotacje')).toHaveAttribute('data-gpz-wynik', 'brak');
    await expect(page.getByTestId('sld-v3-gpz-bilans-zasilania')).toHaveText('Zasilanie GPZ: brak wyniku rozpływu mocy');
    await expect(page.locator('[data-testid^="sld-v3-gpz-plakietka-"][data-gpz-plakietka="SPZ"]')).toHaveCount(1);
    await expect(page.locator('[data-uzwojenia-stan]').first()).toBeAttached();
    await page.screenshot({ path: resolve(KATALOG_ZRZUTOW, `gpz-przed-biegiem-${motyw.klucz}.png`) });
  }

  // Bieg rozpływu mocy na realnym backendzie.
  const utworz = await request.post(`${BACKEND_BASE}/api/execution/study-cases/${seed.caseId}/runs`, {
    data: { analysis_type: 'LOAD_FLOW' },
    timeout: 60000,
  });
  expect(utworz.ok(), await utworz.text()).toBeTruthy();
  const runId = ((await utworz.json()) as { id: string }).id;
  await wykonajBiegDoKonca(request, BACKEND_BASE, runId);
  const wynik = await request.get(`${BACKEND_BASE}/api/execution/runs/${runId}/results/v1`);
  expect(wynik.ok()).toBeTruthy();
  const elementy = ((await wynik.json()) as { overlay_payload: { elements: Record<string, { kind: string }> } }).overlay_payload.elements;
  expect(Object.values(elementy).some((e) => e.kind === 'substation'), 'wiersz bilansu GPZ w wyniku').toBeTruthy();
  expect(Object.values(elementy).some((e) => e.kind === 'bay'), 'wiersze pól GPZ w wyniku').toBeTruthy();

  // Bieg zlecony poza aplikacją (API), a zmiana samego fragmentu adresu nie przeładowuje
  // dokumentu — więc przeładowanie: zimny start hydratuje powłokę z serwera (status
  // wyników przypadku FRESH w pasku projektu), dokładnie jak po ponownym otwarciu aplikacji.
  await page.goto(`/#sld?run=${runId}`, { waitUntil: 'commit' });
  await page.reload({ waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 60000 });
  await expect(page.getByText('Wyniki: aktualne')).toBeVisible({ timeout: 60000 });
  await expect(page.getByTestId('sld-v3-gpz-adnotacje')).toHaveAttribute('data-gpz-wynik', 'aktualny', { timeout: 60000 });
  for (const motyw of [
    { klucz: 'ciemny', theme: 'dark_scada' as const },
    { klucz: 'jasny', theme: 'light_technical' as const },
  ]) {
    await ustawMotyw(page, motyw.theme);
    await przyblizGpz(page);
    await expect(page.getByTestId('sld-v3-gpz-bilans-zasilania')).toHaveText(/^Zasilanie GPZ: P = -?\d+,\d{4} MW, Q = -?\d+,\d{4} Mvar$/);
    await expect(page.getByTestId('sld-v3-gpz-tabela-tytul')).toHaveText('Pola GPZ — wynik rozpływu mocy');
    await page.screenshot({ path: resolve(KATALOG_ZRZUTOW, `gpz-po-biegu-${motyw.klucz}.png`) });
  }
});

test('GPZ-PARYTET — dwie sekcje SN i trzy transformatory: wieże obok siebie (oba motywy)', async ({ page, request }) => {
  test.setTimeout(600000);
  mkdirSync(KATALOG_ZRZUTOW, { recursive: true });
  const seed = await siecGpz(request, { sekcje: 2, transformatory: 3 });
  await otworzSchemat(page, seed, '/#sld');
  for (const motyw of [
    { klucz: 'ciemny', theme: 'dark_scada' as const },
    { klucz: 'jasny', theme: 'light_technical' as const },
  ]) {
    await ustawMotyw(page, motyw.theme);
    await page.getByRole('button', { name: 'Dopasuj widok' }).click();
    await page.waitForTimeout(500);
    const uzwojenia = page.locator('[data-uzwojenia-stan]');
    await expect(uzwojenia).toHaveCount(3, { timeout: 30000 });
    // Trzy symbole transformatora w trzech różnych, rozłącznych kolumnach.
    const ramki = [];
    for (let i = 0; i < 3; i += 1) ramki.push((await uzwojenia.nth(i).boundingBox())!);
    const posortowane = [...ramki].sort((a, b) => a.x - b.x);
    for (let i = 1; i < posortowane.length; i += 1) {
      expect(posortowane[i].x, 'wieże transformatorów nie nachodzą na siebie').toBeGreaterThan(
        posortowane[i - 1].x + posortowane[i - 1].width,
      );
    }
    await page.screenshot({ path: resolve(KATALOG_ZRZUTOW, `gpz-dwie-sekcje-trzy-tr-${motyw.klucz}.png`) });
  }
});
