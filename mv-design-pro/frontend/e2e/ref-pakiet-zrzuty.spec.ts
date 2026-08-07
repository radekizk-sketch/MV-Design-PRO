/**
 * KARTA REF-PAKIET — ZRZUTY DOWODOWE (żywy backend, oba motywy).
 *
 * DOWODZONA ŚCIEŻKA (przed kartą niemożliwa): projektant WIDZI i ZMIENIA
 * zakres oceny zgodności referencyjnej. Do 2026-08-07 pakiet OSD był zaszyty
 * stałą w ekranie modelu, a pozostałe miejsca zgodności nie dawały wyboru —
 * lista `GET /api/reference/packs` miała konsumenta wyłącznie w teście.
 *
 * Zrzuty: `docs/sld/audyt-2026-08/ref-pakiet-*.png`
 *   - kontrolka „Zakres oceny" z listą referencji z rejestru (oba motywy),
 *   - stan po zawężeniu do jednej referencji (oba motywy).
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   node ./scripts/playwright-run-real.mjs e2e/ref-pakiet-zrzuty.spec.ts
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const KATALOG_ZRZUTOW = path.resolve(_dirname, '../../docs/sld/audyt-2026-08');
const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';

type Seed = { projectId: string; projectName: string; caseId: string; caseName: string };

async function utworzProjektIPrzypadek(request: APIRequestContext): Promise<Seed> {
  const suffix = Date.now().toString(36);
  const projectName = `REF-PAKIET zrzuty ${suffix}`;
  const caseName = `Przypadek referencji ${suffix}`;

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'REF-PAKIET: wybór pakietu referencyjnego z danych',
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

  return { projectId: project.id, projectName, caseId: studyCase.id, caseName };
}

async function otworzPowloke(page: Page, seed: Seed): Promise<void> {
  await page.addInitScript((dane) => {
    localStorage.setItem(
      'mv-design-app-state',
      JSON.stringify({
        state: {
          activeProjectId: dane.projectId,
          activeProjectName: dane.projectName,
          activeCaseId: dane.caseId,
          activeCaseName: dane.caseName,
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
    // Start ZAWSZE od motywu dyspozytorskiego — para zrzutów ma być powtarzalna
    // niezależnie od preferencji systemu (wzorzec: e2e/kd8-motyw-jedna-prawda).
    localStorage.setItem('mvd-theme-mode', JSON.stringify({ state: { mode: 'dark_scada' }, version: 0 }));
  }, seed);

  await page.goto('/', { waitUntil: 'commit' });
  // Budżet zimnego rozruchu vite dev na tym kontenerze (nie asercja produktu).
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
}

/**
 * Nazwa motywu odczytana z DOM — zrzut nazywa się tym, czym NAPRAWDĘ jest.
 * Powłoka publikuje `data-theme` w postaci `dark_scada` / `light_technical`
 * (`ui2/theme/themeMode.ts`), więc rozpoznajemy człon, nie całą wartość.
 */
async function nazwaMotywu(page: Page): Promise<'jasny' | 'ciemny'> {
  const motyw = (await page.locator('html').getAttribute('data-theme')) ?? '';
  expect(motyw).not.toBe('');
  return motyw.includes('dark') ? 'ciemny' : 'jasny';
}

async function zrzutObuMotywow(page: Page, nazwa: string): Promise<void> {
  fs.mkdirSync(KATALOG_ZRZUTOW, { recursive: true });
  // Kadr ma pokazywać kontrolkę zakresu RAZEM z tabelą oceny — inaczej zrzut
  // nie dowodzi, czym wybór steruje.
  await page.getByTestId('mvd-ref-sekcja').scrollIntoViewIfNeeded();
  const pierwszy = await nazwaMotywu(page);
  await page.screenshot({ path: path.join(KATALOG_ZRZUTOW, `${nazwa}-${pierwszy}.png`) });
  await page.getByTestId('mvd-theme-toggle').click();
  const drugi = await nazwaMotywu(page);
  expect(drugi).not.toBe(pierwszy);
  await page.screenshot({ path: path.join(KATALOG_ZRZUTOW, `${nazwa}-${drugi}.png`) });
  await page.getByTestId('mvd-theme-toggle').click();
}

test('zakres oceny zgodności referencyjnej jest widoczny i zmienialny (zrzuty obu motywów)', async ({
  page,
  request,
}) => {
  test.setTimeout(180000);
  const seed = await utworzProjektIPrzypadek(request);
  await otworzPowloke(page, seed);

  await page.getByRole('button', { name: /^Gotowość \d$/ }).click();
  await expect(page.getByTestId('mvd-ref-sekcja')).toBeVisible({ timeout: 20000 });

  // Kontrolka zakresu z listą referencji rejestru (nie ze stałej w kodzie).
  const wybor = page.getByTestId('mvd-ref-wybor-select');
  await expect(wybor).toBeVisible({ timeout: 20000 });
  const opcje = await wybor.locator('option').allTextContents();
  expect(opcje[0]).toBe('Wszystkie referencje');
  expect(opcje.length).toBeGreaterThan(1);
  await zrzutObuMotywow(page, 'ref-pakiet-zakres-oceny');

  // Zawężenie do pojedynczej referencji — natywna zmiana listy.
  const pierwszyPakiet = await wybor.locator('option').nth(1).getAttribute('value');
  expect(pierwszyPakiet).toBeTruthy();
  const odpowiedz = page.waitForResponse(
    (r) => r.url().includes('/reference/compliance') && r.url().includes(`packs=${pierwszyPakiet}`),
    { timeout: 20000 },
  );
  await wybor.selectOption(pierwszyPakiet as string);
  await odpowiedz;
  await zrzutObuMotywow(page, 'ref-pakiet-zawezenie');
});
