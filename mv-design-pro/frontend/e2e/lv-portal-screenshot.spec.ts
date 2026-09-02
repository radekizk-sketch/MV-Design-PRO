/**
 * PORTAL DOMENY nN — dowód wizualny projekcji SN do werdyktu B-02
 * (architektura LV Domain Projection, `docs/sld/PROJEKCJA_SN_NN_PORTAL_V1.md`).
 *
 * Fixtura `nnBoardDemo.enm.json` (`public/test-fixtures/`) niesie stację z
 * PEŁNĄ rozdzielnicą nN w MODELU (2 sekcje, sprzęgło, 18 odpływów, DER strony
 * nN). Projekcja SN ma pokazać: SN → transformator → zacisk nN → portal
 * (`data-symbol-canon="lvPortal"`) + źródła strony nN (rząd DER) i odbiór
 * zagregowany — ŻADNEGO wnętrza rozdzielnicy nN (aparaty, odpływy, sekcje).
 * Wnętrze żyje w projekcji nN (`lv-domain-harness.html`, osobny spec).
 *
 * Wzorzec `e2e/sld-substrate-screenshot.spec.ts` — harness
 * `screenshot-harness.html`, OBA motywy, L0/L1/L2. Zbliżenie na portal jest
 * MIERZONE sondą DOM (`boundingBox()` symbolu portalu), nie zgadywane. Werdykt
 * wizualny NALEŻY DO WŁAŚCICIELA (zasada nr 2 CLAUDE.md) — ten spec WYŁĄCZNIE
 * generuje PNG i sprawdza fakty strukturalne DOM, nie certyfikuje jakości.
 */
import { test, expect } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = 'http://127.0.0.1:5173/screenshot-harness.html';
const OUTPUT_DIR = path.resolve(_dirname, '../../docs/audit/visual');

async function gotoHarness(
  page: import('@playwright/test').Page,
  lod: 0 | 1 | 2,
  theme: 'dark' | 'light',
): Promise<string[]> {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(`PAGEERROR: ${err.message}`));

  await page.goto(`${HARNESS_URL}?fixture=nnBoardDemo&lod=${lod}&theme=${theme}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });

  const harnessRoot = page.locator('[data-testid="sld-harness-root"]').first();
  await expect(harnessRoot).toHaveAttribute('data-status', 'ready', { timeout: 20000 });
  const canvas = page.locator('[data-testid="sld-canvas-v3"]').first();
  await expect(canvas).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(900);
  return consoleErrors;
}

test.describe('lv-portal:screenshot — projekcja SN z portalem domeny nN', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const theme of ['dark', 'light'] as const) {
    for (const lod of [1, 2] as const) {
      test(`L${lod} — portal na zacisku nN, ZERO wnętrza nN — motyw ${theme} — save PNG`, async ({ page }) => {
        const consoleErrors = await gotoHarness(page, lod, theme);
        if (consoleErrors.length > 0) console.log(`Console errors L${lod} (${theme}): ${consoleErrors.join('\n')}`);

        // Fakty strukturalne DOM (nie werdykt wizualny): portal obecny,
        // wnętrze rozdzielnicy nN NIEOBECNE w projekcji SN.
        const portal = page.locator('[data-symbol-canon="lvPortal"]');
        await expect(portal).toHaveCount(1);
        await expect(page.locator('[data-symbol-canon="nnBreaker"]')).toHaveCount(0);
        await expect(page.locator('[data-symbol-canon="nnFuseSwitch"]')).toHaveCount(0);

        const outPath = path.join(OUTPUT_DIR, `lv_portal_sn_lod${lod}_${theme}.png`);
        await page.screenshot({ path: outPath, fullPage: false });
        console.log(`Saved: ${outPath}`);
        expect(fs.existsSync(outPath)).toBe(true);

        // Zbliżenie na tor TR → zacisk nN → portal — współrzędne ZMIERZONE
        // sondą DOM (bbox portalu), nie zgadnięte.
        const box = await portal.first().boundingBox();
        expect(box, 'portal musi mieć niezerowy bbox ekranu').not.toBeNull();
        const clip = {
          x: Math.max(0, box!.x - 220),
          y: Math.max(0, box!.y - 160),
          width: 460,
          height: 260,
        };
        const detailPath = path.join(OUTPUT_DIR, `lv_portal_sn_lod${lod}_${theme}_detail.png`);
        await page.screenshot({ path: detailPath, clip });
        console.log(`Saved: ${detailPath}`);
        expect(fs.existsSync(detailPath)).toBe(true);

        expect(consoleErrors, `błędy konsoli L${lod} (${theme}): ${consoleErrors.join(' | ')}`).toEqual([]);
      });
    }

    test(`L0 — blok zwinięty (bez zacisku i portalu — wejście dwuklikiem) — motyw ${theme} — save PNG`, async ({ page }) => {
      const consoleErrors = await gotoHarness(page, 0, theme);
      if (consoleErrors.length > 0) console.log(`Console errors L0 (${theme}): ${consoleErrors.join('\n')}`);
      await expect(page.locator('[data-symbol-canon="lvPortal"]')).toHaveCount(0);
      await expect(page.locator('[data-symbol-canon="stationCollapsed"]').first()).toBeVisible();
      const outPath = path.join(OUTPUT_DIR, `lv_portal_sn_lod0_${theme}.png`);
      await page.screenshot({ path: outPath, fullPage: false });
      console.log(`Saved: ${outPath}`);
      expect(fs.existsSync(outPath)).toBe(true);
      expect(consoleErrors, `błędy konsoli L0 (${theme}): ${consoleErrors.join(' | ')}`).toEqual([]);
    });
  }
});
