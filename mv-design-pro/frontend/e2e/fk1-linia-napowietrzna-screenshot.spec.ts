/**
 * Karta F-K1 faza 7 (V12K-211) — zrzuty ekranu do oceny właściciela (dyrektywa #8).
 *
 * Scena „cieplna" ma odgałęzienie NAPOWIETRZNE: „Linia SN 1" (`line_b_c`,
 * katalog linii AFL 70 mm² — `catalog_ref="line-afl-70"`). Przed kartą F-K1
 * faza 7 każda linia napowietrzna kończyła się werdyktem NIEDOSTĘPNY BEZ
 * ROZRÓŻNIENIA PRZYCZYNY, bo dane cieplne nie docierały z katalogu do modelu.
 *
 * HARNESS-RESZTA-kontynuacja (2026-09-16): scena „cieplna" przełączona z
 * ręcznie pisanego mocka (trzecia, dedykowana gałąź „Odgałęzienie napowietrzne
 * L-03", z KOMPLETNYMI danymi cieplnymi demonstrującymi pełny dowód „przewód
 * goły") na REALNY bieg backendu (`cieplna_scena_wynik.json`/
 * `cieplna_scena_dowod.json`, sieć złota). Sieć złota MA linię napowietrzną
 * („Linia SN 1"), ale jej `BranchRating` (`tests/cgmes/golden_enm.py`) NIE
 * niesie `ith_ka` (pole opcjonalne, puste na TEJ gałęzi tej sieci — inne
 * fixtury w repo je ustawiają, więc to nie jest ograniczenie modelu/kontraktu)
 * — bilans cieplny wraca UCZCIWIE jako `UNAVAILABLE` z kodem
 * `conductor.thermal_data_missing`, DOKŁADNIE zgodnie z fixem tej karty
 * (jawny, nazwany powód zamiast milczącego domysłu) — ale bez PEŁNEGO dowodu
 * (materiał/rodzaj/granica temperatury), bo rachunku nie da się przeprowadzić
 * bez tego pola. Naprawa `golden_enm.py` NIE jest bezpieczna tu i teraz:
 * `tests/api/test_quality_analysis_runs_api.py:488` asertuje wprost
 * `status_ogolny == "UNAVAILABLE"` dla tej samej sieci — zmiana wymaga
 * osobnej, skoordynowanej karty (nazwana w meldunku). Mechanizm „przewód
 * goły → pełny dowód z kompletnymi danymi" sam w sobie pozostaje pokryty
 * `backend/tests/network_model/solvers/test_line_thermal_chain.py` (zielony,
 * niezależny od tej sceny).
 *
 * Kadr 1: tabela oceny — linia napowietrzna widoczna z uczciwym werdyktem
 *         NIEDOSTĘPNY (nie biały ekran, nie cichy pomin).
 * Kadr 2: jej dowód obliczeniowy otwarty — krok źródła czasu (realny) +
 *         uczciwy krok „rachunku nie przeprowadzono" (zamiast fabrykowanych
 *         danych materiałowych, których backend nie policzył).
 * Oba motywy. Wyjście: docs/audit/visual/dowody/fk1_linia_<kadr>_<motyw>.png
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
      await page.screenshot({
        path: path.join(OUTPUT_DIR, `fk1_linia_ocena_${theme}.png`),
        fullPage: true,
      });

      // Kadr 2 — dowód otwarty REALNYM klikiem w wiersz (ścieżka projektanta):
      // krok źródła czasu (realny, z założenia przypadku) + uczciwy krok
      // „rachunku nie przeprowadzono" zamiast fabrykowanych danych materiału
      // (patrz nagłówek pliku — dług nazwany, nie ukryty).
      await page.getByText(LINIA).first().click();
      await expect(page.getByTestId('mvd-jakosc-cieplna-dowod')).toBeVisible();
      await expect(
        page.getByText('Czas trwania zwarcia z założenia przypadku').first(),
      ).toBeVisible();
      await expect(
        page.getByText('Rachunku cieplnego nie przeprowadzono').first(),
      ).toBeVisible();
      await expect(page.getByTestId('mvd-jakosc-cieplna-material')).toHaveCount(0);
      await page.screenshot({
        path: path.join(OUTPUT_DIR, `fk1_linia_dowod_${theme}.png`),
        fullPage: true,
      });

      bramkaKonsoli(page);
    });
  }
});
