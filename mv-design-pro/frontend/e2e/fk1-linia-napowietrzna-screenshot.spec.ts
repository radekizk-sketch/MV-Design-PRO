/**
 * Karta F-K1 faza 7 (V12K-211) — zrzuty ekranu do oceny właściciela (dyrektywa #8).
 *
 * Scena „cieplna" ma odgałęzienie NAPOWIETRZNE: „Linia SN 1" (`line_b_c`,
 * katalog AFL 6 70/11 — `catalog_ref="line-base-al-st-70"`). Przed kartą F-K1
 * faza 7 każda linia napowietrzna kończyła się werdyktem NIEDOSTĘPNY BEZ
 * ROZRÓŻNIENIA PRZYCZYNY, bo dane cieplne nie docierały z katalogu do modelu.
 *
 * Scena jest REALNYM biegiem backendu (`cieplna_scena_wynik.json`/
 * `cieplna_scena_dowody.json`, sieć złota `tests/cgmes/golden_enm.py`). Do karty
 * KATALOG-PRZEJECIE-PR sieć złota wskazywała siedem NIEISTNIEJĄCYCH pozycji
 * katalogu (m.in. `line-afl-70`), więc linia nie miała `ith_ka` i bilans wracał
 * jako `conductor.thermal_data_missing` („Rachunku cieplnego nie przeprowadzono").
 * Sieć złota wiąże teraz linię produkcyjną operacją `assign_catalog_to_element`
 * z pozycją `line-base-al-st-70` (Jth(1 s) = 88 A·√s/mm², S = 70 mm²,
 * I_th(1 s) = 6,16 kA) — spec przypina PEŁNY dowód przewodu gołego: współczynnik k
 * z karty, sekcja materiałowa, prąd dopuszczalny i kryterium, wszystkie
 * podstawienia przez KaTeX (zero surowego LaTeX-u).
 *
 * Kadr 1: tabela oceny — linia napowietrzna z werdyktem wyjaśnionym liczbowo.
 * Kadr 2: jej dowód obliczeniowy otwarty realnym klikiem — krok źródła czasu,
 *         krok współczynnika k z karty katalogowej i sekcja materiałowa.
 * Oba motywy. Wyjście: docs/audit/visual/dowody/fk1_linia_<kadr>_<motyw>.png
 */
import { test, expect, type Page } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { adresHarnessu } from './adresHarnessu';
import { bramkaTresciMatematycznej } from './trescMatematyczna';

import { katalogZrzutow } from './katalogZrzutow';
const _dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = adresHarnessu('creator-harness.html');
const OUTPUT_DIR = katalogZrzutow(path.resolve(_dirname, '../../docs/audit/visual/dowody'));
const THEMES = ['light', 'dark'] as const;
const LINIA = 'Linia SN 1';

async function otworzScene(page: Page, theme: string): Promise<void> {
  const bledy: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') bledy.push(msg.text());
  });
  page.on('pageerror', (err) => bledy.push(String(err)));
  (page as unknown as { _bledy: string[] })._bledy = bledy;

  // `networkidle` jest zawodne przy zimnym dev-serverze Vite (pierwsza
  // kompilacja harnessu przekracza domyślne 15 s nawigacji) — defekt
  // pre-existing naprawiony w K3 wg wzorca bramki scen
  // (wszystkie-sceny-screenshot): domcontentloaded + jawny znacznik gotowości.
  await page.goto(`${HARNESS_URL}?creator=cieplna&theme=${theme}`, {
    waitUntil: 'domcontentloaded',
    timeout: 40000,
  });
  await page.waitForSelector('[data-status="ready"]', { timeout: 15000 });
  await expect(page.getByTestId('mvd-jakosc-cieplna')).toBeVisible();
}

function bramkaKonsoli(page: Page): void {
  const bledy = (page as unknown as { _bledy: string[] })._bledy ?? [];
  expect(bledy, `bledy konsoli: ${bledy.join(' | ')}`).toEqual([]);
}

test.describe('F-K1 faza 7 — linia napowietrzna w kryterium cieplnym', () => {
  for (const theme of THEMES) {
    test(`ocena + dowód linii napowietrznej (${theme})`, async ({ page }) => {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      await otworzScene(page, theme);

      // Kadr 1 — linia napowietrzna widoczna w tabeli oceny (uczciwy werdykt,
      // nie biały ekran, nie cichy pomin gałęzi napowietrznej).
      await expect(page.getByText(LINIA).first()).toBeVisible();
      await bramkaTresciMatematycznej(page);
      await page.screenshot({
        path: path.join(OUTPUT_DIR, `fk1_linia_ocena_${theme}.png`),
        fullPage: true,
      });

      // Kadr 2 — dowód otwarty REALNYM klikiem w wiersz (ścieżka projektanta):
      // krok źródła czasu (z założenia przypadku) + krok współczynnika k z karty
      // katalogowej przewodu gołego + sekcja materiałowa (dane z pozycji katalogu).
      await page.getByText(LINIA).first().click();
      await expect(page.getByTestId('mvd-jakosc-cieplna-dowod')).toBeVisible();
      await expect(
        page.getByText('Czas trwania zwarcia z założenia przypadku').first(),
      ).toBeVisible();
      await expect(page.getByText('Współczynnik materiałowy k żyły').first()).toBeVisible();
      await expect(page.getByText('Rachunku cieplnego nie przeprowadzono')).toHaveCount(0);
      await expect(page.getByTestId('mvd-jakosc-cieplna-material')).toBeVisible();
      // Karta DOWOD-CIEPLNY: podstawienie kroku czasu idzie przez KaTeX (pole
      // `substitution_latex`), nie jako surowy tekst `$$t_k = 1\ \mathrm{s}$$`.
      const podstawienie = page.getByTestId('mvd-dowod-pole-podstawienie').first();
      await expect(podstawienie).toBeVisible();
      await expect(podstawienie.locator('[data-testid="math-rendered"]')).toHaveCount(1);
      await expect(podstawienie.locator('[data-testid="math-rendered"]')).toHaveAttribute(
        'data-latex',
        't_k = 1\\ \\mathrm{s}',
      );
      await expect(page.getByTestId('mvd-dowod-pole-podstawienie-tekst')).toHaveCount(0);
      await bramkaTresciMatematycznej(page);
      await page.screenshot({
        path: path.join(OUTPUT_DIR, `fk1_linia_dowod_${theme}.png`),
        fullPage: true,
      });

      bramkaKonsoli(page);
    });
  }
});
