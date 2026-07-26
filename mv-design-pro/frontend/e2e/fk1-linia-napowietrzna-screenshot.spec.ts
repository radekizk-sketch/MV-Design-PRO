/**
 * Karta F-K1 faza 7 (V12K-211) — zrzuty ekranu do oceny właściciela (dyrektywa #8).
 *
 * Scena „cieplna" ma teraz TRZECI wiersz: odgałęzienie NAPOWIETRZNE (przewód goły
 * AFL 6 70 mm²). Przed tą kartą każda linia napowietrzna kończyła się werdyktem
 * NIEDOSTĘPNY, bo dane cieplne nie docierały z katalogu do modelu.
 *
 * Kadr 1: tabela oceny — linia napowietrzna ma werdykt i liczby na równi z kablami.
 * Kadr 2: jej dowód obliczeniowy — wiersz „Rodzaj przewodu", izolacja „brak — przewód
 *         goły" (nie brak danej) i zdanie o tym, CO wyznacza temperaturę graniczną.
 * Oba motywy. Wyjście: docs/audit/visual/dowody/fk1_linia_<kadr>_<motyw>.png
 */
import { test, expect, type Page } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = 'http://127.0.0.1:5173/creator-harness.html';
const OUTPUT_DIR = path.resolve(_dirname, '../../docs/audit/visual/dowody');
const THEMES = ['light', 'dark'] as const;
const LINIA = 'Odgałęzienie napowietrzne L-03 (AFL 6 70 mm²)';

async function otworzScene(page: Page, theme: string): Promise<void> {
  const bledy: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') bledy.push(msg.text());
  });
  page.on('pageerror', (err) => bledy.push(String(err)));
  (page as unknown as { _bledy: string[] })._bledy = bledy;

  await page.goto(`${HARNESS_URL}?creator=cieplna&theme=${theme}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-status="ready"]');
  await expect(page.getByTestId('mvd-jakosc-cieplna')).toBeVisible();
}

function bramkaKonsoli(page: Page): void {
  const bledy = (page as unknown as { _bledy: string[] })._bledy ?? [];
  expect(bledy, `bledy konsoli: ${bledy.join(' | ')}`).toEqual([]);
}

test.describe('F-K1 faza 7 — linia napowietrzna w kryterium cieplnym', () => {
  for (const theme of THEMES) {
    test(`ocena + dowód przewodu gołego (${theme})`, async ({ page }) => {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      await otworzScene(page, theme);

      // Kadr 1 — linia napowietrzna ma werdykt i liczby, nie „niesprawdzone".
      await expect(page.getByText(LINIA).first()).toBeVisible();
      await page.screenshot({
        path: path.join(OUTPUT_DIR, `fk1_linia_ocena_${theme}.png`),
        fullPage: true,
      });

      // Kadr 2 — dowód otwarty REALNYM klikiem w wiersz (ścieżka projektanta).
      await page.getByText(LINIA).first().click();
      await expect(page.getByTestId('mvd-jakosc-cieplna-dowod')).toBeVisible();

      const rodzaj = page.getByTestId('mvd-jakosc-cieplna-rodzaj');
      await expect(rodzaj).toBeVisible();
      await expect(rodzaj).toContainText('przewód goły');

      // Brak izolacji NIE jest raportowany jako brak danej — uzasadnienie k jest pełne.
      await expect(page.getByTestId('mvd-jakosc-cieplna-material')).toContainText(
        'brak — przewód goły',
      );
      await expect(page.getByTestId('mvd-jakosc-cieplna-granica-temp')).toContainText(
        'wytrzymałości mechanicznej',
      );
      await expect(page.getByTestId('mvd-jakosc-cieplna-brak-k')).toHaveCount(0);

      await page.getByTestId('mvd-jakosc-cieplna-normy').scrollIntoViewIfNeeded();
      await page.screenshot({
        path: path.join(OUTPUT_DIR, `fk1_linia_dowod_${theme}.png`),
        fullPage: true,
      });

      bramkaKonsoli(page);
    });
  }
});
