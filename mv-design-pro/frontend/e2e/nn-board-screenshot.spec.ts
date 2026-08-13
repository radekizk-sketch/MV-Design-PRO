/**
 * Karta SLD nN (H_PLAN_IMPLEMENTACJI_NN §P0.8, §0.7) — dowód wizualny B-02: SN+TR+
 * rozdzielnica nN z ≥3 odpływami (różne aparaty), OBA motywy. Wzorzec
 * `e2e/sld-substrate-screenshot.spec.ts` — harness `screenshot-harness.html`,
 * fixtura `nnBoardDemo.enm.json` (`public/test-fixtures/`, wygenerowana z
 * `openBranch.enm.json` + 4 odpływy nN, kształt 1:1 `add_nn_switch_device`/
 * `add_nn_cable_segment`). Werdykt wizualny NALEŻY DO WŁAŚCICIELA (zasada
 * nr 2 CLAUDE.md) — ten spec WYŁĄCZNIE generuje PNG, nie certyfikuje jakości.
 */
import { test, expect } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = 'http://127.0.0.1:5173/screenshot-harness.html';
const OUTPUT_DIR = path.resolve(_dirname, '../../docs/audit/visual');

test.describe('nn-board:screenshot', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`nN board demo — motyw ${theme} — save PNG`, async ({ page }) => {
      await page.setViewportSize({ width: 1600, height: 1000 });
      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      page.on('pageerror', (err) => consoleErrors.push(`PAGEERROR: ${err.message}`));

      await page.goto(`${HARNESS_URL}?fixture=nnBoardDemo&lod=2&theme=${theme}`, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      });

      const harnessRoot = page.locator('[data-testid="sld-harness-root"]').first();
      await expect(harnessRoot).toHaveAttribute('data-status', 'ready', { timeout: 20000 });
      const canvas = page.locator('[data-testid="sld-canvas-v3"]').first();
      await expect(canvas).toBeVisible({ timeout: 15000 });
      await page.waitForTimeout(900);

      if (consoleErrors.length > 0) {
        console.log(`Console errors (${theme}): ${consoleErrors.join('\n')}`);
      }

      const outPath = path.join(OUTPUT_DIR, `nn_board_demo_${theme}.png`);
      await page.screenshot({ path: outPath, fullPage: false });
      console.log(`Saved: ${outPath}`);
      expect(fs.existsSync(outPath)).toBe(true);

      // Zbliżenie na stronę nN stacji (4 odpływy) — czytelność aparatów.
      const detailPath = path.join(OUTPUT_DIR, `nn_board_demo_${theme}_detail.png`);
      await page.screenshot({
        path: detailPath,
        clip: { x: 500, y: 560, width: 560, height: 220 },
      });
      console.log(`Saved: ${detailPath}`);
      expect(fs.existsSync(detailPath)).toBe(true);

      expect(consoleErrors, `błędy konsoli (${theme}): ${consoleErrors.join(' | ')}`).toEqual([]);
    });
  }
});
