/**
 * Zrzuty żywego huba „Dokumentacja" (F-E8.1) do oceny wizualnej (dyrektywa
 * właściciela #8: zrzuty żywej aplikacji w obu motywach na stałej stronie oceny).
 *
 * Renderuje REALNY komponent `HubDokumentacji` z zaszczepionym kontekstem toru
 * pracy (projekt/wariant/wersja/zakończony przebieg) w motywie jasnym i ciemnym.
 * Zrzut = jedyny dowód. Harness serwowany przez Vite: /creator-harness.html.
 */
import { test, expect } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { adresHarnessu } from './adresHarnessu';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = adresHarnessu('creator-harness.html');
const OUTPUT_DIR = path.resolve(_dirname, '../../docs/audit/visual/dokumentacja');

const THEMES = ['light', 'dark'] as const;

test.describe('dokumentacja:screenshot', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const theme of THEMES) {
    test(`hub dokumentacji — ${theme}`, async ({ page }) => {
      const consoleErrors: string[] = [];
      const isNoise = (t: string): boolean =>
        /favicon|Download the React DevTools|Failed to load resource/i.test(t);
      page.on('console', (msg) => {
        if (msg.type() === 'error' && !isNoise(msg.text())) consoleErrors.push(msg.text());
      });
      page.on('pageerror', (err) => consoleErrors.push(`PAGEERROR: ${err.message}`));

      await page.setViewportSize({ width: 1220, height: 980 });
      await page.goto(`${HARNESS_URL}?creator=dokumentacja&theme=${theme}`, {
        waitUntil: 'domcontentloaded',
        timeout: 40000,
      });

      const root = page.locator('[data-testid="creator-harness-root"]').first();
      await expect(root).toBeVisible({ timeout: 15000 });
      await expect(root).toHaveAttribute('data-status', 'ready', { timeout: 15000 });

      // Kontrakt ekranu prowadzącego widoczny: hub + karty dokumentów.
      await expect(page.getByTestId('mvd-dokumentacja-hub')).toBeVisible();
      await expect(page.getByTestId('mvd-dok-karta-raport')).toBeVisible();
      await expect(page.getByTestId('mvd-dok-karta-dowod')).toBeVisible();
      await expect(page.getByTestId('mvd-dok-karta-archiwum')).toBeVisible();

      await page.waitForTimeout(400);
      if (consoleErrors.length > 0) console.log(`[dokumentacja/${theme}] errors:\n${consoleErrors.join('\n')}`);
      expect(consoleErrors, `no console/page errors for dokumentacja/${theme}`).toEqual([]);

      const outPath = path.join(OUTPUT_DIR, `hub_dokumentacji_${theme}.png`);
      await root.screenshot({ path: outPath });
      expect(fs.existsSync(outPath)).toBe(true);
    });
  }
});
