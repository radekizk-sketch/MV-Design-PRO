/**
 * KARTA V126-OKNA — ZRZUTY DOWODOWE z ŻYWEJ aplikacji: okno „Analizy akademickie"
 * (ui2/wyniki/akademickie) w obu motywach, na REALNYM biegu solvera V12.6.
 *
 * Zrzuty trafiają do `docs/sld/audyt-2026-08/v126-*.png`.
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
  const projectName = `Analizy akademickie ${suffix}`;
  const caseName = `Przypadek analiz ${suffix}`;
  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'V126-OKNA zrzuty okna analiz akademickich',
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

/** Otwiera zakładkę „Analizy akademickie" warsztatu Wyników (realne kliki). */
async function otworzOknoAkademickie(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Wyniki i dowody \d$/ }).click();
  await expect(page.getByTestId('mvd-wyniki-warsztat')).toBeVisible({ timeout: 30000 });
  await page.getByTestId('mvd-wyniki-zakladka-akademickie').click();
  await expect(page.getByTestId('mvd-akad-ekran')).toBeVisible({ timeout: 30000 });
}

test('V126-OKNA — zrzuty okna analiz akademickich (oba motywy)', async ({ page, request }) => {
  test.setTimeout(600000);
  mkdirSync(KATALOG_ZRZUTOW, { recursive: true });
  const seed = await siecTla(request);
  await otworzAplikacje(page, seed);
  await otworzOknoAkademickie(page);

  for (const motyw of [
    { klucz: 'ciemny', theme: 'dark_scada' as const },
    { klucz: 'jasny', theme: 'light_technical' as const },
  ]) {
    await ustawMotyw(page, motyw.theme);
    await expect(page.getByTestId('mvd-akad-rodzaj')).toBeVisible({ timeout: 30000 });

    // 1. Wybór rodzaju — lista z katalogu backendu (komplet rodzajów kontraktu).
    await page.screenshot({
      path: resolve(KATALOG_ZRZUTOW, `v126-wybor-rodzaju-${motyw.klucz}.png`),
      fullPage: true,
    });

    // 2. Bieg rodzaju liczącego wprost z modelu — wynik, ślad, dowód, raport.
    await page.getByTestId('mvd-akad-rodzaj').selectOption('voltage_stability');
    await page.getByTestId('mvd-akad-uruchom').click();
    await expect(page.getByTestId('mvd-akad-wyniki')).toBeVisible({ timeout: 60000 });
    await page.screenshot({
      path: resolve(KATALOG_ZRZUTOW, `v126-wynik-stabilnosc-napieciowa-${motyw.klucz}.png`),
      fullPage: true,
    });

    // 3. Ślad WHITE BOX rozwinięty — komplet kroków (bez zaszytego limitu).
    await ustawPrzelacznik(page, 'mvd-akad-slad-przelacz', true);
    await page.screenshot({
      path: resolve(KATALOG_ZRZUTOW, `v126-slad-whitebox-${motyw.klucz}.png`),
      fullPage: true,
    });
    await ustawPrzelacznik(page, 'mvd-akad-slad-przelacz', false);

    // 4. Formularz parametrów projektowych — rodzaj wymagający danych spoza modelu.
    await page.getByTestId('mvd-akad-rodzaj').selectOption('earthing_safety');
    await ustawPrzelacznik(page, 'mvd-akad-parametry-przelacz', true);
    await expect(page.getByTestId('mvd-akad-uziom')).toBeVisible({ timeout: 15000 });
    await page.screenshot({
      path: resolve(KATALOG_ZRZUTOW, `v126-parametry-uziom-${motyw.klucz}.png`),
      fullPage: true,
    });

    // 5. Rodzaj bez ekranu trasowego — dobór uziemienia punktu neutralnego.
    await page.getByTestId('mvd-akad-rodzaj').selectOption('neutral_earthing_design');
    await page.getByTestId('mvd-akad-uruchom').click();
    await expect(page.getByTestId('mvd-akad-wyniki')).toBeVisible({ timeout: 60000 });
    await page.screenshot({
      path: resolve(KATALOG_ZRZUTOW, `v126-uziemienie-neutralnego-${motyw.klucz}.png`),
      fullPage: true,
    });
  }
});
