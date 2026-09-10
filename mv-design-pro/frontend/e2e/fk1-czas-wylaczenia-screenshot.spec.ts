/**
 * Karta F-K1 faza 5 (V12K-209) — zrzuty ekranu do oceny właściciela (dyrektywa #8).
 *
 * Scena „cieplna": sekcja „Wytrzymałość zwarciowa przewodów" z NOWYMI kolumnami
 * „Czas wyłączenia" i „Źródło czasu" oraz dowodem kryterium otwartym NATYWNYM
 * klikiem w wiersz (bez wymuszania stanu komponentu — ścieżka projektanta).
 *
 * Kadr 1: tabela oceny (widać, że jedna gałąź ma czas z nastawy, druga z założenia).
 * Kadr 2: ten sam ekran z otwartym dowodem (krok 1 nazywa źródło czasu).
 * Oba motywy. Wyjście: docs/audit/visual/dowody/fk1_czas_<kadr>_<motyw>.png
 */
import { test, expect, type Page } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { adresHarnessu } from './adresHarnessu';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = adresHarnessu('creator-harness.html');
const OUTPUT_DIR = path.resolve(_dirname, '../../docs/audit/visual/dowody');
const THEMES = ['light', 'dark'] as const;

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

test.describe('F-K1 faza 5 — czas wyłączenia i dowód kryterium cieplnego', () => {
  for (const theme of THEMES) {
    test(`ocena + dowód (${theme})`, async ({ page }) => {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      await otworzScene(page, theme);

      // Kadr 1 — tabela oceny z kolumnami czasu i jego źródła.
      await expect(page.getByText('Nastawa zabezpieczenia')).toBeVisible();
      // „Założenie przypadku" występuje w DWÓCH wierszach (fixture sceny:
      // czasy_wylaczenia.z_zalozenia = 2 — gałąź L-02 i linia napowietrzna
      // L-03 obie biorą czas z założenia przypadku). Intencja: kolumna
      // „Źródło czasu" nazywa założenie przypadku — wystarczy pierwszy wiersz.
      await expect(page.getByText('Założenie przypadku').first()).toBeVisible();
      await page.screenshot({
        path: path.join(OUTPUT_DIR, `fk1_czas_ocena_${theme}.png`),
        fullPage: true,
      });

      // Kadr 2 — pełny dowód obliczeniowy otwarty REALNYM klikiem w wiersz gałęzi.
      await page.getByText('Magistrala L-01 (120 mm²)').first().click();
      await expect(page.getByTestId('mvd-jakosc-cieplna-dowod')).toBeVisible();
      await expect(
        page.getByText('Czas trwania zwarcia z nastawy zabezpieczenia').first(),
      ).toBeVisible();
      await page.screenshot({
        path: path.join(OUTPUT_DIR, `fk1_czas_dowod_${theme}.png`),
        fullPage: true,
      });

      // Kadr 3 — Calculation Evidence dla gałęzi NARUSZONEJ: tylko ona dostaje
      // działania naprawcze (dla spełnionej byłyby szumem, nie informacją).
      await page.getByText('Odgałęzienie L-02 (70 mm²)').first().click();
      await expect(page.getByTestId('mvd-jakosc-cieplna-kryteria')).toBeVisible();
      await expect(page.getByTestId('mvd-jakosc-cieplna-zalecenia')).toBeVisible();
      await expect(page.getByTestId('mvd-jakosc-cieplna-material')).toBeVisible();
      await page.getByTestId('mvd-jakosc-cieplna-normy').scrollIntoViewIfNeeded();
      await page.screenshot({
        path: path.join(OUTPUT_DIR, `fk1_dowod_pelny_${theme}.png`),
        fullPage: true,
      });

      bramkaKonsoli(page);
    });
  }
});
