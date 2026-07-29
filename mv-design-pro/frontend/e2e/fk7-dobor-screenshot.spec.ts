/**
 * Karta F-K7 (V12K-207) — ekrany do OCENY: korekta obciążalności kabla wg warunków
 * ułożenia w kroku „Dobór toru SN" kreatora źródła OZE.
 *
 * ŻYWY STOS, nie atrapa: harness renderuje REALNY komponent kreatora, a wywołania
 * `/api/solver/*` idą przez proxy dev-serwera do REALNEGO backendu (uvicorn). Liczby na
 * zrzutach są zatem wynikiem solvera, a nie fixturą — dokładnie tego wymaga reguła
 * braku fabrykacji.
 *
 * Scena dowodowa (2 falowniki PV 900 kW ⇒ ΣP 1,8 MW ⇒ TR 2,5 MVA ⇒ I_TR 96,2 A,
 * rezerwa kabla 0,3 ⇒ próg 125,1 A):
 *   A. warunki KATALOGOWE      ⇒ propozycja 50 mm²
 *   B. ziemia, 3 kable, 200 mm ⇒ 50 mm² odpada (Iz 160 A × 0,74538 = 119,3 A < 125,1 A)
 *                                ⇒ propozycja 70 mm², obciążalność po korekcie obok
 *                                  katalogowej + jawne założenie w śladzie
 * Oba motywy. Wyjście: docs/audit/visual/fk7/*.png
 */
import { test, expect, type Page } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = 'http://127.0.0.1:5173/creator-harness.html';
const OUTPUT_DIR = path.resolve(_dirname, '../../docs/audit/visual/fk7');
const THEMES = ['light', 'dark'] as const;

/** Twarda bramka sceny: zero błędów konsoli/strony. */
function zbierajBledy(page: Page): string[] {
  const errs: string[] = [];
  const szum = (t: string): boolean =>
    /favicon|Download the React DevTools|Failed to load resource/i.test(t);
  page.on('console', (m) => {
    if (m.type() === 'error' && !szum(m.text())) errs.push(m.text());
  });
  page.on('pageerror', (e) => errs.push(`PAGEERROR: ${e.message}`));
  return errs;
}

test.describe('fk7-dobor:screenshot', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const theme of THEMES) {
    test(`dobór toru SN — warunki ułożenia zmieniają przekrój (${theme})`, async ({ page }) => {
      const errs = zbierajBledy(page);

      await page.setViewportSize({ width: 1220, height: 1180 });
      await page.goto(`${HARNESS_URL}?creator=oze&theme=${theme}`, {
        waitUntil: 'domcontentloaded',
        timeout: 40000,
      });
      const root = page.locator('[data-testid="creator-harness-root"]').first();
      await expect(root).toHaveAttribute('data-status', 'ready', { timeout: 15000 });

      // Krok 1 — technologia i sposób przyłączenia. Krok „Dobór" pojawia się TYLKO dla
      // toru z transformatorem blokowym (tam jest co dobierać), więc wariant ustawiamy
      // jawnie zamiast liczyc na wartosc domyslna.
      await page.getByTestId('mvd-kreator-oze-nazwa').fill('Farma PV Wschód');
      await page.getByTestId('mvd-kreator-oze-wariant').selectOption('block_transformer');

      // Krok 2 — falownik z katalogu: 2 × PV 900 kW ⇒ ΣP 1,8 MW.
      await page.getByTestId('mvd-kreator-oze-dalej').click();
      await expect(page.getByTestId('mvd-kreator-oze-konwerter')).toBeVisible();
      await page.getByTestId('mvd-kreator-oze-konwerter').selectOption('pv-1');
      await page.getByTestId('mvd-kreator-oze-liczba').fill('2');

      // Krok 3 — dobór toru SN.
      await page.getByTestId('mvd-kreator-oze-dalej').click();
      await expect(page.getByTestId('mvd-kreator-oze-dobor-dlugosc')).toBeVisible({
        timeout: 15000,
      });

      const ustawParametry = async (): Promise<void> => {
        await page.getByTestId('mvd-kreator-oze-dobor-dlugosc').fill('1');
        await page.getByTestId('mvd-kreator-oze-dobor-cos-phi').fill('0.95');
        await page.getByTestId('mvd-kreator-oze-dobor-rezerwa-kabel').fill('0.3');
        await page.getByTestId('mvd-kreator-oze-dobor-max-delta-u').fill('2');
      };
      await ustawParametry();

      // Lista warunków ułożenia MUSI przyjść z backendu (kreator nie ma własnej).
      const wybor = page.getByTestId('mvd-kreator-oze-dobor-warunki-ulozenia');
      await expect(wybor).toBeVisible({ timeout: 15000 });
      await expect(wybor.locator('option')).toHaveCount(2);

      // A. Warunki KATALOGOWE — punkt odniesienia.
      await page.getByTestId('mvd-kreator-oze-dobor-zaproponuj').click();
      await expect(page.getByTestId('mvd-kreator-oze-dobor-propozycje')).toBeVisible({
        timeout: 20000,
      });
      await expect(page.getByText(/WARUNKÓW KATALOGOWYCH/)).toBeVisible();
      await page.waitForTimeout(250);
      await root.screenshot({
        path: path.join(OUTPUT_DIR, `fk7_dobor_katalogowe_${theme}.png`),
      });

      // B. Ziemia, 3 kable, odstęp 200 mm — korekta obciążalności wchodzi do doboru.
      await wybor.selectOption('ziemia_3_kable_warstwa_200mm');
      await page.getByTestId('mvd-kreator-oze-dobor-zaproponuj').click();
      await expect(page.getByText(/Obciążalność po korekcie/)).toBeVisible({ timeout: 20000 });
      await expect(page.getByText(/Obciążalność skorygowana dla warunków/)).toBeVisible();
      await page.waitForTimeout(250);
      await root.screenshot({
        path: path.join(OUTPUT_DIR, `fk7_dobor_ziemia_${theme}.png`),
      });

      expect(errs, `zero bledow konsoli na scenie F-K7/${theme}`).toEqual([]);
    });
  }
});
