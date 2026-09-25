/**
 * Karta F-K1 faza 5 (V12K-209) — zrzuty ekranu do oceny właściciela (dyrektywa #8).
 *
 * Scena „cieplna": sekcja „Wytrzymałość zwarciowa przewodów" z kolumnami
 * „Czas wyłączenia" i „Źródło czasu" oraz dowodem kryterium otwartym NATYWNYM
 * klikiem w wiersz (bez wymuszania stanu komponentu — ścieżka projektanta).
 *
 * HARNESS-RESZTA-kontynuacja (2026-09-16): scena „cieplna" przełączona z
 * ręcznie pisanego mocka (gałęzie „Magistrala L-01"/„Odgałęzienie L-02", JEDNA
 * z nich z czasem „z nastawy zabezpieczenia") na REALNY bieg backendu
 * (`short_circuit_sn` na sieci złotej, `cieplna_scena_wynik.json`/
 * `cieplna_scena_dowody.json`) — sieć złota ma DWIE gałęzie („Kabel SN 1",
 * „Linia SN 1"), ŻADEN switch nie ma skonfigurowanego zabezpieczenia
 * (`Sprzeglo Q1` bez przypisanego czynnego zabezpieczenia — realny, uczciwy
 * powód backendu), więc OBIE gałęzie biorą czas „z założenia przypadku" —
 * demonstracja „nastawa vs założenie" (kontrast dwóch źródeł czasu) nie jest
 * już dostępna NA TEJ SIECI. Mechanizm źródła czasu sam w sobie pozostaje
 * pokryty bezpośrednio testem `backend/tests/application/analyses/
 * test_wytrzymalosc_cieplna_slad_czasu.py` (zielony, niezależny od tej sceny).
 *
 * Kadr 1: tabela oceny (obie gałęzie, źródło czasu „z założenia przypadku").
 * Kadr 2: ten sam ekran z otwartym dowodem gałęzi „Linia SN 1" (krok 1 nazywa
 *         źródło czasu; krok 2 — uczciwy stan „rachunku nie przeprowadzono",
 *         bo ta gałąź złotej sieci nie ma pełnych danych katalogowych do
 *         obliczenia wytrzymałości cieplnej — osobny, zmierzony i nazwany
 *         dług, patrz meldunek karty).
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

      // Kadr 1 — tabela oceny z kolumnami czasu i jego źródła. Realna sieć
      // złota: DWIE gałęzie, OBIE „z założenia przypadku" (żaden switch nie
      // ma skonfigurowanego zabezpieczenia — patrz nagłówek pliku).
      await expect(page.getByText('Kabel SN 1').first()).toBeVisible();
      await expect(page.getByText('Linia SN 1').first()).toBeVisible();
      await expect(page.getByText('Założenie przypadku').first()).toBeVisible();
      await page.screenshot({
        path: path.join(OUTPUT_DIR, `fk1_czas_ocena_${theme}.png`),
        fullPage: true,
      });

      // Kadr 2 — pełny dowód obliczeniowy otwarty REALNYM klikiem w wiersz
      // gałęzi „Linia SN 1" (gałąź na drodze zwarcia o największym prądzie
      // zwarciowym; `cieplna_scena_dowody` niesie dowód każdej gałęzi oceny).
      await page.getByText('Linia SN 1').first().click();
      await expect(page.getByTestId('mvd-jakosc-cieplna-dowod')).toBeVisible();
      await expect(
        page.getByText('Czas trwania zwarcia z założenia przypadku').first(),
      ).toBeVisible();
      await page.screenshot({
        path: path.join(OUTPUT_DIR, `fk1_czas_dowod_${theme}.png`),
        fullPage: true,
      });

      // Kadr 3 — uczciwy stan zerowy (K6/H-5): sieć złota nie niesie pełnych
      // danych katalogowych wytrzymałości cieplnej dla tej gałęzi (dług
      // nazwany w meldunku karty) — dowód pokazuje TO wprost, nie fabrykuje
      // kryteriów/zaleceń, których backend nie policzył.
      await expect(
        page.getByText('Rachunku cieplnego nie przeprowadzono').first(),
      ).toBeVisible();
      await page.screenshot({
        path: path.join(OUTPUT_DIR, `fk1_dowod_pelny_${theme}.png`),
        fullPage: true,
      });

      bramkaKonsoli(page);
    });
  }
});
