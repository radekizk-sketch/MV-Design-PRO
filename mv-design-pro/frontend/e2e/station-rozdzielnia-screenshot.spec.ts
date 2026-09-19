/**
 * STACJA-ROZDZIELNIA SN — B-02 render proof (KROK 1).
 *
 * Captures real renders of the StationRozdzielniaSN unit for each of the four
 * network-station archetypes T1/T2/T3/T4, as a vertical COMPOSITE of the three
 * responsive detail levels (far / closer / close). Render is the only proof.
 *
 * The harness page is served by Vite at /station-rozdzielnia-harness.html.
 * No backend required — the archetype models + their frozen-solver companion
 * slices are built in the frontend (`station-rozdzielnia/archetypes.ts`).
 *
 * Outputs committed to docs/audit/visual/ (4 composite PNGs, each = 3 levels).
 */
import { test, expect } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { adresHarnessu } from './adresHarnessu';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = adresHarnessu('station-rozdzielnia-harness.html');
const OUTPUT_DIR = path.resolve(_dirname, '../../docs/audit/visual');

const ARCHETYPES = ['T1', 'T2', 'T3', 'T4'] as const;

test.describe('sld:station-rozdzielnia:screenshot', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const archetype of ARCHETYPES) {
    test(`${archetype} — composite (far/closer/close) PNG`, async ({ page }) => {
      const consoleErrors: string[] = [];
      // Ignore the browser's automatic favicon probe — unrelated browser noise.
      const isFaviconNoise = (text: string): boolean =>
        /favicon/i.test(text) || /\/favicon\.ico/i.test(text);
      page.on('console', (msg) => {
        if (msg.type() === 'error' && !isFaviconNoise(msg.text())) consoleErrors.push(msg.text());
      });
      page.on('pageerror', (err) => consoleErrors.push(`PAGEERROR: ${err.message}`));

      await page.setViewportSize({ width: 800, height: 1000 });
      await page.goto(`${HARNESS_URL}?archetype=${archetype}`);

      const root = page.locator('[data-testid="sr-harness-root"]').first();
      await expect(root).toBeVisible({ timeout: 15000 });
      await expect(root).toHaveAttribute('data-status', 'ready', { timeout: 15000 });
      await expect(root).toHaveAttribute('data-archetype', archetype);

      // Three responsive detail levels (the SLD is back to far/closer/close —
      // the White Box derivation lives off-canvas, owner B-02).
      await expect(page.locator('[data-testid="sr-harness-panel-far"]')).toBeVisible();
      await expect(page.locator('[data-testid="sr-harness-panel-closer"]')).toBeVisible();
      await expect(page.locator('[data-testid="sr-harness-panel-close"]')).toBeVisible();

      // The unit renders (busbar + fields) at every level (3 levels).
      const units = page.locator(`[data-testid="station-rozdzielnia-sr-${archetype.toLowerCase()}"]`);
      expect(await units.count()).toBe(3);
      // At least one main busbar per panel.
      const busbars = page.locator('[data-testid^="sr-busbar-sr-"]');
      expect(await busbars.count()).toBeGreaterThanOrEqual(3);
      // Owner B-02 render proof: NO derivation blocks on the canvas.
      expect(await page.locator('[data-whitebox="expanded"]').count()).toBe(0);
      expect(await page.locator('[data-testid^="sr-wb-"]').count()).toBe(0);

      await page.waitForTimeout(400);

      if (consoleErrors.length > 0) {
        console.log(`[${archetype}] console errors:\n${consoleErrors.join('\n')}`);
      }
      expect(consoleErrors, `no console/page errors for ${archetype}`).toEqual([]);

      const outPath = path.join(OUTPUT_DIR, `station_${archetype}_composite.png`);
      await root.screenshot({ path: outPath });
      console.log(`Saved: ${outPath}`);
      expect(fs.existsSync(outPath)).toBe(true);
    });
  }

  test('T3 — power-flow arrow direction comes from the companion (one truth)', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 1000 });
    await page.goto(`${HARNESS_URL}?archetype=T3`);
    await expect(page.locator('[data-testid="sr-harness-root"]')).toHaveAttribute('data-status', 'ready');

    // T3 IN/OUT/ODG are all 'forward' in the companion → network fields point up.
    const inFlow = page.locator('[data-testid="sr-flow-sr-t3-in"]').first();
    await expect(inFlow).toHaveAttribute('data-flow-direction', 'forward');
    await expect(inFlow).toHaveAttribute('data-flow-points', 'up');
  });

  test('T4 — fields are clickable (stub config handler fires)', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 1000 });
    await page.goto(`${HARNESS_URL}?archetype=T4`);
    const root = page.locator('[data-testid="sr-harness-root"]').first();
    await expect(root).toHaveAttribute('data-status', 'ready');

    // Click the IN field in the 'close' panel.
    const closePanel = page.locator('[data-testid="sr-harness-panel-close"]');
    await closePanel.locator('[data-testid="sr-field-sr-t4-in"]').first().click();
    await expect(root).toHaveAttribute('data-last-field-click', 'sr-t4-in');
  });
});
