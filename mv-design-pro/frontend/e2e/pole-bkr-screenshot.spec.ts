/**
 * POLE BKR — zrzuty glifu baterii kondensatorów na schemacie SLD v3 (karta UX-04/POLE-BKR-MODEL).
 *
 * Fikstury `gpz110kvBkr` i `gpz110kvBkrGwiazdaUziemiona` (`public/test-fixtures/`) powstają
 * z generatora `backend/tests/reference_networks/fikstury_enm_sld.py` (scena
 * `scena_pola_bkr`: GPZ 110/15 kV, pole BKR na sekcji 1, bateria na zacisku końca toru pola,
 * wyposażenie pola z operacji domenowych). Harness `screenshot-harness.html`, OBA motywy,
 * poziom detalu L2 (aparaty pól).
 *
 * Spec sprawdza WYŁĄCZNIE fakty strukturalne DOM (glif baterii obecny, znak układu połączeń
 * z modelu, przekładnik niezrównoważenia tylko przy podwójnej gwieździe z jego rekordem)
 * i zapisuje PNG. Werdykt wizualny NALEŻY DO WŁAŚCICIELA (zasada nr 2, bramka B-02).
 * Zrzuty do dokumentacji: `ZRZUTY_DO_DOKUMENTACJI=1` (`e2e/katalogZrzutow.ts`).
 */
import { test, expect, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adresHarnessu } from './adresHarnessu';
import { katalogZrzutow } from './katalogZrzutow';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = adresHarnessu('screenshot-harness.html');
const OUTPUT_DIR = katalogZrzutow(path.resolve(_dirname, '../../docs/uiux/zrzuty/ux04-bkr'));

const SCENY = [
  {
    fikstura: 'gpz110kvBkr',
    plik: 'pole-bkr-podwojna-gwiazda',
    uklad: 'PODWOJNA_GWIAZDA_IZOLOWANA',
    przekladnik: 'tak',
  },
  {
    fikstura: 'gpz110kvBkrGwiazdaUziemiona',
    plik: 'pole-bkr-gwiazda-uziemiona',
    uklad: 'GWIAZDA_UZIEMIONA',
    przekladnik: 'nie',
  },
] as const;

async function otworzHarness(page: Page, fikstura: string, theme: 'dark' | 'light'): Promise<string[]> {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const bledy: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') bledy.push(msg.text());
  });
  page.on('pageerror', (err) => bledy.push(`PAGEERROR: ${err.message}`));
  await page.goto(`${HARNESS_URL}?fixture=${fikstura}&lod=2&theme=${theme}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await expect(page.locator('[data-testid="sld-harness-root"]').first()).toHaveAttribute(
    'data-status',
    'ready',
    { timeout: 20_000 },
  );
  await expect(page.locator('[data-testid="sld-canvas-v3"]').first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(900);
  return bledy;
}

test.describe('pole-bkr:screenshot — glif baterii kondensatorów w polu BKR', () => {
  test.use({ deviceScaleFactor: 3 });

  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const scena of SCENY) {
    for (const theme of ['dark', 'light'] as const) {
      test(`${scena.uklad} — motyw ${theme} — glif z modelu, zapis PNG`, async ({ page }) => {
        const bledy = await otworzHarness(page, scena.fikstura, theme);
        expect(bledy, bledy.join('\n')).toEqual([]);

        const glif = page.locator('[data-symbol-canon="capacitorBank"]');
        await expect(glif).toHaveCount(1);
        await expect(glif).toHaveAttribute('data-uklad-baterii', scena.uklad);
        await expect(glif).toHaveAttribute('data-przekladnik-niezrownowazenia', scena.przekladnik);
        await expect(glif.locator('[data-rodzaj-aparatu="UNBALANCE_CT"]')).toHaveCount(
          scena.przekladnik === 'tak' ? 1 : 0,
        );

        const calosc = path.join(OUTPUT_DIR, `${scena.plik}-${theme === 'dark' ? 'ciemny' : 'jasny'}.png`);
        await page.screenshot({ path: calosc, fullPage: false });
        expect(fs.existsSync(calosc)).toBe(true);

        // Zbliżenie na pole BKR — kadr wyśrodkowany na ZMIERZONEJ ramce glifu (sonda DOM, nie
        // zgadywanie), w skali urządzenia 3 (`test.use`), żeby znak układu był czytelny.
        const ramka = await glif.boundingBox();
        expect(ramka).not.toBeNull();
        if (ramka) {
          const margines = 90;
          const x = Math.max(0, ramka.x + ramka.width / 2 - margines);
          // Środek kadru nad glifem: w kadrze tor pola od wyłącznika do znaku układu.
          const y = Math.max(0, ramka.y + ramka.height / 2 - 1.4 * margines);
          const zblizenie = path.join(
            OUTPUT_DIR,
            `${scena.plik}-zblizenie-${theme === 'dark' ? 'ciemny' : 'jasny'}.png`,
          );
          await page.screenshot({
            path: zblizenie,
            clip: { x, y, width: 2 * margines, height: 2 * margines },
          });
          expect(fs.existsSync(zblizenie)).toBe(true);
        }
      });
    }
  }
});
