/**
 * Karta T5b/T5b-2 (`docs/nn/KONCEPCJA_LOD_NN_2026-08.md` werdykt właściciela
 * + `docs/nn/PLAN_SLD_NN_TOPOLOGIA_2026-08.md` werdykt B-02 T5b, 18 punktów
 * P0): dowód wizualny `LvDomainView` — TORY ELEKTRYCZNE (nie graf encji).
 * Wzorzec `e2e/nn-board-screenshot.spec.ts` — harness `lv-domain-harness.html`,
 * OBA motywy, OBA fixture'y, OBA stany sprzęgła QBC (hard-check #1/#2).
 * Werdykt wizualny NALEŻY DO WŁAŚCICIELA (zasada nr 2 CLAUDE.md) — ten spec
 * WYŁĄCZNIE generuje PNG i sprawdza kontrakt DOM (obecność węzłów/krawędzi
 * toru), nie certyfikuje jakości wizualnej.
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
    test(`LvDomainView — fixtura wieloźródłowa (multi) — motyw ${theme} — save PNG`, async ({ page }) => {
      await page.setViewportSize({ width: 1400, height: 1000 });
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
      // boundary chip + sprzęgło JAKO APARAT (P0.2) w DOM przed zrzutem.
      await expect(page.locator('[data-testid="lv-domain-node-anchor:tr1"]')).toBeVisible();
      await expect(page.locator('[data-testid="lv-domain-node-anchor:tr2"]')).toBeVisible();
      await expect(page.locator('[data-testid="lv-domain-node-pv1"]')).toBeVisible();
      await expect(page.locator('[data-testid="lv-domain-node-boundary:tie_to_other"]')).toBeVisible();
      await expect(page.locator('[data-testid="lv-domain-node-boundary-terminal:tie_to_other"]')).toBeVisible();
      await expect(page.locator('[data-testid="lv-domain-node-coupler"]')).toBeVisible();
      await expect(page.locator('[data-node-kind="bus"]').first()).toBeVisible();

      await page.waitForTimeout(300);

      const outPath = path.join(OUTPUT_DIR, `lv_domain_multi_source_${theme}.png`);
      await page.screenshot({ path: outPath, fullPage: false });
      console.log(`Saved: ${outPath}`);
      expect(fs.existsSync(outPath)).toBe(true);

      expect(consoleErrors, `błędy konsoli (${theme}): ${consoleErrors.join(' | ')}`).toEqual([]);
    });
  }

  // Hard-check #1/#2 (QBC OPEN→CLOSED zmienia RYSUNEK) — dowód wizualny obu
  // stanów sprzęgła na TEJ SAMEJ fixturze (dark, jedna referencja wystarcza
  // do porównania klatek — motywy sparowane już wyżej).
  for (const qbc of ['open', 'closed'] as const) {
    test(`LvDomainView — fixtura wieloźródłowa — sprzęgło QBC ${qbc} — save PNG (hard-check #1/#2)`, async ({ page }) => {
      await page.setViewportSize({ width: 1400, height: 1000 });
      await page.goto(`${HARNESS_URL}?theme=dark&qbc=${qbc}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });

      const harnessRoot = page.locator('[data-testid="lv-domain-harness-root"]').first();
      await expect(harnessRoot).toHaveAttribute('data-qbc', qbc, { timeout: 20000 });
      await expect(page.locator('[data-testid="lv-domain-view-root"]')).toHaveAttribute('data-status', 'ok');

      const couplerEdge = page.locator('[data-testid="lv-domain-edge-coupler"]');
      await expect(couplerEdge).toHaveAttribute('data-edge-kind', 'coupler');

      await page.waitForTimeout(300);
      const outPath = path.join(OUTPUT_DIR, `lv_domain_multi_source_dark_qbc_${qbc}.png`);
      await page.screenshot({ path: outPath, fullPage: false });
      console.log(`Saved: ${outPath}`);
      expect(fs.existsSync(outPath)).toBe(true);
    });
  }

  // Fixtura "Stacja C" (incomer JAWNY + trzy odpływy w pełnym torze + PV w
  // PEŁNYM torze) — dowód wizualny P0.3/P0.4/P0.5/P0.6/P0.7 osobno od
  // fixtury wieloźródłowej (żeby PV bezpośredni z multi NIE ukrywał braku
  // toru pola — kontrast celowy, patrz `hardChecks.test.tsx`).
  for (const theme of ['dark', 'light'] as const) {
    test(`LvDomainView — fixtura Stacja C (incomer + odpływy + PV pełny tor) — motyw ${theme} — save PNG`, async ({ page }) => {
      await page.setViewportSize({ width: 1400, height: 1000 });
      await page.goto(`${HARNESS_URL}?theme=${theme}&fixture=stationC`, { waitUntil: 'domcontentloaded', timeout: 60_000 });

      const harnessRoot = page.locator('[data-testid="lv-domain-view-root"]').first();
      await expect(harnessRoot).toHaveAttribute('data-status', 'ok', { timeout: 20000 });

      await expect(page.locator('[data-testid="lv-domain-node-stnC/QF-TR1"]')).toBeVisible();
      await expect(page.locator('[data-testid="lv-domain-node-stnC/nn_lv_terminal"]')).toBeVisible();
      await expect(page.locator('[data-testid="lv-domain-node-stnC/PV1"]')).toBeVisible();
      await expect(page.locator('[data-testid="lv-domain-node-stnC/QF-03"]')).toBeVisible();
      await expect(page.locator('[data-testid="lv-domain-edge-stnC/kabel_QF-03"]')).toHaveAttribute('data-edge-kind', 'cable');

      await page.waitForTimeout(300);
      const outPath = path.join(OUTPUT_DIR, `lv_domain_station_c_${theme}.png`);
      await page.screenshot({ path: outPath, fullPage: false });
      console.log(`Saved: ${outPath}`);
      expect(fs.existsSync(outPath)).toBe(true);
    });
  }

  test('LvDomainView — nakładka SWZ aktywna, bez danych podanych — save PNG (dowód przełącznika overlay + uczciwy stan zerowy)', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto(`${HARNESS_URL}?theme=dark&overlay=swz`, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    const harnessRoot = page.locator('[data-testid="lv-domain-view-root"]').first();
    await expect(harnessRoot).toHaveAttribute('data-status', 'ok', { timeout: 20000 });
    // Harness nie podaje `swzByFeederRef` (zero fetch w tym komponencie,
    // P0.17) — status MUSI powiedzieć wprost brak danych, nie fabrykować
    // ciszą pustą nakładkę jako "aktywną z wynikiem".
    await expect(page.locator('[data-testid="lv-domain-overlay-status"]')).toHaveText('Nakładka: SWZ · brak wyniku (uruchom bieg)');

    const outPath = path.join(OUTPUT_DIR, 'lv_domain_multi_source_dark_overlay_swz.png');
    await page.screenshot({ path: outPath, fullPage: false });
    console.log(`Saved: ${outPath}`);
    expect(fs.existsSync(outPath)).toBe(true);
  });
});
