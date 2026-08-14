/**
 * Zrzuty żywego pulpitu projektu (D5: mapa procesu E1–E8 + następna najlepsza
 * akcja) i powierzchni „Diagnoza przebiegu" (D7) do oceny wizualnej —
 * dyrektywa właściciela #8: zrzuty żywej aplikacji w obu motywach na stałej
 * stronie oceny. Harness serwowany przez Vite: /creator-harness.html.
 */
import { test, expect } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = 'http://127.0.0.1:5173/creator-harness.html';
const OUTPUT_DIR = path.resolve(_dirname, '../../docs/audit/visual/fala11');

const THEMES = ['light', 'dark'] as const;

test.describe('fala11:screenshot', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const theme of THEMES) {
    test(`pulpit projektu (mapa procesu + NBA) — ${theme}`, async ({ page }) => {
      const consoleErrors: string[] = [];
      const isNoise = (t: string): boolean =>
        /favicon|Download the React DevTools|Failed to load resource/i.test(t);
      page.on('console', (msg) => {
        if (msg.type() === 'error' && !isNoise(msg.text())) consoleErrors.push(msg.text());
      });
      page.on('pageerror', (err) => consoleErrors.push(`PAGEERROR: ${err.message}`));

      await page.setViewportSize({ width: 1440, height: 1180 });
      await page.goto(`${HARNESS_URL}?creator=pulpit&theme=${theme}`, {
        waitUntil: 'domcontentloaded',
        timeout: 40000,
      });

      const root = page.locator('[data-testid="creator-harness-root"]').first();
      await expect(root).toBeVisible({ timeout: 15000 });
      await expect(root).toHaveAttribute('data-status', 'ready', { timeout: 15000 });

      // Kontrakt D5 widoczny: mapa procesu i panel następnej akcji.
      await expect(page.getByTestId('mvd-proces-mapa')).toBeVisible();
      await expect(page.getByTestId('mvd-nba')).toBeVisible();

      await page.waitForTimeout(400);
      if (consoleErrors.length > 0)
        console.log(`[pulpit/${theme}] errors:\n${consoleErrors.join('\n')}`);
      expect(consoleErrors, `no console/page errors for pulpit/${theme}`).toEqual([]);

      const outPath = path.join(OUTPUT_DIR, `pulpit_mapa_nba_${theme}.png`);
      await root.screenshot({ path: outPath });
      expect(fs.existsSync(outPath)).toBe(true);
    });

    test(`diagnoza przebiegu (preflight + niezbiezny bieg) — ${theme}`, async ({ page }) => {
      const consoleErrors: string[] = [];
      const isNoise = (t: string): boolean =>
        /favicon|Download the React DevTools|Failed to load resource/i.test(t);
      page.on('console', (msg) => {
        if (msg.type() === 'error' && !isNoise(msg.text())) consoleErrors.push(msg.text());
      });
      page.on('pageerror', (err) => consoleErrors.push(`PAGEERROR: ${err.message}`));

      await page.setViewportSize({ width: 1220, height: 1250 });
      await page.goto(`${HARNESS_URL}?creator=diagnoza&theme=${theme}`, {
        waitUntil: 'domcontentloaded',
        timeout: 40000,
      });

      const root = page.locator('[data-testid="creator-harness-root"]').first();
      await expect(root).toBeVisible({ timeout: 15000 });
      await expect(root).toHaveAttribute('data-status', 'ready', { timeout: 15000 });

      // Kontrakt D7 widoczny: sekcja diagnozy z werdyktem niezbieżnego biegu
      // (fikstura: limit iteracji) — czekamy aż atomowe pobranie się domknie.
      await expect(page.locator('.mvd-diagnoza')).toBeVisible();
      await expect(page.getByTestId('mvd-diagnoza-ladowanie')).toHaveCount(0, {
        timeout: 15000,
      });

      await page.waitForTimeout(400);
      if (consoleErrors.length > 0)
        console.log(`[diagnoza/${theme}] errors:\n${consoleErrors.join('\n')}`);
      expect(consoleErrors, `no console/page errors for diagnoza/${theme}`).toEqual([]);

      const outPath = path.join(OUTPUT_DIR, `diagnoza_przebiegu_${theme}.png`);
      await root.screenshot({ path: outPath });
      expect(fs.existsSync(outPath)).toBe(true);
    });
  }
});
