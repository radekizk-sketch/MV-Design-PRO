/**
 * KARTA UI-02b JEDEN-INSPEKTOR — klik obiektu kanwy otwiera PRAWY INSPEKTOR (szuflada
 * szczegółów nad kanwą skasowana), na REALNYM backendzie, ścieżką NATYWNĄ (kliki myszy
 * Playwrighta w żywej aplikacji, bez zdarzeń syntetycznych).
 *
 * Co spec dowodzi:
 *  1. inspektor jest na starcie zwinięty; natywny klik w blok stacji na planie sieci
 *     zaznacza stację i ROZWIJA inspektor, który pokazuje stację i jej pasek działań
 *     (każde działanie dokładnie raz, niedostępne z przyczyną w `title`);
 *  2. po kliku nic nie leży NAD kanwą: `elementFromPoint` w środku rysunku trafia w kanwę
 *     (dawniej szuflada zasłaniała prawy pas rysunku);
 *  3. upuszczenie układu PV z palety na stację otwiera formularz w inspektorze, a „Zapisz
 *     układ" zapisuje generator realnym POST do modelu przypadku;
 *  4. kadry 1440×900 i 1920×1080 w obu motywach (materiał oceny wizualnej właściciela,
 *     bramka B-02 — spec NIE wystawia werdyktu wizualnego).
 *
 * Zrzuty: `docs/uiux/zrzuty/ui02-jeden-inspektor/` (przez `katalogZrzutow` — bez
 * `ZRZUTY_DO_DOKUMENTACJI=1` trafiają do `test-results/zrzuty-dokumentacji/…`).
 */
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { katalogZrzutow } from './katalogZrzutow';
import { BACKEND_BASE, otworzAplikacje, siecKadrow, ustawMotyw } from './siecKadrowStacji';

const HERE = dirname(fileURLToPath(import.meta.url));
const KATALOG_ZRZUTOW = katalogZrzutow(
  resolve(HERE, '..', '..', 'docs', 'uiux', 'zrzuty', 'ui02-jeden-inspektor'),
);

const OKNA = [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;
const MOTYWY = [
  { klucz: 'ciemny', theme: 'dark_scada' as const },
  { klucz: 'jasny', theme: 'light_technical' as const },
] as const;
const STACJA = 'Stacja Końcowa';
const PRZEKSZTALTNIK_PV_NN = 'conv-pv-nn-0p5mw-0p4kv';

/** Natywny klik myszy w środek bloku stacji na planie sieci (L0). */
async function kliknijStacje(page: Page, stacjaRef: string): Promise<void> {
  const blok = page.locator(`[data-testid="sld-v3-l0-${stacjaRef}"]`);
  await expect(blok).toBeAttached({ timeout: 30000 });
  const ramka = await blok.boundingBox();
  expect(ramka, 'blok stacji ma ramkę na ekranie').not.toBeNull();
  await page.mouse.click(ramka!.x + ramka!.width / 2, ramka!.y + ramka!.height / 2);
}

/** Środek widocznej kanwy trafia w kanwę — nic nie leży nad rysunkiem. */
async function srodekKanwyTrafiaKanwe(page: Page): Promise<void> {
  const wynik = await page.evaluate(() => {
    const kanwa = document.querySelector('[data-testid="sld-canvas-v3"]');
    if (!kanwa) return { jest: false, trafienie: 'brak kanwy' };
    const r = kanwa.getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      jest: Boolean(el && kanwa.contains(el)),
      trafienie: el ? `${el.tagName}#${el.getAttribute('data-testid') ?? ''}` : 'nic',
    };
  });
  expect(wynik.jest, `środek rysunku trafia w kanwę (trafiono: ${wynik.trafienie})`).toBe(true);
}

/** Pasek działań inspektora: ≥ 1 działanie, każde dokładnie raz, niedostępne z przyczyną. */
async function sprawdzPasekDzialan(page: Page): Promise<void> {
  // K6: działania są na końcu inspektora, zwinięte — rozwinięcie jednym klikiem.
  const zwiniete = page.getByTestId('mvd-inspector').getByTestId('inspektor-dzialania-zwiniete');
  if ((await zwiniete.getAttribute('open')) === null) {
    await zwiniete.getByTestId('inspektor-dzialania-rozwin').click();
  }
  const pasek = page.getByTestId('mvd-inspector').getByTestId('inspektor-dzialania');
  await expect(pasek).toBeVisible();
  const dzialania = await pasek.locator('[data-testid^="inspektor-akcja-"]').evaluateAll((els) =>
    els.map((el) => ({
      id: el.getAttribute('data-testid') ?? '',
      niedostepne: el.getAttribute('aria-disabled') === 'true',
      przyczyna: el.getAttribute('title') ?? '',
    })),
  );
  expect(dzialania.length, 'stacja ma działania w inspektorze').toBeGreaterThan(0);
  expect(new Set(dzialania.map((d) => d.id)).size, 'każde działanie dokładnie raz').toBe(dzialania.length);
  for (const d of dzialania.filter((x) => x.niedostepne)) {
    expect(d.przyczyna.trim(), `${d.id}: niedostępne działanie podaje przyczynę`).not.toBe('');
  }
}

test('UI-02b — klik stacji otwiera prawy inspektor, kanwa odsłonięta, zapis OZE z inspektora; kadry', async ({
  browser,
  request,
}, testInfo) => {
  test.setTimeout(900000);
  mkdirSync(KATALOG_ZRZUTOW, { recursive: true });
  const seed = await siecKadrow(request);
  const stacjaRef = (seed.enm.substations ?? []).find((s) => String(s.name) === STACJA)?.ref_id;
  expect(stacjaRef, `${STACJA} w modelu`).toBeTruthy();

  let zapisano = false;
  for (const okno of OKNA) {
    for (const motyw of MOTYWY) {
      // Świeży kontekst przeglądarki na każdy kadr: układ powłoki (zwinięcie inspektora)
      // jest utrwalany w localStorage, a krok 1 dowodzi rozwinięcia ZE STANU zwiniętego.
      const kontekst = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
      const page = await kontekst.newPage();
      await otworzAplikacje(page, seed, okno, motyw.theme);
      await ustawMotyw(page, motyw.theme);
      const inspektor = page.getByTestId('mvd-inspector');
      // Kadr całej sieci (plan sieci, L0) — blok stacji jest pojedynczym obiektem.
      await page.keyboard.press('Shift+F');
      await page.waitForTimeout(400);
      await expect(inspektor, 'inspektor zwinięty przed klikiem').toBeHidden();

      await kliknijStacje(page, stacjaRef!);
      await expect(inspektor, 'klik obiektu rozwija inspektor').toBeVisible();
      await expect(inspektor).toContainText(STACJA);
      await sprawdzPasekDzialan(page);
      await srodekKanwyTrafiaKanwe(page);
      await expect(page.locator('[data-testid^="sld-v2-detail-drawer"]')).toHaveCount(0);
      await page.waitForTimeout(300);
      await page.screenshot({
        path: resolve(KATALOG_ZRZUTOW, `ui02-stacja-${okno.width}x${okno.height}-${motyw.klucz}.png`),
      });

      // Paleta PV → stacja: formularz układu w inspektorze.
      if ((await page.getByTestId('der-palette-btn-PV').count()) === 0) {
        await page.getByTestId('sld-v3-toolbar-menu-toggle').click();
        await expect(page.getByTestId('sld-v3-toolbar-menu')).toBeVisible();
      }
      await page.getByTestId('der-palette-btn-PV').click();
      await kliknijStacje(page, stacjaRef!);
      const formularz = inspektor.getByTestId('inspektor-der-formularz');
      await expect(formularz).toBeVisible();
      await expect(formularz.getByTestId('inspektor-der-typ')).toHaveValue('PV');
      const przeksztaltnik = formularz.getByTestId('inspektor-der-przeksztaltnik');
      await expect(przeksztaltnik).toHaveValue('');
      await przeksztaltnik.selectOption(PRZEKSZTALTNIK_PV_NN);
      await formularz.getByTestId('inspektor-der-moc').fill('0.5');
      await srodekKanwyTrafiaKanwe(page);
      await page.waitForTimeout(300);
      await page.screenshot({
        path: resolve(KATALOG_ZRZUTOW, `ui02-formularz-oze-${okno.width}x${okno.height}-${motyw.klucz}.png`),
      });

      if (!zapisano) {
        const odpowiedz = page.waitForResponse(
          (r) => r.url().includes(`/api/projects/${seed.projectId}/cases/${seed.caseId}/generators`)
            && r.request().method() === 'POST',
          { timeout: 15000 },
        );
        await formularz.getByTestId('inspektor-der-zapisz').click();
        expect((await odpowiedz).status()).toBe(201);
        await expect(inspektor.getByTestId('inspektor-der-formularz')).toHaveCount(0);
        const model = await request.get(`${BACKEND_BASE}/api/cases/${seed.caseId}/enm`);
        expect(model.ok()).toBeTruthy();
        const enm = (await model.json()) as {
          generators?: Array<{ station_ref?: string; catalog_ref?: string; p_mw?: number }>;
        };
        const generator = (enm.generators ?? []).find(
          (g) => g.station_ref === stacjaRef && g.catalog_ref === PRZEKSZTALTNIK_PV_NN,
        );
        expect(generator?.p_mw, 'generator zapisany z inspektora w modelu przypadku').toBe(0.5);
        zapisano = true;
      } else {
        await formularz.getByTestId('inspektor-der-anuluj').click();
        await expect(inspektor.getByTestId('inspektor-der-formularz')).toHaveCount(0);
      }
      await kontekst.close();
    }
  }
  expect(zapisano).toBe(true);
});
