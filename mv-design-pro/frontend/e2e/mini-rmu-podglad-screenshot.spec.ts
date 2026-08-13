/**
 * Zrzuty dowodowe PODGLĄDU PÓL ROZDZIELNICY SN w kreatorze stacji SN/nN
 * (karta MINI-RMU-CAD; werdykt właściciela 2026-08-13: „jakość wizualna mini
 * RMU 0/10, wymagana jakość CAD inżyniera energetyki").
 *
 * CO POKAZUJĄ (trzy układy rozdzielnicy, oba motywy) — dowodem jest RENDER:
 *   1. `domyslny`   — stacja odgałęźna (4 pola): dwa pola liniowe, odgałęźne
 *      i transformatorowe z aparatem domyślnym dla roli,
 *   2. `warianty`   — TE SAME cztery pola z RÓŻNYMI aparatami: reklozer w polu
 *      liniowym wejściowym, rozłącznik w wyjściowym, wyłącznik w odgałęźnym,
 *      rozłącznik bezpiecznikowy w transformatorowym. To jest zrzut, który
 *      rozstrzyga o karcie: cztery różne aparaty MUSZĄ dać cztery różne symbole,
 *      a przed kartą dawały cztery identyczne kwadraty,
 *   3. `sprzeglo`   — stacja sekcyjna: pole sprzęgłowe (łącznik szyn) z przerwą
 *      szyny, której układ przelotowy nie ma.
 *
 * Renderuje REALNY komponent kreatora przez harness `/creator-harness.html`
 * (ta sama droga, co pozostałe zrzuty kreatorów) — nie makietę.
 */
import { expect, test } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = 'http://127.0.0.1:5173/creator-harness.html';
const OUTPUT_DIR = path.resolve(_dirname, '../../docs/audit/visual/kreatory');
const THEMES = ['light', 'dark'] as const;

/** Pozycje katalogu z fikstury harnessu (`creator-harness-main.tsx`). */
const REKLOZER = 'sw-rec-abb-rec615-17kv-630a';
const ROZLACZNIK = 'ap-2';
const WYLACZNIK = 'ap-1';
const ROZLACZNIK_BEZPIECZNIKOWY = 'ap-3';

test.describe('kreator stacji — podgląd pól rozdzielnicy SN', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const theme of THEMES) {
    test(`podgląd rozdzielnicy — ${theme}`, async ({ page }) => {
      const bledy: string[] = [];
      const szum = (t: string): boolean =>
        /favicon|Download the React DevTools|Failed to load resource/i.test(t);
      page.on('console', (m) => {
        if (m.type() === 'error' && !szum(m.text())) bledy.push(m.text());
      });
      page.on('pageerror', (e) => bledy.push(`PAGEERROR: ${e.message}`));

      await page.setViewportSize({ width: 1220, height: 1000 });
      await page.goto(`${HARNESS_URL}?creator=stacja&theme=${theme}`, {
        waitUntil: 'domcontentloaded',
        timeout: 40000,
      });

      const root = page.locator('[data-testid="creator-harness-root"]').first();
      await expect(root).toHaveAttribute('data-status', 'ready', { timeout: 15000 });

      await page.getByRole('button', { name: /Pola rozdzielnicy SN/ }).click();
      await expect(page.getByTestId('mvd-kreator-stacja-pola')).toBeVisible({ timeout: 15000 });
      await page.getByTestId('mvd-kreator-stacja-producent').selectOption('ZPUE_WLOSZCZOWA');
      await page.getByTestId('mvd-kreator-stacja-rodzina').selectOption('zpue_wloszczowa_rotoblok');
      await page.waitForTimeout(400);

      const podglad = page.getByTestId('mvd-kreator-stacja-podglad');
      await expect(podglad).toBeVisible();

      // (1) Układ domyślny stacji odgałęźnej — cztery pola.
      await podglad.scrollIntoViewIfNeeded();
      await podglad.screenshot({
        path: path.join(OUTPUT_DIR, `kreator_stacja_podglad_domyslny_${theme}.png`),
      });

      // (2) Cztery RÓŻNE aparaty w czterech polach.
      await page.getByTestId('mvd-kreator-stacja-aparat-1').selectOption(REKLOZER);
      await page.getByTestId('mvd-kreator-stacja-aparat-2').selectOption(ROZLACZNIK);
      await page.getByTestId('mvd-kreator-stacja-aparat-3').selectOption(WYLACZNIK);
      await page.getByTestId('mvd-kreator-stacja-aparat-4').selectOption(ROZLACZNIK_BEZPIECZNIKOWY);
      await page.waitForTimeout(300);
      await podglad.scrollIntoViewIfNeeded();
      await podglad.screenshot({
        path: path.join(OUTPUT_DIR, `kreator_stacja_podglad_warianty_${theme}.png`),
      });

      // (3) Stacja sekcyjna — pole sprzęgłowe. Zmiana rodzaju stacji przebiega
      // przez krok „Rodzaj i umiejscowienie" (realna ścieżka projektanta).
      await page.getByRole('button', { name: /Rodzaj i umiejscowienie/ }).click();
      await page.getByTestId('mvd-kreator-stacja-typ').selectOption('sectional');
      await page.getByRole('button', { name: /Pola rozdzielnicy SN/ }).click();
      await expect(page.getByTestId('mvd-kreator-stacja-pola')).toBeVisible();
      await page.waitForTimeout(400);
      await podglad.scrollIntoViewIfNeeded();
      await podglad.screenshot({
        path: path.join(OUTPUT_DIR, `kreator_stacja_podglad_sprzeglo_${theme}.png`),
      });

      if (bledy.length > 0) console.log(`[podglad/${theme}] errors:\n${bledy.join('\n')}`);
      expect(bledy, `brak błędów konsoli dla podglądu/${theme}`).toEqual([]);
    });
  }
});
