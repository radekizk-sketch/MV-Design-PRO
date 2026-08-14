/**
 * Karta SLD nN (H_PLAN_IMPLEMENTACJI_NN §P0.8, §0.7) — dowód wizualny B-02: SN+TR+
 * rozdzielnica nN z ≥3 odpływami (różne aparaty), OBA motywy. Wzorzec
 * `e2e/sld-substrate-screenshot.spec.ts` — harness `screenshot-harness.html`,
 * fixtura `nnBoardDemo.enm.json` (`public/test-fixtures/`, wygenerowana z
 * `openBranch.enm.json` + 4 odpływy nN, kształt 1:1 `add_nn_switch_device`/
 * `add_nn_cable_segment`). Werdykt wizualny NALEŻY DO WŁAŚCICIELA (zasada
 * nr 2 CLAUDE.md) — ten spec WYŁĄCZNIE generuje PNG, nie certyfikuje jakości.
 *
 * T5a (KONCEPCJA_LOD_NN_2026-08.md §L0/§L1, werdykt właściciela §0) —
 * DOPISANE do fixtury (bez zmiany substratu SN): druga sekcja RGnN (14
 * odpływów, w tym HARD FAIL/UNRESOLVED i DER, żeby budżet adaptacyjny na tej
 * fixturze — zmierzony: 11 — był PRZEKROCZONY) połączona SPRZĘGŁEM. Zrzuty
 * L0 (plakietka strukturalna) i L1 (tor transformacji + sekcje + sprzęgło +
 * kikut agregatu) do werdyktu B-02 karty T5a.
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

test.describe('nn-board:screenshot', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`nN board demo — motyw ${theme} — save PNG`, async ({ page }) => {
      const consoleErrors = await gotoHarness(page, 2, theme);

      if (consoleErrors.length > 0) {
        console.log(`Console errors (${theme}): ${consoleErrors.join('\n')}`);
      }

      const outPath = path.join(OUTPUT_DIR, `nn_board_demo_${theme}.png`);
      await page.screenshot({ path: outPath, fullPage: false });
      console.log(`Saved: ${outPath}`);
      expect(fs.existsSync(outPath)).toBe(true);

      // Zbliżenie na stronę nN stacji (2 sekcje + sprzęgło + kikuty) —
      // TE SAME współrzędne zmierzone sondą DOM co detail L1 (ta sama scena,
      // `lod=2` zamiast `lod=1` — patrz uzasadnienie w bloku T5a niżej).
      const detailPath = path.join(OUTPUT_DIR, `nn_board_demo_${theme}_detail.png`);
      await page.screenshot({
        path: detailPath,
        clip: { x: 700, y: 495, width: 720, height: 90 },
      });
      console.log(`Saved: ${detailPath}`);
      expect(fs.existsSync(detailPath)).toBe(true);

      expect(consoleErrors, `błędy konsoli (${theme}): ${consoleErrors.join(' | ')}`).toEqual([]);
    });
  }
});

test.describe('T5a nn-board:screenshot — L0 plakietka + L1 tor transformacji', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`T5a L0 (plakietka strukturalna) — motyw ${theme} — save PNG`, async ({ page }) => {
      const consoleErrors = await gotoHarness(page, 0, theme);
      if (consoleErrors.length > 0) console.log(`Console errors L0 (${theme}): ${consoleErrors.join('\n')}`);

      const outPath = path.join(OUTPUT_DIR, `t5a_l0_plakietka_${theme}.png`);
      await page.screenshot({ path: outPath, fullPage: false });
      console.log(`Saved: ${outPath}`);
      expect(fs.existsSync(outPath)).toBe(true);
      expect(consoleErrors, `błędy konsoli L0 (${theme}): ${consoleErrors.join(' | ')}`).toEqual([]);
    });

    test(`T5a L1 (tor transformacji + sekcje + sprzęgło + agregat) — motyw ${theme} — save PNG`, async ({ page }) => {
      const consoleErrors = await gotoHarness(page, 1, theme);
      if (consoleErrors.length > 0) console.log(`Console errors L1 (${theme}): ${consoleErrors.join('\n')}`);

      const outPath = path.join(OUTPUT_DIR, `t5a_l1_tor_transformacji_${theme}.png`);
      await page.screenshot({ path: outPath, fullPage: false });
      console.log(`Saved: ${outPath}`);
      expect(fs.existsSync(outPath)).toBe(true);

      // Zbliżenie na rząd odpływów Stacji B (obie sekcje + sprzęgło + kikut
      // agregatu) — współrzędne ekranowe ZMIERZONE sondą DOM (getBoundingClientRect
      // na `[data-symbol-canon="nnBreaker"/"nnAggregate"]`), nie odgadnięte: przy
      // 18 odpływach na jednej fixturze auto-dopasowanie kamery do CAŁEGO arkusza
      // (GPZ + Stacja B + RGnN-2) spłaszcza rząd do ≈3 px/symbol — clip węższy niż
      // zmierzony zakres pokazywałby PUSTE tło (dowód pomiaru, nie szacunek).
      const detailPath = path.join(OUTPUT_DIR, `t5a_l1_tor_transformacji_${theme}_detail.png`);
      await page.screenshot({
        path: detailPath,
        clip: { x: 700, y: 495, width: 720, height: 90 },
      });
      console.log(`Saved: ${detailPath}`);
      expect(fs.existsSync(detailPath)).toBe(true);
      expect(consoleErrors, `błędy konsoli L1 (${theme}): ${consoleErrors.join(' | ')}`).toEqual([]);
    });
  }
});
