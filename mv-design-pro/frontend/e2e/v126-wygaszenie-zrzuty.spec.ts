/**
 * Zrzuty okna „Analizy specjalistyczne" dla karty V126-WYGASZENIE (rodzaj
 * `voltage_stability` wycofany z warstwy prezentacji kartą QU-FABRYKACJA, 2026-08-08)
 * po przebudowie B-02 / W3-E (2026-09-10): okno pokazuje KATALOG KART pogrupowany
 * inżyniersko, więc dowód wygaszenia jest widoczny WPROST na zrzucie — brak karty
 * wycofanego rodzaju (dawna lista rozwijana nie rysowała opcji w zrzucie i dowód
 * musiał stać na teście jednostkowym; ten spec dowodzi go asercją PRZED zrzutem).
 *
 * ŹRÓDŁO (uczciwie): HARNESS PREZENTACJI (`creator-harness.html`, scena
 * `akademickie`), a NIE żywy backend. Podmieniony `fetch` odsyła katalog kart i
 * gotowość policzone BACKENDEM (`scripts/eksport_fixtur_harnessu.py`) oraz REALNE
 * odpowiedzi solvera z fixtury CI `odpowiedziSolvera.json`.
 *
 * CZEGO ZRZUT NIE DOWODZI:
 *  1. nie dowodzi zachowania ŻYWEGO backendu (końcówki są podmienione) — to robi
 *     `v126-okna-zrzuty.spec.ts` na realnym biegu,
 *  2. nie dowodzi, że rodzaj zniknął z kontraktu backendu — bo NIE zniknął
 *     (kontrakty FROZEN; katalog niesie go jako nieprezentowany).
 *
 * Wyjście: docs/sld/audyt-2026-08/v126-wygaszenie-<widok>-<motyw>.png
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
const MOTYWY = [
  { kod: 'light', nazwa: 'jasny' },
  { kod: 'dark', nazwa: 'ciemny' },
] as const;

async function otworz(page: Page, motyw: string): Promise<void> {
  await page.goto(`${BAZA}?creator=akademickie&theme=${motyw}`);
  await expect(page.getByTestId('mvd-akad-ekran')).toBeVisible();
  await expect(page.getByTestId('mvd-akad-katalog-kart')).toBeVisible();
}

test.describe('V126-WYGASZENIE — zrzuty katalogu kart bez rodzaju wycofanego', () => {
  for (const motyw of MOTYWY) {
    test(`katalog kart (${motyw.nazwa})`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await otworz(page, motyw.kod);
      // DOWÓD wygaszenia: karta rodzaju wycofanego NIE istnieje w katalogu, a rodzaj
      // wciąż prezentowany (bezpieczeństwo uziemień) ma kartę z przyciskiem otwarcia.
      await expect(page.getByTestId('mvd-akad-karta-voltage_stability')).toHaveCount(0);
      await expect(page.getByTestId('mvd-akad-karta-otworz-earthing_safety')).toBeVisible();
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      await page.getByTestId('mvd-akad-katalog-kart').screenshot({
        path: path.join(OUTPUT_DIR, `v126-wygaszenie-katalog-${motyw.nazwa}.png`),
      });
    });

    test(`bieg rodzaju prezentowanego po wygaszeniu (${motyw.nazwa})`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 1400 });
      await otworz(page, motyw.kod);
      // Reszta przepływu działa niezaburzona wycofaniem jednej pozycji: karta →
      // formularz uziomu (wartości z fixtury backendu) → POTWIERDZONA → wynik.
      await otworzAnalize(page, 'earthing_safety');
      await wypelnijUziomIPotwierdz(page);
      await uruchomAnalize(page);
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      await page.screenshot({
        path: path.join(OUTPUT_DIR, `v126-wygaszenie-uziom-${motyw.nazwa}.png`),
        fullPage: true,
      });
    });
  }
});
