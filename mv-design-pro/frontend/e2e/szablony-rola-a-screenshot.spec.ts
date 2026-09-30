/**
 * Scena harnessu „szablony" (V12T-016, karta SZABLONY-ROLA-A) — zrzut dla
 * właściciela: przeglądarka biblioteki szablonów stacji z widoczną rolą A
 * „Zasilanie sieci" (GPZ 110/SN, rozdzielnia sieciowa RS/RSM), dotąd
 * licznik zero (rejestr długu V12T-016, zamknięty tą kartą).
 *
 * Dane pochodzą z ŻYWEGO backendu (harness przepuszcza fetch dla tej sceny
 * do prawdziwej końcówki `/api/station-templates/*` — patrz wyjątek w
 * `creator-harness-main.tsx`), nie z ręcznie sklejonej atrapy: zrzut jest
 * dowodem tego, co PRAWDZIWY backend materializuje, tak samo jak reguła
 * `wszystkie-sceny-screenshot.spec.ts` dla pozostałych scen kreatora.
 *
 * Osobny spec (nie generyczna pętla `wszystkie-sceny-screenshot.spec.ts`),
 * bo scena wymaga interakcji: drzewko ról startuje ZWINIĘTE — rola A musi
 * być rozwinięta i wybrana, żeby kafle GPZ/RS były widoczne na zrzucie, nie
 * tylko sam wiersz z licznikiem.
 */
import { test, expect } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { adresHarnessu } from './adresHarnessu';
import { zbierajNieudaneZadaniaApi } from './nieudaneZadaniaApi';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = adresHarnessu('creator-harness.html');
const OUTPUT_DIR = path.resolve(_dirname, '../../docs/audit/visual/sceny');

const THEMES = ['light', 'dark'] as const;

test.describe('sceny:szablony-rola-a:screenshot', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const theme of THEMES) {
    test(`przeglądarka szablonów — rola A widoczna — ${theme}`, async ({ page }) => {
      const errs: string[] = [];
      const isNoise = (t: string): boolean =>
        /favicon|Download the React DevTools|Failed to load resource/i.test(t);
      page.on('console', (m) => {
        if (m.type() === 'error' && !isNoise(m.text())) errs.push(m.text());
      });
      page.on('pageerror', (e) => errs.push(`PAGEERROR: ${e.message}`));
      zbierajNieudaneZadaniaApi(page, errs);

      await page.setViewportSize({ width: 1220, height: 1100 });
      await page.goto(`${HARNESS_URL}?creator=szablony&theme=${theme}`, {
        waitUntil: 'domcontentloaded',
        timeout: 40000,
      });

      const root = page.locator('[data-testid="creator-harness-root"]').first();
      await expect(root, 'scena szablony nie doszła do stanu gotowego').toHaveAttribute(
        'data-status',
        'ready',
        { timeout: 15000 },
      );

      const drzewko = page.locator('[data-testid="mvd-szablony-drzewko"]');
      await expect(drzewko, 'drzewko ról nie wczytało się z prawdziwego backendu').toBeVisible({
        timeout: 15000,
      });

      // Rola A MUSI być obecna w drzewku (nie zgubiona) i mieć niezerowy licznik
      // — dowód, że V12T-016 jest zamknięty, nie tylko że drzewko się renderuje.
      const wierszRolaA = page.locator('[data-testid="mvd-szablony-rola-A"]');
      await expect(wierszRolaA).toBeVisible();
      const licznikRolaA = wierszRolaA.locator('.mvd-tag.mvd-num').first();
      const tekstLicznika = (await licznikRolaA.textContent())?.trim() ?? '';
      expect(Number(tekstLicznika), `licznik roli A = '${tekstLicznika}' — oczekiwano > 0`).toBeGreaterThan(0);

      // Rozwiń rolę A (chevron) i wybierz ją (pokazuje kafle GPZ/RS w panelu głównym).
      await wierszRolaA.locator('button.mvd-szablony-drzewko-chevron').click();
      await expect(wierszRolaA).toHaveAttribute('aria-expanded', 'true');
      // `.first()`: klasa `mvd-szablony-drzewko-etykieta` jest współdzielona z
      // przyciskami kategorii-dzieci (`…-dziecko`), które są DALSZE w DOM —
      // przycisk WIERSZA roli renderuje się PIERWSZY (kolejność z danych).
      await wierszRolaA.locator('button.mvd-szablony-drzewko-etykieta').first().click();

      const kafle = page.locator('[data-testid="mvd-szablony-kafle"]');
      await expect(kafle, 'kafle roli A nie pojawiły się po wyborze').toBeVisible({ timeout: 15000 });
      // Obie kategorie roli A (GPZ_110_SN, ROZDZIELNIA_SIECIOWA) muszą dać
      // kafle — dowód pełnego pokrycia, nie tylko jednej kategorii.
      await expect(page.locator('[data-testid="mvd-szablony-kategoria-gpz_110_sn"]')).toBeVisible();
      await expect(
        page.locator('[data-testid="mvd-szablony-kategoria-rozdzielnia_sieciowa"]'),
      ).toBeVisible();

      await page.waitForTimeout(300);
      if (errs.length > 0) console.log(`console errors:\n${errs.join('\n')}`);
      expect(errs, 'no console/page errors').toEqual([]);

      const outPath = path.join(OUTPUT_DIR, `szablony-rola-a-${theme}.png`);
      await page.locator('[data-testid="mvd-szablony"]').screenshot({ path: outPath });
      console.log(`Saved: ${outPath}`);
      expect(fs.existsSync(outPath)).toBe(true);
    });
  }
});
