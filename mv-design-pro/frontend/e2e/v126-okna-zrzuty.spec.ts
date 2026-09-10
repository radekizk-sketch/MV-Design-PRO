/**
 * KARTA B-02 / W3-E (2026-09-10; wcześniej V126-OKNA) — ZRZUTY DOWODOWE z ŻYWEJ
 * aplikacji: okno „Analizy specjalistyczne" (ui2/wyniki/akademickie) w obu motywach,
 * na REALNYM backendzie — katalog kart z `GET /api/catalog/v126/analysis-catalog`,
 * gotowość z `GET /api/cases/{id}/v126/gotowosc` (ta sama funkcja, która odmawia 422),
 * bieg z `POST /api/cases/{id}/runs/v126/{rodzaj}` na committed ENM.
 *
 * Zrzuty trafiają do `docs/sld/audyt-2026-08/v126-*.png`:
 *   1. katalog-kart — karty pogrupowane inżyniersko, ze stanem danych per karta,
 *   2. analiza-uziom-niepotwierdzona — widok analizy (przedmiot → pytanie → dane →
 *      gotowość NIEPOTWIERDZONA z listą braków → kryteria → zakres → uruchomienie
 *      zablokowane),
 *   3. analiza-uziom-potwierdzona — po wypełnieniu formularza uziomu wartościami z
 *      fixtury backendu: GOTOWOŚĆ POTWIERDZONA + lista sprawdzonych warunków,
 *   4. wynik-uziom — REALNY bieg bezpieczeństwa uziemień (werdykt, wielkości),
 *   5. slad-whitebox — ślad obliczeń rozwinięty (komplet kroków),
 *   6. wynik-<rodzaj> — bieg rodzaju liczącego WPROST z modelu (bez parametrów);
 *      rodzaj wybrany z REALNEJ gotowości backendu (pierwszy prezentowany
 *      POTWIERDZONY, preferowana propagacja niepewności), a nie założony.
 *
 * Uczciwość zrzutu (metoda z audytu §1): motyw przełączany REALNYM przyciskiem
 * powłoki (`mvd-theme-toggle`) z asercją na `data-theme` — zasiew `localStorage`
 * nie przechodzi rehydracji `persist`, więc dawałby fikcyjne „oba motywy".
 * Sieć tła budowana operacjami domenowymi API (committed ENM), bo V12.6 odmawia
 * liczenia z draftu UI — zrzut ma pokazywać WYNIK, a nie stan „brak węzłów".
 *
 * Uruchomienie (cwd: mv-design-pro/frontend, backend na :8000):
 *   npx playwright test e2e/v126-okna-zrzuty.spec.ts
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { otworzZakladkeWynikow } from './nawigacjaWynikow';
import { otworzAnalize, uruchomAnalize, wypelnijUziomIPotwierdz } from './formularzV126';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const CABLE_ID = 'cable-tfk-yakxs-3x120';
const SOURCE_ID = 'src-gpz-15kv-250mva-rx010';
const CATALOG_VERSION = '2024.1';
const HERE = dirname(fileURLToPath(import.meta.url));
const KATALOG_ZRZUTOW = resolve(HERE, '..', '..', 'docs', 'sld', 'audyt-2026-08');

let opCounter = 0;

function katalogBinding(namespace: string, itemId: string) {
  return { catalog_namespace: namespace, catalog_item_id: itemId, catalog_item_version: CATALOG_VERSION };
}

async function operacja(
  request: APIRequestContext,
  caseId: string,
  name: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const response = await request.post(`${BACKEND_BASE}/api/cases/${caseId}/enm/domain-ops`, {
    data: {
      project_id: '',
      snapshot_base_hash: '',
      operation: {
        name,
        idempotency_key: `v126-zrzut-${name}-${String(++opCounter).padStart(4, '0')}`,
        payload,
      },
    },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { error?: string | null };
  expect(body.error ?? null).toBeNull();
}

async function siecTla(
  request: APIRequestContext,
): Promise<{ caseId: string; projectId: string; projectName: string; caseName: string }> {
  const suffix = Date.now().toString(36);
  const projectName = `Analizy specjalistyczne ${suffix}`;
  const caseName = `Przypadek analiz ${suffix}`;
  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'B-02 zrzuty okna analiz specjalistycznych',
      mode: 'TO-BE',
      voltage_level_kv: 15.0,
      frequency_hz: 50.0,
    },
  });
  expect(projectResponse.ok()).toBeTruthy();
  const project = (await projectResponse.json()) as { id: string };
  const caseResponse = await request.post(`${BACKEND_BASE}/api/study-cases`, {
    data: { project_id: project.id, name: caseName, description: '', config: {}, set_active: true },
  });
  expect(caseResponse.ok()).toBeTruthy();
  const studyCase = (await caseResponse.json()) as { id: string };

  await operacja(request, studyCase.id, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: katalogBinding('ZRODLO_SN', SOURCE_ID),
    hv_voltage_kv: 110.0,
    transformer_sn_mva: 25.0,
  });
  for (const [idx, dlugosc] of [400, 300].entries()) {
    await operacja(request, studyCase.id, 'continue_trunk_segment_sn', {
      segment: {
        rodzaj: 'KABEL',
        dlugosc_m: dlugosc,
        name: `Odcinek ${idx + 1}`,
        catalog_binding: katalogBinding('KABEL_SN', CABLE_ID),
      },
    });
  }
  return { caseId: studyCase.id, projectId: project.id, projectName, caseName };
}

/**
 * Rodzaj liczący WPROST z modelu, POTWIERDZONY przez REALNĄ gotowość backendu na sieci
 * tła (nie założony w specu). Preferowana propagacja niepewności; brak jakiegokolwiek
 * prezentowanego rodzaju POTWIERDZONEGO bez parametrów jest jawnym niepowodzeniem.
 */
async function rodzajPotwierdzonyBezParametrow(request: APIRequestContext, caseId: string): Promise<string> {
  const katalog = await request.get(`${BACKEND_BASE}/api/catalog/v126/analysis-catalog`);
  expect(katalog.ok()).toBeTruthy();
  const prezentowane = new Set(
    ((await katalog.json()) as { items: { kod: string; prezentowany: boolean }[] }).items
      .filter((karta) => karta.prezentowany)
      .map((karta) => karta.kod),
  );
  const gotowosc = await request.get(`${BACKEND_BASE}/api/cases/${caseId}/v126/gotowosc`);
  expect(gotowosc.ok()).toBeTruthy();
  const potwierdzone = ((await gotowosc.json()) as { analizy: { kod: string; gotowosc: string }[] }).analizy
    .filter((analiza) => analiza.gotowosc === 'POTWIERDZONA' && prezentowane.has(analiza.kod))
    .map((analiza) => analiza.kod);
  const wybrany = potwierdzone.includes('uncertainty_sensitivity') ? 'uncertainty_sensitivity' : potwierdzone[0];
  expect(wybrany, 'żaden prezentowany rodzaj nie jest POTWIERDZONY bez parametrów na sieci tła').toBeTruthy();
  return wybrany as string;
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
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 60000 });
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
    .poll(async () => page.evaluate(() => document.documentElement.getAttribute('data-theme')), {
      timeout: 10000,
    })
    .toBe(docelowy);
}

/**
 * Ustawia przelacznik zwijany w zadany stan po jego REALNYM `aria-expanded`.
 * Slepy klik zakladalby stan poczatkowy — a komponent NIE jest odmontowywany
 * miedzy motywami, wiec drugi przebieg petli zamykalby to, co mial otworzyc.
 */
async function ustawPrzelacznik(page: Page, testid: string, otwarty: boolean): Promise<void> {
  const przycisk = page.getByTestId(testid);
  await expect(przycisk).toBeVisible({ timeout: 15000 });
  const stan = await przycisk.getAttribute('aria-expanded');
  if ((stan === 'true') !== otwarty) await przycisk.click();
  await expect(przycisk).toHaveAttribute('aria-expanded', otwarty ? 'true' : 'false');
}

/** Otwiera zakładkę „Analizy specjalistyczne" warsztatu Wyników (realne kliki). */
async function otworzOknoSpecjalistyczne(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Wyniki i dowody \d$/ }).click();
  await expect(page.getByTestId('mvd-wyniki-warsztat')).toBeVisible({ timeout: 30000 });
  // Obszar „Analizy specjalistyczne" istnieje wyłącznie w trybie EKSPERCKIM
  // (`MIN_TRYB_ZAKLADKI.akademickie = 'expert'`, `ui2/spaces/wyniki/obszary.ts`) —
  // tryb przełączany REALNYM przyciskiem powłoki (grupa „Tryb"), bez zasiewu stanu.
  const przyciskEkspercki = page.locator('[data-mvd-mode="expert"]');
  await expect(przyciskEkspercki).toBeVisible({ timeout: 15000 });
  if ((await przyciskEkspercki.getAttribute('aria-pressed')) !== 'true') {
    await przyciskEkspercki.click();
    await expect(przyciskEkspercki).toHaveAttribute('aria-pressed', 'true');
  }
  await otworzZakladkeWynikow(page, 'akademickie');
  await expect(page.getByTestId('mvd-akad-ekran')).toBeVisible({ timeout: 30000 });
}

/** Powrót do katalogu kart (jeśli okno jest w widoku analizy). */
async function wrocDoKatalogu(page: Page): Promise<void> {
  const powrot = page.getByTestId('mvd-akad-powrot');
  if (await powrot.isVisible()) await powrot.click();
  await expect(page.getByTestId('mvd-akad-katalog-kart')).toBeVisible({ timeout: 15000 });
}

test('B-02 — zrzuty okna „Analizy specjalistyczne" na realnym backendzie (oba motywy)', async ({ page, request }) => {
  test.setTimeout(600000);
  mkdirSync(KATALOG_ZRZUTOW, { recursive: true });
  const seed = await siecTla(request);
  const rodzajZModelu = await rodzajPotwierdzonyBezParametrow(request, seed.caseId);
  await otworzAplikacje(page, seed);
  await otworzOknoSpecjalistyczne(page);

  for (const motyw of [
    { klucz: 'ciemny', theme: 'dark_scada' as const },
    { klucz: 'jasny', theme: 'light_technical' as const },
  ]) {
    await ustawMotyw(page, motyw.theme);
    await wrocDoKatalogu(page);

    // 1. Katalog kart — grupy inżynierskie z backendu, stan danych per karta.
    await expect(page.locator('[data-testid^="mvd-akad-karta-otworz-"]').first()).toBeVisible({ timeout: 30000 });
    await page.screenshot({
      path: resolve(KATALOG_ZRZUTOW, `v126-katalog-kart-${motyw.klucz}.png`),
      fullPage: true,
    });

    // 2. Widok analizy wymagającej danych spoza modelu — gotowość NIEPOTWIERDZONA z brakami.
    await otworzAnalize(page, 'earthing_safety');
    await expect(page.getByTestId('mvd-akad-gotowosc')).toHaveAttribute('data-gotowosc', 'NIEPOTWIERDZONA', {
      timeout: 30000,
    });
    await expect(page.getByTestId('mvd-akad-uruchom')).toBeDisabled();
    await page.screenshot({
      path: resolve(KATALOG_ZRZUTOW, `v126-analiza-uziom-niepotwierdzona-${motyw.klucz}.png`),
      fullPage: true,
    });

    // 3. Formularz uziomu wypełniony (wartości z fixtury backendu) — REALNA gotowość POTWIERDZONA.
    await wypelnijUziomIPotwierdz(page);
    // Panel warsztatu przewija się WEWNĘTRZNIE (kontener), więc `fullPage` nie rozwija
    // treści — badana sekcja jest przewijana do kadru przed zrzutem (dowód „widoczne",
    // nie „gdzieś niżej").
    await page.getByTestId('mvd-akad-gotowosc').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: resolve(KATALOG_ZRZUTOW, `v126-analiza-uziom-potwierdzona-${motyw.klucz}.png`),
      fullPage: true,
    });

    // 4. REALNY bieg bezpieczeństwa uziemień — werdykt, wielkości z jednostkami.
    await uruchomAnalize(page, 120000);
    await page.getByTestId('mvd-akad-wyniki').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: resolve(KATALOG_ZRZUTOW, `v126-wynik-uziom-${motyw.klucz}.png`),
      fullPage: true,
    });

    // 5. Ślad WHITE BOX rozwinięty — komplet kroków (bez zaszytego limitu).
    await ustawPrzelacznik(page, 'mvd-akad-slad-przelacz', true);
    await page.getByTestId('mvd-akad-slad').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: resolve(KATALOG_ZRZUTOW, `v126-slad-whitebox-${motyw.klucz}.png`),
      fullPage: true,
    });
    await ustawPrzelacznik(page, 'mvd-akad-slad-przelacz', false);

    // 6. Rodzaj liczący wprost z modelu (bez formularza) — POTWIERDZONY przez backend.
    await wrocDoKatalogu(page);
    await otworzAnalize(page, rodzajZModelu);
    await expect(page.getByTestId('mvd-akad-gotowosc')).toHaveAttribute('data-gotowosc', 'POTWIERDZONA', {
      timeout: 30000,
    });
    await uruchomAnalize(page, 120000);
    await page.getByTestId('mvd-akad-wyniki').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: resolve(KATALOG_ZRZUTOW, `v126-wynik-${rodzajZModelu.replace(/_/g, '-')}-${motyw.klucz}.png`),
      fullPage: true,
    });
  }
});
