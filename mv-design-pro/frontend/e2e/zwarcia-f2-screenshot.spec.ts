/**
 * Zrzuty prezentacyjne fazy F2 programu ZWARCIA-PRO (karta właściciela pkt 5+12)
 * — żywe interakcje na scenie `creator=zwarcia` harnessu:
 *  - szczegół maszyny z wywodem dyplomowym (klik wkładu → μ/q/Ib → ślad KaTeX),
 *  - filtr źródeł (fraza zawęża tabelę, udziały % bez zmian),
 *  - sortowanie po prądzie wkładu (klik nagłówka),
 *  - przełącznik wykresu głównego (ip oraz I²t).
 * Wyjście: docs/audit/visual/flow-ekspert/flow_zwarcia_f2_*.png (oba motywy).
 */
import { test, expect } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = 'http://127.0.0.1:5173/creator-harness.html';
const OUTPUT_DIR = path.resolve(_dirname, '../../docs/audit/visual/flow-ekspert');
const THEMES = ['light', 'dark'] as const;

test.describe('zwarcia-f2:screenshot', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const theme of THEMES) {
    test(`F2 wkłady PRO — ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: 1220, height: 1000 });
      await page.goto(`${HARNESS_URL}?creator=zwarcia&theme=${theme}`, {
        waitUntil: 'domcontentloaded',
        timeout: 40000,
      });
      const root = page.locator('[data-testid="creator-harness-root"]').first();
      await expect(root).toHaveAttribute('data-status', 'ready', { timeout: 15000 });
      const wklady = page.getByTestId('mvd-zwarcia-wklady');
      await expect(wklady).toContainText('Falownik PV 4 MW');

      // 1) Szczegół maszyny + wywód dyplomowy tej maszyny (otwarty).
      await wklady.getByTestId('mvd-wyn-tabela').getByText('Falownik PV 4 MW').click();
      const szczegol = page.getByTestId('mvd-zwarcia-wklad-szczegol');
      await expect(szczegol).toContainText('0,756'); // μ
      await szczegol.getByTestId('mvd-zwarcia-wklad-szczegol-slad-btn').click();
      await expect(
        szczegol.locator('[data-testid="math-rendered"]').first(),
      ).toBeVisible();
      await page.waitForTimeout(300);
      await wklady.screenshot({
        path: path.join(OUTPUT_DIR, `flow_zwarcia_f2_szczegol_${theme}.png`),
      });

      // 2) Sortowanie po prądzie wkładu (klik nagłówka — rosnąco: BESS pierwszy).
      await wklady.getByTestId('mvd-wyn-th-prad').click();
      await expect(wklady.getByTestId('mvd-wyn-tabela')).toContainText('Magazyn BESS 2 MW');
      await page.waitForTimeout(200);
      await wklady.screenshot({
        path: path.join(OUTPUT_DIR, `flow_zwarcia_f2_sort_${theme}.png`),
      });

      // 3) Filtr źródeł: fraza „PV" zawęża tabelę; udział % bez zmian (13,9).
      await wklady.getByTestId('mvd-zwarcia-wklady-filtr').fill('PV');
      await expect(wklady.getByTestId('mvd-wyn-tabela')).not.toContainText('System (GPZ 110/15)');
      await expect(wklady.getByTestId('mvd-wyn-tabela')).toContainText('13,9');
      await page.waitForTimeout(200);
      await wklady.screenshot({
        path: path.join(OUTPUT_DIR, `flow_zwarcia_f2_filtr_${theme}.png`),
      });
      await wklady.getByTestId('mvd-zwarcia-wklady-filtr').fill('');

      // 4) Przełącznik wykresu głównego: ip, potem I²t.
      const wykres = page.getByTestId('mvd-zwarcia-wykres-blok');
      await wykres.getByTestId('mvd-zwarcia-wykres-btn-ip').click();
      await expect(wykres).toContainText('Prądy udarowe ip');
      await page.waitForTimeout(200);
      await wykres.screenshot({
        path: path.join(OUTPUT_DIR, `flow_zwarcia_f2_wykres_ip_${theme}.png`),
      });
      await wykres.getByTestId('mvd-zwarcia-wykres-btn-i2t').click();
      await expect(wykres).toContainText('I²t');
      await expect(wykres.getByTestId('mvd-zwarcia-wykres-btn-i2t')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await page.waitForTimeout(200);
      await wykres.screenshot({
        path: path.join(OUTPUT_DIR, `flow_zwarcia_f2_wykres_i2t_${theme}.png`),
      });
    });
  }
});
