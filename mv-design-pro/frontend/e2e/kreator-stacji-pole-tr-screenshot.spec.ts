/**
 * Zrzuty dowodowe kroku „Pola rozdzielnicy SN" kreatora stacji SN/nN
 * (karta KOMPLETNOSC-POLA-TR — dyrektywa właściciela #8: po etapie UI
 * publikujemy zrzuty ŻYWEJ aplikacji w obu motywach).
 *
 * CO POKAZUJĄ (trzy stany JEDNEGO kroku, oba motywy):
 *   1. `domyslne`  — lista pól, którą kreator składa BEZ ingerencji projektanta:
 *      pole transformatorowe JEST (dowód domyślnej kompletności),
 *   2. `bez-pola-tr` — po świadomym usunięciu pola TR: panel nazywający skutki
 *      (znacznik na schemacie, ostrzeżenie gotowości, zamknięta droga do
 *      dokumentacji wykonawczej) + akcja przywrócenia,
 *   3. `warianty-aparatu` — WIERSZ pola transformatorowego z bliska: wybrany
 *      aparat i zdanie nazywające rozwiązania dopuszczalne w tym polu
 *      (rozłącznik bezpiecznikowy albo wyłącznik — zawężenie z katalogu
 *      backendu). Kadrujemy WIERSZ, nie całego kreatora: pierwsza wersja
 *      robiła trzeci zrzut całego panelu po `scrollIntoViewIfNeeded()` na
 *      `<select>`, więc powstawał plik BAJT W BAJT identyczny ze zrzutem (1)
 *      — obrazek podpisany „warianty aparatu", który wariantów nie pokazywał
 *      (natywnej listy rozwijanej `<select>` nie da się zrzucić). Dowód, który
 *      pokazuje co innego, niż głosi podpis, jest gorszy niż brak dowodu.
 *
 * Renderuje REALNY komponent kreatora przez harness `/creator-harness.html`
 * (ta sama droga, co pozostałe zrzuty kreatorów) — nie makietę.
 */
import { expect, test } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adresHarnessu } from './adresHarnessu';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = adresHarnessu('creator-harness.html');
const OUTPUT_DIR = path.resolve(_dirname, '../../docs/audit/visual/kreatory');
const THEMES = ['light', 'dark'] as const;

test.describe('kreator stacji — pole transformatorowe', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const theme of THEMES) {
    test(`krok pól rozdzielnicy SN — ${theme}`, async ({ page }) => {
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

      // Krok „Pola rozdzielnicy SN" — nawigacja natywnym klikiem w nagłówek kroku.
      await page.getByRole('button', { name: /Pola rozdzielnicy SN/ }).click();
      await expect(page.getByTestId('mvd-kreator-stacja-pola')).toBeVisible({ timeout: 15000 });
      // Producent i rodzina wybrane natywnie — bez nich pola nie mają szablonów.
      await page.getByTestId('mvd-kreator-stacja-producent').selectOption('ZPUE_WLOSZCZOWA');
      // Ref rodziny 1:1 z kanonem (`switchgear/families.py`) — atrapa harnessu
      // serwuje ten sam kształt, co `GET /api/catalog/switchgear-families`.
      await page.getByTestId('mvd-kreator-stacja-rodzina').selectOption('ZPUE_WLOSZCZOWA__ROTOBLOK');
      await page.waitForTimeout(400);

      // (1) Stan DOMYŚLNY: pole transformatorowe obecne, panel braku niewidoczny.
      await expect(page.getByTestId('mvd-kreator-stacja-pole-wiersz-4')).toBeVisible();
      expect(await page.getByTestId('mvd-kreator-stacja-brak-pola-tr').count()).toBe(0);
      await root.screenshot({
        path: path.join(OUTPUT_DIR, `kreator_stacja_pola_domyslne_${theme}.png`),
      });

      // (3) Warianty aparatu pola transformatorowego — lista zawężona rolą.
      const aparatTr = page.getByTestId('mvd-kreator-stacja-aparat-4');
      const opcje = await aparatTr.locator('option').allTextContents();
      expect(opcje.join(' | ')).toContain('rozłącznik bezpiecznikowy');
      expect(opcje.join(' | ')).not.toContain('odłącznik');
      // Kadr = WIERSZ pola transformatorowego (patrz nagłówek pliku: zrzut
      // całego panelu byłby kopią zrzutu (1)). Zdanie o dopuszczalnych
      // rozwiązaniach musi być NA obrazku — inaczej podpis znów wyprzedza treść.
      const wierszTr = page.getByTestId('mvd-kreator-stacja-pole-wiersz-4');
      await expect(wierszTr).toContainText('rozłącznik bezpiecznikowy');
      await wierszTr.scrollIntoViewIfNeeded();
      await wierszTr.screenshot({
        path: path.join(OUTPUT_DIR, `kreator_stacja_pola_warianty_aparatu_${theme}.png`),
      });

      // (2) Świadoma rezygnacja z pola TR — panel skutków + akcja przywrócenia.
      await page.getByTestId('mvd-kreator-stacja-pole-usun-4').click();
      const panel = page.getByTestId('mvd-kreator-stacja-brak-pola-tr');
      await expect(panel).toBeVisible();
      await page.waitForTimeout(300);
      await root.screenshot({
        path: path.join(OUTPUT_DIR, `kreator_stacja_pola_bez_pola_tr_${theme}.png`),
      });

      // Przywrócenie działa realnie (nie sam napis).
      await page.getByTestId('mvd-kreator-stacja-przywroc-pole-tr').click();
      await expect(page.getByTestId('mvd-kreator-stacja-brak-pola-tr')).toHaveCount(0);

      if (bledy.length > 0) console.log(`[stacja/${theme}] errors:\n${bledy.join('\n')}`);
      expect(bledy, `brak błędów konsoli dla stacja/${theme}`).toEqual([]);
    });
  }
});
