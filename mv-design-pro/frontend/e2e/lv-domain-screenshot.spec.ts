/**
 * Karta T5b (`docs/nn/KONCEPCJA_LOD_NN_2026-08.md` werdykt właściciela, §0
 * rozstrzygnięcie 3): dowód wizualny `LvDomainView` na fixturze
 * WIELOŹRÓDŁOWEJ (2×TR + sprzęgło + PV + podrozdzielnica + boundary_link).
 * Wzorzec `e2e/nn-board-screenshot.spec.ts` — harness
 * `lv-domain-harness.html`, OBA motywy. Werdykt wizualny NALEŻY DO
 * WŁAŚCICIELA (zasada nr 2 CLAUDE.md) — ten spec WYŁĄCZNIE generuje PNG i
 * sprawdza kontrakt DOM (obecność węzłów źródeł/boundary chipa), nie
 * certyfikuje jakości wizualnej.
 */
import { test, expect } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = 'http://127.0.0.1:5173/lv-domain-harness.html';
const OUTPUT_DIR = path.resolve(_dirname, '../../docs/audit/visual');

test.describe('lv-domain:screenshot', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`LvDomainView — fixtura wieloźródłowa — motyw ${theme} — save PNG`, async ({ page }) => {
      await page.setViewportSize({ width: 1200, height: 900 });
      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      page.on('pageerror', (err) => consoleErrors.push(`PAGEERROR: ${err.message}`));

      await page.goto(`${HARNESS_URL}?theme=${theme}`, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      });

      const harnessRoot = page.locator('[data-testid="lv-domain-view-root"]').first();
      await expect(harnessRoot).toHaveAttribute('data-status', 'ok', { timeout: 20000 });

      // Dowód wieloźródłowości (karta §0 pkt 4) — OBIE kotwice SN + PV +
      // boundary chip w DOM przed zrzutem.
      await expect(page.locator('[data-testid="lv-domain-node-anchor:tr1"]')).toBeVisible();
      await expect(page.locator('[data-testid="lv-domain-node-anchor:tr2"]')).toBeVisible();
      await expect(page.locator('[data-testid="lv-domain-node-pv1"]')).toBeVisible();
      await expect(page.locator('[data-testid="lv-domain-node-boundary:tie_to_other"]')).toBeVisible();

      await page.waitForTimeout(300);

      const outPath = path.join(OUTPUT_DIR, `lv_domain_multi_source_${theme}.png`);
      await page.screenshot({ path: outPath, fullPage: false });
      console.log(`Saved: ${outPath}`);
      expect(fs.existsSync(outPath)).toBe(true);

      expect(consoleErrors, `błędy konsoli (${theme}): ${consoleErrors.join(' | ')}`).toEqual([]);
    });
  }

  test('LvDomainView — nakładka SWZ aktywna — save PNG (dowód przełącznika overlay)', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.goto(`${HARNESS_URL}?theme=dark&overlay=swz`, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    const harnessRoot = page.locator('[data-testid="lv-domain-view-root"]').first();
    await expect(harnessRoot).toHaveAttribute('data-status', 'ok', { timeout: 20000 });
    await expect(page.locator('[data-testid="lv-domain-overlay-status"]')).toHaveText('Nakładka: SWZ');

    const outPath = path.join(OUTPUT_DIR, 'lv_domain_multi_source_dark_overlay_swz.png');
    await page.screenshot({ path: outPath, fullPage: false });
    console.log(`Saved: ${outPath}`);
    expect(fs.existsSync(outPath)).toBe(true);
  });
});
