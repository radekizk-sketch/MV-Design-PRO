/**
 * Galeria szablonów — 20 przykładów (render proof).
 *
 * Captures the contact sheet of all my templates (4 stations T1-T4 + 3 OZE
 * sources G1-G3) across detail levels = 20 tiles, each generated from the
 * template with frozen-solver data. Served by Vite at /gallery-harness.html.
 */
import { test, expect } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = 'http://127.0.0.1:5173/gallery-harness.html';
const OUTPUT_DIR = path.resolve(_dirname, '../../docs/audit/visual');

test.describe('sld:gallery:screenshot', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  test('20 templates contact sheet PNG', async ({ page }) => {
    const consoleErrors: string[] = [];
    const isFaviconNoise = (t: string): boolean => /favicon/i.test(t);
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !isFaviconNoise(msg.text())) consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(`PAGEERROR: ${err.message}`));

    await page.setViewportSize({ width: 1380, height: 2400 });
    await page.goto(HARNESS_URL);

    const root = page.locator('[data-testid="gallery-root"]').first();
    await expect(root).toBeVisible({ timeout: 15000 });
    await expect(root).toHaveAttribute('data-status', 'ready', { timeout: 15000 });
    // All 20 tiles present.
    await expect(root).toHaveAttribute('data-tile-count', '20');
    for (let i = 1; i <= 20; i++) {
      await expect(page.locator(`[data-testid="gallery-tile-${i}"]`)).toBeVisible();
    }

    await page.waitForTimeout(500);
    if (consoleErrors.length > 0) console.log(`console errors:\n${consoleErrors.join('\n')}`);
    expect(consoleErrors, 'no console/page errors').toEqual([]);

    const outPath = path.join(OUTPUT_DIR, 'gallery_20_templates.png');
    await root.screenshot({ path: outPath });
    console.log(`Saved: ${outPath}`);
    expect(fs.existsSync(outPath)).toBe(true);
  });
});
