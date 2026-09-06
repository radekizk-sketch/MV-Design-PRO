/**
 * OZE source archetype — B-02 render proof (KROK 2, Runda 2a: PV G1-G3).
 *
 * Captures the OzeSourceArchetype unit for each PV archetype as a vertical
 * composite of the three responsive detail levels. Render is the only proof.
 * The harness page is served by Vite at /oze-source-harness.html.
 */
import { test, expect } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { adresHarnessu } from './adresHarnessu';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = adresHarnessu('oze-source-harness.html');
const OUTPUT_DIR = path.resolve(_dirname, '../../docs/audit/visual');

const ARCHETYPES = ['G1', 'G2', 'G3', 'G4-PVTR', 'G5-BESS', 'G5-WIND-T4', 'G8-BIOGAZ', 'G7-WIND-ASYNC', 'G6-WIND-DFIG'] as const;

test.describe('sld:oze-source:screenshot', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const archetype of ARCHETYPES) {
    test(`${archetype} — composite (far/closer/close) PNG`, async ({ page }) => {
      const consoleErrors: string[] = [];
      const isFaviconNoise = (text: string): boolean => /favicon/i.test(text);
      page.on('console', (msg) => {
        if (msg.type() === 'error' && !isFaviconNoise(msg.text())) consoleErrors.push(msg.text());
      });
      page.on('pageerror', (err) => consoleErrors.push(`PAGEERROR: ${err.message}`));

      await page.setViewportSize({ width: 880, height: 1000 });
      await page.goto(`${HARNESS_URL}?archetype=${archetype}`);

      const root = page.locator('[data-testid="oze-harness-root"]').first();
      await expect(root).toBeVisible({ timeout: 15000 });
      await expect(root).toHaveAttribute('data-status', 'ready', { timeout: 15000 });
      await expect(root).toHaveAttribute('data-archetype', archetype);

      // Three responsive detail levels.
      await expect(page.locator('[data-testid="oze-harness-panel-far"]')).toBeVisible();
      await expect(page.locator('[data-testid="oze-harness-panel-closer"]')).toBeVisible();
      await expect(page.locator('[data-testid="oze-harness-panel-close"]')).toBeVisible();

      // The source unit renders at every level (3 levels).
      const units = page.locator(`[data-testid="oze-source-${archetype}"]`);
      expect(await units.count()).toBe(3);

      await page.waitForTimeout(400);

      if (consoleErrors.length > 0) {
        console.log(`[${archetype}] console errors:\n${consoleErrors.join('\n')}`);
      }
      expect(consoleErrors, `no console/page errors for ${archetype}`).toEqual([]);

      const outPath = path.join(OUTPUT_DIR, `oze_${archetype}_composite.png`);
      await root.screenshot({ path: outPath });
      console.log(`Saved: ${outPath}`);
      expect(fs.existsSync(outPath)).toBe(true);
    });
  }
});
