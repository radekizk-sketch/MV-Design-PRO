/**
 * KARTA GPZ-PARYTET — KADRY BLOKU GPZ z ŻYWEJ aplikacji i REALNEGO backendu (materiał oceny
 * wizualnej właściciela, bramka B-02; spec NIE wystawia werdyktu wizualnego).
 *
 * Kadry pokazują ramę GPZ na schemacie z oznaczeniem uzwojeń transformatora z grupy połączeń
 * oraz kartę GPZ w prawym inspektorze (bilans zasilania i odpływów, liczba przeciążeń, tabela
 * „Pola GPZ" z rolą, plakietką SPZ z kodu 79 pola i pomiarami P/Q/I/U) —
 * PRZED biegiem (jawne „brak wyniku rozpływu mocy") i PO biegu rozpływu mocy (wartości z wierszy
 * `Bay`/`Substation` wyniku backendu), w obu motywach.
 *
 * Sieć budowana operacjami domenowymi API, bieg rozpływu przez kanoniczne
 * `POST /api/execution/study-cases/{case}/runs` + `execute`, wynik ładowany trasą schematu
 * `#sld?run=<id>` (ta sama droga co produkcja: orkiestrator pobiera `results/v1`). Motyw
 * przełączany REALNYM przyciskiem powłoki; GPZ zaznaczany natywnym klikiem na kanwie — bilans,
 * przeciążenia i tabela pól są w karcie GPZ prawego inspektora (karta GPZ-H5-SLD etap 2).
 *
 * Granica zasilania SN (karta GPZ-MODEL, kontrakt GPZ H5): transformatory 110/SN są elementami
 * modelu wyłącznie przy GPZ ze stroną 110 kV — jawne wpisy `transformers` łączą sekcję szyn
 * 110 kV (tor zasilania z równoważnikiem) z sekcjami SN. Pierwszy kadr: jeden transformator (oznaczenie uzwojeń z grupy
 * połączeń). Drugi kadr: dwie sekcje SN i trzy transformatory (operacja rozdziela je na sekcje
 * po kolei — dwa na sekcji 1, rezerwa ukryta): wieże jednej sekcji stoją obok siebie, nie jedna na drugiej.
 * Trzeci kadr: równoważnik z katalogu na szynach SN — dwie sekcje BEZ transformatorów (Sk″
 * widziane z szyn SN zawiera już ich impedancję), sekcja 2 zasilana przez zamknięty łącznik szyn SN (stan normalny z uzasadnieniem).
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
const TRANSFORMATOR_WN_SN = 'tr-wn-sn-110-15-25mva-yd11';
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

/** Równoważnik sieci GPZ: na szynach SN z katalogu (transformatory poza modelem) albo
 *  po stronie 110 kV z `transformatory` transformatorami 110/SN w modelu. */
type UkladGpz =
  | { readonly sekcje: number; readonly rownowaznik: 'SN' }
  | { readonly sekcje: number; readonly rownowaznik: '110kV'; readonly transformatory: number };

function zasilanieGpz(uklad: UkladGpz): Record<string, unknown> {
  if (uklad.rownowaznik === 'SN') {
    // Kontrakt GPZ H5 (`add_grid_source_sn`): przy ≥ 2 sekcjach SN stan normalny łącznika szyn
    // SN jest daną projektu bez wartości domyślnej; jeden równoważnik zasila obie sekcje przez
    // zamknięty łącznik — stan zamknięty wymaga uzasadnienia.
    return {
      sk3_mva: 250.0,
      catalog_binding: katalog('ZRODLO_SN', ZRODLO),
      ...(uklad.sekcje >= 2
        ? {
            sn_coupler: {
              normal_state: 'closed',
              justification: 'Jeden równoważnik sieci zasila obie sekcje SN przez zamknięty łącznik szyn SN (przypadek testowy kadrów).',
            },
          }
        : {}),
    };
  }
  // Kontrakt GPZ H5: równoważnik po stronie 110 kV jest torem zasilania sekcji szyn 110 kV
  // (`hv_sections`), transformatory 110/SN są jawnymi wpisami (sekcja 110 kV, sekcja SN, typ
  // z katalogu) — przypisanie do sekcji SN po kolei (1, 2, 1, …), jak dawne przypisanie
  // cykliczne operacji. Przy ≥ 2 sekcjach SN albo ≥ 2 transformatorach tryb rezerwy jest
  // jawnym wyborem (ENEA Zeszyt 1 §26.10.5): rezerwa ukryta — każda sekcja SN z własnego
  // transformatora.
  return {
    hv_sections: [
      {
        supply: {
          line_name: 'L1',
          supplying_station_name: 'Stacja zasilająca — przykładowe dane przypadku testowego',
          manual_equivalent: {
            hv_voltage_kv: 110.0,
            sk3_hv_mva: 3000.0,
            sk3_min_mva: 2000.0,
            rx_ratio: 0.1,
            rx_ratio_min: 0.1,
            z0_z1_ratio: 1.2,
          },
        },
      },
    ],
    transformers: Array.from({ length: uklad.transformatory }, (_, i) => ({
      hv_section: 1,
      sn_section: (i % uklad.sekcje) + 1,
      transformer_catalog_ref: TRANSFORMATOR_WN_SN,
    })),
    ...(uklad.sekcje >= 2 || uklad.transformatory >= 2 ? { reserve_mode: 'hidden' } : {}),
  };
}

async function siecGpz(
  request: APIRequestContext,
  uklad: UkladGpz = { sekcje: 1, rownowaznik: '110kV', transformatory: 1 },
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
    ...zasilanieGpz(uklad),
    sections_count: uklad.sekcje,
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
  return { projectId, projectName, caseId, caseName, gpzRef: gpz!.ref_id };
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

/** Zaznacz GPZ NATYWNYM klikiem w jego obszar trafienia na kanwie (pas tytułowy GPZ na L1/L2,
 *  blok zwinięty na L0 — ten sam `ownerRef`) i poczekaj na kartę GPZ w prawym inspektorze.
 *  Karta GPZ-H5-SLD etap 2 (wymaganie 1): bilans, przeciążenia i tabela pól z plakietkami
 *  automatyki i P/Q/I/U są w inspektorze, nie na schemacie. */
async function zaznaczGpz(page: Page, gpzRef: string): Promise<void> {
  await page.getByRole('button', { name: 'Dopasuj widok' }).click();
  await page.waitForTimeout(500);
  const uchwyt = page
    .locator(`[data-hit-role="obrys"][data-hit-owner-ref="${gpzRef}"], [data-hit-role="obrys"][data-hit-owner-ref^="${gpzRef}#"]`)
    .first();
  await expect(uchwyt).toHaveCount(1, { timeout: 30000 });
  const ramka = (await uchwyt.boundingBox())!;
  await page.mouse.click(ramka.x + ramka.width / 2, ramka.y + ramka.height / 2);
  await expect(page.getByTestId('inspektor-karta-gpz')).toBeVisible({ timeout: 30000 });
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
    await zaznaczGpz(page, seed.gpzRef);
    const karta = page.getByTestId('inspektor-karta-gpz');
    await expect(karta).toHaveAttribute('data-gpz-wynik', 'brak');
    await expect(page.getByTestId('inspektor-gpz-zasilanie')).toHaveText('Zasilanie GPZ: brak wyniku rozpływu mocy');
    await expect(karta.locator('[data-testid^="inspektor-gpz-plakietka-"][data-testid$="-SPZ"]')).toHaveCount(1);
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
  for (const motyw of [
    { klucz: 'ciemny', theme: 'dark_scada' as const },
    { klucz: 'jasny', theme: 'light_technical' as const },
  ]) {
    await ustawMotyw(page, motyw.theme);
    await zaznaczGpz(page, seed.gpzRef);
    await expect(page.getByTestId('inspektor-karta-gpz')).toHaveAttribute('data-gpz-wynik', 'aktualny', { timeout: 60000 });
    await expect(page.getByTestId('inspektor-gpz-zasilanie')).toHaveText(/^Zasilanie GPZ: P = -?\d+,\d{4} MW, Q = -?\d+,\d{4} Mvar$/);
    await expect(page.getByTestId('inspektor-gpz-tytul')).toHaveText('Pola GPZ — wynik rozpływu mocy');
    await page.screenshot({ path: resolve(KATALOG_ZRZUTOW, `gpz-po-biegu-${motyw.klucz}.png`) });
  }
});

test('GPZ-PARYTET — dwie sekcje SN i trzy transformatory: wieże obok siebie (oba motywy)', async ({ page, request }) => {
  test.setTimeout(600000);
  mkdirSync(KATALOG_ZRZUTOW, { recursive: true });
  const seed = await siecGpz(request, { sekcje: 2, rownowaznik: '110kV', transformatory: 3 });
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

test('GPZ-PARYTET — równoważnik na szynach SN: dwie sekcje bez transformatorów 110/SN (oba motywy)', async ({ page, request }) => {
  test.setTimeout(600000);
  mkdirSync(KATALOG_ZRZUTOW, { recursive: true });
  const seed = await siecGpz(request, { sekcje: 2, rownowaznik: 'SN' });
  await otworzSchemat(page, seed, '/#sld');
  for (const motyw of [
    { klucz: 'ciemny', theme: 'dark_scada' as const },
    { klucz: 'jasny', theme: 'light_technical' as const },
  ]) {
    await ustawMotyw(page, motyw.theme);
    await page.getByRole('button', { name: 'Dopasuj widok' }).click();
    await page.waitForTimeout(500);
    await expect(page.getByTestId('sld-v3-gpz-zone')).toHaveCount(1, { timeout: 30000 });
    // Granicą modelu są szyny SN: żadnej wieży transformatora 110/SN na schemacie.
    await expect(page.locator('[data-uzwojenia-stan]')).toHaveCount(0);
    await page.screenshot({ path: resolve(KATALOG_ZRZUTOW, `gpz-rownowaznik-sn-dwie-sekcje-${motyw.klucz}.png`) });
  }
});
