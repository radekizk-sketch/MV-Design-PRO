/**
 * Zrzuty żywych kreatorów ui2 do oceny wizualnej (dyrektywa właściciela #8).
 *
 * Renderuje REALNE komponenty kreatorów (pole SN / źródło OZE / Arc Flash) z
 * zaszczepionym kontekstem i podmienionym `fetch`, w motywie jasnym i ciemnym.
 * Zrzut = jedyny dowód. Harness serwowany przez Vite: /creator-harness.html.
 */
import { test, expect } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = 'http://127.0.0.1:5173/creator-harness.html';
const OUTPUT_DIR = path.resolve(_dirname, '../../docs/audit/visual/kreatory');

const CREATORS = ['pole', 'oze', 'arcflash'] as const;
const THEMES = ['light', 'dark'] as const;

test.describe('kreatory:screenshot', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const creator of CREATORS) {
    for (const theme of THEMES) {
      test(`${creator} — ${theme}`, async ({ page }) => {
        const consoleErrors: string[] = [];
        const isNoise = (t: string): boolean =>
          /favicon|Download the React DevTools|Failed to load resource/i.test(t);
        page.on('console', (msg) => {
          if (msg.type() === 'error' && !isNoise(msg.text())) consoleErrors.push(msg.text());
        });
        page.on('pageerror', (err) => consoleErrors.push(`PAGEERROR: ${err.message}`));

        await page.setViewportSize({ width: 1220, height: 900 });
        await page.goto(`${HARNESS_URL}?creator=${creator}&theme=${theme}`, {
          waitUntil: 'domcontentloaded',
          timeout: 40000,
        });

        const root = page.locator('[data-testid="creator-harness-root"]').first();
        await expect(root).toBeVisible({ timeout: 15000 });
        await expect(root).toHaveAttribute('data-status', 'ready', { timeout: 15000 });

        // Arc Flash: wypełnij parametry projektowe i przelicz → pokaż wyniki.
        if (creator === 'arcflash') {
          await page.getByTestId('mvd-jakosc-af-odleglosc').fill('455');
          await page.getByTestId('mvd-jakosc-af-odstep').fill('152');
          await page.getByTestId('mvd-jakosc-af-czas').fill('0.2');
          await page.getByTestId('mvd-jakosc-af-licz').click();
          await expect(page.getByTestId('mvd-jakosc-arcflash')).toBeVisible();
          await expect(page.getByTestId('mvd-wyn-tabela')).toBeVisible();
        }

        await page.waitForTimeout(400);
        if (consoleErrors.length > 0) console.log(`[${creator}/${theme}] errors:\n${consoleErrors.join('\n')}`);
        expect(consoleErrors, `no console/page errors for ${creator}/${theme}`).toEqual([]);

        const outPath = path.join(OUTPUT_DIR, `kreator_${creator}_${theme}.png`);
        await root.screenshot({ path: outPath });
        expect(fs.existsSync(outPath)).toBe(true);
      });
    }
  }

  // Wszystkie 4 ekrany konfiguracji kreatora OZE (technologia → falownik →
  // regulacja → podsumowanie), z wypełnionymi danymi, w obu motywach.
  for (const theme of THEMES) {
    test(`oze — 4 kroki konfiguracji (${theme})`, async ({ page }) => {
      const errs: string[] = [];
      const isNoise = (t: string): boolean =>
        /favicon|Download the React DevTools|Failed to load resource/i.test(t);
      page.on('console', (m) => {
        if (m.type() === 'error' && !isNoise(m.text())) errs.push(m.text());
      });
      page.on('pageerror', (e) => errs.push(`PAGEERROR: ${e.message}`));

      await page.setViewportSize({ width: 1220, height: 900 });
      await page.goto(`${HARNESS_URL}?creator=oze&theme=${theme}`, {
        waitUntil: 'domcontentloaded',
        timeout: 40000,
      });
      const root = page.locator('[data-testid="creator-harness-root"]').first();
      await expect(root).toHaveAttribute('data-status', 'ready', { timeout: 15000 });

      const shot = async (krok: number) => {
        await page.waitForTimeout(300);
        await root.screenshot({ path: path.join(OUTPUT_DIR, `kreator_oze_krok${krok}_${theme}.png`) });
      };

      // Krok 1 — technologia i przyłączenie.
      await page.getByTestId('mvd-kreator-oze-nazwa').fill('Farma PV Wschód');
      await shot(1);

      // Krok 2 — falownik i moc (wybór z katalogu + liczba → tabliczka).
      await page.getByTestId('mvd-kreator-oze-dalej').click();
      await expect(page.getByTestId('mvd-kreator-oze-konwerter')).toBeVisible();
      await page.getByTestId('mvd-kreator-oze-konwerter').selectOption('pv-1');
      await page.getByTestId('mvd-kreator-oze-liczba').fill('12');
      await shot(2);

      // Krok 3 — regulacja mocy biernej i czynnej (wartości rządzące + P(f)/LFSM).
      await page.getByTestId('mvd-kreator-oze-dalej').click();
      await expect(page.getByTestId('mvd-kreator-oze-tryb')).toBeVisible();
      await page.getByTestId('mvd-kreator-oze-tryb').selectOption('Q_OD_U');
      await page.getByTestId('mvd-kreator-oze-qu-slope').fill('4');
      await page.getByTestId('mvd-kreator-oze-qu-db-low').fill('0.95');
      await page.getByTestId('mvd-kreator-oze-qu-db-high').fill('1.05');
      await page.getByTestId('mvd-kreator-oze-qmin').fill('-3');
      await page.getByTestId('mvd-kreator-oze-qmax').fill('3');
      await page.getByTestId('mvd-kreator-oze-statyzm').fill('5');
      await expect(page.getByTestId('mvd-kreator-oze-deadband')).toBeVisible();
      await page.getByTestId('mvd-kreator-oze-deadband').fill('0.2');
      await shot(3);

      // Krok 4 — podsumowanie i zapis.
      await page.getByTestId('mvd-kreator-oze-dalej').click();
      await expect(page.getByTestId('mvd-kreator-oze-zapis')).toBeVisible();
      await shot(4);

      if (errs.length > 0) console.log(`[oze/${theme}] errors:\n${errs.join('\n')}`);
      expect(errs, `no console/page errors for oze kroki/${theme}`).toEqual([]);
    });
  }
});
