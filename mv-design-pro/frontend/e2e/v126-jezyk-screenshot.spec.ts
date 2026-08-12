/**
 * Zrzuty ŻYWEGO okna „Analizy akademickie" po karcie V126-JEZYK (ocena
 * właściciela 0/10 z 2026-08-07). Trzy widoki odpowiadające trzem zrzutom
 * właściciela, w obu motywach:
 *   1. werdykt-kryterium — bezpieczeństwo uziemień (werdykt + wielkości
 *      z jednostkami i wartościami dopuszczalnymi z odpowiedzi solvera),
 *   2. obiekty — jakość energii (tabela węzłów nazwanych jak na schemacie),
 *   3. slad — stabilność napięciowa z OTWARTYM śladem obliczeń (kolumna
 *      „Wynik" niesie liczbę z jednostką, nie zrzut słownika).
 *
 * Scena harnessu karmiona jest fixturą REALNYCH odpowiedzi solvera
 * (`odpowiedziSolvera.json`) — tą samą, na której stoi strażnik prezentacji.
 * Zrzut pokazuje więc to, co zobaczy projektant, a nie atrapę „na ładnie".
 *
 * Wyjście: docs/sld/audyt-2026-08/v126-jezyk-<widok>-<motyw>.png
 */
import { test, expect, type Page } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const BAZA = process.env.HARNESS_URL ?? 'http://127.0.0.1:5173/creator-harness.html';
const OUTPUT_DIR = path.resolve(_dirname, '../../docs/sld/audyt-2026-08');
const MOTYWY = ['light', 'dark'] as const;

const WIDOKI = [
  { nazwa: 'werdykt-kryterium', rodzaj: 'earthing_safety', otworzSlad: false },
  { nazwa: 'obiekty', rodzaj: 'power_quality_harmonics', otworzSlad: false },
  { nazwa: 'slad', rodzaj: 'voltage_stability', otworzSlad: true },
] as const;

async function przygotuj(page: Page, rodzaj: string, motyw: string): Promise<void> {
  await page.goto(`${BAZA}?creator=akademickie&theme=${motyw}&rodzaj=${rodzaj}`);
  await expect(page.getByTestId('mvd-akad-ekran')).toBeVisible();
  // Natywna ścieżka użytkownika: wybór rodzaju → uruchomienie analizy.
  await page.getByTestId('mvd-akad-rodzaj').selectOption(rodzaj);
  await page.getByTestId('mvd-akad-uruchom').click();
  await expect(page.getByTestId('mvd-akad-wyniki')).toBeVisible();
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

  test('pasek zakładek warsztatu Wyników mieści się w kadrze (1280/1440/1920)', async ({ page }) => {
    // Defekt ze zrzutu 3/3: pasek 30 zakładek wyjeżdżał poza kadr.
    for (const szerokosc of [1280, 1440, 1920]) {
      await page.setViewportSize({ width: szerokosc, height: 900 });
      await page.goto(`${BAZA}?creator=wyniki-warsztat&theme=dark`);
      const przewijaniePoziome = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(przewijaniePoziome, `szerokość ${szerokosc}px`).toBe(false);
    }
  });
});
