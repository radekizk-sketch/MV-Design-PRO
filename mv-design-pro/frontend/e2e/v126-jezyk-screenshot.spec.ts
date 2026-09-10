/**
 * Zrzuty okna „Analizy specjalistyczne" (karta B-02 / W3-E, 2026-09-10; wcześniej
 * V126-JEZYK po ocenie właściciela 0/10 z 2026-08-07). Trzy widoki w obu motywach:
 *   1. werdykt-kryterium — bezpieczeństwo uziemień: ścieżka projektanta katalog kart →
 *      karta → widok analizy (gotowość NIEPOTWIERDZONA z listą braków) → formularz
 *      uziomu wypełniony wartościami z fixtury backendu → POTWIERDZONA → uruchomienie →
 *      werdykt + wielkości z jednostkami i wartościami dopuszczalnymi,
 *   2. obiekty — propagacja niepewności (rodzaj liczący wprost z modelu, bez
 *      parametrów): tabela obiektów nazwanych jak na schemacie,
 *   3. slad — bezpieczeństwo uziemień z OTWARTYM śladem obliczeń (kolumna „Wynik"
 *      niesie liczbę z jednostką, nie zrzut słownika).
 *
 * Scena harnessu karmiona jest fixturami liczonymi BACKENDEM (katalog kart, gotowość
 * bez i z parametrami sceny) oraz REALNYMI odpowiedziami solvera
 * (`odpowiedziSolvera.json`) — tymi samymi, na których stoi strażnik prezentacji.
 * Zrzut pokazuje więc to, co zobaczy projektant, a nie atrapę „na ładnie".
 *
 * Wyjście: docs/sld/audyt-2026-08/v126-jezyk-<widok>-<motyw>.png
 */
import { test, expect, type Page } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { adresHarnessu } from './adresHarnessu';
import { otworzAnalize, uruchomAnalize, wypelnijUziomIPotwierdz } from './formularzV126';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const BAZA = adresHarnessu('creator-harness.html');
const OUTPUT_DIR = path.resolve(_dirname, '../../docs/sld/audyt-2026-08');
const MOTYWY = ['light', 'dark'] as const;

const WIDOKI = [
  { nazwa: 'werdykt-kryterium', rodzaj: 'earthing_safety', otworzSlad: false },
  { nazwa: 'obiekty', rodzaj: 'uncertainty_sensitivity', otworzSlad: false },
  { nazwa: 'slad', rodzaj: 'earthing_safety', otworzSlad: true },
] as const;

async function przygotuj(page: Page, rodzaj: string, motyw: string): Promise<void> {
  await page.goto(`${BAZA}?creator=akademickie&theme=${motyw}`);
  await expect(page.getByTestId('mvd-akad-ekran')).toBeVisible();
  // Natywna ścieżka użytkownika: katalog kart → karta analizy → (parametry) → uruchomienie.
  await expect(page.getByTestId('mvd-akad-katalog-kart')).toBeVisible();
  await otworzAnalize(page, rodzaj);
  if (rodzaj === 'earthing_safety') {
    // Bez danych uziomu gotowość jest NIEPOTWIERDZONA — dopiero komplet pól
    // formularza (wartości z fixtury backendu) daje POTWIERDZONĄ i odblokowuje bieg.
    await expect(page.getByTestId('mvd-akad-gotowosc')).toHaveAttribute('data-gotowosc', 'NIEPOTWIERDZONA');
    await expect(page.getByTestId('mvd-akad-uruchom')).toBeDisabled();
    await wypelnijUziomIPotwierdz(page);
  } else {
    await expect(page.getByTestId('mvd-akad-gotowosc')).toHaveAttribute('data-gotowosc', 'POTWIERDZONA');
  }
  await uruchomAnalize(page);
}

test.describe('V126-JEZYK — zrzuty okna analiz specjalistycznych', () => {
  for (const motyw of MOTYWY) {
    for (const widok of WIDOKI) {
      test(`${widok.nazwa} (${motyw})`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 1000 });
        await przygotuj(page, widok.rodzaj, motyw);

        if (widok.otworzSlad) {
          await page.getByTestId('mvd-akad-slad-przelacz').click();
          await expect(page.getByTestId('mvd-akad-slad')).toContainText('Krok');
        }

        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        await page.screenshot({
          path: path.join(OUTPUT_DIR, `v126-jezyk-${widok.nazwa}-${motyw}.png`),
          fullPage: true,
        });
      });
    }
  }

  test('pasek nawigacji warsztatu Wyników mieści się w kadrze (1280/1440/1920)', async ({ page }) => {
    // Defekt ze zrzutu 3/3 (2026-08-07): pasek 30 zakładek wyjeżdżał poza kadr.
    // Po karcie B-02 nawigacja jest dwupoziomowa (obszary → analizy obszaru) — bez
    // przewijania poziomego przy żadnej z trzech szerokości.
    for (const szerokosc of [1280, 1440, 1920]) {
      await page.setViewportSize({ width: szerokosc, height: 900 });
      await page.goto(`${BAZA}?creator=wyniki-warsztat&theme=dark`);
      await expect(page.getByTestId('mvd-wyniki-warsztat')).toBeVisible();
      const przewijaniePoziome = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(przewijaniePoziome, `szerokość ${szerokosc}px`).toBe(false);
    }
  });
});
