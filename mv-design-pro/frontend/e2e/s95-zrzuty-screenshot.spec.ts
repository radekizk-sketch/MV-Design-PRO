/**
 * KARTA S9-5 — ZRZUTY DOWODOWE z ŻYWEJ aplikacji: menu kontekstowe otwarte na
 * różnych KLASACH obiektów kanwy, w obu motywach.
 *
 * Zrzuty trafiają do `docs/sld/audyt-2026-08/s9-5-<klasa>-<motyw>.png`.
 *
 * Uczciwość zrzutu (metoda z audytu §1): motyw przełączany REALNYM przyciskiem
 * powłoki (`mvd-theme-toggle`) z asercją na `data-theme` — zasiew `localStorage`
 * nie przechodzi rehydracji `persist`, więc dawałby fikcyjne „oba motywy".
 * Menu otwierane NATYWNYM prawym klikiem w uchwyt trafienia (warstwa S9-4).
 *
 * Uruchomienie (cwd: mv-design-pro/frontend, backend na :8000):
 *   npx playwright test e2e/s95-zrzuty-screenshot.spec.ts
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
): Promise<Record<string, unknown>> {
  const response = await request.post(`${BACKEND_BASE}/api/cases/${caseId}/enm/domain-ops`, {
    data: {
      project_id: '',
      snapshot_base_hash: '',
      operation: { name, idempotency_key: `s95-zrzut-${name}-${String(++opCounter).padStart(4, '0')}`, payload },
    },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { error?: string | null };
  expect(body.error ?? null).toBeNull();
  return body as Record<string, unknown>;
}

/**
 * Sieć TŁA dla zrzutów budowana operacjami API — zrzuty pokazują MENU, a nie
 * proces budowy (ten dowodzi spec `s95-budowa-z-kanwy.spec.ts`). Rozdzielenie
 * jest świadome: harness zrzutowy nie może zależeć od czasu 15 kreatorów.
 */
async function siecTla(request: APIRequestContext): Promise<{ caseId: string; projectId: string; projectName: string; caseName: string }> {
  const suffix = Date.now().toString(36);
  const projectName = `Zrzuty menu kanwy ${suffix}`;
  const caseName = `Przypadek zrzutów ${suffix}`;
  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: { name: projectName, description: 'S9-5 zrzuty menu kontekstowego', mode: 'TO-BE', voltage_level_kv: 15.0, frequency_hz: 50.0 },
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
  for (const [idx, dlugosc] of [300, 250].entries()) {
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

async function otworzAplikacje(page: Page, seed: { projectId: string; projectName: string; caseId: string; caseName: string }): Promise<void> {
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

const KLASY: readonly { readonly klasa: string; readonly plik: string }[] = [
  { klasa: 'zrodlo', plik: 'zrodlo' },
  { klasa: 'tor', plik: 'tor' },
  { klasa: 'stacja', plik: 'stacja' },
  { klasa: 'szyna', plik: 'szyna' },
  { klasa: 'aparat', plik: 'aparat' },
  { klasa: 'etykieta', plik: 'etykieta' },
];

test('S9-5 — zrzuty menu kontekstowego na klasach obiektów kanwy (oba motywy)', async ({ page, request }) => {
  test.setTimeout(600000);
  mkdirSync(KATALOG_ZRZUTOW, { recursive: true });
  const seed = await siecTla(request);
  await otworzAplikacje(page, seed);

  for (const motyw of [
    { klucz: 'ciemny', theme: 'dark_scada' as const },
    { klucz: 'jasny', theme: 'light_technical' as const },
  ]) {
    await ustawMotyw(page, motyw.theme);

    // Menu TŁA — jedyna kategoria bez obiektu modelu.
    await page.getByTestId('sld-canvas-v3').click({ button: 'right', position: { x: 60, y: 60 } });
    await expect(page.getByRole('menu')).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: resolve(KATALOG_ZRZUTOW, `s9-5-tlo-${motyw.klucz}.png`) });
    await page.keyboard.press('Escape');

    for (const wpis of KLASY) {
      const uchwyt = page.locator(`[data-hit-klasa="${wpis.klasa}"][data-hit-role="obrys"]`).first();
      if ((await uchwyt.count()) === 0) {
        // Uczciwie: klasa nieobecna na tej scenie nie dostaje zrzutu-atrapy.
        continue;
      }
      // Klik NATYWNY myszą w rzeczywisty punkt uchwytu: `locator.click` odrzuca
      // cienkie kreski SVG jako „niewidoczne" (heurystyka aktorowalności), a to
      // jest dokładnie ten kształt, który karta S9-4 uczyniła klikalnym.
      const box = await uchwyt.boundingBox();
      if (!box) continue;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
      const menu = page.getByRole('menu');
      if (!(await menu.isVisible({ timeout: 5000 }).catch(() => false))) {
        // Obiekt świadomie bez menu (rysunek bez odpowiednika w modelu) —
        // zrzut i tak powstaje, żeby brak menu był widoczny w dowodach.
        await page.screenshot({ path: resolve(KATALOG_ZRZUTOW, `s9-5-${wpis.plik}-${motyw.klucz}.png`) });
        continue;
      }
      await page.screenshot({ path: resolve(KATALOG_ZRZUTOW, `s9-5-${wpis.plik}-${motyw.klucz}.png`) });
      await page.keyboard.press('Escape');
    }
  }
});
