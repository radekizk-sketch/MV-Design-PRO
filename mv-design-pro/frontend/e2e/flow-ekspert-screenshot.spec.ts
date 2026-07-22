/**
 * Zrzuty żywych ekranów programu FLOW EKSPERT+ (karta K5, dyrektywa #8).
 *
 * Sceny (creator-harness, realne komponenty + zaszczepione store'y):
 * - pulpit    — Pulpit projektu z kaflem „Warunki przyłączenia" (K2: warunki OSD
 *               z nagłówka + werdykt „przekracza limit OSD": generacja 6,2 > 5,0 MW),
 * - uwaga     — rejestr „Co wymaga uwagi" (A1) z akcjami z rejestru akcji (K1),
 * - swiezosc  — pasek aktywnego przypadku ze znacznikiem „wyniki nieaktualne" (K4).
 * Oba motywy. Zrzut = jedyny dowód (strona oceny właściciela).
 */
import { test, expect } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = 'http://127.0.0.1:5173/creator-harness.html';
const OUTPUT_DIR = path.resolve(_dirname, '../../docs/audit/visual/flow-ekspert');

const SCENY = ['pulpit', 'uwaga', 'swiezosc', 'walidacja', 'kompensacja'] as const;
const THEMES = ['light', 'dark'] as const;

test.describe('flow-ekspert:screenshot', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const scena of SCENY) {
    for (const theme of THEMES) {
      test(`${scena} — ${theme}`, async ({ page }) => {
        const errs: string[] = [];
        const isNoise = (t: string): boolean =>
          /favicon|Download the React DevTools|Failed to load resource/i.test(t);
        page.on('console', (m) => {
          if (m.type() === 'error' && !isNoise(m.text())) errs.push(m.text());
        });
        page.on('pageerror', (e) => errs.push(`PAGEERROR: ${e.message}`));

        await page.setViewportSize({ width: 1220, height: 900 });
        await page.goto(`${HARNESS_URL}?creator=${scena}&theme=${theme}`, {
          waitUntil: 'domcontentloaded',
          timeout: 40000,
        });
        const root = page.locator('[data-testid="creator-harness-root"]').first();
        await expect(root).toBeVisible({ timeout: 15000 });
        await expect(root).toHaveAttribute('data-status', 'ready', { timeout: 15000 });

        // Twarde dowody sceny (nie pusty ekran):
        if (scena === 'pulpit') {
          await expect(page.getByTestId('pulpit-osd-limit')).toBeVisible();
          await expect(page.getByTestId('pulpit-osd-werdykt')).toContainText('przekracza');
        } else if (scena === 'uwaga') {
          await expect(page.getByTestId('mvd-cwu-lista')).toBeVisible();
          await expect(page.getByTestId('mvd-cwu-podsumowanie')).toContainText('2');
        } else if (scena === 'swiezosc') {
          await expect(page.getByTestId('mvd-casebar')).toBeVisible();
          await expect(page.getByTestId('mvd-casebar-results')).toContainText('nieaktualne');
        } else if (scena === 'walidacja') {
          // R2-A: wybor pozycji z wywodem (klik wiersza tabeli po etykiecie
          // rodzaju kontroli) -> rozwiniety slad WHITE BOX.
          await expect(page.getByTestId('mvd-jakosc-walidacja')).toBeVisible();
          await page.getByRole('row').filter({ hasText: 'Odchylenie napięcia' }).click();
          await page.getByTestId('mvd-jakosc-wal-slad-otworz').click();
          await expect(page.getByTestId('mvd-jakosc-wal-slad')).toContainText('Werdykt: PRZEKROCZENIE');
        } else {
          // R2-B: pre-selekcja wezla z deep-linku widoczna w polu wyboru.
          await expect(page.getByTestId('mvd-komp-wezel')).toHaveValue('SZ-ST7');
        }

        await page.waitForTimeout(400);
        if (errs.length > 0) console.log(`[${scena}/${theme}] errors:\n${errs.join('\n')}`);
        expect(errs, `no console/page errors for ${scena}/${theme}`).toEqual([]);

        const outPath = path.join(OUTPUT_DIR, `flow_${scena}_${theme}.png`);
        await root.screenshot({ path: outPath });
        expect(fs.existsSync(outPath)).toBe(true);
      });
    }
  }
});
